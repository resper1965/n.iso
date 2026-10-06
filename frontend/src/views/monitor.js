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
                        <div style="font-size:0.75rem; color:var(--text-dim)">Fases da jornada de adequação</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Riscos Mapeados</div>
                        <div class="monitor-card-value">${p.risk_count || 0}</div>
                        <div style="font-size:0.75rem; color:var(--text-dim)">Identificados e mitigados</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Evidências Coletadas</div>
                        <div class="monitor-card-value">${p.evidence_count || 0}</div>
                        <div style="font-size:0.75rem; color:var(--text-dim)">Documentos na nuvem R2</div>
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
                                <div class="roadmap-node ${ph.status}" data-action="navigate" data-args='["project-detail",{"currentProject":{"id":"${p.id}"}}]'>
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
                            <button class="btn" data-action="exportCSV" data-args='["risks"]' style="font-size:0.7rem; padding:0.4rem 0.8rem">Exportar Riscos</button>
                            <button class="btn" data-action="navigate" data-args='["project-detail",{"currentProject":{"id":"${p.id}"}}]' style="background:var(--accent); color:#000; font-size:0.7rem; padding:0.4rem 0.8rem">Gerenciar Fases</button>
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
            c.innerHTML = `<div class="error">Erro ao carregar monitoramento do projeto: ${escapeHTML(e.message)}</div>`;
        }
    }

    async function renderPortfolio(c, h, a) {
        h.textContent = 'Monitor';
        a.innerHTML = `<div class="dropdown-wrap"><button class="btn dropdown-trigger" data-action="__monToggleDropdown" data-arg-el>Exportar</button><div class="dropdown-menu"><div class="dropdown-item" data-action="exportCSV" data-args='["risks"]'>Riscos CSV</div><div class="dropdown-item" data-action="exportCSV" data-args='["vendors"]'>Fornecedores CSV</div><div class="dropdown-item" data-action="exportCSV" data-args='["training"]'>Treinamento CSV</div></div></div>`;
        let portfolio = [];
        try { portfolio = await api('GET', '/api/v1/portfolio'); } catch(e) {}
        if (!Array.isArray(portfolio)) portfolio = [];
        c.innerHTML = `<div class="fade-in">${portfolio.length ? portfolio.map(p => {
            const pct = p.overall_progress_pct || 0;
            const semaphore = pct > 70 ? {color:'var(--success)',label:'No prazo'} : pct > 30 ? {color:'var(--warning)',label:'Atencao'} : {color:'var(--danger)',label:'Critico'};
            return `
            <div class="list-item" style="cursor:pointer" data-action="navigate" data-args='["project-detail",{"currentProject":{"id":"${p.id}"}}]'>
                <div style="display:flex;align-items:center;gap:0.75rem;flex:1">
                    <div style="width:10px;height:10px;border-radius:50%;background:${semaphore.color};flex-shrink:0" title="${semaphore.label}"></div>
                    <div>
                        <div class="item-name">${escapeHTML(p.project_name || p.client_name)}</div>
                        <div class="item-meta" style="margin-top:0.25rem">${p.project_name ? escapeHTML(p.client_name) + ' · ' : ''}Fases: ${p.completed_phases}/${p.phase_count} | Riscos: ${p.risk_count} | Evidências: ${p.evidence_count}</div>
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

    async function showGapAnalysis(projectId) {
        try {
            const data = await api('GET', `/api/v1/projects/${projectId}/gap-analysis`);
            const pct = data.coverage_pct || 0;
            const barColor = pct > 80 ? 'var(--accent)' : pct > 50 ? '#feca57' : 'var(--danger)';
            openModal(`
                <div class="modal-header"><span class="modal-title">Gap Analysis</span><button class="btn-ghost" data-action="forceCloseModal">\u00d7</button></div>
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
        h.textContent = 'Acompanhamento de Certificação';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        let cert = null;
        try { cert = await api('GET', `/api/v1/projects/${proj.id}/certification`); } catch(e) {}
        if (!cert || !cert.id) {
            a.innerHTML = `<button class="btn btn-primary" data-action="initCertification" data-args='["${proj.id}"]'>Iniciar Tracker</button>`;
            c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum tracker de certificação</h3><p>Clique em Iniciar Tracker para começar a acompanhar o processo de certificação.</p></div>';
            return;
        }
        a.innerHTML = '';
        const stages = ['Gap Assessment','Remediation','Internal Audit','Stage 1 Audit','Stage 2 Audit','Certified','Surveillance'];
        const STAGE_MAP_PT = {
            'Gap Assessment': 'Avaliação de Gaps',
            'Remediation': 'Remediação & Implementação',
            'Internal Audit': 'Auditoria Interna',
            'Stage 1 Audit': 'Auditoria Estágio 1 (Documental)',
            'Stage 2 Audit': 'Auditoria Estágio 2 (Certificação)',
            'Certified': 'Certificado ISO 27001',
            'Surveillance': 'Manutenção & Vigilância'
        };
        const si = stages.indexOf(cert.stage);
        const pct = Math.round(((si + 1) / stages.length) * 100);
        c.innerHTML = `<div class="fade-in">
            <div class="card" style="padding:2.5rem;margin-bottom:1.5rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
                    <div>
                        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:0.5rem">Estágio Atual</div>
                        <div style="font-size:1.8rem;font-weight:500;font-family:'Montserrat',sans-serif;color:var(--text)">${STAGE_MAP_PT[cert.stage] || cert.stage}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:2.5rem;font-weight:300;color:var(--accent);letter-spacing:-0.05em">${pct}%</div>
                        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Completude</div>
                    </div>
                </div>
                <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:2rem;position:relative;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--accent), #00d2ff);border-radius:2px;transition:width(0.8s);box-shadow:0 0 15px var(--accent-dim)"></div>
                </div>
                <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
                    ${stages.map((s, i) => `<span style="font-size:0.72rem;padding:0.35rem 0.75rem;border-radius:8px;font-weight:600;letter-spacing:0.05em;background:${i <= si ? 'var(--accent-dim)' : 'var(--surface)'};border:1px solid ${i <= si ? 'var(--accent)' : 'var(--border)'};color:${i <= si ? 'var(--accent)' : 'var(--muted)'}">${STAGE_MAP_PT[s] || s}</span>`).join('')}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria Estágio 1</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage1_date || 'A definir'}</div>
                    <div style="font-size:0.72rem;margin-top:0.25rem;color:${cert.stage1_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage1_status==='Passed'?'Aprovado':'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria Estágio 2</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage2_date || 'A definir'}</div>
                    <div style="font-size:0.72rem;margin-top:0.25rem;color:${cert.stage2_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage2_status==='Passed'?'Aprovado':'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Organismo Certificador</div>
                    <div style="font-size:0.8rem;font-weight:500">${escapeHTML(cert.registrar || 'Não definido')}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Data Meta</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.target_date || 'Não definida'}</div>
                </div>
            </div>
            <div style="margin-top:2rem;display:flex;gap:0.75rem;align-items:center;background:rgba(255,255,255,0.02);padding:1.25rem;border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
                <div style="font-size:0.7rem;color:var(--muted);white-space:nowrap">Mudar estágio para:</div>
                <select class="form-select" id="cert-stage" style="max-width:260px;font-size:0.75rem">${stages.map(s => `<option value="${s}" ${s===cert.stage?'selected':''}>${STAGE_MAP_PT[s] || s}</option>`).join('')}</select>
                <button class="btn btn-primary" data-action="updateCertStage" data-args='["${cert.id}"]'>Atualizar</button>
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
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        a.innerHTML = `<button class="btn btn-primary" data-action="openNewMetricModal" data-args='["${proj.id}"]'>+ Nova Métrica</button>`;
        
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
                                <tr style="cursor:pointer" data-action="openEditMetricModal" data-args='${escapeHTML(JSON.stringify([m.id, proj.id, m]))}'>
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
            <div class="modal-header"><span class="modal-title">Nova Métrica de Desempenho</span><button class="btn-ghost" data-action="forceCloseModal">\u00d7</button></div>
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
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" data-action="createMetric" data-args='["${projectId}"]'>Registrar Indicador</button>
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
            <div class="modal-header"><span class="modal-title">Editar Métrica</span><button class="btn-ghost" data-action="forceCloseModal">\u00d7</button></div>
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
                <button class="btn" style="color:var(--danger)" data-action="__monDeleteMetric" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateMetric" data-args='["${id}"]'>Salvar</button>
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

    // Quem designa consultor na governança (mesma regra do servidor, #210):
    // platform_admin ou o administrador do cliente. Só decide o que MOSTRAR.
    const podeDesignarConsultor = () => !!(S.user && (S.user.role === 'platform_admin' || S.user.role === 'org_admin'));
    // Quem edita a governança pela tela. O org_admin entra desde o #210: é ele
    // quem designa o consultor do próprio cliente.
    const podeEditarGovernanca = () => !!(S.user && ['platform_admin', 'consultor', 'consultant', 'org_admin'].includes(S.user.role));

    // Quem convida e revoga stakeholder (o servidor decide de verdade; isto só mostra os botões).
    const podeConvidarStakeholder = () => !!(S.user && ['platform_admin', 'consultoria_admin', 'consultor', 'consultant', 'org_admin'].includes(S.user.role));

    async function renderGovernance(c, h, a) {
        h.textContent = 'Governança & Equipe';
        a.innerHTML = '';
        const p = S.currentProject || S.activeProject;
        if (!p) {
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para visualizar a governança.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const members = await api('GET', `/api/v1/projects/${p.id}/governance`);
            S.currentGovernance = members || [];
            c.innerHTML = `<div class="fade-in">${window.renderProjectGovernance(S.currentGovernance, p.id)}<div id="gov-agentes"></div></div>`;
            window.carregarAgentesDoProjeto(p.id);
            window.agentesAoVivo(p.id);
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar governança: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.renderProjectGovernance = function(members, projectId) {
        // Organograma (D6): o Líder do SGSI (is_primary, um por projeto) é a
        // ÂNCORA no topo; abaixo, um tronco desce para uma coluna por área.
        // A âncora não se repete nas colunas.
        const categories = {
            executivo: { label: 'Liderança Executiva', list: [] },
            tech: { label: 'Tecnologia & Produto', list: [] },
            operacoes: { label: 'Operações & Segurança', list: [] },
            consultor: { label: 'Consultoria / Apoio', list: [] }
        };

        const getInitials = name => {
            if (!name) return '??';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        };

        const anchor = members.find(m => m.is_primary) || null;
        members.forEach(m => {
            if (anchor && m.id === anchor.id) return;
            if (categories[m.role_category]) categories[m.role_category].list.push(m);
        });

        const manageBtn = podeEditarGovernanca() ? `
            <button class="btn btn-secondary" data-action="openGovernanceModal" data-args='["${projectId}"]'>Gerenciar governança</button>` : '';

        // Convite e revogação nascem da linha da matriz; sem e-mail, ou para a equipe da consultoria, não há o que convidar.
        const acoesAcesso = (m) => (podeConvidarStakeholder() && m.email && m.role_category !== 'consultor') ? `
                <div class="gov-member-acoes">
                    <button class="btn btn-secondary" data-action="convidarStakeholder" data-args='["${escapeHTML(projectId)}","${escapeHTML(m.id)}"]'>Convidar para o n.iso</button>
                    <button class="btn btn-secondary" data-action="revogarStakeholder" data-args='["${escapeHTML(projectId)}","${escapeHTML(m.id)}"]'>Revogar acesso</button>
                </div>` : '';

        const memberCard = (m) => `
            <div class="gov-member-item">
                <div class="gov-avatar" aria-hidden="true">${escapeHTML(getInitials(m.name))}</div>
                <div class="gov-member-info">
                    <div class="gov-member-name">${escapeHTML(m.name)}</div>
                    <div class="gov-member-title">${escapeHTML(m.job_title)}</div>
                    ${m.email ? `<div class="gov-member-email" title="${escapeHTML(m.email)}">${escapeHTML(m.email)}</div>` : ''}
                </div>
                ${acoesAcesso(m)}
            </div>`;

        const anchorHtml = anchor ? `
            <div class="org-anchor">
                <div class="gov-avatar org-anchor-avatar" aria-hidden="true">${escapeHTML(getInitials(anchor.name))}</div>
                <div class="org-anchor-info">
                    <div class="org-anchor-name"><span>${escapeHTML(anchor.name)}</span><span class="org-badge">Líder do SGSI</span></div>
                    <div class="org-anchor-title">${escapeHTML(anchor.job_title)}</div>
                    ${anchor.email ? `<div class="gov-member-email org-anchor-email" title="${escapeHTML(anchor.email)}">${escapeHTML(anchor.email)}</div>` : ''}
                </div>
                ${acoesAcesso(anchor)}
            </div>` : `
            <div class="org-anchor org-anchor-empty">
                <div class="org-anchor-name">Líder do SGSI não designado</div>
                <div class="org-anchor-title">Marque o responsável em “Gerenciar governança”.</div>
            </div>`;

        let branchesHtml = '';
        for (const key in categories) {
            const cat = categories[key];
            const membersHtml = cat.list.map(memberCard).join('') || `<div class="gov-empty-list">Ninguém nesta área.</div>`;
            branchesHtml += `
                <div class="org-branch">
                    <section class="gov-section-card" aria-label="${escapeHTML(cat.label)}">
                        <h3 class="gov-section-title">${cat.label}</h3>
                        ${membersHtml}
                    </section>
                </div>`;
        }

        return `
            <div class="org-chart">
                <div class="org-header">
                    <p class="org-header-intro">Quem responde pelo SGSI deste cliente, por área. O líder é um só; consultores são designados pelo administrador do cliente.</p>
                    ${manageBtn}
                </div>
                ${anchorHtml}
                <div class="org-trunk" aria-hidden="true"></div>
                <div class="org-branches">${branchesHtml}</div>
            </div>`;
    };

    // Agentes de IA (MCP remoto) com acesso a este projeto. Sem a rota (404) ou
    // sem permissão (403), o bloco simplesmente não aparece.
    // O banco grava em UTC ("2026-09-30 22:58:05", sem fuso). Mostrar cru fazia "20:49" aparecer
    // quando eram 17:49 no relógio de quem olhava, e parecia que o agente tinha parado.
    const comoData = (v) => {
        if (!v) return null;
        const s = String(v);
        const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? null : d;
    };
    const dataLocal = (v) => {
        const d = comoData(v);
        return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    };
    const haQuanto = (v) => {
        const d = comoData(v);
        if (!d) return '';
        const min = Math.floor((Date.now() - d.getTime()) / 60000);
        if (min < 1) return 'há menos de 1 min';
        if (min < 60) return `há ${min} min`;
        if (min < 1440) return `há ${Math.floor(min / 60)} h`;
        return `há ${Math.floor(min / 1440)} d`;
    };

    // `manter`: nos ciclos automáticos, uma falha de rede NÃO apaga o cartão que já está na tela.
    // Só a primeira carga esconde o bloco (sem a rota ou sem permissão).
    window.carregarAgentesDoProjeto = async function(projectId, { manter = false } = {}) {
        const alvo = document.getElementById('gov-agentes');
        if (!alvo) return;
        let lista;
        try { lista = await api('GET', `/api/v1/projects/${projectId}/agentes`); } catch (e) { if (!manter) alvo.innerHTML = ''; return; }
        if (!Array.isArray(lista)) { if (!manter) alvo.innerHTML = ''; return; }
        const podeRevogar = (ag) => S.user && (S.user.role === 'platform_admin' || S.user.role === 'org_admin' || ((S.user.role === 'consultor' || S.user.role === 'consultant') && ag.consultor === S.user.email));
        const data = (v) => escapeHTML(dataLocal(v));
        const ultimoUso = (v) => v ? `${data(v)} (${haQuanto(v)})` : 'nunca';
        const linhas = lista.map(ag => {
            const revogado = !!ag.revogado_em;
            return `
            <div class="gov-agente ${revogado ? 'gov-agente-revogado' : ''}">
                <div>
                    <div class="gov-member-name">${escapeHTML(ag.consultor)} · ${escapeHTML(ag.cliente_mcp || 'cliente MCP')}</div>
                    <div class="gov-agente-meta">desde ${data(ag.criado_em)} · último uso ${ultimoUso(ag.ultimo_uso_em)} · ${revogado ? `revogado em ${data(ag.revogado_em)}` : `válido até ${data(ag.expira_em)}`}</div>
                </div>
                ${!revogado && podeRevogar(ag) ? `<button class="btn btn-secondary" data-action="revogarAgente" data-args='["${escapeHTML(projectId)}","${escapeHTML(ag.id)}"]'>Revogar</button>` : ''}
            </div>`;
        }).join('');
        alvo.innerHTML = `
            <section class="gov-agentes" aria-labelledby="gov-agentes-titulo">
                <div class="gov-agentes-head">
                    <h3 class="gov-section-title gov-agentes-titulo" id="gov-agentes-titulo">Agentes com acesso</h3>
                    <p class="gov-agentes-nota">Agentes de IA que consultores conectaram a este cliente. Revogar corta o acesso na próxima chamada.</p>
                </div>
                ${linhas || '<div class="gov-empty-list">Nenhum agente conectado a este cliente.</div>'}
            </section>`;
    };

    // Atualização ao vivo do cartão (F3): o "último uso" é o único sinal de leitura do agente, e só
    // mudava recarregando a página. Um temporizador por vez, que se encerra sozinho quando o cartão
    // sai do DOM, não consulta com a aba em segundo plano e atualiza na hora ao voltar a ela.
    let _timerAgentes = null;
    let _visivelAgentes = null;
    window.pararAgentesAoVivo = function() {
        clearInterval(_timerAgentes);
        _timerAgentes = null;
        if (_visivelAgentes) document.removeEventListener('visibilitychange', _visivelAgentes);
        _visivelAgentes = null;
    };
    window.agentesAoVivo = function(projectId, intervaloMs = 60000) {
        window.pararAgentesAoVivo();
        const ciclo = () => {
            if (!document.getElementById('gov-agentes')) return window.pararAgentesAoVivo(); // saiu da tela
            if (document.visibilityState === 'hidden') return;                                // aba em segundo plano
            window.carregarAgentesDoProjeto(projectId, { manter: true });
        };
        _timerAgentes = setInterval(ciclo, intervaloMs);
        _visivelAgentes = () => { if (document.visibilityState === 'visible') ciclo(); };
        document.addEventListener('visibilitychange', _visivelAgentes);
    };

    window.convidarStakeholder = async function(projectId, memberId) {
        try {
            const r = await api('POST', `/api/v1/projects/${projectId}/governance/${memberId}/convidar`);
            if (r && r.ja_convidado) showToast('Esta pessoa já tem acesso ao n.iso');
            else if (r && r.emailEnviado === false) showToast('Conta criada, mas o e-mail NÃO foi enviado. Use "Revogar acesso" e depois "Convidar para o n.iso" de novo para gerar outra senha e reenviar, ou avise o administrador da plataforma.', 'error');
            else showToast('Convite enviado por e-mail');
        } catch (e) { showToast(e.message || 'Falha ao convidar', 'error'); }
    };

    window.revogarStakeholder = async function(projectId, memberId) {
        if (!confirm('Revogar o acesso desta pessoa ao n.iso? A conta é desativada e as sessões abertas caem.')) return;
        try {
            await api('POST', `/api/v1/projects/${projectId}/governance/${memberId}/revogar-acesso`);
            showToast('Acesso revogado');
        } catch (e) { showToast(e.message || 'Falha ao revogar', 'error'); }
    };

    window.revogarAgente = async function(projectId, id) {
        if (!confirm('Revogar o acesso deste agente? Ele perde o acesso na próxima chamada.')) return;
        try {
            await api('POST', `/api/v1/projects/${projectId}/agentes/${id}/revogar`);
            showToast('Acesso do agente revogado');
            window.carregarAgentesDoProjeto(projectId);
        } catch (e) { showToast(e.message || 'Falha ao revogar', 'error'); }
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
                <button class="btn-ghost" data-action="forceCloseModal">Fechar</button>
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
                    ${m.email ? `<div style="font-size:0.75rem; color:var(--text-dim)">${escapeHTML(m.email)}</div>` : ''}
                </div>
                <div style="display:flex; gap:8px; ${m.role_category === 'consultor' && !podeDesignarConsultor() ? 'visibility:hidden' : ''}">
                    <button class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--accent); border-color:rgba(0,173,232,0.2)" data-action="editGovernanceMember" data-args='["${m.id}"]'>
                        Editar
                    </button>
                    <button class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:#ef4444; border-color:rgba(239,68,68,0.2)" data-action="deleteGovernanceMember" data-args='["${projectId}","${m.id}"]'>
                        Excluir
                    </button>
                </div>
            </div>
        `).join('') || `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding:12px; border:1px dashed var(--border); border-radius:8px; margin-bottom:12px">Nenhum membro cadastrado.</div>`;

        const formHtml = `
            <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:var(--accent); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px" id="gov-form-title">Adicionar Novo Membro</h4>
                <form id="add-gov-member-form" data-action-submit="saveGovernanceMember" data-arg-event data-args='["${projectId}"]' style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">Nome Completo</label>
                        <input class="form-input" id="gov-name" required placeholder="Ex: Maria Silva">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">E-mail</label>
                        <input class="form-input" id="gov-email" type="email" placeholder="Ex: maria@empresa.com.br">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Categoria de Papel</label>
                        <select class="form-input" id="gov-role" required>
                            <option value="executivo">Liderança Executiva</option>
                            <option value="tech">Tecnologia & Produto</option>
                            <option value="operacoes">Operações & Segurança</option>
                            ${podeDesignarConsultor() ? '<option value="consultor">Consultoria / Apoio</option>' : ''}
                        </select>
                        ${podeDesignarConsultor() ? '' : '<p class="gov-empty-list" style="padding:4px 0 0">Designar consultor é feito pelo administrador do cliente.</p>'}
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cargo / Função</label>
                        <input class="form-input" id="gov-title" required placeholder="Ex: CEO, CFO, DPO, Consultor">
                    </div>
                    <div class="form-group" style="grid-column: span 2; display:flex; align-items:center; gap:8px">
                        <input type="checkbox" id="gov-primary" style="cursor:pointer">
                        <label for="gov-primary" class="form-label" style="margin-bottom:0; cursor:pointer">Líder do SGSI (um por projeto; substitui o atual)</label>
                    </div>
                    <div style="grid-column: span 2; display:flex; justify-content:flex-end; gap:8px; margin-top:8px">
                        <button class="btn btn-secondary" type="button" id="btn-cancel-gov-edit" style="display:none" data-action="cancelGovernanceEdit">Cancelar</button>
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
        document.getElementById('gov-role').value = member.role_category || 'executivo';
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
        h.textContent = 'Contexto & Escopo do SGSI (Cláusula 4.1 / 4.3)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = `<button data-action="saveContext" class="btn btn-primary">Salvar Alterações</button>`;
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando análise de contexto...</div>';
        
        try {
            const ctx = await api('GET', `/api/v1/projects/${proj.id}/context`) || {};
            
            let scopeCharter = {
                perimeter: '',
                boundaries: '',
                exclusions: '',
                impacted_users: '',
                ciso_approved_by: '',
                ceo_approved_by: ''
            };
            try {
                if (ctx.notes && ctx.notes.trim().startsWith('{')) {
                    scopeCharter = Object.assign(scopeCharter, JSON.parse(ctx.notes));
                } else {
                    scopeCharter.perimeter = ctx.notes || '';
                }
            } catch(e) {
                scopeCharter.perimeter = ctx.notes || '';
            }

            const countLines = str => (str || '').split('\n').filter(l => l.trim().length > 0).length;
            const sCount = countLines(ctx.internal_strengths);
            const wCount = countLines(ctx.internal_weaknesses);
            const oCount = countLines(ctx.external_opportunities);
            const tCount = countLines(ctx.external_threats);
            const lCount = countLines(ctx.legal_requirements);
            const cCount = countLines(ctx.contractual_requirements);
            
            const totalSwot = sCount + wCount + oCount + tCount;
            const totalReqs = lCount + cCount;
            const totalFatores = totalSwot + totalReqs;
            const maturityScore = totalFatores > 0 ? 100 : 0;
            const maturityStatus = maturityScore >= 80 ? 'CONFORME' : maturityScore > 0 ? 'EM CONSTRUÇÃO' : 'PENDENTE';

            const activeTab = S.contextTab || 'swot';

            const statsHtml = window.renderStatCards([
                { label: 'Total Fatores de Contexto', value: totalFatores, color: 'var(--accent)', subtext: 'Mapeados ISO 27001' },
                { label: 'Forças & Oportunidades', value: sCount + oCount, color: '#34c759', subtext: 'Fatores positivos' },
                { label: 'Fraquezas & Ameaças', value: wCount + tCount, color: (wCount + tCount) > 0 ? '#ff3b30' : 'var(--text-dim)', subtext: 'Pontos de atenção / Risco' },
                { label: 'Maturidade Cláusula 4.3', value: `${maturityScore}%`, color: maturityScore >= 80 ? '#34c759' : '#ffcc00', subtext: maturityStatus }
            ]);

            const tabsHeader = `
                <div style="display:flex; gap:12px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:12px" class="fade-in">
                    <button data-action="switchContextTab" data-args='["swot"]' class="btn ${activeTab !== 'charter' ? 'btn-primary' : 'btn-ghost'}" style="font-size:0.85rem">Matriz SWOT & Requisitos (Cl. 4.1 / 4.2)</button>
                    <button data-action="switchContextTab" data-args='["charter"]' class="btn ${activeTab === 'charter' ? 'btn-primary' : 'btn-ghost'}" style="font-size:0.85rem">Charter de Escopo & Fronteiras do SGSI (Cl. 4.3)</button>
                </div>
            `;

            let tabBody = '';
            if (activeTab === 'charter') {
                tabBody = `
                    <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px; margin-bottom:24px" class="fade-in">
                        <!-- PERÍMETRO & FRONTEIRAS -->
                        <div style="display:flex; flex-direction:column; gap:16px">
                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:20px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.9rem; color:var(--accent); text-transform:uppercase; margin-bottom:8px">
                                    1. Perímetro de Negócio, Sistemas & Infraestrutura (Cláusula 4.3.a)
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:10px">Defina os produtos, serviços, plataformas (ex: APIs, biometria), aplicações e ambientes de nuvem/escritórios abrangidos pelo SGSI.</div>
                                <textarea id="charter-perimeter" class="form-input" style="width:100%; height:100px; resize:vertical; font-family:inherit; font-size:0.85rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px 12px" placeholder="Ex: Plataforma SaaS principal, APIs REST, infraestrutura AWS us-east-1 e repositórios de dados biográficos.">${escapeHTML(scopeCharter.perimeter)}</textarea>
                            </div>

                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:20px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.9rem; color:var(--accent); text-transform:uppercase; margin-bottom:8px">
                                    2. Fronteiras Físicas, Lógicas e Organizacionais (Cláusula 4.3.b)
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:10px">Especifique limites de rede (VPCs, firewalls), localidades físicas de escritórios, unidades operacionais e acessos remotos.</div>
                                <textarea id="charter-boundaries" class="form-input" style="width:100%; height:90px; resize:vertical; font-family:inherit; font-size:0.85rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px 12px" placeholder="Ex: VPCs de Produção na AWS, subredes privadas EKS, escritório central em SP e colaboradores autorizados via VPN ZTNA.">${escapeHTML(scopeCharter.boundaries)}</textarea>
                            </div>

                            <div style="background:rgba(255,59,48,0.02); border:1px solid rgba(255,59,48,0.2); border-radius:12px; padding:20px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.9rem; color:#ff3b30; text-transform:uppercase; margin-bottom:8px">
                                    3. Exclusões Justificadas de Escopo (Exclusões Aceitas por Auditores)
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:10px">Descreva detalhadamente o que está **fora do escopo** e a justificativa técnica normativamente válida perante o auditor ISO 27001.</div>
                                <textarea id="charter-exclusions" class="form-input" style="width:100%; height:90px; resize:vertical; font-family:inherit; font-size:0.85rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px 12px" placeholder="Ex: Unidades fabris externas e sistemas legados de RH (mantidos fora do perímetro inicial sem interconexão com a API de produção).">${escapeHTML(scopeCharter.exclusions)}</textarea>
                            </div>
                        </div>

                        <!-- GOVERNANÇA & APROVAÇÃO EXECUTIVA -->
                        <div style="display:flex; flex-direction:column; gap:16px">
                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:20px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.85rem; color:var(--accent); text-transform:uppercase; margin-bottom:8px">
                                    Público & Titulares Impactados
                                </div>
                                <textarea id="charter-users" class="form-input" style="width:100%; height:80px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: 150 colaboradores internos, 2M de titulares de dados biométricos LGPD e 12 clientes B2B.">${escapeHTML(scopeCharter.impacted_users)}</textarea>
                            </div>

                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:20px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.85rem; color:var(--accent); text-transform:uppercase; margin-bottom:12px">
                                    Aprovação do Escopo (Sign-Off Executivo)
                                </div>
                                
                                <div style="margin-bottom:12px">
                                    <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px">Assinatura Líder SGSI / CISO</label>
                                    <input type="text" id="charter-ciso" class="form-input" style="width:100%; font-size:0.85rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:6px 10px" value="${escapeHTML(scopeCharter.ciso_approved_by)}" placeholder="Nome do CISO / Responsável" />
                                </div>

                                <div>
                                    <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px">Assinatura Direção Executiva / CEO</label>
                                    <input type="text" id="charter-ceo" class="form-input" style="width:100%; font-size:0.85rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:6px 10px" value="${escapeHTML(scopeCharter.ceo_approved_by)}" placeholder="Nome do CEO / Direção" />
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                tabBody = `
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; margin-bottom:24px" class="fade-in">
                        <!-- MATRIX SWOT 2x2 CARD -->
                        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:20px">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
                                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.95rem; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px">
                                    Matriz SWOT de Segurança da Informação (Cláusula 4.1)
                                </div>
                                <span style="font-size:0.75rem; color:var(--text-dim)">${totalSwot} Fatores</span>
                            </div>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
                                <div style="background:rgba(0,173,232,0.03); border:1px solid rgba(0,173,232,0.2); border-radius:10px; padding:14px">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                        <label style="color:#00ade8; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:6px">
                                            <span style="width:8px; height:8px; background:#00ade8; border-radius:50%"></span>
                                            Forças (Strengths)
                                        </label>
                                        ${window.renderStatusBadge(`${sCount} itens`, 'info')}
                                    </div>
                                    <textarea id="ctx-strengths" class="form-input" style="width:100%; height:110px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: Criptografia AES-256 no S3, arquitetura isolada via VPC...">${escapeHTML(ctx.internal_strengths || '')}</textarea>
                                </div>
                                
                                <div style="background:rgba(254,202,87,0.03); border:1px solid rgba(254,202,87,0.2); border-radius:10px; padding:14px">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                        <label style="color:#feca57; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:6px">
                                            <span style="width:8px; height:8px; background:#feca57; border-radius:50%"></span>
                                            Fraquezas (Weaknesses)
                                        </label>
                                        ${window.renderStatusBadge(`${wCount} itens`, 'warning')}
                                    </div>
                                    <textarea id="ctx-weaknesses" class="form-input" style="width:100%; height:110px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: Ausência de GuardDuty, falta de testes de restore...">${escapeHTML(ctx.internal_weaknesses || '')}</textarea>
                                </div>

                                <div style="background:rgba(52,199,89,0.03); border:1px solid rgba(52,199,89,0.2); border-radius:10px; padding:14px">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                        <label style="color:#34c759; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:6px">
                                            <span style="width:8px; height:8px; background:#34c759; border-radius:50%"></span>
                                            Oportunidades (Opportunities)
                                        </label>
                                        ${window.renderStatusBadge(`${oCount} itens`, 'success')}
                                    </div>
                                    <textarea id="ctx-opportunities" class="form-input" style="width:100%; height:110px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: Certificação ISO 27001 como diferencial competitivo...">${escapeHTML(ctx.external_opportunities || '')}</textarea>
                                </div>

                                <div style="background:rgba(255,59,48,0.03); border:1px solid rgba(255,59,48,0.2); border-radius:10px; padding:14px">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                        <label style="color:#ff3b30; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:6px">
                                            <span style="width:8px; height:8px; background:#ff3b30; border-radius:50%"></span>
                                            Ameaças (Threats)
                                        </label>
                                        ${window.renderStatusBadge(`${tCount} itens`, 'danger')}
                                    </div>
                                    <textarea id="ctx-threats" class="form-input" style="width:100%; height:110px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: Ataques cibernéticos no setor, atuações da ANPD...">${escapeHTML(ctx.external_threats || '')}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- REQUISITOS NORMATIVOS & CONTRATUAIS CARD -->
                        <div style="display:flex; flex-direction:column; gap:16px">
                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:18px; flex:1">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                    <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.85rem; color:var(--accent); text-transform:uppercase">
                                        Requisitos Legais / Regulatórios
                                    </div>
                                    ${window.renderStatusBadge(`${lCount} req`, 'info')}
                                </div>
                                <textarea id="ctx-legal" class="form-input" style="width:100%; height:85px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: LGPD (Lei 13.709), resoluções da ANPD...">${escapeHTML(ctx.legal_requirements || '')}</textarea>
                            </div>

                            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:18px; flex:1">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                                    <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.85rem; color:var(--accent); text-transform:uppercase">
                                        Requisitos Contratuais / SLAs
                                    </div>
                                    ${window.renderStatusBadge(`${cCount} req`, 'info')}
                                </div>
                                <textarea id="ctx-contractual" class="form-input" style="width:100%; height:85px; resize:vertical; font-family:inherit; font-size:0.82rem; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px" placeholder="Ex: SLAs de segurança exigidos por clientes enterprise...">${escapeHTML(ctx.contractual_requirements || '')}</textarea>
                            </div>
                        </div>
                    </div>
                `;
            }

            c.innerHTML = `
                ${statsHtml}
                ${tabsHeader}
                ${tabBody}
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar contexto: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.switchContextTab = function(tabName) {
        S.contextTab = tabName;
        render();
    };

    window.saveContext = async function() {
        try {
            const body = {
                internal_strengths: document.getElementById('ctx-strengths')?.value || '',
                internal_weaknesses: document.getElementById('ctx-weaknesses')?.value || '',
                external_opportunities: document.getElementById('ctx-opportunities')?.value || '',
                external_threats: document.getElementById('ctx-threats')?.value || '',
                legal_requirements: document.getElementById('ctx-legal')?.value || '',
                contractual_requirements: document.getElementById('ctx-contractual')?.value || '',
                notes: JSON.stringify({
                    perimeter: document.getElementById('charter-perimeter')?.value || '',
                    boundaries: document.getElementById('charter-boundaries')?.value || '',
                    exclusions: document.getElementById('charter-exclusions')?.value || '',
                    impacted_users: document.getElementById('charter-users')?.value || '',
                    ciso_approved_by: document.getElementById('charter-ciso')?.value || '',
                    ceo_approved_by: document.getElementById('charter-ceo')?.value || ''
                })
            };
            await api('PUT', `/api/v1/projects/${S.activeProject.id}/context`, body);
            showToast('Contexto e Charter de Escopo salvos com sucesso');
        } catch(e) {
            showToast('Erro ao salvar contexto: ' + e.message, 'danger');
        }
    };


    async function renderStakeholders(c, h, a) {
        h.textContent = 'Partes Interessadas (Cláusula 4.2)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = `<button data-action="openStakeholderModal" class="btn btn-primary">+ Novo Stakeholder</button>`;
        
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
                        <button data-action="openStakeholderModal" data-args='["${s.id}"]' class="btn btn-ghost btn-sm">Editar</button>
                        <button data-action="deleteStakeholder" data-args='["${s.id}"]' class="btn btn-ghost btn-sm" style="color:#ff3b30">Excluir</button>
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
                <button class="btn-ghost" data-action="closeModal">&times;</button>
            </div>
            <form id="stakeholder-form" data-action-submit="saveStakeholder" data-arg-event data-args='${escapeHTML(JSON.stringify([isEdit ? s.id : null]))}' style="margin-top:1rem">
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
                    <button type="button" data-action="closeModal" class="btn">Cancelar</button>
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
                            ${role ? `<span style="color: var(--accent); font-size:0.75rem; font-weight: 500;">(${escapeHTML(role)})</span>` : ''}
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
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const isOrgUser = S.user && S.user.role === 'org_user';
        a.innerHTML = isOrgUser ? '' : `<button data-action="openNewMgmtReviewModal" class="btn btn-primary">+ Nova Análise Crítica</button>`;
        
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
                    `<button data-action="openEditMgmtReviewModal" data-args='["${m.id}"]' class="btn btn-ghost btn-sm">Abrir Pauta / Editar</button>`
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
            <form id="new-mgmt-form" data-action-submit="saveNewMgmtReview" data-arg-event>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Data da Análise</label>
                    <input type="date" name="review_date" required style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Participantes (C-Level / Sponsor)</label>
                    <textarea name="attendees" required style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Ex: CEO, CISO, DPO, Diretor Jurídico..."></textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" data-action="closeModal" class="btn-secondary" style="margin-right:8px">Cancelar</button>
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
                <button data-action="closeModal" class="btn-secondary" style="margin-right:8px">Fechar</button>
                ${!isOrgUser ? `<button data-action="openEditMgmtReviewForm" data-args='["${review.id}"]' class="btn-primary">Editar Ata</button>` : ''}
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
            <form id="edit-mgmt-form" data-action-submit="saveMgmtReviewDetails" data-arg-event data-args='["${review.id}"]'>
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
                    ${S.user && (S.user.role === 'platform_admin' || S.user.role === 'org_admin') ? `<button type="button" data-action="excluirMgmtReview" data-args='["${review.id}"]' class="btn-secondary" style="margin-right:8px">Excluir análise</button>` : ''}
                    <button type="button" data-action="openEditMgmtReviewModal" data-args='["${review.id}"]' class="btn-secondary" style="margin-right:8px">Voltar</button>
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    // F6: excluir análise crítica é da direção, pela interface (o agente não alcança a rota).
    window.excluirMgmtReview = async function(id) {
        if (!confirm('Excluir esta análise crítica? Ela é um registro de gestão, possivelmente assinado, e a exclusão é permanente (fica na trilha de auditoria).')) return;
        try {
            await api('DELETE', `/api/v1/management-reviews/${id}`);
            showToast('Análise crítica excluída');
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao excluir: ' + err.message, 'error');
        }
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
                <button type="button" data-action="closeModal" class="btn-secondary">Fechar</button>
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
                                <button data-action="submitAuditorResponse" data-args='["${n.id}","${projectId}"]' class="btn-primary" style="padding:6px 12px;font-size:0.85rem;border-radius:8px;border:none;background:var(--accent);color:#070b14;font-weight:700">Responder</button>
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
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = `<button class="btn" data-action="exportCSV" data-args='["assets"]' style="margin-right:8px">Exportar CSV</button>` + (canCrud ? `<button class="btn btn-primary" data-action="openNewAssetModal" data-args='["${proj.id}"]'>+ Novo Ativo</button>` : '');
        
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
                    `<button class="btn btn-ghost btn-sm" data-action="openAssetDetailsModal" data-args='["${ast.id}"]'>Detalhes</button>`
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
                <button class="btn-ghost" data-action="forceCloseModal">&times;</button>
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
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" data-action="openEditAssetModal" data-args='["${id}"]'>Editar Ativo</button>` : ''}
            </div>
        `);
    };

    window.openNewAssetModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Ativo</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
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
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" data-action="createAsset" data-args='["${projectId}"]'>Registrar Ativo</button>
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
            <div class="modal-header"><span class="modal-title">Editar Ativo</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
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
                <label class="form-label">Classificação da Informação</label>
                <select class="form-input" id="ast-e-classification">
                    <option value="Confidential" ${ast.classification==='Confidential'?'selected':''}>Confidencial</option>
                    <option value="Restricted" ${ast.classification==='Restricted'?'selected':''}>Restrito</option>
                    <option value="Internal" ${ast.classification==='Internal'?'selected':''}>Interno</option>
                    <option value="Public" ${ast.classification==='Public'?'selected':''}>Público</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Dono</label><input class="form-input" id="ast-e-owner" value="${escapeHTML(ast.owner||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Localização</label><input class="form-input" id="ast-e-location" value="${escapeHTML(ast.location||'')}"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-input" id="ast-e-status">
                    <option value="Active" ${ast.status==='Active'?'selected':''}>Ativo</option>
                    <option value="Inactive" ${ast.status==='Inactive'?'selected':''}>Inativo</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" data-action="deleteAsset" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateAsset" data-args='["${id}"]'>Salvar</button>
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

// Wrappers S2 (delegação): expressões que antes viviam no onclick inline.
window.__monToggleDropdown = (el) => { const menu = el && el.nextElementSibling; if (menu) menu.classList.toggle('open'); };
window.__monDeleteMetric = (id) => {
    if (!confirm('Deseja excluir esta métrica?')) return;
    api('DELETE', `/api/v1/metrics/${id}`).then(() => { forceCloseModal(); render(); });
};

window.renderMonitor = renderMonitor;
window.renderPortfolio = renderPortfolio;
window.exportCSV = exportCSV;
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
