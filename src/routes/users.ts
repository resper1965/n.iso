import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, hashPassword, logAudit, sendEmail, escapeHtml, invalidateUserSessions, revogarAgentesPorTrocaDeSenha, erro500, ehConsultor, ehAdminDaOrg, consultorDesignado, PROJETOS_DO_CONSULTOR_SQL, PAPEIS_EQUIPE_ORG } from '../helpers';
import { validateBody, createUserSchema, updateUserSchema } from '../schemas';
import { appUrl } from '../config/url';
import { orgDoUsuario, resolverOrg, SEM_ORG, limiteDoPlanoAtingido, LIMITE_USUARIOS } from '../services/organizacao';

export const usersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


/** Quem gere usuários. O `consultoria_admin` (Tarefa 4 cria o valor) gere os da própria organização. */
const GESTORES = new Set(['consultor', 'platform_admin', 'org_admin', 'consultoria_admin']);

/*
 * Organização de uma conta (multiconsultoria): cliente é da organização do PROJETO dele (o projeto
 * pode ser transferido, e a conta do cliente vai junto); equipe, de `users.org_id`. Cliente sem
 * projeto não tem organização (NULL): só o platform_admin o gere. Grafias legadas de cliente incluídas.
 */
const ORG_DA_CONTA_SQL = `CASE WHEN u.role IN ('org_admin', 'org_user', 'client', 'user', 'client_admin', 'employee', 'stakeholder')
  THEN (SELECT p.org_id FROM projects p WHERE p.id = u.client_project_id) ELSE u.org_id END`;

usersApp.get('/', async (c) => {
  const user = c.get('user');
  if (!GESTORES.has(user.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  try {
    let stmt = c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users ORDER BY created_at DESC');
    if (user.role === 'platform_admin' && c.req.header('X-Org-Id')?.trim()) {
      // A organização em que o platform_admin atua (a tela de organizações manda o cabeçalho);
      // sem ele, todas as contas. Organização inexistente → 403, como em `exigirOrg`.
      const org = await resolverOrg(c);
      if (!org) return c.json(SEM_ORG, 403);
      stmt = c.env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.client_project_id, u.created_at FROM users u WHERE ${ORG_DA_CONTA_SQL} = ? ORDER BY u.created_at DESC`).bind(org);
    } else if (ehAdminDaOrg(user)) {
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
  quem.role !== 'platform_admin' && !(ehAdminDaOrg(quem) ? PAPEIS_DO_ADMIN_CONSULTORIA : PAPEIS_CLIENTE_GERIVEIS).has(papel ?? '');
const recusaPapelInterno = { error: 'Forbidden: contas da ness. são geridas pelo platform_admin' };
const EQUIPE_SEM_PROJETO = { error: 'Conta de equipe não se prende a projeto' };

/** Nome da organização para o e-mail de boas-vindas; sem organização, "ness.". */
export const nomeDaOrg = async (db: D1Database, orgId: string | null | undefined) =>
  (orgId ? (await db.prepare('SELECT name FROM organizations WHERE id = ?').bind(orgId).first<{ name: string }>())?.name : null) || 'ness.';

/** Organização de um projeto; `null` se não existe. */
const orgDoProjeto = async (db: D1Database, projectId: string | null | undefined) =>
  projectId ? (await db.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>())?.org_id ?? null : null;
/**
 * A organização ficaria sem administrador ativo se o alvo (um `consultoria_admin` dela) saísse?
 * Conta os OUTROS administradores ativos: apagar um inativo não é problema. O `platform_admin` não
 * passa por aqui: ele reprovisiona.
 */
const ultimoAdminDaOrg = async (db: D1Database, orgId: string | null, alvoId: string) =>
  ((await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND role = 'consultoria_admin' AND COALESCE(ativo, 1) <> 0 AND id <> ?`)
    .bind(orgId ?? '', alvoId).first<{ n: number }>())?.n ?? 0) === 0;
const ULTIMO_ADMIN = { error: 'A organização precisa de ao menos um administrador ativo' };
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

/**
 * Convite de primeiro acesso: e-mail com a senha provisória (a conta nasce com
 * `requires_password_change = 1`, então ela vale para UM login). Único caminho de boas-vindas: o
 * `POST /users` e o provisionamento de organização (`routes/organizacoes.ts`) usam este. Devolve se o
 * provedor aceitou; a senha nunca vai para log (`sendEmail` só registra destinatário e assunto).
 */
export function enviarBoasVindas(c: any, email: string, name: string, password: string, nomeOrg: string): Promise<boolean> {
  // O nome da organização de quem convida (a ness. é "ness.", que já termina em ponto).
  const org = escapeHtml(nomeOrg.endsWith('.') ? nomeOrg : `${nomeOrg}.`);
  const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0;">Bem-vindo ao n.iso!</h2>
        <p>Olá, <strong>${escapeHtml(name)}</strong>,</p>
        <p>Você foi convidado a acessar o portal de GRC da <strong>${org}</strong></p>
        <p>Aqui estão suas credenciais temporárias para o primeiro acesso:</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 0.95rem;">
          <strong>E-mail:</strong> ${escapeHtml(email)}<br/>
          <strong>Senha Temporária:</strong> ${escapeHtml(password)}
        </div>
        <p style="color: #ff3b30; font-size: 0.85rem;">* Por motivos de segurança, você deverá redefinir sua senha obrigatoriamente no primeiro login.</p>
        <p style="margin-top: 25px;">
          <a href="${appUrl(c.env)}" style="background-color: #00ade8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Entrar no n.iso</a>
        </p>
      </div>
    `;
  return sendEmail(c, email, 'Seu acesso ao n.iso', emailHtml);
}

usersApp.post('/', async (c) => {
  const admin = c.get('user');
  if (!GESTORES.has(admin.role)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const valid = await validateBody(c, createUserSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, role, client_project_id } = valid.data;

    // Conta de equipe não tem `client_project_id`: o acesso dela vem da organização. Aceitar o
    // campo deixava o consultoria_admin da org B prender um comercial a projeto da ness.
    if (!PAPEIS_CLIENTE_GERIVEIS.has(role) && client_project_id) return c.json(EQUIPE_SEM_PROJETO, 400);
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
    if (ehAdminDaOrg(admin) && ehCliente && (!targetProject || await orgDoProjeto(c.env.DB, targetProject) !== orgCriador)) {
      return c.json({ error: 'Forbidden: projeto fora da sua organização' }, 403);
    }
    const orgNovo = ehCliente ? (await orgDoProjeto(c.env.DB, targetProject)) ?? orgCriador : orgCriador;
    if (!orgNovo) return c.json(SEM_ORG, 403);
    // O limite do plano conta só a EQUIPE da consultoria; conta de cliente não entra.
    if (!ehCliente && await limiteDoPlanoAtingido(c.env.DB, orgNovo, 'usuarios')) return c.json(LIMITE_USUARIOS, 409);
    // O UNIQUE da coluna é sensível a caixa: conta antiga `CEO@x.com` não barraria `ceo@x.com`.
    if (await c.env.DB.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = ?').bind(email).first()) {
      return c.json({ error: 'Email já cadastrado' }, 400);
    }

    const id = genId();
    const hash = await hashPassword(password);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, email, hash, name, targetRole, targetProject || null, orgNovo).run();

    await logAudit(c.env.DB, 'user.created', admin.email, `Usuário ${email} criado como ${targetRole}`);

    await enviarBoasVindas(c, email, name, password, await nomeDaOrg(c.env.DB, orgNovo));

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
    // Papel e projeto como ficarão depois da edição.
    const papelFinal: string = role ?? user.role;
    const ficaCliente = PAPEIS_CLIENTE_GERIVEIS.has(papelFinal);
    if (!ficaCliente && client_project_id) return c.json(EQUIPE_SEM_PROJETO, 400);
    const projetoFinal = client_project_id !== undefined ? client_project_id : user.client_project_id;
    if (ehAdminDaOrg(admin)) {
      const minha = orgDoUsuario(admin);
      if (user.org !== minha) return c.json(NAO_ENCONTRADO, 404);
      // Conta que fica (ou vira) cliente: o projeto tem de ser da organização dele, inclusive na
      // troca de papel de equipe para cliente sem mandar o projeto.
      if (ficaCliente && (!projetoFinal || await orgDoProjeto(c.env.DB, projetoFinal) !== minha)) {
        return c.json({ error: 'Forbidden: projeto fora da sua organização' }, 403);
      }
      // A senha de outro administrador da consultoria só o dono (pelo fluxo de senha) ou o
      // platform_admin trocam: senão um administrador toma a conta do outro.
      if (password && user.role === 'consultoria_admin') {
        return c.json({ error: 'Forbidden: a senha de um administrador da consultoria só ele mesmo troca' }, 403);
      }
      if (user.role === 'consultoria_admin' && papelFinal !== 'consultoria_admin' && await ultimoAdminDaOrg(c.env.DB, minha, id)) {
        return c.json(ULTIMO_ADMIN, 409);
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

    // Cliente que vira equipe passa a contar no limite do plano (senão o limite se contornava
    // criando cliente e promovendo depois).
    if (role !== undefined && PAPEIS_EQUIPE_ORG.has(role) && !PAPEIS_EQUIPE_ORG.has(user.role)) {
      const orgEquipe = ehAdminDaOrg(admin) ? orgDoUsuario(admin)
        : (await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(id).first<{ org_id: string }>())?.org_id;
      if (!orgEquipe || await limiteDoPlanoAtingido(c.env.DB, orgEquipe, 'usuarios')) return c.json(LIMITE_USUARIOS, 409);
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      // Variante de caixa de OUTRA conta passaria no UNIQUE e, pela busca sem caixa do login, tomaria a conta dela.
      if (await c.env.DB.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = ? AND id <> ?').bind(email, id).first()) {
        return c.json({ error: 'Email já cadastrado' }, 400);
      }
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
      // Conta que vira equipe fica na organização de quem a gere (a de cliente segue o projeto).
      if (ehAdminDaOrg(admin)) {
        updates.push('org_id = ?');
        values.push(orgDoUsuario(admin));
      }
    }
    if (client_project_id !== undefined) {
      updates.push('client_project_id = ?');
      values.push(admin.role === 'org_admin' ? (admin.client_project_id || null) : (client_project_id || null));
    } else if (!ficaCliente && user.client_project_id) {
      // Cliente que vira equipe solta o projeto: conta de equipe não se prende a projeto.
      updates.push('client_project_id = NULL');
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

      // Quais CAMPOS mudaram, nunca o valor (a senha, menos ainda).
      const campos = [password ? 'senha' : '', role !== undefined ? 'papel' : '', email !== undefined ? 'email' : '',
        name !== undefined ? 'nome' : '', client_project_id !== undefined ? 'projeto' : ''].filter(Boolean);
      await logAudit(c.env.DB, 'user.updated', admin.email, `Usuário ${id} atualizado: ${campos.join(', ') || 'nenhum campo'}`);
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
    if (ehAdminDaOrg(admin) && user.org !== orgDoUsuario(admin)) return c.json(NAO_ENCONTRADO, 404);
    if (ehAdminDaOrg(admin) && user.role === 'consultoria_admin' && await ultimoAdminDaOrg(c.env.DB, user.org, id)) {
      return c.json(ULTIMO_ADMIN, 409);
    }

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
