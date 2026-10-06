import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { gerarCodigoTotp } from '../src/services/totp';
import { oauthAutorizacao } from '../src/routes/oauth-autorizacao';

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
// `ip` separa o balde de tentativas por IP (20/5 min) entre testes que erram a senha de propósito.
const form = (o: Record<string, string>, ip?: string) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
  body: new URLSearchParams(o).toString(),
});
const loginApi = (email: string, password: string, ip: string) =>
  f('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ email, password }) });

async function iniciar(clientId: string, challenge: string, extra: Record<string, string> = {}, prefixo = '/oauth') {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'st', resource: `${BASE}/mcp`, ...extra,
  });
  const r = await f(`${prefixo}/authorize?${q}`);
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
      ...['lock1', 'lock2'].flatMap((k) => [
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultor')`).bind(`u-${k}`, `${k}@ness.lat`, senha, k),
        env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a', ?, ?, 'consultor', 'Consultor')`).bind(k, `${k}@ness.lat`),
      ]),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, ativo) VALUES ('u-ina','ina@ness.lat',?,'Ina','consultor',0)`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Ina','ina@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, requires_password_change) VALUES ('u-nova','nova@ness.lat',?,'Nova','consultor',1)`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Nova','nova@ness.lat','consultor','Consultor')`),
    ]);
  }, 60_000);

  it('fluxo completo: login, escolha do cliente, código, token', async () => {
    const clientId = await registrarCliente();
    const { verifier, challenge } = await pkce();
    const pedido = await iniciar(clientId, challenge);

    const passo2 = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    const html2 = await passo2.text();
    expect(html2).toContain('Twyn');
    expect(html2).not.toContain('Outro'); // só projetos onde é consultor designado
    // O consultor consente em cima deste texto: ele tem de dizer o que o agente de fato pode fazer.
    expect(html2).not.toContain('Não apaga registros');
    expect(html2).toContain('Com a sua confirmação');
    expect(html2).toContain('revoga aprovações');

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
  }, 30_000);

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

  // Revisão final, achado 3: resposta diferente para senha certa de não
  // consultor era oráculo de senha para qualquer conta, inclusive platform_admin.
  it('não consultor e conta inativa com a senha certa recebem a MESMA resposta da senha errada', async () => {
    const tentar = async (email: string, senha: string) => {
      const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
      const r = await f('/oauth/authorize/entrar', form({ pedido, email, senha, codigo: '' }, '10.0.0.3'));
      return { status: r.status, corpo: await r.text() };
    };
    const errada = await tentar('cli@twyn.com', 'errada-errada');
    expect(errada.status).toBe(401);
    expect(await tentar('cli@twyn.com', 'senha-forte-123')).toEqual(errada);
    expect(await tentar('ina@ness.lat', 'senha-forte-123')).toEqual(errada);
  });

  it('falha de senha consome o pedido', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'errada-errada', codigo: '' }, '10.0.0.4'));
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }, '10.0.0.4'));
    expect(r.status).toBe(400);
  });

  it('falhas na tela OAuth bloqueiam a conta, lá e no login do app', async () => {
    const ip = '10.0.0.1';
    const entrar = async (senha: string) => {
      const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
      return f('/oauth/authorize/entrar', form({ pedido, email: 'lock1@ness.lat', senha, codigo: '' }, ip));
    };
    for (let i = 0; i < 5; i++) await entrar('errada-errada');
    const certa = await entrar('senha-forte-123');
    expect(certa.status).toBe(429);
    expect(await certa.text()).not.toContain('Em qual cliente');
    expect((await loginApi('lock1@ness.lat', 'senha-forte-123', ip)).status).toBe(429);
  }, 30_000);

  it('conta bloqueada pelo login do app também é recusada na tela OAuth', async () => {
    const ip = '10.0.0.2';
    for (let i = 0; i < 5; i++) await loginApi('lock2@ness.lat', 'errada-errada', ip);
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'lock2@ness.lat', senha: 'senha-forte-123', codigo: '' }, ip));
    expect(r.status).toBe(429);
    expect(await r.text()).not.toContain('Em qual cliente');
  });

  it('senha provisória (requires_password_change) não conecta agente', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'nova@ness.lat', senha: 'senha-forte-123', codigo: '' }, '10.0.0.5'));
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('Defina sua senha definitiva no n.iso antes de conectar um agente.');
  });

  it('escopo do token é sempre niso:consultor, peça o cliente o que pedir', async () => {
    const clientId = await registrarCliente();
    const { verifier, challenge } = await pkce();
    const pedido = await iniciar(clientId, challenge, { scope: 'admin' });
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }, '10.0.0.6'));
    const html = await (await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).text();
    const code = new URL(html.match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&')).searchParams.get('code')!;
    const tok = await f('/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${BASE}/mcp` }).toString(),
    });
    expect(tok.status, await tok.clone().text()).toBe(200);
    expect((await tok.json<any>()).scope).toBe('niso:consultor');
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
  }, 30_000);

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

  // Review fix 1 + revisão final, item 8: o despacho decide pelo caminho
  // DECODIFICADO, então `/%6Fauth/...` passa pelo OAuthProvider como `/oauth/...`.
  it('caminho percent-encoded passa pelo OAuthProvider como o normal', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge, {}, '/%6Fauth');
    expect(pedido).toBeTruthy();
  });

  // Defesa em profundidade: o router sem OAUTH_PROVIDER no env é 404 e não
  // grava concessão nem trilha.
  it('router de autorização sem o OAuthProvider é 404, sem efeito colateral', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }, '10.0.0.7'));
    const antes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agente_concessoes`).first<any>();
    const auditAntes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'agente.autorizado'`).first<any>();
    const { OAUTH_PROVIDER: _p, ...semProvedor } = workerEnv();
    const r = await oauthAutorizacao.request('/authorize/confirmar', form({ pedido, projeto: 'p-a' }), semProvedor);
    expect(r.status).toBe(404);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM agente_concessoes`).first<any>()).n).toBe(antes.n);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'agente.autorizado'`).first<any>()).n).toBe(auditAntes.n);
  });

  // Review fix 3: a tela de consentimento diz para onde vai o acesso.
  it('tela de autorizar mostra o host do redirect e avisa quando não é loopback', async () => {
    const EVIL = 'https://evil.example/cb';
    const reg = await f('/oauth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [EVIL], client_name: 'Claude Code', token_endpoint_auth_method: 'none' }),
    });
    expect(reg.status).toBe(201);
    const q = new URLSearchParams({
      response_type: 'code', client_id: (await reg.json<any>()).client_id, redirect_uri: EVIL,
      code_challenge: (await pkce()).challenge, code_challenge_method: 'S256', state: 'st', resource: `${BASE}/mcp`,
    });
    const r1 = await f(`/oauth/authorize?${q}`);
    expect(r1.status).toBe(200);
    const pedido = campo(await r1.text(), 'pedido');
    const html = await (await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }))).text();
    expect(html).toContain('evil.example');
    expect(html).toContain('Atenção: o acesso será entregue a evil.example');
    await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }));
    const conc = await env.DB.prepare(`SELECT cliente_mcp FROM agente_concessoes WHERE cliente_mcp LIKE '%evil.example%'`).first<any>();
    expect(conc.cliente_mcp).toBe('Claude Code (evil.example)');

    const pedidoLocal = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const local = await (await f('/oauth/authorize/entrar', form({ pedido: pedidoLocal, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }))).text();
    expect(local).toContain('127.0.0.1:33418');
    expect(local).not.toContain('Atenção');
  }, 30_000);

  it('o provider recusa callback de esquema próprio já no registro', async () => {
    // Plano de fechamento, C2: a hipótese era um 500 depois do login para `myapp:/cb` (host vazio,
    // `new URL('http://')` lança). Não é alcançável: o registro dinâmico já recusa. Fica como
    // documentação e como alarme: se uma versão futura da biblioteca passar a aceitar esquema próprio,
    // este teste falha e o caminho do host vazio (linha do `new URL` na tela de escolha) volta a valer.
    // Também importa para o login em clientes de desktop que usam `cursor://` ou `vscode://`.
    const r = await f('/oauth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['myapp:/cb'], client_name: 'App Nativo', token_endpoint_auth_method: 'none' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json<any>()).error).toBe('invalid_client_metadata');
  });

  it('nenhum cliente vem pré-marcado: a escolha é explícita e obrigatória', async () => {
    // O primeiro da lista vinha marcado: um tenant que se nomeie para ordenar primeiro faz
    // um consultor apressado conectar o agente ao projeto errado.
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const html = await (await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }))).text();
    expect(html).toContain('name="projeto"');
    expect(html).not.toMatch(/<input[^>]*name="projeto"[^>]*checked/);
    expect(html).toMatch(/<input[^>]*name="projeto"[^>]*required/);
  });

  it('rotas antigas seguem fora do OAuthProvider', async () => {
    expect((await f('/health')).status).toBe(200);
  });
});
