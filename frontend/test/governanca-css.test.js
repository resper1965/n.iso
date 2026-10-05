// Toda classe org-* / gov-* que a tela de Governança usa tem regra no CSS.
//
// O #168 reescreveu o style.css e apagou as 20 regras do organograma; o HTML
// continuou pedindo as classes e a tela ficou crua por semanas sem nenhum teste
// perceber (jsdom não faz cascata, então teste de render não pega isso). Aqui a
// verificação é estática: lê a view e o CSS do disco e cruza os nomes.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (funciona em qualquer SO).
const lido = (glob) => Object.values(glob)[0];
const view = lido(import.meta.glob('../src/views/monitor.js', { query: '?raw', import: 'default', eager: true }));
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));

const classesDaView = [...new Set(
  [...view.matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((c) => /^(org|gov)-/.test(c))
)];

describe('CSS da tela de Governança', () => {
  it('encontrou as classes da view (senão o teste não mediria nada)', () => {
    expect(classesDaView).toEqual(expect.arrayContaining(['org-chart', 'org-anchor', 'org-badge', 'gov-section-card', 'gov-agentes']));
  });

  it('toda classe org-*/gov-* usada pela view tem regra no style.css', () => {
    const semRegra = classesDaView.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(semRegra, `classes sem CSS: ${semRegra.join(', ')}`).toEqual([]);
  });
});
