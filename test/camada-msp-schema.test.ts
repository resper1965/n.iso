import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';

describe('schema da camada MSP', () => {
  beforeAll(async () => { await applySchema(); });

  it('cria conta, cliente e projeto encadeados', async () => {
    await env.DB.prepare(
      `INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-a', 'msp', 'Consultoria A', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a1', 'conta-a', 'Acme', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id)
       VALUES ('proj-a1', 'Acme', 'ISO 27001', 'controller', 'Active', 'cli-a1')`
    ).run();

    const row = await env.DB.prepare(
      `SELECT c.conta_id FROM projects p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = 'proj-a1'`
    ).first<{ conta_id: string }>();

    expect(row?.conta_id).toBe('conta-a');
  });

  it('recusa tipo de conta fora do domínio', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-x', 'revenda', 'X', 'Active')`
      ).run()
    ).rejects.toThrow();
  });

  it('acesso_projeto não aceita par duplicado', async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1', 'u1@x.com', 'h', 'U1', 'org_user')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u1', 'proj-a1')`
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u1', 'proj-a1')`
      ).run()
    ).rejects.toThrow();
  });
});
