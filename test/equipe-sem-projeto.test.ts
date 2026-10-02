import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, requireProjectAccess, requireResourceAccess, projetosVisiveis } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Revisão final da fatia 5, B1: conta de EQUIPE nunca se prende a projeto por `client_project_id`.
 *
 * Antes, só o cliente tinha o projeto conferido; o `consultoria_admin` da org B fazia
 * `POST /users {role:'comercial', client_project_id:<projeto da ness.>}` e a conta nascia com acesso
 * total ao projeto alheio, porque os helpers mandavam todo papel que não é consultor/administrador ao
 * ramo `client_project_id`. Três camadas: a rota recusa (400), os helpers ignoram o campo para quem
 * não é cliente, e a sessão de equipe perde o campo no middleware.
 */
const SENHA = 'Senha-forte-123!';
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv() as any);
const S: Record<string, Record<string, string>> = {};
const EQUIPE = ['consultor', 'comercial', 'consultoria_admin', 'platform_admin'];

beforeAll(async () => {
  await applySchema();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 100, 100)`),
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      ('p-ness','Cliente N','ISO 27001','controller','Active','org_ness'),
      ('p-b','Cliente B','ISO 27001','controller','Active','org_b')`),
    d.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-ness', 'p-ness', 'Ativo', 'Ameaça')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',1),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1),
      ('u-ab2','ab2@b.lat',?,'AB2','consultoria_admin',NULL,'org_b',1),
      ('u-comb','comb@b.lat',?,'ComB','comercial',NULL,'org_b',1),
      ('u-clib','clib@b.lat',?,'CliB','org_user','p-b','org_b',1),
      ('u-intruso','intruso@b.lat',?,'Intruso','comercial','p-ness','org_b',1)`).bind(h, h, h, h, h, h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  // A conta semeada direto no banco, como se tivesse passado pela rota antiga: a sessão carrega o
  // projeto alheio.
  S.intruso = await sessionFor({ id: 'u-intruso', email: 'intruso@b.lat', role: 'comercial', org_id: 'org_b', client_project_id: 'p-ness' });
}, 60_000);

describe('B1 — POST/PUT /users: conta de equipe não se prende a projeto', () => {
  it('o cenário da revisão: consultoria_admin da org B cria comercial preso a projeto da ness. → 400', async () => {
    const res = await chamar('POST', '/api/v1/users', S.ab, { email: 'novo-com@b.lat', password: SENHA, name: 'N', role: 'comercial', client_project_id: 'p-ness' });
    expect(res.status, await res.clone().text()).toBe(400);
    expect(await res.json()).toEqual({ error: 'Conta de equipe não se prende a projeto' });
    expect(await env.DB.prepare(`SELECT 1 FROM users WHERE email = 'novo-com@b.lat'`).first()).toBeNull();
  });

  it('vale para todo papel de equipe e para todo gestor, inclusive o platform_admin (mesmo projeto da própria organização)', async () => {
    for (const role of EQUIPE) {
      for (const [quem, proj] of [['pa', 'p-ness'], ['ab', 'p-b']] as const) {
        if (quem === 'ab' && role === 'platform_admin') continue; // recusado antes, por papel
        const res = await chamar('POST', '/api/v1/users', S[quem], { email: `x-${role}-${quem}@b.lat`, password: SENHA, name: 'N', role, client_project_id: proj });
        expect(res.status, `${quem} ${role}`).toBe(400);
      }
    }
  });

  it('equipe sem projeto continua sendo criada', async () => {
    const res = await chamar('POST', '/api/v1/users', S.ab, { email: 'com-ok@b.lat', password: SENHA, name: 'N', role: 'comercial', client_project_id: null });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('PUT: prender conta de equipe a projeto → 400; trocar o papel para equipe mantendo o projeto → 400', async () => {
    let res = await chamar('PUT', '/api/v1/users/u-comb', S.ab, { client_project_id: 'p-ness' });
    expect(res.status).toBe(400);
    res = await chamar('PUT', '/api/v1/users/u-comb', S.pa, { client_project_id: 'p-b' });
    expect(res.status).toBe(400);
    res = await chamar('PUT', '/api/v1/users/u-clib', S.ab, { role: 'comercial', client_project_id: 'p-b' });
    expect(res.status).toBe(400);
    expect((await env.DB.prepare(`SELECT client_project_id AS p FROM users WHERE id = 'u-comb'`).first<any>()).p).toBeNull();
  });

  it('PUT: cliente que vira equipe solta o projeto', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-vira','vira@b.lat','x','V','org_user','p-b','org_b')`).run();
    const res = await chamar('PUT', '/api/v1/users/u-vira', S.ab, { role: 'consultor' });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await env.DB.prepare(`SELECT role, client_project_id AS p, org_id FROM users WHERE id = 'u-vira'`).first()).toEqual({ role: 'consultor', p: null, org_id: 'org_b' });
  });

  it('PUT: equipe que vira cliente pelo consultoria_admin precisa de projeto da organização dele', async () => {
    let res = await chamar('PUT', '/api/v1/users/u-comb', S.ab, { role: 'org_user' });
    expect(res.status).toBe(403);
    res = await chamar('PUT', '/api/v1/users/u-comb', S.ab, { role: 'org_user', client_project_id: 'p-ness' });
    expect(res.status).toBe(403);
    expect((await env.DB.prepare(`SELECT role FROM users WHERE id = 'u-comb'`).first<any>()).role).toBe('comercial');
  });
});

describe('B1 — defesa em profundidade: equipe com client_project_id gravado não alcança o projeto', () => {
  it('helpers: requireProjectAccess, requireResourceAccess e projetosVisiveis ignoram o campo para quem não é cliente', async () => {
    for (const role of ['comercial', 'consultor', 'consultoria_admin', 'desconhecido', '']) {
      const u = { role, email: 'intruso@b.lat', org_id: 'org_b', client_project_id: 'p-ness' };
      await expect(requireProjectAccess(env.DB, u, 'p-ness'), role).rejects.toThrow(/Forbidden/);
      await expect(requireResourceAccess(env.DB, 'risks', 'r-ness', u), role).rejects.toThrow(/Forbidden/);
      const v = projetosVisiveis(u)!;
      expect(v.bind, role).not.toBe('p-ness');
    }
    // O cliente continua preso ao próprio projeto.
    const cli = { role: 'org_user', client_project_id: 'p-ness' };
    await expect(requireProjectAccess(env.DB, cli, 'p-ness')).resolves.toBe(true);
    await expect(requireResourceAccess(env.DB, 'risks', 'r-ness', cli)).resolves.toBe(true);
    expect(projetosVisiveis(cli)).toEqual({ sql: 'SELECT ?', bind: 'p-ness' });
  });

  it('pela API: a sessão do comercial com projeto alheio recebe 403 no projeto, e o projeto não aparece em GET /projects', async () => {
    for (const caminho of ['/api/v1/projects/p-ness/risks', '/api/v1/projects/p-ness']) {
      const res = await chamar('GET', caminho, S.intruso);
      expect([403, 404], `${caminho}: ${await res.clone().text()}`).toContain(res.status);
    }
    const lista = await chamar('GET', '/api/v1/projects', S.intruso);
    expect(await lista.text()).not.toContain('p-ness');
    const portal = await chamar('GET', '/api/v1/client/dashboard', S.intruso);
    expect(portal.status).not.toBe(200);
    expect(await portal.text()).not.toContain('Cliente N');
  });
});
