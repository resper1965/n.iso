import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * F9 do plano de fechamento (2026-10): a tela decide "Assinar" por dpo_signature/ceo_signature, mas a rota
 * ignorava o `role` e gravava só dpo_approved_by/at. O botão nunca sumia e a Direção não conseguia assinar.
 * Espelha a aprovação de ROPA: o papel vem no corpo e a autoridade, da matriz de governança do projeto.
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

describe('aprovação de DPIA grava o papel que assinou', () => {
  let dpo: Record<string, string>, ceo: Record<string, string>, admin: Record<string, string>, comum: Record<string, string>;
  const URL_DP = '/api/v1/projects/p-a/dpia/dp-a/approve';
  const linha = () => env.DB.prepare(`SELECT * FROM dpia_assessments WHERE id='dp-a'`).first<any>();
  const semear = () =>
    env.DB.batch([
      env.DB.prepare(`DELETE FROM dpia_assessments`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('dp-a','p-a','Sistema A','Under Review')`),
    ]);

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27701','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-dpo','dpo@x.com','x','Ana DPO','org_admin','p-a'), ('u-ceo','ceo@x.com','x','Beto CEO','org_admin','p-a'), ('u-pa','pa@ness.lat','x','PA','platform_admin',NULL), ('u-cm','cm@x.com','x','CM','org_admin','p-a')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Ana DPO','dpo@x.com','cliente','DPO'), ('p-a','Beto CEO','ceo@x.com','cliente','CEO')`),
    ]);
    dpo = await sessionFor({ id: 'u-dpo', email: 'dpo@x.com', role: 'org_admin', client_project_id: 'p-a' });
    ceo = await sessionFor({ id: 'u-ceo', email: 'ceo@x.com', role: 'org_admin', client_project_id: 'p-a' });
    comum = await sessionFor({ id: 'u-cm', email: 'cm@x.com', role: 'org_admin', client_project_id: 'p-a' });
    admin = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  });

  it('role ciso grava dpo_signature e dpo_approved_by/at; o status segue Under Review', async () => {
    await semear();
    const r = await chamar('POST', URL_DP, dpo, { role: 'ciso' });
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await linha();
    expect(l.dpo_signature).toBe('Ana DPO');
    expect(l.dpo_approved_by).toBe('Ana DPO');
    expect(l.dpo_approved_at).toBeTruthy();
    expect(l.ceo_signature).toBeNull();
    expect(l.status).toBe('Under Review');
  }, 30_000);

  it('depois role ceo grava ceo_signature e o status vira Approved', async () => {
    const r = await chamar('POST', URL_DP, ceo, { role: 'ceo' });
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await linha();
    expect(l.ceo_signature).toBe('Beto CEO');
    expect(l.dpo_signature).toBe('Ana DPO');
    expect(l.status).toBe('Approved');
  }, 30_000);

  it('role ausente ou inválido: 400', async () => {
    await semear();
    expect((await chamar('POST', URL_DP, dpo, {})).status).toBe(400);
    expect((await chamar('POST', URL_DP, dpo, { role: 'estagiario' })).status).toBe(400);
  }, 30_000);

  it('sem autoridade para o papel: 403 e nada é gravado', async () => {
    await semear();
    expect((await chamar('POST', URL_DP, dpo, { role: 'ceo' })).status).toBe(403);
    expect((await chamar('POST', URL_DP, ceo, { role: 'ciso' })).status).toBe(403);
    expect((await chamar('POST', URL_DP, comum, { role: 'ciso' })).status).toBe(403);
    expect((await chamar('POST', URL_DP, admin, { role: 'ciso' })).status).toBe(403);
    const l = await linha();
    expect([l.dpo_signature, l.ceo_signature, l.dpo_approved_by]).toEqual([null, null, null]);
    expect(l.status).toBe('Under Review');
  }, 30_000);

  it('deixa trilha dpia.approved com o papel e o projeto', async () => {
    await semear();
    const antes = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action='dpia.approved'`).first<any>()).n;
    await chamar('POST', URL_DP, dpo, { role: 'ciso' });
    await chamar('POST', URL_DP, ceo, { role: 'ceo' });
    const { results } = await env.DB.prepare(`SELECT actor, project_id, details FROM audit_logs WHERE action='dpia.approved' ORDER BY rowid`).all<any>();
    expect(results).toHaveLength(antes + 2);
    const [a, b] = results.slice(-2);
    expect(a).toMatchObject({ actor: 'dpo@x.com', project_id: 'p-a' });
    expect(a.details).toContain('ciso');
    expect(b).toMatchObject({ actor: 'ceo@x.com', project_id: 'p-a' });
    expect(b.details).toContain('ceo');
  }, 30_000);

  it('regressão F6: revogar limpa as duas assinaturas e volta a Draft', async () => {
    const r = await chamar('POST', '/api/v1/projects/p-a/dpia/dp-a/revoke-approval', await sessionFor({ id: 'u-cm', email: 'cm@x.com', role: 'org_admin', client_project_id: 'p-a' }), { reason: 'Refazer o RIPD' });
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await linha();
    expect([l.dpo_signature, l.ceo_signature, l.dpo_approved_by, l.dpo_approved_at]).toEqual([null, null, null, null]);
    expect(l.status).toBe('Draft');
  }, 30_000);
});
