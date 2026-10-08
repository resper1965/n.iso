// Portal do auditor externo (P5 da fatia de jornada). Sem sessão, na internet: a credencial é o
// token do link, que chega no CORPO (nunca no caminho nem na query, que vão para o log de
// requisição) e é procurado pelo SHA-256 em auditor_tokens.token_hash (tokenDoAuditor). Token
// desconhecido, vencido ou revogado: o MESMO 404. Tudo preso ao projeto do token. Só leitura,
// exceto a nota do auditor. Montado antes do authMiddleware (index.ts).
import { Hono } from 'hono';
import type { Bindings } from '../index';
import { rateLimitD1, erro500, logAudit, refForaDoProjeto, genId } from '../helpers';
import { validateBody, auditorPortalSchema, auditorEvidenciaSchema, auditorPedidosSchema, auditorNotaPortalSchema } from '../schemas';
import { NA_STATUS } from '../services/soa-logic';
import { tokenDoAuditor } from './auditor';

export const publicAuditorApp = new Hono<{ Bindings: Bindings }>();

const INVALIDO = { error: 'Link inválido ou expirado' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
// Teto largo: o auditor abre a SoA e baixa dezenas de evidências seguidas. Contra adivinhar token
// quem segura é o espaço de 256 bits; o limite só corta abuso em volume. Antes de ler o corpo.
const MAX_POR_IP = 600;

publicAuditorApp.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'sem-ip';
  if (!(await rateLimitD1(c.env.DB, `auditor-publico:ip:${ip}`, MAX_POR_IP, JANELA_SEG))) {
    return c.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
  }
  await next();
});

type Controle = { id: string; standard: string; title: string; status: string | null; maturity: number | null; description: string | null };
// A revisão é a assinatura do Líder SGSI (quem e quando); IP e user-agent dela não saem.
type Evidencia = {
  id: string; control_id: string | null; file_name: string; file_type: string | null; file_size: number | null; file_hash: string;
  evaluation_status: string | null; ciso_approved_by: string | null; ciso_approved_at: string | null; created_at: string;
};
type EvidenciaPortal = Omit<Evidencia, 'control_id'>;

/**
 * Projeto, SoA (27001 e 27701, uma linha por controle) e, por controle, as evidências ligadas.
 * Evidência sem controle do projeto (inclusive a ligada por dado legado a controle de outro projeto)
 * vai à parte, sem o `control_id`.
 */
publicAuditorApp.post('/ver', async (c) => {
  try {
    const v = await validateBody(c, auditorPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const db = c.env.DB;
    const [projeto, controles, evidencias] = await Promise.all([
      db.prepare('SELECT client_name, project_name, scope, standards, org_role FROM projects WHERE id = ?').bind(t.project_id).first(),
      db.prepare('SELECT id, standard, title, status, maturity, description FROM compliance_controls WHERE project_id = ?').bind(t.project_id).all<Controle>(),
      db.prepare(
        `SELECT id, control_id, file_name, file_type, file_size, file_hash, evaluation_status, ciso_approved_by, ciso_approved_at, created_at
           FROM evidence WHERE project_id = ? ORDER BY created_at, id`
      ).bind(t.project_id).all<Evidencia>(),
    ]);
    const porControle = new Map<string, EvidenciaPortal[]>(controles.results.map((ct) => [ct.id, []]));
    const semControle: EvidenciaPortal[] = [];
    for (const { control_id, ...e } of evidencias.results) {
      const lista = control_id ? porControle.get(control_id) : undefined;
      (lista ?? semControle).push(e);
    }
    return c.json({
      projeto,
      expira_em: t.expires_at,
      controles: controles.results.map(({ description, ...ct }) => ({
        ...ct,
        aplicavel: ct.status !== NA_STATUS,
        // A descrição só sai como justificativa da exclusão: é onde a SoA a guarda (soa-logic.ts).
        justificativa_exclusao: ct.status === NA_STATUS ? description : null,
        evidencias: porControle.get(ct.id) ?? [],
      })),
      evidencias_sem_controle: semControle,
    });
  } catch (e) {
    return erro500(c, 'Falha ao abrir o portal do auditor', e);
  }
});

/** Nome para `Content-Disposition` (RFC 5987): só ASCII; aspas e não-Latin-1 iam cortar ou derrubar o cabeçalho. */
function nomeCodificado(nome: string): string {
  return encodeURIComponent(nome).replace(/['()*!]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

/** Arquivo de uma evidência do projeto do token. Cada download entra na trilha do projeto. */
publicAuditorApp.post('/evidencia', async (c) => {
  try {
    const v = await validateBody(c, auditorEvidenciaSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const ev = await c.env.DB.prepare('SELECT id, file_name, file_type, r2_key FROM evidence WHERE id = ? AND project_id = ?')
      .bind(v.data.evidence_id, t.project_id).first<{ id: string; file_name: string; file_type: string | null; r2_key: string }>();
    const obj = ev ? await c.env.STORAGE.get(ev.r2_key) : null;
    if (!ev || !obj) return c.json({ error: 'Evidência não encontrada' }, 404);
    await logAudit(c.env.DB, 'auditor.evidence_downloaded', `auditor:${t.id}`, `Evidência ${ev.id} baixada pelo portal do auditor`, '', c.req.header('CF-Connecting-IP') ?? '', t.project_id);
    const nome = nomeCodificado(ev.file_name || 'evidencia');
    return new Response(obj.body, {
      headers: {
        'Content-Type': ev.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${nome}"; filename*=UTF-8''${nome}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return erro500(c, 'Falha no download da evidência', e);
  }
});

const PEDIDOS_POR_PAGINA = 500;

/** Uma linha com conteúdo ilegível não derruba a prova inteira: vai o texto cru. */
function lerConteudo(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}

type PedidoProva = {
  id: string; tipo: string; ref_id: string; titulo: string; papel_exigido: string; conteudo_json: string;
  hash: string; status: string; substituido_por: string | null; criado_por: string; criado_em: string;
};
type DestProva = {
  pedido_id: string; nome: string | null; email: string; status: string; decidido_em: string | null; aberto_em: string | null;
  canal: string | null; ip: string | null; user_agent: string | null; hash_lido: string | null; mfa_usado: number | null; motivo: string | null;
};

/**
 * Prova dos pedidos de aprovação/ciência do projeto do token (acesso de stakeholders, fatia 5): por
 * pedido, a versão congelada (conteúdo + SHA-256), o status e o substituto; por destinatário, quem,
 * quando, IP, user-agent, hash lido, canal, MFA e motivo. Só lê. Nunca o hash do token do link nem
 * o prazo dele: autenticam a ciência por link e não são prova. Paginado (`pagina`, 500 por página,
 * do mais novo ao mais velho), com `total` e `truncado` para o corte nunca passar calado.
 */
publicAuditorApp.post('/pedidos', async (c) => {
  try {
    const v = await validateBody(c, auditorPedidosSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const pagina = v.data.pagina ?? 1;
    const db = c.env.DB;
    const offset = (pagina - 1) * PEDIDOS_POR_PAGINA;
    // Os destinatários saem só dos pedidos desta página (mesma subconsulta).
    const daPagina = `SELECT id FROM pedidos WHERE project_id = ?1 ORDER BY criado_em DESC, id DESC LIMIT ${PEDIDOS_POR_PAGINA} OFFSET ?2`;
    const [total, pedidos, dests] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE project_id = ?').bind(t.project_id).first<number>('n'),
      db.prepare(
        `SELECT id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em
           FROM pedidos WHERE id IN (${daPagina}) ORDER BY criado_em DESC, id DESC`
      ).bind(t.project_id, offset).all<PedidoProva>(),
      db.prepare(
        `SELECT pedido_id, nome, email, status, decidido_em, aberto_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo
           FROM pedido_destinatarios WHERE pedido_id IN (${daPagina}) ORDER BY email`
      ).bind(t.project_id, offset).all<DestProva>(),
    ]);
    const porPedido = new Map<string, Omit<DestProva, 'pedido_id'>[]>();
    for (const { pedido_id, ...d } of dests.results) porPedido.set(pedido_id, [...(porPedido.get(pedido_id) ?? []), d]);
    return c.json({
      total: total ?? 0, pagina, por_pagina: PEDIDOS_POR_PAGINA,
      truncado: offset + pedidos.results.length < (total ?? 0),
      pedidos: pedidos.results.map(({ conteudo_json, ...p }) => ({
        ...p, conteudo: lerConteudo(conteudo_json), destinatarios: porPedido.get(p.id) ?? [],
      })),
    });
  } catch (e) {
    return erro500(c, 'Falha ao buscar a prova dos pedidos', e);
  }
});

type NotaPortal = {
  id: string; control_id: string | null; control_title: string | null; note_type: string; content: string;
  response: string | null; responded_at: string | null; created_at: string;
};

/** Notas do auditor no projeto do token, com a resposta da consultoria quando houver. */
publicAuditorApp.post('/notas', async (c) => {
  try {
    const v = await validateBody(c, auditorPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT n.id, n.control_id, cc.title AS control_title, n.note_type, n.content, n.response, n.responded_at, n.created_at
         FROM auditor_notes n
         LEFT JOIN compliance_controls cc ON cc.id = n.control_id AND cc.project_id = n.project_id
        WHERE n.project_id = ? ORDER BY n.created_at DESC`
    ).bind(t.project_id).all<NotaPortal>();
    return c.json({ notas: results });
  } catch (e) {
    return erro500(c, 'Falha ao buscar notas', e);
  }
});

/** Pergunta do auditor. Grava o id do token, nunca o token; o controle tem de ser do projeto. */
publicAuditorApp.post('/notas/criar', async (c) => {
  try {
    const v = await validateBody(c, auditorNotaPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const { control_id, note_type, content } = v.data;
    const fora = await refForaDoProjeto(c.env.DB, t.project_id, { control_id }, ['control_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, t.project_id, t.id, control_id || null, note_type || 'question', content).run();
    await logAudit(c.env.DB, 'auditor_note.created', `auditor:${t.id}`, `Nota de auditor ${id} criada`, '', '', t.project_id);
    return c.json({ ok: true, id });
  } catch (e) {
    return erro500(c, 'Falha ao criar nota de auditor', e);
  }
});
