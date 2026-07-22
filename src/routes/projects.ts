import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, logAudit, requireResourceAccess, verifyPassword } from '../helpers';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';
import { MigrationService } from '../services/migration-service';

export const projectsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const controlsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


async function seedPhasesLocal(db: D1Database, projectId: string) {
  const phaseStmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, '', datetime('now'))`
  );
  const batch: any[] = [];
  PHASE_TITLES.forEach((title, i) => {
    const status = i === 0 ? 'in_progress' : 'pending';
    batch.push(phaseStmt.bind(genId(), projectId, i, title, status));
  });
  await db.batch(batch);
}

// ─── Projects CRUD ──────────────────────────────────────────────────────────

projectsApp.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      project_name?: string;
      client_name: string;
      sector?: string;
      scope?: string;
      standards?: string;
      org_role?: string;
    }>();

    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).bind(
      id,
      body.project_name ?? '',
      body.client_name,
      body.sector ?? '',
      body.scope ?? '',
      body.standards ?? 'ISO 27001',
      body.org_role ?? ''
    ).run();

    await seedPhasesLocal(c.env.DB, id);
    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${id} criado para ${body.client_name}`);

    return c.json({ id, project_name: body.project_name, client_name: body.client_name, status: 'active' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar projeto', detail: e.message }, 500);
  }
});

projectsApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (!user.client_project_id) {
        return c.json([]);
      }
      const project = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      ).bind(user.client_project_id).first();
      return c.json(project ? [project] : []);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar projetos', detail: e.message }, 500);
  }
});

projectsApp.get('/dashboard/stats', async (c) => {
  try {
    const user = c.get('user');
    const isClient = user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client');
    const projectId = isClient ? user.client_project_id : null;
    
    const whereResource = projectId ? 'WHERE project_id = ?' : '';
    const whereProject = projectId ? 'WHERE id = ?' : '';
    const params = projectId ? [projectId] : [];

    const stats: any = await c.env.DB.batch([
      c.env.DB.prepare('SELECT count(*) as count FROM leads'),
      c.env.DB.prepare(`SELECT count(*) as count FROM projects ${whereProject}`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM compliance_controls ${whereResource} ${whereResource ? "AND" : "WHERE"} status = 'Completed'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM evidence ${whereResource} ${whereResource ? "AND" : "WHERE"} evaluation_status = 'pending'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM risks ${whereResource} ${whereResource ? "AND" : "WHERE"} impact * probability >= 15`).bind(...params)
    ]);

    return c.json({
      leads: stats[0].results?.[0]?.count || 0,
      projects: stats[1].results?.[0]?.count || 0,
      controls_done: stats[2].results?.[0]?.count || 0,
      pending_evidence: stats[3].results?.[0]?.count || 0,
      critical_risks: stats[4].results?.[0]?.count || 0
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao carregar estatísticas', detail: e.message }, 500);
  }
});

projectsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (user.client_project_id && user.client_project_id !== id) {
      return c.json({ error: 'Forbidden: No access to this project' }, 403);
    }
  }
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

projectsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== id)) {
        return c.json({ error: 'Forbidden: Cannot edit this project' }, 403);
      }
    }
    const body = await c.req.json<{
      status?: string;
      project_name?: string;
      repository_url?: string;
      repository_token?: string;
    }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.project_name !== undefined) { updates.push('project_name = ?'); values.push(body.project_name); }
    if (body.repository_url !== undefined) { updates.push('repository_url = ?'); values.push(body.repository_url); }
    if (body.repository_token !== undefined) { updates.push('repository_token = ?'); values.push(body.repository_token); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'project.updated', user?.email ?? 'system', `Projeto ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Controls inside Project
projectsApp.get('/:id/controls', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (user.client_project_id && user.client_project_id !== projectId) {
      return c.json({ error: 'Forbidden: Access denied to controls of another project' }, 403);
    }
  }
  const result = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ? ORDER BY id ASC').bind(projectId).all();
  return c.json({ ok: true, controls: result.results });
});

// Phases inside Project
projectsApp.get('/:id/phases', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(projectId).all();
  return c.json({ ok: true, phases: result.results });
});

projectsApp.put('/:id/phases/:num', async (c) => {
  try {
    const projectId = c.req.param('id');
    const num = c.req.param('num');
    const { status, notes } = await c.req.json<{ status?: string; notes?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(projectId, num);
    await c.env.DB.prepare(`UPDATE project_phases SET ${updates.join(', ')} WHERE project_id = ? AND phase_number = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'phase.updated', c.get('user')?.email ?? 'system', `Fase ${num} do projeto ${projectId} atualizada`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Interviews inside Project
projectsApp.get('/:id/interviews/:track', async (c) => {
  const projectId = c.req.param('id');
  const track = c.req.param('track');
  const result = await c.env.DB.prepare('SELECT * FROM project_interviews WHERE project_id = ? AND track = ? ORDER BY id ASC').bind(projectId, track).all();
  return c.json({ ok: true, interviews: result.results });
});

projectsApp.post('/:id/interviews', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { answers } = await c.req.json<{ answers: Array<{ track: string; question: string; answer: string; interviewee?: string; gap_detected?: boolean; notes?: string }> }>();
    if (!answers || !Array.isArray(answers)) return c.json({ error: 'Array answers é obrigatório' }, 400);
    
    const stmt = c.env.DB.prepare(
      `INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const batch = answers.map(a => stmt.bind(genId(), projectId, a.track, a.question, a.answer, a.interviewee || null, a.gap_detected ? 1 : 0, a.notes || null));
    await c.env.DB.batch(batch);
    await logAudit(c.env.DB, 'interviews.saved', c.get('user')?.email ?? 'system', `Salvas ${answers.length} respostas de entrevista para projeto ${projectId}`);
    return c.json({ ok: true, count: answers.length });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar entrevistas', detail: e.message }, 500);
  }
});

projectsApp.get('/:id/interviews/summary', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT track, COUNT(*) as total, SUM(gap_detected) as gaps FROM project_interviews WHERE project_id = ? GROUP BY track'
  ).bind(projectId).all<{ track: string; total: number; gaps: number }>();
  return c.json({ ok: true, summary: results });
});

// Documents inside Project
projectsApp.get('/:id/documents', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM evidence WHERE project_id = ? AND r2_key LIKE "docs/%" ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, documents: results });
});

projectsApp.post('/:id/documents/upload', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    if (!file) return c.json({ error: 'No file provided' }, 400);

    const docId = genId();
    const r2Key = `docs/${projectId}/${docId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, project_id, file_name, file_size, file_type, r2_key, sha256_hash, evaluation_status, evaluation_notes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'conforme', 'Documento Interno do SGSI Controlado', ?, datetime('now'))`
    ).bind(docId, projectId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();

    await logAudit(c.env.DB, 'document.uploaded', user?.email || 'system', `Documento ${file.name} carregado para projeto ${projectId}`);
    return c.json({ ok: true, id: docId, sha256: realSha256 }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha no upload de documento', detail: e.message }, 500);
  }
});

projectsApp.put('/:id/documents/:docId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const docId = c.req.param('docId');
    const { file_name, evaluation_notes } = await c.req.json<{ file_name?: string; evaluation_notes?: string }>();

    const doc = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND project_id = ?').bind(docId, projectId).first();
    if (!doc) return c.json({ error: 'Document not found' }, 404);

    const updates: string[] = [];
    const values: any[] = [];
    if (file_name) { updates.push('file_name = ?'); values.push(file_name); }
    if (evaluation_notes !== undefined) { updates.push('evaluation_notes = ?'); values.push(evaluation_notes); }

    if (updates.length > 0) {
      values.push(docId, projectId);
      await c.env.DB.prepare(`UPDATE evidence SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`).bind(...values).run();
    }

    const user = c.get('user');
    await logAudit(c.env.DB, 'document.updated', user?.email || 'system', `Documento ${docId} atualizado no projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar documento', detail: e.message }, 500);
  }
});

// Assets inside Project
projectsApp.get('/:id/assets', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (user.client_project_id && user.client_project_id !== projectId) {
      return c.json({ error: 'Forbidden: Access denied to assets of another project' }, 403);
    }
  }
  const result = await c.env.DB.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, assets: result.results });
});

projectsApp.post('/:id/assets', async (c) => {
  try {
    const projectId = c.req.param('id');
    const user = c.get('user');
    if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
      return c.json({ error: 'Forbidden: Cannot create asset in this project' }, 403);
    }
    const body = await c.req.json<any>();
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO assets (id, project_id, name, type, category, owner, criticality, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, projectId, body.name, body.type, body.category || 'Hardware', body.owner || '', body.criticality || 'Medium', body.description || '').run();

    await logAudit(c.env.DB, 'asset.created', user?.email || 'system', `Asset ${id} created for project ${projectId}`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar ativo', detail: e.message }, 500);
  }
});

// Checklist progress inside Project
projectsApp.get('/:id/checklist-progress', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare(`
    SELECT cp.phase_number, cp.item_id, cp.is_checked, cp.checked_by, cp.checked_at, cp.evidence_id, cp.notes, cp.assigned_to, cp.due_date, ev.evaluation_status, ev.evaluation_notes
    FROM checklist_progress cp
    LEFT JOIN evidence ev ON cp.evidence_id = ev.id
    WHERE cp.project_id = ?
  `).bind(projectId).all();
  return c.json({ ok: true, progress: rows.results || [] });
});

// Scope changes inside Project
projectsApp.get('/:id/scope-changes', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM scope_changes WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

projectsApp.post('/:id/scope-changes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { change_description, reason, impact_analysis, requested_by } = await c.req.json();
    if (!change_description) return c.json({ error: 'change_description is required' }, 400);

    const changeId = genId();
    await c.env.DB.prepare(`
      INSERT INTO scope_changes (id, project_id, change_description, reason, impact_analysis, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `).bind(changeId, projectId, change_description, reason || null, impact_analysis || null, requested_by || c.get('user')?.email || 'system').run();

    await logAudit(c.env.DB, 'scope_change.created', c.get('user')?.email || 'system', `Solicitação de alteração de escopo ${changeId} criada para projeto ${projectId}`);
    return c.json({ ok: true, id: changeId });
  } catch (e: any) {
    return c.json({ error: 'Falha ao registrar alteração de escopo', detail: e.message }, 500);
  }
});

// Risk matrix inside Project
projectsApp.get('/:id/risk-matrix', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT risk_level, treatment, risk_score FROM risks WHERE project_id = ?'
  ).bind(c.req.param('id')).all<{ risk_level: string; treatment: string; risk_score: number }>();

  const byLevel: Record<string, number> = {};
  const byTreatment: Record<string, number> = {};
  let totalScore = 0;
  for (const r of results) {
    byLevel[r.risk_level] = (byLevel[r.risk_level] || 0) + 1;
    byTreatment[r.treatment] = (byTreatment[r.treatment] || 0) + 1;
    totalScore += r.risk_score;
  }

  return c.json({
    ok: true,
    total: results.length,
    by_level: byLevel,
    by_treatment: byTreatment,
    average_score: results.length ? +(totalScore / results.length).toFixed(1) : 0,
  });
});

// ISO 27701 Migrations inside Project
projectsApp.post('/:id/migrate-27701', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2013'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA(oldSoA);

    let created = 0;
    const { results: existing2022 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2022 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27001:2022', ?, 'Migrated from 2013 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701', c.get('user')?.email ?? 'system', `27701 migration (2013->2022): ${gaps.length} gaps, ${created} new controls, project ${projectId}`);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha na migração 27701', detail: e.message }, 500);
  }
});

projectsApp.post('/:id/migrate-27701-2025', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2019'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA27701(oldSoA);

    let created = 0;
    const { results: existing2025 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2025 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27701:2025', ?, 'Migrated from 2019 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701.2025', c.get('user')?.email ?? 'system', `27701:2025 migration: ${gaps.length} gaps, ${created} new controls, project ${projectId}`);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha na migração 27701:2025', detail: e.message }, 500);
  }
});

// Traceability inside Project
projectsApp.get('/:id/traceability', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  const controls = await db.prepare(
    `SELECT id, title, status FROM compliance_controls WHERE project_id = ?`
  ).bind(projectId).all();

  const rows = controls.results || [];
  const controlIds = rows.map((r: any) => r.id);

  if (controlIds.length === 0) return c.json({ ok: true, controls: [] });

  const placeholders = controlIds.map(() => '?').join(',');

  const risksResult = await db.prepare(
    `SELECT id, asset, threat, risk_level, control_id FROM risks WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const evidenceResult = await db.prepare(
    `SELECT id, file_name, created_at, control_id FROM evidence WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const risksMap: Record<string, any[]> = {};
  for (const r of (risksResult.results || []) as any[]) {
    (risksMap[r.control_id] ||= []).push({ id: r.id, asset: r.asset, threat: r.threat, risk_level: r.risk_level });
  }
  const evidenceMap: Record<string, any[]> = {};
  for (const e of (evidenceResult.results || []) as any[]) {
    (evidenceMap[e.control_id] ||= []).push({ id: e.id, file_name: e.file_name, created_at: e.created_at });
  }

  const linked = rows.map((ctrl: any) => ({
    id: ctrl.id,
    title: ctrl.title,
    status: ctrl.status,
    risks: risksMap[ctrl.id] || [],
    evidence: evidenceMap[ctrl.id] || [],
  }));

  return c.json({ ok: true, controls: linked });
});

// DPIA Assessments inside Project
projectsApp.get('/:id/dpia', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM dpia_assessments WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, assessments: result.results });
});

projectsApp.post('/:id/dpia', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, dpo_recommendations, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`
    ).bind(id, projectId, body.ropa_id || null, body.processing_name, body.data_category_risk, body.necessity_proportionality, body.technical_measures, body.residual_risk_level || 'Medium', body.dpo_recommendations || null, now).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'dpia_created', user?.email || 'system', `DPIA ${id} created`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar DPIA', detail: e.message }, 500);
  }
});

// Audit Pack & Audit Trail inside Project
projectsApp.get('/:id/audit-pack', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const [phases, controls, evidence, logs] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM evidence WHERE project_id = ?').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM audit_logs WHERE details LIKE ? ORDER BY created_at DESC LIMIT 100').bind(`%${projectId}%`).all()
    ]);

    return c.json({
      ok: true,
      pack: {
        project,
        phases: phases.results || [],
        controls: controls.results || [],
        evidence: evidence.results || [],
        audit_trail: logs.results || [],
        generated_at: new Date().toISOString()
      }
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar pacote de auditoria', detail: e.message }, 500);
  }
});

projectsApp.get('/:id/audit-trail', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs WHERE details LIKE ? OR details LIKE ? ORDER BY created_at DESC LIMIT 500`
  ).bind(`%${projectId}%`, `%${projectId.substring(0, 8)}%`).all();
  return c.json(results || []);
});

// Auditor Token inside Project
projectsApp.post('/:id/auditor-token', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ days_valid?: number }>();
    const days = body.days_valid ?? 30;
    const token = genId() + genId();
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, token, project_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(genId(), token, projectId, expiresAt).run();

    await logAudit(c.env.DB, 'auditor_token.created', c.get('user')?.email ?? 'system', `Auditor token created for project ${projectId}, valid ${days} days`);
    return c.json({ ok: true, token, expires_at: expiresAt }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar token de auditor', detail: e.message }, 500);
  }
});

// ─── Controls Sub-Router (/api/v1/controls) ─────────────────────────────────

controlsApp.get('/', async (c) => {
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (!user.client_project_id) {
      return c.json([]);
    }
    const { results } = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ? ORDER BY id ASC').bind(user.client_project_id).all();
    return c.json(results || []);
  }
  const { results } = await c.env.DB.prepare('SELECT * FROM compliance_controls ORDER BY id ASC').all();
  return c.json(results || []);
});

controlsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { status, title, description } = await c.req.json<{ status?: string; title?: string; description?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE compliance_controls SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'control.updated', c.get('user')?.email ?? 'system', `Controle ${id} atualizado`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

controlsApp.put('/:id/maturity', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const { maturity } = await c.req.json<{ maturity: number }>();
    
    if (maturity < 0 || maturity > 5) {
      return c.json({ error: 'Maturidade deve ser entre 0 e 5' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET maturity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(maturity, id).run();

    await logAudit(c.env.DB, 'control.maturity_updated', c.get('user')?.email || 'system', `Maturidade do controle ${id} atualizada para ${maturity}`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar maturidade', detail: e.message }, 500);
  }
});

controlsApp.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, id).run();

    await logAudit(c.env.DB, 'control.status_updated', c.get('user')?.email || 'system', `Status do controle ${id} atualizado para ${status}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar status do controle', detail: e.message }, 500);
  }
});

const handleControlApprove = async (c: any) => {
  try {
    const controlId = c.req.param('id');
    const { password, role, project_id } = (await c.req.json()) as any;
    const user = c.get('user');

    if (!password) {
      return c.json({ error: 'Senha é obrigatória para assinatura eletrônica' }, 400);
    }

    const dbUser = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first()) as any;

    if (!dbUser || !(await verifyPassword(password, dbUser.password_hash))) {
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    const targetProjectId = project_id || dbUser?.client_project_id;
    if (targetProjectId) {
      await c.env.DB.prepare(
        `UPDATE compliance_controls SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
      ).bind(controlId, targetProjectId).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE compliance_controls SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(controlId).run();
    }



    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';
    const approvedBy = dbUser.name || user.email;

    await logAudit(c.env.DB, 'control.approved', user.email, `Controle ${controlId} aprovado com assinatura por ${approvedBy} (IP: ${ip})`);
    return c.json({ ok: true, approved_by: approvedBy, approved_at: now });
  } catch (e: any) {
    return c.json({ error: 'Falha ao assinar controle', detail: e.message }, 500);
  }
};

controlsApp.post('/:id/approve', handleControlApprove);
controlsApp.put('/:id/approve', handleControlApprove);

