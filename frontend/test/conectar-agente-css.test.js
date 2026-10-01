// Guarda de CSS da tela "Conectar agente". O jsdom não faz cascata: sem este teste, uma classe sem
// regra passa e a tela sai crua (já aconteceu com o organograma: o #168 apagou 20 regras e o HTML
// continuou pedindo as classes). Arquivo separado do teste de comportamento porque este importa
// módulos do Node (como governanca-css.test.js), que só rodam no CI neste repositório.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Conectar agente — CSS', () => {
  it('toda classe ca-* usada na view tem regra em style.css', () => {
    const view = readFileSync(resolve(process.cwd(), 'src/views/conectar-agente.js'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
    const usadas = new Set([...view.matchAll(/\bca-[a-z0-9-]+/g)].map((m) => m[0]));
    expect(usadas.size).toBeGreaterThan(10);
    // `\b` no fim: ".ca-abas" não pode contar como regra de ".ca-aba".
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '\\b').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });
});
