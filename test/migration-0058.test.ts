import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0058 from '../migrations/0058_titular_incidente_consentimento.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('migration 0058 — titular, incidente e consentimento', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p58', 'C', 'ISO', 'controller', 'Active'), ('p58o', 'O', 'ISO', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r58', 'p58', 'Cadastro')`),
    ]);
  });

  it('nasce SEM nenhum valor de prazo (o prazo legal é parâmetro cadastrado pelo dono)', async () => {
    expect(await n('SELECT count(*) AS n FROM parametros_legais')).toBe(0);
    expect(migration0058).not.toMatch(/INSERT INTO parametros_legais/);
    expect(await colunas('parametros_legais')).toEqual(['chave', 'valor', 'unidade', 'fonte', 'revisado_em', 'revisado_por', 'updated_at']);
  });

  it('parâmetro: valor positivo, unidade da lista, fonte e revisão obrigatórias', async () => {
    const par = (chave: string, valor: number, unidade: string, fonte: string | null = 'Fonte X', rev: string | null = '2026-10-01', por: string | null = 'Dra. Teste') =>
      env.DB.prepare(`INSERT INTO parametros_legais (chave, valor, unidade, fonte, revisado_em, revisado_por) VALUES (?, ?, ?, ?, ?, ?)`).bind(chave, valor, unidade, fonte, rev, por);
    await par('titular.resposta', 15, 'dias_corridos').run();
    await expect(par('titular.resposta', 15, 'dias_corridos').run()).rejects.toThrow(); // chave única
    await expect(par('a', 0, 'horas').run()).rejects.toThrow();
    await expect(par('b', -1, 'horas').run()).rejects.toThrow();
    await expect(par('c', 5, 'semanas').run()).rejects.toThrow();
    await expect(par('d', 5, 'horas', null).run()).rejects.toThrow();
    await expect(par('e', 5, 'horas', 'F', null).run()).rejects.toThrow();
    await expect(par('f', 5, 'horas', 'F', '2026-10-01', null).run()).rejects.toThrow();
  });

  const ped = (id: string, protocolo: string, extra: { projeto?: string; tipo?: string; status?: string; resp?: string | null } = {}) =>
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, status, respondido_em) VALUES (?, ?, ?, ?, '2026-10-01', ?, ?)`)
      .bind(id, extra.projeto ?? 'p58', protocolo, extra.tipo ?? 'acesso', extra.status ?? 'recebido', extra.resp ?? null);

  it('pedido: protocolo único POR projeto, tipo/status/canal da lista, resposta exige data', async () => {
    await ped('t1', 'PT-2026-0001').run();
    await expect(ped('t2', 'PT-2026-0001').run()).rejects.toThrow(); // repetido no mesmo projeto
    await ped('t3', 'PT-2026-0001', { projeto: 'p58o' }).run(); // outro projeto: vale
    await expect(ped('t4', 'PT-2026-0002', { tipo: 'pedir_desconto' }).run()).rejects.toThrow();
    await expect(ped('t5', 'PT-2026-0003', { status: 'sumiu' }).run()).rejects.toThrow();
    await expect(ped('t6', 'PT-2026-0004', { status: 'respondido' }).run()).rejects.toThrow(); // sem respondido_em
    await ped('t7', 'PT-2026-0005', { status: 'respondido', resp: '2026-10-05' }).run();
    await expect(env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, canal) VALUES ('t8', 'p58', 'PT-2026-0006', 'acesso', '2026-10-01', 'pombo')`).run()).rejects.toThrow();
  });

  const inc = (id: string, protocolo: string, extra: { status?: string; risco?: string | null; anpd?: string | null } = {}) =>
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status, risco_titular, comunicacao_anpd_em) VALUES (?, 'p58', ?, 'Incidente', '2026-10-01T10:00:00Z', ?, ?, ?)`)
      .bind(id, protocolo, extra.status ?? 'aberto', extra.risco ?? null, extra.anpd ?? null);

  it('incidente: ciência obrigatória; encerrar exige risco avaliado, e risco relevante exige a comunicação à ANPD (também por SQL direto)', async () => {
    await inc('i1', 'IN-2026-0001').run();
    await expect(env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo) VALUES ('i0', 'p58', 'IN-2026-0000', 'Sem ciência')`).run()).rejects.toThrow();
    await expect(inc('i2', 'IN-2026-0002', { status: 'encerrado' }).run()).rejects.toThrow(); // sem risco avaliado
    await expect(inc('i3', 'IN-2026-0003', { status: 'encerrado', risco: 'relevante' }).run()).rejects.toThrow(); // relevante sem ANPD
    await inc('i4', 'IN-2026-0004', { status: 'encerrado', risco: 'relevante', anpd: '2026-10-02T09:00:00Z' }).run();
    await inc('i5', 'IN-2026-0005', { status: 'encerrado', risco: 'sem_risco' }).run();
    await expect(inc('i6', 'IN-2026-0006', { risco: 'altissimo' }).run()).rejects.toThrow();
    await expect(inc('i7', 'IN-2026-0007', { status: 'sumido' }).run()).rejects.toThrow();
    await expect(inc('i8', 'IN-2026-0001').run()).rejects.toThrow(); // protocolo repetido
    await expect(env.DB.prepare(`UPDATE incidentes SET status = 'encerrado' WHERE id = 'i1'`).run()).rejects.toThrow();
  });

  it('consentimento: ligado a um tratamento que existe, e some com ele', async () => {
    const cons = (id: string, ropa: string) => env.DB.prepare(`INSERT INTO consentimentos (id, project_id, ropa_id, titular_ref, finalidade, versao_aviso, obtido_em) VALUES (?, 'p58', ?, 'ref-001', 'Marketing', 'Aviso v3', '2026-10-01')`).bind(id, ropa);
    await cons('c1', 'r58').run();
    await expect(cons('c2', 'nao-existe').run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO consentimentos (id, project_id, ropa_id, titular_ref, finalidade, obtido_em) VALUES ('c3', 'p58', 'r58', 'x', 'y', '2026-10-01')`).run()).rejects.toThrow(); // sem versão do aviso
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'r58'`).run();
    expect(await n(`SELECT count(*) AS n FROM consentimentos WHERE id = 'c1'`)).toBe(0);
  });

  it('apagar o projeto leva pedidos, incidentes e consentimentos', async () => {
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p58'`).run();
    for (const t of ['titular_pedidos', 'incidentes', 'consentimentos']) expect(await n(`SELECT count(*) AS n FROM ${t} WHERE project_id = 'p58'`), t).toBe(0);
    expect(await n(`SELECT count(*) AS n FROM titular_pedidos WHERE project_id = 'p58o'`)).toBe(1);
  });

  it('a migration, sobre nomes novos, cria as tabelas com os CHECKs DELA e é repetível', async () => {
    const sufixar = (sql: string) => sql
      .replace(/\b(parametros_legais|titular_pedidos|incidentes|consentimentos)\b/g, '$1_t')
      .replace(/\b(idx_titular_pedidos_projeto|idx_incidentes_projeto|idx_consentimentos_ropa|idx_consentimentos_projeto)\b/g, '$1_t');
    await execSql(sufixar(migration0058));
    await execSql(sufixar(migration0058));
    expect(await colunas('incidentes_t')).toEqual(await colunas('incidentes'));
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p58b', 'C', 'ISO', 'controller', 'Active')`).run();
    const i = (status: string, risco: string | null) => env.DB.prepare(`INSERT INTO incidentes_t (id, project_id, protocolo, titulo, ciencia_em, status, risco_titular) VALUES (lower(hex(randomblob(4))), 'p58b', lower(hex(randomblob(4))), 'x', '2026-10-01', ?, ?)`).bind(status, risco);
    await i('encerrado', 'sem_risco').run();
    await expect(i('encerrado', 'relevante').run()).rejects.toThrow(); // o CHECK da MIGRATION vale
    await expect(i('encerrado', null).run()).rejects.toThrow();
  });
});
