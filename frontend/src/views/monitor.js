import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

    async function renderMonitor(c, h, a) {
        h.textContent = 'Monitor de Adequação';
        a.innerHTML = ''; // Clear actions
        
        let portfolio = [];
        try { 
            const res = await api('GET', '/api/v1/portfolio'); 
            portfolio = Array.isArray(res) ? res : (res && res.projects ? res.projects : (res && res.portfolio ? res.portfolio : []));
        } catch(e) {
            try {
                const res = await api('GET', '/api/v1/projects');
                portfolio = Array.isArray(res) ? res : (res && res.projects ? res.projects : []);
            } catch(err) {
                portfolio = [];
            }
        }
        if (!Array.isArray(portfolio) || portfolio.length === 0) {
            c.innerHTML = '<div class="empty-state"><h3>Nenhum projeto ativo para monitorar.</h3></div>';
            return;
        }
        
        // Pega o projeto ativo atual
        const p = S.currentProject || S.activeProject || portfolio[0];
        
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            // Puxar as fases detalhadas
            const phases = await api('GET', `/api/v1/projects/${p.id}/phases`);
            
            // Desenhar os cards de métricas (Dashboard)
            const completedPhases = phases.filter(ph => ph.status === 'completed').length;
            const totalPhases = phases.length;
            const progressPct = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
            
            const metricsHtml = `
                <div class="monitor-grid fade-in">
                    <div class="monitor-card">
                        <div class="monitor-card-title">Score Geral GRC</div>
                        <div class="monitor-card-value">${progressPct}%</div>
                        <div class="progress-bar" style="margin-top:0.25rem">
                            <div class="progress-fill" style="width: ${progressPct}%"></div>
                        </div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Fases Concluídas</div>
                        <div class="monitor-card-value">${completedPhases} / ${totalPhases}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Fases da jornada de adequação</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Riscos Mapeados</div>
                        <div class="monitor-card-value">${p.risk_count || 0}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Identificados e mitigados</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Evidências Coletadas</div>
                        <div class="monitor-card-value">${p.evidence_count || 0}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Documentos na nuvem R2</div>
                    </div>
                </div>
            `;
            
            // 2. Definir Jornadas (agrupamento de fases)
            const JOURNEYS = [
                { name: "Jornada 1: Mobilização e Diagnóstico", subtitle: "Entrevistas, escopo e diagnóstico inicial GRC", range: [0, 6] },
                { name: "Jornada 2: Mapeamento e Riscos", subtitle: "Ativos, riscos de segurança/privacidade e SoA", range: [7, 13] },
                { name: "Jornada 3: Implementação SGSI (ISO 27001)", subtitle: "Desenho documental e implementação de controles práticos", range: [14, 20] },
                { name: "Jornada 4: Implementação SGPI (ISO 27701)", subtitle: "Programa de privacidade e conformidade de dados pessoais", range: [21, 28] },
                { name: "Jornada 5: Operação e Auditoria", subtitle: "Treinamentos, métricas, auditoria interna e revisão", range: [29, 33] },
                { name: "Jornada 6: Certificação Oficial", subtitle: "Melhoria contínua e auditoria externa estágio 1 e 2", range: [34, 40] }
            ];

            let roadmapCardsHtml = '';
            
            JOURNEYS.forEach(journeyItem => {
                const jPhases = phases.filter(ph => ph.phase_number >= journeyItem.range[0] && ph.phase_number <= journeyItem.range[1]);
                const completedCount = jPhases.filter(ph => ph.status === 'completed').length;
                const totalCount = jPhases.length;
                const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                roadmapCardsHtml += `
                    <div class="roadmap-j-card">
                        <div class="roadmap-j-header">
                            <div>
                                <div class="roadmap-j-name">${escapeHTML(journeyItem.name)}</div>
                                <div class="roadmap-j-desc">${escapeHTML(journeyItem.subtitle)}</div>
                            </div>
                            <div class="roadmap-j-pct">${percent}%</div>
                        </div>
                        <div class="progress-bar" style="height:4px">
                            <div class="progress-fill" style="width: ${percent}%"></div>
                        </div>
                        <div class="roadmap-nodes-row">
                            ${jPhases.map(ph => `
                                <div class="roadmap-node ${ph.status}" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})">
                                    ${ph.phase_number}
                                    <div class="tooltip">
                                        <strong>Fase ${ph.phase_number}:</strong> ${escapeHTML(ph.title)}
                                        <br>Status: <span style="text-transform: capitalize">${ph.status}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            
            c.innerHTML = `
                <div class="fade-in">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
                        <div>
                            <div style="font-size:0.75rem; color:var(--text-dim)">Dashboard de Acompanhamento</div>
                            <h2 style="font-family:'Montserrat'; font-weight:500; font-size:1.4rem; margin-top:0.25rem">Projeto: ${escapeHTML(p.project_name || p.client_name)}</h2>
                        </div>
                        <div style="display:flex; gap:0.5rem">
                            <button class="btn" onclick="exportCSV('risks')" style="font-size:0.7rem; padding:0.4rem 0.8rem">Exportar Riscos</button>
                            <button class="btn" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})" style="background:var(--accent); color:#000; font-size:0.7rem; padding:0.4rem 0.8rem">Gerenciar Fases</button>
                        </div>
                    </div>
                    
                    ${metricsHtml}
                    
                    <div class="roadmap-container fade-in">
                        <div class="roadmap-title">Roadmap de Adequação — Trilha de Conformidade</div>
                        <div class="roadmap-grid">
                            ${roadmapCardsHtml}
                        </div>
                    </div>
                </div>
            `;
            
        } catch (e) {
            c.innerHTML = `<div class="error">Erro ao carregar monitoramento do projeto: ${e.message}</div>`;
        }
    }

    async function renderPortfolio(c, h, a) {
        h.textContent = 'Monitor';
        a.innerHTML = `<div class="dropdown-wrap"><button class="btn dropdown-trigger" onclick="this.nextElementSibling.classList.toggle('open')">Exportar</button><div class="dropdown-menu"><div class="dropdown-item" onclick="exportCSV('risks')">Riscos CSV</div><div class="dropdown-item" onclick="exportCSV('vendors')">Fornecedores CSV</div><div class="dropdown-item" onclick="exportCSV('training')">Treinamento CSV</div></div></div>`;
        let portfolio = [];
        try { portfolio = await api('GET', '/api/v1/portfolio'); } catch(e) {}
        if (!Array.isArray(portfolio)) portfolio = [];
        c.innerHTML = `<div class="fade-in">${portfolio.length ? portfolio.map(p => {
            const pct = p.overall_progress_pct || 0;
            const semaphore = pct > 70 ? {color:'var(--success)',label:'No prazo'} : pct > 30 ? {color:'var(--warning)',label:'Atencao'} : {color:'var(--danger)',label:'Critico'};
            return `
            <div class="list-item" style="cursor:pointer" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})">
                <div style="display:flex;align-items:center;gap:0.75rem;flex:1">
                    <div style="width:10px;height:10px;border-radius:50%;background:${semaphore.color};flex-shrink:0" title="${semaphore.label}"></div>
                    <div>
                        <div class="item-name">${escapeHTML(p.project_name || p.client_name)}</div>
                        <div class="item-meta" style="margin-top:0.25rem">${p.project_name ? escapeHTML(p.client_name) + ' · ' : ''}Fases: ${p.completed_phases}/${p.phase_count} | Riscos: ${p.risk_count} | Evidencias: ${p.evidence_count}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:80px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:${semaphore.color};border-radius:3px;transition:width 0.3s"></div>
                    </div>
                    <span style="font-size:0.7rem;color:${semaphore.color};font-weight:600">${pct}%</span>
                </div>
            </div>`;
        }).join('') : '<div class="empty-state"><h3>Nenhum projeto no portfolio</h3></div>'}</div>`;
    }

    async function exportCSV(type) {
        const proj = S.activeProject || S.projects[0];
        if (!proj) { alert('Selecione um projeto primeiro'); return; }
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${proj.id}/export/${type}`, { headers });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${type}-${proj.id}.csv`; a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function downloadExecutiveReport(projectId) {
        try {
            const data = await api('GET', `/api/v1/projects/${projectId}/executive-report`);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `executive-report-${projectId}.json`; a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function showGapAnalysis(projectId) {
        try {
            const data = await api('GET', `/api/v1/projects/${projectId}/gap-analysis`);
            const pct = data.coverage_pct || 0;
            const barColor = pct > 80 ? 'var(--accent)' : pct > 50 ? '#feca57' : 'var(--danger)';
            openModal(`
                <div class="modal-header"><span class="modal-title">Gap Analysis</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
                <div style="display:flex;gap:2rem;margin-bottom:1.5rem">
                    <div><div class="card-label">Cobertura</div><div style="font-size:2rem;font-weight:600;color:${barColor}">${pct.toFixed(0)}%</div></div>
                    <div><div class="card-label">Implementados</div><div style="font-size:1.2rem">${data.by_status?.Implemented || 0}</div></div>
                    <div><div class="card-label">Parciais</div><div style="font-size:1.2rem;color:#feca57">${data.by_status?.Partial || 0}</div></div>
                    <div><div class="card-label">Missing</div><div style="font-size:1.2rem;color:var(--danger)">${data.by_status?.Missing || 0}</div></div>
                </div>
                <div style="font-size:0.7rem;color:var(--muted)">Controles com evidencia: ${data.controls_with_evidence || 0} | Controles com risco vinculado: ${data.controls_with_risks || 0}</div>
            `);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function renderCertification(c, h, a) {
        h.textContent = 'Acompanhamento de Certificacao';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        let cert = null;
        try { cert = await api('GET', `/api/v1/projects/${proj.id}/certification`); } catch(e) {}
        if (!cert || !cert.id) {
            a.innerHTML = `<button class="btn btn-primary" onclick="initCertification('${proj.id}')">Iniciar Tracker</button>`;
            c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum tracker de certificacao</h3><p>Clique em Iniciar Tracker para comecar a acompanhar o processo de certificacao.</p></div>';
            return;
        }
        a.innerHTML = '';
        const stages = ['Gap Assessment','Remediation','Internal Audit','Stage 1 Audit','Stage 2 Audit','Certified','Surveillance'];
        const si = stages.indexOf(cert.stage);
        const pct = Math.round(((si + 1) / stages.length) * 100);
        c.innerHTML = `<div class="fade-in">
            <div class="card" style="padding:2.5rem;margin-bottom:1.5rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
                    <div>
                        <div style="font-size:0.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:0.5rem">Estagio Atual</div>
                        <div style="font-size:1.8rem;font-weight:500;font-family:'Montserrat',sans-serif">${cert.stage}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:2.5rem;font-weight:300;color:var(--accent);letter-spacing:-0.05em">${pct}%</div>
                        <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Completude</div>
                    </div>
                </div>
                <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:2rem;position:relative;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--accent), #00d2ff);border-radius:2px;transition:width(0.8s);box-shadow:0 0 15px var(--accent-dim)"></div>
                </div>
                <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
                    ${stages.map((s, i) => `<span style="font-size:0.55rem;padding:0.35rem 0.75rem;border-radius:8px;font-weight:600;letter-spacing:0.05em;background:${i <= si ? 'var(--accent-dim)' : 'var(--surface)'};border:1px solid ${i <= si ? 'var(--accent)' : 'var(--border)'};color:${i <= si ? 'var(--accent)' : 'var(--muted)'}">${s}</span>`).join('')}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria S1</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage1_date || 'TBD'}</div>
                    <div style="font-size:0.6rem;margin-top:0.25rem;color:${cert.stage1_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage1_status || 'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria S2</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage2_date || 'TBD'}</div>
                    <div style="font-size:0.6rem;margin-top:0.25rem;color:${cert.stage2_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage2_status || 'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Registrar</div>
                    <div style="font-size:0.8rem;font-weight:500">${escapeHTML(cert.registrar || 'Não definido')}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Target Date</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.target_date || 'Não definida'}</div>
                </div>
            </div>
            <div style="margin-top:2rem;display:flex;gap:0.75rem;align-items:center;background:rgba(255,255,255,0.02);padding:1.25rem;border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
                <div style="font-size:0.7rem;color:var(--muted);white-space:nowrap">Mudar estagio para:</div>
                <select class="form-select" id="cert-stage" style="max-width:200px;font-size:0.7rem">${stages.map(s => `<option ${s===cert.stage?'selected':''}>${s}</option>`).join('')}</select>
                <button class="btn btn-primary" onclick="updateCertStage('${cert.id}')">Atualizar</button>
            </div>
        </div>`;
    }

    async function initCertification(projectId) {
        await api('POST', `/api/v1/projects/${projectId}/certification`, { standard: 'ISO 27001:2022' });
        render();
    }

    async function updateCertStage(certId) {
        const stage = document.getElementById('cert-stage').value;
        await api('PUT', `/api/v1/certification/${certId}`, { stage });
        render();
    }

    async function renderMetrics(c, h, a) {
        h.textContent = 'Métricas & KPIs do SGSI';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        a.innerHTML = `<button class="btn btn-primary" onclick="openNewMetricModal('${proj.id}')">+ Nova Métrica</button>`;
        
        let metrics = [];
        try { metrics = await api('GET', `/api/v1/projects/${proj.id}/metrics`); } catch(e) {}
        if (!Array.isArray(metrics)) metrics = [];

        const statusColor = st => st === 'Critical' ? 'var(--danger)' : st === 'At Risk' ? 'var(--warning)' : 'var(--success)';
        
        c.innerHTML = `<div class="fade-in">
            ${metrics.length ? `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:1.5rem">
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--success)">${metrics.filter(m => m.status === 'On Track').length}</div>
                        <small style="color:var(--text-dim)">Métricas Em Dia</small>
                    </div>
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--warning)">${metrics.filter(m => m.status === 'At Risk').length}</div>
                        <small style="color:var(--text-dim)">Em Risco</small>
                    </div>
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--danger)">${metrics.filter(m => m.status === 'Critical').length}</div>
                        <small style="color:var(--text-dim)">Críticas</small>
                    </div>
                </div>
                
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome do Indicador</th>
                                <th>Meta</th>
                                <th>Atual</th>
                                <th>Frequência</th>
                                <th>Última Medição</th>
                                <th>Responsável</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${metrics.map(m => `
                                <tr style="cursor:pointer" onclick='openEditMetricModal("${m.id}", "${proj.id}", ${JSON.stringify(m).replace(/'/g, "\\x27")})'>
                                    <td><strong>${escapeHTML(m.metric_name)}</strong></td>
                                    <td>${m.target_value !== null ? m.target_value : '—'}</td>
                                    <td>${m.current_value !== null ? m.current_value : '—'}</td>
                                    <td><span class="badge" style="background:rgba(255,255,255,0.05)">${m.frequency}</span></td>
                                    <td>${m.last_measured_at || '—'}</td>
                                    <td>${escapeHTML(m.owner || '—')}</td>
                                    <td><span class="badge" style="background:${statusColor(m.status)}20; color:${statusColor(m.status)}">${m.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><h3>Nenhuma métrica registrada</h3><p>Defina KPIs de segurança para avaliar o desempenho do SGSI (Cláusula 9.1).</p></div>'}
        </div>`;
    }

    function openNewMetricModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Métrica de Desempenho</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group"><label class="form-label">Nome do Indicador</label><input class="form-input" id="met-name" placeholder="Ex: Taxa de Sucesso dos Backups (%), Patches Críticos (%)"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Meta (Alvo)</label><input type="number" step="any" class="form-input" id="met-target" placeholder="99.9"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Valor Atual</label><input type="number" step="any" class="form-input" id="met-current" placeholder="98.5"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">Frequência</label>
                    <select class="form-input" id="met-frequency">
                        <option value="Weekly">Semanal</option>
                        <option value="Monthly" selected>Mensal</option>
                        <option value="Quarterly">Trimestral</option>
                        <option value="Annual">Anual</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1"><label class="form-label">Última Medição</label><input type="date" class="form-input" id="met-date"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Responsável (Owner)</label><input class="form-input" id="met-owner" placeholder="Ex: CTO"></div>
                <div class="form-group" style="flex:1">
                    <label class="form-label">Status</label>
                    <select class="form-input" id="met-status">
                        <option value="On Track" selected>On Track (Sob Controle)</option>
                        <option value="At Risk">At Risk (Em Risco)</option>
                        <option value="Critical">Critical (Crítico)</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="createMetric('${projectId}')">Registrar Indicador</button>
        `);
        document.getElementById('met-date').value = new Date().toISOString().split('T')[0];
    }

    async function createMetric(projectId) {
        const target = parseFloat(document.getElementById('met-target').value);
        const current = parseFloat(document.getElementById('met-current').value);
        const body = {
            metric_name: document.getElementById('met-name').value,
            target_value: isNaN(target) ? null : target,
            current_value: isNaN(current) ? null : current,
            frequency: document.getElementById('met-frequency').value,
            last_measured_at: document.getElementById('met-date').value,
            owner: document.getElementById('met-owner').value,
            status: document.getElementById('met-status').value
        };
        if (!body.metric_name) return;
        await api('POST', `/api/v1/projects/${projectId}/metrics`, body);
        forceCloseModal(); render();
    }

    function openEditMetricModal(id, projectId, data) {
        const m = data || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Métrica</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group"><label class="form-label">Nome do Indicador</label><input class="form-input" id="met-e-name" value="${escapeHTML(m.metric_name||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Meta</label><input type="number" step="any" class="form-input" id="met-e-target" value="${m.target_value !== null ? m.target_value : ''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Valor Atual</label><input type="number" step="any" class="form-input" id="met-e-current" value="${m.current_value !== null ? m.current_value : ''}"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">Frequência</label>
                    <select class="form-input" id="met-e-frequency">
                        <option value="Weekly" ${m.frequency==='Weekly'?'selected':''}>Semanal</option>
                        <option value="Monthly" ${m.frequency==='Monthly'?'selected':''}>Mensal</option>
                        <option value="Quarterly" ${m.frequency==='Quarterly'?'selected':''}>Trimestral</option>
                        <option value="Annual" ${m.frequency==='Annual'?'selected':''}>Anual</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1"><label class="form-label">Última Medição</label><input type="date" class="form-input" id="met-e-date" value="${m.last_measured_at || ''}"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Responsável</label><input class="form-input" id="met-e-owner" value="${escapeHTML(m.owner||'')}"></div>
                <div class="form-group" style="flex:1">
                    <label class="form-label">Status</label>
                    <select class="form-input" id="met-e-status">
                        <option value="On Track" ${m.status==='On Track'?'selected':''}>On Track</option>
                        <option value="At Risk" ${m.status==='At Risk'?'selected':''}>At Risk</option>
                        <option value="Critical" ${m.status==='Critical'?'selected':''}>Critical</option>
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="if(confirm('Deseja excluir esta métrica?')){api('DELETE','/api/v1/metrics/${id}').then(()=>{forceCloseModal();render()})}">Excluir</button>
                <button class="btn btn-primary" onclick="updateMetric('${id}')">Salvar</button>
            </div>
        `);
    }

    async function updateMetric(id) {
        const target = parseFloat(document.getElementById('met-e-target').value);
        const current = parseFloat(document.getElementById('met-e-current').value);
        const body = {
            metric_name: document.getElementById('met-e-name').value,
            target_value: isNaN(target) ? null : target,
            current_value: isNaN(current) ? null : current,
            frequency: document.getElementById('met-e-frequency').value,
            last_measured_at: document.getElementById('met-e-date').value,
            owner: document.getElementById('met-e-owner').value,
            status: document.getElementById('met-e-status').value
        };
        await api('PUT', `/api/v1/metrics/${id}`, body);
        forceCloseModal(); render();
    }

    async function renderGovernance(c, h, a) {
        h.textContent = 'Governança & Equipe';
        a.innerHTML = '';
        const p = S.currentProject || S.activeProject;
        if (!p) {
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para visualizar a governança.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>';
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const members = await api('GET', `/api/v1/projects/${p.id}/governance`);
            S.currentGovernance = members || [];
            
            c.innerHTML = `
                <div class="card fade-in">
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1.5rem">Organize e gerencie os papéis da equipe do SGSI do seu projeto.</div>
                    ${window.renderProjectGovernance(S.currentGovernance, p.id)}
                </div>
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar governança: ${e.message}</div>`;
        }
    }

    window.renderProjectGovernance = function(members, projectId) {
        const categories = {
            consultor: { label: 'Consultoria / Apoio', list: [] },
            executivo: { label: 'Liderança Executiva', list: [] },
            tech: { label: 'Tecnologia & Produto', list: [] },
            operacoes: { label: 'Operações & Segurança', list: [] }
        };
        
        members.forEach(m => {
            if (categories[m.role_category]) {
                categories[m.role_category].list.push(m);
            }
        });
        
        const getInitials = name => {
            if (!name) return '??';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        };

        let colsHtml = '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const manageBtn = canCrud ? `
            <button class="btn" style="padding:0.25rem 0.75rem; font-size:0.7rem; font-weight:600; height:28px" onclick="window.openGovernanceModal('${projectId}')">
                Gerenciar Governança
            </button>
        ` : '';

        for (const key in categories) {
            const cat = categories[key];
            let membersHtml = cat.list.map(m => {
                const primaryBadge = m.is_primary ? `<span style="font-weight:700; font-size:0.55rem; color:#00ade8; background:rgba(0,173,232,0.12); border:1px solid rgba(0,173,232,0.2); padding:1px 4px; border-radius:4px; margin-left:6px; text-transform:uppercase; font-family:'Montserrat',sans-serif; letter-spacing:0.5px">DPO / Líder</span>` : '';
                const initials = getInitials(m.name);
                return `
                    <div class="gov-member-item">
                        <div class="gov-avatar">${escapeHTML(initials)}</div>
                        <div class="gov-member-info">
                            <div class="gov-member-name">
                                <span>${escapeHTML(m.name)}</span>
                                ${primaryBadge}
                            </div>
                            <div class="gov-member-title">${escapeHTML(m.job_title)}</div>
                            ${m.email ? `<div class="gov-member-email" title="${escapeHTML(m.email)}">${escapeHTML(m.email)}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('') || `<div class="gov-empty-list">Nenhum cadastrado</div>`;
            
            colsHtml += `
                <div class="gov-section-card">
                    <div style="font-size:0.65rem; color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:6px; margin-bottom:8px">${cat.label}</div>
                    <div style="display:flex; flex-direction:column; gap:8px">
                        ${membersHtml}
                    </div>
                </div>
            `;
        }
        
        return `
            <!-- Painel de Governança/Organograma do Projeto -->
            <div style="margin-bottom:1.5rem; padding:20px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:16px; backdrop-filter:blur(24px)">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
                    <div style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:0.85rem; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px">Governança & Organograma do SGSI</div>
                    ${manageBtn}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
                    ${colsHtml}
                </div>
            </div>
        `;
    };

    window.renderGovernanceSelectOptions = function(members, selectedValue) {
        const categories = {
            consultor: { label: 'Consultoria / Apoio', list: [] },
            executivo: { label: 'Liderança Executiva', list: [] },
            tech: { label: 'Tecnologia & Produto', list: [] },
            operacoes: { label: 'Operações & Segurança', list: [] }
        };
        
        members.forEach(m => {
            if (categories[m.role_category]) {
                categories[m.role_category].list.push(m);
            }
        });
        
        let html = '<option value="">Sem responsável</option>';
        for (const key in categories) {
            const cat = categories[key];
            if (cat.list.length > 0) {
                html += `<optgroup label="${escapeHTML(cat.label)}">`;
                cat.list.forEach(m => {
                    const isSelected = m.name === selectedValue ? 'selected' : '';
                    html += `<option value="${escapeHTML(m.name)}" ${isSelected}>${escapeHTML(m.name)} (${escapeHTML(m.job_title)})</option>`;
                });
                html += `</optgroup>`;
            }
        }
        return html;
    };

    window.openGovernanceModal = async function(projectId) {
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Gerenciar Membros da Governança</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div id="gov-modal-body">
                <div class="loading"></div>
            </div>
        `, 'modal-large');
        
        try {
            const members = await api('GET', `/api/v1/projects/${projectId}/governance`);
            window.renderGovernanceModalContent(projectId, members);
        } catch(e) {
            document.getElementById('gov-modal-body').innerHTML = `
                <div style="color:var(--danger)">Erro ao carregar governança: ${escapeHTML(e.message)}</div>
            `;
        }
    };

    window.renderGovernanceModalContent = function(projectId, members) {
        const listHtml = members.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:8px 12px; border-radius:8px; margin-bottom:8px">
                <div>
                    <strong style="color:var(--text)">${escapeHTML(m.name)}</strong>
                    <span style="font-size:0.7rem; color:var(--accent)">- ${escapeHTML(m.job_title)} (${escapeHTML(m.role_category)})</span>
                    ${m.email ? `<div style="font-size:0.65rem; color:var(--text-dim)">${escapeHTML(m.email)}</div>` : ''}
                </div>
                <div style="display:flex; gap:8px">
                    <button class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.65rem; color:var(--accent); border-color:rgba(0,173,232,0.2)" onclick="window.editGovernanceMember('${m.id}')">
                        Editar
                    </button>
                    <button class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.65rem; color:#ef4444; border-color:rgba(239,68,68,0.2)" onclick="window.deleteGovernanceMember('${projectId}', '${m.id}')">
                        Excluir
                    </button>
                </div>
            </div>
        `).join('') || `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding:12px; border:1px dashed var(--border); border-radius:8px; margin-bottom:12px">Nenhum membro cadastrado.</div>`;

        const formHtml = `
            <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:var(--accent); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px" id="gov-form-title">Adicionar Novo Membro</h4>
                <form id="add-gov-member-form" onsubmit="window.saveGovernanceMember(event, '${projectId}')" style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">Nome Completo</label>
                        <input class="form-input" id="gov-name" required placeholder="Ex: Ricardo Esper">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">E-mail</label>
                        <input class="form-input" id="gov-email" type="email" placeholder="Ex: pessoa@exemplo.com.br">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Categoria de Papel</label>
                        <select class="form-input" id="gov-role" required>
                            <option value="consultor">Consultoria / Apoio</option>
                            <option value="executivo">Liderança Executiva</option>
                            <option value="tech">Tecnologia & Produto</option>
                            <option value="operacoes">Operações & Segurança</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cargo / Função</label>
                        <input class="form-input" id="gov-title" required placeholder="Ex: CEO, CFO, DPO, Consultor">
                    </div>
                    <div class="form-group" style="grid-column: span 2; display:flex; align-items:center; gap:8px">
                        <input type="checkbox" id="gov-primary" style="cursor:pointer">
                        <label for="gov-primary" class="form-label" style="margin-bottom:0; cursor:pointer">Contato Principal / DPO Líder</label>
                    </div>
                    <div style="grid-column: span 2; display:flex; justify-content:flex-end; gap:8px; margin-top:8px">
                        <button class="btn btn-secondary" type="button" id="btn-cancel-gov-edit" style="display:none" onclick="window.cancelGovernanceEdit()">Cancelar</button>
                        <button class="btn btn-primary" type="submit" id="btn-submit-gov">Adicionar Membro</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('gov-modal-body').innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr; gap:16px">
                <div>
                    <h4 style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:var(--text); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px">Membros Atuais</h4>
                    <div style="max-height:200px; overflow-y:auto; padding-right:4px">${listHtml}</div>
                </div>
                ${formHtml}
            </div>
        `;
    };

    window.editingMemberId = null;

    window.editGovernanceMember = function(memberId) {
        const member = (S.currentGovernance || []).find(m => m.id === memberId);
        if (!member) return;

        window.editingMemberId = memberId;
        
        document.getElementById('gov-name').value = member.name || '';
        document.getElementById('gov-email').value = member.email || '';
        document.getElementById('gov-role').value = member.role_category || 'consultor';
        document.getElementById('gov-title').value = member.job_title || '';
        document.getElementById('gov-primary').checked = member.is_primary === 1;

        document.getElementById('gov-form-title').textContent = 'Editar Membro da Governança';
        document.getElementById('btn-submit-gov').textContent = 'Salvar Alterações';
        document.getElementById('btn-cancel-gov-edit').style.display = 'inline-block';
    };

    window.cancelGovernanceEdit = function() {
        window.editingMemberId = null;
        document.getElementById('add-gov-member-form').reset();
        document.getElementById('gov-form-title').textContent = 'Adicionar Novo Membro';
        document.getElementById('btn-submit-gov').textContent = 'Adicionar Membro';
        document.getElementById('btn-cancel-gov-edit').style.display = 'none';
    };

    window.saveGovernanceMember = async function(event, projectId) {
        event.preventDefault();
        const name = document.getElementById('gov-name').value;
        const email = document.getElementById('gov-email').value;
        const role_category = document.getElementById('gov-role').value;
        const job_title = document.getElementById('gov-title').value;
        const is_primary = document.getElementById('gov-primary').checked ? 1 : 0;

        const btn = document.getElementById('btn-submit-gov');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const payload = {
                name, email, role_category, job_title, is_primary
            };
            if (window.editingMemberId) {
                payload.id = window.editingMemberId;
            }

            await api('POST', `/api/v1/projects/${projectId}/governance`, payload);
            showToast(window.editingMemberId ? 'Membro da governança atualizado!' : 'Membro da governança adicionado com sucesso!');
            
            window.editingMemberId = null;
            
            const [members, newProgress] = await Promise.all([
                api('GET', `/api/v1/projects/${projectId}/governance`),
                api('GET', `/api/v1/projects/${projectId}/checklist-progress`).catch(() => [])
            ]);
            S.currentGovernance = members;
            
            if (Array.isArray(newProgress)) {
                if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
                newProgress.forEach(row => {
                    S.phaseChecksAssigned[projectId + '_' + row.item_id] = row.assigned_to || '';
                });
            }

            window.renderGovernanceModalContent(projectId, members);
            render(); 
        } catch(e) {
            showToast('Erro ao salvar membro: ' + e.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Adicionar Membro';
        }
    };

    window.deleteGovernanceMember = async function(projectId, memberId) {
        if (!confirm('Deseja realmente excluir este membro da governança?')) return;
        
        try {
            await api('DELETE', `/api/v1/projects/${projectId}/governance/${memberId}`);
            showToast('Membro da governança removido.');
            
            if (window.editingMemberId === memberId) {
                window.cancelGovernanceEdit();
            }
            
            const [members, newProgress] = await Promise.all([
                api('GET', `/api/v1/projects/${projectId}/governance`),
                api('GET', `/api/v1/projects/${projectId}/checklist-progress`).catch(() => [])
            ]);
            S.currentGovernance = members;
            
            if (Array.isArray(newProgress)) {
                if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
                newProgress.forEach(row => {
                    S.phaseChecksAssigned[projectId + '_' + row.item_id] = row.assigned_to || '';
                });
            }

            window.renderGovernanceModalContent(projectId, members);
            render();
        } catch(e) {
            showToast('Erro ao excluir membro: ' + e.message, 'danger');
        }
    };

    async function renderContext(c, h, a) {
        h.textContent = 'Análise de Contexto (Cláusula 4.1 / 4.2)';
        a.innerHTML = '';
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando análise de contexto...</div>';
        try {
            const ctx = await api('GET', `/api/v1/projects/${S.activeProject.id}/context`) || {};
            
            c.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px" class="fade-in">
                    <div class="card" style="grid-column:span 2; padding:24px">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.95rem;margin-bottom:6px;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px">1. Análise SWOT de Segurança da Informação (Cláusula 4.1)</div>
                        <div style="color:var(--text-dim);font-size:0.75rem;margin-bottom:20px;line-height:1.4">Determine as questões internas e externas que afetam a capacidade do SGSI de alcançar seus resultados pretendidos.</div>
                        
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                            <div class="form-group">
                                <label class="form-label" style="color:#00ade8;font-weight:600;display:flex;align-items:center;gap:6px">
                                    <span style="width:6px;height:6px;background:#00ade8;border-radius:50%"></span>
                                    Forças Internas (Strengths)
                                </label>
                                <textarea id="ctx-strengths" class="form-input" style="width:100%;height:110px;resize:vertical;font-family:inherit" placeholder="Ex: Equipe de TI qualificada, liderança engajada...">${escapeHTML(ctx.internal_strengths || '')}</textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="color:#f59e0b;font-weight:600;display:flex;align-items:center;gap:6px">
                                    <span style="width:6px;height:6px;background:#f59e0b;border-radius:50%"></span>
                                    Fraquezas Internas (Weaknesses)
                                </label>
                                <textarea id="ctx-weaknesses" class="form-input" style="width:100%;height:110px;resize:vertical;font-family:inherit" placeholder="Ex: Falta de conscientização de usuários, sistemas legados...">${escapeHTML(ctx.internal_weaknesses || '')}</textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="color:#10b981;font-weight:600;display:flex;align-items:center;gap:6px">
                                    <span style="width:6px;height:6px;background:#10b981;border-radius:50%"></span>
                                    Oportunidades Externas (Opportunities)
                                </label>
                                <textarea id="ctx-opportunities" class="form-input" style="width:100%;height:110px;resize:vertical;font-family:inherit" placeholder="Ex: Migração para nuvem com recursos nativos de segurança...">${escapeHTML(ctx.external_opportunities || '')}</textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="color:#ef4444;font-weight:600;display:flex;align-items:center;gap:6px">
                                    <span style="width:6px;height:6px;background:#ef4444;border-radius:50%"></span>
                                    Ameaças Externas (Threats)
                                </label>
                                <textarea id="ctx-threats" class="form-input" style="width:100%;height:110px;resize:vertical;font-family:inherit" placeholder="Ex: Aumento de ataques ransomware no setor, concorrentes...">${escapeHTML(ctx.external_threats || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card" style="padding:24px">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.95rem;margin-bottom:12px;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px">2. Requisitos Legais / Regulatórios</div>
                        <div class="form-group">
                            <textarea id="ctx-legal" class="form-input" style="width:100%;height:130px;resize:vertical;font-family:inherit" placeholder="Ex: LGPD (Lei 13.709), Resoluções do Banco Central, etc.">${escapeHTML(ctx.legal_requirements || '')}</textarea>
                        </div>
                    </div>
                    
                    <div class="card" style="padding:24px">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.95rem;margin-bottom:12px;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px">3. Requisitos Contratuais</div>
                        <div class="form-group">
                            <textarea id="ctx-contractual" class="form-input" style="width:100%;height:130px;resize:vertical;font-family:inherit" placeholder="Ex: SLAs de segurança exigidos por clientes, termos de auditoria de terceiros...">${escapeHTML(ctx.contractual_requirements || '')}</textarea>
                        </div>
                    </div>
                    
                    <div class="card" style="grid-column:span 2; padding:24px">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.95rem;margin-bottom:12px;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">Notas Gerais</div>
                        <div class="form-group">
                            <textarea id="ctx-notes" class="form-input" style="width:100%;height:90px;resize:vertical;font-family:inherit" placeholder="Observações adicionais...">${escapeHTML(ctx.notes || '')}</textarea>
                        </div>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:flex-end">
                    <button onclick="window.saveContext()" class="btn btn-primary" style="padding:10px 24px; font-weight:600">Salvar Contexto</button>
                </div>
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar contexto: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.saveContext = async function() {
        try {
            const body = {
                internal_strengths: document.getElementById('ctx-strengths').value,
                internal_weaknesses: document.getElementById('ctx-weaknesses').value,
                external_opportunities: document.getElementById('ctx-opportunities').value,
                external_threats: document.getElementById('ctx-threats').value,
                legal_requirements: document.getElementById('ctx-legal').value,
                contractual_requirements: document.getElementById('ctx-contractual').value,
                notes: document.getElementById('ctx-notes').value
            };
            await api('PUT', `/api/v1/projects/${S.activeProject.id}/context`, body);
            showToast('Análise de contexto salva com sucesso');
        } catch(e) {
            showToast('Erro ao salvar contexto', 'error');
        }
    };

    async function renderStakeholders(c, h, a) {
        h.textContent = 'Partes Interessadas (Cláusula 4.2)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = `<button onclick="window.openStakeholderModal()" class="btn btn-primary">+ Novo Stakeholder</button>`;
        
        let list = [];
        try {
            const res = await api('GET', `/api/v1/projects/${proj.id}/stakeholders`);
            list = Array.isArray(res) ? res : (res && Array.isArray(res.stakeholders)) ? res.stakeholders : (res && Array.isArray(res.list)) ? res.list : [];
        } catch(e) {}
        S.stakeholders = list;

        const total = list.length;
        const external = list.filter(s => s.type === 'external' || s.type === 'externo').length;
        const internal = list.filter(s => s.type === 'internal' || s.type === 'interno').length;
        const highInfluence = list.filter(s => (s.influence || '').toLowerCase() === 'high' || (s.influence || '').toLowerCase() === 'alta').length;

        const statsHtml = window.renderStatCards([
            { label: 'Total Partes Interessadas', value: total, color: 'var(--accent)', subtext: 'Mapeadas ISO 27001' },
            { label: 'Partes Externas', value: external, color: '#34c759', subtext: 'Reguladores, Clientes & Operadores' },
            { label: 'Partes Internas', value: internal, color: '#00ade8', subtext: 'Equipes & Diretoria' },
            { label: 'Alta Influência', value: highInfluence, color: highInfluence > 0 ? '#ff3b30' : 'var(--text-dim)', subtext: 'Requisitos prioritários' }
        ]);

        const catLabels = {
            client: 'Cliente',
            regulator: 'Regulador / Auditor',
            shareholder: 'Diretoria / Acionista',
            employee: 'Colaborador',
            supplier: 'Fornecedor / Operador',
            partner: 'Parceiro',
            consultant: 'Consultor'
        };

        const tableHtml = window.renderDataTable(
            ['Parte Interessada', 'Tipo', 'Categoria', 'Expectativas / Requisitos de SI', 'Influência', 'Método de Comunicação', 'Ações'],
            list.map(s => {
                const catLabel = catLabels[s.category] || s.category || 'N/A';
                const isInternal = s.type === 'internal' || s.type === 'interno';
                const influenceLvl = (s.influence || 'Medium').toLowerCase();
                const influenceType = (influenceLvl === 'high' || influenceLvl === 'alta') ? 'danger' : (influenceLvl === 'medium' || influenceLvl === 'média') ? 'warning' : 'neutral';
                const influenceText = (influenceLvl === 'high' || influenceLvl === 'alta') ? 'Alta' : (influenceLvl === 'medium' || influenceLvl === 'média') ? 'Média' : 'Baixa';

                return [
                    `<strong>${escapeHTML(s.name)}</strong>`,
                    window.renderStatusBadge(isInternal ? 'Interno' : 'Externo', isInternal ? 'info' : 'neutral'),
                    escapeHTML(catLabel),
                    `<div style="font-size:0.8rem; line-height:1.45; max-width:300px">${escapeHTML(s.requirements || '')}</div>`,
                    window.renderStatusBadge(influenceText, influenceType),
                    `<div style="font-size:0.8rem; line-height:1.45">${escapeHTML(s.communication_method || '')}</div>`,
                    `<div style="display:flex; gap:6px; justify-content:center">
                        <button onclick="window.openStakeholderModal('${s.id}')" class="btn btn-ghost btn-sm">Editar</button>
                        <button onclick="window.deleteStakeholder('${s.id}')" class="btn btn-ghost btn-sm" style="color:#ff3b30">Excluir</button>
                    </div>`
                ];
            }),
            { emptyState: 'Nenhum stakeholder cadastrado ainda.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openStakeholderModal = function(id = null) {
        const s = id ? S.stakeholders.find(x => x.id === id) : null;
        const isEdit = !!s;
        const html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    ${isEdit ? 'Editar Parte Interessada' : 'Nova Parte Interessada'}
                </span>
                <button class="btn-ghost" onclick="closeModal()">&times;</button>
            </div>
            <form id="stakeholder-form" onsubmit="window.saveStakeholder(event, ${isEdit ? '\'' + s.id + '\'' : 'null'})" style="margin-top:1rem">
                <div class="form-group" style="margin-bottom:16px">
                    <label class="form-label">Nome / Identificação</label>
                    <input type="text" name="name" class="form-input" value="${s ? escapeHTML(s.name) : ''}" required style="width:100%" />
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
                    <div class="form-group">
                        <label class="form-label">Tipo</label>
                        <select name="type" class="form-input" style="width:100%">
                            <option value="external" ${s && s.type === 'external' ? 'selected' : ''}>Externo</option>
                            <option value="internal" ${s && s.type === 'internal' ? 'selected' : ''}>Interno</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Categoria</label>
                        <select name="category" class="form-input" style="width:100%">
                            <option value="client" ${s && s.category === 'client' ? 'selected' : ''}>Cliente</option>
                            <option value="regulator" ${s && s.category === 'regulator' ? 'selected' : ''}>Regulador / Auditor</option>
                            <option value="shareholder" ${s && s.category === 'shareholder' ? 'selected' : ''}>Diretoria / Acionista</option>
                            <option value="employee" ${s && s.category === 'employee' ? 'selected' : ''}>Colaborador</option>
                            <option value="supplier" ${s && s.category === 'supplier' ? 'selected' : ''}>Fornecedor / Operador</option>
                            <option value="partner" ${s && s.category === 'partner' ? 'selected' : ''}>Parceiro</option>
                            <option value="consultant" ${s && s.category === 'consultant' ? 'selected' : ''}>Consultor</option>
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
                    <div class="form-group">
                        <label class="form-label">Nível de Influência</label>
                        <select name="influence" class="form-input" style="width:100%">
                            <option value="Low" ${s && s.influence === 'Low' ? 'selected' : ''}>Baixo</option>
                            <option value="Medium" ${s && s.influence === 'Medium' ? 'selected' : ''}>Médio</option>
                            <option value="High" ${s && s.influence === 'High' ? 'selected' : ''}>Alto</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Método de Comunicação</label>
                        <input type="text" name="communication_method" class="form-input" value="${s ? escapeHTML(s.communication_method || '') : ''}" placeholder="Ex: Email trimestral, Reunião" style="width:100%" />
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:24px">
                    <label class="form-label">Expectativas e Requisitos de SI</label>
                    <textarea name="requirements" class="form-input" style="width:100%;height:80px;font-family:inherit">${s ? escapeHTML(s.requirements || '') : ''}</textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px">
                    <button type="button" onclick="closeModal()" class="btn">Cancelar</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar'}</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveStakeholder = async function(e, id) {
        e.preventDefault();
        const form = document.getElementById('stakeholder-form');
        const formData = new FormData(form);
        const body = {
            name: formData.get('name'),
            type: formData.get('type'),
            category: formData.get('category'),
            influence: formData.get('influence'),
            communication_method: formData.get('communication_method'),
            requirements: formData.get('requirements')
        };
        
        try {
            if (id) {
                await api('PUT', `/api/v1/stakeholders/${id}`, body);
                showToast('Parte interessada atualizada');
            } else {
                await api('POST', `/api/v1/projects/${S.activeProject.id}/stakeholders`, body);
                showToast('Parte interessada cadastrada');
            }
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar stakeholder', 'error');
        }
    };

    window.deleteStakeholder = async function(id) {
        if (!confirm('Deseja realmente deletar este stakeholder?')) return;
        try {
            await api('DELETE', `/api/v1/stakeholders/${id}`);
            showToast('Parte interessada removida');
            render();
        } catch(e) {
            showToast('Erro ao deletar stakeholder', 'error');
        }
    };

    function formatAttendees(attendeesStr) {
        if (!attendeesStr) return '<span style="color:var(--text-dim)">Não definidos</span>';
        const parts = attendeesStr.split(',').map(p => p.trim()).filter(Boolean);
        return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">` + 
            parts.map(part => {
                const match = part.match(/^([^(]+)\s*(?:\(([^)]+)\))?$/);
                if (match) {
                    const name = match[1].trim();
                    const role = match[2] ? match[2].trim() : '';
                    return `
                        <span style="display: inline-flex; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 0.75rem; color: var(--text); line-height: 1;">
                            <span style="font-weight: 400; margin-right: 4px;">${escapeHTML(name)}</span>
                            ${role ? `<span style="color: var(--accent); font-size: 0.65rem; font-weight: 500;">(${escapeHTML(role)})</span>` : ''}
                        </span>
                    `;
                }
                return `<span style="display: inline-flex; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 0.75rem; color: var(--text); line-height: 1;">${escapeHTML(part)}</span>`;
            }).join('') + 
        `</div>`;
    }

    async function renderManagementReview(c, h, a) {
        h.textContent = 'Análise Crítica pela Direção (Cláusula 9.3)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const isOrgUser = S.user && S.user.role === 'org_user';
        a.innerHTML = isOrgUser ? '' : `<button onclick="window.openNewMgmtReviewModal()" class="btn btn-primary">+ Nova Análise Crítica</button>`;
        
        let list = [];
        try {
            const res = await api('GET', `/api/v1/projects/${proj.id}/management-reviews`);
            list = Array.isArray(res) ? res : (res && Array.isArray(res.reviews)) ? res.reviews : (res && Array.isArray(res.list)) ? res.list : [];
        } catch(e) {}
        S.managementReviews = list;

        const totalReviews = list.length;
        const completedReviews = list.filter(m => m.status === 'Completed' || m.status === 'concluido').length;
        const plannedReviews = totalReviews - completedReviews;

        const statsHtml = window.renderStatCards([
            { label: 'Total de Análises Críticas', value: totalReviews, color: 'var(--accent)', subtext: 'Reuniões registradas' },
            { label: 'Reuniões Concluídas', value: completedReviews, color: '#34c759', subtext: 'Ata & decisões emitidas' },
            { label: 'Reuniões Planejadas', value: plannedReviews, color: plannedReviews > 0 ? '#ffcc00' : 'var(--text-dim)', subtext: 'Em agendamento' },
            { label: 'Conformidade Cl. 9.3', value: totalReviews > 0 ? 'Conforme' : 'Pendente', color: totalReviews > 0 ? '#34c759' : '#ff3b30', subtext: 'Requisito ISO 27001' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Data da Análise', 'Participantes (C-Level / Sponsor)', 'Status', 'Ações'],
            list.map(m => {
                const isCompleted = m.status === 'Completed' || m.status === 'concluido';
                return [
                    `<span style="font-weight:600;color:var(--accent);font-family:monospace;font-size:0.85rem">${escapeHTML(m.review_date)}</span>`,
                    formatAttendees(m.attendees),
                    window.renderStatusBadge(isCompleted ? 'Concluída' : 'Planejada', isCompleted ? 'success' : 'warning'),
                    `<button onclick="window.openEditMgmtReviewModal('${m.id}')" class="btn btn-ghost btn-sm">Abrir Pauta / Editar</button>`
                ];
            }),
            { emptyState: 'Nenhuma reunião de análise crítica cadastrada ainda.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openNewMgmtReviewModal = function() {
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Nova Reunião de Análise Crítica (Cláusula 9.3)
            </div>
            <form id="new-mgmt-form" onsubmit="window.saveNewMgmtReview(event)">
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Data da Análise</label>
                    <input type="date" name="review_date" required style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Participantes (C-Level / Sponsor)</label>
                    <textarea name="attendees" required style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Ex: CEO, CISO, DPO, Diretor Jurídico..."></textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Cancelar</button>
                    <button type="submit" class="btn-primary">Criar Reunião</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveNewMgmtReview = async function(e) {
        e.preventDefault();
        const form = document.getElementById('new-mgmt-form');
        const formData = new FormData(form);
        const body = {
            review_date: formData.get('review_date'),
            attendees: formData.get('attendees')
        };
        try {
            await api('POST', `/api/v1/projects/${S.activeProject.id}/management-reviews`, body);
            showToast('Reunião registrada');
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao criar reunião', 'error');
        }
    };

    window.openEditMgmtReviewModal = function(id) {
        const review = S.managementReviews.find(x => x.id === id) || {};
        
        let agenda = { items: [] };
        try {
            agenda = JSON.parse(review.agenda_json || '{"items":[]}');
        } catch (e) {
            console.error("Erro ao analisar agenda_json", e);
        }
        
        let agendaHtml = `<div style="max-height:250px;overflow-y:auto;background:rgba(255,255,255,0.01);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px">`;
        (agenda.items || []).forEach(item => {
            let topicName = '';
            let dataStr = '';
            
            if (typeof item === 'string') {
                topicName = item;
            } else if (item && typeof item === 'object') {
                topicName = item.topic || item.title || item.name || '';
                if (item.data !== undefined) {
                    if (typeof item.data === 'string') {
                        dataStr = item.data;
                    } else if (Array.isArray(item.data)) {
                        dataStr = item.data.map(d => `${d.status || 'N/A'}: ${d.cnt}`).join(', ');
                    } else {
                        dataStr = JSON.stringify(item.data);
                    }
                }
            }
            
            agendaHtml += `
                <div style="margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px">
                    <div style="font-weight:600;color:var(--accent);font-size:0.85rem">${escapeHTML(topicName)}</div>
                    ${dataStr ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px"><strong>Dados consolidados:</strong> ${escapeHTML(dataStr)}</div>` : ''}
                </div>
            `;
        });
        agendaHtml += `</div>`;

        const isOrgUser = S.user && S.user.role === 'org_user';
        const decisionsText = review.decisions || 'Nenhuma decisão registrada ainda.';
        const actionItemsText = review.action_items || 'Nenhuma ação corretiva ou oportunidade definida ainda.';

        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Ata da Análise Crítica (${review.review_date})
            </div>
            
            <div style="margin-bottom:16px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--text)">Participantes</div>
                <div style="font-size:0.85rem;color:var(--text-dim);line-height:1.4">${escapeHTML(review.attendees || 'Não definidos')}</div>
            </div>

            <div style="margin-bottom:16px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--text)">Pauta da Reunião (Cláusula 9.3.2)</div>
                ${agendaHtml}
            </div>

            <div style="margin-bottom:16px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--accent)">Decisões Tomadas (Diretrizes, recursos...)</div>
                <div style="font-size:0.9rem;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHTML(decisionsText)}</div>
            </div>

            <div style="margin-bottom:20px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--accent)">Ações Corretivas / Oportunidades Definidas</div>
                <div style="font-size:0.9rem;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHTML(actionItemsText)}</div>
            </div>

            <div style="margin-bottom:20px; display:flex; align-items:center; gap:8px;">
                <span style="font-weight:600;font-size:0.9rem">Status:</span>
                <span class="badge ${review.status === 'Completed' ? 'badge-implemented' : 'badge-pending'}">${review.status === 'Completed' ? 'Concluída' : 'Planejada'}</span>
            </div>

            <div style="text-align:right">
                <button onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Fechar</button>
                ${!isOrgUser ? `<button onclick="window.openEditMgmtReviewForm('${review.id}')" class="btn-primary">Editar Ata</button>` : ''}
            </div>
        `;
        openModal(html);
    };

    window.openEditMgmtReviewForm = function(id) {
        const review = S.managementReviews.find(x => x.id === id) || {};
        
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Editar Ata da Análise Crítica (${review.review_date})
            </div>
            <form id="edit-mgmt-form" onsubmit="window.saveMgmtReviewDetails(event, '${review.id}')">
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Participantes</label>
                    <textarea name="attendees" required style="width:100%;height:60px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.85rem">${escapeHTML(review.attendees || '')}</textarea>
                </div>
                
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Decisões Tomadas (Diretrizes, recursos...)</label>
                    <textarea name="decisions" style="width:100%;height:150px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.9rem">${escapeHTML(review.decisions || '')}</textarea>
                </div>
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Ações Corretivas / Oportunidades Definidas</label>
                    <textarea name="action_items" style="width:100%;height:150px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.9rem">${escapeHTML(review.action_items || '')}</textarea>
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Status da Reunião</label>
                    <select name="status" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                        <option value="Planned" ${review.status === 'Planned' ? 'selected' : ''}>Planejada</option>
                        <option value="Completed" ${review.status === 'Completed' ? 'selected' : ''}>Concluída</option>
                    </select>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="window.openEditMgmtReviewModal('${review.id}')" class="btn-secondary" style="margin-right:8px">Voltar</button>
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveMgmtReviewDetails = async function(e, id) {
        e.preventDefault();
        const form = document.getElementById('edit-mgmt-form');
        const formData = new FormData(form);
        const body = {
            attendees: formData.get('attendees'),
            decisions: formData.get('decisions'),
            action_items: formData.get('action_items'),
            status: formData.get('status')
        };
        try {
            await api('PUT', `/api/v1/management-reviews/${id}`, body);
            showToast('Dados da análise crítica salvos');
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar detalhes', 'error');
        }
    };

    window.openAuditorNotesModal = async function(projectId) {
        openModal(`
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Notas e Solicitações do Auditor Externo
            </div>
            <div id="auditor-notes-modal-content" style="max-height:400px;overflow-y:auto;margin-bottom:1.5rem">
                Carregando notas...
            </div>
            <div style="text-align:right">
                <button type="button" onclick="closeModal()" class="btn-secondary">Fechar</button>
            </div>
        `);
        
        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/auditor-notes`);
            const notes = res.notes || [];
            
            const container = document.getElementById('auditor-notes-modal-content');
            if (notes.length === 0) {
                container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Nenhuma nota ou solicitação do auditor registrada para este projeto.</div>';
                return;
            }
            
            let html = '<div style="display:flex;flex-direction:column;gap:12px">';
            notes.forEach(n => {
                const typeLabel = n.note_type === 'question' ? 'Pergunta' : n.note_type === 'evidence_request' ? 'Pedido de Evidência' : 'Observação';
                const badgeColor = n.note_type === 'evidence_request' ? 'badge-warning' : n.note_type === 'observation' ? 'badge-critical' : 'badge-info';
                
                html += `
                    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                            <span class="badge ${badgeColor}">${typeLabel}</span>
                            <span style="font-weight:600;color:var(--accent)">${escapeHTML(n.control_standard || 'Geral')}</span>
                        </div>
                        <div style="font-size:0.9rem;margin-bottom:8px;color:var(--text)">${escapeHTML(n.content)}</div>
                        
                        ${n.response ? `
                            <div style="background:rgba(52,199,89,0.05);border:1px solid rgba(52,199,89,0.15);border-radius:8px;padding:8px;font-size:0.85rem;color:#34c759;margin-top:8px">
                                <strong>Sua Resposta:</strong> ${escapeHTML(n.response)}
                            </div>
                        ` : `
                            <div style="margin-top:8px;display:flex;gap:8px">
                                <input type="text" id="respond-input-${n.id}" placeholder="Escreva a resposta para o auditor..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:0.85rem" />
                                <button onclick="window.submitAuditorResponse('${n.id}', '${projectId}')" class="btn-primary" style="padding:6px 12px;font-size:0.85rem;border-radius:8px;border:none;background:var(--accent);color:#070b14;font-weight:700">Responder</button>
                            </div>
                        `}
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch(e) {
            document.getElementById('auditor-notes-modal-content').innerHTML = '<div style="color:red">Erro ao carregar notas do auditor.</div>';
        }
    };

    window.submitAuditorResponse = async function(noteId, projectId) {
        const input = document.getElementById(`respond-input-${noteId}`);
        const response = input.value.trim();
        if (!response) return;
        
        try {
            await api('PUT', `/api/v1/auditor-notes/${noteId}/respond`, { response });
            showToast('Resposta enviada com sucesso');
            window.openAuditorNotesModal(projectId);
        } catch(e) {
            showToast('Erro ao enviar resposta', 'error');
        }
    };

    async function renderAssets(c, h, a) {
        h.textContent = 'Ativos de Informação';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = `<button class="btn" onclick="exportCSV('assets')" style="margin-right:8px">Exportar CSV</button>` + (canCrud ? `<button class="btn btn-primary" onclick="window.openNewAssetModal('${proj.id}')">+ Novo Ativo</button>` : '');
        
        let assets = [];
        try { 
            const res = await api('GET', `/api/v1/projects/${proj.id}/assets`); 
            assets = Array.isArray(res) ? res : (res && Array.isArray(res.assets)) ? res.assets : [];
        } catch(e) {}
        S.assets = assets;

        const totalAssets = assets.length;
        const confidentialCount = assets.filter(ast => ast.classification === 'Confidential').length;
        const restrictedCount = assets.filter(ast => ast.classification === 'Restricted' || ast.classification === 'Internal').length;
        const activeCount = assets.filter(ast => ast.status === 'Active' || !ast.status).length;

        const statsHtml = window.renderStatCards([
            { label: 'Total de Ativos', value: totalAssets, color: 'var(--accent)', subtext: 'Inventário SGSI' },
            { label: 'Confidenciais / Críticos', value: confidentialCount, color: confidentialCount > 0 ? '#ff3b30' : '#34c759', subtext: 'Proteção máxima' },
            { label: 'Restritos / Internos', value: restrictedCount, color: '#ffcc00', subtext: 'Uso corporativo' },
            { label: 'Ativos Operacionais', value: activeCount, color: '#34c759', subtext: 'Em uso ativo' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Nome do Ativo', 'Categoria', 'Localização', 'Proprietário (Owner)', 'Classificação', 'Status', 'Ações'],
            assets.map(ast => {
                const classType = ast.classification === 'Confidential' ? 'danger' : ast.classification === 'Restricted' ? 'warning' : 'info';
                const statusType = ast.status === 'Active' || !ast.status ? 'success' : 'neutral';

                return [
                    `<strong>${escapeHTML(ast.name)}</strong>`,
                    escapeHTML(ast.category || 'Geral'),
                    escapeHTML(ast.location || 'N/A'),
                    escapeHTML(ast.owner || 'N/A'),
                    window.renderStatusBadge(ast.classification || 'Internal', classType),
                    window.renderStatusBadge(ast.status || 'Active', statusType),
                    `<button class="btn btn-ghost btn-sm" onclick="window.openAssetDetailsModal('${ast.id}')">Detalhes</button>`
                ];
            }),
            { emptyState: 'Nenhum ativo de informação registrado neste projeto.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openAssetDetailsModal = function(id) {
        const ast = S.assets.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const classColor = cl => cl === 'Confidential' ? 'var(--danger)' : cl === 'Restricted' ? 'var(--warning)' : cl === 'Internal' ? 'var(--info)' : 'var(--accent)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Ativo de Informação</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.4rem; color:var(--accent)">
                    ${escapeHTML(ast.name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.category || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Classificação de Segurança</div>
                        <span class="ctx-tag" style="background:${classColor(ast.classification)}20; color:${classColor(ast.classification)}; font-weight:600">${ast.classification || 'Internal'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Dono (Owner)</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.owner || 'Não definido')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Localização / Ambiente</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.location || 'Não especificado')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status do Ativo</div>
                        <span class="ctx-tag" style="background:rgba(255,255,255,0.05); color:var(--text-dim); font-weight:600">${ast.status || 'Active'}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditAssetModal('${id}')">Editar Ativo</button>` : ''}
            </div>
        `);
    };

    window.openNewAssetModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Ativo</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Ativo</label><input class="form-input" id="ast-name" placeholder="Ex: Banco de dados RDS Prod, Código-Fonte GitHub"></div>
            <div class="form-group">
                <label class="form-label">Categoria</label>
                <select class="form-input" id="ast-category">
                    <option value="Informacao">Informacao (Dados, Documentos, Segredos)</option>
                    <option value="Software">Software (APIs, Sistemas, Apps, Scripts)</option>
                    <option value="Hardware">Hardware (Servidores, Computadores, Dispositivos)</option>
                    <option value="Pessoas">Pessoas (Colaboradores, Terceiros, Donos)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Classificacao</label>
                <select class="form-input" id="ast-classification">
                    <option value="Confidential">Confidential (Apenas Alta Lideranca)</option>
                    <option value="Restricted">Restricted (Uso Interno Protegido)</option>
                    <option value="Internal" selected>Internal (Uso Interno Geral)</option>
                    <option value="Public">Public (Livre Acesso)</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Dono (Owner)</label><input class="form-input" id="ast-owner" placeholder="Ex: IT Manager"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Localizacao</label><input class="form-input" id="ast-location" placeholder="Ex: AWS us-east-1"></div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="window.createAsset('${projectId}')">Registrar Ativo</button>
        `);
    };

    window.createAsset = async function(projectId) {
        const body = { name: document.getElementById('ast-name').value, category: document.getElementById('ast-category').value, classification: document.getElementById('ast-classification').value, owner: document.getElementById('ast-owner').value, location: document.getElementById('ast-location').value };
        if (!body.name) return;
        await api('POST', `/api/v1/projects/${projectId}/assets`, body);
        forceCloseModal(); render();
    };

    window.openEditAssetModal = function(id) {
        const ast = S.assets.find(x => x.id === id) || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Ativo</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Ativo</label><input class="form-input" id="ast-e-name" value="${escapeHTML(ast.name||'')}"></div>
            <div class="form-group">
                <label class="form-label">Categoria</label>
                <select class="form-input" id="ast-e-category">
                    <option value="Informacao" ${ast.category==='Informacao'?'selected':''}>Informacao (Dados, Documentos)</option>
                    <option value="Software" ${ast.category==='Software'?'selected':''}>Software (APIs, Sistemas)</option>
                    <option value="Hardware" ${ast.category==='Hardware'?'selected':''}>Hardware (Servidores, Computadores)</option>
                    <option value="Pessoas" ${ast.category==='Pessoas'?'selected':''}>Pessoas (Colaboradores)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Classificacao</label>
                <select class="form-input" id="ast-e-classification">
                    <option value="Confidential" ${ast.classification==='Confidential'?'selected':''}>Confidential</option>
                    <option value="Restricted" ${ast.classification==='Restricted'?'selected':''}>Restricted</option>
                    <option value="Internal" ${ast.classification==='Internal'?'selected':''}>Internal</option>
                    <option value="Public" ${ast.classification==='Public'?'selected':''}>Public</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Dono</label><input class="form-input" id="ast-e-owner" value="${escapeHTML(ast.owner||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Localizacao</label><input class="form-input" id="ast-e-location" value="${escapeHTML(ast.location||'')}"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-input" id="ast-e-status">
                    <option value="Active" ${ast.status==='Active'?'selected':''}>Active</option>
                    <option value="Inactive" ${ast.status==='Inactive'?'selected':''}>Inactive</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteAsset('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateAsset('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateAsset = async function(id) {
        const body = { name: document.getElementById('ast-e-name').value, category: document.getElementById('ast-e-category').value, classification: document.getElementById('ast-e-classification').value, owner: document.getElementById('ast-e-owner').value, location: document.getElementById('ast-e-location').value, status: document.getElementById('ast-e-status').value };
        await api('PUT', `/api/v1/assets/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteAsset = async function(id) {
        if (confirm('Deseja excluir este ativo?')) { await api('DELETE', `/api/v1/assets/${id}`); forceCloseModal(); render(); }
    };

window.renderMonitor = renderMonitor;
window.renderPortfolio = renderPortfolio;
window.exportCSV = exportCSV;
window.downloadExecutiveReport = downloadExecutiveReport;
window.showGapAnalysis = showGapAnalysis;
window.renderCertification = renderCertification;
window.initCertification = initCertification;
window.updateCertStage = updateCertStage;
window.renderMetrics = renderMetrics;
window.openNewMetricModal = openNewMetricModal;
window.createMetric = createMetric;
window.openEditMetricModal = openEditMetricModal;
window.updateMetric = updateMetric;
window.renderGovernance = renderGovernance;
window.renderContext = renderContext;
window.renderStakeholders = renderStakeholders;
window.renderManagementReview = renderManagementReview;
window.renderAssets = renderAssets;
