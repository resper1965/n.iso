// Catálogo de serviços (comercial e platform_admin). Rotas: /api/v1/servicos. O corpo enviado é o
// do `servicoSchema` (src/schemas/domain.ts): união por `tipo`; o avulso se divide por `formaPreco`.
import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, openModal, forceCloseModal } from '../ui.js';

const TIPOS = { projeto: 'Projeto', avulso: 'Avulso', recorrente: 'Recorrente' };
const FAIXAS = { 1: 'Foundation', 2: 'Standard', 3: 'Enterprise' };
const FASE_VAZIA = { nome: '', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: '', semanas: '' };

let ultimo = null;          // { c, h, a } da última renderização
let servicos = [];
let arquivados = false;     // filtro "mostrar arquivados"
let confirmando = null;     // id do serviço aguardando confirmação de arquivar
let editando = null;        // serviço aberto no modal (null = novo)

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const num = (id) => { const s = val(id).trim().replace(',', '.'); return s === '' ? undefined : Number(s); };
const linhas = (id) => val(id).split('\n').map((s) => s.trim()).filter(Boolean);
const brl = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const attr = (v) => escapeHTML(v ?? '');

export function resumoPreco(s) {
    if (s.tipo === 'recorrente') return `${brl(s.mensalidade)}/mês × ${s.prazoMinimoMeses}`;
    if (s.tipo === 'avulso' && s.formaPreco === 'fixo') return brl(s.valorFixo);
    return `${s.diasPorFaixa['2']} dias na faixa ${FAIXAS[2]}`;
}

// ——— lista ———
function desenhar() {
    const { c, h, a } = ultimo;
    h.textContent = 'Catálogo de serviços';
    a.innerHTML = '';
    const admin = S.user?.role === 'platform_admin';
    const visiveis = servicos.filter((s) => arquivados || s.ativo);

    const linhasHtml = visiveis.map((s) => {
        const id = escapeHTML(s.id);
        const sim = confirmando === s.id;
        const acoes = sim
            ? `<span class="cat-confirma" role="alert">Arquivar este serviço?</span>
               <button type="button" class="btn btn-secondary" data-action="__catArquivarSim">Sim, arquivar</button>
               <button type="button" class="btn btn-secondary" data-action="__catArquivarNao">Cancelar</button>`
            : `<button type="button" class="btn btn-secondary" data-action="__catEditar" data-args='["${id}"]'>Editar</button>
               ${s.ativo
                   ? `<button type="button" class="btn btn-secondary" data-action="__catArquivar" data-args='["${id}"]'>Arquivar</button>`
                   : `<button type="button" class="btn btn-secondary" data-action="__catReativar" data-args='["${id}"]'>Reativar</button>`}`;
        return `<tr class="${s.ativo ? '' : 'cat-arquivado'}">
            <td><span class="cat-nome">${escapeHTML(s.nome)}</span></td>
            <td>${escapeHTML(s.norma) || '<span class="cat-vazio">sem norma</span>'}</td>
            <td>${TIPOS[s.tipo] || escapeHTML(s.tipo)}</td>
            <td>${escapeHTML(resumoPreco(s))}</td>
            <td><span class="cat-situacao${s.ativo ? '' : ' cat-situacao-off'}">${s.ativo ? 'Ativo' : 'Arquivado'}</span></td>
            <td class="cat-acoes">${acoes}</td>
        </tr>`;
    }).join('');

    const vazio = servicos.length === 0
        ? `<div class="cat-estado">
               <p class="cat-nota">O catálogo está vazio.</p>
               ${admin
                   ? '<button type="button" class="btn btn-primary" data-action="__catSemear">Carregar catálogo inicial</button>'
                   : '<p class="cat-nota">Peça ao administrador da plataforma para carregar o catálogo inicial.</p>'}
           </div>`
        : '';

    c.innerHTML = `
        <div class="cat fade-in">
            <div class="cat-barra">
                <label class="cat-filtro" for="cat-arquivados">
                    <input type="checkbox" id="cat-arquivados" data-action-change="__catFiltro" data-arg-el${arquivados ? ' checked' : ''}>
                    Mostrar arquivados
                </label>
                <button type="button" class="btn btn-primary" data-action="__catNovo">Novo serviço</button>
            </div>
            ${vazio || `<div class="cat-tabela-caixa"><table class="cat-tabela">
                <caption class="cat-sr">Serviços do catálogo</caption>
                <thead><tr><th scope="col">Nome</th><th scope="col">Norma</th><th scope="col">Tipo</th><th scope="col">Preço</th><th scope="col">Situação</th><th scope="col"><span class="cat-sr">Ações</span></th></tr></thead>
                <tbody>${linhasHtml}</tbody>
            </table></div>`}
        </div>`;
}

async function carregar() {
    try {
        servicos = await api('GET', '/api/v1/servicos');
        if (!Array.isArray(servicos)) servicos = [];
    } catch (e) {
        servicos = [];
        window.showToast(e.message || 'Erro ao carregar o catálogo', 'error');
    }
    desenhar();
}

async function renderCatalogo(c, h, a) {
    ultimo = { c, h, a };
    confirmando = null;
    await carregar();
}

// ——— formulário ———
function campo(id, rotulo, valor, o = {}) {
    const f = `cat-${id}`;
    const dica = o.dica ? `<p class="cat-dica" id="${f}-dica">${escapeHTML(o.dica)}</p>` : '';
    const desc = `${o.dica ? `${f}-dica ` : ''}${f}-erro`;
    const ent = o.area
        ? `<textarea class="form-input" id="${f}" rows="${o.linhas || 3}" aria-describedby="${desc}">${escapeHTML(valor)}</textarea>`
        : `<input class="form-input" id="${f}" type="${o.tipo || 'text'}"${o.tipo === 'number' ? ' step="any" min="0"' : ''} value="${attr(valor)}" aria-describedby="${desc}">`;
    return `<div class="form-group">
        <label class="form-label" for="${f}">${escapeHTML(rotulo)}</label>${ent}${dica}
        <p class="cat-erro" id="${f}-erro" role="alert"></p></div>`;
}

const dias = (d = {}) => `<div class="cat-grade3">${[1, 2, 3].map((n) =>
    campo(`diasPorFaixa-${n}`, `Dias, faixa ${FAIXAS[n]}`, d[n] ?? '', { tipo: 'number' })).join('')}</div>`;

function faseHtml(f, i, unica) {
    const p = `fases-${i}`;
    return `<fieldset class="cat-fase" data-fase="${i}">
        <legend class="cat-fase-leg">Fase ${i + 1}</legend>
        <div class="cat-grade3">
            ${campo(`${p}-nome`, 'Nome', f.nome)}
            ${campo(`${p}-pct`, '% do esforço', f.pct, { tipo: 'number' })}
            ${campo(`${p}-semanas`, 'Semanas', f.semanas, { tipo: 'number' })}
        </div>
        ${campo(`${p}-objetivo`, 'Objetivo', f.objetivo, { area: true, linhas: 2 })}
        ${campo(`${p}-atividades`, 'Atividades', f.atividades, { area: true, linhas: 2 })}
        ${campo(`${p}-entregaveis`, 'Entregáveis', f.entregaveis, { area: true, linhas: 2 })}
        ${campo(`${p}-criterioAceite`, 'Critério de aceite', f.criterioAceite, { area: true, linhas: 2 })}
        ${unica ? '' : `<button type="button" class="btn btn-secondary" data-action="__catFaseDel" data-args='["${i}"]'>Remover fase ${i + 1}</button>`}
    </fieldset>`;
}

function fasesHtml(fases) {
    return `<div id="cat-fases-corpo">
        <div id="cat-fases" data-action-input="__catTotal">${fases.map((f, i) => faseHtml(f, i, fases.length === 1)).join('')}</div>
        <p class="cat-erro" id="cat-fases-erro" role="alert"></p>
        <div class="cat-fases-rodape">
            <button type="button" class="btn btn-secondary" data-action="__catFaseAdd">Adicionar fase</button>
            <p class="cat-total" id="cat-fases-total" aria-live="polite"></p>
        </div></div>`;
}

function blocoTipo(tipo, forma, s = {}) {
    if (tipo === 'projeto') {
        return `${dias(s.diasPorFaixa)}<h4 class="cat-sub">Fases</h4>${fasesHtml(s.fases?.length ? s.fases : [{ ...FASE_VAZIA }])}`;
    }
    if (tipo === 'recorrente') {
        return `<div class="cat-grade3">
            ${campo('mensalidade', 'Mensalidade (R$)', s.mensalidade ?? '', { tipo: 'number' })}
            ${campo('prazoMinimoMeses', 'Prazo mínimo (meses)', s.prazoMinimoMeses ?? '', { tipo: 'number' })}</div>
            ${campo('inclusoMes', 'Incluso por mês', (s.inclusoMes || []).join('\n'), { area: true, dica: 'Um item por linha.' })}`;
    }
    const preco = forma === 'fixo'
        ? campo('valorFixo', 'Valor fixo (R$)', s.valorFixo ?? '', { tipo: 'number' })
        : dias(s.diasPorFaixa);
    return `<div class="form-group">
            <label class="form-label" for="cat-formaPreco">Forma de preço</label>
            <select class="form-input" id="cat-formaPreco" data-action-change="__catForma" data-arg-val>
                <option value="fixo"${forma === 'fixo' ? ' selected' : ''}>Valor fixo</option>
                <option value="esforco"${forma === 'esforco' ? ' selected' : ''}>Por esforço (dias por faixa)</option>
            </select></div>
        ${preco}
        ${campo('entregaveis', 'Entregáveis', (s.entregaveis || []).join('\n'), { area: true, dica: 'Um item por linha.' })}
        ${campo('criterioAceite', 'Critério de aceite', s.criterioAceite || '', { area: true, linhas: 2 })}`;
}

function abrirForm(s) {
    editando = s;
    const tipo = s?.tipo || 'projeto';
    const forma = s?.formaPreco || 'fixo';
    openModal(`
        <form id="cat-form" class="cat-form" data-action-submit="__catSalvar" data-arg-event data-prevent novalidate>
            <h3 class="cat-form-titulo">${s ? 'Editar serviço' : 'Novo serviço'}</h3>
            <div class="form-group">
                <label class="form-label" for="cat-tipo">Tipo</label>
                <select class="form-input" id="cat-tipo" data-action-change="__catTipo" data-arg-val>
                    ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${v}</option>`).join('')}
                </select>
            </div>
            ${campo('nome', 'Nome', s?.nome || '')}
            ${campo('norma', 'Norma', s?.norma || '')}
            ${campo('descricao', 'Descrição', s?.descricao || '', { area: true, linhas: 2 })}
            <div id="cat-bloco">${blocoTipo(tipo, forma, s || {})}</div>
            ${campo('premissas', 'Premissas', (s?.premissas || []).join('\n'), { area: true, dica: 'Uma por linha.' })}
            ${campo('exclusoes', 'Exclusões', (s?.exclusoes || []).join('\n'), { area: true, dica: 'Uma por linha.' })}
            <p class="cat-erro" id="cat-erro" role="alert"></p>
            <div class="cat-form-rodape">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="cat-salvar">Salvar</button>
            </div>
        </form>`, 'modal-large');
    window.__catTotal();
}

function lerFases() {
    const fases = [];
    for (let i = 0; $(`cat-fases-${i}-nome`); i++) {
        const p = `cat-fases-${i}`;
        fases.push({ nome: val(`${p}-nome`), objetivo: val(`${p}-objetivo`), atividades: val(`${p}-atividades`),
            entregaveis: val(`${p}-entregaveis`), criterioAceite: val(`${p}-criterioAceite`),
            pct: val(`${p}-pct`), semanas: val(`${p}-semanas`) });
    }
    return fases;
}

// Mesmo formato do servicoSchema: números como número, listas como array de texto.
function montarCorpo() {
    const tipo = val('cat-tipo');
    const corpo = { tipo, nome: val('cat-nome'), norma: val('cat-norma'), descricao: val('cat-descricao'),
        premissas: linhas('cat-premissas'), exclusoes: linhas('cat-exclusoes') };
    const porFaixa = () => ({ '1': num('cat-diasPorFaixa-1'), '2': num('cat-diasPorFaixa-2'), '3': num('cat-diasPorFaixa-3') });
    if (tipo === 'projeto') {
        corpo.diasPorFaixa = porFaixa();
        corpo.fases = lerFases().map((f, i) => ({ ...f, pct: num(`cat-fases-${i}-pct`), semanas: num(`cat-fases-${i}-semanas`) }));
    } else if (tipo === 'recorrente') {
        corpo.mensalidade = num('cat-mensalidade');
        corpo.prazoMinimoMeses = num('cat-prazoMinimoMeses');
        corpo.inclusoMes = linhas('cat-inclusoMes');
    } else {
        corpo.formaPreco = val('cat-formaPreco');
        if (corpo.formaPreco === 'fixo') corpo.valorFixo = num('cat-valorFixo');
        else corpo.diasPorFaixa = porFaixa();
        corpo.entregaveis = linhas('cat-entregaveis');
        corpo.criterioAceite = val('cat-criterioAceite');
    }
    return corpo;
}

function limparErros() {
    document.querySelectorAll('#cat-form .cat-erro').forEach((p) => { p.textContent = ''; });
    document.querySelectorAll('#cat-form [aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

// O path do servidor ("diasPorFaixa.2", "fases.0.pct") vira o id do campo; se o campo não existe
// (ex.: "premissas.3"), sobe um nível; o que não achar vai para a mensagem geral do formulário.
function mostrarErros(details = [], geral = '') {
    const sobra = [];
    for (const d of details) {
        let partes = String(d.path || '').split('.').filter(Boolean);
        let campoEl = null;
        while (partes.length && !(campoEl = $('cat-' + partes.join('-')))) partes = partes.slice(0, -1);
        const erroEl = campoEl ? $(campoEl.id + '-erro') : null;
        if (!erroEl) { sobra.push(d.message); continue; }
        erroEl.textContent = d.message;
        campoEl.setAttribute('aria-invalid', 'true');
    }
    if (!details.length && geral) sobra.push(geral);
    if (sobra.length) $('cat-erro').textContent = sobra.join(' ');
    document.querySelector('#cat-form [aria-invalid]')?.focus();
}

// ——— ações ———
window.__catFiltro = (el) => { arquivados = !!el.checked; desenhar(); $('cat-arquivados')?.focus(); };
window.__catNovo = () => abrirForm(null);
window.__catEditar = (id) => { const s = servicos.find((x) => x.id === id); if (s) abrirForm(s); };

window.__catTipo = (tipo) => {
    $('cat-bloco').innerHTML = blocoTipo(tipo, 'fixo', editando?.tipo === tipo ? editando : {});
    window.__catTotal();
};
window.__catForma = (forma) => {
    $('cat-bloco').innerHTML = blocoTipo('avulso', forma, editando?.formaPreco === forma ? editando : {});
};

// Total ao vivo do % das fases; o servidor exige 100 (tolerância de 0,01), e o botão espelha a regra.
window.__catTotal = () => {
    const tot = $('cat-fases-total');
    const salvar = $('cat-salvar');
    if (!tot) { if (salvar) salvar.disabled = false; return; }
    let soma = 0;
    for (let i = 0; $(`cat-fases-${i}-pct`); i++) soma += Number(val(`cat-fases-${i}-pct`).replace(',', '.')) || 0;
    const ok = Math.abs(soma - 100) < 0.01;
    tot.textContent = ok ? 'Total das fases: 100%' : `Total das fases: ${Math.round(soma * 100) / 100}% (precisa ser 100%)`;
    tot.classList.toggle('cat-total-erro', !ok);
    if (salvar) salvar.disabled = !ok;
};

function redesenharFases(fases) {
    $('cat-fases-corpo').outerHTML = fasesHtml(fases);
    window.__catTotal();
}
window.__catFaseAdd = () => {
    const fases = lerFases();
    if (fases.length >= 15) return;
    redesenharFases([...fases, { ...FASE_VAZIA }]);
    $(`cat-fases-${fases.length}-nome`)?.focus();
};
window.__catFaseDel = (i) => {
    const fases = lerFases().filter((_, k) => k !== Number(i));
    if (fases.length) redesenharFases(fases);
};

window.__catSalvar = async () => {
    limparErros();
    const salvar = $('cat-salvar');
    salvar.disabled = true;
    try {
        const corpo = montarCorpo();
        if (editando) await api('PUT', `/api/v1/servicos/${encodeURIComponent(editando.id)}`, corpo);
        else await api('POST', '/api/v1/servicos', corpo);
        forceCloseModal();
        window.showToast(editando ? 'Serviço atualizado' : 'Serviço criado');
        await carregar();
    } catch (e) {
        mostrarErros(e.body?.details, e.message || 'Erro ao salvar o serviço');
        window.__catTotal();
    }
};

window.__catArquivar = (id) => { confirmando = id; desenhar(); ultimo.c.querySelector('[data-action="__catArquivarSim"]')?.focus(); };
window.__catArquivarNao = () => { confirmando = null; desenhar(); };

async function mudarSituacao(id, acao, msg) {
    try {
        await api('POST', `/api/v1/servicos/${encodeURIComponent(id)}/${acao}`);
        window.showToast(msg);
    } catch (e) {
        window.showToast(e.message || 'Erro ao alterar o serviço', 'error');
    }
    confirmando = null;
    await carregar();
}
window.__catArquivarSim = () => mudarSituacao(confirmando, 'arquivar', 'Serviço arquivado');
window.__catReativar = (id) => mudarSituacao(id, 'reativar', 'Serviço reativado');

window.__catSemear = async () => {
    try {
        await api('POST', '/api/v1/servicos/semear-padrao');
        window.showToast('Catálogo inicial carregado');
    } catch (e) {
        window.showToast(e.message || 'Erro ao carregar o catálogo inicial', 'error');
    }
    await carregar();
};

export { renderCatalogo };
window.renderCatalogo = renderCatalogo;
