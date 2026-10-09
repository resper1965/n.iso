import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0057 from '../migrations/0057_terceiros.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('migration 0057 — terceiros tipificados', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p57', 'C', 'ISO', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pa57', 'p57', 'organizacao', 'Operadora Exemplo')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d57', 'p57', 'DPA Exemplo')`),
    ]);
  });

  it('o schema canônico tem a coluna e as tabelas', async () => {
    expect(await colunas('partes')).toContain('terceiro_tipo');
    expect(await colunas('avaliacoes_terceiro')).toEqual(['id', 'project_id', 'parte_id', 'metodo', 'resultado', 'valido_ate', 'evidencia_url', 'observacao', 'avaliado_por', 'created_at']);
    expect(await colunas('documento_partes')).toEqual(['documento_id', 'parte_id', 'papel', 'project_id', 'created_at']);
  });

  it('a migration inclui o ALTER anulável com CHECK', () => {
    expect(migration0057).toMatch(/ALTER TABLE partes ADD COLUMN terceiro_tipo TEXT CHECK \(terceiro_tipo IS NULL OR terceiro_tipo IN \('grande_provedor', 'medio', 'pequeno', 'critico'\)\);/);
  });

  it('terceiro_tipo só aceita os quatro valores (ou nulo)', async () => {
    await env.DB.prepare(`UPDATE partes SET terceiro_tipo = 'critico' WHERE id = 'pa57'`).run();
    await expect(env.DB.prepare(`UPDATE partes SET terceiro_tipo = 'enorme' WHERE id = 'pa57'`).run()).rejects.toThrow();
    await env.DB.prepare(`UPDATE partes SET terceiro_tipo = NULL WHERE id = 'pa57'`).run();
  });

  const aval = (id: string, extra: { metodo?: string; resultado?: string; valido?: string | null; parte?: string } = {}) =>
    env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES (?, 'p57', ?, ?, ?, ?)`)
      .bind(id, extra.parte ?? 'pa57', extra.metodo ?? 'questionario', extra.resultado ?? 'aprovado', extra.valido === undefined ? '2027-01-01' : extra.valido);

  it('avaliação: método e resultado da lista, validade obrigatória, parte existente', async () => {
    await aval('a1').run();
    await expect(aval('a2', { metodo: 'telepatia' }).run()).rejects.toThrow();
    await expect(aval('a3', { resultado: 'talvez' }).run()).rejects.toThrow();
    await expect(aval('a4', { valido: null }).run()).rejects.toThrow();
    await expect(aval('a5', { parte: 'nao-existe' }).run()).rejects.toThrow();
  });

  it('documento ligado: papel da lista, sem duplicata do mesmo papel, documento e parte existentes', async () => {
    const lig = (doc: string, parte: string, papel = 'dpa') =>
      env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES (?, ?, ?, 'p57')`).bind(doc, parte, papel);
    await lig('d57', 'pa57').run();
    await expect(lig('d57', 'pa57').run()).rejects.toThrow();
    await lig('d57', 'pa57', 'contrato').run(); // outro papel, mesma dupla: vale
    await expect(lig('d57', 'pa57', 'brinde').run()).rejects.toThrow();
    await expect(lig('nao', 'pa57').run()).rejects.toThrow();
    await expect(lig('d57', 'nao').run()).rejects.toThrow();
  });

  it('apagar a parte leva as avaliações e as ligações de documento, mas não o documento', async () => {
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'pa57'`).run();
    expect(await n(`SELECT count(*) AS n FROM avaliacoes_terceiro`)).toBe(0);
    expect(await n(`SELECT count(*) AS n FROM documento_partes`)).toBe(0);
    expect(await n(`SELECT count(*) AS n FROM documentos WHERE id = 'd57'`)).toBe(1);
  });

  it('a migration, sem o ALTER e sobre nomes novos, cria as tabelas e os índices DELA e é repetível', async () => {
    const sem = migration0057.replace(/ALTER TABLE[^;]*;/, '');
    const sufixar = (sql: string) => sql
      .replace(/\b(avaliacoes_terceiro|documento_partes)\b/g, '$1_t')
      .replace(/\b(idx_aval_terceiro_parte|idx_aval_terceiro_projeto|idx_doc_partes_parte)\b/g, '$1_t');
    await execSql(sufixar(sem));
    await execSql(sufixar(sem));
    expect(await colunas('avaliacoes_terceiro_t')).toEqual(await colunas('avaliacoes_terceiro'));
    // os CHECKs e NOT NULL são os DA MIGRATION (a tabela _t nasceu dela)
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pa57b', 'p57', 'organizacao', 'Outra')`).run();
    const t = (valido: string | null, metodo = 'auditoria') => env.DB.prepare(`INSERT INTO avaliacoes_terceiro_t (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES (lower(hex(randomblob(4))), 'p57', 'pa57b', ?, 'aprovado', ?)`).bind(metodo, valido);
    await t('2027-01-01').run();
    await expect(t(null).run()).rejects.toThrow();
    await expect(t('2027-01-01', 'outro').run()).rejects.toThrow();
  });
});
