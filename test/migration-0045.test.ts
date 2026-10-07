import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0045 from '../migrations/0045_auditor_token_hash.sql?raw';

/** A 0045 tira o token em claro do banco: coluna vira token_hash, ganha revogação e as notas passam a guardar o id do token. */
describe('migration 0045 — token do auditor em hash e revogável', () => {
  it('troca token por token_hash, acrescenta a revogação, passa as notas para o id e apaga os tokens em claro', async () => {
    await execSql(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE auditor_tokens (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token);
      CREATE TABLE auditor_notes (id TEXT PRIMARY KEY, project_id TEXT, auditor_token TEXT NOT NULL, content TEXT NOT NULL);
      INSERT INTO projects (id) VALUES ('p1');
      INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at1', 'p1', 'segredo-em-claro', '2099-01-01T00:00:00Z');
      INSERT INTO auditor_notes (id, project_id, auditor_token, content) VALUES ('n1', 'p1', 'segredo-em-claro', 'Pergunta');
    `);
    await execSql(migration0045);
    const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('auditor_tokens')`).all<{ name: string }>();
    const cols = results.map((r) => r.name);
    expect(cols).toEqual(expect.arrayContaining(['token_hash', 'revoked_at', 'revoked_by']));
    expect(cols).not.toContain('token');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auditor_tokens').first('n')).toBe(0);
    expect(await env.DB.prepare(`SELECT auditor_token FROM auditor_notes WHERE id = 'n1'`).first('auditor_token')).toBe('at1');
  }, 30_000);
});
