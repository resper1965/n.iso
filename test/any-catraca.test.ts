import { describe, it, expect } from 'vitest';

/**
 * Catraca do `any` em `src/` (plano de fechamento, T1 / decisão D4).
 *
 * A dívida só pode descer: o teste reprova nos DOIS sentidos. Subiu, falha.
 * Desceu, também falha — para obrigar quem tipou a baixar o TETO no mesmo PR,
 * senão o ganho vira folga e o número volta a subir sem ninguém ver.
 *
 * Método (o mesmo do AGENTS.md, para o número ser reproduzível):
 *   git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l
 * `?raw` inlina o fonte em tempo de build, então roda no pool workerd sem node:fs.
 */
const FONTES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const PADRAO = /: any\b|as any\b|<any>/g;

// Medido em 2026-10-06. Só pode DIMINUIR.
const TETO = 544;

const porArquivo = Object.entries(FONTES)
  .filter(([arq]) => !arq.endsWith('.test.ts'))
  .map(([arq, txt]) => [arq, (txt.match(PADRAO) ?? []).length] as const);
const total = porArquivo.reduce((s, [, n]) => s + n, 0);

describe('catraca de any em src/', () => {
  it('o leitor enxerga o código (sem isso a contagem passaria zerada)', () => {
    expect(porArquivo.length).toBeGreaterThan(30);
  });

  it('a contagem não sobe acima do teto', () => {
    const piores = [...porArquivo].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, n]) => `${a} (${n})`).join(', ');
    expect(
      total,
      `Há ${total} ocorrências de any em src/, acima do teto de ${TETO}. O número só pode descer: ` +
        `tipe o que você tocou em vez de acrescentar any. Mais any hoje: ${piores}.`,
    ).toBeLessThanOrEqual(TETO);
  });

  it('o teto acompanha a contagem quando ela desce', () => {
    expect(
      total,
      `Há ${total} ocorrências de any em src/, abaixo do teto de ${TETO}. Bom: baixe TETO para ${total} ` +
        `em test/any-catraca.test.ts, no mesmo PR, para a catraca apertar.`,
    ).toBeGreaterThanOrEqual(TETO);
  });
});
