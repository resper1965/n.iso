// O modal de risco oferece o cadastro de partes como responsável e manda o id (fatia 1.4).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/views/grc.js';

const PARTES = [{ id: 'pt1', nome: 'Ana Exemplo' }, { id: 'pt2', nome: 'Beto <b>Exemplo</b>' }];
const resposta = (m, url) => {
  if (url.includes('/partes')) return Promise.resolve(PARTES);
  if (url.endsWith('/assets')) return Promise.resolve({ ok: true, assets: [] });
  return Promise.resolve([]);
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(resposta);
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  S.activeProject = { id: 'p1' };
  window.render = vi.fn(); // a tela inteira não é o assunto aqui
});

describe('responsável do risco', () => {
  it('novo risco: lista só partes ativas, escapa o nome e envia owner_parte_id', async () => {
    await window.openNewRiskModal('p1');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/partes?status=ativa');
    const select = document.getElementById('risk-owner-parte');
    expect([...select.options].map(o => o.value)).toEqual(['', 'pt1', 'pt2']);
    expect(select.innerHTML).not.toContain('<b>'); // nome de parte não vira HTML
    select.value = 'pt1';
    document.getElementById('risk-asset').value = 'ERP';
    document.getElementById('risk-threat').value = 'Vazamento';
    await window.createRisk('p1');
    const post = apiMock.mock.calls.find(c => c[0] === 'POST' && c[1].endsWith('/risks'));
    expect(post[2]).toMatchObject({ owner_parte_id: 'pt1', owner: '' });
  });

  it('editar risco: já abre com a parte atual e deixa desligar', async () => {
    S.risks = [{ id: 'r1', asset: 'ERP', threat: 'T', owner_parte_id: 'pt2' }];
    await window.openEditRiskModal('r1');
    const select = document.getElementById('risk-e-owner-parte');
    expect(select.value).toBe('pt2');
    select.value = '';
    await window.updateRisk('r1');
    const put = apiMock.mock.calls.find(c => c[0] === 'PUT');
    expect(put[2].owner_parte_id).toBeNull();
  });

  it('sem partes cadastradas (ou a chamada falha), o modal ainda abre com o texto livre', async () => {
    apiMock.mockImplementation((m, url) => (url.includes('/partes') ? Promise.reject(new Error('x')) : resposta(m, url)));
    await window.openNewRiskModal('p1');
    expect([...document.getElementById('risk-owner-parte').options]).toHaveLength(1);
    expect(document.getElementById('risk-owner')).not.toBeNull();
  });
});
