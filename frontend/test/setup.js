// Setup comum a todos os arquivos de teste do frontend.
import { beforeEach } from 'vitest';

// `api()` usa `AbortSignal.timeout(30000)`, nativo no navegador e no Node 22.
// Em versoes de jsdom que ainda nao expoem o estatico, o import de api.js
// quebraria na primeira chamada — o polyfill mantem o teste medindo a logica
// do modulo, nao a idade do jsdom.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});
