// Tela "Conectar agente" (src/views/conectar-agente.js). Três coisas importam:
// (1) a estrutura: endereço do servidor, três passos, UM cliente por vez em abas, e o alcance do agente;
// (2) o que ela afirma bate com o que foi verificado: "Verificado" só no cliente exercitado em produção,
//     e o texto diz que o LOGIN define quem é o agente e o cliente;
// (3) "Copiado" só depois que a área de transferência aceitou.
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

const abas = (c) => [...c.querySelectorAll('[role="tab"]')];
const aba = (c, nome) => abas(c).find((t) => t.textContent.includes(nome));
const painel = (c) => c.querySelector('[role="tabpanel"]');

beforeEach(() => {
  window.showToast = vi.fn();
});

describe('Conectar agente — estrutura', () => {
  it('título, três passos, e o endereço do servidor UMA vez só (dentro do comando)', () => {
    const { c, h } = monta();
    expect(h.textContent).toBe('Conectar agente');
    expect(c.textContent.split('https://niso.ness.com.br/mcp').length - 1).toBe(1);
    expect(painel(c).textContent).toContain('https://niso.ness.com.br/mcp');
    const passos = [...c.querySelectorAll('ol.ca-passos > li')];
    expect(passos).toHaveLength(3);
    expect(passos[2].textContent).toContain('niso_contexto');
  });

  it('duas colunas: o que se faz à esquerda, o que o agente faz à direita', () => {
    const { c } = monta();
    const main = c.querySelector('.ca > .ca-main');
    const lado = c.querySelector('.ca > aside.ca-lado');
    expect(main.querySelector('[role="tablist"]')).toBeTruthy();
    expect(main.querySelector('ol.ca-passos')).toBeTruthy();
    expect(lado.querySelector('.ca-alcance')).toBeTruthy();
    expect(lado.querySelector('[role="tablist"]')).toBeNull();
  });

  it('um cliente por vez, em abas acessíveis: o Claude Code vem selecionado', () => {
    const { c } = monta();
    expect(c.querySelector('[role="tablist"]')).toBeTruthy();
    expect(abas(c).map((t) => t.textContent.replace(/\s+/g, ' ').trim().split(' ')[0])).toEqual(['Claude', 'Cursor', 'Codex', 'Antigravity']);
    const sel = abas(c).filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('Claude Code');
    // tabindex móvel: só a aba selecionada entra na ordem de tabulação
    expect(abas(c).map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(painel(c).getAttribute('aria-labelledby')).toBe(sel[0].id);
    expect(abas(c).every((t) => t.getAttribute('aria-controls') === painel(c).id)).toBe(true);
  });

  it('o painel mostra só o trecho do cliente selecionado', () => {
    const { c } = monta();
    expect(painel(c).textContent).toContain('claude mcp add --transport http --scope user niso');
    expect(painel(c).textContent).not.toContain('codex mcp add');
    window.__selecionarCliente('codex');
    expect(aba(c, 'Codex').getAttribute('aria-selected')).toBe('true');
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('false');
    expect(painel(c).textContent).toContain('codex mcp add niso --url https://niso.ness.com.br/mcp');
    expect(painel(c).textContent).toContain('codex mcp login niso');
    expect(painel(c).textContent).not.toContain('claude mcp add');
  });

  it('as setas, Home e End movem a seleção (e dão a volta)', () => {
    const { c } = monta();
    const tecla = (key) => window.__abaTecla(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    tecla('ArrowRight');
    expect(aba(c, 'Cursor').getAttribute('aria-selected')).toBe('true');
    tecla('End');
    expect(aba(c, 'Antigravity').getAttribute('aria-selected')).toBe('true');
    tecla('ArrowRight'); // dá a volta
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('true');
    tecla('ArrowLeft'); // dá a volta para trás
    expect(aba(c, 'Antigravity').getAttribute('aria-selected')).toBe('true');
    tecla('Home');
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Conectar agente — instruções que o consultor precisa', () => {
  it('Claude Code: escopo user, instalação do CLI, estado esperado e diagnóstico', () => {
    const { c } = monta();
    const t = painel(c).textContent;
    expect(t).toContain('--scope user');
    expect(t).toContain('irm https://claude.ai/install.ps1 | iex');
    expect(t).toContain('Needs authentication');
    expect(t).toContain('/mcp');
    expect(t).toContain('claude mcp list');
    expect(t).toContain('claude mcp remove niso -s user');
  });

  it('o passo 2 diz que o login é do consultor, não do agente da sessão', () => {
    const { c } = monta();
    const p2 = c.querySelectorAll('ol.ca-passos > li')[1].textContent;
    expect(p2).toContain('/mcp');
    expect(p2).toMatch(/agente da sessão não o faz/);
  });

  it('os outros clientes não ganham instruções do Claude Code', () => {
    const { c } = monta();
    for (const id of ['cursor', 'codex', 'antigravity']) {
      window.__selecionarCliente(id);
      expect(painel(c).textContent, id).not.toContain('claude mcp');
      expect(painel(c).textContent, id).not.toContain('Needs authentication');
    }
  });
});

describe('Conectar agente — o que a tela afirma', () => {
  it('só o Claude Code é "Verificado"; os outros três são "A confirmar"', () => {
    // Em 30/09/2026 só o Claude Code foi exercitado contra a produção.
    const { c } = monta();
    expect(aba(c, 'Claude Code').textContent).toContain('Verificado');
    for (const nome of ['Cursor', 'Codex', 'Antigravity']) {
      expect(aba(c, nome).textContent, nome).toContain('A confirmar');
      expect(aba(c, nome).textContent, nome).not.toContain('Verificado');
    }
  });

  it('o painel de um cliente "A confirmar" diz que o login ainda não foi visto funcionando', () => {
    const { c } = monta();
    window.__selecionarCliente('cursor');
    expect(painel(c).textContent).toMatch(/ainda não foi confirmado/i);
    window.__selecionarCliente('claude');
    expect(painel(c).textContent).toMatch(/exercitado em produção/i);
  });

  it('cada cliente "A confirmar" diz onde entrar e como conferir a conexão', () => {
    const { c } = monta();
    const esperado = {
      cursor: /Settings > MCP[\s\S]*ferramentas/i,
      codex: /codex mcp list/,
      antigravity: /Authenticate[\s\S]*Sign out/,
    };
    for (const [id, re] of Object.entries(esperado)) {
      window.__selecionarCliente(id);
      expect(painel(c).textContent, id).toMatch(re);
    }
  });

  it('o Antigravity cita o caminho das versões anteriores à 2.0', () => {
    const { c } = monta();
    window.__selecionarCliente('antigravity');
    expect(painel(c).textContent).toContain('~/.gemini/antigravity/mcp_config.json');
  });

  it('diz que o LOGIN define quem é o agente e em qual cliente ele atua', () => {
    const { c } = monta();
    expect(c.textContent).toMatch(/o login define/i);
    expect(c.textContent).toContain('em nome de você');
  });

  it('o alcance tem quatro blocos, e o "sim" é o destacado', () => {
    const { c } = monta();
    const blocos = [...c.querySelectorAll('.ca-alcance > .ca-alc')];
    expect(blocos).toHaveLength(4);
    const t = c.querySelector('.ca-alcance').textContent.toLowerCase();
    for (const pede of ['apagar', 'gerar políticas em lote', 'eliminar dados de titular', 'revogar aprovações']) expect(t, pede).toContain(pede);
    for (const nao of ['usuários', 'sso', 'chaves de api', 'webhooks', 'achado de auditoria']) expect(t, nao).toContain(nao);
    const destacado = c.querySelectorAll('.ca-alc-sim');
    expect(destacado).toHaveLength(1);
    expect(destacado[0].textContent).toContain('sim');
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
    await window.__copiarTrecho('claude');
    expect(writeText).toHaveBeenCalledWith('claude mcp add --transport http --scope user niso https://niso.ness.com.br/mcp');
    expect(window.showToast).toHaveBeenCalledWith('Copiado');
  });

  it('copia o trecho do cliente que está na aba, não o de outro', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    monta();
    window.__selecionarCliente('codex');
    await window.__copiarTrecho('codex');
    expect(writeText.mock.calls[0][0]).toContain('codex mcp login niso');
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
