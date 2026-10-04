import { Hono } from 'hono';
import { z } from 'zod';
import { Bindings, Variables } from '../index';
import {
  logAudit, verifyPassword, erro500, requireProjectAccess, projetosVisiveis,
  autoridadeDeAssinatura, recusaDeAssinatura, type PapelAssinatura,
} from '../helpers';
import { validateBody } from '../schemas';
import {
  criarPedido, conferirVigencia, assinaturaDpia, TIPOS_PEDIDO, PAPEIS_PEDIDO, type PedidoRow,
} from '../services/pedidos';

/**
 * Pedidos de aprovação/ciência (acesso de stakeholders, fatia 2). Ver `services/pedidos.ts`.
 *
 * - `POST /api/v1/projects/:projectId/pedidos` — a consultoria (consultor designado,
 *   `consultoria_admin`) ou o `org_admin` do projeto pede. O `projectAccessMiddleware` já cortou o
 *   projeto; aqui só o papel. Stakeholder nem chega (allow-list de caminhos).
 * - `/api/v1/pedidos*` — o lado do DESTINATÁRIO: "Meus pedidos", abrir, aprovar, recusar. Só vê o
 *   pedido quem é destinatário (por `user_id`, ou pelo e-mail enquanto não há conta ligada) E
 *   alcança o projeto dele. Pedido alheio é 404, não 403: não confirma que existe.
 *
 * Autoridade de aprovação PROVISÓRIA (fatia 4 refina): `ciente` basta ser destinatário; `ciso`/`ceo`
 * passam por `autoridadeDeAssinatura`/`recusaDeAssinatura`, a mesma regra das aprovações existentes
 * (falha fechado: sem designação na matriz, sem aprovação).
 */
type Ctx = { Bindings: Bindings; Variables: Variables };
type Usuario = Variables['user'];

export const pedidosApp = new Hono<Ctx>();
export const projectPedidosApp = new Hono<Ctx>();

/** Quem pede (parte 4 do desenho). `platform_admin` não: opera a plataforma, não o cliente. */
const PODE_PEDIR = new Set(['org_admin', 'consultor', 'consultant', 'consultoria_admin']);

const criarSchema = z.object({
  tipo: z.enum(TIPOS_PEDIDO),
  ref_id: z.string().trim().min(1).max(200),
  papel_exigido: z.enum(PAPEIS_PEDIDO),
  destinatarios: z.array(z.object({
    email: z.string().trim().email().max(320),
    nome: z.string().trim().max(200).optional().nullable(),
  })).min(1).max(50),
});

const decisaoSchema = z.object({
  senha: z.string().min(1).max(500),
  motivo: z.string().trim().max(2000).optional().nullable(),
});

projectPedidosApp.post('/', async (c) => {
  try {
    const user = c.get('user');
    if (!PODE_PEDIR.has(user?.role ?? '')) return c.json({ error: 'Forbidden: papel sem permissão para pedir aprovação' }, 403);
    const projectId = c.req.param('projectId') ?? '';
    const valid = await validateBody(c, criarSchema);
    if (!valid.success) return valid.response;
    const b = valid.data;

    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const criado = await criarPedido(c.env.DB, {
      orgId: projeto.org_id, projectId, tipo: b.tipo, refId: b.ref_id, papel: b.papel_exigido,
      destinatarios: b.destinatarios, criadoPor: user.email,
    });
    if (!criado) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    await logAudit(c.env.DB, 'pedido.criado', user.email,
      `Pedido ${criado.id} (${b.tipo} ${b.ref_id}, papel ${b.papel_exigido}) para ${b.destinatarios.length} destinatário(s); hash ${criado.hash}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true, ...criado }, 201);
  } catch (e: any) {
    return erro500(c, 'Erro ao criar pedido', e);
  }
});

/** O usuário alcança o projeto do pedido? Stakeholder: só o próprio `client_project_id`. */
async function alcancaProjeto(db: D1Database, user: Usuario, projectId: string): Promise<boolean> {
  if (user.role === 'stakeholder') return !!user.client_project_id && user.client_project_id === projectId;
  return requireProjectAccess(db, user, projectId).then(() => true, () => false);
}

type Meu = { pedido: PedidoRow; dest: { id: string; status: string; nome: string | null; email: string; decidido_em: string | null } };

/** O pedido, se o usuário é destinatário dele e alcança o projeto; senão `null` (vira 404). */
async function meuPedido(db: D1Database, user: Usuario, id: string): Promise<Meu | null> {
  const row = await db.prepare(
    `SELECT p.*, d.id AS d_id, d.status AS d_status, d.nome AS d_nome, d.email AS d_email, d.decidido_em AS d_decidido_em
       FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
      WHERE p.id = ? AND (d.user_id = ? OR (d.user_id IS NULL AND d.email = lower(?)))
      LIMIT 1`
  ).bind(id, user.id ?? '', user.email ?? '').first<any>();
  if (!row || !(await alcancaProjeto(db, user, row.project_id))) return null;
  const { d_id, d_status, d_nome, d_email, d_decidido_em, ...pedido } = row;
  return { pedido, dest: { id: d_id, status: d_status, nome: d_nome, email: d_email, decidido_em: d_decidido_em } };
}

pedidosApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    // Mesmo corte de projeto das listagens (stakeholder: o próprio projeto), além de ser destinatário.
    const vis = user.role === 'stakeholder'
      ? { sql: 'SELECT ?', bind: user.client_project_id ?? '' }
      : projetosVisiveis(user);
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.project_id, p.tipo, p.titulo, p.papel_exigido, p.status, p.hash, p.criado_em,
              d.status AS meu_status, d.decidido_em
         FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
        WHERE (d.user_id = ? OR (d.user_id IS NULL AND d.email = lower(?)))
          AND p.status NOT IN ('substituido', 'cancelado')
          ${vis ? `AND p.project_id IN (${vis.sql})` : ''}
        ORDER BY p.criado_em DESC LIMIT 200`
    ).bind(user.id ?? '', user.email ?? '', ...(vis ? [vis.bind] : [])).all();
    return c.json({ pedidos: results });
  } catch (e: any) {
    return erro500(c, 'Erro ao listar pedidos', e);
  }
});

pedidosApp.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meu = await meuPedido(c.env.DB, user, c.req.param('id'));
    if (!meu) return c.json({ error: 'Pedido não encontrado' }, 404);
    let { pedido } = meu;
    // Abrir já confere se o documento mudou: a pessoa não lê uma versão que não vale mais.
    const vig = await conferirVigencia(c.env.DB, pedido);
    if (!vig.vigente) pedido = { ...pedido, status: vig.status, substituido_por: vig.substituido_por ?? pedido.substituido_por };
    const { conteudo_json, ...resto } = pedido;
    return c.json({ pedido: { ...resto, conteudo: JSON.parse(conteudo_json) }, destinatario: meu.dest });
  } catch (e: any) {
    return erro500(c, 'Erro ao abrir pedido', e);
  }
});

/**
 * Aprovar (ou dar ciência) e recusar: mesma sequência, mesma prova. Pedido fora do ar é 409 (com o
 * id do substituto, se houver); senha errada é 401; sem autoridade para o papel, 403. A prova, a
 * assinatura do documento e o novo status do pedido vão num único `batch`.
 */
async function decidir(c: any, decisao: 'aprovar' | 'recusar') {
  try {
    const user: Usuario = c.get('user');
    const db: D1Database = c.env.DB;
    const meu = await meuPedido(db, user, c.req.param('id'));
    if (!meu) return c.json({ error: 'Pedido não encontrado' }, 404);
    const valid = await validateBody(c, decisaoSchema);
    if (!valid.success) return valid.response;
    const { pedido, dest } = meu;

    const vig = await conferirVigencia(db, pedido);
    if (!vig.vigente) {
      const msg = vig.status === 'substituido'
        ? 'O documento mudou depois deste pedido. Abra o pedido novo, com o texto atual.'
        : 'Este pedido não está mais aberto.';
      return c.json({ error: msg, status: vig.status, substituido_por: vig.substituido_por ?? null }, 409);
    }
    if (dest.status !== 'pendente') return c.json({ error: 'Você já decidiu este pedido.', status: dest.status }, 409);

    const dbUser = await db.prepare('SELECT password_hash, name, totp_enabled FROM users WHERE id = ?').bind(user.id ?? '')
      .first<{ password_hash: string; name: string | null; totp_enabled: number | null }>();
    if (!dbUser || !(await verifyPassword(valid.data.senha, dbUser.password_hash))) {
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    let nome = dest.nome || dbUser.name || user.email;
    let assinatura: D1PreparedStatement | null = null;
    if (pedido.papel_exigido !== 'ciente') {
      const papel = pedido.papel_exigido as PapelAssinatura;
      const autoridade = await autoridadeDeAssinatura(db, pedido.project_id, user);
      const recusa = recusaDeAssinatura(autoridade, papel);
      if (recusa) return c.json({ error: recusa }, 403);
      nome = autoridade.nome || nome;
      if (decisao === 'aprovar') {
        assinatura = await assinaturaDpia(db, pedido.project_id, pedido.ref_id, papel, nome);
        if (!assinatura) return c.json({ error: 'Documento não encontrado' }, 409);
      }
    }

    const novoStatus = decisao === 'recusar' ? 'recusado' : pedido.papel_exigido === 'ciente' ? 'ciente' : 'aprovado';
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const ua = c.req.header('User-Agent') || null;
    const res = await db.batch([
      db.prepare(`UPDATE pedido_destinatarios SET status = ?, decidido_em = ?, canal = 'conta', ip = ?, user_agent = ?, hash_lido = ?,
          mfa_usado = ?, nome = ?, motivo = ? WHERE id = ? AND status = 'pendente'`)
        .bind(novoStatus, new Date().toISOString(), ip, ua, pedido.hash, dbUser.totp_enabled === 1 ? 1 : 0, nome,
          decisao === 'recusar' ? valid.data.motivo ?? null : null, dest.id),
      ...(assinatura ? [assinatura] : []),
      // Recusa de um fecha o pedido; aprovado quando ninguém mais está pendente.
      db.prepare(`UPDATE pedidos SET status = CASE
          WHEN EXISTS (SELECT 1 FROM pedido_destinatarios WHERE pedido_id = ?1 AND status = 'recusado') THEN 'recusado'
          WHEN NOT EXISTS (SELECT 1 FROM pedido_destinatarios WHERE pedido_id = ?1 AND status = 'pendente') THEN 'aprovado'
          ELSE status END
        WHERE id = ?1 AND status = 'aberto'`).bind(pedido.id),
    ]);
    if (!res[0].meta?.changes) return c.json({ error: 'Você já decidiu este pedido.' }, 409);

    await logAudit(db, decisao === 'recusar' ? 'pedido.recusado' : 'pedido.aprovado', user.email,
      `Pedido ${pedido.id} (${pedido.tipo} ${pedido.ref_id}, papel ${pedido.papel_exigido}): ${novoStatus} por ${nome}; hash lido ${pedido.hash}`,
      decisao === 'recusar' ? valid.data.motivo ?? '' : '', ip ?? '', pedido.project_id);
    return c.json({ ok: true, status: novoStatus, hash_lido: pedido.hash });
  } catch (e: any) {
    return erro500(c, 'Erro ao registrar a decisão do pedido', e);
  }
}

pedidosApp.post('/:id/aprovar', (c) => decidir(c, 'aprovar'));
pedidosApp.post('/:id/recusar', (c) => decidir(c, 'recusar'));
