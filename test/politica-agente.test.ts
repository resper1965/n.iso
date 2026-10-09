import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// O agente (MCP) deixa de sobrescrever a política vigente: o que ele grava vira RASCUNHO do documento, e só
// um humano publica. A imposição é do servidor (env.AGENTE), não de instrução de prompt.
const P = { userId: 'u-ag', email: 'cons-ag@ness.lat', projectId: 'p-ag', concessaoId: 'c-ag' };
const aiStub = { run: async () => ({ response: '# Política gerada pelo agente\n\nTexto.' }) };

const json = { 'Content-Type': 'application/json' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, { ...init, headers: { ...json, ...(init.headers ?? {}) } }), { ...workerEnv(), AGENTE: P, AI: aiStub } as any);
let humano: Record<string, string>;
const comoHumano = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, { ...init, headers: { ...json, ...humano, ...(init.headers ?? {}) } }), { ...workerEnv(), AI: aiStub } as any);

type V = { numero: number; estado: string; texto: string; origem: string };
const doc = async (controleId: string) => {
  const d = await env.DB.prepare(`SELECT id FROM documentos WHERE origem_control_id = ?`).bind(controleId).first<{ id: string }>();
  if (!d) return null;
  const v = await env.DB.prepare(`SELECT numero, estado, texto, origem FROM documento_versoes WHERE documento_id = ? ORDER BY numero`).bind(d.id).all<V>();
  return { id: d.id, versoes: v.results };
};
const controle = (id: string) =>
  env.DB.prepare(`SELECT description, ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id = ?`).bind(id).first<{ description: string; ciso_approved_by: string | null; ceo_approved_by: string | null }>();
const nPolicyVersions = async (id: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM policy_versions WHERE control_id = ?`).bind(id).first<{ n: number }>())?.n;
const statusPedido = async (id: string) => (await env.DB.prepare(`SELECT status FROM pedidos WHERE id = ?`).bind(id).first<{ status: string }>())?.status;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-ag','Cliente Exemplo','ISO 27001','controller','Active')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-ag','cons-ag@ness.lat','x','Cons','consultor')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-h','humano-ag@ness.lat','x','Humano','platform_admin')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-ag','Cons','cons-ag@ness.lat','consultor','Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag','u-ag','p-ag', datetime('now','+30 days'))`),
    // controle com política vigente, aprovada pelo CISO, e um pedido de aprovação aberto
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_by) VALUES ('ag-c1','p-ag','ISO 27001:2022','A.5.1 Políticas','Política vigente do cliente','ciso@exemplo.com.br')`),
    env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('ag-pv1','p-ag','ag-c1',1,'Política vigente do cliente','autor@exemplo.com.br')`),
    env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('ag-ped','org_ness','p-ag','politica','ag-c1','Política: A.5.1','ciso','{}','h','x@ness.lat')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ag-c2','p-ag','ISO 27001:2022','A.5.2 Gerada','Catálogo')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ag-c3','p-ag','ISO 27001:2022','A.5.3 Edição humana','Catálogo')`),
  ]);
  humano = await sessionFor({ id: 'u-h', email: 'humano-ag@ness.lat', role: 'platform_admin' });
});

describe('o agente grava rascunho', () => {
  it('niso_update_policy (POST .../policy): vira rascunho e NADA do controle muda', async () => {
    const r = await comoAgente('/api/v1/projects/p-ag/controls/ag-c1/policy', { method: 'POST', body: JSON.stringify({ text: 'Proposta do agente' }) });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, rascunho: true });

    expect(await controle('ag-c1')).toEqual({ description: 'Política vigente do cliente', ciso_approved_by: 'ciso@exemplo.com.br', ceo_approved_by: null });
    expect(await nPolicyVersions('ag-c1')).toBe(1);
    expect(await statusPedido('ag-ped')).toBe('aberto');

    const d = await doc('ag-c1');
    expect(d?.versoes.map((v) => [v.numero, v.estado, v.texto, v.origem])).toEqual([
      [1, 'vigente', 'Política vigente do cliente', 'humano'],
      [2, 'rascunho', 'Proposta do agente', 'agente'],
    ]);
  });

  it('gravar de novo substitui o rascunho do agente, sem criar outro', async () => {
    await comoAgente('/api/v1/projects/p-ag/controls/ag-c1/policy', { method: 'POST', body: JSON.stringify({ text: 'Segunda proposta' }) });
    const d = await doc('ag-c1');
    expect(d?.versoes.filter((v) => v.estado === 'rascunho').map((v) => v.texto)).toEqual(['Segunda proposta']);
  });

  it('generate-policy como agente: o texto gerado vira rascunho e a descrição do controle fica', async () => {
    const r = await comoAgente('/api/v1/projects/p-ag/generate-policy', { method: 'POST', body: JSON.stringify({ control_id: 'ag-c2' }) });
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo = await r.json() as { rascunho?: boolean; policy_markdown?: string };
    expect(corpo.rascunho).toBe(true);
    expect(corpo.policy_markdown).toContain('Política gerada pelo agente');
    expect((await controle('ag-c2'))?.description).toBe('Catálogo');
    expect(await nPolicyVersions('ag-c2')).toBe(0);
    const d = await doc('ag-c2');
    expect(d?.versoes).toEqual([{ numero: 1, estado: 'rascunho', texto: expect.stringContaining('Política gerada pelo agente'), origem: 'agente' }]);
  });
});

describe('publicar é ato humano', () => {
  it('o agente não publica nem descarta, e nada muda', async () => {
    const d = (await doc('ag-c1'))!;
    const pub = await comoAgente(`/api/v1/projects/p-ag/documentos/${d.id}/versoes/2/publicar`, { method: 'POST' });
    expect(pub.status).toBe(403);
    expect(await pub.text()).toContain('ato humano');
    const desc = await comoAgente(`/api/v1/projects/p-ag/documentos/${d.id}/rascunho`, { method: 'DELETE', headers: { 'X-Agente-Confirmado': '1' } });
    expect(desc.status).toBe(403);
    expect((await controle('ag-c1'))?.description).toBe('Política vigente do cliente');
    expect((await doc('ag-c1'))?.versoes.map((v) => v.estado)).toEqual(['vigente', 'rascunho']);
  });

  it('o humano publica o rascunho do agente e o efeito é o de uma edição manual', async () => {
    const d = (await doc('ag-c1'))!;
    const r = await comoHumano(`/api/v1/projects/p-ag/documentos/${d.id}/versoes/2/publicar`, { method: 'POST' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await controle('ag-c1')).toEqual({ description: 'Segunda proposta', ciso_approved_by: null, ceo_approved_by: null });
    expect(await nPolicyVersions('ag-c1')).toBe(2);
    expect(await statusPedido('ag-ped')).toBe('substituido');
    expect((await doc('ag-c1'))?.versoes.map((v) => [v.numero, v.estado])).toEqual([[1, 'substituida'], [2, 'vigente']]);
  });

  it('o humano descarta um rascunho sem tocar no controle', async () => {
    await comoAgente('/api/v1/projects/p-ag/controls/ag-c1/policy', { method: 'POST', body: JSON.stringify({ text: 'Proposta a descartar' }) });
    const d = (await doc('ag-c1'))!;
    const r = await comoHumano(`/api/v1/projects/p-ag/documentos/${d.id}/rascunho`, { method: 'DELETE' });
    expect(r.status).toBe(200);
    expect((await doc('ag-c1'))?.versoes.some((v) => v.estado === 'rascunho')).toBe(false);
    expect((await controle('ag-c1'))?.description).toBe('Segunda proposta');
    expect((await comoHumano(`/api/v1/projects/p-ag/documentos/${d.id}/rascunho`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('o humano continua gravando direto', () => {
  it('POST .../policy como humano grava o controle e o documento, sem rascunho', async () => {
    const r = await comoHumano('/api/v1/projects/p-ag/controls/ag-c3/policy', { method: 'POST', body: JSON.stringify({ text: 'Texto do consultor' }) });
    expect(r.status).toBe(200);
    expect((await r.json()) as object).not.toHaveProperty('rascunho');
    expect((await controle('ag-c3'))?.description).toBe('Texto do consultor');
    expect((await doc('ag-c3'))?.versoes.map((v) => [v.estado, v.origem])).toEqual([['vigente', 'humano']]);
  });

  it('uma edição humana com rascunho do agente pendente não apaga o rascunho', async () => {
    await comoAgente('/api/v1/projects/p-ag/controls/ag-c3/policy', { method: 'POST', body: JSON.stringify({ text: 'Proposta pendente' }) });
    await comoHumano('/api/v1/projects/p-ag/controls/ag-c3/policy', { method: 'POST', body: JSON.stringify({ text: 'Edição do consultor' }) });
    const estados = (await doc('ag-c3'))?.versoes.map((v) => [v.texto, v.estado]);
    expect(estados).toContainEqual(['Proposta pendente', 'rascunho']);
    expect(estados).toContainEqual(['Edição do consultor', 'vigente']);
  });
});

describe('a tela enxerga o rascunho pendente', () => {
  it('GET .../policy devolve o rascunho do agente, ou null', async () => {
    const com = await (await comoHumano('/api/v1/projects/p-ag/controls/ag-c3/policy')).json() as { rascunho: { texto: string; origem: string; documento_id: string; numero: number } | null };
    expect(com.rascunho).toMatchObject({ texto: 'Proposta pendente', origem: 'agente' });
    const sem = await (await comoHumano('/api/v1/projects/p-ag/controls/ag-c1/policy')).json() as { rascunho: unknown };
    expect(sem.rascunho).toBeNull();
  });
});

describe('o agente não contorna o rascunho por PUT /controls/:id', () => {
  const put = (corpo: object) => comoAgente('/api/v1/controls/ag-c3', { method: 'PUT', body: JSON.stringify(corpo) });

  it('reescrever a descrição (o texto da política) é recusado, e nada muda', async () => {
    const antes = await controle('ag-c3');
    const r = await put({ description: 'Reescrita direta pelo agente' });
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('niso_update_policy');
    expect(await controle('ag-c3')).toEqual(antes);
  });

  it('título sozinho e a justificativa de "Não aplicável" continuam passando', async () => {
    expect((await put({ title: 'A.5.3 Edição humana (renomeado)' })).status).toBe(200);
    const na = await put({ status: 'Not Applicable', description: 'Fora do escopo: o cliente não opera este processo.' });
    expect(na.status, await na.clone().text()).toBe(200);
    expect((await controle('ag-c3'))?.description).toBe('Fora do escopo: o cliente não opera este processo.');
  });

  it('o humano segue podendo editar a descrição por este PUT', async () => {
    const r = await comoHumano('/api/v1/controls/ag-c1', { method: 'PUT', body: JSON.stringify({ description: 'Ajuste humano' }) });
    expect(r.status).toBe(200);
    expect((await controle('ag-c1'))?.description).toBe('Ajuste humano');
  });
});
