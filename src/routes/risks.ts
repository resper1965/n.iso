import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, erro500, ForbiddenError, controleEhDoProjeto } from '../helpers';
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
    // `AND cc.project_id = r.project_id` no ON: o `WHERE` escopa o RISCO, e o
    // JOIN trazia título e norma do controle de qualquer projeto quando
    // `control_id` apontava para fora. Sem predicado de projeto no JOIN, a
    // linha que o operador possui desreferencia conteúdo que ele não possui.
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title
     FROM risks r
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id AND cc.project_id = r.project_id
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

    // Aterramento de tenant, igual ao do upload de evidência: `control_id` entra
    // cru do corpo e é desreferenciado depois a partir do risco. Recusar aqui é
    // o que impede a linha cruzada de existir.
    if (body.control_id && !(await controleEhDoProjeto(c.env.DB, body.control_id, projectId))) {
      return c.json({ ok: false, error: 'Forbidden: controle pertence a outro projeto' }, 403);
    }

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

    // Mesma conferência do `POST`: `requireResourceAccess` acima validou o
    // RISCO, nunca o controle que o corpo manda gravar nele.
    if (body.control_id && !(await controleEhDoProjeto(c.env.DB, body.control_id, projectId ?? ''))) {
      return c.json({ ok: false, error: 'Forbidden: controle pertence a outro projeto' }, 403);
    }

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
