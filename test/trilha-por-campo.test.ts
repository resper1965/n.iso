// Trilha por campo: `campo: antes → depois`, agrupamento de lote pelo
// operation_id, e o desfazer que NÃO apaga linha.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import {
  ACAO_DESFEITA,
  apenasMudancas,
  colapsaDesfeitas,
  valorParaTrilha,
  registrarAlteracoes,
  registrarDesfazer,
  lerTrilha,
} from '../src/trilha-campo';
import { applySchema, resetData } from './helpers/d1';

describe('regra: null de CMMI vira —, nunca a palavra "null"', () => {
  it('vazio, null e undefined viram o travessão', () => {
    expect(valorParaTrilha(null)).toBe('—');
    expect(valorParaTrilha(undefined)).toBe('—');
    expect(valorParaTrilha('')).toBe('—');
  });

  it('zero é um valor, não um vazio: CMMI 0 existe', () => {
    expect(valorParaTrilha(0)).toBe('0');
  });

  it('o resto vira texto', () => {
    expect(valorParaTrilha('Implementado')).toBe('Implementado');
    expect(valorParaTrilha(3)).toBe('3');
  });
});

describe('regra: só o campo que mudou entra na trilha', () => {
  it('campo com o mesmo valor não vira entrada', () => {
    const mudou = apenasMudancas([
      { campo: 'Status', antes: 'Missing', depois: 'Missing' },
      { campo: 'Maturidade CMMI', antes: 1, depois: 3 },
    ]);
    expect(mudou.map(m => m.campo)).toEqual(['Maturidade CMMI']);
  });

  it('null → vazio não é mudança: os dois renderizam o mesmo travessão', () => {
    expect(apenasMudancas([{ campo: 'Responsável', antes: null, depois: '' }])).toEqual([]);
  });

  it('preencher um campo vazio É mudança', () => {
    expect(apenasMudancas([{ campo: 'Responsável', antes: null, depois: 'Ana' }])).toHaveLength(1);
  });

  it('zero para null é mudança — CMMI 0 não é CMMI ausente', () => {
    expect(apenasMudancas([{ campo: 'Maturidade CMMI', antes: 0, depois: null }])).toHaveLength(1);
  });
});

describe('regra: desfazer esconde a operação da leitura, sem apagar linha', () => {
  const linhas = [
    { acao: 'control.updated', operacao: 'op-1', campo: 'Status' },
    { acao: 'control.updated', operacao: 'op-1', campo: 'Maturidade CMMI' },
    { acao: 'control.updated', operacao: 'op-2', campo: 'Status' },
  ];

  it('sem desfazer, tudo aparece', () => {
    expect(colapsaDesfeitas(linhas)).toHaveLength(3);
  });

  it('a operação desfeita some da leitura, e o registro do desfazer também', () => {
    const comDesfazer = [...linhas, { acao: ACAO_DESFEITA, operacao: 'op-1', campo: null }];
    const visiveis = colapsaDesfeitas(comDesfazer);
    // Um lote marcado e revertido dez segundos depois não é história: é ruído,
    // e ruído esconde as alterações que valem.
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].operacao).toBe('op-2');
  });

  it('desfazer uma operação não derruba as outras', () => {
    const comDesfazer = [...linhas, { acao: ACAO_DESFEITA, operacao: 'op-2', campo: null }];
    expect(colapsaDesfeitas(comDesfazer).map(l => l.operacao)).toEqual(['op-1', 'op-1']);
  });

  it('desfazer sem operação não esconde nada — não daria para saber o quê', () => {
    const solto = [...linhas, { acao: ACAO_DESFEITA, operacao: null, campo: null }];
    expect(colapsaDesfeitas(solto)).toHaveLength(3);
  });

  it('linha sem operação nunca é escondida', () => {
    const avulsa = [
      { acao: 'control.updated', operacao: null, campo: 'Status' },
      { acao: ACAO_DESFEITA, operacao: 'op-1', campo: null },
    ];
    expect(colapsaDesfeitas(avulsa)).toHaveLength(1);
  });
});

describe('ida e volta no banco: gravar, ler, desfazer', () => {
  beforeAll(async () => {
    await applySchema();
    await resetData();
  });

  it('grava uma linha por campo com o mesmo operation_id, e a leitura marca o lote', async () => {
    const op = await registrarAlteracoes(env.DB, {
      acao: 'control.updated', autor: 'c@x', entidade: 'compliance_controls', entidadeId: 'ctl-1',
      alteracoes: [
        { campo: 'Status', antes: 'Gap', depois: 'Implementado' },
        { campo: 'CMMI', antes: null, depois: 3 },
        { campo: 'Dono', antes: 'a', depois: 'a' }, // não mudou: não entra
      ],
    });
    expect(op).toBeTruthy();

    const trilha = await lerTrilha(env.DB, 'compliance_controls', 'ctl-1');
    expect(trilha).toHaveLength(2);
    expect(trilha.every(r => r.operacao === op && r.itensNaOperacao === 2)).toBe(true);
    expect(trilha.map(r => `${r.campo}: ${r.antes} → ${r.depois}`).sort()).toEqual([
      'CMMI: — → 3',
      'Status: Gap → Implementado',
    ]);
  });

  it('sem mudança não há operação', async () => {
    const op = await registrarAlteracoes(env.DB, {
      acao: 'control.updated', autor: 'c@x', entidade: 'compliance_controls', entidadeId: 'ctl-2',
      alteracoes: [{ campo: 'Status', antes: 'Gap', depois: 'Gap' }],
    });
    expect(op).toBeNull();
    expect(await lerTrilha(env.DB, 'compliance_controls', 'ctl-2')).toEqual([]);
  });

  it('desfazer some da leitura mas as linhas continuam no banco', async () => {
    const op = (await registrarAlteracoes(env.DB, {
      acao: 'control.updated', autor: 'c@x', entidade: 'compliance_controls', entidadeId: 'ctl-3',
      alteracoes: [{ campo: 'Status', antes: 'Gap', depois: 'Implementado' }],
    })) as string;
    await registrarDesfazer(env.DB, { autor: 'c@x', operacao: op, entidade: 'compliance_controls', entidadeId: 'ctl-3' });

    expect(await lerTrilha(env.DB, 'compliance_controls', 'ctl-3')).toEqual([]);
    const cru = await env.DB.prepare(
      `SELECT action FROM audit_logs WHERE entity_id = 'ctl-3' ORDER BY action`
    ).all<{ action: string }>();
    expect(cru.results.map(r => r.action)).toEqual(['control.updated', ACAO_DESFEITA]);
  });
});
