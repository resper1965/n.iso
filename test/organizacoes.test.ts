import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, verifyPassword, ehAdminDaOrg, podeAdministrarOrg } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Fatia 5, tarefa 4: o papel `consultoria_admin` e o provisionamento de organizações.
 *
 * Código de elevação de privilégio: o que se prova aqui é tanto o que o administrador da
 * consultoria PODE (configurar a própria organização, aprovar desconto, gerir a equipe dela,
 * designar consultor nos projetos dela) quanto o que ele NÃO pode (criar platform_admin, agir em
 * outra organização, mudar o próprio papel ou organização, entrar em /platform/*). E o que só o
 * platform_admin faz: criar organização com o administrador dela, suspender, mudar limites.
 */
const SENHA = 'Senha-forte-123!';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, extraEnv: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), ...extraEnv } as any);
const comEmail = { RESEND_API_KEY: 'chave-de-teste' };
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

const S: Record<string, Record<string, string>> = {};

const novaOrg = (o: Record<string, unknown> = {}) => ({
  nome: 'Consultoria Nova', slug: 'consultoria-nova', prefixoProposta: 'NOVA', cnpj: '11222333000181',
  adminEmail: 'admin@nova.lat', adminNome: 'Admin Nova', maxProjetos: 10, maxUsuarios: 10, termoVersao: 'v1-2026-10', ...o,
});

/** Espia o envio (Resend) e devolve os corpos enviados. `ok = false` simula falha do provedor. */
function espiarEmail(ok = true) {
  const enviados: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
    enviados.push(JSON.parse(init.body));
    return new Response(ok ? '{"id":"x"}' : 'falhou', { status: ok ? 200 : 500 });
  }) as any);
  return enviados;
}
const senhaDoEmail = (html: string) => html.match(/Senha Temporária:<\/strong>\s*([^<\s]+)/)?.[1] ?? '';

afterEach(() => vi.restoreAllMocks());

beforeAll(async () => {
  await applySchema();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT INTO organizations (id, name, slug, prefixo_proposta, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 'CB', 100, 100)`),
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      ('p-ness','Cliente N','ISO 27001','controller','Active','org_ness'),
      ('p-b','Cliente B','ISO 27001','controller','Active','org_b')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',1),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1),
      ('u-cb','cb@b.lat',?,'CB','consultor',NULL,'org_b',1),
      ('u-comb','comb@b.lat',?,'ComB','comercial',NULL,'org_b',1),
      ('u-an','an@ness.lat',?,'AN','consultoria_admin',NULL,'org_ness',1)`).bind(h, h, h, h, h),
    d.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-b','Lead B','Proposal','org_b')`),
    d.prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, cliente, criada_por, status) VALUES
      ('pr-b','org_b','l-b',NULL,'B','comb@b.lat','aguardando_aprovacao')`),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  S.cb = await sessionFor({ id: 'u-cb', email: 'cb@b.lat', role: 'consultor', org_id: 'org_b' });
  S.comb = await sessionFor({ id: 'u-comb', email: 'comb@b.lat', role: 'comercial', org_id: 'org_b' });
}, 60_000);

describe('guardas: ehAdminDaOrg e podeAdministrarOrg', () => {
  it('só consultoria_admin é admin da organização (org_admin é do cliente)', () => {
    expect(ehAdminDaOrg({ role: 'consultoria_admin' })).toBe(true);
    for (const role of ['org_admin', 'platform_admin', 'consultor', 'comercial', 'admin', '', undefined]) expect(ehAdminDaOrg({ role })).toBe(false);
    expect(ehAdminDaOrg(null)).toBe(false);
  });
  it('platform_admin administra qualquer uma; consultoria_admin só a dele; ninguém mais; organização vazia nega', () => {
    expect(podeAdministrarOrg({ role: 'platform_admin' }, 'org_b')).toBe(true);
    expect(podeAdministrarOrg({ role: 'consultoria_admin', org_id: 'org_b' }, 'org_b')).toBe(true);
    expect(podeAdministrarOrg({ role: 'consultoria_admin', org_id: 'org_b' }, 'org_ness')).toBe(false);
    // sessão anterior à 0040 (sem org_id) é da ness.
    expect(podeAdministrarOrg({ role: 'consultoria_admin' }, 'org_ness')).toBe(true);
    expect(podeAdministrarOrg({ role: 'consultoria_admin' }, 'org_b')).toBe(false);
    for (const role of ['comercial', 'consultor', 'org_admin', 'admin']) expect(podeAdministrarOrg({ role, org_id: 'org_b' }, 'org_b')).toBe(false);
    expect(podeAdministrarOrg({ role: 'platform_admin' }, '')).toBe(false);
    expect(podeAdministrarOrg(null, 'org_b')).toBe(false);
  });
});

describe('POST /api/v1/platform/orgs: provisionamento', () => {
  it('cria organização, administrador e trilha num batch; envia o convite; a senha provisória não aparece em resposta nem em log', async () => {
    const enviados = espiarEmail();
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    }
    const res = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg(), comEmail);
    const texto = await res.text();
    expect(res.status, texto).toBe(201);
    const corpo = JSON.parse(texto);
    expect(corpo).toMatchObject({ id: 'org_consultoria-nova', slug: 'consultoria-nova', adminEmail: 'admin@nova.lat', emailEnviado: true });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toEqual(['admin@nova.lat']);
    const senha = senhaDoEmail(enviados[0].html);
    expect(senha.length).toBeGreaterThanOrEqual(16);
    expect(texto).not.toContain(senha);
    expect(logs.join('\n')).not.toContain(senha);

    const org = await um<any>('SELECT * FROM organizations WHERE id = ?', 'org_consultoria-nova');
    expect(org).toMatchObject({ name: 'Consultoria Nova', slug: 'consultoria-nova', prefixo_proposta: 'NOVA', cnpj: '11222333000181',
      max_projects: 10, max_users: 10, status: 'Active', termo_versao: 'v1-2026-10', proximo_numero: 1, textos: null, config_preco: null });
    expect(org.termo_aceito_em).toBeTruthy();

    const adm = await um<any>('SELECT * FROM users WHERE email = ?', 'admin@nova.lat');
    expect(adm).toMatchObject({ role: 'consultoria_admin', org_id: 'org_consultoria-nova', requires_password_change: 1, name: 'Admin Nova', client_project_id: null });
    expect(org.owner_id).toBe(adm.id);
    expect(await verifyPassword(senha, adm.password_hash)).toBe(true);
    expect(adm.password_hash).not.toContain(senha);

    const t = await um<any>(`SELECT * FROM audit_logs WHERE action = 'org.criada' AND details LIKE '%org_consultoria-nova%'`);
    expect(t).toMatchObject({ actor: 'pa@ness.lat', project_id: null });
    expect(t.details).toContain('admin@nova.lat');
    expect(t.details).not.toContain(senha);

    // O administrador entra com a senha do convite e cai no primeiro acesso, na organização nova.
    vi.restoreAllMocks();
    const login = await chamar('POST', '/api/v1/auth/login', {}, { email: 'admin@nova.lat', password: senha });
    const l = await login.json<any>();
    expect(login.status, JSON.stringify(l)).toBe(200);
    expect(l).toMatchObject({ requiresPasswordChange: true, user: { role: 'consultoria_admin', org_id: 'org_consultoria-nova' } });
    // E a configuração comercial é a padrão, sem termos (o administrador escreve os dele).
    const cfg = await (await chamar('GET', '/api/v1/org/config', { Authorization: `Bearer ${l.token}` })).json<any>();
    expect(cfg).toMatchObject({ id: 'org_consultoria-nova', prefixoProposta: 'NOVA', sugestaoNumero: expect.stringMatching(/^NOVA-\d{4}-001$/) });
    expect(cfg.textos.termos).toBe('');
  });

  it('falha do e-mail não desfaz a organização: 201 com emailEnviado false', async () => {
    espiarEmail(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ slug: 'sem-email', prefixoProposta: 'SEMEM', adminEmail: 'adm@semem.lat' }), comEmail);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 'org_sem-email', emailEnviado: false });
    expect(await um('SELECT id FROM organizations WHERE id = ?', 'org_sem-email')).not.toBeNull();
    expect(await um('SELECT id FROM users WHERE email = ?', 'adm@semem.lat')).not.toBeNull();
  });

  it('slug, prefixo ou e-mail repetidos → 409, e nada é gravado', async () => {
    const antes = await um<{ n: number }>('SELECT (SELECT COUNT(*) FROM organizations) + (SELECT COUNT(*) FROM users) AS n');
    for (const [corpo, msg] of [
      [novaOrg({ prefixoProposta: 'OUTRO', adminEmail: 'x1@x.lat' }), /slug/i],
      [novaOrg({ slug: 'consultoria-b', prefixoProposta: 'OUTRO', adminEmail: 'x1@x.lat' }), /slug/i],
      [novaOrg({ slug: 'outra', adminEmail: 'x2@x.lat' }), /prefixo/i],
      [novaOrg({ slug: 'outra', prefixoProposta: 'NESS', adminEmail: 'x2@x.lat' }), /prefixo/i],
      [novaOrg({ slug: 'outra', prefixoProposta: 'OUTRO', adminEmail: 'cb@b.lat' }), /e-mail/i],
      [novaOrg({ slug: 'outra', prefixoProposta: 'OUTRO', adminEmail: 'PA@Ness.lat' }), /e-mail/i],
    ] as const) {
      const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, corpo);
      const b = await r.json<any>();
      expect(r.status, JSON.stringify(corpo)).toBe(409);
      expect(b.error).toMatch(msg);
    }
    expect(await um<{ n: number }>('SELECT (SELECT COUNT(*) FROM organizations) + (SELECT COUNT(*) FROM users) AS n')).toEqual(antes);
  });

  it('corpo fora do contrato → 400 (campo extra, slug, prefixo, cnpj, limites)', async () => {
    for (const corpo of [
      novaOrg({ slug: 's1', prefixoProposta: 'S1', orgId: 'org_ness' }),
      novaOrg({ slug: 'AB' }), novaOrg({ slug: 'com espaço' }),
      novaOrg({ slug: 's2', prefixoProposta: 'minus' }),
      novaOrg({ slug: 's3', prefixoProposta: 'S3', cnpj: '123' }),
      novaOrg({ slug: 's4', prefixoProposta: 'S4', maxProjetos: 0 }),
      novaOrg({ slug: 's5', prefixoProposta: 'S5', maxUsuarios: 10001 }),
      novaOrg({ slug: 's6', prefixoProposta: 'S6', adminEmail: 'nao-e-email' }),
    ]) {
      expect((await chamar('POST', '/api/v1/platform/orgs', S.pa, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('só o platform_admin: consultoria_admin, consultor e comercial recebem 403 em /platform/*', async () => {
    for (const quem of [S.ab, S.cb, S.comb]) {
      expect((await chamar('POST', '/api/v1/platform/orgs', quem, novaOrg({ slug: 'intrusa', prefixoProposta: 'INTRU', adminEmail: 'i@i.lat' }))).status).toBe(403);
      expect((await chamar('GET', '/api/v1/platform/orgs', quem)).status).toBe(403);
      expect((await chamar('PUT', '/api/v1/platform/orgs/org_b', quem, { maxUsuarios: 9999 })).status).toBe(403);
    }
    expect(await um('SELECT id FROM organizations WHERE slug = ?', 'intrusa')).toBeNull();
    expect((await um<any>('SELECT max_users FROM organizations WHERE id = ?', 'org_b')).max_users).toBe(100);
  });
});

describe('GET/PUT /api/v1/platform/orgs', () => {
  it('lista com contagens e sem conteúdo', async () => {
    const r = await chamar('GET', '/api/v1/platform/orgs', S.pa);
    expect(r.status).toBe(200);
    const lista = await r.json<any[]>();
    const b = lista.find((o) => o.id === 'org_b');
    expect(b).toMatchObject({ nome: 'Consultoria B', slug: 'consultoria-b', status: 'Active', maxProjetos: 100, maxUsuarios: 100,
      projetos: 1, usuarios: 3, propostas: { aguardando_aprovacao: 1 } });
    expect(lista.some((o) => o.id === 'org_ness')).toBe(true);
    const texto = JSON.stringify(lista);
    for (const s of ['config_preco', 'textos', 'Obrigações', 'password', 'Lead B']) expect(texto).not.toContain(s);
  });

  it('PUT muda limites, nome e status; 404 para organização inexistente; a ness. não é suspensa', async () => {
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_b', S.pa, { maxProjetos: 50, nome: 'Consultoria B2' })).status).toBe(200);
    expect(await um('SELECT name, max_projects, max_users FROM organizations WHERE id = ?', 'org_b')).toEqual({ name: 'Consultoria B2', max_projects: 50, max_users: 100 });
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_nao', S.pa, { maxProjetos: 5 })).status).toBe(404);
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_ness', S.pa, { status: 'Suspended' })).status).toBe(409);
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_b', S.pa, { status: 'Bloqueada' })).status).toBe(400);
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_b', S.pa, { slug: 'outro' })).status).toBe(400);
    expect((await chamar('PUT', '/api/v1/platform/orgs/org_b', S.pa, {})).status).toBe(400);
    expect(await um(`SELECT 1 FROM audit_logs WHERE action = 'org.atualizada' AND details LIKE '%org_b%'`)).not.toBeNull();
  });
});

describe('consultoria_admin: poderes na PRÓPRIA organização', () => {
  it('configura a própria organização (e não a ness.); prefixo de outra organização → 409', async () => {
    const r = await chamar('PUT', '/api/v1/org/config', { ...S.ab, 'X-Org-Id': 'org_ness' }, { corDestaque: '#123456' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json<any>()).id).toBe('org_b');
    expect((await um<any>('SELECT cor_destaque FROM organizations WHERE id = ?', 'org_b')).cor_destaque).toBe('#123456');
    expect((await um<any>('SELECT cor_destaque FROM organizations WHERE id = ?', 'org_ness')).cor_destaque).not.toBe('#123456');
    expect((await chamar('PUT', '/api/v1/org/config', S.ab, { prefixoProposta: 'NESS' })).status).toBe(409);
    expect((await chamar('GET', '/api/v1/org/config', S.ab)).status).toBe(200);
  });

  it('consultor e comercial continuam sem gravar a configuração', async () => {
    expect((await chamar('PUT', '/api/v1/org/config', S.comb, { corDestaque: '#654321' })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/org/config', S.cb, { corDestaque: '#654321' })).status).toBe(403);
  });

  it('semeia o catálogo da própria organização e aprova desconto', async () => {
    expect((await chamar('POST', '/api/v1/servicos/semear-padrao', S.ab, {})).status).toBe(201);
    expect((await um<any>(`SELECT COUNT(*) n FROM servicos WHERE org_id = 'org_b'`)).n).toBeGreaterThan(0);
    expect((await um<any>(`SELECT COUNT(*) n FROM servicos WHERE org_id = 'org_ness'`)).n).toBe(0);
    expect((await chamar('POST', '/api/v1/propostas/pr-b/aprovar-desconto', S.comb, {})).status).toBe(403);
    const r = await chamar('POST', '/api/v1/propostas/pr-b/aprovar-desconto', S.ab, {});
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await um('SELECT status, desconto_aprovado_por FROM propostas WHERE id = ?', 'pr-b')).toEqual({ status: 'rascunho', desconto_aprovado_por: 'ab@b.lat' });
  });

  it('cria consultor, comercial e consultoria_admin da organização dela (X-Org-Id ignorado)', async () => {
    for (const role of ['consultor', 'comercial', 'consultoria_admin']) {
      const email = `novo-${role}@b.lat`;
      const r = await chamar('POST', '/api/v1/users', { ...S.ab, 'X-Org-Id': 'org_ness' }, { email, password: SENHA, name: 'N', role });
      expect(r.status, await r.clone().text()).toBe(201);
      expect(await um('SELECT role, org_id FROM users WHERE email = ?', email)).toEqual({ role, org_id: 'org_b' });
    }
  });

  it('NÃO cria platform_admin, papel legado, conta com org_id no corpo, nem cliente de projeto alheio', async () => {
    const tentativas: [unknown, number][] = [
      [{ email: 'e1@b.lat', password: SENHA, name: 'E', role: 'platform_admin' }, 403],
      [{ email: 'e2@b.lat', password: SENHA, name: 'E', role: 'admin' }, 400],
      [{ email: 'e3@b.lat', password: SENHA, name: 'E', role: 'consultoria_admin', org_id: 'org_ness' }, 400],
      [{ email: 'e4@b.lat', password: SENHA, name: 'E', role: 'org_admin', client_project_id: 'p-ness' }, 403],
      [{ email: 'e5@b.lat', password: SENHA, name: 'E', role: 'ciso' }, 400],
    ];
    for (const [corpo, st] of tentativas) {
      const r = await chamar('POST', '/api/v1/users', S.ab, corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(st);
    }
    expect(await um(`SELECT COUNT(*) n FROM users WHERE email LIKE 'e_@b.lat'`)).toEqual({ n: 0 });
  });

  it('não vê nem edita a ness.: usuário da ness. → 404; GET /users só traz a organização dela', async () => {
    expect((await chamar('PUT', '/api/v1/users/u-pa', S.ab, { name: 'x' })).status).toBe(404);
    expect((await chamar('PUT', '/api/v1/users/u-an', S.ab, { name: 'x' })).status).toBe(404);
    expect((await chamar('DELETE', '/api/v1/users/u-an', S.ab)).status).toBe(404);
    const lista = await (await chamar('GET', '/api/v1/users', S.ab)).json<any[]>();
    expect(lista.map((u) => u.email)).not.toContain('pa@ness.lat');
    expect(lista.map((u) => u.email)).not.toContain('an@ness.lat');
  });

  it('designa consultor nos projetos da organização dela, não nos de outra', async () => {
    const membro = { name: 'CB', email: 'cb@b.lat', role_category: 'consultor', job_title: 'Consultor' };
    expect((await chamar('POST', '/api/v1/projects/p-b/governance', S.ab, membro)).status).toBe(200);
    expect(await um(`SELECT 1 AS ok FROM project_governance WHERE project_id = 'p-b' AND email = 'cb@b.lat'`)).toEqual({ ok: 1 });
    expect((await chamar('POST', '/api/v1/projects/p-ness/governance', S.ab, membro)).status).toBe(403);
    // o consultor continua sem designar (regra do #210)
    expect((await chamar('POST', '/api/v1/projects/p-b/governance', S.cb, { ...membro, email: 'outro@b.lat' })).status).toBe(403);
  });
});

describe('escalada de papel', () => {
  it('consultor e comercial não viram administradores (nem a si mesmos)', async () => {
    expect((await chamar('PUT', '/api/v1/users/u-cb', S.cb, { role: 'consultoria_admin' })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/users/u-comb', S.comb, { role: 'consultoria_admin' })).status).toBe(403);
    expect((await chamar('POST', '/api/v1/users', S.comb, { email: 'c9@b.lat', password: SENHA, name: 'C', role: 'consultoria_admin' })).status).toBe(403);
    expect(await um('SELECT role FROM users WHERE id = ?', 'u-cb')).toEqual({ role: 'consultor' });
    expect(await um('SELECT role FROM users WHERE id = ?', 'u-comb')).toEqual({ role: 'comercial' });
  });

  it('consultoria_admin não se promove a platform_admin nem muda o próprio org_id', async () => {
    expect((await chamar('PUT', '/api/v1/users/u-ab', S.ab, { role: 'platform_admin' })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/users/u-ab', S.ab, { org_id: 'org_ness' })).status).toBe(400);
    expect((await chamar('PUT', '/api/v1/users/u-cb', S.ab, { org_id: 'org_ness' })).status).toBe(400);
    expect(await um('SELECT role, org_id FROM users WHERE id = ?', 'u-ab')).toEqual({ role: 'consultoria_admin', org_id: 'org_b' });
    expect(await um('SELECT org_id FROM users WHERE id = ?', 'u-cb')).toEqual({ org_id: 'org_b' });
  });
});

describe('organização suspensa', () => {
  it('bloqueia login e sessão existente da equipe; agente cai; reativar devolve o acesso', async () => {
    const h = await hashPassword(SENHA);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_s', 'S', 'org-s', 10, 10)`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-s','Cliente S','ISO 27001','controller','Active','org_s')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-as','as@s.lat',?,'AS','consultoria_admin','org_s'), ('u-cs','cs@s.lat',?,'CS','consultor','org_s')`).bind(h, h),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-clis','clis@s.lat',?,'CliS','org_admin','p-s','org_s')`).bind(h),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-s','CS','cs@s.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-s','u-cs','p-s', datetime('now','+30 days'))`),
    ]);
    const entrar = (email: string) => chamar('POST', '/api/v1/auth/login', {}, { email, password: SENHA });
    const r0 = await entrar('as@s.lat');
    expect(r0.status).toBe(200);
    const sessao = { Authorization: `Bearer ${(await r0.json<any>()).token}` };
    const agente = { AGENTE: { concessaoId: 'c-s', userId: 'u-cs', email: 'cs@s.lat', projectId: 'p-s' } };
    expect((await chamar('GET', '/api/v1/org/config', sessao)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-s/risks', {}, undefined, agente)).status).toBe(200);

    expect((await chamar('PUT', '/api/v1/platform/orgs/org_s', S.pa, { status: 'Suspended' })).status).toBe(200);

    const r1 = await entrar('as@s.lat');
    expect(r1.status).toBe(403);
    expect((await r1.json<any>()).error).toMatch(/suspensa/i);
    expect((await entrar('cs@s.lat')).status).toBe(403);
    for (const caminho of ['/api/v1/org/config', '/api/v1/projects', '/api/v1/projects/p-s/risks', '/api/v1/users']) {
      expect((await chamar('GET', caminho, sessao)).status, caminho).toBe(403);
    }
    expect((await chamar('GET', '/api/v1/projects/p-s/risks', {}, undefined, agente)).status).toBe(401);
    // o cliente do projeto não é "equipe" da consultoria: segue entrando
    expect((await entrar('clis@s.lat')).status).toBe(200);

    expect((await chamar('PUT', '/api/v1/platform/orgs/org_s', S.pa, { status: 'Active' })).status).toBe(200);
    expect((await entrar('as@s.lat')).status).toBe(200);
    expect((await chamar('GET', '/api/v1/org/config', sessao)).status).toBe(200);
  });
});

describe('limites do plano', () => {
  it('projeto e usuário além de max_projects/max_users → 409; a ness. (plano interno) não tem limite', async () => {
    const h = await hashPassword(SENHA);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_l', 'L', 'org-l', 1, 2)`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-al','al@l.lat',?,'AL','consultoria_admin','org_l')`).bind(h),
    ]);
    const al = await sessionFor({ id: 'u-al', email: 'al@l.lat', role: 'consultoria_admin', org_id: 'org_l' });
    expect((await chamar('POST', '/api/v1/projects', al, { client_name: 'L1' })).status).toBe(201);
    const r = await chamar('POST', '/api/v1/projects', al, { client_name: 'L2' });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'Limite de projetos do plano atingido' });
    expect((await chamar('POST', '/api/v1/projects', { ...S.pa, 'X-Org-Id': 'org_l' }, { client_name: 'L3' })).status).toBe(409);
    expect((await um<any>(`SELECT COUNT(*) n FROM projects WHERE org_id = 'org_l'`)).n).toBe(1);

    expect((await chamar('POST', '/api/v1/users', al, { email: 'u2@l.lat', password: SENHA, name: 'U', role: 'consultor' })).status).toBe(201);
    const u = await chamar('POST', '/api/v1/users', al, { email: 'u3@l.lat', password: SENHA, name: 'U', role: 'consultor' });
    expect(u.status).toBe(409);
    expect(await u.json()).toEqual({ error: 'Limite de usuários do plano atingido' });

    // A ness. tem os limites padrão da coluna (3/5), mas o plano 'interno' é ilimitado.
    expect(await um('SELECT plan, max_projects FROM organizations WHERE id = ?', 'org_ness')).toEqual({ plan: 'interno', max_projects: 3 });
    for (let i = 0; i < 4; i++) expect((await chamar('POST', '/api/v1/projects', S.pa, { client_name: `N${i}` })).status).toBe(201);
    expect((await um<any>(`SELECT COUNT(*) n FROM projects WHERE org_id = 'org_ness'`)).n).toBeGreaterThan(3);
  });
});
