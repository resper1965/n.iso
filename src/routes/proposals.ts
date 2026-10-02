import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, somenteComercial, erro500 } from '../helpers';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';
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
proposalsApp.use('*', somenteComercial);


proposalsApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, proposalSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
    if (!body.lead_id || !body.assessment_id) return c.json({ error: 'lead_id e assessment_id obrigatórios' }, 400);

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html, created_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id, body.assessment_id, body.total_price, body.content_html).run();

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
    // A aprovação pelo painel criava contrato e projeto por conta própria; agora é o aceite da proposta.
    if (body.status === 'Signed') return c.json({ error: 'A aprovação pelo painel foi substituída pelo aceite da proposta' }, 410);
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
