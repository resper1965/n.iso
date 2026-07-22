import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, createNotification, escapeHtml } from '../helpers';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';

export const leadsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

leadsApp.post('/', async (c) => {
  try {
    const body = await c.req.json<any>();
    if (!body.company_name) return c.json({ error: 'company_name é obrigatório' }, 400);

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO leads (id, company_name, contact_name, contact_email, source, status,
       cnpj, razao_social, nome_fantasia, natureza_juridica, porte, capital_social,
       cnae_fiscal, cnae_fiscal_descricao, data_inicio_atividade, situacao_cadastral,
       logradouro, numero, complemento, bairro, municipio, uf, cep,
       telefone, qsa, cnpj_fetched_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id, body.company_name, body.contact_name || null, body.contact_email || null, body.source || null,
      body.cnpj || null, body.razao_social || null, body.nome_fantasia || null,
      body.natureza_juridica || null, body.porte || null, body.capital_social ?? null,
      body.cnae_fiscal ?? null, body.cnae_fiscal_descricao || null,
      body.data_inicio_atividade || null, body.situacao_cadastral || null,
      body.logradouro || null, body.numero || null, body.complemento || null,
      body.bairro || null, body.municipio || null, body.uf || null, body.cep || null,
      body.telefone || null, body.qsa ? JSON.stringify(body.qsa) : null,
      body.cnpj ? new Date().toISOString() : null
    ).run();

    await logAudit(c.env.DB, 'lead.created', c.get('user')?.email ?? 'system', `Lead ${id} criado para ${body.company_name}`);
    return c.json({ id, ...body, status: 'New' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar lead', detail: e.message }, 500);
  }
});

leadsApp.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar leads', detail: e.message }, 500);
  }
});

leadsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);
    
    const { results: assessments } = await c.env.DB.prepare('SELECT id, status, complexity, created_at FROM assessments WHERE lead_id = ?').bind(id).all();
    const { results: proposals } = await c.env.DB.prepare('SELECT id, status, total_price, created_at FROM proposals WHERE lead_id = ?').bind(id).all();

    return c.json({ ...lead, assessments, proposals });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar lead', detail: e.message }, 500);
  }
});

leadsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

leadsApp.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    await c.env.DB.prepare('UPDATE leads SET status = ?, updated_at = datetime("now") WHERE id = ?').bind(status, id).run();
    return c.json({ ok: true, status });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar lead', detail: e.message }, 500);
  }
});

leadsApp.post('/:id/enrich-cnpj', async (c) => {
  try {
    const id = c.req.param('id');
    const { cnpj } = await c.req.json<{ cnpj: string }>();
    const cleanCnpj = (cnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return c.json({ error: 'CNPJ inválido (14 dígitos)' }, 400);

    const lead = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
    if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);

    let res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    let d: any;
    if (!res.ok) {
      const resWs = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
      if (!resWs.ok) return c.json({ error: 'CNPJ não encontrado na Receita Federal ou APIs indisponíveis' }, 404);
      const wsData: any = await resWs.json();
      if (wsData.status === 'ERROR') return c.json({ error: wsData.message || 'CNPJ não encontrado' }, 404);
      
      const cepStrRaw = wsData.cep ? wsData.cep.replace(/\D/g, '') : null;
      const qsaMapped = wsData.qsa?.map((q: any) => ({
        nome_socio: q.nome,
        qualificacao_socio: q.qual
      })) || [];
      d = {
        razao_social: wsData.nome,
        nome_fantasia: wsData.fantasia,
        natureza_juridica: wsData.natureza_juridica,
        porte: wsData.porte,
        capital_social: parseFloat(wsData.capital_social || '0'),
        cnae_fiscal: wsData.atividade_principal?.[0]?.code ? parseInt(wsData.atividade_principal[0].code.replace(/\D/g, '')) : null,
        cnae_fiscal_descricao: wsData.atividade_principal?.[0]?.text || null,
        data_inicio_atividade: wsData.abertura ? wsData.abertura.split('/').reverse().join('-') : null,
        descricao_situacao_cadastral: wsData.situacao,
        descricao_tipo_de_logradouro: '',
        logradouro: wsData.logradouro,
        numero: wsData.numero,
        complemento: wsData.complemento,
        bairro: wsData.bairro,
        municipio: wsData.municipio,
        uf: wsData.uf,
        cep: cepStrRaw,
        ddd_telefone_1: wsData.telefone,
        qsa: qsaMapped
      };
    } else {
      d = await res.json();
    }

    const cepStr = d.cep != null ? String(d.cep).padStart(8, '0') : null;
    const telefone = d.ddd_telefone_1 || null;
    const qsaJson = d.qsa?.length ? JSON.stringify(d.qsa) : null;
    const logradouroFull = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ');

    await c.env.DB.prepare(
      `UPDATE leads SET
       cnpj=?, razao_social=?, nome_fantasia=?, natureza_juridica=?, porte=?, capital_social=?,
       cnae_fiscal=?, cnae_fiscal_descricao=?, data_inicio_atividade=?, situacao_cadastral=?,
       logradouro=?, numero=?, complemento=?, bairro=?, municipio=?, uf=?, cep=?,
       telefone=?, qsa=?, cnpj_fetched_at=datetime('now'), updated_at=datetime('now'),
       company_name=COALESCE(NULLIF(company_name,''), ?)
       WHERE id=?`
    ).bind(
      cleanCnpj, d.razao_social || null, d.nome_fantasia || null,
      d.natureza_juridica || null, d.porte || null, d.capital_social ?? null,
      d.cnae_fiscal ?? null, d.cnae_fiscal_descricao || null,
      d.data_inicio_atividade || null, d.descricao_situacao_cadastral || null,
      logradouroFull || null, d.numero || null, d.complemento || null,
      d.bairro || null, d.municipio || null, d.uf || null, cepStr,
      telefone, qsaJson,
      d.razao_social || d.nome_fantasia || '', id
    ).run();

    const updated = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    await logAudit(c.env.DB, 'lead.cnpj_enriched', c.get('user')?.email ?? 'system', `Lead ${id} enriquecido via CNPJ ${cleanCnpj}`);
    return c.json({ ok: true, lead: updated });
  } catch (e: any) {
    return c.json({ error: 'Falha ao enriquecer CNPJ', detail: e.message }, 500);
  }
});
