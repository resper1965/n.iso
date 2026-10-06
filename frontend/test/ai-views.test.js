// Cérebro do projeto e chat de compliance (src/views/ai.js). Cobre: estado sem projeto, estado
// vazio, escape de conteúdo vindo da API, chamadas com os argumentos certos e o ciclo do chat
// (mensagem do usuário, "Pensando...", resposta ou erro).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock, renderMock } = vi.hoisted(() => ({ apiMock: vi.fn(), renderMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: renderMock, navigate: vi.fn() }));

import '../src/ui.js';
import '../src/views/ai.js';
import { S } from '../src/state.js';

const $ = (id) => document.getElementById(id);
const dom = () => {
  document.body.innerHTML =
    '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="c"></div><h1 id="h"></h1><div id="a"></div>';
  return [$('c'), $('h'), $('a')];
};
const espera = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  apiMock.mockReset();
  renderMock.mockReset();
  S.projects = [];
  S.activeProject = null;
  S.knowledgeQuery = '';
});

describe('renderKnowledge', () => {
  it('sem projeto: estado vazio com ação de selecionar, sem chamar a API', async () => {
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(c.textContent).toMatch(/Sem projeto ativo/);
    expect(c.querySelector('[data-action="openActiveProjectModal"]')).toBeTruthy();
    expect(a.querySelector('[data-action="openIngestModal"]')).toBeNull();
  });

  it('usa o primeiro projeto quando não há ativo e busca "*" sem consulta', async () => {
    S.projects = [{ id: 'p1' }];
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/knowledge/search?q=*');
    expect(a.querySelector('[data-action="openIngestModal"]').dataset.args).toBe('["p1"]');
    expect(c.textContent).toMatch(/Nenhum conhecimento mapeado/);
  });

  it('com consulta: codifica a query na URL', async () => {
    S.activeProject = { id: 'p1' };
    S.knowledgeQuery = 'a&b c';
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/knowledge/search?q=a%26b%20c');
  });

  it('erro da API cai no estado vazio em vez de quebrar a tela', async () => {
    S.activeProject = { id: 'p1' };
    apiMock.mockRejectedValue(new Error('500'));
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect(c.textContent).toMatch(/Nenhum conhecimento mapeado/);
  });

  it('lista itens: título, tipo e resumo com valores padrão, título/resumo escapados', async () => {
    S.activeProject = { id: 'p1' };
    apiMock.mockResolvedValue([
      { id: 'k1', metadata: { title: '<img src=x onerror=alert(1)>', type: 'Ata', summary: '<b id="sum">x</b>' } },
      { id: 'k2' },
    ]);
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    const itens = c.querySelectorAll('.list-item');
    expect(itens).toHaveLength(2);
    expect(c.querySelector('img')).toBeNull();
    expect($('sum')).toBeNull();
    expect(itens[0].textContent).toContain('<img src=x onerror=alert(1)>');
    expect(itens[1].querySelector('.item-name').textContent).toBe('k2');
    expect(itens[1].querySelector('.item-meta').textContent).toBe('Documento | Sem resumo disponível');
    expect(itens[1].querySelector('[data-action="viewKnowledge"]').dataset.args).toBe('["k2","p1"]');
  });

  // BUG (ai.js:24): `value="${query}"` sem escapeHTML — a busca digitada vai crua para o atributo.
  it('a consulta digitada não escapa do atributo value (ai.js:24)', async () => {
    S.activeProject = { id: 'p1' };
    S.knowledgeQuery = '"><img id="inj" src=x>';
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect($('inj')).toBeNull();
  });

  // BUG (ai.js:36): `${ctrl}` das tags de controle sem escapeHTML.
  it.fails('tags de controles são escapadas (ai.js:36)', async () => {
    S.activeProject = { id: 'p1' };
    apiMock.mockResolvedValue([{ id: 'k1', metadata: { controls: ['<i id="ctl">A.5</i>'] } }]);
    const [c, h, a] = dom();
    await window.renderKnowledge(c, h, a);
    expect($('ctl')).toBeNull();
  });
});

describe('searchKnowledge / doIngest', () => {
  it('searchKnowledge guarda a consulta em S e re-renderiza', () => {
    dom();
    document.body.insertAdjacentHTML('beforeend', '<input id="k-search" value="iso 27001">');
    window.searchKnowledge();
    expect(S.knowledgeQuery).toBe('iso 27001');
    expect(renderMock).toHaveBeenCalledOnce();
  });

  function abreIngestao(titulo, conteudo) {
    dom();
    window.openIngestModal('p9');
    $('ingest-title').value = titulo;
    $('ingest-content').value = conteudo;
  }

  it('o modal liga o botão ao projeto certo', () => {
    abreIngestao('', '');
    expect($('ingest-btn').dataset.action).toBe('doIngest');
    expect($('ingest-btn').dataset.args).toBe('["p9"]');
  });

  it.each([['', 'texto'], ['titulo', '']])('título=%j conteúdo=%j: não chama a API', async (t, ct) => {
    abreIngestao(t, ct);
    await window.doIngest('p9');
    expect(apiMock).not.toHaveBeenCalled();
    expect($('ingest-btn').disabled).toBe(false);
  });

  it('sucesso: envia título e conteúdo, fecha e re-renderiza', async () => {
    apiMock.mockResolvedValue({});
    abreIngestao('Ata CTO', 'conteúdo longo');
    await window.doIngest('p9');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p9/knowledge/ingest', { title: 'Ata CTO', content: 'conteúdo longo' });
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('falha: reabilita o botão, esconde o carregando e não re-renderiza', async () => {
    apiMock.mockRejectedValue(new Error('x'));
    abreIngestao('Ata', 'texto');
    await window.doIngest('p9');
    expect($('ingest-btn').disabled).toBe(false);
    expect($('ingest-loading').style.display).toBe('none');
    expect(renderMock).not.toHaveBeenCalled();
  });
});

describe('renderAIChat', () => {
  it('sem projeto: estado vazio', async () => {
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(c.textContent).toMatch(/Sem projeto ativo/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('histórico vazio ou resposta não-array: mostra a dica; "Limpar" aponta para o projeto', async () => {
    S.activeProject = { id: 'p1' };
    apiMock.mockResolvedValue({ nao: 'array' });
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/chat/history');
    expect(c.textContent).toMatch(/Faca uma pergunta/);
    expect(a.querySelector('[data-action="clearChatHistory"]').dataset.args).toBe('["p1"]');
  });

  it('histórico: alinha por papel e escapa o conteúdo', async () => {
    S.activeProject = { id: 'p1' };
    apiMock.mockResolvedValue([
      { role: 'user', content: 'oi <b id="u">x</b>' },
      { role: 'assistant', content: 'olá' },
    ]);
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    const msgs = $('chat-messages').children;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].style.alignSelf).toBe('flex-end');
    expect(msgs[1].style.alignSelf).toBe('flex-start');
    expect($('u')).toBeNull();
  });

  async function comChat() {
    S.activeProject = { id: 'p1' };
    apiMock.mockResolvedValueOnce([]);
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    apiMock.mockReset();
  }

  it('mensagem vazia não é enviada', async () => {
    await comChat();
    $('chat-input').value = '   ';
    await window.sendChatMessage('p1');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('envio: mostra a mensagem escapada, limpa o campo e troca "Pensando..." pela resposta', async () => {
    await comChat();
    apiMock.mockResolvedValue({ reply: 'Resposta A.5.1' });
    $('chat-input').value = ' o que é <b id="m">A.5</b>? ';
    const p = window.sendChatMessage('p1');
    expect($('chat-loading').textContent).toBe('Pensando...');
    expect($('chat-input').value).toBe('');
    await p;
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/chat', { message: 'o que é <b id="m">A.5</b>?' });
    expect($('m')).toBeNull();
    expect($('chat-loading')).toBeNull();
    expect($('chat-messages').lastElementChild.textContent).toBe('Resposta A.5.1');
  });

  it('resposta sem reply: "Sem resposta."', async () => {
    await comChat();
    apiMock.mockResolvedValue({});
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    expect($('chat-messages').lastElementChild.textContent).toBe('Sem resposta.');
  });

  it('erro: mostra "Erro: ..." no lugar do carregando', async () => {
    await comChat();
    apiMock.mockRejectedValue(new Error('timeout'));
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    expect($('chat-loading').textContent).toBe('Erro: timeout');
  });
});

describe('clearChatHistory', () => {
  it('sem confirmação não apaga', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    await window.clearChatHistory('p1');
    expect(apiMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('confirmado: DELETE no projeto certo e re-renderiza', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockResolvedValue({});
    await window.clearChatHistory('p1');
    await espera();
    expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/projects/p1/chat/history');
    expect(renderMock).toHaveBeenCalledOnce();
  });
});
