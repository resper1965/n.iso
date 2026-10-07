import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { tokenDoAuditor } from '../src/routes/auditor';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/** O link do auditor só vale pelo hash, até o minuto do prazo, e não depois de revogado. */
const P = 'at-proj';

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P).run();
  const ins = (id: string, hash: string, expira: string, revogado: string | null = null) =>
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ${expira}, ?)`).bind(id, P, hash, revogado);
  await env.DB.batch([
    ins('t-valido', await sha256Hex('tok-valido'), `datetime('now', '+1 day')`),
    ins('t-iso', await sha256Hex('tok-iso'), `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`),
    ins('t-revogado', await sha256Hex('tok-revogado'), `datetime('now', '+1 day')`, '2026-10-01 00:00:00'),
    ins('t-claro', 'tok-claro', `datetime('now', '+1 day')`),
  ]);
});

describe('tokenDoAuditor', () => {
  it('acha o token pelo SHA-256', async () => {
    expect(await tokenDoAuditor(env.DB, 'tok-valido')).toMatchObject({ id: 't-valido', project_id: P });
  });

  it('vencido há um minuto, gravado em ISO 8601, não vale (comparado como texto, valia até o fim do dia)', async () => {
    expect(await tokenDoAuditor(env.DB, 'tok-iso')).toBeNull();
  });

  it('revogado, guardado em claro ou desconhecido não vale', async () => {
    for (const t of ['tok-revogado', 'tok-claro', 'nao-existe']) expect(await tokenDoAuditor(env.DB, t), t).toBeNull();
  });
});

describe('POST /projects/:id/auditor-token', () => {
  it('devolve o link uma vez e guarda só o hash, com prazo no formato do SQLite', async () => {
    const h = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() });
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/auditor-token`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ days_valid: 7 }),
    }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(201);
    const corpo = await r.json<{ id: string; url: string; expires_at: string }>();
    const token = corpo.url.match(/\/auditor#([0-9a-f]{64})$/)?.[1] ?? '';
    expect(token).toHaveLength(64);
    expect(corpo.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(Object.keys(corpo).sort()).toEqual(['expires_at', 'id', 'url']);
    const linha = await env.DB.prepare('SELECT id, created_by FROM auditor_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).first();
    expect(linha).toEqual({ id: corpo.id, created_by: 'adm@ness.lat' });
    const { results } = await env.DB.prepare('SELECT * FROM auditor_tokens').all();
    expect(JSON.stringify(results)).not.toContain(token);
    expect(await tokenDoAuditor(env.DB, token)).toMatchObject({ id: corpo.id, project_id: P });
  });
});
