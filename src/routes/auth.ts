import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, genToken, hashPassword, verifyPassword, logAudit, sendEmail, escapeHtml } from '../helpers';
import { validateBody, loginSchema, setupSchema, resetRequestSchema, resetConfirmSchema } from '../schemas';

export const authApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


authApp.post('/setup', async (c) => {
  try {
    const valid = await validateBody(c, setupSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, setupKey } = valid.data;

    if (setupKey !== c.env.SETUP_KEY && (c.req.header('X-Setup-Key') || setupKey) !== c.env.SETUP_KEY) {
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
    return c.json({ error: 'Setup failed', detail: e.message }, 500);
  }
});

authApp.post('/login', async (c) => {
  try {
    const valid = await validateBody(c, loginSchema);
    if (!valid.success) return valid.response;
    const { email, password } = valid.data;

    const user = await c.env.DB.prepare(
      'SELECT id, email, name, role, client_project_id, password_hash, requires_password_change FROM users WHERE email = ?'
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
    
    delete user.password_hash;
    delete user.requires_password_change;
    
    if (user.role === 'admin') {
      user.role = 'platform_admin';
    } else if (user.role === 'consultant') {
      user.role = 'consultor';
    }
    
    const token = genToken();
    await c.env.SESSIONS.put(token, JSON.stringify(user), { expirationTtl: 86400 });
    
    return c.json({ token, user, requiresPasswordChange: requiresChange });
  } catch (e: any) {
    return c.json({ error: 'Login failed', detail: e.message }, 500);
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

    await logAudit(c.env.DB, 'auth.password_changed_first', user.email, `Senha do primeiro acesso redefinida com sucesso`);
    return c.json({ ok: true, message: 'Senha redefinida com sucesso' });
  } catch (e: any) {
    return c.json({ error: 'Erro ao redefinir senha', detail: e.message }, 500);
  }
});

authApp.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>();
    if (!email) return c.json({ error: 'Email é obrigatório' }, 400);

    const user = await c.env.DB.prepare(
      'SELECT id, email, name FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user) {
      return c.json({ ok: true, message: 'Se o e-mail estiver cadastrado, um código foi gerado.' });
    }

    const token = String(Math.floor(100000 + Math.random() * 900000));
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
    return c.json({ error: 'Erro ao solicitar recuperação', detail: e.message }, 500);
  }
});

authApp.post('/reset-password', async (c) => {
  try {
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

    await c.env.SESSIONS.delete(`reset_token:${token}`);

    await logAudit(c.env.DB, 'auth.password_reset', email, 'Senha redefinida com sucesso via token de recuperação');

    return c.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (e: any) {
    return c.json({ error: 'Erro ao redefinir senha', detail: e.message }, 500);
  }
});

authApp.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (token) await c.env.SESSIONS.delete(token);
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
    return c.json({ error: 'Falha ao alterar senha', detail: e.message }, 500);
  }
});
