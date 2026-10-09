import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0056 from '../migrations/0056_dpia_lia.sql?raw';

const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;
const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const dpia = (id: string, projeto: string, ropa: string | null) =>
  env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, ropa_id) VALUES (?, ?, 'DPIA', ?)`).bind(id, projeto, ropa);

describe('migration 0056 — DPIA ligada ao tratamento e LIA', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p56', 'C', 'ISO', 'controller', 'Active'), ('p56o', 'O', 'ISO', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r56', 'p56', 'Folha'), ('r56o', 'p56o', 'Do outro')`),
    ]);
  });

  it('o schema canônico tem a LIA e os três triggers', async () => {
    expect(await colunas('lia_assessments')).toEqual([
      'id', 'project_id', 'ropa_id', 'finalidade_legitima', 'necessidade', 'balanceamento', 'salvaguardas', 'conclusao', 'status',
      'concluida_em', 'concluida_por', 'criado_por', 'created_at', 'updated_at',
    ]);
    for (const t of ['dpia_ropa_do_projeto_ins', 'dpia_ropa_do_projeto_upd', 'dpia_ropa_apagada']) {
      expect(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(t).first(), t).toBeTruthy();
    }
  });

  it('o banco recusa ropa_id inexistente ou de outro projeto, no insert e no update direto; sem ropa_id passa', async () => {
    await dpia('d1', 'p56', 'r56').run();
    await dpia('d2', 'p56', null).run();
    await expect(dpia('d3', 'p56', 'nao-existe').run()).rejects.toThrow(/ropa_id inexistente ou de outro projeto/);
    await expect(dpia('d4', 'p56', 'r56o').run()).rejects.toThrow(/outro projeto/);
    await expect(env.DB.prepare(`UPDATE dpia_assessments SET ropa_id = 'r56o' WHERE id = 'd1'`).run()).rejects.toThrow(/outro projeto/);
    await expect(env.DB.prepare(`UPDATE dpia_assessments SET ropa_id = 'nao-existe' WHERE id = 'd2'`).run()).rejects.toThrow();
    expect(await env.DB.prepare(`SELECT ropa_id FROM dpia_assessments WHERE id = 'd1'`).first()).toEqual({ ropa_id: 'r56' });
    await env.DB.prepare(`UPDATE dpia_assessments SET ropa_id = NULL WHERE id = 'd1'`).run(); // desligar é livre
    await env.DB.prepare(`UPDATE dpia_assessments SET processing_name = 'Outro nome' WHERE id = 'd2'`).run(); // outras colunas não disparam
  });

  it('apagar o tratamento zera o ropa_id da DPIA e não apaga a DPIA nem a assinatura', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r56x', 'p56', 'Para apagar')`),
      dpia('d5', 'p56', 'r56x'),
      env.DB.prepare(`UPDATE dpia_assessments SET dpo_approved_by = 'Ana', status = 'Approved' WHERE id = 'd5'`),
    ]);
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'r56x'`).run();
    expect(await env.DB.prepare(`SELECT ropa_id, dpo_approved_by, status FROM dpia_assessments WHERE id = 'd5'`).first()).toEqual({ ropa_id: null, dpo_approved_by: 'Ana', status: 'Approved' });
  });

  it('LIA: uma por tratamento, conclusão e status só nos valores da lista, concluída exige conclusão, data e autor, e some com o tratamento', async () => {
    const lia = (id: string, ropa: string, extra: { status?: string; conclusao?: string | null; em?: string | null; por?: string | null } = {}) =>
      env.DB.prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id, status, conclusao, concluida_em, concluida_por) VALUES (?, 'p56', ?, ?, ?, ?, ?)`)
        .bind(id, ropa, extra.status ?? 'rascunho', extra.conclusao ?? null, extra.em ?? null, extra.por ?? null);
    await lia('l1', 'r56').run();
    await expect(lia('l2', 'r56').run()).rejects.toThrow(); // uma por tratamento
    await expect(lia('l3', 'nao-existe').run()).rejects.toThrow(); // FK
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r56b', 'p56', 'Outro')`).run();
    await expect(lia('l4', 'r56b', { status: 'pronta' }).run()).rejects.toThrow();
    await expect(lia('l5', 'r56b', { conclusao: 'talvez' }).run()).rejects.toThrow();
    await expect(lia('l6', 'r56b', { status: 'concluida' }).run()).rejects.toThrow();
    await expect(lia('l7', 'r56b', { status: 'concluida', conclusao: 'prevalece', em: '2026-10-01' }).run()).rejects.toThrow();
    await lia('l8', 'r56b', { status: 'concluida', conclusao: 'prevalece', em: '2026-10-01', por: 'Ana' }).run();
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'r56b'`).run();
    expect(await n(`SELECT count(*) AS n FROM lia_assessments WHERE id = 'l8'`)).toBe(0);
  });

  it('a migration, sobre uma tabela de DPIA no formato anterior, limpa só a referência morta e cria os triggers e a LIA; é repetível nos objetos', async () => {
    await execSql('DROP TRIGGER IF EXISTS dpia_ropa_do_projeto_ins; DROP TRIGGER IF EXISTS dpia_ropa_do_projeto_upd; DROP TRIGGER IF EXISTS dpia_ropa_apagada; DROP TABLE IF EXISTS lia_assessments;');
    // Referências do formato anterior: uma viva, uma morta, uma de OUTRO projeto (a migration só zera a morta).
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, ropa_id) VALUES ('m1', 'p56', 'viva', 'r56'), ('m2', 'p56', 'morta', 'sumiu'), ('m3', 'p56', 'alheia', 'r56o')`),
    ]);
    await execSql(migration0056);
    await execSql(migration0056); // repetir não quebra: UPDATE idempotente, objetos IF NOT EXISTS
    expect(await env.DB.prepare(`SELECT id, ropa_id FROM dpia_assessments WHERE id IN ('m1','m2','m3') ORDER BY id`).all().then((r) => r.results))
      .toEqual([{ id: 'm1', ropa_id: 'r56' }, { id: 'm2', ropa_id: null }, { id: 'm3', ropa_id: 'r56o' }]);
    await expect(dpia('m4', 'p56', 'r56o').run()).rejects.toThrow(/outro projeto/); // o trigger da MIGRATION vale
    expect(await colunas('lia_assessments')).toContain('conclusao');
    await applySchema();
  });
});
