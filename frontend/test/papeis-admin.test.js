// Quem vê o quê por papel (fatia 5): o menu REAL de login.html montado e desenhado pelo
// updateHeaderUser, o seletor de organização do cabeçalho e os papéis oferecidos na tela de
// Usuários. Só decide o que MOSTRAR; quem barra é o servidor (helpers.ts, users.ts).
// Mesmo preâmbulo de globals-shell.test.js: globals.js roda initApp() no import.
import { describe, it, expect, beforeAll, vi } from 'vitest';

const ORGS = [
  { id: 'org_ness', nome: 'ness.', status: 'Active' },
  { id: 'org_alfa', nome: 'Alfa Consultoria', status: 'Active' },
];
vi.mock('../src/api.js', () => ({
  api: vi.fn(async (m, p) => (p === '/api/v1/platform/orgs' ? ORGS : [])),
  API_BASE: 'http://api.test',
  cabecalhosAuth: () => ({}),
}));

import { S } from '../src/state.js';

const lido = (glob) => Object.values(glob)[0];
const html = lido(import.meta.glob('../login.html', { query: '?raw', import: 'default', eager: true }));
const corpo = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

beforeAll(async () => {
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
  await import('../src/views/organizacoes.js');
  await import('../src/views/admin.js');
});

const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);
const visivel = (id) => $(id).style.display !== 'none';

async function menu(papel) {
  document.body.innerHTML = corpo;
  S.user = { role: papel, email: 'x@exemplo.test', name: 'X' };
  S.orgAtuacao = null;
  window.updateHeaderUser();
  await espera();
}

// [papel, organizações, catálogo, config. comercial, usuários, propostas, leads, configurações]
const MATRIZ = [
  ['platform_admin', true, true, true, true, true, true, true],
  ['consultoria_admin', false, true, true, true, true, true, false],
  ['comercial', false, true, true, false, true, true, true],
  ['consultor', false, false, false, true, false, false, false],
  ['org_admin', false, false, false, true, false, false, false],
  ['client', false, false, false, false, false, false, false],
];

describe('menu por papel (login.html real)', () => {
  it.each(MATRIZ)('%s', async (papel, orgs, cat, cfg, users, props, leads, settings) => {
    await menu(papel);
    expect({
      orgs: visivel('nav-organizacoes'), cat: visivel('nav-catalogo'), cfg: visivel('nav-config'), users: visivel('nav-users'),
      props: visivel('nav-proposals'), leads: visivel('nav-leads'), settings: visivel('nav-settings'),
    }).toEqual({ orgs, cat, cfg, users, props, leads, settings });
  });

  it('o item Organizações navega para a tela e o roteador a conhece', () => {
    document.body.innerHTML = corpo;
    expect($('nav-organizacoes').getAttribute('data-args')).toBe('["organizacoes"]');
  });

  it('login.html sem handler inline nos elementos novos', () => {
    for (const id of ['nav-organizacoes', 'org-seletor', 'org-faixa']) {
      const m = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
      expect(m, id).toBeTruthy();
      expect(m[0]).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });
});

describe('seletor de organização no cabeçalho', () => {
  it('platform_admin tem o seletor com as organizações', async () => {
    await menu('platform_admin');
    expect($('org-seletor').hidden).toBe(false);
    expect([...$('org-sel').options].map((o) => o.textContent)).toEqual(['ness.', 'Alfa Consultoria']);
    expect($('org-faixa').hidden).toBe(true);
  });

  it.each(['consultoria_admin', 'comercial', 'consultor', 'org_admin', 'client'])('%s: sem seletor', async (papel) => {
    await menu(papel);
    expect($('org-seletor').hidden).toBe(true);
    expect($('org-sel')).toBeNull();
    expect($('org-faixa').hidden).toBe(true);
  });
});

describe('papéis oferecidos na tela de Usuários', () => {
  async function opcoes(papel) {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.user = { role: papel, email: 'x@exemplo.test' };
    S.projects = [{ id: 'p1', client_name: 'Cliente' }];
    S.activeProject = null;
    await window.openUserModal();
    return [...$('user-m-role').options].map((o) => o.value).filter(Boolean);
  }

  it('platform_admin: todos, com consultor no valor do servidor (não "consultant")', async () => {
    expect(await opcoes('platform_admin')).toEqual(['platform_admin', 'consultoria_admin', 'consultor', 'comercial', 'org_admin', 'org_user']);
    expect($('user-m-org-nota').textContent).toMatch(/seletor do cabeçalho/);
  });

  it('consultoria_admin: a equipe da consultoria e o cliente, nunca platform_admin', async () => {
    expect(await opcoes('consultoria_admin')).toEqual(['consultoria_admin', 'consultor', 'comercial', 'org_admin', 'org_user']);
    expect($('user-m-org-nota')).toBeNull();
    expect($('user-m-project-group').style.display).toBe('block');
  });

  it.each(['consultor', 'org_admin'])('%s: só papéis de cliente', async (papel) => {
    expect(await opcoes(papel)).toEqual(['org_admin', 'org_user']);
  });
});
