import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0036 from '../migrations/0036_organizacao_comercial.sql?raw';

/**
 * A 0036 leva a bancos ANTIGOS (como produção) as colunas da organização
 * comercial. Parte das tabelas como elas eram antes e roda o arquivo de verdade.
 */
describe('migration 0036 — organização comercial', () => {
  it('adiciona org_id e a linha org_ness sem perder linha, e não duplica a semente', async () => {
    await execSql(`
      DROP TABLE IF EXISTS leads; DROP TABLE IF EXISTS assessments;
      DROP TABLE IF EXISTS proposals; DROP TABLE IF EXISTS contracts;
      DROP TABLE IF EXISTS organizations;
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'trial', max_projects INTEGER DEFAULT 3, max_users INTEGER DEFAULT 5,
        owner_id TEXT, logo_url TEXT, status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE leads (id TEXT PRIMARY KEY, company_name TEXT NOT NULL);
      CREATE TABLE assessments (id TEXT PRIMARY KEY, client_name TEXT NOT NULL);
      CREATE TABLE proposals (id TEXT PRIMARY KEY, total_price REAL);
      CREATE TABLE contracts (id TEXT PRIMARY KEY, status TEXT);
      INSERT INTO leads (id, company_name) VALUES ('l1', 'Acme');
    `);
    await execSql(migration0036);

    const lead = await env.DB.prepare("SELECT org_id FROM leads WHERE id='l1'").first<any>();
    expect(lead.org_id).toBe('org_ness');
    for (const t of ['assessments', 'proposals', 'contracts']) {
      const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<any>();
      expect(results.map((r) => r.name), t).toContain('org_id');
    }
    const ness = await env.DB.prepare("SELECT prefixo_proposta, proximo_numero FROM organizations WHERE id='org_ness'").first<any>();
    expect(ness).toEqual({ prefixo_proposta: 'NESS', proximo_numero: 1 });

    // A semente é idempotente.
    await execSql(`INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta, proximo_numero)
      VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS', 1);`);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM organizations WHERE id='org_ness'").first<any>();
    expect(n.n).toBe(1);
  }, 30_000);
});
