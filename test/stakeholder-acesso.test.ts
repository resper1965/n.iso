import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 1 do acesso de stakeholders: papel `stakeholder` (allow-list de caminhos), convite a partir
 * da linha da matriz de Governança e revogação.
 */
const SENHA = 'Senha-forte-123!';
const P = 'sh-proj';
const OUTRO = 'sh-outro';

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

const convidar = (h: Record<string, string>, membro: string, projeto = P) =>
  chamar(h, 'POST', `/api/v1/projects/${projeto}/governance/${membro}/convidar`);
const revogar = (h: Record<string, string>, membro: string, projeto = P) =>
  chamar(h, 'POST', `/api/v1/projects/${projeto}/governance/${membro}/revogar-acesso`);

const contas = async (email: string) =>
  (await env.DB.prepare('SELECT id, role, client_project_id, org_id, ativo, requires_password_change FROM users WHERE lower(email) = lower(?)').bind(email).all<any>()).results;

let adm: Record<string, string>, orgAdmin: Record<string, string>, consultor: Record<string, string>,
  consultorAlheio: Record<string, string>, cadm: Record<string, string>, cadmB: Record<string, string>,
  orgUser: Record<string, string>, client: Record<string, string>, stake: Record<string, string>,
  orgAdminOutro: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'b')`).run().catch(() => undefined);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', 'org_ness'),
      ('u-cons2', 'cons2@ness.lat', ?, 'Cons2', 'consultor', 'org_ness'),
      ('u-cadm', 'cadm@ness.lat', ?, 'Cadm', 'consultoria_admin', 'org_ness'),
      ('u-cadmb', 'cadm@b.lat', ?, 'CadmB', 'consultoria_admin', 'org_b')`).bind(senha, senha, senha, senha),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ceo', ?, 'Ana Diretora', 'Ana@Cliente.com', 'executivo', 'CEO'),
      ('g-ciso', ?, 'Beto Líder', 'beto@cliente.com', 'executivo', 'CISO'),
      ('g-sem', ?, 'Sem Email', NULL, 'executivo', 'CTO'),
      ('g-outro', ?, 'Carla', 'carla@outro.com', 'executivo', 'CEO'),
      ('g-cons2', ?, 'Cons2', 'cons2@ness.lat', 'consultor', 'Consultor')`).bind(P, P, P, P, OUTRO, OUTRO),
  ]);
  adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  orgAdmin = await sessionFor({ id: 'u-oa', email: 'dono@cliente.com', role: 'org_admin', client_project_id: P });
  orgAdminOutro = await sessionFor({ id: 'u-oa2', email: 'dono@outro.com', role: 'org_admin', client_project_id: OUTRO });
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  consultorAlheio = await sessionFor({ id: 'u-cons2', email: 'cons2@ness.lat', role: 'consultor' });
  cadm = await sessionFor({ id: 'u-cadm', email: 'cadm@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' });
  cadmB = await sessionFor({ id: 'u-cadmb', email: 'cadm@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  orgUser = await sessionFor({ id: 'u-ou', email: 'ou@cliente.com', role: 'org_user', client_project_id: P });
  client = await sessionFor({ id: 'u-cl', email: 'cl@cliente.com', role: 'client', client_project_id: P });
  stake = await sessionFor({ id: 'u-st', email: 'st@cliente.com', role: 'stakeholder', client_project_id: P });
}, 60_000);

describe('convite a partir da matriz', () => {
  it('cria conta stakeholder presa ao projeto, com o e-mail da linha, e não duplica no segundo convite', async () => {
    const r1 = await convidar(orgAdmin, 'g-ceo');
    expect(r1.status, await r1.clone().text()).toBe(201);
    let c = await contas('ana@cliente.com');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ role: 'stakeholder', client_project_id: P, org_id: 'org_ness', ativo: 1, requires_password_change: 1 });

    const r2 = await convidar(orgAdmin, 'g-ceo');
    expect(r2.status).toBe(200);
    c = await contas('ana@cliente.com');
    expect(c).toHaveLength(1);
  });

  it('linha sem e-mail: 400; linha de outro projeto: 404', async () => {
    expect((await convidar(orgAdmin, 'g-sem')).status).toBe(400);
    expect((await convidar(orgAdmin, 'g-outro')).status).toBe(404);
  });

  it('e-mail de conta que já é outra coisa: 409 e a conta não muda', async () => {
    const r = await convidar(orgAdmin, 'g-cons');
    expect(r.status).toBe(409);
    expect((await contas('cons@ness.lat'))[0].role).toBe('consultor');
  });

  it('quem pode convidar: org_admin, consultor designado, consultoria_admin da org e platform_admin', async () => {
    for (const [h, membro] of [[consultor, 'g-ciso'], [cadm, 'g-ciso'], [adm, 'g-ciso']] as const) {
      await env.DB.prepare(`DELETE FROM users WHERE email = 'beto@cliente.com'`).run();
      const r = await convidar(h, membro);
      expect(r.status, await r.clone().text()).toBe(201);
    }
  });

  it('quem não pode: stakeholder, org_user, client, outras orgs e projetos recebem 403 e nada é criado', async () => {
    await env.DB.prepare(`DELETE FROM users WHERE email = 'beto@cliente.com'`).run();
    for (const h of [stake, orgUser, client, orgAdminOutro, consultorAlheio, cadmB]) {
      const r = await convidar(h, 'g-ciso');
      expect(r.status, await r.clone().text()).toBe(403);
    }
    expect(await contas('beto@cliente.com')).toHaveLength(0);
  });
});

describe('allow-list do papel stakeholder', () => {
  it('perfil, senha e MFA passam; o resto do app é 403, em qualquer método', async () => {
    const me = await chamar(stake, 'GET', '/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect((await chamar(stake, 'GET', '/api/v1/auth/mfa/status')).status).toBe(200);
    // chega ao handler (400/401 por corpo ou senha), não é barrado pelo papel
    for (const p of ['/api/v1/auth/change-password', '/api/v1/auth/mfa/setup']) {
      expect((await chamar(stake, 'POST', p, {})).status, p).not.toBe(403);
    }
  });

  it('varredura: toda rota montada fora do allow-list devolve 403 ao stakeholder', async () => {
    const livre = [
      /^\/api\/v1\/auth\/(me|logout|change-password|reset-password-first)$/,
      /^\/api\/v1\/auth\/mfa\//,
      /^\/api\/v1\/legal\/(pending|accept)$/,
      /^\/api\/v1\/pedidos/,
    ];
    const vistas = new Set<string>();
    const fugas: string[] = [];
    let n = 0;
    for (const r of app.routes) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) || r.path === '/*') continue;
      if (!r.path.startsWith('/api/v1/') || livre.some((re) => re.test(r.path))) continue;
      // rotas públicas e de token são montadas antes do authMiddleware
      if (r.path.startsWith('/api/v1/public/') || r.path.startsWith('/api/v1/assessments/public/') || r.path.startsWith('/api/v1/auditor/')
        || /^\/api\/v1\/auth\/(setup|login|forgot-password|reset-password)$/.test(r.path)) continue;
      const chave = `${r.method} ${r.path}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      n++;
      const caminho = r.path.replace(/:\w+/g, P);
      const res = await chamar(stake, r.method, caminho, {});
      if (res.status !== 403) fugas.push(`${res.status} ${chave}`);
    }
    expect(n).toBeGreaterThan(150);
    expect(fugas, `rotas que o stakeholder alcança:\n  ${fugas.join('\n  ')}`).toEqual([]);
  }, 120_000);
});

describe('revogação', () => {
  it('desativa a conta, derruba as sessões e o login seguinte falha', async () => {
    await env.DB.prepare(`DELETE FROM users WHERE email = 'beto@cliente.com'`).run();
    await convidar(orgAdmin, 'g-ciso');
    const [conta] = await contas('beto@cliente.com');
    await env.DB.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?').bind(await hashPassword(SENHA), conta.id).run();

    const login = () => chamar({}, 'POST', '/api/v1/auth/login', { email: 'beto@cliente.com', password: SENHA });
    const entrou = await login();
    expect(entrou.status, await entrou.clone().text()).toBe(200);
    const { token } = await entrou.json() as any;
    const me = () => chamar({ Authorization: `Bearer ${token}` }, 'GET', '/api/v1/auth/me');
    expect((await me()).status).toBe(200);

    const r = await revogar(orgAdmin, 'g-ciso');
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await contas('beto@cliente.com'))[0].ativo).toBe(0);
    expect((await me()).status).toBe(401);
    expect((await login()).status).toBe(401);
  });

  it('mesmas regras de quem pode; sem convite ativo: 404', async () => {
    for (const h of [stake, orgUser, client, orgAdminOutro, consultorAlheio, cadmB]) {
      expect((await revogar(h, 'g-ceo')).status).toBe(403);
    }
    expect((await contas('ana@cliente.com'))[0].ativo).toBe(1);
    expect((await revogar(orgAdmin, 'g-sem')).status).toBe(404);
    expect((await revogar(orgAdmin, 'g-cons')).status).toBe(404);
  });

  it('convidar de novo reativa a conta, com senha provisória nova', async () => {
    const r = await convidar(orgAdmin, 'g-ciso');
    expect(r.status, await r.clone().text()).toBe(200);
    const c = await contas('beto@cliente.com');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ ativo: 1, requires_password_change: 1 });
  });
});
