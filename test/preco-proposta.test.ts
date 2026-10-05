import { describe, it, expect } from 'vitest';
import { precoPadrao } from '../src/services/organizacao';
import { calcularItem, fatorDePorte, totais, descontoAcimaDoTeto, margem } from '../src/services/preco-proposta';
import type { Servico } from '../src/schemas/domain';

const preco = { ...precoPadrao(), diaria: { '1': 2200, '2': 2900, '3': 3600 } };
const base = { id: 's', orgId: 'o', ativo: true, norma: '', descricao: '', premissas: [], exclusoes: [] };
const projeto = { ...base, nome: 'Implementação ISO 27001 + 27701', tipo: 'projeto', diasPorFaixa: { '1': 60, '2': 90, '3': 140 }, fases: [] } as unknown as Servico;
const fixo = { ...base, nome: 'Treinamento', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 8200, entregaveis: ['x'], criterioAceite: 'y' } as unknown as Servico;
const esforco = { ...base, nome: 'Auditoria', tipo: 'avulso', formaPreco: 'esforco', diasPorFaixa: { '1': 5, '2': 10, '3': 15 }, entregaveis: ['x'], criterioAceite: 'y' } as unknown as Servico;
const recorrente = { ...base, nome: 'Sustentação', tipo: 'recorrente', mensalidade: 4000, prazoMinimoMeses: 6, inclusoMes: ['x'] } as unknown as Servico;

describe('fatorDePorte', () => {
  it('escolhe a primeira faixa que comporta e a ilimitada no fim', () => {
    const p = [{ maxPessoas: 50, fator: 1 }, { maxPessoas: 200, fator: 1.3 }, { maxPessoas: null, fator: 1.8 }];
    expect(fatorDePorte(p, 120)).toEqual({ fator: 1.3, rotulo: '120 pessoas' });
    expect(fatorDePorte(p, 50).fator).toBe(1);
    expect(fatorDePorte(p, 9000).fator).toBe(1.8);
    expect(fatorDePorte(p, null)).toEqual({ fator: 1, rotulo: 'porte não informado' });
  });
});

describe('calcularItem', () => {
  const porte = { ...preco, porte: [{ maxPessoas: 50, fator: 1 }, { maxPessoas: 200, fator: 1.3 }, { maxPessoas: null, fator: 1.8 }] };
  it('projeto: memória do spec, com valor arredondado', () => {
    const r = calcularItem(projeto, { descontoPct: 10 }, porte, '2', 120);
    expect(r.valorBase).toBe(339300);
    expect(r.valor).toBe(306000);
    expect(r.natureza).toBe('projeto');
    expect(r.memoria).toBe('Implementação ISO 27001 + 27701, Standard: 90 dias × 1,3 (120 pessoas) = 117 dias × R$ 2.900 = R$ 339.300 → desconto 10% → R$ 306.000');
  });
  it('sem desconto a memória não tem o trecho', () => {
    const r = calcularItem(projeto, {}, porte, '2', 120);
    expect(r.memoria).not.toContain('desconto');
    expect(r.valor).toBe(340000);
    expect(r.memoria.endsWith("= R$ 339.300 → R$ 340.000")).toBe(true);
  });
  it('dias do ajuste vencem os da faixa', () => {
    expect(calcularItem(projeto, { dias: 10 }, porte, '2', 120).valorBase).toBe(10 * 1.3 * 2900);
  });
  it('avulso por esforço usa dias × diária × porte', () => {
    expect(calcularItem(esforco, {}, porte, '1', 10).valorBase).toBe(5 * 2200);
  });
  it('avulso fixo ignora porte', () => {
    const r = calcularItem(fixo, {}, porte, '3', 5000);
    expect(r.valorBase).toBe(8200);
    expect(r.valor).toBe(9000);
    expect(r.dias).toBeNull();
  });
  it('recorrente: mensalidade × meses, natureza mensal', () => {
    const r = calcularItem(recorrente, { meses: 12 }, porte, '2', null);
    expect(r).toMatchObject({ valorBase: 48000, valor: 48000, meses: 12, natureza: 'mensal' });
    expect(calcularItem(recorrente, {}, porte, '2', null).meses).toBe(6);
  });
  it('recorrente abaixo do prazo mínimo falha em português', () => {
    expect(() => calcularItem(recorrente, { meses: 3 }, porte, '2', null)).toThrow(/prazo mínimo/i);
  });
  it('desconto fora de 0..100 falha', () => {
    expect(() => calcularItem(fixo, { descontoPct: -1 }, porte, '1', null)).toThrow();
    expect(() => calcularItem(fixo, { descontoPct: 101 }, porte, '1', null)).toThrow();
  });
  it('arredonda para o milhar seguinte', () => {
    expect(calcularItem(fixo, { descontoPct: 10 }, porte, '1', null).valor).toBe(8000); // 7380 -> 8000
  });
});

describe('recorrente: sem arredondar ao milhar', () => {
  const rec = (m: number, nome = 'Manutenção do SGSI') => ({ ...recorrente, nome, mensalidade: m }) as Servico;
  it('mensalidade 3.333 x 12', () => {
    const r = calcularItem(rec(3333), { meses: 12 }, preco, '2', null);
    expect(r).toMatchObject({ mensalidade: 3333, valor: 39996, valorBase: 39996 });
    expect(totais([r]).mensalidade).toBe(3333);
  });
  it('desconto 10% arredonda a mensalidade em reais', () => {
    const r = calcularItem(rec(3333), { meses: 12, descontoPct: 10 }, preco, '2', null);
    expect(r.mensalidade).toBe(3000);
    expect(r.valor).toBe(36000);
    expect(totais([r]).mensalidade).toBe(3000);
  });
  it('memória', () => {
    expect(calcularItem(rec(4000), { meses: 12 }, preco, '2', null).memoria).toBe('Manutenção do SGSI: R$ 4.000/mês × 12 meses = R$ 48.000');
    expect(calcularItem(rec(4000), { meses: 12, descontoPct: 10 }, preco, '2', null).memoria).toBe('Manutenção do SGSI: R$ 4.000/mês → desconto 10% → R$ 3.600/mês × 12 meses = R$ 43.200');
  });
  it('mensalidade só existe em recorrente', () => {
    expect(calcularItem(fixo, {}, preco, '1', null).mensalidade).toBeNull();
  });
});

describe('totais, teto e margem', () => {
  const it1 = calcularItem(projeto, {}, preco, '2', null);
  const it2 = calcularItem(recorrente, { meses: 12 }, preco, '2', null);
  it('mensal nunca soma no total do projeto', () => {
    const t = totais([it1, it2]);
    expect(t.totalProjeto).toBe(it1.valor);
    expect(t.mensalidade).toBe(4000);
  });
  it('descontoAcimaDoTeto', () => {
    const d = calcularItem(projeto, { descontoPct: 20 }, preco, '2', null);
    expect(descontoAcimaDoTeto([d], 15)).toBe(true);
    expect(descontoAcimaDoTeto([d], 20)).toBe(false);
  });
  it('margem usa dias ajustados, overhead e tributos, só do projeto', () => {
    const m = margem([it1, it2], preco, '2');
    const custo = 90 * preco.custoInterno['2'] * (1 + preco.overheadPct);
    expect(m.custoTotal).toBeCloseTo(custo);
    expect(m.receitaLiquida).toBeCloseTo(it1.valor * (1 - preco.tributosPct));
    expect(m.margemPct).toBeCloseTo((m.receitaLiquida - custo) / it1.valor);
    expect(m.viavel).toBe(m.margemPct >= preco.margemAlvo);
  });
});
