import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess, erro500, refForaDoProjeto, sha256Hex } from '../helpers';
import { validateBody, auditorNoteSchema, auditorResponseSchema } from '../schemas';

export const auditorApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export type TokenAuditor = { id: string; project_id: string; expires_at: string };

/**
 * O token do link do auditor externo, procurado pelo SHA-256 (o banco não guarda o token, migration
 * 0045). Vencido ou revogado não vale. `datetime(expires_at)` normaliza o formato: linha gravada em
 * ISO 8601 ('2026-11-06T12:00:00.000Z') comparada como texto com `datetime('now')`
 * ('2026-11-06 12:00:00') valia até o fim do dia, porque 'T' > ' '.
 */
export async function tokenDoAuditor(db: D1Database, token: string): Promise<TokenAuditor | null> {
  return db.prepare(
    `SELECT id, project_id, expires_at FROM auditor_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`
  ).bind(await sha256Hex(token)).first<TokenAuditor>();
}

auditorApp.get('/auditor/:token/notes', async (c) => {
  try {
    const token = c.req.param('token');
    const t = await tokenDoAuditor(c.env.DB, token);
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const notes = await c.env.DB.prepare(`
      SELECT n.*, cc.standard as control_standard, cc.title as control_title 
      FROM auditor_notes n
      LEFT JOIN compliance_controls cc ON n.control_id = cc.id
      WHERE n.project_id = ? 
      ORDER BY n.created_at DESC
    `).bind(t.project_id).all();
    return c.json({ ok: true, notes: notes.results || [] });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar notas', e);
  }
});

auditorApp.post('/auditor/:token/notes', async (c) => {
  try {
    const token = c.req.param('token');
    const t = await tokenDoAuditor(c.env.DB, token);
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const v = await validateBody(c, auditorNoteSchema);
    if (!v.success) return v.response;
    const { control_id, note_type, content } = v.data as any;
    if (!content) return c.json({ error: 'content is required' }, 400);
    const fora = await refForaDoProjeto(c.env.DB, t.project_id, { control_id }, ['control_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);

    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id, t.project_id, t.id, control_id || null, note_type || 'question', content
    ).run();
    
    await logAudit(c.env.DB, 'auditor_note.created', 'auditor', `Nota de auditor ${id} criada para o projeto ${t.project_id}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return erro500(c, 'Falha ao criar nota de auditor', e);
  }
});

auditorApp.put('/auditor-notes/:id/respond', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    // A nota carrega o projeto do auditor externo. Sem esta checagem, qualquer
    // sessão autenticada respondia a nota de qualquer cliente só com o id dela
    // — a sonda gravou uma resposta na nota do outro tenant e recebeu 200.
    await requireResourceAccess(c.env.DB, 'auditor_notes', id, user);
    const v = await validateBody(c, auditorResponseSchema);
    if (!v.success) return v.response;
    const { response } = v.data;
    if (!response) return c.json({ error: 'response is required' }, 400);
    
    await c.env.DB.prepare(`
      UPDATE auditor_notes 
      SET response = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(response, user.id, id).run();
    
    await logAudit(c.env.DB, 'auditor_note.responded', user.email, `Nota de auditor ${id} respondida`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao responder nota de auditor', e);
  }
});

auditorApp.get('/projects/:id/auditor-notes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const notes = await c.env.DB.prepare(`
      SELECT n.*, cc.standard as control_standard, cc.title as control_title 
      FROM auditor_notes n
      LEFT JOIN compliance_controls cc ON n.control_id = cc.id
      WHERE n.project_id = ? 
      ORDER BY n.created_at DESC
    `).bind(projectId).all();
    return c.json({ ok: true, notes: notes.results || [] });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar notas', e);
  }
});

/** Uma linha com conteúdo ilegível não derruba a prova inteira: vai o texto cru. */
function lerConteudo(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}

const PEDIDOS_POR_PAGINA = 500;

/**
 * Prova dos pedidos de aprovação/ciência do projeto do token (acesso de stakeholders, fatia 5): por
 * pedido, a versão congelada (conteúdo + SHA-256), o status e o substituto; por destinatário, quem,
 * quando, IP, user-agent, hash lido, canal, MFA e motivo. Somente GET. Nunca o hash do token do link
 * nem o prazo dele: autenticam a ciência por link e não são prova. Paginado (`?pagina=N`, 500 por
 * página, do mais novo ao mais velho), com `total` e `truncado` para o corte nunca passar calado.
 */
auditorApp.get('/auditor/:token/pedidos', async (c) => {
  try {
    const t = await tokenDoAuditor(c.env.DB, c.req.param('token'));
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    const pagina = Number(c.req.query('pagina') ?? '1');
    if (!Number.isInteger(pagina) || pagina < 1) return c.json({ error: 'pagina deve ser um inteiro a partir de 1' }, 400);
    const db = c.env.DB;
    const offset = (pagina - 1) * PEDIDOS_POR_PAGINA;
    // Os destinatários saem só dos pedidos desta página (mesma subconsulta).
    const daPagina = `SELECT id FROM pedidos WHERE project_id = ?1 ORDER BY criado_em DESC, id DESC LIMIT ${PEDIDOS_POR_PAGINA} OFFSET ?2`;
    const [total, pedidos, dests] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE project_id = ?').bind(t.project_id).first<number>('n'),
      db.prepare(
        `SELECT id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em
           FROM pedidos WHERE id IN (${daPagina}) ORDER BY criado_em DESC, id DESC`
      ).bind(t.project_id, offset).all<any>(),
      db.prepare(
        `SELECT pedido_id, nome, email, status, decidido_em, aberto_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo
           FROM pedido_destinatarios WHERE pedido_id IN (${daPagina}) ORDER BY email`
      ).bind(t.project_id, offset).all<any>(),
    ]);
    const porPedido = new Map<string, unknown[]>();
    for (const { pedido_id, ...d } of dests.results) porPedido.set(pedido_id, [...(porPedido.get(pedido_id) ?? []), d]);
    return c.json({
      total: total ?? 0, pagina, por_pagina: PEDIDOS_POR_PAGINA,
      truncado: offset + pedidos.results.length < (total ?? 0),
      pedidos: pedidos.results.map(({ conteudo_json, ...p }) => ({
        ...p, conteudo: lerConteudo(conteudo_json), destinatarios: porPedido.get(p.id) ?? [],
      })),
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar a prova dos pedidos', e);
  }
});

auditorApp.get('/auditor/:token/evidence/:evidenceId/download', async (c) => {
  try {
    const token = c.req.param('token');
    const evidenceId = c.req.param('evidenceId');
    
    const t = await tokenDoAuditor(c.env.DB, token);
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND project_id = ?').bind(evidenceId, t.project_id).first() as any;
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidence not found' }, 404);
    
    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'File not found in storage' }, 404);
    
    return new Response(obj.body, { 
      headers: { 
        'Content-Type': ev.file_type || 'application/octet-stream', 
        'Content-Disposition': `attachment; filename="${ev.file_name || 'evidence'}"` 
      } 
    });
  } catch (e: any) {
    return erro500(c, 'Falha no download', e);
  }
});
