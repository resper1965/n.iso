// Organizações (multiconsultoria, fatia 5): só o platform_admin. Rotas: GET/POST /api/v1/platform/orgs,
// PUT /api/v1/platform/orgs/:id e POST /api/v1/platform/projects/:id/transferir. Corpos .strict()
// (criarOrgSchema, atualizarOrgSchema, transferirProjetoSchema em src/schemas/domain.ts).
// Também aqui: o seletor de organização do cabeçalho (S.orgAtuacao), que faz o api.js mandar
// X-Org-Id enquanto o platform_admin atua em outra organização que não a ness.
import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, openModal, forceCloseModal } from '../ui.js';

const ORG_NESS = 'org_ness';
const CHAVE = 'niso_orgAtuacao';

let ultimo = null;          // { c, h, a }
let orgs = [];
let carregando = null;      // promessa da lista em voo (o seletor e a tela dividem)
let carregadas = false;     // a lista já veio uma vez (mesmo vazia): o seletor não pede de novo em laço
let confirmando = null;     // { id, status } aguardando confirmação de suspender/reativar
let transf = null;          // { origem, projeto, destino, motivo } da transferência em revisão
let projetos = [];

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const num = (id) => { const s = val(id).trim(); return s === '' ? undefined : Number(s); };
const ehPlatformAdmin = () => S.user?.role === 'platform_admin';
const nomeDe = (id) => orgs.find((o) => o.id === id)?.nome || id;
// fim de frase com o nome: "ness." não ganha um segundo ponto
const fimDe = (nome) => (nome.endsWith('.') ? nome : nome + '.');
const data = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleDateString('pt-BR') : '');

// ——— organização em que o platform_admin atua (memória + sessionStorage) ———
function lerSalva() {
    try { return sessionStorage.getItem(CHAVE) || null; } catch { return null; }
}
function gravar(id) {
    S.orgAtuacao = id && id !== ORG_NESS ? id : null;
    try {
        if (S.orgAtuacao) sessionStorage.setItem(CHAVE, S.orgAtuacao);
        else sessionStorage.removeItem(CHAVE);
    } catch { /* sem storage: fica só em memória */ }
}
S.orgAtuacao = lerSalva();

async function carregarOrgs(forcar) {
    if (!carregando || forcar) {
        carregando = api('GET', '/api/v1/platform/orgs').then((l) => { orgs = Array.isArray(l) ? l : []; carregadas = true; return orgs; });
        carregando.catch(() => { carregando = null; });
    }
    return carregando;
}

/** Desenha o seletor e a faixa "Atuando em". Chamado pelo updateHeaderUser a cada render. */
function atualizarSeletorOrg() {
    const caixa = $('org-seletor');
    const faixa = $('org-faixa');
    if (!ehPlatformAdmin()) {
        // qualquer outro papel: sem seletor, sem faixa e sem organização guardada
        if (S.orgAtuacao || lerSalva()) gravar(null);
        if (caixa) { caixa.innerHTML = ''; caixa.hidden = true; }
        if (faixa) { faixa.innerHTML = ''; faixa.hidden = true; }
        return;
    }
    desenharFaixa();
    if (!caixa) return;
    if (!carregadas) {
        carregarOrgs().then(() => { if (carregadas) atualizarSeletorOrg(); }).catch(() => {});
        return;
    }
    // org guardada que não existe mais: volta à ness. em vez de mandar um X-Org-Id que dá 403
    if (S.orgAtuacao && !orgs.some((o) => o.id === S.orgAtuacao)) gravar(null);
    const atual = S.orgAtuacao || ORG_NESS;
    caixa.hidden = false;
    caixa.innerHTML = `<label class="org-sel-rotulo" for="org-sel">Organização</label>
        <select class="org-sel" id="org-sel" data-action-change="__orgEscolher" data-arg-val>
            ${orgs.map((o) => `<option value="${escapeHTML(o.id)}"${o.id === atual ? ' selected' : ''}>${escapeHTML(o.nome)}${o.status === 'Suspended' ? ' (suspensa)' : ''}</option>`).join('')}
        </select>`;
    desenharFaixa();
}

function desenharFaixa() {
    const faixa = $('org-faixa');
    if (!faixa) return;
    if (!S.orgAtuacao) { faixa.innerHTML = ''; faixa.hidden = true; return; }
    faixa.hidden = false;
    faixa.innerHTML = `<p class="org-faixa-texto">Atuando em <strong>${escapeHTML(nomeDe(S.orgAtuacao))}</strong>. O que você vê e grava nas telas da equipe é desta organização.</p>
        <button type="button" class="btn btn-secondary" data-action="__orgVoltar">Voltar à ness.</button>`;
}

window.__orgEscolher = (id) => {
    if (!ehPlatformAdmin()) return;
    gravar(id);
    atualizarSeletorOrg();
    window.render?.();   // as telas de equipe recarregam com o X-Org-Id novo
};
window.__orgVoltar = () => window.__orgEscolher(ORG_NESS);

// ——— lista ———
function desenhar() {
    const { c, h, a } = ultimo;
    h.textContent = 'Organizações';
    a.innerHTML = `<button type="button" class="btn btn-secondary" data-action="__orgTransferir">Transferir projeto</button>
        <button type="button" class="btn btn-primary" data-action="__orgNova">Nova organização</button>`;
    const linhas = orgs.map((o) => {
        const id = escapeHTML(o.id);
        const susp = o.status === 'Suspended';
        const conf = confirmando?.id === o.id;
        let acoes;
        if (conf && confirmando.status === 'Suspended') {
            acoes = `<span class="org-confirma" role="alert">Suspender ${escapeHTML(o.nome)}? A equipe dela perde o acesso na hora.</span>
                <button type="button" class="btn btn-secondary" data-action="__orgConfirmarStatus">Sim, suspender</button>
                <button type="button" class="btn btn-secondary" data-action="__orgCancelarStatus">Cancelar</button>`;
        } else if (conf) {
            acoes = `<span class="org-confirma" role="alert">Reativar ${escapeHTML(o.nome)}? A equipe dela volta a entrar.</span>
                <button type="button" class="btn btn-secondary" data-action="__orgConfirmarStatus">Sim, reativar</button>
                <button type="button" class="btn btn-secondary" data-action="__orgCancelarStatus">Cancelar</button>`;
        } else {
            // a ness. opera a plataforma: não se suspende (o servidor também recusa)
            const status = o.id === ORG_NESS ? ''
                : `<button type="button" class="btn btn-secondary" data-action="${susp ? '__orgReativar' : '__orgSuspender'}" data-args='["${id}"]'>${susp ? 'Reativar' : 'Suspender'}</button>`;
            acoes = `<button type="button" class="btn btn-secondary" data-action="__orgEditar" data-args='["${id}"]'>Editar</button>${status}`;
        }
        const termo = o.termoVersao ? `${escapeHTML(o.termoVersao)}<span class="org-meta">aceito em ${escapeHTML(data(o.termoAceitoEm))}</span>` : '<span class="org-vazio">sem registro</span>';
        return `<tr data-org="${id}">
            <td><span class="org-nome">${escapeHTML(o.nome)}</span><span class="org-meta">${escapeHTML(o.slug)}</span></td>
            <td>${escapeHTML(o.plano)}</td>
            <td>${escapeHTML(o.projetos)} de ${escapeHTML(o.maxProjetos)}</td>
            <td>${escapeHTML(o.usuarios)} de ${escapeHTML(o.maxUsuarios)}</td>
            <td><span class="org-situacao${susp ? ' org-situacao-off' : ''}">${susp ? 'Suspensa' : 'Ativa'}</span></td>
            <td>${termo}</td>
            <td><div class="org-acoes">${acoes}</div></td>
        </tr>`;
    }).join('');
    c.innerHTML = `<div class="org fade-in">
        <div class="org-tabela-caixa"><table class="org-tabela">
            <caption class="org-sr">Organizações da plataforma</caption>
            <thead><tr><th scope="col">Organização</th><th scope="col">Plano</th><th scope="col">Projetos</th><th scope="col">Usuários</th><th scope="col">Situação</th><th scope="col">Termo de uso</th><th scope="col"><span class="org-sr">Ações</span></th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
    </div>`;
}

async function renderOrganizacoes(c, h, a) {
    ultimo = { c, h, a };
    confirmando = null;
    if (!ehPlatformAdmin()) {
        h.textContent = 'Organizações';
        a.innerHTML = '';
        c.innerHTML = '<p class="org-nota" role="alert">Acesso restrito ao administrador da plataforma.</p>';
        return;
    }
    try {
        await carregarOrgs(true);
    } catch (e) {
        c.innerHTML = '<p class="org-nota" role="alert">Não foi possível carregar as organizações.</p>';
        window.showToast(e.message || 'Erro ao carregar as organizações', 'error');
        return;
    }
    desenhar();
}

// ——— suspender / reativar (confirmação na linha, sem confirm()) ———
window.__orgSuspender = (id) => { if (id !== ORG_NESS) { confirmando = { id, status: 'Suspended' }; desenhar(); } };
window.__orgReativar = (id) => { confirmando = { id, status: 'Active' }; desenhar(); };
window.__orgCancelarStatus = () => { confirmando = null; desenhar(); };
window.__orgConfirmarStatus = async () => {
    if (!confirmando) return;
    const { id, status } = confirmando;
    try {
        await api('PUT', `/api/v1/platform/orgs/${encodeURIComponent(id)}`, { status });
        window.showToast(status === 'Suspended' ? 'Organização suspensa' : 'Organização reativada');
        confirmando = null;
        await carregarOrgs(true);
        desenhar();
        atualizarSeletorOrg();
    } catch (e) {
        window.showToast(e.message || 'Erro ao alterar a situação', 'error');
    }
};

// ——— formulários (nova e editar) ———
function campo(pref, id, rotulo, valor, o = {}) {
    const f = `${pref}-${id}`;
    const dica = o.dica ? `<p class="org-dica" id="${f}-dica">${escapeHTML(o.dica)}</p>` : '';
    return `<div class="form-group">
        <label class="form-label" for="${f}">${escapeHTML(rotulo)}</label>
        <input class="form-input" id="${f}" type="${o.tipo || 'text'}"${o.tipo === 'number' ? ' min="1" step="1"' : ''} value="${escapeHTML(valor ?? '')}" aria-describedby="${o.dica ? `${f}-dica ` : ''}${f}-erro"${o.extra || ''}>
        ${dica}<p class="org-erro" id="${f}-erro" role="alert"></p></div>`;
}

function limparErros(form) {
    form.querySelectorAll('.org-erro').forEach((p) => { p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

// Erro do servidor por campo: `details[].path` (zod) vira o id `<pref>-<path>`; o resto vai para o
// aviso geral do formulário (`<pref>-erro`), como o 409 de slug duplicado.
function mostrarErros(pref, e) {
    const sobra = [];
    for (const d of e.body?.details || []) {
        const el = $(`${pref}-${String(d.path || '').split('.')[0]}`);
        const p = el && $(`${el.id}-erro`);
        if (!p) { sobra.push(d.message); continue; }
        p.textContent = d.message;
        el.setAttribute('aria-invalid', 'true');
    }
    if (!(e.body?.details || []).length) sobra.push(e.message || 'Erro ao salvar');
    const geral = $(`${pref}-erro`);
    if (geral) geral.textContent = sobra.join(' ');
    document.querySelector('#modal-content [aria-invalid]')?.focus();
}

window.__orgNova = () => {
    openModal(`<form class="org-form" id="org-n-form" data-action-submit="__orgCriar" data-arg-event data-prevent novalidate>
        <h2 class="org-form-titulo">Nova organização</h2>
        <p class="org-nota">Cria a consultoria e o administrador dela. O administrador recebe por e-mail o convite com a senha provisória, que ele troca no primeiro acesso; a senha não aparece aqui.</p>
        <div class="org-grade2">
            ${campo('org-n', 'nome', 'Nome da organização', '')}
            ${campo('org-n', 'slug', 'Identificador (slug)', '', { dica: '3 a 40 letras minúsculas, números ou hífen. Vira o id org_<slug>.' })}
        </div>
        <div class="org-grade2">
            ${campo('org-n', 'prefixoProposta', 'Prefixo das propostas', '', { dica: '2 a 10 letras maiúsculas ou números, único na plataforma.' })}
            ${campo('org-n', 'cnpj', 'CNPJ (opcional)', '', { dica: '14 dígitos, só números.' })}
        </div>
        <h3 class="org-sub">Administrador da organização</h3>
        <div class="org-grade2">
            ${campo('org-n', 'adminNome', 'Nome', '')}
            ${campo('org-n', 'adminEmail', 'E-mail', '', { tipo: 'email' })}
        </div>
        <h3 class="org-sub">Plano e termo de uso</h3>
        <div class="org-grade3">
            ${campo('org-n', 'maxProjetos', 'Máximo de projetos', 10, { tipo: 'number' })}
            ${campo('org-n', 'maxUsuarios', 'Máximo de usuários', 5, { tipo: 'number' })}
            ${campo('org-n', 'termoVersao', 'Versão do termo de uso aceito', '', { dica: 'A data do aceite é a de hoje.' })}
        </div>
        <p class="org-erro" id="org-n-erro" role="alert"></p>
        <div class="org-form-rodape">
            <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="org-n-criar">Criar organização</button>
        </div>
    </form>`, 'modal-large');
    $('org-n-nome')?.focus();
};

window.__orgCriar = async () => {
    const form = $('org-n-form');
    limparErros(form);
    const cnpj = val('org-n-cnpj').trim();
    // exatamente as chaves do criarOrgSchema (.strict()); CNPJ vazio vai ausente
    const corpo = {
        nome: val('org-n-nome').trim(), slug: val('org-n-slug').trim(), prefixoProposta: val('org-n-prefixoProposta').trim(),
        ...(cnpj ? { cnpj } : {}),
        adminEmail: val('org-n-adminEmail').trim(), adminNome: val('org-n-adminNome').trim(),
        maxProjetos: num('org-n-maxProjetos'), maxUsuarios: num('org-n-maxUsuarios'), termoVersao: val('org-n-termoVersao').trim(),
    };
    const botao = $('org-n-criar');
    botao.disabled = true;
    let r;
    try {
        r = await api('POST', '/api/v1/platform/orgs', corpo);
    } catch (e) {
        botao.disabled = false;
        return mostrarErros('org-n', e);
    }
    // só os campos que a tela precisa: nada do corpo da resposta além disto chega ao DOM
    const aviso = r.emailEnviado === false
        ? `<p class="org-aviso" role="alert">O convite NÃO foi enviado: o e-mail falhou. Peça a ${escapeHTML(corpo.adminNome)} que entre pela opção "Esqueci a senha" da tela de entrada, com o e-mail ${escapeHTML(r.adminEmail)}.</p>`
        : `<p class="org-nota" role="status">Convite enviado para ${escapeHTML(r.adminEmail)}. O administrador troca a senha provisória no primeiro acesso.</p>`;
    $('modal-content').innerHTML = `<div class="org-form org-resultado" id="org-n-resultado">
        <h2 class="org-form-titulo">Organização criada</h2>
        <p class="org-nota">${escapeHTML(corpo.nome)} (${escapeHTML(r.id)}) está ativa.</p>
        ${aviso}
        <div class="org-form-rodape"><button type="button" class="btn btn-primary" data-action="forceCloseModal">Fechar</button></div>
    </div>`;
    await carregarOrgs(true).catch(() => {});
    if (ultimo && S.view === 'organizacoes') desenhar();
    atualizarSeletorOrg();
};

window.__orgEditar = (id) => {
    const o = orgs.find((x) => x.id === id);
    if (!o) return;
    openModal(`<form class="org-form" id="org-e-form" data-action-submit="__orgSalvar" data-args='${escapeHTML(JSON.stringify([id]))}' data-prevent novalidate>
        <h2 class="org-form-titulo">Editar ${escapeHTML(o.nome)}</h2>
        ${campo('org-e', 'nome', 'Nome da organização', o.nome)}
        <div class="org-grade2">
            ${campo('org-e', 'maxProjetos', `Máximo de projetos (em uso: ${o.projetos})`, o.maxProjetos, { tipo: 'number' })}
            ${campo('org-e', 'maxUsuarios', `Máximo de usuários (em uso: ${o.usuarios})`, o.maxUsuarios, { tipo: 'number' })}
        </div>
        <p class="org-erro" id="org-e-erro" role="alert"></p>
        <div class="org-form-rodape">
            <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="org-e-salvar">Salvar</button>
        </div>
    </form>`);
};

window.__orgSalvar = async (id) => {
    const form = $('org-e-form');
    limparErros(form);
    try {
        await api('PUT', `/api/v1/platform/orgs/${encodeURIComponent(id)}`,
            { nome: val('org-e-nome').trim(), maxProjetos: num('org-e-maxProjetos'), maxUsuarios: num('org-e-maxUsuarios') });
    } catch (e) {
        return mostrarErros('org-e', e);
    }
    forceCloseModal();
    window.showToast('Organização atualizada');
    await carregarOrgs(true).catch(() => {});
    desenhar();
    atualizarSeletorOrg();
};

// ——— transferir projeto ———
const opcoes = (lista, sel, vazio) => `<option value="">${escapeHTML(vazio)}</option>` +
    lista.map(([v, t]) => `<option value="${escapeHTML(v)}"${v === sel ? ' selected' : ''}>${escapeHTML(t)}</option>`).join('');
const nomeProjeto = (p) => p.project_name || p.client_name || p.id;

function formTransferencia() {
    const t = transf;
    const doOrigem = projetos.filter((p) => (p.org_id || ORG_NESS) === t.origem);
    const destinos = orgs.filter((o) => o.id !== t.origem && o.status !== 'Suspended');
    $('modal-content').innerHTML = `<form class="org-form" id="org-t-form" data-action-submit="__orgTRevisar" data-arg-event data-prevent novalidate>
        <h2 class="org-form-titulo">Transferir projeto</h2>
        <p class="org-nota">Passa um projeto para outra organização, por exemplo quando o cliente contrata outra consultoria.</p>
        <div class="form-group">
            <label class="form-label" for="org-t-origem">Organização de origem</label>
            <select class="form-input" id="org-t-origem" data-action-change="__orgTOrigem" data-arg-val aria-describedby="org-t-origem-erro">${opcoes(orgs.map((o) => [o.id, o.nome]), t.origem, 'Escolha a organização')}</select>
            <p class="org-erro" id="org-t-origem-erro" role="alert"></p>
        </div>
        <div class="form-group">
            <label class="form-label" for="org-t-projeto">Projeto</label>
            <select class="form-input" id="org-t-projeto" aria-describedby="org-t-projeto-erro"${t.origem ? '' : ' disabled'}>${opcoes(doOrigem.map((p) => [p.id, nomeProjeto(p)]), t.projeto, t.origem && !doOrigem.length ? 'Nenhum projeto nesta organização' : 'Escolha o projeto')}</select>
            <p class="org-erro" id="org-t-projeto-erro" role="alert"></p>
        </div>
        <div class="form-group">
            <label class="form-label" for="org-t-destino">Organização de destino</label>
            <select class="form-input" id="org-t-destino" aria-describedby="org-t-destino-dica org-t-destino-erro"${t.origem ? '' : ' disabled'}>${opcoes(destinos.map((o) => [o.id, o.nome]), t.destino, 'Escolha o destino')}</select>
            <p class="org-dica" id="org-t-destino-dica">Organizações suspensas não aparecem.</p>
            <p class="org-erro" id="org-t-destino-erro" role="alert"></p>
        </div>
        <div class="form-group">
            <label class="form-label" for="org-t-motivo">Motivo</label>
            <textarea class="form-input" id="org-t-motivo" rows="3" maxlength="500" aria-describedby="org-t-motivo-dica org-t-motivo-erro">${escapeHTML(t.motivo)}</textarea>
            <p class="org-dica" id="org-t-motivo-dica">Obrigatório, de 5 a 500 caracteres. Fica na trilha de auditoria.</p>
            <p class="org-erro" id="org-t-motivo-erro" role="alert"></p>
        </div>
        <p class="org-erro" id="org-t-erro" role="alert"></p>
        <div class="org-form-rodape">
            <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
            <button type="submit" class="btn btn-primary">Revisar a transferência</button>
        </div>
    </form>`;
}

function lerTransferencia() {
    transf.projeto = val('org-t-projeto');
    transf.destino = val('org-t-destino');
    transf.motivo = val('org-t-motivo');
}

window.__orgTransferir = async () => {
    try {
        [, projetos] = await Promise.all([carregarOrgs(), api('GET', '/api/v1/projects')]);
        if (!Array.isArray(projetos)) projetos = [];
    } catch (e) {
        window.showToast(e.message || 'Erro ao carregar os projetos', 'error');
        return;
    }
    transf = { origem: '', projeto: '', destino: '', motivo: '' };
    openModal('', 'modal-large');
    formTransferencia();
};

window.__orgTOrigem = (origem) => {
    lerTransferencia();
    transf = { ...transf, origem, projeto: '', destino: transf.destino === origem ? '' : transf.destino };
    formTransferencia();
    $('org-t-projeto')?.focus();
};

window.__orgTRevisar = () => {
    const form = $('org-t-form');
    limparErros(form);
    lerTransferencia();
    const t = transf;
    const erros = [];
    if (!t.origem) erros.push(['origem', 'Escolha a organização de origem.']);
    if (!t.projeto) erros.push(['projeto', 'Escolha o projeto.']);
    if (!t.destino) erros.push(['destino', 'Escolha a organização de destino.']);
    const m = t.motivo.trim().length;
    if (m < 5 || m > 500) erros.push(['motivo', 'Motivo com 5 a 500 caracteres.']);
    if (erros.length) {
        for (const [k, msg] of erros) {
            $(`org-t-${k}-erro`).textContent = msg;
            $(`org-t-${k}`).setAttribute('aria-invalid', 'true');
        }
        $(`org-t-${erros[0][0]}`).focus();
        return;
    }
    desenharConfirmacao('');
};

function desenharConfirmacao(erro) {
    const t = transf;
    const p = projetos.find((x) => x.id === t.projeto);
    const origem = escapeHTML(nomeDe(t.origem));
    const origemFim = escapeHTML(fimDe(nomeDe(t.origem)));
    const destino = escapeHTML(fimDe(nomeDe(t.destino)));
    $('modal-content').innerHTML = `<div class="org-form" id="org-t-confirma">
        <h2 class="org-form-titulo">Confirmar a transferência</h2>
        <p class="org-nota">Projeto <strong>${escapeHTML(p ? nomeProjeto(p) : t.projeto)}</strong>, de ${origem} para ${destino} O que acontece:</p>
        <ul class="org-efeitos">
            <li>O projeto passa para ${destino}</li>
            <li>Os consultores de ${origem} perdem o acesso ao projeto na hora.</li>
            <li>Os agentes conectados ao projeto são desconectados.</li>
            <li>Propostas e contratos continuam com ${origemFim}</li>
            <li>Os usuários do cliente continuam entrando normalmente.</li>
        </ul>
        <p class="org-meta">Motivo registrado na trilha: ${escapeHTML(t.motivo.trim())}</p>
        <p class="org-erro" id="org-t-erro" role="alert">${escapeHTML(erro)}</p>
        <div class="org-form-rodape">
            <button type="button" class="btn btn-secondary" data-action="__orgTVoltar">Voltar</button>
            <button type="button" class="btn btn-primary" id="org-t-confirmar" data-action="__orgTConfirmar">Confirmar transferência</button>
        </div>
    </div>`;
}

window.__orgTVoltar = () => formTransferencia();

window.__orgTConfirmar = async () => {
    const t = transf;
    if (!t) return;
    $('org-t-confirmar').disabled = true;
    try {
        await api('POST', `/api/v1/platform/projects/${encodeURIComponent(t.projeto)}/transferir`, { orgDestinoId: t.destino, motivo: t.motivo.trim() });
    } catch (e) {
        // 404 (projeto ou destino sumiu), 409 (destino suspenso, mesma organização, corrida): na tela
        const det = (e.body?.details || []).map((d) => d.message).join(' ');
        return desenharConfirmacao(det || e.message || 'Erro ao transferir o projeto');
    }
    forceCloseModal();
    transf = null;
    window.showToast('Projeto transferido');
    if (ultimo && S.view === 'organizacoes') await renderOrganizacoes(ultimo.c, ultimo.h, ultimo.a);
};

export { renderOrganizacoes, atualizarSeletorOrg };
window.renderOrganizacoes = renderOrganizacoes;
window.atualizarSeletorOrg = atualizarSeletorOrg;
window.nomeOrgAtuacao = () => (S.orgAtuacao ? nomeDe(S.orgAtuacao) : null);
