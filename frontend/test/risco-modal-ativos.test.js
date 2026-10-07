// GET /projects/:id/assets devolve {ok, assets}; o modal esperava array e zerava a lista.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/grc.js';

describe('modal de novo risco', () => {
  it('lista os ativos do inventário', async () => {
    apiMock.mockImplementation((m, url) => Promise.resolve(
      url.endsWith('/assets') ? { ok: true, assets: [{ id: 'a1', name: 'ERP', category: 'Software' }] } : []
    ));
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    await window.openNewRiskModal('p1');
    const opcoes = [...document.querySelectorAll('#risk-asset-select option')].map(o => o.value);
    expect(opcoes).toContain('a1');
  });
});
