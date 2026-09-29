import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { gerarCodigoTotp } from '../src/services/totp';

const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
const f = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request(BASE + caminho, init), workerEnv() as any);

async function pkce() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

async function registrarCliente(): Promise<string> {
  const r = await f('/oauth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude Code', token_endpoint_auth_method: 'none' }),
  });
  expect(r.status).toBe(201);
  return (await r.json<any>()).client_id;
}

const campo = (html: string, nome: string) => html.match(new RegExp(`name="${nome}" value="([^"]+)"`))![1];
const form = (o: Record<string, string>) => ({
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString(),
});

async function iniciar(clientId: string, challenge: string) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'st', resource: `${BASE}/mcp`,
  });
  const r = await f(`/oauth/authorize?${q}`);
  expect(r.status).toBe(200);
  return campo(await r.text(), 'pedido');
}

describe('Autorização OAuth do agente', () => {
  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Twyn','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-sem','sem@ness.lat',?,'Sem','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli','cli@twyn.com',?,'Cli','org_admin','p-a')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, totp_enabled, totp_secret) VALUES ('u-mfa','mfa@ness.lat',?,'Mfa','consultor',1,'JBSWY3DPEHPK3PXP')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Mfa','mfa@ness.lat','consultor','Consultor')`),
    ]);
  });

  it('fluxo completo: login, escolha do cliente, código, token', async () => {
    const clientId = await registrarCliente();
    const { verifier, challenge } = await pkce();
    const pedido = await iniciar(clientId, challenge);

    const passo2 = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    const html2 = await passo2.text();
    expect(html2).toContain('Twyn');
    expect(html2).not.toContain('Outro'); // só projetos onde é consultor designado

    const fim = await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }));
    const html3 = await fim.text();
    const destino = html3.match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
    const code = new URL(destino).searchParams.get('code')!;
    expect(code).toBeTruthy();

    const tok = await f('/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${BASE}/mcp` }).toString(),
    });
    expect(tok.status, await tok.clone().text()).toBe(200);
    const corpo = await tok.json<any>();
    expect(corpo.access_token).toBeTruthy();
    expect(corpo.expires_in).toBe(3600);

    const conc = await env.DB.prepare(`SELECT project_id, expira_em FROM agente_concessoes WHERE user_id = 'u-c'`).first<any>();
    expect(conc.project_id).toBe('p-a');
  });

  it('não confirma projeto fora da designação, mesmo forjando o formulário', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    const r = await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-b' }));
    expect(r.status).toBe(403);
  });

  it('senha errada não avança', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'errada-errada', codigo: '' }));
    expect(r.status).toBe(401);
  });

  it('só consultor conecta agente nesta versão', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'cli@twyn.com', senha: 'senha-forte-123', codigo: '' }));
    expect(r.status).toBe(403);
  });

  // Review Focus 5
  it('consultor sem projeto designado recebe mensagem clara e nada é concedido', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'sem@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    expect(await r.text()).toContain('não é consultor designado em nenhum cliente');
    expect(await env.DB.prepare(`SELECT 1 FROM agente_concessoes WHERE user_id = 'u-sem'`).first()).toBeNull();
  });

  // Review Focus 4
  it('MFA: sem código, código errado e código repetido são recusados', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const base = { pedido, email: 'mfa@ness.lat', senha: 'senha-forte-123' };
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: '' }))).status).toBe(401);
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: '000000' }))).status).toBe(401);
    const bom = await gerarCodigoTotp('JBSWY3DPEHPK3PXP', Math.floor(Date.now() / 30000));
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: bom }))).status).toBe(200);
    const pedido2 = await iniciar(await registrarCliente(), (await pkce()).challenge);
    expect((await f('/oauth/authorize/entrar', form({ ...base, pedido: pedido2, codigo: bom }))).status).toBe(401);
  });

  // Review Focus 3
  it('pedido desconhecido ou já usado não emite código', async () => {
    const r1 = await f('/oauth/authorize/confirmar', form({ pedido: 'inventado', projeto: 'p-a' }));
    expect(r1.status).toBe(400);
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    expect((await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).status).toBe(200);
    expect((await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).status).toBe(400);
  });

  it('pedido OAuth malformado ou de cliente desconhecido é 400, não 500', async () => {
    expect((await f('/oauth/authorize?response_type=code&client_id=inexistente')).status).toBe(400);
    expect((await f('/oauth/authorize')).status).toBe(400);
  });

  it('rotas antigas seguem fora do OAuthProvider', async () => {
    expect((await f('/health')).status).toBe(200);
  });
});
