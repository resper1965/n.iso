// Tela "Conectar agente" (src/views/conectar-agente.js): o que ela promete tem de bater com o
// que foi verificado e com o que o agente faz hoje (docs/agente/). Três coisas importam:
// (1) o selo "Verificado" só no cliente exercitado em produção; (2) o texto diz que o LOGIN
// define quem é o agente e o cliente; (3) "Copiado" só depois que a área de transferência aceitou.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../src/ui.js';
import '../src/views/conectar-agente.js';

function monta() {
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  const c = document.getElementById('content');
  const h = document.getElementById('hdr');
  const a = document.getElementById('act');
  window.renderConectarAgente(c, h, a);
  return { c, h, a };
}

const cartao = (c, nome) => [...c.querySelectorAll('section')].find((s) => s.getAttribute('aria-label') === nome);

beforeEach(() => {
  window.showToast = vi.fn();
});

describe('Conectar agente — o que a tela afirma', () => {
  it('título e quatro clientes, cada um com o seu trecho', () => {
    const { c, h } = monta();
    expect(h.textContent).toBe('Conectar agente');
    for (const nome of ['Claude Code', 'Cursor', 'Codex', 'Antigravity']) expect(cartao(c, nome), nome).toBeTruthy();
    expect(c.textContent).toContain('https://niso.ness.com.br/mcp');
  });

  it('só o Claude Code é "Verificado"; os outros três são "A confirmar"', () => {
    // Em 30/09/2026 só o Claude Code foi exercitado contra a produção.
    const { c } = monta();
    expect(cartao(c, 'Claude Code').textContent).toContain('Verificado');
    for (const nome of ['Cursor', 'Codex', 'Antigravity']) {
      expect(cartao(c, nome).textContent, nome).toContain('A confirmar');
      expect(cartao(c, nome).textContent, nome).not.toContain('Verificado');
    }
  });

  it('o Codex mostra o comando de adicionar E o de login', () => {
    const { c } = monta();
    const t = cartao(c, 'Codex').textContent;
    expect(t).toContain('codex mcp add niso --url https://niso.ness.com.br/mcp');
    expect(t).toContain('codex mcp login niso');
  });

  it('diz que o LOGIN define quem é o agente e em qual cliente ele atua', () => {
    const { c } = monta();
    expect(c.textContent).toMatch(/o login define/i);
    expect(c.textContent).toContain('em nome de você');
  });

  it('diz o que o agente faz, o que pede o "sim" e o que ele não faz', () => {
    const { c } = monta();
    const t = c.textContent.toLowerCase();
    for (const pede of ['apagar', 'gerar políticas em lote', 'eliminar dados de titular', 'revogar aprovações']) expect(t, pede).toContain(pede);
    for (const nao of ['usuários', 'sso', 'chaves de api', 'webhooks', 'achado de auditoria']) expect(t, nao).toContain(nao);
    expect(t).toContain('niso_contexto');
  });

  it('sem handler inline nem script inline (o CSP atual os barra)', () => {
    const { c } = monta();
    expect(c.innerHTML).not.toMatch(/\son[a-z]+=/i);
    expect(c.querySelector('script')).toBeNull();
  });
});

describe('Conectar agente — copiar', () => {
  it('"Copiado" só depois que a área de transferência aceitou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    monta();
    await window.__copiarTrecho('url');
    expect(writeText).toHaveBeenCalledWith('https://niso.ness.com.br/mcp');
    expect(window.showToast).toHaveBeenCalledWith('Copiado');
  });

  it('se a área de transferência recusar, diz que falhou em vez de mentir', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true });
    monta();
    await window.__copiarTrecho('claude');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast.mock.calls[0][0]).toContain('Não foi possível copiar');
    expect(window.showToast.mock.calls[0][1]).toBe('error');
  });
});
