import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { orgDoUsuario, ORG_NESS } from '../src/services/organizacao';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

/**
 * Fatia 5, tarefa 1: a organização do usuário (multi-consultoria). Base do corte por
 * organização: erro aqui vira vazamento entre consultorias, então em dúvida, nega.
 */

describe('orgDoUsuario — por papel e cabeçalho', () => {
  it('equipe com org_id usa a própria organização', () => {
    for (const role of ['consultor', 'consultant', 'comercial', 'consultoria_admin']) {
      expect(orgDoUsuario({ role, org_id: 'org_b' }), role).toBe('org_b');
    }
  });

  it('equipe sem org_id (sessão anterior ao deploy) = org_ness', () => {
    for (const role of ['consultor', 'consultant', 'comercial', 'consultoria_admin']) {
      expect(orgDoUsuario({ role }), role).toBe(ORG_NESS);
    }
  });

  it('cliente, papel desconhecido e ausência de usuário → null', () => {
    for (const role of ['org_admin', 'org_user', 'client', 'auditor', 'ciso', '', undefined]) {
      expect(orgDoUsuario({ role }), String(role)).toBeNull();
    }
    expect(orgDoUsuario(undefined)).toBeNull();
    expect(orgDoUsuario(null)).toBeNull();
  });

  it('cliente COM org_id continua null: a organização dele é a do projeto (decisão do plano)', () => {
    for (const role of ['org_admin', 'org_user', 'client']) {
      expect(orgDoUsuario({ role, org_id: 'org_ness', client_project_id: 'p' }), role).toBeNull();
    }
  });

  it('platform_admin: sem cabeçalho org_ness, com cabeçalho a pedida; admin legado igual', () => {
    for (const role of ['platform_admin', 'admin']) {
      expect(orgDoUsuario({ role }), role).toBe(ORG_NESS);
      expect(orgDoUsuario({ role, org_id: 'org_b' }), role).toBe(ORG_NESS);
      expect(orgDoUsuario({ role }, 'org_b'), role).toBe('org_b');
      expect(orgDoUsuario({ role }, '   '), role).toBe(ORG_NESS);
    }
  });

  it('cabeçalho de quem não é platform_admin é IGNORADO', () => {
    expect(orgDoUsuario({ role: 'consultor', org_id: 'org_b' }, 'org_ness')).toBe('org_b');
    expect(orgDoUsuario({ role: 'comercial' }, 'org_b')).toBe(ORG_NESS);
    expect(orgDoUsuario({ role: 'consultoria_admin', org_id: 'org_b' }, 'org_c')).toBe('org_b');
    expect(orgDoUsuario({ role: 'org_admin' }, 'org_b')).toBeNull();
  });
});

const pedir = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env as any);

describe('contexto de organização nas rotas', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, prefixo_proposta) VALUES ('org_ness', 'ness.', 'ness', 'NESS')`),
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, prefixo_proposta) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 'CB')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-b', 'com@b.io', ?, 'Comercial B', 'comercial', 'org_b')`).bind(hash),
    ]);
  });

  const nomeDaOrg = async (h: Record<string, string>) => {
    const r = await pedir('GET', '/api/v1/org/config', h);
    return { status: r.status, corpo: await r.json<any>() };
  };

  it('comercial com org_id lê a configuração da PRÓPRIA organização', async () => {
    const h = await sessionFor({ id: 'u-b', email: 'com@b.io', role: 'comercial', org_id: 'org_b' });
    const r = await nomeDaOrg(h);
    expect(r.status).toBe(200);
    expect(r.corpo.nome).toBe('Consultoria B');
  });

  it('comercial com X-Org-Id de outra organização: cabeçalho ignorado', async () => {
    const h = await sessionFor({ id: 'u-b', email: 'com@b.io', role: 'comercial', org_id: 'org_b' });
    expect((await nomeDaOrg({ ...h, 'X-Org-Id': 'org_ness' })).corpo.nome).toBe('Consultoria B');
  });

  it('sessão legada de comercial sem org_id funciona como org_ness', async () => {
    const h = await sessionFor({ id: 'u-old', email: 'old@ness.io', role: 'comercial' });
    const r = await nomeDaOrg(h);
    expect(r.status).toBe(200);
    expect(r.corpo.nome).toBe('ness.');
  });

  it('lead criado por comercial de org_b é gravado em org_b e não aparece para a ness.', async () => {
    const b = await sessionFor({ id: 'u-b', email: 'com@b.io', role: 'comercial', org_id: 'org_b' });
    const criado = await pedir('POST', '/api/v1/leads', b, { company_name: 'Empresa X' });
    expect(criado.status).toBe(201);
    const { id } = await criado.json<any>();
    expect((await env.DB.prepare('SELECT org_id FROM leads WHERE id = ?').bind(id).first<any>()).org_id).toBe('org_b');
    const ness = await sessionFor({ id: 'u-n', email: 'com@ness.io', role: 'comercial' });
    expect((await pedir('GET', `/api/v1/leads/${id}`, ness, undefined)).status).toBe(404);
  });

  it('platform_admin: sem cabeçalho na ness.; com X-Org-Id existente na pedida; inexistente → 403', async () => {
    const adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.io', role: 'platform_admin', org_id: 'org_ness' });
    expect((await nomeDaOrg(adm)).corpo.nome).toBe('ness.');
    expect((await nomeDaOrg({ ...adm, 'X-Org-Id': 'org_b' })).corpo.nome).toBe('Consultoria B');
    const inexistente = await nomeDaOrg({ ...adm, 'X-Org-Id': 'org_fantasma' });
    expect(inexistente.status).toBe(403);
    expect(inexistente.corpo.error).toBe('Organização não identificada');
    // E nas rotas que gravam: nada é criado numa organização que não existe.
    const lead = await pedir('POST', '/api/v1/leads', { ...adm, 'X-Org-Id': 'org_fantasma' }, { company_name: 'Y' });
    expect(lead.status).toBe(403);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads`).first<any>()).n).toBe(0);
  });

  it('cliente sem org_id → 403 nas rotas que dependem da organização', async () => {
    const cli = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p' });
    for (const caminho of ['/api/v1/org/config', '/api/v1/leads', '/api/v1/propostas', '/api/v1/servicos', '/api/v1/assessments']) {
      expect((await pedir('GET', caminho, cli)).status, caminho).toBe(403);
    }
  });
});

describe('login grava org_id na sessão', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'consultoria-b')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-b', 'cons@b.io', ?, 'Cons B', 'consultor', 'org_b')`).bind(hash),
    ]);
  });

  const login = async () => {
    const r = await pedir('POST', '/api/v1/auth/login', {}, { email: 'cons@b.io', password: 'password123' });
    expect(r.status).toBe(200);
    return r.json<any>();
  };
  const sessaoNoKv = async (token: string) => JSON.parse((await env.SESSIONS.get(`session_${token}`))!);

  it('login de usuário de outra organização devolve org_id e /me o carrega', async () => {
    const { token, user } = await login();
    expect(user.org_id).toBe('org_b');
    expect((await sessaoNoKv(token)).org_id).toBe('org_b');
    const me = await (await pedir('GET', '/api/v1/auth/me', { Authorization: `Bearer ${token}` })).json<any>();
    expect(me.user.org_id).toBe('org_b');
  });

  it('troca de senha recarimba a sessão preservando org_id', async () => {
    const { token } = await login();
    const r = await pedir('POST', '/api/v1/auth/change-password', { Authorization: `Bearer ${token}` },
      { oldPassword: 'password123', newPassword: 'outra-senha-forte-1' });
    expect(r.status).toBe(200);
    expect((await sessaoNoKv(token)).org_id).toBe('org_b');
    const me = await (await pedir('GET', '/api/v1/auth/me', { Authorization: `Bearer ${token}` })).json<any>();
    expect(me.user.org_id).toBe('org_b');
  });

  it('primeiro acesso recarimba a sessão preservando org_id', async () => {
    await env.DB.prepare(`UPDATE users SET requires_password_change = 1 WHERE id = 'u-b'`).run();
    const { token } = await login();
    const r = await pedir('POST', '/api/v1/auth/reset-password-first', { Authorization: `Bearer ${token}` },
      { newPassword: 'outra-senha-forte-1' });
    expect(r.status).toBe(200);
    expect((await sessaoNoKv(token)).org_id).toBe('org_b');
  });
});
