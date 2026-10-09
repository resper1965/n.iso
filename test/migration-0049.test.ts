import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0049 from '../migrations/0049_responsavel_parte.sql?raw';

const COLUNAS: [string, string][] = [
  ['risks', 'owner_parte_id'], ['compliance_controls', 'owner_parte_id'], ['ropa_records', 'owner_parte_id'],
  ['corrective_actions', 'assigned_to_parte_id'], ['checklist_progress', 'assigned_to_parte_id'],
];
// Colunas acrescentadas por migrations POSTERIORES à 0049: ficam depois da coluna do responsável.
const POSTERIORES: Record<string, number> = { compliance_controls: 1, ropa_records: 1 }; // requisito_id (0053), base_legal_id (0054)
const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0049 — responsável aponta para a parte', () => {
  it('o schema canônico tem as cinco colunas, no fim de cada tabela, ligadas a partes', async () => {
    await applySchema();
    for (const [tabela, coluna] of COLUNAS) {
      const cols = await colunas(tabela);
      expect(cols.slice(0, cols.length - (POSTERIORES[tabela] ?? 0)).at(-1), tabela).toBe(coluna);
      const fk = await env.DB.prepare(`SELECT "table" AS t, on_delete AS d FROM pragma_foreign_key_list('${tabela}') WHERE "from" = ?`).bind(coluna).first();
      expect(fk, tabela).toEqual({ t: 'partes', d: 'SET NULL' });
    }
  });

  it('apagar a parte solta o vínculo e deixa o texto do responsável', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p49','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa49','p49','Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, owner, owner_parte_id) VALUES ('r49','p49','A','T','Ana Exemplo','pa49')`),
    ]);
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'pa49'`).run();
    expect(await env.DB.prepare(`SELECT owner, owner_parte_id FROM risks WHERE id = 'r49'`).first()).toEqual({ owner: 'Ana Exemplo', owner_parte_id: null });
  });

  it('a migration, sobre tabelas no formato anterior, acrescenta as cinco colunas e nada mais', async () => {
    // Cópias sufixadas do formato anterior: os nomes mudam, a lógica não.
    const sufixar = (sql: string) => sql.replace(/\b(risks|compliance_controls|ropa_records|corrective_actions|checklist_progress)\b/g, '$1_t');
    await execSql(`
      CREATE TABLE risks_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE compliance_controls_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE ropa_records_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE corrective_actions_t (id TEXT PRIMARY KEY, assigned_to TEXT);
      CREATE TABLE checklist_progress_t (id TEXT PRIMARY KEY, assigned_to TEXT, UNIQUE (id, assigned_to));
    `);
    await env.DB.prepare(`INSERT INTO risks_t (id, owner) VALUES ('x', 'Fulano')`).run();
    await execSql(sufixar(migration0049));
    // As cinco, uma a uma: conferir só algumas deixou passar uma migration sem a coluna de `ropa_records`.
    expect(await colunas('risks_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('compliance_controls_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('ropa_records_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('corrective_actions_t')).toEqual(['id', 'assigned_to', 'assigned_to_parte_id']);
    expect(await colunas('checklist_progress_t')).toEqual(['id', 'assigned_to', 'assigned_to_parte_id']);
    expect(await env.DB.prepare(`SELECT owner, owner_parte_id FROM risks_t`).first()).toEqual({ owner: 'Fulano', owner_parte_id: null });
    await execSql('DROP TABLE risks_t; DROP TABLE compliance_controls_t; DROP TABLE ropa_records_t; DROP TABLE corrective_actions_t; DROP TABLE checklist_progress_t;');
  }, 30_000);
});
