// Acesso do auditor externo (P5), dentro de Auditorias. A consultoria gera um link com prazo, vê os
// que estão valendo e revoga. O link (token no fragmento) aparece UMA vez, logo depois de gerado: o
// servidor guarda só o SHA-256 e não consegue mostrá-lo de novo. Rotas: src/routes/projects.ts.
import { api } from '../api.js';
import { showToast, escapeHTML } from '../ui.js';

// Mesmo conjunto de ehEquipeNess (src/helpers.ts): o servidor recusa os demais com 403.
const EQUIPE = new Set(['platform_admin', 'consultor', 'consultant', 'consultoria_admin']);
const args = (...a) => escapeHTML(JSON.stringify(a));

/** 'AAAA-MM-DD HH:MM:SS' (UTC, do SQLite) -> DD/MM/AAAA em Brasília. */
function dataBR(s) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + (/[zZ]$/.test(s) ? '' : 'Z'));
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function listar(el, projectId) {
    if (!el) return;
    let tokens;
    try {
        const r = await api('GET', `/api/v1/projects/${projectId}/auditor-token`);
        tokens = Array.isArray(r?.tokens) ? r.tokens : [];
    } catch (e) {
        el.innerHTML = `<p class="text-muted">Não foi possível carregar os links: ${escapeHTML(e.message)}</p>`;
        return;
    }
    if (!tokens.length) {
        el.innerHTML = '<p class="text-muted">Nenhum link válido agora.</p>';
        return;
    }
    el.innerHTML = window.renderDataTable(
        ['Criado por', 'Criado em', 'Válido até', ''],
        tokens.map((t) => [
            escapeHTML(t.created_by || '—'),
            escapeHTML(dataBR(t.created_at)),
            escapeHTML(dataBR(t.expires_at)),
            `<button class="btn btn-ghost btn-sm" data-action="revogarAcessoAuditor" data-args='${args(projectId, t.id)}'>Revogar</button>`,
        ]),
    );
}

export async function renderAcessoAuditor(el, projectId, role) {
    if (!el) return;
    if (!EQUIPE.has(role)) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <section class="card" aria-labelledby="aud-ext-titulo" style="margin-top:1.5rem;padding:1.25rem">
            <h3 id="aud-ext-titulo" style="margin:0 0 .25rem">Acesso do auditor externo</h3>
            <p class="text-muted" style="margin:0 0 1rem">O link dá ao auditor do organismo certificador leitura da SoA e das evidências deste projeto até o prazo. Revogue quando a auditoria terminar.</p>
            <div style="display:flex;gap:.75rem;align-items:flex-end">
                <div class="form-group" style="margin:0">
                    <label class="form-label" for="aud-ext-dias">Validade em dias (1 a 365)</label>
                    <input class="form-input" id="aud-ext-dias" type="number" min="1" max="365" step="1" value="30" style="width:8rem">
                </div>
                <button class="btn btn-primary" data-action="gerarAcessoAuditor" data-args='${args(projectId)}'>Gerar link</button>
            </div>
            <p id="aud-ext-erro" role="alert" style="color:var(--danger);margin:.5rem 0 0"></p>
            <div id="aud-ext-novo" role="status" aria-live="polite"></div>
            <h4 style="margin:1.25rem 0 .5rem">Links válidos</h4>
            <div id="aud-ext-lista"></div>
        </section>`;
    await listar(el.querySelector('#aud-ext-lista'), projectId);
}

window.gerarAcessoAuditor = async function (projectId) {
    const erro = document.getElementById('aud-ext-erro');
    const dias = Number(document.getElementById('aud-ext-dias')?.value);
    erro.textContent = '';
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        erro.textContent = 'Informe a validade em dias, de 1 a 365.';
        return;
    }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/auditor-token`, { days_valid: dias });
        document.getElementById('aud-ext-novo').innerHTML = `
            <div style="margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:10px">
                <label class="form-label" for="aud-ext-link">Link do auditor, válido até ${escapeHTML(dataBR(r.expires_at))}</label>
                <div style="display:flex;gap:.5rem">
                    <input class="form-input" id="aud-ext-link" readonly value="${escapeHTML(r.url)}">
                    <button class="btn btn-ghost" data-action="copiarLinkAuditor">Copiar</button>
                </div>
                <p class="text-muted" style="margin:.5rem 0 0">Copie agora: o link não aparece de novo. Envie-o só ao auditor, por canal seguro.</p>
            </div>`;
        await listar(document.getElementById('aud-ext-lista'), projectId);
    } catch (e) {
        erro.textContent = e.message || 'Não foi possível gerar o link.';
    }
};

window.revogarAcessoAuditor = async function (projectId, tokenId) {
    if (!confirm('Revogar este link? O auditor perde o acesso na hora.')) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/auditor-token/${tokenId}/revogar`);
        showToast('Link revogado');
        await listar(document.getElementById('aud-ext-lista'), projectId);
    } catch (e) {
        showToast(e.message || 'Não foi possível revogar o link', 'error');
    }
};

window.copiarLinkAuditor = async function () {
    const campo = document.getElementById('aud-ext-link');
    if (!campo) return;
    try {
        await navigator.clipboard.writeText(campo.value);
        showToast('Link copiado');
    } catch {
        campo.select();
        showToast('Selecione o link e copie com Ctrl+C');
    }
};
