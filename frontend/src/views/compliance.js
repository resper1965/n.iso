import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

    function renderControls(c, h, a) {
        h.textContent = S.lang === 'en' ? 'Controls' : 'Controles';
        if (!S.controls.length) {
            c.innerHTML = `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Os controles serão populados pelo backend.</p></div>`;
            return;
        }
        c.innerHTML = `<div class="fade-in card" style="padding:0;overflow:hidden">${S.controls.map(ctrl => `
            <div class="phase-item" onclick="openControlDetail('${ctrl.id}')" style="cursor:pointer">
                <div class="phase-num" style="width:3.5rem;color:var(--accent)">${ctrl.id}</div>
                <div style="flex:1">
                    <div class="phase-title">${ctrl.title}</div>
                    ${ctrl.maturity ? `<div style="font-size:0.6rem; color:var(--muted)">Maturidade: ${ctrl.maturity}/5</div>` : ''}
                </div>
                <div class="phase-status ${ctrl.status==='Compliant'?'status-done':ctrl.status==='Partial'?'status-progress':'status-pending'}">${ctrl.status}</div>
            </div>`).join('')}</div>`;
    }

    function openControlDetail(controlId) {
        const ctrl = S.controls.find(c => c.id === controlId);
        if (!ctrl) return;

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${ctrl.id}: ${escapeHTML(ctrl.title)}</span>
                <button class="btn-ghost" onclick="closeModal()">&times;</button>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <div class="ctx-label">Descrição</div>
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.4">${escapeHTML(ctrl.description || 'Nenhuma descrição.')}</div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                    <div>
                        <div class="ctx-label">Status do Controle</div>
                        <select class="form-input" onchange="updateControlStatus('${ctrl.id}', this.value)" style="width:100%">
                            <option value="Missing" ${ctrl.status === 'Missing' ? 'selected' : ''}>Ausente</option>
                            <option value="Partial" ${ctrl.status === 'Partial' ? 'selected' : ''}>Parcial</option>
                            <option value="Compliant" ${ctrl.status === 'Compliant' ? 'selected' : ''}>Conforme</option>
                        </select>
                    </div>
                    <div>
                        <div class="ctx-label">Maturidade (CMM 0-5)</div>
                        <div style="display:flex; align-items:center; gap: 1rem; background:rgba(255,255,255,0.03); padding:0.5rem; border-radius:8px">
                            <input type="range" min="0" max="5" step="1" value="${ctrl.maturity || 0}" 
                                oninput="this.nextElementSibling.textContent = this.value"
                                onchange="updateControlMaturity('${ctrl.id}', this.value)"
                                style="flex:1">
                            <span style="font-weight:700; color:var(--accent); min-width:1rem">${ctrl.maturity || 0}</span>
                        </div>
                    </div>
                </div>

                <div class="ctx-label">Evidências Vinculadas</div>
                <div id="control-evidence-list" class="card" style="padding:0; margin-bottom: 1.5rem; max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2)">
                    <div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Carregando evidências...</div>
                </div>
                
                <div style="display:flex; gap:0.75rem">
                    <button class="btn btn-primary" style="flex:1" onclick="generatePolicyForControl('${ctrl.id}')">Gerar Política AI</button>
                    <button class="btn" style="flex:1" onclick="openEvidenceUploadModal('${S.currentProject?.id}', '${ctrl.id}')">Upload Evidência</button>
                </div>
            </div>
        `);
        loadControlEvidence(ctrl.id);
    }

    async function updateControlStatus(id, status) {
        try {
            await api('PUT', `/api/v1/controls/${id}/status`, { status });
            await loadControls();
            // Do not close modal, just refresh background
        } catch(e) { alert(e.message); }
    }

    window.updateControlMaturity = async function(id, maturity) {
        try {
            await api('PUT', `/api/v1/controls/${id}/maturity`, { maturity: parseInt(maturity) });
            showToast('Maturidade atualizada com sucesso!');
            const c = document.getElementById('main-content');
            const h = document.getElementById('header-title');
            const a = document.getElementById('header-actions');
            if (S.view === 'soa') {
                renderSoA(c, h, a);
            } else {
                await loadControls();
            }
        } catch(e) { alert(e.message); }
    };

    async function loadControlEvidence(controlId) {
        const listEl = document.getElementById('control-evidence-list');
        if (!listEl) return;
        try {
            const evidences = await api('GET', `/api/v1/projects/${S.currentProject?.id}/evidence`);
            const filtered = evidences.filter(e => e.control_id === controlId);
            if (!filtered.length) {
                listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Nenhuma evidência vinculada.</div>';
                return;
            }
            listEl.innerHTML = filtered.map(e => `
                <div style="padding:0.6rem 1rem; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center">
                    <div>
                        <div style="font-size:0.8rem; font-weight:500">${escapeHTML(e.filename)}</div>
                        <div style="font-size:0.6rem; color:var(--muted)">${e.evaluation_status || 'pendente'}</div>
                    </div>
                    <button class="btn-ghost" onclick="viewEvidence('${e.id}')" style="padding:0.25rem">Ver</button>
                </div>
            `).join('');
        } catch(e) { listEl.innerHTML = `<div style="padding:1rem; color:var(--danger)">Erro ao carregar.</div>`; }
    }

    async function generatePolicyForControl(controlId) {
        const btn = event.target;
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${S.currentProject?.id}/generate-policy`, { control_id: controlId });
            alert('Política gerada com sucesso! Verifique o Log de Atividade.');
            closeModal();
        } catch(e) { alert(e.message); }
        finally { btn.disabled = false; btn.textContent = oldText; }
    }

    function toggleChip(el, key) {
        el.classList.toggle('chip-active');
        const container = el.closest('.multi-chips');
        const selected = [...container.querySelectorAll('.chip-active')].map(c => c.textContent);
        S.blockAnswers[key] = selected.join('||');
        updateContextPanel();
    }

    function setYesNo(el, key, val) {
        const group = el.closest('.yesno-group');
        group.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('yesno-active'));
        el.classList.add('yesno-active');
        S.blockAnswers[key] = val;
        updateContextPanel();
    }

    function getControlSubSection(ctrl) {
        const title = ctrl.title || '';
        const id = ctrl.id || '';
        const standard = ctrl.standard || '';
        
        if (standard.includes('27001')) {
            if (id.includes('-a5') || title.includes('A.5.')) {
                return { code: 'A.5', name: 'Controles Organizacionais', label: 'A.5' };
            }
            if (id.includes('-a6') || title.includes('A.6.')) {
                return { code: 'A.6', name: 'Controles de Pessoas', label: 'A.6' };
            }
            if (id.includes('-a7') || title.includes('A.7.')) {
                return { code: 'A.7', name: 'Controles Físicos', label: 'A.7' };
            }
            if (id.includes('-a8') || title.includes('A.8.')) {
                return { code: 'A.8', name: 'Controles Tecnológicos', label: 'A.8' };
            }
        } else if (standard.includes('27701')) {
            if (id.includes('-a') || title.includes('A.') || ctrl.role === 'Controller') {
                return { code: 'P.C', name: 'Diretrizes para Controladores', label: 'PIMS Controller' };
            }
            if (id.includes('-b') || title.includes('B.') || ctrl.role === 'Processor') {
                return { code: 'P.P', name: 'Diretrizes para Operadores', label: 'PIMS Processor' };
            }
            return { code: 'P.G', name: 'Diretrizes Gerais de Privacidade', label: 'PIMS Geral' };
        }
        return { code: 'Other', name: 'Outros Controles', label: 'Geral' };
    }

    function parseControlTitle(ctrl) {
        const titleStr = ctrl.title || '';
        let controlCode = ctrl.id || '';
        let controlTitleText = titleStr;
        
        const match = titleStr.match(/^([A-Za-z0-9\.\-\s]+?)\s+(.*)$/);
        if (match) {
            const potentialCode = match[1].trim();
            if (potentialCode.match(/^(A\.\d+|B\.\d+|Cl\s\d+|[0-9\.]+)/)) {
                controlCode = potentialCode;
                controlTitleText = match[2].trim();
            }
        }
        return { code: controlCode, title: controlTitleText };
    }

    async function renderSoA(c, h, a) {
        h.textContent = 'Statement of Applicability (SoA)';
        a.innerHTML = '';
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo para visualizar o SoA.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando controles do SoA...</div>';
        try {
            const [controls, traceData] = await Promise.all([
                api('GET', `/api/v1/projects/${S.activeProject.id}/controls`) || [],
                api('GET', `/api/v1/projects/${S.activeProject.id}/traceability`).then(r => r.controls).catch(() => [])
            ]);
            
            const traceMap = {};
            if (Array.isArray(traceData)) {
                traceData.forEach(t => { traceMap[t.id] = t; });
            }
            window.currentSoATraceMap = traceMap;
            window.currentSoAFilter = 'all';
            window.soaAccordionStates = window.soaAccordionStates || {};

            let totalApplicable = 0, totalNA = 0, totalJustified = 0;
            
            controls.forEach(ctrl => {
                const isNA = ctrl.status === 'Not Applicable';
                if (isNA) {
                    totalNA++;
                    if (ctrl.description && ctrl.description.trim() !== '') {
                        totalJustified++;
                    }
                } else {
                    totalApplicable++;
                }
            });

            const stdGroups = {};
            controls.forEach(ctrl => {
                const std = ctrl.standard || 'ISO 27001:2022';
                if (!stdGroups[std]) stdGroups[std] = {};
                
                const sub = getControlSubSection(ctrl);
                if (!stdGroups[std][sub.code]) {
                    stdGroups[std][sub.code] = {
                        meta: sub,
                        controls: []
                    };
                }
                stdGroups[std][sub.code].controls.push(ctrl);
            });

            let html = `
                <div class="soa-stat-grid">
                    <div class="soa-stat-card applicable">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="stat-value" style="font-size:1.8rem; font-family:'Montserrat',sans-serif; font-weight:700; color:var(--text);">${totalApplicable} <span style="font-size:0.95rem;color:var(--text-dim)">/ ${controls.length}</span></div>
                            <div style="font-size: 0.65rem; background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2); padding:2px 8px; border-radius:10px; font-weight:600;">
                                ${controls.length > 0 ? ((totalApplicable / controls.length) * 100).toFixed(0) : 0}%
                            </div>
                        </div>
                        <div class="stat-label" style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:12px;">Controles Aplicáveis</div>
                    </div>
                    <div class="soa-stat-card not-applicable">
                        <div class="stat-value" style="font-size:1.8rem; font-family:'Montserrat',sans-serif; font-weight:700; color:var(--text);">${totalNA}</div>
                        <div class="stat-label" style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:12px;">Controles Não Aplicáveis</div>
                    </div>
                    <div class="soa-stat-card justified">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="stat-value" style="font-size:1.8rem; font-family:'Montserrat',sans-serif; font-weight:700; color:var(--text);">${totalJustified} <span style="font-size:0.95rem;color:var(--text-dim)">/ ${totalNA || 1}</span></div>
                            <div class="badge" style="font-size:0.65rem; background:${totalNA > 0 && totalJustified === totalNA ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}; color:${totalNA > 0 && totalJustified === totalNA ? '#10b981' : '#f59e0b'}; border:1px solid ${totalNA > 0 && totalJustified === totalNA ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}; padding:2px 8px; border-radius:10px; font-weight:600;">
                                ${totalNA > 0 && totalJustified === totalNA ? 'Conforme' : 'Pendente'}
                            </div>
                        </div>
                        <div class="stat-label" style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:12px;">Justificativas de Exclusão</div>
                    </div>
                </div>

                <div class="soa-filters" style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:2rem;align-items:center;background:rgba(15,20,35,0.4);border:1px solid var(--border);border-radius:12px;padding:16px;backdrop-filter:var(--glass-blur)">
                    <div style="flex:1;min-width:280px;position:relative">
                        <input type="text" id="soa-search" placeholder="Buscar por ID ou termo..." oninput="window.filterSoATable()" style="width:100%;background:rgba(7,11,20,0.5);border:1px solid var(--border);border-radius:10px;padding:8px 12px 8px 36px;color:var(--text);font-size:0.85rem;outline:none" />
                        <svg viewBox="0 0 24 24" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-dim);fill:none;stroke-width:1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <button class="btn btn-filter active" data-filter="all" onclick="window.setSoAFilter('all')" style="font-size:0.75rem;padding:6px 12px;background:rgba(0,173,232,0.15);border-color:var(--accent);color:var(--accent)">Todos</button>
                        <button class="btn btn-filter" data-filter="applicable" onclick="window.setSoAFilter('applicable')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="not_applicable" onclick="window.setSoAFilter('not_applicable')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Não Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="gaps" onclick="window.setSoAFilter('gaps')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Gaps</button>
                        <button class="btn btn-filter" data-filter="approved" onclick="window.setSoAFilter('approved')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aprovados</button>
                    </div>
                </div>
            `;

            for (const [stdName, subGroups] of Object.entries(stdGroups).sort()) {
                html += `
                    <div style="margin-top:2.5rem; margin-bottom:1.25rem; font-family:'Montserrat',sans-serif; font-weight:500; font-size:1.1rem; color:var(--text); letter-spacing:0.5px; display:flex; align-items:center; gap:8px">
                        <span style="width:4px; height:18px; background:var(--accent); border-radius:2px; display:inline-block"></span>
                        Norma ${escapeHTML(stdName)}
                    </div>
                `;

                for (const [subCode, subData] of Object.entries(subGroups).sort()) {
                    const sectionId = `${stdName}-${subCode}`.replace(/\s+/g, '_');
                    
                    const totalSec = subData.controls.length;
                    let compliantSec = 0;
                    subData.controls.forEach(c => {
                        if (c.status === 'Implemented' || c.status === 'Compliant' || c.status === 'Approved') {
                            compliantSec++;
                        }
                    });
                    const pctSec = totalSec > 0 ? Math.round((compliantSec / totalSec) * 100) : 0;
                    
                    if (window.soaAccordionStates[sectionId] === undefined) {
                        window.soaAccordionStates[sectionId] = (stdName.includes('27001') && subCode === 'A.5');
                    }
                    const isOpen = window.soaAccordionStates[sectionId];

                    html += `
                        <div class="soa-section soa-accordion ${isOpen ? 'active' : ''}" id="soa-acc-${sectionId}">
                            <div class="soa-accordion-header" onclick="window.toggleSoAAccordion('${sectionId}')">
                                <div class="soa-accordion-title">
                                    <span class="code">${escapeHTML(subData.meta.label)}</span>
                                    <span>${escapeHTML(subData.meta.name)}</span>
                                </div>
                                <div class="soa-accordion-meta">
                                    <div class="soa-section-progress-container">
                                        <span>${compliantSec} / ${totalSec} Conformes</span>
                                        <div class="soa-mini-progress">
                                            <div class="soa-mini-progress-fill" style="width: ${pctSec}%"></div>
                                        </div>
                                    </div>
                                    <svg class="soa-accordion-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                            <div class="soa-accordion-content">
                                <div class="data-table" style="overflow-x:auto">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style="width:90px">ID</th>
                                                <th style="width:240px">Controle</th>
                                                <th style="width:130px">Aplicável?</th>
                                                <th style="width:125px">Status</th>
                                                <th style="width:145px">Rastreabilidade</th>
                                                <th>Justificativa / Notas</th>
                                                <th style="width:115px">Maturidade</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;

                    subData.controls.forEach(ctrl => {
                        const isNA = ctrl.status === 'Not Applicable';
                        const trace = traceMap[ctrl.id] || { risks: [], evidence: [] };
                        const risksCount = (trace.risks || []).length;
                        const evidenceCount = (trace.evidence || []).length;

                        const parsed = parseControlTitle(ctrl);
                        const isJustificationMissing = isNA && (!ctrl.description || ctrl.description.trim() === '');

                        html += `
                            <tr id="soa-row-${ctrl.id}" class="soa-row" data-standard="${escapeHTML(ctrl.standard || '')}" data-title="${escapeHTML(ctrl.title || '')}" data-status="${escapeHTML(ctrl.status || 'Missing')}">
                                <td style="font-weight:700;color:var(--accent);font-size:0.8rem;white-space:nowrap">${escapeHTML(parsed.code)}</td>
                                <td style="font-weight:400;font-size:0.8rem;line-height:1.45">${escapeHTML(parsed.title)}</td>
                                <td>
                                    <div class="segmented-control ${isNA ? 'not-applicable' : 'applicable'}" id="seg-toggle-${ctrl.id}">
                                        <button type="button" class="seg-btn ${!isNA ? 'active' : ''}" onclick="${!isNA ? '' : `window.toggleSoAApplicability('${ctrl.id}', 'Applicable')`}">Sim</button>
                                        <button type="button" class="seg-btn ${isNA ? 'active' : ''}" onclick="${isNA ? '' : `window.toggleSoAApplicability('${ctrl.id}', 'Not Applicable')`}">Não</button>
                                    </div>
                                </td>
                                <td>
                                    <span class="badge ${isNA ? 'badge-not-applicable' : 'badge-' + (ctrl.status || 'missing').toLowerCase().replace(/\s/g,'-')}">
                                        ${escapeHTML(ctrl.status || 'Missing')}
                                    </span>
                                </td>
                                <td>
                                    <div style="display:flex;gap:6px">
                                        <span onclick="window.showControlRisks('${ctrl.id}', '${escapeHTML(parsed.code)}')" class="badge-trace" style="cursor:pointer;background:${risksCount > 0 ? 'rgba(0,173,232,0.12)' : 'rgba(255,255,255,0.02)'};color:${risksCount > 0 ? '#00ade8' : 'var(--text-dim)'};border:1px solid ${risksCount > 0 ? 'rgba(0,173,232,0.2)' : 'var(--border)'};padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${risksCount} risco(s) vinculado(s)">
                                            R: ${risksCount}
                                        </span>
                                        <span onclick="window.showControlEvidence('${ctrl.id}', '${escapeHTML(parsed.code)}')" class="badge-trace" style="cursor:pointer;background:${evidenceCount > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'};color:${evidenceCount > 0 ? '#10b981' : 'var(--text-dim)'};border:1px solid ${evidenceCount > 0 ? 'rgba(16,185,129,0.15)' : 'var(--border)'};padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${evidenceCount} evidência(s) vinculada(s)">
                                            E: ${evidenceCount}
                                        </span>
                                    </div>
                                    <div style="display:flex;gap:4px;margin-top:4px">
                                        ${ctrl.ciso_approved_by ? `<span class="badge" style="font-size:0.55rem;padding:2px 4px;background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.15)" title="Assinado por DPO: ${escapeHTML(ctrl.ciso_approved_by)}">DPO ✓</span>` : ''}
                                        ${ctrl.ceo_approved_by ? `<span class="badge" style="font-size:0.55rem;padding:2px 4px;background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.15)" title="Assinado por CEO: ${escapeHTML(ctrl.ceo_approved_by)}">CEO ✓</span>` : ''}
                                    </div>
                                </td>
                                <td>
                                    <input type="text" value="${escapeHTML(ctrl.description || '')}" 
                                        placeholder="${isNA ? 'Justificativa obrigatória para exclusão' : 'Notas do consultor...'}" 
                                        class="soa-justification-input ${isJustificationMissing ? 'required-missing' : ''}" 
                                        onblur="window.saveSoAJustification('${ctrl.id}', this.value); if (this.value.trim() !== '') { this.classList.remove('required-missing'); } else if (${isNA}) { this.classList.add('required-missing'); }" />
                                </td>
                                <td>
                                    <select onchange="window.updateControlMaturity('${ctrl.id}', this.value)" class="custom-select" style="padding:6px 10px;width:100%;background:rgba(7,11,20,0.8);color:var(--text);border:1px solid rgba(255,255,255,0.08);border-radius:8px;font-weight:600;font-size:0.8rem;cursor:pointer">
                                        ${[0, 1, 2, 3, 4, 5].map(val => `<option value="${val}" ${ctrl.maturity === val ? 'selected' : ''}>CMM ${val}</option>`).join('')}
                                    </select>
                                </td>
                            </tr>
                        `;
                    });

                    html += `
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar SoA: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.toggleSoAAccordion = function(sectionId) {
        const el = document.getElementById(`soa-acc-${sectionId}`);
        if (el) {
            const isActive = el.classList.toggle('active');
            window.soaAccordionStates = window.soaAccordionStates || {};
            window.soaAccordionStates[sectionId] = isActive;
        }
    };

    window.setSoAFilter = function(filter) {
        window.currentSoAFilter = filter;
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const isMatch = btn.getAttribute('data-filter') === filter;
            btn.classList.toggle('active', isMatch);
            if (isMatch) {
                btn.style.background = 'rgba(0,173,232,0.15)';
                btn.style.borderColor = 'var(--accent)';
                btn.style.color = 'var(--accent)';
            } else {
                btn.style.background = 'var(--surface)';
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text)';
            }
        });
        window.filterSoATable();
    };

    window.filterSoATable = function() {
        const query = (document.getElementById('soa-search')?.value || '').toLowerCase().trim();
        const filter = window.currentSoAFilter || 'all';
        
        const sections = document.querySelectorAll('.soa-section');
        sections.forEach(section => {
            const rows = section.querySelectorAll('tbody tr');
            let visibleRowsCount = 0;
            
            rows.forEach(row => {
                const standard = (row.getAttribute('data-standard') || '').toLowerCase();
                const title = (row.getAttribute('data-title') || '').toLowerCase();
                const status = row.getAttribute('data-status') || '';
                
                const matchesSearch = !query || standard.includes(query) || title.includes(query);
                
                let matchesFilter = true;
                if (filter === 'applicable') {
                    matchesFilter = status !== 'Not Applicable';
                } else if (filter === 'not_applicable') {
                    matchesFilter = status === 'Not Applicable';
                } else if (filter === 'gaps') {
                    matchesFilter = status === 'Missing';
                } else if (filter === 'approved') {
                    matchesFilter = status === 'Approved' || status === 'Implemented';
                }
                
                if (matchesSearch && matchesFilter) {
                    row.style.display = '';
                    visibleRowsCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            if (visibleRowsCount > 0) {
                section.style.display = '';
            } else {
                section.style.display = 'none';
            }
        });
    };

    window.showControlRisks = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { risks: [] };
        const risks = trace.risks || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Riscos Vinculados — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (risks.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhum risco vinculado a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Ativo</th>
                                <th>Ameaça</th>
                                <th style="width:100px">Nível</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            risks.forEach(r => {
                const lvl = (r.risk_level || 'Low').toLowerCase();
                let lvlColor = 'var(--success)';
                let lvlBg = 'rgba(34,197,94,0.1)';
                if (lvl === 'medium') { lvlColor = 'var(--warning)'; lvlBg = 'rgba(245,158,11,0.1)'; }
                else if (lvl === 'high' || lvl === 'critical') { lvlColor = 'var(--danger)'; lvlBg = 'rgba(239,68,68,0.1)'; }
                
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(r.asset)}</td>
                        <td style="color:var(--text-dim)">${escapeHTML(r.threat)}</td>
                        <td>
                            <span class="badge" style="background:${lvlBg};color:${lvlColor};border:1px solid ${lvlColor}33;text-transform:capitalize">
                                ${escapeHTML(r.risk_level || 'Low')}
                            </span>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.showControlEvidence = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { evidence: [] };
        const evidence = trace.evidence || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Evidências Vinculadas — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (evidence.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhuma evidência vinculada a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Arquivo</th>
                                <th style="width:140px">Enviado em</th>
                                <th style="width:160px;text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            evidence.forEach(e => {
                const dateStr = new Date(e.created_at).toLocaleDateString();
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(e.file_name)}</td>
                        <td style="color:var(--text-dim)">${dateStr}</td>
                        <td style="text-align:right">
                            <button class="btn btn-ghost" onclick="window.viewEvidenceDetails('${e.id}')" style="padding:4px 8px;font-size:0.75rem;margin-right:6px">Ver</button>
                            <button class="btn btn-primary" onclick="window.downloadEvidenceFile('${e.id}')" style="padding:4px 8px;font-size:0.75rem">Download</button>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.viewEvidenceDetails = function(evidenceId) {
        viewEvidence(evidenceId);
    };

    window.downloadEvidenceFile = async function(evidenceId) {
        try {
            const projectId = S.activeProject?.id || S.currentProject?.id;
            if (!projectId) return;
            const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/evidence/${evidenceId}/download`, {
                headers: { 'Authorization': 'Bearer ' + S.token }
            });
            if (!res.ok) throw new Error('Erro ao baixar arquivo');
            const blob = await res.blob();
            
            const contentDisp = res.headers.get('Content-Disposition');
            let filename = 'evidence_file';
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch(e) {
            showToast('Erro ao baixar evidência: ' + e.message, 'error');
        }
    };

    window.toggleSoAApplicability = async function(ctrlId, value) {
        try {
            const status = value === 'Not Applicable' ? 'Not Applicable' : 'Missing';
            await api('PUT', `/api/v1/controls/${ctrlId}`, { status });
            showToast('Aplicabilidade atualizada');
            render();
        } catch(e) {
            showToast('Erro ao atualizar aplicabilidade', 'error');
        }
    };

    window.saveSoAJustification = async function(ctrlId, value) {
        try {
            await api('PUT', `/api/v1/controls/${ctrlId}`, { description: value });
            showToast('Justificativa salva');
        } catch(e) {
            showToast('Erro ao salvar justificativa', 'error');
        }
    };

    async function renderEvidence(c, h, a) {
        h.textContent = 'Central de Evidências';
        const proj = S.currentProject || S.activeProject || S.projects[0];
        if (!proj) {
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Selecione um projeto</h3><p>Acesse um projeto para ver suas evidências.</p></div>';
            return;
        }
        
        a.innerHTML = `<button class="btn btn-primary" onclick="openEvidenceUploadModal('${proj.id}')">+ Upload Evidência</button>`;

        let evidence = [];
        try { evidence = await api('GET', `/api/v1/projects/${proj.id}/evidence`); } catch(e) {}
        if (!Array.isArray(evidence)) evidence = [];

        const totalEvidence = evidence.length;
        const dpoSignedCount = evidence.filter(e => e.ciso_approved_by).length;
        const ceoSignedCount = evidence.filter(e => e.ceo_approved_by).length;
        const aiEvaluatedCount = evidence.filter(e => e.ai_status).length;

        const statsHtml = window.renderStatCards([
            { label: 'Total de Evidências', value: totalEvidence, color: 'var(--accent)', subtext: 'Arquivos no repositório R2' },
            { label: 'Assinadas DPO', value: dpoSignedCount, color: '#34c759', subtext: 'Aprovação técnica' },
            { label: 'Assinadas CEO', value: ceoSignedCount, color: '#34c759', subtext: 'Aprovação executiva' },
            { label: 'Avaliadas por IA', value: aiEvaluatedCount, color: '#ffcc00', subtext: 'Análise automática' }
        ]);

        const isOrgUser = S.user && S.user.role === 'org_user';

        const tableHtml = window.renderDataTable(
            ['Arquivo Evidência', 'Tamanho', 'Hash (SHA-256)', 'Assinatura DPO', 'Assinatura CEO', 'Avaliação IA', 'Ações'],
            evidence.map(e => {
                const fileName = e.file_name || e.filename || 'Evidência sem nome';
                const fileHash = e.file_hash || e.sha256_hash || '';
                const hashShort = fileHash ? fileHash.substring(0, 16) + '...' : '—';
                const sizeKB = e.file_size ? `${(e.file_size / 1024).toFixed(1)} KB` : '—';

                const dpoBadge = e.ciso_approved_by 
                    ? window.renderStatusBadge(`OK (${escapeHTML(e.ciso_approved_by)})`, 'success') 
                    : window.renderStatusBadge('Pendente', 'neutral');

                const ceoBadge = e.ceo_approved_by 
                    ? window.renderStatusBadge(`OK (${escapeHTML(e.ceo_approved_by)})`, 'success') 
                    : window.renderStatusBadge('Pendente', 'neutral');

                const aiBadgeType = e.ai_status === 'CONFORME' ? 'success' : e.ai_status === 'PARCIAL' ? 'warning' : e.ai_status === 'NAO CONFORME' ? 'danger' : 'neutral';
                const aiBadge = e.ai_status 
                    ? window.renderStatusBadge(e.ai_status, aiBadgeType) 
                    : window.renderStatusBadge('Não avaliado', 'neutral');

                const dpoBtn = (!e.ciso_approved_by && !isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" onclick="signEvidence('${e.id}', 'ciso')">Assinar DPO</button>`
                    : '';
                const ceoBtn = (!e.ceo_approved_by && !isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" onclick="signEvidence('${e.id}', 'ceo')">Assinar CEO</button>`
                    : '';
                const evalBtn = (!isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="evaluateEvidenceAI('${e.id}')">IA</button>`
                    : '';

                return [
                    `<strong>${escapeHTML(fileName)}</strong>`,
                    sizeKB,
                    `<code style="font-size:0.65rem;color:var(--text-dim)">${hashShort}</code>`,
                    dpoBadge,
                    ceoBadge,
                    aiBadge,
                    `<a href="/api/v1/evidence/${e.id}/download" target="_blank" class="btn btn-ghost btn-sm">Download</a> ${dpoBtn} ${ceoBtn} ${evalBtn}`
                ];
            }),
            { emptyState: 'Nenhuma evidência enviada para este projeto.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    function openEvidenceUploadModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Upload de Evidencia</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Controle ISO (opcional)</label>
                <input class="form-input" id="ev-control-id" placeholder="Ex: A.5.1, A.8.25">
            </div>
            <div class="form-group">
                <label class="form-label">Arquivo</label>
                <input type="file" id="ev-file" class="form-input" style="padding:0.5rem">
            </div>
            <div id="ev-msg" style="font-size:0.7rem;margin-bottom:0.75rem;color:var(--muted)">Formatos aceitos: PDF, DOCX, XLSX, imagens, logs</div>
            <button class="btn btn-primary" id="btn-ev-upload" style="width:100%" onclick="doEvidenceUpload('${projectId}')">Enviar Evidencia</button>
        `);
    }

    async function doEvidenceUpload(projectId) {
        const fileInput = document.getElementById('ev-file');
        const controlId = document.getElementById('ev-control-id').value;
        const msg = document.getElementById('ev-msg');
        const btn = document.getElementById('btn-ev-upload');
        if (!fileInput.files.length) { msg.style.color = 'var(--danger)'; msg.textContent = 'Selecione um arquivo'; return; }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (controlId) formData.append('control_id', controlId);

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Calculando SHA-256 e enviando para R2...';

        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/evidence/upload`, { method: 'POST', headers, body: formData });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Erro');
            msg.style.color = 'var(--accent)';
            msg.textContent = `Evidencia enviada: ${data.file_name} (SHA-256: ${data.file_hash.substring(0,16)}...)`;
            btn.textContent = 'Enviar outra';
            btn.disabled = false;
            fileInput.value = '';
        } catch(e) {
            msg.style.color = 'var(--danger)';
            msg.textContent = `Erro: ${e.message}`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    async function renderPoliciesDashboard(c, h, a) {
        h.textContent = 'Gestão de Políticas (A.5.1)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = '';
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando painel de políticas...</div>';
        
        try {
            const controls = await api('GET', '/api/v1/controls') || [];
            const projectControls = controls.filter(ctrl => ctrl.project_id === proj.id);
            
            const total = projectControls.length;
            const draft = projectControls.filter(ctrl => !ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const ciso = projectControls.filter(ctrl => ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const vigentes = projectControls.filter(ctrl => ctrl.ciso_approved_by && ctrl.ceo_approved_by).length;
            
            const statsHtml = window.renderStatCards([
                { label: 'Total de Políticas', value: total, color: 'var(--accent)', subtext: 'Controles no escopo' },
                { label: 'Rascunho / Pendentes', value: draft, color: '#ff3b30', subtext: 'Requer elaboração' },
                { label: 'Aprovadas Líder SGSI', value: ciso, color: '#feca57', subtext: 'Aprovação técnica' },
                { label: 'Aprovadas & Vigentes', value: vigentes, color: '#34c759', subtext: 'Assinatura DPO + CEO' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Controle ID', 'Política / Controle', 'Assinatura Líder SGSI', 'Assinatura Direção', 'Estágio', 'Status SoA', 'Ações'],
                projectControls.map(ctrl => {
                    let stageText = 'Rascunho';
                    let stageType = 'neutral';
                    if (ctrl.ciso_approved_by && ctrl.ceo_approved_by) {
                        stageText = 'Vigente';
                        stageType = 'success';
                    } else if (ctrl.ciso_approved_by) {
                        stageText = 'Revisão Líder SGSI';
                        stageType = 'warning';
                    } else if (ctrl.ceo_approved_by) {
                        stageText = 'Revisão Direção Executiva';
                        stageType = 'warning';
                    }
                    
                    const cisoSign = ctrl.ciso_approved_by ? `<span style="color:var(--success)">✓ ${escapeHTML(ctrl.ciso_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                    const ceoSign = ctrl.ceo_approved_by ? `<span style="color:var(--success)">✓ ${escapeHTML(ctrl.ceo_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                    
                    const statusType = (ctrl.status === 'Compliant' || ctrl.status === 'IMPLEMENTED' || ctrl.status === 'Implemented') ? 'success' : (ctrl.status === 'Partial' || ctrl.status === 'PARTIAL') ? 'warning' : 'danger';

                    // Map DB ID back to formatted display ID (e.g. ctrl-a51 -> A.5.1)
                    let displayId = ctrl.id || '';
                    if (displayId.startsWith('ctrl-')) {
                        const clean = displayId.replace('ctrl-', '');
                        if (clean.startsWith('a')) {
                            const num = clean.substring(1);
                            if (num.length >= 2) {
                                const chapter = num.charAt(0);
                                const controlNum = num.substring(1);
                                displayId = `A.${chapter}.${controlNum}`;
                            } else {
                                displayId = `A.${num.charAt(0)}.0`;
                            }
                        } else {
                            displayId = clean.toUpperCase();
                        }
                    }

                    return [
                        `<span style="font-weight:600; color:var(--accent)">${escapeHTML(displayId)}</span>`,
                        `<div><strong>${escapeHTML(ctrl.title)}</strong><div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px">${escapeHTML(ctrl.description || '').substring(0, 80)}...</div></div>`,
                        cisoSign,
                        ceoSign,
                        window.renderStatusBadge(stageText, stageType),
                        window.renderStatusBadge(ctrl.status || 'IMPLEMENTED', statusType),
                        `<button onclick="window.openGeneratePolicyModal('${proj.id}', '${escapeHTML(displayId)}')" class="btn btn-ghost btn-sm">Visualizar / Gerar</button>`
                    ];
                }),
                { emptyState: 'Nenhuma política cadastrada.' }
            );

            c.innerHTML = `
                ${statsHtml}
                ${tableHtml}
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar Gestão de Políticas: ${escapeHTML(e.message)}</div>`;
        }
    }

    async function openGeneratePolicyModal(projectId, controlIdArg) {
        const controlId = controlIdArg || 'A.5.1';
        
        openModal(`
            <div class="modal-header"><span class="modal-title">Gestão de Política</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div style="padding: 2rem; text-align: center; color: var(--text-dim);">Carregando detalhes do controle...</div>
        `);

        const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
        let ctrl = {};
        let policyText = '';
        let evidenceId = null;

        // 1. Busca a política no endpoint dedicado
        try {
            const policyRes = await api('GET', `/api/v1/projects/${projectId}/controls/${controlId}/policy`);
            if (policyRes) {
                policyText = policyRes.content || '';
                evidenceId = policyRes.evidence_id || null;
                ctrl = policyRes.control || {};
            }
        } catch(e) {
            console.error("Erro ao carregar politica do R2:", e);
        }

        // 2. Fallback caso a requisição falhe ou retorne vazio
        if (!ctrl.id) {
            try {
                const controls = await api('GET', '/api/v1/controls');
                if (Array.isArray(controls)) {
                    ctrl = controls.find(c => c.id === normId) || {};
                    if (!policyText) policyText = ctrl.description || '';
                }
            } catch(e) {}
        }

        let templates = [];
        let options = '';
        try {
            const res = await api('GET', '/api/v1/policies/templates');
            if (res && res.templates) {
                templates = res.templates || [];
                options = templates.map(t => `<option value="${t}">${t}</option>`).join('');
            }
        } catch(e) {
            console.error("Erro ao carregar templates:", e);
        }

        const isDefaultDescription = !policyText || 
                                     policyText === 'Universal ISMS requirement.' || 
                                     policyText.startsWith('SGSI-POLICY-') && policyText.includes('aguardando assinatura');
        const hasPolicy = (policyText && policyText.length > 100 && !isDefaultDescription) || (evidenceId !== null);

        const showGenerationFormHtml = () => {
            const formHtml = `
                <div class="modal-header"><span class="modal-title">Gerar Política ISO — ${escapeHTML(controlId)}</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
                <div class="form-group" style="display:none">
                    <label class="form-label">Controle ISO</label>
                    <input class="form-input" id="policy-control-id" value="${escapeHTML(controlId)}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Método de Geração</label>
                    <select class="form-input" id="policy-gen-method" onchange="togglePolicyGenFields()">
                        <option value="ai">Inteligência Artificial (PolicyAgent)</option>
                        ${options.length ? `<option value="template">Template de Política Standard</option>` : ''}
                    </select>
                </div>

                <div class="form-group" id="policy-template-container" style="display:none">
                    <label class="form-label">Selecione o Template Standard</label>
                    <select class="form-input" id="policy-template-select">
                        ${options}
                    </select>
                </div>

                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem" id="policy-gen-hint">O PolicyAgent irá gerar uma política completa usando IA, adaptada ao contexto organizacional deste projeto.</p>
                <button class="btn btn-primary" id="btn-gen-policy" style="width:100%" onclick="doGeneratePolicy('${projectId}')">Gerar com IA</button>
                <div id="policy-result" style="margin-top:1rem"></div>
            `;
            const modalContent = document.getElementById('modal-content');
            modalContent.innerHTML = formHtml;
        };

        if (hasPolicy) {
            // Buscar histórico de versões da política
            let versions = [];
            try {
                versions = await api('GET', `/api/v1/projects/${projectId}/controls/${controlId}/versions`) || [];
            } catch(e) {}

            

            let cisoStatusHtml = '';
            if (ctrl.ciso_approved_by) {
                cisoStatusHtml = `
                    <div style="width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--success)">✓ Aprovado por ${escapeHTML(ctrl.ciso_approved_by)} em ${new Date(ctrl.ciso_approved_at).toLocaleString()}</span>
                        </div>
                        ${ctrl.ciso_approved_ip ? `<div style="font-size:0.6rem; color:var(--text-dim); margin-top:4px; font-family:monospace; word-break:break-all">Origem: IP ${escapeHTML(ctrl.ciso_approved_ip)} | UA: ${escapeHTML(ctrl.ciso_approved_ua)}</div>` : ''}
                    </div>
                `;
            } else {
                cisoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ciso')">Assinar</button>
                        </div>
                    </div>
                `;
            }

            let ceoStatusHtml = '';
            if (ctrl.ceo_approved_by) {
                ceoStatusHtml = `
                    <div style="width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--success)">✓ Aprovado por ${escapeHTML(ctrl.ceo_approved_by)} em ${new Date(ctrl.ceo_approved_at).toLocaleString()}</span>
                        </div>
                        ${ctrl.ceo_approved_ip ? `<div style="font-size:0.6rem; color:var(--text-dim); margin-top:4px; font-family:monospace; word-break:break-all">Origem: IP ${escapeHTML(ctrl.ceo_approved_ip)} | UA: ${escapeHTML(ctrl.ceo_approved_ua)}</div>` : ''}
                    </div>
                `;
            } else {
                ceoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ceo')">Assinar</button>
                        </div>
                    </div>
                `;
            }

            let versionsSelectHtml = '';
            if (versions.length > 0) {
                versionsSelectHtml = `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
                        <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; min-width:120px">Histórico de Versões:</label>
                        <select class="form-input" style="height:32px; padding:0 8px; font-size:0.75rem; border-radius:6px; background:rgba(255,255,255,0.02); border-color:var(--border); flex:1" id="policy-version-selector" onchange="window.onPolicyVersionChange('${projectId}', '${controlId}', this.value)">
                            ${versions.map((v, index) => `<option value="${v.id}">${index === 0 ? 'v' + v.version + ' (Atual)' : 'v' + v.version} - por ${escapeHTML(v.created_by)} em ${new Date(v.created_at).toLocaleDateString()}</option>`).join('')}
                        </select>
                        <button class="btn" id="btn-restore-version" style="display:none; padding:4px 10px; font-size:0.7rem; border-color:var(--accent); color:var(--accent);" onclick="window.doRestorePolicyVersion('${projectId}', '${controlId}')">Restaurar vX</button>
                    </div>
                `;
            }

            let signatureSealHtml = '';
            const evidenceHash = (typeof policyRes !== 'undefined' && policyRes) ? policyRes.evidence_hash : null;
            if (ctrl.ciso_approved_by || ctrl.ceo_approved_by) {
                signatureSealHtml = `
                    <div style="background: rgba(0, 173, 232, 0.03); border: 1px solid rgba(0, 173, 232, 0.15); border-radius: 12px; padding: 1rem 1.25rem; backdrop-filter: blur(12px);">
                        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem; margin-bottom: 0.6rem;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ade8; box-shadow: 0 0 10px #00ade8;"></div>
                                <span style="font-family: 'Montserrat', sans-serif; font-size: 0.65rem; font-weight: 700; color: #f5f5f7; text-transform: uppercase; letter-spacing: 0.1em;">Selo de Homologação Digital</span>
                            </div>
                            <span style="font-family: 'Montserrat', sans-serif; font-size: 0.55rem; font-weight: 700; color: #00ade8; background: rgba(0, 173, 232, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 173, 232, 0.2);">ISO 27001 CONFORME</span>
                        </div>
                        <div style="font-size: 0.7rem; font-family: monospace; display: flex; flex-direction: column; gap: 4px; color: rgba(229, 235, 255, 0.75);">
                            <div><span style="color: var(--text-dim);">INTEGRIDADE (SHA-256):</span> <span style="color: #00ade8; word-break: break-all;">${evidenceHash || 'Calculando...'}</span></div>
                            <div><span style="color: var(--text-dim);">MÉTODO:</span> Assinatura Eletrônica Simples (Senha & Autenticação de Sessão via HTTPS)</div>
                        </div>
                    </div>
                `;
            }

            let versionsTableHtml = '';
            if (versions.length > 0) {
                versionsTableHtml = `
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:8px">
                        <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Histórico de Alterações & Revisões</h4>
                        <div style="overflow-x:auto">
                            <table style="width:100%; font-size:0.7rem; border-collapse:collapse; background:rgba(255,255,255,0.01); border-radius:8px; border:1px solid rgba(255,255,255,0.05)">
                                <thead>
                                    <tr style="border-bottom:1px solid rgba(255,255,255,0.08); text-align:left; color:var(--text-dim)">
                                        <th style="padding:6px 12px">Versão</th>
                                        <th style="padding:6px 12px">Data</th>
                                        <th style="padding:6px 12px">Modificado por</th>
                                        <th style="padding:6px 12px">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${versions.map((v, i) => `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                                            <td style="padding:6px 12px; font-weight:600; color:var(--accent)">v${v.version}</td>
                                            <td style="padding:6px 12px">${new Date(v.created_at).toLocaleDateString()}</td>
                                            <td style="padding:6px 12px">${escapeHTML(v.created_by)}</td>
                                            <td style="padding:6px 12px">
                                                ${i > 0 ? `<button class="btn btn-ghost" style="padding:2px 6px; font-size:0.6rem; margin:0;" onclick="window.onPolicyVersionChange('${projectId}', '${controlId}', '${v.id}'); document.getElementById('policy-version-selector').value = '${v.id}'; document.getElementById('btn-restore-version').style.display = 'inline-block';">Visualizar</button>` : `<span style="color:var(--success)">Atual (Ativa)</span>`}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            const renderedHtml = window.marked ? window.marked.parse(policyText) : escapeHTML(policyText);
            const html = `
                <div class="modal-header">
                    <span class="modal-title">Política Ativa — ${escapeHTML(controlId)}</span>
                    <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div style="font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif">Título da Política</div>
                    <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.15rem; color:var(--accent)">
                        ${escapeHTML(ctrl.title)}
                    </div>
                    
                    ${versionsSelectHtml}
                    ${signatureSealHtml}

                    <div style="font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif; margin-top:8px">Conteúdo da Política</div>
                    <div id="policy-content-container">
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:1.25rem; max-height:350px; overflow-y:auto; font-size:0.8rem; line-height:1.6; font-family:'Inter',sans-serif;" id="policy-content-text" class="markdown-body">${renderedHtml}</div>
                    </div>
                    
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:8px" id="signature-workflow-container">
                        <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Workflow de Assinatura (A.5.1)</h4>
                        <div style="display:flex; flex-direction:column; gap:0.75rem">
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${cisoStatusHtml}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${ceoStatusHtml}
                            </div>
                        </div>
                    </div>
                    
                    ${versionsTableHtml}
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem">
                        <div style="display:flex; gap:8px">
                            <button class="btn" onclick="forceCloseModal()">Fechar</button>
                            <button class="btn btn-secondary" id="btn-edit-policy">Editar Documento</button>
                            <button class="btn btn-secondary" onclick="window.openPolicyReport('${projectId}', '${controlId}')">Imprimir PDF</button>
                        </div>
                        <button class="btn btn-primary" id="btn-regen-trigger">Regerar com IA / Template</button>
                    </div>
                </div>
            `;
            openModal(html, 'modal-large');
            document.getElementById('btn-regen-trigger').onclick = showGenerationFormHtml;

            let isEditing = false;
            const originalMarkdown = policyText;

            document.getElementById('btn-edit-policy').onclick = function() {
                const container = document.getElementById('policy-content-container');
                const sigContainer = document.getElementById('signature-workflow-container');
                const editBtn = document.getElementById('btn-edit-policy');
                
                if (!isEditing) {
                    // Entrar no modo Editor (Split-screen)
                    isEditing = true;
                    editBtn.textContent = 'Salvar Alterações';
                    editBtn.className = 'btn btn-primary';
                    sigContainer.style.display = 'none'; // Esconde assinaturas durante a edição

                    container.innerHTML = `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; height:400px; margin-top:10px">
                            <div style="display:flex; flex-direction:column; gap:8px; height:100%">
                                <label class="form-label" style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em">Editor Markdown</label>
                                <textarea id="policy-editor-textarea" style="flex:1; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:12px; color:#fff; font-family:monospace; font-size:0.75rem; resize:none; outline:none; line-height:1.4;" placeholder="Digite o conteúdo da política em Markdown...">${escapeHTML(originalMarkdown)}</textarea>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px; height:100%">
                                <label class="form-label" style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em">Preview Renderizado (VSCode Mode)</label>
                                <div id="policy-editor-preview" style="flex:1; overflow-y:auto; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px; font-size:0.8rem; line-height:1.6;" class="markdown-body">${renderedHtml}</div>
                            </div>
                        </div>
                    `;

                    // Lógica de preview em tempo real
                    const textarea = document.getElementById('policy-editor-textarea');
                    const preview = document.getElementById('policy-editor-preview');
                    textarea.oninput = function() {
                        preview.innerHTML = window.marked ? window.marked.parse(this.value) : escapeHTML(this.value);
                    };
                } else {
                    // Salvar as alterações
                    const newContent = document.getElementById('policy-editor-textarea').value;
                    if (!evidenceId) {
                        showToast('Erro: Não há evidência vinculada a este controle para salvar.', 'error');
                        return;
                    }
                    
                    editBtn.disabled = true;
                    editBtn.textContent = 'Salvando...';

                    api('PUT', `/api/v1/evidence/${evidenceId}/content`, { content: newContent })
                        .then(res => {
                            showToast('Política atualizada com sucesso!');
                            forceCloseModal();
                            setTimeout(() => {
                                window.openGeneratePolicyModal(projectId, controlId);
                            }, 300);
                        })
                        .catch(err => {
                            showToast('Erro ao salvar política', 'error');
                            editBtn.disabled = false;
                            editBtn.textContent = 'Salvar Alterações';
                        });
                }
            };
            
            

            window.activeVersionsList = versions;
            window.onPolicyVersionChange = async function(pId, cId, verId) {
                const selected = window.activeVersionsList.find(v => v.id === verId);
                if (!selected) return;
                
                try {
                    const detail = await api('GET', `/api/v1/projects/${pId}/controls/${cId}/versions/${verId}`);
                    document.getElementById('policy-content-text').textContent = detail.policy_text;
                    
                    const restoreBtn = document.getElementById('btn-restore-version');
                    if (restoreBtn) {
                        const isLatest = window.activeVersionsList[0].id === verId;
                        if (isLatest) {
                            restoreBtn.style.display = 'none';
                        } else {
                            restoreBtn.style.display = 'block';
                            restoreBtn.textContent = `Restaurar v${detail.version}`;
                        }
                    }
                } catch (e) {
                    showToast('Erro ao carregar texto da versão', 'error');
                }
            };
            
            window.doRestorePolicyVersion = async function(pId, cId) {
                const selector = document.getElementById('policy-version-selector');
                const verId = selector.value;
                if (!verId) return;
                
                try {
                    const res = await api('POST', `/api/v1/projects/${pId}/controls/${cId}/restore-version`, { version_id: verId });
                    if (res.ok) {
                        showToast('Política restaurada com sucesso');
                        window.openGeneratePolicyModal(pId, cId);
                        render();
                    }
                } catch(e) {
                    showToast('Erro ao restaurar versão', 'error');
                }
            };
        } else {
            showGenerationFormHtml();
        }
    }

    window.togglePolicyGenFields = function() {
        const method = document.getElementById('policy-gen-method').value;
        const container = document.getElementById('policy-template-container');
        const hint = document.getElementById('policy-gen-hint');
        const btn = document.getElementById('btn-gen-policy');

        if (method === 'template') {
            container.style.display = 'block';
            hint.textContent = 'Gere a política a partir de um template standard preenchendo as variáveis do projeto cliente automaticamente.';
            btn.textContent = 'Gerar a partir de Template';
        } else {
            container.style.display = 'none';
            hint.textContent = 'O PolicyAgent ira gerar uma politica completa usando IA, adaptada ao contexto organizacional deste projeto.';
            btn.textContent = 'Gerar com IA';
        }
    };

    async function doGeneratePolicy(projectId) {
        const controlId = document.getElementById('policy-control-id').value || 'A.5.1';
        const method = document.getElementById('policy-gen-method').value || 'ai';
        const templateName = document.getElementById('policy-template-select')?.value;
        const btn = document.getElementById('btn-gen-policy');
        const result = document.getElementById('policy-result');
        
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        result.innerHTML = '<div style="color:var(--muted);font-size:0.75rem">Processando...</div>';

        try {
            let res;
            if (method === 'template') {
                res = await api('POST', `/api/v1/projects/${projectId}/policies/generate-from-template`, {
                    template_name: templateName,
                    control_id: controlId
                });
            } else {
                res = await api('POST', `/api/v1/projects/${projectId}/generate-policy`, { control_id: controlId });
            }
            if (res.ok) {
                let ctrl = {};
                try {
                    const controls = await api('GET', '/api/v1/controls');
                    if (Array.isArray(controls)) {
                        const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
                        ctrl = controls.find(c => c.id === normId) || {};
                    }
                } catch(e) {}

                result.innerHTML = `
                    <div style="font-size:0.5rem;text-transform:uppercase;letter-spacing:0.25em;color:var(--accent);font-weight:500;margin-bottom:0.5rem;font-family:'Montserrat',sans-serif">Política Gerada — ${escapeHTML(controlId)}</div>
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1rem;max-height:180px;overflow-y:auto;font-size:0.75rem;line-height:1.6;white-space:pre-wrap" id="policy-content-text">${escapeHTML(res.policy_markdown)}</div>
                    <div style="margin-top:0.5rem;font-size:0.6rem;color:var(--muted)">Confiança: ${(res.confidence * 100).toFixed(0)}% | Modelo: ${res.metadata?.model || 'AI'}</div>
                    
                    <div style="margin-top:1.5rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:1rem">
                        <h4 style="font-family:'Montserrat',sans-serif;font-size:0.7rem;color:var(--accent);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Workflow de Assinatura (A.5.1)</h4>
                        <div style="display:flex;flex-direction:column;gap:0.75rem">
                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:8px;font-size:0.75rem">
                                <div>
                                    <strong>Líder SGSI:</strong> 
                                    <span id="ciso-sign-status" style="color:var(--text-dim)">${ctrl.ciso_approved_by ? `Aprovado por ${escapeHTML(ctrl.ciso_approved_by)} em ${new Date(ctrl.ciso_approved_at).toLocaleDateString()}` : 'Aguardando assinatura'}</span>
                                </div>
                                ${!ctrl.ciso_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem;font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ciso')">Assinar como Líder SGSI</button>` : ''}
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:8px;font-size:0.75rem">
                                <div>
                                    <strong>Direção Executiva:</strong> 
                                    <span id="ceo-sign-status" style="color:var(--text-dim)">${ctrl.ceo_approved_by ? `Aprovado por ${escapeHTML(ctrl.ceo_approved_by)} em ${new Date(ctrl.ceo_approved_at).toLocaleDateString()}` : 'Aguardando assinatura'}</span>
                                </div>
                                ${!ctrl.ceo_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem;font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ceo')">Assinar como Direção Executiva</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                btn.textContent = 'Gerar outra';
                btn.disabled = false;
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            result.innerHTML = `<div style="color:var(--danger);font-size:0.75rem">Erro: ${escapeHTML(e.message)}</div>`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    window.signPolicy = async function(controlId, role) {
        if (!controlId) {
            alert('Não é possível assinar: ID do controle não mapeado.');
            return;
        }
        const roleLabel = role === 'ciso' ? 'Líder SGSI' : 'Direção Executiva';
        const name = prompt(`Digite seu nome completo para assinar eletronicamente como ${roleLabel}:`);
        if (!name) return;
        const password = prompt(`Digite sua senha de login para confirmar a assinatura eletrônica como ${roleLabel}:`);
        if (!password) return;
        
        try {
            await api('POST', `/api/v1/controls/${controlId}/approve`, { role, approved_by: name, password });
            showToast(`Assinatura registrada com sucesso como ${role.toUpperCase()}!`);
            const statusSpan = document.getElementById(`${role}-sign-status`);
            if (statusSpan) {
                statusSpan.textContent = `Aprovado por ${escapeHTML(name)} em ${new Date().toLocaleDateString()}`;
                statusSpan.style.color = 'var(--accent)';
            }
            const btnClicked = event.target;
            if (btnClicked) btnClicked.style.display = 'none';
            render();
        } catch(e) {
            alert('Erro ao registrar assinatura: ' + e.message);
        }
    };

    async function renderAcknowledgments(c, h, a) {
        h.textContent = 'Ciencia de Politicas';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = ''; 
        
        let acks = [];
        try {
            acks = await api('GET', `/api/v1/projects/${proj.id}/policy-acknowledgments`);
        } catch(e) {
            console.error('Error loading policy acknowledgments', e);
        }
        if (!Array.isArray(acks)) acks = [];

        const totalAcks = acks.length;
        
        const policyNames = {
            'ISP': 'ISP - Politica de Seguranca da Informacao',
            'AUP': 'AUP - Termo de Uso Aceitavel',
            'ACP': 'ACP - Controle de Acesso',
            'IRP': 'IRP - Resposta a Incidentes',
            'BCP': 'BCP - Continuidade de Negocios',
            'DPP': 'DPP - Protecao de Dados',
            'CMP': 'CMP - Gestao de Mudancas',
            'SDP': 'SDP - Desenvolvimento Seguro',
            'VMP': 'VMP - Gestao de Vulnerabilidades',
            'SAP': 'SAP - Conscientizacao em Seguranca'
        };

        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const currentUserEmail = S.user ? S.user.email : '';
        const currentUserName = S.user ? S.user.name || S.user.email.split('@')[0] : '';

        const selfServiceFormHtml = `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Minha Declaracao de Ciencia</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Declare ciencia de forma eletronica sob as diretrizes vigentes das politicas do projeto.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-self-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Seu Nome</label>
                    <input class="form-input" id="ack-self-name" value="${escapeHTML(currentUserName)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <div class="form-group">
                    <label class="form-label">Seu E-mail</label>
                    <input class="form-input" id="ack-self-email" value="${escapeHTML(currentUserEmail)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <button class="btn btn-primary" style="width:100%; margin-top:0.5rem" onclick="window.submitSelfAcknowledgment('${proj.id}')">Assinar Ciencia Eletronica</button>
            </div>
        `;

        const manualFormHtml = canCrud ? `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Registrar Ciencia de Colaborador</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Registrar ciencia eletronica em nome de terceiros ou colaboradores externos.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-manual-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Nome do Colaborador</label>
                    <input class="form-input" id="ack-manual-name" placeholder="Ex: Carlos Oliveira">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail do Colaborador</label>
                    <input class="form-input" id="ack-manual-email" placeholder="Ex: carlos@empresa.com">
                </div>
                <button class="btn" style="width:100%; border-color:var(--accent); color:var(--accent); margin-top:0.5rem" onclick="window.submitManualAcknowledgment('${proj.id}')">Registrar Aceite</button>
            </div>
        ` : '';

        const historyRows = acks.length ? acks.map(a => {
            const policyTitle = policyNames[a.policy_type] || a.policy_type;
            const dateStr = a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString('pt-BR') : 'N/A';
            return `
                <tr>
                    <td style="font-weight: 500;">${escapeHTML(a.user_name)}</td>
                    <td style="color: var(--text-dim); font-size: 0.75rem;">${escapeHTML(a.user_email)}</td>
                    <td><span class="ctx-tag" style="color:var(--accent); border-color:var(--accent-glow)">${escapeHTML(policyTitle)}</span></td>
                    <td style="font-size: 0.75rem; color: var(--text-dim);">${dateStr}</td>
                    <td style="font-size: 0.7rem; font-family: monospace; color: var(--muted);">${escapeHTML(a.ip_address || 'N/A')}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">Nenhum registro de ciencia encontrado para este projeto.</td></tr>`;

        c.innerHTML = `
            <div class="fade-in">
                <div class="card" style="margin-bottom:1.5rem; display:flex; justify-between; align-items:center; flex-wrap:wrap; gap:1.5rem">
                    <div style="display:flex; gap:2rem; align-items:center">
                        <div>
                            <div class="card-label">Assinaturas Registradas</div>
                            <div style="font-size:1.8rem; font-weight:600; color:var(--accent)">${totalAcks}</div>
                        </div>
                        <div>
                            <div class="card-label">Projeto Ativo</div>
                            <div style="font-size:1.1rem; font-weight:500">${escapeHTML(proj.project_name || proj.client_name)}</div>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-primary" onclick="window.copyPublicPolicyPortalLink('${proj.id}')">
                            Copiar Link do Portal Explicito (OTP)
                        </button>
                    </div>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:1.5rem; margin-bottom:2rem;">
                    ${selfServiceFormHtml}
                    ${manualFormHtml}
                </div>

                <div class="card">
                    <div class="card-label">Historico de Ciencia de Politicas</div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Colaborador</th>
                                    <th>E-mail</th>
                                    <th>Politica</th>
                                    <th>Data / Hora</th>
                                    <th>Endereco IP / Origem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historyRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    window.copyPublicPolicyPortalLink = function(projectId) {
        const url = `${window.location.origin}/politicas.html?project=${projectId}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url);
        } else {
            prompt('Copie a URL do Portal de Políticas:', url);
        }
        showToast('Link do Portal de Políticas copiado!');
    };

    window.submitSelfAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-self-policy').value;
        const name = document.getElementById('ack-self-name').value.trim();
        const email = document.getElementById('ack-self-email').value.trim();
        
        if (!policyType || !name || !email) {
            alert('Erro: Nome e E-mail de usuario logado nao identificados.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };

    window.submitManualAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-manual-policy').value;
        const name = document.getElementById('ack-manual-name').value.trim();
        const email = document.getElementById('ack-manual-email').value.trim();

        if (!name || !email) {
            alert('Por favor, preencha o nome e o e-mail do colaborador.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                document.getElementById('ack-manual-name').value = '';
                document.getElementById('ack-manual-email').value = '';
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };

    async function bulkGeneratePolicies(projectId) {
        const controls = prompt('Controles ISO (separados por virgula):\nEx: A.5.1,A.5.2,A.5.3,A.5.4,A.5.8', 'A.5.1,A.5.2,A.5.3,A.5.4,A.5.8,A.5.9,A.5.10');
        if (!controls) return;
        const control_ids = controls.split(',').map(s => s.trim()).filter(Boolean);
        if (!control_ids.length) return;
        const msg = `Gerar ${control_ids.length} politicas via AI? Isso pode levar alguns minutos.`;
        if (!confirm(msg)) return;

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-policies-bulk`, { control_ids });
            if (res.ok) {
                alert(`Bulk Policy Completo!\n\nTotal: ${res.total}\nSucesso: ${res.successful}\nFalhas: ${res.failed}`);
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function migrate27701(projectId) {
        if (!confirm('Migrar SoA para ISO 27701 (PIMS)?\nIsso adicionara controles de privacidade ao sistema.')) return;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/migrate-27701`);
            if (res.ok) {
                alert(`Migracao 27701 Completa!\n\nGaps identificados: ${res.gaps?.length || 0}\nNovos controles: ${res.new_controls_created}\nTransformacao: ${(res.transformation_ratio * 100).toFixed(0)}%`);
                await loadControls();
                render();
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function generateSoA(projectId) {
        if (!confirm('Gerar Statement of Applicability automatico? Isso criara controles no banco de dados.')) return;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-soa`);
            if (res.ok) {
                alert(`SoA Gerado!\n\nTotal: ${res.total} controles avaliados\nAplicaveis: ${res.applicable}\nNao aplicaveis: ${res.not_applicable}\nNovos controles criados: ${res.new_controls_created}`);
                await loadControls();
                render();
            }
        } catch(e) { alert('Erro ao gerar SoA: ' + e.message); }
    }

window.renderControls = renderControls;
window.openControlDetail = openControlDetail;
window.updateControlStatus = updateControlStatus;
window.updateControlMaturity = updateControlMaturity;
window.loadControlEvidence = loadControlEvidence;
window.generatePolicyForControl = generatePolicyForControl;
window.toggleChip = toggleChip;
window.setYesNo = setYesNo;
window.renderSoA = renderSoA;
window.renderEvidence = renderEvidence;
window.openEvidenceUploadModal = openEvidenceUploadModal;
window.doEvidenceUpload = doEvidenceUpload;
window.renderPoliciesDashboard = renderPoliciesDashboard;
window.openGeneratePolicyModal = openGeneratePolicyModal;
window.doGeneratePolicy = doGeneratePolicy;
window.renderAcknowledgments = renderAcknowledgments;
window.bulkGeneratePolicies = bulkGeneratePolicies;
window.migrate27701 = migrate27701;
window.generateSoA = generateSoA;

window.openPolicyReport = function(projectId, controlId) {
    window.open(`/api/v1/projects/${projectId}/controls/${controlId}/policy/report?token=${S.token}`, '_blank');
};
