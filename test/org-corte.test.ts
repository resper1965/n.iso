import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Fatia 5, tarefa 2: tudo cortado por organização. Duas consultorias semeadas (`org_ness` e
 * `org_b`), com projeto, lead, assessment, proposta, serviço e usuário em cada lado. Quem é de uma
 * não alcança nada da outra: por id é 404 (comercial) ou 403 (projeto, como a D5 já respondia), e
 * as listas não trazem o alheio. Só o platform_admin vê as duas.
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, extraEnv: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), ...extraEnv } as any);
const ids = (xs: any[]) => xs.map((x) => x.id).sort();

const S: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  await applySchema();
  const d = env.DB;
  await d.batch([
    // limites altos: este arquivo prova o corte por organização, não o plano (organizacoes.test.ts)
    d.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 100, 100)`),
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      ('p-ness','Cliente N','ISO 27001','controller','Active','org_ness'),
      ('p-b','Cliente B','ISO 27001','controller','Active','org_b'),
      ('p-b2','Cliente B2','ISO 27001','controller','Active','org_b')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-cn','cn@ness.lat','x','CN','consultor',NULL,'org_ness',1),
      ('u-cb','cb@b.lat','x','CB','consultor',NULL,'org_b',1),
      ('u-xb','xb@b.lat','x','XB','consultor',NULL,'org_b',1),
      ('u-xn','xn@ness.lat','x','XN','consultor',NULL,'org_ness',1),
      ('u-ab','ab@b.lat','x','AB','consultoria_admin',NULL,'org_b',1),
      ('u-pa','pa@ness.lat','x','PA','platform_admin',NULL,'org_ness',1),
      ('u-comn','comn@ness.lat','x','ComN','comercial',NULL,'org_ness',1),
      ('u-comb','comb@b.lat','x','ComB','comercial',NULL,'org_b',1),
      ('u-clin','clin@x.com','x','CliN','org_admin','p-ness','org_ness',1),
      ('u-clib','clib@x.com','x','CliB','org_admin','p-b','org_b',1)`),
    // u-xb (org_b) designado em projeto da ness.; u-xn (ness.) designado em projeto de org_b: cruzadas.
    d.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cn','p-ness','CN','cn@ness.lat','consultor','Consultor'),
      ('g-cb','p-b','CB','cb@b.lat','consultor','Consultor'),
      ('g-xb','p-ness','XB','xb@b.lat','consultor','Consultor'),
      ('g-xn','p-b','XN','xn@ness.lat','consultor','Consultor')`),
    d.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-ness','p-ness','A','T'), ('r-b','p-b','A','T')`),
    d.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('cc-ness','p-ness','ISO 27001','X'), ('cc-b','p-b','ISO 27001','X')`),
    d.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-ness','Lead N','New','org_ness'), ('l-b','Lead B','New','org_b')`),
    d.prepare(`INSERT INTO assessments (id, lead_id, client_name, org_id) VALUES ('a-ness','l-ness','N','org_ness'), ('a-b','l-b','B','org_b')`),
    d.prepare(`INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES ('aa-b','a-b',1,'sector','Setor','Saúde')`),
    d.prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, cliente, criada_por) VALUES ('pr-b','org_b','l-b','B-2026-001','B','comb@b.lat')`),
    d.prepare(`INSERT INTO servicos (id, org_id, nome, tipo) VALUES ('s-b','org_b','Serviço B','avulso'), ('s-ness','org_ness','Serviço N','avulso')`),
    d.prepare(`INSERT INTO proposals (id, lead_id, status, org_id) VALUES ('prop-b','l-b','Draft','org_b'), ('prop-n','l-ness','Draft','org_ness')`),
    d.prepare(`INSERT INTO notifications (id, user_id, type, title) VALUES ('n-difusao', NULL, 'aviso', 'Difusão antiga da ness.')`),
    d.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES
      ('c-cruzada','u-xb','p-ness', datetime('now','+30 days')),
      ('c-ok','u-cb','p-b', datetime('now','+30 days'))`),
  ]);
  const s = (id: string, email: string, role: string, org_id?: string, client_project_id?: string) =>
    sessionFor({ id, email, role, ...(org_id ? { org_id } : {}), ...(client_project_id ? { client_project_id } : {}) });
  S.cn = await s('u-cn', 'cn@ness.lat', 'consultor', 'org_ness');
  S.cb = await s('u-cb', 'cb@b.lat', 'consultor', 'org_b');
  S.xb = await s('u-xb', 'xb@b.lat', 'consultor', 'org_b');
  S.xn = await s('u-xn', 'xn@ness.lat', 'consultor', 'org_ness');
  S.ab = await s('u-ab', 'ab@b.lat', 'consultoria_admin', 'org_b');
  S.pa = await s('u-pa', 'pa@ness.lat', 'platform_admin');
  S.comn = await s('u-comn', 'comn@ness.lat', 'comercial', 'org_ness');
  S.comb = await s('u-comb', 'comb@b.lat', 'comercial', 'org_b');
}, 60_000);

describe('projetos: organização antes da designação', () => {
  it('consultor da ness. não alcança projeto nem recurso de org_b, e não os vê nas listas', async () => {
    expect(ids(await (await chamar('GET', '/api/v1/projects', S.cn)).json<any[]>())).toEqual(['p-ness']);
    expect((await chamar('GET', '/api/v1/projects/p-b', S.cn)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', S.cn)).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/risks/r-b', S.cn)).status).toBe(403);
    const port = await (await chamar('GET', '/api/v1/portfolio', S.cn)).json<any>();
    expect(ids(port.projects)).toEqual(['p-ness']);
    const ctrl = await (await chamar('GET', '/api/v1/controls', S.cn)).json<any[]>();
    expect(ctrl.map((x) => x.project_id)).toEqual(['p-ness']);
    expect((await (await chamar('GET', '/api/v1/dashboard/stats', S.cn)).json<any>()).projects).toBe(1);
    expect((await (await chamar('GET', '/api/v1/dashboard', S.cn)).json<any>()).projects).toBe(1);
  });

  it('consultor de org_b designado só em p-b vê só p-b (nem p-b2, da mesma organização)', async () => {
    expect(ids(await (await chamar('GET', '/api/v1/projects', S.cb)).json<any[]>())).toEqual(['p-b']);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', S.cb)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-b2/risks', S.cb)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/projects/p-ness/risks', S.cb)).status).toBe(403);
  });

  it('designação cruzada não dá acesso, nos dois sentidos', async () => {
    expect(await (await chamar('GET', '/api/v1/projects', S.xb)).json<any[]>()).toEqual([]);
    expect((await chamar('GET', '/api/v1/projects/p-ness/risks', S.xb)).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/risks/r-ness', S.xb)).status).toBe(403);
    expect(await (await chamar('GET', '/api/v1/projects', S.xn)).json<any[]>()).toEqual([]);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', S.xn)).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id IN ('r-ness','r-b')`).all().then((r) => r.results.length)).toBe(2);
  });

  it('consultoria_admin de org_b vê todos os projetos de org_b e nenhum da ness.', async () => {
    expect(ids(await (await chamar('GET', '/api/v1/projects', S.ab)).json<any[]>())).toEqual(['p-b', 'p-b2']);
    expect((await chamar('GET', '/api/v1/projects/p-b2/risks', S.ab)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-ness/risks', S.ab)).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/risks/r-ness', S.ab)).status).toBe(403);
    const ctrl = await (await chamar('GET', '/api/v1/controls', S.ab)).json<any[]>();
    expect(ctrl.map((x) => x.project_id)).toEqual(['p-b']);
    expect((await (await chamar('GET', '/api/v1/dashboard/stats', S.ab)).json<any>()).projects).toBe(2);
  });

  it('X-Org-Id de quem não é platform_admin é ignorado', async () => {
    const h = { ...S.ab, 'X-Org-Id': 'org_ness' };
    expect(ids(await (await chamar('GET', '/api/v1/projects', h)).json<any[]>())).toEqual(['p-b', 'p-b2']);
    const leads = await (await chamar('GET', '/api/v1/leads', { ...S.comb, 'X-Org-Id': 'org_ness' })).json<any[]>();
    expect(ids(leads)).toEqual(['l-b']);
  });

  it('platform_admin vê as duas organizações', async () => {
    expect(ids(await (await chamar('GET', '/api/v1/projects', S.pa)).json<any[]>())).toEqual(['p-b', 'p-b2', 'p-ness']);
    expect((await chamar('GET', '/api/v1/projects/p-b/risks', S.pa)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-ness/risks', S.pa)).status).toBe(200);
  });

  it('comercial não vê projeto nenhum (antes caía no ramo "todos")', async () => {
    expect(await (await chamar('GET', '/api/v1/projects', S.comb)).json<any[]>()).toEqual([]);
    expect(await (await chamar('GET', '/api/v1/controls', S.comb)).json<any[]>()).toEqual([]);
  });

  it('projeto criado nasce na organização de quem cria; cliente não cria', async () => {
    const org = async (h: Record<string, string>) => {
      const r = await chamar('POST', '/api/v1/projects', h, { client_name: 'Novo' });
      expect(r.status).toBe(201);
      return (await env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind((await r.json<any>()).id).first<any>()).org_id;
    };
    expect(await org(S.cb)).toBe('org_b');
    expect(await org(S.ab)).toBe('org_b');
    expect(await org(S.pa)).toBe('org_ness');
    expect(await org({ ...S.pa, 'X-Org-Id': 'org_b' })).toBe('org_b');
    expect(await org({ ...S.cb, 'X-Org-Id': 'org_ness' })).toBe('org_b');
    expect((await chamar('POST', '/api/v1/projects', { ...S.pa, 'X-Org-Id': 'org_inexistente' }, { client_name: 'X' })).status).toBe(403);
    const cliente = await sessionFor({ id: 'u-clib', email: 'clib@x.com', role: 'org_admin', client_project_id: 'p-b' });
    expect((await chamar('POST', '/api/v1/projects', cliente, { client_name: 'X' })).status).toBe(403);
  });
});

describe('agente MCP: concessão exige o projeto na organização do consultor', () => {
  const agente = (concessaoId: string, userId: string, email: string, projectId: string) =>
    chamar('GET', `/api/v1/projects/${projectId}/risks`, {}, undefined, { AGENTE: { concessaoId, userId, email, projectId } });

  it('concessão cruzada (consultor de org_b, projeto da ness., designado) → 401', async () => {
    expect((await agente('c-cruzada', 'u-xb', 'xb@b.lat', 'p-ness')).status).toBe(401);
  });

  it('concessão na própria organização segue valendo', async () => {
    expect((await agente('c-ok', 'u-cb', 'cb@b.lat', 'p-b')).status).toBe(200);
  });
});

describe('comercial: leads, assessments, propostas, serviços e o legado de proposals', () => {
  it('id de outra organização é 404 em toda rota, e nada muda', async () => {
    const h = S.comn;
    const casos: [string, string, unknown?][] = [
      ['GET', '/api/v1/leads/l-b'],
      ['PUT', '/api/v1/leads/l-b/status', { status: 'Lost' }],
      ['POST', '/api/v1/leads/l-b/enrich-cnpj', { cnpj: '11222333000181' }],
      ['DELETE', '/api/v1/leads/l-b'],
      ['GET', '/api/v1/assessments/a-b'],
      ['GET', '/api/v1/assessments/a-b/answers'],
      ['GET', '/api/v1/assessments/a-b/block/1'],
      ['POST', '/api/v1/assessments/a-b/block/1', { answers: [] }],
      ['GET', '/api/v1/assessments/a-b/pricing'],
      ['PUT', '/api/v1/assessments/a-b/pricing', { notas: 'x' }],
      ['PUT', '/api/v1/assessments/a-b', { client_name: 'Tomado' }],
      ['GET', '/api/v1/propostas/pr-b'],
      ['PUT', '/api/v1/propostas/pr-b', { cliente: 'Tomado' }],
      ['GET', '/api/v1/servicos/s-b'],
      ['POST', '/api/v1/servicos/s-b/arquivar'],
      ['GET', '/api/v1/proposals/prop-b'],
      ['PUT', '/api/v1/proposals/prop-b', { status: 'Approved' }],
      ['DELETE', '/api/v1/proposals/prop-b'],
    ];
    for (const [m, p, corpo] of casos) {
      expect((await chamar(m, p, h, corpo)).status, `${m} ${p}`).toBe(404);
    }
    const linha = (sql: string) => env.DB.prepare(sql).first<any>();
    expect((await linha(`SELECT status FROM leads WHERE id='l-b'`)).status).toBe('New');
    expect((await linha(`SELECT client_name FROM assessments WHERE id='a-b'`)).client_name).toBe('B');
    expect((await linha(`SELECT count(*) AS n FROM assessment_answers WHERE assessment_id='a-b'`)).n).toBe(1);
    expect((await linha(`SELECT cliente FROM propostas WHERE id='pr-b'`)).cliente).toBe('B');
    expect((await linha(`SELECT ativo FROM servicos WHERE id='s-b'`)).ativo).toBe(1);
    expect((await linha(`SELECT status FROM proposals WHERE id='prop-b'`)).status).toBe('Draft');
  });

  it('as listas não trazem o alheio', async () => {
    const lista = async (p: string) => ids(await (await chamar('GET', p, S.comn)).json<any[]>());
    expect(await lista('/api/v1/leads')).toEqual(['l-ness']);
    expect(await lista('/api/v1/assessments')).toEqual(['a-ness']);
    expect(await lista('/api/v1/propostas')).toEqual([]);
    expect(await lista('/api/v1/servicos')).toEqual(['s-ness']);
    expect(await lista('/api/v1/proposals')).toEqual(['prop-n']);
    expect(await (await chamar('GET', '/api/v1/leads', S.comb)).json<any[]>().then(ids)).toEqual(['l-b']);
    expect((await (await chamar('GET', '/api/v1/dashboard/stats', S.comb)).json<any>()).leads).toBe(1);
  });

  it('criar com lead alheio não pendura registro em outra organização', async () => {
    expect((await chamar('POST', '/api/v1/assessments', S.comn, { client_name: 'X', lead_id: 'l-b' })).status).toBe(404);
    expect((await chamar('POST', '/api/v1/proposals', S.comn, { lead_id: 'l-b', assessment_id: 'a-b', total_price: 1, content_html: '<p>x</p>' })).status).toBe(404);
  });

  it('a precificação antiga (settings, global) é só da ness.', async () => {
    expect((await chamar('GET', '/api/v1/pricing-config', S.comb)).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/pricing-config', S.comb, { margemAlvo: 0.01 })).status).toBe(403);
    expect((await chamar('GET', '/api/v1/proposals/config/pricing', S.comb)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/pricing-config', S.comn)).status).toBe(200);
  });

  it('platform_admin age na organização do X-Org-Id', async () => {
    expect((await chamar('GET', '/api/v1/servicos/s-b', S.pa)).status).toBe(404);
    expect((await chamar('GET', '/api/v1/servicos/s-b', { ...S.pa, 'X-Org-Id': 'org_b' })).status).toBe(200);
  });
});

describe('usuários: cada organização gere só as suas contas', () => {
  it('consultor da ness. não lista, não edita e não exclui conta de org_b, e vice-versa', async () => {
    expect(ids(await (await chamar('GET', '/api/v1/users', S.cn)).json<any[]>())).not.toContain('u-clib');
    expect((await chamar('PUT', '/api/v1/users/u-clib', S.cn, { password: 'Tomada-de-conta-123!' })).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/users/u-clib', S.cn)).status).toBe(403);
    expect(ids(await (await chamar('GET', '/api/v1/users', S.cb)).json<any[]>())).not.toContain('u-clin');
    expect((await chamar('PUT', '/api/v1/users/u-clin', S.cb, { password: 'Tomada-de-conta-123!' })).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/users/u-clin', S.cb)).status).toBe(403);
  });

  it('consultoria_admin lista só a própria organização (equipe e clientes dos projetos dela)', async () => {
    const lista = ids(await (await chamar('GET', '/api/v1/users', S.ab)).json<any[]>());
    expect(lista).toEqual(['u-ab', 'u-cb', 'u-clib', 'u-comb', 'u-xb']);
  });

  it('consultoria_admin não edita nem exclui conta de outra organização (404)', async () => {
    for (const alvo of ['u-cn', 'u-clin', 'u-pa']) {
      expect((await chamar('PUT', `/api/v1/users/${alvo}`, S.ab, { name: 'Tomado' })).status, alvo).toBe(404);
      expect((await chamar('DELETE', `/api/v1/users/${alvo}`, S.ab)).status, alvo).toBe(404);
    }
    expect((await env.DB.prepare(`SELECT name FROM users WHERE id='u-cn'`).first<any>()).name).toBe('CN');
  });

  it('consultoria_admin não cria platform_admin nem cliente em projeto de outra organização', async () => {
    const novo = (email: string, role: string, client_project_id?: string) =>
      chamar('POST', '/api/v1/users', S.ab, { email, password: 'Senha-forte-123!', name: 'N', role, client_project_id });
    expect((await novo('pa2@b.lat', 'platform_admin')).status).toBe(403);
    expect((await novo('admin2@b.lat', 'admin')).status).toBe(400); // grafia legada: fora do enum de papéis
    expect((await novo('cli2@x.com', 'org_admin', 'p-ness')).status).toBe(403);
  });

  it('o usuário criado herda a organização (de quem cria, ou do projeto para cliente)', async () => {
    const criar = async (h: Record<string, string>, email: string, role: string, client_project_id?: string) => {
      const r = await chamar('POST', '/api/v1/users', h, { email, password: 'Senha-forte-123!', name: 'N', role, client_project_id });
      expect(r.status, email).toBe(201);
      return (await env.DB.prepare('SELECT org_id FROM users WHERE email = ?').bind(email).first<any>()).org_id;
    };
    expect(await criar(S.ab, 'cons3@b.lat', 'consultor')).toBe('org_b');
    expect(await criar(S.ab, 'cli3@x.com', 'org_user', 'p-b2')).toBe('org_b');
    expect(await criar(S.cb, 'cli4@x.com', 'org_user', 'p-b')).toBe('org_b');
    expect(await criar(S.pa, 'cli5@x.com', 'org_user', 'p-b')).toBe('org_b');
    expect(await criar({ ...S.pa, 'X-Org-Id': 'org_b' }, 'cons5@b.lat', 'consultor')).toBe('org_b');
    expect(await criar(S.pa, 'cons6@ness.lat', 'consultor')).toBe('org_ness');
    // o corpo não escolhe organização: desde a tarefa 4 o schema é estrito, e `org_id` no corpo é 400
    const r = await chamar('POST', '/api/v1/users', S.ab, { email: 'cons7@b.lat', password: 'Senha-forte-123!', name: 'N', role: 'consultor', org_id: 'org_ness' });
    expect(r.status).toBe(400);
    expect(await env.DB.prepare(`SELECT org_id FROM users WHERE email='cons7@b.lat'`).first<any>()).toBeNull();
  });
});

describe('notificações', () => {
  it('difusão antiga (sem destinatário) não chega a outra consultoria', async () => {
    const de = async (h: Record<string, string>) => (await (await chamar('GET', '/api/v1/notifications', h)).json<any>()).notifications.map((n: any) => n.id);
    expect(await de(S.cn)).toContain('n-difusao');
    expect(await de(S.cb)).not.toContain('n-difusao');
  });
});
