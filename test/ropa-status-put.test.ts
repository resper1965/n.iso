import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * O PUT do ROPA gravava `body.status || 'Draft'`: status livre (aprovava sem senha nem autoridade) e,
 * sem `status` no corpo, devolvia um ROPA aprovado a rascunho com as assinaturas ainda na linha.
 * Regra (a mesma da DPIA): pelo PUT o status só transita entre 'Draft' e 'Under Review'; ausente,
 * não muda; ROPA aprovado só sai de 'Approved' por "Revogar aprovação".
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

describe('PUT /ropa/:id não aprova nem reverte aprovação', () => {
  let editor: Record<string, string>;
  const URL_PUT = '/api/v1/ropa/ro-s';
  const linha = () => env.DB.prepare(`SELECT status, ciso_approved_by, processing_purpose, recipients FROM ropa_records WHERE id='ro-s'`).first<any>();
  const semear = (status: string, aprovado = false) =>
    env.DB.batch([
      env.DB.prepare(`DELETE FROM ropa_records`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, recipients, status, ciso_approved_by) VALUES ('ro-s','p-s','Folha','RH',?,?)`)
        .bind(status, aprovado ? 'Ana CISO' : null),
    ]);

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-s','S','ISO 27701','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-ed','ed@x.com','x','Editor','org_admin','p-s')`),
    ]);
    editor = await sessionFor({ id: 'u-ed', email: 'ed@x.com', role: 'org_admin', client_project_id: 'p-s' });
  });

  it("status 'Approved' em ROPA Draft: 400 apontando o fluxo de aprovação; nada muda", async () => {
    await semear('Draft');
    const r = await chamar('PUT', URL_PUT, editor, { processing_purpose: 'Outra', status: 'Approved' });
    expect(r.status, await r.clone().text()).toBe(400);
    expect(JSON.stringify(await r.json())).toMatch(/aprova/i);
    expect(await linha()).toEqual({ status: 'Draft', ciso_approved_by: null, processing_purpose: 'Folha', recipients: 'RH' });
  }, 30_000);

  it('ROPA aprovado editado sem status: 200, segue Approved, assinatura e campo ausente intactos', async () => {
    await semear('Approved', true);
    const r = await chamar('PUT', URL_PUT, editor, { processing_purpose: 'Folha v2' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await linha()).toEqual({ status: 'Approved', ciso_approved_by: 'Ana CISO', processing_purpose: 'Folha v2', recipients: 'RH' });
  }, 30_000);

  it('ROPA aprovado com status Draft: 400 apontando "Revogar aprovação"; assinatura intacta', async () => {
    await semear('Approved', true);
    const r = await chamar('PUT', URL_PUT, editor, { processing_purpose: 'Folha', status: 'Draft' });
    expect(r.status, await r.clone().text()).toBe(400);
    expect(JSON.stringify(await r.json())).toMatch(/Revogar aprovação/);
    expect(await linha()).toMatchObject({ status: 'Approved', ciso_approved_by: 'Ana CISO' });
  }, 30_000);

  it("Draft -> 'Under Review' continua pelo PUT", async () => {
    await semear('Draft');
    const r = await chamar('PUT', URL_PUT, editor, { processing_purpose: 'Folha', status: 'Under Review' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await linha()).status).toBe('Under Review');
  }, 30_000);
});
