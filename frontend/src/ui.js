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



window.escapeHTML = escapeHTML;

window.openModal = openModal;

window.closeModal = closeModal;

window.forceCloseModal = forceCloseModal;

window.showToast = showToast;