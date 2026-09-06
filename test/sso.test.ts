import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, sessionFor, pedir } from './helpers/d1';
import {
  descobrir, iniciarLogin, consumirState, validarIdToken, provisionar,
  configPorDominio, papelValidoParaSso,
} from '../src/sso';

/**
 * SSO por OIDC (item 4.1 do plano).
 *
 * Este é código de AUTENTICAÇÃO, e o teste dele não pode ser "o caminho feliz
 * funciona". Cada bloco abaixo corresponde a um ataque conhecido contra JWT/OIDC,
 * e a asserção é a RECUSA — o caminho feliz aparece uma vez, para provar que a
 * recusa não é só rigidez.
 *
 * As chaves são geradas de verdade (WebCrypto, RSASSA-PKCS1-v1_5), e os tokens
 * são assinados de verdade. Um mock de "verifica sempre true" testaria o mock.
 */

const ISSUER = 'https://idp.exemplo.com';
const CLIENT_ID = 'cliente-niso';
const A = 'proj-a';

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const textoB64url = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function parDeChaves() {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = (await crypto.subtle.exportKey('jwk', par.publicKey)) as any;
  return { privada: par.privateKey, jwks: { keys: [{ ...jwk, kid: 'k1', use: 'sig', alg: 'RS256' }] } };
}

async function assinar(privada: CryptoKey, claims: Record<string, unknown>, cabecalho: Record<string, unknown> = {}) {
  const h = textoB64url({ alg: 'RS256', typ: 'JWT', kid: 'k1', ...cabecalho });
  const p = textoB64url(claims);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', privada, new TextEncoder().encode(`${h}.${p}`)
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const agora = () => Math.floor(Date.now() / 1000);
const claimsBase = (extra: Record<string, unknown> = {}) => ({
  iss: ISSUER, aud: CLIENT_ID, exp: agora() + 300, iat: agora(),
  sub: 'sub-123', email: 'pessoa@cliente.com', email_verified: true, name: 'Pessoa',
  nonce: 'nonce-do-pedido', ...extra,
});

describe('validarIdToken — cada recusa é um ataque conhecido', () => {
  let chaves: Awaited<ReturnType<typeof parDeChaves>>;
  beforeEach(async () => { chaves = await parDeChaves(); });

  const opcoes = () => ({ jwks: chaves.jwks, issuer: ISSUER, clientId: CLIENT_ID, nonce: 'nonce-do-pedido' });

  it('token bem formado e assinado passa', async () => {
    const t = await assinar(chaves.privada, claimsBase());
    const c = await validarIdToken(t, opcoes());
    expect(c.email).toBe('pessoa@cliente.com');
  });

  it('recusa `alg: none` — a vulnerabilidade clássica de JWT', async () => {
    const t = `${textoB64url({ alg: 'none', typ: 'JWT' })}.${textoB64url(claimsBase())}.`;
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/Algoritmo não aceito/);
  });

  it('recusa HS256 — a chave seria o client_secret, que o IdP também conhece', async () => {
    // Aceitar HMAC aqui deixaria qualquer um que tenha o client_secret forjar um
    // token para qualquer usuário do tenant. É pior que `alg: none`, porque
    // parece uma escolha razoável de algoritmo.
    const h = textoB64url({ alg: 'HS256', typ: 'JWT' });
    const p = textoB64url(claimsBase());
    const chave = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('segredo'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${h}.${p}`));
    await expect(validarIdToken(`${h}.${p}.${b64url(new Uint8Array(sig))}`, opcoes()))
      .rejects.toThrow(/Algoritmo não aceito/);
  });

  it('recusa assinatura de OUTRA chave', async () => {
    const outro = await parDeChaves();
    const t = await assinar(outro.privada, claimsBase());
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/Assinatura .* inválida/);
  });

  it('recusa payload adulterado depois de assinado', async () => {
    const t = await assinar(chaves.privada, claimsBase());
    const [h, , s] = t.split('.');
    const adulterado = `${h}.${textoB64url(claimsBase({ email: 'atacante@cliente.com' }))}.${s}`;
    await expect(validarIdToken(adulterado, opcoes())).rejects.toThrow(/Assinatura/);
  });

  it('recusa `iss` de outro emissor', async () => {
    const t = await assinar(chaves.privada, claimsBase({ iss: 'https://idp-do-atacante.com' }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/iss inesperado/);
  });

  it('recusa token emitido para OUTRO aplicativo do mesmo IdP', async () => {
    const t = await assinar(chaves.privada, claimsBase({ aud: 'outro-app' }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/aud não corresponde/);
  });

  it('aceita `aud` como array quando inclui o nosso client_id', async () => {
    const t = await assinar(chaves.privada, claimsBase({ aud: ['outro-app', CLIENT_ID] }));
    await expect(validarIdToken(t, opcoes())).resolves.toBeTruthy();
  });

  it('recusa token expirado', async () => {
    const t = await assinar(chaves.privada, claimsBase({ exp: agora() - 600 }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/expirado/);
  });

  it('recusa nonce que não é o do pedido — é o que liga o token ao login', async () => {
    const t = await assinar(chaves.privada, claimsBase({ nonce: 'nonce-de-outro-pedido' }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/nonce/);
  });

  it('recusa e-mail NÃO verificado', async () => {
    // IdP que deixa cadastrar e-mail alheio sem confirmar viraria caminho de
    // assumir a conta de outra pessoa do mesmo tenant.
    const t = await assinar(chaves.privada, claimsBase({ email_verified: false }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/não verificado/);
  });

  it('recusa token sem e-mail nenhum', async () => {
    const t = await assinar(chaves.privada, claimsBase({ email: undefined }));
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/sem e-mail/);
  });

  it('recusa quando o kid não está no JWKS', async () => {
    const t = await assinar(chaves.privada, claimsBase(), { kid: 'kid-que-nao-existe' });
    await expect(validarIdToken(t, opcoes())).rejects.toThrow(/Chave do IdP não encontrada/);
  });
});

describe('descobrir', () => {
  beforeEach(async () => { await resetSessions(); });

  const docOk = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
  };
  const fetchDoc = (doc: unknown, ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 500, json: async () => doc })) as any;

  it('lê o documento e cacheia', async () => {
    let chamadas = 0;
    const f = (async () => { chamadas++; return { ok: true, json: async () => docOk }; }) as any;
    await descobrir(env as any, ISSUER, f);
    await descobrir(env as any, ISSUER, f);
    expect(chamadas, 'a descoberta não foi cacheada').toBe(1);
  });

  it('recusa documento que declara OUTRO issuer', async () => {
    // Sem esta checagem, um documento forjado redireciona a autenticação inteira
    // para um emissor controlado pelo atacante.
    await expect(
      descobrir(env as any, ISSUER, fetchDoc({ ...docOk, issuer: 'https://outro.com' }))
    ).rejects.toThrow(/declara issuer/);
  });

  it('recusa issuer que não é https', async () => {
    await expect(descobrir(env as any, 'http://idp.exemplo.com', fetchDoc(docOk)))
      .rejects.toThrow(/https/);
  });

  it('recusa host que não resolve para endereço público', async () => {
    await expect(
      descobrir(env as any, ISSUER, fetchDoc(docOk), async () => false)
    ).rejects.toThrow(/não resolve para endereço público/);
  });

  it('recusa documento sem os endpoints obrigatórios', async () => {
    await expect(descobrir(env as any, ISSUER, fetchDoc({ issuer: ISSUER })))
      .rejects.toThrow(/sem authorization_endpoint/);
  });
});

describe('state e PKCE', () => {
  beforeEach(async () => { await resetSessions(); });

  const d = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` };
  const cfg = { project_id: A, issuer: ISSUER, client_id: CLIENT_ID, client_secret: 'x', dominios: 'cliente.com', papel_padrao: 'org_user', ativo: 1 };

  it('a URL leva state, nonce e desafio PKCE S256', async () => {
    const { url } = await iniciarLogin(env as any, cfg, d, 'https://niso.exemplo/callback');
    const u = new URL(url);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBeTruthy();
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('nonce')).toBeTruthy();
    expect(u.searchParams.get('client_id')).toBe(CLIENT_ID);
  });

  it('o state é de USO ÚNICO — replay de callback não vira sessão nova', async () => {
    const { state } = await iniciarLogin(env as any, cfg, d, 'https://niso.exemplo/callback');
    expect(await consumirState(env as any, state)).not.toBeNull();
    expect(await consumirState(env as any, state), 'o state foi aceito duas vezes').toBeNull();
  });

  it('state desconhecido não abre nada', async () => {
    expect(await consumirState(env as any, 'inventado')).toBeNull();
  });

  it('dois logins têm state, nonce e verifier diferentes', async () => {
    const um = await iniciarLogin(env as any, cfg, d, 'https://niso.exemplo/cb');
    const dois = await iniciarLogin(env as any, cfg, d, 'https://niso.exemplo/cb');
    expect(um.state).not.toBe(dois.state);
    const a = await consumirState(env as any, um.state);
    const b = await consumirState(env as any, dois.state);
    expect(a!.nonce).not.toBe(b!.nonce);
    expect(a!.verifier).not.toBe(b!.verifier);
  });
});

describe('provisionamento (JIT)', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active'),
    ]);
  });

  const cfg = { project_id: A, issuer: ISSUER, client_id: CLIENT_ID, client_secret: 'x', dominios: 'cliente.com', papel_padrao: 'org_user', ativo: 1 };
  const claims = (email: string) => ({ iss: ISSUER, aud: CLIENT_ID, exp: 0, iat: 0, sub: 's', email, email_verified: true, name: 'Pessoa' } as any);

  it('cria a conta no primeiro acesso, com o papel do TENANT', async () => {
    const p = await provisionar(env as any, cfg, claims('nova@cliente.com'));
    expect(p.criado).toBe(true);
    expect(p.role).toBe('org_user');
    expect(p.client_project_id).toBe(A);

    const linha = await env.DB.prepare('SELECT role, client_project_id, password_hash FROM users WHERE email = ?')
      .bind('nova@cliente.com').first<any>();
    expect(linha.role).toBe('org_user');
    expect(linha.password_hash, 'a conta ficou com hash de senha utilizável').toBe('sso:sem-senha-local');
  });

  it('no segundo acesso reaproveita a conta, sem duplicar', async () => {
    await provisionar(env as any, cfg, claims('nova@cliente.com'));
    const p = await provisionar(env as any, cfg, claims('nova@cliente.com'));
    expect(p.criado).toBe(false);
    const { results } = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind('nova@cliente.com').all();
    expect(results).toHaveLength(1);
  });

  it('NÃO move conta de outro cliente para este tenant', async () => {
    // Mover conta entre clientes por efeito colateral de login seria a pior
    // forma de vazamento: o dado do tenant antigo passaria a ser visível ao novo.
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
      .bind('u-b', 'pessoa@cliente.com', 'hash', 'Pessoa', 'org_admin', 'proj-b').run();
    await expect(provisionar(env as any, cfg, claims('pessoa@cliente.com')))
      .rejects.toThrow(/outro cliente/);
  });

  it('NÃO deixa conta de STAFF entrar por SSO de tenant', async () => {
    // Seria elevar um login de cliente a acesso de plataforma.
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-s', 'consultor@cliente.com', 'hash', 'Consultor', 'platform_admin').run();
    await expect(provisionar(env as any, cfg, claims('consultor@cliente.com')))
      .rejects.toThrow(/não é de cliente/);
  });

  it('recusa papel_padrao de staff na configuração', async () => {
    for (const papel of ['platform_admin', 'consultor', 'consultant', 'admin']) {
      expect(papelValidoParaSso(papel), papel).toBe(false);
    }
    expect(papelValidoParaSso('org_user')).toBe(true);
    await expect(
      provisionar(env as any, { ...cfg, papel_padrao: 'platform_admin' }, claims('outra@cliente.com'))
    ).rejects.toThrow(/papel_padrao inválido/);
  });
});

describe('configPorDominio', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active').run();
  });

  it('acha o tenant pelo domínio do e-mail, e ignora config inativa', async () => {
    await env.DB.prepare(
      `INSERT INTO project_sso (project_id, issuer, client_id, client_secret, dominios, ativo) VALUES (?,?,?,?,?,?)`
    ).bind(A, ISSUER, CLIENT_ID, 'cifrado', 'cliente.com, outro.com.br', 0).run();

    expect(await configPorDominio(env as any, 'pessoa@cliente.com'), 'config inativa foi usada').toBeNull();

    await env.DB.prepare('UPDATE project_sso SET ativo = 1 WHERE project_id = ?').bind(A).run();
    const c = await configPorDominio(env as any, 'PESSOA@Cliente.com');
    expect(c?.project_id).toBe(A);
    expect((await configPorDominio(env as any, 'pessoa@outro.com.br'))?.project_id).toBe(A);
    expect(await configPorDominio(env as any, 'pessoa@dominio-desconhecido.com')).toBeNull();
  });
});


describe('Rotas de SSO', () => {
  let staff: Record<string, string>;
  let cliente: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
        .bind('u-s', 's@ness.io', senha, 'Staff', 'platform_admin'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'a@cliente.com', senha, 'A', 'org_admin', A),
    ]);
    staff = {
      ...(await sessionFor({ id: 'u-s', email: 's@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
    cliente = {
      ...(await sessionFor({ id: 'u-a', email: 'a@cliente.com', role: 'org_admin', client_project_id: A, iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  const corpoValido = {
    issuer: ISSUER, client_id: CLIENT_ID, client_secret: 'segredo-do-idp',
    dominios: 'cliente.com', papel_padrao: 'org_user', ativo: true,
  };

  it('POST /sso/iniciar responde a MESMA coisa para domínio desconhecido e para tenant sem SSO', async () => {
    // A rota é pública. Distinguir os dois casos entregaria de graça quais
    // domínios têm cliente aqui — enumeração sem custo para quem sonda.
    const desconhecido = await pedir(worker, '/api/v1/public/sso/iniciar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alguem@dominio-que-nao-existe.com' }),
    });
    expect(desconhecido.status).toBe(200);
    expect(await desconhecido.json()).toEqual({ sso: false });

    const semSso = await pedir(worker, '/api/v1/public/sso/iniciar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@cliente.com' }),
    });
    expect(await semSso.json()).toEqual({ sso: false });
  });

  it('a configuração exige TOKEN_ENC_KEY — segredo de IdP não se grava em claro', async () => {
    const semChave = { ...env, TOKEN_ENC_KEY: undefined } as any;
    const res = await worker.fetch(
      new Request(`http://localhost/api/v1/projects/${A}/sso`, {
        method: 'PUT', headers: staff, body: JSON.stringify(corpoValido),
      }),
      semChave
    );
    expect(res.status).toBe(503);
    expect(await env.DB.prepare('SELECT project_id FROM project_sso').first()).toBeNull();
  });

  it('recusa papel_padrao de plataforma', async () => {
    const res = await pedir(worker, `/api/v1/projects/${A}/sso`, {
      method: 'PUT', headers: staff,
      body: JSON.stringify({ ...corpoValido, papel_padrao: 'platform_admin' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toContain('papel de plataforma');
  });

  it('recusa issuer que não é https', async () => {
    const res = await pedir(worker, `/api/v1/projects/${A}/sso`, {
      method: 'PUT', headers: staff,
      body: JSON.stringify({ ...corpoValido, issuer: 'http://idp.exemplo.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('staff grava, o segredo fica CIFRADO e nunca volta na leitura', async () => {
    const gravar = await pedir(worker, `/api/v1/projects/${A}/sso`, {
      method: 'PUT', headers: staff, body: JSON.stringify(corpoValido),
    });
    expect(gravar.status, await gravar.clone().text()).toBe(200);

    const linha = await env.DB.prepare('SELECT client_secret FROM project_sso WHERE project_id = ?')
      .bind(A).first<any>();
    expect(linha.client_secret, 'o segredo do IdP foi para o banco em claro').not.toBe('segredo-do-idp');
    expect(linha.client_secret.startsWith('v1:'), 'o segredo não está no formato cifrado').toBe(true);

    const ler = await pedir(worker, `/api/v1/projects/${A}/sso`, { headers: staff });
    const corpo = await ler.text();
    expect(corpo).not.toContain('segredo-do-idp');
    expect(corpo, 'o campo client_secret voltou na leitura').not.toContain('client_secret');
    expect(corpo).toContain(CLIENT_ID);
  });

  it('cliente não configura o próprio SSO', async () => {
    // Quem aponta o issuer decide quem entra: um `org_admin` que pudesse
    // configurá-lo passaria a poder emitir token para qualquer e-mail do
    // domínio.
    const res = await pedir(worker, `/api/v1/projects/${A}/sso`, {
      method: 'PUT', headers: cliente, body: JSON.stringify(corpoValido),
    });
    expect(res.status).toBe(403);
  });

  it('callback com state inventado não abre sessão, e redireciona com erro', async () => {
    const res = await pedir(worker, '/api/v1/public/sso/callback?code=abc&state=inventado');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('sso_erro');
    expect(res.headers.get('Location')).not.toContain('sso_token');
  });

  it('callback sem code nem state não estoura', async () => {
    const res = await pedir(worker, '/api/v1/public/sso/callback');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('sso_erro');
  });
});
