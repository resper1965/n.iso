import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML } from '../ui.js';
import { navigate, render } from '../router.js';

    async function renderSettings(c, h, a) {
        h.textContent = 'Configuracoes';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            let cfg;
            try {
                cfg = await api('GET', '/api/v1/pricing-config');
            } catch(err) {
                cfg = await api('GET', '/api/v1/proposals/config/pricing');
            }

            function numInput(id, val, label, suffix) {
                return `<div class="form-group" style="flex:1;min-width:140px">
                    <label class="form-label">${label}</label>
                    <div style="display:flex;align-items:center;gap:0.25rem">
                        <input type="number" id="${id}" class="form-input" value="${val}" step="any" style="width:100%">
                        ${suffix ? `<span style="font-size:0.75rem;color:var(--muted)">${suffix}</span>` : ''}
                    </div>
                </div>`;
            }

            c.innerHTML = `
            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Taxa de Venda por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">O que cobramos do cliente por Person-Day (8h). Inclui margem, overhead e impostos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-venda-1', cfg.taxaVendaPD[1], 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-venda-2', cfg.taxaVendaPD[2], 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-venda-3', cfg.taxaVendaPD[3], 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-venda-4', cfg.taxaVendaPD[4], 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Custo Interno por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Custo real do consultor por dia (salario + beneficios). Usado para calcular margem operacional.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-custo-1', cfg.custoInternoPD[1], 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-custo-2', cfg.custoInternoPD[2], 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-custo-3', cfg.custoInternoPD[3], 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-custo-4', cfg.custoInternoPD[4], 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Tributos e Encargos</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-iss', (cfg.tributos.iss*100).toFixed(2), 'ISS', '%')}
                    ${numInput('cfg-pis', (cfg.tributos.pis*100).toFixed(2), 'PIS', '%')}
                    ${numInput('cfg-cofins', (cfg.tributos.cofins*100).toFixed(2), 'COFINS', '%')}
                    ${numInput('cfg-irpj', (cfg.tributos.irpj*100).toFixed(2), 'IRPJ', '%')}
                    ${numInput('cfg-csll', (cfg.tributos.csll*100).toFixed(2), 'CSLL', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Parametros Gerais</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-overhead', (cfg.overheadPct*100).toFixed(1), 'Overhead', '%')}
                    ${numInput('cfg-margem', (cfg.margemAlvo*100).toFixed(1), 'Margem Alvo (referencia)', '%')}
                    ${numInput('cfg-comissao', (cfg.comissaoPct*100).toFixed(1), 'Comissao', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Buffer de Risco por Tier</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Multiplicador adicional sobre o preco de venda para cobrir riscos e imprevistos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-buffer-1', (cfg.bufferRisco[1]*100).toFixed(1), 'Foundation', '%')}
                    ${numInput('cfg-buffer-2', (cfg.bufferRisco[2]*100).toFixed(1), 'Standard', '%')}
                    ${numInput('cfg-buffer-3', (cfg.bufferRisco[3]*100).toFixed(1), 'Enterprise', '%')}
                    ${numInput('cfg-buffer-4', (cfg.bufferRisco[4]*100).toFixed(1), 'Critical', '%')}
                </div>
            </div>

            <button class="btn btn-primary" style="padding:0.6rem 2rem" onclick="savePricingConfig()">Salvar Configuracoes</button>
            `;
        } catch(e) {
            c.innerHTML = '<div class="error">Erro ao carregar configuracoes: ' + escapeHTML(e.message) + '</div>';
        }
    }

    async function savePricingConfig() {
        try {
            const g = id => parseFloat(document.getElementById(id).value) || 0;
            const config = {
                taxaVendaPD: { 1: g('cfg-venda-1'), 2: g('cfg-venda-2'), 3: g('cfg-venda-3'), 4: g('cfg-venda-4') },
                custoInternoPD: { 1: g('cfg-custo-1'), 2: g('cfg-custo-2'), 3: g('cfg-custo-3'), 4: g('cfg-custo-4') },
                tributos: {
                    iss: g('cfg-iss')/100, pis: g('cfg-pis')/100, cofins: g('cfg-cofins')/100,
                    irpj: g('cfg-irpj')/100, csll: g('cfg-csll')/100
                },
                overheadPct: g('cfg-overhead')/100,
                margemAlvo: g('cfg-margem')/100,
                comissaoPct: g('cfg-comissao')/100,
                bufferRisco: { 1: g('cfg-buffer-1')/100, 2: g('cfg-buffer-2')/100, 3: g('cfg-buffer-3')/100, 4: g('cfg-buffer-4')/100 }
            };
            try {
                await api('PUT', '/api/v1/pricing-config', config);
            } catch(err) {
                await api('PUT', '/api/v1/proposals/config/pricing', config);
            }
            showToast('Configuracoes salvas com sucesso');
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function renderUsers(c, h, a) {
        h.innerHTML = '';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const users = await api('GET', '/api/v1/users').catch(() => []);
            const userArr = Array.isArray(users) ? users : [];
            if (!S.projects || S.projects.length === 0) {
                await loadProjects();
            }
            const projMap = {};
            (S.projects || []).forEach(p => {
                projMap[p.id] = p.project_name || p.client_name;
            });

            const totalUsers = userArr.length;
            const admins = userArr.filter(u => u.role === 'platform_admin' || u.role === 'admin' || u.role === 'consultor').length;
            const clientUsers = totalUsers - admins;

            const headerHtml = window.renderPageHeader(
                'Gestão de Usuários & RBAC',
                'Controle de acesso baseado em papéis, governança de privilégios e permissões por organização',
                '<button class="btn btn-primary" onclick="openUserModal()">+ Novo Usuário</button>'
            );

            const statsHtml = window.renderStatCards([
                { label: 'Total de Usuários', value: totalUsers, color: 'var(--accent)', subtext: 'Contas ativas' },
                { label: 'Administradores & Consultores', value: admins, color: '#34c759', subtext: 'Equipe ness.' },
                { label: 'Usuários de Clientes', value: clientUsers, color: '#ffcc00', subtext: 'Acesso às orgs' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Nome', 'E-mail', 'Papel (Role)', 'Projeto / Organização', 'Ações'],
                userArr.map(u => {
                    const projectName = u.client_project_id ? (projMap[u.client_project_id] || u.client_project_id) : '—';
                    const roleLabel = u.role === 'platform_admin' ? 'Admin Plataforma' : 
                                      u.role === 'consultant' || u.role === 'consultor' ? 'Consultor' :
                                      u.role === 'org_admin' ? 'Gestor Cliente' : 
                                      u.role === 'org_user' ? 'Colaborador Cliente' : u.role;
                    return [
                        `<strong>${escapeHTML(u.name)}</strong>`,
                        escapeHTML(u.email),
                        window.renderStatusBadge(roleLabel, u.role === 'platform_admin' ? 'info' : 'success'),
                        escapeHTML(projectName),
                        `<button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Editar</button>
                         <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteUser('${u.id}')">Excluir</button>`
                    ];
                }),
                { emptyState: 'Nenhum usuário cadastrado.' }
            );

            c.innerHTML = `
                ${headerHtml}
                ${statsHtml}
                ${tableHtml}
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar usuários: ' + escapeHTML(e.message) + '</div>';
        }
    }

    async function renderAuditTrail(c, h, a) {
        h.innerHTML = '';
        a.innerHTML = '';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto primeiro.</p></div>'; 
            return; 
        }

        c.innerHTML = '<div class="loading"></div>';
        let logs = [];
        try { logs = await api('GET', `/api/v1/projects/${proj.id}/audit-trail`); } catch(e) {}
        if (!Array.isArray(logs)) logs = [];

        const headerHtml = window.renderPageHeader(
            'Trilha de Auditoria e Logs Imutáveis',
            `Registro cronológico de todas as ações de conformidade e auditoria do projeto ${escapeHTML(proj.client_name || proj.project_name)}`,
            ''
        );

        const statsHtml = window.renderStatCards([
            { label: 'Total de Eventos', value: logs.length, color: 'var(--accent)', subtext: 'Registros na trilha' },
            { label: 'Projeto Ativo', value: escapeHTML(proj.client_name || 'Sem nome'), color: '#34c759', subtext: `ID: ${proj.id}` }
        ]);

        const tableHtml = window.renderDataTable(
            ['Data / Hora', 'Usuário / Ator', 'Ação Realizada', 'Detalhes'],
            logs.map(l => [
                `<span style="white-space:nowrap;color:var(--text-dim);font-size:0.75rem">${new Date(l.created_at || l.timestamp).toLocaleString()}</span>`,
                `<strong>${escapeHTML(l.actor || l.user_email || 'System')}</strong>`,
                window.renderStatusBadge(l.action, 'info'),
                `<span style="font-size:0.75rem;color:var(--text-dim)">${escapeHTML(l.details || '—')}</span>`
            ]),
            { emptyState: 'Nenhum log registrado para este projeto até o momento.' }
        );

        c.innerHTML = `
            ${headerHtml}
            ${statsHtml}
            ${tableHtml}
        `;
    }

    async function deleteUser(id) {
        if (!confirm('Deseja realmente excluir este usuário permanentemente?')) return;
        try {
            await api('DELETE', `/api/v1/users/${id}`);
            showToast('Usuário excluído com sucesso');
            render();
        } catch (e) {
            showToast('Erro ao excluir usuário: ' + e.message, 'error');
        }
    }

    async function openUserModal(userId) {
        let user = null;
        if (userId) {
            try {
                const users = await api('GET', '/api/v1/users');
                user = users.find(u => u.id === userId);
            } catch(e) {
                showToast('Erro ao buscar dados do usuário', 'error');
                return;
            }
        }

        if (!S.projects || S.projects.length === 0) {
            try {
                await loadProjects();
            } catch(e) {}
        }

        const projectSelectOptions = (S.projects || []).map(p => `
            <option value="${p.id}" ${user && user.client_project_id === p.id ? 'selected' : ''}>
                ${escapeHTML(p.project_name || p.client_name)}
            </option>
        `).join('');

        const isSystemAdmin = S.user && (S.user.role === 'platform_admin' || S.user.role === 'admin' || S.user.role === 'consultor' || S.user.role === 'consultant');
        
        let roleOptions = '';
        if (isSystemAdmin) {
            roleOptions = `
                <option value="">Selecione um papel</option>
                <option value="platform_admin" ${user && user.role === 'platform_admin' ? 'selected' : ''}>Administrador de Plataforma</option>
                <option value="consultant" ${user && (user.role === 'consultant' || user.role === 'consultor') ? 'selected' : ''}>Consultor</option>
                <option value="org_admin" ${user && user.role === 'org_admin' ? 'selected' : ''}>Gestor do Cliente</option>
                <option value="org_user" ${user && user.role === 'org_user' ? 'selected' : ''}>Colaborador do Cliente</option>
            `;
        } else {
            roleOptions = `
                <option value="">Selecione um papel</option>
                <option value="org_admin" ${user && user.role === 'org_admin' ? 'selected' : ''}>Gestor do Cliente</option>
                <option value="org_user" ${user && user.role === 'org_user' ? 'selected' : ''}>Colaborador do Cliente</option>
            `;
        }

        const activeProjId = S.activeProject ? S.activeProject.id : (S.user ? S.user.client_project_id : null);
        let govMembers = [];
        if (activeProjId) {
            try {
                govMembers = await api('GET', `/api/v1/projects/${activeProjId}/governance`);
            } catch(e) {
                govMembers = [];
            }
        }
        
        let govImportHtml = '';
        if (!user && govMembers.length > 0) {
            govImportHtml = `
                <div class="form-group" style="margin-bottom: 1.25rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.25rem;">
                    <label class="form-label" style="color:var(--accent)">Importar da Governança do Projeto</label>
                    <select id="user-m-gov-import" class="form-input" onchange="window.importFromGovernance(this.value)">
                        <option value="">Selecione um membro para importar...</option>
                        ${govMembers.map((m, idx) => `<option value="${idx}">${escapeHTML(m.name)} (${escapeHTML(m.job_title)})</option>`).join('')}
                    </select>
                </div>
            `;
        }
        
        window.govMembersList = govMembers;
        window.importFromGovernance = function(idx) {
            if (idx === '') return;
            const member = window.govMembersList[parseInt(idx, 10)];
            if (!member) return;
            
            const nameInput = document.getElementById('user-m-name');
            const emailInput = document.getElementById('user-m-email');
            const roleSelect = document.getElementById('user-m-role');
            
            if (nameInput) nameInput.value = member.name || '';
            if (emailInput) emailInput.value = member.email || '';
            
            if (roleSelect) {
                const title = (member.job_title || '').toLowerCase();
                if (title.includes('ceo') || title.includes('ciso') || title.includes('sgsi') || title.includes('diret') || title.includes('execut')) {
                    roleSelect.value = 'org_admin';
                } else {
                    roleSelect.value = 'org_user';
                }
            }
        };

        const isClientRole = user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client');
        const showProjectSelect = isSystemAdmin && (!user || isClientRole);

        const html = `
            <div class="modal-header">
                <span class="modal-title">${user ? 'Editar Usuário' : 'Novo Usuário'}</span>
                <button class="btn-ghost" onclick="closeModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:1.25rem">
                ${govImportHtml}
                <div class="form-group">
                    <label class="form-label">Nome Completo</label>
                    <input type="text" id="user-m-name" class="form-input" value="${user ? escapeHTML(user.name) : ''}" placeholder="Ex: Roberto Silva">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail</label>
                    <input type="email" id="user-m-email" class="form-input" value="${user ? escapeHTML(user.email) : ''}" placeholder="usuario@empresa.com" ${user ? 'readonly style="opacity: 0.6"' : ''}>
                </div>
                <div class="form-group">
                    <label class="form-label">Senha ${user ? '(Deixe em branco para manter a atual)' : ''}</label>
                    <input type="password" id="user-m-password" class="form-input" placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label class="form-label">Papel (Role)</label>
                    <select id="user-m-role" class="form-input" onchange="toggleUserProjectSelect(this.value)">
                        ${roleOptions}
                    </select>
                </div>
                
                <div class="form-group" id="user-m-project-group" style="display: ${showProjectSelect ? 'block' : 'none'}">
                    <label class="form-label">Projeto Associado</label>
                    <select id="user-m-project" class="form-input">
                        <option value="">Nenhum projeto selecionado</option>
                        ${projectSelectOptions}
                    </select>
                </div>

                <div style="display:flex; gap:1rem; margin-top:1.5rem">
                    <button class="btn btn-primary" style="flex:1" onclick="saveUser('${user ? user.id : ''}')">Salvar</button>
                    <button class="btn" style="flex:1" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        `;
        openModal(html);
    }

    window.toggleUserProjectSelect = function(role) {
        const group = document.getElementById('user-m-project-group');
        if (group) {
            const isSystemAdmin = S.user && (S.user.role === 'platform_admin' || S.user.role === 'admin' || S.user.role === 'consultor' || S.user.role === 'consultant');
            if (isSystemAdmin && (role === 'org_admin' || role === 'org_user' || role === 'client')) {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
                const projSelect = document.getElementById('user-m-project');
                if (projSelect) projSelect.value = '';
            }
        }
    };

    window.saveUser = async function(id) {
        const name = document.getElementById('user-m-name').value.trim();
        const email = document.getElementById('user-m-email').value.trim();
        const password = document.getElementById('user-m-password').value;
        const role = document.getElementById('user-m-role').value;
        const projectEl = document.getElementById('user-m-project');
        const client_project_id = projectEl ? (projectEl.value || null) : null;

        if (!name || !email || !role) {
            showToast('Preencha os campos obrigatórios (Nome, E-mail e Papel).', 'error');
            return;
        }

        if (!id && !password) {
            showToast('A senha é obrigatória para novos usuários.', 'error');
            return;
        }

        const payload = { name, email, role, client_project_id };
        if (password) {
            payload.password = password;
        }

        try {
            if (id) {
                await api('PUT', `/api/v1/users/${id}`, payload);
                showToast('Usuário atualizado com sucesso');
            } else {
                await api('POST', '/api/v1/users', payload);
                showToast('Usuário criado com sucesso');
            }
            closeModal();
            render();
        } catch (e) {
            showToast('Erro ao salvar usuário: ' + e.message, 'error');
        }
    };

export { renderSettings, renderUsers, renderAuditTrail };
window.renderSettings = renderSettings;
window.renderUsers = renderUsers;
window.renderAuditTrail = renderAuditTrail;
window.savePricingConfig = savePricingConfig;
window.deleteUser = deleteUser;
window.openUserModal = openUserModal;
