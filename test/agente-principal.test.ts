import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor, pedir } from './helpers/d1';
import { hashPassword } from '../src/helpers';

/**
 * Principal "agente": requisição interna criada pelo /mcp com `env.AGENTE`.
 * De fora ninguém injeta `env`, então não há cabeçalho a forjar.
 */
const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

function comoAgente(caminho: string, init: RequestInit = {}, props = P) {
  return worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: props } as any);
}

describe('Principal agente', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Cliente B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','CONS@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
  });

  it('lê o próprio projeto', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/risks')).status).toBe(200);
  });

  it('não alcança outro projeto', async () => {
    expect((await comoAgente('/api/v1/projects/p-b/risks')).status).toBe(403);
  });

  it('não apaga nada', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/risks/qualquer', { method: 'DELETE' })).status).toBe(403);
  });

  it('não gera políticas em lote', async () => {
    const res = await comoAgente('/api/v1/projects/p-a/generate-policies-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });

  // Revisão final, achado 1: o Hono decodifica %XX antes de rotear; a recusa
  // tem de olhar o caminho decodificado, não o cru.
  it('não gera em lote nem por caminho percent-encoded', async () => {
    for (const caminho of [
      '/api/v1/projects/p-a/%67enerate-policies-bulk',
      '/api/v1/projects/p-a/generate-policies-bul%6B',
    ]) {
      const res = await comoAgente(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      expect(res.status, caminho).toBe(403);
    }
  });

  it('não gere o próprio acesso por caminho percent-encoded', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/%61gentes')).status).toBe(403);
  });

  it('caminho com travessia codificada é recusado', async () => {
    for (const caminho of ['/api/v1/projects/p-a/%2E%2E/p-b/risks', '/api/v1/projects/p-a%2Frisks']) {
      expect((await comoAgente(caminho)).status, caminho).toBe(403);
    }
  });

  it('não registra achado de auditoria', async () => {
    const res = await comoAgente('/api/v1/audits/x/findings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('não gere o próprio acesso', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/agentes')).status).toBe(403);
  });

  it('grava como "agente de <email> (<cliente>)" na trilha', async () => {
    const res = await comoAgente('/api/v1/projects/p-a/risks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'Servidor de arquivos', threat: 'Risco do agente', impact: 3, probability: 3 }),
    });
    expect(res.status).toBeLessThan(300);
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ actor: string }>();
    expect(log!.actor).toBe('agente de cons@ness.lat (Cliente A)');
  });

  it('concessão revogada derruba o agente', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, revogado_em) VALUES ('c-rev','u-cons','p-a', datetime('now','+30 days'), datetime('now'))`).run();
    const res = await comoAgente('/api/v1/projects/p-a/risks', {}, { ...P, concessaoId: 'c-rev' });
    expect(res.status).toBe(401);
  });

  it('concessão expirada derruba o agente', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-exp','u-cons','p-a', datetime('now','-1 minute'))`).run();
    expect((await comoAgente('/api/v1/projects/p-a/risks', {}, { ...P, concessaoId: 'c-exp' })).status).toBe(401);
  });

  it('consultor removido da governança perde o agente na chamada seguinte', async () => {
    await env.DB.prepare(`DELETE FROM project_governance WHERE project_id = 'p-a'`).run();
    const res = await comoAgente('/api/v1/projects/p-a/risks');
    expect(res.status).toBe(401);
    expect((await res.json<any>()).error).toContain('refaça');
  });

  // Revisão final, item 4: trocar a senha revoga o agente, como revoga a sessão.
  it('troca de senha derruba o agente', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-senha','senha@ness.lat',?,'Senha','consultor')`).bind(await hashPassword('senha-antiga-123')),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Senha','senha@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-senha','u-senha','p-a', datetime('now','+30 days'))`),
    ]);
    const Ps = { userId: 'u-senha', email: 'senha@ness.lat', projectId: 'p-a', concessaoId: 'c-senha' };
    expect((await comoAgente('/api/v1/projects/p-a/risks', {}, Ps)).status).toBe(200);
    const s = await sessionFor({ id: 'u-senha', email: 'senha@ness.lat', role: 'consultor' });
    const troca = await pedir(worker, '/api/v1/auth/change-password', {
      method: 'POST', headers: { ...s, 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'senha-antiga-123', newPassword: 'Senha-Nova-Forte-2026!' }),
    });
    expect(troca.status, await troca.clone().text()).toBe(200);
    expect((await comoAgente('/api/v1/projects/p-a/risks', {}, Ps)).status).toBe(401);
    const conc = await env.DB.prepare(`SELECT revogado_por FROM agente_concessoes WHERE id = 'c-senha'`).first<any>();
    expect(conc.revogado_por).toBe('troca de senha');
  });
});
