import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0054 from '../migrations/0054_tratamento_ligacoes.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('migration 0054 — ligações do tratamento', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p54', 'C', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r54', 'p54', 'Folha de pagamento')`),
      env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('i54', 'p54', 'ERP', 'sistema')`),
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d54', 'p54', 'RH')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pa54', 'p54', 'organizacao', 'Operadora Exemplo')`),
      env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('f54', 'Fonte')`),
      env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq54', 'f54', 'art. 7, I', 'Base de teste')`),
    ]);
  });

  it('o schema canônico tem as tabelas e a coluna da base legal', async () => {
    expect(await colunas('tratamento_itens')).toEqual(['ropa_id', 'item_id', 'project_id', 'created_at']);
    expect(await colunas('tratamento_departamentos')).toEqual(['ropa_id', 'departamento_id', 'project_id', 'created_at']);
    expect(await colunas('tratamento_transferencias')).toEqual(['id', 'project_id', 'ropa_id', 'pais', 'destinatario_parte_id', 'mecanismo', 'observacao', 'created_at']);
    expect(await colunas('ropa_records')).toContain('base_legal_id');
  });

  it('a migration inclui o ALTER anulável da base legal', () => {
    expect(migration0054).toMatch(/ALTER TABLE ropa_records ADD COLUMN base_legal_id TEXT REFERENCES requisitos\(id\) ON DELETE SET NULL;/);
  });

  it('ligar o mesmo item ou departamento duas vezes é recusado; país é obrigatório na transferência', async () => {
    await env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('r54', 'i54', 'p54')`).run();
    await expect(env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('r54', 'i54', 'p54')`).run()).rejects.toThrow();
    await env.DB.prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('r54', 'd54', 'p54')`).run();
    await expect(env.DB.prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('r54', 'd54', 'p54')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO tratamento_transferencias (id, project_id, ropa_id) VALUES ('t0', 'p54', 'r54')`).run()).rejects.toThrow();
  });

  it('ligação a registro, item ou departamento inexistente é recusada (FK)', async () => {
    await expect(env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('nao', 'i54', 'p54')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('r54', 'nao', 'p54')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('r54', 'nao', 'p54')`).run()).rejects.toThrow();
  });

  it('apagar o registro leva as ligações; apagar a parte destinatária só zera a referência; apagar o requisito zera a base legal', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tratamento_transferencias (id, project_id, ropa_id, pais, destinatario_parte_id, mecanismo) VALUES ('t1', 'p54', 'r54', 'Estados Unidos', 'pa54', 'cláusulas-padrão')`),
      env.DB.prepare(`UPDATE ropa_records SET base_legal_id = 'rq54' WHERE id = 'r54'`),
    ]);
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'pa54'`).run();
    expect(await env.DB.prepare(`SELECT destinatario_parte_id AS d FROM tratamento_transferencias WHERE id = 't1'`).first()).toEqual({ d: null });
    await env.DB.prepare(`DELETE FROM requisitos WHERE id = 'rq54'`).run();
    expect(await env.DB.prepare(`SELECT base_legal_id AS b FROM ropa_records WHERE id = 'r54'`).first()).toEqual({ b: null });
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'r54'`).run();
    expect(await n('SELECT count(*) AS n FROM tratamento_itens')).toBe(0);
    expect(await n('SELECT count(*) AS n FROM tratamento_departamentos')).toBe(0);
    expect(await n('SELECT count(*) AS n FROM tratamento_transferencias')).toBe(0);
  });

  it('a migration, sem o ALTER e sobre nomes novos, cria as tabelas e os índices DELA e é repetível', async () => {
    const sem = migration0054.replace(/ALTER TABLE[^;]*;/, '');
    const sufixar = (sql: string) => sql
      .replace(/\b(tratamento_itens|tratamento_departamentos|tratamento_transferencias)\b/g, '$1_t')
      .replace(/\b(idx_trat_itens_item|idx_trat_deptos_depto|idx_trat_transf_ropa|idx_trat_transf_projeto)\b/g, '$1_t');
    await execSql(sufixar(sem));
    await execSql(sufixar(sem));
    expect(await colunas('tratamento_transferencias_t')).toEqual(await colunas('tratamento_transferencias'));
    const indices = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_trat%\\_t' ESCAPE '\\' ORDER BY name`).all<{ name: string }>()).results.map((r) => r.name);
    expect(indices).toEqual(['idx_trat_deptos_depto_t', 'idx_trat_itens_item_t', 'idx_trat_transf_projeto_t', 'idx_trat_transf_ropa_t']);
    // O NOT NULL de `pais` é o DA MIGRATION (a tabela _t nasceu dela).
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p54b', 'C', 'ISO 27001', 'controller', 'Active')`).run();
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r54b', 'p54b', 'Teste')`).run();
    await expect(env.DB.prepare(`INSERT INTO tratamento_transferencias_t (id, project_id, ropa_id) VALUES ('tx', 'p54b', 'r54b')`).run()).rejects.toThrow();
  });
});
