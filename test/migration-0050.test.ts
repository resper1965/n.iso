import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0050 from '../migrations/0050_documentos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

const COLUNAS_DOCUMENTOS = [
  'id', 'project_id', 'tipo', 'titulo', 'pai_id', 'dono_parte_id', 'revisar_a_cada_meses', 'revisar_ate',
  'status', 'origem_control_id', 'created_at', 'updated_at',
];
const COLUNAS_VERSOES = ['id', 'project_id', 'documento_id', 'numero', 'texto', 'hash', 'estado', 'origem', 'criado_por', 'criado_em'];

const versao = (id: string, numero: number, estado: string) =>
  env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado) VALUES (?, 'p50', 'd50', ?, 't', 'h', ?)`)
    .bind(id, numero, estado).run();

describe('migration 0050 — documentos e versões', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p50','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa50','p50','Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, dono_parte_id) VALUES ('d50','p50','Política Exemplo','pa50')`),
    ]);
  });

  it('o schema canônico tem as duas tabelas com as colunas da spec', async () => {
    expect(await colunas('documentos')).toEqual(COLUNAS_DOCUMENTOS);
    expect(await colunas('documento_versoes')).toEqual(COLUNAS_VERSOES);
  });

  it('padrões: documento nasce política em rascunho; versão nasce rascunho de origem humana', async () => {
    expect(await env.DB.prepare(`SELECT tipo, status FROM documentos WHERE id = 'd50'`).first()).toEqual({ tipo: 'politica', status: 'rascunho' });
    await versao('v-pad', 1, 'rascunho');
    expect(await env.DB.prepare(`SELECT origem FROM documento_versoes WHERE id = 'v-pad'`).first()).toEqual({ origem: 'humano' });
    await env.DB.prepare(`DELETE FROM documento_versoes WHERE id = 'v-pad'`).run();
  });

  it('recusa tipo, estado e origem fora da lista, e revisão fora de 1 a 120 meses', async () => {
    await expect(env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, tipo) VALUES ('dx','p50','X','contrato')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, revisar_a_cada_meses) VALUES ('dy','p50','X',0)`).run()).rejects.toThrow();
    await expect(versao('vx', 9, 'publicada')).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, origem) VALUES ('vy','p50','d50',9,'t','h','robo')`).run()).rejects.toThrow();
  });

  it('o índice parcial recusa duas versões vigentes e dois rascunhos do mesmo documento', async () => {
    await versao('v1', 1, 'vigente');
    await expect(versao('v2', 2, 'vigente')).rejects.toThrow(/UNIQUE/);
    await versao('v3', 3, 'rascunho');
    await expect(versao('v4', 4, 'rascunho')).rejects.toThrow(/UNIQUE/);
    await versao('v5', 5, 'substituida'); // quantas substituídas houver
    await versao('v6', 6, 'substituida');
  });

  it('UNIQUE(documento_id, numero) recusa número repetido', async () => {
    await expect(versao('v7', 1, 'substituida')).rejects.toThrow(/UNIQUE/);
  });

  it('o vínculo com o controle de origem é único e se solta com o controle; apagar a parte dona solta o vínculo; apagar o projeto leva tudo', async () => {
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('c50','p50','ISO 27001','A.5.1 X')`).run();
    await env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, origem_control_id) VALUES ('d51','p50','Outra','c50')`).run();
    await expect(env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, origem_control_id) VALUES ('d52','p50','Repetida','c50')`).run()).rejects.toThrow(/UNIQUE/);
    // sem origem, quantos documentos quiser (índice parcial)
    await env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d53','p50','Livre 1')`).run();
    await env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d54','p50','Livre 2')`).run();

    await env.DB.prepare(`DELETE FROM partes WHERE id = 'pa50'`).run();
    expect(await env.DB.prepare(`SELECT dono_parte_id FROM documentos WHERE id = 'd50'`).first()).toEqual({ dono_parte_id: null });

    // apagar o controle de origem solta o vínculo (SET NULL) e deixa o documento
    await env.DB.prepare(`DELETE FROM compliance_controls WHERE id = 'c50'`).run();
    expect(await env.DB.prepare(`SELECT origem_control_id FROM documentos WHERE id = 'd51'`).first()).toEqual({ origem_control_id: null });

    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p50'`).run();
    expect(await env.DB.prepare(`SELECT (SELECT count(*) FROM documentos) d, (SELECT count(*) FROM documento_versoes) v`).first()).toEqual({ d: 0, v: 0 });
  });

  it('a migration, sobre um banco sem as tabelas, cria as duas e os quatro índices, e é repetível', async () => {
    // Cópias sufixadas: o banco de teste já tem as tabelas do schema; os nomes mudam, a lógica não.
    const sufixar = (sql: string) => sql
      .replace(/\b(documentos|documento_versoes)\b/g, '$1_t')
      .replace(/\b(idx_documentos_projeto|idx_documentos_controle|idx_doc_versao_vigente|idx_doc_versao_rascunho)\b/g, '$1_t');
    await execSql(sufixar(migration0050));
    await execSql(sufixar(migration0050)); // IF NOT EXISTS: rodar duas vezes não falha
    expect(await colunas('documentos_t')).toEqual(COLUNAS_DOCUMENTOS);
    expect(await colunas('documento_versoes_t')).toEqual(COLUNAS_VERSOES);
    const indices = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%\\_t' ESCAPE '\\' ORDER BY name`).all<{ name: string }>()).results.map((r) => r.name);
    expect(indices).toEqual(['idx_doc_versao_rascunho_t', 'idx_doc_versao_vigente_t', 'idx_documentos_controle_t', 'idx_documentos_projeto_t']);
    await execSql('DROP TABLE documento_versoes_t; DROP TABLE documentos_t;');
  }, 30_000);
});
