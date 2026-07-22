import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess } from '../helpers';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';

export const platformApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Assets standalone CRUD
platformApp.put('/assets/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'assets', id, c.get('user'));
  try {
    const user = c.get('user');
    if (user && user.role === 'org_user') {
      return c.json({ error: 'Forbidden: Cannot edit asset' }, 403);
    }
    const body = await c.req.json<any>();
    await c.env.DB.prepare(
      `UPDATE assets SET name=?, type=?, category=?, owner=?, criticality=?, description=? WHERE id=?`
    ).bind(body.name, body.type, body.category, body.owner, body.criticality, body.description, id).run();

    await logAudit(c.env.DB, 'asset.updated', user?.email || 'system', `Asset ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar ativo', detail: e.message }, 500);
  }
});

platformApp.delete('/assets/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'assets', id, c.get('user'));
  try {
    const user = c.get('user');
    if (user && user.role === 'org_user') {
      return c.json({ error: 'Forbidden: Cannot delete asset' }, 403);
    }
    await c.env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'asset.deleted', user?.email || 'system', `Asset ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao deletar ativo', detail: e.message }, 500);
  }
});

// DPIA standalone CRUD
platformApp.put('/dpia/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'dpia_assessments', id, c.get('user'));
    const body = await c.req.json<any>();
    await c.env.DB.prepare(
      `UPDATE dpia_assessments SET ropa_id=?, processing_name=?, data_category_risk=?, necessity_proportionality=?, technical_measures=?, residual_risk_level=?, dpo_recommendations=?, status=? WHERE id=?`
    ).bind(body.ropa_id || null, body.processing_name, body.data_category_risk, body.necessity_proportionality, body.technical_measures, body.residual_risk_level || 'Medium', body.dpo_recommendations || null, body.status || 'Draft', id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'dpia_updated', user?.email || 'system', `DPIA ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar DPIA', detail: e.message }, 500);
  }
});

platformApp.post('/projects/:id/dpia/:assessmentId/approve', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assessmentId = c.req.param('assessmentId');
    const user = c.get('user');

    const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first<any>();
    let approvedBy = dbUser?.name || user.email;
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE dpia_assessments SET status = ?, dpo_approved_by = ?, dpo_approved_at = ? WHERE id = ? AND project_id = ?'
    ).bind('Approved', approvedBy, now, assessmentId, projectId).run();

    await logAudit(c.env.DB, 'dpia.approved', user.email, `DPIA ${assessmentId} aprovado pelo DPO (${approvedBy})`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Erro ao aprovar DPIA', detail: e.message }, 500);
  }
});

platformApp.get('/projects/:id/dpia/:assessmentId/report', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assessmentId = c.req.param('assessmentId');

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.html('<h3>Projeto não encontrado</h3>', 404);

    const dpia = await c.env.DB.prepare('SELECT * FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(assessmentId, projectId).first<any>();
    if (!dpia) return c.html('<h3>DPIA não encontrado</h3>', 404);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório RIPD / DPIA - ${project.client_name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
        <style>
          body { background-color: #f1f5f9; color: #070b14; font-family: 'Inter', sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
          .container { max-width: 900px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; padding: 3rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          h1 { font-family: 'Montserrat', sans-serif; color: #0f172a; margin-top: 0; }
          .field-label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 1rem; }
          .field-value { font-size: 0.95rem; color: #1e293b; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Relatório de Impacto à Proteção de Dados (RIPD / DPIA)</h1>
          <p style="color: #64748b;"><strong>Organização:</strong> ${project.client_name}</p>
          
          <div class="field-label">Atividade de Tratamento</div>
          <div class="field-value">${dpia.processing_name}</div>
          
          <div class="field-label">Riscos às Categorias de Dados</div>
          <div class="field-value">${dpia.data_category_risk}</div>
          
          <div class="field-label">Necessidade e Proporcionalidade</div>
          <div class="field-value">${dpia.necessity_proportionality}</div>
          
          <div class="field-label">Medidas Técnicas e de Segurança</div>
          <div class="field-value">${dpia.technical_measures}</div>
          
          <div class="field-label">Nível de Risco Residual</div>
          <div class="field-value"><strong>${dpia.residual_risk_level}</strong></div>
          
          <div class="field-label">Parecer do Encarregado (DPO)</div>
          <div class="field-value">${dpia.dpo_recommendations || 'Pendente de avaliação.'}</div>
          
          <div class="field-label">Status da Aprovação</div>
          <div class="field-value">${dpia.status === 'Approved' ? `✓ Aprovado por ${dpia.dpo_approved_by} em ${new Date(dpia.dpo_approved_at).toLocaleDateString()}` : 'Aguardando Aprovação do DPO'}</div>
        </div>
      </body>
      </html>
    `;
    return c.html(html);
  } catch (e: any) {
    return c.html(`<h3>Erro ao gerar relatório DPIA: ${e.message}</h3>`, 500);
  }
});

// Policy Templates & Marketplace
platformApp.get('/policy-templates', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM policy_templates ORDER BY iso_ref').all();
  return c.json({ ok: true, templates: results });
});

platformApp.get('/policy-templates/:id', async (c) => {
  const tpl = await c.env.DB.prepare('SELECT * FROM policy_templates WHERE id = ?').bind(c.req.param('id')).first();
  if (!tpl) return c.json({ error: 'Template not found' }, 404);
  return c.json({ ok: true, template: tpl });
});

platformApp.get('/marketplace/templates', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM policy_templates ORDER BY iso_ref').all();
  const marketplace = (results || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    category: t.category || 'Security Policy',
    description: `Policy template for ${t.iso_ref} (${t.title})`,
    iso_ref: t.iso_ref,
    difficulty: 'Intermediate',
    estimated_time: '15 mins',
    popularity: Math.floor(Math.random() * 50 + 50)
  }));
  return c.json({ ok: true, total: marketplace.length, templates: marketplace });
});

// Dashboard
platformApp.get('/dashboard', async (c) => {
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    return c.json({ error: 'Forbidden: Client role cannot access global platform dashboard' }, 403);
  }
  const [projects, leads, controls, evidence, risks] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM projects').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM leads').first() as Promise<any>,
    c.env.DB.prepare("SELECT COUNT(*) as count FROM compliance_controls WHERE status = 'Completed'").first() as Promise<any>,
    c.env.DB.prepare("SELECT COUNT(*) as count FROM evidence WHERE evaluation_status = 'pending'").first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM risks WHERE impact * probability >= 15').first() as Promise<any>
  ]);
  return c.json({
    projects: projects?.count || 0,
    leads: leads?.count || 0,
    controls_done: controls?.count || 0,
    pending_evidence: evidence?.count || 0,
    critical_risks: risks?.count || 0
  });
});

// Client portal endpoints
platformApp.get('/client/dashboard', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_project_id) {
      return c.json({ error: 'Nenhum projeto associado a este usuário cliente' }, 404);
    }
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(user.client_project_id).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const [phases, controls] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(user.client_project_id).all(),
      c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(user.client_project_id).all()
    ]);

    const phaseList = (phases.results || []) as any[];
    const controlList = (controls.results || []) as any[];
    const totalPhases = phaseList.length || 41;
    const completedPhases = phaseList.filter(p => p.status === 'completed').length;
    const progressPercent = totalPhases ? Math.round((completedPhases / totalPhases) * 100) : 0;

    return c.json({
      ok: true,
      project,
      progress_percent: progressPercent,
      phases: phaseList,
      controls: controlList
    });
  } catch (e: any) {
    return c.json({ error: 'Erro ao carregar dashboard do cliente', detail: e.message }, 500);
  }
});

platformApp.get('/client/assessment', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_lead_id) {
      return c.json({ error: 'Nenhum lead comercial associado a esta conta' }, 404);
    }
    const assessment = await c.env.DB.prepare('SELECT id FROM assessments WHERE lead_id = ?').bind(user.client_lead_id).first() as any;
    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado para este lead' }, 404);
    }
    return c.json({ assessment_id: assessment.id });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar assessment do cliente', detail: e.message }, 500);
  }
});

platformApp.get('/client/proposal', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_lead_id) {
      return c.json({ error: 'Nenhum lead comercial associado a esta conta' }, 404);
    }
    const proposal = await c.env.DB.prepare('SELECT id, status FROM proposals WHERE lead_id = ?').bind(user.client_lead_id).first() as any;
    if (!proposal) {
      return c.json({ error: 'Proposta não encontrada para este lead' }, 404);
    }
    return c.json({ proposal_id: proposal.id, status: proposal.status });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar proposta do cliente', detail: e.message }, 500);
  }
});

// Notifications
platformApp.get('/notifications', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50'
  ).bind(user?.id || null).all();
  return c.json({ ok: true, notifications: results || [] });
});

platformApp.put('/notifications/:id/read', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

platformApp.get('/portfolio', async (c) => {
  try {
    const user = c.get('user');
    let stmt = c.env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client') && user.client_project_id) {
      stmt = c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(user.client_project_id);
    }
    const { results } = await stmt.all();
    return c.json({ ok: true, portfolio: results || [], projects: results || [] });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar portfólio', detail: e.message }, 500);
  }
});

// Phase config & Auditor token
platformApp.get('/phases/config', (c) => {
  return c.json({ ok: true, titles: PHASE_TITLES, checklists: PHASE_CHECKLISTS });
});

platformApp.get('/auditor/:token/project', async (c) => {
  const token = c.req.param('token');
  const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
  if (!t) return c.json({ error: 'Invalid or expired token' }, 401);

  const [project, phases, controls, evidence] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(t.project_id).first(),
    c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(t.project_id).all(),
    c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(t.project_id).all(),
    c.env.DB.prepare('SELECT id, file_name, file_size, evaluation_status, evaluation_notes, created_at FROM evidence WHERE project_id = ?').bind(t.project_id).all()
  ]);

  return c.json({
    ok: true,
    project,
    phases: phases.results || [],
    controls: controls.results || [],
    evidence: evidence.results || []
  });
});
