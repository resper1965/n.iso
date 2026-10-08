// 9.2: a consultoria implementa, não audita. O servidor recusa o achado (auth.ts); a tela não pode
// oferecer o botão que leva ao 403.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/grc.js';
import { S } from '../src/state.js';

const CONTROLE = { id: 'c1', standard: 'A.5.1', title: 'Políticas', status: 'Implemented' };
const ACHADO = { id: 'f1', control_id: 'c1', finding_type: 'observation', description: 'Obs', created_at: '2026-10-08T00:00:00Z' };

async function abrir(role) {
  S.user = { id: 'u1', role };
  S.activeProject = { id: 'p1' };
  S.activeAuditId = 'aud-1';
  apiMock.mockImplementation((m, url = '') => Promise.resolve(
    url.endsWith('/controls') ? [CONTROLE] : url.endsWith('/findings') ? [ACHADO] : [{ id: 'aud-1', title: 'Interna' }]
  ));
  const c = document.createElement('div');
  const h = document.createElement('div');
  const a = document.createElement('div');
  await window.renderAuditExecution(c, h, a);
  return c;
}

describe('execução de auditoria por papel', () => {
  beforeEach(() => apiMock.mockReset());

  for (const role of ['consultor', 'consultant', 'consultoria_admin']) {
    it(`${role} vê os achados, sem botão de registrar nem de apagar`, async () => {
      const c = await abrir(role);
      expect(c.textContent).toContain('Obs');
      expect(c.querySelector('[data-action="openAddFindingModal"]')).toBeNull();
      expect(c.querySelector('[data-action="deleteFinding"]')).toBeNull();
    });
  }

  it('platform_admin continua registrando e apagando', async () => {
    const c = await abrir('platform_admin');
    expect(c.querySelector('[data-action="openAddFindingModal"]')).not.toBeNull();
    expect(c.querySelector('[data-action="deleteFinding"]')).not.toBeNull();
  });
});
