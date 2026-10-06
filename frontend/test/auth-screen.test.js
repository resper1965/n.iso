// Tela de autenticação, caminho de conta local: sinalização de credencial
// inválida sem dizer qual campo errou, bloqueio temporário, desafio anti-abuso
// e o campo de segundo fator que valida ao completar.
//
// O caminho federado fica de fora de propósito — não existe ainda.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

function montaLogin() {
  document.body.innerHTML = `
    <div id="login-overlay">
      <div class="login-box" id="standard-login-box">
        <input id="login-email" class="form-input" value="ana@acme.com.br">
        <input type="password" id="login-password" class="form-input" value="senha-errada">
        <div class="login-challenge" id="login-challenge" hidden>
          <div id="login-challenge-widget"></div>
        </div>
        <button id="login-submit">Entrar</button>
        <p id="login-error" style="display:none"></p>
      </div>
      <div class="login-box" id="first-login-reset-box" style="display:none">
        <input id="first-new-password"><p id="first-reset-error"></p>
      </div>
      <div class="login-box" id="mfa-login-box" style="display:none">
        <p id="mfa-login-lede"></p>
        <label id="mfa-login-label">Código</label>
        <input id="mfa-login-code" class="form-input mfa-code" maxlength="6" inputmode="numeric">
        <span class="mfa-countdown" id="mfa-countdown"></span>
        <p id="mfa-login-error"></p>
        <button id="mfa-toggle-recovery">Usar código de recuperação</button>
      </div>
      <div class="login-box" id="forgot-password-box" style="display:none"></div>
      <div class="login-box" id="legal-accept-box" style="display:none"></div>
      <div class="login-box" id="reauth-box" style="display:none">
        <span id="reauth-email"></span>
        <p id="reauth-draft" style="display:none"></p>
        <input type="password" id="reauth-password">
        <p id="reauth-error" style="display:none"></p>
      </div>
    </div>
    <div id="live-region" role="status" aria-live="polite"></div>`;
}

beforeEach(async () => {
  // Timers falsos em TODOS os testes: o bloqueio e o contador do segundo fator
  // abrem setInterval, e um intervalo vivo depois do teste segura o worker do
  // vitest para sempre. Microtask nao e afetada, entao os `await` seguem valendo.
  vi.useFakeTimers();
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  montaLogin();
  await import('../src/globals.js');
  montaLogin();
  apiMock.mockReset();
  S.token = null;
  S.user = null;
  window.initApp = vi.fn();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

/** Erro como api.js o lança: mensagem + corpo + status. */
function erroApi(message, body = {}, status = 401) {
  const e = new Error(message);
  e.body = body;
  e.status = status;
  return e;
}

describe('credencial inválida', () => {
  it('mostra a mensagem do servidor sem acrescentar qual campo errou', async () => {
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Restam 4 tentativas antes do bloqueio temporário.'));
    await window.doLogin();
    const err = document.getElementById('login-error');
    expect(err.style.display).toBe('block');
    expect(err.textContent).toContain('E-mail ou senha incorretos');
    expect(err.textContent).not.toMatch(/senha (incorreta|errada)\b/i);
    expect(err.textContent).not.toMatch(/e-mail não/i);
  });

  it('marca os DOIS campos, não só um — marcar um só já denunciaria qual errou', async () => {
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Restam 4 tentativas antes do bloqueio temporário.'));
    await window.doLogin();
    expect(document.getElementById('login-email').classList.contains('is-invalid')).toBe(true);
    expect(document.getElementById('login-password').classList.contains('is-invalid')).toBe(true);
  });

  it('limpa a senha e devolve o foco para ela', async () => {
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Resta 1 tentativa antes do bloqueio temporário.'));
    await window.doLogin();
    expect(document.getElementById('login-password').value).toBe('');
  });

  it('falha de rede não treme o campo: não é credencial errada', async () => {
    // Falha de rede em api.js e um Error puro: sem `status`, sem `body`.
    apiMock.mockRejectedValue(new Error('Falha de rede ao chamar /api/v1/auth/login'));
    await window.doLogin();
    expect(document.getElementById('login-email').classList.contains('is-invalid')).toBe(false);
    expect(document.getElementById('login-error').textContent).toContain('Falha de rede');
  });

  it('uma tentativa nova limpa a marca da anterior', async () => {
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Restam 3 tentativas antes do bloqueio temporário.'));
    await window.doLogin();
    apiMock.mockResolvedValue({ token: 't', user: { name: 'Ana' } });
    await window.doLogin();
    expect(document.getElementById('login-email').classList.contains('is-invalid')).toBe(false);
  });
});

describe('desafio anti-abuso', () => {
  it('fica invisível no caminho normal', async () => {
    apiMock.mockResolvedValue({ token: 't', user: { name: 'Ana' } });
    await window.doLogin();
    expect(document.getElementById('login-challenge').hidden).toBe(true);
  });

  it('aparece quando o SERVIDOR diz que é exigido', async () => {
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Restam 4 tentativas antes do bloqueio temporário.', { challengeRequired: true }));
    await window.doLogin();
    expect(document.getElementById('login-challenge').hidden).toBe(false);
  });

  // Deixar Entrar desabilitado sem ter como resolver o desafio trancaria o
  // usuário para fora. É o caso de servidor pedindo desafio sem dizer com que
  // chave montá-lo — meia configuração, que o servidor já não deveria produzir.
  it('sem site key, NÃO desabilita o Entrar', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true }));
    await window.doLogin();
    expect(document.getElementById('login-submit').disabled).toBe(false);
  });

  it('com widget montado, o Entrar só libera quando o desafio é resolvido', async () => {
    window.turnstile = { render: vi.fn(() => 'w1'), reset: vi.fn(), remove: vi.fn() };
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xTESTE' }));
    await window.doLogin();
    expect(document.getElementById('login-submit').disabled).toBe(true);
    window.setLoginChallengeToken('tok-123');
    expect(document.getElementById('login-submit').disabled).toBe(false);
    delete window.turnstile;
  });

  it('o token resolvido vai no corpo do login', async () => {
    window.setLoginChallengeToken('tok-123');
    apiMock.mockResolvedValue({ token: 't', user: {} });
    await window.doLogin();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/login', expect.objectContaining({ challengeToken: 'tok-123' }));
  });

  it('o token é de uso único: não sobrevive a uma falha', async () => {
    window.setLoginChallengeToken('tok-123');
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true }));
    await window.doLogin();
    apiMock.mockClear();
    apiMock.mockResolvedValue({ token: 't', user: {} });
    await window.doLogin();
    expect(apiMock.mock.calls[0][2]).not.toHaveProperty('challengeToken');
  });
});

describe('widget do Turnstile', () => {
  let turnstile;

  beforeEach(async () => {
    turnstile = { render: vi.fn(() => 'w1'), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = turnstile;
    // O handle do widget é estado de módulo e sobrevive entre testes. Um login
    // bem-sucedido chama `escondeDesafio`, que o descarta — é a única porta
    // pública para isso, e usá-la evita espiar o interior do módulo.
    apiMock.mockResolvedValue({ token: 't', user: {} });
    await window.doLogin();
    apiMock.mockReset();
    turnstile.render.mockClear();
    turnstile.reset.mockClear();
    turnstile.remove.mockClear();
  });

  afterEach(() => { delete window.turnstile; });

  it('monta o widget com a site key que o SERVIDOR mandou', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xDOSERVIDOR' }));
    await window.doLogin();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    const [alvo, opcoes] = turnstile.render.mock.calls[0];
    expect(alvo).toBe('#login-challenge-widget');
    expect(opcoes.sitekey).toBe('0xDOSERVIDOR');
  });

  // A regra que mais quebra integração de Turnstile: o token é de uso único e o
  // desafio é conferido ANTES da senha, então uma tentativa com senha errada já
  // gastou o token. Sem reiniciar, a próxima é recusada por "token já usado" e a
  // pessoa fica presa — o mesmo sintoma de não haver widget nenhum.
  it('a segunda falha REINICIA o widget em vez de montar outro', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xDOSERVIDOR' }));
    await window.doLogin();
    await window.doLogin();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.reset).toHaveBeenCalledWith('w1');
  });

  it('o token que o widget devolve é o que vai no corpo da tentativa seguinte', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xDOSERVIDOR' }));
    await window.doLogin();

    // O Turnstile chama o callback quando a pessoa resolve.
    turnstile.render.mock.calls[0][1].callback('tok-do-widget');

    apiMock.mockReset();
    apiMock.mockResolvedValue({ token: 't', user: {} });
    await window.doLogin();
    expect(apiMock.mock.calls[0][2].challengeToken).toBe('tok-do-widget');
  });

  it('token expirado volta a travar o Entrar', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xDOSERVIDOR' }));
    await window.doLogin();
    const opcoes = turnstile.render.mock.calls[0][1];

    opcoes.callback('tok');
    expect(document.getElementById('login-submit').disabled).toBe(false);
    opcoes['expired-callback']();
    expect(document.getElementById('login-submit').disabled).toBe(true);
  });

  it('erro no widget libera o botão — não deixa a pessoa sem saída', async () => {
    apiMock.mockRejectedValue(erroApi('erro', { challengeRequired: true, challengeSiteKey: '0xDOSERVIDOR' }));
    await window.doLogin();
    expect(document.getElementById('login-submit').disabled).toBe(true);

    turnstile.render.mock.calls[0][1]['error-callback']();
    expect(document.getElementById('login-submit').disabled).toBe(false);
  });
});

describe('bloqueio temporário', () => {
  it('para o formulário e mostra a contagem no próprio botão', async () => {
    apiMock.mockRejectedValue(erroApi('Muitas tentativas incorretas. Tente novamente em 15 minutos.', { locked: true }, 429));
    await window.doLogin();
    const btn = document.getElementById('login-submit');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Bloqueado — 15:00/);
    vi.advanceTimersByTime(61_000);
    expect(btn.textContent).toMatch(/Bloqueado — 13:5\d/);
  });

  it('devolve o botão quando o bloqueio termina', async () => {
    apiMock.mockRejectedValue(erroApi('Muitas tentativas incorretas. Tente novamente em 15 minutos.', { locked: true }, 429));
    await window.doLogin();
    vi.advanceTimersByTime(16 * 60_000);
    const btn = document.getElementById('login-submit');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Entrar');
  });

  it('no bloqueio não treme o campo: o problema deixou de ser a digitação', async () => {
    apiMock.mockRejectedValue(erroApi('Muitas tentativas incorretas. Tente novamente em 15 minutos.', { locked: true }, 429));
    await window.doLogin();
    expect(document.getElementById('login-email').classList.contains('is-invalid')).toBe(false);
  });
});

describe('segundo fator', () => {
  it('valida sozinho ao completar os 6 dígitos, e não antes', () => {
    apiMock.mockResolvedValue({ ok: true });
    const campo = document.getElementById('mfa-login-code');
    campo.value = '12345';
    window.onMfaCodeInput();
    expect(apiMock).not.toHaveBeenCalled();
    campo.value = '123456';
    window.onMfaCodeInput();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/mfa/verify', { codigo: '123456' });
  });

  it('descarta o que não é dígito e não passa de seis', () => {
    apiMock.mockResolvedValue({ ok: true });
    const campo = document.getElementById('mfa-login-code');
    campo.value = 'a1b2c3d4e5f6g7';
    window.onMfaCodeInput();
    expect(campo.value).toBe('123456');
  });

  it('o contador mostra a janela do TOTP e fica urgente perto do fim', () => {
    const el = document.getElementById('mfa-countdown');
    vi.setSystemTime(new Date(1_800_000_000_000)); // segundo 0 da janela
    window.iniciaContadorMfa();
    expect(el.textContent).toBe('expira em 30s');
    expect(el.classList.contains('is-urgent')).toBe(false);
    vi.advanceTimersByTime(25_000);
    expect(el.textContent).toBe('expira em 5s');
    expect(el.classList.contains('is-urgent')).toBe(true);
  });

  it('o código de recuperação troca rótulo, tamanho e teclado, e apaga o contador', () => {
    window.iniciaContadorMfa();
    window.toggleRecoveryCode();
    const campo = document.getElementById('mfa-login-code');
    expect(campo.getAttribute('maxlength')).toBe('20');
    expect(campo.getAttribute('inputmode')).toBe('text');
    expect(campo.classList.contains('mfa-code')).toBe(false);
    expect(document.getElementById('mfa-login-label').textContent).toBe('Código de recuperação');
    expect(document.getElementById('mfa-countdown').textContent).toBe('');
  });

  it('em modo recuperação NÃO envia sozinho ao chegar a 6 caracteres', () => {
    window.toggleRecoveryCode();
    apiMock.mockResolvedValue({ ok: true });
    const campo = document.getElementById('mfa-login-code');
    campo.value = 'ABC123';
    window.onMfaCodeInput();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('voltar para o autenticador restaura o campo de 6 dígitos', () => {
    window.toggleRecoveryCode();
    window.toggleRecoveryCode();
    const campo = document.getElementById('mfa-login-code');
    expect(campo.getAttribute('maxlength')).toBe('6');
    expect(campo.classList.contains('mfa-code')).toBe(true);
    expect(document.getElementById('mfa-login-label').textContent).toBe('Código');
  });
});

describe('reautenticação após expirar por inatividade', () => {
  beforeEach(() => {
    S.user = { email: 'ana@acme.com.br' };
    window.rascunhoPendente = null;
  });

  it('descreve o rascunho com rótulo em português e plural por palavra inteira', () => {
    expect(window.descreveRascunho({ registro: 'A.8.12', campos: ['status'] }))
      .toBe('A.8.12 · 1 alteração não salva — status');
    expect(window.descreveRascunho({ registro: 'A.8.12', campos: ['status', 'dono'] }))
      .toBe('A.8.12 · 2 alterações não salvas — status, dono');
  });

  it('sem rascunho não inventa texto', () => {
    expect(window.descreveRascunho(null)).toBe('');
    expect(window.descreveRascunho({ registro: 'A.8.12', campos: [] })).toBe('');
  });

  it('registrarRascunho sem campos limpa o pendente', () => {
    window.registrarRascunho('A.8.12', ['status']);
    expect(window.rascunhoPendente).not.toBeNull();
    window.registrarRascunho('A.8.12', []);
    expect(window.rascunhoPendente).toBeNull();
  });

  it('mostra o cartão com o e-mail da conta e o rascunho preservado', () => {
    window.registrarRascunho('A.8.12', ['status', 'dono']);
    window.pedirReautenticacao();
    expect(document.getElementById('reauth-box').style.display).toBe('flex');
    expect(document.getElementById('reauth-email').textContent).toBe('ana@acme.com.br');
    const linha = document.getElementById('reauth-draft');
    expect(linha.style.display).toBe('block');
    expect(linha.textContent).toContain('2 alterações não salvas');
  });

  it('sem rascunho, a linha de preservado nem aparece', () => {
    window.pedirReautenticacao();
    expect(document.getElementById('reauth-draft').style.display).toBe('none');
  });

  it('esconde os outros cartões: a reautenticação é a única saída', () => {
    window.pedirReautenticacao();
    expect(document.getElementById('standard-login-box').style.display).toBe('none');
    expect(document.getElementById('legal-accept-box').style.display).toBe('none');
  });

  // Reautenticar NAO re-renderiza a view: o rascunho vive no DOM por baixo, e
  // redesenhar seria justamente perde-lo.
  it('entra de novo com a senha e não força re-render', async () => {
    window.pedirReautenticacao();
    document.getElementById('reauth-password').value = 'senha-certa';
    apiMock.mockResolvedValue({ token: 'novo', user: { email: 'ana@acme.com.br' } });
    window.render = vi.fn();
    await window.doReauth();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/auth/login', { email: 'ana@acme.com.br', password: 'senha-certa' });
    expect(document.getElementById('reauth-box').style.display).toBe('none');
    expect(window.render).not.toHaveBeenCalled();
  });

  it('senha errada mantém o cartão e limpa o campo', async () => {
    window.pedirReautenticacao();
    document.getElementById('reauth-password').value = 'errada';
    apiMock.mockRejectedValue(erroApi('E-mail ou senha incorretos. Restam 4 tentativas antes do bloqueio temporário.'));
    await window.doReauth();
    expect(document.getElementById('reauth-box').style.display).toBe('flex');
    expect(document.getElementById('reauth-password').value).toBe('');
    expect(document.getElementById('reauth-error').textContent).toContain('E-mail ou senha incorretos');
  });
});
