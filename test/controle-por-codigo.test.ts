import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { idDoControle } from '../src/helpers';

describe('idDoControle', () => {
  beforeEach(async () => {
    await applySchema(); await resetData();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES
      ('p1','C','ISO 27001:2022','Controller','Active'), ('p2','C','ISO 27001:2022','Controller','Active'),
      ('p3','C','ISO 27001:2022','Controller','Active'), ('p4','C','ISO 27001:2022','Controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES
      ('ctrl-a51','p1','ISO 27001:2022','A.5.1 Políticas'),
      ('A.5.1','p2','ISO 27001:2022','A.5.1 Políticas'),
      ('ctrl_b_a51','p3','ISO 27001:2022','A.5.1 Políticas'),
      ('x9f2k1','p4','ISO 27001:2022','A.5.1 — Políticas'),
      ('y7','p4','ISO 27001:2022','A.5.10 — Uso aceitável')`).run();
  });

  it('acha o controle pelos quatro formatos de id', async () => {
    expect(await idDoControle(env.DB, 'p1', 'A.5.1')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p2', 'A.5.1')).toBe('A.5.1');
    expect(await idDoControle(env.DB, 'p3', 'A.5.1')).toBe('ctrl_b_a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.1')).toBe('x9f2k1');
  });
  it('aceita o próprio id e não confunde A.5.1 com A.5.10', async () => {
    expect(await idDoControle(env.DB, 'p1', 'ctrl-a51')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.10')).toBe('y7');
  });
  it('não atravessa projeto', async () => {
    expect(await idDoControle(env.DB, 'p4', 'ctrl-a51')).toBeNull();
  });
});

describe('rotas de política com id de outro formato', () => {
  it('lista e restaura versão de controle ctrl_b_a51 pelo código A.5.1', async () => {
    await applySchema(); await resetData(); await resetSessions();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p3','C','ISO 27001:2022','Controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','c@ness.dev','x','C','platform_admin')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl_b_a51','p3','ISO 27001:2022','A.5.1 Políticas')`).run();
    await env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('v1','p3','ctrl_b_a51',1,'texto v1','x')`).run();
    const headers = await sessionFor({ id: 'u1', email: 'c@ness.dev', role: 'platform_admin' });
    const call = (path: string, init: RequestInit = {}) => worker.fetch(
      new Request(`http://localhost${path}`, { ...init, headers: { ...headers, 'Content-Type': 'application/json' } }),
      { ...env, AI: { run: async () => ({}) } } as any);

    const lista = await call('/api/v1/projects/p3/controls/A.5.1/versions');
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as any[]).length).toBe(1);

    const rest = await call('/api/v1/projects/p3/controls/A.5.1/restore-version', { method: 'POST', body: JSON.stringify({ version_id: 'v1' }) });
    expect(rest.status).toBe(200);
    const c = await env.DB.prepare(`SELECT description FROM compliance_controls WHERE id='ctrl_b_a51'`).first<any>();
    expect(c.description).toBe('texto v1');
  });
});
