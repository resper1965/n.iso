// "Trocar senha" no cartão de perfil (F7). A rota é POST /auth/change-password: pede a senha
// atual e aplica a política de senha nova no servidor (mesma do primeiro acesso, schema
// `senhaNovaSchema`), então a força não é reimplementada aqui — a mensagem do servidor
// aparece junto do campo. Trocar derruba as outras sessões; esta segue viva (o servidor recarimba).
import { api } from '../api.js';
import { openModal, forceCloseModal } from '../ui.js';

const CAMPOS = [
    { id: 'cp-atual', rotulo: 'Senha atual', auto: 'current-password' },
    { id: 'cp-nova', rotulo: 'Nova senha', auto: 'new-password', dica: 'Pelo menos 8 caracteres. Frase longa serve.' },
    { id: 'cp-confirma', rotulo: 'Confirmar nova senha', auto: 'new-password' },
];

const el = (id) => document.getElementById(id);

function limpaErros() {
    for (const c of CAMPOS) {
        el(c.id + '-erro').textContent = '';
        el(c.id).removeAttribute('aria-invalid');
    }
}

function erroEm(id, msg) {
    el(id + '-erro').textContent = msg;
    el(id).setAttribute('aria-invalid', 'true');
    el(id).focus();
}

window.openChangePasswordModal = function openChangePasswordModal() {
    openModal(`
        <form id="cp-form" data-action-submit="submitChangePassword" data-arg-event data-prevent style="padding:1.5rem 1.75rem;max-width:380px" novalidate>
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 16px">Trocar senha</h3>
            ${CAMPOS.map((c) => `
            <div class="form-group">
                <label class="form-label" for="${c.id}">${c.rotulo}</label>
                <input class="form-input" id="${c.id}" type="password" autocomplete="${c.auto}"${c.dica ? ` aria-describedby="${c.id}-dica"` : ''}>
                ${c.dica ? `<p id="${c.id}-dica" style="font-size:11px;color:var(--text-dim);margin:4px 0 0">${c.dica}</p>` : ''}
                <p class="login-error" id="${c.id}-erro" role="alert" aria-live="polite"></p>
            </div>`).join('')}
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 16px">As outras sessões abertas desta conta serão encerradas.</p>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="cp-enviar">Trocar senha</button>
            </div>
        </form>`);
    el('cp-atual').focus();
};

window.submitChangePassword = async function submitChangePassword() {
    limpaErros();
    const atual = el('cp-atual').value;
    const nova = el('cp-nova').value;
    const confirma = el('cp-confirma').value;

    if (!atual) return erroEm('cp-atual', 'Informe a senha atual');
    if (!nova) return erroEm('cp-nova', 'Informe a nova senha');
    if (nova !== confirma) return erroEm('cp-confirma', 'As senhas não coincidem');

    const botao = el('cp-enviar');
    botao.disabled = true;
    try {
        await api('POST', '/api/v1/auth/change-password', { oldPassword: atual, newPassword: nova });
        forceCloseModal();
        window.showToast('Senha alterada. As outras sessões foram encerradas.', 'success');
    } catch (e) {
        // 401 aqui é "senha atual incorreta" (api.js não desloga nesta rota). 400 é a política da senha
        // nova: o `error` do envelope é genérico ("Payload invalido"), a regra está em `details`.
        const detalhe = e.status === 400 && Array.isArray(e.body?.details) ? e.body.details.map((d) => d.message).join(' ') : '';
        erroEm(e.status === 400 ? 'cp-nova' : 'cp-atual', detalhe || e.message || 'Falha ao trocar a senha');
        botao.disabled = false;
    }
};
