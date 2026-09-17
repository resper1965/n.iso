import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import {
  genId, hashPassword, logAudit, sendEmail, escapeHtml, invalidateUserSessions, erro500,
  hidrataEscopo, ehStaffDeConta, ehPapelDePlataforma, contaCriadora, requireProjectAccess,
  AtorAutorizado,
} from '../helpers';
import { validateBody, createUserSchema, updateUserSchema } from '../schemas';

export const usersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const COLUNAS_LISTA = 'id, email, name, role, client_project_id, conta_id, cliente_id, created_at';

/**
 * O usuário-alvo está DENTRO do alcance de quem administra?
 *
 * Esta rota era o caminho de takeover mais curto da plataforma: a guarda de
 * entrada admitia `consultor`, e o ESCOPO do alvo era verificado só no caso
 * `org_admin`. Para `consultor` não havia checagem de alvo nenhuma — ele
 * enumerava staff e clientes de TODAS as consultorias em `GET /users` e depois
 * trocava papel, e-mail e senha de qualquer um deles, inclusive de um consultor
 * da concorrente.
 *
 * O alcance do staff é a CONTA dele, pelos dois lados de `users`: a coluna
 * `conta_id` (outro staff da mesma consultoria) e a cadeia
 * `users.cliente_id → clientes.conta_id` (gente dos clientes que ele atende).
 * Alvo sem escopo nenhum — as duas colunas nulas — NÃO é alcançável: ausência de
 * escopo é NADA, nunca TUDO, e é a mesma direção de falha do resto da camada.
 *
 * `platform_admin` alcança todo mundo (opera o SaaS). `org_admin` continua preso
 * ao próprio `client_project_id`, que é o que ele sempre teve.
 */
async function alcancaUsuario(
  db: D1Database,
  admin: AtorAutorizado & { client_project_id?: string | null },
  alvo: { conta_id?: string | null; cliente_id?: string | null; client_project_id?: string | null }
): Promise<boolean> {
  if (admin.role === 'platform_admin') return true;
  if (admin.role === 'org_admin') return alvo.client_project_id === admin.client_project_id;

  await hidrataEscopo(db, admin);
  if (!admin.conta_id) return false;
  if (alvo.conta_id && alvo.conta_id === admin.conta_id) return true;
  if (alvo.cliente_id) {
    const cli = await db
      .prepare('SELECT 1 FROM clientes WHERE id = ? AND conta_id = ?')
      .bind(alvo.cliente_id, admin.conta_id)
      .first();
    if (cli) return true;
  }
  return false;
}

/**
 * O escopo a GRAVAR no usuário criado/movido, derivado do papel dele.
 *
 * Nada em `src/` escrevia `users.conta_id` nem `users.cliente_id`: os quatro
 * caminhos de criação gravavam só `client_project_id`. O efeito no dia 1 pós
 * deploy era duplo e nos dois sentidos — consultor novo tomava 403 em todo
 * projeto e no funil inteiro, e usuário de cliente ficava trancado fora do
 * próprio projeto (`hidrataEscopo` não salva: a sessão vem de `SELECT *` e traz
 * as chaves com valor `null`, que é `!== undefined`).
 *
 * Mesma forma que `POST /projects` usa para `cliente_id` de projeto: o id sai do
 * REGISTRO (aqui, do projeto), não do corpo.
 */
async function escopoDoPapel(
  db: D1Database,
  admin: AtorAutorizado,
  papel: string,
  projectId: string | null,
  contaDoCorpo?: string | null,
  /** Conta que o alvo JÁ tem (só no `PUT`): repapelar não deve desancorá-lo. */
  contaAtual?: string | null
): Promise<{ conta_id: string | null; cliente_id: string | null; erro?: string }> {
  // `platform_admin` é global: não tem conta nem cliente. Vem antes do teste de
  // staff porque `ehStaffDeConta` o inclui.
  if (ehPapelDePlataforma(papel)) return { conta_id: null, cliente_id: null };

  if (ehStaffDeConta({ role: papel })) {
    await hidrataEscopo(db, admin);
    const conta = contaCriadora(admin, contaDoCorpo) ?? contaAtual ?? null;
    if (!conta) {
      // Recusa explícita, não staff órfão: um `consultor` sem `conta_id` toma
      // 403 em todo projeto e no funil inteiro, e descobre isso no primeiro
      // login. Um 400 aqui diz o que falta enquanto ainda há quem corrigir.
      return { conta_id: null, cliente_id: null, erro: 'conta_id é obrigatório para usuário de staff' };
    }
    const existe = await db.prepare('SELECT 1 FROM contas WHERE id = ?').bind(conta).first();
    if (!existe) return { conta_id: null, cliente_id: null, erro: 'conta_id informado não existe' };
    return { conta_id: conta, cliente_id: null };
  }

  if (!projectId) return { conta_id: null, cliente_id: null };
  const proj = await db
    .prepare('SELECT cliente_id FROM projects WHERE id = ?')
    .bind(projectId)
    .first<{ cliente_id: string | null }>();
  return { conta_id: null, cliente_id: proj?.cliente_id ?? null };
}

/**
 * A concessão que dá alcance ao papel COMUM de cliente.
 *
 * `org_admin` enxerga a empresa inteira e não precisa de linha aqui
 * (`PAPEIS_ADMIN_CLIENTE` em `helpers.ts`); o papel comum alcança só o que lhe
 * foi concedido, e sem esta linha alcança NADA. É o passo 5 do backfill da
 * migration 0032, aplicado a quem nasce depois dela.
 */
async function concedeProjeto(db: D1Database, userId: string, papel: string, projectId: string | null): Promise<void> {
  if (!projectId) return;
  if (ehStaffDeConta({ role: papel }) || papel === 'org_admin') return;
  const existe = await db.prepare('SELECT 1 FROM projects WHERE id = ?').bind(projectId).first();
  if (!existe) return; // FK NOT NULL: projeto inexistente abortaria o INSERT
  await db
    .prepare('INSERT OR IGNORE INTO acesso_projeto (user_id, project_id) VALUES (?, ?)')
    .bind(userId, projectId)
    .run();
}

/**
 * `client_project_id` é ponteiro de acesso, não rótulo: `/portfolio`,
 * `/client/dashboard` e `/client/assessment` leem dele direto. Apontar o usuário
 * de outra pessoa para um projeto da concorrente é, por esse caminho, entregar o
 * projeto — então o projeto informado tem de ser um que QUEM ADMINISTRA alcança.
 *
 * Projeto igual ao do próprio administrador passa sem consultar nada: é o caso do
 * `org_admin` gerenciando o próprio tenant, e sessão legada dele pode não ter
 * `cliente_id` (o que faria `requireProjectAccess` recusar o projeto DELE MESMO).
 *
 * Devolve a mensagem de recusa, ou `null` quando pode seguir.
 */
async function recusaDeProjetoAlheio(
  db: D1Database,
  admin: AtorAutorizado & { client_project_id?: string | null },
  projectId: string | null
): Promise<string | null> {
  if (!projectId || projectId === admin.client_project_id) return null;
  try {
    await hidrataEscopo(db, admin);
    await requireProjectAccess(db, admin, projectId);
    return null;
  } catch {
    return 'Forbidden: No access to this project';
  }
}

usersApp.get('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'consultor' && user.role !== 'platform_admin' && user.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    let stmt = c.env.DB.prepare(`SELECT ${COLUNAS_LISTA} FROM users ORDER BY created_at DESC`);
    if (user.role === 'org_admin') {
      stmt = c.env.DB.prepare(`SELECT ${COLUNAS_LISTA} FROM users WHERE client_project_id = ? ORDER BY created_at DESC`).bind(user.client_project_id || '');
    } else if (user.role !== 'platform_admin') {
      // Mesma regra de `alcancaUsuario`, em forma de lista: staff enumera a
      // PRÓPRIA conta. Sem este ramo, `SELECT ... FROM users` sem `WHERE`
      // entregava staff e clientes de todas as consultorias — que é a metade de
      // enumeração da cadeia de takeover, e o que torna a outra metade fácil.
      const ator = user as AtorAutorizado;
      await hidrataEscopo(c.env.DB, ator);
      stmt = c.env.DB.prepare(
        `SELECT ${COLUNAS_LISTA} FROM users
         WHERE conta_id = ? OR cliente_id IN (SELECT id FROM clientes WHERE conta_id = ?)
         ORDER BY created_at DESC`
      ).bind(ator.conta_id ?? '', ator.conta_id ?? '');
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

usersApp.post('/', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const valid = await validateBody(c, createUserSchema);
    if (!valid.success) return valid.response;
    const { email, password, name, role, client_project_id, conta_id } = valid.data;

    let targetProject = client_project_id;
    let targetRole = role;
    if (admin.role === 'org_admin') {
      targetProject = admin.client_project_id || null;
      if (role !== 'org_admin' && role !== 'org_user' && role !== 'client') {
        return c.json({ error: 'Forbidden: Cannot create users with this role' }, 403);
      }
    }

    // Quem não é `platform_admin` não ATRIBUI papel de plataforma. É o que
    // impede a escalada: sem isto, um `consultor` criava um `platform_admin`
    // com senha escolhida por ele e entrava com a conta nova.
    if (admin.role !== 'platform_admin' && ehPapelDePlataforma(targetRole)) {
      return c.json({ error: 'Forbidden: Cannot assign this role' }, 403);
    }

    const recusa = await recusaDeProjetoAlheio(c.env.DB, admin, targetProject || null);
    if (recusa) return c.json({ error: recusa }, 403);

    const escopo = await escopoDoPapel(c.env.DB, admin, targetRole, targetProject || null, conta_id);
    if (escopo.erro) return c.json({ error: escopo.erro }, 400);

    const id = genId();
    const hash = await hashPassword(password);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, conta_id, cliente_id, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, email, hash, name, targetRole, targetProject || null, escopo.conta_id, escopo.cliente_id).run();
    await concedeProjeto(c.env.DB, id, targetRole, targetProject || null);

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
    return erro500(c, 'Falha ao criar usuário', e);
  }
});

usersApp.put('/:id', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const v = await validateBody(c, updateUserSchema);
    if (!v.success) return v.response;
    const { name, email, role, client_project_id, password, conta_id } = v.data;
    
    const user = await c.env.DB.prepare('SELECT id, role, client_project_id, conta_id, cliente_id FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    if (!(await alcancaUsuario(c.env.DB, admin, user))) {
      return c.json({ error: 'Forbidden: Access denied to this user' }, 403);
    }

    if (admin.role === 'org_admin') {
      if (role !== undefined && role !== 'org_admin' && role !== 'org_user' && role !== 'client') {
        return c.json({ error: 'Forbidden: Cannot assign this role' }, 403);
      }
    }

    // A parte que impede a ESCALADA, e que valia para `org_admin` mas não para
    // `consultor`: quem não é `platform_admin` não atribui papel de plataforma.
    // Era com isto que a cadeia fechava — enumerar, `PUT /users/<próprio id>`
    // com `role: 'platform_admin'`, nova sessão, plataforma inteira.
    if (role !== undefined && admin.role !== 'platform_admin' && ehPapelDePlataforma(role)) {
      return c.json({ error: 'Forbidden: Cannot assign this role' }, 403);
    }

    const alvoProjeto = admin.role === 'org_admin'
      ? (admin.client_project_id || null)
      : (client_project_id === undefined ? undefined : (client_project_id || null));
    if (alvoProjeto !== undefined) {
      const recusa = await recusaDeProjetoAlheio(c.env.DB, admin, alvoProjeto);
      if (recusa) return c.json({ error: recusa }, 403);
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
      values.push(alvoProjeto ?? null);
    }
    // Mover ou repapelar alguém reescreve o escopo REAL junto com a coluna
    // legada. Atualizar só `client_project_id` deixaria `cliente_id` e a
    // concessão apontando para o projeto ANTIGO: a pessoa seguiria alcançando o
    // que deixou e não alcançaria o que recebeu.
    if (client_project_id !== undefined || role !== undefined) {
      const papel = role ?? user.role;
      const projeto = (client_project_id !== undefined ? alvoProjeto : user.client_project_id) ?? null;
      const escopo = await escopoDoPapel(c.env.DB, admin, papel, projeto, conta_id, user.conta_id);
      if (escopo.erro) return c.json({ error: escopo.erro }, 400);
      updates.push('conta_id = ?', 'cliente_id = ?');
      values.push(escopo.conta_id, escopo.cliente_id);
      await concedeProjeto(c.env.DB, id, papel, projeto);
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
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin' && admin.role !== 'org_admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const id = c.req.param('id');
  try {
    const user = await c.env.DB.prepare('SELECT id, email, client_project_id, conta_id, cliente_id FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    // Mesmo alcance do `PUT`, e pelo mesmo motivo: o escopo do alvo era checado
    // só para `org_admin`, então `consultor` apagava usuário de qualquer
    // consultoria. Excluir é irreversível, então a omissão custava mais aqui.
    if (!(await alcancaUsuario(c.env.DB, admin, user))) {
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
