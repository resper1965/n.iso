import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';

// Terceiros (fatia 6 do núcleo): organizações com tipo, o método que o tipo define, a avaliação com validade e o DPA ligado.
// Toda regra é do servidor; aqui só se mostra e se chama. Todo texto vindo do servidor é escapado.

const TIPOS = { grande_provedor: 'Grande provedor', medio: 'Médio', pequeno: 'Pequeno', critico: 'Crítico' };
const METODOS = { trust_center: 'Trust center', questionario: 'Questionário', auditoria: 'Auditoria' };
const RESULTADOS = { aprovado: 'Aprovado', com_ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado' };
const SITUACOES = { pendente: ['Pendente', 'neutral'], vigente: ['Vigente', 'success'], vencida: ['Vencida', 'danger'], reprovada: ['Reprovada', 'danger'] };
const PAPEIS_DOC = { dpa: 'DPA', contrato: 'Contrato', outro: 'Outro' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dataBr = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '—');
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Só link http(s) vira âncora; qualquer outra coisa (javascript:, data:) aparece como texto. */
const linkSeguro = (u) => (/^https?:\/\/\S+$/i.test(String(u || '')) ? `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(u)}</a>` : escapeHTML(u || ''));

async function renderTerceiros(c, h, a) {
    h.textContent = 'Terceiros';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    let terceiros = [];
    try { terceiros = lista(await api('GET', `/api/v1/projects/${proj.id}/terceiros`)); } catch (e) { /* tabela vazia e aviso abaixo */ }
    const vencidos = terceiros.filter((t) => t.situacao === 'vencida').length;
    const aviso = vencidos ? `<p style="color:var(--danger)">${escapeHTML(String(vencidos))} ${vencidos === 1 ? 'terceiro com avaliação vencida' : 'terceiros com avaliação vencida'}.</p>` : '';
    const linhas = terceiros.map((t) => {
        const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
        return [
            `<strong>${escapeHTML(t.nome)}</strong>`,
            escapeHTML(TIPOS[t.terceiro_tipo] || '—'),
            escapeHTML(METODOS[t.metodo] || '—'),
            window.renderStatusBadge(rotulo, tom),
            escapeHTML(t.ultima_avaliacao ? dataBr(t.ultima_avaliacao.valido_ate) : '—'),
            escapeHTML(String(t.tratamentos)),
            escapeHTML(String(t.documentos)),
            `<button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(proj.id, t.id)}'>Abrir</button>`,
        ];
    });
    c.innerHTML = aviso + window.renderDataTable(
        ['Terceiro', 'Tipo', 'Método', 'Avaliação', 'Vale até', 'Tratamentos', 'Documentos', 'Ações'],
        linhas,
        { emptyState: 'Nenhuma organização cadastrada em Partes. Importe os fornecedores na tela Partes para avaliá-los aqui.' },
    );
}

window.abrirTerceiro = async function (projectId, parteId) {
    let t;
    try { t = await api('GET', `/api/v1/projects/${projectId}/terceiros/${parteId}`); } catch (e) { falha(e, 'Não foi possível abrir o terceiro'); return; }
    const editar = podeEditar();
    let documentos = [];
    if (editar) { try { documentos = lista(await api('GET', `/api/v1/projects/${projectId}/documentos`)); } catch (e) { /* sem seletor de documento */ } }
    const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
    const hist = lista(t.historico);
    const ligados = lista(t.documentos_ligados);

    openModal(`
        <h3>${escapeHTML(t.nome)}</h3>
        <p>${window.renderStatusBadge(rotulo, tom)} ${t.ultima_avaliacao ? `válida até ${escapeHTML(dataBr(t.ultima_avaliacao.valido_ate))}` : 'nunca avaliado'}</p>
        <h4 style="margin:1.25rem 0 0.5rem">Tipo e método</h4>
        <div id="tc-tipo">
            ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end"><div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-tipo-sel">Tipo do terceiro</label>
                <select class="form-input" id="tc-tipo-sel"><option value="">— sem tipo —</option>${Object.entries(TIPOS).map(([v, r]) => `<option value="${v}" ${t.terceiro_tipo === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="salvarTipoTerceiro" data-args='${args(projectId, parteId)}'>Salvar</button></div>`
                : `<p>${escapeHTML(TIPOS[t.terceiro_tipo] || 'Sem tipo')}</p>`}
            <p style="color:var(--text-dim)">${t.metodo ? `O tipo define o método de avaliação: <strong>${escapeHTML(METODOS[t.metodo])}</strong>.` : 'Defina o tipo para saber o método de avaliação.'}</p>
        </div>
        ${editar && t.terceiro_tipo ? `<h4 style="margin:1.25rem 0 0.5rem">Nova avaliação</h4><div id="tc-nova" style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-res">Resultado</label><select class="form-input" id="tc-res">${Object.entries(RESULTADOS).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-val">Vale até</label><input class="form-input" id="tc-val" type="date"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-url">Evidência (link)</label><input class="form-input" id="tc-url" maxlength="2000" placeholder="https://"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-obs">Observação</label><input class="form-input" id="tc-obs" maxlength="2000"></div>
            <button class="btn btn-primary btn-sm" data-action="registrarAvaliacaoTerceiro" data-args='${args(projectId, parteId)}'>Registrar</button></div>` : ''}
        <h4 style="margin:1.25rem 0 0.5rem">Histórico de avaliações</h4>
        <div id="tc-historico">${hist.length ? `<table class="data-table"><thead><tr><th>Em</th><th>Método</th><th>Resultado</th><th>Vale até</th><th>Evidência</th><th>Por</th></tr></thead><tbody>${hist.map((x) =>
            `<tr><td>${escapeHTML(String(x.created_at || '').slice(0, 10))}</td><td>${escapeHTML(METODOS[x.metodo] || x.metodo)}</td><td>${escapeHTML(RESULTADOS[x.resultado] || x.resultado)}</td><td>${escapeHTML(dataBr(x.valido_ate))}</td><td>${linkSeguro(x.evidencia_url)}</td><td>${escapeHTML(x.avaliado_por || '')}</td></tr>`).join('')}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhuma avaliação registrada.</p>'}</div>
        <h4 style="margin:1.25rem 0 0.5rem">DPA e contratos</h4>
        <div id="tc-docs">${ligados.length ? `<table class="data-table"><tbody>${ligados.map((d) =>
            `<tr><td>${escapeHTML(d.titulo)}</td><td>${escapeHTML(PAPEIS_DOC[d.papel] || d.papel)}</td><td style="text-align:right">${editar
                ? `<button class="btn btn-ghost btn-sm" data-action="desligarDocumentoTerceiro" data-args='${args(projectId, parteId, d.id, d.papel)}'>Desligar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhum documento ligado.</p>'}
            ${editar && documentos.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem"><div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-doc">Documento</label>
                <select class="form-input" id="tc-doc">${documentos.map((d) => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.titulo)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-doc-papel">Papel</label><select class="form-input" id="tc-doc-papel">${Object.entries(PAPEIS_DOC).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="ligarDocumentoTerceiro" data-args='${args(projectId, parteId)}'>Ligar</button></div>` : ''}</div>
        <h4 style="margin:1.25rem 0 0.5rem">Suboperadores</h4>
        <div id="tc-subs">${lista(t.suboperadores).length ? lista(t.suboperadores).map((s) => escapeHTML(s.nome)).join(', ') : '<span style="color:var(--text-dim)">Nenhum.</span>'}</div>
        <h4 style="margin:1.25rem 0 0.5rem">Tratamentos que usam este terceiro</h4>
        <div id="tc-trat">${lista(t.tratamentos_afetados).length ? lista(t.tratamentos_afetados).map((r) => escapeHTML(r.finalidade)).join('; ') : '<span style="color:var(--text-dim)">Nenhum.</span>'}</div>
    `, 'modal-large');
};

async function acao(projectId, parteId, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.abrirTerceiro(projectId, parteId);
        window.render();
    } catch (e) { falha(e, padrao); }
}

window.salvarTipoTerceiro = (projectId, parteId) => acao(projectId, parteId,
    () => api('PUT', `/api/v1/projects/${projectId}/terceiros/${parteId}/tipo`, { terceiro_tipo: el('tc-tipo-sel').value || null }), 'Não foi possível salvar o tipo', 'Tipo salvo.');

window.registrarAvaliacaoTerceiro = function (projectId, parteId) {
    const validoAte = el('tc-val').value;
    if (!validoAte) { showToast('Informe até quando a avaliação vale', 'error'); return; }
    return acao(projectId, parteId, () => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/avaliacoes`, {
        resultado: el('tc-res').value, valido_ate: validoAte, evidencia_url: el('tc-url').value.trim() || null, observacao: el('tc-obs').value.trim() || null,
    }), 'Não foi possível registrar a avaliação', 'Avaliação registrada.');
};

window.ligarDocumentoTerceiro = (projectId, parteId) => acao(projectId, parteId,
    () => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos`, { documento_id: el('tc-doc').value, papel: el('tc-doc-papel').value }), 'Não foi possível ligar o documento', 'Documento ligado.');

window.desligarDocumentoTerceiro = (projectId, parteId, documentoId, papel) => acao(projectId, parteId,
    () => api('DELETE', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos/${documentoId}?papel=${encodeURIComponent(papel)}`), 'Não foi possível desligar o documento', 'Documento desligado.');

window.renderTerceiros = renderTerceiros;
