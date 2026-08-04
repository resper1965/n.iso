import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0021 from '../migrations/0021_project_scope_not_null.sql?raw';

/**
 * Ensaio da migration 0021 contra o schema ANTERIOR a ela.
 *
 * A 0021 endurece `project_id` para NOT NULL em `api_keys`, `webhooks` e
 * `auditor_tokens`. SQLite não tem `ALTER COLUMN`, então isso é rebuild de
 * tabela: criar nova, copiar, DROPAR a antiga, renomear. Os dois modos de falha
 * de um rebuild não aparecem em `schema.sql` — só rodando o script:
 *
 *   1. copiar errado e perder linha (ou coluna) no DROP;
 *   2. esquecer de recriar um índice, que morre junto com a tabela — inclusive
 *      o UNIQUE de `api_keys(key_hash)`, do qual o lookup de autenticação
 *      depende (migration 0018).
 *
 * Por isso o teste parte do estado legado real, roda o arquivo de migration de
 * verdade (`?raw`) e confere dado, índice, FK e a constraint nova.
 */

/** Definições exatamente como estavam antes da 0021 (0004 + schema.sql). */
const LEGADO = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL
);
CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read',
    last_used_at DATETIME,
    expires_at DATETIME,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE TABLE webhooks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    status TEXT DEFAULT 'Active',
    last_triggered_at DATETIME,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);
CREATE TABLE auditor_tokens (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token);
`;

async function popularLegado(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name) VALUES ('p1','Cliente Um')`),
    env.DB.prepare(
      `INSERT INTO api_keys (id, project_id, key_hash, name, permissions, last_used_at, expires_at, status)
       VALUES ('ak1','p1','hash-unico','Integração ERP','write','2026-01-02T03:04:05Z','2099-01-01T00:00:00Z','Active')`
    ),
    env.DB.prepare(
      `INSERT INTO webhooks (id, project_id, url, events, secret, status, failure_count)
       VALUES ('wh1','p1','https://cliente.example/hook','evidence.uploaded','segredo-hmac','Active',3)`
    ),
    env.DB.prepare(
      `INSERT INTO auditor_tokens (id, project_id, token, expires_at, created_by)
       VALUES ('at1','p1','tok-auditor','2099-01-01T00:00:00Z','consultor@ness.io')`
    ),
  ]);
}

async function colunaNotNull(tabela: string, coluna: string): Promise<number | undefined> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tabela})`).all<any>();
  return (results || []).find((r: any) => r.name === coluna)?.notnull;
}

async function indices(tabela: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ?`
  ).bind(tabela).all<any>();
  return (results || []).map((r: any) => r.name);
}

describe('migration 0021 — project_id NOT NULL nas tabelas de concessão de acesso', () => {
  beforeAll(async () => {
    await execSql(LEGADO);
    await popularLegado();
    // O arquivo inteiro, de uma vez. Se qualquer statement abortar, tudo abaixo falha.
    await execSql(migration0021);
  });

  it('marca project_id como NOT NULL nas três tabelas', async () => {
    expect(await colunaNotNull('api_keys', 'project_id')).toBe(1);
    expect(await colunaNotNull('webhooks', 'project_id')).toBe(1);
    expect(await colunaNotNull('auditor_tokens', 'project_id')).toBe(1);
  });

  it('recusa credencial sem projeto — o caso do PR #41 deixa de ser representável', async () => {
    await expect(
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name) VALUES ('ak-orfa', NULL, 'h2', 'sem escopo')`).run()
    ).rejects.toThrow(/NOT NULL/i);
    await expect(
      env.DB.prepare(`INSERT INTO webhooks (id, url, events) VALUES ('wh-orfa','https://x/y','evidence.uploaded')`).run()
    ).rejects.toThrow(/NOT NULL/i);
    await expect(
      env.DB.prepare(`INSERT INTO auditor_tokens (id, token, expires_at) VALUES ('at-orfa','tok2','2099-01-01T00:00:00Z')`).run()
    ).rejects.toThrow(/NOT NULL/i);
  });

  it('o rebuild preserva todas as colunas e valores, não só as chaves', async () => {
    const k = await env.DB.prepare("SELECT * FROM api_keys WHERE id='ak1'").first<any>();
    expect(k.key_hash).toBe('hash-unico');
    expect(k.name).toBe('Integração ERP');
    expect(k.permissions).toBe('write');
    expect(k.last_used_at).toBe('2026-01-02T03:04:05Z');
    expect(k.expires_at).toBe('2099-01-01T00:00:00Z');
    expect(k.status).toBe('Active');

    const w = await env.DB.prepare("SELECT * FROM webhooks WHERE id='wh1'").first<any>();
    expect(w.url).toBe('https://cliente.example/hook');
    expect(w.secret).toBe('segredo-hmac');
    expect(w.failure_count).toBe(3);

    const t = await env.DB.prepare("SELECT * FROM auditor_tokens WHERE id='at1'").first<any>();
    expect(t.token).toBe('tok-auditor');
    expect(t.created_by).toBe('consultor@ness.io');
    expect(t.expires_at).toBe('2099-01-01T00:00:00Z');
  });

  it('recria os índices que o DROP levou junto (auth depende do UNIQUE de key_hash)', async () => {
    expect(await indices('api_keys')).toEqual(
      expect.arrayContaining(['idx_api_keys_project', 'idx_api_keys_key_hash'])
    );
    expect(await indices('webhooks')).toContain('idx_webhooks_project');
    expect(await indices('auditor_tokens')).toContain('idx_auditor_tokens');

    // O UNIQUE não é só um nome em sqlite_master: tem que recusar duplicata.
    await expect(
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name) VALUES ('ak2','p1','hash-unico','clone')`).run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at2','p1','tok-auditor','2099-01-01T00:00:00Z')`).run()
    ).rejects.toThrow();
  });

  it('preserva a foreign key para projects', async () => {
    for (const tabela of ['api_keys', 'webhooks', 'auditor_tokens']) {
      const { results } = await env.DB.prepare(`PRAGMA foreign_key_list(${tabela})`).all<any>();
      expect((results || []).map((r: any) => r.table)).toContain('projects');
    }
  });

  it('não deixa tabela _new para trás', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%\\_new' ESCAPE '\\'`
    ).all<any>();
    expect(results || []).toHaveLength(0);
  });

  it('com linha órfã, aborta ANTES do DROP — o dado não se perde', async () => {
    // É o cenário que o PRÉ-VOO do cabeçalho existe para evitar. Autocontido:
    // desfaz o estado migrado e reconstrói o legado com uma chave sem projeto.
    await execSql(`
      DROP TABLE api_keys;
      DROP TABLE webhooks;
      DROP TABLE auditor_tokens;
    `);
    await execSql(LEGADO);
    await env.DB.prepare(
      `INSERT INTO api_keys (id, project_id, key_hash, name) VALUES ('ak-legada', NULL, 'hash-orfao', 'sem escopo')`
    ).run();

    await expect(execSql(migration0021)).rejects.toThrow(/NOT NULL/i);

    // A antiga continua lá, com a linha intacta: o INSERT..SELECT falha antes do
    // `DROP TABLE api_keys`. Corrigir o dado e rodar de novo é seguro.
    const sobreviveu = await env.DB.prepare("SELECT key_hash FROM api_keys WHERE id='ak-legada'").first<any>();
    expect(sobreviveu.key_hash).toBe('hash-orfao');
  });
});
