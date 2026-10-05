import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir, designarConsultor } from './helpers/d1';

/**
 * Papéis internos da ness. que só o `platform_admin` atribui: o próprio
 * `platform_admin` (opera a plataforma inteira) e o `comercial` (CRM: leads,
 * propostas, tabela de preços).
 *
 * Antes desta regra a rota de usuários deixava o consultor atribuir QUALQUER
 * papel: criar um `platform_admin` com senha escolhida por ele, ou mudar o
 * próprio papel — escalada completa a partir de uma conta de consultor.
 */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);
const json = (s: Record<string, string>) => ({ ...s, 'Content-Type': 'application/json' });

let consultor: Record<string, string>;
let admin: Record<string, string>;

const novo = (email: string, role: string) =>
  JSON.stringify({ email, password: 'senha-forte-123', name: 'Novo', role });

describe('Papéis internos só por platform_admin', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-cons', 'cons@ness.lat', 'x', 'Consultor', 'consultor').run();
    consultor = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    admin = json(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' }));
  });

  // `admin` (grafia legada) nem é papel aceito pelo schema desde a fatia 5: 400 antes da guarda.
  for (const [papel, status] of [['platform_admin', 403], ['admin', 400], ['comercial', 403]] as const) {
    it(`consultor NÃO cria usuário ${papel}`, async () => {
      const res = await req('/api/v1/users', { method: 'POST', headers: consultor, body: novo(`x-${papel}@x.com`, papel) });
      expect(res.status).toBe(status);
      const criado = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(`x-${papel}@x.com`).first();
      expect(criado, 'o usuário foi criado apesar do 403').toBeNull();
    });
  }

  it('consultor NÃO se promove a platform_admin', async () => {
    const res = await req('/api/v1/users/u-cons', { method: 'PUT', headers: consultor, body: JSON.stringify({ role: 'platform_admin' }) });
    expect(res.status).toBe(403);
    const linha = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind('u-cons').first<{ role: string }>();
    expect(linha!.role).toBe('consultor');
  });

  // Segunda porta para o mesmo lugar: não é preciso criar um admin se dá para
  // tomar a conta de um que já existe.
  it('consultor NÃO troca a senha de um platform_admin', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-alvo', 'alvo@ness.lat', 'hash-original', 'Admin', 'platform_admin').run();
    const s = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    const res = await req('/api/v1/users/u-alvo', { method: 'PUT', headers: s, body: JSON.stringify({ password: 'senha-do-atacante' }) });
    expect(res.status).toBe(403);
    const linha = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind('u-alvo').first<{ password_hash: string }>();
    expect(linha!.password_hash).toBe('hash-original');
  });

  it('consultor NÃO apaga um platform_admin', async () => {
    const s = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    const res = await req('/api/v1/users/u-alvo', { method: 'DELETE', headers: s });
    expect(res.status).toBe(403);
    expect(await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind('u-alvo').first()).not.toBeNull();
  });

  it('consultor NÃO cria outro consultor', async () => {
    const s = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    const res = await req('/api/v1/users', { method: 'POST', headers: s, body: novo('par@ness.lat', 'consultor') });
    expect(res.status).toBe(403);
  });

  it('consultor NÃO troca a senha de outro consultor (tomada de conta entre pares)', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-par', 'colega@ness.lat', 'hash-do-colega', 'Colega', 'consultor').run();
    const s = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    const res = await req('/api/v1/users/u-par', { method: 'PUT', headers: s, body: JSON.stringify({ password: 'senha-do-atacante' }) });
    expect(res.status).toBe(403);
  });

  it('platform_admin cria usuário comercial', async () => {
    const res = await req('/api/v1/users', { method: 'POST', headers: admin, body: novo('vendas@ness.lat', 'comercial') });
    expect(res.status, await res.clone().text()).toBe(201);
    const linha = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind('vendas@ness.lat').first<{ role: string }>();
    expect(linha!.role).toBe('comercial');
  });

  it('consultor segue criando usuário de cliente do projeto em que está designado', async () => {
    // Sessão nova: o caso da autopromoção acima revoga as sessões do consultor.
    const consultor = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind('p-1', 'Cliente', 'ISO 27001', 'controller', 'Active').run();
    await designarConsultor('cons@ness.lat', 'p-1');
    const res = await req('/api/v1/users', {
      method: 'POST', headers: consultor,
      body: JSON.stringify({ email: 'cli@cliente.com', password: 'senha-forte-123', name: 'Cli', role: 'org_user', client_project_id: 'p-1' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });
});
