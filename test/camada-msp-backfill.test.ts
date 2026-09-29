import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import backfillSql from '../migrations/0032_camada_msp_backfill.sql?raw';

describe('backfill da camada MSP', () => {
  beforeAll(async () => {
    await applySchema();
    // Estado ANTERIOR à camada MSP: projetos com client_name, usuários com client_project_id.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1', 'Acme', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2', 'Acme', 'ISO 27701', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p3', 'Beta', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'c@acme.com', 'h', 'Cliente', 'org_user', 'p1')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-staff', 's@ness.com', 'h', 'Staff', 'consultor')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-adm', 'a@ness.com', 'h', 'Admin', 'platform_admin')`),
      // Usuário travado num projeto que não existe mais (ex.: linha órfã de
      // saneamento manual anterior à camada MSP). `acesso_projeto.project_id`
      // é FK NOT NULL: sem a guarda no INSERT da concessão, este único
      // usuário aborta a migration inteira no meio do deploy.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-fantasma', 'f@acme.com', 'h', 'Fantasma', 'org_user', 'p-inexistente')`),
    ]);
    await execSql(backfillSql);
  });

  it('agrupa projetos da mesma empresa sob um cliente só', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT cliente_id) n FROM projects WHERE id IN ('p1','p2')`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('cria um cliente por client_name distinto', async () => {
    const row = await env.DB.prepare(`SELECT COUNT(*) n FROM clientes`).first<{ n: number }>();
    expect(row?.n).toBe(2); // Acme e Beta
  });

  it('PRESERVA o isolamento: usuário segue alcançando só o projeto que já era dele', async () => {
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM acesso_projeto WHERE user_id = 'u-cli'`
    ).all<{ project_id: string }>();
    expect(results.map(r => r.project_id)).toEqual(['p1']);
  });

  it('liga o usuário do cliente à empresa dele', async () => {
    const row = await env.DB.prepare(
      `SELECT c.nome FROM users u JOIN clientes c ON c.id = u.cliente_id WHERE u.id = 'u-cli'`
    ).first<{ nome: string }>();
    expect(row?.nome).toBe('Acme');
  });

  it('põe staff na conta ness e deixa platform_admin sem conta', async () => {
    const staff = await env.DB.prepare(`SELECT conta_id FROM users WHERE id = 'u-staff'`).first<{ conta_id: string | null }>();
    const adm = await env.DB.prepare(`SELECT conta_id FROM users WHERE id = 'u-adm'`).first<{ conta_id: string | null }>();
    expect(staff?.conta_id).toBe('conta-ness');
    expect(adm?.conta_id).toBeNull();
  });

  it('não deixa projeto órfão', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE cliente_id IS NULL`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('GUARDA de FK: usuário preso a projeto inexistente não aborta a migration e não ganha concessão', async () => {
    // Se chegamos até aqui, o `beforeAll` já rodou a migration sem lançar —
    // é a primeira prova da guarda (sem ela, o INSERT da concessão viola a
    // FK NOT NULL de acesso_projeto.project_id e a migration inteira aborta).
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM acesso_projeto WHERE user_id = 'u-fantasma'`
    ).all<{ project_id: string }>();
    expect(results).toEqual([]);
  });
});
