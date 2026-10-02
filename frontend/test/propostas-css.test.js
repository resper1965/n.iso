// Guarda de CSS da tela de propostas (prp-*). O jsdom não faz cascata: classe sem regra passa nos
// testes de comportamento e a tela sai crua.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const view = lido(import.meta.glob('../src/views/propostas.js', { query: '?raw', import: 'default', eager: true }));

describe('CSS da tela prp-*', () => {
  it('toda classe prp-* usada na view tem regra em style.css', () => {
    // O que está em atributo class (ids como prp-lead e nomes de ação não entram) e as classes de
    // status do mapa STATUS, que entram na pílula por interpolação.
    const usadas = new Set([
      ...[...view.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].match(/\bprp-[a-z0-9-]+(?![$a-z0-9-])/g) || []),
      ...(view.match(/'prp-st-[a-z]+'/g) || []).map((s) => s.slice(1, -1)),
    ]);
    expect(usadas.size).toBeGreaterThan(20);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });

  it('sem itálico e sem accent como fundo de área nas regras prp-*', () => {
    const regras = css.split('}').filter((r) => /\.prp-/.test(r));
    expect(regras.length).toBeGreaterThan(10);
    expect(regras.filter((r) => /font-style:\s*italic/.test(r))).toEqual([]);
    expect(regras.filter((r) => /background(-color)?:\s*var\(--accent\)/.test(r))).toEqual([]);
  });
});
