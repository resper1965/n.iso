import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, erro500, ForbiddenError, refForaDoProjeto } from '../helpers';
import { validateBody, createRiskSchema, riskUpdateSchema } from '../schemas';

const risks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function riskLevel(score: number): string {
  if (score <= 5) return 'Low';
  if (score <= 12) return 'Medium';
  if (score <= 20) return 'High';
  return 'Critical';
}

risks.get('/api/v1/projects/:projectId/risks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title, pa.nome as owner_parte_nome
     FROM risks r 
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id AND cc.project_id = r.project_id
     LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
     WHERE r.project_id = ? 
     ORDER BY r.impact * r.probability DESC`
  ).bind(c.req.param('projectId')).all();
  return c.json({ ok: true, risks: results });
});

risks.post('/api/v1/projects/:projectId/risks', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, createRiskSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['control_id', 'asset_id', 'owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    const id = genId();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    await c.env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan, control_id, owner, owner_parte_id, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.asset_id || null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id || null,
      body.owner ?? null,
      body.owner_parte_id || null,
      body.accepted_by ?? null,
      body.accepted_at ?? null
    ).run();

    // Gravar no histórico de riscos (Cláusula 6.1.2)
    const histId = genId();
    await c.env.DB.prepare(
      `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(histId, id, projectId, impact, probability, level).run();

    await logAudit(c.env.DB, 'risk.created', c.get('user')?.email ?? 'system', `Risk ${id} created for project ${projectId}`);
    return c.json({ ok: true, id, risk_level: level }, 201);
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return erro500(c, 'Falha ao criar risco', e);
  }
});

risks.put('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const v = await validateBody(c, riskUpdateSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    // Buscar o project_id para registrar no histórico
    const currentRisk = await c.env.DB.prepare('SELECT project_id FROM risks WHERE id = ?').bind(id).first() as any;
    const projectId = currentRisk?.project_id;
    // O projeto vem do risco gravado, nunca do corpo.
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['control_id', 'asset_id', 'owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);

    await c.env.DB.prepare(
      `UPDATE risks SET asset_id=?, asset=?, threat=?, vulnerability=?, impact=?, probability=?, risk_level=?, treatment=?, treatment_plan=?, control_id=?, owner=?, owner_parte_id=CASE WHEN ? THEN ? ELSE owner_parte_id END, status=?, accepted_by=?, accepted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      body.asset_id || null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id || null,
      body.owner ?? null,
      body.owner_parte_id === undefined ? 0 : 1, // ausente mantém a parte; null desliga
      body.owner_parte_id || null,
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
    }

    return c.json({ ok: true, id, risk_level: level });
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return erro500(c, 'Falha ao atualizar risco', e);
  }
});

risks.delete('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM risks WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    if (e instanceof ForbiddenError) return c.json({ ok: false, error: e.message }, 403);
    return erro500(c, 'Falha ao excluir risco', e);
  }
});

risks.get('/api/v1/projects/:projectId/risks/history', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT rh.*, r.asset, r.threat FROM risk_history rh JOIN risks r ON rh.risk_id = r.id WHERE rh.project_id = ? ORDER BY rh.assessment_date DESC'
  ).bind(c.req.param('projectId')).all();
  return c.json({ ok: true, history: results });
});

export default risks;
