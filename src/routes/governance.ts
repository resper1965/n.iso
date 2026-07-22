import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess } from '../helpers';

export const governanceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Stakeholders
governanceApp.get('/projects/:id/stakeholders', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/projects/:id/stakeholders', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { name, type, category, requirements, influence, communication_method } = await c.req.json();
    if (!name) return c.json({ error: 'name is required' }, 400);
    await c.env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type, category, requirements, influence, communication_method)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`).bind(
        projectId, name, type || 'external', category || null, requirements || null, influence || 'Medium', communication_method || null
      ).run();
    await logAudit(c.env.DB, 'stakeholder.created', c.get('user')?.email || 'system', `Stakeholder ${name} criado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar stakeholder', detail: e.message }, 500);
  }
});

governanceApp.put('/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'stakeholders', id, c.get('user'));
  try {
    const { name, type, category, requirements, influence, communication_method } = await c.req.json();
    await c.env.DB.prepare(`UPDATE stakeholders SET name = COALESCE(?, name), type = COALESCE(?, type), category = COALESCE(?, category),
      requirements = COALESCE(?, requirements), influence = COALESCE(?, influence), communication_method = COALESCE(?, communication_method),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
        name || null, type || null, category || null, requirements || null, influence || null, communication_method || null, id
      ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar stakeholder', detail: e.message }, 500);
  }
});

governanceApp.delete('/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'stakeholders', id, c.get('user'));
  try {
    await c.env.DB.prepare('DELETE FROM stakeholders WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar stakeholder', detail: e.message }, 500);
  }
});

// Governance Team
governanceApp.get('/projects/:id/governance', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM project_governance WHERE project_id = ? ORDER BY created_at ASC').bind(projectId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/projects/:id/governance', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { id, name, email, role_category, job_title, is_primary } = await c.req.json();
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!role_category) return c.json({ error: 'role_category is required' }, 400);
    if (!job_title) return c.json({ error: 'job_title is required' }, 400);

    if (id) {
      await c.env.DB.prepare(`
        UPDATE project_governance 
        SET name = ?, email = ?, role_category = ?, job_title = ?, is_primary = ? 
        WHERE id = ? AND project_id = ?
      `).bind(name, email || null, role_category, job_title, is_primary ? 1 : 0, id, projectId).run();
      await logAudit(c.env.DB, 'governance.updated', c.get('user')?.email || 'system', `Membro da governança ${name} atualizado para projeto ${projectId}`);
    } else {
      await c.env.DB.prepare(`
        INSERT INTO project_governance (id, project_id, name, email, role_category, job_title, is_primary)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
      `).bind(projectId, name, email || null, role_category, job_title, is_primary ? 1 : 0).run();
      await logAudit(c.env.DB, 'governance.created', c.get('user')?.email || 'system', `Membro da governança ${name} criado para projeto ${projectId}`);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar governança', detail: e.message }, 500);
  }
});

governanceApp.delete('/projects/:id/governance/:memberId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const memberId = c.req.param('memberId');
    await c.env.DB.prepare('DELETE FROM project_governance WHERE id = ? AND project_id = ?').bind(memberId, projectId).run();
    await logAudit(c.env.DB, 'governance.deleted', c.get('user')?.email || 'system', `Membro da governança id ${memberId} deletado do projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar governança', detail: e.message }, 500);
  }
});

// Company Profile & Context Analysis
governanceApp.put('/projects/:id/company-profile', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { cnpj, employee_count, scope, sector, client_name } = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE projects 
      SET cnpj = ?, employee_count = ?, scope = ?, sector = ?, client_name = ?
      WHERE id = ?
    `).bind(
      cnpj || null, 
      employee_count ? parseInt(employee_count) : null, 
      scope || null, 
      sector || null, 
      client_name || '', 
      projectId
    ).run();

    await logAudit(c.env.DB, 'company_profile.updated', c.get('user')?.email || 'system', `Perfil corporativo do projeto ${projectId} atualizado`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar perfil corporativo', detail: e.message }, 500);
  }
});

governanceApp.get('/projects/:id/context', async (c) => {
  const projectId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM context_analysis WHERE project_id = ?').bind(projectId).first();
  return c.json(row || {});
});

governanceApp.put('/projects/:id/context', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes } = await c.req.json();
    
    await c.env.DB.prepare(`INSERT INTO context_analysis (id, project_id, internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        internal_strengths = excluded.internal_strengths,
        internal_weaknesses = excluded.internal_weaknesses,
        external_opportunities = excluded.external_opportunities,
        external_threats = excluded.external_threats,
        legal_requirements = excluded.legal_requirements,
        contractual_requirements = excluded.contractual_requirements,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP`).bind(
          projectId, internal_strengths || null, internal_weaknesses || null, external_opportunities || null, external_threats || null, legal_requirements || null, contractual_requirements || null, notes || null
        ).run();
        
    await logAudit(c.env.DB, 'context.updated', c.get('user')?.email || 'system', `Contexto atualizado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar contexto', detail: e.message }, 500);
  }
});

// Audit Findings & Management Reviews
governanceApp.get('/audits/:auditId/findings', async (c) => {
  const auditId = c.req.param('auditId');
  const rows = await c.env.DB.prepare('SELECT * FROM audit_findings WHERE audit_id = ? ORDER BY created_at DESC').bind(auditId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/audits/:auditId/findings', async (c) => {
  try {
    const auditId = c.req.param('auditId');
    const { project_id, control_id, finding_type, description, evidence_reviewed, auditor_notes } = await c.req.json();
    if (!description) return c.json({ error: 'description is required' }, 400);
    
    const findingId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    let capaId: string | null = null;
    
    if (finding_type === 'minor_nc' || finding_type === 'major_nc') {
      capaId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(`
        INSERT INTO corrective_actions (id, project_id, audit_id, control_id, title, description, severity, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        capaId, project_id, auditId, control_id || null, 
        `NC (${finding_type === 'major_nc' ? 'Maior' : 'Menor'}): ${description.substring(0, 50)}`, 
        description, finding_type === 'major_nc' ? 'High' : 'Medium'
      ).run();
      
      await logAudit(c.env.DB, 'capa.created_from_audit', c.get('user')?.email || 'system', `Ação corretiva ${capaId} criada a partir da NC de auditoria ${auditId}`);
    }
    
    await c.env.DB.prepare(`
      INSERT INTO audit_findings (id, audit_id, project_id, control_id, finding_type, description, evidence_reviewed, auditor_notes, capa_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
    `).bind(
      findingId, auditId, project_id, control_id || null, finding_type || 'observation', description, evidence_reviewed || null, auditor_notes || null, capaId
    ).run();
    
    await logAudit(c.env.DB, 'audit_finding.created', c.get('user')?.email || 'system', `Achado ${findingId} criado para auditoria ${auditId}`);
    return c.json({ ok: true, id: findingId, capa_id: capaId });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar achado de auditoria', detail: e.message }, 500);
  }
});

governanceApp.put('/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'audit_findings', id, c.get('user'));
  try {
    const { description, auditor_notes, status } = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE audit_findings 
      SET description = COALESCE(?, description), 
          auditor_notes = COALESCE(?, auditor_notes), 
          status = COALESCE(?, status) 
      WHERE id = ?
    `).bind(description || null, auditor_notes || null, status || null, id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar achado de auditoria', detail: e.message }, 500);
  }
});

governanceApp.delete('/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'audit_findings', id, c.get('user'));
  try {
    await c.env.DB.prepare('DELETE FROM audit_findings WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar achado de auditoria', detail: e.message }, 500);
  }
});

governanceApp.get('/projects/:id/management-reviews', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM management_reviews WHERE project_id = ? ORDER BY review_date DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/projects/:id/management-reviews', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { review_date, attendees } = await c.req.json();
    if (!review_date) return c.json({ error: 'review_date is required' }, 400);
    
    const [controls, capas, risks, training] = await Promise.all([
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM compliance_controls WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM corrective_actions WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM risks WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM training_records WHERE project_id = ? GROUP BY status').bind(projectId).all()
    ]);
    
    const agenda = {
      items: [
        { topic: '1. Status das ações da revisão anterior', data: 'Ações tomadas com base nas atas passadas.' },
        { topic: '2. Mudanças em questões internas/externas', data: 'Revisar SWOT e requisitos legais de segurança.' },
        { topic: '3. Desempenho e eficácia do SGSI', data: controls.results || [] },
        { topic: '4. Resultados de auditorias e achados', data: 'Ver histórico de NCs do módulo de auditoria.' },
        { topic: '5. Status das ações corretivas (CAPAs)', data: capas.results || [] },
        { topic: '6. Monitoramento de riscos e eficácia', data: risks.results || [] },
        { topic: '7. Desempenho de fornecedores', data: 'Ver trust scores e DPAs dos suboperadores.' },
        { topic: '8. Cobertura de conscientização e treinamento', data: training.results || [] },
        { topic: '9. Feedback de partes interessadas', data: 'Revisar matriz de stakeholders.' },
        { topic: '10. Adequação de recursos para o ISMS', data: 'Orçamento, ferramentas e equipe CISO.' },
        { topic: '11. Oportunidades de melhoria contínua', data: 'Identificar novos projetos de conformidade.' }
      ]
    };
    
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO management_reviews (id, project_id, review_date, attendees, agenda_json, status)
      VALUES (?, ?, ?, ?, ?, 'Planned')
    `).bind(
      id, projectId, review_date, attendees || null, JSON.stringify(agenda)
    ).run();
    
    await logAudit(c.env.DB, 'management_review.created', c.get('user')?.email || 'system', `Reunião de análise crítica registrada para o projeto ${projectId}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar reunião de análise crítica', detail: e.message }, 500);
  }
});

governanceApp.put('/management-reviews/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'management_reviews', id, c.get('user'));
  try {
    const { decisions, action_items, status, minutes_url, attendees } = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE management_reviews 
      SET decisions = COALESCE(?, decisions), 
          action_items = COALESCE(?, action_items), 
          status = COALESCE(?, status),
          minutes_url = COALESCE(?, minutes_url),
          attendees = COALESCE(?, attendees),
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(
      decisions !== undefined ? decisions : null,
      action_items !== undefined ? action_items : null,
      status !== undefined ? status : null,
      minutes_url !== undefined ? minutes_url : null,
      attendees !== undefined ? attendees : null,
      id
    ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar reunião de análise crítica', detail: e.message }, 500);
  }
});

// Performance Metrics
governanceApp.get('/projects/:id/metrics', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM performance_metrics WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

governanceApp.post('/projects/:id/metrics', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    if (!metric_name) return c.json({ error: 'Metric Name is required' }, 400);

    const metricId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO performance_metrics (id, project_id, metric_name, target_value, current_value, frequency, last_measured_at, owner, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(metricId, projectId, metric_name, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || 'Monthly', last_measured_at || null, owner || null, status || 'On Track').run();

    return c.json({ ok: true, id: metricId });
  } catch (e: any) {
    return c.json({ error: 'Error creating metric', detail: e.message }, 500);
  }
});

governanceApp.put('/metrics/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'performance_metrics', id, c.get('user'));
  try {
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    
    await c.env.DB.prepare(
      'UPDATE performance_metrics SET metric_name = COALESCE(?, metric_name), target_value = COALESCE(?, target_value), current_value = COALESCE(?, current_value), frequency = COALESCE(?, frequency), last_measured_at = COALESCE(?, last_measured_at), owner = COALESCE(?, owner), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(metric_name || null, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || null, last_measured_at || null, owner || null, status || null, id).run();

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Error updating metric', detail: e.message }, 500);
  }
});

governanceApp.delete('/metrics/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'performance_metrics', id, c.get('user'));
  try {
    await c.env.DB.prepare('DELETE FROM performance_metrics WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Error deleting metric', detail: e.message }, 500);
  }
});

// Policy Acknowledgments
governanceApp.get('/projects/:id/policy-acknowledgments', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM policy_acknowledgments WHERE project_id = ? ORDER BY acknowledged_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

governanceApp.post('/projects/:id/policy-acknowledgments', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { policy_type, user_name, user_email } = await c.req.json();
    if (!policy_type || !user_name || !user_email) return c.json({ error: 'Policy Type, User Name and Email are required' }, 400);

    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';

    const ackId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ackId, projectId, policy_type, user_name, user_email, ipAddress, userAgent).run();

    return c.json({ ok: true, id: ackId });
  } catch (e: any) {
    return c.json({ error: 'Error recording policy acknowledgment', detail: e.message }, 500);
  }
});
