import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

    async function renderProjects(c, h, a) {
        h.textContent = 'Projetos';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const projects = await api('GET', '/api/v1/projects');
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Setor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.isArray(projects) ? projects.map(p => `
                                <tr>
                                    <td>${escapeHTML(p.client_name)}</td>
                                    <td>${escapeHTML(p.sector)}</td>
                                    <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                                    <td><button class="btn btn-primary" onclick="openProjectDetail('${p.id}')">Gerenciar</button></td>
                                </tr>
                            `).join('') : '<tr><td colspan="4">Nenhum projeto encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar projetos</div>';
        }
    }

    async function openProjectDetail(id) {
        try {
            const p = await api('GET', `/api/v1/projects/${id}`);
            S.activeProject = p;
            S.currentProject = p;
            navigate('project-detail');
        } catch(e) { alert('Erro ao carregar projeto'); }
    }

    async function promoteToProject(id) {
        if (!confirm('Deseja converter este assessment em um projeto ativo?')) return;
        try {
            await api('POST', `/api/v1/assessments/${id}/convert`);
            alert('Projeto criado com sucesso!');
            navigate('projects');
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function renderProjectDetail(c, h, a) {
        const p = S.currentProject || S.activeProject;
        if (!p) { navigate('projects'); return; }
        h.textContent = 'Jornada';
        a.innerHTML = `<button class="btn" style="border-color:var(--accent);color:var(--accent);margin-right:8px" onclick="window.openAuditorNotesModal('${p.id}')">Notas do Auditor</button><button class="btn" onclick="navigate('projects')">&larr; Voltar</button>`;
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            const [phases, config, checklistProgress, governanceMembers] = await Promise.all([
                api('GET', `/api/v1/projects/${p.id}/phases`),
                S.checklistsConfig ? Promise.resolve(S.checklistsConfig) : api('GET', '/api/v1/phases/config'),
                api('GET', `/api/v1/projects/${p.id}/checklist-progress`).catch(() => []),
                api('GET', `/api/v1/projects/${p.id}/governance`).catch(() => [])
            ]);
            
            S.checklistsConfig = config;
            S.currentGovernance = governanceMembers || [];
            // ponytail: hydrate phaseChecks and metadata from D1 (server wins over stale localStorage)
            if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
            if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
            if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
            if (!S.phaseChecksEvidence) S.phaseChecksEvidence = {};
            if (!S.phaseChecksStatus) S.phaseChecksStatus = {};
            if (!S.phaseChecksEvaluationNotes) S.phaseChecksEvaluationNotes = {};
            if (Array.isArray(checklistProgress)) {
                checklistProgress.forEach(row => {
                    S.phaseChecks[p.id + '_' + row.item_id] = !!row.is_checked;
                    S.phaseChecksNotes[p.id + '_' + row.item_id] = row.notes || '';
                    S.phaseChecksAssigned[p.id + '_' + row.item_id] = row.assigned_to || '';
                    S.phaseChecksDueDate[p.id + '_' + row.item_id] = row.due_date || '';
                    S.phaseChecksEvidence[p.id + '_' + row.item_id] = row.evidence_id || '';
                    S.phaseChecksStatus[p.id + '_' + row.item_id] = row.evaluation_status || '';
                    S.phaseChecksEvaluationNotes[p.id + '_' + row.item_id] = row.evaluation_notes || '';
                });
                localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
                localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
                localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
                localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
            }
            
            const JOURNEYS = [
                { name: "Jornada 1: Mobilização e Diagnóstico", range: [0, 6], desc: "Planejamento inicial, entrevistas, escopo e diagnóstico GRC" },
                { name: "Jornada 2: Mapeamento e Riscos", range: [7, 13], desc: "Ativos, processos, riscos de segurança/privacidade e SoA" },
                { name: "Jornada 3: Implementação SGSI (ISO 27001)", range: [14, 20], desc: "Desenho da arquitetura documental e implementação de controles práticos" },
                { name: "Jornada 4: Implementação SGPI (ISO 27701)", range: [21, 28], desc: "Implementação prática do programa de privacidade e direitos de titulares" },
                { name: "Jornada 5: Operação e Auditoria", range: [29, 33], desc: "Treinamentos, métricas operacionais, auditoria interna e revisão pela direção" },
                { name: "Jornada 6: Certificação Oficial", range: [34, 40], desc: "Melhorias contínuas, auditorias de certificação estágio 1 e 2" }
            ];

            const allPhases = Array.isArray(phases) ? phases : [];
            const totalPhasesCount = allPhases.length;
            const completedPhasesCount = allPhases.filter(ph => ph.status === 'completed').length;
            const blockedPhasesCount = allPhases.filter(ph => ph.status === 'blocked').length;
            const overallPercent = totalPhasesCount > 0 ? Math.round((completedPhasesCount / totalPhasesCount) * 100) : 0;

            const statusFilter = S.jornadaStatusFilter || 'all';
            const categoryFilter = S.jornadaCategoryFilter || 'all';
            const searchQuery = (S.jornadaSearchQuery || '').toLowerCase().trim();

            const metricsHtml = `
                <div class="stat-card" style="margin-bottom:1.5rem; padding:16px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
                        <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.02)">
                            <div style="font-size:0.65rem; color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">Progresso Geral</div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="font-size:1.5rem; font-weight:700; color:var(--text)">${overallPercent}%</div>
                                <div class="progress-bar" style="flex:1; height:8px;">
                                    <div class="progress-fill" style="width: ${overallPercent}%"></div>
                                </div>
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px">${completedPhasesCount} de ${totalPhasesCount} Fases Concluídas</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.02)">
                            <div style="font-size:0.65rem; color:${blockedPhasesCount > 0 ? 'var(--danger)' : 'var(--text-dim)'}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">Impedimentos / Bloqueios</div>
                            <div style="font-size:1.5rem; font-weight:700; color:${blockedPhasesCount > 0 ? 'var(--danger)' : 'var(--text)'}">${blockedPhasesCount}</div>
                            <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px">Fases necessitando de intervenção</div>
                        </div>
                    </div>
                </div>
            `;

            const filtersHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:1.5rem; background:rgba(255,255,255,0.01); padding:10px 16px; border:1px solid var(--border); border-radius:12px; backdrop-filter: var(--glass-blur);">
                    <div style="position:relative; flex:1;">
                        <input type="text" class="form-input" style="width:100%; padding-left:2.25rem; font-size:0.8rem; height:38px; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" placeholder="Buscar fase ou atividade..." value="${escapeHTML(S.jornadaSearchQuery || '')}" oninput="S.jornadaSearchQuery = this.value; render();">
                        <svg viewBox="0 0 24 24" style="position:absolute; left:10px; top:10px; width:18px; height:18px; stroke:var(--text-dim); stroke-width:2; fill:none; pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px;">Status</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" onchange="S.jornadaStatusFilter = this.value; render();">
                                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Todos</option>
                                <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="in_progress" ${statusFilter === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="completed" ${statusFilter === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="blocked" ${statusFilter === 'blocked' ? 'selected' : ''}>Blocked</option>
                                <option value="skipped" ${statusFilter === 'skipped' ? 'selected' : ''}>Skipped</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px;">Categoria</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" onchange="S.jornadaCategoryFilter = this.value; render();">
                                <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>Todas</option>
                                <option value="task" ${categoryFilter === 'task' ? 'selected' : ''}>Task</option>
                                <option value="document" ${categoryFilter === 'document' ? 'selected' : ''}>Document</option>
                                <option value="evidence" ${categoryFilter === 'evidence' ? 'selected' : ''}>Evidence</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;

            let journeysHtml = '';
            
            JOURNEYS.forEach((j, jIdx) => {
                const jPhases = Array.isArray(phases) ? phases.filter(ph => ph.phase_number >= j.range[0] && ph.phase_number <= j.range[1]) : [];
                
                // Filter phases inside this journey
                let filteredPhases = jPhases.filter(ph => {
                    if (statusFilter !== 'all' && ph.status !== statusFilter) return false;
                    const phChecklist = S.checklistsConfig[ph.phase_number] || [];
                    const matchingItems = phChecklist.filter(item => {
                        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                        if (searchQuery) {
                            return item.text.toLowerCase().includes(searchQuery);
                        }
                        return true;
                    });
                    if (searchQuery) {
                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                        if (phaseTitleMatch) return true;
                        return matchingItems.length > 0;
                    }
                    if (categoryFilter !== 'all') {
                        return matchingItems.length > 0;
                    }
                    return true;
                });

                if (filteredPhases.length === 0 && (searchQuery || statusFilter !== 'all' || categoryFilter !== 'all')) {
                    return;
                }

                const completedCount = jPhases.filter(ph => ph.status === 'completed').length;
                const totalCount = jPhases.length;
                const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                const isJExpanded = S.expandedJourneys[jIdx] === true;
                const isJ2 = jIdx === 1;
                
                journeysHtml += `
                    <div class="journey-card fade-in">
                        <div class="journey-header" onclick="toggleJourney(${jIdx})">
                            <div class="journey-title-container">
                                <div class="journey-title">${escapeHTML(j.name)}</div>
                                <div class="journey-meta">${escapeHTML(j.desc)}</div>
                            </div>
                            <div class="journey-prog-wrapper">
                                <div class="journey-meta">${completedCount}/${totalCount} Fases</div>
                                <div class="progress-bar" style="flex:1; max-width: 120px">
                                    <div class="progress-fill" style="width: ${percent}%"></div>
                                </div>
                                <div class="journey-meta" style="font-weight:500; min-width:35px">${percent}%</div>
                            </div>
                            <button class="btn-inline-action" style="margin-right:15px; border-color:var(--accent); color:var(--accent); font-weight:600;" onclick="openJornadaQuestionnaire(${jIdx}, '${p.id}'); event.stopPropagation();">📋 Diagnóstico J${jIdx + 1}</button>
                            <div class="journey-toggle-icon ${isJExpanded ? 'expanded' : ''}">&darr;</div>
                        </div>
                        <div class="journey-content ${isJExpanded ? 'expanded' : ''}" id="j-content-${jIdx}">
                            ${window.renderJourneyDiagnosticPanel(jIdx, p.id)}
                            ${filteredPhases.map(ph => {
                                const isPhExpanded = S.expandedPhases[ph.phase_number] === true;
                                const phChecklist = S.checklistsConfig[ph.phase_number] || [];
                                const filteredItems = phChecklist.filter(item => {
                                    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                                    if (searchQuery) {
                                        const matchText = item.text.toLowerCase().includes(searchQuery);
                                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                                        return matchText || phaseTitleMatch;
                                    }
                                    return true;
                                });
                                
                                return `
                                    <div class="phase-card">
                                        <div class="phase-card-header" onclick="togglePhase(${ph.phase_number})">
                                            <div class="phase-card-title">
                                                <div class="phase-num">${ph.phase_number}</div>
                                                <div class="title-text">${escapeHTML(ph.title)}</div>
                                            </div>
                                            <div class="phase-actions-wrapper" onclick="event.stopPropagation()">
                                                <select class="phase-status-select" onchange="changePhaseStatus('${p.id}', ${ph.phase_number}, this)">
                                                    <option value="pending" ${ph.status === 'pending' ? 'selected' : ''}>Pending</option>
                                                    <option value="in_progress" ${ph.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                                    <option value="completed" ${ph.status === 'completed' ? 'selected' : ''}>Completed</option>
                                                    <option value="blocked" ${ph.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                                                    <option value="skipped" ${ph.status === 'skipped' ? 'selected' : ''}>Skipped</option>
                                                </select>
                                                <div class="phase-toggle-icon ${isPhExpanded ? 'expanded' : ''}" onclick="togglePhase(${ph.phase_number}); event.stopPropagation()">&darr;</div>
                                            </div>
                                        </div>
                                        <div class="phase-details ${isPhExpanded ? 'expanded' : ''}" id="p-details-${ph.phase_number}">
                                            ${ph.notes ? `
                                                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem; padding:0.5rem; background:rgba(255,255,255,0.02); border-left:2px solid var(--accent); border-radius:4px">
                                                    <strong>Notas:</strong> ${escapeHTML(ph.notes)}
                                                </div>
                                            ` : ''}
                                            
                                            ${(window.PHASE_PLAYBOOKS && window.PHASE_PLAYBOOKS[ph.phase_number]) ? `
                                                <div class="playbook-card" style="margin-bottom:1.25rem; padding:12px; background:rgba(0,173,232,0.04); border-left:3px solid var(--accent); border-radius:10px; font-size:0.75rem">
                                                    <div style="font-weight:600; color:var(--accent); margin-bottom:4px; font-family:'Montserrat',sans-serif; text-transform:uppercase; letter-spacing:0.5px; font-size:0.7rem">Diretriz do Consultor: ${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].obj)}</div>
                                                    <div style="color:var(--text); line-height:1.4">${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].guideline)}</div>
                                                </div>
                                            ` : ''}
                                            
                                            <div class="checklist-title">Checklist de Conformidade (${phChecklist.length} itens)</div>
                                            ${filteredItems.length > 0 ? `
                                                <div class="checklist-list">
                                                    ${filteredItems.map(item => {
                                                        const checkKey = `${p.id}_${item.id}`;
                                                        const isChecked = S.phaseChecks[checkKey] === true;
                                                        const itemNotes = (S.phaseChecksNotes && S.phaseChecksNotes[checkKey]) || '';
                                                        const itemAssigned = (S.phaseChecksAssigned && S.phaseChecksAssigned[checkKey]) || '';
                                                        const itemDueDate = (S.phaseChecksDueDate && S.phaseChecksDueDate[checkKey]) || '';
                                                        const itemEvidenceId = (S.phaseChecksEvidence && S.phaseChecksEvidence[checkKey]) || '';
                                                        const itemStatus = (S.phaseChecksStatus && S.phaseChecksStatus[checkKey]) || '';
                                                        const itemEvalNotes = (S.phaseChecksEvaluationNotes && S.phaseChecksEvaluationNotes[checkKey]) || '';
                                                        const isDetailsExpanded = S.expandedChecklistDetails && S.expandedChecklistDetails[item.id] === true;
                                                        
                                                        const hasTip = !!ISO_GUIDELINES[item.id];
                                                        const isTipExpanded = S.expandedTips && S.expandedTips[item.id] === true;
                                                        const tipInfo = ISO_GUIDELINES[item.id];

                                                        let badgeHtml = '';
                                                        if (isChecked && itemEvidenceId) {
                                                            let statusColor = 'var(--text-dim)';
                                                            let statusLabel = 'Pendente [AI]';
                                                            if (itemStatus === 'conforme') {
                                                                statusColor = '#00ade8';
                                                                statusLabel = 'Conforme [AI]';
                                                            } else if (itemStatus === 'parcial') {
                                                                statusColor = '#ffc107';
                                                                statusLabel = 'Aviso [AI]';
                                                            } else if (itemStatus === 'nao conforme') {
                                                                statusColor = '#ff4d4d';
                                                                statusLabel = 'Falha [AI]';
                                                            }
                                                            badgeHtml = `<span style="font-size:0.6rem; padding:2px 6px; border-radius:4px; border:1px solid ${statusColor}; color:${statusColor}; margin-left:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${statusLabel}</span>`;
                                                        }

                                                        let borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                                                        if (isChecked) {
                                                            borderLeftColor = 'var(--success)';
                                                            if (itemStatus && itemStatus !== 'conforme') {
                                                                borderLeftColor = 'var(--danger)';
                                                            }
                                                        }

                                                        return `
                                                            <div class="checklist-item-wrapper" style="margin-bottom: 0.75rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border); border-left: 3px solid ${borderLeftColor}; border-radius: 10px; padding: 0.75rem;">
                                                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                                                                    <div class="checklist-left" style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                                                                        <input type="checkbox" class="checklist-item-checkbox" 
                                                                            ${isChecked ? 'checked' : ''} 
                                                                            onclick="toggleChecklistItem('${p.id}', '${item.id}', this)"
                                                                            ${(!isChecked && item.id === 'p2_2') ? 'disabled' : ''}>
                                                                        <span class="badge-cat ${item.category}">${item.category}</span>
                                                                        <span class="checklist-text ${isChecked ? 'checked' : ''}">${escapeHTML(item.text)}</span>
                                                                        ${badgeHtml}
                                                                        ${hasTip ? `
                                                                            <button class="btn-ghost" onclick="toggleAuditorTip('${item.id}'); event.stopPropagation()" style="font-size:0.85rem; padding:2px 6px; color:var(--accent); line-height:1; display:inline-flex; align-items:center; justify-content:center;" title="Ver dica do auditor">💡</button>
                                                                        ` : ''}
                                                                    </div>
                                                                    <div class="checklist-actions" style="display: flex; align-items: center; gap: 0.5rem;">
                                                                        ${itemEvidenceId ? `
                                                                            <button class="btn-inline-action" style="border-color:var(--accent); color:var(--accent);" onclick="openInternalDocumentEditor('${itemEvidenceId}'); event.stopPropagation()">Editar Doc</button>
                                                                        ` : ''}
                                                                        ${(item.category === 'evidence' || item.category === 'document') ? `
                                                                            <button class="btn-inline-action" onclick="wsUploadEvidence('${item.id}')">Upload</button>
                                                                        ` : ''}
                                                                        ${(!isChecked && (item.category === 'document' || DOC_WIZARDS[item.id])) ? `
                                                                            <button class="btn-inline-action primary" onclick="openDocWizard('${p.id}', '${item.id}'); event.stopPropagation()">${DOC_WIZARDS[item.id] ? (DOC_WIZARDS[item.id].evidenceOnly ? 'Registrar Evidência' : 'Preencher e Gerar') : 'Gerar IA'}</button>
                                                                        ` : ''}
                                                                        ${(item.id === 'p2_2') ? `
                                                                            <button class="btn-inline-action primary" onclick="openInterviewWizard('${p.id}'); event.stopPropagation()">${isChecked ? 'Ver Entrevistas' : 'Conduzir Entrevistas'}</button>
                                                                        ` : ''}
                                                                        <button class="btn-ghost" onclick="toggleChecklistDetails('${item.id}'); event.stopPropagation()" style="font-size:0.75rem; color:${isDetailsExpanded ? 'var(--accent)' : 'var(--text-dim)'}; padding:4px 6px; display:inline-flex; align-items:center;" title="Editar detalhes, responsável e prazo">⚙️</button>
                                                                    </div>
                                                                </div>
                                                                ${(hasTip && isTipExpanded) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(0,173,232,0.03); border:1px solid rgba(0,173,232,0.1); border-radius:8px; padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div style="color:var(--accent); font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.6rem; letter-spacing:0.5px;">💡 Auditoria (${tipInfo.control}) - ${tipInfo.tip}</div>
                                                                        <div style="color:var(--text); margin-bottom:6px;"><strong style="color:var(--text-dim);">Dica:</strong> ${escapeHTML(tipInfo.advice)}</div>
                                                                        <div style="color:var(--text-dim);"><strong style="color:var(--text-dim);">Evidência Recomendada:</strong> ${escapeHTML(tipInfo.evidence)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${(isChecked && itemStatus && itemStatus !== 'conforme' && itemEvalNotes) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(255,77,77,0.03); border:1px solid rgba(255,77,77,0.15); border-radius:8px; padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div style="color:#ff4d4d; font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.6rem; letter-spacing:0.5px;">⚠️ Gaps Identificados [AI]</div>
                                                                        <div style="color:var(--text);">${escapeHTML(itemEvalNotes)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${isDetailsExpanded ? `
                                                                    <div class="checklist-notes-group" style="margin-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 0.5rem;">
                                                                        <div style="font-size: 0.65rem; color: var(--text-dim); margin-bottom: 0.25rem;">Anotação / Conteúdo da Atividade</div>
                                                                        ${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? formatActivityNotes(itemNotes) : ''}
                                                                        <textarea class="form-input" 
                                                                            placeholder="Digite aqui para registrar informações (Ex: nome do sponsor executivo, link do documento, etc.)"
                                                                            style="width: 100%; height: 50px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; color: var(--text); font-size: 0.7rem; font-family: inherit; resize: vertical; margin-bottom: 0.5rem;"
                                                                            onblur="saveChecklistItemNotes('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? '' : escapeHTML(itemNotes)}</textarea>
                                                                        
                                                                        <div style="display: flex; gap: 12px; align-items: center;">
                                                                            <div style="flex: 1;">
                                                                                <div style="font-size: 0.6rem; color: var(--text-dim); margin-bottom: 0.25rem;">Responsável</div>
                                                                                <select class="form-input" style="width: 100%; font-size: 0.7rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 4px 8px; color: var(--text);"
                                                                                    onchange="saveChecklistItemAssigned('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">
                                            ${window.renderGovernanceSelectOptions(S.currentGovernance, itemAssigned)}
                                            </select>
                                                                            </div>
                                                                            <div style="width: 150px;">
                                                                                <div style="font-size: 0.6rem; color: var(--text-dim); margin-bottom: 0.25rem;">Prazo</div>
                                                                                <input type="date" class="form-input" style="width: 100%; font-size: 0.7rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 3px 8px; color: var(--text);"
                                                                                    value="${itemDueDate}"
                                                                                    onchange="saveChecklistItemDueDate('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ` : ''}
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            ` : '<div style="font-size:0.75rem;color:var(--text-dim)">Nenhum item de checklist para esta fase.</div>'}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });
            
            c.innerHTML = `
                <div style="margin-top: 0.5rem;">
                    ${metricsHtml}
                    ${filtersHtml}
                    ${journeysHtml || '<div class="empty-state"><h3>Nenhuma fase correspondente aos filtros</h3></div>'}
                </div>
            `;
            if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        } catch (e) {
            c.innerHTML = `<div class="error">Erro ao carregar fases do projeto: ${e.message}</div>`;
        }
    }

    window.changeActiveProject = async function(projectId) {
        if (!projectId) {
            S.activeProject = null;
            S.currentProject = null;
            localStorage.removeItem('niso_activeProject');
            updateActiveProjectWidget();
            navigate('dashboard');
            return;
        }
        try {
            const p = S.projects.find(proj => proj.id === projectId) || await api('GET', `/api/v1/projects/${projectId}`);
            S.activeProject = p;
            S.currentProject = p;
            localStorage.setItem('niso_activeProject', JSON.stringify(p));
            updateActiveProjectWidget();
            navigate(S.view === 'projects' || S.view === 'project-detail' ? 'certification' : (S.view || 'dashboard'));
        } catch(e) {
            showToast('Erro ao mudar de projeto', 'error');
        }
    };

    window.openDocWizard = function(projectId, itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) { generateDocumentNatively(projectId, itemId, event.target); return; }

        // Pre-fill from existing notes if available
        const noteKey = projectId + '_' + itemId;
        let savedAnswers = {};
        try {
            const raw = (S.phaseChecksNotes && S.phaseChecksNotes[noteKey]) || '';
            if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) savedAnswers = JSON.parse(raw);
        } catch(e) {}

        let fieldsHtml = wiz.fields.map(f => {
            const val = savedAnswers[f.id] || '';
            const escapedVal = typeof val === 'string' ? val.replace(/"/g, '&quot;').replace(/</g, '&lt;') : val;
            const req = f.required ? '<span style="color:#ff4d4d">*</span>' : '';
            let input = '';
            if (f.type === 'textarea') {
                input = `<textarea id="wiz-${f.id}" class="form-input" style="width:100%; min-height:80px; font-size:0.8rem; resize:vertical; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text); font-family:inherit;" placeholder="${f.placeholder || ''}">${escapedVal}</textarea>`;
            } else if (f.type === 'select') {
                const opts = (f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
                input = `<select id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);"><option value="">Selecionar...</option>${opts}</select>`;
            } else if (f.type === 'date') {
                input = `<input type="date" id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);" value="${escapedVal}">`;
            } else {
                input = `<input type="text" id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);" value="${escapedVal}" placeholder="${f.placeholder || ''}">`;
            }
            return `<div style="margin-bottom:1rem;"><label style="font-size:0.75rem; color:var(--text-dim); font-weight:500; display:block; margin-bottom:4px;">${f.label} ${req}</label>${input}</div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${escapeHTML(wiz.title)}</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding:1.5rem 0;">
                <div style="background:rgba(0,173,232,0.04); border:1px solid rgba(0,173,232,0.1); border-radius:10px; padding:12px; margin-bottom:1.25rem; font-size:0.75rem;">
                    <div style="color:var(--accent); font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.65rem; letter-spacing:0.5px;">Dica do Auditor (${wiz.isoRef})</div>
                    <div style="color:var(--text); line-height:1.4;">${escapeHTML(wiz.auditorTip)}</div>
                </div>
                <div id="wiz-form-fields">${fieldsHtml}</div>
                <div id="wiz-preview-area" style="display:none;"></div>
                <div id="wiz-actions" style="display:flex; justify-content:flex-end; gap:10px; margin-top:1.25rem;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn" onclick="wizSaveProgress('${projectId}', '${itemId}')" style="border-color:var(--accent); color:var(--accent);">Salvar Rascunho</button>
                    <button class="btn btn-primary" id="wiz-generate-btn" onclick="wizGenerate('${projectId}', '${itemId}', this)">Gerar Documento</button>
                </div>
            </div>
        `, 'modal-large');
    };

    window.wizCollectFields = function(itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) return {};
        const data = {};
        wiz.fields.forEach(f => {
            const el = document.getElementById('wiz-' + f.id);
            if (el) data[f.id] = el.value || '';
        });
        return data;
    };

    window.wizSaveProgress = function(projectId, itemId) {
        const data = wizCollectFields(itemId);
        const noteKey = projectId + '_' + itemId;
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[noteKey] = JSON.stringify(data);
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        showToast('Rascunho salvo localmente');
    };

    window.wizGenerate = async function(projectId, itemId, btnEl) {
        const wiz = DOC_WIZARDS[itemId];
        const data = wizCollectFields(itemId);
        // Validate required fields
        const missing = wiz.fields.filter(f => f.required && !data[f.id]);
        if (missing.length > 0) {
            showToast('Preencha os campos obrigatórios: ' + missing.map(f => f.label).join(', '), 'error');
            return;
        }
        // Save progress first
        wizSaveProgress(projectId, itemId);
        const prevText = btnEl.textContent;
        btnEl.disabled = true;

        // ponytail: evidenceOnly items generate document locally without AI
        if (wiz.evidenceOnly) {
            btnEl.textContent = 'Gerando registro...';
            let content = '# ' + wiz.title + '\n\n';
            content += '**Referência ISO:** ' + wiz.isoRef + '\n';
            content += '**Data de registro:** ' + new Date().toLocaleDateString('pt-BR') + '\n\n';
            content += '---\n\n';
            wiz.fields.forEach(f => {
                if (data[f.id]) content += '## ' + f.label + '\n' + data[f.id] + '\n\n';
            });
            if (wiz.auditorTip) content += '---\n\n> **Nota do Auditor:** ' + wiz.auditorTip + '\n';
            if (wiz.linkedTo) content += '\n> **Vinculado a:** ' + wiz.linkedTo + '\n';
            // Show preview directly
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="margin-bottom:0.75rem; font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Preview do Registro de Evidência</div>
                <textarea id="wiz-doc-content" class="form-input" style="width:100%; height:350px; font-family:monospace; font-size:0.8rem; line-height:1.5; background:rgba(0,0,0,0.3); resize:vertical; padding:12px; color:var(--text); border:1px solid var(--border); border-radius:8px;">${escapeHTML(content)}</textarea>
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn" onclick="wizBackToForm('${projectId}', '${itemId}')" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Voltar e Editar</button>
                <button class="btn btn-primary" onclick="wizApprove('${projectId}', '${itemId}', this)">Confirmar e Registrar Evidência</button>
            `;
            btnEl.disabled = false;
            btnEl.textContent = prevText;
            return;
        }

        btnEl.textContent = 'Gerando documento...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-document`, { itemId, fields: data });
            // Show preview
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="margin-bottom:0.75rem; font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Preview do Documento Gerado</div>
                <textarea id="wiz-doc-content" class="form-input" style="width:100%; height:350px; font-family:monospace; font-size:0.8rem; line-height:1.5; background:rgba(0,0,0,0.3); resize:vertical; padding:12px; color:var(--text); border:1px solid var(--border); border-radius:8px;">${escapeHTML(res.content || '')}</textarea>
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn" onclick="wizBackToForm('${projectId}', '${itemId}')" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Voltar e Editar Dados</button>
                <button class="btn btn-primary" onclick="wizApprove('${projectId}', '${itemId}', this)">Aprovar e Salvar como Evidencia</button>
            `;
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.wizBackToForm = function(projectId, itemId) {
        document.getElementById('wiz-form-fields').style.display = 'block';
        document.getElementById('wiz-preview-area').style.display = 'none';
        document.getElementById('wiz-actions').innerHTML = `
            <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
            <button class="btn" onclick="wizSaveProgress('${projectId}', '${itemId}')" style="border-color:var(--accent); color:var(--accent);">Salvar Rascunho</button>
            <button class="btn btn-primary" id="wiz-generate-btn" onclick="wizGenerate('${projectId}', '${itemId}', this)">Gerar Documento</button>
        `;
    };

    window.wizApprove = async function(projectId, itemId, btnEl) {
        const content = document.getElementById('wiz-doc-content').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('POST', `/api/v1/projects/${projectId}/approve-document`, { itemId, content });
            showToast('Documento aprovado e salvo como evidência!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao aprovar: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.openInterviewWizard = function(projectId) {
        const tracks = [
            { id: 'executiva', name: 'Executiva' },
            { id: 'tecnologia', name: 'Tecnologia' },
            { id: 'juridico', name: 'Jurídico' },
            { id: 'rh', name: 'Recursos Humanos' },
            { id: 'operacoes', name: 'Operações' }
        ];

        // Ensure track progress state initialized
        if (!S.interviewProgress) S.interviewProgress = {};

        const sidebarHtml = tracks.map(t => {
            const isDone = S.interviewProgress[projectId + '_' + t.id];
            const check = isDone ? '<span style="color:var(--success); font-weight:bold; margin-right:4px;">✓</span>' : '';
            return `<div class="wizard-sidebar-item" id="track-tab-${t.id}" onclick="changeInterviewTrack('${projectId}', '${t.id}')" style="padding: 10px 12px; font-size: 0.8rem; border-radius: 8px; cursor: pointer; color: var(--text-dim); transition: all 0.2s; border-left: 3px solid transparent; display: flex; align-items: center; justify-content: space-between;">
                <span>${check}${t.name}</span>
            </div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Conduzir Entrevistas por Trilha (Mapeamento Inicial)</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding: 1.25rem 0; display: flex; gap: 20px; min-height: 480px;">
                <div style="width: 200px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid var(--border); padding-right: 12px;">
                    <div style="font-size: 0.65rem; color: var(--accent); font-weight: 700; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Trilhas de Auditoria</div>
                    ${sidebarHtml}
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-left: 8px;">
                    <div id="interview-questions-container" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                        <div class="empty-state">
                            <h3>Selecione uma Trilha</h3>
                            <p>Escolha uma trilha na barra lateral para iniciar a entrevista.</p>
                        </div>
                    </div>
                    <div id="interview-actions-container" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem;">
                        <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Fechar</button>
                        <div id="interview-buttons-right" style="display: flex; gap: 10px;"></div>
                    </div>
                </div>
            </div>
        `, 'modal-large');

        // Automatically load first track
        changeInterviewTrack(projectId, 'executiva');
    };

    window.changeInterviewTrack = async function(projectId, track) {
        // Highlight active tab
        document.querySelectorAll('.wizard-sidebar-item').forEach(el => {
            el.style.background = 'none';
            el.style.color = 'var(--text-dim)';
            el.style.borderLeftColor = 'transparent';
        });
        const tabEl = document.getElementById('track-tab-' + track);
        if (tabEl) {
            tabEl.style.background = 'rgba(0,173,232,0.05)';
            tabEl.style.color = 'var(--text)';
            tabEl.style.borderLeftColor = 'var(--accent)';
        }

        const container = document.getElementById('interview-questions-container');
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-dim);">Carregando perguntas...</div>';
        document.getElementById('interview-buttons-right').innerHTML = '';

        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/interviews/${track}`);
            const qs = res.questions || [];

            if (qs.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>Sem perguntas</h3><p>Nenhuma pergunta cadastrada para esta trilha.</p></div>';
                return;
            }

            // Save active track questions metadata globally in S
            S.activeInterviewTrackQuestions = qs;

            container.innerHTML = qs.map((q, idx) => {
                const ans = q.answer || '';
                const who = q.interviewee || '';
                const gap = q.gap_detected === 1;

                return `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 10px; padding: 1.25rem; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); margin-bottom: 12px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text); line-height: 1.4;">
                            ${idx + 1}. ${escapeHTML(q.question)}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
                            <label style="font-size: 0.65rem; color: var(--text-dim); font-weight: 500;">Resposta / Constatação do Auditor</label>
                            <textarea id="ans-${q.key}" class="form-input" style="width: 100%; min-height: 70px; font-size: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); resize: vertical; font-family: inherit;" placeholder="Registre a resposta ou evidências coletadas...">${escapeHTML(ans)}</textarea>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center; margin-top: 4px;">
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                <label style="font-size: 0.65rem; color: var(--text-dim); font-weight: 500;">Entrevistado (Nome / Cargo)</label>
                                <input type="text" id="who-${q.key}" class="form-input" style="font-size: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; color: var(--text);" value="${escapeHTML(who)}" placeholder="Ex: João CISO, Maria DevOps">
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; padding-top: 16px;">
                                <input type="checkbox" id="gap-${q.key}" ${gap ? 'checked' : ''} style="cursor: pointer;">
                                <label for="gap-${q.key}" style="font-size: 0.75rem; color: #ff4d4d; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    ⚠️ Lacuna Detectada
                                </label>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Load buttons
            const tracksList = ['executiva', 'tecnologia', 'juridico', 'rh', 'operacoes'];
            const allSaved = tracksList.every(tId => S.interviewProgress[projectId + '_' + tId]);

            let rightButtons = `<button class="btn btn-primary" onclick="saveInterviewTrack('${projectId}', '${track}', this)">Salvar Trilha</button>`;
            if (allSaved) {
                rightButtons += `<button class="btn btn-primary" onclick="completeInterviewsTask('${projectId}', this)" style="background: var(--success); border-color: var(--success)">Concluir e Registrar</button>`;
            }

            document.getElementById('interview-buttons-right').innerHTML = rightButtons;

        } catch (e) {
            container.innerHTML = `<div style="color:#ff4d4d; text-align:center; padding:3rem;">Erro ao carregar perguntas: ${escapeHTML(e.message)}</div>`;
        }
    };

    window.saveInterviewTrack = async function(projectId, track, btnEl) {
        const qs = S.activeInterviewTrackQuestions || [];
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';

        try {
            // Post each question-answer sequentially
            for (const q of qs) {
                const answer = document.getElementById('ans-' + q.key).value.trim();
                const interviewee = document.getElementById('who-' + q.key).value.trim();
                const gap_detected = document.getElementById('gap-' + q.key).checked ? 1 : 0;

                if (answer) {
                    await api('POST', `/api/v1/projects/${projectId}/interviews`, {
                        track,
                        question: q.question,
                        answer,
                        interviewee,
                        gap_detected
                    });
                }
            }

            showToast(`Trilha '${track.toUpperCase()}' salva com sucesso!`);
            
            // Mark progress
            S.interviewProgress[projectId + '_' + track] = true;
            localStorage.setItem('niso_interviewProgress', JSON.stringify(S.interviewProgress));

            // Reload wizard modal to update tabs checkmarks and complete buttons
            openInterviewWizard(projectId);
            changeInterviewTrack(projectId, track);

        } catch (e) {
            showToast('Erro ao salvar respostas: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.completeInterviewsTask = async function(projectId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Concluindo...';

        try {
            const checkKey = `${projectId}_p2_2`;
            S.phaseChecks[checkKey] = true;
            localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));

            await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, {
                items: [{
                    phase_number: 2,
                    item_id: 'p2_2',
                    is_checked: true,
                    notes: 'Entrevistas por trilha (Executiva, Tecnologia, Jurídico, RH, Operações) concluídas e registradas.',
                    assigned_to: S.user ? S.user.id : null,
                    due_date: null
                }]
            });

            showToast('Entrevistas por trilha concluídas e checklist atualizado!');
            forceCloseModal();
            render();
        } catch (e) {
            showToast('Erro ao concluir tarefa: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.toggleAuditorTip = function(itemId) {
        if (!S.expandedTips) S.expandedTips = {};
        S.expandedTips[itemId] = !S.expandedTips[itemId];
        render();
    };

    window.formatActivityNotes = function(notes) {
        if (!notes) return '';
        const trimmed = notes.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const obj = JSON.parse(trimmed);
                const parts = [];
                for (const [key, val] of Object.entries(obj)) {
                    let label = key;
                    if (key === 'engagement') label = 'Engajamento';
                    else if (key === 'trustScore') label = 'Confiança';
                    else if (key === 'sub_id') label = 'ID Cliente';
                    else if (key === 'timeline') label = 'Prazo';
                    else if (key === 'main_risk') label = 'Risco Principal';
                    
                    parts.push(`<span style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px; margin-right:4px;"><strong>${label}</strong>: ${val}</span>`);
                }
                return `<div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.7rem; color:var(--text-dim); margin-bottom:8px;">${parts.join('')}</div>`;
            } catch (e) {}
        }
        return '';
    };

    window.toggleChecklistDetails = function(itemId) {
        if (!S.expandedChecklistDetails) S.expandedChecklistDetails = {};
        S.expandedChecklistDetails[itemId] = !S.expandedChecklistDetails[itemId];
        render();
    };

    window.openJornadaQuestionnaire = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const config = JORNADA_QUESTIONS[jIdx];
        if (!config) return;
        const answersKey = projectId + '_j' + jIdx;
        const currentAnswers = S.jornadaAnswers[answersKey] || {};

        let questionsHtml = '';
        config.questions.forEach(q => {
            let optionsHtml = '';
            q.options.forEach(opt => {
                optionsHtml += `<option value="${opt.val}" ${currentAnswers[q.key] === opt.val ? 'selected' : ''}>${opt.text}</option>`;
            });
            questionsHtml += `
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">${q.label}</label>
                    <select id="q-${q.key}" class="form-input" style="width:100%;">
                        ${optionsHtml}
                    </select>
                </div>
            `;
        });

        openModal(`
            <div class="modal-header">
                <span class="modal-title">📋 ${config.title}</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding:1.5rem 0; text-align:left;">
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1.5rem;">
                    ${config.desc}
                </p>
                ${questionsHtml}
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn btn-primary" onclick="saveJornadaQuestionnaire(${jIdx}, '${projectId}')">Salvar Questionário</button>
                </div>
            </div>
        `);
    };

    window.saveJornadaQuestionnaire = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const config = JORNADA_QUESTIONS[jIdx];
        if (!config) return;
        const answersKey = projectId + '_j' + jIdx;
        const answers = {};
        config.questions.forEach(q => {
            answers[q.key] = document.getElementById(`q-${q.key}`).value;
        });
        S.jornadaAnswers[answersKey] = answers;
        showToast('Questionário de diagnóstico salvo com sucesso!');
        forceCloseModal();
        render();
    };

    window.renderJourneyDiagnosticPanel = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const answersKey = projectId + '_j' + jIdx;
        const answers = S.jornadaAnswers[answersKey];
        if (!answers) {
            return `
                <div style="margin: 0 1rem 1rem 1rem; padding: 12px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border); border-radius: 8px; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 0.72rem; color: var(--text-dim);">
                        💡 <strong>Diagnóstico Pendente:</strong> Responda ao questionário desta jornada para receber recomendações e adequação automática dos controles do SGSI.
                    </div>
                    <button class="btn-inline-action" style="border-color:var(--accent); color:var(--accent); font-weight:600;" onclick="openJornadaQuestionnaire(${jIdx}, '${projectId}'); event.stopPropagation();">Iniciar Diagnóstico</button>
                </div>
            `;
        }

        let summaryHtml = '';
        let suggestionsList = '';

        if (jIdx === 0) {
            const sponsorText = answers.sponsor === 'sim' ? 'Engajado' : answers.sponsor === 'parcial' ? 'Parcial' : 'Sem Patrocínio';
            const budgetText = answers.budget === 'sim' ? 'Aprovado' : answers.budget === 'parcial' ? 'Sob Demanda' : 'Sem Orçamento';
            const scopeText = answers.scope === 'total' ? 'Corporativo' : answers.scope === 'prod' ? 'Foco SaaS' : 'Foco TI';

            summaryHtml = `<strong>Sponsor:</strong> ${sponsorText} | <strong>Orçamento:</strong> ${budgetText} | <strong>Escopo:</strong> ${scopeText}`;

            if (answers.sponsor !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Sem sponsor executivo ativo:</strong> Risco crítico para a certificação (Requisito Cl 5.1). Recomendamos formalizar a nomeação do comitê com ata assinada.</li>`;
            }
            if (answers.budget === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem orçamento de segurança:</strong> Risco ao cronograma de contratação da certificadora. Recomenda-se reservar verba de auditoria externa preventiva.</li>`;
            }
            if (answers.scope === 'ti' || answers.scope === 'prod') {
                suggestionsList += `<li>💡 <strong>Escopo restrito:</strong> Garanta que as fronteiras físicas e de redes estejam claramente delimitadas no documento de Escopo do SGSI (Requisito Cl 4.3).</li>`;
            }
        } 
        else if (jIdx === 1) {
            const cloudLabel = answers.cloud === 'aws' ? 'AWS' : answers.cloud === 'azure' ? 'Azure' : answers.cloud === 'gcp' ? 'GCP' : 'Local';
            const dbLabel = answers.db === 'nuvem' ? 'Gerenciado' : 'Próprio';
            const devLabel = answers.dev === 'sim' ? 'Sim' : 'Não';
            const authLabel = answers.auth === 'sim' ? 'Sim' : 'Não';

            summaryHtml = `<strong>Infra:</strong> ${cloudLabel} | <strong>Banco:</strong> ${dbLabel} | <strong>Dev:</strong> ${devLabel} | <strong>IDP:</strong> ${authLabel}`;

            if (answers.cloud !== 'local') {
                suggestionsList += `<li>💡 <strong>Cloud (${cloudLabel}):</strong> Revisar políticas do controle A.5.23 (Segurança de Serviços em Nuvem) e exigir MFA em todos os consoles.</li>`;
            }
            if (answers.db === 'local') {
                suggestionsList += `<li>💡 <strong>Servidor de Banco de Dados Próprio:</strong> Implementar política rigorosa de backup criptografado fora do ambiente de execução (A.8.13 e A.8.24).</li>`;
            }
            if (answers.dev === 'sim') {
                suggestionsList += `<li>💡 <strong>Desenvolvimento Interno:</strong> Ativar testes estáticos de segurança (SAST) e diretrizes para o controle A.8.28 (Segurança em Desenvolvimento).</li>`;
            }
            if (answers.auth === 'sim') {
                suggestionsList += `<li>💡 <strong>IDP Centralizado:</strong> Habilitar provisionamento automatizado de credenciais e MFA em todos os endpoints de colaboração (A.5.15).</li>`;
            }
        }
        else if (jIdx === 2) {
            const encText = answers.encryption === 'sim' ? 'Total' : answers.encryption === 'parcial' ? 'Parcial' : 'Inativo';
            const backupText = answers.backup === 'mensal' ? 'Mensal' : answers.backup === 'semestral' ? 'Semestral' : 'Sem Testes';
            const mfaText = answers.mfa === 'todos' ? 'Obrigatório' : answers.mfa === 'admin' ? 'Apenas Admin' : 'Inativo';

            summaryHtml = `<strong>Cripto:</strong> ${encText} | <strong>Testes de Backup:</strong> ${backupText} | <strong>MFA:</strong> ${mfaText}`;

            if (answers.encryption !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Criptografia em repouso pendente:</strong> Essencial para proteger dados contra quebra física (A.8.24). Habilitar criptografia transparente no banco de dados.</li>`;
            }
            if (answers.backup === 'nunca') {
                suggestionsList += `<li>⚠️ <strong>Sem testes de restauração:</strong> O auditor irá solicitar registros dos testes dos últimos 12 meses. Configure teste de simulação mensal (A.8.13).</li>`;
            }
            if (answers.mfa !== 'todos') {
                suggestionsList += `<li>⚠️ <strong>MFA parcial ou inativo:</strong> Vulnerabilidade de controle de acesso (A.5.15). Ativar MFA obrigatório para toda equipe e e-mail corporativo.</li>`;
            }
        }
        else if (jIdx === 3) {
            const dpoText = answers.dpo === 'sim' ? 'Formalizado' : 'Pendente';
            const ropaText = answers.ropa === 'completo' ? 'Mapeado' : answers.ropa === 'andamento' ? 'Parcial' : 'Inativo';
            const dsrText = answers.dsr === 'sim' ? 'Estruturado' : 'Pendente';

            summaryHtml = `<strong>DPO:</strong> ${dpoText} | <strong>ROPA:</strong> ${ropaText} | <strong>Direitos Titulares:</strong> ${dsrText}`;

            if (answers.dpo === 'nao') {
                suggestionsList += `<li>💡 <strong>Sem DPO nomeado:</strong> Para ISO 27701 (Cl 7.2.1) e LGPD, nomeie formalmente o encarregado de dados e publique o contato de e-mail no site.</li>`;
            }
            if (answers.ropa !== 'completo') {
                suggestionsList += `<li>💡 <strong>ROPA pendente ou parcial:</strong> Utilize o módulo ROPA do nISO para mapear o fluxo de tratamento de cada dado pessoal coletado (Cl 7.3.2).</li>`;
            }
            if (answers.dsr === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem canal para titulares:</strong> OBRIGATÓRIO implementar canal de requisição DSR e registrar tempos de resposta no relatório de privacidade (Cl 7.3.1).</li>`;
            }
        }
        else if (jIdx === 4) {
            const trText = answers.training === 'sim' ? 'Periódico' : answers.training === 'integracao' ? 'Integração' : 'Pendente';
            const audText = answers.audit === 'sim' ? 'Realizada' : answers.audit === 'planejado' ? 'Planejada' : 'Pendente';
            const revText = answers.review === 'sim' ? 'Realizada' : 'Pendente';

            summaryHtml = `<strong>Treinamento:</strong> ${trText} | <strong>Auditoria Interna:</strong> ${audText} | <strong>Revisão Direção:</strong> ${revText}`;

            if (answers.training !== 'sim') {
                suggestionsList += `<li>💡 <strong>Conscientização pendente:</strong> Implementar programa contínuo de conscientização (phishing simulado e segurança) além da integração (Cl 7.3).</li>`;
            }
            if (answers.audit !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Auditoria Interna pendente:</strong> Requisito obrigatório para o Estágio 1 da certificação. Agende a auditoria antes da auditoria externa (Cl 9.2).</li>`;
            }
            if (answers.review === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Ata de Revisão pela Direção pendente:</strong> Documento chave exigido pelo auditor no Estágio 2. Agende reunião e registre a ata (Cl 9.3).</li>`;
            }
        }
        else if (jIdx === 5) {
            const certText = answers.certifier === 'sim' ? 'Contratada' : answers.certifier === 'negociacao' ? 'Em Negociação' : 'Pendente';
            const capaText = answers.capa === 'sim' ? 'Processo Ativo' : 'Pendente';

            summaryHtml = `<strong>Certificadora:</strong> ${certText} | <strong>Processo CAPA:</strong> ${capaText}`;

            if (answers.certifier !== 'sim') {
                suggestionsList += `<li>💡 <strong>Contratação da Certificadora:</strong> Solicitar propostas de organismos acreditados (INMETRO / UKAS) para agendar datas de estágio 1 e 2.</li>`;
            }
            if (answers.capa === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem processo CAPA estruturado:</strong> Essencial para comprovar melhoria contínua (Cl 10.1). Registre qualquer desvio na aba Ações Corretivas.</li>`;
            }
        }

        if (!suggestionsList) {
            suggestionsList = `<li>✅ <strong>Todos os controles da jornada mapeados:</strong> Ambiente com maturidade adequada de conformidade! Próximo para auditoria.</li>`;
        }

        return `
            <div style="margin: 0 1rem 1rem 1rem; padding: 12px; background: rgba(0, 173, 232, 0.04); border: 1px dashed rgba(0, 173, 232, 0.2); border-radius: 8px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--accent); font-weight: 700; margin-bottom: 6px; text-align: left; display: flex; justify-content: space-between;">
                    <span>⚙️ Diagnóstico de Conformidade (nISO Consultor)</span>
                    <a href="javascript:void(0)" onclick="openJornadaQuestionnaire(${jIdx}, '${projectId}')" style="color:var(--accent); text-decoration:none; font-size:0.65rem;">Refazer Diagnóstico 🔄</a>
                </div>
                <div style="font-size: 0.75rem; color: var(--text); margin-bottom: 8px; text-align: left;">
                    ${summaryHtml}
                </div>
                <ul style="font-size: 0.7rem; color: var(--text-dim); text-align: left; padding-left: 15px; margin: 0; list-style-type: square; line-height: 1.4;">
                    ${suggestionsList}
                </ul>
            </div>
        `;
    };

    window.generateDocumentNatively = async function(projectId, itemId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/checklist/${itemId}/generate`);
            showToast('Documento gerado com sucesso!');
            render();
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.openInternalDocumentEditor = async function(evidenceId) {
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Editor de Documento Interno</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div id="doc-editor-body" style="padding:1.5rem 0;">
                <div class="loading"></div>
            </div>
        `, 'modal-large');

        try {
            const data = await api('GET', `/api/v1/evidence/${evidenceId}/content`);
            
            document.getElementById('doc-editor-body').innerHTML = `
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">Nome do Arquivo</label>
                    <input type="text" class="form-input" style="width:100%; font-size:0.85rem;" value="${escapeHTML(data.file_name)}" readonly disabled>
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">Conteúdo do Documento (Markdown)</label>
                    <textarea id="internal-doc-text" class="form-input" style="width:100%; height:450px; font-family:monospace; font-size:0.8rem; line-height:1.4; background:rgba(0,0,0,0.35); resize:vertical; padding:12px;">${escapeHTML(data.content || '')}</textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn btn-primary" onclick="saveInternalDocument('${evidenceId}', this)">Salvar Alterações</button>
                </div>
            `;
        } catch(e) {
            document.getElementById('doc-editor-body').innerHTML = `
                <div style="color:var(--danger); padding:1rem; text-align:center;">
                    Erro ao carregar documento: ${escapeHTML(e.message)}
                    <div style="margin-top:1rem; font-size:0.75rem; color:var(--text-dim)">Este arquivo pode ser um anexo binário externo (PDF, imagem, etc.).</div>
                </div>
            `;
        }
    };

    window.saveInternalDocument = async function(evidenceId, btnEl) {
        const content = document.getElementById('internal-doc-text').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('PUT', `/api/v1/evidence/${evidenceId}/content`, { content });
            showToast('Documento atualizado com sucesso!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao salvar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.toggleJourney = function(jIdx) {
        const targetVal = !S.expandedJourneys[jIdx];
        if (targetVal) {
            S.expandedJourneys = {};
            S.expandedJourneys[jIdx] = true;
        } else {
            S.expandedJourneys[jIdx] = false;
        }
        render();
    };

    window.togglePhase = function(phaseNum) {
        const targetVal = !S.expandedPhases[phaseNum];
        if (targetVal) {
            S.expandedPhases = {};
            S.expandedPhases[phaseNum] = true;
        } else {
            S.expandedPhases[phaseNum] = false;
        }
        render();
    };

    window.changePhaseStatus = async function(projectId, phaseNum, selectEl) {
        const newStatus = selectEl.value;
        
        // Critério de Aceite de Entregas (Definition of Done)
        if (newStatus === 'completed') {
            const phChecklist = S.checklistsConfig[phaseNum] || [];
            const pendingItens = phChecklist.filter(item => {
                const checkKey = `${projectId}_${item.id}`;
                return S.phaseChecks[checkKey] !== true;
            });
            
            if (pendingItens.length > 0) {
                window.openDoDDrawer(projectId, phaseNum, selectEl, pendingItens);
                return;
            }
        }

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
        }
    };

    window.toggleChecklistItem = function(projectId, itemId, checkboxEl) {
        const checkKey = `${projectId}_${itemId}`;
        S.phaseChecks[checkKey] = checkboxEl.checked;
        localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
        
        const labelEl = checkboxEl.parentElement.querySelector('.checklist-text');
        if (checkboxEl.checked) {
            labelEl.classList.add('checked');
        } else {
            labelEl.classList.remove('checked');
        }
        showToast(checkboxEl.checked ? 'Item concluído' : 'Item reaberto');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();

        // ponytail: debounced save to D1
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const key in S.phaseChecks) {
                if (key.startsWith(projectId + '_')) {
                    const iid = key.replace(projectId + '_', '');
                    const match = iid.match(/^p(\d+)_/);
                    if (match) {
                        items.push({ 
                            phase_number: parseInt(match[1]), 
                            item_id: iid, 
                            is_checked: !!S.phaseChecks[key],
                            notes: (S.phaseChecksNotes && S.phaseChecksNotes[key]) || null,
                            assigned_to: (S.phaseChecksAssigned && S.phaseChecksAssigned[key]) || null,
                            due_date: (S.phaseChecksDueDate && S.phaseChecksDueDate[key]) || null
                        });
                    }
                }
            }
            if (items.length > 0) {
                try { await api('PUT', '/api/v1/projects/' + projectId + '/checklist-progress', { items }); }
                catch (e) { console.warn('Checklist sync error:', e); }
            }
        }, 500);
    };

    async function openPhaseDetail(projectId, phaseNum) {
        // Basic implementation
        alert('Detalhes da fase ' + phaseNum);
    }

    async function wsUploadEvidence(docType) {
        const labels = { organograma:'Organograma', policy:'Politicas Existentes', inventory:'Inventario de Ativos', topology:'Topologia de Rede', systems:'Lista de Sistemas', contracts:'Contratos Fornecedores', incidents:'Registro de Incidentes', certifications:'Certificacoes Vigentes', floorplan:'Planta Baixa', audit_report:'Relatorio de Auditoria', ropa:'RoPA / Mapeamento Dados', backup_dr:'Backup e DR' };
        openModal(`<h3 style="margin-bottom:1rem">Upload: ${labels[docType] || docType}</h3>
            <div class="form-group"><label class="form-label">Arquivo</label><input type="file" id="doc-file" class="form-input" accept=".pdf,.docx,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg"></div>
            <div id="doc-msg" style="font-size:0.7rem;color:var(--muted);margin:0.5rem 0"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end">
                <button class="btn" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="doDocUpload('${docType}')">Upload e Extrair</button>
            </div>`);
    }

    async function doDocUpload(docType) {
        const file = document.getElementById('doc-file')?.files?.[0];
        if (!file) { document.getElementById('doc-msg').textContent = 'Selecione um arquivo.'; return; }
        document.getElementById('doc-msg').textContent = 'Enviando...';
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('document_type', docType);
            const res = await fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/documents/upload`, {
                method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }, body: fd
            });
            const data = await res.json();
            if (data.ok) {
                showToast('Upload concluído');
                closeModal();
                render();
            } else {
                document.getElementById('doc-msg').textContent = data.error || 'Erro no upload.';
                document.getElementById('doc-msg').style.color = 'var(--danger)';
            }
        } catch(e) {
            document.getElementById('doc-msg').textContent = 'Erro: ' + e.message;
        }
    }

    async function wsViewExtraction(docId) {
        try {
            const docs = await api('GET', `/api/v1/projects/${S.currentProject.id}/documents`);
            const doc = (docs || []).find(d => d.id === docId);
            if (!doc) return;
            openModal(`<h3 style="margin-bottom:1rem">Extracao: ${escapeHTML(doc.filename)}</h3>
                <div style="font-size:0.5rem;color:var(--muted);margin-bottom:0.5rem">Status: ${doc.status} | Tipo: ${doc.document_type}</div>
                <textarea class="form-input" id="doc-ext-edit" rows="12" style="font-size:0.7rem;font-family:monospace;line-height:1.6">${escapeHTML(doc.extracted_summary || '')}</textarea>
                <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem">
                    <button class="btn" onclick="forceCloseModal()">Fechar</button>
                    <button class="btn btn-primary" onclick="wsConfirmExtraction('${docId}')">Confirmar e Indexar</button>
                </div>`);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function wsConfirmExtraction(docId) {
        const summary = document.getElementById('doc-ext-edit')?.value;
        if (!summary) return;
        await api('PUT', `/api/v1/projects/${S.currentProject.id}/documents/${docId}`, { extracted_summary: summary, status: 'confirmed' });
        forceCloseModal();
        render();
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
    };

    window.saveChecklistItemNotes = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemAssigned = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
        S.phaseChecksAssigned[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemDueDate = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
        S.phaseChecksDueDate[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    async function downloadAuditPack(projectId) {
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/audit-pack`, { headers });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-pack-${projectId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro ao baixar audit pack: ' + e.message); }
    }

window.renderProjects = renderProjects;
window.openProjectDetail = openProjectDetail;
window.promoteToProject = promoteToProject;
window.renderProjectDetail = renderProjectDetail;
window.openPhaseDetail = openPhaseDetail;
window.wsUploadEvidence = wsUploadEvidence;
window.doDocUpload = doDocUpload;
window.wsViewExtraction = wsViewExtraction;
window.wsConfirmExtraction = wsConfirmExtraction;
window.downloadAuditPack = downloadAuditPack;
