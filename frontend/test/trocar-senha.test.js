// F7: o usuário troca a PRÓPRIA senha pelo cartão de perfil. Três coisas importam:
// (1) o modal tem os três campos rotulados e o foco cai no primeiro;
// (2) confirmação divergente não chega ao servidor;
// (3) "Senha atual incorreta" volta como 401 e NÃO pode derrubar a sessão (api.js).
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../src/ui.js';
import '../src/api.js';
import '../src/views/trocar-senha.js';
import { initDelegation } from '../src/delegation.js';

const MODAL = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const campo = (id) => document.getElementById(id);
const preenche = (atual, nova, conf) => {
  campo('cp-atual').value = atual;
  campo('cp-nova').value = nova;
  campo('cp-confirma').value = conf;
};
const envia = () => campo('cp-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const espera = () => new Promise((r) => setTimeout(r, 50));

let fetchMock;
beforeEach(() => {
  document.body.innerHTML = MODAL;
  initDelegation();
  window.showToast = vi.fn();
  window.doLogout = vi.fn();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.openChangePasswordModal();
});

describe('modal Trocar senha', () => {
  it('abre com três campos, cada um com label, e o foco no primeiro', () => {
    for (const id of ['cp-atual', 'cp-nova', 'cp-confirma']) {
      expect(document.querySelector(`label[for="${id}"]`), `${id} sem label`).toBeTruthy();
    }
    expect(campo('cp-atual').getAttribute('autocomplete')).toBe('current-password');
    expect(campo('cp-nova').getAttribute('autocomplete')).toBe('new-password');
    expect(campo('cp-confirma').getAttribute('autocomplete')).toBe('new-password');
    expect(document.activeElement).toBe(campo('cp-atual'));
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(true);
  });

  it('o envio usa data-action-submit, sem handler inline', () => {
    expect(campo('cp-form').getAttribute('data-action-submit')).toBe('submitChangePassword');
    expect(document.getElementById('modal-content').innerHTML).not.toMatch(/\son[a-z]+=/i);
  });

  it('confirmação divergente bloqueia o envio e não chama fetch', async () => {
    preenche('senha-atual-123', 'nova-senha-boa-1', 'nova-senha-boa-2');
    envia();
    await espera();
    expect(fetchMock).not.toHaveBeenCalled();
    const erro = campo('cp-confirma-erro');
    expect(erro.textContent).toMatch(/não coincidem/);
    expect(erro.getAttribute('aria-live')).toBe('polite');
    expect(campo('cp-confirma').getAttribute('aria-invalid')).toBe('true');
  });

  it('campo vazio também não chama fetch', async () => {
    preenche('', 'nova-senha-boa-1', 'nova-senha-boa-1');
    envia();
    await espera();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(campo('cp-atual-erro').textContent).not.toBe('');
  });

  it('sucesso: manda oldPassword/newPassword, mostra toast e fecha', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    preenche('senha-atual-123', 'nova-senha-boa-1', 'nova-senha-boa-1');
    envia();
    await espera();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/auth/change-password');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ oldPassword: 'senha-atual-123', newPassword: 'nova-senha-boa-1' });
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast.mock.calls[0][0]).toMatch(/senha/i);
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(false);
  });

  it('401 mostra "Senha atual incorreta" junto do campo, mantém o modal e NÃO desloga', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Senha atual incorreta' }, 401));
    preenche('errada-errada', 'nova-senha-boa-1', 'nova-senha-boa-1');
    envia();
    await espera();
    expect(campo('cp-atual-erro').textContent).toBe('Senha atual incorreta');
    expect(window.doLogout).not.toHaveBeenCalled();
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('senha nova fraca (400 do servidor) aparece junto do campo da nova', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Payload invalido', details: [{ path: 'newPassword', message: 'A senha precisa de pelo menos 8 caracteres' }] }, 400));
    preenche('senha-atual-123', 'curta', 'curta');
    envia();
    await espera();
    expect(campo('cp-nova-erro').textContent).toMatch(/8 caracteres/);
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(true);
  });
});
