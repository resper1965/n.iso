import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0044 from '../migrations/0044_aprovacao_ip_ua.sql?raw';

/** A 0044 leva a banco NOVO as 12 colunas de IP/UA das aprovações. Em produção só é registrada. */
describe('migration 0044 — IP/UA das aprovações', () => {
  it('adiciona as quatro colunas às três tabelas legadas', async () => {
    await execSql(`
      CREATE TABLE compliance_controls (id TEXT PRIMARY KEY);
      CREATE TABLE evidence (id TEXT PRIMARY KEY);
      CREATE TABLE ropa_records (id TEXT PRIMARY KEY);
    `);
    await execSql(migration0044);
    for (const t of ['compliance_controls', 'evidence', 'ropa_records']) {
      const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>();
      const cols = results.map((r) => r.name);
      for (const c of ['ciso_approved_ip', 'ciso_approved_ua', 'ceo_approved_ip', 'ceo_approved_ua']) expect(cols).toContain(c);
    }
  }, 30_000);
});
