import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, hashPassword, logAudit, sendEmail, escapeHtml } from '../helpers';
import { validateBody, createUserSchema } from '../schemas';

export const usersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


usersApp.get('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'consultor' && user.role !== 'platform_admin' && user.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  try {
    let stmt = c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users ORDER BY created_at DESC');
    if (user.role === 'org_admin') {
      stmt = c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users WHERE client_project_id = ? ORDER BY created_at DESC').bind(user.client_project_id || '');
    }
    const { results } = await stmt.all();
    const mapped = (results || []).map((u: any) => {
      let r = u.role;
      if (r === 'admin') r = 'platform_admin';
      if (r === 'consultant') r = 'consultor';
      return { ...u, role: r };
    });
    return c.json(mapped);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar usuários', detail: e.message }, 500);
  }
});

usersApp.post('/', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const valid = await validateBody(c, createUserSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, role, client_project_id } = valid.data;

    let targetProject = client_project_id;
    let targetRole = role;
    if (admin.role === 'org_admin') {
      targetProject = admin.client_project_id || null;
      if (role !== 'org_admin' && role !== 'org_user' && role !== 'client') {
        return c.json({ error: 'Forbidden: Cannot create users with this role' }, 403);
      }
    }

    const id = genId();
    const hash = await hashPassword(password);
    
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, email, hash, name, targetRole, targetProject || null).run();

    await logAudit(c.env.DB, 'user.created', admin.email, `Usuário ${email} criado como ${targetRole}`);

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0;">Bem-vindo ao nISO!</h2>
        <p>Olá, <strong>${escapeHtml(name)}</strong>,</p>
        <p>Você foi convidado a acessar o portal de GRC da <strong>ness.</strong></p>
        <p>Aqui estão suas credenciais temporárias para o primeiro acesso:</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 0.95rem;">
          <strong>E-mail:</strong> ${escapeHtml(email)}<br/>
          <strong>Senha Temporária:</strong> ${escapeHtml(password)}
        </div>
        <p style="color: #ff3b30; font-size: 0.85rem;">* Por motivos de segurança, você deverá redefinir sua senha obrigatoriamente no primeiro login.</p>
        <p style="margin-top: 25px;">
          <a href="https://niso.ness.workers.dev" style="background-color: #00ade8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Entrar no nISO</a>
        </p>
      </div>
    `;
    await sendEmail(c, email, 'Seu acesso ao nISO', emailHtml);

    return c.json({ id, email, name, role: targetRole, client_project_id: targetProject }, 201);
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return c.json({ error: 'Falha ao criar usuário', detail: e.message }, 500);
  }
});

usersApp.put('/:id', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const { name, email, role, client_project_id, password } = await c.req.json();
    
    const user = await c.env.DB.prepare('SELECT id, role, client_project_id FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    if (admin.role === 'org_admin') {
      if (user.client_project_id !== admin.client_project_id) {
        return c.json({ error: 'Forbidden: Access denied to this user' }, 403);
      }
      if (role !== undefined && role !== 'org_admin' && role !== 'org_user' && role !== 'client') {
        return c.json({ error: 'Forbidden: Cannot assign this role' }, 403);
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (client_project_id !== undefined) {
      updates.push('client_project_id = ?');
      values.push(admin.role === 'org_admin' ? (admin.client_project_id || null) : (client_project_id || null));
    }
    if (password !== undefined && password !== '') {
      const hash = await hashPassword(password);
      updates.push('password_hash = ?');
      values.push(hash);
    }

    if (updates.length > 0) {
      values.push(id);
      await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
      await logAudit(c.env.DB, 'user.updated', admin.email, `Usuário ${id} atualizado`);
    }

    return c.json({ ok: true, message: 'Usuário atualizado com sucesso' });
  } catch (e: any) {
    if (e.message && e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return c.json({ error: 'Falha ao atualizar usuário', detail: e.message || String(e) }, 500);
  }
});

usersApp.delete('/:id', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const user = await c.env.DB.prepare('SELECT id, email, client_project_id FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    if (admin.role === 'org_admin' && user.client_project_id !== admin.client_project_id) {
      return c.json({ error: 'Forbidden: Access denied to this user' }, 403);
    }

    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'user.deleted', admin.email, `Usuário ${user.email} excluído`);

    return c.json({ ok: true, message: 'Usuário excluído com sucesso' });
  } catch (e: any) {
    return c.json({ error: 'Falha ao excluir usuário', detail: e.message || String(e) }, 500);
  }
});
