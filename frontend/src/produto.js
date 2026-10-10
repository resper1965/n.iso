import { S } from './state.js';
import { api } from './api.js';
import { showToast, openModal, escapeHTML } from './ui.js';

// n.iso e n.privacy são PRODUTOS separados sobre o mesmo cadastro (decisão de 09/10/2026). O domínio decide qual casca aparece:
// nprivacy.ness.com.br → n.privacy; o resto → n.iso. A trava de verdade é do servidor (403 sem o módulo do projeto); aqui só se
// mostra o produto certo, lista os projetos que têm esse produto e leva ao outro quando o projeto tem os dois.

export const PRODUTOS = {
    iso: { nome: 'iso', host: 'niso.ness.com.br', titulo: 'n.iso | ness. Agentic GRC', inicio: 'dashboard' },
    privacy: { nome: 'privacy', host: 'nprivacy.ness.com.br', titulo: 'n.privacy | ness. Privacidade', inicio: 'encarregado' },
};

/** Telas que só existem no n.iso e só no n.privacy. O resto (cadastro, sistema) aparece nos dois. */
export const SO_ISO = ['nav-dashboard', 'nav-leads', 'nav-assessments', 'nav-proposals', 'nav-catalogo', 'nav-config', 'nav-project', 'nav-monitor',
    'nav-soa', 'nav-context', 'nav-risks', 'nav-vendors', 'nav-acknowledgments', 'nav-policies', 'nav-audits', 'nav-capa', 'nav-mgmt'];
export const SO_PRIVACY = ['nav-encarregado', 'nav-requisitos', 'nav-terceiros', 'nav-titular'];

const ehLocal = (h) => h === 'localhost' || h === '127.0.0.1';

/** O produto do domínio. Em localhost, `?produto=privacy` escolhe (e fica guardado na aba) para dá para testar sem DNS. */
export function produtoAtual(loc = window.location) {
    if (/^nprivacy\./i.test(loc.hostname)) return 'privacy';
    if (ehLocal(loc.hostname)) {
        const q = new URLSearchParams(loc.search).get('produto');
        try {
            if (q === 'iso' || q === 'privacy') sessionStorage.setItem('niso_produto', q);
            const guardado = sessionStorage.getItem('niso_produto');
            if (guardado === 'iso' || guardado === 'privacy') return guardado;
        } catch (e) { /* sem sessionStorage: n.iso */ }
    }
    return 'iso';
}

/** Os módulos de um projeto. Projeto sem a lista (resposta antiga) conta como só n.iso, o comportamento anterior. */
export const modulosDe = (p) => (Array.isArray(p && p.modulos) && p.modulos.length ? p.modulos : ['iso']);
export const temProduto = (p, produto = produtoAtual()) => modulosDe(p).includes(produto);

/** Endereço do mesmo app no outro produto (em localhost, a mesma origem com `?produto=`). */
export function enderecoDoProduto(produto, loc = window.location) {
    if (ehLocal(loc.hostname)) return `${loc.origin}/login?produto=${produto}`;
    return `https://${PRODUTOS[produto].host}/`;
}

const marca = (produto) => `n<span style="color:var(--accent)">.</span><span class="brand-tail">${produto}</span>`;

/** Aplica a casca do produto ao documento: título, marcas, menu. Idempotente. */
export function aplicarCasca(produto = produtoAtual(), doc = document) {
    doc.documentElement.dataset.produto = produto;
    doc.title = PRODUTOS[produto].titulo;
    const logo = doc.getElementById('sidebar-logo-mark');
    if (logo) logo.innerHTML = marca(produto);
    doc.querySelectorAll('.entry-mark, .login-brand-logo').forEach((el) => { el.innerHTML = `n<span>.</span>${produto}`; });
    if (produto === 'privacy') {
        const t = doc.querySelector('.entry-title');
        if (t) t.textContent = 'Privacidade e LGPD conduzidas, do inventário à resposta ao titular.';
        const l = doc.querySelector('.entry-lede');
        if (l) l.innerHTML = 'O ambiente onde sua organização e a ness<span class="entry-dot">.</span> trabalham juntas: tratamentos, terceiros, pedidos do titular e incidentes em um só lugar.';
        doc.querySelectorAll('.entry-section').forEach((s) => { s.hidden = true; });
    }
    const esconder = new Set(produto === 'privacy' ? SO_ISO : SO_PRIVACY);
    doc.querySelectorAll('.sidebar-nav[id^="nav-"]').forEach((n) => { if (esconder.has(n.id)) n.dataset.foraDoProduto = '1'; else delete n.dataset.foraDoProduto; });
    // Grupo sem nenhum item do produto some inteiro (rótulo e grupo).
    doc.querySelectorAll('.sidebar-group').forEach((g) => {
        const vazio = [...g.querySelectorAll('.sidebar-nav[id^="nav-"]')].every((n) => n.dataset.foraDoProduto === '1');
        const rotulo = g.previousElementSibling && g.previousElementSibling.classList.contains('sidebar-label') ? g.previousElementSibling : null;
        g.dataset.foraDoProduto = vazio ? '1' : '';
        if (rotulo) rotulo.dataset.foraDoProduto = vazio ? '1' : '';
    });
    const rotuloPriv = doc.querySelector('[data-args=\'["group-privacy"]\']');
    if (rotuloPriv) { rotuloPriv.textContent = 'Privacidade'; rotuloPriv.removeAttribute('aria-label'); }
    const rotuloOps = doc.querySelector('[data-args=\'["group-ops"]\']');
    if (rotuloOps) rotuloOps.textContent = produto === 'privacy' ? 'Cadastro' : 'Operacional';
    const rotuloImpl = doc.querySelector('[data-args=\'["group-impl"]\']');
    if (rotuloImpl) rotuloImpl.textContent = produto === 'privacy' ? 'Governança' : 'Implementação';
}

/** Só os projetos que têm o produto deste domínio. */
export const projetosDoProduto = (lista, produto = produtoAtual()) => (Array.isArray(lista) ? lista.filter((p) => temProduto(p, produto)) : []);

/** Tela de quem entrou num produto que nenhum projeto seu tem. */
export function semAcesso(c, produto = produtoAtual()) {
    const h = document.getElementById('header-title');
    if (h) h.textContent = `n.${produto}`;
    const outro = produto === 'privacy' ? 'iso' : 'privacy';
    c.innerHTML = `<div class="empty-state fade-in" id="sem-acesso-produto"><h3>Você não tem acesso ao n.${escapeHTML(produto)}</h3>
        <p>Nenhum projeto seu tem este produto habilitado. Fale com a ness. para contratar, ou volte ao n.${escapeHTML(outro)}.</p>
        <a class="btn btn-primary" style="margin-top:1rem" href="${escapeHTML(enderecoDoProduto(outro))}">Abrir o n.${escapeHTML(outro)}</a></div>`;
}

/** Link no rodapé da barra para o outro produto, quando o projeto ativo tem os dois. */
export function atualizarLinkCruzado(doc = document) {
    const produto = produtoAtual();
    const outro = produto === 'privacy' ? 'iso' : 'privacy';
    let el = doc.getElementById('link-outro-produto');
    const mostrar = S.activeProject && temProduto(S.activeProject, outro) && temProduto(S.activeProject, produto);
    if (!mostrar) { if (el) el.remove(); return; }
    if (!el) {
        el = doc.createElement('a');
        el.id = 'link-outro-produto';
        el.className = 'sidebar-nav';
        el.style.cssText = 'display:block;margin:0.5rem 1rem;font-size:0.8rem';
        const sidebar = doc.getElementById('sidebar');
        if (!sidebar) return;
        sidebar.appendChild(el);
    }
    el.href = enderecoDoProduto(outro);
    el.textContent = `Abrir este projeto no n.${outro}`;
}

// ─── Produtos do projeto (habilitar e desligar) ─────────────────────────────────────────────────────────

const podeGerir = () => !!S.user && ['platform_admin', 'consultoria_admin'].includes(S.user.role);

window.abrirProdutosDoProjeto = async function (projectId) {
    let estado;
    try { estado = await api('GET', `/api/v1/projects/${projectId}/modulos`); } catch (e) { showToast((e && e.message) || 'Não foi possível ler os produtos', 'error'); return; }
    const hab = Array.isArray(estado.habilitados) ? estado.habilitados : [];
    const contr = Array.isArray(estado.contratados) ? estado.contratados : [];
    const linha = (m) => {
        const ligado = hab.includes(m);
        const pode = podeGerir() && (ligado || contr.includes(m));
        return `<tr><td><strong>n.${m}</strong></td><td>${ligado ? 'Habilitado' : 'Desligado'}${contr.includes(m) ? '' : ' · não contratado pela organização'}</td>
            <td style="text-align:right">${pode ? `<button class="btn btn-sm ${ligado ? 'btn-ghost' : 'btn-primary'}" data-action="alternarProdutoDoProjeto" data-args='${escapeHTML(JSON.stringify([projectId, m, !ligado]))}'>${ligado ? 'Desligar' : 'Habilitar'}</button>` : ''}</td></tr>`;
    };
    openModal(`<h3>Produtos do projeto</h3>
        <p style="color:var(--text-dim)">Os dois produtos usam o mesmo cadastro (partes, itens, documentos, RoPA, DPIA, evidências). Desligar um produto não apaga dado: ele volta ao religar.</p>
        <table class="data-table" id="produtos-do-projeto"><tbody>${linha('iso')}${linha('privacy')}</tbody></table>`);
};

window.alternarProdutoDoProjeto = async function (projectId, modulo, habilitar) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/modulos/${modulo}`, { habilitado: habilitar });
        showToast(`n.${modulo} ${habilitar ? 'habilitado' : 'desligado'} neste projeto.`, 'success');
        if (typeof window.loadProjects === 'function') await window.loadProjects();
        await window.abrirProdutosDoProjeto(projectId);
    } catch (e) { showToast((e && e.message) || 'Não foi possível alterar o produto', 'error'); }
};

window.produtoAtual = produtoAtual;
window.projetosDoProduto = projetosDoProduto;
