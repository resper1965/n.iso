import { api } from '../api.js';
import { S } from '../state.js';
import { openModal, forceCloseModal, showToast, escapeHTML } from '../ui.js';
import qrcode from 'qrcode-generator';

/**
 * Segundo fator (TOTP) — autoatendimento do próprio usuário.
 *
 * A API do MFA existia e estava testada desde o PR #31, mas sem tela ninguém
 * ativava: o segundo fator estava desligado para todos os usuários. Este módulo
 * é o que fecha esse buraco.
 *
 * Não vive na página de Configurações de propósito: aquela é escondida para
 * papéis de cliente (`nav-settings` some para `org_admin`, `org_user` e
 * `client`), e segurança da própria conta é de todo mundo. Fica no cartão de
 * perfil do rodapé da barra lateral, que todo papel enxerga.
 */

/** Gera o QR como data URI. O CSP permite `img-src data:`, e não script externo. */
function qrDataUri(texto) {
  const g = qrcode(0, 'M');
  g.addData(texto);
  g.make();
  return g.createDataURL(5, 8);
}

const CAIXA = 'padding:1.5rem;max-width:420px';
const TITULO = "font-family:'Montserrat',sans-serif;margin-bottom:0.5rem";
const AJUDA = 'font-size:0.75rem;color:var(--text-dim);line-height:1.5;margin-bottom:1.25rem';
const ERRO = 'color:var(--danger);font-size:0.75rem;margin-top:0.75rem;min-height:1rem';

function mostraErro(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

/** Ponto de entrada: decide a tela pelo estado atual do MFA. */
window.openSecurityModal = async function openSecurityModal() {
  openModal(`<div style="${CAIXA}"><div class="loading"></div></div>`);
  let st;
  try {
    st = await api('GET', '/api/v1/auth/mfa/status');
  } catch (e) {
    openModal(`<div style="${CAIXA}">
      <h3 style="${TITULO}">Autenticação em duas etapas</h3>
      <p style="${ERRO}">${escapeHTML(e.message)}</p>
      <button class="btn" data-action="forceCloseModal" style="margin-top:1rem">Fechar</button>
    </div>`);
    return;
  }
  if (st.ativo) telaAtivo(st.codigos_recuperacao_restantes);
  else telaInativo();
};

/** MFA desligado: pede a senha para começar. */
function telaInativo() {
  openModal(`<div style="${CAIXA}">
    <h3 style="${TITULO}">Autenticação em duas etapas</h3>
    <p style="${AJUDA}">
      Está <strong>desativada</strong>. Com ela, entrar exige a sua senha e um código
      de 6 dígitos gerado no seu celular — uma senha vazada deixa de ser suficiente.
    </p>
    <div class="form-group">
      <label class="form-label">Confirme sua senha</label>
      <input type="password" id="mfa-setup-pass" class="form-input" autocomplete="current-password"
             placeholder="••••••••" data-action-keydown="doMfaSetup" data-key="Enter">
    </div>
    <p style="font-size:0.7rem;color:var(--muted);margin-bottom:1rem">
      Pedimos a senha porque vincular um autenticador é tão sensível quanto desligá-lo:
      sem isso, uma sessão roubada vincularia o aparelho de outra pessoa.
    </p>
    <div id="mfa-erro" style="${ERRO}"></div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem">
      <button class="btn btn-primary" data-action="doMfaSetup">Ativar</button>
      <button class="btn" data-action="forceCloseModal">Cancelar</button>
    </div>
  </div>`);
  setTimeout(() => document.getElementById('mfa-setup-pass')?.focus(), 50);
}

/** Etapa 1: gera o segredo e mostra o QR. Ainda NÃO ativa. */
window.doMfaSetup = async function doMfaSetup() {
  const senha = document.getElementById('mfa-setup-pass')?.value || '';
  if (!senha) return mostraErro('mfa-erro', 'Informe sua senha.');
  mostraErro('mfa-erro', '');
  try {
    const r = await api('POST', '/api/v1/auth/mfa/setup', { password: senha });
    telaQr(r.secret, r.otpauth_url);
  } catch (e) {
    mostraErro('mfa-erro', e.message);
  }
};

/** Etapa 2: escanear e confirmar um código. Só aqui o MFA liga. */
function telaQr(secret, otpauthUrl) {
  openModal(`<div style="${CAIXA}">
    <h3 style="${TITULO}">Escaneie o código</h3>
    <p style="${AJUDA}">
      Abra seu autenticador (Google Authenticator, Authy, 1Password, Bitwarden…),
      escaneie o QR e digite o código de 6 dígitos que aparecer.
    </p>
    <div style="text-align:center;margin-bottom:1rem">
      <img src="${qrDataUri(otpauthUrl)}" alt="QR code para configurar o segundo fator"
           style="background:#fff;padding:8px;border-radius:8px;max-width:100%">
    </div>
    <details style="margin-bottom:1rem">
      <summary style="font-size:0.75rem;color:var(--accent);cursor:pointer">Não consegue escanear?</summary>
      <p style="font-size:0.7rem;color:var(--text-dim);margin:0.5rem 0 0.25rem">
        Digite esta chave manualmente no aplicativo:
      </p>
      <code style="display:block;word-break:break-all;font-size:0.75rem;background:var(--surface);
                   padding:0.5rem;border-radius:6px;user-select:all">${escapeHTML(secret)}</code>
    </details>
    <div class="form-group">
      <label class="form-label">Código de 6 dígitos</label>
      <input type="text" id="mfa-codigo" class="form-input" inputmode="numeric" maxlength="6"
             autocomplete="one-time-code" placeholder="000000"
             style="text-align:center;letter-spacing:6px;font-weight:600"
             data-action-keydown="doMfaActivate" data-key="Enter">
    </div>
    <div id="mfa-erro" style="${ERRO}"></div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem">
      <button class="btn btn-primary" data-action="doMfaActivate">Confirmar e ativar</button>
      <button class="btn" data-action="forceCloseModal">Cancelar</button>
    </div>
  </div>`);
  setTimeout(() => document.getElementById('mfa-codigo')?.focus(), 50);
}

window.doMfaActivate = async function doMfaActivate() {
  const codigo = (document.getElementById('mfa-codigo')?.value || '').trim();
  if (codigo.length !== 6) return mostraErro('mfa-erro', 'O código tem 6 dígitos.');
  mostraErro('mfa-erro', '');
  try {
    const r = await api('POST', '/api/v1/auth/mfa/activate', { codigo });
    // `api()` desembrulha respostas `{ ok:true, X:[...] }` e devolve o ARRAY
    // direto — então aqui `r` já é a lista, e `r.recovery_codes` seria
    // undefined. Aceitar as duas formas evita depender desse detalhe: exibir
    // uma lista vazia aqui perderia os códigos para sempre, porque o servidor
    // guarda só o SHA-256 e nunca os mostra de novo.
    const codigos = Array.isArray(r) ? r : (r && r.recovery_codes) || [];
    if (!codigos.length) return telaSemCodigos();
    telaCodigosRecuperacao(codigos);
  } catch (e) {
    mostraErro('mfa-erro', e.message);
  }
};

/**
 * O MFA ligou mas os códigos não vieram. Falha rara, e cara: sem eles, perder o
 * celular vira perder a conta. Melhor dizer isso em voz alta do que mostrar uma
 * caixa vazia e deixar o usuário achar que está tudo bem.
 */
function telaSemCodigos() {
  openModal(`<div style="${CAIXA}">
    <h3 style="${TITULO}">Segundo fator ativado — sem códigos de recuperação</h3>
    <p style="${AJUDA}">
      O segundo fator está <strong>ativo</strong>, mas os códigos de recuperação não
      chegaram nesta resposta e não podem ser recuperados depois.
    </p>
    <p style="${AJUDA}">
      <strong>Desative e ative de novo</strong> para gerar uma lista nova, e anote-a
      antes de fechar. Sem os códigos, perder o acesso ao autenticador significa
      perder a conta.
    </p>
    <button class="btn btn-primary" data-action="openSecurityModal">Gerenciar segundo fator</button>
  </div>`);
}

/**
 * Códigos de recuperação — exibidos UMA vez.
 *
 * O servidor guarda só o SHA-256 deles, então esta é literalmente a única
 * oportunidade de anotá-los. Sem eles, perder o celular vira perder a conta.
 */
function telaCodigosRecuperacao(codigos) {
  const lista = (codigos || []).map(c => `<div style="user-select:all">${escapeHTML(c)}</div>`).join('');
  openModal(`<div style="${CAIXA}">
    <h3 style="${TITULO}">Segundo fator ativado</h3>
    <p style="${AJUDA}">
      <strong>Guarde estes códigos agora.</strong> Cada um serve uma única vez para entrar
      se você perder o acesso ao autenticador. Eles não podem ser exibidos de novo —
      o servidor guarda apenas o hash.
    </p>
    <div style="font-family:monospace;font-size:0.85rem;background:var(--surface);padding:1rem;
                border-radius:8px;line-height:1.9;letter-spacing:1px;margin-bottom:1rem">${lista}</div>
    <div style="display:flex;gap:0.75rem">
      <button class="btn btn-primary" data-action="baixarCodigosMfa">Baixar .txt</button>
      <button class="btn" data-action="forceCloseModal">Já guardei</button>
    </div>
  </div>`);
  window._mfaCodigos = codigos;
}

window.baixarCodigosMfa = function baixarCodigosMfa() {
  const codigos = window._mfaCodigos || [];
  const texto = [
    'nISO — códigos de recuperação do segundo fator',
    `Conta: ${S.user?.email || ''}`,
    `Gerados em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    'Cada código serve UMA única vez. Guarde em local seguro.',
    '',
    ...codigos,
  ].join('\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'niso-codigos-recuperacao.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Códigos baixados', 'success');
};

/** MFA ligado: mostra o estado e permite desativar. */
function telaAtivo(restantes) {
  const poucos = (restantes ?? 0) <= 2;
  openModal(`<div style="${CAIXA}">
    <h3 style="${TITULO}">Autenticação em duas etapas</h3>
    <p style="font-size:0.8rem;color:var(--success, #22c55e);margin-bottom:1rem">● Ativa</p>
    <p style="${AJUDA}">
      Códigos de recuperação restantes: <strong>${restantes ?? 0}</strong>.
      ${poucos ? '<br><span style="color:var(--danger)">Estão acabando. Desative e ative de novo para gerar uma lista nova.</span>' : ''}
    </p>
    <div class="form-group">
      <label class="form-label">Para desativar, confirme sua senha</label>
      <input type="password" id="mfa-off-pass" class="form-input" autocomplete="current-password"
             placeholder="••••••••" data-action-keydown="doMfaDisable" data-key="Enter">
    </div>
    <p style="font-size:0.7rem;color:var(--muted);margin-bottom:1rem">
      Desativar encerra <strong>todas as suas sessões abertas</strong>, inclusive esta:
      elas foram estabelecidas sob a garantia antiga. Você precisará entrar de novo.
    </p>
    <div id="mfa-erro" style="${ERRO}"></div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem">
      <button class="btn btn-danger" data-action="doMfaDisable">Desativar</button>
      <button class="btn" data-action="forceCloseModal">Fechar</button>
    </div>
  </div>`);
}

window.doMfaDisable = async function doMfaDisable() {
  const senha = document.getElementById('mfa-off-pass')?.value || '';
  if (!senha) return mostraErro('mfa-erro', 'Informe sua senha.');
  mostraErro('mfa-erro', '');
  try {
    await api('POST', '/api/v1/auth/mfa/disable', { password: senha });
    forceCloseModal();
    showToast('Segundo fator desativado. Entre novamente.', 'info');
    // A sessão atual foi revogada junto com as outras — sair é o único caminho
    // honesto. Sem isto, a próxima chamada tomaria 401 e o usuário veria um
    // erro genérico sem entender o motivo.
    if (window.doLogout) window.doLogout();
  } catch (e) {
    mostraErro('mfa-erro', e.message);
  }
};
