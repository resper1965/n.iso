// D1/S1 — repository_token cifrado em repouso.
//  - PUT /projects/:id grava o token CIFRADO (v1:), nunca em claro;
//  - a resposta continua redigida (só repository_token_set);
//  - POST /projects/admin/encrypt-tokens migra linhas legadas em claro (idempotente);
//  - migração exige platform_admin.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { decryptSecret, isEncrypted } from '../src/secret-crypto';

describe('repository_token cifrado em repouso (D1/S1)', () => {
  let admin: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, repository_token) VALUES ('p1','C','ISO 27001:2022','Controller','Active','ghp_LEGADO_EM_CLARO')`
    ).run();
    admin = { ...(await sessionFor({ id: 'u1', email: 'a@ness.io', role: 'platform_admin', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (method: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers: admin, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('PUT grava o token CIFRADO e a resposta segue redigida', async () => {
    const res = await req('PUT', '/api/v1/projects/p1', { repository_token: 'ghp_NOVO_SEGREDO' });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT repository_token FROM projects WHERE id='p1'").first<any>();
    expect(isEncrypted(row.repository_token)).toBe(true); // não é texto claro
    expect(row.repository_token).not.toContain('ghp_NOVO_SEGREDO');
    expect(await decryptSecret(row.repository_token, env.TOKEN_ENC_KEY as string)).toBe('ghp_NOVO_SEGREDO');

    const body = (await (await req('GET', '/api/v1/projects/p1')).json()) as any;
    expect(body.repository_token).toBeUndefined();
    expect(body.repository_token_set).toBe(true);
  });

  it('admin/encrypt-tokens cifra linhas legadas e é idempotente', async () => {
    const r1 = (await (await req('POST', '/api/v1/projects/admin/encrypt-tokens')).json()) as any;
    expect(r1.ok).toBe(true);
    expect(r1.cifrados).toBe(1);

    const row = await env.DB.prepare("SELECT repository_token FROM projects WHERE id='p1'").first<any>();
    expect(isEncrypted(row.repository_token)).toBe(true);
    expect(await decryptSecret(row.repository_token, env.TOKEN_ENC_KEY as string)).toBe('ghp_LEGADO_EM_CLARO');

    // Segunda passada: nada novo a cifrar.
    const r2 = (await (await req('POST', '/api/v1/projects/admin/encrypt-tokens')).json()) as any;
    expect(r2.cifrados).toBe(0);
    expect(r2.ja_cifrados).toBe(1);
  });

  it('admin/encrypt-tokens exige platform_admin', async () => {
    const naoAdmin = { ...(await sessionFor({ id: 'u2', email: 'b@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await app.fetch(new Request('http://localhost/api/v1/projects/admin/encrypt-tokens', { method: 'POST', headers: naoAdmin }), env as any);
    expect(res.status).toBe(403);
  });
});
