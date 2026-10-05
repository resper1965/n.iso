import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * O segredo do webhook é devolvido UMA vez, na criação (integrations.ts). A
 * listagem não pode devolvê-lo de novo: ela é legível por qualquer membro do
 * projeto, inclusive papel somente leitura, e pelo agente de IA.
 */
describe('Webhooks: o segredo não volta na listagem', () => {
  let sid: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-w','W','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret) VALUES ('w-1','p-w','https://exemplo.com/h','evidence.created','segredo-que-nao-pode-voltar')`),
    ]);
    sid = await sessionFor({ id: 'u-w', email: 'w@x.com', role: 'org_admin', client_project_id: 'p-w' });
  });

  it('GET lista a configuração sem o campo secret', async () => {
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-w/webhooks', { headers: sid }), workerEnv() as any);
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain('segredo-que-nao-pode-voltar');
    const { webhooks } = JSON.parse(texto);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]).toMatchObject({ id: 'w-1', url: 'https://exemplo.com/h', events: 'evidence.created', status: 'Active' });
    expect(webhooks[0]).not.toHaveProperty('secret');
  });
});
