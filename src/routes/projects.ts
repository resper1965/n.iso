import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, genToken, logAudit, requireResourceAccess, verifyPassword, validateUpload } from '../helpers';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';
import { MigrationService } from '../services/migration-service';
import { seedPhases } from '../services/project-setup';
import { checkCoherence } from '../services/coherence';
import { validateBody, projectPhaseSchema, interviewSchema, evidenceMetaSchema, scopeChangeSchema, auditorTokenSchema, controlUpdateSchema, maturitySchema, statusSchema, assinaturaSchema } from '../schemas';

export const projectsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const controlsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


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

    await seedPhases(c.env.DB, id);
    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${id} criado para ${body.client_name}`, '', '', id);

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
    await logAudit(c.env.DB, 'project.updated', user?.email ?? 'system', `Projeto ${id} atualizado: ${updates.join(', ')}`, '', '', id);
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
    const v = await validateBody(c, projectPhaseSchema);
    if (!v.success) return v.response;
    const { status, notes } = v.data as any;
    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(projectId, num);
    await c.env.DB.prepare(`UPDATE project_phases SET ${updates.join(', ')} WHERE project_id = ? AND phase_number = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'phase.updated', c.get('user')?.email ?? 'system', `Fase ${num} do projeto ${projectId} atualizada`, '', '', projectId);
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
    const v = await validateBody(c, interviewSchema);
    if (!v.success) return v.response;
    const { answers } = v.data as any;
    
    const stmt = c.env.DB.prepare(
      `INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const batch = answers.map((a: any) => stmt.bind(genId(), projectId, a.track, a.question, a.answer, a.interviewee || null, a.gap_detected ? 1 : 0, a.notes || null));
    await c.env.DB.batch(batch);
    await logAudit(c.env.DB, 'interviews.saved', c.get('user')?.email ?? 'system', `Salvas ${answers.length} respostas de entrevista para projeto ${projectId}`, '', '', projectId);
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

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

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
      `INSERT INTO evidence (id, project_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, evaluation_notes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'conforme', 'Documento Interno do SGSI Controlado', ?, datetime('now'))`
    ).bind(docId, projectId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();

    await logAudit(c.env.DB, 'document.uploaded', user?.email || 'system', `Documento ${file.name} carregado para projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id: docId, sha256: realSha256 }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha no upload de documento', detail: e.message }, 500);
  }
});

projectsApp.put('/:id/documents/:docId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const docId = c.req.param('docId');
    const v = await validateBody(c, evidenceMetaSchema);
    if (!v.success) return v.response;
    const { file_name, evaluation_notes } = v.data as any;

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
    await logAudit(c.env.DB, 'document.updated', user?.email || 'system', `Documento ${docId} atualizado no projeto ${projectId}`, '', '', projectId);
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
  // Ativos removidos (soft delete) ficam de fora da listagem padrão.
  // COALESCE porque `status` é nullable: `status != 'Removido'` é NULL (falso)
  // para linhas antigas sem status, e elas sumiriam da listagem.
  const result = await c.env.DB.prepare(
    "SELECT * FROM assets WHERE project_id = ? AND COALESCE(status, '') != 'Removido' ORDER BY created_at DESC"
  ).bind(projectId).all();
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

    await logAudit(c.env.DB, 'asset.created', user?.email || 'system', `Asset ${id} created for project ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar ativo', detail: e.message }, 500);
  }
});

const ASSET_UPDATABLE_FIELDS = [
  'name', 'type', 'category', 'classification', 'criticality', 'description',
  'owner', 'location', 'confidentiality_rating', 'integrity_rating', 'availability_rating',
] as const;

projectsApp.put('/:id/assets/:assetId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assetId = c.req.param('assetId');
    const user = c.get('user');
    if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
      return c.json({ error: 'Forbidden: Cannot update asset in this project' }, 403);
    }
    const body = await c.req.json<any>();

    const updates: string[] = [];
    const values: any[] = [];
    for (const field of ASSET_UPDATABLE_FIELDS) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (!updates.length) return c.json({ error: 'Nenhum campo para atualizar' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(assetId, projectId);

    const result = await c.env.DB.prepare(
      `UPDATE assets SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`
    ).bind(...values).run();
    if (!result.meta?.changes) {
      return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);
    }

    await logAudit(c.env.DB, 'asset.updated', user?.email || 'system', `Ativo ${assetId} atualizado no projeto ${projectId}`, '', '', projectId);
    const updated = await c.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(assetId).first();
    return c.json({ ok: true, asset: updated });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar ativo', detail: e.message }, 500);
  }
});

projectsApp.delete('/:id/assets/:assetId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assetId = c.req.param('assetId');
    const user = c.get('user');
    if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
      return c.json({ error: 'Forbidden: Cannot remove asset from this project' }, 403);
    }

    // Soft delete: plataforma de GRC precisa preservar o histórico do ativo
    // para trilha de auditoria, então não há DELETE físico aqui. Remover um
    // ativo já removido também responde 404 (não é idempotente de propósito,
    // pra deixar claro no cliente que não havia nada a remover).
    const result = await c.env.DB.prepare(
      "UPDATE assets SET status = 'Removido', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status != 'Removido'"
    ).bind(assetId, projectId).run();
    if (!result.meta?.changes) {
      return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);
    }

    await logAudit(c.env.DB, 'asset.removed', user?.email || 'system', `Ativo ${assetId} removido do projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao remover ativo', detail: e.message }, 500);
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
    const v = await validateBody(c, scopeChangeSchema);
    if (!v.success) return v.response;
    const { change_description, reason, impact_analysis, requested_by } = v.data as any;
    if (!change_description) return c.json({ error: 'change_description is required' }, 400);

    const changeId = genId();
    await c.env.DB.prepare(`
      INSERT INTO scope_changes (id, project_id, change_description, reason, impact_analysis, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `).bind(changeId, projectId, change_description, reason || null, impact_analysis || null, requested_by || c.get('user')?.email || 'system').run();

    await logAudit(c.env.DB, 'scope_change.created', c.get('user')?.email || 'system', `Solicitação de alteração de escopo ${changeId} criada para projeto ${projectId}`, '', '', projectId);
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

    await logAudit(c.env.DB, 'migration.27701', c.get('user')?.email ?? 'system', `27701 migration (2013->2022): ${gaps.length} gaps, ${created} new controls, project ${projectId}`, '', '', projectId);

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

    await logAudit(c.env.DB, 'migration.27701.2025', c.get('user')?.email ?? 'system', `27701:2025 migration: ${gaps.length} gaps, ${created} new controls, project ${projectId}`, '', '', projectId);

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

// Coerência entre fases do SGSI/SGPI: referências órfãs entre risks, compliance_controls,
// evidence e policy_versions (ver src/services/coherence.ts).
projectsApp.get('/:id/coherence', async (c) => {
  const projectId = c.req.param('id');
  const report = await checkCoherence(c.env.DB, projectId);
  return c.json(report);
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
    await logAudit(c.env.DB, 'dpia_created', user?.email || 'system', `DPIA ${id} created`, '', '', projectId);
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
      c.env.DB.prepare('SELECT * FROM audit_logs WHERE project_id = ? OR (project_id IS NULL AND details LIKE ?) ORDER BY created_at DESC LIMIT 100').bind(projectId, `%${projectId}%`).all()
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
    `SELECT * FROM audit_logs WHERE project_id = ? OR (project_id IS NULL AND details LIKE ?) ORDER BY created_at DESC LIMIT 500`
  ).bind(projectId, `%${projectId}%`).all();
  return c.json(results || []);
});

// Auditor Token inside Project
projectsApp.post('/:id/auditor-token', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, auditorTokenSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const days = body.days_valid ?? 30;
    const token = genToken();
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, token, project_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(genId(), token, projectId, expiresAt).run();

    await logAudit(c.env.DB, 'auditor_token.created', c.get('user')?.email ?? 'system', `Auditor token created for project ${projectId}, valid ${days} days`, '', '', projectId);
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
    // Este router está montado em /api/v1/controls, FORA de
    // /api/v1/projects/:projectId/*, então o projectAccessMiddleware nunca roda
    // aqui: sem esta linha o UPDATE abaixo casa por id apenas e um org_admin
    // reescreve controle de outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, controlUpdateSchema);
    if (!v.success) return v.response;
    const { status, title, description } = v.data as any;
    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE compliance_controls SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const projRow = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    await logAudit(c.env.DB, 'control.updated', c.get('user')?.email ?? 'system', `Controle ${id} atualizado`, '', '', projRow?.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: e.message }, 500);
  }
});

controlsApp.put('/:id/maturity', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, maturitySchema);
    if (!v.success) return v.response;
    const { maturity } = v.data;
    
    if (maturity < 0 || maturity > 5) {
      return c.json({ error: 'Maturidade deve ser entre 0 e 5' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET maturity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(maturity, id).run();

    const projRow = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    await logAudit(c.env.DB, 'control.maturity_updated', c.get('user')?.email || 'system', `Maturidade do controle ${id} atualizada para ${maturity}`, '', '', projRow?.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar maturidade', detail: e.message }, 500);
  }
});

controlsApp.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    // Mesma exposição do PUT /:id — e aqui o estrago é pior, porque marcar
    // controle alheio como "Implemented" falseia o SGSI do outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, statusSchema);
    if (!v.success) return v.response;
    const { status } = v.data;
    
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, id).run();

    const projRow = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    await logAudit(c.env.DB, 'control.status_updated', c.get('user')?.email || 'system', `Status do controle ${id} atualizado para ${status}`, '', '', projRow?.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar status do controle', detail: e.message }, 500);
  }
});

const handleControlApprove = async (c: any) => {
  try {
    const controlId = c.req.param('id');
    const v = await validateBody(c, assinaturaSchema);
    if (!v.success) return v.response;
    const { password } = v.data as any;
    const user = c.get('user');

    if (!password) {
      return c.json({ error: 'Senha é obrigatória para assinatura eletrônica' }, 400);
    }

    // O escopo do UPDATE saía de `project_id` — um campo do CORPO da requisição.
    // O `AND project_id = ?` parecia isolamento de tenant mas não era: o valor
    // era do próprio chamador, então mandar o projeto alheio bastava para
    // assinar controle de outro tenant com a própria senha. E quando nem havia
    // `project_id`, o UPDATE caía no ramo sem escopo nenhum.
    //
    // Agora o projeto sai do próprio controle e a autorização é uma checagem
    // explícita, não um WHERE que se parecia com uma. O `project_id` do corpo
    // continua sendo aceito pelo schema para não quebrar quem já o envia, mas
    // não decide mais nada.
    const controlRow = await c.env.DB.prepare(
      'SELECT project_id FROM compliance_controls WHERE id = ?'
    ).bind(controlId).first() as any;
    if (!controlRow) return c.json({ error: 'Controle não encontrado' }, 404);
    await requireResourceAccess(c.env.DB, 'compliance_controls', controlId, user);
    const targetProjectId = controlRow.project_id;

    const dbUser = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first()) as any;

    if (!dbUser || !(await verifyPassword(password, dbUser.password_hash))) {
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    await c.env.DB.prepare(
      `UPDATE compliance_controls SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(controlId).run();



    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';
    const approvedBy = dbUser.name || user.email;

    await logAudit(c.env.DB, 'control.approved', user.email, `Controle ${controlId} aprovado com assinatura por ${approvedBy} (IP: ${ip})`, '', '', targetProjectId);
    return c.json({ ok: true, approved_by: approvedBy, approved_at: now });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao assinar controle', detail: e.message }, 500);
  }
};

controlsApp.post('/:id/approve', handleControlApprove);
controlsApp.put('/:id/approve', handleControlApprove);

