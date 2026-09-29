// Solicitação de mudança (engajamento twyn) — dois itens:
//  1. `scope` do projeto gravável via PUT /projects/:id (era ignorado).
//  2. PUT /projects/:id/phases/:num deixa de ser no-op silencioso: a rota casa
//     por phase_number (0..N); um num inexistente (ex.: phase_id no lugar do
//     número) casava 0 linhas e devolvia {ok:true} — agora é 404. (`notes` já
//     era gravável; o bug era a chave errada na URL.)
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('PUT /projects/:id — scope gravável', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, scope) VALUES ('pr1','C','ISO 27001:2022','Controller','Active','... (us-east-1) ...')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  it('grava scope e o GET reflete', async () => {
    const novo = 'Face ID Platform API + AWS Infrastructure (sa-east-1)';
    const res = await app.fetch(new Request('http://localhost/api/v1/projects/pr1', { method: 'PUT', headers, body: JSON.stringify({ scope: novo }) }), env as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const proj = await env.DB.prepare("SELECT scope FROM projects WHERE id='pr1'").first<any>();
    expect(proj.scope).toBe(novo);
  });
});

describe('PUT /projects/:id/phases/:num — grava por número, 404 se inexistente', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr1','C','ISO 27001:2022','Controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status) VALUES ('ph-abc','pr1',0,'Mobilização','pending')`).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const put = (num: string, body: unknown) =>
    app.fetch(new Request(`http://localhost/api/v1/projects/pr1/phases/${num}`, { method: 'PUT', headers, body: JSON.stringify(body) }), env as any);

  it('grava notes usando o phase_number (0)', async () => {
    const res = await put('0', { notes: 'Nota da fase 0' });
    expect(res.status).toBe(200);
    const ph = await env.DB.prepare("SELECT notes FROM project_phases WHERE id='ph-abc'").first<any>();
    expect(ph.notes).toBe('Nota da fase 0');
  });

  it('404 quando o num não casa (ex.: phase_id no lugar do número) — sem no-op silencioso', async () => {
    const res = await put('ph-abc', { notes: 'não deve gravar' });
    expect(res.status).toBe(404);
    const ph = await env.DB.prepare("SELECT notes FROM project_phases WHERE id='ph-abc'").first<any>();
    expect(ph.notes).toBeNull(); // nada foi gravado
  });
});
