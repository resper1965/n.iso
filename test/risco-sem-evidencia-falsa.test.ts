import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Tratar risco como "Mitigar" criava uma linha em `evidence` sem arquivo
 * (r2_key 'pending_upload', hash 'none'), contada como evidência pendente.
 * Tarefa não é evidência: o efeito colateral saiu.
 */
const P = 'p-risco';
let admin: Record<string, string>;
const evidencias = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM evidence WHERE project_id = ?').bind(P).first<{ n: number }>())!.n;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P).run();
  admin = { ...(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
});

describe('risco com tratamento Mitigar', () => {
  it('criar e atualizar não criam evidência', async () => {
    const criado = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/risks`, {
      method: 'POST', headers: admin, body: JSON.stringify({ asset: 'Servidor', threat: 'Ransomware', treatment: 'Mitigate' }),
    }), workerEnv());
    expect(criado.status, await criado.clone().text()).toBe(201);
    const { id } = await criado.json<{ id: string }>();
    expect(await evidencias()).toBe(0);

    const editado = await worker.fetch(new Request(`http://localhost/api/v1/risks/${id}`, {
      method: 'PUT', headers: admin, body: JSON.stringify({ asset: 'Servidor', threat: 'Vazamento', treatment: 'Mitigate' }),
    }), workerEnv());
    expect(editado.status, await editado.clone().text()).toBe(200);
    expect(await evidencias()).toBe(0);
  });
});
