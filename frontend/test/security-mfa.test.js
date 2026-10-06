// Autoatendimento do segundo fator (src/views/security.js). O que importa: a senha é exigida
// antes de qualquer chamada, o MFA só liga na confirmação do código, os códigos de recuperação
// (exibidos uma única vez) nunca somem em silêncio, e desativar derruba a sessão.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/security.js';
import { S } from '../src/state.js';

const MODAL = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
const $ = (id) => document.getElementById(id);
const texto = () => $('modal-content').textContent;
const acoes = () => [...$('modal-content').querySelectorAll('[data-action]')].map((e) => e.dataset.action);

beforeEach(() => {
  apiMock.mockReset();
  document.body.innerHTML = MODAL;
  window.doLogout = vi.fn();
  S.user = { email: 'ana@exemplo.test' };
});

describe('openSecurityModal', () => {
  it('MFA desligado: oferece ativar, pede a senha, não oferece desativar', async () => {
    apiMock.mockResolvedValue({ ativo: false });
    await window.openSecurityModal();
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/auth/mfa/status');
    expect(texto()).toMatch(/desativada/);
    expect($('mfa-setup-pass')).toBeTruthy();
    expect(acoes()).toContain('doMfaSetup');
    expect(acoes()).not.toContain('doMfaDisable');
  });

  it('MFA ligado: mostra o saldo de códigos e oferece desativar', async () => {
    apiMock.mockResolvedValue({ ativo: true, codigos_recuperacao_restantes: 7 });
    await window.openSecurityModal();
    expect(texto()).toMatch(/restantes: 7/);
    expect(texto()).not.toMatch(/Estão acabando/);
    expect(acoes()).toContain('doMfaDisable');
    expect(acoes()).not.toContain('doMfaSetup');
  });

  it.each([2, 0])('avisa que os códigos estão acabando com %i restantes', async (n) => {
    apiMock.mockResolvedValue({ ativo: true, codigos_recuperacao_restantes: n });
    await window.openSecurityModal();
    expect(texto()).toMatch(/Estão acabando/);
  });

  it('falha da API: mostra a mensagem (escapada) e só oferece fechar', async () => {
    apiMock.mockRejectedValue(new Error('<img src=x onerror=alert(1)>'));
    await window.openSecurityModal();
    expect($('modal-content').querySelector('img')).toBeNull();
    expect(texto()).toContain('<img src=x onerror=alert(1)>');
    expect(acoes()).toEqual(['forceCloseModal']);
  });
});

describe('ativação', () => {
  beforeEach(async () => {
    apiMock.mockResolvedValueOnce({ ativo: false });
    await window.openSecurityModal();
    apiMock.mockReset();
  });

  it('sem senha não chama a API', async () => {
    await window.doMfaSetup();
    expect(apiMock).not.toHaveBeenCalled();
    expect($('mfa-erro').textContent).toBe('Informe sua senha.');
  });

  it('com senha pede o segredo e mostra QR + chave manual, ainda sem ativar', async () => {
    apiMock.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauth_url: 'otpauth://totp/niso:ana?secret=JBSWY3DPEHPK3PXP' });
    $('mfa-setup-pass').value = 'minha-senha';
    await window.doMfaSetup();
    expect(apiMock).toHaveBeenCalledOnce();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/mfa/setup', { password: 'minha-senha' });
    expect($('modal-content').querySelector('img').src).toMatch(/^data:image\//);
    expect(texto()).toContain('JBSWY3DPEHPK3PXP');
    expect(acoes()).toContain('doMfaActivate');
  });

  it('senha errada: o erro do servidor aparece e a tela de senha continua', async () => {
    apiMock.mockRejectedValue(new Error('Senha incorreta'));
    $('mfa-setup-pass').value = 'errada';
    await window.doMfaSetup();
    expect($('mfa-erro').textContent).toBe('Senha incorreta');
    expect($('mfa-setup-pass')).toBeTruthy();
  });

  async function ateOCodigo() {
    apiMock.mockResolvedValue({ secret: 'S', otpauth_url: 'otpauth://totp/x?secret=S' });
    $('mfa-setup-pass').value = 'x';
    await window.doMfaSetup();
    apiMock.mockReset();
  }

  it('código com menos de 6 dígitos não chega ao servidor', async () => {
    await ateOCodigo();
    $('mfa-codigo').value = '12345';
    await window.doMfaActivate();
    expect(apiMock).not.toHaveBeenCalled();
    expect($('mfa-erro').textContent).toBe('O código tem 6 dígitos.');
  });

  it.each([
    ['array direto (api() desembrulha)', ['AAAA-1111', 'BBBB-2222']],
    ['objeto { recovery_codes }', { recovery_codes: ['AAAA-1111', 'BBBB-2222'] }],
  ])('exibe os códigos de recuperação: %s', async (_n, resposta) => {
    await ateOCodigo();
    apiMock.mockResolvedValue(resposta);
    $('mfa-codigo').value = ' 123456 ';
    await window.doMfaActivate();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/mfa/activate', { codigo: '123456' });
    expect(texto()).toContain('AAAA-1111');
    expect(texto()).toContain('BBBB-2222');
    expect(acoes()).toContain('baixarCodigosMfa');
  });

  it('ativou mas vieram zero códigos: avisa em voz alta, não mostra caixa vazia', async () => {
    await ateOCodigo();
    apiMock.mockResolvedValue({ ok: true });
    $('mfa-codigo').value = '123456';
    await window.doMfaActivate();
    expect(texto()).toMatch(/sem códigos de recuperação/);
    expect(acoes()).toEqual(['openSecurityModal']);
  });

  it('código inválido: erro do servidor na própria tela', async () => {
    await ateOCodigo();
    apiMock.mockRejectedValue(new Error('Código inválido'));
    $('mfa-codigo').value = '000000';
    await window.doMfaActivate();
    expect($('mfa-erro').textContent).toBe('Código inválido');
  });

  it('códigos de recuperação são escapados', async () => {
    await ateOCodigo();
    apiMock.mockResolvedValue(['<b id="x">a</b>']);
    $('mfa-codigo').value = '123456';
    await window.doMfaActivate();
    expect($('x')).toBeNull();
  });
});

describe('desativação', () => {
  beforeEach(async () => {
    apiMock.mockResolvedValueOnce({ ativo: true, codigos_recuperacao_restantes: 5 });
    await window.openSecurityModal();
    apiMock.mockReset();
  });

  it('sem senha não chama a API', async () => {
    await window.doMfaDisable();
    expect(apiMock).not.toHaveBeenCalled();
    expect($('mfa-erro').textContent).toBe('Informe sua senha.');
    expect(window.doLogout).not.toHaveBeenCalled();
  });

  it('com senha desativa, fecha o modal e faz logout (sessão foi revogada)', async () => {
    apiMock.mockResolvedValue({ ok: true });
    $('mfa-off-pass').value = 'minha-senha';
    await window.doMfaDisable();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/mfa/disable', { password: 'minha-senha' });
    expect(window.doLogout).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Segundo fator desativado. Entre novamente.');
  });

  it('senha errada: mostra o erro e NÃO faz logout', async () => {
    apiMock.mockRejectedValue(new Error('Senha incorreta'));
    $('mfa-off-pass').value = 'errada';
    await window.doMfaDisable();
    expect($('mfa-erro').textContent).toBe('Senha incorreta');
    expect(window.doLogout).not.toHaveBeenCalled();
  });
});

describe('baixarCodigosMfa', () => {
  it('gera o .txt com a conta e os códigos', async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => ((blob = b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window._mfaCodigos = ['AAAA-1111'];
    window.baixarCodigosMfa();
    const t = await blob.text();
    expect(t).toContain('Conta: ana@exemplo.test');
    expect(t).toContain('AAAA-1111');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });
});
