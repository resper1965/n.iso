import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir, workerEnv } from './helpers/d1';

const req = (c: string, i: RequestInit = {}) => pedir(worker, c, i);
const P = { userId: 'u-c', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

describe('Agentes com acesso ao projeto', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, cliente_mcp, expira_em) VALUES ('c-1','u-c','p-a','Claude Code', datetime('now','+30 days'))`),
    ]);
  });

  it('org_admin do cliente vê o agente', async () => {
    const s = await sessionFor({ id: 'u-o', email: 'pessoa@exemplo.com.br', role: 'org_admin', client_project_id: 'p-a' });
    const lista = await (await req('/api/v1/projects/p-a/agentes', { headers: s })).json<any[]>();
    expect(lista).toHaveLength(1);
    expect(lista[0].consultor).toBe('cons@ness.lat');
    expect(lista[0].cliente_mcp).toBe('Claude Code');
  });

  it('org_admin de outro cliente não vê', async () => {
    const s = await sessionFor({ id: 'u-x', email: 'x@outro.com', role: 'org_admin', client_project_id: 'p-b' });
    expect((await req('/api/v1/projects/p-a/agentes', { headers: s })).status).toBe(403);
  });

  it('org_user (read-only) não revoga', async () => {
    const s = await sessionFor({ id: 'u-u', email: 'pessoa@exemplo.com.br', role: 'org_user', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-1/revogar', { method: 'POST', headers: s })).status).toBe(403);
  });

  it('org_admin revoga, fica na trilha, e o agente cai na chamada seguinte', async () => {
    const s = await sessionFor({ id: 'u-o', email: 'pessoa@exemplo.com.br', role: 'org_admin', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-1/revogar', { method: 'POST', headers: s })).status).toBe(200);
    const log = await env.DB.prepare(`SELECT action FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ action: string }>();
    expect(log!.action).toBe('agente.revogado');
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-a/risks'), { ...workerEnv(), AGENTE: P } as any);
    expect(r.status).toBe(401);
  });

  it('revogar concessão de outro projeto pelo caminho deste é 404', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-b','u-c','p-b', datetime('now','+30 days'))`).run();
    const s = await sessionFor({ id: 'u-o', email: 'pessoa@exemplo.com.br', role: 'org_admin', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-b/revogar', { method: 'POST', headers: s })).status).toBe(404);
  });
});
