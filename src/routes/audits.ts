import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess } from '../helpers';

export const auditsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectAuditsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Direct Audit operations (/api/v1/audits)
auditsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'audit_schedule', id, c.get('user'));
    const body = await c.req.json<any>();
    const completedAt = body.status === 'Completed' ? new Date().toISOString() : null;
    await c.env.DB.prepare(
      `UPDATE audit_schedule SET audit_type=?, title=?, scheduled_date=?, auditor_name=?, scope=?, status=?, findings_count=?, notes=?, completed_at=? WHERE id=?`
    ).bind(body.audit_type, body.title, body.scheduled_date, body.auditor_name, body.scope, body.status, body.findings_count || 0, body.notes || '', completedAt, id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'audit_updated', user?.email || 'system', `Audit ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar auditoria', detail: e.message }, 500);
  }
});

auditsApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'audit_schedule', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM audit_schedule WHERE id = ?').bind(id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'audit_deleted', user?.email || 'system', `Audit ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao excluir auditoria', detail: e.message }, 500);
  }
});

// Project Audit operations (/api/v1/projects/:projectId/audits)
projectAuditsApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM audit_schedule WHERE project_id = ? ORDER BY scheduled_date ASC').bind(projectId).all();
  return c.json({ ok: true, audits: result.results });
});

projectAuditsApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json<any>();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date, auditor_name, scope, status, findings_count, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', 0, ?, ?)`
    ).bind(id, projectId, body.audit_type, body.title, body.scheduled_date, body.auditor_name, body.scope, body.notes || '', now).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'audit_scheduled', user?.email || 'system', `Audit ${id} scheduled`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao agendar auditoria', detail: e.message }, 500);
  }
});
