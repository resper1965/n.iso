// Chat de compliance (src/views/ai.js). Cobre: estado sem projeto, estado
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
});

describe('renderAIChat', () => {
  it('sem projeto: estado vazio', async () => {
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(c.textContent).toMatch(/Sem projeto ativo/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Não há histórico no servidor: nada grava ai_chat_history e GET/DELETE /chat/history nunca
  // existiram (404 engolido pelo catch; "Limpar" dava erro).
  it('abre sem chamar a API e sem "Limpar Histórico"', async () => {
    S.activeProject = { id: 'p1' };
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(c.textContent).toMatch(/Faca uma pergunta/);
    expect(a.innerHTML).toBe('');
    expect(window.clearChatHistory).toBeUndefined();
  });

  async function comChat() {
    S.activeProject = { id: 'p1' };
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
