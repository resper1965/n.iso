export     function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            switch (m) { case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#39;'; }
        });
    }

export     function openModal(html, extraClass) {
        const modal = document.getElementById('modal');
        const modalContent = document.getElementById('modal-content');
        modal.classList.remove('modal-large'); // reset
        if (extraClass) modal.classList.add(extraClass);
        modalContent.innerHTML = html;
        document.getElementById('modal-overlay').classList.add('open');
    }

    export function closeModal(e) {
        if (e && e.target !== document.getElementById('modal-overlay')) return;
        document.getElementById('modal-overlay').classList.remove('open');
        document.getElementById('modal').classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

    export function forceCloseModal() {
        // Optional chaining porque o handler global de Esc chama isto em toda
        // tecla: fora do shell (ou num teste) os elementos podem não existir e a
        // exceção matava o resto da cascata de Esc.
        document.getElementById('modal-overlay')?.classList.remove('open');
        document.getElementById('modal')?.classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

export const TOAST_MS = 4200;

// A região de anúncio é PERMANENTE e vazia: leitor de tela só anuncia mudança
// de conteúdo numa região que já estava montada. Criar a região junto da
// mensagem (como antes) não anuncia nada. O shell traz `#live-region` no HTML;
// aqui só há o resgate para páginas que não a tenham.
function liveRegion() {
        let el = document.getElementById('live-region');
        if (!el) {
            el = document.createElement('div');
            el.id = 'live-region';
            el.className = 'sr-only';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        return el;
    }

export     function showToast(message, type = 'info', onUndo) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        // textContent, nao innerHTML: dos 116 pontos que chamam showToast nenhum
        // passa HTML, e varios interpolam `${e.message}` — texto que vem do
        // servidor e pode ecoar entrada do usuario. Corrigir aqui vale por todos.
        const label = document.createElement('span');
        label.className = 'toast-text';
        label.textContent = message;
        toast.appendChild(label);

        let timer;
        const dismiss = () => { clearTimeout(timer); toast.remove(); };

        // Toda ação em lote e toda edição imediata passa por aqui: o desfazer é
        // a janela pré-commit, não um delete na trilha.
        if (typeof onUndo === 'function') {
            const undo = document.createElement('button');
            undo.type = 'button';
            undo.className = 'toast-undo';
            undo.textContent = 'Desfazer';
            undo.addEventListener('click', () => { dismiss(); onUndo(); });
            toast.appendChild(undo);
        }

        document.body.appendChild(toast);
        liveRegion().textContent = message;
        timer = setTimeout(dismiss, TOAST_MS);
        return toast;
    }



// O título nomeia A TELA (SoA, Riscos, Dashboard), nunca o cliente, e a banda
// não carrega subtítulo: contexto de tenant vive no seletor da sidebar e
// contexto de registro é a primeira linha DO CONTEÚDO. A assinatura fica como
// estava por compatibilidade; o `subtitle` sai da banda e desce para o kicker.
export function renderPageHeader(title, subtitle = '', actionsHtml = '') {
    return `
        <div class="page-header">
            <div class="page-header-band">
                <h1 class="page-title">${escapeHTML(title)}</h1>
                ${actionsHtml ? `<div class="header-actions-group">${actionsHtml}</div>` : ''}
            </div>
            ${subtitle ? `<p class="page-kicker">${escapeHTML(subtitle)}</p>` : ''}
        </div>
    `;
}

export function renderStatCards(statsArray) {
    if (!statsArray || !statsArray.length) return '';
    const cardsHtml = statsArray.map(s => {
        const color = s.color || 'var(--accent)';
        return `
            <div class="stat-card" style="background:var(--surface); border:1px solid var(--border); padding:1.25rem; flex:1; min-width:200px;">
                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); margin-bottom:0.5rem; font-weight:500;">${escapeHTML(s.label)}</div>
                <div style="font-size:1.75rem; font-weight:700; color:${color}; font-family:'Inter',sans-serif; line-height:1.2;">${escapeHTML(String(s.value))}</div>
                ${s.subtext ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.4rem;">${escapeHTML(s.subtext)}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="stat-strip" style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">${cardsHtml}</div>`;
}

/**
 * Vocabulário de status/severidade: o banco guarda em inglês, a interface é
 * PT-BR (decisão registrada no AGENTS.md).
 *
 * Vive fora do `renderStatusBadge` porque nem toda tela usa badge — a lista de
 * riscos e a de controles pintam o valor com estilo próprio e, por não passarem
 * por aqui, mostravam "High", "Medium", "Completed" e "In Progress" crus ao
 * usuário. Uma tabela só, para as duas formas de exibir não divergirem.
 */
const STATUS_DICT = {
    'implemented': 'Implementado',
    'not applicable': 'Não Aplicável',
    'approved': 'Aprovado',
    'compliant': 'Conforme',
    'missing': 'Pendente',
    'partial': 'Parcial',
    'draft': 'Rascunho',
    'under review': 'Em Revisão',
    'active': 'Ativo',
    'pending': 'Pendente',
    'open': 'Aberto',
    'closed': 'Fechado',
    'low': 'Baixo',
    'medium': 'Médio',
    'high': 'Alto',
    'critical': 'Crítico',
    'planned': 'Planejado',
    'completed': 'Concluído',
    'in_progress': 'Em Andamento',
    'in progress': 'Em Andamento',
    'na': 'N/A',
    'gap': 'Gap',
    // Faltavam: são valores que o backend grava e que apareciam em inglês.
    'treated': 'Tratado',
    'mitigate': 'Mitigar',
    'accept': 'Aceitar',
    'transfer': 'Transferir',
    'avoid': 'Evitar',
    'scheduled': 'Agendado',
    'very low': 'Muito Baixo',
    'rejected': 'Rejeitado',
    'revoked': 'Revogado'
};

/**
 * Traduz um valor de status/severidade para PT-BR. Valor desconhecido volta
 * COMO VEIO — melhor mostrar o termo cru do banco do que apagar a informação.
 */
export function traduzStatus(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const chave = valor.toString().toLowerCase().trim();
    return STATUS_DICT[chave] || valor;
}

export function renderStatusBadge(arg1, arg2) {
    const knownTypes = ['success', 'warning', 'danger', 'info', 'neutral'];
    let type = 'neutral';
    let text = '';

    if (knownTypes.includes(arg1)) {
        type = arg1;
        text = arg2 || '';
    } else if (knownTypes.includes(arg2)) {
        type = arg2;
        text = arg1 || '';
    } else {
        type = 'neutral';
        text = arg1 || arg2 || '';
    }


    text = traduzStatus(text);

    // Sem borda: o preenchimento por color-mix já separa a badge do fundo, e a
    // borda somava um terceiro tom de cinza em cada célula da tabela.
    const COLORS = {
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#00ade8',
        neutral: '#94a3b8'
    };
    const color = COLORS[type] || COLORS.neutral;
    const bStyle = `background:color-mix(in oklab, ${color} 16%, transparent); color:${color}; border:0; border-radius:0;`;
    return `<span class="badge" style="${bStyle} padding:1px 8px; font:500 10px/1.7 var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; display:inline-block;">${escapeHTML(text)}</span>`;
}

export function renderDataTable(columns, rows, options = {}) {
    const emptyMessage = options.emptyState || options.emptyMessage || 'Nenhum registro encontrado.';
    if (!rows || rows.length === 0) {
        return `
            <div class="empty-state" style="border:1px dashed var(--border); padding:3rem 1.5rem; text-align:center; color:var(--text-dim);">
                <p style="margin:0; font-size:0.9rem;">${escapeHTML(emptyMessage)}</p>
            </div>
        `;
    }

    // Normalize column headers. `numeric` liga tabular-nums; alinhar à direita
    // já é sinal suficiente de coluna numérica nas 19 chamadas existentes, então
    // vale por padrão — assim CMMI, Aplic. e contagens alinham sem tocar as views.
    const cols = columns.map(c => {
        if (typeof c === 'string') return { label: c, align: 'left', numeric: false };
        return {
            label: c.label || '',
            align: c.align || 'left',
            key: c.key,
            render: c.render,
            sort: c.sort,
            numeric: c.numeric !== undefined ? c.numeric : c.align === 'right'
        };
    });

    const numCell = c => (c.numeric ? ' font-variant-numeric:tabular-nums;' : '');

    // Cabeçalho sticky. `top:0` e não `var(--hdr-h)`: aqui quem rola é
    // `.content`, que já começa ABAIXO da banda de título — descontar 64px de
    // novo abriria uma faixa por onde as linhas passariam. O fundo opaco e o
    // z-index valem para TODA th, inclusive a de seleção: uma th sem essa base
    // vira buraco transparente no cabeçalho fixo.
    const ths = cols.map(c => {
        const sorted = c.sort ? ` aria-sort="${escapeHTML(c.sort)}"` : '';
        return `<th scope="col"${sorted} style="text-align:${c.align}; position:sticky; top:0; z-index:3; background:var(--bg); padding:14px 10px 10px; color:var(--text-faint); font:500 9px/1 var(--font-mono); text-transform:uppercase; letter-spacing:0.16em; border-bottom:1px solid var(--border);${numCell(c)}">${escapeHTML(c.label)}</th>`;
    }).join('');

    const pad = options.dense ? '7px 10px' : '12px 10px';
    const td = (align, extra) => `text-align:${align}; padding:${pad}; border-bottom:1px solid var(--border); font-size:13px; color:var(--text-2);${extra}`;

    // O hover saiu do onmouseenter/onmouseleave inline e virou CSS
    // (.table-container tbody tr:hover): 19 tabelas deixam de carregar dois
    // handlers por linha.
    const trs = rows.map(r => {
        let tds = '';
        if (Array.isArray(r)) {
            // Row is an array of cell HTML strings
            tds = r.map((cellVal, idx) => {
                const c = cols[idx] || { align: 'left', numeric: false };
                return `<td style="${td(c.align, numCell(c))}">${cellVal ?? ''}</td>`;
            }).join('');
        } else {
            // Row is an object
            tds = cols.map(c => {
                const val = c.render ? c.render(r) : escapeHTML(String(r[c.key] ?? ''));
                return `<td style="${td(c.align, numCell(c))}">${val}</td>`;
            }).join('');
        }
        return `<tr>${tds}</tr>`;
    }).join('');

    return `
        <div class="table-container" style="border:1px solid var(--border);">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead><tr>${ths}</tr></thead>
                <tbody>${trs}</tbody>
            </table>
        </div>
    `;
}

window.escapeHTML = escapeHTML;
window.openModal = openModal;
window.closeModal = closeModal;
window.forceCloseModal = forceCloseModal;
window.showToast = showToast;
window.renderPageHeader = renderPageHeader;
window.renderStatCards = renderStatCards;
window.renderStatusBadge = renderStatusBadge;
window.traduzStatus = traduzStatus;
window.renderDataTable = renderDataTable;
