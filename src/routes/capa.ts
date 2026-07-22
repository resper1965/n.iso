import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess } from '../helpers';

export const capaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectCapaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Direct CAPA operations (/api/v1/capa)
capaApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'corrective_actions', id, c.get('user'));
    const body = await c.req.json<any>();
    const completedAt = body.status === 'Closed' ? new Date().toISOString() : null;
    await c.env.DB.prepare(
      `UPDATE corrective_actions SET audit_id=?, risk_id=?, control_id=?, title=?, description=?, severity=?, assigned_to=?, due_date=?, status=?, resolution=?, completed_at=? WHERE id=?`
    ).bind(body.audit_id || null, body.risk_id || null, body.control_id || null, body.title, body.description, body.severity, body.assigned_to, body.due_date, body.status, body.resolution || null, completedAt, id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'capa_updated', user?.email || 'system', `CAPA ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar CAPA', detail: e.message }, 500);
  }
});

capaApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'corrective_actions', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM corrective_actions WHERE id = ?').bind(id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'capa_deleted', user?.email || 'system', `CAPA ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao excluir CAPA', detail: e.message }, 500);
  }
});

// Project CAPA operations (/api/v1/projects/:projectId/capa)
projectCapaApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM corrective_actions WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, actions: result.results });
});

projectCapaApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json<any>();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO corrective_actions (id, project_id, audit_id, risk_id, control_id, title, description, severity, assigned_to, due_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`
    ).bind(id, projectId, body.audit_id || null, body.risk_id || null, body.control_id || null, body.title, body.description, body.severity, body.assigned_to, body.due_date, now).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'capa_created', user?.email || 'system', `CAPA ${id} created`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar CAPA', detail: e.message }, 500);
  }
});
