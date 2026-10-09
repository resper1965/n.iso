import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';

// Ligações do registro do RoPA (fatia 4.1 e 4.2 do núcleo): base legal do catálogo, itens, departamentos, partes,
// transferências internacionais e o diagrama derivado. Toda regra é do servidor; aqui só se mostra e se chama.
// Todo texto vindo do servidor é escapado.

const PAPEIS_PARTE = { operador: 'Operador', cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Destinatário', responsavel: 'Responsável' };
const TIPOS_ITEM = { sistema: 'Sistema', ativo: 'Ativo', base: 'Base', processo: 'Processo' };
const PAIS_DAS_BASES = ['lgpd:art7', 'lgpd:art11'];

const podePedir = () => typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(S.user);
const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const base = (projectId, ropaId) => `/api/v1/projects/${projectId}/ropa/${ropaId}`;

async function acao(projectId, ropaId, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.openLigacoesTratamento(projectId, ropaId);
    } catch (e) { falha(e, padrao); }
}

/** Aprovação derivada dos pedidos: vale o pedido aprovado cujo conteúdo é o de hoje; mudar o registro ou uma ligação tira a validade. */
const textoAprovacao = (ap) => {
    if (!ap || (!ap.ciso && !ap.ceo)) return 'Sem aprovação por pedido vigente.';
    const quem = (c) => `${escapeHTML(c.por)} em ${escapeHTML(String(c.em || '').slice(0, 10))}`;
    return [ap.ciso ? `Líder SGSI: ${quem(ap.ciso)}` : '', ap.ceo ? `Direção: ${quem(ap.ceo)}` : ''].filter(Boolean).join(' · ');
};

const secao = (titulo, corpo) => `<h4 style="margin:1.25rem 0 0.5rem">${titulo}</h4>${corpo}`;
const vazio = (texto) => `<p style="color:var(--text-dim)">${texto}</p>`;

window.openLigacoesTratamento = async function (projectId, ropaId) {
    let lig;
    try { lig = await api('GET', `${base(projectId, ropaId)}/ligacoes`); } catch (e) { falha(e, 'Não foi possível abrir as ligações'); return; }
    const editar = podeEditar();
    let itens = [], deptos = [], partes = [], bases = [], diagrama = '';
    try { diagrama = (await api('GET', `${base(projectId, ropaId)}/diagrama`)).mermaid || ''; } catch (e) { /* abre sem o diagrama */ }
    if (editar) {
        try { const r = await api('GET', `/api/v1/projects/${projectId}/assets`); itens = Array.isArray(r) ? r : lista(r && r.assets); } catch (e) { /* sem seletor de itens */ }
        try { deptos = lista(await api('GET', `/api/v1/projects/${projectId}/departamentos`)); } catch (e) { /* idem */ }
        try { partes = lista(await api('GET', `/api/v1/projects/${projectId}/partes`)).filter((p) => p.status !== 'inativa'); } catch (e) { /* idem */ }
    }
    try { bases = lista(await api('GET', '/api/v1/requisitos?fonte=lgpd')).filter((r) => PAIS_DAS_BASES.includes(r.pai_id)); } catch (e) { /* sem catálogo */ }
    S.ligacoesTratamento = { itens: lig.itens.map((i) => i.id), departamentos: lig.departamentos.map((d) => d.id) };
    const finalidade = ((S.ropa || []).find((r) => r.id === ropaId) || {}).processing_purpose || '';

    const marcados = (lst, ids, rotulo, tipo) => lst.length
        ? `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:0.25rem 1rem">${lst.map((x) =>
            `<label style="display:flex; gap:0.4rem; align-items:center"><input type="checkbox" data-tl="${tipo}" value="${escapeHTML(x.id)}" ${ids.includes(x.id) ? 'checked' : ''}> ${rotulo(x)}</label>`).join('')}</div>`
        : vazio('Nada cadastrado neste projeto ainda.');

    const tabelaItens = lig.itens.length ? lig.itens.map((i) => `${escapeHTML(i.nome)} (${escapeHTML(TIPOS_ITEM[i.tipo] || i.tipo)})`).join(', ') : 'Nenhum';
    const tabelaDeptos = lig.departamentos.length ? lig.departamentos.map((d) => escapeHTML(d.nome)).join(', ') : 'Nenhum';

    openModal(`
        <h3>Ligações do tratamento</h3>
        <p style="color:var(--text-dim)">${escapeHTML(finalidade)}</p>
        ${secao('Aprovação', `<p id="tl-aprovacao">${textoAprovacao(lig.aprovacao)}</p>
            ${podePedir() ? `<button class="btn btn-sm" data-action="pedirAprovacaoTratamento" data-args='${args(projectId, ropaId)}'>Pedir aprovação</button>` : ''}`)}
        ${secao('Base legal', `
            <p id="tl-base-atual">${lig.base_legal ? `${escapeHTML(lig.base_legal.referencia)} — ${escapeHTML(lig.base_legal.titulo)}` : 'Não definida'}</p>
            ${editar && bases.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end"><div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-base">Base legal do catálogo</label>
                <select class="form-input" id="tl-base"><option value="">— sem base do catálogo —</option>${bases.map((b) =>
                    `<option value="${escapeHTML(b.id)}" ${lig.base_legal && lig.base_legal.id === b.id ? 'selected' : ''}>${escapeHTML(b.referencia)} — ${escapeHTML(b.titulo)}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="salvarBaseLegalTratamento" data-args='${args(projectId, ropaId)}'>Salvar</button></div>`
                : (editar ? vazio('O catálogo da LGPD ainda não tem as bases legais carregadas; vale o texto livre do registro.') : '')}`)}
        ${secao('Sistemas, bases e processos', editar
            ? `<div id="tl-itens">${marcados(itens, S.ligacoesTratamento.itens, (x) => `${escapeHTML(x.nome || x.name || '')}${x.tipo ? ` (${escapeHTML(TIPOS_ITEM[x.tipo] || x.tipo)})` : ''}`, 'item')}</div>
               <button class="btn btn-sm" style="margin-top:0.5rem" data-action="salvarItensTratamento" data-args='${args(projectId, ropaId)}'>Salvar itens</button>`
            : `<p id="tl-itens">${tabelaItens}</p>`)}
        ${secao('Departamentos', editar
            ? `<div id="tl-deptos">${marcados(deptos, S.ligacoesTratamento.departamentos, (x) => escapeHTML(x.nome), 'depto')}</div>
               <button class="btn btn-sm" style="margin-top:0.5rem" data-action="salvarDepartamentosTratamento" data-args='${args(projectId, ropaId)}'>Salvar departamentos</button>`
            : `<p id="tl-deptos">${tabelaDeptos}</p>`)}
        ${secao('Partes', `<div id="tl-partes">
            ${lig.partes.length ? `<table class="data-table"><thead><tr><th>Parte</th><th>Papel</th><th></th></tr></thead><tbody>${lig.partes.map((p) =>
                `<tr><td>${escapeHTML(p.nome)}</td><td>${escapeHTML(PAPEIS_PARTE[p.papel] || p.papel)}</td><td style="text-align:right">${editar
                    ? `<button class="btn btn-ghost btn-sm" data-action="removerParteTratamento" data-args='${args(projectId, ropaId, p.parte_id, p.vinculo_id)}'>Remover</button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : vazio('Nenhuma parte ligada.')}
            ${editar && partes.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem; flex-wrap:wrap">
                <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tl-parte">Parte</label><select class="form-input" id="tl-parte">${partes.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-papel">Papel</label><select class="form-input" id="tl-papel">${Object.entries(PAPEIS_PARTE).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="adicionarParteTratamento" data-args='${args(projectId, ropaId)}'>Ligar parte</button></div>` : ''}</div>`)}
        ${secao('Transferências internacionais', `<div id="tl-transf">
            ${lig.transferencias.length ? `<table class="data-table"><thead><tr><th>País</th><th>Destinatário</th><th>Mecanismo</th><th></th></tr></thead><tbody>${lig.transferencias.map((t) =>
                `<tr><td>${escapeHTML(t.pais)}</td><td>${escapeHTML(t.destinatario || '—')}</td><td>${escapeHTML(t.mecanismo || '—')}</td><td style="text-align:right">${editar
                    ? `<button class="btn btn-ghost btn-sm" data-action="removerTransferenciaTratamento" data-args='${args(projectId, ropaId, t.id)}'>Remover</button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : vazio('Nenhuma transferência registrada.')}
            ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem; flex-wrap:wrap">
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-pais">País</label><input class="form-input" id="tl-pais" maxlength="100"></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-dest">Destinatário</label><select class="form-input" id="tl-dest"><option value="">— não informado —</option>${partes.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tl-mec">Mecanismo</label><input class="form-input" id="tl-mec" maxlength="300"></div>
                <button class="btn btn-sm" data-action="adicionarTransferenciaTratamento" data-args='${args(projectId, ropaId)}'>Registrar</button></div>` : ''}</div>`)}
        ${secao('Diagrama', `<p style="color:var(--text-dim)">Gerado das ligações acima; muda quando elas mudam. Cole em qualquer visualizador de Mermaid.</p>
            <pre id="tl-diagrama" style="white-space:pre-wrap; max-height:240px; overflow:auto; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:0.75rem">${escapeHTML(diagrama)}</pre>
            ${diagrama ? '<button class="btn btn-ghost btn-sm" data-action="copiarDiagramaTratamento">Copiar diagrama</button>' : ''}`)}
    `, 'modal-large');
};

const marcadosDe = (tipo) => [...document.querySelectorAll(`input[data-tl="${tipo}"]:checked`)].map((i) => i.value);

window.pedirAprovacaoTratamento = (projectId, ropaId) => window.abrirPedidoAprovacao(projectId, 'tratamento', ropaId);

window.salvarItensTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('PUT', `${base(projectId, ropaId)}/itens`, { itens: marcadosDe('item') }), 'Não foi possível salvar os itens', 'Itens salvos.');

window.salvarDepartamentosTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('PUT', `${base(projectId, ropaId)}/departamentos`, { departamentos: marcadosDe('depto') }), 'Não foi possível salvar os departamentos', 'Departamentos salvos.');

window.salvarBaseLegalTratamento = (projectId, ropaId) => {
    const registro = (S.ropa || []).find((r) => r.id === ropaId) || {};
    return acao(projectId, ropaId,
        () => api('PUT', `/api/v1/ropa/${ropaId}`, { processing_purpose: registro.processing_purpose, base_legal_id: el('tl-base').value || null }),
        'Não foi possível salvar a base legal', 'Base legal salva.');
};

window.adicionarParteTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('POST', `/api/v1/projects/${projectId}/partes/${el('tl-parte').value}/vinculos`, { papel: el('tl-papel').value, alvo_tipo: 'tratamento', alvo_id: ropaId }),
    'Não foi possível ligar a parte', 'Parte ligada.');

window.removerParteTratamento = (projectId, ropaId, parteId, vinculoId) => acao(projectId, ropaId,
    () => api('DELETE', `/api/v1/projects/${projectId}/partes/${parteId}/vinculos/${vinculoId}`), 'Não foi possível remover a parte', 'Parte removida.');

window.adicionarTransferenciaTratamento = function (projectId, ropaId) {
    const pais = el('tl-pais').value.trim();
    if (!pais) { showToast('Informe o país', 'error'); return; }
    return acao(projectId, ropaId, () => api('POST', `${base(projectId, ropaId)}/transferencias`, {
        pais, destinatario_parte_id: el('tl-dest').value || null, mecanismo: el('tl-mec').value.trim() || null,
    }), 'Não foi possível registrar a transferência', 'Transferência registrada.');
};

window.removerTransferenciaTratamento = (projectId, ropaId, id) => acao(projectId, ropaId,
    () => api('DELETE', `${base(projectId, ropaId)}/transferencias/${id}`), 'Não foi possível remover a transferência', 'Transferência removida.');

window.copiarDiagramaTratamento = async function () {
    const texto = el('tl-diagrama').textContent;
    try { await navigator.clipboard.writeText(texto); showToast('Diagrama copiado.', 'success'); }
    catch (e) {
        const faixa = document.createRange(); faixa.selectNodeContents(el('tl-diagrama'));
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(faixa);
        showToast('Selecionado: use Ctrl+C para copiar.', 'info');
    }
};
