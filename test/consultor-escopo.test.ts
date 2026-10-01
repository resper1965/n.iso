import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * D5 do plano de fechamento (2026-10): o consultor humano só alcança os projetos em que consta como
 * `consultor` na governança (`project_governance`), a mesma linha que o agente já exige
 * (`concessaoValida`). `platform_admin` segue vendo todos; cliente, só o próprio.
 *
 * Cenário: dois projetos; `cons@ness.lat` designado só em p-a, e com o e-mail em OUTRA caixa na
 * governança, para provar que a comparação é sem caixa.
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

describe('consultor preso às suas designações (D5)', () => {
  let cons: Record<string, string>, inativo: Record<string, string>, admin: Record<string, string>, clienteB: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, ativo) VALUES
        ('u-cons','cons@ness.lat','x','Cons','consultor',NULL,1),
        ('u-ina','ina@ness.lat','x','Ina','consultor',NULL,0),
        ('u-pa','pa@ness.lat','x','PA','platform_admin',NULL,1),
        ('u-b','b@x.com','x','B','org_admin','p-b',1)`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
        ('g-cons','p-a','Cons','CONS@Ness.LAT','consultor','Consultor'),
        ('g-ina','p-a','Ina','ina@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a','p-a','Ativo A','Ameaça A'), ('r-b','p-b','Ativo B','Ameaça B'), ('r-b2','p-b','Ativo B2','Ameaça B2')`),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date, status) VALUES ('mr-b','p-b','2026-07-16','Completed')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('cc-a','p-a','ISO 27001','Políticas'), ('cc-b','p-b','ISO 27001','Políticas')`),
    ]);
    cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    inativo = await sessionFor({ id: 'u-ina', email: 'ina@ness.lat', role: 'consultor' });
    admin = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    clienteB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: 'p-b' });
  });

  it('rota aninhada: p-a 200 (designado, e-mail em outra caixa), p-b 403', async () => {
    expect((await chamar('GET', '/api/v1/projects/p-a/risks', cons)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', cons)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/projects/p-b', cons)).status).toBe(403);
  });

  it('recurso por id de p-b: DELETE e PUT 403, e nada muda', async () => {
    expect((await chamar('DELETE', '/api/v1/risks/r-b', cons)).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/management-reviews/mr-b', cons, { status: 'Draft' })).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-b'`).first()).not.toBeNull();
    expect((await env.DB.prepare(`SELECT status FROM management_reviews WHERE id='mr-b'`).first<any>()).status).toBe('Completed');
  });

  it('recurso por id de p-a segue liberado', async () => {
    expect((await chamar('DELETE', '/api/v1/risks/r-a', cons)).status).toBe(200);
  });

  it('listagens entre projetos só trazem os designados', async () => {
    const projetos = await (await chamar('GET', '/api/v1/projects', cons)).json<any[]>();
    expect(projetos.map((p) => p.id)).toEqual(['p-a']);
    const portfolio = await (await chamar('GET', '/api/v1/portfolio', cons)).json<any>();
    expect(portfolio.projects.map((p: any) => p.id)).toEqual(['p-a']);
    const controles = await (await chamar('GET', '/api/v1/controls', cons)).json<any[]>();
    expect(controles.map((c) => c.project_id)).toEqual(['p-a']);
    const stats = await (await chamar('GET', '/api/v1/dashboard/stats', cons)).json<any>();
    expect(stats.projects).toBe(1);
    const painel = await (await chamar('GET', '/api/v1/dashboard', cons)).json<any>();
    expect(painel.projects).toBe(1);
  });

  it('usuários: o consultor não lista nem gere conta de cliente de projeto não designado', async () => {
    const lista = await (await chamar('GET', '/api/v1/users', cons)).json<any[]>();
    expect(lista.map((u) => u.id)).not.toContain('u-b');
    expect((await chamar('PUT', '/api/v1/users/u-b', cons, { password: 'Tomada-de-conta-123!' })).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/users/u-b', cons)).status).toBe(403);
    const criar = await chamar('POST', '/api/v1/users', cons, { email: 'novo@x.com', password: 'Senha-forte-123!', name: 'Novo', role: 'org_admin', client_project_id: 'p-b' });
    expect(criar.status).toBe(403);
  });

  it('platform_admin vê os dois; cliente só o próprio', async () => {
    const todos = await (await chamar('GET', '/api/v1/projects', admin)).json<any[]>();
    expect(todos.map((p) => p.id).sort()).toEqual(['p-a', 'p-b']);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', admin)).status).toBe(200);
    const doCliente = await (await chamar('GET', '/api/v1/projects', clienteB)).json<any[]>();
    expect(doCliente.map((p) => p.id)).toEqual(['p-b']);
    expect((await chamar('GET', '/api/v1/projects/p-a/risks', clienteB)).status).toBe(403);
  });

  it('consultor com a conta desativada não alcança nem o projeto designado', async () => {
    expect((await chamar('GET', '/api/v1/projects/p-a/risks', inativo)).status).toBe(403);
  });

  it('tirar a designação derruba o acesso na requisição seguinte', async () => {
    expect((await chamar('GET', '/api/v1/projects/p-a/risks', cons)).status).toBe(200);
    await env.DB.prepare(`DELETE FROM project_governance WHERE id='g-cons'`).run();
    expect((await chamar('GET', '/api/v1/projects/p-a/risks', cons)).status).toBe(403);
    const projetos = await (await chamar('GET', '/api/v1/projects', cons)).json<any[]>();
    expect(projetos).toEqual([]);
  });
});
