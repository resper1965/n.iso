// Guarda de CSS da tela "Conectar agente". O jsdom não faz cascata: sem este teste, uma classe sem
// regra passa e a tela sai crua (já aconteceu com o organograma: o #168 apagou 20 regras e o HTML
// continuou pedindo as classes). Arquivo separado do teste de comportamento porque este é estático (como governanca-css.test.js).
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo, funciona em qualquer SO).
const lido = (glob) => Object.values(glob)[0];
const view = lido(import.meta.glob('../src/views/conectar-agente.js', { query: '?raw', import: 'default', eager: true }));
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));

describe('Conectar agente — CSS', () => {
  it('toda classe ca-* usada na view tem regra em style.css', () => {
    const usadas = new Set([...view.matchAll(/\bca-[a-z0-9-]+/g)].map((m) => m[0]));
    expect(usadas.size).toBeGreaterThan(10);
    // `\b` no fim: ".ca-abas" não pode contar como regra de ".ca-aba".
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '\\b').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });
});
