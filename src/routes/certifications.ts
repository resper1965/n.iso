import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess } from '../helpers';

export const certificationsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectCertificationsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Direct Certification operations (/api/v1/certification)
certificationsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'certification_tracking', id, c.get('user'));
    const user = c.get('user');
    const body = await c.req.json<any>();
    const existing = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first() as any;
    if (!existing) return c.json({ error: 'Certification record not found' }, 404);
    await c.env.DB.prepare(
      `UPDATE certification_tracking SET standard=?, stage=?, target_date=?, stage1_date=?, stage1_status=?, stage2_date=?, stage2_status=?, certificate_number=?, certificate_expiry=?, registrar=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      body.standard ?? existing.standard, body.stage ?? existing.stage, body.target_date ?? existing.target_date,
      body.stage1_date ?? existing.stage1_date, body.stage1_status ?? existing.stage1_status,
      body.stage2_date ?? existing.stage2_date, body.stage2_status ?? existing.stage2_status,
      body.certificate_number ?? existing.certificate_number, body.certificate_expiry ?? existing.certificate_expiry,
      body.registrar ?? existing.registrar, body.notes ?? existing.notes, id
    ).run();
    await logAudit(c.env.DB, 'certification.updated', user?.email || 'system', `Updated certification ${id}: stage=${body.stage || existing.stage}`);
    const updated = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first();
    return c.json({ ok: true, certification: updated });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar certificação', detail: e.message }, 500);
  }
});

// Project Certification operations (/api/v1/projects/:projectId/certification)
projectCertificationsApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
  if (!result) return c.json({ ok: true, certification: null });
  return c.json({ ok: true, certification: result });
});

projectCertificationsApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const user = c.get('user');
    const body = await c.req.json<any>();
    const existing = await c.env.DB.prepare('SELECT id FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE certification_tracking SET standard=?, stage=?, target_date=?, stage1_date=?, stage1_status=?, stage2_date=?, stage2_status=?, certificate_number=?, certificate_expiry=?, registrar=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE project_id=?`
      ).bind(
        body.standard || 'ISO 27001:2022', body.stage || 'Gap Assessment', body.target_date || null,
        body.stage1_date || null, body.stage1_status || 'Pending', body.stage2_date || null, body.stage2_status || 'Pending',
        body.certificate_number || null, body.certificate_expiry || null, body.registrar || null, body.notes || null, projectId
      ).run();
      await logAudit(c.env.DB, 'certification.updated', user?.email || 'system', `Updated certification for project ${projectId}`);
      const updated = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
      return c.json({ ok: true, certification: updated });
    }
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO certification_tracking (id, project_id, standard, stage, target_date, stage1_date, stage1_status, stage2_date, stage2_status, certificate_number, certificate_expiry, registrar, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, projectId, body.standard || 'ISO 27001:2022', body.stage || 'Gap Assessment', body.target_date || null,
      body.stage1_date || null, body.stage1_status || 'Pending', body.stage2_date || null, body.stage2_status || 'Pending',
      body.certificate_number || null, body.certificate_expiry || null, body.registrar || null, body.notes || null
    ).run();
    await logAudit(c.env.DB, 'certification.created', user?.email || 'system', `Created certification tracker for project ${projectId}`);
    const created = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first();
    return c.json({ ok: true, certification: created }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar certificação', detail: e.message }, 500);
  }
});
