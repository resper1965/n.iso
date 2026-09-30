import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/** Spec 2026-09-30-agente-paridade-consultor: paridade de consultor, preso a UM projeto. */
const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: P } as any);
const confirmado = { 'X-Agente-Confirmado': '1' };
const json = { 'Content-Type': 'application/json' };

describe('Agente com paridade de consultor, preso ao projeto', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-a','Cliente A','SGSI A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-b','Cliente B','SGSI B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a','p-a','Servidor','Queda'), ('r-a2','p-a','Banco','Vazamento'), ('r-b','p-b','Segredo de B','Vazamento')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-b','p-b','b.md','evidence/p-b/b.md','h','x')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctl-a','p-a','ISO 27001','Controle A','Missing'), ('ctl-b','p-b','ISO 27001','Controle B','Missing')`),
    ]);
  });

  it('apagar sem confirmação é recusado e explica o que fazer', async () => {
    const r = await comoAgente('/api/v1/risks/r-a', { method: 'DELETE' });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('confirmado_pelo_usuario');
  });

  it('apagar com confirmação apaga, e a trilha leva o projeto e o agente', async () => {
    const r = await comoAgente('/api/v1/risks/r-a2', { method: 'DELETE', headers: confirmado });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a2'`).first()).toBeNull();
    const log = await env.DB.prepare(`SELECT actor, project_id FROM audit_logs WHERE action='agente.exclusao'`).first<any>();
    expect(log?.project_id).toBe('p-a');
    expect(log?.actor).toMatch(/^agente de /);
  });

  it('gerar em lote sem confirmação é recusado', async () => {
    const r = await comoAgente('/api/v1/projects/p-a/generate-policies-bulk', { method: 'POST', headers: json, body: '{}' });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('confirmado_pelo_usuario');
  });

  it('recurso de outro projeto por id direto: nem lendo, nem apagando com confirmação', async () => {
    expect((await comoAgente('/api/v1/evidence/ev-b/content')).status).toBe(403);
    expect((await comoAgente('/api/v1/risks/r-b', { method: 'DELETE', headers: confirmado })).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-b'`).first()).not.toBeNull();
    expect((await comoAgente('/api/v1/projects/p-b/risks')).status).toBe(403);
  });

  it('listagens globais só mostram o projeto da conexão', async () => {
    for (const caminho of ['/api/v1/portfolio', '/api/v1/projects', '/api/v1/controls']) {
      const r = await comoAgente(caminho);
      const texto = await r.text();
      expect(r.status, caminho).toBe(200);
      expect(texto, caminho).not.toContain('p-b');
      expect(texto, caminho).not.toContain('Cliente B');
    }
  });

  it('rotas fora do alcance são recusadas mesmo com confirmação', async () => {
    for (const [metodo, caminho] of [
      ['GET', '/api/v1/users'],
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/dashboard'],
      ['GET', '/api/v1/assessments'],
      ['GET', '/api/v1/leads'],
      ['GET', '/api/v1/proposals'],
      ['GET', '/api/v1/projects/p-a/sso'],
      ['PUT', '/api/v1/projects/p-a/security-policy'],
      ['POST', '/api/v1/projects/p-a/scim-token'],
      ['GET', '/api/v1/projects/p-a/api-keys'],
      ['GET', '/api/v1/projects/p-a/webhooks'],
      ['GET', '/api/v1/projects/p-a/agentes'],
      ['DELETE', '/api/v1/webhooks/x'],
      ['POST', '/api/v1/webhooks/test/x'],
      ['POST', '/api/v1/auth/reset-password-first'],
      ['POST', '/api/v1/legal/accept'],
      ['GET', '/api/v1/notifications'],
      ['POST', '/api/v1/auth/mfa/verify'],
      ['POST', '/api/v1/projects/p-a/auditor-token'],
    ] as const) {
      const r = await comoAgente(caminho, { method: metodo, headers: { ...confirmado, ...json }, body: metodo === 'GET' ? undefined : '{}' });
      expect(r.status, `${metodo} ${caminho}`).toBe(403);
    }
  });

  it('eliminar titular (anonimização) exige confirmação', async () => {
    const corpo = JSON.stringify({ identificador: 'x@y.lat', justificativa: 'pedido do titular' });
    const sem = await comoAgente('/api/v1/projects/p-a/data-subject/erase', { method: 'POST', headers: json, body: corpo });
    expect(sem.status).toBe(403);
    expect((await sem.json<any>()).error).toContain('confirmado_pelo_usuario');
    const com = await comoAgente('/api/v1/projects/p-a/data-subject/erase', { method: 'POST', headers: { ...json, ...confirmado }, body: corpo });
    expect(com.status).not.toBe(403);
  });

  it('o agente não cria projeto, mas a listagem continua escopada', async () => {
    for (const caminho of ['/api/v1/projects', '/api/v1/projects/']) {
      const r = await comoAgente(caminho, { method: 'POST', headers: { ...confirmado, ...json }, body: JSON.stringify({ client_name: 'Novo', project_name: 'Novo' }) });
      expect(r.status, caminho).toBe(403);
    }
    const lista = await comoAgente('/api/v1/projects');
    expect(lista.status).toBe(200);
    const texto = await lista.text();
    expect(texto).toContain('p-a');
    expect(texto).not.toContain('p-b');
  });

  it('revogar aprovações exige confirmação', async () => {
    const corpo = JSON.stringify({ role: 'ciso', reason: 'revisão do escopo', control_ids: ['ctl-a'] });
    const sem = await comoAgente('/api/v1/projects/p-a/revoke-approvals', { method: 'POST', headers: json, body: corpo });
    expect(sem.status).toBe(403);
    expect((await sem.json<any>()).error).toContain('confirmado_pelo_usuario');
    const com = await comoAgente('/api/v1/projects/p-a/revoke-approvals', { method: 'POST', headers: { ...json, ...confirmado }, body: corpo });
    expect(com.status, await com.clone().text()).not.toBe(403);
  });

  it('escrita de auditor continua recusada', async () => {
    const r = await comoAgente('/api/v1/audits/x/findings', { method: 'POST', headers: { ...confirmado, ...json }, body: '{}' });
    expect(r.status).toBe(403);
  });

  it('o cabeçalho de confirmação é inerte fora do agente', async () => {
    const auth = await sessionFor({ id: 'u-cli', email: 'cli@a.lat', role: 'org_user', client_project_id: 'p-a' });
    const r = await worker.fetch(new Request('http://localhost/api/v1/risks/r-a', { method: 'DELETE', headers: { ...auth, ...confirmado } }), workerEnv() as any);
    expect(r.status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).not.toBeNull();
  });

  it('direitos do titular: agente alcança o próprio projeto, não o outro', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/data-subject?identificador=x@y.lat')).status).not.toBe(403);
    expect((await comoAgente('/api/v1/projects/p-b/data-subject?identificador=x@y.lat')).status).toBe(403);
  });

  it('a trilha nomeia agente, cliente e projeto', async () => {
    const r = await comoAgente('/api/v1/projects/p-a/risks', { method: 'POST', headers: json, body: JSON.stringify({ asset: 'Rede', threat: 'Intrusão' }) });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE actor LIKE 'agente de%' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(log?.actor).toBe('agente de cons@ness.lat (Cliente A / SGSI A)');
  });
});
