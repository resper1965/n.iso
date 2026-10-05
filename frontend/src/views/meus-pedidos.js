// "Meus pedidos": única tela do papel `stakeholder` (e de quem mais for destinatário). Lista os
// pedidos atribuídos (`GET /api/v1/pedidos`), abre o conteúdo CONGELADO no momento do pedido e
// aprova ou recusa com a senha. O hash mostrado é o que vai para a prova: é a versão lida.
// Também aqui: o modal com que a consultoria pede a aprovação de um documento (DPIA, por ora).
import { api } from '../api.js';
import { openModal, forceCloseModal, showToast, escapeHTML } from '../ui.js';

const PAPEIS = {
    ciso: 'Aprovação do Líder SGSI / DPO',
    ceo: 'Aprovação da Direção Executiva',
    ciente: 'Ciência',
};
const STATUS = {
    aberto: 'Aberto', aprovado: 'Concluído', recusado: 'Recusado', substituido: 'Substituído', cancelado: 'Cancelado',
    pendente: 'Pendente', ciente: 'Ciente',
};
// Rótulos do conteúdo congelado do DPIA, na ordem de leitura. Campo vazio não aparece.
const CAMPOS_DPIA = [
    ['processing_name', 'Atividade de tratamento'], ['system_name', 'Sistema'], ['data_flow_description', 'Fluxo de dados'],
    ['data_subjects_types', 'Tipos de titulares'], ['personal_data_categories', 'Categorias de dados pessoais'],
    ['data_category_risk', 'Riscos às categorias de dados'], ['necessity_proportionality', 'Necessidade e proporcionalidade'],
    ['risks_identified', 'Riscos identificados'], ['mitigation_measures', 'Medidas de mitigação'],
    ['technical_measures', 'Medidas técnicas e de segurança'], ['residual_risk_level', 'Risco residual'],
    ['dpo_recommendations', 'Recomendações do DPO'], ['dpo_opinion', 'Parecer do DPO'],
];

const data = (s) => (s ? new Date(s).toLocaleString('pt-BR') : '');
const el = (id) => document.getElementById(id);
const args = (...v) => escapeHTML(JSON.stringify(v));

window.renderMeusPedidos = async function renderMeusPedidos(c, h, a) {
    h.textContent = 'Meus pedidos';
    a.innerHTML = '';
    c.innerHTML = '<div class="empty-state fade-in"><p>Carregando…</p></div>';
    let pedidos = [];
    try {
        pedidos = (await api('GET', '/api/v1/pedidos')).pedidos || [];
    } catch (e) {
        c.innerHTML = `<div class="empty-state fade-in"><h3>Não foi possível carregar os pedidos</h3><p>${escapeHTML(e.message)}</p></div>`;
        return;
    }
    if (!pedidos.length) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum pedido por enquanto</h3><p>Quando a consultoria ou a sua empresa pedir sua ciência ou aprovação de um documento, ele aparece aqui.</p></div>';
        return;
    }
    c.innerHTML = `<div class="fade-in" style="display:flex;flex-direction:column;gap:10px;max-width:820px">
        ${pedidos.map((p) => `
        <button type="button" class="card" data-action="abrirPedido" data-args='${args(p.id)}'
            style="text-align:left;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 18px;cursor:pointer">
            <span>
                <span style="display:block;font-weight:600;color:var(--text)">${escapeHTML(p.titulo)}</span>
                <span style="display:block;font-size:12px;color:var(--text-dim)">${escapeHTML(PAPEIS[p.papel_exigido] || p.papel_exigido)} · ${escapeHTML(data(p.criado_em))}</span>
            </span>
            <span class="ctx-tag">${escapeHTML(p.meu_status === 'pendente' && p.status === 'aberto' ? 'Aguardando você' : STATUS[p.meu_status] || p.meu_status)}</span>
        </button>`).join('')}
    </div>`;
};

function conteudoHtml(tipo, conteudo) {
    const campos = tipo === 'dpia' ? CAMPOS_DPIA : Object.keys(conteudo).map((k) => [k, k]);
    return campos.filter(([k]) => conteudo[k] !== null && conteudo[k] !== undefined && conteudo[k] !== '')
        .map(([k, rotulo]) => `<div style="margin-bottom:12px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim);margin-bottom:4px">${escapeHTML(rotulo)}</div>
            <div style="font-size:14px;color:var(--text);white-space:pre-wrap">${escapeHTML(String(conteudo[k]))}</div>
        </div>`).join('') || '<p style="color:var(--text-dim)">Documento sem conteúdo preenchido.</p>';
}

window.abrirPedido = async function abrirPedido(id) {
    let r;
    try {
        r = await api('GET', `/api/v1/pedidos/${encodeURIComponent(id)}`);
    } catch (e) {
        showToast('Erro ao abrir o pedido: ' + e.message, 'error');
        return;
    }
    const { pedido: p, destinatario: d } = r;
    const decide = p.status === 'aberto' && d.status === 'pendente';
    const aviso = p.status === 'substituido'
        ? '<p class="login-error" role="status">O documento mudou depois deste pedido. Um pedido novo, com o texto atual, está em Meus pedidos.</p>'
        : '';
    openModal(`
        <div style="padding:1.5rem 1.75rem;max-width:720px">
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 4px">${escapeHTML(p.titulo)}</h3>
            <p style="font-size:12px;color:var(--text-dim);margin:0 0 16px">${escapeHTML(PAPEIS[p.papel_exigido] || p.papel_exigido)} · pedido por ${escapeHTML(p.criado_por)} em ${escapeHTML(data(p.criado_em))} · situação: ${escapeHTML(STATUS[p.status] || p.status)}</p>
            ${aviso}
            <div style="max-height:50vh;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px">${conteudoHtml(p.tipo, p.conteudo || {})}</div>
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 16px;word-break:break-all">Versão (SHA-256): <span style="font-family:var(--font-mono)">${escapeHTML(p.hash)}</span></p>
            ${decide ? `
            <form id="pd-form" data-action-submit="aprovarPedido" data-arg-event data-args='${args(p.id)}' data-prevent novalidate>
                <div class="form-group">
                    <label class="form-label" for="pd-senha">Sua senha, para registrar a decisão</label>
                    <input class="form-input" id="pd-senha" type="password" autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label class="form-label" for="pd-motivo">Motivo (só para recusar)</label>
                    <textarea class="form-input" id="pd-motivo" rows="2" maxlength="2000"></textarea>
                </div>
                <p class="login-error" id="pd-erro" role="alert" aria-live="polite"></p>
                <div style="display:flex;justify-content:flex-end;gap:8px">
                    <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button>
                    <button type="button" class="btn btn-secondary" data-action="recusarPedido" data-args='${args(p.id)}'>Recusar</button>
                    <button type="submit" class="btn btn-primary">${p.papel_exigido === 'ciente' ? 'Confirmar ciência' : 'Aprovar'}</button>
                </div>
            </form>` : `
            <p style="font-size:13px;color:var(--text)">Sua resposta: ${escapeHTML(STATUS[d.status] || d.status)}${d.decidido_em ? ' em ' + escapeHTML(data(d.decidido_em)) : ''}</p>
            <div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button></div>`}
        </div>`);
    if (decide) el('pd-senha').focus();
};

async function enviarDecisao(id, acao) {
    const senha = el('pd-senha').value;
    const erro = el('pd-erro');
    erro.textContent = '';
    if (!senha) {
        erro.textContent = 'Informe a sua senha';
        el('pd-senha').focus();
        return;
    }
    const motivo = el('pd-motivo').value.trim();
    if (acao === 'recusar' && !motivo) {
        erro.textContent = 'Informe o motivo da recusa';
        el('pd-motivo').focus();
        return;
    }
    try {
        await api('POST', `/api/v1/pedidos/${encodeURIComponent(id)}/${acao}`, acao === 'recusar' ? { senha, motivo } : { senha });
    } catch (e) {
        // 401 aqui é senha errada (api.js não desloga nesta rota); 409, pedido substituído ou já decidido.
        erro.textContent = e.message;
        if (e.status === 409) redesenha();
        return;
    }
    forceCloseModal();
    showToast(acao === 'recusar' ? 'Recusa registrada' : 'Decisão registrada');
    redesenha();
}

// Redesenha a view corrente (a lista, se é ela que está na tela).
const redesenha = () => { if (typeof window.render === 'function') window.render(); };

window.aprovarPedido = (_evento, id) => enviarDecisao(id, 'aprovar');
window.recusarPedido = (id) => enviarDecisao(id, 'recusar');

// ─── Lado de quem pede: a consultoria ou o administrador do cliente ─────────────────────────────

/** Papéis que pedem (o servidor decide de novo: `PODE_PEDIR` em routes/pedidos.ts). */
window.podePedirAprovacao = (user) => ['org_admin', 'consultor', 'consultant', 'consultoria_admin'].includes(user?.role);

window.abrirPedidoAprovacao = async function abrirPedidoAprovacao(projectId, tipo, refId) {
    let membros = [];
    try {
        membros = (await api('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/governance`)) || [];
    } catch (e) {
        showToast('Erro ao carregar a matriz de Governança: ' + e.message, 'error');
        return;
    }
    const comEmail = membros.filter((m) => m.email && m.role_category !== 'consultor');
    openModal(`
        <form id="pn-form" data-action-submit="enviarPedidoAprovacao" data-arg-event data-args='${args(projectId, tipo, refId)}' data-prevent style="padding:1.5rem 1.75rem;max-width:520px" novalidate>
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 16px">Pedir aprovação</h3>
            <div class="form-group">
                <label class="form-label" for="pn-papel">O que é pedido</label>
                <select class="form-input" id="pn-papel">
                    ${Object.entries(PAPEIS).map(([v, r]) => `<option value="${v}">${escapeHTML(r)}</option>`).join('')}
                </select>
            </div>
            <fieldset class="form-group" style="border:0;padding:0;margin:0 0 12px">
                <legend class="form-label">Destinatários (matriz de Governança)</legend>
                ${comEmail.length ? comEmail.map((m) => `
                <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:4px 0">
                    <input type="checkbox" name="pn-dest" value="${escapeHTML(m.email)}" data-nome="${escapeHTML(m.name || '')}">
                    ${escapeHTML(m.name || m.email)} <span style="color:var(--text-dim)">· ${escapeHTML(m.job_title || '')} · ${escapeHTML(m.email)}</span>
                </label>`).join('') : '<p style="font-size:13px;color:var(--text-dim)">Ninguém com e-mail na matriz de Governança deste projeto.</p>'}
            </fieldset>
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 16px">O conteúdo atual do documento é congelado no pedido. Se ele mudar, o pedido é substituído por outro com o texto novo.</p>
            <p class="login-error" id="pn-erro" role="alert" aria-live="polite"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary">Enviar pedido</button>
            </div>
        </form>`);
};

window.enviarPedidoAprovacao = async function enviarPedidoAprovacao(_evento, projectId, tipo, refId) {
    const destinatarios = [...document.querySelectorAll('input[name="pn-dest"]:checked')]
        .map((i) => ({ email: i.value, nome: i.getAttribute('data-nome') || null }));
    if (!destinatarios.length) {
        el('pn-erro').textContent = 'Escolha ao menos um destinatário';
        return;
    }
    try {
        await api('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/pedidos`, {
            tipo, ref_id: refId, papel_exigido: el('pn-papel').value, destinatarios,
        });
    } catch (e) {
        el('pn-erro').textContent = e.message;
        return;
    }
    forceCloseModal();
    showToast('Pedido enviado. Os destinatários o veem em Meus pedidos.');
};

// ─── Ciência por link com código (fatia 3): lote para quem não tem conta, e acompanhamento ───────

const SITUACAO = { ciente: 'Ciente', pendente: 'Abriu, pendente', nao_abriu: 'Não abriu', aprovado: 'Concluído', recusado: 'Recusado' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bloco da tela "Ciência de Políticas": pedidos de ciência do projeto e o botão de criar um lote. */
window.renderCienciaLink = async function renderCienciaLink(alvo, projectId) {
    if (!alvo) return;
    let pedidos = [];
    try {
        pedidos = ((await api('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/pedidos`)).pedidos || [])
            .filter((p) => p.papel_exigido === 'ciente');
    } catch (e) {
        alvo.innerHTML = `<p style="color:var(--text-dim)">Não foi possível carregar os pedidos de ciência: ${escapeHTML(e.message)}</p>`;
        return;
    }
    alvo.innerHTML = `<div class="card" style="margin-bottom:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:0.75rem">
            <div class="card-label" style="margin:0">Ciência por link (quem não tem conta)</div>
            <button type="button" class="btn btn-primary" data-action="abrirCienciaLink" data-args='${args(projectId)}'>Nova ciência por link</button>
        </div>
        ${pedidos.length ? `<table class="data-table"><thead><tr><th>Documento</th><th>Situação</th><th>Cientes</th><th>Pendentes</th><th>Não abriram</th><th></th></tr></thead><tbody>
            ${pedidos.map((p) => `<tr>
                <td>${escapeHTML(p.titulo)}<div style="font-size:11px;color:var(--text-dim)">${escapeHTML(data(p.criado_em))}</div></td>
                <td>${escapeHTML(STATUS[p.status] || p.status)}</td>
                <td>${escapeHTML(String(p.cientes ?? 0))} de ${escapeHTML(String(p.total ?? 0))}</td>
                <td>${escapeHTML(String(p.pendentes ?? 0))}</td>
                <td>${escapeHTML(String(p.nao_abriram ?? 0))}</td>
                <td style="text-align:right"><button type="button" class="btn-secondary" data-action="abrirAcompanhamento" data-args='${args(projectId, p.id)}'>Acompanhamento</button></td>
            </tr>`).join('')}
        </tbody></table>` : '<p style="font-size:13px;color:var(--text-dim)">Nenhum pedido de ciência por link neste projeto.</p>'}
    </div>`;
};

window.abrirCienciaLink = async function abrirCienciaLink(projectId) {
    let politicas = [];
    try {
        // api.js desembrulha `{ ok, controls: [...] }` e devolve a lista.
        const r = await api('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/controls`);
        politicas = (Array.isArray(r) ? r : r?.controls || []).filter((c) => c.description && String(c.description).trim());
    } catch (e) {
        showToast('Erro ao carregar as políticas: ' + e.message, 'error');
        return;
    }
    openModal(`
        <form id="cl-form" data-action-submit="enviarCienciaLink" data-arg-event data-args='${args(projectId)}' data-prevent style="padding:1.5rem 1.75rem;max-width:560px" novalidate>
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 16px">Nova ciência por link</h3>
            <div class="form-group">
                <label class="form-label" for="cl-doc">Política</label>
                <select class="form-input" id="cl-doc">
                    ${politicas.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.title || c.id)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="cl-emails">E-mails (um por linha, ou separados por vírgula; até 200)</label>
                <textarea class="form-input" id="cl-emails" rows="6"></textarea>
            </div>
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 16px">Cada pessoa recebe um link pessoal, lê o texto atual e confirma com um código enviado ao próprio e-mail. Se a política mudar, o pedido é substituído e é preciso reenviar.</p>
            <p class="login-error" id="cl-erro" role="alert" aria-live="polite"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary"${politicas.length ? '' : ' disabled'}>Enviar links</button>
            </div>
        </form>`);
};

window.enviarCienciaLink = async function enviarCienciaLink(_evento, projectId) {
    const vistos = new Set();
    const destinatarios = [];
    const invalidos = [];
    for (const bruto of el('cl-emails').value.split(/[\s,;]+/)) {
        const email = bruto.trim().toLowerCase();
        if (!email || vistos.has(email)) continue;
        vistos.add(email);
        if (EMAIL.test(email)) destinatarios.push({ email }); else invalidos.push(email);
    }
    if (!destinatarios.length) {
        el('cl-erro').textContent = 'Informe ao menos um e-mail válido';
        return;
    }
    if (destinatarios.length > 200) {
        el('cl-erro').textContent = 'No máximo 200 e-mails por envio';
        return;
    }
    let r;
    try {
        r = await api('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/pedidos/ciencia`, {
            tipo: 'politica', ref_id: el('cl-doc').value, destinatarios,
        });
    } catch (e) {
        el('cl-erro').textContent = e.message;
        return;
    }
    forceCloseModal();
    const extra = [r.falhas?.length ? `${r.falhas.length} envio(s) falharam; use Reenviar` : '', invalidos.length ? `${invalidos.length} e-mail(s) inválido(s) ignorado(s)` : '']
        .filter(Boolean).join('. ');
    showToast(`Links enviados a ${r.enviados} pessoa(s).${extra ? ' ' + extra + '.' : ''}`);
    redesenha();
};

window.abrirAcompanhamento = async function abrirAcompanhamento(projectId, id) {
    let r;
    try {
        r = await api('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/pedidos/${encodeURIComponent(id)}`);
    } catch (e) {
        showToast('Erro ao abrir o acompanhamento: ' + e.message, 'error');
        return;
    }
    const { pedido: p, destinatarios: ds } = r;
    const nota = (d) => [
        d.versao_anterior ? `ciente da versão anterior em ${data(d.versao_anterior.decidido_em)}` : '',
        d.portal_antigo ? `ciência pelo portal antigo em ${data(d.portal_antigo.acknowledged_at)} (versão não registrada)` : '',
    ].filter(Boolean).join('; ');
    const aberto = p.status === 'aberto';
    openModal(`
        <div style="padding:1.5rem 1.75rem;max-width:760px">
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 4px">${escapeHTML(p.titulo)}</h3>
            <p style="font-size:12px;color:var(--text-dim);margin:0 0 4px">Situação: ${escapeHTML(STATUS[p.status] || p.status)}</p>
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 16px;word-break:break-all">Versão (SHA-256): <span style="font-family:var(--font-mono)">${escapeHTML(p.hash)}</span></p>
            ${p.status === 'substituido' ? '<p class="login-error" role="status">O documento mudou depois deste pedido. Abra o pedido novo na lista para acompanhar e reenviar.</p>' : ''}
            <div style="max-height:50vh;overflow:auto">
                <table class="data-table"><thead><tr><th>E-mail</th><th>Situação</th><th>Quando</th><th>Observação</th></tr></thead><tbody>
                ${ds.map((d) => `<tr>
                    <td>${escapeHTML(d.email)}${d.nome ? `<div style="font-size:11px;color:var(--text-dim)">${escapeHTML(d.nome)}</div>` : ''}</td>
                    <td>${escapeHTML(SITUACAO[d.situacao] || d.situacao)}</td>
                    <td>${escapeHTML(data(d.decidido_em))}</td>
                    <td style="font-size:12px;color:var(--text-dim)">${escapeHTML(nota(d))}</td>
                </tr>`).join('')}
                </tbody></table>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button>
                ${aberto && p.papel_exigido === 'ciente' ? `<button type="button" class="btn btn-primary" data-action="reenviarCiencia" data-args='${args(projectId, p.id)}'>Reenviar aos pendentes</button>` : ''}
            </div>
        </div>`);
};

window.reenviarCiencia = async function reenviarCiencia(projectId, id) {
    try {
        const r = await api('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/pedidos/${encodeURIComponent(id)}/reenviar`);
        showToast(`Lembrete enviado a ${r.enviados} pendente(s). Os links anteriores deixaram de valer.${r.falhas?.length ? ` ${r.falhas.length} envio(s) falharam.` : ''}`);
    } catch (e) {
        showToast('Erro ao reenviar: ' + e.message, 'error');
        return;
    }
    await window.abrirAcompanhamento(projectId, id);
};
