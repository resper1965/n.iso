import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, logAudit, requireResourceAccess } from '../helpers';

export const trainingApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectTrainingApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// ─── Direct Training Operations (/api/v1/training) ──────────────────────────

trainingApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'training_records', id, c.get('user'));
    const body = await c.req.json<any>();

    await c.env.DB.prepare(
      `UPDATE training_records SET employee_name=?, training_name=?, completion_date=?, score=?, status=?, evidence_file=? WHERE id=?`
    ).bind(body.employee_name, body.training_name, body.completion_date ?? null, body.score ?? null, body.status ?? 'Pending', body.evidence_file ?? null, id).run();

    return c.json({ ok: true, id });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar treinamento', detail: e.message }, 500);
  }

});

trainingApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'training_records', id, c.get('user'));
  await c.env.DB.prepare('DELETE FROM training_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── Project Training Operations (/api/v1/projects/:projectId/training) ────

projectTrainingApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM training_records WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, records: results });
});

projectTrainingApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json<any>();
    const id = genId();

    await c.env.DB.prepare(
      `INSERT INTO training_records (id, project_id, employee_name, training_name, completion_date, score, status, evidence_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, body.employee_name, body.training_name, body.completion_date ?? null, body.score ?? null, body.status ?? 'Pending', body.evidence_file ?? null).run();

    await logAudit(c.env.DB, 'training.created', c.get('user')?.email ?? 'system', `Training record ${id} created for project ${projectId}`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar registro de treinamento', detail: e.message }, 500);
  }
});

projectTrainingApp.get('/summary', async (c) => {
  const projectId = c.req.param('projectId');
  const { results } = await c.env.DB.prepare(
    'SELECT status FROM training_records WHERE project_id = ?'
  ).bind(projectId).all<{ status: string }>();

  const total = results.length;
  const completed = results.filter(r => r.status === 'Completed').length;
  const pending = total - completed;
  const coverage = total ? +(completed / total * 100).toFixed(1) : 0;

  return c.json({
    ok: true,
    total,
    completed,
    pending,
    coverage_percent: coverage,
    compliance_status: coverage >= 80 ? 'Compliant' : 'Non-Compliant',
  });
});

projectTrainingApp.post('/import-external', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const { records } = await c.req.json<{
      records: Array<{
        employee_name: string;
        training_name: string;
        completion_date?: string;
        score?: number;
        status?: string;
      }>;
    }>();

    if (!Array.isArray(records) || records.length === 0) {
      return c.json({ error: 'Nenhum registro fornecido' }, 400);
    }

    const batch = records.map(r =>
      c.env.DB.prepare(
        `INSERT INTO training_records (id, project_id, employee_name, training_name, completion_date, score, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        genId(),
        projectId,
        r.employee_name,
        r.training_name,
        r.completion_date || null,
        r.score ?? null,
        r.status || 'Completed'
      )
    );

    await c.env.DB.batch(batch);
    await logAudit(c.env.DB, 'training.imported_external', c.get('user')?.email ?? 'system', `Importados ${records.length} registros de treinamento para o projeto ${projectId}`);

    return c.json({ ok: true, imported: records.length }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
