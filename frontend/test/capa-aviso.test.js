// Clicar num aviso de CAPA navega para a tela e, 150 ms depois, abre o modal de edição. O globals.js
// já buscou o registro e o projeto do aviso e os passa a openEditCAPAModal, que os ignorava: relia
// S.capa (ainda vazio nesse instante) e abria o formulário em branco, no projeto ativo.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/grc.js';
import { S } from '../src/state.js';

describe('openEditCAPAModal', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue([]);
    S.capa = [];
    S.controls = [];
    S.activeProject = { id: 'ativo' };
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  });

  it('com o registro e o projeto do aviso, abre preenchido e busca no projeto do aviso', async () => {
    await window.openEditCAPAModal('c1', 'p-aviso', { id: 'c1', title: 'Título da CAPA' });
    expect(document.getElementById('capa-e-title').value).toBe('Título da CAPA');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p-aviso/risks');
    expect(apiMock).not.toHaveBeenCalledWith('GET', '/api/v1/projects/ativo/risks');
  });

  it('o botão da lista (só o id) continua lendo S.capa e o projeto ativo', async () => {
    S.capa = [{ id: 'c2', title: 'Da lista' }];
    await window.openEditCAPAModal('c2');
    expect(document.getElementById('capa-e-title').value).toBe('Da lista');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/ativo/risks');
  });
});
