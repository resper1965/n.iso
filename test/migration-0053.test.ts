import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0053 from '../migrations/0053_requisitos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0053 — catálogo de requisitos', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p53', 'C', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d53', 'p53', 'Política Exemplo')`),
      env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('f53', 'Fonte de teste')`),
      env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('r1', 'f53', 'art. 1', 'Um'), ('r2', 'f53', 'art. 2', 'Dois')`),
    ]);
  });

  it('o schema canônico tem as tabelas e a coluna do controle', async () => {
    expect(await colunas('requisito_fontes')).toEqual(['id', 'nome', 'versao', 'vigente_desde', 'created_at']);
    expect(await colunas('requisitos')).toEqual(['id', 'fonte_id', 'referencia', 'titulo', 'pai_id', 'papel', 'created_at', 'updated_at']);
    expect(await colunas('requisito_mapeamentos')).toEqual(['de_id', 'para_id', 'tipo', 'estado', 'validado_por', 'validado_em', 'nota', 'created_at']);
    expect(await colunas('documento_requisitos')).toEqual(['documento_id', 'requisito_id', 'project_id', 'created_at']);
    expect(await colunas('compliance_controls')).toContain('requisito_id');
  });

  it('a migration inclui o ALTER da coluna anulável do controle', () => {
    expect(migration0053).toMatch(/ALTER TABLE compliance_controls ADD COLUMN requisito_id TEXT REFERENCES requisitos\(id\) ON DELETE SET NULL;/);
  });

  const mapa = (de: string, para: string, extra: { tipo?: string; estado?: string; por?: string | null; em?: string | null } = {}) =>
    env.DB.prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(de, para, extra.tipo ?? 'equivalente', extra.estado ?? 'proposto', extra.por ?? null, extra.em ?? null);

  it('mapeamento: padrão proposto; tipo e estado fora da lista, auto-referência e duplicata são recusados', async () => {
    await mapa('r1', 'r2').run();
    expect(await env.DB.prepare(`SELECT estado FROM requisito_mapeamentos WHERE de_id = 'r1'`).first()).toEqual({ estado: 'proposto' });
    await expect(mapa('r1', 'r2').run()).rejects.toThrow();
    await expect(mapa('r2', 'r1', { tipo: 'igual' }).run()).rejects.toThrow();
    await expect(mapa('r2', 'r1', { estado: 'aprovado', por: 'a', em: '2026-10-01' }).run()).rejects.toThrow();
    await expect(mapa('r1', 'r1').run()).rejects.toThrow();
  });

  it('validado_juridico exige quem validou e quando', async () => {
    await expect(mapa('r2', 'r1', { estado: 'validado_juridico' }).run()).rejects.toThrow();
    await expect(mapa('r2', 'r1', { estado: 'validado_juridico', por: 'Jurídico' }).run()).rejects.toThrow();
    await mapa('r2', 'r1', { estado: 'validado_juridico', por: 'Jurídico', em: '2026-10-01' }).run();
  });

  it('requisito: referência única por fonte; papel só controlador ou operador; pai e fonte têm de existir', async () => {
    const ins = (id: string, ref: string, extra: { papel?: string | null; fonte?: string; pai?: string | null } = {}) =>
      env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo, pai_id, papel) VALUES (?, ?, ?, 'T', ?, ?)`)
        .bind(id, extra.fonte ?? 'f53', ref, extra.pai ?? null, extra.papel ?? null);
    await expect(ins('r3', 'art. 1').run()).rejects.toThrow();
    await expect(ins('r4', 'art. 4', { papel: 'terceiro' }).run()).rejects.toThrow();
    await expect(ins('r5', 'art. 5', { fonte: 'inexistente' }).run()).rejects.toThrow();
    await expect(ins('r6', 'art. 6', { pai: 'inexistente' }).run()).rejects.toThrow();
    await ins('r7', 'art. 7', { papel: 'operador', pai: 'r1' }).run();
  });

  it('requisito com documento ligado não é apagado; documento apagado leva a ligação; mapeamento acompanha o requisito', async () => {
    await env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('d53', 'r2', 'p53')`).run();
    await expect(env.DB.prepare(`DELETE FROM requisitos WHERE id = 'r2'`).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM documentos WHERE id = 'd53'`).run();
    expect(await env.DB.prepare('SELECT count(*) AS n FROM documento_requisitos').first()).toEqual({ n: 0 });
    await env.DB.prepare(`DELETE FROM requisitos WHERE id = 'r2'`).run();
    expect(await env.DB.prepare('SELECT count(*) AS n FROM requisito_mapeamentos').first()).toEqual({ n: 0 });
  });

  it('apagar o requisito zera o requisito_id do controle, sem apagar o controle', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('r8', 'f53', 'art. 8', 'Oito')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, requisito_id) VALUES ('c53', 'p53', 'ISO 27001:2022', 'A.5.1 — x', 'r8')`),
    ]);
    await env.DB.prepare(`DELETE FROM requisitos WHERE id = 'r8'`).run();
    expect(await env.DB.prepare(`SELECT requisito_id FROM compliance_controls WHERE id = 'c53'`).first()).toEqual({ requisito_id: null });
  });

  it('a migration, sem o ALTER e sobre nomes novos, cria as tabelas com os CHECKs DELA e é repetível', async () => {
    const sem = migration0053.replace(/ALTER TABLE[^;]*;/, '');
    const sufixar = (sql: string) => sql
      .replace(/\b(requisito_fontes|requisitos|requisito_mapeamentos|documento_requisitos)\b/g, '$1_t')
      .replace(/\b(idx_requisitos_fonte|idx_requisitos_pai|idx_mapeamentos_para|idx_doc_requisitos_requisito|idx_doc_requisitos_projeto)\b/g, '$1_t');
    await execSql(sufixar(sem));
    await execSql(sufixar(sem));
    expect(await colunas('requisito_mapeamentos_t')).toEqual(await colunas('requisito_mapeamentos'));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO requisito_fontes_t (id, nome) VALUES ('ft', 'F')`),
      env.DB.prepare(`INSERT INTO requisitos_t (id, fonte_id, referencia, titulo) VALUES ('a', 'ft', '1', 'A'), ('b', 'ft', '2', 'B')`),
    ]);
    await expect(env.DB.prepare(`INSERT INTO requisito_mapeamentos_t (de_id, para_id, tipo, estado) VALUES ('a', 'b', 'equivalente', 'validado_juridico')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO requisito_mapeamentos_t (de_id, para_id, tipo) VALUES ('a', 'a', 'equivalente')`).run()).rejects.toThrow();
    await env.DB.prepare(`INSERT INTO requisito_mapeamentos_t (de_id, para_id, tipo) VALUES ('a', 'b', 'parcial')`).run();
  });
});
