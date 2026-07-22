import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, createNotification } from '../helpers';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';
import { PHASE_TITLES } from '../constants';

export const proposalsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


proposalsApp.post('/', async (c) => {
  try {
    const body = await c.req.json<{ lead_id: string; assessment_id: string; total_price: number; content_html: string }>();
    if (!body.lead_id || !body.assessment_id) return c.json({ error: 'lead_id e assessment_id obrigatórios' }, 400);

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html, created_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id, body.assessment_id, body.total_price, body.content_html).run();

    await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Proposal', body.lead_id).run();

    return c.json({ id, status: 'Draft' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar proposta', detail: e.message }, 500);
  }
});

proposalsApp.get('/config/pricing', async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const saved = row ? JSON.parse(row.value) : {};
    const merged = { ...DEFAULT_FINANCIAL_MODEL, ...saved,
      taxaVendaPD: { ...DEFAULT_FINANCIAL_MODEL.taxaVendaPD, ...(saved.taxaVendaPD || {}) },
      custoInternoPD: { ...DEFAULT_FINANCIAL_MODEL.custoInternoPD, ...(saved.custoInternoPD || {}) },
      tributos: { ...DEFAULT_FINANCIAL_MODEL.tributos, ...(saved.tributos || {}) },
      bufferRisco: { ...DEFAULT_FINANCIAL_MODEL.bufferRisco, ...(saved.bufferRisco || {}) },
    };
    return c.json(merged);
  } catch (e: any) {
    return c.json(DEFAULT_FINANCIAL_MODEL);
  }
});

proposalsApp.put('/config/pricing', async (c) => {
  try {
    const body = await c.req.json();
    const json = JSON.stringify(body);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('pricing_config', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    ).bind(json, json).run();
    await logAudit(c.env.DB, 'pricing_config.updated', c.get('user')?.email ?? 'system', 'Config de precificação atualizada');
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar config', detail: e.message }, 500);
  }
});

proposalsApp.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.lead_id, p.assessment_id, p.status, p.total_price, p.created_at, p.approved_at,
              l.company_name, l.razao_social, l.cnpj
       FROM proposals p LEFT JOIN leads l ON p.lead_id = l.id
       ORDER BY p.created_at DESC`
    ).all();
    return c.json(results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar propostas', detail: e.message }, 500);
  }
});

proposalsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    return c.json(proposal);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar proposta', detail: e.message }, 500);
  }
});

proposalsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ content_html?: string; status?: string }>();
    const proposal = await c.env.DB.prepare('SELECT id FROM proposals WHERE id = ?').bind(id).first();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);

    const updates: string[] = [];
    const vals: any[] = [];
    if (body.content_html !== undefined) { updates.push('content_html = ?'); vals.push(body.content_html); }
    if (body.status) { updates.push('status = ?'); vals.push(body.status); }
    if (!updates.length) return c.json({ error: 'Nada para atualizar' }, 400);

    vals.push(id);
    await c.env.DB.prepare(`UPDATE proposals SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();

    const updated = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
    await logAudit(c.env.DB, 'proposal.updated', c.get('user')?.email ?? 'system', `Proposta ${id} atualizada`);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar proposta', detail: e.message }, 500);
  }
});

proposalsApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM proposals WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'proposal.deleted', c.get('user')?.email ?? 'system', `Proposta ${id} excluída`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao excluir proposta', detail: e.message }, 500);
  }
});

proposalsApp.post('/:id/sign', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first<any>();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    if (proposal.status === 'Signed') return c.json({ error: 'Proposta já assinada' }, 400);

    await c.env.DB.prepare(
      "UPDATE proposals SET status = 'Signed', approved_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    const contractId = genId();
    await c.env.DB.prepare(
      `INSERT INTO contracts (id, proposal_id, lead_id, status, signed_at, created_at)
       VALUES (?, ?, ?, 'Signed', datetime('now'), datetime('now'))`
    ).bind(contractId, id, proposal.lead_id).run();

    if (proposal.lead_id) {
      await c.env.DB.prepare("UPDATE leads SET status = 'Won', updated_at = datetime('now') WHERE id = ?").bind(proposal.lead_id).run();
    }

    await logAudit(c.env.DB, 'proposal.signed', c.get('user')?.email ?? 'system', `Proposta ${id} assinada. Contrato ${contractId} criado.`);

    const projectId = genId();
    const leadData = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(proposal.lead_id).first<any>();

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, '', '', 'ISO 27001:2022', 'Controlador', 'Active', ?, datetime('now'))`
    ).bind(projectId, leadData?.company_name || 'Cliente', proposal.assessment_id || '').run();

    for (let i = 0; i <= 40; i++) {
      const phaseId = genId();
      const status = i === 0 ? 'in_progress' : 'pending';
      await c.env.DB.prepare(
        `INSERT INTO project_phases (id, project_id, phase_number, title, status, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(phaseId, projectId, i, PHASE_TITLES[i], status).run();
    }

    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${projectId} criado automaticamente com 41 fases a partir da proposta ${id}.`);

    await createNotification(c.env.DB, 'contract_signed', `Contrato assinado: ${leadData?.company_name || 'Cliente'}`, `Projeto criado automaticamente com 41 fases.`, c.get('user')?.id, `/projects/${projectId}`);

    return c.json({ ok: true, contract_id: contractId, project_id: projectId, proposal_status: 'Signed', lead_status: 'Won' });
  } catch (e: any) {
    return c.json({ error: 'Falha ao assinar proposta', detail: e.message }, 500);
  }
});
