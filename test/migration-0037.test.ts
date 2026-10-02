import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0037 from '../migrations/0037_servicos.sql?raw';

describe('migration 0037 — servicos', () => {
  it('cria a tabela e o índice num banco sem servicos', async () => {
    await execSql('DROP TABLE IF EXISTS servicos;');
    await execSql(migration0037);
    const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='servicos'").first();
    expect(t).toBeTruthy();
    const i = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_servicos_org'").first();
    expect(i).toBeTruthy();
  }, 30_000);
});
