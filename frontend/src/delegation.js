// Delegação de eventos — infra do S2 (CSP nonce/endurecimento).
//
// Objetivo final: remover `'unsafe-inline'` de `script-src` no CSP, o que exige
// eliminar TODO handler inline (`onclick=`, `onchange=`…) — nonce de CSP não
// autoriza handler inline, só `<script>`. Enquanto o `unsafe-inline` continuar no
// CSP, os handlers antigos e a delegação coexistem sem quebra; o CSP só aperta no
// último lote, quando não sobrar nenhum handler inline.
//
// Um ÚNICO listener por tipo de evento no `document` (fase de CAPTURA) cobre também
// o conteúdo renderizado depois (as views escrevem HTML via innerHTML). Convenção:
//   data-action="fnName"           → clique: chama window.fnName()
//   data-action-change="fnName"    → change   (idem para input/submit/keydown/blur)
//   data-action-input / -submit / -keydown / -blur
//   data-args='["a","b"]'          → window.fnName("a","b")  (JSON: array de args)
//   data-arg-el                    → adiciona o próprio elemento como arg
//   data-arg-val                   → adiciona `el.value` como arg (substitui `this.value`)
//   data-arg-event                 → adiciona o próprio evento como PRIMEIRO arg
//   data-key="Enter"               → só dispara se `event.key` bater (p/ keydown)
//   data-stop                      → event.stopPropagation() antes de chamar
//   data-prevent                   → event.preventDefault() (substitui `return false`)
// Ordem final dos args: [event?, ...data-args, el.value?, elemento?].
// A função é resolvida em `window` (as views expõem as ações lá, como os on* faziam).
// Ação desconhecida ou data-args inválido: loga e ignora (não quebra).

function resolverArgs(el, e) {
  const raw = el.getAttribute('data-args');
  let args = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      args = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      console.warn('[delegation] data-args inválido, ignorando:', raw);
      return null;
    }
  }
  // `event` vem antes (os handlers de submit usam `fn(event, ...)`); `el.value` e o
  // próprio elemento vêm depois (os handlers usam `fn(..., this.value)`/`fn(..., this)`).
  if (el.hasAttribute('data-arg-event')) args = [e, ...args];
  if (el.hasAttribute('data-arg-val')) args.push(el.value);
  if (el.hasAttribute('data-arg-el')) args.push(el);
  return args;
}

function makeDispatcher(attr) {
  return function dispatch(e) {
    const el = e.target.closest(`[${attr}]`);
    if (!el) return;
    // Filtro de tecla (keydown): só age na tecla declarada.
    const key = el.getAttribute('data-key');
    if (key && e.key !== key) return;
    if (el.hasAttribute('data-stop')) e.stopPropagation();
    if (el.hasAttribute('data-prevent')) e.preventDefault();
    const fnName = el.getAttribute(attr);
    const fn = window[fnName];
    if (typeof fn !== 'function') {
      console.warn('[delegation] ação desconhecida:', fnName);
      return;
    }
    const args = resolverArgs(el, e);
    if (args === null) return;
    fn.apply(el, args);
  };
}

// (evento DOM, atributo). Tudo em CAPTURA — inclusive `blur`, que não borbulha mas
// propaga na descida da captura, então um único listener no document o alcança.
const MAPA_EVENTOS = [
  ['click', 'data-action'],
  ['change', 'data-action-change'],
  ['input', 'data-action-input'],
  ['submit', 'data-action-submit'],
  ['keydown', 'data-action-keydown'],
  ['blur', 'data-action-blur'],
];

let ligado = false;
/**
 * Liga a delegação no document. Idempotente: chamadas repetidas não acumulam listeners.
 *
 * Fase de CAPTURA (3º arg = true), não bubbling: vários containers de modal/drawer
 * têm `data-action="__noop"`/stopPropagation para não fechar ao clicar dentro. No
 * bubbling, um stopPropagation intermediário IMPEDE o evento de chegar ao document e
 * a delegação não veria o alvo. A captura roda de cima para baixo ANTES do bubbling,
 * então o stopPropagation do bubble não a afeta.
 */
export function initDelegation() {
  if (ligado) return;
  ligado = true;
  for (const [evento, attr] of MAPA_EVENTOS) {
    document.addEventListener(evento, makeDispatcher(attr), true);
  }
}
