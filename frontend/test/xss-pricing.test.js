// S7 — XSS armazenado no modal de precificação. pricing_notas é texto livre; sem
// escape, `</textarea><img onerror=...>` quebra o textarea e injeta um elemento
// executável quando o modal é aberto (openModal usa innerHTML). Garante o escape.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

beforeAll(async () => {
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
});

beforeEach(() => {
  // openModal (ui.js) escreve em #modal-content e liga #modal-overlay.
  document.body.innerHTML = `
    <div id="modal"><div id="modal-content"></div></div>
    <div id="modal-overlay"></div>`;
});

describe('openPricingOverrideModal — escape de XSS (S7)', () => {
  it('não injeta elemento executável a partir de pricing_notas', () => {
    S.assessments = [{ id: 'a1', pricing_override: 0, pricing_desconto: 0,
      pricing_notas: '</textarea><img src=x onerror="window.__xss=1">' }];
    window.__xss = 0;

    window.openPricingOverrideModal('a1');

    const content = document.getElementById('modal-content');
    // O payload não deve virar um <img> real dentro do modal.
    expect(content.querySelector('img')).toBeNull();
    // O textarea segue único e íntegro (não foi fechado pelo payload).
    expect(content.querySelectorAll('textarea').length).toBe(1);
    // E o texto malicioso aparece escapado, como conteúdo literal do textarea.
    expect(content.querySelector('textarea').value).toContain('<img');
    expect(window.__xss).toBe(0);
  });
});
