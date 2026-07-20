import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess } from '../helpers';

const risks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function riskLevel(score: number): string {
  if (score <= 5) return 'Low';
  if (score <= 12) return 'Medium';
  if (score <= 20) return 'High';
  return 'Critical';
}

risks.get('/api/v1/projects/:id/risks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title 
     FROM risks r 
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id 
     WHERE r.project_id = ? 
     ORDER BY r.impact * r.probability DESC`
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, risks: results });
});

risks.post('/api/v1/projects/:id/risks', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    await c.env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan, control_id, owner, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.asset_id ?? null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id ?? null,
      body.owner ?? null,
      body.accepted_by ?? null,
      body.accepted_at ?? null
    ).run();

    // Gravar no histórico de riscos (Cláusula 6.1.2)
    const histId = genId();
    await c.env.DB.prepare(
      `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(histId, id, projectId, impact, probability, level).run();

    // Trigger de Mitigação (PDCA)
    const treatment = body.treatment ?? 'Mitigate';
    if (treatment === 'Mitigate') {
      const taskName = `[TASK] Mitigar Risco: ${body.threat} (Ativo: ${body.asset})`;
      const existingTask = await c.env.DB.prepare(
        'SELECT id FROM evidence WHERE project_id = ? AND file_name = ?'
      ).bind(projectId, taskName).first();
      if (!existingTask) {
        await c.env.DB.prepare(
          `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
           VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
        ).bind(genId(), projectId, taskName).run();
      }
    }

    await logAudit(c.env.DB, 'risk.created', c.get('user')?.email ?? 'system', `Risk ${id} created for project ${projectId}`);
    return c.json({ ok: true, id, risk_level: level }, 201);
  } catch (e: any) {
    if (e.message?.includes('Forbidden')) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return c.json({ error: 'Falha ao criar risco', detail: e.message }, 500);
  }
});

risks.put('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const body = await c.req.json<any>();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    // Buscar o project_id para registrar no histórico
    const currentRisk = await c.env.DB.prepare('SELECT project_id FROM risks WHERE id = ?').bind(id).first() as any;
    const projectId = currentRisk?.project_id;

    await c.env.DB.prepare(
      `UPDATE risks SET asset_id=?, asset=?, threat=?, vulnerability=?, impact=?, probability=?, risk_level=?, treatment=?, treatment_plan=?, control_id=?, owner=?, status=?, accepted_by=?, accepted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      body.asset_id ?? null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id ?? null,
      body.owner ?? null,
      body.status ?? 'Open',
      body.accepted_by ?? null,
      body.accepted_at ?? null,
      id
    ).run();

    // Gravar no histórico sempre que houver atualização (Cláusula 6.1.2)
    if (projectId) {
      const histId = genId();
      await c.env.DB.prepare(
        `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(histId, id, projectId, impact, probability, level).run();

      // Trigger de Mitigação (PDCA)
      const treatment = body.treatment ?? 'Mitigate';
      if (treatment === 'Mitigate') {
        const taskName = `[TASK] Mitigar Risco: ${body.threat} (Ativo: ${body.asset})`;
        const existingTask = await c.env.DB.prepare(
          'SELECT id FROM evidence WHERE project_id = ? AND file_name = ?'
        ).bind(projectId, taskName).first();
        if (!existingTask) {
          await c.env.DB.prepare(
            `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
             VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
          ).bind(genId(), projectId, taskName).run();
        }
      }
    }

    return c.json({ ok: true, id, risk_level: level });
  } catch (e: any) {
    if (e.message?.includes('Forbidden')) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return c.json({ error: 'Falha ao atualizar risco', detail: e.message }, 500);
  }
});

risks.delete('/api/v1/risks/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
  await c.env.DB.prepare('DELETE FROM risks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

risks.get('/api/v1/projects/:id/risks/history', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT rh.*, r.asset, r.threat FROM risk_history rh JOIN risks r ON rh.risk_id = r.id WHERE rh.project_id = ? ORDER BY rh.assessment_date DESC'
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, history: results });
});

export default risks;
