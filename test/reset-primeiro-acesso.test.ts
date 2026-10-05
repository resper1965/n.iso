import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword, verifyPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * `POST /auth/reset-password-first` troca a senha SEM pedir a senha atual — por
 * isso só pode valer no primeiro acesso (`requires_password_change = 1`). Sem
 * essa condição, qualquer sessão aberta (uma sessão roubada, por exemplo) define
 * uma senha nova e passa a ser dona da conta. A troca comum é `change-password`,
 * que exige a senha atual.
 */
const post = (headers: Record<string, string>, corpo: unknown) =>
  worker.fetch(
    new Request('http://localhost/api/v1/auth/reset-password-first', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo),
    }),
    workerEnv() as any,
  );

describe('reset-password-first só no primeiro acesso', () => {
  beforeAll(async () => {
    await applySchema();
    const h = await hashPassword('senha-atual-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, requires_password_change) VALUES ('u-normal','normal@x.com',?, 'N','org_admin',0)`).bind(h),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, requires_password_change) VALUES ('u-novo','novo@x.com',?, 'V','org_user',1)`).bind(h),
    ]);
  });

  it('conta que NÃO está em primeiro acesso é recusada e a senha não muda', async () => {
    const s = await sessionFor({ id: 'u-normal', email: 'normal@x.com', role: 'org_admin' });
    const r = await post(s, { newPassword: 'definida-pelo-atacante-1' });
    expect(r.status, await r.clone().text()).toBe(403);
    const linha = await env.DB.prepare(`SELECT password_hash FROM users WHERE id='u-normal'`).first<any>();
    expect(await verifyPassword('senha-atual-123', linha.password_hash), 'a senha mudou').toBe(true);
    expect(await verifyPassword('definida-pelo-atacante-1', linha.password_hash)).toBe(false);
  });

  it('a tentativa recusada deixa trilha', async () => {
    const log = await env.DB.prepare(`SELECT action FROM audit_logs WHERE actor='normal@x.com' AND action='auth.reset_primeiro_recusado'`).first();
    expect(log).not.toBeNull();
  });

  it('sessão de usuário que não existe mais no banco é recusada', async () => {
    const s = await sessionFor({ id: 'u-fantasma', email: 'fantasma@x.com', role: 'org_user' });
    expect((await post(s, { newPassword: 'qualquer-senha-123' })).status).toBe(403);
  });

  it('conta em primeiro acesso continua trocando a senha', async () => {
    const s = await sessionFor({ id: 'u-novo', email: 'novo@x.com', role: 'org_user' });
    const r = await post(s, { newPassword: 'definitiva-boa-1' });
    expect(r.status, await r.clone().text()).toBe(200);
    const linha = await env.DB.prepare(`SELECT password_hash, requires_password_change FROM users WHERE id='u-novo'`).first<any>();
    expect(await verifyPassword('definitiva-boa-1', linha.password_hash)).toBe(true);
    expect(linha.requires_password_change).toBe(0);
  });

  it('e uma segunda chamada, já fora do primeiro acesso, é recusada', async () => {
    const s = await sessionFor({ id: 'u-novo', email: 'novo@x.com', role: 'org_user' });
    expect((await post(s, { newPassword: 'outra-senha-boa-2' })).status).toBe(403);
  });
});
