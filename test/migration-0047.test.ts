import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0047 from '../migrations/0047_nucleo_partes_modulos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const tenta = (sql: string, ...b: unknown[]) =>
  env.DB.prepare(sql).bind(...b).run().then(() => 'aceitou', (e: unknown) => String((e as Error).message));
const projeto = (id: string) => env.DB.prepare(
  `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001', 'controller', 'Active')`
).bind(id).run();
const modulos = async (id: string) =>
  (await env.DB.prepare('SELECT modulo, habilitado_por FROM projeto_modulos WHERE project_id = ?').bind(id).all()).results;

describe('migration 0047 — módulos, partes, vínculos e departamentos', () => {
  it('o schema canônico tem as tabelas, a coluna e o gatilho', async () => {
    await applySchema();
    expect(await colunas('partes')).toEqual(['id', 'project_id', 'tipo', 'nome', 'email', 'user_id', 'status', 'created_at', 'updated_at', 'terceiro_tipo']); // terceiro_tipo: migration 0057 (fatia 6)
    expect(await colunas('parte_vinculos')).toEqual(['id', 'project_id', 'parte_id', 'papel', 'alvo_tipo', 'alvo_id', 'created_at']);
    expect(await colunas('departamentos')).toEqual(['id', 'project_id', 'nome', 'status', 'created_at', 'updated_at']);
    expect(await colunas('projeto_modulos')).toEqual(['project_id', 'modulo', 'habilitado_em', 'habilitado_por']);
    expect(await colunas('organizations')).toContain('modulos_contratados');
    // O gatilho da 0047 (sempre `iso`) foi trocado na 0060 pelo que lê o contrato da organização.
    expect(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='projeto_modulos_do_contrato'").first()).toBeTruthy();
    expect(await env.DB.prepare("SELECT modulos_contratados m FROM organizations WHERE id = 'org_ness'").first()).toEqual({ m: '["iso"]' });
  });

  it('projeto criado por SQL direto nasce com o módulo iso', async () => {
    await projeto('p47-novo');
    expect(await modulos('p47-novo')).toEqual([{ modulo: 'iso', habilitado_por: 'sistema' }]);
  });

  it('recusa módulo, tipo, papel e alvo fora da lista, e duplicata de vínculo e de departamento', async () => {
    await projeto('p47-chk');
    expect(await tenta(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p47-chk', 'xpto')`)).toMatch(/CHECK/i);
    expect(await tenta(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('x1', 'p47-chk', 'robo', 'N')`)).toMatch(/CHECK/i);
    await env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa47', 'p47-chk', 'Ana')`).run();
    const v = (id: string, papel: string, alvo: string) => tenta(
      `INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, 'p47-chk', 'pa47', ?, ?, 'p47-chk')`, id, papel, alvo);
    expect(await v('v0', 'rei', 'projeto')).toMatch(/CHECK/i);
    expect(await v('v1', 'encarregado', 'galaxia')).toMatch(/CHECK/i);
    expect(await v('v2', 'encarregado', 'projeto')).toBe('aceitou');
    expect(await v('v3', 'encarregado', 'projeto')).toMatch(/UNIQUE/i);
    await env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d1', 'p47-chk', 'TI')`).run();
    expect(await tenta(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d2', 'p47-chk', 'TI')`)).toMatch(/UNIQUE/i);
  });

  it('apagar o projeto leva módulos, partes, vínculos e departamentos', async () => {
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p47-chk'`).run();
    for (const t of ['projeto_modulos', 'partes', 'parte_vinculos', 'departamentos']) {
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE project_id = 'p47-chk'`).first(), t).toEqual({ n: 0 });
    }
  });

  it('aplicada sobre o banco ANTERIOR, a migration dá iso aos projetos que já existiam', async () => {
    await applySchema();
    await execSql(`DROP TRIGGER IF EXISTS projeto_modulo_iso_padrao; DROP TRIGGER IF EXISTS projeto_modulos_do_contrato;
      DROP TABLE IF EXISTS parte_vinculos; DROP TABLE IF EXISTS partes; DROP TABLE IF EXISTS departamentos; DROP TABLE IF EXISTS projeto_modulos;
      ALTER TABLE organizations DROP COLUMN modulos_contratados;`);
    expect(await colunas('partes')).toEqual([]);
    await projeto('p47-antigo');
    await execSql(migration0047);
    expect(await modulos('p47-antigo')).toEqual([{ modulo: 'iso', habilitado_por: 'migration-0047' }]);
    expect(await colunas('organizations')).toContain('modulos_contratados');
    expect(await colunas('partes')).toContain('nome');
  }, 30_000);
});
