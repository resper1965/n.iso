import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML } from '../ui.js';
import { navigate, render } from '../router.js';

    async function renderROPA(c, h, a) {
        h.textContent = 'ROPA — Registro de Atividades de Tratamento';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewROPAModal('${proj.id}')">+ Nova Atividade</button>` : '';
        
        let records = [];
        try { records = await api('GET', `/api/v1/projects/${proj.id}/ropa`); } catch(e) {}
        if (!Array.isArray(records)) records = [];
        S.ropa = records;

        const totalRecords = records.length;
        const dpiaReqCount = records.filter(r => r.dpia_required).length;
        const intlTransCount = records.filter(r => r.international_transfers).length;
        const activeRecords = records.filter(r => r.status === 'Active' || !r.status).length;

        const statsHtml = window.renderStatCards([
            { label: 'Total de Processamentos', value: totalRecords, color: 'var(--accent)', subtext: 'Atividades mapeadas' },
            { label: 'Atividades Ativas', value: activeRecords, color: '#34c759', subtext: 'Em operação' },
            { label: 'DPIA Requerido', value: dpiaReqCount, color: dpiaReqCount > 0 ? '#ffcc00' : '#34c759', subtext: 'Avaliação de impacto' },
            { label: 'Transferências Int.', value: intlTransCount, color: intlTransCount > 0 ? '#ff3b30' : 'var(--accent)', subtext: 'Fronteiras internacionais' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Propósito do Tratamento', 'Base Legal', 'Titulares', 'Retenção', 'DPIA Requerido', 'Status', 'Ações'],
            records.map(r => {
                const statusType = r.status === 'Active' || !r.status ? 'success' : 'info';
                return [
                    `<strong>${escapeHTML(r.processing_purpose)}</strong>`,
                    escapeHTML(r.legal_basis || 'N/A'),
                    escapeHTML(r.data_subjects || 'N/A'),
                    escapeHTML(r.retention_period || 'N/A'),
                    r.dpia_required ? window.renderStatusBadge('Sim', 'warning') : window.renderStatusBadge('Não', 'neutral'),
                    window.renderStatusBadge(r.status || 'Active', statusType),
                    `<button class="btn btn-ghost btn-sm" onclick="window.openROPADetailsModal('${r.id}')">Detalhes</button>
                     <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="event.stopPropagation(); window.openROPAReport('${proj.id}')">PDF</button>`
                ];
            }),
            { emptyState: 'Nenhum registro ROPA cadastrado neste projeto.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openROPADetailsModal = function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Atividade ROPA</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.processing_purpose || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Base Legal</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.legal_basis || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável / Owner</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.owner || 'Sem responsável')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_categories || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_subjects || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Período de Retenção</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.retention_period || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Destinatários / Compartilhamento</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.recipients || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag ctx-tag-green" style="font-weight:600">${r.status || 'Active'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPIA Requerido</div>
                        <span class="ctx-tag" style="background:${r.dpia_required ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.05)'}; color:${r.dpia_required ? '#f59e0b' : 'var(--text-dim)'}; font-weight:600">${r.dpia_required ? 'Sim' : 'Não'}</span>
                    </div>
                    ${r.international_transfers ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Transferência Internacional</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">
                            Salvaguardas: ${escapeHTML(r.transfer_safeguards || 'Sem salvaguardas especificadas')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Workflow de Assinatura (ROPA)</h4>
                <div style="display:flex; flex-direction:column; gap:0.75rem">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            ${r.ciso_approved_by ? `<span style="color:var(--success)">✓ Aprovado por ${escapeHTML(r.ciso_approved_by)} em ${new Date(r.ciso_approved_at).toLocaleDateString()}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!r.ciso_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="window.approveROPA('${projectId}', '${r.id}', 'ciso')">Assinar</button>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            ${r.ceo_approved_by ? `<span style="color:var(--success)">✓ Aprovado por ${escapeHTML(r.ceo_approved_by)} em ${new Date(r.ceo_approved_at).toLocaleDateString()}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!r.ceo_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="window.approveROPA('${projectId}', '${r.id}', 'ceo')">Assinar</button>` : ''}
                    </div>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px">
                <button class="btn btn-secondary" onclick="window.openROPAReport('${projectId}')">Gerar Relatório ROPA</button>
                <div>
                    <button class="btn" onclick="forceCloseModal()">Fechar</button>
                    ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditROPAModal('${id}')">Editar Atividade</button>` : ''}
                </div>
            </div>
        `);
    };

    window.openNewROPAModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Atividade de Tratamento (ROPA)</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Finalidade do Tratamento</label><input class="form-input" id="ropa-purpose" placeholder="Ex: Folha de pagamento"></div>
            <div class="form-group"><label class="form-label">Categorias de Dados</label><input class="form-input" id="ropa-categories" placeholder="Ex: Dados pessoais, financeiros, biometria"></div>
            <div class="form-group"><label class="form-label">Titulares</label><input class="form-input" id="ropa-subjects" placeholder="Ex: Colaboradores, Clientes"></div>
            <div class="form-group"><label class="form-label">Base Legal</label>
                <select class="form-input" id="ropa-basis">
                    <option>Consentimento</option>
                    <option>Execucao contratual</option>
                    <option>Obrigacao legal</option>
                    <option>Interesse legitimo</option>
                    <option>Protecao da vida</option>
                    <option>Tutela da saude</option>
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Retencao</label><input class="form-input" id="ropa-retention" placeholder="Ex: 5 anos"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsavel</label><input class="form-input" id="ropa-owner" placeholder="Ex: DPO"></div>
            </div>
            <div class="form-group"><label class="form-label">Destinatarios / Compartilhamento</label><input class="form-input" id="ropa-recipients" placeholder="Ex: Contabilidade, INSS, Cloud Providers"></div>
            <div class="form-group"><label class="form-label">Salvaguardas de Transferência (Se aplicável)</label><input class="form-input" id="ropa-safeguards" placeholder="Ex: Standard Contractual Clauses (SCCs)"></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="ropa-status">
                    <option>Active</option>
                    <option>Inactive</option>
                </select></div>
            <div style="display:flex;gap:1rem;margin-bottom:1rem">
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-intl"> Transferencia Internacional</label>
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-dpia"> DPIA Requerido</label>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="window.createROPA('${projectId}')">Registrar</button>
        `);
    };

    window.createROPA = async function(projectId) {
        const body = { 
            processing_purpose: document.getElementById('ropa-purpose').value, 
            data_categories: document.getElementById('ropa-categories').value, 
            data_subjects: document.getElementById('ropa-subjects').value, 
            legal_basis: document.getElementById('ropa-basis').value, 
            retention_period: document.getElementById('ropa-retention').value, 
            recipients: document.getElementById('ropa-recipients').value, 
            owner: document.getElementById('ropa-owner').value, 
            transfer_safeguards: document.getElementById('ropa-safeguards').value,
            status: document.getElementById('ropa-status').value,
            international_transfers: document.getElementById('ropa-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-dpia').checked ? 1 : 0 
        };
        if (!body.processing_purpose) return;
        await api('POST', `/api/v1/projects/${projectId}/ropa`, body);
        forceCloseModal(); render();
    };

    window.openEditROPAModal = function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Atividade ROPA</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Finalidade</label><input class="form-input" id="ropa-e-purpose" value="${escapeHTML(r.processing_purpose||'')}"></div>
            <div class="form-group"><label class="form-label">Categorias de Dados</label><input class="form-input" id="ropa-e-categories" value="${escapeHTML(r.data_categories||'')}"></div>
            <div class="form-group"><label class="form-label">Titulares</label><input class="form-input" id="ropa-e-subjects" value="${escapeHTML(r.data_subjects||'')}"></div>
            <div class="form-group"><label class="form-label">Base Legal</label>
                <select class="form-input" id="ropa-e-basis">
                    ${['Consentimento','Execucao contratual','Obrigacao legal','Interesse legitimo','Protecao da vida','Tutela da saude'].map(opt => `<option ${opt===r.legal_basis?'selected':''}>${opt}</option>`).join('')}
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Retencao</label><input class="form-input" id="ropa-e-retention" value="${escapeHTML(r.retention_period||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsavel</label><input class="form-input" id="ropa-e-owner" value="${escapeHTML(r.owner||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Destinatarios / Compartilhamento</label><input class="form-input" id="ropa-e-recipients" value="${escapeHTML(r.recipients||'')}"></div>
            <div class="form-group"><label class="form-label">Salvaguardas de Transferência</label><input class="form-input" id="ropa-e-safeguards" value="${escapeHTML(r.transfer_safeguards||'')}"></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="ropa-e-status">
                    <option ${r.status==='Active'?'selected':''}>Active</option>
                    <option ${r.status==='Inactive'?'selected':''}>Inactive</option>
                </select></div>
            <div style="display:flex;gap:1rem;margin-bottom:1rem">
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-e-intl" ${r.international_transfers?'checked':''}> Transferencia Internacional</label>
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-e-dpia" ${r.dpia_required?'checked':''}> DPIA Requerido</label>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteROPA('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateROPA('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateROPA = async function(id) {
        const body = { 
            processing_purpose: document.getElementById('ropa-e-purpose').value, 
            data_categories: document.getElementById('ropa-e-categories').value, 
            data_subjects: document.getElementById('ropa-e-subjects').value, 
            legal_basis: document.getElementById('ropa-e-basis').value, 
            retention_period: document.getElementById('ropa-e-retention').value, 
            recipients: document.getElementById('ropa-e-recipients').value, 
            owner: document.getElementById('ropa-e-owner').value, 
            transfer_safeguards: document.getElementById('ropa-e-safeguards').value,
            status: document.getElementById('ropa-e-status').value,
            international_transfers: document.getElementById('ropa-e-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-e-dpia').checked ? 1 : 0 
        };
        await api('PUT', `/api/v1/ropa/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteROPA = async function(id) { 
        if (confirm('Excluir registro ROPA?')) { await api('DELETE', `/api/v1/ropa/${id}`); render(); } 
    };

    async function renderDPIA(c, h, a) {
        h.textContent = 'DPIA / RIPD — Relatório de Impacto à Proteção de Dados';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewDPIAModal('${proj.id}')">+ Novo Relatório (DPIA)</button>` : '';
        
        let assessments = [];
        try { assessments = await api('GET', `/api/v1/projects/${proj.id}/dpia`); } catch(e) {}
        if (!Array.isArray(assessments)) assessments = [];
        S.dpia = assessments;

        const totalDPIA = assessments.length;
        const approvedCount = assessments.filter(dp => dp.status === 'Approved').length;
        const reviewCount = assessments.filter(dp => dp.status === 'Under Review').length;
        const draftCount = totalDPIA - (approvedCount + reviewCount);

        const statsHtml = window.renderStatCards([
            { label: 'Total de Relatórios DPIA', value: totalDPIA, color: 'var(--accent)', subtext: 'Avaliações registradas' },
            { label: 'Aprovados', value: approvedCount, color: '#34c759', subtext: 'Risco aceitável / mitigado' },
            { label: 'Em Revisão', value: reviewCount, color: '#ffcc00', subtext: 'Aguardando DPO / CISO' },
            { label: 'Rascunhos / Pendentes', value: draftCount, color: 'var(--text-dim)', subtext: 'Em elaboração' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Sistema / Operação', 'Tipos de Titulares', 'Categorias de Dados', 'Status', 'Ações'],
            assessments.map(dp => {
                const statusType = dp.status === 'Approved' ? 'success' : dp.status === 'Under Review' ? 'warning' : 'info';
                return [
                    `<strong>${escapeHTML(dp.system_name)}</strong>`,
                    escapeHTML(dp.data_subjects_types || 'N/A'),
                    escapeHTML(dp.personal_data_categories || 'N/A'),
                    window.renderStatusBadge(dp.status || 'Draft', statusType),
                    `<button class="btn btn-ghost btn-sm" onclick="window.openDPIADetailsModal('${dp.id}')">Detalhes</button>
                     <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="event.stopPropagation(); window.openDPIAReport('${proj.id}', '${dp.id}')">PDF</button>`
                ];
            }),
            { emptyState: 'Nenhum relatório DPIA / RIPD cadastrado.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openDPIADetailsModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Approved' ? 'var(--success)' : s === 'Under Review' ? '#feca57' : 'var(--muted)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do DPIA / RIPD</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(dp.system_name)}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Descricao do Fluxo de Dados</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.data_flow_description || 'Sem descricao')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Tipos de Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.data_subjects_types || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados Pessoais</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.personal_data_categories || 'N/A')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Necessidade e Proporcionalidade</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.necessity_proportionality || 'Sem justificativa cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Riscos Identificados a Privacidade</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.risks_identified || 'Nenhum risco listado')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Medidas de Mitigacao e Salvaguardas</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.mitigation_measures || 'Nenhuma medida cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Parecer do DPO (Encarregado)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap; font-style:italic">${escapeHTML(dp.dpo_opinion || 'Aguardando parecer formal do DPO')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status do DPIA</div>
                        <span class="ctx-tag" style="color:${statusColor(dp.status)}; border-color:${statusColor(dp.status)}; font-weight:600">${dp.status}</span>
                    </div>
                </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Workflow de Assinatura (DPIA)</h4>
                <div style="display:flex; flex-direction:column; gap:0.75rem">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            ${dp.dpo_signature ? `<span style="color:var(--success)">✓ Aprovado por ${escapeHTML(dp.dpo_signature)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!dp.dpo_signature ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="window.approveDPIA('${projectId}', '${dp.id}', 'ciso')">Assinar</button>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            ${dp.ceo_signature ? `<span style="color:var(--success)">✓ Aprovado por ${escapeHTML(dp.ceo_signature)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!dp.ceo_signature ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="window.approveDPIA('${projectId}', '${dp.id}', 'ceo')">Assinar</button>` : ''}
                    </div>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px">
                <button class="btn btn-secondary" onclick="window.openDPIAReport('${projectId}', '${dp.id}')">Gerar Relatório DPIA</button>
                <div>
                    <button class="btn" onclick="forceCloseModal()">Fechar</button>
                    ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditDPIAModal('${id}')">Editar Relatório</button>` : ''}
                </div>
            </div>
        `);
    };

    window.openNewDPIAModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo DPIA / RIPD</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Sistema / Processo de Dados</label><input class="form-input" id="dpia-system" placeholder="Ex: CRM Salesforce, Sistema de RH Interno"></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo de Dados</label><textarea class="form-input" id="dpia-flow" placeholder="Descreva como os dados entram, circulam e saem do sistema..."></textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-subjects" placeholder="Ex: Clientes, Colaboradores"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-categories" placeholder="Ex: Nome, CPF, E-mail, Cartao"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-necessity" placeholder="Por que estes dados sao estritamente necessarios para a finalidade?"></textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados para a Privacidade</label><textarea class="form-input" id="dpia-risks" placeholder="Ex: Vazamento de dados em transito, acesso nao autorizado..."></textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação e Salvaguardas</label><textarea class="form-input" id="dpia-mitigations" placeholder="Ex: Uso de criptografia TLS/AES-256, MFA ativo, auditorias..."></textarea></div>
            <div class="form-group"><label class="form-label">Parecer DPO (Opcional)</label><textarea class="form-input" id="dpia-opinion" placeholder="Parecer inicial do encarregado..."></textarea></div>
            
            <button class="btn btn-primary" style="width:100%; margin-top:1rem" onclick="window.createDPIA('${projectId}')">Registrar DPIA</button>
        `);
    };

    window.createDPIA = async function(projectId) {
        const body = {
            system_name: document.getElementById('dpia-system').value,
            data_flow_description: document.getElementById('dpia-flow').value,
            data_subjects_types: document.getElementById('dpia-subjects').value,
            personal_data_categories: document.getElementById('dpia-categories').value,
            necessity_proportionality: document.getElementById('dpia-necessity').value,
            risks_identified: document.getElementById('dpia-risks').value,
            mitigation_measures: document.getElementById('dpia-mitigations').value,
            dpo_opinion: document.getElementById('dpia-opinion').value
        };
        if (!body.system_name) return;
        await api('POST', `/api/v1/projects/${projectId}/dpia`, body);
        forceCloseModal(); render();
    };

    window.openEditDPIAModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar DPIA / RIPD</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Sistema</label><input class="form-input" id="dpia-e-system" value="${escapeHTML(dp.system_name||'')}"></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo</label><textarea class="form-input" id="dpia-e-flow">${escapeHTML(dp.data_flow_description||'')}</textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-e-subjects" value="${escapeHTML(dp.data_subjects_types||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-e-categories" value="${escapeHTML(dp.personal_data_categories||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-e-necessity">${escapeHTML(dp.necessity_proportionality||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados</label><textarea class="form-input" id="dpia-e-risks">${escapeHTML(dp.risks_identified||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação</label><textarea class="form-input" id="dpia-e-mitigations">${escapeHTML(dp.mitigation_measures||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Parecer do DPO (Encarregado)</label><textarea class="form-input" id="dpia-e-opinion">${escapeHTML(dp.dpo_opinion||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="dpia-e-status">
                    <option value="Draft" ${dp.status==='Draft'?'selected':''}>Draft</option>
                    <option value="Under Review" ${dp.status==='Under Review'?'selected':''}>Under Review</option>
                    <option value="Approved" ${dp.status==='Approved'?'selected':''}>Approved</option>
                </select></div>

            <div style="display:flex; gap:0.5rem; justify-content:space-between; margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteDPIA('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateDPIA('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateDPIA = async function(id) {
        const body = {
            system_name: document.getElementById('dpia-e-system').value,
            data_flow_description: document.getElementById('dpia-e-flow').value,
            data_subjects_types: document.getElementById('dpia-e-subjects').value,
            personal_data_categories: document.getElementById('dpia-e-categories').value,
            necessity_proportionality: document.getElementById('dpia-e-necessity').value,
            risks_identified: document.getElementById('dpia-e-risks').value,
            mitigation_measures: document.getElementById('dpia-e-mitigations').value,
            dpo_opinion: document.getElementById('dpia-e-opinion').value,
            status: document.getElementById('dpia-e-status').value
        };
        await api('PUT', `/api/v1/dpia/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteDPIA = async function(id) {
        if (confirm('Excluir este DPIA?')) {
            await api('DELETE', `/api/v1/dpia/${id}`);
            forceCloseModal();
            render();
        }
    };


    window.openROPAReport = function(projectId) {
        window.open(`/api/v1/projects/${projectId}/ropa/report?token=${S.token}`, '_blank');
    };

    window.approveROPA = async function(projectId, recordId, role) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/ropa/${recordId}/approve`, { role });
            showToast('ROPA assinado com sucesso!');
            forceCloseModal();
            setTimeout(async () => {
                let records = [];
                try { records = await api('GET', `/api/v1/projects/${projectId}/ropa`); } catch(e) {}
                S.ropa = records;
                window.openROPADetailsModal(recordId);
                render();
            }, 300);
        } catch(e) {
            showToast('Erro ao assinar ROPA: ' + e.message, 'error');
        }
    };

    window.openDPIAReport = function(projectId, id) {
        window.open(`/api/v1/projects/${projectId}/dpia/${id}/report?token=${S.token}`, '_blank');
    };

    window.approveDPIA = async function(projectId, id, role) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/dpia/${id}/approve`, { role });
            showToast('DPIA assinado com sucesso!');
            forceCloseModal();
            setTimeout(async () => {
                let assessments = [];
                try { assessments = await api('GET', `/api/v1/projects/${projectId}/dpia`); } catch(e) {}
                S.dpia = assessments;
                window.openDPIADetailsModal(id);
                render();
            }, 300);
        } catch(e) {
            showToast('Erro ao assinar DPIA: ' + e.message, 'error');
        }
    };

export { renderROPA, renderDPIA };
window.renderROPA = renderROPA;
window.renderDPIA = renderDPIA;
