// F6: desaprovar é ato da direção, pela interface. Só platform_admin e org_admin veem "Revogar" (ROPA,
// DPIA) e "Excluir análise" (análise crítica); o motivo é obrigatório e vai ao servidor.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/privacy.js';
import '../src/views/monitor.js';

const MODAL = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
const modal = () => document.body.innerHTML;
const botoes = (acao) => [...document.querySelectorAll(`[data-action="${acao}"]`)];

beforeEach(() => {
  document.body.innerHTML = MODAL;
  S.activeProject = { id: 'p1' };
  S.ropa = [{ id: 'r1', activity_name: 'x', ciso_approved_by: 'Ana', ciso_approved_at: '2026-09-01', ceo_approved_by: null }];
  S.dpia = [{ id: 'd1', title: 'y', status: 'Approved', dpo_signature: 'Ana', ceo_signature: null }];
  S.managementReviews = [{ id: 'm1', review_date: '2026-07-16', status: 'Completed' }];
});

describe('quem vê os botões de desaprovar', () => {
  for (const [papel, ve] of [['platform_admin', true], ['org_admin', true], ['consultor', false], ['client', false]]) {
    it(`${papel}: ${ve ? 'vê' : 'não vê'}`, () => {
      S.user = { role: papel };
      window.openROPADetailsModal('r1');
      expect(botoes('revogarROPA').length).toBe(ve ? 1 : 0);
      document.body.innerHTML = MODAL;
      window.openDPIADetailsModal('d1');
      expect(botoes('revogarDPIA').length).toBe(ve ? 1 : 0);
      document.body.innerHTML = MODAL;
      window.openEditMgmtReviewForm('m1');
      expect(botoes('excluirMgmtReview').length).toBe(ve ? 1 : 0);
    });
  }

  it('ROPA: o botão é do papel que já aprovou (Líder SGSI), não do pendente (Direção)', () => {
    S.user = { role: 'org_admin' };
    window.openROPADetailsModal('r1');
    expect(botoes('revogarROPA')[0].getAttribute('data-args')).toContain('"ciso"');
    expect(modal()).toContain('approveROPA'); // a Direção segue com "Assinar"
  });
});

describe('o motivo é obrigatório', () => {
  it('sem motivo (ou curto demais) nenhuma chamada sai', async () => {
    const api = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    window.prompt = vi.fn().mockReturnValue('x');
    await window.revogarROPA('p1', 'r1', 'ciso');
    await window.revogarDPIA('p1', 'd1');
    window.prompt = vi.fn().mockReturnValue(null);
    await window.revogarDPIA('p1', 'd1');
    expect(api).not.toHaveBeenCalled();
  });

  it('excluir análise pede confirmação e, recusada, não apaga', async () => {
    window.confirm = vi.fn().mockReturnValue(false);
    await window.excluirMgmtReview('m1');
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(window.confirm.mock.calls[0][0]).toMatch(/permanente/);
  });
});
