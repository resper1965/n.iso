import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * E-mail é identidade: grava-se em minúsculas e busca-se sem caixa. Conta antiga
 * gravada com maiúscula continua entrando (não há migration de dados).
 */
const SENHA = 'Senha-forte-123!';

const chamar = (metodo: string, caminho: string, corpo: unknown, headers: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.${Math.floor(Math.random() * 250)}.1`, ...headers },
    body: JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra });

let adm: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-velho', 'Velho@Caixa.com', ?, 'Velho', 'consultor', 'org_ness')`)
    .bind(await hashPassword(SENHA)).run();
  adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
}, 60_000);

describe('e-mail sem caixa', () => {
  it('criar conta com maiúsculas grava em minúsculas', async () => {
    const r = await chamar('POST', '/api/v1/admin/users', { email: ' CEO@Caixa.com ', password: SENHA, name: 'CEO', role: 'consultor' }, adm);
    expect(r.status, await r.clone().text()).toBe(201);
    const u = await env.DB.prepare(`SELECT email FROM users WHERE lower(email) = 'ceo@caixa.com'`).all<{ email: string }>();
    expect(u.results.map((x) => x.email)).toEqual(['ceo@caixa.com']);
  });

  it('conta antiga com maiúscula entra digitando em qualquer caixa', async () => {
    for (const email of ['velho@caixa.com', 'VELHO@CAIXA.COM']) {
      const r = await chamar('POST', '/api/v1/auth/login', { email, password: SENHA });
      expect(r.status, await r.clone().text()).toBe(200);
    }
  });

  it('não cria segunda conta que só difere na caixa', async () => {
    const r = await chamar('POST', '/api/v1/admin/users', { email: 'velho@caixa.com', password: SENHA, name: 'Dup', role: 'consultor' }, adm);
    expect(r.status).toBe(400);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE lower(email) = 'velho@caixa.com'`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('editar OUTRA conta para variante de caixa da conta antiga é recusado; a dona continua entrando', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-outro', 'outro@caixa.com', 'x', 'Outro', 'consultor', 'org_ness')`).run();
    const r = await chamar('PUT', '/api/v1/admin/users/u-outro', { email: 'velho@caixa.com' }, adm);
    expect(r.status, await r.clone().text()).toBe(400);
    expect((await env.DB.prepare(`SELECT email FROM users WHERE id = 'u-outro'`).first<any>()).email).toBe('outro@caixa.com');
    expect((await chamar('POST', '/api/v1/auth/login', { email: 'velho@caixa.com', password: SENHA })).status).toBe(200);
    // Editar a própria conta mantendo o e-mail (em outra caixa) não colide consigo mesma.
    expect((await chamar('PUT', '/api/v1/admin/users/u-outro', { email: 'OUTRO@caixa.com' }, adm)).status).toBe(200);
  });

  it('setup não cria variante de caixa de conta existente', async () => {
    const r = await chamar('POST', '/api/v1/auth/setup', { email: 'velho@caixa.com', password: SENHA, name: 'X', setupKey: 'k' }, {}, { SETUP_KEY: 'k' });
    expect(r.status).toBe(201);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE lower(email) = 'velho@caixa.com'`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('recuperação de senha acha a conta antiga sem caixa', async () => {
    const r = await chamar('POST', '/api/v1/auth/forgot-password', { email: 'VELHO@caixa.com' }, {}, { ENVIRONMENT: 'development' });
    expect(r.status).toBe(200);
    expect((await r.json<any>()).reset_token).toBeTruthy();
  });
});
