import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * O PUT da DPIA aceitava `status` livre: quem editava gravava `status: 'Approved'` sem senha, sem
 * autoridade na matriz de Governança e sem segregação — o fluxo de aprovação inteiro era contornável.
 * Regra: pelo PUT o status só transita entre 'Draft' e 'Under Review'. 'Approved' só pelas rotas de
 * aprovação (POST .../approve e pedidos). DPIA já aprovada não muda de status pelo PUT: sair de
 * 'Approved' é revogar (POST .../revoke-approval, com motivo e trilha). Editar o CONTEÚDO de DPIA
 * aprovada segue como antes: grava e substitui o pedido aberto; o status não é tocado.
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

describe('PUT /dpia/:id não aprova', () => {
  let editor: Record<string, string>;
  const URL_PUT = '/api/v1/dpia/dp-s';
  const linha = () => env.DB.prepare(`SELECT status, dpo_signature, ceo_signature, dpo_approved_by, dpo_approved_at, processing_name FROM dpia_assessments WHERE id='dp-s'`).first<any>();
  const semear = (status: string, assinada = false) =>
    env.DB.batch([
      env.DB.prepare(`DELETE FROM dpia_assessments`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status, dpo_signature, ceo_signature, dpo_approved_by, dpo_approved_at) VALUES ('dp-s','p-s','Folha',?,?,?,?,?)`)
        .bind(status, assinada ? 'Ana DPO' : null, assinada ? 'Beto CEO' : null, assinada ? 'Ana DPO' : null, assinada ? '2026-10-01T00:00:00Z' : null),
    ]);

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-s','S','ISO 27701','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-ed','ed@x.com','x','Editor','org_admin','p-s')`),
    ]);
    editor = await sessionFor({ id: 'u-ed', email: 'ed@x.com', role: 'org_admin', client_project_id: 'p-s' });
  });

  it("status 'Approved' no corpo: 400 apontando o fluxo de aprovação; nada muda", async () => {
    await semear('Under Review');
    const r = await chamar('PUT', URL_PUT, editor, {
      processing_name: 'Outro', status: 'Approved',
      dpo_signature: 'Forjado', ceo_signature: 'Forjado', dpo_approved_by: 'Forjado', dpo_approved_at: '2026-01-01',
    });
    expect(r.status, await r.clone().text()).toBe(400);
    expect(JSON.stringify(await r.json())).toMatch(/aprova/i);
    expect(await linha()).toEqual({
      status: 'Under Review', dpo_signature: null, ceo_signature: null, dpo_approved_by: null, dpo_approved_at: null, processing_name: 'Folha',
    });
  }, 30_000);

  it('campos de assinatura no corpo são ignorados mesmo sem status', async () => {
    await semear('Draft');
    const r = await chamar('PUT', URL_PUT, editor, { processing_name: 'Folha v2', dpo_signature: 'Forjado', ceo_signature: 'Forjado', dpo_approved_by: 'Forjado', dpo_approved_at: '2026-01-01' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await linha()).toMatchObject({ status: 'Draft', dpo_signature: null, ceo_signature: null, dpo_approved_by: null, dpo_approved_at: null, processing_name: 'Folha v2' });
  }, 30_000);

  it("Draft <-> 'Under Review' continua pelo PUT", async () => {
    await semear('Draft');
    expect((await chamar('PUT', URL_PUT, editor, { status: 'Under Review' })).status).toBe(200);
    expect((await linha()).status).toBe('Under Review');
    expect((await chamar('PUT', URL_PUT, editor, { status: 'Draft' })).status).toBe(200);
    expect((await linha()).status).toBe('Draft');
  }, 30_000);

  it('DPIA aprovada: mudar status pelo PUT é 400 (sair de Approved é revogar); assinaturas intactas', async () => {
    await semear('Approved', true);
    for (const status of ['Draft', 'Under Review', null]) {
      const r = await chamar('PUT', URL_PUT, editor, { status });
      expect(r.status, `status ${status}: ${await r.clone().text()}`).toBe(400);
    }
    expect(await linha()).toMatchObject({ status: 'Approved', dpo_signature: 'Ana DPO', ceo_signature: 'Beto CEO', dpo_approved_by: 'Ana DPO' });
  }, 30_000);

  it('DPIA aprovada: editar só o conteúdo segue a regra de antes (grava; status e assinaturas não mudam)', async () => {
    await semear('Approved', true);
    const r = await chamar('PUT', URL_PUT, editor, { processing_name: 'Folha v3' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await linha()).toMatchObject({ status: 'Approved', dpo_signature: 'Ana DPO', ceo_signature: 'Beto CEO', processing_name: 'Folha v3' });
  }, 30_000);
});
