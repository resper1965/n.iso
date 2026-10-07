import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('fornecedor na trilha', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001:2022','Controller','Active')`).run();
  });
  const req = (m: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method: m, headers, body: body ? JSON.stringify(body) : undefined }), env as any);
  const ultima = (acao: string) =>
    env.DB.prepare('SELECT project_id FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1').bind(acao).first<{ project_id: string | null }>();

  it('criar e editar gravam trilha com o projeto', async () => {
    const res = await req('POST', '/api/v1/projects/p1/vendors', { name: 'Nuvem SA' });
    const { id } = (await res.json()) as any;
    expect((await ultima('vendor.created'))?.project_id).toBe('p1');
    await req('PUT', `/api/v1/vendors/${id}`, { name: 'Nuvem SA', dpa_signed: 1 });
    expect((await ultima('vendor.updated'))?.project_id).toBe('p1');
  });
});
