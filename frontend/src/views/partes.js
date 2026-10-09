import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';

// Partes e departamentos do projeto (fatia 1.4 do núcleo). O cadastro existe para o responsável de risco,
// controle, ativo e tratamento apontar para uma pessoa ou organização, e não para um texto digitado.
// Vínculos nascem da importação (governança, fornecedores, partes interessadas); criar vínculo à mão fica
// na API e no agente até uma tela pedir.

const PAPEIS = {
    encarregado: 'Encarregado', dono_processo: 'Dono de processo', dono_sistema: 'Dono de sistema', operador: 'Operador',
    cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Terceiro', responsavel: 'Responsável',
    parte_interessada: 'Parte interessada',
};
const ALVOS = { projeto: 'projeto', item: 'ativo', departamento: 'departamento', tratamento: 'tratamento', parte: 'parte' };
const TIPOS = { pessoa: 'Pessoa', organizacao: 'Organização' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);

async function renderPartes(c, h, a) {
    h.textContent = 'Partes e departamentos';
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    const editar = podeEditar();
    a.innerHTML = editar
        ? `<button class="btn" data-action="importarPartes" data-args='["${proj.id}"]'>Importar do projeto</button>
           <button class="btn" data-action="conciliarPartes" data-args='["${proj.id}"]'>Conciliar responsáveis</button>
           <button class="btn" data-action="openNovoDepartamentoModal" data-args='["${proj.id}"]'>+ Departamento</button>
           <button class="btn btn-primary" data-action="openNovaParteModal" data-args='["${proj.id}"]'>+ Nova parte</button>`
        : '';

    let partes = [];
    let departamentos = [];
    try { partes = lista(await api('GET', `/api/v1/projects/${proj.id}/partes`)); } catch (e) { /* tabela vazia e aviso abaixo */ }
    try { departamentos = lista(await api('GET', `/api/v1/projects/${proj.id}/departamentos`)); } catch (e) { /* idem */ }
    S.partes = partes;

    const tabelaPartes = window.renderDataTable(
        ['Nome', 'Tipo', 'E-mail', 'Situação', 'Ações'],
        partes.map(p => [
            `<strong>${escapeHTML(p.nome)}</strong>`,
            escapeHTML(TIPOS[p.tipo] || p.tipo),
            escapeHTML(p.email || '—'),
            window.renderStatusBadge(p.status === 'ativa' ? 'Ativa' : 'Inativa', p.status === 'ativa' ? 'success' : 'info'),
            `<button class="btn btn-ghost btn-sm" data-action="openParteModal" data-args='["${proj.id}","${escapeHTML(p.id)}"]'>${editar ? 'Abrir' : 'Detalhes'}</button>`,
        ]),
        { emptyState: 'Nenhuma parte cadastrada. Use "Importar do projeto" para trazer governança, fornecedores e partes interessadas.' }
    );
    const tabelaDeptos = window.renderDataTable(
        ['Departamento', 'Situação'],
        departamentos.map(d => [
            `<strong>${escapeHTML(d.nome)}</strong>`,
            window.renderStatusBadge(d.status === 'ativo' ? 'Ativo' : 'Inativo', d.status === 'ativo' ? 'success' : 'info'),
        ]),
        { emptyState: 'Nenhum departamento cadastrado.' }
    );
    c.innerHTML = `
        <h3 style="margin-bottom:0.75rem">Partes</h3>
        ${tabelaPartes}
        <h3 style="margin:1.5rem 0 0.75rem">Departamentos</h3>
        ${tabelaDeptos}`;
}

// Mensagem do servidor quando existe (409 de duplicata, 400 de validação), senão a genérica.
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

window.openNovaParteModal = function (projectId) {
    openModal(`
        <div class="modal-header"><span class="modal-title">Nova parte</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label">Tipo</label>
            <select class="form-input" id="parte-tipo"><option value="pessoa">Pessoa</option><option value="organizacao">Organização</option></select></div>
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="parte-nome" maxlength="200"></div>
        <div class="form-group"><label class="form-label">E-mail (opcional)</label><input class="form-input" id="parte-email" type="email" maxlength="320"></div>
        <button class="btn btn-primary" style="width:100%" data-action="criarParte" data-args='["${projectId}"]'>Cadastrar</button>
    `);
};

window.criarParte = async function (projectId) {
    const nome = document.getElementById('parte-nome').value.trim();
    if (!nome) return;
    const email = document.getElementById('parte-email').value.trim();
    try {
        await api('POST', `/api/v1/projects/${projectId}/partes`, { tipo: document.getElementById('parte-tipo').value, nome, email: email || null });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível cadastrar a parte'); }
};

window.openParteModal = async function (projectId, id) {
    let p;
    try { p = await api('GET', `/api/v1/projects/${projectId}/partes/${id}`); } catch (e) { return falha(e, 'Não foi possível abrir a parte'); }
    const editar = podeEditar();
    const vinculos = lista(p.vinculos).map(v =>
        `<li>${escapeHTML(PAPEIS[v.papel] || v.papel)} — ${escapeHTML(ALVOS[v.alvo_tipo] || v.alvo_tipo)}</li>`).join('');
    openModal(`
        <div class="modal-header"><span class="modal-title">${escapeHTML(p.nome)}</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="parte-e-nome" maxlength="200" value="${escapeHTML(p.nome)}" ${editar ? '' : 'disabled'}></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="parte-e-email" type="email" maxlength="320" value="${escapeHTML(p.email || '')}" ${editar ? '' : 'disabled'}></div>
        <div class="form-group"><label class="form-label">Situação</label>
            <select class="form-input" id="parte-e-status" ${editar ? '' : 'disabled'}>
                <option value="ativa" ${p.status === 'ativa' ? 'selected' : ''}>Ativa</option>
                <option value="inativa" ${p.status === 'inativa' ? 'selected' : ''}>Inativa</option>
            </select></div>
        <div class="form-group"><label class="form-label">Papéis</label>
            ${vinculos ? `<ul style="margin:0;padding-left:1.2rem">${vinculos}</ul>` : '<p style="color:var(--text-dim);margin:0">Nenhum papel registrado.</p>'}</div>
        ${editar ? `<button class="btn btn-primary" style="width:100%" data-action="salvarParte" data-args='["${projectId}","${escapeHTML(p.id)}"]'>Salvar</button>` : ''}
    `);
};

window.salvarParte = async function (projectId, id) {
    const nome = document.getElementById('parte-e-nome').value.trim();
    if (!nome) return;
    const email = document.getElementById('parte-e-email').value.trim();
    try {
        await api('PUT', `/api/v1/projects/${projectId}/partes/${id}`, { nome, email: email || null, status: document.getElementById('parte-e-status').value });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível salvar a parte'); }
};

window.openNovoDepartamentoModal = function (projectId) {
    openModal(`
        <div class="modal-header"><span class="modal-title">Novo departamento</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="depto-nome" maxlength="200"></div>
        <button class="btn btn-primary" style="width:100%" data-action="criarDepartamento" data-args='["${projectId}"]'>Cadastrar</button>
    `);
};

window.criarDepartamento = async function (projectId) {
    const nome = document.getElementById('depto-nome').value.trim();
    if (!nome) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/departamentos`, { nome });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível cadastrar o departamento'); }
};

window.importarPartes = async function (projectId) {
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/partes/importar`);
        showToast(`Importação: ${r.criadas} criadas, ${r.reaproveitadas} já existiam, ${r.vinculos} papéis novos.`, 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível importar'); }
};

window.conciliarPartes = async function (projectId) {
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/partes/conciliar`); } catch (e) { return falha(e, 'Não foi possível conciliar'); }
    const ligados = Object.values(r.casados || {}).reduce((s, n) => s + n, 0);
    const sem = lista(r.sem_correspondencia);
    const amb = lista(r.ambiguos);
    const bloco = (titulo, dica, xs) => xs.length ? `
        <h4 style="margin:1rem 0 0.25rem">${titulo} (${xs.length})</h4>
        <p style="color:var(--text-dim);margin:0 0 0.5rem">${dica}</p>
        ${window.renderDataTable(['Onde', 'Texto', 'Linhas'], xs.map(x => [escapeHTML(x.tabela), escapeHTML(x.texto), String(x.n)]))}` : '';
    openModal(`
        <div class="modal-header"><span class="modal-title">Conciliação de responsáveis</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <p><strong>${ligados}</strong> responsáveis ligados a uma parte. O texto original não foi alterado.</p>
        ${bloco('Sem correspondência', 'Nenhuma parte tem exatamente este nome. Cadastre a parte (ou corrija o nome) e concilie de novo.', sem)}
        ${bloco('Ambíguos', 'Mais de uma parte tem este nome. Deixe só uma ativa com o nome ou renomeie e concilie de novo.', amb)}
        ${!sem.length && !amb.length ? '<p>Nada pendente.</p>' : ''}
        <button class="btn" style="margin-top:1rem" data-action="forceCloseModal">Fechar</button>
    `);
    window.render();
};

window.renderPartes = renderPartes;
