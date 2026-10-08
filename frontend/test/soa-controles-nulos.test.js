// `api('GET', .../controls) || []` nunca caía no `[]`: api() devolve uma Promise, sempre verdadeira.
// Se a API devolvesse null, `controls.forEach` lançava e a SoA mostrava a tela de erro (com o código
// `req xxxx-xxx` para o suporte) em vez de uma lista vazia.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';
import { S } from '../src/state.js';

describe('SoA com resposta nula de controles', () => {
  it('renderiza vazio, sem a tela de erro', async () => {
    apiMock.mockImplementation((m, url) => Promise.resolve(url.endsWith('/controls') ? null : []));
    S.activeProject = { id: 'p1', project_name: 'Projeto' };
    const c = document.createElement('div');
    const h = document.createElement('div');
    const a = document.createElement('div');
    await window.renderSoA(c, h, a);
    expect(c.textContent).not.toMatch(/req [0-9a-f]{4}-[0-9a-f]{3}/);
  });
});
