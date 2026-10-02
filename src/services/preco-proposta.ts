// Cálculo de preço da proposta (spec §4.2 e §4.3). Módulo puro, sem banco.
import type { ConfigPreco } from './organizacao';
import type { Servico } from '../schemas/domain';

export type Faixa = '1' | '2' | '3';
export interface AjusteItem { dias?: number; meses?: number; descontoPct?: number }
export interface ItemCalculado {
  valorBase: number; descontoPct: number; valor: number;
  /** Dias já multiplicados pelo fator de porte (base do custo na margem). Nulo em fixo e recorrente. */
  dias: number | null; meses: number | null;
  natureza: 'projeto' | 'mensal';
  memoria: string;
}

const NOME_FAIXA: Record<Faixa, string> = { '1': 'Foundation', '2': 'Standard', '3': 'Enterprise' };

// Intl devolve NBSP depois de "R$"; normaliza para espaço comum.
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/\u00a0/g, ' ');
const num = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);

export function fatorDePorte(porte: ConfigPreco['porte'], pessoas: number | null): { fator: number; rotulo: string } {
  if (pessoas == null) return { fator: porte[0].fator, rotulo: 'porte não informado' };
  const f = porte.find((p) => p.maxPessoas === null || pessoas <= p.maxPessoas) ?? porte[porte.length - 1];
  return { fator: f.fator, rotulo: `${pessoas} pessoas` };
}

export function calcularItem(s: Servico, a: AjusteItem, preco: ConfigPreco, faixa: Faixa, pessoas: number | null): ItemCalculado {
  const descontoPct = a.descontoPct ?? 0;
  if (!(descontoPct >= 0 && descontoPct <= 100)) throw new Error('Desconto deve estar entre 0% e 100%');

  let valorBase: number, dias: number | null = null, meses: number | null = null;
  let natureza: ItemCalculado['natureza'] = 'projeto';
  let calculo: string;
  if (s.tipo === 'recorrente') {
    meses = a.meses ?? s.prazoMinimoMeses;
    if (meses < s.prazoMinimoMeses) throw new Error(`O prazo mínimo de "${s.nome}" é ${s.prazoMinimoMeses} meses`);
    valorBase = s.mensalidade * meses;
    natureza = 'mensal';
    calculo = `${meses} meses × ${brl(s.mensalidade)} = ${brl(valorBase)}`;
  } else if (s.tipo === 'avulso' && s.formaPreco === 'fixo') {
    valorBase = s.valorFixo;
    calculo = `valor fixo ${brl(valorBase)}`;
  } else {
    const base = a.dias ?? s.diasPorFaixa[faixa];
    const { fator, rotulo } = fatorDePorte(preco.porte, pessoas);
    dias = base * fator;
    valorBase = dias * preco.diaria[faixa];
    calculo = `${num(base)} dias × ${num(fator)} (${rotulo}) = ${num(dias)} dias × ${brl(preco.diaria[faixa])} = ${brl(valorBase)}`;
  }

  // Centavos primeiro: ruído de ponto flutuante não pode empurrar um valor exato para o milhar seguinte.
  const liquido = Math.round(valorBase * (1 - descontoPct / 100) * 100) / 100;
  const valor = Math.ceil(liquido / 1000) * 1000;
  const desc = descontoPct > 0 ? ` → desconto ${num(descontoPct)}% → ${brl(valor)}` : valor !== valorBase ? ` → ${brl(valor)}` : '';
  const memoria = `${s.nome}, ${NOME_FAIXA[faixa]}: ${calculo}${desc}`;
  return { valorBase, descontoPct, valor, dias, meses, natureza, memoria };
}

export function totais(itens: ItemCalculado[]) {
  const soma = (n: ItemCalculado['natureza']) => itens.filter((i) => i.natureza === n).reduce((t, i) => t + i.valor, 0);
  // Recorrente: o valor do item é mensalidade × meses; a mensalidade é esse valor por mês.
  const mensalidade = itens.filter((i) => i.natureza === 'mensal').reduce((t, i) => t + i.valor / (i.meses ?? 1), 0);
  return { totalProjeto: soma('projeto'), mensalidade };
}

export function descontoAcimaDoTeto(itens: ItemCalculado[], teto: number): boolean {
  return itens.some((i) => i.descontoPct > teto);
}

export function margem(itens: ItemCalculado[], preco: ConfigPreco, faixa: Faixa) {
  const custoTotal = itens.reduce((t, i) => t + (i.dias ?? 0) * preco.custoInterno[faixa] * (1 + preco.overheadPct), 0);
  const bruta = itens.filter((i) => i.natureza === 'projeto').reduce((t, i) => t + i.valor, 0);
  const receitaLiquida = bruta * (1 - preco.tributosPct);
  // Mesma definição de pricing.ts: margem operacional sobre o preço bruto.
  const margemPct = bruta > 0 ? (receitaLiquida - custoTotal) / bruta : 0;
  return { custoTotal, receitaLiquida, margemPct, viavel: margemPct >= preco.margemAlvo };
}
