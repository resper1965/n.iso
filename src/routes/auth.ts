import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, genToken, genNumericCode, rateLimit, rateLimitD1, hashPassword, verifyPassword, logAudit, sendEmail, escapeHtml, invalidateUserSessions, SESSION_TTL_SEC, erro500 } from '../helpers';

/** IP do cliente para rate limiting (Cloudflare popula CF-Connecting-IP) */
function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
}
import { authMiddleware } from '../middleware/auth';
import { validateBody, loginSchema, setupSchema, resetRequestSchema, resetConfirmSchema, primeiroAcessoSchema, mudarSenhaSchema } from '../schemas';
import {
  decisaoLogin, mensagemCredencialInvalida, mensagemBloqueio,
  BLOQUEIO_SEG, JANELA_FALHAS_SEG,
} from '../auth-policy';

export const authApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Contagem de falhas por (e-mail digitado + IP), exista a conta ou não: se só
 * contasse conta existente, o próprio número de tentativas restantes diria ao
 * atacante quais e-mails são válidos.
 */
function chavesTentativa(email: string, ip: string) {
  const conta = email.trim().toLowerCase();
  return {
    conta,
    falhas: `login_fail:${conta}:${ip}`,
    bloqueio: `login_lock:${conta}:${ip}`,
  };
}

/**
 * Confere o desafio anti-abuso. Sem segredo configurado não há o que conferir,
 * e o desafio não é exigido nem anunciado (ver decisaoLogin) — o bloqueio
 * temporário é que segura a força bruta.
 *
 * O nome do fornecedor fica aqui, na implementação; a interface não o menciona.
 */
async function desafioResolvido(c: any, token: string | undefined, ip: string): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip && ip !== 'unknown') body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await res.json() as { success?: boolean };
    return out.success === true;
  } catch {
    // Falha fechada: verificador fora do ar não vira passe livre.
    return false;
  }
}


/*
 * ACHADO: três rotas deste arquivo estavam MORTAS por ordem de montagem.
 *
 * O `index.ts` monta `app.route('/api/v1/auth', authApp)` ANTES de
 * `app.use('/api/v1/*', authMiddleware)`. Em Hono o sub-router é HANDLER, não
 * middleware: quando ele responde, a cadeia para — e o `authMiddleware`
 * registrado depois nunca roda para nada sob `/api/v1/auth`. Isso é correto
 * para `/login`, `/setup`, `/forgot-password` e `/reset-password`, que precisam
 * ser públicos. Para as três abaixo era defeito, e dava para ver em produção:
 *
 *   GET  /api/v1/auth/me                  → 200 {} sem credencial nenhuma
 *   POST /api/v1/auth/reset-password-first→ 403 SEMPRE (`c.get('user')` vazio)
 *   POST /api/v1/auth/change-password     → 500 SEMPRE (`user.email` de undefined)
 *
 * A troca de senha do primeiro acesso é o caminho que o `globals.js` usa depois
 * do login com `requires_password_change` — ou seja, o fluxo obrigatório de
 * primeiro acesso não funcionava.
 *
 * As três passam a exigir sessão explicitamente. `/logout` NÃO entra: ele lê o
 * token do cabeçalho e apaga a chave, e exigir sessão válida para deslogar
 * inverteria o objetivo — sessão já expirada deve poder ser limpa.
 */
authApp.use('/me', authMiddleware);
authApp.use('/change-password', authMiddleware);
authApp.use('/reset-password-first', authMiddleware);

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
    const challengeToken = (valid.data as any).challengeToken as string | undefined;

    const ip = clientIp(c);
    const chaves = chavesTentativa(email, ip);
    // As DUAS chaves, não só o segredo. O segredo sozinho fazia o servidor
    // exigir um desafio que a tela não tinha como montar: quem errasse a senha
    // uma vez ficava sem entrar até a janela de 15 min expirar. Meia
    // configuração agora não exige nada, que é a falha segura — o bloqueio
    // temporário e o teto por conta continuam valendo sem o Turnstile.
    const siteKeyDesafio = (c.env as any).TURNSTILE_SITE_KEY as string | undefined;
    const desafioVerificavel = Boolean((c.env as any).TURNSTILE_SECRET_KEY && siteKeyDesafio);

    if (await c.env.SESSIONS.get(chaves.bloqueio)) {
      return c.json({ error: mensagemBloqueio(), locked: true }, 429);
    }

    const falhas = parseInt((await c.env.SESSIONS.get(chaves.falhas)) || '0', 10) || 0;
    const antes = decisaoLogin(falhas, desafioVerificavel);

    // O desafio é conferido ANTES da senha: depois da primeira falha, cada nova
    // tentativa custa um desafio resolvido, e não só mais um POST.
    if (antes.exigeDesafio && !(await desafioResolvido(c, challengeToken, ip))) {
      return c.json({
        error: 'Conclua a verificação de segurança para continuar.',
        challengeRequired: true,
        // A tela monta o widget com isto. Vem daqui, e não do build do frontend,
        // porque é o servidor que sabe SE o desafio é exigido — e é no mesmo
        // instante que ele sabe COM QUE chave montá-lo.
        challengeSiteKey: siteKeyDesafio,
        attemptsRemaining: antes.tentativasRestantes,
      }, 401);
    }

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
      'SELECT id, email, name, role, client_project_id, password_hash, requires_password_change, totp_enabled, ativo FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      const total = falhas + 1;
      await c.env.SESSIONS.put(chaves.falhas, String(total), { expirationTtl: JANELA_FALHAS_SEG });
      const depois = decisaoLogin(total, desafioVerificavel);

      if (depois.bloqueado) {
        await c.env.SESSIONS.put(chaves.bloqueio, '1', { expirationTtl: BLOQUEIO_SEG });
        // Conta E IP na trilha: é o par que o auditor precisa para distinguir
        // usuário que esqueceu a senha de tentativa de força bruta distribuída.
        await logAudit(
          c.env.DB, 'auth.lockout', chaves.conta,
          `Bloqueio temporário de ${BLOQUEIO_SEG / 60} min após ${total} tentativas incorretas (IP ${ip})`
        );
        return c.json({ error: mensagemBloqueio(), locked: true }, 429);
      }

      // Mensagem única: nunca diz se o e-mail existe ou se foi a senha.
      return c.json({
        error: mensagemCredencialInvalida(depois.tentativasRestantes),
        challengeRequired: depois.exigeDesafio,
        ...(depois.exigeDesafio ? { challengeSiteKey: siteKeyDesafio } : {}),
        attemptsRemaining: depois.tentativasRestantes,
      }, 401);
    }

    // Conta desativada (por SCIM, item 4.2) não autentica. A MESMA resposta de
    // credencial errada, de propósito: distinguir "senha errada" de "conta
    // desativada" diria a quem sonda que aquele e-mail existe aqui — e a pessoa
    // legítima descobre pelo IdP, que é onde o desligamento aconteceu.
    if (user.ativo === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Credencial correta zera a contagem: a janela existe para tentativa
    // seguida de erro, não para punir quem errou uma vez ontem.
    await c.env.SESSIONS.delete(chaves.falhas);
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
    delete user.ativo;
    
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
    // `seen` é o relógio da inatividade (30 min para Cliente, 8 h para
    // consultor — ver auth-policy.ts). O middleware o renova a cada requisição;
    // o teto absoluto de 24 h continua sendo o `expirationTtl` abaixo, que a
    // renovação NÃO estica: é ele que garante a revalidação diária.
    const agora = Date.now();
    const sessao = { ...user, iat: agora, seen: agora, ...(exigeMfa ? { mfa_pending: true } : {}) };
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

    const v = await validateBody(c, primeiroAcessoSchema);
    if (!v.success) return v.response;
    const { newPassword } = v.data;

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

    const v = await validateBody(c, resetRequestSchema);
    if (!v.success) return v.response;
    const { email } = v.data;

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

    const v = await validateBody(c, resetConfirmSchema);
    if (!v.success) return v.response;
    const { token, newPassword } = v.data;

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
    const v = await validateBody(c, mudarSenhaSchema);
    if (!v.success) return v.response;
    const { oldPassword, newPassword } = v.data;
    const user = c.get('user');
    
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

// Router PRÓPRIO: `/api/v1/auth` é montado ANTES do authMiddleware (é por onde
// se entra), então `c.get('user')` ali é sempre undefined. Este vai montado
// depois, como o de MFA já fazia.
export const sessaoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Trilha da própria sessão: o percurso que o usuário fez para entrar (senha,
 * segundo fator, bloqueio, aceite). Montada a partir da trilha de auditoria.
 *
 * Escopada ao ATOR de propósito: cada um vê o seu percurso, e não o de ninguém.
 * Sem esse filtro seria um leitor de trilha alheia disfarçado.
 */
sessaoApp.get('/trilha', async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 401);

    const { results } = await c.env.DB.prepare(
      `SELECT action, details, created_at
         FROM audit_logs
        WHERE actor = ? AND action LIKE 'auth.%'
        ORDER BY created_at DESC
        LIMIT 20`
    ).bind(user.email).all();

    return c.json({
      ok: true,
      registros: (results || []).map((r: any) => ({
        tipo: String(r.action).replace(/^auth\./, ''),
        descricao: r.details,
        quando: r.created_at,
      })),
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao ler a trilha da sessão', e);
  }
});
