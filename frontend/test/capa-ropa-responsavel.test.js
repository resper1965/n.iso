// CAPA e RoPA oferecem o cadastro de partes como responsável e mandam o id (fatia 1.4).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/grc.js';
import '../src/views/privacy.js';

const PARTES = [{ id: 'pt1', nome: 'Ana Exemplo' }, { id: 'pt2', nome: 'Beto <b>Exemplo</b>' }];
const val = (id) => document.getElementById(id);

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((m, url) => Promise.resolve(url.includes('/partes') ? PARTES : (m === 'GET' ? [] : { ok: true })));
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  S.activeProject = { id: 'p1' };
  S.controls = [];
  window.render = vi.fn();
});

describe('responsável da CAPA', () => {
  it('nova: lista partes ativas, escapa o nome e envia assigned_to_parte_id', async () => {
    await window.openNewCAPAModal('p1');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/partes?status=ativa');
    const sel = val('capa-assigned-parte');
    expect([...sel.options].map(o => o.value)).toEqual(['', 'pt1', 'pt2']);
    expect(sel.innerHTML).not.toContain('<b>');
    sel.value = 'pt1';
    val('capa-title').value = 'Corrigir';
    await window.createCAPA('p1');
    const post = apiMock.mock.calls.find(c => c[0] === 'POST' && c[1].endsWith('/capa'));
    expect(post[2]).toMatchObject({ assigned_to_parte_id: 'pt1', title: 'Corrigir' });
  });

  it('editar: abre com a parte atual e deixa desligar', async () => {
    S.capa = [{ id: 'c1', title: 'T', status: 'Open', assigned_to_parte_id: 'pt2' }];
    await window.openEditCAPAModal('c1');
    expect(val('capa-e-assigned-parte').value).toBe('pt2');
    val('capa-e-assigned-parte').value = '';
    await window.updateCAPA('c1');
    const put = apiMock.mock.calls.find(c => c[0] === 'PUT');
    expect(put[2].assigned_to_parte_id).toBeNull();
  });
});

describe('responsável do RoPA', () => {
  it('nova: envia owner_parte_id', async () => {
    await window.openNewROPAModal('p1');
    expect([...val('ropa-owner-parte').options].map(o => o.value)).toEqual(['', 'pt1', 'pt2']);
    val('ropa-owner-parte').value = 'pt1';
    val('ropa-purpose').value = 'Folha';
    await window.createROPA('p1');
    const post = apiMock.mock.calls.find(c => c[0] === 'POST' && c[1].endsWith('/ropa'));
    expect(post[2]).toMatchObject({ owner_parte_id: 'pt1' });
  });

  it('editar: abre com a parte do próprio projeto do registro e deixa desligar', async () => {
    S.ropa = [{ id: 'r1', project_id: 'p9', processing_purpose: 'X', owner_parte_id: 'pt2' }];
    await window.openEditROPAModal('r1');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p9/partes?status=ativa');
    expect(val('ropa-e-owner-parte').value).toBe('pt2');
    val('ropa-e-owner-parte').value = '';
    await window.updateROPA('r1');
    const put = apiMock.mock.calls.find(c => c[0] === 'PUT');
    expect(put[2].owner_parte_id).toBeNull();
  });
});
