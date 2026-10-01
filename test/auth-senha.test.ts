import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword, verifyPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * `POST /auth/change-password` é a troca comum, com a senha atual. Cobre o que a
 * tela de "Trocar senha" (F7) assume: errar a atual é 401, a política de senha
 * nova é a do primeiro acesso, e trocar derruba as OUTRAS sessões e os agentes
 * conectados — sem isso, uma sessão roubada sobrevive à troca por até 24 h.
 */
const chamar = (rota: string, headers: Record<string, string>, corpo: unknown) =>
  worker.fetch(
    new Request(`http://localhost/api/v1/${rota}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo),
    }),
    workerEnv() as any,
  );
const trocar = (headers: Record<string, string>, corpo: unknown) => chamar('auth/change-password', headers, corpo);
const hashDe = async (id: string) =>
  (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(id).first<any>()).password_hash as string;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('change-password', () => {
  beforeAll(async () => {
    await applySchema();
    const h = await hashPassword('senha-atual-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-s','s@x.com',?, 'S','org_admin')`).bind(h),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-s','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-s','u-s','p-s', datetime('now','+30 days'))`),
    ]);
  });

  it('senha atual errada: 401 e a senha não muda', async () => {
    const s = await sessionFor({ id: 'u-s', email: 's@x.com', role: 'org_admin' });
    const antes = await hashDe('u-s');
    const r = await trocar(s, { oldPassword: 'errada-errada', newPassword: 'nova-senha-boa-1' });
    expect(r.status, await r.clone().text()).toBe(401);
    expect(await hashDe('u-s')).toBe(antes);
  });

  it('senha nova fraca: 400 e a senha não muda', async () => {
    const s = await sessionFor({ id: 'u-s', email: 's@x.com', role: 'org_admin' });
    const antes = await hashDe('u-s');
    const r = await trocar(s, { oldPassword: 'senha-atual-123', newPassword: 'curta' });
    expect(r.status, await r.clone().text()).toBe(400);
    expect(await hashDe('u-s')).toBe(antes);
  });

  it('sucesso: 200, hash muda, outras sessões caem, a atual segue, agentes revogados', async () => {
    const outra = await sessionFor({ id: 'u-s', email: 's@x.com', role: 'org_admin' });
    const atual = await sessionFor({ id: 'u-s', email: 's@x.com', role: 'org_admin' });
    const antes = await hashDe('u-s');
    await dormir(10); // o marco de invalidação é em ms: a sessão velha tem de ser estritamente anterior

    const r = await trocar(atual, { oldPassword: 'senha-atual-123', newPassword: 'nova-senha-boa-1' });
    expect(r.status, await r.clone().text()).toBe(200);

    const depois = await hashDe('u-s');
    expect(depois).not.toBe(antes);
    expect(await verifyPassword('nova-senha-boa-1', depois)).toBe(true);

    const velha = await worker.fetch(new Request('http://localhost/api/v1/auth/me', { headers: outra }), workerEnv() as any);
    expect(velha.status, 'a sessão anterior continuou valendo').toBe(401);

    const propria = await worker.fetch(new Request('http://localhost/api/v1/auth/me', { headers: atual }), workerEnv() as any);
    expect(propria.status, 'quem trocou a senha foi derrubado').toBe(200);

    const conc = await env.DB.prepare(`SELECT revogado_em, revogado_por FROM agente_concessoes WHERE id='c-s'`).first<any>();
    expect(conc.revogado_em).not.toBeNull();
    expect(conc.revogado_por).toBe('troca de senha');
  });
});
