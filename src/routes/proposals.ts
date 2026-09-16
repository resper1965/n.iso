import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, createNotification, somenteNess, erro500, hidrataEscopo, resolveCliente, AtorAutorizado } from '../helpers';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';
import { PHASE_TITLES } from '../constants';
import { validateBody, proposalSchema, proposalUpdateSchema } from '../schemas';

export const proposalsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proposta também não tem `project_id`. Sonda: o `org_admin` de um cliente lia
// `content_html` e `total_price` da proposta de outro, marcava como aprovada e
// excluía a linha — tudo com 200. O caminho legítimo do cliente para a própria
// proposta é `/api/v1/client/proposal` (routes/platform.ts).
//
// Este comentário afirmava que aquele caminho "continua aberto" e citava um
// filtro por `client_lead_id`. Era falso nas duas metades: a coluna não existe
// e a rota respondia 404 para todo mundo. Hoje ela deriva o vínculo de
// `projects.assessment_id`, e o filtro é o projeto do próprio usuário.
proposalsApp.use('*', somenteNess);


proposalsApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, proposalSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
    if (!body.lead_id || !body.assessment_id) return c.json({ error: 'lead_id e assessment_id obrigatórios' }, 400);

    // A conta é a do assessment que originou esta proposta (quem vendeu),
    // com o usuário como segunda opção — mesma regra de /sign e /convert.
    const assessmentOrigem = await c.env.DB.prepare('SELECT conta_id FROM assessments WHERE id = ?').bind(body.assessment_id).first<{ conta_id: string | null }>();
    await hidrataEscopo(c.env.DB, c.get('user') ?? {});
    const contaId = assessmentOrigem?.conta_id ?? (c.get('user') as AtorAutorizado | undefined)?.conta_id ?? null;

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html, conta_id, created_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, ?, datetime('now'))`
    ).bind(id, body.lead_id, body.assessment_id, body.total_price, body.content_html, contaId).run();

    await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Proposal', body.lead_id).run();

    return c.json({ id, status: 'Draft' }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar proposta', e);
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
    return erro500(c, 'Falha ao salvar config', e);
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
    return erro500(c, 'Falha ao listar propostas', e);
  }
});

proposalsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    return c.json(proposal);
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar proposta', e);
  }
});

proposalsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, proposalUpdateSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
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
    return erro500(c, 'Falha ao atualizar proposta', e);
  }
});

proposalsApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM proposals WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'proposal.deleted', c.get('user')?.email ?? 'system', `Proposta ${id} excluída`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao excluir proposta', e);
  }
});

proposalsApp.post('/:id/sign', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first<any>();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    if (proposal.status === 'Signed') return c.json({ error: 'Proposta já assinada' }, 400);

    // Tudo o que pode recusar com 400 vem ANTES de qualquer mutação. Antes
    // desta ordem, uma recusa aqui deixava a proposta 'Signed', o contrato
    // criado e o lead 'Won' — sem projeto e sem chance de tentar de novo (a
    // linha 140 acima recusa reassinatura). Ver Important 4 da revisão.
    const leadData = proposal.lead_id
      ? await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(proposal.lead_id).first<any>()
      : null;
    const assessmentDaProposta = proposal.assessment_id
      ? await c.env.DB.prepare('SELECT client_name FROM assessments WHERE id = ?').bind(proposal.assessment_id).first<{ client_name: string }>()
      : null;

    // A conta é a de quem CONDUZIU A VENDA, não a de quem clicou em assinar:
    // este roteador não garante que o operador pertence à conta de origem, e
    // usuário-primeiro materializaria a venda de uma consultoria na carteira
    // de outra. Origem primeiro; usuário só entra quando a origem não tem
    // conta gravada (proposta anterior à Task 6 / migration 0031).
    await hidrataEscopo(c.env.DB, c.get('user') ?? {});
    const contaId = proposal.conta_id ?? (c.get('user') as AtorAutorizado | undefined)?.conta_id ?? null;
    if (!contaId) {
      return c.json({ error: 'conta_id é obrigatório para quem não é staff de uma conta' }, 400);
    }
    // `leadData?.company_name || 'Cliente'` era um balde: toda proposta sem
    // lead (assessment sem lead → generate-proposal → sign) caía no MESMO
    // cliente literal "Cliente" dentro da conta — chave de autorização
    // compartilhada entre empresas sem relação nenhuma. Sem nome real, recusa
    // em vez de inventar um balde.
    const clientName = leadData?.razao_social || leadData?.company_name || assessmentDaProposta?.client_name || null;
    if (!clientName) {
      return c.json({ error: 'Não foi possível determinar o cliente desta proposta (sem lead e sem assessment de origem com nome)' }, 400);
    }
    const clienteId = await resolveCliente(c.env.DB, contaId, clientName, leadData?.cnpj);

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

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, cliente_id, created_at)
       VALUES (?, ?, '', '', 'ISO 27001:2022', 'Controlador', 'Active', ?, ?, datetime('now'))`
    ).bind(projectId, clientName, proposal.assessment_id || '', clienteId).run();

    for (let i = 0; i <= 40; i++) {
      const phaseId = genId();
      const status = i === 0 ? 'in_progress' : 'pending';
      await c.env.DB.prepare(
        `INSERT INTO project_phases (id, project_id, phase_number, title, status, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(phaseId, projectId, i, PHASE_TITLES[i] || `Fase ${i + 1}`, status).run();
    }

    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${projectId} criado automaticamente com 41 fases a partir da proposta ${id}.`);

    await createNotification(c.env.DB, 'contract_signed', `Contrato assinado: ${clientName}`, `Projeto criado automaticamente com 41 fases.`, c.get('user')?.id, `/projects/${projectId}`);

    return c.json({ ok: true, contract_id: contractId, project_id: projectId, proposal_status: 'Signed', lead_status: 'Won' });
  } catch (e: any) {
    return erro500(c, 'Falha ao assinar proposta', e);
  }
});
