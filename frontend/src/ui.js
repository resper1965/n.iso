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
        document.getElementById('modal-overlay').classList.remove('open');
        document.getElementById('modal').classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

export     function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--surface);
            border-left: 4px solid var(--accent);
            padding: 1rem 2rem;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            z-index: 10000;
            backdrop-filter: blur(10px);
            animation: fadeIn 0.3s ease-out;
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }



export function renderPageHeader(title, subtitle = '', actionsHtml = '') {
    return `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; gap:1rem; flex-wrap:wrap;">
            <div>
                <h1 style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.5rem; color:var(--text); margin:0 0 0.3rem 0; letter-spacing:-0.5px;">${escapeHTML(title)}</h1>
                ${subtitle ? `<p style="color:var(--text-dim); font-size:0.85rem; margin:0; line-height:1.4;">${escapeHTML(subtitle)}</p>` : ''}
            </div>
            ${actionsHtml ? `<div class="header-actions-group" style="display:flex; gap:0.75rem; align-items:center;">${actionsHtml}</div>` : ''}
        </div>
    `;
}

export function renderStatCards(statsArray) {
    if (!statsArray || !statsArray.length) return '';
    const cardsHtml = statsArray.map(s => {
        const color = s.color || 'var(--accent)';
        return `
            <div class="stat-card" style="background:rgba(15,23,42,0.65); border:1px solid rgba(229,235,255,0.08); border-radius:12px; padding:1.25rem; backdrop-filter:blur(24px); flex:1; min-width:200px;">
                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); margin-bottom:0.5rem; font-weight:500;">${escapeHTML(s.label)}</div>
                <div style="font-size:1.75rem; font-weight:700; color:${color}; font-family:'Inter',sans-serif; line-height:1.2;">${escapeHTML(String(s.value))}</div>
                ${s.subtext ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.4rem;">${escapeHTML(s.subtext)}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="stat-strip" style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">${cardsHtml}</div>`;
}

export function renderStatusBadge(type, text) {
    const styles = {
        success: 'background:rgba(52,199,89,0.12); color:#34c759; border:1px solid rgba(52,199,89,0.3);',
        warning: 'background:rgba(255,204,0,0.12); color:#ffcc00; border:1px solid rgba(255,204,0,0.3);',
        danger: 'background:rgba(255,59,48,0.12); color:#ff3b30; border:1px solid rgba(255,59,48,0.3);',
        info: 'background:rgba(0,173,232,0.12); color:#00ade8; border:1px solid rgba(0,173,232,0.3);',
        neutral: 'background:rgba(255,255,255,0.08); color:var(--text-dim); border:1px solid rgba(255,255,255,0.12);'
    };
    const bStyle = styles[type] || styles.neutral;
    return `<span class="badge" style="${bStyle} padding:0.25rem 0.6rem; border-radius:6px; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; display:inline-block;">${escapeHTML(text)}</span>`;
}

export function renderDataTable(columns, rows, options = {}) {
    const emptyMessage = options.emptyMessage || 'Nenhum registro encontrado.';
    if (!rows || rows.length === 0) {
        return `
            <div class="empty-state" style="background:rgba(15,23,42,0.5); border:1px dashed rgba(229,235,255,0.15); border-radius:12px; padding:3rem 1.5rem; text-align:center; color:var(--text-dim);">
                <p style="margin:0; font-size:0.9rem;">${escapeHTML(emptyMessage)}</p>
            </div>
        `;
    }

    const ths = columns.map(c => `<th style="text-align:${c.align || 'left'}; padding:0.85rem 1rem; color:var(--text-dim); font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid rgba(229,235,255,0.08);">${escapeHTML(c.label)}</th>`).join('');

    const trs = rows.map(r => {
        const tds = columns.map(c => {
            const val = c.render ? c.render(r) : escapeHTML(String(r[c.key] ?? ''));
            return `<td style="text-align:${c.align || 'left'}; padding:0.9rem 1rem; border-bottom:1px solid rgba(229,235,255,0.05); font-size:0.85rem; color:var(--text);">${val}</td>`;
        }).join('');
        return `<tr style="transition:background 0.15s ease;" onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background='transparent'">${tds}</tr>`;
    }).join('');

    return `
        <div class="table-container" style="background:rgba(15,23,42,0.65); border:1px solid rgba(229,235,255,0.08); border-radius:12px; overflow:hidden; backdrop-filter:blur(24px);">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead><tr style="background:rgba(7,11,20,0.5);">${ths}</tr></thead>
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
window.renderDataTable = renderDataTable;