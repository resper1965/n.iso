// Propostas (fatia 3 do sistema de propostas). Rotas: /api/v1/propostas. Os corpos enviados são
// os de propostaCriarSchema / propostaEditarSchema / propostaGerarSchema (src/schemas/domain.ts),
// todos .strict(): chave a mais é 400. Preço, memória e margem vêm do servidor; a tela só mostra.
// O fluxo antigo (proposals, commercial.js) continua em outras telas até a fatia 4.
import { S } from '../state.js';
import { api, API_BASE } from '../api.js';
import { escapeHTML } from '../ui.js';

const PASSOS = ['Cliente', 'Serviços', 'Ajustes', 'Número e condições', 'Revisar documento'];
const FAIXAS = { 1: 'Foundation', 2: 'Standard', 3: 'Enterprise' };
const STATUS = {
    rascunho: ['Rascunho', 'prp-st-rascunho'],
    aguardando_aprovacao: ['Aguardando aprovação', 'prp-st-aguardando'],
    gerada: ['Gerada', 'prp-st-gerada'],
    enviada: ['Enviada', 'prp-st-enviada'],
    visualizada: ['Visualizada', 'prp-st-enviada'],
    aceita: ['Aceita', 'prp-st-aceita'],
    recusada: ['Recusada', 'prp-st-encerrada'],
    expirada: ['Expirada', 'prp-st-encerrada'],
    substituida: ['Substituída', 'prp-st-encerrada'],
};
const EDITAVEL = ['rascunho', 'aguardando_aprovacao'];
const COM_REVISAO = ['gerada', 'enviada', 'visualizada'];
const AJUDA = 'Texto simples: uma linha em branco separa parágrafos; linha iniciada por "- " vira item de lista; "## " vira subtítulo.';

let ultimo = null;      // { c, h, a }
let lista = [];
let cfg = null;         // GET /api/v1/org/config
let leads = [];
let comDiagnostico = new Set();  // lead_id com assessment (o servidor confirma ao criar)
let servicos = [];
let prop = null;        // proposta aberta no assistente
let passo = 1;
let leadSel = '';
let numeroEscolhido = '';
let previa = null;      // { conteudo, html, textos }
let erro = '';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const num = (id) => { const s = val(id).trim().replace(',', '.'); return s === '' ? undefined : Number(s); };
const brl = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const valor = (n) => (Number(n) > 0 ? brl(n) : '—');
const cnpjBr = (s) => (s && /^\d{14}$/.test(s) ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s || '');
const args = (...v) => escapeHTML(JSON.stringify(v));
const teto = () => Number(cfg?.preco?.tetoDesconto ?? 0);
const ehAdmin = () => S.user?.role === 'platform_admin';

/** Desconto que a geração vai mandar para aprovação. */
export const acimaDoTeto = (desconto, limite) => Number(desconto) > Number(limite);

function pilula(status) {
    const [rotulo, cls] = STATUS[status] || [status, 'prp-st-rascunho'];
    return `<span class="prp-pilula ${cls}">${escapeHTML(rotulo)}</span>`;
}

// O documento e o Word não são JSON: fetch direto, com o token da sessão como o api.js faz.
async function buscar(caminho) {
    const headers = S.token ? { Authorization: `Bearer ${S.token}` } : {};
    const r = await fetch(API_BASE + caminho, { headers, signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
        let msg = '';
        try { msg = (await r.json()).error; } catch { /* corpo não é JSON */ }
        throw new Error(msg || `Erro ${r.status} ao ler ${caminho}`);
    }
    return r;
}

// ——— lista ———
function desenharLista() {
    const { c, h, a } = ultimo;
    h.textContent = 'Propostas';
    a.innerHTML = '';
    const linhas = lista.map((p) => {
        const numero = p.numero
            ? `<span class="prp-numero">${escapeHTML(p.numero)}</span> <span class="prp-rev">rev. ${escapeHTML(p.revisao)}</span>`
            : `<span class="prp-vazio">sem número</span>${p.revisao > 1 ? ` <span class="prp-rev">rev. ${escapeHTML(p.revisao)}</span>` : ''}`;
        const acoes = [
            `<button type="button" class="btn btn-secondary" data-action="__prpAbrir" data-args='${args(p.id)}'>Abrir</button>`,
            COM_REVISAO.includes(p.status) ? `<button type="button" class="btn btn-secondary" data-action="__prpRevisao" data-args='${args(p.id)}'>Nova revisão</button>` : '',
            EDITAVEL.includes(p.status) ? '' : `<button type="button" class="btn btn-secondary" data-action="__prpDocumento" data-args='${args(p.id)}'>Ver documento</button>`,
        ].join('');
        return `<tr>
            <td>${numero}</td>
            <td><span class="prp-cliente">${escapeHTML(p.cliente)}</span></td>
            <td>${pilula(p.status)}</td>
            <td class="prp-valor">${valor(p.total_projeto)}</td>
            <td class="prp-valor">${valor(p.mensalidade)}</td>
            <td><div class="prp-acoes">${acoes}</div></td>
        </tr>`;
    }).join('');
    c.innerHTML = `
        <div class="prp fade-in">
            <div class="prp-barra">
                <p class="prp-nota">Proposta nasce de um lead, com os serviços do catálogo. O documento é congelado ao gerar; mudança depois, só por nova revisão.</p>
                <button type="button" class="btn btn-primary" data-action="__prpNova">Nova proposta</button>
            </div>
            ${lista.length ? `<div class="prp-tabela-caixa"><table class="prp-tabela">
                <caption class="prp-sr">Propostas da organização</caption>
                <thead><tr><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Status</th><th scope="col">Projeto</th><th scope="col">Mensalidade</th><th scope="col"><span class="prp-sr">Ações</span></th></tr></thead>
                <tbody>${linhas}</tbody>
            </table></div>` : '<div class="prp-estado"><p class="prp-nota">Nenhuma proposta ainda.</p></div>'}
        </div>`;
}

async function carregarLista() {
    try {
        lista = await api('GET', '/api/v1/propostas');
        if (!Array.isArray(lista)) lista = [];
    } catch (e) {
        lista = [];
        window.showToast(e.message || 'Erro ao carregar as propostas', 'error');
    }
    desenharLista();
}

async function renderPropostas(c, h, a) {
    ultimo = { c, h, a };
    prop = null;
    await carregarLista();
}

// ——— assistente ———
async function prepararAssistente() {
    const lerOu = async (caminho, padrao) => { try { return await api('GET', caminho); } catch { return padrao; } };
    const [c, l, as, s] = await Promise.all([
        lerOu('/api/v1/org/config', null), lerOu('/api/v1/leads', []), lerOu('/api/v1/assessments', []), lerOu('/api/v1/servicos?ativos=1', []),
    ]);
    cfg = c || { preco: {} };
    leads = Array.isArray(l) ? l : [];
    comDiagnostico = new Set((Array.isArray(as) ? as : []).map((x) => x.lead_id).filter(Boolean));
    servicos = Array.isArray(s) ? s : [];
    numeroEscolhido = prop?.numero || cfg.sugestaoNumero || '';
    previa = null;
    erro = '';
}

const faixa = () => String(prop?.memoria?.faixa || '2');

function resumoServico(s) {
    const tipo = { projeto: 'Projeto', avulso: 'Avulso', recorrente: 'Recorrente' }[s.tipo] || s.tipo;
    if (s.tipo === 'recorrente') return `${tipo} · ${brl(s.mensalidade)}/mês, mínimo ${s.prazoMinimoMeses} meses`;
    if (s.tipo === 'avulso' && s.formaPreco === 'fixo') return `${tipo} · ${brl(s.valorFixo)}`;
    return `${tipo} · ${s.diasPorFaixa?.[faixa()] ?? '?'} dias na faixa ${FAIXAS[faixa()]}`;
}

function fichaLead(id) {
    const l = leads.find((x) => x.id === id);
    if (!l) return '<p class="prp-nota">Escolha o lead para ver os dados.</p>';
    const diag = comDiagnostico.has(l.id)
        ? 'com diagnóstico: faixa e porte vêm das respostas'
        : 'sem diagnóstico: a proposta usa a faixa Standard e o porte não informado';
    return `<dl class="prp-ficha-dados">
        <dt>CNPJ</dt><dd>${escapeHTML(cnpjBr(l.cnpj)) || '<span class="prp-vazio">não informado</span>'}</dd>
        <dt>Porte</dt><dd>${escapeHTML(l.porte) || '<span class="prp-vazio">não informado</span>'}</dd>
        <dt>Diagnóstico</dt><dd>${escapeHTML(diag)}</dd>
    </dl>`;
}

function passoCliente() {
    if (prop) {
        return `<p class="prp-nota">Cliente: <span class="prp-cliente">${escapeHTML(prop.cliente)}</span>. O lead é fixo depois que a proposta é criada.</p>
            <p class="prp-nota">${escapeHTML(prop.memoria?.origem ? `Cálculo: ${prop.memoria.origem}.` : '')}</p>`;
    }
    const opcoes = leads.map((l) => `<option value="${escapeHTML(l.id)}"${l.id === leadSel ? ' selected' : ''}>${escapeHTML(l.razao_social || l.company_name)}</option>`).join('');
    return `<div class="form-group">
            <label class="form-label" for="prp-lead">Lead</label>
            <select class="form-input" id="prp-lead" data-action-change="__prpLead" data-arg-val>
                <option value="">Escolha o lead</option>${opcoes}
            </select></div>
        <div id="prp-ficha" class="prp-ficha" aria-live="polite">${fichaLead(leadSel)}</div>`;
}

function catalogoDoPasso() {
    // serviço já na proposta e fora do catálogo ativo (arquivado depois): continua, com a cópia congelada
    const ids = new Set(servicos.map((s) => s.id));
    const congelados = (prop?.itens || []).filter((i) => !ids.has(i.servico_id)).map((i) => ({ ...i.servico, id: i.servico_id, congelado: true }));
    return [...servicos, ...congelados];
}

function passoServicos() {
    const marcados = prop.itens?.length
        ? new Set(prop.itens.map((i) => i.servico_id))
        : new Set(prop.assessment_id ? servicos.filter((s) => s.tipo === 'projeto').map((s) => s.id) : []);
    const itens = catalogoDoPasso().map((s) => `<li class="prp-servico">
            <input type="checkbox" id="prp-srv-${escapeHTML(s.id)}" value="${escapeHTML(s.id)}"${marcados.has(s.id) ? ' checked' : ''}>
            <label for="prp-srv-${escapeHTML(s.id)}"><span class="prp-servico-nome">${escapeHTML(s.nome)}</span>
            <span class="prp-servico-meta">${escapeHTML(resumoServico(s))}${s.congelado ? ' · cópia congelada na proposta' : ''}</span></label>
        </li>`).join('');
    return `${prop.assessment_id ? `<p class="prp-nota">Com diagnóstico, os serviços de projeto vêm marcados com os dias da faixa ${escapeHTML(FAIXAS[faixa()])}.</p>` : ''}
        ${itens ? `<ul class="prp-servicos">${itens}</ul>` : '<p class="prp-nota">O catálogo está vazio: cadastre os serviços antes.</p>'}`;
}

function avisoTeto(desconto) {
    return acimaDoTeto(desconto, teto())
        ? `<p class="prp-teto">Desconto acima do teto de ${escapeHTML(teto())}%: ao gerar, a proposta vai aguardar a aprovação do administrador da plataforma.</p>`
        : '';
}

function campo(id, rotulo, valor, o = {}) {
    const f = `prp-${id}`;
    const dica = o.dica ? `<p class="prp-dica" id="${f}-dica">${escapeHTML(o.dica)}</p>` : '';
    const desc = o.dica ? ` aria-describedby="${f}-dica"` : '';
    const extra = `${o.ro ? ' readonly' : ''}${o.acao ? ` data-action-input="${o.acao}"` : ''}${o.placeholder ? ` placeholder="${escapeHTML(o.placeholder)}"` : ''}`;
    const ent = o.area
        ? `<textarea class="form-input" id="${f}" rows="${o.linhas || 3}"${desc}${extra}>${escapeHTML(valor)}</textarea>`
        : `<input class="form-input" id="${f}" type="${o.tipo || 'text'}"${o.tipo === 'number' ? ' step="any" min="0"' : ''} value="${escapeHTML(valor ?? '')}"${desc}${extra}>`;
    return `<div class="form-group"><label class="form-label" for="${f}">${escapeHTML(rotulo)}</label>${ent}${dica}</div>`;
}

function passoAjustes() {
    const mem = prop.memoria || {};
    const m = prop.margem;
    const itens = (prop.itens || []).map((i, k) => {
        const s = i.servico || {};
        const porDias = s.tipo === 'projeto' || (s.tipo === 'avulso' && s.formaPreco === 'esforco');
        return `<fieldset class="prp-item">
            <legend class="prp-item-leg">${escapeHTML(s.nome)}</legend>
            <div class="prp-grade3">
                ${porDias ? campo(`item-${k}-dias`, 'Dias', i.dias ?? '', { tipo: 'number', placeholder: `${s.diasPorFaixa?.[faixa()] ?? ''} (faixa)` }) : ''}
                ${s.tipo === 'recorrente' ? campo(`item-${k}-meses`, 'Meses', i.meses ?? '', { tipo: 'number', placeholder: `${s.prazoMinimoMeses ?? ''} (mínimo)` }) : ''}
                ${campo(`item-${k}-desconto`, 'Desconto (%)', i.desconto_pct || '', { tipo: 'number', acao: '__prpTeto', placeholder: '0' })}
            </div>
            <div id="prp-item-${k}-teto" aria-live="polite">${avisoTeto(i.desconto_pct)}</div>
            ${campo(`item-${k}-texto`, 'Texto para o cliente (opcional)', i.texto_cliente || '', { area: true, linhas: 2 })}
        </fieldset>`;
    }).join('');
    const margem = m ? `<p class="prp-margem">Custo ${escapeHTML(brl(Math.round(m.custoTotal)))} · receita líquida ${escapeHTML(brl(Math.round(m.receitaLiquida)))} ·
            margem <span class="${m.viavel ? 'prp-ok' : 'prp-alerta'}">${escapeHTML(Math.round(m.margemPct * 100))}%${m.viavel ? '' : ', abaixo da margem-alvo'}</span></p>` : '';
    return `<p class="prp-nota">Campo vazio usa o padrão do catálogo. Teto de desconto sem aprovação: ${escapeHTML(teto())}%.</p>
        ${itens}
        <div class="prp-calculo">
            <h3 class="prp-sub">Memória de cálculo</h3>
            ${mem.origem ? `<p class="prp-dica">Origem: ${escapeHTML(mem.origem)}${mem.pessoas ? `, ${escapeHTML(mem.pessoas)} pessoas` : ''}.</p>` : ''}
            <ul class="prp-memoria">${(mem.itens || []).map((t) => `<li>${escapeHTML(t)}</li>`).join('')}</ul>
            <p class="prp-totais">Projeto ${escapeHTML(valor(prop.total_projeto))} · mensalidade ${escapeHTML(valor(prop.mensalidade))}</p>
            ${margem}
            <button type="button" class="btn btn-secondary" data-action="__prpRecalcular">Recalcular</button>
        </div>`;
}

function passoCondicoes() {
    const provisorio = prop.numero
        ? `A revisão mantém o número ${prop.numero}.`
        : 'Número provisório: a sugestão segue a sequência da organização e só é reservada ao gerar. Pode trocar por outro no formato PREFIXO-AAAA-NNN.';
    return `<div class="prp-grade3">
            ${campo('numero', 'Número', numeroEscolhido, { ro: !!prop.numero, dica: provisorio })}
            ${campo('validade', 'Validade (dias)', prop.validade_dias, { tipo: 'number' })}
            ${campo('pagamento', 'Pagamento', prop.pagamento)}
        </div>
        ${campo('consultor', 'Consultor responsável (e-mail)', prop.consultor_email || '', { tipo: 'email' })}
        ${campo('contexto', 'Contexto', prop.contexto, { area: true, dica: 'Vira o texto do sumário executivo.' })}
        ${campo('escopo', 'Escopo', prop.escopo, { area: true })}
        ${campo('observacoes', 'Observações', prop.observacoes, { area: true })}`;
}

function passoRevisar() {
    if (!previa) return '<p class="prp-nota">Carregando a prévia...</p>';
    const { conteudo, textos = {} } = previa;
    const aviso = prop.numero
        ? `Revisão ${prop.revisao} do número ${prop.numero}.`
        : `Número provisório na prévia: ${conteudo.numero}. O número definitivo é reservado ao gerar${numeroEscolhido && numeroEscolhido !== cfg.sugestaoNumero ? ` (escolhido: ${numeroEscolhido})` : ''}.`;
    const secoes = conteudo.secoes.filter((s) => Object.prototype.hasOwnProperty.call(textos, s.id)).map((s) => `<div class="prp-secao">
            <div class="prp-secao-cab">
                <label class="form-label" for="prp-secao-${escapeHTML(s.id)}">${escapeHTML(s.titulo)}</label>
                ${s.editada ? `<span class="prp-editada">editada</span>
                    <button type="button" class="btn btn-secondary" data-action="__prpRestaurar" data-args='${args(s.id)}'>Restaurar padrão</button>` : ''}
            </div>
            <textarea class="form-input prp-secao-texto" id="prp-secao-${escapeHTML(s.id)}" rows="6" aria-describedby="prp-ajuda">${escapeHTML(textos[s.id])}</textarea>
        </div>`).join('');
    return `<p class="prp-nota">${escapeHTML(aviso)}</p>
        <div class="prp-revisar">
            <div class="prp-secoes">
                <p class="prp-dica" id="prp-ajuda">${escapeHTML(AJUDA)}</p>
                ${secoes}
                <button type="button" class="btn btn-secondary" data-action="__prpSalvarSecoes">Salvar e atualizar a prévia</button>
            </div>
            <iframe id="prp-previa" class="prp-frame" title="Prévia do documento" sandbox="allow-same-origin"></iframe>
        </div>`;
}

function bannerAprovacao() {
    if (prop?.status !== 'aguardando_aprovacao') return '';
    return ehAdmin()
        ? `<div class="prp-aprovacao" role="status"><p>Desconto acima do teto de ${escapeHTML(teto())}%: a proposta aguarda a sua aprovação.</p>
            <button type="button" class="btn btn-primary" data-action="__prpAprovar">Aprovar desconto</button></div>`
        : `<div class="prp-aprovacao" role="status"><p>Desconto acima do teto de ${escapeHTML(teto())}%: a proposta aguarda a aprovação do administrador da plataforma. Reduza o desconto ou espere a aprovação para gerar.</p></div>`;
}

function desenharAssistente() {
    const { c, h, a } = ultimo;
    h.textContent = prop ? `Proposta: ${prop.cliente}` : 'Nova proposta';
    a.innerHTML = '';
    const corpo = [passoCliente, passoServicos, passoAjustes, passoCondicoes, passoRevisar][passo - 1]();
    const voltar = passo > 1 && !(passo === 2 && !prop) ? '<button type="button" class="btn btn-secondary" data-action="__prpVoltar">Voltar</button>' : '';
    const seguir = passo < PASSOS.length
        ? '<button type="button" class="btn btn-primary" data-action="__prpAvancar">Avançar</button>'
        : `<button type="button" class="btn btn-primary" data-action="__prpGerar"${previa ? '' : ' disabled'}>Gerar</button>`;
    c.innerHTML = `
        <div class="prp fade-in">
            <ol class="prp-passos">${PASSOS.map((n, i) => `<li class="prp-passo-item ${i + 1 === passo ? 'prp-passo-atual' : ''}"${i + 1 === passo ? ' aria-current="step"' : ''}>
                <span class="prp-passo-num">${i + 1}</span>${escapeHTML(n)}</li>`).join('')}</ol>
            ${bannerAprovacao()}
            <section class="prp-passo" aria-labelledby="prp-passo-titulo">
                <h2 class="prp-titulo" id="prp-passo-titulo" tabindex="-1">${escapeHTML(PASSOS[passo - 1])}</h2>
                ${corpo}
            </section>
            <p class="prp-erro" id="prp-erro" role="alert">${escapeHTML(erro)}</p>
            <div class="prp-rodape">
                <button type="button" class="btn btn-secondary" data-action="__prpLista">Voltar à lista</button>
                <span class="prp-rodape-passos">${voltar}${seguir}</span>
            </div>
        </div>`;
    if (passo === 5 && previa) $('prp-previa').srcdoc = previa.html;
}

async function irPara(n) {
    passo = n;
    erro = '';
    if (n === 5) {
        previa = null;
        desenharAssistente();
        try { previa = await api('GET', `/api/v1/propostas/${encodeURIComponent(prop.id)}/previa`); } catch (e) { erro = e.message || 'Erro ao montar a prévia'; }
    }
    desenharAssistente();
    $('prp-passo-titulo')?.focus?.();
}

// ——— corpos no formato do schema ———
function itemDaLinha(i) {
    const b = { servicoId: i.servico_id };
    if (i.dias != null) b.dias = i.dias;
    if (i.meses != null) b.meses = i.meses;
    if (Number(i.desconto_pct) > 0) b.descontoPct = Number(i.desconto_pct);
    if (i.texto_cliente) b.textoCliente = i.texto_cliente;
    return b;
}

function itensDaTela() {
    return (prop.itens || []).map((i, k) => {
        const b = { servicoId: i.servico_id };
        const dias = num(`prp-item-${k}-dias`);
        const meses = num(`prp-item-${k}-meses`);
        const desc = num(`prp-item-${k}-desconto`);
        const texto = val(`prp-item-${k}-texto`).trim();
        if (dias !== undefined) b.dias = dias;
        if (meses !== undefined) b.meses = meses;
        if (desc) b.descontoPct = desc;
        if (texto) b.textoCliente = texto;
        return b;
    });
}

const mesmo = (x, y) => JSON.stringify(x) === JSON.stringify(y);

// Só manda itens quando mudaram: trocar itens derruba a aprovação de desconto já dada.
async function salvarItens(itens) {
    if (mesmo(itens, (prop.itens || []).map(itemDaLinha))) return;
    prop = await api('PUT', `/api/v1/propostas/${encodeURIComponent(prop.id)}`, { itens });
}

function secoesAlteradas() {
    const out = {};
    for (const [id, texto] of Object.entries(previa?.textos || {})) {
        const el = $(`prp-secao-${id}`);
        if (el && el.value !== texto) out[id] = el.value;
    }
    return out;
}

async function salvarSecoes() {
    const alteradas = secoesAlteradas();
    if (!Object.keys(alteradas).length) return false;
    prop = await api('PUT', `/api/v1/propostas/${encodeURIComponent(prop.id)}`, { secoesEditadas: alteradas });
    return true;
}

// ——— ações ———
window.__prpLista = () => { prop = null; carregarLista(); };

window.__prpNova = async () => {
    prop = null;
    leadSel = '';
    await prepararAssistente();
    passo = 1;
    desenharAssistente();
};

window.__prpLead = (id) => { leadSel = id; const f = $('prp-ficha'); if (f) f.innerHTML = fichaLead(id); };

window.__prpTeto = function () {
    const k = (this.id.match(/^prp-item-(\d+)-desconto$/) || [])[1];
    const slot = k !== undefined && $(`prp-item-${k}-teto`);
    if (slot) slot.innerHTML = avisoTeto(num(this.id) ?? 0);
};

window.__prpVoltar = () => irPara(passo - 1);

window.__prpAvancar = async () => {
    erro = '';
    try {
        if (passo === 1 && !prop) {
            if (!leadSel) throw new Error('Escolha o lead');
            prop = await api('POST', '/api/v1/propostas', { leadId: leadSel, itens: [] });
        } else if (passo === 2) {
            const escolhidos = [...document.querySelectorAll('.prp-servico input[type="checkbox"]:checked')].map((el) => el.value);
            if (!escolhidos.length) throw new Error('Escolha ao menos um serviço');
            const atuais = new Map((prop.itens || []).map((i) => [i.servico_id, itemDaLinha(i)]));
            await salvarItens(escolhidos.map((id) => atuais.get(id) || { servicoId: id }));
        } else if (passo === 3) {
            await salvarItens(itensDaTela());
        } else if (passo === 4) {
            if (!prop.numero) numeroEscolhido = val('prp-numero').trim() === '' ? (cfg.sugestaoNumero || '') : val('prp-numero');
            const consultor = val('prp-consultor').trim();
            prop = await api('PUT', `/api/v1/propostas/${encodeURIComponent(prop.id)}`, {
                contexto: val('prp-contexto'), escopo: val('prp-escopo'), observacoes: val('prp-observacoes'),
                validadeDias: num('prp-validade'), pagamento: val('prp-pagamento'), consultorEmail: consultor || null,
            });
        }
    } catch (e) {
        erro = e.message || 'Erro ao salvar';
        desenharAssistente();
        return;
    }
    await irPara(passo + 1);
};

window.__prpRecalcular = async () => {
    try { await salvarItens(itensDaTela()); erro = ''; } catch (e) { erro = e.message || 'Erro ao recalcular'; }
    desenharAssistente();
};

window.__prpSalvarSecoes = async () => {
    try { await salvarSecoes(); } catch (e) { erro = e.message || 'Erro ao salvar as seções'; desenharAssistente(); return; }
    await irPara(5);
};

window.__prpRestaurar = async (id) => {
    try {
        prop = await api('PUT', `/api/v1/propostas/${encodeURIComponent(prop.id)}`, { secoesEditadas: { [id]: null } });
    } catch (e) { erro = e.message || 'Erro ao restaurar a seção'; desenharAssistente(); return; }
    await irPara(5);
};

window.__prpGerar = async () => {
    erro = '';
    try {
        if (await salvarSecoes()) previa = await api('GET', `/api/v1/propostas/${encodeURIComponent(prop.id)}/previa`);
        // sem número trocado, o servidor reserva o próximo da sequência (a sugestão pode ter andado)
        const corpo = !prop.numero && numeroEscolhido && numeroEscolhido !== cfg.sugestaoNumero ? { numero: numeroEscolhido } : {};
        prop = await api('POST', `/api/v1/propostas/${encodeURIComponent(prop.id)}/gerar`, corpo);
    } catch (e) {
        erro = e.message || 'Erro ao gerar a proposta';
        // o 409 de teto muda o status para aguardando_aprovacao: relê para mostrar o aviso
        try { prop = await api('GET', `/api/v1/propostas/${encodeURIComponent(prop.id)}`); } catch { /* fica o que havia */ }
        desenharAssistente();
        return;
    }
    window.showToast(`Proposta ${prop.numero} gerada`);
    await abrirDocumento(prop);
};

window.__prpAprovar = async () => {
    try {
        prop = await api('POST', `/api/v1/propostas/${encodeURIComponent(prop.id)}/aprovar-desconto`);
        window.showToast('Desconto aprovado');
        erro = '';
    } catch (e) { erro = e.message || 'Erro ao aprovar o desconto'; }
    desenharAssistente();
};

window.__prpAbrir = async (id) => {
    try {
        const p = await api('GET', `/api/v1/propostas/${encodeURIComponent(id)}`);
        if (!EDITAVEL.includes(p.status)) { await abrirDocumento(p); return; }
        prop = p;
        await prepararAssistente();
        passo = 3;
        desenharAssistente();
    } catch (e) { window.showToast(e.message || 'Erro ao abrir a proposta', 'error'); }
};

window.__prpRevisao = async (id) => {
    try {
        prop = await api('POST', `/api/v1/propostas/${encodeURIComponent(id)}/revisao`);
        window.showToast(`Revisão ${prop.revisao} criada`);
        await prepararAssistente();
        passo = 3;
        desenharAssistente();
    } catch (e) { window.showToast(e.message || 'Erro ao criar a revisão', 'error'); }
};

// ——— documento ———
let docAberto = null;

async function abrirDocumento(p) {
    docAberto = p;
    const { c, h, a } = ultimo;
    h.textContent = `Proposta ${p.numero || ''}`;
    a.innerHTML = '';
    c.innerHTML = `
        <div class="prp fade-in">
            <div class="prp-doc-barra">
                <div>
                    <h2 class="prp-titulo">${escapeHTML(p.numero)} <span class="prp-rev">rev. ${escapeHTML(p.revisao)}</span></h2>
                    <p class="prp-nota">${escapeHTML(p.cliente)} ${pilula(p.status)}</p>
                </div>
                <div class="prp-acoes">
                    <button type="button" class="btn btn-secondary" data-action="__prpLista">Voltar à lista</button>
                    ${COM_REVISAO.includes(p.status) ? `<button type="button" class="btn btn-secondary" data-action="__prpRevisao" data-args='${args(p.id)}'>Nova revisão</button>` : ''}
                    <button type="button" class="btn btn-secondary" data-action="__prpWord">Baixar Word (cópia de trabalho)</button>
                    <button type="button" class="btn btn-primary" data-action="__prpImprimir">Imprimir / PDF</button>
                </div>
            </div>
            <p class="prp-dica">O que vale para o aceite é este documento, congelado na geração. O Word é cópia de trabalho.</p>
            <iframe id="prp-documento" class="prp-frame prp-frame-doc" title="Documento da proposta" sandbox="allow-same-origin allow-modals"></iframe>
        </div>`;
    try {
        const r = await buscar(`/api/v1/propostas/${encodeURIComponent(p.id)}/documento`);
        $('prp-documento').srcdoc = await r.text();
    } catch (e) { window.showToast(e.message || 'Erro ao ler o documento', 'error'); }
}

window.__prpDocumento = async (id) => {
    try { await abrirDocumento(await api('GET', `/api/v1/propostas/${encodeURIComponent(id)}`)); } catch (e) { window.showToast(e.message || 'Erro ao abrir o documento', 'error'); }
};

window.__prpImprimir = () => {
    const titulo = document.title;
    document.title = docAberto?.numero || 'Proposta';
    $('prp-documento')?.contentWindow?.print();
    document.title = titulo;
};

window.__prpWord = async () => {
    try {
        const r = await buscar(`/api/v1/propostas/${encodeURIComponent(docAberto.id)}/docx`);
        const url = URL.createObjectURL(await r.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `${docAberto.numero}-rev${docAberto.revisao}.docx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { window.showToast(e.message || 'Erro ao baixar o Word', 'error'); }
};

export { renderPropostas };
window.renderPropostas = renderPropostas;
