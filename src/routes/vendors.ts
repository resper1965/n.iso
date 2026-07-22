import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, logAudit, requireResourceAccess } from '../helpers';

export const vendorsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectVendorsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


function calculateTrustScore(body: any): number {
  let score = 0;
  if (body.has_iso27001) score += 20;
  if (body.has_iso27701) score += 15;
  if (body.has_soc2) score += 15;
  if (body.has_mfa) score += 10;
  if (body.has_encryption) score += 15;
  if (body.has_backup) score += 10;
  if (body.has_incident_plan) score += 10;
  if (body.has_pentest) score += 10;
  if (body.trust_center_url && body.trust_center_url.trim().length > 0) score += 5;
  if (body.dpa_signed || (body.dpa_url && body.dpa_url.trim().length > 0)) score += 10;
  return Math.min(100, score);
}

function diligenceLevel(trustScore: number): string {
  if (trustScore > 90) return 'Low';
  if (trustScore > 60) return 'Medium';
  return 'High';
}

// ─── Direct Vendor Operations (/api/v1/vendors) ────────────────────────────

vendorsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'vendors', id, c.get('user'));
    const body = await c.req.json<any>();
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);

    await c.env.DB.prepare(
      `UPDATE vendors SET name=?, category=?, has_iso27001=?, has_iso27701=?, has_soc2=?, trust_score=?, diligence_level=?, dpa_signed=?, notes=?, status=?, has_mfa=?, has_encryption=?, has_backup=?, has_incident_plan=?, has_pentest=?, trust_center_url=?, dpa_url=?, attached_certifications=? WHERE id=?`
    ).bind(
      body.name, body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0, body.notes ?? null, body.status ?? 'Active',
      body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null,
      id
    ).run();

    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar vendor', detail: e.message }, 500);
  }

});

vendorsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'vendors', id, c.get('user'));
  await c.env.DB.prepare('DELETE FROM vendors WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── Project Vendor Operations (/api/v1/projects/:projectId/vendors) ──────

projectVendorsApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM vendors WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, vendors: results });
});

projectVendorsApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json<any>();
    const id = genId();
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);

    await c.env.DB.prepare(
      `INSERT INTO vendors (id, project_id, name, category, has_iso27001, has_iso27701, has_soc2, trust_score, diligence_level, dpa_signed, notes, has_mfa, has_encryption, has_backup, has_incident_plan, has_pentest, trust_center_url, dpa_url, attached_certifications)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, projectId, body.name, body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0, body.notes ?? null,
      body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null
    ).run();

    await logAudit(c.env.DB, 'vendor.created', c.get('user')?.email ?? 'system', `Vendor ${body.name} created for project ${projectId}`);
    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar vendor', detail: e.message }, 500);
  }
});
