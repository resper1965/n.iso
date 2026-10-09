import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, escapeHTML } from '../ui.js';

// Titular e incidentes (fatia 7 do núcleo, só registro interno): pedidos do titular, incidentes, consentimentos e prazos legais.
// Toda regra é do servidor (protocolo, prazo congelado, encerramento do incidente); aqui só se mostra e se chama. Texto escapado.

const TIPOS_PEDIDO = { confirmacao: 'Confirmação de tratamento', acesso: 'Acesso aos dados', correcao: 'Correção', anonimizacao_bloqueio_eliminacao: 'Anonimização, bloqueio ou eliminação', portabilidade: 'Portabilidade',
    informacao_compartilhamento: 'Informação sobre compartilhamento', revogacao_consentimento: 'Revogação do consentimento', oposicao: 'Oposição', outro: 'Outro' };
const CANAIS = { email: 'E-mail', telefone: 'Telefone', formulario: 'Formulário', presencial: 'Presencial', outro: 'Outro' };
const STATUS_PEDIDO = { recebido: 'Recebido', em_andamento: 'Em andamento', respondido: 'Respondido', negado: 'Negado', arquivado: 'Arquivado' };
const PRAZO = { sem_prazo: ['Prazo não calculado', 'neutral'], encerrado: ['Encerrado', 'neutral'], no_prazo: ['No prazo', 'success'], vence_hoje: ['Vence hoje', 'warning'], atrasado: ['Atrasado', 'danger'], comunicado: ['Comunicado', 'success'] };
const RISCOS = { sem_risco: 'Sem risco', baixo: 'Baixo', relevante: 'Relevante' };
const STATUS_INCIDENTE = { aberto: 'Aberto', avaliado: 'Avaliado', comunicado: 'Comunicado', encerrado: 'Encerrado' };
const UNIDADES = { horas: 'horas', dias_corridos: 'dias corridos', dias_uteis: 'dias úteis' };
const ABAS = { pedidos: 'Pedidos do titular', incidentes: 'Incidentes', consentimentos: 'Consentimentos', prazos: 'Prazos legais' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const ehAdmin = () => !!S.user && S.user.role === 'platform_admin';
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dia = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '—');
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const selo = (chave) => { const [r, t] = PRAZO[chave] || [chave, 'neutral']; return window.renderStatusBadge(r, t); };
const opcoes = (mapa, atual) => Object.entries(mapa).map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
const valorOuNulo = (id) => { const v = el(id).value.trim(); return v || null; };

async function renderTitular(c, h, a) {
    h.textContent = 'Titular e incidentes';
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    const aba = ABAS[S.titularAba] ? S.titularAba : 'pedidos';
    S.titularAba = aba;
    const editar = podeEditar();
    const abas = `<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1rem">${Object.entries(ABAS).map(([v, r]) =>
        `<button class="btn ${v === aba ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="escolherAbaTitular" data-args='${args(v)}'>${escapeHTML(r)}</button>`).join('')}</div>`;
    const novo = (acao, rotulo) => (editar ? `<button class="btn btn-primary" data-action="${acao}" data-args='${args(proj.id)}'>${rotulo}</button>` : '');
    a.innerHTML = aba === 'pedidos' ? novo('abrirNovoPedidoTitular', '+ Registrar pedido')
        : aba === 'incidentes' ? novo('abrirNovoIncidente', '+ Registrar incidente')
        : aba === 'consentimentos' ? novo('abrirNovoConsentimento', '+ Registrar consentimento') : '';

    let corpo = '';
    if (aba === 'pedidos') {
        let l = []; try { l = lista(await api('GET', `/api/v1/projects/${proj.id}/titular-pedidos`)); } catch (e) { /* tabela vazia */ }
        corpo = window.renderDataTable(['Protocolo', 'Tipo', 'Recebido em', 'Prazo', 'Situação', 'Status', 'Ações'], l.map((p) => [
            `<strong>${escapeHTML(p.protocolo)}</strong>`, escapeHTML(TIPOS_PEDIDO[p.tipo] || p.tipo), escapeHTML(dia(p.recebido_em)), escapeHTML(p.prazo_em ? dia(p.prazo_em) : 'Não calculado'),
            selo(p.situacao_prazo), escapeHTML(STATUS_PEDIDO[p.status] || p.status),
            `<button class="btn btn-ghost btn-sm" data-action="abrirPedidoTitular" data-args='${args(proj.id, p.id)}'>Abrir</button>`,
        ]), { emptyState: 'Nenhum pedido de titular registrado.' });
    } else if (aba === 'incidentes') {
        let l = []; try { l = lista(await api('GET', `/api/v1/projects/${proj.id}/incidentes`)); } catch (e) { /* tabela vazia */ }
        corpo = window.renderDataTable(['Protocolo', 'Incidente', 'Ciência', 'Risco', 'ANPD', 'Titular', 'Status', 'Ações'], l.map((i) => [
            `<strong>${escapeHTML(i.protocolo)}</strong>`, escapeHTML(i.titulo), escapeHTML(dia(i.ciencia_em)), escapeHTML(RISCOS[i.risco_titular] || 'Não avaliado'),
            selo(i.situacao_anpd), selo(i.situacao_titular), escapeHTML(STATUS_INCIDENTE[i.status] || i.status),
            `<button class="btn btn-ghost btn-sm" data-action="abrirIncidente" data-args='${args(proj.id, i.id)}'>Abrir</button>`,
        ]), { emptyState: 'Nenhum incidente registrado.' });
    } else if (aba === 'consentimentos') {
        let l = []; try { l = lista(await api('GET', `/api/v1/projects/${proj.id}/consentimentos`)); } catch (e) { /* tabela vazia */ }
        corpo = `<p style="color:var(--text-dim)">Use uma referência pseudonimizada do titular. Não registre CPF.</p>` + window.renderDataTable(['Tratamento', 'Referência', 'Finalidade', 'Aviso', 'Obtido em', 'Situação', 'Ações'], l.map((x) => [
            escapeHTML(x.tratamento), escapeHTML(x.titular_ref), escapeHTML(x.finalidade), escapeHTML(x.versao_aviso), escapeHTML(dia(x.obtido_em)),
            x.vigente ? window.renderStatusBadge('Vigente', 'success') : window.renderStatusBadge(`Revogado em ${dia(x.revogado_em)}`, 'neutral'),
            x.vigente && editar ? `<button class="btn btn-ghost btn-sm" data-action="revogarConsentimento" data-args='${args(proj.id, x.id)}'>Revogar</button>` : '',
        ]), { emptyState: 'Nenhum consentimento registrado.' });
    } else {
        let l = []; try { l = lista(await api('GET', '/api/v1/parametros-legais')); } catch (e) { /* tabela vazia */ }
        corpo = `<p style="color:var(--text-dim)">O prazo legal não vem do código: o administrador da plataforma cadastra cada valor com a fonte e a data da revisão do jurídico. Sem o valor, o prazo fica "não calculado".</p>`
            + window.renderDataTable(['Prazo', 'Valor', 'Fonte', 'Revisado', 'Ações'], l.map((p) => [
                `<strong>${escapeHTML(p.descricao)}</strong>`, p.definido ? escapeHTML(`${p.valor} ${UNIDADES[p.unidade] || p.unidade}`) : 'Não definido',
                escapeHTML(p.fonte || '—'), p.definido ? escapeHTML(`${dia(p.revisado_em)} por ${p.revisado_por}`) : '—',
                ehAdmin() ? `<button class="btn btn-ghost btn-sm" data-action="editarParametroLegal" data-args='${args(p.chave, p.descricao, p.valor ?? '', p.unidade || 'dias_corridos', p.fonte || '', p.revisado_em || '', p.revisado_por || '', !!p.definido)}'>${p.definido ? 'Editar' : 'Definir'}</button>` : '',
            ]), { emptyState: 'Sem parâmetros.' });
    }
    c.innerHTML = abas + corpo;
}

window.escolherAbaTitular = function (aba) { S.titularAba = aba; window.render(); };

async function acao(fazer, padrao, sucesso, reabrir) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        if (reabrir) await reabrir();
        window.render();
    } catch (e) { falha(e, padrao); }
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────────────────────────
window.abrirNovoPedidoTitular = function (projectId) {
    openModal(`<h3>Registrar pedido do titular</h3>
        <div class="form-group"><label class="form-label" for="pt-tipo">Tipo</label><select class="form-input" id="pt-tipo">${opcoes(TIPOS_PEDIDO)}</select></div>
        <div class="form-group"><label class="form-label" for="pt-canal">Canal</label><select class="form-input" id="pt-canal">${opcoes(CANAIS, 'outro')}</select></div>
        <div class="form-group"><label class="form-label" for="pt-nome">Nome do titular (opcional)</label><input class="form-input" id="pt-nome" maxlength="200"></div>
        <div class="form-group"><label class="form-label" for="pt-contato">Contato (opcional)</label><input class="form-input" id="pt-contato" maxlength="300"></div>
        <div class="form-group"><label class="form-label" for="pt-data">Recebido em</label><input class="form-input" id="pt-data" type="date"></div>
        <div class="form-group"><label class="form-label" for="pt-desc">Descrição</label><textarea class="form-input" id="pt-desc" rows="3" maxlength="5000"></textarea></div>
        <button class="btn btn-primary" data-action="salvarNovoPedidoTitular" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoPedidoTitular = (projectId) => acao(async () => {
    const r = await api('POST', `/api/v1/projects/${projectId}/titular-pedidos`, {
        tipo: el('pt-tipo').value, canal: el('pt-canal').value, titular_nome: valorOuNulo('pt-nome'), titular_contato: valorOuNulo('pt-contato'),
        descricao: valorOuNulo('pt-desc'), ...(el('pt-data').value ? { recebido_em: el('pt-data').value } : {}),
    });
    showToast(`Pedido ${r.protocolo} registrado. ${r.prazo_em ? `Prazo: ${dia(r.prazo_em)}.` : 'Prazo não calculado (cadastre o prazo legal).'}`, 'success');
    forceCloseModal();
}, 'Não foi possível registrar o pedido');

window.abrirPedidoTitular = async function (projectId, id) {
    let p;
    try { p = await api('GET', `/api/v1/projects/${projectId}/titular-pedidos/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o pedido'); return; }
    const editar = podeEditar();
    const final = p.status === 'respondido' || p.status === 'negado';
    openModal(`<h3>${escapeHTML(p.protocolo)} — ${escapeHTML(TIPOS_PEDIDO[p.tipo] || p.tipo)}</h3>
        <p>${selo(p.situacao_prazo)} Recebido em ${escapeHTML(dia(p.recebido_em))}; prazo ${escapeHTML(p.prazo_em ? dia(p.prazo_em) : 'não calculado')}.</p>
        <p id="pt-quem">${escapeHTML(p.titular_nome || 'Titular não identificado')} ${p.titular_contato ? `· ${escapeHTML(p.titular_contato)}` : ''} · ${escapeHTML(CANAIS[p.canal] || p.canal)}</p>
        <p id="pt-descricao" style="white-space:pre-wrap">${escapeHTML(p.descricao || '')}</p>
        ${editar && p.status !== 'arquivado' ? `<div class="form-group"><label class="form-label" for="pt-status">Status</label><select class="form-input" id="pt-status">${opcoes(STATUS_PEDIDO, p.status)}</select></div>
            <div class="form-group"><label class="form-label" for="pt-resp">Resposta</label><textarea class="form-input" id="pt-resp" rows="4" maxlength="5000" ${final ? 'disabled' : ''}>${escapeHTML(p.resposta_texto || '')}</textarea></div>
            <button class="btn btn-primary" data-action="salvarPedidoTitular" data-args='${args(projectId, id)}'>Salvar</button>`
            : `<p id="pt-resposta" style="white-space:pre-wrap">${escapeHTML(p.resposta_texto || '')}</p>`}`, 'modal-large');
};

window.salvarPedidoTitular = (projectId, id) => acao(
    () => api('PUT', `/api/v1/projects/${projectId}/titular-pedidos/${id}`, { status: el('pt-status').value, resposta_texto: el('pt-resp').disabled ? undefined : valorOuNulo('pt-resp') }),
    'Não foi possível salvar o pedido', 'Pedido atualizado.', () => window.abrirPedidoTitular(projectId, id));

// ─── Incidentes ───────────────────────────────────────────────────────────────────────────────────
window.abrirNovoIncidente = function (projectId) {
    openModal(`<h3>Registrar incidente</h3>
        <div class="form-group"><label class="form-label" for="in-titulo">Título</label><input class="form-input" id="in-titulo" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="in-desc">Descrição</label><textarea class="form-input" id="in-desc" rows="3" maxlength="5000"></textarea></div>
        <div class="form-group"><label class="form-label" for="in-ocorrido">Ocorreu em (opcional)</label><input class="form-input" id="in-ocorrido" type="date"></div>
        <div class="form-group"><label class="form-label" for="in-ciencia">Ciência em (de onde contam os prazos)</label><input class="form-input" id="in-ciencia" type="date"></div>
        <button class="btn btn-primary" data-action="salvarNovoIncidente" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoIncidente = function (projectId) {
    const titulo = valorOuNulo('in-titulo'); const ciencia = el('in-ciencia').value;
    if (!titulo || !ciencia) { showToast('Informe o título e a data da ciência', 'error'); return; }
    return acao(async () => {
        const r = await api('POST', `/api/v1/projects/${projectId}/incidentes`, { titulo, descricao: valorOuNulo('in-desc'), ocorrido_em: el('in-ocorrido').value || null, ciencia_em: ciencia });
        showToast(`Incidente ${r.protocolo} registrado. ${r.prazo_anpd_em ? `Prazo ANPD: ${dia(r.prazo_anpd_em)}.` : 'Prazos não calculados (cadastre os prazos legais).'}`, 'success');
        forceCloseModal();
    }, 'Não foi possível registrar o incidente');
};

window.abrirIncidente = async function (projectId, id) {
    let i;
    try { i = await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o incidente'); return; }
    const editar = podeEditar() && i.status !== 'encerrado';
    openModal(`<h3>${escapeHTML(i.protocolo)} — ${escapeHTML(i.titulo)}</h3>
        <p style="white-space:pre-wrap">${escapeHTML(i.descricao || '')}</p>
        <p id="in-prazos">Ciência em ${escapeHTML(dia(i.ciencia_em))}. ANPD: ${selo(i.situacao_anpd)} (${escapeHTML(i.prazo_anpd_em ? dia(i.prazo_anpd_em) : 'prazo não calculado')}) · Titular: ${selo(i.situacao_titular)} (${escapeHTML(i.prazo_titular_em ? dia(i.prazo_titular_em) : 'prazo não calculado')}).</p>
        <p id="in-status">Status: ${escapeHTML(STATUS_INCIDENTE[i.status] || i.status)} · Risco ao titular: ${escapeHTML(RISCOS[i.risco_titular] || 'não avaliado')}</p>
        ${editar ? `<h4 style="margin:1rem 0 0.5rem">Avaliar o risco</h4>
            <div class="form-group"><select class="form-input" id="in-risco" aria-label="Risco ao titular">${opcoes(RISCOS, i.risco_titular)}</select></div>
            <div class="form-group"><textarea class="form-input" id="in-aval" rows="2" maxlength="5000" placeholder="Justificativa">${escapeHTML(i.avaliacao_texto || '')}</textarea></div>
            <button class="btn btn-sm" data-action="avaliarRiscoIncidente" data-args='${args(projectId, id)}'>Salvar avaliação</button>
            <h4 style="margin:1rem 0 0.5rem">Comunicações</h4>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
                ${i.comunicacao_anpd_em ? '' : `<button class="btn btn-sm" data-action="registrarComunicacaoIncidente" data-args='${args(projectId, id, 'anpd')}'>Registrei a comunicação à ANPD</button>`}
                ${i.comunicacao_titular_em ? '' : `<button class="btn btn-sm" data-action="registrarComunicacaoIncidente" data-args='${args(projectId, id, 'titular')}'>Registrei a comunicação ao titular</button>`}
                <button class="btn btn-primary btn-sm" data-action="encerrarIncidente" data-args='${args(projectId, id)}'>Encerrar incidente</button>
            </div>` : ''}`, 'modal-large');
};

const reabrirIncidente = (projectId, id) => () => window.abrirIncidente(projectId, id);

window.avaliarRiscoIncidente = (projectId, id) => acao(
    () => api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}/risco`, { risco_titular: el('in-risco').value, avaliacao_texto: valorOuNulo('in-aval') }),
    'Não foi possível salvar a avaliação', 'Avaliação salva.', reabrirIncidente(projectId, id));

window.registrarComunicacaoIncidente = (projectId, id, destino) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/comunicacoes`, { destino }), 'Não foi possível registrar a comunicação', 'Comunicação registrada.', reabrirIncidente(projectId, id));

window.encerrarIncidente = (projectId, id) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/encerrar`), 'Não foi possível encerrar o incidente', 'Incidente encerrado.', reabrirIncidente(projectId, id));

// ─── Consentimentos ───────────────────────────────────────────────────────────────────────────────
window.abrirNovoConsentimento = async function (projectId) {
    let tratamentos = [];
    try { const r = await api('GET', `/api/v1/projects/${projectId}/ropa`); tratamentos = Array.isArray(r) ? r : lista(r && r.records); } catch (e) { /* sem seletor */ }
    if (!tratamentos.length) { showToast('Cadastre um tratamento no RoPA primeiro', 'error'); return; }
    openModal(`<h3>Registrar consentimento</h3>
        <div class="form-group"><label class="form-label" for="co-ropa">Tratamento</label><select class="form-input" id="co-ropa">${tratamentos.map((t) => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.processing_purpose)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="co-ref">Referência do titular (pseudonimizada, sem CPF)</label><input class="form-input" id="co-ref" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="co-fin">Finalidade</label><input class="form-input" id="co-fin" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="co-aviso">Versão do aviso</label><input class="form-input" id="co-aviso" maxlength="500" placeholder="Ex.: Política de Privacidade v3"></div>
        <div class="form-group"><label class="form-label" for="co-data">Obtido em</label><input class="form-input" id="co-data" type="date"></div>
        <div class="form-group"><label class="form-label" for="co-canal">Canal (opcional)</label><input class="form-input" id="co-canal" maxlength="100"></div>
        <button class="btn btn-primary" data-action="salvarNovoConsentimento" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoConsentimento = function (projectId) {
    const campos = { titular_ref: valorOuNulo('co-ref'), finalidade: valorOuNulo('co-fin'), versao_aviso: valorOuNulo('co-aviso'), obtido_em: el('co-data').value };
    if (Object.values(campos).some((v) => !v)) { showToast('Preencha referência, finalidade, versão do aviso e data', 'error'); return; }
    return acao(async () => {
        await api('POST', `/api/v1/projects/${projectId}/consentimentos`, { ropa_id: el('co-ropa').value, canal: valorOuNulo('co-canal'), ...campos });
        forceCloseModal();
    }, 'Não foi possível registrar o consentimento', 'Consentimento registrado.');
};

window.revogarConsentimento = (projectId, id) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/consentimentos/${id}/revogar`), 'Não foi possível revogar o consentimento', 'Consentimento revogado.');

// ─── Prazos legais (só o administrador da plataforma) ─────────────────────────────────────────────
window.editarParametroLegal = function (chave, descricao, valor, unidade, fonte, revisadoEm, revisadoPor, definido) {
    openModal(`<h3>${escapeHTML(descricao)}</h3>
        <div class="form-group"><label class="form-label" for="pl-valor">Valor</label><input class="form-input" id="pl-valor" type="number" min="1" value="${escapeHTML(String(valor))}"></div>
        <div class="form-group"><label class="form-label" for="pl-unidade">Unidade</label><select class="form-input" id="pl-unidade">${opcoes(UNIDADES, unidade)}</select></div>
        <div class="form-group"><label class="form-label" for="pl-fonte">Fonte (norma e artigo)</label><input class="form-input" id="pl-fonte" maxlength="1000" value="${escapeHTML(fonte)}"></div>
        <div class="form-group"><label class="form-label" for="pl-rev-em">Revisado em</label><input class="form-input" id="pl-rev-em" type="date" value="${escapeHTML(String(revisadoEm).slice(0, 10))}"></div>
        <div class="form-group"><label class="form-label" for="pl-rev-por">Revisado por</label><input class="form-input" id="pl-rev-por" maxlength="200" value="${escapeHTML(revisadoPor)}"></div>
        <div style="display:flex; gap:0.5rem"><button class="btn btn-primary" data-action="salvarParametroLegal" data-args='${args(chave)}'>Salvar</button>
        ${definido ? `<button class="btn btn-ghost" data-action="removerParametroLegal" data-args='${args(chave)}'>Remover (volta a "não calculado")</button>` : ''}</div>`);
};

window.salvarParametroLegal = function (chave) {
    const valor = parseInt(el('pl-valor').value, 10);
    const dados = { valor, unidade: el('pl-unidade').value, fonte: valorOuNulo('pl-fonte'), revisado_em: el('pl-rev-em').value, revisado_por: valorOuNulo('pl-rev-por') };
    if (!Number.isInteger(valor) || valor < 1 || !dados.fonte || !dados.revisado_em || !dados.revisado_por) { showToast('Informe valor, fonte, data e quem revisou', 'error'); return; }
    return acao(async () => {
        await api('PUT', `/api/v1/parametros-legais/${chave}`, dados);
        forceCloseModal();
    }, 'Não foi possível salvar o prazo', 'Prazo legal salvo.');
};

window.removerParametroLegal = (chave) => acao(async () => {
    await api('DELETE', `/api/v1/parametros-legais/${chave}`);
    forceCloseModal();
}, 'Não foi possível remover o prazo', 'Prazo removido.');

window.renderTitular = renderTitular;
