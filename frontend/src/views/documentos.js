import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';

// Documentos do projeto (fatia 3.4 do núcleo): árvore política → norma → procedimento, dono, revisão, versões,
// rascunho (inclusive o do agente), ciências e aprovação por versão. Toda regra é do servidor; aqui só se mostra
// e se chama. Texto, título e nomes vindos do servidor são sempre escapados.

const TIPOS = { politica: 'Política', norma: 'Norma', procedimento: 'Procedimento' };
const STATUS = { rascunho: ['Rascunho', 'info'], vigente: ['Vigente', 'success'], obsoleto: ['Obsoleto', 'info'] };
const ESTADO_VERSAO = { rascunho: 'Rascunho', vigente: 'Vigente', substituida: 'Substituída' };
const CANAIS = { conta: 'conta', link: 'link', portal: 'portal' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);
const podePedir = () => typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(S.user);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dataBr = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Selo de aprovação por versão (derivada dos pedidos): quem aprovou a versão vigente, ou nada. */
function aprovacaoTexto(ap) {
    if (!ap || (!ap.ciso && !ap.ceo)) return '—';
    if (ap.ciso && ap.ceo) return 'Aprovado: Líder SGSI e Direção';
    return ap.ciso ? 'Aprovado: Só Líder SGSI' : 'Aprovado: Só Direção';
}

/** Raízes primeiro, filhos logo abaixo do pai, com o nível de recuo. Órfão (pai fora da lista) vira raiz. */
function arvore(docs) {
    const ids = new Set(docs.map((d) => d.id));
    const filhos = new Map();
    for (const d of docs) {
        const chave = d.pai_id && ids.has(d.pai_id) ? d.pai_id : null;
        filhos.set(chave, [...(filhos.get(chave) ?? []), d]);
    }
    const saida = [];
    const descer = (pai, nivel) => {
        for (const d of filhos.get(pai) ?? []) {
            saida.push({ doc: d, nivel });
            descer(d.id, nivel + 1);
        }
    };
    descer(null, 0);
    return saida;
}

const nomeDaParte = (id) => ((S.partes || []).find((p) => p.id === id) || {}).nome || '';

async function renderDocumentos(c, h, a) {
    h.textContent = 'Documentos';
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    a.innerHTML = podeEditar()
        ? `<button class="btn" data-action="importarDocumentos" data-args='${args(proj.id)}'>Importar políticas</button>
           <button class="btn btn-primary" data-action="openNovoDocumentoModal" data-args='${args(proj.id)}'>+ Novo documento</button>`
        : '';

    let docs = [];
    try { docs = lista(await api('GET', `/api/v1/projects/${proj.id}/documentos`)); } catch (e) { /* tabela vazia e aviso abaixo */ }
    try { S.partes = lista(await api('GET', `/api/v1/projects/${proj.id}/partes`)); } catch (e) { S.partes = []; }
    S.documentos = docs;

    const linhas = arvore(docs).map(({ doc: d, nivel }) => {
        const [rotuloStatus, tomStatus] = STATUS[d.status] || [d.status, 'info'];
        const vencida = d.status === 'vigente' && d.revisar_ate && String(d.revisar_ate).slice(0, 10) < hoje();
        return [
            `<span data-nivel="${nivel}" style="display:inline-block;padding-left:${nivel * 20}px"><strong>${escapeHTML(d.titulo)}</strong></span>`,
            escapeHTML(TIPOS[d.tipo] || d.tipo),
            window.renderStatusBadge(rotuloStatus, tomStatus) + (d.tem_rascunho ? ' <span class="ctx-tag">Rascunho pendente</span>' : ''),
            d.versao_vigente ? `v${escapeHTML(String(d.versao_vigente))}` : '—',
            d.revisar_ate ? `${escapeHTML(dataBr(d.revisar_ate))}${vencida ? ' ' + window.renderStatusBadge('Revisão vencida', 'danger') : ''}` : '—',
            escapeHTML(nomeDaParte(d.dono_parte_id) || '—'),
            escapeHTML(aprovacaoTexto(d.aprovacao)),
            `<button class="btn btn-ghost btn-sm" data-action="openDocumentoModal" data-args='${args(proj.id, d.id)}'>Abrir</button>`,
        ];
    });
    c.innerHTML = window.renderDataTable(
        ['Documento', 'Tipo', 'Situação', 'Versão', 'Revisão', 'Dono', 'Aprovação', 'Ações'],
        linhas,
        { emptyState: 'Nenhum documento neste projeto. Use "Importar políticas" para trazer as que já existem, ou crie um novo.' },
    );
}

const opcoesPartes = (selecionada) => '<option value="">— sem dono —</option>' + (S.partes || [])
    .filter((p) => p.status !== 'inativa' || p.id === selecionada)
    .map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === selecionada ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('');
/** Pais possíveis: política ou norma, exceto o próprio documento. O servidor confere o tipo de cada combinação. */
const opcoesPais = (selecionado, exceto) => '<option value="">— sem pai —</option>' + (S.documentos || [])
    .filter((d) => d.id !== exceto && (d.tipo === 'politica' || d.tipo === 'norma'))
    .map((d) => `<option value="${escapeHTML(d.id)}" ${d.id === selecionado ? 'selected' : ''}>${escapeHTML(d.titulo)} (${escapeHTML((TIPOS[d.tipo] || d.tipo).toLowerCase())})</option>`).join('');
const opcoesTipo = (atual) => Object.entries(TIPOS).map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`).join('');
const meses = (id) => { const n = parseInt(el(id).value, 10); return Number.isInteger(n) ? n : null; };
const valorOuNulo = (id) => el(id).value || null;

window.importarDocumentos = async function (projectId) {
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/documentos/importar`);
        const ign = (r.ignorados_nao_aplicavel || 0) + (r.ignorados_sem_texto || 0);
        showToast(`Importação: ${r.criados} criados, ${r.ja_existiam} já existiam, ${r.versoes} versões${ign ? `, ${ign} ignorados` : ''}.`, 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível importar'); }
};

window.openNovoDocumentoModal = function (projectId) {
    openModal(`
        <div class="modal-header"><span class="modal-title">Novo documento</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="doc-novo-tipo">${opcoesTipo('politica')}</select></div>
        <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="doc-novo-titulo" maxlength="300"></div>
        <div class="form-group"><label class="form-label">Texto (versão 1, em rascunho)</label><textarea class="form-input" id="doc-novo-texto" rows="8"></textarea></div>
        <div class="form-group"><label class="form-label">Documento pai (norma sob política; procedimento sob norma ou política)</label><select class="form-input" id="doc-novo-pai">${opcoesPais(null, null)}</select></div>
        <div class="form-group"><label class="form-label">Dono</label><select class="form-input" id="doc-novo-dono">${opcoesPartes(null)}</select></div>
        <div class="form-group"><label class="form-label">Revisar a cada (meses, opcional)</label><input class="form-input" id="doc-novo-meses" type="number" min="1" max="120"></div>
        <button class="btn btn-primary" style="width:100%" data-action="criarDocumentoNovo" data-args='${args(projectId)}'>Criar</button>
    `);
};

window.criarDocumentoNovo = async function (projectId) {
    const titulo = el('doc-novo-titulo').value.trim();
    const texto = el('doc-novo-texto').value;
    if (!titulo || !texto.trim()) { showToast('Informe o título e o texto', 'error'); return; }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/documentos`, {
            tipo: el('doc-novo-tipo').value, titulo, texto, pai_id: valorOuNulo('doc-novo-pai'),
            dono_parte_id: valorOuNulo('doc-novo-dono'), revisar_a_cada_meses: meses('doc-novo-meses'),
        });
        window.forceCloseModal();
        window.render();
        await window.openDocumentoModal(projectId, r.id);
    } catch (e) { falha(e, 'Não foi possível criar o documento'); }
};

window.openDocumentoModal = async function (projectId, id) {
    let d;
    let ciencias = [];
    try { d = await api('GET', `/api/v1/projects/${projectId}/documentos/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o documento'); return; }
    try { ciencias = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/ciencias`)); } catch (e) { /* o resto do documento abre sem as ciências */ }
    const editar = podeEditar();
    const versoes = lista(d.versoes);
    const rascunho = versoes.find((v) => v.estado === 'rascunho');
    const vigente = versoes.find((v) => v.estado === 'vigente');
    const [rotuloStatus] = STATUS[d.status] || [d.status];

    const aviso = rascunho ? `
        <div id="doc-rascunho" style="border:1px solid var(--accent); border-radius:10px; padding:1rem; margin-bottom:1rem">
            <div style="font-family:'Montserrat',sans-serif; font-weight:600; margin-bottom:0.25rem">Rascunho ${rascunho.origem === 'agente' ? 'do agente ' : ''}aguardando revisão</div>
            <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.5rem">Por ${escapeHTML(rascunho.criado_por || 'autor não registrado')} em ${escapeHTML(rascunho.criado_em || '')}. O documento vigente só muda quando você publicar.</div>
            <div style="max-height:200px; overflow:auto; white-space:pre-wrap; font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:0.75rem">${escapeHTML(rascunho.texto || '')}</div>
            ${editar ? `<div style="display:flex; gap:8px; margin-top:0.75rem">
                <button class="btn btn-primary btn-sm" data-action="publicarVersaoDocumento" data-args='${args(projectId, id, rascunho.numero)}'>Publicar rascunho</button>
                <button class="btn btn-sm" data-action="descartarRascunhoDocumento" data-args='${args(projectId, id)}'>Descartar</button>
            </div>` : ''}
        </div>` : '';

    const metadados = editar ? `
        <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="doc-e-titulo" maxlength="300" value="${escapeHTML(d.titulo)}"></div>
        <div style="display:flex; gap:0.5rem">
            <div class="form-group" style="flex:1"><label class="form-label">Tipo</label><select class="form-input" id="doc-e-tipo">${opcoesTipo(d.tipo)}</select></div>
            <div class="form-group" style="flex:2"><label class="form-label">Documento pai</label><select class="form-input" id="doc-e-pai">${opcoesPais(d.pai_id, d.id)}</select></div>
        </div>
        <div style="display:flex; gap:0.5rem">
            <div class="form-group" style="flex:2"><label class="form-label">Dono</label><select class="form-input" id="doc-e-dono">${opcoesPartes(d.dono_parte_id)}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label">Revisar a cada (meses)</label><input class="form-input" id="doc-e-meses" type="number" min="1" max="120" value="${d.revisar_a_cada_meses ?? ''}"></div>
        </div>
        <button class="btn btn-sm" data-action="salvarMetadadosDocumento" data-args='${args(projectId, id)}'>Salvar dados do documento</button>`
        : `<div style="font-size:0.85rem; color:var(--text-dim)">${escapeHTML(TIPOS[d.tipo] || d.tipo)} · Dono: ${escapeHTML(nomeDaParte(d.dono_parte_id) || '—')} · Revisão: ${escapeHTML(dataBr(d.revisar_ate))}</div>`;

    const aprovacao = d.aprovacao || {};
    const linhaAprovacao = (rotulo, ap) => `<div style="font-size:0.85rem">${rotulo}: ${ap ? `${escapeHTML(ap.por)} em ${escapeHTML(String(ap.em).slice(0, 10))}` : 'sem aprovação desta versão'}</div>`;

    const acoes = [];
    if (editar && d.status === 'vigente' && d.revisar_a_cada_meses) acoes.push(`<button class="btn btn-sm" data-action="marcarDocumentoRevisado" data-args='${args(projectId, id)}'>Marcar como revisado</button>`);
    if (podePedir() && d.status === 'vigente') {
        acoes.push(`<button class="btn btn-sm" data-action="pedirAprovacaoDocumento" data-args='${args(projectId, id)}'>Pedir aprovação</button>`);
        acoes.push(`<button class="btn btn-sm" data-action="abrirCienciaLink" data-args='${args(projectId)}'>Pedir ciência por link</button>`);
    }
    if (editar && d.status === 'vigente') acoes.push(`<button class="btn btn-sm" data-action="mudarStatusDocumento" data-args='${args(projectId, id, 'obsoleto')}'>Aposentar</button>`);
    if (editar && d.status === 'obsoleto') acoes.push(`<button class="btn btn-sm" data-action="mudarStatusDocumento" data-args='${args(projectId, id, 'vigente')}'>Reativar</button>`);

    const editor = editar ? `
        <div class="form-group" style="margin-top:1rem"><label class="form-label">Texto (salva como rascunho; publicar é um passo à parte)</label>
            <textarea class="form-input" id="doc-e-texto" rows="8">${escapeHTML((rascunho || vigente || {}).texto || '')}</textarea></div>
        <button class="btn btn-sm" data-action="salvarRascunhoDocumento" data-args='${args(projectId, id)}'>Salvar rascunho</button>` : '';

    openModal(`
        <div class="modal-header"><span class="modal-title">${escapeHTML(d.titulo)}</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0.75rem">${escapeHTML(rotuloStatus)}${d.versao_vigente ? ` · versão vigente ${escapeHTML(String(d.versao_vigente))}` : ''}</div>
        ${aviso}
        ${metadados}
        <div style="margin:1rem 0">
            ${linhaAprovacao('Líder SGSI', aprovacao.ciso)}
            ${linhaAprovacao('Direção', aprovacao.ceo)}
        </div>
        ${acoes.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:1rem">${acoes.join('')}</div>` : ''}
        ${editor}
        <h4 style="margin:1.25rem 0 0.5rem">Versões</h4>
        ${versoes.length ? versoes.map((v) => `
            <details style="margin-bottom:0.5rem">
                <summary>Versão ${escapeHTML(String(v.numero))} · ${escapeHTML(ESTADO_VERSAO[v.estado] || v.estado)} · ${escapeHTML(v.origem || '')} · ${escapeHTML(v.criado_em || '')}</summary>
                <div style="font-size:0.7rem; color:var(--text-dim)">SHA-256 ${escapeHTML(v.hash || '')}</div>
                <div style="white-space:pre-wrap; font-size:0.85rem; margin-top:0.25rem">${escapeHTML(v.texto || '')}</div>
            </details>`).join('') : '<p style="color:var(--text-dim)">Nenhuma versão.</p>'}
        <h4 style="margin:1.25rem 0 0.5rem">Ciências</h4>
        ${ciencias.length ? `<table class="data-table"><thead><tr><th>Pessoa</th><th>Versão</th><th>Canal</th><th>Quando</th></tr></thead><tbody>
            ${ciencias.map((x) => `<tr><td>${escapeHTML(x.nome || x.email)}${x.nome ? `<div style="font-size:11px;color:var(--text-dim)">${escapeHTML(x.email)}</div>` : ''}</td>
                <td>${escapeHTML(String(x.numero))}${x.atual ? '' : ' (anterior)'}</td><td>${escapeHTML(CANAIS[x.canal] || x.canal || '')}</td><td>${escapeHTML(String(x.em || ''))}</td></tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--text-dim)">Ninguém deu ciência ainda.</p>'}
    `, 'modal-large');
};

/** Roda uma ação do detalhe; se der certo, reabre o detalhe e redesenha a lista. Erro: aviso, e o modal fica. */
async function acao(projectId, id, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.openDocumentoModal(projectId, id);
        window.render();
    } catch (e) { falha(e, padrao); }
}

window.salvarMetadadosDocumento = (projectId, id) => acao(projectId, id, () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}`, {
    titulo: el('doc-e-titulo').value.trim(), tipo: el('doc-e-tipo').value, pai_id: valorOuNulo('doc-e-pai'),
    dono_parte_id: valorOuNulo('doc-e-dono'), revisar_a_cada_meses: meses('doc-e-meses'),
}), 'Não foi possível salvar o documento', 'Documento atualizado.');

window.salvarRascunhoDocumento = async function (projectId, id) {
    const texto = el('doc-e-texto').value;
    if (!texto.trim()) { showToast('O texto não pode ficar vazio', 'error'); return; }
    await acao(projectId, id, () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/versoes`, { texto, origem: 'humano' }),
        'Não foi possível salvar o rascunho', 'Rascunho salvo. Publique quando estiver pronto.');
};

window.publicarVersaoDocumento = (projectId, id, numero) => acao(projectId, id,
    () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/versoes/${numero}/publicar`),
    'Não foi possível publicar', 'Versão publicada. Pedidos de ciência abertos foram conferidos e a aprovação anterior deixou de valer para esta versão.');

window.descartarRascunhoDocumento = (projectId, id) => acao(projectId, id,
    () => api('DELETE', `/api/v1/projects/${projectId}/documentos/${id}/rascunho`), 'Não foi possível descartar o rascunho', 'Rascunho descartado.');

window.marcarDocumentoRevisado = (projectId, id) => acao(projectId, id,
    () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/revisar`), 'Não foi possível marcar como revisado', 'Documento revisado: a próxima revisão foi renovada.');

window.mudarStatusDocumento = (projectId, id, status) => acao(projectId, id,
    () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}`, { status }), 'Não foi possível mudar a situação do documento');

window.pedirAprovacaoDocumento = function (projectId, id) {
    window.abrirPedidoAprovacao(projectId, 'documento', id);
};

window.renderDocumentos = renderDocumentos;
