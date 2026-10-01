import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0035 from '../migrations/0035_management_reviews_assinaturas.sql?raw';

/**
 * A 0035 leva a bancos ANTIGOS as seis colunas de assinatura que produção já tem.
 * Parte da tabela como ela era antes (0003/schema.sql sem as colunas) e roda o
 * arquivo de verdade. Em produção a migration só é registrada, nunca executada.
 */
describe('migration 0035 — assinaturas da análise crítica', () => {
  it('adiciona as seis colunas a uma tabela legada sem perder linha', async () => {
    await execSql(`
      CREATE TABLE management_reviews (
        id TEXT PRIMARY KEY, project_id TEXT, review_date DATE NOT NULL,
        attendees TEXT, agenda_json TEXT, decisions TEXT, action_items TEXT,
        minutes_url TEXT, status TEXT DEFAULT 'Planned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO management_reviews (id, review_date) VALUES ('m1', '2026-01-01');
    `);
    await execSql(migration0035);

    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('management_reviews')").all<any>();
    const colunas = results.map((r) => r.name);
    for (const c of ['ciso_signed_by', 'ciso_signed_at', 'ciso_signed_ip', 'ceo_signed_by', 'ceo_signed_at', 'ceo_signed_ip']) {
      expect(colunas).toContain(c);
    }
    const m = await env.DB.prepare("SELECT ciso_signed_by FROM management_reviews WHERE id='m1'").first<any>();
    expect(m.ciso_signed_by).toBeNull();
  }, 30_000);
});
