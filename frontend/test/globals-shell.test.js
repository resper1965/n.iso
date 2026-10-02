// Shell: seletor de tenant (uma linha) e menu de conta (que substituiu o botão
// de logout solto). São as duas peças da casca com lógica de verdade — o resto
// da etapa é CSS. Mesmo preâmbulo de globals-ui.test.js: o módulo roda
// `initApp()` no import, então o overlay tem de existir antes.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

beforeAll(async () => {
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
});

function montaShell() {
  document.body.innerHTML = `
    <div id="login-overlay" class="hidden"></div>
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <button id="toggle-sidebar" aria-expanded="true" title="Recolher"><span id="toggle-sidebar-svg">&#171;</span></button>
      </div>
      <div id="sidebar-project-selector-container">
        <select id="sidebar-project-select"></select>
        <div class="tenant-face">
          <span id="tenant-initials">-</span>
          <span id="tenant-name"></span>
          <span id="tenant-norm"></span>
        </div>
      </div>
      <div class="sidebar-bottom">
        <button id="sidebar-user-card" aria-expanded="false"></button>
        <div class="account-menu" id="account-menu" hidden></div>
      </div>
    </nav>`;
}

beforeEach(() => {
  montaShell();
  S.user = { name: 'Ana Prado', email: 'pessoa@exemplo.com.br', role: 'consultor' };
  S.projects = [
    { id: 'p1', project_name: 'cliente', standard: 'ISO 27001:2022' },
    { id: 'p2', client_name: 'Alup', standard: 'ISO 27701' },
  ];
  S.activeProject = S.projects[0];
});

describe('seletor de tenant', () => {
  it('mostra nome, norma e iniciais numa linha só', () => {
    window.updateSidebarProjectSelector();
    expect(document.getElementById('tenant-name').textContent).toBe('cliente');
    expect(document.getElementById('tenant-norm').textContent).toBe('ISO 27001:2022');
    expect(document.getElementById('tenant-initials').textContent).toBe('TW');
  });

  it('não imprime fase, prazo nem percentual — esse contexto é da Jornada', () => {
    S.activeProject = { id: 'p1', project_name: 'cliente', standard: 'ISO 27001:2022', phase: 14, progress: 62 };
    window.updateSidebarProjectSelector();
    const texto = document.querySelector('.tenant-face').textContent;
    expect(texto).not.toMatch(/14|62|%|Fase/);
  });

  it('sem projeto ativo, convida a escolher', () => {
    S.activeProject = null;
    window.updateSidebarProjectSelector();
    expect(document.getElementById('tenant-name').textContent).toBe('Selecione um projeto');
    expect(document.getElementById('tenant-norm').textContent).toBe('');
  });
});

describe('menu de conta', () => {
  it('abre pelo card, marca aria-expanded e lista identidade, tenants e encerrar sessão', () => {
    window.toggleAccountMenu();
    const box = document.getElementById('account-menu');
    expect(box.hidden).toBe(false);
    expect(document.getElementById('sidebar-user-card').getAttribute('aria-expanded')).toBe('true');
    expect(box.textContent).toContain('pessoa@exemplo.com.br');
    expect(box.textContent).toContain('cliente');
    expect(box.textContent).toContain('Alup');
    expect(box.textContent).toContain('Minha conta e MFA');
    expect(box.textContent).toContain('Encerrar sessão');
    // O tenant ativo é o único com check.
    const marcados = box.querySelectorAll('.account-item[aria-checked="true"]');
    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toContain('cliente');
  });

  it('oferece "Trocar senha", que abre o modal de troca (F7)', () => {
    window.toggleAccountMenu();
    const item = [...document.querySelectorAll('#account-menu .account-item')].find((b) => b.textContent.includes('Trocar senha'));
    expect(item, 'o menu não tem "Trocar senha"').toBeTruthy();
    expect(item.getAttribute('data-action')).toBe('accountMenuAction');
    expect(JSON.parse(item.getAttribute('data-args'))).toEqual(['openChangePasswordModal']);
  });

  it('não oferece "Tema": não existe tema claro para trocar', () => {
    window.toggleAccountMenu();
    expect(document.getElementById('account-menu').textContent).not.toContain('Tema');
  });

  it('fecha com Esc', () => {
    window.toggleAccountMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('account-menu').hidden).toBe(true);
    expect(document.getElementById('sidebar-user-card').getAttribute('aria-expanded')).toBe('false');
  });

  it('fecha com clique fora, mas não com clique dentro', () => {
    window.toggleAccountMenu();
    document.getElementById('account-menu').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('account-menu').hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('account-menu').hidden).toBe(true);
  });

  it('recolhida, expande a sidebar antes de abrir — o popover não cabe na trilha', () => {
    document.getElementById('sidebar').classList.add('collapsed');
    window.toggleAccountMenu();
    expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(false);
    expect(document.getElementById('account-menu').hidden).toBe(false);
  });
});

describe('toggleSidebar', () => {
  it('alterna a classe, o glifo e o estado anunciado; fecha o menu ao recolher', () => {
    window.toggleAccountMenu();
    window.toggleSidebar();
    const sb = document.getElementById('sidebar');
    expect(sb.classList.contains('collapsed')).toBe(true);
    expect(document.getElementById('toggle-sidebar-svg').textContent).toBe('»');
    expect(document.getElementById('toggle-sidebar').getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('account-menu').hidden).toBe(true);

    window.toggleSidebar();
    expect(sb.classList.contains('collapsed')).toBe(false);
    expect(document.getElementById('toggle-sidebar-svg').textContent).toBe('«');
  });
});

describe('notificação de proposta (fatia 4)', () => {
  it('link /propostas/:id abre a tela de Propostas na ficha da proposta', async () => {
    const { api } = await import('../src/api.js');
    await import('../src/views/propostas.js');
    document.body.innerHTML += '<div id="notif-dropdown"></div><h1 id="header-title"></h1><div id="header-actions"></div><div id="content"></div>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    api.mockImplementation(async (m, p) => (p === '/api/v1/propostas/p1'
      ? { id: 'p1', numero: 'N-1', revisao: 1, status: 'visualizada', cliente: 'Acme', itens: [] }
      : []));
    S.notifications = [{ id: 'n1', read: 0, title: 'Proposta visualizada: Acme', link: '/propostas/p1', action_type: 'proposta_visualizada', target_id: 'p1' }];
    await window.handleNotificationClick('n1');
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith('GET', '/api/v1/propostas/p1'));
    expect(S.view).toBe('proposals');
    await vi.waitFor(() => expect(document.querySelector('[data-action="__prpEnviar"]')).toBeTruthy());
  });
});
