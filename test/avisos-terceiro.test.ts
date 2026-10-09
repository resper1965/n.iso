import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

/** Vencimento de avaliação de terceiro (fatia 6): fonte `avaliacao_terceiro` da rotina diária. HOJE é uma quarta, semana ISO 2026-W41. */
const HOJE = '2026-10-07';
const db = () => env.DB;

let seq = 0;
const aval = (parte: string, valido: string, resultado = 'aprovado', criado = `2026-09-01 10:00:0${seq++ % 10}`) =>
  db().prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, created_at) VALUES (?, 'p1', ?, 'questionario', ?, ?, ?)`)
    .bind(`av-${parte}-${crypto.randomUUID()}`, parte, resultado, valido, criado);
const daFonte = async () => (await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'avaliacao_terceiro');

beforeEach(async () => {
  await applySchema();
  await resetData();
  seq = 0;
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('t1', 'p1', 'organizacao', 'Nuvem Grande'), ('t2', 'p1', 'organizacao', 'Fornecedor Médio'), ('t3', 'p1', 'organizacao', 'Inativo SA')`),
    db().prepare(`UPDATE partes SET status = 'inativa' WHERE id = 't3'`),
  ]);
});

describe('fonte avaliacao_terceiro', () => {
  it('vence em 7 dias, hoje ou já venceu entra com o marco certo; longe não', async () => {
    await db().batch([aval('t1', '2026-10-14'), aval('t2', '2026-10-07')]);
    expect(Object.fromEntries((await daFonte()).map((i) => [i.titulo, i.marco]))).toEqual({
      'Avaliação do terceiro Nuvem Grande': 'D-7', 'Avaliação do terceiro Fornecedor Médio': 'D0',
    });
    await db().batch([aval('t2', '2026-10-01', 'aprovado', '2026-08-01 10:00:00')]); // anterior à vigente: não conta
    expect((await daFonte()).map((i) => i.marco).sort()).toEqual(['D-7', 'D0']);
  });

  it('só a avaliação MAIS RECENTE vale: renovar tira o item; a antiga vencida não avisa', async () => {
    await db().batch([aval('t1', '2026-10-01', 'aprovado', '2026-08-01 10:00:00')]);
    expect(await daFonte()).toHaveLength(1);
    await db().batch([aval('t1', '2027-06-30', 'aprovado', '2026-10-05 10:00:00')]);
    expect(await daFonte()).toHaveLength(0);
  });

  it('reprovada não gera aviso de vencimento; terceiro inativo também não', async () => {
    await db().batch([aval('t1', HOJE, 'reprovado'), aval('t3', HOJE)]);
    expect(await daFonte()).toEqual([]);
  });

  it('o título diz quantos tratamentos usam o terceiro (singular e plural), sem aviso de uso quando não há', async () => {
    await db().batch([
      aval('t1', HOJE), aval('t2', HOJE),
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r1', 'p1', 'A'), ('r2', 'p1', 'B')`),
      db().prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'p1', 't1', 'operador', 'tratamento', 'r1'), ('v2', 'p1', 't1', 'terceiro', 'tratamento', 'r2'), ('v3', 'p1', 't2', 'operador', 'tratamento', 'r1')`),
    ]);
    const t = Object.fromEntries((await daFonte()).map((i) => [i.item_id.split('-')[1], i.titulo]));
    expect(t.t1).toBe('Avaliação do terceiro Nuvem Grande (2 tratamentos)');
    expect(t.t2).toBe('Avaliação do terceiro Fornecedor Médio (1 tratamento)');
  });

  it('sem responsável (a parte não tem dono): o aviso vai aos consultores', async () => {
    await aval('t1', HOJE).run();
    expect((await daFonte())[0]).toMatchObject({ project_id: 'p1', responsavel: null, vence_em: HOJE });
  });

  it('o título do sino', () => {
    const item = { fonte: 'avaliacao_terceiro' as const, titulo: 'Avaliação do terceiro Nuvem Grande' };
    expect(tituloDoAviso({ ...item, marco: 'D-7' })).toBe('Avaliação do terceiro Nuvem Grande vence em 7 dias');
    expect(tituloDoAviso({ ...item, marco: 'D0' })).toBe('Avaliação do terceiro Nuvem Grande vence hoje');
    expect(tituloDoAviso({ ...item, marco: 'atraso-2026-W41' })).toBe('Avaliação do terceiro Nuvem Grande com prazo vencido');
  });
});
