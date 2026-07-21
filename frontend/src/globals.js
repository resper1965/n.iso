import { S } from './state.js';
import { api, API_BASE } from './api.js';
import { render, navigate } from './router.js';
import { showToast, openModal, closeModal, escapeHTML } from './ui.js';

window.toggleTheme = function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateThemeIcon(next);
    }

window.updateThemeIcon = function updateThemeIcon(theme) {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        const svg = btn.querySelector('svg');
        if (theme === 'light') {
            svg.innerHTML = '<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
        } else {
            svg.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z"/>';
        }
    }

window.viewEvidence = async function viewEvidence(id) {
        try {
            openModal(`
                <div style="padding: 2rem; text-align: center;">
                    <h3>Carregando Evidência...</h3>
                    <p style="color: var(--muted); font-size: 0.85rem;">Buscando arquivo e preparando pré-visualização...</p>
                </div>
            `);
            const ev = await api('GET', `/api/v1/evidence/${id}/detail`);
            const projectId = S.activeProject?.id || S.currentProject?.id;
            const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/evidence/${id}/download`, {
                headers: { 'Authorization': 'Bearer ' + S.token }
            });
            if (!res.ok) throw new Error('Erro ao baixar arquivo');
            const blob = await res.blob();
            
            if (window.activePreviewUrl) {
                window.URL.revokeObjectURL(window.activePreviewUrl);
            }
            const objectUrl = window.URL.createObjectURL(blob);
            window.activePreviewUrl = objectUrl;
            
            const fileType = ev.file_type || blob.type || '';
            const fileName = ev.file_name || '';
            const ext = fileName.split('.').pop().toLowerCase();
            
            let previewHtml = '';
            let isLarge = false;
            
            if (fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                previewHtml = `<div style="text-align: center; margin-top: 1rem;"><img src="${objectUrl}" style="max-width: 100%; max-height: 450px; border-radius: 8px; border: 1px solid var(--border);" /></div>`;
            } else if (fileType === 'application/pdf' || ext === 'pdf') {
                isLarge = true;
                previewHtml = `<iframe src="${objectUrl}" style="width: 100%; height: 550px; border: none; border-radius: 8px; margin-top: 1rem;"></iframe>`;
            } else if (ext === 'md') {
                isLarge = true;
                const text = await blob.text();
                const rendered = window.marked ? window.marked.parse(text) : escapeHTML(text);
                previewHtml = `<div style="max-height: 450px; overflow: auto; background: rgba(255,255,255,0.03); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border); font-family: 'Inter', sans-serif; font-size: 0.8rem; line-height: 1.6; color: var(--text); text-align: left; margin-top: 1rem;" class="markdown-body">${rendered}</div>`;
            } else if (fileType.startsWith('text/') || ['txt', 'csv', 'json', 'xml', 'log'].includes(ext)) {
                const text = await blob.text();
                previewHtml = `<pre style="max-height: 400px; overflow: auto; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); font-family: monospace; font-size: 0.75rem; margin-top: 1rem; white-space: pre-wrap; word-break: break-all; color: var(--text); text-align: left;">${escapeHTML(text)}</pre>`;
            } else {
                previewHtml = `<div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed var(--border); margin-top: 1rem; color: var(--text-dim); font-size: 0.8rem;">Visualização direta não suportada para o formato (.${ext}). Use o botão abaixo para baixar.</div>`;
            }
            
            let sealHtml = '';
            if (ev.ciso_approved_by || ev.ceo_approved_by) {
                const cisoText = ev.ciso_approved_by ? `Assinado por ${escapeHTML(ev.ciso_approved_by)} em ${new Date(ev.ciso_approved_at).toLocaleString()} ${ev.ciso_approved_ip ? `(IP: ${escapeHTML(ev.ciso_approved_ip)})` : ''}` : 'Pendente';
                const ceoText = ev.ceo_approved_by ? `Assinado por ${escapeHTML(ev.ceo_approved_by)} em ${new Date(ev.ceo_approved_at).toLocaleString()} ${ev.ceo_approved_ip ? `(IP: ${escapeHTML(ev.ceo_approved_ip)})` : ''}` : 'Pendente';
                
                sealHtml = `
                    <div style="background: rgba(0, 173, 232, 0.02); border: 1px solid rgba(0, 173, 232, 0.15); border-radius: 10px; padding: 1rem; margin-top: 1rem;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem; margin-bottom: 0.5rem;">
                            <div style="width: 6px; height: 6px; border-radius: 50%; background: #00ade8;"></div>
                            <span style="font-family: 'Montserrat', sans-serif; font-size: 0.65rem; font-weight: 700; color: #f5f5f7; text-transform: uppercase; letter-spacing: 0.05em;">Selo de Assinatura da Evidência</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-dim); display: flex; flex-direction: column; gap: 4px;">
                            <div><strong>DPO:</strong> <span style="color: ${ev.ciso_approved_by ? '#10b981' : 'var(--text-dim)'}">${cisoText}</span></div>
                            <div><strong>CEO:</strong> <span style="color: ${ev.ceo_approved_by ? '#10b981' : 'var(--text-dim)'}">${ceoText}</span></div>
                        </div>
                    </div>
                `;
            }

            const html = `
                <div style="padding: 1.5rem">
                    <h2 style="font-family:'Montserrat',sans-serif; font-weight:700; color:var(--accent); font-size:1.2rem; margin-bottom:0.5rem">Detalhes da Evidência</h2>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Arquivo:</strong> ${escapeHTML(fileName)}</p>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Hash SHA-256:</strong> <code style="word-break: break-all">${escapeHTML(ev.file_hash || ev.sha256_hash || '')}</code></p>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Data de Envio:</strong> ${new Date(ev.created_at).toLocaleString()}</p>
                    
                    ${previewHtml}
                    ${sealHtml}
                    
                    <div style="margin-top: 1.5rem; display:flex; gap:0.5rem; justify-content: flex-end;">
                        <button class="btn" onclick="forceCloseModal()">Fechar</button>
                        <button class="btn btn-primary" onclick="downloadEvidenceFile('${id}')">Baixar Arquivo</button>
                    </div>
                </div>
            `;
            openModal(html, isLarge ? 'modal-large' : '');
        } catch (e) { 
            showToast('Erro ao carregar detalhe da evidência: ' + e.message, 'error'); 
        }
    }

window.setLang = function setLang(lang) {
        S.lang = 'pt';
        localStorage.setItem('niso_lang', 'pt');
        console.log('Language set to: pt');
    }

window.toggleGroup = function toggleGroup(groupId) {
        const groups = document.querySelectorAll('.sidebar-group');
        const labels = document.querySelectorAll('.sidebar-label');
        const target = document.getElementById(groupId);
        const label = target.previousElementSibling;
        const isExpanded = target.classList.contains('expanded');

        groups.forEach(g => g.classList.remove('expanded'));
        labels.forEach(l => l.classList.add('collapsed'));

        if (!isExpanded) {
            target.classList.add('expanded');
            label.classList.remove('collapsed');
        }
    }

window.doLogin = async function doLogin() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const err = document.getElementById('login-error');
        err.style.display = 'none';
        try {
            const res = await api('POST', '/api/v1/auth/login', { email, password: pass });
            S.token = res.token; S.user = res.user;
            localStorage.setItem('niso_token', res.token);
            localStorage.setItem('niso_user', JSON.stringify(res.user));
            
            if (res.requiresPasswordChange) {
                document.getElementById('standard-login-box').style.display = 'none';
                document.getElementById('first-login-reset-box').style.display = 'block';
                document.getElementById('forgot-password-box').style.display = 'none';
                document.getElementById('first-reset-error').style.display = 'none';
            } else {
                document.getElementById('login-overlay').classList.add('hidden');
                initApp();
            }
        } catch(e) {
            err.style.display = 'block';
            err.textContent = e.message;
        }
    }

window.doLogout = function doLogout() {
        S.token = null; S.user = null; S.activeProject = null;
        localStorage.removeItem('niso_token');
        localStorage.removeItem('niso_user');
        localStorage.removeItem('niso_activeProject');
        document.getElementById('login-overlay').classList.remove('hidden');
    }

window.openPricingOverrideModal = function openPricingOverrideModal(id) {
        const a = S.assessments.find(x => x.id === id);
        const html = `
            <div style="padding: 2rem">
                <h2 style="margin-bottom: 1.5rem">Ajustar Precificação</h2>
                <div class="form-group">
                    <label class="form-label">Preço Final Sugerido (R$)</label>
                    <input type="number" id="p-price" class="form-input" value="${a.pricing_override || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">Desconto (%)</label>
                    <input type="number" id="p-discount" class="form-input" value="${a.pricing_desconto || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">Notas de Ajuste</label>
                    <textarea id="p-notes" class="form-input" rows="3">${a.pricing_notas || ''}</textarea>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem">
                    <button class="btn btn-primary" onclick="savePricingOverride('${id}')">Salvar Ajustes</button>
                    <button class="btn" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        `;
        openModal(html);
    }

window.toggleSidebar = function toggleSidebar() {
        const sb = document.getElementById('sidebar');
        sb.classList.toggle('collapsed');
        const textEl = document.getElementById('toggle-sidebar-text');
        const svgEl = document.getElementById('toggle-sidebar-svg');
        if (sb.classList.contains('collapsed')) {
            if (textEl) textEl.textContent = 'Expandir';
            if (svgEl) svgEl.innerHTML = '<polyline points="13 7 18 12 13 17"/><polyline points="6 7 11 12 6 17"/>';
        } else {
            if (textEl) textEl.textContent = 'Recolher';
            if (svgEl) svgEl.innerHTML = '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>';
        }
    }

window.toggleContext = function toggleContext() {
        const ctx = document.getElementById('context-panel');
        ctx.classList.toggle('collapsed');
    }

window.updateActiveProjectWidget = function updateActiveProjectWidget() {
        const badge = document.getElementById('header-project-badge');
        if (!badge) return;
        
        const grcItems = document.querySelectorAll('.group-project-only');

        if (S.activeProject) {
            badge.textContent = S.activeProject.project_name || S.activeProject.client_name || 'Projeto';
            badge.style.display = '';
            grcItems.forEach(el => el.style.display = '');
        } else {
            badge.style.display = 'none';
            grcItems.forEach(el => el.style.display = 'none');
        }
        
        if (typeof updateSidebarProjectSelector === 'function') {
            updateSidebarProjectSelector();
        }
    }

window.updateSidebarProjectSelector = function updateSidebarProjectSelector() {
        const selectEl = document.getElementById('sidebar-project-select');
        if (!selectEl) return;
        const optionsHtml = ['<option value="">Selecione um projeto...</option>'];
        if (Array.isArray(S.projects)) {
            S.projects.forEach(p => {
                const name = p.project_name || p.client_name || p.id;
                optionsHtml.push(`<option value="${p.id}">${escapeHTML(name)}</option>`);
            });
        }
        selectEl.innerHTML = optionsHtml.join('');
        if (S.activeProject) {
            selectEl.value = S.activeProject.id;
        } else {
            selectEl.value = '';
        }
    }

window.updateHeaderUser = function updateHeaderUser() {
        const avatarEl = document.getElementById('sidebar-user-avatar');
        const nameEl = document.getElementById('sidebar-user-name');
        const roleEl = document.getElementById('sidebar-user-role');
        if (S.user) {
            const initial = (S.user.name || S.user.email || 'C').charAt(0).toUpperCase();
            if (avatarEl) avatarEl.textContent = initial;
            if (nameEl) nameEl.textContent = S.user.name || S.user.email || 'Consultor';
            
            if (roleEl) {
                let roleText = 'Usuário';
                if (S.user.role === 'platform_admin' || S.user.role === 'admin') roleText = 'Administrador';
                else if (S.user.role === 'consultor' || S.user.role === 'consultant') roleText = 'Consultor';
                else if (S.user.role === 'org_admin') roleText = 'Gestor do Cliente';
                else if (S.user.role === 'org_user') roleText = 'Colaborador do Cliente';
                else if (S.user.role === 'client') roleText = 'Cliente';
                roleEl.textContent = roleText;
            }
        }
        
        const isClient = S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client');
        
        // Ocultar Dashboard e Projetos para clientes
        const navDashboard = document.getElementById('nav-dashboard');
        const navProjects = document.getElementById('nav-projects');
        const selectorContainer = document.getElementById('sidebar-project-selector-container');
        const projectSelect = document.getElementById('sidebar-project-select');
        
        if (navDashboard) navDashboard.style.display = isClient ? 'none' : '';
        if (navProjects) navProjects.style.display = isClient ? 'none' : '';
        if (selectorContainer) {
            const manageLink = selectorContainer.querySelector('a');
            if (manageLink) manageLink.style.display = isClient ? 'none' : '';
        }
        if (projectSelect) {
            projectSelect.disabled = isClient;
        }

        // Ocultar grupo comercial para clientes
        const labelSales = document.getElementById('label-group-sales');
        const groupSales = document.getElementById('group-sales');
        if (labelSales) labelSales.style.display = isClient ? 'none' : '';
        if (groupSales) groupSales.style.display = isClient ? 'none' : '';

        // Configurações do grupo de sistema
        const labelSystem = document.getElementById('label-group-system');
        const groupSystem = document.getElementById('group-system-config');
        const navAuditTrail = document.getElementById('nav-audit-trail');
        const navSettings = document.getElementById('nav-settings');
        const navUsers = document.getElementById('nav-users');

        if (isClient) {
            if (labelSystem) labelSystem.style.display = 'none';
            if (navAuditTrail) navAuditTrail.style.display = 'none';
            if (navSettings) navSettings.style.display = 'none';
            
            if (S.user.role === 'org_admin') {
                if (groupSystem) {
                    groupSystem.style.display = 'block';
                    groupSystem.style.maxHeight = 'none';
                }
                if (navUsers) {
                    navUsers.style.display = '';
                    const navUsersText = navUsers.querySelector('.sidebar-nav-text');
                    if (navUsersText) navUsersText.textContent = 'Gestão de Equipe';
                }
            } else {
                if (groupSystem) groupSystem.style.display = 'none';
                if (navUsers) navUsers.style.display = 'none';
            }
        } else {
            if (labelSystem) labelSystem.style.display = '';
            if (groupSystem) {
                groupSystem.style.display = '';
                groupSystem.style.maxHeight = '';
            }
            if (navAuditTrail) navAuditTrail.style.display = '';
            if (navSettings) navSettings.style.display = '';
            if (navUsers) {
                const canSeeUsers = S.user && (S.user.role === 'platform_admin' || S.user.role === 'admin' || S.user.role === 'consultor' || S.user.role === 'consultant');
                navUsers.style.display = canSeeUsers ? '' : 'none';
                const navUsersText = navUsers.querySelector('.sidebar-nav-text');
                if (navUsersText) navUsersText.textContent = 'Usuários';
            }
        }
    }

window.loadNotifications = async function loadNotifications() {
        try {
            S.notifications = await api('GET', '/api/v1/notifications');
        } catch(e) { S.notifications = []; }
        updateNotifBadge();
    }

window.updateNotifBadge = function updateNotifBadge() {
        const unread = (S.notifications || []).filter(n => !n.read).length;
        const countEl = document.getElementById('notif-count');
        if (countEl) {
            countEl.textContent = unread;
            countEl.style.display = unread > 0 ? 'flex' : 'none';
        }
    }

window.toggleNotifications = function toggleNotifications() {
        const dd = document.getElementById('notif-dropdown');
        dd.classList.toggle('open');
        if (dd.classList.contains('open')) renderNotifDropdown();
    }

window.renderNotifDropdown = function renderNotifDropdown() {
        const dd = document.getElementById('notif-dropdown');
        const items = S.notifications || [];
        if (!items.length) {
            dd.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Sem notificacoes</div>';
            return;
        }
        dd.innerHTML = items.slice(0, 15).map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}')">
                <div style="font-weight:dots${n.read ? '400' : '600'}">dots${escapeHTML(n.title)}</div>
                <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.2rem">${escapeHTML(n.message || '')}</div>
                <div class="notif-time">${n.created_at ? n.created_at.split('T')[0] : ''}</div>
            </div>
        `).join('');
    }

window.markNotifRead = async function markNotifRead(id) {
        try { await api('PUT', `/api/v1/notifications/${id}/read`); } catch(e) {}
        await loadNotifications();
        renderNotifDropdown();
    }

window.handleNotificationClick = async function handleNotificationClick(id) {
        const n = (S.notifications || []).find(x => x.id === id);
        
        // 1. Mark as read and reload list
        try { await api('PUT', `/api/v1/notifications/${id}/read`); } catch(e) {}
        await loadNotifications();
        renderNotifDropdown();
        
        // Close dropdown
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.remove('open');

        if (!n) return;

        // 2. Prioritize Action Type & Target ID (Deep-linking)
        if (n.action_type && n.target_id) {
            const actionType = n.action_type;
            const targetId = n.target_id;
            const projectId = S.activeProject ? S.activeProject.id : (S.projects && S.projects[0] ? S.projects[0].id : '');

            if (actionType === 'open_finding') {
                navigate('capa');
                if (projectId) {
                    try {
                        const capas = await api('GET', `/api/v1/projects/${projectId}/capa`) || [];
                        const ca = capas.find(x => x.id === targetId);
                        if (ca) {
                            setTimeout(() => {
                                openEditCAPAModal(targetId, projectId, ca);
                            }, 150);
                        }
                    } catch (e) {}
                }
                return;
            } else if (actionType === 'open_soa') {
                navigate('soa');
                setTimeout(() => {
                    const row = document.getElementById(`soa-row-${targetId}`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('pulse-highlight');
                        setTimeout(() => {
                            row.classList.remove('pulse-highlight');
                        }, 3000);
                    }
                }, 200);
                return;
            }
        }

        // 3. Contextual navigation based on link or metadata
        const link = n.link || '';
        const title = n.title || '';
        const message = n.message || '';
        
        if (link) {
            const parts = link.split('/');
            if (parts[1] === 'projects') {
                const projectId = parts[2];
                const subview = parts[3];
                
                let proj = S.projects.find(p => p.id === projectId);
                if (!proj && S.currentProject && S.currentProject.id === projectId) proj = S.currentProject;
                if (!proj) proj = { id: projectId };
                
                if (subview === 'evidence') {
                    navigate('evidence', { currentProject: proj });
                } else if (subview === 'controls') {
                    navigate('controls', { currentProject: proj });
                } else if (subview === 'soa') {
                    navigate('soa', { currentProject: proj });
                } else {
                    navigate('project-detail', { currentProject: proj });
                }
            } else if (parts[1] === 'proposals') {
                const proposalId = parts[2];
                navigate('proposals', { currentProposalId: proposalId });
            } else if (parts[1] === 'assessments') {
                const assessmentId = parts[2];
                navigate('assessments', { currentAssessmentId: assessmentId });
            } else if (link === '/risks') {
                navigate('risks');
            } else if (link === '/vendors') {
                navigate('vendors');
            } else if (link === '/training') {
                navigate('training');
            } else if (link === '/ropa') {
                navigate('ropa');
            } else if (link === '/audits') {
                navigate('audits');
            } else if (link === '/capa') {
                navigate('capa');
            } else if (link === '/evidence') {
                navigate('evidence');
            } else if (link === '/controls') {
                navigate('controls');
            } else if (link.startsWith('/')) {
                navigate(link.substring(1));
            }
        } else {
            // Keyword fallback mapping (Phase 5 requirement)
            const lowerTitle = title.toLowerCase();
            const lowerMsg = (message || '').toLowerCase();
            
            if (lowerTitle.includes('pergunta') || lowerMsg.includes('pergunta') || lowerTitle.includes('pendência') || lowerMsg.includes('pendência') || lowerTitle.includes('evidência') || lowerMsg.includes('evidência')) {
                if (S.currentProject) {
                    navigate('evidence', { currentProject: S.currentProject });
                } else if (S.projects && S.projects.length > 0) {
                    navigate('evidence', { currentProject: S.projects[0] });
                } else {
                    navigate('evidence');
                }
            } else if (lowerTitle.includes('auditoria') || lowerMsg.includes('auditoria')) {
                navigate('audits');
            } else if (lowerTitle.includes('risco') || lowerMsg.includes('risco')) {
                navigate('risks');
            } else if (lowerTitle.includes('fornecedor') || lowerMsg.includes('fornecedor')) {
                navigate('vendors');
            } else if (lowerTitle.includes('treinamento') || lowerMsg.includes('treinamento')) {
                navigate('training');
            } else if (lowerTitle.includes('ação corretiva') || lowerMsg.includes('ação corretiva') || lowerTitle.includes('capa') || lowerMsg.includes('capa')) {
                navigate('capa');
            } else if (lowerTitle.includes('ropa') || lowerMsg.includes('ropa')) {
                navigate('ropa');
            } else if (lowerTitle.includes('proposta') || lowerMsg.includes('proposta')) {
                navigate('proposals');
            } else if (lowerTitle.includes('contrato') || lowerMsg.includes('contrato')) {
                navigate('projects');
            } else if (lowerTitle.includes('assessment') || lowerMsg.includes('assessment')) {
                navigate('assessments');
            }
        }
    }

window.openProfileModal = function openProfileModal() {
        var u = S.user || {};
        openModal('<div style="padding:1.5rem"><h3 style="font-family:Montserrat;margin-bottom:1rem">' + escapeHTML(u.name || 'Usuario') + '</h3><p style="color:var(--text-dim);font-size:0.8rem">' + escapeHTML(u.email || '') + '</p><p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.5rem">Role: ' + escapeHTML(u.role || 'consultor') + '</p><button class="btn" onclick="forceCloseModal()" style="margin-top:1.5rem">Fechar</button></div>');
    }

window.openActiveProjectModal = function openActiveProjectModal() {
        var p = S.activeProject;
        if (!p) { showToast('Nenhum projeto ativo'); return; }
        navigate('project-detail', { currentProject: p });
    }

window.updateContextPanel = function updateContextPanel() {
        // ponytail: no-op stub
    }

window.openInviteClientModal = function openInviteClientModal(projectId) {
        const tempPassword = 'Niso@' + Math.floor(Math.random() * 9000 + 1000);
        openModal(`
            <div class="modal-header"><span class="modal-title">Convidar Cliente</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Nome do Cliente</label>
                <input class="form-input" id="invite-name" placeholder="Ex: João Silva">
            </div>
            <div class="form-group">
                <label class="form-label">Email de Acesso</label>
                <input class="form-input" id="invite-email" type="email" placeholder="cliente@empresa.com.br">
            </div>
            <div class="form-group">
                <label class="form-label">Senha Inicial</label>
                <input class="form-input" id="invite-password" type="text" value="${tempPassword}">
            </div>
            <p style="font-size:0.7rem;color:var(--muted);margin-bottom:1rem">O cliente terá acesso exclusivo ao portal do projeto vinculado.</p>
            <button class="btn btn-primary" id="btn-do-invite" style="width:100%" onclick="doInviteClient('${projectId}')">Criar Acesso</button>
            <div id="invite-result" style="margin-top:1rem;font-size:0.8rem"></div>
        `);
    }

window.doInviteClient = async function doInviteClient(projectId) {
        const name = document.getElementById('invite-name').value;
        const email = document.getElementById('invite-email').value;
        const password = document.getElementById('invite-password').value;
        const result = document.getElementById('invite-result');
        const btn = document.getElementById('btn-do-invite');

        if (!name || !email || !password) {
            result.style.color = 'var(--danger)';
            result.textContent = 'Preencha todos os campos.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Criando...';

        try {
            const res = await api('POST', '/api/v1/users', {
                name,
                email,
                password,
                role: 'client',
                client_project_id: projectId
            });
            result.style.color = 'var(--accent)';
            result.textContent = `Acesso criado com sucesso para ${email}!`;
            btn.textContent = 'Criar outro';
            btn.disabled = false;
        } catch (e) {
            result.style.color = 'var(--danger)';
            result.textContent = 'Erro: ' + e.message;
            btn.disabled = false;
            btn.textContent = 'Tentar novamente';
        }
    }

window.loadLeads = async function loadLeads() { try { S.leads = await api('GET', '/api/v1/leads'); } catch(e) { S.leads = []; } }

window.loadAssessments = async function loadAssessments() { try { S.assessments = await api('GET', '/api/v1/assessments'); } catch(e) { S.assessments = []; } }

window.loadProjects = async function loadProjects() { try { S.projects = await api('GET', '/api/v1/projects'); if (typeof updateSidebarProjectSelector === 'function') { updateSidebarProjectSelector(); } } catch(e) { S.projects = []; } }

window.loadControls = async function loadControls() { try { S.controls = await api('GET', '/api/v1/controls'); } catch(e) { S.controls = []; } }

window.loadDashboardStats = async function loadDashboardStats() { try { S.stats = await api('GET', '/api/v1/dashboard/stats'); } catch(e) { S.stats = {}; } }

window.loadAll = async function loadAll() {
        await Promise.allSettled([loadLeads(), loadAssessments(), loadProjects(), loadControls(), loadNotifications(), loadDashboardStats()]);
        if (S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id) {
            try {
                const resA = await api('GET', '/api/v1/client/assessment');
                S.clientAssessmentId = resA.assessment_id;
            } catch(e) {}
            try {
                const resP = await api('GET', '/api/v1/client/proposal');
                S.clientProposalId = resP.proposal_id;
                S.clientProposalStatus = resP.status;
            } catch(e) {}
        }
    }

window.initApp = async function initApp() {
        // Sprint C: Check for public assessment self-service link
        const assessmentToken = new URLSearchParams(location.search).get('assessment');
        if (assessmentToken) {
            document.getElementById('login-overlay').classList.add('hidden');
            renderSelfServiceAssessment(assessmentToken);
            return;
        }

        if (!S.token) {
            document.getElementById('login-overlay').classList.remove('hidden');
            return;
        }
        document.getElementById('login-overlay').classList.add('hidden');
        await loadAll();
        
        const isClient = S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client');
        if (isClient && S.user.client_project_id) {
            if (S.projects && S.projects.length > 0) {
                const myProj = S.projects.find(p => p.id === S.user.client_project_id);
                if (myProj) {
                    S.activeProject = myProj;
                    localStorage.setItem('niso_activeProjectId', myProj.id);
                }
            }
        }

        updateHeaderUser();
        updateActiveProjectWidget();
        setLang(S.lang);

        if (isClient && S.user.client_project_id) {
            navigate('project-detail');
        } else {
            navigate('dashboard');
        }
        // ponytail: poll notifications every 60s
        setInterval(loadNotifications, 60000);
        // Close dropdowns on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-wrap')) {
                document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
            }
        });
    }

window.showForgotPasswordForm = function() {
        document.getElementById('standard-login-box').style.display = 'none';
        document.getElementById('first-login-reset-box').style.display = 'none';
        document.getElementById('forgot-password-box').style.display = 'block';
        document.getElementById('forgot-email-step').style.display = 'block';
        document.getElementById('forgot-code-step').style.display = 'none';
        document.getElementById('forgot-error').style.display = 'none';
        document.getElementById('forgot-success').style.display = 'none';
    }

window.showStandardLoginForm = function() {
        document.getElementById('standard-login-box').style.display = 'block';
        document.getElementById('first-login-reset-box').style.display = 'none';
        document.getElementById('forgot-password-box').style.display = 'none';
        document.getElementById('login-error').style.display = 'none';
    }

window.doFirstLoginReset = async function() {
        const newPass = document.getElementById('first-new-password').value;
        const confPass = document.getElementById('first-confirm-password').value;
        const err = document.getElementById('first-reset-error');
        err.style.display = 'none';
        
        if (!newPass) {
            err.textContent = 'Nova senha é obrigatória';
            err.style.display = 'block';
            return;
        }
        if (newPass !== confPass) {
            err.textContent = 'As senhas não coincidem';
            err.style.display = 'block';
            return;
        }
        
        try {
            await api('POST', '/api/v1/auth/reset-password-first', { newPassword: newPass });
            document.getElementById('login-overlay').classList.add('hidden');
            initApp();
        } catch (e) {
            err.textContent = e.message || 'Falha ao redefinir senha';
            err.style.display = 'block';
        }
    }

window.doForgotPasswordRequest = async function() {
        const email = document.getElementById('forgot-email').value;
        const err = document.getElementById('forgot-error');
        const success = document.getElementById('forgot-success');
        err.style.display = 'none';
        success.style.display = 'none';
        
        if (!email) {
            err.textContent = 'E-mail é obrigatório';
            err.style.display = 'block';
            return;
        }
        
        try {
            const res = await api('POST', '/api/v1/auth/forgot-password', { email });
            success.textContent = res.message || 'Código enviado!';
            success.style.display = 'block';
            
            if (res.reset_token) {
                document.getElementById('forgot-code').value = res.reset_token;
            }
            
            document.getElementById('forgot-email-step').style.display = 'none';
            document.getElementById('forgot-code-step').style.display = 'block';
        } catch (e) {
            err.textContent = e.message || 'Falha ao solicitar código';
            err.style.display = 'block';
        }
    }

window.doForgotPasswordReset = async function() {
        const code = document.getElementById('forgot-code').value;
        const newPass = document.getElementById('forgot-new-password').value;
        const err = document.getElementById('forgot-error');
        err.style.display = 'none';
        
        if (!code || !newPass) {
            err.textContent = 'Código e nova senha são obrigatórios';
            err.style.display = 'block';
            return;
        }
        
        try {
            await api('POST', '/api/v1/auth/reset-password', { token: code, newPassword: newPass });
            const email = document.getElementById('forgot-email').value;
            const res = await api('POST', '/api/v1/auth/login', { email, password: newPass });
            S.token = res.token; S.user = res.user;
            localStorage.setItem('niso_token', res.token);
            localStorage.setItem('niso_user', JSON.stringify(res.user));
            
            document.getElementById('login-overlay').classList.add('hidden');
            initApp();
        } catch (e) {
            err.textContent = e.message || 'Falha ao redefinir senha';
            err.style.display = 'block';
        }
    }

window.openDoDDrawer = function(projectId, phaseNum, selectEl, pendingItens) {
        S.activeDoD = { projectId, phaseNum, selectEl };
        document.getElementById('dod-drawer-overlay').classList.add('open');
        window.refreshDoDDrawer();
    }

window.refreshDoDDrawer = function() {
        if (!S.activeDoD) return;
        const { projectId, phaseNum, selectEl } = S.activeDoD;
        
        // Re-evaluate pending items based on current S.phaseChecks
        const phChecklist = S.checklistsConfig[phaseNum] || [];
        const pendingItens = phChecklist.filter(item => {
            const checkKey = `${projectId}_${item.id}`;
            return S.phaseChecks[checkKey] !== true;
        });
        
        const drawerContent = document.getElementById('dod-drawer-content');
        if (!drawerContent) return;
        
        if (pendingItens.length === 0) {
            drawerContent.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                    <div>
                        <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 1.25rem; color: var(--text); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Definition of Done (DoD)</h2>
                        <p style="font-family: 'Inter', sans-serif; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 1.5rem; line-height: 1.5;">
                            Todos os itens obrigatórios da fase foram concluídos! A fase está pronta para ser finalizada em conformidade com as diretrizes ISO 27001/27701.
                        </p>
                        <div style="text-align: center; padding: 2rem 0;">
                            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; stroke: var(--success); fill: none; stroke-width: 1.5; margin: 0 auto;">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <p style="font-size: 0.85rem; color: var(--success); margin-top: 1rem; font-weight: 500;">Pronto para conformidade</p>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
                        <button class="btn btn-primary" style="width: 100%; justify-content: center; font-weight: 500; font-size: 0.8rem; padding: 0.75rem;" onclick="window.confirmDoDCompletion()">Concluir Fase</button>
                        <button class="btn" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 0.75rem;" onclick="window.cancelDoDCompletion()">Fechar</button>
                    </div>
                </div>
            `;
            return;
        }
        
        drawerContent.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                <div>
                    <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 1.25rem; color: var(--text); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Definition of Done (DoD)</h2>
                    <p style="font-family: 'Inter', sans-serif; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 1.5rem; line-height: 1.5;">
                        Existem itens pendentes no checklist de conformidade desta fase. Para garantir a aderência às normas ISO 27001/27701, resolva as pendências abaixo ou escolha prosseguir mesmo assim.
                    </p>
                    
                    <div style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 0.7rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.75rem;">Pendências (${pendingItens.length})</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 55vh; overflow-y: auto; padding-right: 0.5rem;">
                        ${pendingItens.map(item => {
                            const match = item.text.match(/(A\.\d+\.\d+|Cl\s+\d+\.\d+|A\.\d+|Cl\s+\d+)/i);
                            const controlId = match ? match[0] : 'A.5.1';
                            
                            return `
                                <div class="list-item" style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border);">
                                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; width: 100%;">
                                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                            <span class="badge-cat ${item.category}" style="align-self: flex-start; font-size: 0.6rem; font-weight: 500;">${item.category.toUpperCase()}</span>
                                            <span class="item-name" style="font-size: 0.8rem; color: var(--text); font-weight: 400;">${escapeHTML(item.text)}</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem; width: 100%;">
                                        ${(item.category === 'evidence' || item.category === 'document') ? `
                                            <button class="btn" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.65rem;" onclick="wsUploadEvidence('${item.id}')">Upload</button>
                                        ` : ''}
                                        ${item.category === 'document' ? `
                                            <button class="btn btn-primary" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.65rem;" onclick="openGeneratePolicyModal('${projectId}', '${controlId}')">Gerar Política</button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; font-weight: 500; font-size: 0.8rem; padding: 0.75rem;" onclick="window.confirmDoDCompletion()">Concluir Fase mesmo assim</button>
                    <button class="btn" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 0.75rem;" onclick="window.cancelDoDCompletion()">Cancelar</button>
                </div>
            </div>
        `;
    }

window.confirmDoDCompletion = async function() {
        if (!S.activeDoD) return;
        const { projectId, phaseNum, selectEl } = S.activeDoD;
        const newStatus = selectEl.value;
        window.closeDoDDrawer();
        selectEl.disabled = true;
        try {
            await api('PUT', `/api/v1/projects/${projectId}/phases/${phaseNum}`, { status: newStatus });
            selectEl.setAttribute('data-prev', newStatus);
            showToast(`Fase ${phaseNum} atualizada para ${newStatus}`);
            render();
        } catch (e) {
            showToast(`Erro ao atualizar fase: ${e.message}`);
            selectEl.value = selectEl.getAttribute('data-prev') || selectEl.value;
        } finally {
            selectEl.disabled = false;
            S.activeDoD = null;
        }
    }

window.cancelDoDCompletion = function() {
        if (!S.activeDoD) return;
        const { selectEl } = S.activeDoD;
        selectEl.value = selectEl.getAttribute('data-prev') || 'in_progress';
        window.closeDoDDrawer();
        S.activeDoD = null;
    }

window.closeDoDDrawer = function() {
        document.getElementById('dod-drawer-overlay').classList.remove('open');
    }

window.closeDoDDrawerEl = function(e) {
        if (e && e.target !== document.getElementById('dod-drawer-overlay')) return;
        window.cancelDoDCompletion();
    }

window.signEvidence = async function(evidenceId, role) {
        if (!evidenceId) {
            alert('Não é possível assinar: ID da evidência inválido.');
            return;
        }
        const name = prompt(`Digite seu nome completo para assinar eletronicamente como ${role.toUpperCase()}:`);
        if (!name) return;
        const password = prompt(`Digite sua senha de login para confirmar a assinatura eletrônica como ${role.toUpperCase()}:`);
        if (!password) return;
        
        try {
            await api('PUT', `/api/v1/evidence/${evidenceId}/approve`, { role, approved_by: name, password });
            showToast(`Assinatura registrada com sucesso como ${role.toUpperCase()}!`);
            const c = document.getElementById('main-content');
            const h = document.getElementById('header-title');
            const a = document.getElementById('header-actions');
            if (c && h && a && S.view === 'evidence') {
                await renderEvidence(c, h, a);
            }
        } catch(e) {
            alert('Erro ao registrar assinatura: ' + e.message);
        }
    }

window.openScopeChangeModal = async function(projectId, projData) {
        let history = [];
        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/scope-changes`);
            if (res.ok && Array.isArray(res.changes)) {
                history = res.changes;
            }
        } catch(e) {}

        openModal(`
            <div class="modal-header"><span class="modal-title">Alteração de Escopo (Cláusula 6.3)</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Escopo Atual do Projeto</label>
                <textarea class="form-input" readonly rows="2" style="background:rgba(255,255,255,0.02);color:var(--text-dim);resize:none">${escapeHTML(projData.scope || 'Nenhum escopo definido')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Novo Escopo Proposto</label>
                <textarea class="form-input" id="scope-new" rows="2" placeholder="Descreva o novo escopo do SGSI..."></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Motivo da Mudança</label>
                <input class="form-input" id="scope-reason" placeholder="Ex: Inclusão de nova API de pagamentos no escopo">
            </div>
            <div class="form-group">
                <label class="form-label">Avaliação de Impacto na Segurança da Informação</label>
                <textarea class="form-input" id="scope-impact" rows="2" placeholder="Quais novos riscos ou mudanças de ativos essa alteração traz?"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Aprovador ness. / Cliente</label>
                <input class="form-input" id="scope-approved-by" placeholder="Ex: João (ness.) / CISO Cliente">
            </div>
            
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitScopeChange('${projectId}', '${escapeHTML(projData.scope || '')}')">Registrar Alteração</button>

            <div style="margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem">
                <h4 style="font-family:'Montserrat',sans-serif;font-size:0.7rem;color:var(--accent);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em">Histórico de Alterações de Escopo</h4>
                <div style="font-size:0.65rem; color:var(--text-dim); max-height:100px; overflow-y:auto; line-height:1.4">
                    ${history.length ? history.map((c, i) => `
                        <div style="padding:0.3rem 0; border-bottom:1px dashed rgba(255,255,255,0.03)">
                            <strong>Versão ${history.length - i}</strong> (${new Date(c.created_at).toLocaleDateString()}) - Por: ${escapeHTML(c.approved_by)}<br>
                            <em>Motivo:</em> ${escapeHTML(c.change_reason)}<br>
                            <em>Impacto de Seg.:</em> ${escapeHTML(c.security_impact)}<br>
                            <em>Novo Escopo:</em> ${escapeHTML(c.new_scope)}
                        </div>
                    `).join('') : 'Sem alterações de escopo registradas.'}
                </div>
            </div>
        `);
    }

window.submitScopeChange = async function(projectId, prevScope) {
        const body = {
            previous_scope: prevScope,
            new_scope: document.getElementById('scope-new').value,
            change_reason: document.getElementById('scope-reason').value,
            security_impact: document.getElementById('scope-impact').value,
            approved_by: document.getElementById('scope-approved-by').value
        };
        if (!body.new_scope || !body.change_reason || !body.approved_by) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        await api('POST', `/api/v1/projects/${projectId}/scope-changes`, body);
        
        if (S.activeProject && S.activeProject.id === projectId) S.activeProject.scope = body.new_scope;
        if (S.currentProject && S.currentProject.id === projectId) S.currentProject.scope = body.new_scope;

        forceCloseModal(); render();
    }

window.renderSelfServiceAssessment = async function renderSelfServiceAssessment(token) {
        const c = document.getElementById('content');
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.header');
        if (sidebar) sidebar.style.display = 'none';
        if (header) header.style.display = 'none';
        document.querySelector('.main').style.marginLeft = '0';

        c.innerHTML = '<div style="max-width:700px;margin:2rem auto;padding:0 1rem"><div style="text-align:center;color:var(--muted)">Carregando assessment...</div></div>';

        try {
            const r = await fetch(API_BASE + '/api/v1/public/assessment/' + encodeURIComponent(token));
            if (!r.ok) throw new Error('Link invalido ou expirado');
            const data = await r.json();
            if (data.error) throw new Error(data.error);

            // Group existing answers by block
            const existingByBlock = {};
            (data.answers || []).forEach(a => {
                if (!existingByBlock[a.block]) existingByBlock[a.block] = {};
                existingByBlock[a.block][a.question_key] = a.answer;
            });

            // ponytail: reuse ASSESSMENT_BLOCKS from the main app
            const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
            if (!blocks.length) {
                c.innerHTML = '<div style="max-width:700px;margin:2rem auto;text-align:center;color:var(--danger)">Erro: Assessment blocks not loaded.</div>';
                return;
            }

            window._ssToken = token;
            window._ssData = data;
            window._ssBlock = 0;
            window._ssAnswers = existingByBlock;

            renderSelfServiceBlock(c, blocks);
        } catch(e) {
            c.innerHTML = `<div style="max-width:700px;margin:2rem auto;text-align:center">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="color:var(--danger)">${escapeHTML(e.message)}</div>
            </div>`;
        }
    }

window.renderSelfServiceBlock = function renderSelfServiceBlock(c, blocks) {
        const idx = window._ssBlock;
        const block = blocks[idx];
        if (!idx && idx !== 0 || !block) return;

        const existing = window._ssAnswers[block.block] || {};
        const total = blocks.length;

        c.innerHTML = `<div style="max-width:700px;margin:2rem auto;padding:0 1rem" class="fade-in">
            <div style="text-align:center;margin-bottom:2rem">
                <div class="logo" style="font-size:1.5rem;margin-bottom:0.5rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:0.75rem;color:var(--muted)">Assessment Self-Service para ${escapeHTML(window._ssData.client_name)}</div>
                <div style="margin-top:0.5rem;font-size:0.6rem;color:var(--muted)">Bloco ${idx + 1} de ${total}</div>
                <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:0.75rem">
                    <div style="width:${Math.round(((idx + 1) / total) * 100)}%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s"></div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem">
                <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;margin-bottom:1.25rem">${escapeHTML(block.title)}</div>
                ${block.questions.map((q, qi) => {
                    const val = existing[q.key] || '';
                    if (q.type === 'yesno') {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                <option value="yes" ${val === 'yes' ? 'selected' : ''}>Sim</option>
                                <option value="no" ${val === 'no' ? 'selected' : ''}>Nao</option>
                            </select></div>`;
                    } else if (q.type === 'select' && q.options) {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                ${q.options.map(o => `<option value="${escapeHTML(o)}" ${val === o ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
                            </select></div>`;
                    } else {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <input class="form-input ss-answer" data-key="${q.key}" value="${escapeHTML(val)}" placeholder="Sua resposta"></div>`;
                    }
                }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:1rem">
                ${idx > 0 ? '<button class="btn" onclick="ssPrev()">Anterior</button>' : '<div></div>'}
                <button class="btn btn-primary" onclick="ssNext()">${idx < total - 1 ? 'Proximo' : 'Concluir Assessment'}</button>
            </div>
        </div>`;
    }

window.ssPrev = function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        if (window._ssBlock > 0) { window._ssBlock--; renderSelfServiceBlock(document.getElementById('content'), blocks); }
    }

window.ssNext = async function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        const block = blocks[window._ssBlock];
        const els = document.querySelectorAll('.ss-answer');
        const answers = [];
        els.forEach(el => {
            answers.push({ question_key: el.dataset.key, question: '', answer: el.value || '', notes: '' });
        });

        // Save to existing answers map
        if (!window._ssAnswers[block.block]) window._ssAnswers[block.block] = {};
        answers.forEach(a => { window._ssAnswers[block.block][a.question_key] = a.answer; });

        // Save to API
        try {
            await fetch(API_BASE + '/api/v1/public/assessment/' + window._ssToken + '/answers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block: block.block, answers })
            });
        } catch(e) {}

        if (window._ssBlock < blocks.length - 1) {
            window._ssBlock++;
            renderSelfServiceBlock(document.getElementById('content'), blocks);
        } else {
            document.getElementById('content').innerHTML = `<div style="max-width:700px;margin:3rem auto;text-align:center" class="fade-in">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:1.2rem;font-weight:500;color:var(--success);margin-bottom:0.5rem">Assessment Concluido!</div>
                <div style="color:var(--muted);font-size:0.75rem">Obrigado por completar o assessment. Seu consultor entrara em contato com os proximos passos.</div>
            </div>`;
        }
    }

window.saveChecklistItemMetadata = function(projectId, phaseNum, itemId) {
        const key = projectId + '_' + itemId;
        const isChecked = S.phaseChecks[key] === true;
        
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const k in S.phaseChecks) {
                if (k.startsWith(projectId + '_')) {
                    const id = k.replace(projectId + '_', '');
                    const match = id.match(/^p(\d+)_/);
                    if (match) {
                        items.push({
                            phase_number: parseInt(match[1]),
                            item_id: id,
                            is_checked: !!S.phaseChecks[k],
                            notes: S.phaseChecksNotes[k] || null,
                            assigned_to: S.phaseChecksAssigned[k] || null,
                            due_date: S.phaseChecksDueDate[k] || null
                        });
                    }
                }
            }
            if (!items.some(i => i.item_id === itemId)) {
                items.push({
                    phase_number: phaseNum,
                    item_id: itemId,
                    is_checked: isChecked,
                    notes: S.phaseChecksNotes[key] || null,
                    assigned_to: S.phaseChecksAssigned[key] || null,
                    due_date: S.phaseChecksDueDate[key] || null
                });
            }
            if (items.length > 0) {
                try {
                    await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, { items });
                } catch(e) {
                    console.error('Error saving checklist progress metadata:', e);
                }
            }
        }, 800);
    }

window.saveChecklistItemNotes = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    }

window.saveChecklistItemAssigned = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
        S.phaseChecksAssigned[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    }

window.saveChecklistItemDueDate = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
        S.phaseChecksDueDate[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    }



window.PHASE_PLAYBOOKS = {
    0: { obj: "Mobilização e Mandato (Cláusula 5.1)", guideline: "Definir o patrocinador do projeto (Executive Sponsor), formalizar a equipe de implementação e assinar a Carta de Mandato. O kick-off formaliza o comprometimento da alta direção com o SGSI." },
    1: { obj: "Entrevista Executiva (Cláusula 5.2 & 6.2)", guideline: "Conduzir reuniões com C-Level para entender o apetite de risco da organização, os objetivos estratégicos de negócio e obter inputs diretos para a elaboração da Política de Segurança da Informação." },
    2: { obj: "Entrevistas por Trilha (Cláusula 7.2)", guideline: "Realizar o mapeamento das trilhas de TI, RH, Jurídico e Operações. O objetivo é entender a rotina de cada área e coletar evidências iniciais de procedimentos já existentes." },
    3: { obj: "Definição de Escopo (Cláusula 4.3)", guideline: "Mapear de forma precisa e documentada os limites físicos, organizacionais e tecnológicos do SGSI. Quaisquer exclusões de controles ou áreas devem ser tecnicamente justificadas no documento de escopo." },
    4: { obj: "Gap Assessment (Cláusula 6.1)", guideline: "Comparar a maturidade atual dos processos internos com os 93 controles da ISO 27001:2022. Identificar 'Quick Wins' (melhorias rápidas e de baixo custo) para iniciar a adequação com impacto." },
    5: { obj: "Governança e Papéis (Cláusula 5.3)", guideline: "Nomear formalmente os papéis-chave do SGSI, como o DPO (Encarregado) e o CISO (Responsável por Segurança). Criar e publicar a Matriz RACI de responsabilidades de segurança." },
    6: { obj: "Contexto e Partes Interessadas (Cláusula 4.1 & 4.2)", guideline: "Conduzir a análise de ambiente interno e externo (SWOT) e identificar os requisitos legais (ex: LGPD, resoluções ANPD) e contratuais com clientes e parceiros." },
    7: { obj: "Inventário de Ativos e Dados (Controle A.5.9)", guideline: "Listar e classificar todos os ativos de informação, softwares, hardwares e dados pessoais (RoPA). Atribuir owners (proprietários) para cada ativo do SGSI/SGPI." },
    8: { obj: "Mapeamento de Processos", guideline: "Desenhar os principais fluxos de dados e processos de negócio, documentando como a informação entra, é processada e sai da organização, identificando pontos críticos de risco." },
    9: { obj: "Riscos de Segurança (Cláusula 6.1.2)", guideline: "Identificar ameaças e vulnerabilidades para cada ativo do inventário. Calcular o risco bruto usando a metodologia impacto × probabilidade e mapear os controles mitigadores do Anexo A." },
    10: { obj: "Riscos de Privacidade (ISO 27701)", guideline: "Avaliar os riscos relacionados à privacidade dos dados de titulares (PII). Conduzir DPIA/RIPD para os fluxos identificados como de alto risco para os direitos dos titulares." },
    11: { obj: "Tratamento de Riscos (Cláusula 6.1.3)", guideline: "Definir a opção de tratamento (Evitar, Transferir, Aceitar ou Mitigar) para cada risco. Elaborar o Plano de Tratamento de Riscos (RTP) com cronogramas e responsáveis." },
    12: { obj: "SoA do SGSI (Cláusula 6.1.3d)", guideline: "Elaborar a Declaração de Aplicabilidade (SoA) para os 93 controles da ISO 27001:2022. Todo controle excluído deve possuir uma justificativa robusta aprovada pela direção." },
    13: { obj: "SoA do SGPI (ISO 27701)", guideline: "Mapear e justificar a aplicabilidade dos controles adicionais de privacidade da ISO 27701 (Anexos A e B), gerando o Statement of Applicability específico para dados pessoais." },
    14: { obj: "Arquitetura Documental (Cláusula 7.5)", guideline: "Estruturar o padrão de nomenclatura, versionamento e templates oficiais de políticas e procedimentos do SGSI, criando a Lista Mestra de Documentos." },
    15: { obj: "Controles Organizacionais (Anexo A.5)", guideline: "Redigir e publicar as políticas organizacionais de SI. Implementar processos de gestão de acessos e monitoramento de ativos organizacionais de SI." },
    16: { obj: "Controles de Pessoas (Anexo A.6)", guideline: "Implementar background check no onboarding de novos funcionários, termos de confidencialidade (NDA) obrigatórios e processos de desligamento seguro (offboarding)." },
    17: { obj: "Controles Físicos (Anexo A.7)", guideline: "Definir perímetros físicos de segurança, controles de acesso de visitantes (biometria/crachá), monitoramento por CFTV e procedimentos de descarte de mídia física." },
    18: { obj: "Controles Tecnológicos (Anexo A.8)", guideline: "Implementar criptografia de dados (trânsito/repouso), antivírus/EDR corporativo, gerenciamento de patches e centralização de logs para auditoria de segurança." },
    19: { obj: "Desenvolvimento Seguro (Controle A.8.25)", guideline: "Criar a Política de Desenvolvimento Seguro (SSDLC). Configurar code reviews obrigatórios e integrar scanners de código estático (SAST) na esteira CI/CD." },
    20: { obj: "Cloud, DevOps e SRE (Controle A.5.23)", guideline: "Garantir a segurança dos serviços em nuvem AWS. Configurar o princípio de menor privilégio no IAM e ativar alarmes de monitoramento no CloudTrail." },
    21: { obj: "Programa de Privacidade (ISO 27701)", guideline: "Estruturar o programa corporativo de privacidade de dados pessoais, nomeando formalmente o DPO e atualizando o inventário de processos de tratamento (RoPA)." },
    22: { obj: "Privacy by Design (ISO 27701)", guideline: "Integrar requisitos de privacidade desde a concepção de novos produtos ou sistemas. Garantir a minimização de dados pessoais coletados." },
    23: { obj: "Direitos dos Titulares (ISO 27701)", guideline: "Criar e divulgar o canal oficial para titulares exercerem seus direitos (confirmação, acesso, exclusão). Definir o SLA de resposta legal." },
    24: { obj: "Consentimento e Bases Legais (ISO 27701)", guideline: "Mapear as bases legais de todas as operações de tratamento. Implementar cookie banner e fluxos de consentimento revogáveis e transparentes." },
    25: { obj: "Retenção e Descarte (Controle A.8.10)", guideline: "Elaborar a Tabela de Temporalidade de dados. Implementar rotinas (manuais ou automatizadas) para descarte seguro e definitivo de informações expiradas." },
    26: { obj: "Transferências e Compartilhamento", guideline: "Mapear compartilhamentos com terceiros e transferências internacionais de dados, exigindo cláusulas contratuais padrão (SCCs) adequadas." },
    27: { obj: "Fornecedores e Operadores (Controle A.5.19)", guideline: "Auditar a postura de segurança e privacidade dos fornecedores críticos. Exigir e assinar acordos de tratamento de dados (DPAs) com fornecedores." },
    28: { obj: "Incidentes (Controles A.5.24 a A.5.28)", guideline: "Formalizar o plano de resposta a incidentes. Definir severidade, canais de comunicação, comitê de crise (CSIRT) e o fluxo de notificação à ANPD (em até 72h)." },
    29: { obj: "Treinamento (Controle A.6.3)", guideline: "Elaborar material e aplicar treinamento anual obrigatório de segurança da informação e privacidade para 100% dos colaboradores da empresa." },
    30: { obj: "Monitoramento e Métricas (Cláusula 9.1)", guideline: "Definir indicadores-chave de performance (KPIs) do SGSI, acompanhar a eficácia dos controles e gerar relatórios periódicos para a diretoria." },
    31: { obj: "Auditoria Interna (Cláusula 9.2)", guideline: "Executar a auditoria interna do SGSI contra todos os requisitos da norma ISO 27001. Deve ser feita por profissional independente qualificado." },
    32: { obj: "Não Conformidades (Cláusula 10.1)", guideline: "Investigar as causas-raiz de quaisquer desvios encontrados na auditoria e abrir planos de Ação Corretiva (CAPAs) para eliminar recorrências." },
    33: { obj: "Análise Crítica pela Direção (Cláusula 9.3)", guideline: "Conduzir a reunião de análise crítica anual liderada pelo CEO para avaliar o desempenho do SGSI e aprovar melhorias e orçamentos." },
    34: { obj: "Readiness Review", guideline: "Revisar todos os entregáveis do SGSI antes da contratação da certificadora. Verificar se todas as políticas e evidências mínimas estão disponíveis." },
    35: { obj: "Preparação Stage 1", guideline: "Organizar e compilar a documentação do SGSI (Escopo, Política, SoA e BCP) para envio ao auditor externo da certificadora." },
    36: { obj: "Correções Pós-Stage 1", guideline: "Tratar quaisquer apontamentos ou não conformidades levantadas pelo auditor na auditoria documental de Estágio 1." },
    37: { obj: "Gestão de Vulnerabilidades", guideline: "Verificar se as varreduras de vulnerabilidades operacionais estão ativas e se os relatórios estão limpos para a auditoria de Estágio 2." },
    38: { obj: "Continuidade de Negócios (Controle A.5.30)", guideline: "Revisar os planos de continuidade (BCP/DRP) e garantir que testes práticos de backup e restore foram executados e documentados com sucesso." },
    39: { obj: "Segurança Física", guideline: "Fazer uma varredura nas dependências físicas do escritório para garantir a conformidade prática com a política de Mesa Limpa e Tela Limpa." },
    40: { obj: "Encerramento do Ciclo", guideline: "Preparar a equipe e os principais owners de controles para as entrevistas presença/remota da auditoria externa de Estágio 2." }
};

window.initApp = window.initApp || function() {};
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') forceCloseModal(); });
new MutationObserver(function() {
    document.querySelectorAll('[onclick]').forEach(function(el) {
        if (!['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
            if (!el._a11yKey) {
                el._a11yKey = true;
                el.addEventListener('keydown', function(e) {
                    var tag = (e.target||{}).tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                    if (e.key === 'Enter' || e.key === ' ') { el.click(); e.preventDefault(); }
                });
            }
        }
    });
}).observe(document.body, { childList: true, subtree: true });

window.initApp();
