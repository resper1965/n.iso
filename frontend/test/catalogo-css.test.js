// Guarda de CSS das telas de catálogo (cat-*) e de configuração comercial (cfg-*). O jsdom não
// faz cascata: classe sem regra passa nos testes de comportamento e a tela sai crua.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const catalogo = lido(import.meta.glob('../src/views/catalogo.js', { query: '?raw', import: 'default', eager: true }));
const config = lido(import.meta.glob('../src/views/config-comercial.js', { query: '?raw', import: 'default', eager: true }));

describe.each([['cat', catalogo], ['cfg', config]])('CSS das telas %s-*', (prefixo, view) => {
  it(`toda classe ${prefixo}-* usada na view tem regra em style.css`, () => {
    // Só o que está em atributo class: ids (cat-nome) e nomes de ação não entram.
    const usadas = new Set(
      [...view.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].match(new RegExp(`\\b${prefixo}-[a-z0-9-]+`, 'g')) || []),
    );
    expect(usadas.size).toBeGreaterThan(5);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });
});
