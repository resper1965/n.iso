// S6 — rate-limit de login por CONTA-ALVO (além do por IP).
//  - a 11ª tentativa na MESMA conta (teto 10/5min) → 429;
//  - uma conta DIFERENTE, mesmo IP, não é afetada (prova que é por conta, não por IP).
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions } from './helpers/d1';

const tentativa = (email: string, password = 'senha-errada') =>
  app.fetch(
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    env as any
  );

describe('login rate-limit por conta (S6)', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const hash = await hashPassword('senha-correta');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-a','alvo@ness.io',?,'Alvo','platform_admin')`).bind(hash),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-b','outro@ness.io',?,'Outro','platform_admin')`).bind(hash),
    ]);
  });

  it('11ª tentativa na mesma conta → 429; outra conta segue liberada', async () => {
    // 10 tentativas erradas: 401 (credencial inválida), ainda dentro do teto.
    for (let i = 0; i < 10; i++) {
      expect((await tentativa('alvo@ness.io')).status).toBe(401);
    }
    // 11ª na MESMA conta: estourou o teto por conta.
    expect((await tentativa('alvo@ness.io')).status).toBe(429);

    // Conta DIFERENTE, mesmo IP: não herda o bloqueio (teto por conta, não por IP).
    expect((await tentativa('outro@ness.io')).status).toBe(401);
  });
});
