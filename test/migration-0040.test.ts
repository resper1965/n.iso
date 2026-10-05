import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0040 from '../migrations/0040_multiconsultoria.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0040 — multiconsultoria', () => {
  it('acrescenta org_id a users e projects com backfill org_ness, as colunas de organizations e os índices', async () => {
    await applySchema();
    // Reconstrói o estado de produção SEM recriar as tabelas (gatilhos e FKs as citam): tira as
    // colunas da 0040 e semeia linhas, que o DEFAULT da migration tem de preencher.
    await execSql(`
      DROP INDEX IF EXISTS idx_users_org;
      DROP INDEX IF EXISTS idx_projects_org;
      DROP INDEX IF EXISTS idx_organizations_prefixo;
      ALTER TABLE users DROP COLUMN org_id;
      ALTER TABLE projects DROP COLUMN org_id;
      ALTER TABLE organizations DROP COLUMN termo_aceito_em;
      ALTER TABLE organizations DROP COLUMN termo_versao;
      ALTER TABLE organizations DROP COLUMN logo_chave;
    `);
    expect(await colunas('users')).not.toContain('org_id');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1', 'a@x.io', 'h', 'A', 'consultor'), ('u2', 'b@x.io', 'h', 'B', 'org_admin')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role) VALUES ('p1', 'C1', 'ISO 27001', 'controller'), ('p2', 'C2', 'ISO 27001', 'controller')`),
    ]);

    await execSql(migration0040);

    expect(await colunas('users')).toContain('org_id');
    expect(await colunas('projects')).toContain('org_id');
    expect(await colunas('organizations')).toEqual(expect.arrayContaining(['termo_aceito_em', 'termo_versao', 'logo_chave']));
    for (const n of ['idx_projects_org', 'idx_users_org', 'idx_organizations_prefixo']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }
    // Backfill: tudo o que existe hoje é da ness.
    const fora = async (t: string) =>
      (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE org_id IS NULL OR org_id <> 'org_ness'`).first<{ n: number }>())!.n;
    expect(await fora('users')).toBe(0);
    expect(await fora('projects')).toBe(0);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())!.n).toBe(2);
    // NOT NULL de verdade.
    await expect(env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, org_id) VALUES ('p3', 'C3', 'ISO 27001', 'controller', NULL)`).run()).rejects.toThrow(/NOT NULL/);

    // Prefixo único entre organizações; NULL não conflita.
    await env.DB.prepare(`INSERT INTO organizations (id, name, slug, prefixo_proposta) VALUES ('o1', 'O1', 'o1', 'PX'), ('o2', 'O2', 'o2', NULL), ('o3', 'O3', 'o3', NULL)`).run();
    await expect(env.DB.prepare(`INSERT INTO organizations (id, name, slug, prefixo_proposta) VALUES ('o4', 'O4', 'o4', 'PX')`).run()).rejects.toThrow(/UNIQUE/);

    await applySchema(); // idempotente: confere que o schema canônico convive com o banco migrado
  }, 30_000);
});
