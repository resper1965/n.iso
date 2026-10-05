import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * Designar o consultor de um projeto é ato de quem contrata ou de quem opera a
 * plataforma — `platform_admin` ou o `org_admin` daquele cliente. Nunca do
 * próprio consultor.
 *
 * A governança do projeto é a fonte de "em quais clientes este consultor
 * atua" (escopo da chave de agente, spec da receita). Antes desta regra
 * qualquer sessão com acesso ao projeto a editava — e o consultor alcança todos
 * os projetos, então podia se autodesignar em qualquer cliente.
 *
 * Os demais papéis da governança (executivo, tech, operações) seguem
 * editáveis como antes.
 */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);
const json = (s: Record<string, string>) => ({ ...s, 'Content-Type': 'application/json' });
const url = '/api/v1/projects/p-gov/governance';
const consultorNaGov = { name: 'Fulano', email: 'fulano@ness.lat', role_category: 'consultor', job_title: 'Consultor' };

let consultor: Record<string, string>;
let admin: Record<string, string>;
let orgAdmin: Record<string, string>;

async function idDe(email: string): Promise<string> {
  const r = await env.DB.prepare('SELECT id FROM project_governance WHERE project_id = ? AND email = ?')
    .bind('p-gov', email).first<{ id: string }>();
  return r!.id;
}

describe('Designação de consultor na governança do projeto', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind('p-gov', 'Cliente Gov', 'ISO 27001', 'controller', 'Active').run();
    // D5: a conta do consultor existe e está ativa; o acesso ao projeto vem da designação abaixo.
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','fulano@ness.lat','x','Fulano','consultor')`).run();
    consultor = json(await sessionFor({ id: 'u-c', email: 'fulano@ness.lat', role: 'consultor' }));
    admin = json(await sessionFor({ id: 'u-a', email: 'adm@ness.lat', role: 'platform_admin' }));
    orgAdmin = json(await sessionFor({ id: 'u-o', email: 'dono@cliente.com', role: 'org_admin', client_project_id: 'p-gov' }));
  });

  it('consultor NÃO se autodesigna consultor do projeto', async () => {
    const res = await req(url, { method: 'POST', headers: consultor, body: JSON.stringify(consultorNaGov) });
    expect(res.status).toBe(403);
    const linha = await env.DB.prepare(`SELECT count(*) AS n FROM project_governance WHERE project_id = 'p-gov' AND role_category = 'consultor'`).first<{ n: number }>();
    expect(linha!.n, 'a designação foi gravada apesar do 403').toBe(0);
  });

  it('platform_admin designa o consultor', async () => {
    const res = await req(url, { method: 'POST', headers: admin, body: JSON.stringify(consultorNaGov) });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it('org_admin do próprio cliente designa um consultor', async () => {
    const res = await req(url, {
      method: 'POST', headers: orgAdmin,
      body: JSON.stringify({ ...consultorNaGov, name: 'Beltrano', email: 'beltrano@ness.lat' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it('consultor NÃO troca o e-mail de uma designação existente (seria designar outro)', async () => {
    const id = await idDe('fulano@ness.lat');
    const res = await req(url, {
      method: 'POST', headers: consultor,
      body: JSON.stringify({ ...consultorNaGov, id, email: 'outro@ness.lat' }),
    });
    expect(res.status).toBe(403);
  });

  it('consultor NÃO rebaixa uma designação de consultor para outro papel', async () => {
    const id = await idDe('beltrano@ness.lat');
    const res = await req(url, {
      method: 'POST', headers: consultor,
      body: JSON.stringify({ ...consultorNaGov, id, email: 'beltrano@ness.lat', role_category: 'tech' }),
    });
    expect(res.status).toBe(403);
  });

  it('consultor NÃO remove a designação de consultor', async () => {
    const id = await idDe('fulano@ness.lat');
    const res = await req(`${url}/${id}`, { method: 'DELETE', headers: consultor });
    expect(res.status).toBe(403);
  });

  it('consultor segue cadastrando os demais papéis da governança', async () => {
    const res = await req(url, {
      method: 'POST', headers: consultor,
      body: JSON.stringify({ name: 'CTO do cliente', email: 'cto@cliente.com', role_category: 'tech', job_title: 'CTO' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it('consultor NÃO promove um membro comum a consultor', async () => {
    const id = await idDe('cto@cliente.com');
    const res = await req(url, {
      method: 'POST', headers: consultor,
      body: JSON.stringify({ id, name: 'CTO do cliente', email: 'cto@cliente.com', role_category: 'consultor', job_title: 'CTO' }),
    });
    expect(res.status).toBe(403);
  });
});
