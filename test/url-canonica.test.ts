// Endereço canônico (Tarefa 7 da arrumação final). Link de e-mail, callback de SSO, base do SCIM,
// CORS e hosts do MCP saem de `appUrl(env)`, nunca do host da requisição: o IdP do cliente cadastra
// UM callback, e um host alternativo gerava outro. `APP_URL` sobrescreve o padrão.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { appUrl } from '../src/config/url';
import { hostsPermitidosMcp } from '../src/mcp/servidor';
import { applySchema, resetData, resetSessions, sessionFor, workerEnv } from './helpers/d1';
import { sha256Hex } from '../src/helpers';

const CANONICO = 'https://niso.ness.com.br';
const ALTERNATIVO = 'https://ambiente-alternativo.exemplo.com';
const A = 'proj-url';
const ISSUER = 'https://idp.exemplo.com';

/** Requisição a um host que NÃO é o canônico, para provar que a URL não vem dele. */
const chamar = (caminho: string, init: RequestInit = {}, extra: Record<string, unknown> = {}, host = 'http://localhost') =>
  app.fetch(new Request(host + caminho, init), { ...workerEnv(), ...extra } as any);

describe('appUrl', () => {
  it('padrão é o canônico; APP_URL sobrescreve; barra final sai', () => {
    expect(appUrl()).toBe(CANONICO);
    expect(appUrl({})).toBe(CANONICO);
    expect(appUrl({ APP_URL: `${ALTERNATIVO}/` })).toBe(ALTERNATIVO);
  });
});

describe('URLs geradas usam o canônico, não o host da requisição', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind(A, 'Cliente URL', 'ISO 27001', 'controller', 'Active').run();
  });

  async function redirectUriDoSso(extra: Record<string, unknown> = {}) {
    await env.DB.prepare(`INSERT INTO project_sso (project_id, issuer, client_id, client_secret, dominios, ativo) VALUES (?,?,?,?,?,1)`)
      .bind(A, ISSUER, 'cli', 'cifrado', 'cliente-url.com').run();
    // descoberta em cache: o teste não sai para a rede
    await env.SESSIONS.put(`sso_descoberta:${ISSUER}`, JSON.stringify({
      issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`,
    }));
    const res = await chamar('/api/v1/public/sso/iniciar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'p@cliente-url.com' }),
    }, extra);
    expect(res.status, await res.clone().text()).toBe(200);
    const { autorizacao } = await res.json<any>();
    return new URL(autorizacao).searchParams.get('redirect_uri');
  }

  it('callback de SSO é o canônico', async () => {
    expect(await redirectUriDoSso()).toBe(`${CANONICO}/api/v1/public/sso/callback`);
  });

  it('callback de SSO segue APP_URL', async () => {
    expect(await redirectUriDoSso({ APP_URL: ALTERNATIVO })).toBe(`${ALTERNATIVO}/api/v1/public/sso/callback`);
  });

  it('base_url do SCIM e location dos usuários são canônicos', async () => {
    const staff = { ...(await sessionFor({ id: 'u-s', email: 's@ness.lat', role: 'platform_admin' })), 'Content-Type': 'application/json' };
    const emitir = await chamar(`/api/v1/projects/${A}/scim-token`, { method: 'POST', headers: staff });
    expect(emitir.status, await emitir.clone().text()).toBe(201);
    expect((await emitir.json<any>()).base_url).toBe(`${CANONICO}/scim/v2`);

    await env.DB.batch([
      env.DB.prepare('INSERT INTO project_scim (project_id, token_hash) VALUES (?,?) ON CONFLICT(project_id) DO UPDATE SET token_hash = excluded.token_hash, ativo = 1')
        .bind(A, await sha256Hex('tok-url')),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-scim','x@cliente-url.com','x','X','org_user',?)`).bind(A),
    ]);
    const lista = await chamar('/scim/v2/Users', { headers: { Authorization: 'Bearer tok-url' } });
    expect(lista.status, await lista.clone().text()).toBe(200);
    const { Resources } = await lista.json<any>();
    expect(Resources.length).toBeGreaterThan(0);
    for (const u of Resources) expect(u.meta.location.startsWith(`${CANONICO}/scim/v2/Users/`)).toBe(true);
  });

  it('link de proposta é canônico e segue APP_URL quando ele muda', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES ('l-url', 'Cliente', '11222333000181', 'Proposal', 'org_ness')`),
      env.DB.prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, total_projeto, mensalidade, documento_html, documento_hash, valida_ate, criada_por)
        VALUES ('pr-url', 'org_ness', 'l-url', 'NESS-URL-1', 'gerada', 'Cliente Ltda.', 100, 0, '<p>d</p>', 'h', '2099-12-31', 'com@ness.lat')`),
    ]);
    const com = { ...(await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' })), 'Content-Type': 'application/json' };
    const r = await chamar('/api/v1/propostas/pr-url/link', { method: 'POST', headers: com });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json<any>()).url.startsWith(`${CANONICO}/proposta#`)).toBe(true);

    const s = await chamar('/api/v1/propostas/pr-url/link', { method: 'POST', headers: com }, { APP_URL: ALTERNATIVO });
    expect((await s.json<any>()).url.startsWith(`${ALTERNATIVO}/proposta#`)).toBe(true);
  });
});

describe('security.txt', () => {
  it('aponta para o repositório n.iso e não usa o nome antigo', async () => {
    const corpo = await (await chamar('/.well-known/security.txt')).text();
    expect(corpo).toContain('https://github.com/resper1965/n.iso/');
    expect(corpo).toContain(`Canonical: ${CANONICO}/.well-known/security.txt`);
    expect(corpo).not.toContain('nISO');
  });
});

describe('origens e hosts saem do mesmo endereço', () => {
  const acao = async (origem: string, extra: Record<string, unknown> = {}) =>
    (await chamar('/health', { headers: { Origin: origem } }, extra)).headers.get('access-control-allow-origin');

  it('CORS: canônico sim, legados não (eles redirecionam), alternativo só com APP_URL igual a ele', async () => {
    expect(await acao(CANONICO)).toBe(CANONICO);
    expect(await acao('https://n-iso.ness.com.br')).toBeNull();
    expect(await acao('https://niso.ness.workers.dev')).toBeNull();
    expect(await acao(ALTERNATIVO)).toBeNull();
    expect(await acao(ALTERNATIVO, { APP_URL: ALTERNATIVO })).toBe(ALTERNATIVO);
  });

  it('MCP: só o host do APP_URL; loopback fora de produção', () => {
    expect(hostsPermitidosMcp({ ENVIRONMENT: 'production' })).toEqual(['niso.ness.com.br']);
    expect(hostsPermitidosMcp({ ENVIRONMENT: 'test', APP_URL: ALTERNATIVO })).toEqual(['ambiente-alternativo.exemplo.com', 'localhost', '127.0.0.1']);
    expect(hostsPermitidosMcp({ ENVIRONMENT: 'test' })).toContain('localhost');
  });
});
