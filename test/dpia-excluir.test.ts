// A tela de DPIA chamava DELETE /api/v1/dpia/:id, que não existia (404 em silêncio).
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('DELETE /api/v1/dpia/:id', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001','controller','Active')`).run();
  });
  const del = (id: string) => app.fetch(new Request(`http://localhost/api/v1/dpia/${id}`, { method: 'DELETE', headers }), env as any);

  it('apaga DPIA em rascunho e grava a trilha com o projeto', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d1','p1','Sistema','Draft')`).run();
    const res = await del('d1');
    expect(res.status).toBe(200);
    expect(await env.DB.prepare(`SELECT id FROM dpia_assessments WHERE id='d1'`).first()).toBeNull();
    const log = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action='registro.excluido' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(log?.project_id).toBe('p1');
  });

  it('recusa DPIA aprovado com 409 e não apaga', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d2','p1','Sistema','Approved')`).run();
    const res = await del('d2');
    expect(res.status).toBe(409);
    expect(await env.DB.prepare(`SELECT id FROM dpia_assessments WHERE id='d2'`).first()).not.toBeNull();
  });
});
