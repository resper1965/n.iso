import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML } from '../ui.js';
import { navigate, render } from '../router.js';

    async function renderKnowledge(c, h, a) {
        h.textContent = 'Cérebro do Projeto — Gestão de Conhecimento';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        a.innerHTML = `<button class="btn btn-primary" onclick="openIngestModal('${proj.id}')">+ Ingerir Conhecimento</button>`;
        
        let query = S.knowledgeQuery || '';
        let items = [];
        try {
            const url = query ? `/api/v1/projects/${proj.id}/knowledge/search?q=${encodeURIComponent(query)}` : `/api/v1/projects/${proj.id}/knowledge/search?q=*`;
            items = await api('GET', url);
        } catch(e) {}

        c.innerHTML = `
            <div class="fade-in">
                <div class="card" style="padding:1.5rem;margin-bottom:1.5rem">
                    <div class="form-group" style="margin-bottom:0">
                        <input class="form-input" id="k-search" placeholder="Buscar no conhecimento do projeto..." value="${query}" onkeydown="if(event.key==='Enter')searchKnowledge()">
                    </div>
                </div>
                <div id="k-results">
                    ${items.length ? items.map(item => {
                        const m = item.metadata || {};
                        return `
                        <div class="list-item">
                            <div style="flex:1">
                                <div class="item-name">${escapeHTML(m.title || item.id)}</div>
                                <div class="item-meta">${escapeHTML(m.type || 'Documento')} | ${escapeHTML(m.summary || 'Sem resumo disponível')}</div>
                                <div style="margin-top:0.5rem;display:flex;gap:0.35rem">
                                    ${(m.controls || []).map(ctrl => `<span class="ctx-tag">${ctrl}</span>`).join('')}
                                </div>
                            </div>
                            <button class="btn btn-ghost" onclick="viewKnowledge('${item.id}', '${proj.id}')">Ver</button>
                        </div>`;
                    }).join('') : '<div class="empty-state"><h3>Nenhum conhecimento mapeado</h3><p>Ingira atas de reuniões, entrevistas ou procedimentos para começar.</p></div>'}
                </div>
            </div>
        `;
    }

    function searchKnowledge() {
        const q = document.getElementById('k-search').value;
        S.knowledgeQuery = q;
        render();
    }

    function openIngestModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Ingerir Novo Conhecimento</span><button class="btn-ghost" onclick="closeModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Título do Documento / Nome da Entrevista</label>
                <input class="form-input" id="ingest-title" placeholder="Ex: Entrevista CTO - 05/07/24">
            </div>
            <div class="form-group">
                <label class="form-label">Conteúdo (Texto, Transcrição ou Notas)</label>
                <textarea class="form-input" id="ingest-content" rows="10" placeholder="Cole aqui o conteúdo do documento ou notas da reunião..."></textarea>
            </div>
            <div id="ingest-loading" style="display:none;margin-bottom:1rem;color:var(--accent);font-size:0.7rem">IA processando documento e mapeando controles...</div>
            <button class="btn btn-primary" style="width:100%" id="ingest-btn" onclick="doIngest('${projectId}')">Processar e Ingerir</button>
        `);
    }

    async function doIngest(projectId) {
        const title = document.getElementById('ingest-title').value;
        const content = document.getElementById('ingest-content').value;
        if (!title || !content) return;

        const btn = document.getElementById('ingest-btn');
        const loader = document.getElementById('ingest-loading');
        btn.disabled = true;
        loader.style.display = 'block';

        try {
            await api('POST', `/api/v1/projects/${projectId}/knowledge/ingest`, { title, content });
            showToast('Conhecimento ingerido e processado pela IA');
            closeModal();
            render();
        } catch(e) {
            showToast('Erro ao processar conhecimento', 'error');
            btn.disabled = false;
            loader.style.display = 'none';
        }
    }

    async function renderAIChat(c, h, a) {
        h.textContent = 'AI Compliance Assistant';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        a.innerHTML = `<button class="btn" onclick="clearChatHistory('${proj.id}')">Limpar Historico</button>`;
        let history = [];
        try { history = await api('GET', `/api/v1/projects/${proj.id}/chat/history`); } catch(e) {}
        if (!Array.isArray(history)) history = [];
        c.innerHTML = `<div class="fade-in" style="display:flex;flex-direction:column;height:calc(100vh - 180px)">
            <div id="chat-messages" style="flex:1;overflow-y:auto;padding:1rem 0;display:flex;flex-direction:column;gap:0.75rem">
                ${history.length ? history.map(m => `
                    <div style="align-self:${m.role==='user'?'flex-end':'flex-start'};max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:${m.role==='user'?'var(--accent-dim)':'var(--surface)'};border:1px solid ${m.role==='user'?'var(--accent)':'var(--border)'};color:var(--text);font-size:0.8rem;line-height:1.6;white-space:pre-wrap">${escapeHTML(m.content)}</div>
                `).join('') : '<div style="text-align:center;color:var(--muted);padding:3rem 0;font-size:0.8rem">Faca uma pergunta sobre ISO 27001, controles, audit preparation ou compliance.</div>'}
            </div>
            <div style="display:flex;gap:0.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08)">
                <input class="form-input" id="chat-input" placeholder="Pergunte sobre compliance, controles ISO, audit..." style="flex:1" onkeydown="if(event.key==='Enter')sendChatMessage('${proj.id}')">
                <button class="btn btn-primary" onclick="sendChatMessage('${proj.id}')">Enviar</button>
            </div>
        </div>`;
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendChatMessage(projectId) {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;
        input.value = '';
        // Add user message to UI immediately
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML += `<div style="align-self:flex-end;max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:rgba(0,173,232,0.15);border:1px solid rgba(0,173,232,0.2);font-size:0.8rem;line-height:1.6">${escapeHTML(message)}</div>`;
        msgs.innerHTML += `<div id="chat-loading" style="align-self:flex-start;max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:0.8rem;color:var(--muted)">Pensando...</div>`;
        msgs.scrollTop = msgs.scrollHeight;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/chat`, { message });
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.id = ''; loading.style.color = 'var(--text)'; loading.textContent = res.reply || 'Sem resposta.'; }
            msgs.scrollTop = msgs.scrollHeight;
        } catch(e) {
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.textContent = 'Erro: ' + e.message; loading.style.color = 'var(--danger)'; }
        }
    }

    async function clearChatHistory(projectId) {
        if (!confirm('Limpar todo o historico de chat?')) return;
        await api('DELETE', `/api/v1/projects/${projectId}/chat/history`);
        render();
    }

export { renderKnowledge, renderAIChat };
window.renderKnowledge = renderKnowledge;
window.renderAIChat = renderAIChat;
window.searchKnowledge = searchKnowledge;
window.openIngestModal = openIngestModal;
window.doIngest = doIngest;
window.sendChatMessage = sendChatMessage;
window.clearChatHistory = clearChatHistory;
