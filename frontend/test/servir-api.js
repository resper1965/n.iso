// Dublê de `fetch` para testes que deixam o `api()` REAL no meio. Cada rota devolve o corpo que o
// handler devolve (copie do src/routes, com arquivo:linha no teste). Dublar `api()` com o formato
// que a tela espera foi o que escondeu os defeitos do contrato tela↔API.
import { vi } from 'vitest';

export function resposta(corpo, status = 200) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => corpo,
        text: async () => JSON.stringify(corpo),
    };
}

/** `rotas`: { 'GET /api/v1/...': corpo }. Sem dublê: 404 JSON, como o Worker. */
export function servir(rotas) {
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return f;
}
