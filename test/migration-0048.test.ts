import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0048 from '../migrations/0048_itens_ativos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const um = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

describe('migration 0048 — assets viram itens', () => {
  it('o schema canônico tem itens e item_seguranca; assets não existe mais; risks aponta para itens', async () => {
    await applySchema();
    expect(await colunas('itens')).toEqual(['id', 'project_id', 'nome', 'descricao', 'responsavel_texto', 'created_at', 'updated_at', 'status', 'tipo', 'departamento_id']);
    expect(await colunas('item_seguranca')).toEqual(['item_id', 'project_id', 'categoria', 'subtipo', 'classificacao', 'criticidade', 'localizacao', 'nota_c', 'nota_i', 'nota_d']);
    expect(await colunas('assets')).toEqual([]);
    expect(await um<{ t: string }>(`SELECT "table" AS t FROM pragma_foreign_key_list('risks') WHERE "from" = 'asset_id'`)).toEqual({ t: 'itens' });
  });

  it('item novo nasce ativo, recusa status e tipo fora da lista, e risco pode apontar para ele', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p48a','C','ISO 27001','controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO itens (id, project_id, nome) VALUES ('i-novo','p48a','Servidor')`).run();
    expect(await um(`SELECT status, tipo FROM itens WHERE id = 'i-novo'`)).toEqual({ status: 'ativo', tipo: 'ativo' });
    const recusa = (sql: string) => env.DB.prepare(sql).run().then(() => 'aceitou', (e: unknown) => String((e as Error).message));
    expect(await recusa(`INSERT INTO itens (id, project_id, nome, status) VALUES ('x1','p48a','N','Active')`)).toMatch(/CHECK/i);
    expect(await recusa(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('x2','p48a','N','robo')`)).toMatch(/CHECK/i);
    expect(await recusa(`INSERT INTO risks (id, project_id, asset_id, asset, threat) VALUES ('r-novo','p48a','i-novo','A','T')`)).toBe('aceitou');
    await env.DB.prepare(`DELETE FROM itens WHERE id = 'i-novo'`).run();
    expect(await um(`SELECT asset_id FROM risks WHERE id = 'r-novo'`)).toEqual({ asset_id: null });
  });

  it('aplicada sobre o formato antigo, não perde id, campo, risco nem estado', async () => {
    // O banco de teste já está no formato novo. Roda a migration sobre CÓPIAS sufixadas do formato antigo
    // (assets_t, risks_t): os nomes mudam, a lógica não.
    const sufixar = (sql: string) => sql
      .replace(/\bassets\b/g, 'assets_t').replace(/\bitens\b/g, 'itens_t').replace(/\bitem_seguranca\b/g, 'item_seguranca_t');
    await execSql(`
      CREATE TABLE assets_t (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT, category TEXT,
        classification TEXT DEFAULT 'Confidential', criticality TEXT DEFAULT 'Medium', description TEXT, owner TEXT, location TEXT,
        status TEXT DEFAULT 'Active', confidentiality_rating INTEGER DEFAULT 3, integrity_rating INTEGER DEFAULT 3,
        availability_rating INTEGER DEFAULT 3, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE risks_t (id TEXT PRIMARY KEY, project_id TEXT, asset_id TEXT REFERENCES assets_t(id) ON DELETE SET NULL);
      CREATE INDEX idx_assets_project ON assets_t(project_id);
    `);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p48b','C','ISO 27001','controller','Active')`).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, category, owner, criticality, classification, location, description, confidentiality_rating, integrity_rating, availability_rating, status)
        VALUES ('a1','p48b','ERP','Software','TI','High','Restricted','AWS','desc',1,2,5,'Active')`),
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, status, type) VALUES ('a2','p48b','Velho','Removido','Hardware')`),
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, status) VALUES ('a3','p48b','Sem status',NULL)`),
      env.DB.prepare(`INSERT INTO risks_t (id, project_id, asset_id) VALUES ('rt1','p48b','a1'), ('rt2','p48b','a2')`),
    ]);

    await execSql(sufixar(migration0048));

    expect(await um(`SELECT count(*) AS n FROM itens_t`)).toEqual({ n: 3 });
    expect(await um(`SELECT count(*) AS n FROM item_seguranca_t`)).toEqual({ n: 3 });
    expect(await um(`SELECT count(*) AS n FROM risks_t r JOIN itens_t i ON i.id = r.asset_id`)).toEqual({ n: 2 });
    expect(await um(`SELECT "table" AS t FROM pragma_foreign_key_list('risks_t') WHERE "from" = 'asset_id'`)).toEqual({ t: 'itens_t' });
    expect(await um(`SELECT i.nome, i.responsavel_texto, i.descricao, s.categoria, s.criticidade, s.classificacao, s.localizacao, s.nota_c, s.nota_i, s.nota_d
      FROM itens_t i JOIN item_seguranca_t s ON s.item_id = i.id WHERE i.id = 'a1'`))
      .toEqual({ nome: 'ERP', responsavel_texto: 'TI', descricao: 'desc', categoria: 'Software', criticidade: 'High', classificacao: 'Restricted', localizacao: 'AWS', nota_c: 1, nota_i: 2, nota_d: 5 });
    expect((await env.DB.prepare(`SELECT id, status FROM itens_t ORDER BY id`).all()).results).toEqual([
      { id: 'a1', status: 'ativo' }, { id: 'a2', status: 'removido' }, { id: 'a3', status: 'ativo' },
    ]);
    expect(await um(`SELECT subtipo FROM item_seguranca_t WHERE item_id = 'a2'`)).toEqual({ subtipo: 'Hardware' });
    expect(await colunas('itens_t')).toEqual(await colunas('itens'));
    expect(await colunas('item_seguranca_t')).toEqual(await colunas('item_seguranca'));

    await execSql('DROP TABLE risks_t; DROP TABLE item_seguranca_t; DROP TABLE itens_t;');
  }, 30_000);
});
