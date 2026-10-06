import { describe, it, expect } from 'vitest';

/**
 * Nenhum dado de cliente nem nome de pessoa real no repositório (arrumação final, Tarefa 9).
 *
 * O repositório é público. Já saíram daqui entregáveis de cliente (`deliveries/`), seeds com
 * e-mails reais (`seed_*.sql`, `migrations/0011`) e nomes reais em placeholder de formulário.
 * Este teste reprova a volta de qualquer um deles.
 *
 * Os termos são montados por pedaços de propósito: assim este arquivo não contém o termo que
 * proíbe e sobrevive a uma reescrita de histórico por substituição de texto.
 *
 * Exceções, que são identificadores e não dado:
 * - a coluna `evidence.<cliente>_ref` (schema.sql): existe em produção; renomear exige migration
 *   e não expõe nada;
 * - o nome do arquivo da migration 0011, citado onde se registra o que já foi aplicado
 *   (`d1_migrations` guarda o nome, então o arquivo não pode ser renomeado).
 *
 * `?raw` inlina o texto em tempo de build, então roda no pool workerd sem node:fs (mesmo
 * padrão de test/any-catraca.test.ts).
 */
const ARQUIVOS = import.meta.glob(
  [
    '../**/*.{ts,js,mjs,mts,md,sql,html,json,jsonc,txt,yml,yaml,css}',
    '../.github/**/*',
    '!../**/node_modules/**',
    '!../frontend/dist/**',
    '!../coverage/**',
    '!../.claude/**',
    '!../.agents/**',
    '!../test/sem-dado-de-cliente.test.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const c = (...partes: string[]) => partes.join('');
const CLIENTE = c('tw', 'yn');

// Cliente e pessoas reais que já estiveram no repositório. Minúsculo: a busca ignora caixa.
const PROIBIDOS = [
  CLIENTE,
  c('t4', 'isb'),
  c('ka', 'cio'),
  c('degas', 'peri'),
  c('elou', 'aer'),
  c('ferro', 'anato'),
  c('ajz', 'en'),
  c('yosh', 'ida'),
  c('rosa cor', 'reia'),
  c('bianca lo', 'pes'),
  c('humberto oli', 'veira'),
  c('resper', '@'), // e-mail pessoal do dono, que estava em fixture de teste e em plano
];

const PERMITIDOS = [new RegExp(c('\\b', CLIENTE, '_ref\\b'), 'gi'), new RegExp(c('0011_seed_', CLIENTE, '_governance'), 'gi')];

describe('sem dado de cliente nem nome de pessoa real no repositório', () => {
  it('o leitor enxerga o repositório (sem isso o teste passaria vazio)', () => {
    const nomes = Object.keys(ARQUIVOS);
    expect(nomes.length).toBeGreaterThan(300);
    expect(nomes.some((n) => n.endsWith('/schema.sql'))).toBe(true);
    expect(nomes.some((n) => n.includes('/.github/'))).toBe(true);
    expect(nomes.some((n) => n.includes('/frontend/src/views/'))).toBe(true);
  });

  it('nenhum arquivo cita cliente ou pessoa real', () => {
    const achados: string[] = [];
    for (const [arq, bruto] of Object.entries(ARQUIVOS)) {
      if (typeof bruto !== 'string') continue;
      const texto = PERMITIDOS.reduce((t, re) => t.replace(re, ''), bruto).toLowerCase();
      for (const termo of PROIBIDOS) if (texto.includes(termo)) achados.push(`${arq}: ${termo}`);
    }
    expect(achados, 'troque por dado fictício (ex.: "Cliente Exemplo", maria@exemplo.com.br)').toEqual([]);
  });
});
