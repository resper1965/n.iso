import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * PUT /api/v1/controls/:id e a validade da aprovação.
 *
 * `compliance_controls.description` é onde mora o texto da política do
 * controle. A edição de política (routes/policies.ts) sempre zerou as
 * aprovações de CISO/CEO ao gravar texto novo, mas esta rota não — e era por
 * ela que dava para trocar o texto mantendo o carimbo de aprovado.
 */
const aiStub = { run: async () => ({ response: 'stub' }) };
function testEnv() {
  return { ...env, AI: aiStub } as any;
}

async function put(path: string, body: unknown, headers: Record<string, string>) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    testEnv()
  );
}

const PROJ = 'proj-aprov';
const CTRL = 'ctrl-aprov-1';
const TEXTO = 'Texto da política, aprovado por CISO e CEO.';

/** Recoloca os oito campos de aprovação, para cada teste partir de aprovado. */
async function aprovar() {
  await env.DB.prepare(
    `UPDATE compliance_controls SET description = ?,
       ciso_approved_by = 'ciso@ness.io', ciso_approved_at = '2026-01-01T00:00:00Z',
       ciso_approved_ip = '10.0.0.1', ciso_approved_ua = 'Firefox',
       ceo_approved_by = 'ceo@ness.io', ceo_approved_at = '2026-01-02T00:00:00Z',
       ceo_approved_ip = '10.0.0.2', ceo_approved_ua = 'Chrome'
     WHERE id = ?`
  ).bind(TEXTO, CTRL).run();
}

async function lerControle() {
  return env.DB.prepare(
    `SELECT title, description, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua,
            ceo_approved_by, ceo_approved_at, ceo_approved_ip, ceo_approved_ua
     FROM compliance_controls WHERE id = ?`
  ).bind(CTRL).first<any>();
}

describe('Aprovação de controle x edição do texto (D1 real)', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`
    ).bind(PROJ, 'Cliente Aprovação', 'ISO 27001', 'controller', 'Active').run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?,?,?,?,?)`
    ).bind(CTRL, PROJ, 'ISO 27001:2022', 'Controle aprovado', TEXTO).run();
    headers = await sessionFor({ id: 'u-aprov', email: 'admin@ness.io', role: 'platform_admin' });
  });

  it('trocar o texto derruba as oito colunas de aprovação', async () => {
    await aprovar();

    const r = await put(`/api/v1/controls/${CTRL}`, { description: 'Texto REESCRITO, que ninguém aprovou.' }, headers);
    expect(r.status, await r.clone().text()).toBe(200);

    const c = await lerControle();
    expect(c.description).toBe('Texto REESCRITO, que ninguém aprovou.');
    for (const campo of [
      'ciso_approved_by', 'ciso_approved_at', 'ciso_approved_ip', 'ciso_approved_ua',
      'ceo_approved_by', 'ceo_approved_at', 'ceo_approved_ip', 'ceo_approved_ua',
    ]) {
      expect(c[campo], `${campo} deveria ter sido zerado`).toBeNull();
    }
  });

  it('a invalidação vira evento próprio no log, não some dentro de "controle atualizado"', async () => {
    await aprovar();
    await put(`/api/v1/controls/${CTRL}`, { description: 'Outro texto.' }, headers);

    const ev = await env.DB.prepare(
      "SELECT actor, details FROM audit_logs WHERE action = 'control.approvals_invalidated'"
    ).first<any>();
    expect(ev).toBeTruthy();
    expect(ev.details).toContain(CTRL);
  });

  it('editar só o título preserva a aprovação — o texto não mudou', async () => {
    await aprovar();

    const r = await put(`/api/v1/controls/${CTRL}`, { title: 'Título novo' }, headers);
    expect(r.status).toBe(200);

    const c = await lerControle();
    expect(c.title).toBe('Título novo');
    expect(c.ciso_approved_by).toBe('ciso@ness.io');
    expect(c.ceo_approved_by).toBe('ceo@ness.io');
  });

  it('reenviar o MESMO texto preserva a aprovação — não houve mudança de conteúdo', async () => {
    await aprovar();

    // O cliente que faz PUT do formulário inteiro reenvia a description sem
    // tê-la alterado. Zerar aqui puniria quem só mexeu noutro campo.
    const r = await put(`/api/v1/controls/${CTRL}`, { title: 'Outro título', description: TEXTO }, headers);
    expect(r.status).toBe(200);

    const c = await lerControle();
    expect(c.ciso_approved_by).toBe('ciso@ness.io');
    expect(c.ceo_approved_by).toBe('ceo@ness.io');
  });

  it('controle inexistente responde 404, não 500', async () => {
    const r = await put('/api/v1/controls/ctrl-que-nao-existe', { title: 'x' }, headers);
    expect(r.status).toBe(404);
  });
});
