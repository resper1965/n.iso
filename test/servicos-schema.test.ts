import { describe, it, expect } from 'vitest';
import { servicoSchema } from '../src/schemas';

const fase = (nome: string, pct: number) => ({ nome, pct, semanas: 2 });
const dias = { '1': 1, '2': 2, '3': 3 };
const msgs = (r: any) => r.error.issues.map((i: any) => i.message).join(' | ');

describe('servicoSchema', () => {
  it('aceita projeto com 2 fases somando 100', () => {
    const r = servicoSchema.safeParse({ nome: 'ISO 27001', tipo: 'projeto', diasPorFaixa: dias, fases: [fase('A', 40), fase('B', 60)] });
    expect(r.success).toBe(true);
  });
  it('recusa projeto sem fases', () => {
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'projeto', diasPorFaixa: dias, fases: [] }).success).toBe(false);
  });
  it('recusa projeto com fases somando 90', () => {
    const r = servicoSchema.safeParse({ nome: 'x', tipo: 'projeto', diasPorFaixa: dias, fases: [fase('A', 40), fase('B', 50)] });
    expect(r.success).toBe(false);
    expect(msgs(r)).toContain('precisa ser 100');
  });
  it('recusa recorrente sem mensalidade', () => {
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'recorrente', prazoMinimoMeses: 12, inclusoMes: ['a'] }).success).toBe(false);
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'recorrente', mensalidade: 100, prazoMinimoMeses: 12, inclusoMes: ['a'] }).success).toBe(true);
  });
  it('recusa avulso fixo sem valorFixo e avulso esforco sem diasPorFaixa', () => {
    const comum = { nome: 'x', tipo: 'avulso', entregaveis: ['e'], criterioAceite: 'ok' };
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'fixo' }).success).toBe(false);
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'esforco' }).success).toBe(false);
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'fixo', valorFixo: 500 }).success).toBe(true);
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'esforco', diasPorFaixa: dias }).success).toBe(true);
  });
  it('recusa tipo desconhecido', () => {
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'pacote' }).success).toBe(false);
  });
  it('recusa campo estranho (projeto com valorFixo) e valor sem teto (mensalidade 1e9)', () => {
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'projeto', diasPorFaixa: dias, fases: [fase('A', 100)], valorFixo: 5 }).success).toBe(false);
    expect(servicoSchema.safeParse({ nome: 'x', tipo: 'recorrente', mensalidade: 1e9, prazoMinimoMeses: 12, inclusoMes: ['a'] }).success).toBe(false);
    const comum = { nome: 'x', tipo: 'avulso', entregaveis: ['e'], criterioAceite: 'ok' };
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'fixo', valorFixo: 1e9 }).success).toBe(false);
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'fixo', valorFixo: 500, ativo: true }).success).toBe(false);
    expect(servicoSchema.safeParse({ ...comum, formaPreco: 'esforco', diasPorFaixa: { ...dias, '3': 5000 } }).success).toBe(false);
  });
});
