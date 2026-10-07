// A tela vazia dizia "serão populados pelo backend", o que nunca acontecia.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';
import { S } from '../src/state.js';

const tela = () => ({ c: document.createElement('div'), h: document.createElement('div'), a: document.createElement('div') });

describe('lista de controles', () => {
  it('vazia: oferece carregar o catálogo do projeto', () => {
    S.controls = []; S.currentProject = { id: 'p1' };
    const { c, h, a } = tela();
    window.renderControls(c, h, a);
    expect(c.querySelector('[data-action="carregarCatalogo"]')).not.toBeNull();
    expect(c.textContent).not.toContain('populados pelo backend');
  });

  it('mostra o código do título quando o id é gerado', () => {
    S.controls = [{ id: 'x9f2k1', title: 'A.5.1 — Políticas', status: 'Missing' }];
    const { c, h, a } = tela();
    window.renderControls(c, h, a);
    expect(c.querySelector('.phase-num').textContent).toBe('A.5.1');
  });

  it('carregarCatalogo chama os dois seeds e recarrega', async () => {
    apiMock.mockResolvedValue({ ok: true, seeded: 1 });
    window.loadControls = vi.fn().mockResolvedValue();
    await window.carregarCatalogo('p1');
    const urls = apiMock.mock.calls.map(([, u]) => u);
    expect(urls).toContain('/api/v1/projects/p1/seed-27001-2022');
    expect(urls).toContain('/api/v1/projects/p1/seed-27701-2025');
    expect(window.loadControls).toHaveBeenCalled();
  });
});
