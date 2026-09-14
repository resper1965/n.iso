// Tela de aceite de documentos legais: material barra a entrada, comum apenas
// avisa, e "Aceitar e entrar" só habilita com todos os documentos marcados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

function montaDom() {
  document.body.innerHTML = `
    <div id="login-overlay" class="hidden">
      <div class="login-box" id="standard-login-box"></div>
      <div class="login-box" id="first-login-reset-box" style="display:none"></div>
      <div class="login-box" id="mfa-login-box" style="display:none"></div>
      <div class="login-box" id="forgot-password-box" style="display:none"></div>
      <div class="login-box" id="legal-accept-box" style="display:none">
        <div id="legal-accept-list"></div>
        <button id="legal-accept-submit" disabled>Aceitar e entrar</button>
        <p id="legal-accept-error" style="display:none"></p>
      </div>
    </div>
    <div style="display:flex"><div class="content" id="content"></div></div>
    <div id="live-region" role="status" aria-live="polite"></div>`;
}

const TERMOS = { id: 't24', kind: 'terms', version: 'v2.4', classification: 'comum', title: 'Termos de Uso', url: '/termos' };
const PRIVACIDADE = { id: 'p31', kind: 'privacy', version: 'v3.1', classification: 'material', title: 'Política de Privacidade' };

beforeEach(async () => {
  // Timers falsos: globals.js abre poll de notificacao, e um intervalo vivo
  // depois do teste segura o worker do vitest para sempre.
  vi.useFakeTimers();
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  montaDom();
  await import('../src/globals.js');
  montaDom();
  apiMock.mockReset();
  S.token = 'tok';
  S.user = { id: 'u1', email: 'pessoa@exemplo.com.br' };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const caixas = () => Array.from(document.querySelectorAll('.legal-check'));
const botao = () => document.getElementById('legal-accept-submit');

describe('pendência material', () => {
  it('barra a entrada e mostra o cartão de aceite', async () => {
    apiMock.mockResolvedValue({ pendentes: [TERMOS, PRIVACIDADE], bloqueia: true, avisa: false });
    const barrou = await window.checkLegalGate();
    expect(barrou).toBe(true);
    expect(document.getElementById('legal-accept-box').style.display).toBe('flex');
    expect(document.getElementById('login-overlay').classList.contains('hidden')).toBe(false);
  });

  it('lista um documento por pendência, com título e versão', async () => {
    apiMock.mockResolvedValue({ pendentes: [TERMOS, PRIVACIDADE], bloqueia: true, avisa: false });
    await window.checkLegalGate();
    expect(caixas()).toHaveLength(2);
    const texto = document.getElementById('legal-accept-list').textContent;
    expect(texto).toContain('Termos de Uso');
    expect(texto).toContain('v2.4');
    expect(texto).toContain('Política de Privacidade');
    expect(texto).toContain('v3.1');
  });

  it('esconde os outros cartões: não dá para voltar ao login por baixo', async () => {
    apiMock.mockResolvedValue({ pendentes: [PRIVACIDADE], bloqueia: true, avisa: false });
    await window.checkLegalGate();
    expect(document.getElementById('standard-login-box').style.display).toBe('none');
    expect(document.getElementById('mfa-login-box').style.display).toBe('none');
  });
});

describe('Aceitar e entrar', () => {
  beforeEach(async () => {
    apiMock.mockResolvedValue({ pendentes: [TERMOS, PRIVACIDADE], bloqueia: true, avisa: false });
    await window.checkLegalGate();
    apiMock.mockReset();
  });

  it('nasce desabilitado, com o motivo no title', () => {
    expect(botao().disabled).toBe(true);
    expect(botao().title).toContain('Marque todos');
  });

  it('marcar só um NÃO habilita: aceite parcial não existe', () => {
    caixas()[0].checked = true;
    window.updateLegalAcceptButton();
    expect(botao().disabled).toBe(true);
  });

  it('habilita com todos marcados', () => {
    caixas().forEach(c => { c.checked = true; });
    window.updateLegalAcceptButton();
    expect(botao().disabled).toBe(false);
  });

  it('desmarcar um volta a desabilitar', () => {
    caixas().forEach(c => { c.checked = true; });
    window.updateLegalAcceptButton();
    caixas()[1].checked = false;
    window.updateLegalAcceptButton();
    expect(botao().disabled).toBe(true);
  });

  it('envia os ids dos documentos marcados', async () => {
    caixas().forEach(c => { c.checked = true; });
    apiMock.mockResolvedValue({ ok: true, pendentes: [], bloqueia: false, avisa: false });
    window.initApp = vi.fn();
    await window.doAcceptLegal();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/legal/accept', { documentIds: ['t24', 'p31'] });
  });

  it('recusa do servidor mantém o cartão e mostra o motivo', async () => {
    caixas().forEach(c => { c.checked = true; });
    const e = new Error('Só é possível aceitar a versão vigente de cada documento.');
    e.status = 400;
    apiMock.mockRejectedValue(e);
    await window.doAcceptLegal();
    expect(document.getElementById('legal-accept-box').style.display).toBe('flex');
    expect(document.getElementById('legal-accept-error').textContent).toContain('versão vigente');
  });
});

describe('pendência comum', () => {
  it('não barra: monta a faixa de aviso e deixa entrar', async () => {
    apiMock.mockResolvedValue({ pendentes: [TERMOS], bloqueia: false, avisa: true });
    const barrou = await window.checkLegalGate();
    expect(barrou).toBe(false);
    const faixa = document.getElementById('legal-banner');
    expect(faixa).not.toBeNull();
    expect(faixa.textContent).toContain('Termos de Uso v2.4');
  });

  it('a faixa não duplica se a verificação rodar de novo', async () => {
    apiMock.mockResolvedValue({ pendentes: [TERMOS], bloqueia: false, avisa: true });
    await window.checkLegalGate();
    await window.checkLegalGate();
    expect(document.querySelectorAll('#legal-banner')).toHaveLength(1);
  });

  it('sem pendência nenhuma não monta faixa nem cartão', async () => {
    apiMock.mockResolvedValue({ pendentes: [], bloqueia: false, avisa: false });
    expect(await window.checkLegalGate()).toBe(false);
    expect(document.getElementById('legal-banner')).toBeNull();
    expect(document.getElementById('legal-accept-box').style.display).toBe('none');
  });
});

describe('indisponibilidade', () => {
  // O servidor recusa com 403 de qualquer forma; travar a entrada por
  // indisponibilidade NOSSA seria pior que deixar passar e falhar adiante.
  it('erro ao consultar não barra a entrada', async () => {
    apiMock.mockRejectedValue(new Error('Falha de rede'));
    expect(await window.checkLegalGate()).toBe(false);
    expect(document.getElementById('legal-accept-box').style.display).toBe('none');
  });
});
