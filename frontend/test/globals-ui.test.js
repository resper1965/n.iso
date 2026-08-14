// Unidade das funções de UI de `src/globals.js` que produzem HTML a partir do
// estado (`S`) e do DOM, sem tocar a rede: o badge de notificações, o dropdown de
// notificações e o renderer do assessment self-service. São o tipo de lógica que
// dói se regredir (escape de HTML, contagem de não-lidas, ramo por tipo de
// questão) e hoje só existe cobertura E2E. globals.js chama `initApp()` no topo;
// montamos o `login-overlay` antes do import dinâmico para o módulo avaliar limpo.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

beforeAll(async () => {
  // globals.js instala um MutationObserver global no document.body que nunca é
  // desconectado e dispara em toda mutação — depois do teardown do jsdom ele
  // referencia `document` (já removido) e vira erro solto. Neutralizamos com um
  // observer no-op ANTES do import; a lógica que testamos não depende dele.
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
});

beforeEach(() => {
  document.body.innerHTML = '';
  S.notifications = [];
});

describe('updateNotifBadge', () => {
  function montaBadge() {
    document.body.innerHTML = '<span id="notif-count" style="display:none"></span>';
  }
  it('mostra a contagem de não-lidas e exibe o badge', () => {
    montaBadge();
    S.notifications = [{ id: '1', read: false }, { id: '2', read: true }, { id: '3', read: false }];
    window.updateNotifBadge();
    const el = document.getElementById('notif-count');
    expect(el.textContent).toBe('2');
    expect(el.style.display).toBe('flex');
  });
  it('esconde o badge quando não há não-lidas', () => {
    montaBadge();
    S.notifications = [{ id: '1', read: true }];
    window.updateNotifBadge();
    expect(document.getElementById('notif-count').style.display).toBe('none');
  });
  it('não quebra quando o elemento não existe no DOM', () => {
    S.notifications = [{ id: '1', read: false }];
    expect(() => window.updateNotifBadge()).not.toThrow();
  });
});

describe('renderNotifDropdown', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="notif-dropdown"></div>';
  });
  it('mostra estado vazio quando não há notificações', () => {
    S.notifications = [];
    window.renderNotifDropdown();
    expect(document.getElementById('notif-dropdown').textContent).toContain('Sem notificações');
  });
  it('renderiza título e mensagem, marca não-lidas e escapa HTML', () => {
    S.notifications = [
      { id: 'a', read: false, title: '<b>Alerta</b>', message: 'corpo', created_at: '2026-08-14T10:00:00Z' },
      { id: 'b', read: true, title: 'Lida', message: '', created_at: '' },
    ];
    window.renderNotifDropdown();
    const dd = document.getElementById('notif-dropdown');
    // Título perigoso foi escapado (não virou elemento <b> real).
    expect(dd.querySelector('b')).toBeNull();
    expect(dd.innerHTML).toContain('&lt;b&gt;Alerta&lt;/b&gt;');
    // A data é cortada no 'T'.
    expect(dd.textContent).toContain('2026-08-14');
    // Duas notificações → dois itens; uma marcada como unread.
    expect(dd.querySelectorAll('.notif-item').length).toBe(2);
    expect(dd.querySelectorAll('.notif-item.unread').length).toBe(1);
  });
  it('limita a 15 itens', () => {
    S.notifications = Array.from({ length: 20 }, (_, i) => ({ id: String(i), read: true, title: 't' + i }));
    window.renderNotifDropdown();
    expect(document.getElementById('notif-dropdown').querySelectorAll('.notif-item').length).toBe(15);
  });
});

describe('toggleGroup', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="sidebar-label" aria-expanded="false"></div>
      <div class="sidebar-group" id="g1"></div>
      <div class="sidebar-label" aria-expanded="false"></div>
      <div class="sidebar-group expanded" id="g2"></div>`;
  });
  it('expande o grupo alvo e colapsa os demais, atualizando aria-expanded', () => {
    window.toggleGroup('g1');
    const g1 = document.getElementById('g1');
    const g2 = document.getElementById('g2');
    expect(g1.classList.contains('expanded')).toBe(true);
    expect(g2.classList.contains('expanded')).toBe(false);
    expect(g1.previousElementSibling.getAttribute('aria-expanded')).toBe('true');
    expect(g2.previousElementSibling.getAttribute('aria-expanded')).toBe('false');
  });
  it('colapsa o grupo quando ele já estava expandido (toggle off)', () => {
    window.toggleGroup('g2'); // g2 começa expandido → deve fechar
    expect(document.getElementById('g2').classList.contains('expanded')).toBe(false);
    expect(document.getElementById('g2').previousElementSibling.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('renderSelfServiceBlock / ssPrev / ssNext', () => {
  const BLOCKS = [
    {
      block: 1,
      title: 'Bloco Um',
      questions: [
        { key: 'q_yes', type: 'yesno', text: 'Tem DPO?' },
        { key: 'q_sel', type: 'select', text: 'Setor?', options: ['Fintech', 'Health & <Care>'] },
        { key: 'q_txt', type: 'text', text: 'Comentário?' },
      ],
    },
    { block: 2, title: 'Bloco Dois', questions: [{ key: 'q2', type: 'text', text: 'Outra?' }] },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="content"></div>';
    window._ssBlock = 0;
    window._ssAnswers = { 1: { q_yes: 'yes', q_sel: 'Fintech' } };
    window._ssData = { client_name: 'Cliente <X>' };
    window._ssToken = 'tok123';
  });

  it('renderiza o bloco: progresso, título, tipos de questão e valores preservados', () => {
    const c = document.getElementById('content');
    window.renderSelfServiceBlock(c, BLOCKS);
    expect(c.textContent).toContain('Bloco 1 de 2');
    expect(c.textContent).toContain('Bloco Um');
    // Nome do cliente escapado (não virou elemento).
    expect(c.innerHTML).toContain('Cliente &lt;X&gt;');
    // yesno → 3 selects no total (yesno, select, e o de texto é input).
    const selects = c.querySelectorAll('select.ss-answer');
    const inputs = c.querySelectorAll('input.ss-answer');
    expect(selects.length).toBe(2);
    expect(inputs.length).toBe(1);
    // Valor previamente salvo é marcado como selected.
    const yesOpt = c.querySelector('select[data-key="q_yes"] option[value="yes"]');
    expect(yesOpt.selected).toBe(true);
    // Opção com caracteres especiais é escapada.
    expect(c.innerHTML).toContain('Health &amp; &lt;Care&gt;');
  });

  it('ssPrev não desce abaixo de zero', () => {
    document.getElementById('content');
    window._ssBlock = 0;
    window.ssPrev();
    expect(window._ssBlock).toBe(0);
  });

  it('ssNext coleta as respostas do DOM, salva no mapa, faz POST e avança de bloco', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    // ssNext lê a global `ASSESSMENT_BLOCKS` (flatten do bundler em produção);
    // no vitest os módulos são isolados, então a fixamos no escopo global.
    window.ASSESSMENT_BLOCKS = BLOCKS;
    document.body.innerHTML = '<div id="content"><input class="ss-answer" data-key="qX" value="42"></div>';
    window._ssBlock = 0;
    window._ssAnswers = {};
    await window.ssNext();
    // Resposta capturada no mapa sob o número do primeiro bloco (block 1).
    expect(window._ssAnswers[1].qX).toBe('42');
    // POST enviado ao endpoint público com o token.
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/public/assessment/tok123/answers');
    // Avançou para o bloco seguinte (índice 1).
    expect(window._ssBlock).toBe(1);
    delete window.ASSESSMENT_BLOCKS;
    vi.unstubAllGlobals();
  });

  it('ssNext no último bloco mostra a tela de conclusão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    window.ASSESSMENT_BLOCKS = BLOCKS;
    document.body.innerHTML = '<div id="content"><input class="ss-answer" data-key="q2" value="ok"></div>';
    window._ssBlock = BLOCKS.length - 1; // último bloco
    window._ssAnswers = {};
    await window.ssNext();
    expect(document.getElementById('content').textContent).toContain('Assessment Concluido');
    delete window.ASSESSMENT_BLOCKS;
    vi.unstubAllGlobals();
  });
});
