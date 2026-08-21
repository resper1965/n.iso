// Delegação de eventos — infra do S2 (CSP nonce/endurecimento).
//
// Objetivo final: remover `'unsafe-inline'` de `script-src` no CSP, o que exige
// eliminar TODO handler inline (`onclick=`, `onchange=`…) — nonce de CSP não
// autoriza handler inline, só `<script>`. Enquanto o `unsafe-inline` continuar no
// CSP, os handlers antigos e a delegação coexistem sem quebra; o CSP só aperta no
// último lote, quando não sobrar nenhum handler inline.
//
// Um ÚNICO listener no `document` cobre também o conteúdo renderizado depois (as
// views escrevem HTML via innerHTML). Convenção nos elementos:
//   data-action="fnName"           → chama window.fnName()
//   data-args='["a","b"]'          → window.fnName("a","b")  (JSON: array de args)
//   data-arg-el                    → adiciona o próprio elemento como último arg
//   data-stop                      → event.stopPropagation() antes de chamar
// A função é resolvida em `window` (as views expõem as ações lá, como os onclick
// faziam). Ação desconhecida ou data-args inválido: loga e ignora (não quebra).

function resolverArgs(el) {
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
  if (el.hasAttribute('data-arg-el')) args.push(el);
  return args;
}

function makeDispatcher(attr) {
  return function dispatch(e) {
    const el = e.target.closest(`[${attr}]`);
    if (!el) return;
    if (el.hasAttribute('data-stop')) e.stopPropagation();
    const fnName = el.getAttribute(attr);
    const fn = window[fnName];
    if (typeof fn !== 'function') {
      console.warn('[delegation] ação desconhecida:', fnName);
      return;
    }
    const args = resolverArgs(el);
    if (args === null) return;
    fn.apply(el, args);
  };
}

let ligado = false;
/** Liga a delegação no document. Idempotente: chamadas repetidas não acumulam listeners. */
export function initDelegation() {
  if (ligado) return;
  ligado = true;
  document.addEventListener('click', makeDispatcher('data-action'));
}
