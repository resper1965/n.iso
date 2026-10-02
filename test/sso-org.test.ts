import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { provisionar, papelValidoParaSso, iniciarLogin } from '../src/sso';
import { orgDoUsuario, ORG_NESS, SESSAO_COM_ORG_DESDE } from '../src/services/organizacao';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { ssoConfigSchema } from '../src/schemas/auth';

/**
 * Revisão final da fatia 5, B2: o SSO de tenant criava conta de EQUIPE na org_ness.
 *
 * `papel_padrao` era string livre e `papelValidoParaSso` uma lista de NEGAÇÃO (consultor e
 * platform_admin): o `consultoria_admin` da org B configurava o SSO do projeto dele com
 * `papel_padrao: 'consultoria_admin'` e um domínio dele, e o login federado criava um administrador
 * de consultoria — na org_ness, porque o INSERT do JIT não gravava `org_id`. Agora: lista de
 * PERMISSÃO (só papel de cliente), o JIT grava a organização do PROJETO, a sessão do SSO leva
 * `org_id`, conta de equipe existente é recusada, e sessão de equipe nova sem `org_id` é negada.
 */
const SENHA = 'Senha-forte-123!';
const ISSUER = 'https://idp.atacante.tld';
const CLIENT_ID = 'cliente-b';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv() as any);
const S: Record<string, Record<string, string>> = {};

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const textoB64url = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

beforeAll(async () => {
  await applySchema();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 100, 100)`),
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-b','Cliente B','ISO 27001','controller','Active','org_b')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1),
      ('u-com-preso','comercial@atacante.tld',?,'Com','comercial','p-b','org_b',1)`).bind(h, h),
  ]);
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
}, 60_000);

const corpoSso = (papel_padrao: unknown) => ({
  issuer: ISSUER, client_id: CLIENT_ID, client_secret: 'segredo', dominios: 'atacante.tld', papel_padrao, ativo: true,
});

describe('B2 — papel_padrao é lista de permissão (só papel de cliente)', () => {
  it('PUT /projects/:id/sso recusa papel de equipe, de plataforma e lixo (400); aceita os de cliente', async () => {
    for (const papel of ['consultoria_admin', 'comercial', 'consultor', 'consultant', 'platform_admin', 'admin', 'employee', 'lixo', '']) {
      const res = await chamar('PUT', '/api/v1/projects/p-b/sso', S.ab, corpoSso(papel));
      expect(res.status, `${papel}: ${await res.clone().text()}`).toBe(400);
    }
    expect(await env.DB.prepare('SELECT 1 FROM project_sso').first()).toBeNull();
    for (const papel of ['org_admin', 'client', 'org_user']) {
      const res = await chamar('PUT', '/api/v1/projects/p-b/sso', S.ab, corpoSso(papel));
      expect(res.status, `${papel}: ${await res.clone().text()}`).toBe(200);
    }
  });

  it('o schema (zod) também é lista de permissão: as duas camadas recusam sozinhas', () => {
    for (const papel of ['consultoria_admin', 'comercial', 'consultor', 'platform_admin', 'lixo']) {
      expect(ssoConfigSchema.safeParse(corpoSso(papel)).success, papel).toBe(false);
    }
    expect(ssoConfigSchema.safeParse(corpoSso('org_user')).success).toBe(true);
  });

  it('papelValidoParaSso e provisionar: qualquer papel fora da lista é recusado', async () => {
    for (const p of ['consultoria_admin', 'comercial', 'consultor', 'platform_admin', 'lixo', '', null, undefined]) {
      expect(papelValidoParaSso(p as any), String(p)).toBe(false);
    }
    const cfg = { project_id: 'p-b', issuer: ISSUER, client_id: CLIENT_ID, client_secret: 'x', dominios: 'atacante.tld', papel_padrao: 'consultoria_admin', ativo: 1 };
    const claims = { iss: ISSUER, aud: CLIENT_ID, exp: 0, iat: 0, sub: 's', email: 'novo@atacante.tld', email_verified: true } as any;
    await expect(provisionar(env as any, cfg as any, claims)).rejects.toThrow(/papel_padrao inválido/);
    expect(await env.DB.prepare(`SELECT 1 FROM users WHERE email = 'novo@atacante.tld'`).first()).toBeNull();
  });
});

describe('B2 — fluxo JIT completo pelo callback', () => {
  async function loginSso(email: string): Promise<{ location: string; token: string | null }> {
    const par = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = (await crypto.subtle.exportKey('jwk', par.publicKey)) as any;
    const jwks = { keys: [{ ...jwk, kid: 'k1', use: 'sig', alg: 'RS256' }] };
    const d = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` };
    // Descoberta em cache: o teste não depende de DNS nem do documento.
    await env.SESSIONS.put(`sso_descoberta:${ISSUER}`, JSON.stringify(d));
    const cfg = await env.DB.prepare('SELECT * FROM project_sso WHERE project_id = ?').bind('p-b').first<any>();
    const { state } = await iniciarLogin(env as any, cfg, d, 'http://localhost/api/v1/public/sso/callback');
    const { nonce } = JSON.parse((await env.SESSIONS.get(`sso_state:${state}`))!);
    const agora = Math.floor(Date.now() / 1000);
    const h = textoB64url({ alg: 'RS256', typ: 'JWT', kid: 'k1' });
    const p = textoB64url({ iss: ISSUER, aud: CLIENT_ID, exp: agora + 300, iat: agora, sub: 'sub-1', email, email_verified: true, name: 'Pessoa', nonce });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${h}.${p}`));
    const idToken = `${h}.${p}.${b64url(new Uint8Array(sig))}`;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: any) => {
      const url = String(u);
      if (url === d.token_endpoint) return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
      if (url === d.jwks_uri) return new Response(JSON.stringify(jwks), { status: 200 });
      return new Response('inesperado', { status: 500 });
    }) as any);
    const res = await chamar('GET', `/api/v1/public/sso/callback?code=abc&state=${state}`, {});
    const location = res.headers.get('Location') ?? '';
    const m = location.match(/sso_token=([^&]+)/);
    return { location, token: m ? decodeURIComponent(m[1]) : null };
  }

  it('org_user: a conta nasce na organização do PROJETO (org_b) e a sessão carrega org_id', async () => {
    await chamar('PUT', '/api/v1/projects/p-b/sso', S.ab, corpoSso('org_user'));
    const { location, token } = await loginSso('pessoa@atacante.tld');
    expect(token, location).not.toBeNull();
    const conta = await env.DB.prepare(`SELECT role, client_project_id, org_id FROM users WHERE email = 'pessoa@atacante.tld'`).first();
    expect(conta).toEqual({ role: 'org_user', client_project_id: 'p-b', org_id: 'org_b' });
    const sessao = JSON.parse((await env.SESSIONS.get(`session_${token}`))!);
    expect(sessao.org_id).toBe('org_b');
    expect(sessao.role).toBe('org_user');
  });

  it('conta de EQUIPE existente com o mesmo e-mail (mesmo presa ao projeto) é recusada, sem sessão', async () => {
    await chamar('PUT', '/api/v1/projects/p-b/sso', S.ab, corpoSso('org_user'));
    const { location, token } = await loginSso('comercial@atacante.tld');
    expect(token).toBeNull();
    expect(location).toContain('sso_erro');
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'auth.sso_failed' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(trilha.details).toMatch(/não é de cliente/);
  });
});

describe('B2 — sessão de equipe sem org_id: legado até SESSAO_COM_ORG_DESDE, depois nega', () => {
  it('orgDoUsuario pelo iat', () => {
    for (const role of ['consultor', 'comercial', 'consultoria_admin']) {
      expect(orgDoUsuario({ role, iat: SESSAO_COM_ORG_DESDE - 1 }), role).toBe(ORG_NESS);
      expect(orgDoUsuario({ role }), role).toBe(ORG_NESS); // sem iat: legado
      expect(orgDoUsuario({ role, iat: SESSAO_COM_ORG_DESDE }), role).toBeNull();
      expect(orgDoUsuario({ role, iat: SESSAO_COM_ORG_DESDE, org_id: 'org_b' }), role).toBe('org_b');
    }
    expect(SESSAO_COM_ORG_DESDE).toBe(Date.parse('2026-10-03T00:00:00Z'));
  });

  it('pela API, com o relógio: sessão legada antes do corte = ness.; sessão sem org_id depois do corte → 403', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cn','cn@ness.lat','x','CN','comercial','org_ness')`).run();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const antes = await sessionFor({ id: 'u-cn', email: 'cn@ness.lat', role: 'comercial', org_id: undefined });
    expect((await chamar('GET', '/api/v1/org/config', antes)).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    const depois = await sessionFor({ id: 'u-cn', email: 'cn@ness.lat', role: 'comercial', org_id: undefined });
    expect((await chamar('GET', '/api/v1/org/config', depois)).status).toBe(403);
    const comOrg = await sessionFor({ id: 'u-cn', email: 'cn@ness.lat', role: 'comercial', org_id: 'org_ness' });
    expect((await chamar('GET', '/api/v1/org/config', comOrg)).status).toBe(200);
  });
});

describe('B2 — todo caminho que cria ou recarimba sessão grava org_id', () => {
  const sessaoDoToken = async (token: string) => JSON.parse((await env.SESSIONS.get(`session_${token}`))!);
  const bearer = (h: Record<string, string>) => h.Authorization.replace('Bearer ', '');

  it('login por senha', async () => {
    const h = await hashPassword(SENHA);
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-login','login@b.lat',?,'L','consultor','org_b')`).bind(h).run();
    const res = await chamar('POST', '/api/v1/auth/login', {}, { email: 'login@b.lat', password: SENHA });
    expect(res.status, await res.clone().text()).toBe(200);
    const { token } = await res.json() as any;
    expect((await sessaoDoToken(token)).org_id).toBe('org_b');
  });

  it('troca de senha e primeiro acesso: a sessão LEGADA recarimbada ganha o org_id do banco', async () => {
    const h = await hashPassword(SENHA);
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, requires_password_change) VALUES
      ('u-troca','troca@b.lat',?,'T','consultor','org_b',0), ('u-prim','prim@b.lat',?,'P','consultor','org_b',1)`).bind(h, h).run();
    const troca = await sessionFor({ id: 'u-troca', email: 'troca@b.lat', role: 'consultor', org_id: undefined });
    let res = await chamar('POST', '/api/v1/auth/change-password', troca, { oldPassword: SENHA, newPassword: 'Outra-senha-forte-456!' });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await sessaoDoToken(bearer(troca))).org_id).toBe('org_b');

    const prim = await sessionFor({ id: 'u-prim', email: 'prim@b.lat', role: 'consultor', org_id: undefined });
    res = await chamar('POST', '/api/v1/auth/reset-password-first', prim, { newPassword: 'Outra-senha-forte-456!' });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await sessaoDoToken(bearer(prim))).org_id).toBe('org_b');
  });

  it('estático: todo `SESSIONS.put(`session_…` em src grava org_id ou é cópia declarada da sessão existente', () => {
    const fontes = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    // Cópias que preservam a sessão inteira (e o iat): não criam sessão, não precisam do campo.
    const COPIAS: Record<string, string> = {
      '../src/middleware/auth.ts': 'renovação de atividade: `{ ...user, seen }`, mesmo iat',
      '../src/routes/mfa.ts': 'promoverSessao: relê a sessão do KV e só remove mfa_pending',
    };
    const semOrg: string[] = [];
    let vistos = 0;
    for (const [arquivo, texto] of Object.entries(fontes)) {
      const linhas = texto.split('\n');
      linhas.forEach((l, i) => {
        if (!l.includes('SESSIONS.put(`session_')) return;
        vistos++;
        if (arquivo in COPIAS) return;
        if (!linhas.slice(Math.max(0, i - 25), i).join('\n').includes('org_id')) semOrg.push(`${arquivo}:${i + 1}`);
      });
    }
    expect(vistos, 'o padrão parou de casar: o teste olharia nada').toBeGreaterThanOrEqual(6);
    expect(semOrg, 'sessão criada sem org_id').toEqual([]);
  });
});
