import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, hashPassword, logAudit, sendEmail, escapeHtml, invalidateUserSessions, revogarAgentesPorTrocaDeSenha, erro500, ehConsultor, ehAdminConsultoria, consultorDesignado, PROJETOS_DO_CONSULTOR_SQL, PAPEIS_EQUIPE_ORG } from '../helpers';
import { validateBody, createUserSchema, updateUserSchema } from '../schemas';
import { orgDoUsuario, resolverOrg, SEM_ORG } from '../services/organizacao';

export const usersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


/** Quem gere usuários. O `consultoria_admin` (Tarefa 4 cria o valor) gere os da própria organização. */
const GESTORES = new Set(['consultor', 'platform_admin', 'org_admin', 'consultoria_admin']);

/*
 * Organização de uma conta (multiconsultoria): cliente é da organização do PROJETO dele (o projeto
 * pode ser transferido, e a conta do cliente vai junto); equipe, de `users.org_id`. Cliente sem
 * projeto não tem organização (NULL): só o platform_admin o gere. Grafias legadas de cliente incluídas.
 */
const ORG_DA_CONTA_SQL = `CASE WHEN u.role IN ('org_admin', 'org_user', 'client', 'user', 'client_admin')
  THEN (SELECT p.org_id FROM projects p WHERE p.id = u.client_project_id) ELSE u.org_id END`;

usersApp.get('/', async (c) => {
  const user = c.get('user');
  if (!GESTORES.has(user.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  try {
    let stmt = c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users ORDER BY created_at DESC');
    if (ehAdminConsultoria(user)) {
      // Todas as contas da organização (equipe e clientes dos projetos dela), nenhuma de fora.
      stmt = c.env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.client_project_id, u.created_at FROM users u WHERE ${ORG_DA_CONTA_SQL} = ? ORDER BY u.created_at DESC`).bind(orgDoUsuario(user) ?? '');
    } else if (user.role === 'org_admin') {
      stmt = c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users WHERE client_project_id = ? ORDER BY created_at DESC').bind(user.client_project_id || '');
    } else if (ehConsultor(user)) {
      // D5: só as contas de cliente dos projetos em que o consultor está designado.
      stmt = c.env.DB.prepare(`SELECT id, email, name, role, client_project_id, created_at FROM users WHERE client_project_id IN (${PROJETOS_DO_CONSULTOR_SQL}) ORDER BY created_at DESC`).bind(user.email);
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
    return erro500(c, 'Falha ao listar usuários', e);
  }
});

/*
 * Contas da ness. (consultor, platform_admin, comercial — e as grafias legadas)
 * só o `platform_admin` cria, edita ou apaga. Os demais gestores (consultor,
 * org_admin) cuidam só de usuário de CLIENTE.
 *
 * Sem isto o consultor atribuía qualquer papel: criava um `platform_admin` com
 * senha escolhida por ele, promovia a si mesmo, ou trocava a senha de um admin
 * (ou de um colega) e entrava na conta. Três portas para a mesma escalada.
 */
const PAPEIS_CLIENTE_GERIVEIS = new Set(['org_admin', 'org_user', 'client']);
/*
 * O `consultoria_admin` gere também a equipe da PRÓPRIA organização (consultor, comercial e outro
 * administrador dela), nunca `platform_admin`/`admin`: isso continua só do platform_admin.
 */
const PAPEIS_DO_ADMIN_CONSULTORIA = new Set([...PAPEIS_CLIENTE_GERIVEIS, ...PAPEIS_EQUIPE_ORG]);
const soPlatformAdmin = (quem: { role?: string }, papel: string | null | undefined) =>
  quem.role !== 'platform_admin' && !(ehAdminConsultoria(quem) ? PAPEIS_DO_ADMIN_CONSULTORIA : PAPEIS_CLIENTE_GERIVEIS).has(papel ?? '');
const recusaPapelInterno = { error: 'Forbidden: contas da ness. são geridas pelo platform_admin' };

/** Organização de um projeto; `null` se não existe. */
const orgDoProjeto = async (db: D1Database, projectId: string | null | undefined) =>
  projectId ? (await db.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>())?.org_id ?? null : null;
/** Conta de outra organização para o `consultoria_admin`: 404, sem revelar que existe. */
const NAO_ENCONTRADO = { error: 'Usuário não encontrado' };

/*
 * D5: o consultor só gere conta de cliente de projeto em que está designado. Sem isto ele criava
 * ou trocava a senha de um usuário de OUTRO cliente e entrava como ele — a designação viraria
 * decorativa. Projeto ausente nega.
 */
const consultorForaDoProjeto = async (db: D1Database, quem: { role?: string; email?: string }, projectId: string | null | undefined) =>
  ehConsultor(quem) && !(projectId && await consultorDesignado(db, quem.email ?? '', projectId));
const recusaProjeto = { error: 'Forbidden: consultor só gere usuários dos projetos em que está designado' };

usersApp.post('/', async (c) => {
  const admin = c.get('user');
  if (!GESTORES.has(admin.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const valid = await validateBody(c, createUserSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, role, client_project_id } = valid.data;

    if (soPlatformAdmin(admin, role)) return c.json(recusaPapelInterno, 403);
    if (await consultorForaDoProjeto(c.env.DB, admin, client_project_id)) return c.json(recusaProjeto, 403);

    let targetProject = client_project_id;
    let targetRole = role;
    if (admin.role === 'org_admin') {
      targetProject = admin.client_project_id || null;
      if (role !== 'org_admin' && role !== 'org_user' && role !== 'client') {
        return c.json({ error: 'Forbidden: Cannot create users with this role' }, 403);
      }
    }

    // A organização da conta nova: cliente herda a do projeto; equipe, a de quem cria (o
    // platform_admin escolhe com X-Org-Id). Ninguém escolhe a organização pelo corpo.
    const ehCliente = PAPEIS_CLIENTE_GERIVEIS.has(targetRole);
    const orgCriador = await resolverOrg(c);
    if (ehAdminConsultoria(admin) && ehCliente && (!targetProject || await orgDoProjeto(c.env.DB, targetProject) !== orgCriador)) {
      return c.json({ error: 'Forbidden: projeto fora da sua organização' }, 403);
    }
    const orgNovo = ehCliente ? (await orgDoProjeto(c.env.DB, targetProject)) ?? orgCriador : orgCriador;
    if (!orgNovo) return c.json(SEM_ORG, 403);

    const id = genId();
    const hash = await hashPassword(password);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, email, hash, name, targetRole, targetProject || null, orgNovo).run();

    await logAudit(c.env.DB, 'user.created', admin.email, `Usuário ${email} criado como ${targetRole}`);

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0;">Bem-vindo ao n.iso!</h2>
        <p>Olá, <strong>${escapeHtml(name)}</strong>,</p>
        <p>Você foi convidado a acessar o portal de GRC da <strong>ness.</strong></p>
        <p>Aqui estão suas credenciais temporárias para o primeiro acesso:</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 0.95rem;">
          <strong>E-mail:</strong> ${escapeHtml(email)}<br/>
          <strong>Senha Temporária:</strong> ${escapeHtml(password)}
        </div>
        <p style="color: #ff3b30; font-size: 0.85rem;">* Por motivos de segurança, você deverá redefinir sua senha obrigatoriamente no primeiro login.</p>
        <p style="margin-top: 25px;">
          <a href="https://niso.ness.com.br" style="background-color: #00ade8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Entrar no n.iso</a>
        </p>
      </div>
    `;
    await sendEmail(c, email, 'Seu acesso ao n.iso', emailHtml);

    return c.json({ id, email, name, role: targetRole, client_project_id: targetProject }, 201);
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return erro500(c, 'Falha ao criar usuário', e);
  }
});

usersApp.put('/:id', async (c) => {
  const admin = c.get('user');
  if (!GESTORES.has(admin.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const v = await validateBody(c, updateUserSchema);
    if (!v.success) return v.response;
    const { name, email, role, client_project_id, password } = v.data;
    
    const user = await c.env.DB.prepare(`SELECT u.id, u.role, u.client_project_id, ${ORG_DA_CONTA_SQL} AS org FROM users u WHERE u.id = ?`).bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }
    if (ehAdminConsultoria(admin)) {
      const minha = orgDoUsuario(admin);
      if (user.org !== minha) return c.json(NAO_ENCONTRADO, 404);
      // Não move a conta para projeto de outra organização.
      if (client_project_id && await orgDoProjeto(c.env.DB, client_project_id) !== minha) {
        return c.json({ error: 'Forbidden: projeto fora da sua organização' }, 403);
      }
    }

    // O ALVO precisa ser de cliente (senão é tomada de conta: trocar a senha de
    // um admin ou colega) E o papel novo também (senão é promoção).
    if (soPlatformAdmin(admin, user.role) || (role !== undefined && soPlatformAdmin(admin, role))) {
      return c.json(recusaPapelInterno, 403);
    }
    if (await consultorForaDoProjeto(c.env.DB, admin, user.client_project_id) ||
        (client_project_id !== undefined && await consultorForaDoProjeto(c.env.DB, admin, client_project_id))) {
      return c.json(recusaProjeto, 403);
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
      // Conta que vira equipe fica na organização de quem a gere (a de cliente segue o projeto).
      if (ehAdminConsultoria(admin)) {
        updates.push('org_id = ?');
        values.push(orgDoUsuario(admin));
      }
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

      // Papel, senha ou projeto mudou: a sessão em curso carrega os valores
      // ANTIGOS (o middleware lê o papel do KV, não do banco). Sem derrubar a
      // sessão, rebaixar alguém de admin para leitor só passa a valer em 24h.
      if (role !== undefined || password !== undefined || client_project_id !== undefined) {
        await invalidateUserSessions(c.env.SESSIONS, id);
      }
      if (password !== undefined && password !== '') await revogarAgentesPorTrocaDeSenha(c.env.DB, id);

      await logAudit(c.env.DB, 'user.updated', admin.email, `Usuário ${id} atualizado`);
    }

    return c.json({ ok: true, message: 'Usuário atualizado com sucesso' });
  } catch (e: any) {
    if (e.message && e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return erro500(c, 'Falha ao atualizar usuário', e);
  }
});

usersApp.delete('/:id', async (c) => {
  const admin = c.get('user');
  if (!GESTORES.has(admin.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const user = await c.env.DB.prepare(`SELECT u.id, u.email, u.role, u.client_project_id, ${ORG_DA_CONTA_SQL} AS org FROM users u WHERE u.id = ?`).bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }
    if (ehAdminConsultoria(admin) && user.org !== orgDoUsuario(admin)) return c.json(NAO_ENCONTRADO, 404);

    if (soPlatformAdmin(admin, user.role)) return c.json(recusaPapelInterno, 403);
    if (await consultorForaDoProjeto(c.env.DB, admin, user.client_project_id)) return c.json(recusaProjeto, 403);

    if (admin.role === 'org_admin' && user.client_project_id !== admin.client_project_id) {
      return c.json({ error: 'Forbidden: Access denied to this user' }, 403);
    }

    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    // Usuário excluído com sessão aberta continuaria navegando: o middleware
    // valida a sessão contra o KV, e a linha em `users` já não existe.
    await invalidateUserSessions(c.env.SESSIONS, id);
    await logAudit(c.env.DB, 'user.deleted', admin.email, `Usuário ${user.email} excluído`);

    return c.json({ ok: true, message: 'Usuário excluído com sucesso' });
  } catch (e: any) {
    return erro500(c, 'Falha ao excluir usuário', e);
  }
});
