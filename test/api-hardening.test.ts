// Cobre a leva de hardening da API v1 (triagem de defeitos reportados):
//  1) repository_token nunca sai no corpo de GET /projects[/:id];
//  2) PUT /controls/:id com maturity → 400 explícito (não no-op mudo);
//  4) PUT /projects/:id com standards → 400 explícito (não "Nothing to update");
//  5) PUT /evidence/:id re-associa a evidência (com aterramento de tenant).
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('API hardening (triagem de defeitos)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, repository_token) VALUES ('p1','C','ISO 27001:2022','Controller','Active','ghp_SUPERSECRET')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','C2','ISO 27001:2022','Controller','Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctrl-1','p1','ISO 27001:2022','A.5.1 X','Missing')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctrl-2','p1','ISO 27001:2022','A.5.9 Y','Missing')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctrl-p2','p2','ISO 27001:2022','A.5.1 Z','Missing')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, evaluation_status, evaluation_score, uploaded_by) VALUES ('ev-1','p1','ctrl-1','doc.pdf','k','h','application/pdf',10,'conforming',90,'u')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'a@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (method: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('1) GET /projects/:id NÃO devolve repository_token; expõe só o booleano', async () => {
    const b = (await (await req('GET', '/api/v1/projects/p1')).json()) as any;
    expect(b.repository_token).toBeUndefined();
    expect(b.repository_token_set).toBe(true);
    // e na listagem também
    const lista = (await (await req('GET', '/api/v1/projects')).json()) as any[];
    expect(lista.every((p) => p.repository_token === undefined)).toBe(true);
  });

  it('2) PUT /controls/:id com maturity → 400 explícito, sem persistir', async () => {
    const res = await req('PUT', '/api/v1/controls/ctrl-1', { maturity: 4 });
    expect(res.status).toBe(400);
    const b = (await res.json()) as any;
    expect(b.error).toMatch(/maturity/i);
    const ctrl = await env.DB.prepare("SELECT maturity FROM compliance_controls WHERE id='ctrl-1'").first<{ maturity: number }>();
    expect(ctrl!.maturity).toBe(0); // não persistiu
  });

  it('4) PUT /projects/:id com standards → 400 explícito (não "Nothing to update")', async () => {
    const res = await req('PUT', '/api/v1/projects/p1', { standards: 'ISO 27701:2025' });
    expect(res.status).toBe(400);
    const b = (await res.json()) as any;
    expect(b.error).toMatch(/standards/i);
    expect(b.error).not.toMatch(/Nothing to update/i);
  });

  it('5) PUT /evidence/:id re-associa a evidência e reseta a avaliação', async () => {
    const res = await req('PUT', '/api/v1/evidence/ev-1', { control_id: 'ctrl-2' });
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.relinked).toBe(true);
    const ev = await env.DB.prepare("SELECT control_id, evaluation_status, evaluation_score FROM evidence WHERE id='ev-1'").first<any>();
    expect(ev.control_id).toBe('ctrl-2');
    expect(ev.evaluation_status).toBe('pending'); // avaliação anterior invalidada
    expect(ev.evaluation_score).toBeNull();
  });

  it('5b) PUT /evidence/:id para controle de OUTRO projeto → 403 (aterramento)', async () => {
    const res = await req('PUT', '/api/v1/evidence/ev-1', { control_id: 'ctrl-p2' });
    expect(res.status).toBe(403);
    const ev = await env.DB.prepare("SELECT control_id FROM evidence WHERE id='ev-1'").first<any>();
    expect(ev.control_id).toBe('ctrl-1'); // inalterado
  });
});
