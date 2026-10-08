import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess, erro500, sha256Hex } from '../helpers';
import { validateBody, auditorResponseSchema } from '../schemas';

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
