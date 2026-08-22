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

  it('data-arg-event adiciona o próprio evento como arg', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<button data-action="__fn" data-arg-event>x</button>`;
    const el = document.body.querySelector('[data-action]');
    const ev = new MouseEvent('click', { bubbles: true });
    el.dispatchEvent(ev);
    expect(window.__fn).toHaveBeenCalledTimes(1);
    expect(window.__fn.mock.calls[0][0]).toBe(ev);
  });

  it('data-prevent chama preventDefault (substitui `return false`)', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<a href="#" data-action="__fn" data-prevent>x</a>`;
    const el = document.body.querySelector('[data-action]');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(window.__fn).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
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

  it('data-args com JSON escapado (aspas) via innerHTML é parseado', () => {
    window.__fn = vi.fn();
    // Padrão usado nas views: escapeHTML(JSON.stringify(args)) num atributo "".
    const args = ['k', 'Opção "com aspas"'];
    const attr = JSON.stringify(args).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    document.body.innerHTML = `<button data-action="__fn" data-args="${attr}">x</button>`;
    document.body.querySelector('[data-action]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.__fn).toHaveBeenCalledWith('k', 'Opção "com aspas"');
  });

  it('data-action-change dispara no evento change', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<select data-action-change="__fn" data-arg-val><option value="v1">a</option></select>`;
    const el = document.body.querySelector('[data-action-change]');
    el.value = 'v1';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(window.__fn).toHaveBeenCalledWith('v1');
  });

  it('data-arg-val passa el.value; data-args vem antes', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<input data-action-input="__fn" data-args='["k"]' data-arg-val value="txt">`;
    const el = document.body.querySelector('[data-action-input]');
    el.value = 'txt';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(window.__fn).toHaveBeenCalledWith('k', 'txt');
  });

  it('data-arg-event injeta o evento como PRIMEIRO arg (submit)', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<form data-action-submit="__fn" data-arg-event data-args='["cid"]' data-prevent><button>ok</button></form>`;
    const el = document.body.querySelector('[data-action-submit]');
    const ev = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(window.__fn).toHaveBeenCalledTimes(1);
    expect(window.__fn.mock.calls[0][0]).toBe(ev);
    expect(window.__fn.mock.calls[0][1]).toBe('cid');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('data-key filtra a tecla (keydown Enter)', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<input data-action-keydown="__fn" data-key="Enter">`;
    const el = document.body.querySelector('[data-action-keydown]');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(window.__fn).not.toHaveBeenCalled();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.__fn).toHaveBeenCalledTimes(1);
  });

  it('data-action-blur dispara no blur (captura, não borbulha)', () => {
    window.__fn = vi.fn();
    document.body.innerHTML = `<input data-action-blur="__fn" data-arg-val value="z">`;
    const el = document.body.querySelector('[data-action-blur]');
    el.value = 'z';
    el.dispatchEvent(new FocusEvent('blur'));
    expect(window.__fn).toHaveBeenCalledWith('z');
  });

  it('dispara mesmo dentro de container que faz stopPropagation (fase de captura)', () => {
    // Reproduz o #modal de login.html: o wrapper para a propagação no bubbling.
    window.__fn = vi.fn();
    document.body.innerHTML = `
      <div id="modal" onclick="event.stopPropagation()">
        <button data-action="__fn">Criar</button>
      </div>`;
    document.getElementById('modal').addEventListener('click', (e) => e.stopPropagation());
    document.body.querySelector('[data-action]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.__fn).toHaveBeenCalledTimes(1);
  });
});
