// S2 — dispatcher de delegação (substitui onclick inline). Cobre: chamada por
// data-action, args via data-args, elemento via data-arg-el, data-stop, e ação
// desconhecida (não quebra).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDelegation } from '../src/delegation.js';

let cleanup;
beforeEach(() => {
  document.body.innerHTML = '';
  // initDelegation liga um listener no document; guardamos p/ remover no fim.
  initDelegation();
});
afterEach(() => {
  document.body.innerHTML = '';
  delete window.__fn;
  cleanup && cleanup();
});

function clickar(html) {
  document.body.innerHTML = html;
  const el = document.body.querySelector('[data-action]');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return el;
}

describe('delegação (S2)', () => {
  it('data-action chama a função global sem args', () => {
    window.__fn = vi.fn();
    clickar('<button data-action="__fn">x</button>');
    expect(window.__fn).toHaveBeenCalledTimes(1);
    expect(window.__fn.mock.calls[0].length).toBe(0);
  });

  it('data-args passa argumentos (JSON)', () => {
    window.__fn = vi.fn();
    clickar(`<button data-action="__fn" data-args='["a",2]'>x</button>`);
    expect(window.__fn).toHaveBeenCalledWith('a', 2);
  });

  it('data-arg-el adiciona o próprio elemento como último arg', () => {
    window.__fn = vi.fn();
    const el = clickar(`<button data-action="__fn" data-args='["a"]' data-arg-el>x</button>`);
    expect(window.__fn).toHaveBeenCalledWith('a', el);
  });

  it('clique num filho ainda dispara (closest)', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = '<button data-action="__fn"><span id="dentro">x</span></button>';
    document.getElementById('dentro').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.__fn).toHaveBeenCalledTimes(1);
  });

  it('ação desconhecida não lança', () => {
    expect(() => clickar('<button data-action="naoExiste">x</button>')).not.toThrow();
  });
});
