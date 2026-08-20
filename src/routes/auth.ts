import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, genToken, genNumericCode, rateLimit, rateLimitD1, hashPassword, verifyPassword, logAudit, sendEmail, escapeHtml, invalidateUserSessions, SESSION_TTL_SEC, erro500 } from '../helpers';

/** IP do cliente para rate limiting (Cloudflare popula CF-Connecting-IP) */
function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
}
import { validateBody, loginSchema, setupSchema, resetRequestSchema, resetConfirmSchema } from '../schemas';

export const authApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


authApp.post('/setup', async (c) => {
  try {
    const valid = await validateBody(c, setupSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, setupKey } = valid.data;

    // Falha fechada: sem SETUP_KEY configurado (via wrangler secret), /setup fica desabilitado.
    if (!c.env.SETUP_KEY) {
      return c.json({ error: 'Setup is disabled' }, 403);
    }
    const providedKey = c.req.header('X-Setup-Key') || setupKey;
    if (!providedKey || providedKey !== c.env.SETUP_KEY) {
      return c.json({ error: 'Invalid setup key' }, 403);
    }
    
    const id = genId();
    const hash = await hashPassword(password);
    
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultant')
       ON CONFLICT(email) DO NOTHING`
    ).bind(id, email, hash, name).run();
    
    return c.json({ ok: true, message: 'Seed user created or already exists' }, 201);
  } catch (e: any) {
    return erro500(c, 'Setup failed', e);
  }
});

authApp.post('/login', async (c) => {
  try {
    if (!(await rateLimit(c.env.SESSIONS, `login:${clientIp(c)}`, 20, 300))) {
      return c.json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }, 429);
    }

    const valid = await validateBody(c, loginSchema);
    if (!valid.success) return valid.response;
    const { email, password } = valid.data;

    // S6: além do teto por IP acima, um teto por CONTA-ALVO. O limite por IP não
    // freia um ataque distribuído (muitos IPs) contra uma única conta; este fecha
    // isso. Usa o contador ATÔMICO de janela fixa no D1 (rateLimitD1): sendo um
    // controle de segurança, não pode vazar sob concorrência (o get-then-put do KV
    // não é atômico) nem ter a janela deslizante do TTL — os dois pontos do Codex
    // no #113. Chave por email normalizado; keyspace limitado (uma linha por
    // conta), sem TTL.
    const contaKey = email.trim().toLowerCase();
    if (!(await rateLimitD1(c.env.DB, `login:acct:${contaKey}`, 10, 300))) {
      return c.json({ error: 'Muitas tentativas para esta conta. Tente novamente em alguns minutos.' }, 429);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, email, name, role, client_project_id, password_hash, requires_password_change, totp_enabled FROM users WHERE email = ?'
    ).bind(email).first() as any;

    
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    // ponytail: auto-migrate legacy SHA-256 hash to PBKDF2
    if (!user.password_hash.includes(':')) {
      const newHash = await hashPassword(password);
      await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
    }
    
    const requiresChange = user.requires_password_change === 1;
    const exigeMfa = user.totp_enabled === 1;

    delete user.password_hash;
    delete user.requires_password_change;
    delete user.totp_enabled;
    
    if (user.role === 'admin') {
      user.role = 'platform_admin';
    } else if (user.role === 'consultant') {
      user.role = 'consultor';
    }
    
    const token = genToken();
    // `iat` é o que permite revogar a sessão depois: o middleware compara com o
    // marco de invalidação do usuário. Sessão sem `iat` é tratada como revogada.
    // Sessão nasce PENDENTE quando o usuário tem segundo fator: o
    // authMiddleware só libera /auth/mfa/* até o código ser conferido. Sem
    // isto o MFA seria decorativo — o token do login já daria acesso a tudo.
    const sessao = { ...user, iat: Date.now(), ...(exigeMfa ? { mfa_pending: true } : {}) };
    await c.env.SESSIONS.put(`session_${token}`, JSON.stringify(sessao), { expirationTtl: SESSION_TTL_SEC });
    await c.env.SESSIONS.put(token, JSON.stringify(sessao), { expirationTtl: SESSION_TTL_SEC });
    
    return c.json({ token, user, requiresPasswordChange: requiresChange, requiresMfa: exigeMfa });
  } catch (e: any) {
    return erro500(c, 'Login failed', e);
  }
});

authApp.post('/reset-password-first', async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 403);

    const { newPassword } = await c.req.json<{ newPassword: string }>();
    if (!newPassword) return c.json({ error: 'Nova senha é obrigatória' }, 400);

    const newHash = await hashPassword(newPassword);
    
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?'
    ).bind(newHash, user.id).run();

    await invalidateUserSessions(c.env.SESSIONS, user.id);

    await logAudit(c.env.DB, 'auth.password_changed_first', user.email, `Senha do primeiro acesso redefinida com sucesso`);
    return c.json({ ok: true, message: 'Senha redefinida com sucesso' });
  } catch (e: any) {
    return erro500(c, 'Erro ao redefinir senha', e);
  }
});

authApp.post('/forgot-password', async (c) => {
  try {
    if (!(await rateLimit(c.env.SESSIONS, `forgot:${clientIp(c)}`, 10, 3600))) {
      return c.json({ error: 'Muitas solicitações. Tente novamente mais tarde.' }, 429);
    }

    const { email } = await c.req.json<{ email: string }>();
    if (!email) return c.json({ error: 'Email é obrigatório' }, 400);

    const user = await c.env.DB.prepare(
      'SELECT id, email, name FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user) {
      return c.json({ ok: true, message: 'Se o e-mail estiver cadastrado, um código foi gerado.' });
    }

    // Garante unicidade do código enquanto ativo: sem isto, dois pedidos concorrentes
    // com o mesmo código de 6 dígitos fariam o segundo sobrescrever o mapeamento de
    // email do primeiro (permitindo reset da conta errada).
    let token = genNumericCode(6);
    for (let i = 0; i < 5 && (await c.env.SESSIONS.get(`reset_token:${token}`)); i++) {
      token = genNumericCode(6);
    }
    await c.env.SESSIONS.put(`reset_token:${token}`, JSON.stringify({ email: user.email }), { expirationTtl: 3600 });

    console.log(`[PASSWORD RESET] Token para ${user.email}: ${token}`);

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0; text-align: center;">Recuperação de Senha - nISO</h2>
        <p>Olá, <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Você solicitou a redefinição de sua senha de acesso ao portal do <strong>nISO</strong>.</p>
        <p>Use o código de verificação de 6 dígitos abaixo para concluir a alteração (válido por 1 hora):</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 2rem; letter-spacing: 5px; font-weight: bold; color: #00ade8;">
          ${token}
        </div>
        <p style="color: #8e8e93; font-size: 0.85rem; text-align: center;">Se você não solicitou esta redefinição, por favor desconsidere este e-mail de forma segura.</p>
      </div>
    `;
    await sendEmail(c, email, 'Recuperação de Senha - nISO', emailHtml);

    if (c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test') {
      return c.json({ ok: true, reset_token: token, message: 'Código de recuperação gerado (Desenvolvimento)' });
    }

    return c.json({ ok: true, message: 'Código de recuperação enviado.' });
  } catch (e: any) {
    return erro500(c, 'Erro ao solicitar recuperação', e);
  }
});

authApp.post('/reset-password', async (c) => {
  try {
    // Limita tentativas de adivinhação do código de 6 dígitos por IP.
    if (!(await rateLimit(c.env.SESSIONS, `reset:${clientIp(c)}`, 10, 3600))) {
      return c.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
    }

    const { token, newPassword } = await c.req.json<{ token: string; newPassword: string }>();
    if (!token || !newPassword) return c.json({ error: 'Token e nova senha são obrigatórios' }, 400);

    const storedData = await c.env.SESSIONS.get(`reset_token:${token}`);
    if (!storedData) {
      return c.json({ error: 'Código de recuperação inválido ou expirado' }, 400);
    }

    const { email } = JSON.parse(storedData);
    const newHash = await hashPassword(newPassword);

    await c.env.DB.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE email = ?')
      .bind(newHash, email).run();

    // Trocar a senha precisa derrubar as sessões abertas — é justamente o caso
    // de "minha conta foi comprometida". Sem isto, quem roubou a sessão continua
    // dentro por até 24h mesmo depois da troca.
    const dono = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<any>();
    if (dono) await invalidateUserSessions(c.env.SESSIONS, dono.id);

    await c.env.SESSIONS.delete(`reset_token:${token}`);

    await logAudit(c.env.DB, 'auth.password_reset', email, 'Senha redefinida com sucesso via token de recuperação');

    return c.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (e: any) {
    return erro500(c, 'Erro ao redefinir senha', e);
  }
});

authApp.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (token) {
    await c.env.SESSIONS.delete(`session_${token}`);
    await c.env.SESSIONS.delete(token);
  }
  return c.json({ ok: true });
});

authApp.get('/me', (c) => {
  return c.json({ user: c.get('user') });
});

authApp.post('/change-password', async (c) => {
  try {
    const { oldPassword, newPassword } = await c.req.json();
    const user = c.get('user');
    if (!oldPassword || !newPassword) return c.json({ error: 'Senhas obrigatórias' }, 400);
    
    const dbUser = await c.env.DB.prepare('SELECT password_hash FROM users WHERE email = ?')
      .bind(user.email).first() as any;
    if (!dbUser || !(await verifyPassword(oldPassword, dbUser.password_hash))) {
      return c.json({ error: 'Senha atual incorreta' }, 401);
    }

    const newHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(newHash, user.email).run();
      
    await logAudit(c.env.DB, 'auth.password_changed', user.email, 'Senha alterada com sucesso');
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao alterar senha', e);
  }
});
