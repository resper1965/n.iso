import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());

const P = '/api/v1/projects/pm1';
let plat: Record<string, string>, cadm: Record<string, string>, cadmB: Record<string, string>, consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b', 'B', 'b')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pm1', 'C', 'ISO 27001', 'controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES
      ('u-pa', 'pa@ness.lat', 'x', 'P', 'platform_admin', 'org_ness'),
      ('u-ca', 'ca@ness.lat', 'x', 'C', 'consultoria_admin', 'org_ness'),
      ('u-cb', 'cb@b.lat', 'x', 'C', 'consultoria_admin', 'org_b')`),
  ]);
  await designarConsultor('co@ness.lat', 'pm1');
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cadm = await sessionFor({ id: 'u-ca', email: 'ca@ness.lat', role: 'consultoria_admin' });
  cadmB = await sessionFor({ id: 'u-cb', email: 'cb@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  consultor = await sessionFor({ id: 'cons:co@ness.lat', email: 'co@ness.lat', role: 'consultor' });
});

describe('módulos por projeto, com teto na organização', () => {
  it('projeto novo tem iso e a organização contratou só iso', async () => {
    const r = await chamar(plat, 'GET', `${P}/modulos`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ habilitados: ['iso'], contratados: ['iso'] });
  });

  it('habilitar módulo não contratado: 409 (o teto vale até para o platform_admin)', async () => {
    expect((await chamar(plat, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(409);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(409);
  });

  it('só o platform_admin contrata; a consultoria não muda o próprio teto', async () => {
    expect((await chamar(cadm, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso', 'privacy'] })).status).toBe(403);
    const r = await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso', 'privacy'] });
    expect(r.status).toBe(200);
    expect(await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_inexistente/modulos', { modulos: ['iso'] }).then((x) => x.status)).toBe(404);
  });

  it('o administrador da consultoria habilita; consultor, outra consultoria e corpo ruim são recusados', async () => {
    expect((await chamar(consultor, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(403);
    expect([403, 404]).toContain((await chamar(cadmB, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/xpto`, { habilitado: true })).status).toBe(400);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: 'sim' })).status).toBe(400);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(200);
    expect(await (await chamar(plat, 'GET', `${P}/modulos`)).json()).toEqual({ habilitados: ['iso', 'privacy'], contratados: ['iso', 'privacy'] });
    const trilha = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = 'projeto.modulo' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(trilha?.project_id).toBe('pm1');
  });

  it('o projeto não fica sem módulo: desabilitar o último é 409', async () => {
    expect((await chamar(cadm, 'PUT', `${P}/modulos/iso`, { habilitado: false })).status).toBe(200);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: false })).status).toBe(409);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/iso`, { habilitado: true })).status).toBe(200);
  });

  it('baixar o contrato abaixo do que há habilitado: 409; depois de desligar, passa', async () => {
    const r = await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso'] });
    expect(r.status).toBe(409);
    expect((await r.json() as { error: string }).error).toMatch(/privacy.*1 projeto/);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: false })).status).toBe(200);
    expect((await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso'] })).status).toBe(200);
  });
});
