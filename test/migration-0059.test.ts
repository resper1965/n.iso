import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0059 from '../migrations/0059_evidencia_validade.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;
const evid = (id: string, projeto = 'p59') =>
  env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?, ?, 'a.pdf', 'k', 'h', 'u')`).bind(id, projeto);

describe('migration 0059 — evidência com validade e requisito', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p59', 'C', 'ISO', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('f59', 'F')`),
      env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq59', 'f59', 'art. 1', 'Um')`),
      evid('e59'),
    ]);
  });

  it('o schema canônico tem a coluna (no fim) e a tabela', async () => {
    expect((await colunas('evidence')).at(-1)).toBe('valido_ate');
    expect(await colunas('evidencia_requisitos')).toEqual(['evidencia_id', 'requisito_id', 'project_id', 'created_at']);
  });

  it('a migration inclui o ALTER anulável', () => {
    expect(migration0059).toMatch(/ALTER TABLE evidence ADD COLUMN valido_ate TEXT;/);
  });

  it('valido_ate é opcional e as evidências existentes ficam sem validade', async () => {
    expect(await env.DB.prepare(`SELECT valido_ate FROM evidence WHERE id = 'e59'`).first()).toEqual({ valido_ate: null });
    await env.DB.prepare(`UPDATE evidence SET valido_ate = '2027-01-31' WHERE id = 'e59'`).run();
  });

  it('ligação: dupla única, evidência e requisito existentes; requisito ligado não é apagado; evidência apagada leva a ligação', async () => {
    const lig = (e: string, r: string) => env.DB.prepare(`INSERT INTO evidencia_requisitos (evidencia_id, requisito_id, project_id) VALUES (?, ?, 'p59')`).bind(e, r);
    await lig('e59', 'rq59').run();
    await expect(lig('e59', 'rq59').run()).rejects.toThrow();
    await expect(lig('nao', 'rq59').run()).rejects.toThrow();
    await expect(lig('e59', 'nao').run()).rejects.toThrow();
    await expect(env.DB.prepare(`DELETE FROM requisitos WHERE id = 'rq59'`).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM evidence WHERE id = 'e59'`).run();
    expect(await n('SELECT count(*) AS n FROM evidencia_requisitos')).toBe(0);
  });

  it('a migration, sem o ALTER e sobre nomes novos, cria a tabela e os índices DELA e é repetível', async () => {
    const sem = migration0059.replace(/ALTER TABLE[^;]*;/, '').replace(/CREATE INDEX IF NOT EXISTS idx_evidence_validade[^;]*;/, '');
    const sufixar = (sql: string) => sql
      .replace(/\bevidencia_requisitos\b/g, 'evidencia_requisitos_t')
      .replace(/\b(idx_evid_requisitos_requisito|idx_evid_requisitos_projeto)\b/g, '$1_t');
    await execSql(sufixar(sem));
    await execSql(sufixar(sem));
    expect(await colunas('evidencia_requisitos_t')).toEqual(await colunas('evidencia_requisitos'));
    await evid('e59b').run();
    await env.DB.prepare(`INSERT INTO evidencia_requisitos_t (evidencia_id, requisito_id, project_id) VALUES ('e59b', 'rq59', 'p59')`).run();
    await expect(env.DB.prepare(`INSERT INTO evidencia_requisitos_t (evidencia_id, requisito_id, project_id) VALUES ('e59b', 'rq59', 'p59')`).run()).rejects.toThrow();
  });
});
