import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir, workerEnv } from './helpers/d1';

/**
 * Três projetos de produção ficaram com `client_name` vazio: o PUT do perfil da
 * empresa gravava `client_name || ''`, então salvar o formulário sem o campo
 * (ou com ele em branco) APAGAVA o nome do cliente. Onde o nome aparece — login
 * OAuth do agente, niso_contexto, trilha "agente de x (cliente)" — saía vazio.
 */
const url = '/api/v1/projects/p-nome/company-profile';
const nome = async (id = 'p-nome') =>
  (await env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(id).first<{ client_name: string }>())!.client_name;

describe('Nome do cliente nunca é apagado nem exibido vazio', () => {
  let s: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-nome','Cliente Original','Projeto Nome','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-vazio','','Plataforma Sem Nome','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-vazio','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-v','u-c','p-vazio', datetime('now','+30 days'))`),
    ]);
    s = { ...(await sessionFor({ id: 'u-a', email: 'adm@ness.lat', role: 'platform_admin' })), 'Content-Type': 'application/json' };
  });

  it('salvar o perfil SEM o campo não apaga o nome do cliente', async () => {
    const res = await pedir(worker, url, { method: 'PUT', headers: s, body: JSON.stringify({ sector: 'Saúde' }) });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await nome()).toBe('Cliente Original');
  });

  it('salvar o perfil com o nome EM BRANCO não apaga o nome do cliente', async () => {
    await pedir(worker, url, { method: 'PUT', headers: s, body: JSON.stringify({ client_name: '   ' }) });
    expect(await nome()).toBe('Cliente Original');
  });

  it('salvar o perfil com um nome novo troca o nome', async () => {
    await pedir(worker, url, { method: 'PUT', headers: s, body: JSON.stringify({ client_name: 'Cliente Novo' }) });
    expect(await nome()).toBe('Cliente Novo');
  });

  it('agente em projeto sem nome de cliente aparece com o nome do projeto na trilha', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/projects/p-vazio/risks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'Servidor', threat: 'Indisponibilidade', impact: 3, probability: 2 }),
      }),
      { ...workerEnv(), AGENTE: { userId: 'u-c', email: 'cons@ness.lat', projectId: 'p-vazio', concessaoId: 'c-v' } } as any
    );
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE actor LIKE 'agente de%' ORDER BY rowid DESC LIMIT 1`).first<{ actor: string }>();
    expect(log!.actor).toBe('agente de cons@ness.lat (Plataforma Sem Nome)');
  });
});
