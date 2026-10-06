// "Gerar SoA (AI)" chamava POST /generate-soa, rota que não existe desde o
// refactor 72f1b59 (404). O botão foi removido; este teste impede a volta.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';
import { S } from '../src/state.js';

describe('tela da SoA', () => {
  it('não renderiza o botão "Gerar SoA" nem expõe generateSoA', async () => {
    apiMock.mockResolvedValue([]);
    S.activeProject = { id: 'p1', project_name: 'Projeto' };
    const c = document.createElement('div');
    const h = document.createElement('div');
    const a = document.createElement('div');
    await window.renderSoA(c, h, a);
    expect(a.querySelector('[data-action="generateSoA"]')).toBeNull();
    expect(a.querySelector('#soa-generate')).toBeNull();
    expect(a.textContent).not.toContain('Gerar SoA');
    expect(window.generateSoA).toBeUndefined();
  });
});
