import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0052 from '../migrations/0052_documento_excecoes.sql?raw';

const COLUNAS = [
  'id', 'project_id', 'documento_id', 'escopo', 'motivo', 'vence_em', 'status', 'criado_por',
  'revogada_em', 'revogada_por', 'created_at', 'updated_at',
];
const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

const exc = (id: string, extra: { status?: string; doc?: string } = {}) =>
  env.DB.prepare(`INSERT INTO documento_excecoes (id, project_id, documento_id, escopo, motivo, vence_em, status) VALUES (?, 'p52', ?, 'Equipe X', 'Migração em curso', '2027-01-31', ?)`)
    .bind(id, extra.doc ?? 'd52', extra.status ?? 'ativa');

describe('migration 0052 — exceções a documentos', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p52', 'C', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d52', 'p52', 'Política Exemplo')`),
    ]);
  });

  it('o schema canônico tem a tabela com as colunas da spec', async () => {
    expect(await colunas('documento_excecoes')).toEqual(COLUNAS);
  });

  it('padrão ativa; escopo, motivo e prazo são obrigatórios; status fora da lista é recusado', async () => {
    await exc('e1').run();
    expect(await env.DB.prepare(`SELECT status FROM documento_excecoes WHERE id = 'e1'`).first()).toEqual({ status: 'ativa' });
    await expect(exc('e2', { status: 'aprovada' }).run()).rejects.toThrow();
    for (const faltando of ['escopo', 'motivo', 'vence_em']) {
      const valores = { escopo: 'x', motivo: 'y', vence_em: '2027-01-01', [faltando]: null } as Record<string, string | null>;
      await expect(env.DB.prepare(`INSERT INTO documento_excecoes (id, project_id, documento_id, escopo, motivo, vence_em) VALUES ('ex-${faltando}', 'p52', 'd52', ?, ?, ?)`)
        .bind(valores.escopo, valores.motivo, valores.vence_em).run(), faltando).rejects.toThrow();
    }
  });

  it('apagar o documento apaga as exceções; apagar o projeto também', async () => {
    await env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d52b', 'p52', 'Outra')`).run();
    await exc('e3', { doc: 'd52b' }).run();
    await env.DB.prepare(`DELETE FROM documentos WHERE id = 'd52b'`).run();
    expect(await env.DB.prepare(`SELECT id FROM documento_excecoes WHERE id = 'e3'`).first()).toBeNull();
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p52'`).run();
    expect(await env.DB.prepare('SELECT count(*) AS n FROM documento_excecoes').first()).toEqual({ n: 0 });
  });

  it('a migration, sobre um banco sem a tabela, cria a tabela e os índices, e é repetível', async () => {
    const sufixar = (sql: string) => sql
      .replace(/\bdocumento_excecoes\b/g, 'documento_excecoes_t')
      .replace(/\b(idx_excecoes_documento|idx_excecoes_projeto)\b/g, '$1_t');
    await execSql(sufixar(migration0052));
    await execSql(sufixar(migration0052));
    expect(await colunas('documento_excecoes_t')).toEqual(COLUNAS);
    const indices = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%\\_t' ESCAPE '\\' AND name LIKE 'idx_excecoes%' ORDER BY name`).all<{ name: string }>()).results.map((r) => r.name);
    expect(indices).toEqual(['idx_excecoes_documento_t', 'idx_excecoes_projeto_t']);
    // Os CHECKs e os NOT NULL são os DA MIGRATION (a tabela _t nasceu dela), não os do schema canônico.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p52t', 'C', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d52t', 'p52t', 'Doc')`),
    ]);
    const linha = (id: string, status?: string) => env.DB.prepare(
      `INSERT INTO documento_excecoes_t (id, project_id, documento_id, escopo, motivo, vence_em${status ? ', status' : ''}) VALUES (?, 'p52t', 'd52t', 'e', 'm', '2027-01-01'${status ? ', ?' : ''})`
    ).bind(...(status ? [id, status] : [id]));
    await linha('t1').run();
    expect(await env.DB.prepare(`SELECT status FROM documento_excecoes_t WHERE id = 't1'`).first()).toEqual({ status: 'ativa' });
    await expect(linha('t2', 'aprovada').run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM documento_excecoes_t`).run();
    await execSql('DROP TABLE documento_excecoes_t;');
  }, 30_000);
});
