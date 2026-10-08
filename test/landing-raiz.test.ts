import { describe, it, expect } from 'vitest';
import app from '../src/index';

/**
 * A raiz `/` é a tela de entrada do app (login na primeira dobra, seções
 * institucionais abaixo) — spec 2026-09-29-landing-login-design.md.
 *
 * Não existe mais `index.html` no build: `/` não casa com asset nenhum, cai no
 * catch-all e o fallback de 404 precisa entregar o shell do app. O ASSETS de
 * teste aponta para `src/`, não para `frontend/dist`, então o binding é dublado
 * aqui para observar QUE caminho o catch-all pede.
 */
function assetsFalso() {
  const pedidos: string[] = [];
  return {
    pedidos,
    fetch: async (req: Request) => {
      const caminho = new URL(req.url).pathname;
      pedidos.push(caminho);
      return caminho === '/login' ? new Response('shell do app') : new Response('nada', { status: 404 });
    },
  };
}

describe('Raiz e rota desconhecida entregam a tela de entrada', () => {
  it('GET / devolve o shell do app', async () => {
    const assets = assetsFalso();
    const res = await app.request('/', {}, { ASSETS: assets } as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('shell do app');
    expect(assets.pedidos).toEqual(['/', '/login']);
  });

  it('/auditor (página pública do auditor) vai ao asset, sem rota do Worker no meio', async () => {
    // O Workers Assets (html_handling padrão) resolve /auditor para public/auditor.html.
    const pedidos: string[] = [];
    const assets = { fetch: async (req: Request) => { pedidos.push(new URL(req.url).pathname); return new Response('portal'); } };
    const res = await app.request('/auditor', {}, { ASSETS: assets } as any);
    expect(await res.text()).toBe('portal');
    expect(pedidos).toEqual(['/auditor']);
  });

  it('rota desconhecida também cai na tela de entrada', async () => {
    const assets = assetsFalso();
    const res = await app.request('/algo-que-nao-existe', {}, { ASSETS: assets } as any);
    expect(await res.text()).toBe('shell do app');
  });
});
