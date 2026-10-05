import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, workerEnv, sessionFor } from './helpers/d1';

/**
 * Revisão final da fatia 5, M4: o `consultoria_admin` e as contas dos colegas.
 * - a trilha da edição diz QUAIS campos mudaram (nunca o valor, menos ainda a senha);
 * - ele não troca a senha de outro `consultoria_admin` (seria tomar a conta); o platform_admin troca;
 * - ele não apaga nem rebaixa o ÚLTIMO `consultoria_admin` ativo da organização (409).
 */
const SENHA = 'Senha-forte-123!';
const NOVA = 'Outra-senha-forte-456!';
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv() as any);
const S: Record<string, Record<string, string>> = {};

beforeEach(async () => {
  await applySchema();
  await resetData();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 100, 100)`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin','org_b',1),
      ('u-ab2','ab2@b.lat',?,'AB2','consultoria_admin','org_b',1),
      ('u-cb','cb@b.lat',?,'CB','consultor','org_b',1)`).bind(h, h, h, h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
});

const trilha = async () => (await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'user.updated' ORDER BY rowid DESC LIMIT 1`).first<any>())?.details ?? '';

describe('M4 — contas de colegas', () => {
  it('a trilha da edição lista os campos que mudaram, sem valor nem senha', async () => {
    const res = await chamar('PUT', '/api/v1/users/u-cb', S.ab, { name: 'Novo Nome', email: 'cb2@b.lat', password: NOVA, role: 'comercial' });
    expect(res.status, await res.clone().text()).toBe(200);
    const t = await trilha();
    for (const campo of ['senha', 'papel', 'email', 'nome']) expect(t).toContain(campo);
    for (const valor of [NOVA, 'Novo Nome', 'cb2@b.lat', 'comercial']) expect(t).not.toContain(valor);
  });

  it('consultoria_admin não troca a senha de outro consultoria_admin (403); o platform_admin troca', async () => {
    const antes = (await env.DB.prepare(`SELECT password_hash AS h FROM users WHERE id = 'u-ab2'`).first<any>()).h;
    let res = await chamar('PUT', '/api/v1/users/u-ab2', S.ab, { password: NOVA });
    expect(res.status).toBe(403);
    expect((await env.DB.prepare(`SELECT password_hash AS h FROM users WHERE id = 'u-ab2'`).first<any>()).h).toBe(antes);
    res = await chamar('PUT', '/api/v1/users/u-ab2', S.pa, { password: NOVA });
    expect(res.status, await res.clone().text()).toBe(200);
    // a senha de um consultor da equipe ele continua trocando
    res = await chamar('PUT', '/api/v1/users/u-cb', S.ab, { password: NOVA });
    expect(res.status).toBe(200);
  });

  it('não rebaixa nem apaga o ÚLTIMO consultoria_admin ativo da organização (409); com outro ativo, pode', async () => {
    // dois administradores: rebaixar um deles passa
    let res = await chamar('PUT', '/api/v1/users/u-ab2', S.ab, { role: 'consultor' });
    expect(res.status, await res.clone().text()).toBe(200);
    // agora u-ab é o último: não se rebaixa nem se apaga
    res = await chamar('PUT', '/api/v1/users/u-ab', S.ab, { role: 'consultor' });
    expect(res.status).toBe(409);
    res = await chamar('DELETE', '/api/v1/users/u-ab', S.ab);
    expect(res.status).toBe(409);
    expect((await env.DB.prepare(`SELECT role FROM users WHERE id = 'u-ab'`).first<any>()).role).toBe('consultoria_admin');
  });

  it('administrador inativo não conta como o "outro" administrador', async () => {
    await env.DB.prepare(`UPDATE users SET ativo = 0 WHERE id = 'u-ab2'`).run();
    expect((await chamar('DELETE', '/api/v1/users/u-ab', S.ab)).status).toBe(409);
    // e apagar o inativo, com u-ab ativo, passa
    expect((await chamar('DELETE', '/api/v1/users/u-ab2', S.ab)).status).toBe(200);
  });
});
