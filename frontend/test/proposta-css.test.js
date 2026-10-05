// Guarda de CSS da página do cliente (public/proposta.css). O jsdom não faz cascata: classe sem
// regra passa nos testes de comportamento e a página sai crua. E os tokens são cópia dos do app:
// se o :root de style.css mudar, a cópia tem de acompanhar.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../public/proposta.css', { query: '?raw', import: 'default', eager: true }));
const app = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const html = lido(import.meta.glob('../public/proposta.html', { query: '?raw', import: 'default', eager: true }));
const js = lido(import.meta.glob('../public/proposta.js', { query: '?raw', import: 'default', eager: true }));

const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = (bruto, texto = semComentario(bruto)) => Object.fromEntries([...texto.slice(texto.indexOf(':root'), texto.indexOf('}', texto.indexOf(':root'))).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

describe('proposta.css', () => {
  it('toda classe pp-* do HTML e do script tem regra', () => {
    const usadas = new Set([
      ...[...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)),
      ...(js.match(/'pp-[a-z0-9-]+'/g) || []).map((s) => s.slice(1, -1)).filter((c) => /^pp-opcao-/.test(c)),
    ].filter((c) => c.startsWith('pp-')));
    expect(usadas.size).toBeGreaterThan(20);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });

  it('os tokens são os do :root de style.css', () => {
    const daqui = tokens(css);
    const dele = tokens(app);
    expect(Object.keys(daqui).length).toBeGreaterThan(10);
    const diferentes = Object.entries(daqui).filter(([k, v]) => dele[k] !== v);
    expect(diferentes).toEqual([]);
  });

  it('sem itálico, sem accent como fundo de área, com a nota de responsividade', () => {
    expect(css).not.toMatch(/font-style:\s*italic/);
    // o accent preenche só o botão primário
    const comFundoAccent = css.split('}').filter((r) => /background(-color)?:\s*var\(--accent\)/.test(r)).map((r) => r.trim().split('{')[0].trim());
    expect(comFundoAccent).toEqual(['.pp-btn-primario']);
    expect(css).toMatch(/@media \(max-width: 600px\)/);
    expect(css).toMatch(/[Rr]esponsividade/);
  });
});
