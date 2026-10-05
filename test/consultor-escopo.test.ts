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

describe('quem cria o projeto sendo consultor fica designado nele (D5)', () => {
  let cons: Record<string, string>, admin: Record<string, string>, cliente: Record<string, string>;
  const criar = async (h: Record<string, string>, nome: string) => {
    const r = await chamar('POST', '/api/v1/projects', h, { client_name: nome });
    return { status: r.status, id: (await r.json<any>()).id as string };
  };
  const linhas = (projeto: string) =>
    env.DB.prepare(`SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ?`).bind(projeto).all<any>().then((r) => r.results);

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p-c','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role, client_project_id, ativo) VALUES
        ('u-criador','Criador@Ness.lat','x','Criador','consultor',NULL,1),
        ('u-pa2','pa2@ness.lat','x','PA2','platform_admin',NULL,1),
        ('u-cli','cli@x.com','x','Cli','org_admin','p-c',1)`),
    ]);
    cons = await sessionFor({ id: 'u-criador', email: 'Criador@Ness.lat', name: 'Criador', role: 'consultor' });
    admin = await sessionFor({ id: 'u-pa2', email: 'pa2@ness.lat', role: 'platform_admin' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-c' });
  });

  it('consultor cria projeto, fica designado numa única linha e alcança o projeto novo', async () => {
    const { status, id } = await criar(cons, 'Novo do consultor');
    expect(status).toBe(201);
    expect(await linhas(id)).toEqual([{ name: 'Criador', email: 'Criador@Ness.lat', role_category: 'consultor', job_title: 'Consultor' }]);
    expect((await chamar('GET', `/api/v1/projects/${id}/risks`, cons)).status).toBe(200);
    const lista = await (await chamar('GET', '/api/v1/projects', cons)).json<any[]>();
    expect(lista.map((p) => p.id)).toContain(id);
  });

  it('platform_admin que cria não ganha linha de governança', async () => {
    const { status, id } = await criar(admin, 'Novo do admin');
    expect(status).toBe(201);
    expect(await linhas(id)).toEqual([]);
  });

  it('outro papel que cria não ganha linha de governança', async () => {
    const r = await chamar('POST', '/api/v1/projects', cliente, { client_name: 'Novo do cliente' });
    const corpo = await r.json<any>();
    if (r.status === 201) expect(await linhas(corpo.id)).toEqual([]);
    const total = await env.DB.prepare(`SELECT count(*) AS n FROM project_governance WHERE lower(email) = 'cli@x.com'`).first<{ n: number }>();
    expect(total!.n).toBe(0);
  });

  // A designação do consultor no projeto vindo do aceite é coberta por test/fechar-venda.test.ts.
  describe('converter assessment foi aposentado', () => {
    it.each([['consultor', () => cons], ['platform_admin', () => admin]])('%s: /convert é 410 e não cria projeto nem linha de governança', async (_n, quem) => {
      await env.DB.prepare(`INSERT OR IGNORE INTO assessments (id, client_name) VALUES ('as-conv', 'Convertido')`).run();
      const antes = await env.DB.prepare(`SELECT (SELECT count(*) FROM projects) AS p, (SELECT count(*) FROM project_governance) AS g`).first<any>();
      const r = await chamar('POST', '/api/v1/assessments/as-conv/convert', quem());
      expect(r.status).toBe(410);
      const depois = await env.DB.prepare(`SELECT (SELECT count(*) FROM projects) AS p, (SELECT count(*) FROM project_governance) AS g`).first<any>();
      expect(depois).toEqual(antes);
      expect((await env.DB.prepare(`SELECT converted_project_id FROM assessments WHERE id = 'as-conv'`).first<any>()).converted_project_id).toBeNull();
    });
  });

  it('criação e designação são atômicas: se a designação falha, o projeto não fica órfão', async () => {
    await env.DB.prepare(`CREATE TRIGGER falha_designacao BEFORE INSERT ON project_governance BEGIN SELECT RAISE(ABORT, 'designacao falhou'); END`).run();
    try {
      const antes = await env.DB.prepare(`SELECT count(*) AS n FROM projects`).first<{ n: number }>();
      const r = await chamar('POST', '/api/v1/projects', cons, { client_name: 'Orfao' });
      expect(r.status).toBe(500);
      const depois = await env.DB.prepare(`SELECT count(*) AS n FROM projects`).first<{ n: number }>();
      expect(depois!.n).toBe(antes!.n);
    } finally {
      await env.DB.prepare(`DROP TRIGGER falha_designacao`).run();
    }
  });
});
