import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// Lead e assessment são da organização comercial: o de outra organização não aparece
// na lista nem abre por id (404), como as propostas e o catálogo.
const pedir = (caminho: string, h: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);

describe('leads e assessments por organização', () => {
  let com: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads (id, company_name) VALUES ('lead-a','Nossa')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, org_id) VALUES ('lead-ob','Da outra','org_b')`),
      env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name) VALUES ('as-a','lead-a','Nossa')`),
      env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, org_id) VALUES ('as-ob','lead-ob','Da outra','org_b')`),
    ]);
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
  }, 60_000);

  it('GET /leads e /leads/:id só da organização do usuário', async () => {
    const lista = await (await pedir('/api/v1/leads', com)).json<any[]>();
    expect(lista.map((l) => l.id)).toEqual(['lead-a']);
    expect((await pedir('/api/v1/leads/lead-a', com)).status).toBe(200);
    expect((await pedir('/api/v1/leads/lead-ob', com)).status).toBe(404);
  }, 30_000);

  it('GET /assessments e /assessments/:id só da organização do usuário', async () => {
    const lista = await (await pedir('/api/v1/assessments', com)).json<any[]>();
    expect(lista.map((a) => a.id)).toEqual(['as-a']);
    expect((await pedir('/api/v1/assessments/as-a', com)).status).toBe(200);
    expect((await pedir('/api/v1/assessments/as-ob', com)).status).toBe(404);
  }, 30_000);
});
