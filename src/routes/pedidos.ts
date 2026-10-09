import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import {
  logAudit, verifyPassword, erro500, requireProjectAccess, projetosVisiveis, idDoControle,
  type PapelAssinatura,
  sendEmail, escapeHtml, genToken, sha256Hex, registraErro,
} from '../helpers';
import { validateBody, pedidoCriarSchema, pedidoDecisaoSchema, pedidoCienciaLoteSchema, pedidoReenvioSchema } from '../schemas';
import { appUrl } from '../config/url';
import {
  criarPedido, recusaDeDestinatarios, politicaVazia, conferirVigencia, registrarDecisao, podePedir, autoridadeNoPedido, DIAS_LINK, type PedidoRow,
  substituirPedidosDoDocumento, type TipoPedido, type Vigencia,
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
 * Quem pede: `podePedir`; quem aprova: `autoridadeNoPedido` (ambas em `services/pedidos.ts`, fatia 4).
 */
type Ctx = { Bindings: Bindings; Variables: Variables };
type Usuario = Variables['user'];

/**
 * Documento gravado (política no controle, DPIA): confere na hora os pedidos abertos dele, para o
 * substituto aparecer sem esperar alguém abrir o antigo. Não derruba a escrita que já aconteceu: se
 * falhar, só registra; a conferência se repete ao abrir e ao decidir.
 */
export async function conferirPedidosDoDocumento(c: any, tipo: TipoPedido, refIds: string | string[], projectId?: string): Promise<void> {
  try {
    for (const { antigo, vig } of await substituirPedidosDoDocumento(c.env.DB, tipo, refIds, projectId)) {
      await avisarSubstituicao(c, antigo, vig);
    }
  } catch (e) {
    registraErro(c, e);
  }
}

/** `conferirVigencia` + aviso aos destinatários por link, se esta conferência substituiu o pedido. */
export async function conferirEAvisar(c: any, p: PedidoRow): Promise<Vigencia> {
  const vig = await conferirVigencia(c.env.DB, p);
  await avisarSubstituicao(c, p, vig);
  return vig;
}

/**
 * Pedido de ciência por link acabou de ser substituído (por ESTA chamada): o substituto nasce sem
 * token, então quem recebeu link no antigo ficaria sem caminho. Emite link novo a esses pendentes e
 * manda o e-mail. Sem envio configurado, nada é emitido e o painel mostra quantos estão sem link
 * (`sem_link`). Falha aqui não desfaz a substituição: fica registrada e o "Reenviar" cobre.
 */
async function avisarSubstituicao(c: any, antigo: PedidoRow, vig: Vigencia): Promise<void> {
  if (vig.vigente || !vig.criado || !vig.substituido_por || antigo.papel_exigido !== 'ciente') return;
  try {
    const db: D1Database = c.env.DB;
    const { results } = await db.prepare('SELECT email FROM pedido_destinatarios WHERE pedido_id = ? AND token_hash IS NOT NULL')
      .bind(antigo.id).all<{ email: string }>();
    if (!results.length || !c.env.RESEND_API_KEY) return;
    const links = await emitirLinks(db, vig.substituido_por, new Set(results.map((r) => r.email)));
    const titulo = (await db.prepare('SELECT titulo FROM pedidos WHERE id = ?').bind(vig.substituido_por).first<{ titulo: string }>())?.titulo ?? antigo.titulo;
    const falhas = await enviarLinks(c, titulo, links);
    await logAudit(db, 'pedido.ciencia_substituida', 'sistema',
      `Pedido ${antigo.id} substituído por ${vig.substituido_por} (documento alterado): link novo a ${links.length} pendente(s), ${falhas.length} falha(s) de envio`,
      '', '', antigo.project_id);
  } catch (e) {
    registraErro(c, e);
  }
}

const POLITICA_VAZIA = { error: 'A política está vazia: escreva o texto antes de pedir aprovação' };

export const pedidosApp = new Hono<Ctx>();
export const projectPedidosApp = new Hono<Ctx>();

/** 403 com o motivo, se o usuário não pede neste projeto; `null` se pode. */
async function recusaPedir(c: any): Promise<Response | null> {
  const motivo = await podePedir(c.env.DB, c.get('user'), c.req.param('projectId') ?? '');
  return motivo ? c.json({ error: motivo }, 403) : null;
}

projectPedidosApp.post('/', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const user = c.get('user');
    const projectId = c.req.param('projectId') ?? '';
    const valid = await validateBody(c, pedidoCriarSchema);
    if (!valid.success) return valid.response;
    const b = valid.data;
    // Política: só aprovação. A ciência de política é pelo lote por link (POST /ciencia).
    if ((b.tipo === 'politica' || b.tipo === 'documento') && b.papel_exigido === 'ciente') {
      return c.json({ error: 'Ciência de política ou documento é pelo envio por link ("Nova ciência por link"). Este pedido é de aprovação: escolha Líder SGSI ou Direção.' }, 400);
    }
    // O id do controle chega em qualquer formato ou como código; o pedido guarda o id da linha.
    const refId = b.tipo === 'politica' ? await idDoControle(c.env.DB, projectId, b.ref_id) : b.ref_id;
    if (!refId) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    if (b.tipo === 'politica' && await politicaVazia(c.env.DB, refId, projectId)) return c.json(POLITICA_VAZIA, 400);

    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const semAutoridade = await recusaDeDestinatarios(c.env.DB, projectId, b.papel_exigido, b.destinatarios);
    if (semAutoridade) return c.json({ error: semAutoridade }, 400);

    const criado = await criarPedido(c.env.DB, {
      projectId, tipo: b.tipo, refId, papel: b.papel_exigido,
      destinatarios: b.destinatarios, criadoPor: user.email,
    });
    if (!criado) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    await logAudit(c.env.DB, 'pedido.criado', user.email,
      `Pedido ${criado.id} (${b.tipo} ${refId}, papel ${b.papel_exigido}) para ${b.destinatarios.length} destinatário(s); hash ${criado.hash}`,
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
    const vig = await conferirEAvisar(c, pedido);
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
async function decidir(c: any, decisao: 'aprovar' | 'recusar', corpo: { senha: string; motivo?: string | null }) {
  try {
    const user: Usuario = c.get('user');
    const db: D1Database = c.env.DB;
    const meu = await meuPedido(db, user, c.req.param('id'));
    if (!meu) return c.json({ error: 'Pedido não encontrado' }, 404);
    const valid = { data: corpo };
    const { pedido, dest } = meu;

    const vig = await conferirEAvisar(c, pedido);
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

    const autoridade = await autoridadeNoPedido(db, pedido, user);
    if (autoridade.recusa) return c.json({ error: autoridade.recusa }, 403);
    const nome = autoridade.nome || dest.nome || dbUser.name || user.email;
    const assinar: { papel: PapelAssinatura } | undefined =
      decisao === 'aprovar' && pedido.papel_exigido !== 'ciente' ? { papel: pedido.papel_exigido } : undefined;

    const novoStatus = decisao === 'recusar' ? 'recusado' : pedido.papel_exigido === 'ciente' ? 'ciente' : 'aprovado';
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const ua = c.req.header('User-Agent') || null;
    const pegou = await registrarDecisao(db, {
      pedido, destId: dest.id, status: novoStatus, ip, ua, mfa: dbUser.totp_enabled === 1, nome,
      motivo: decisao === 'recusar' ? valid.data.motivo ?? null : null, assinar,
    });
    if (!pegou) {
      // Algo mudou entre a conferência e a gravação (documento, pedido ou outra decisão): nada foi
      // gravado. Confere de novo para devolver o motivo e, se for o caso, abrir o pedido substituto.
      const atual = await db.prepare('SELECT * FROM pedidos WHERE id = ?').bind(pedido.id).first<PedidoRow>();
      const vig2 = atual ? await conferirEAvisar(c, atual) : null;
      if (vig2 && !vig2.vigente) {
        return c.json({ error: 'O pedido mudou enquanto você decidia. Abra-o de novo.', status: vig2.status, substituido_por: vig2.substituido_por ?? null }, 409);
      }
      return c.json({ error: 'Você já decidiu este pedido.' }, 409);
    }

    await logAudit(db, decisao === 'recusar' ? 'pedido.recusado' : 'pedido.aprovado', user.email,
      `Pedido ${pedido.id} (${pedido.tipo} ${pedido.ref_id}, papel ${pedido.papel_exigido}): ${novoStatus} por ${nome}; hash lido ${pedido.hash}`,
      decisao === 'recusar' ? valid.data.motivo ?? '' : '', ip ?? '', pedido.project_id);
    return c.json({ ok: true, status: novoStatus, hash_lido: pedido.hash });
  } catch (e: any) {
    return erro500(c, 'Erro ao registrar a decisão do pedido', e);
  }
}

// A validação fica em cada rota (e não dentro de `decidir`): é assim que test/openapi.test.ts liga o
// schema à rota lendo o fonte.
pedidosApp.post('/:id/aprovar', async (c) => {
  const valid = await validateBody(c, pedidoDecisaoSchema);
  if (!valid.success) return valid.response;
  return decidir(c, 'aprovar', valid.data);
});
pedidosApp.post('/:id/recusar', async (c) => {
  const valid = await validateBody(c, pedidoDecisaoSchema);
  if (!valid.success) return valid.response;
  return decidir(c, 'recusar', valid.data);
});

// ─── Ciência em massa por link com código (fatia 3) ──────────────────────────────────────────────
// Quem pede (`podePedir`) manda um documento a até 200 e-mails, sem conta.
// Cada pessoa recebe um link pessoal: token CSPRNG só no FRAGMENTO da URL (o servidor nunca o recebe
// no caminho nem na query), só o SHA-256 no banco. O lado público está em `routes/public-pedidos.ts`.

const SEM_EMAIL = { error: 'Envio de e-mail não configurado' };
type Link = { email: string; nome: string | null; token: string };

function emailCiencia(titulo: string, nome: string | null, link: string): string {
  const e = escapeHtml;
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; color: #1e293b;">
    <p>Olá${nome ? ` ${e(nome)}` : ''},</p>
    <p>Pedimos a sua ciência do documento <strong>${e(titulo)}</strong>. O link é pessoal: leia o documento e confirme com o código que enviaremos ao seu e-mail.</p>
    <p><a href="${e(link)}" style="background-color: #00ade8; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Ler e dar ciência</a></p>
    <p style="font-size: 12px; color: #64748b;">O link vale por ${DIAS_LINK} dias. Se você recebeu um link anterior para este documento, ele deixou de valer.</p>
  </div>`;
}

/** Token novo aos pendentes do pedido (todos, ou só os de `so`); devolve os links em claro, para o e-mail. */
async function emitirLinks(db: D1Database, pedidoId: string, so: Set<string> | null): Promise<Link[]> {
  const { results: pend } = await db.prepare(`SELECT id, email, nome FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'pendente'`)
    .bind(pedidoId).all<{ id: string; email: string; nome: string | null }>();
  const links: Link[] = [];
  for (const d of pend) {
    if (so && !so.has(d.email)) continue;
    const token = genToken();
    const r = await db.prepare(`UPDATE pedido_destinatarios SET token_hash = ?, token_expira_em = datetime('now', '+${DIAS_LINK} days')
      WHERE id = ? AND status = 'pendente'`).bind(await sha256Hex(token), d.id).run();
    if (r.meta?.changes) links.push({ email: d.email, nome: d.nome, token });
  }
  return links;
}

/** Manda os links; devolve os e-mails cujo envio falhou (ficam pendentes, para reenviar). */
// ponytail: 5 envios por vez e uma nova tentativa após pausa curta. Lote de 200 cabe na requisição;
// teto de taxa do provedor mais baixo que isso pede fila (Queues), não laço maior aqui.
const ENVIOS_SIMULTANEOS = 5;
const PAUSA_RETENTATIVA_MS = 300;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enviarLinks(c: any, titulo: string, links: Link[]): Promise<string[]> {
  const enviar = (l: Link) => sendEmail(c, l.email, `Ciência de documento: ${titulo}`, emailCiencia(titulo, l.nome, `${appUrl(c.env)}/politicas#${l.token}`));
  const falhas: string[] = [];
  for (let i = 0; i < links.length; i += ENVIOS_SIMULTANEOS) {
    const grupo = links.slice(i, i + ENVIOS_SIMULTANEOS);
    const ok = await Promise.all(grupo.map(enviar));
    const falhou = grupo.filter((_, k) => !ok[k]);
    if (!falhou.length) continue;
    await pausa(PAUSA_RETENTATIVA_MS);
    const ok2 = await Promise.all(falhou.map(enviar));
    falhas.push(...falhou.filter((_, k) => !ok2[k]).map((l) => l.email));
  }
  return falhas;
}


projectPedidosApp.post('/ciencia', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const user = c.get('user');
    const projectId = c.req.param('projectId') ?? '';
    const valid = await validateBody(c, pedidoCienciaLoteSchema);
    if (!valid.success) return valid.response;
    // Sem a chave o sendEmail só simula: criar links que ninguém recebeu engana quem pediu.
    if (!c.env.RESEND_API_KEY) return c.json(SEM_EMAIL, 503);
    const b = valid.data;
    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    if (b.tipo === 'politica' && await politicaVazia(c.env.DB, b.ref_id, projectId)) return c.json(POLITICA_VAZIA, 400);
    const criado = await criarPedido(c.env.DB, {
      projectId, tipo: b.tipo, refId: b.ref_id, papel: 'ciente',
      destinatarios: b.destinatarios, criadoPor: user.email, comLink: true,
    });
    if (!criado) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    const p = await c.env.DB.prepare('SELECT titulo FROM pedidos WHERE id = ?').bind(criado.id).first<{ titulo: string }>();
    const falhas = await enviarLinks(c, p?.titulo ?? '', criado.links);
    await logAudit(c.env.DB, 'pedido.ciencia_lote', user.email,
      `Pedido ${criado.id} (${b.tipo} ${b.ref_id}, ciência por link) para ${criado.links.length} destinatário(s), ${falhas.length} falha(s) de envio; hash ${criado.hash}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    // Sem `ok: true` por histórico: o api.js desembrulhava a primeira lista. Hoje desembrulha só `{ ok, <uma lista> }`.
    return c.json({ id: criado.id, hash: criado.hash, enviados: criado.links.length - falhas.length, falhas }, 201);
  } catch (e: any) {
    return erro500(c, 'Erro ao criar o pedido de ciência', e);
  }
});

projectPedidosApp.get('/', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.tipo, p.ref_id, p.titulo, p.papel_exigido, p.status, p.hash, p.substituido_por, p.criado_por, p.criado_em,
              COUNT(d.id) AS total,
              COALESCE(SUM(d.status IN ('ciente', 'aprovado')), 0) AS cientes,
              COALESCE(SUM(d.status = 'pendente'), 0) AS pendentes,
              COALESCE(SUM(d.status = 'pendente' AND d.aberto_em IS NULL), 0) AS nao_abriram
         FROM pedidos p LEFT JOIN pedido_destinatarios d ON d.pedido_id = p.id
        WHERE p.project_id = ?
        GROUP BY p.id ORDER BY p.criado_em DESC LIMIT 200`
    ).bind(c.req.param('projectId') ?? '').all();
    return c.json({ pedidos: results });
  } catch (e: any) {
    return erro500(c, 'Erro ao listar os pedidos do projeto', e);
  }
});

/** Pedido do projeto da rota (o `projectAccessMiddleware` já cortou o projeto), ou `null`. */
const pedidoDoProjeto = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT * FROM pedidos WHERE id = ? AND project_id = ?').bind(id, projectId).first<PedidoRow>();

/**
 * Painel de acompanhamento: por destinatário, ciente / pendente (abriu) / não abriu, a ciência de
 * uma VERSÃO ANTERIOR do mesmo documento (pedido substituído) e a linha do portal antigo
 * (`policy_acknowledgments`, sem hash: "versão não registrada"). Nada de token, IP ou user-agent.
 */
projectPedidosApp.get('/:id', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const db = c.env.DB;
    let p = await pedidoDoProjeto(db, c.req.param('projectId') ?? '', c.req.param('id'));
    if (!p) return c.json({ error: 'Pedido não encontrado' }, 404);
    const vig = await conferirEAvisar(c, p);
    if (!vig.vigente) p = { ...p, status: vig.status, substituido_por: vig.substituido_por ?? p.substituido_por };

    const { results: dests } = await db.prepare(
      `SELECT email, nome, status, decidido_em, aberto_em, canal, hash_lido, motivo FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email`
    ).bind(p.id).all<any>();
    const { results: anteriores } = await db.prepare(
      `SELECT d.email, d.decidido_em, d.hash_lido FROM pedido_destinatarios d JOIN pedidos q ON q.id = d.pedido_id
        WHERE q.project_id = ? AND q.tipo = ? AND q.ref_id = ? AND q.id <> ? AND q.status = 'substituido' AND d.status = 'ciente'
        ORDER BY d.decidido_em DESC`
    ).bind(p.project_id, p.tipo, p.ref_id, p.id).all<any>();
    const anterior = new Map<string, unknown>();
    for (const a of anteriores) if (!anterior.has(a.email)) anterior.set(a.email, { decidido_em: a.decidido_em, hash_lido: a.hash_lido });

    // Portal antigo: a ciência era pelo título (ou id) do controle, sem versão.
    const antigo = new Map<string, unknown>();
    if (p.tipo === 'politica') {
      const titulo = String(JSON.parse(p.conteudo_json).title ?? '');
      const { results } = await db.prepare(
        `SELECT lower(user_email) AS email, user_name, acknowledged_at FROM policy_acknowledgments
          WHERE project_id = ? AND policy_type IN (?, ?) ORDER BY acknowledged_at DESC`
      ).bind(p.project_id, titulo, p.ref_id).all<any>();
      for (const r of results) if (!antigo.has(r.email)) antigo.set(r.email, { user_name: r.user_name, acknowledged_at: r.acknowledged_at, hash: null });
    }

    // Pendente de ciência sem link e sem conta não tem como responder (substituto sem envio configurado,
    // ou envio que falhou): o painel avisa para usar "Reenviar".
    const semLink = p.papel_exigido === 'ciente' && p.status === 'aberto'
      ? (await db.prepare(`SELECT COUNT(*) AS n FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'pendente' AND token_hash IS NULL AND user_id IS NULL`)
        .bind(p.id).first<{ n: number }>())?.n ?? 0
      : 0;

    const { conteudo_json: _conteudo, ...pedido } = p;
    return c.json({
      pedido,
      sem_link: semLink,
      destinatarios: dests.map((d) => ({
        ...d,
        situacao: d.status === 'pendente' ? (d.aberto_em ? 'pendente' : 'nao_abriu') : d.status,
        versao_anterior: anterior.get(d.email) ?? null,
        portal_antigo: antigo.get(d.email) ?? null,
      })),
    });
  } catch (e: any) {
    return erro500(c, 'Erro ao abrir o acompanhamento do pedido', e);
  }
});

/**
 * Lembrete só aos PENDENTES de um pedido de ciência aberto. Como só o hash fica no banco, lembrar é
 * emitir token novo: o link anterior da pessoa deixa de valer. Ciência gravada não é tocada (o
 * UPDATE exige `pendente`, e o trigger `pedido_dest_prova_imutavel` recusa de qualquer jeito).
 */
projectPedidosApp.post('/:id/reenviar', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const db = c.env.DB;
    const user = c.get('user');
    const p = await pedidoDoProjeto(db, c.req.param('projectId') ?? '', c.req.param('id'));
    if (!p) return c.json({ error: 'Pedido não encontrado' }, 404);
    if (!c.env.RESEND_API_KEY) return c.json(SEM_EMAIL, 503);
    if (p.papel_exigido !== 'ciente') return c.json({ error: 'Só pedido de ciência tem link por e-mail' }, 400);
    const valid = await validateBody(c, pedidoReenvioSchema);
    if (!valid.success) return valid.response;
    // Com `emails` (ex.: as `falhas` do envio), só esses ganham link novo: quem já recebeu mantém o seu.
    const so = valid.data.emails ? new Set(valid.data.emails.map((e) => e.trim().toLowerCase())) : null;
    const vig = await conferirEAvisar(c, p);
    if (!vig.vigente) {
      return c.json({ error: 'Este pedido não está mais aberto.', status: vig.status, substituido_por: vig.substituido_por ?? null }, 409);
    }
    const links = await emitirLinks(db, p.id, so);
    const falhas = await enviarLinks(c, p.titulo, links);
    await logAudit(db, 'pedido.lembrete', user.email,
      `Pedido ${p.id}: lembrete a ${links.length} pendente(s), ${falhas.length} falha(s) de envio`, '', c.req.header('CF-Connecting-IP') ?? '', p.project_id);
    return c.json({ enviados: links.length - falhas.length, falhas }); // sem `ok: true`: ver POST /ciencia
  } catch (e: any) {
    return erro500(c, 'Erro ao reenviar o pedido de ciência', e);
  }
});
