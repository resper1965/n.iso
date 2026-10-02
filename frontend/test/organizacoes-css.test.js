// Guarda de CSS da tela de organizações e do seletor/faixa do cabeçalho (org-*). O jsdom não faz
// cascata: classe sem regra passa nos testes de comportamento e a tela sai crua.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const fontes = {
  organizacoes: lido(import.meta.glob('../src/views/organizacoes.js', { query: '?raw', import: 'default', eager: true })),
  admin: lido(import.meta.glob('../src/views/admin.js', { query: '?raw', import: 'default', eager: true })),
  login: lido(import.meta.glob('../login.html', { query: '?raw', import: 'default', eager: true })),
};

describe('CSS das classes org-*', () => {
  it('toda classe org-* usada (tela, modal de usuários, cabeçalho) tem regra em style.css', () => {
    const usadas = new Set(Object.values(fontes).flatMap((src) =>
      [...src.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].match(/\borg-[a-z0-9-]+/g) || [])));
    expect(usadas.size).toBeGreaterThan(20);
    const sem = [...usadas].filter((cl) => !new RegExp('\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });

  it('o bloco org-* usa só tokens e nunca accent como fundo', () => {
    const bloco = css.slice(css.indexOf('Organizações (org-*'), css.indexOf('.org-faixa-texto strong'));
    expect(bloco.length).toBeGreaterThan(500);
    expect(bloco).not.toMatch(/background:\s*var\(--accent/);
    expect(bloco).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(bloco).not.toMatch(/font-style:\s*italic/);
  });
});
