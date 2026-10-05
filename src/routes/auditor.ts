import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess, erro500 } from '../helpers';
import { validateBody, auditorNoteSchema, auditorResponseSchema } from '../schemas';

export const auditorApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auditorApp.get('/auditor/:token/notes', async (c) => {
  try {
    const token = c.req.param('token');
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
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
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const v = await validateBody(c, auditorNoteSchema);
    if (!v.success) return v.response;
    const { control_id, note_type, content } = v.data as any;
    if (!content) return c.json({ error: 'content is required' }, 400);
    
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id, t.project_id, token, control_id || null, note_type || 'question', content
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

/**
 * Prova dos pedidos de aprovação/ciência do projeto do token (acesso de stakeholders, fatia 5): por
 * pedido, a versão congelada (conteúdo + SHA-256), o status e o substituto; por destinatário, quem,
 * quando, IP, user-agent, hash lido, canal, MFA e motivo. Somente GET. Nunca o hash do token do link
 * nem o prazo dele: autenticam a ciência por link e não são prova.
 */
/** Uma linha com conteúdo ilegível não derruba a prova inteira: vai o texto cru. */
function lerConteudo(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}

auditorApp.get('/auditor/:token/pedidos', async (c) => {
  try {
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")')
      .bind(c.req.param('token')).first<{ project_id: string }>();
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    const { results: pedidos } = await c.env.DB.prepare(
      `SELECT id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em
         FROM pedidos WHERE project_id = ? ORDER BY criado_em DESC, id LIMIT 500`
    ).bind(t.project_id).all<any>();
    const { results: dests } = await c.env.DB.prepare(
      `SELECT d.pedido_id, d.nome, d.email, d.status, d.decidido_em, d.aberto_em, d.canal, d.ip, d.user_agent, d.hash_lido, d.mfa_usado, d.motivo
         FROM pedido_destinatarios d JOIN pedidos p ON p.id = d.pedido_id WHERE p.project_id = ? ORDER BY d.email`
    ).bind(t.project_id).all<any>();
    return c.json({
      pedidos: pedidos.map(({ conteudo_json, ...p }) => ({
        ...p,
        conteudo: lerConteudo(conteudo_json),
        destinatarios: dests.filter((d) => d.pedido_id === p.id).map(({ pedido_id: _p, ...d }) => d),
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
    
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
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
