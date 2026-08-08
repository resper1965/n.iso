import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, invalidateUserSessions, validateUpload, MAX_UPLOAD_BYTES } from '../src/helpers';
import { applySchema, resetData, resetSessions } from './helpers/d1';

/**
 * Revogação de sessão, limite de upload e rate limit — contra D1 e KV reais.
 *
 * A sessão vive no KV sob um token aleatório, então não dá para enumerar as de
 * um usuário e apagá-las. O mecanismo é um marco por usuário: sessão emitida
 * antes dele deixa de valer. Estes testes existem porque o modo de falha é
 * silencioso — sem eles, "trocar a senha derruba a sessão" seria só uma
 * afirmação no commit.
 */

async function login(email = 'alvo@ness.io', password = 'password123') {
  const res = await app.fetch(
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    env as any
  );
  const body = await res.json() as any;
  return { status: res.status, token: body.token as string };
}

function comSessao(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('Revogação de sessão', () => {
  // `beforeEach` + reset: os testes trocam a senha e o papel de u-alvo e gravam
  // marcos de revogacao no KV; cada `it` precisa de u-alvo intacto e sem marcos
  // previos (o pool novo isola storage so por arquivo).
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-alvo','alvo@ness.io',?,'Alvo','platform_admin',NULL)`).bind(hash),
    ]);
  });

  it('sessão recém-emitida funciona', async () => {
    const { status, token } = await login();
    expect(status).toBe(200);
    const res = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(token) }), env as any);
    expect(res.status).toBe(200);
  });

  it('invalidar as sessões do usuário derruba a sessão em curso', async () => {
    const { token } = await login();
    // Confirma que valia ANTES — senão o teste passaria mesmo com o login quebrado.
    expect((await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(token) }), env as any)).status).toBe(200);

    await invalidateUserSessions(env.SESSIONS, 'u-alvo');

    const depois = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(token) }), env as any);
    expect(depois.status).toBe(401);
    expect((await depois.json() as any).error).toContain('revoked');
  });

  it('sessão emitida DEPOIS da revogação volta a valer', async () => {
    await invalidateUserSessions(env.SESSIONS, 'u-alvo');
    // O marco usa milissegundos; garante que o novo login é posterior.
    await new Promise(r => setTimeout(r, 5));
    const { token } = await login();
    const res = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(token) }), env as any);
    expect(res.status).toBe(200);
  });

  it('sessão sem `iat` é tratada como revogada (falha fechada)', async () => {
    // Sessão no formato antigo, anterior a esta mudança.
    await env.SESSIONS.put('session_legado', JSON.stringify({ id: 'u-alvo', email: 'alvo@ness.io', role: 'platform_admin' }));
    await invalidateUserSessions(env.SESSIONS, 'u-alvo');

    const res = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao('legado') }), env as any);
    expect(res.status).toBe(401);
  });

  it('revogação de um usuário não afeta outro', async () => {
    const hash = await hashPassword('password123');
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-outro','outro@ness.io',?,'Outro','platform_admin')`).bind(hash).run();

    const alvo = await login();
    const outro = await login('outro@ness.io');
    await invalidateUserSessions(env.SESSIONS, 'u-alvo');

    expect((await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(alvo.token) }), env as any)).status).toBe(401);
    expect((await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(outro.token) }), env as any)).status).toBe(200);
  });

  it('trocar a senha por token de recuperação derruba a sessão aberta', async () => {
    const { token: sessao } = await login();
    expect((await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(sessao) }), env as any)).status).toBe(200);

    // Gera o token de recuperação pelo próprio endpoint.
    const pedido = await app.fetch(
      new Request('http://localhost/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alvo@ness.io' }),
      }),
      { ...env, ENVIRONMENT: 'development' } as any
    );
    const { reset_token } = await pedido.json() as any;
    expect(reset_token).toBeTruthy();

    const reset = await app.fetch(
      new Request('http://localhost/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: reset_token, newPassword: 'novaSenha123' }),
      }),
      env as any
    );
    expect(reset.status).toBe(200);

    // É este o ponto: a sessão roubada tem que morrer junto com a senha antiga.
    const depois = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(sessao) }), env as any);
    expect(depois.status).toBe(401);
  });

  it('mudar o papel do usuário derruba a sessão com o papel antigo', async () => {
    const { token: sessaoAdmin } = await login();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/users/u-alvo', {
        method: 'PUT',
        headers: { ...comSessao(sessaoAdmin), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'client' }),
      }),
      env as any
    );
    expect(res.status).toBe(200);

    // Sem isto, o rebaixamento só valeria daqui a 24h — a sessão carrega o papel.
    const depois = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: comSessao(sessaoAdmin) }), env as any);
    expect(depois.status).toBe(401);
  });
});

describe('Limite de upload', () => {
  function arquivo(nome: string, tipo: string, bytes: number) {
    return new File([new Uint8Array(bytes)], nome, { type: tipo });
  }

  it('aceita PDF dentro do limite', () => {
    expect(validateUpload(arquivo('a.pdf', 'application/pdf', 1024))).toBeNull();
  });

  it('recusa acima do teto', () => {
    const erro = validateUpload(arquivo('a.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1));
    expect(erro).toContain('excede o limite');
  });

  it('recusa arquivo vazio', () => {
    expect(validateUpload(arquivo('a.pdf', 'application/pdf', 0))).toBe('Arquivo vazio');
  });

  it('recusa HTML e SVG — voltariam ao navegador como XSS armazenado', () => {
    expect(validateUpload(arquivo('x.html', 'text/html', 10))).toContain('não aceito');
    expect(validateUpload(arquivo('x.svg', 'image/svg+xml', 10))).toContain('não aceito');
  });

  it('recusa tipo desconhecido em vez de aceitar por omissão', () => {
    expect(validateUpload(arquivo('x.bin', '', 10))).toContain('não aceito');
  });

  it('ignora parâmetros do content-type (charset)', () => {
    expect(validateUpload(arquivo('a.csv', 'text/csv; charset=utf-8', 10))).toBeNull();
  });
});
