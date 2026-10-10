import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { ehLegitimoInteresse } from '../src/services/lia';

/** Fatia 5: LIA por tratamento (exigida quando a base é legítimo interesse) e DPIA criada a partir do tratamento. */
const P = 'ld-proj';
const OUTRO = 'ld-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, cliente: Record<string, string>;
const base = (rid: string) => `/api/v1/projects/${P}/ropa/${rid}`;
type Lig = { lia: { exigida: boolean; existe: boolean; status: string | null }; dpias: { id: string; nome: string | null; status: string | null }[]; dpia_pendente: boolean };
const lig = async (rid: string) => json<Lig>(await chamar(consultor, 'GET', `${base(rid)}/ligacoes`));
async function novo(finalidade: string, extra: object = {}) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: finalidade, ...extra });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
const COMPLETA = { finalidade_legitima: 'Prevenir fraude', necessidade: 'Dados mínimos', balanceamento: 'Titular espera esse uso', conclusao: 'prevalece' as const };

describe('ehLegitimoInteresse', () => {
  it('reconhece com e sem acento e em qualquer caixa; consentimento não conta', () => {
    expect(ehLegitimoInteresse('Legítimo interesse (art. 7, IX)')).toBe(true);
    expect(ehLegitimoInteresse(null, 'LEGITIMO INTERESSE')).toBe(true);
    expect(ehLegitimoInteresse('Consentimento', 'Execução de contrato')).toBe(false);
    expect(ehLegitimoInteresse(null, undefined)).toBe(false);
  });
});

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ld', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('ld-i1', ?, 'ERP', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
    env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo, pai_id) VALUES ('lgpd:art7', 'lgpd', 'art. 7', 'Bases', NULL), ('lgpd:art7:ix', 'lgpd', 'art. 7, IX', 'Legítimo interesse', 'lgpd:art7'), ('lgpd:art7:i', 'lgpd', 'art. 7, I', 'Consentimento', 'lgpd:art7')`),
  ]);
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('LIA exigida', () => {
  it('pelo texto livre ou pela base do catálogo; consentimento não exige', async () => {
    const texto = await novo('Por texto', { legal_basis: 'Legítimo Interesse' });
    const catalogo = await novo('Por catálogo', { base_legal_id: 'lgpd:art7:ix' });
    const consent = await novo('Consentimento', { legal_basis: 'Consentimento', base_legal_id: 'lgpd:art7:i' });
    expect((await lig(texto)).lia).toEqual({ exigida: true, existe: false, status: null });
    expect((await lig(catalogo)).lia.exigida).toBe(true);
    expect((await lig(consent)).lia.exigida).toBe(false);
  });
});

describe('LIA: salvar e concluir', () => {
  it('rascunho parcial, depois conclusão: guarda quem e quando; some do estado "exigida sem LIA"', async () => {
    const rid = await novo('Fraude', { legal_basis: 'legítimo interesse' });
    const r1 = await chamar(consultor, 'PUT', `${base(rid)}/lia`, { finalidade_legitima: 'Prevenir fraude' });
    expect(r1.status, await r1.clone().text()).toBe(201);
    expect((await lig(rid)).lia).toEqual({ exigida: true, existe: true, status: 'rascunho' });
    const r2 = await chamar(consultor, 'PUT', `${base(rid)}/lia`, { ...COMPLETA, status: 'concluida' });
    expect(r2.status, await r2.clone().text()).toBe(200);
    const { lia } = await json<{ lia: { status: string; conclusao: string; concluida_por: string; concluida_em: string; finalidade_legitima: string } }>(await chamar(consultor, 'GET', `${base(rid)}/lia`));
    expect(lia).toMatchObject({ status: 'concluida', conclusao: 'prevalece', concluida_por: 'cons@ness.lat', finalidade_legitima: 'Prevenir fraude' });
    expect(lia.concluida_em).toBeTruthy();
  });

  it('concluir sem o conjunto é 400 e não grava a conclusão', async () => {
    const rid = await novo('Incompleta');
    await chamar(consultor, 'PUT', `${base(rid)}/lia`, { finalidade_legitima: 'x' });
    const r = await chamar(consultor, 'PUT', `${base(rid)}/lia`, { status: 'concluida' });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toContain('necessidade');
    expect((await lig(rid)).lia.status).toBe('rascunho');
    expect((await chamar(consultor, 'PUT', `${base(rid)}/lia`, { ...COMPLETA, finalidade_legitima: '  ', status: 'concluida' })).status).toBe(400);
  });

  it('LIA concluída não muda por edição (409); reabrir é um ato à parte e limpa quem concluiu', async () => {
    const rid = await novo('Concluída');
    await chamar(consultor, 'PUT', `${base(rid)}/lia`, { ...COMPLETA, status: 'concluida' });
    expect((await chamar(consultor, 'PUT', `${base(rid)}/lia`, { necessidade: 'Outra' })).status).toBe(409);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/lia`, { status: 'rascunho', necessidade: 'Outra' })).status).toBe(200);
    const { lia } = await json<{ lia: { status: string; necessidade: string; concluida_por: string | null } }>(await chamar(consultor, 'GET', `${base(rid)}/lia`));
    expect(lia).toMatchObject({ status: 'rascunho', necessidade: 'Outra', concluida_por: null });
  });

  it('valida o corpo: conclusão fora da lista, campo desconhecido e texto grande são 400', async () => {
    const rid = await novo('Valida');
    for (const corpo of [{ conclusao: 'talvez' }, { extra: 1 }, { necessidade: 'x'.repeat(5001) }, { status: 'pronta' }]) {
      expect((await chamar(consultor, 'PUT', `${base(rid)}/lia`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('registro de outro projeto é 404; papel de leitura lê mas não grava; apagar o tratamento apaga a LIA', async () => {
    const alheio = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?, ?, 'Alheio')`).bind(alheio, OUTRO).run();
    expect((await chamar(consultor, 'PUT', `${base(alheio)}/lia`, { finalidade_legitima: 'x' })).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${base(alheio)}/lia`)).status).toBe(404);
    const rid = await novo('Para apagar');
    await chamar(consultor, 'PUT', `${base(rid)}/lia`, { finalidade_legitima: 'x' });
    expect((await chamar(cliente, 'PUT', `${base(rid)}/lia`, { necessidade: 'y' })).status).toBe(403);
    expect((await chamar(cliente, 'GET', `${base(rid)}/lia`)).status).toBe(200);
    expect((await chamar(consultor, 'DELETE', `/api/v1/ropa/${rid}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT count(*) AS n FROM lia_assessments WHERE ropa_id = ?').bind(rid).first()).toEqual({ n: 0 });
  });

  it('apagar a LIA: 200, depois 404', async () => {
    const rid = await novo('Apaga LIA');
    await chamar(consultor, 'PUT', `${base(rid)}/lia`, { finalidade_legitima: 'x' });
    expect((await chamar(consultor, 'DELETE', `${base(rid)}/lia`)).status).toBe(200);
    expect((await chamar(consultor, 'DELETE', `${base(rid)}/lia`)).status).toBe(404);
  });
});

describe('DPIA a partir do tratamento', () => {
  it('nasce Draft, ligada e pré-preenchida com o que o registro e as ligações sabem; a pendência some', async () => {
    const rid = await novo('Folha de pagamento', { data_subjects: 'Colaboradores', data_categories: 'Dados financeiros', dpia_required: 1 });
    await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['ld-i1'] });
    await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile', mecanismo: 'cláusulas' });
    expect((await lig(rid)).dpia_pendente).toBe(true);
    const r = await chamar(consultor, 'POST', `${base(rid)}/dpia`);
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    expect(await env.DB.prepare('SELECT * FROM dpia_assessments WHERE id = ?').bind(id).first()).toMatchObject({
      project_id: P, ropa_id: rid, status: 'Draft', processing_name: 'Folha de pagamento', system_name: 'ERP',
      data_subjects_types: 'Colaboradores', personal_data_categories: 'Dados financeiros',
    });
    const fluxo = (await env.DB.prepare('SELECT data_flow_description AS f FROM dpia_assessments WHERE id = ?').bind(id).first<{ f: string }>())!.f;
    expect(fluxo).toContain('ERP (sistema)');
    expect(fluxo).toContain('Chile (cláusulas)');
    const l = await lig(rid);
    expect(l.dpia_pendente).toBe(false);
    expect(l.dpias).toEqual([{ id, nome: 'Folha de pagamento', status: 'Draft' }]);
  });

  it('segunda chamada não duplica: 409 com o id da existente', async () => {
    const rid = await novo('Sem duplicar');
    const id = (await json<{ id: string }>(await chamar(consultor, 'POST', `${base(rid)}/dpia`))).id;
    const r = await chamar(consultor, 'POST', `${base(rid)}/dpia`);
    expect(r.status).toBe(409);
    expect(await json<{ id: string }>(r)).toMatchObject({ id });
    expect((await env.DB.prepare('SELECT count(*) AS n FROM dpia_assessments WHERE ropa_id = ?').bind(rid).first<{ n: number }>())!.n).toBe(1);
  });

  it('registro alheio é 404, papel de leitura é 403, e sem dpia_required não há pendência', async () => {
    const alheio = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?, ?, 'Alheio')`).bind(alheio, OUTRO).run();
    expect((await chamar(consultor, 'POST', `${base(alheio)}/dpia`)).status).toBe(404);
    const rid = await novo('Sem exigência');
    expect((await chamar(cliente, 'POST', `${base(rid)}/dpia`)).status).toBe(403);
    expect((await lig(rid)).dpia_pendente).toBe(false);
  });

  it('apagar o tratamento mantém a DPIA (e a assinatura) com a ligação zerada', async () => {
    const rid = await novo('Apaga e mantém');
    const id = (await json<{ id: string }>(await chamar(consultor, 'POST', `${base(rid)}/dpia`))).id;
    await env.DB.prepare(`UPDATE dpia_assessments SET dpo_approved_by = 'Ana' WHERE id = ?`).bind(id).run();
    expect((await chamar(consultor, 'DELETE', `/api/v1/ropa/${rid}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT ropa_id, dpo_approved_by FROM dpia_assessments WHERE id = ?').bind(id).first()).toEqual({ ropa_id: null, dpo_approved_by: 'Ana' });
  });
});
