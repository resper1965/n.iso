import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, verifyPassword } from '../src/helpers';
import { limiteDoPlanoAtingido } from '../src/services/organizacao';
import { applySchema, resetData, resetSessions, workerEnv, sessionFor } from './helpers/d1';

/**
 * Revisão final da fatia 5, itens decididos pelo controlador:
 * a) GET /users do platform_admin filtra pela organização do X-Org-Id;
 * b) POST /platform/orgs/:id/reenviar-convite (e `adminPendente` na lista);
 * c) `max_users` conta só a equipe;
 * d) prefixo de proposta único no banco: violação vira 409, não 500;
 * e) e-mail de boas-vindas com o nome da organização.
 */
const SENHA = 'Senha-forte-123!';
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, extraEnv: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extraEnv } as any);
const comEmail = { RESEND_API_KEY: 'chave-de-teste' };
const S: Record<string, Record<string, string>> = {};

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

beforeEach(async () => {
  await applySchema();
  await resetData();
  await resetSessions();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta) VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS')`),
    d.prepare(`INSERT INTO organizations (id, name, slug, plan, max_projects, max_users, prefixo_proposta, owner_id) VALUES
      ('org_b', 'Consultoria <B>', 'consultoria-b', 'consultoria', 100, 2, 'CB', 'u-ab'),
      ('org_c', 'Consultoria C', 'consultoria-c', 'consultoria', 100, 100, NULL, NULL)`),
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      ('p-b','Cliente B','ISO 27001','controller','Active','org_b'), ('p-n','Cliente N','ISO 27001','controller','Active','org_ness')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, requires_password_change) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',0),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1),
      ('u-clib','clib@b.lat',?,'CliB','org_user','p-b','org_b',0),
      ('u-clin','clin@n.lat',?,'CliN','org_user','p-n','org_ness',0),
      ('u-cn','cn@ness.lat',?,'CN','consultor',NULL,'org_ness',0)`).bind(h, h, h, h, h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
});

describe('a) GET /users do platform_admin', () => {
  it('com X-Org-Id válido: só as contas daquela organização (equipe e clientes dos projetos dela); sem o cabeçalho: todas', async () => {
    const ids = async (h: Record<string, string>) => (await (await chamar('GET', '/api/v1/users', h)).json<any[]>()).map((u) => u.id).sort();
    expect(await ids({ ...S.pa, 'X-Org-Id': 'org_b' })).toEqual(['u-ab', 'u-clib']);
    expect(await ids(S.pa)).toEqual(['u-ab', 'u-clib', 'u-clin', 'u-cn', 'u-pa']);
    expect((await chamar('GET', '/api/v1/users', { ...S.pa, 'X-Org-Id': 'org_nao_existe' })).status).toBe(403);
  });
});

describe('b) reenviar convite', () => {
  it('nova senha provisória, sessões derrubadas, e-mail com a senha nova; resposta e trilha sem senha', async () => {
    const sessaoAntiga = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
    const antes = (await env.DB.prepare(`SELECT password_hash AS h FROM users WHERE id = 'u-ab'`).first<any>()).h;
    const enviados = espiarEmail();
    const res = await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.pa, undefined, comEmail);
    const texto = await res.text();
    expect(res.status, texto).toBe(200);
    expect(JSON.parse(texto)).toEqual({ emailEnviado: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toEqual(['ab@b.lat']);
    const senha = senhaDoEmail(enviados[0].html);
    expect(senha.length).toBeGreaterThanOrEqual(20);
    const conta = await env.DB.prepare(`SELECT password_hash AS h, requires_password_change AS r FROM users WHERE id = 'u-ab'`).first<any>();
    expect(conta.h).not.toBe(antes);
    expect(conta.r).toBe(1);
    expect(await verifyPassword(senha, conta.h)).toBe(true);
    expect(texto).not.toContain(senha);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'org.convite_reenviado' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(trilha.details).toContain('ab@b.lat');
    expect(trilha.details).not.toContain(senha);
    // a sessão aberta antes do reenvio morre
    expect((await chamar('GET', '/api/v1/org/config', sessaoAntiga)).status).toBe(401);
  });

  it('e-mail que falha: emailEnviado false', async () => {
    espiarEmail(false);
    const res = await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.pa, undefined, comEmail);
    expect(await res.json()).toEqual({ emailEnviado: false });
  });

  it('404 organização inexistente; 409 quando o administrador já entrou; 403 para quem não é platform_admin', async () => {
    expect((await chamar('POST', '/api/v1/platform/orgs/org_x/reenviar-convite', S.pa)).status).toBe(404);
    const r = await chamar('POST', '/api/v1/platform/orgs/org_c/reenviar-convite', S.pa);
    expect(r.status).toBe(409);
    expect((await r.json<any>()).error).toContain('Esqueci a senha');
    await env.DB.prepare(`UPDATE users SET requires_password_change = 0 WHERE id = 'u-ab'`).run();
    expect((await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.pa)).status).toBe(409);
    expect((await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.ab)).status).toBe(403);
  });

  it('limite de taxa: 5 por hora por organização', async () => {
    espiarEmail();
    for (let i = 0; i < 5; i++) {
      expect((await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.pa, undefined, comEmail)).status, `tentativa ${i + 1}`).toBe(200);
    }
    expect((await chamar('POST', '/api/v1/platform/orgs/org_b/reenviar-convite', S.pa, undefined, comEmail)).status).toBe(429);
  });

  it('GET /platform/orgs informa adminPendente; usuarios conta só a equipe', async () => {
    const lista = await (await chamar('GET', '/api/v1/platform/orgs', S.pa)).json<any[]>();
    const b = lista.find((o) => o.id === 'org_b');
    expect(b.adminPendente).toBe(true);
    expect(b.usuarios).toBe(1); // u-ab; o cliente u-clib não conta
    expect(lista.find((o) => o.id === 'org_c').adminPendente).toBe(false);
  });
});

describe('c) max_users conta só a equipe', () => {
  it('limiteDoPlanoAtingido ignora contas de cliente', async () => {
    // org_b: max_users 2, um administrador e um cliente
    expect(await limiteDoPlanoAtingido(env.DB, 'org_b', 'usuarios')).toBe(false);
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cli2','cli2@b.lat','x','C2','client','p-b','org_b'), ('u-cli3','cli3@b.lat','x','C3','org_admin','p-b','org_b')`).run();
    expect(await limiteDoPlanoAtingido(env.DB, 'org_b', 'usuarios')).toBe(false);
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cb','cb@b.lat','x','CB','consultor','org_b')`).run();
    expect(await limiteDoPlanoAtingido(env.DB, 'org_b', 'usuarios')).toBe(true);
  });

  it('pela API: no limite, cliente ainda é criado; equipe não; promover cliente a equipe também não', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cb','cb@b.lat','x','CB','consultor','org_b')`).run();
    let res = await chamar('POST', '/api/v1/users', S.ab, { email: 'novo-cli@b.lat', password: SENHA, name: 'N', role: 'org_user', client_project_id: 'p-b' });
    expect(res.status, await res.clone().text()).toBe(201);
    res = await chamar('POST', '/api/v1/users', S.ab, { email: 'novo-com@b.lat', password: SENHA, name: 'N', role: 'comercial' });
    expect(res.status).toBe(409);
    res = await chamar('PUT', '/api/v1/users/u-clib', S.ab, { role: 'comercial', client_project_id: null });
    expect(res.status).toBe(409);
    expect((await env.DB.prepare(`SELECT role FROM users WHERE id = 'u-clib'`).first<any>()).role).toBe('org_user');
  });
});

describe('d) prefixo de proposta único no banco', () => {
  /** A conferência na rota perde a corrida: o SELECT de conflito "não vê" nada, e o índice decide. */
  const semConferencia = () => {
    const db = env.DB;
    return {
      DB: new Proxy(db, {
        get(alvo, prop) {
          if (prop !== 'prepare') return (alvo as any)[prop]?.bind?.(alvo) ?? (alvo as any)[prop];
          return (sql: string) => {
            const st = alvo.prepare(sql);
            if (!/upper\(prefixo_proposta\)/.test(sql)) return st;
            return new Proxy(st, { get: (s, p) => (p === 'bind' ? (...a: unknown[]) => { const b = s.bind(...a); return new Proxy(b, { get: (x, q) => (q === 'first' ? async () => null : (x as any)[q]?.bind?.(x) ?? (x as any)[q]) }); } : (s as any)[p]?.bind?.(s) ?? (s as any)[p]) });
          };
        },
      }),
    };
  };

  it('PUT /org/config com prefixo de outra organização que escapa da conferência → 409 (não 500)', async () => {
    const res = await chamar('PUT', '/api/v1/org/config', S.ab, { prefixoProposta: 'NESS' }, semConferencia());
    expect(res.status, await res.clone().text()).toBe(409);
    expect((await env.DB.prepare(`SELECT prefixo_proposta AS p FROM organizations WHERE id = 'org_b'`).first<any>()).p).toBe('CB');
  });

  it('POST /platform/orgs com prefixo repetido que escapa da conferência → 409, nada criado', async () => {
    espiarEmail();
    const res = await chamar('POST', '/api/v1/platform/orgs', S.pa, {
      nome: 'Nova', slug: 'nova', prefixoProposta: 'CB', adminEmail: 'adm@nova.lat', adminNome: 'Adm', maxProjetos: 5, maxUsuarios: 5, termoVersao: 'v1',
    }, { ...comEmail, ...semConferencia() });
    expect(res.status, await res.clone().text()).toBe(409);
    expect(await env.DB.prepare(`SELECT 1 FROM organizations WHERE id = 'org_nova'`).first()).toBeNull();
  });

  it('organização sem prefixo grava NULL, não string vazia (duas sem prefixo não conflitam)', async () => {
    await env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_d', 'D', 'd', 5, 5)`).run();
    const sd = await sessionFor({ id: 'u-ad', email: 'ad@d.lat', role: 'consultoria_admin', org_id: 'org_d' });
    const sc = await sessionFor({ id: 'u-ac', email: 'ac@c.lat', role: 'consultoria_admin', org_id: 'org_c' });
    expect((await chamar('PUT', '/api/v1/org/config', sc, { nome: 'C2' })).status).toBe(200);
    expect((await chamar('PUT', '/api/v1/org/config', sd, { nome: 'D2' })).status).toBe(200);
    const { results } = await env.DB.prepare(`SELECT prefixo_proposta AS p FROM organizations WHERE id IN ('org_c', 'org_d')`).all<any>();
    expect(results.map((r) => r.p)).toEqual([null, null]);
  });
});

describe('e) e-mail de boas-vindas com o nome da organização', () => {
  it('conta criada pelo consultoria_admin da org B: o nome dela, escapado; pela ness.: "ness."', async () => {
    const enviados = espiarEmail();
    let res = await chamar('POST', '/api/v1/users', S.ab, { email: 'cli-novo@b.lat', password: SENHA, name: 'N', role: 'org_user', client_project_id: 'p-b' }, comEmail);
    expect(res.status, await res.clone().text()).toBe(201);
    expect(enviados[0].html).toContain('portal de GRC da <strong>Consultoria &lt;B&gt;.</strong>');
    expect(enviados[0].html).not.toContain('<strong>ness.</strong>');
    res = await chamar('POST', '/api/v1/users', S.pa, { email: 'cli-n@n.lat', password: SENHA, name: 'N', role: 'org_user', client_project_id: 'p-n' }, comEmail);
    expect(res.status).toBe(201);
    expect(enviados[1].html).toContain('portal de GRC da <strong>ness.</strong>');
  });

  it('provisionamento de organização: o nome da organização nova', async () => {
    const enviados = espiarEmail();
    const res = await chamar('POST', '/api/v1/platform/orgs', S.pa, {
      nome: 'Gama Seg', slug: 'gama', prefixoProposta: 'GAMA', adminEmail: 'adm@gama.lat', adminNome: 'Adm', maxProjetos: 5, maxUsuarios: 5, termoVersao: 'v1',
    }, comEmail);
    expect(res.status, await res.clone().text()).toBe(201);
    expect(enviados[0].html).toContain('portal de GRC da <strong>Gama Seg.</strong>');
  });
});
