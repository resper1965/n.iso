import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML } from '../ui.js';
import { navigate, render } from '../router.js';

    async function renderDashboard(c, h, a) {
        h.textContent = 'Dashboard';
        a.innerHTML = '';
        if (S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id) {
            let assessmentStatus = 'Pending';
            let proposalStatus = 'Pending';
            if (S.clientAssessmentId) assessmentStatus = 'In Progress';
            if (S.clientProposalId) {
                assessmentStatus = 'Completed';
                proposalStatus = S.clientProposalStatus || 'Draft';
            }

            let assessmentActionHtml = '';
            if (assessmentStatus === 'Completed') {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Concluído</span>';
            } else if (S.clientAssessmentId) {
                assessmentActionHtml = `<button class="btn btn-primary" onclick="navigate('self-service', { assessmentId: '${S.clientAssessmentId}' })">Responder Questionário</button>`;
            } else {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando Liberação</span>';
            }

            let html = `
                <div class="fade-in" style="max-width:800px; margin:0 auto; padding:2rem 0">
                    <h2 style="font-family:'Montserrat'; font-weight:700; font-size:2rem; margin-bottom:0.5rem; color:var(--text)">Bem-vindo à ness. nISO</h2>
                    <p style="color:var(--text-dim); font-size:0.95rem; margin-bottom:2.5rem">Seu ambiente de governança de segurança da informação (SGSI) está em fase de preparação.</p>
                    <div style="display:flex; flex-direction:column; gap:1.5rem">
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 1</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Avaliação de Escopo (Assessment Inicial)</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Questionário para mapear as atividades, equipe e tecnologia do seu negócio para cálculo do pricing e maturidade.</p>
                            </div>
                            <div style="text-align:right">
                                ${assessmentActionHtml}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 2</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Proposta Comercial e Assinatura</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Aprovação da proposta comercial baseada no escopo mapeado e assinatura digital para início da adequação.</p>
                            </div>
                            <div style="text-align:right">
                                ${proposalStatus === 'Approved' ? '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Assinado</span>' : S.clientProposalId ? '<a class="btn btn-primary" href="/api/v1/assessments/' + S.clientAssessmentId + '/generate-proposal" target="_blank" style="text-decoration:none; display:inline-block">Revisar e Assinar</a>' : '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando Assessment</span>'}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 3</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Início do SGSI & Projetos</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Criação automatizada de todas as 41 fases do projeto no nISO, checklists de conformidade e ativação dos assistentes de IA.</p>
                            </div>
                            <div style="text-align:right">
                                <span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Bloqueado até assinatura</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            c.innerHTML = html;
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [leads, assessments, projects, controls] = await Promise.all([
                api('GET', '/api/v1/leads').catch(() => []),
                api('GET', '/api/v1/assessments').catch(() => []),
                api('GET', '/api/v1/projects').catch(() => []),
                api('GET', '/api/v1/controls').catch(() => [])
            ]);
            const activeProjects = Array.isArray(projects) ? projects.filter(p => p.status === 'active') : [];
            
            const totalControls = Array.isArray(controls) ? controls.length : 0;
            const approvedControls = Array.isArray(controls) ? controls.filter(ctrl => ctrl.status === 'Approved' || ctrl.status === 'Implemented').length : 0;
            const gapsControls = totalControls - approvedControls;
            const complianceRate = totalControls > 0 ? Math.round((approvedControls / totalControls) * 100) : 0;

            c.innerHTML = `
                <div class="stats-grid fade-in">
                    <div class="card stat-card" onclick="navigate('leads')">
                        <div class="stat-label">Leads Ativos</div>
                        <div class="stat-value">${Array.isArray(leads) ? leads.length : 0}</div>
                    </div>
                    <div class="card stat-card" onclick="navigate('assessments')">
                        <div class="stat-label">Levantamentos</div>
                        <div class="stat-value">${Array.isArray(assessments) ? assessments.length : 0}</div>
                    </div>
                    <div class="card stat-card" onclick="navigate('projects')">
                        <div class="stat-label">Projetos em Curso</div>
                        <div class="stat-value">${activeProjects.length}</div>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem; background:linear-gradient(135deg, rgba(0,173,232,0.05) 0%, rgba(7,11,20,0) 100%)">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem">
                        <div style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:0.95rem">Burnup de Gaps — Velocidade de Conformidade</div>
                        <span class="ctx-tag" style="background:var(--accent)20; color:var(--accent); font-weight:600">${complianceRate}% Implementado</span>
                    </div>
                    <div class="progress-bar" style="height:8px; margin-bottom:1rem">
                        <div class="progress-fill" style="width: ${complianceRate}%"></div>
                    </div>
                    <div style="display:flex; gap:1.5rem; font-size:0.75rem; color:var(--text-dim)">
                        <div><strong>Controles Aprovados/Implementados:</strong> ${approvedControls}</div>
                        <div><strong>Gaps Restantes:</strong> ${gapsControls}</div>
                        <div><strong>Total do ISMS:</strong> ${totalControls}</div>
                    </div>
                </div>
                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Levantamentos Recentes</div>
                    <div style="overflow-x:auto">
                        <table class="data-table">
                            <thead>
                                <tr><th>Cliente</th><th>Status</th><th>Ação</th></tr>
                            </thead>
                            <tbody>
                                ${assessments.slice(0, 5).map(as => `
                                    <tr>
                                        <td>${escapeHTML(as.client_name)}</td>
                                        <td><span class="status-badge status-${as.status}">${as.status}</span></td>
                                        <td>
                                            <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="openAssessmentDetail('${as.id}')">Ver</button>
                                            <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="generateProposalFromAssessment('${as.id}')">ðŸ“„</button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3">Nenhum levantamento recente</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Projetos Ativos</div>
                    <div style="overflow-x:auto">
                        <table class="data-table">
                            <thead>
                                <tr><th>Projeto</th><th>Progresso</th><th>Ação</th></tr>
                            </thead>
                            <tbody>
                                ${projects.slice(0, 5).map(p => `
                                    <tr>
                                        <td>${escapeHTML(p.project_name || p.client_name)}</td>
                                        <td>
                                            <div style="display:flex;align-items:center;gap:0.5rem">
                                                <div class="progress-bar" style="flex:1;height:4px"><div class="progress-fill" style="width:${p.progress || 0}%"></div></div>
                                                <span style="font-size:0.6rem">${p.progress || 0}%</span>
                                            </div>
                                        </td>
                                        <td><button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="openProjectDetail('${p.id}')">Gerenciar</button></td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3">Nenhum projeto ativo</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Ações Rápidas</div>
                    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                        <button class="btn btn-primary" onclick="openCreateLeadModal()">Novo Lead</button>
                        <button class="btn" onclick="navigate('monitor')">Ver Monitor</button>
                        <button class="btn btn-ghost" onclick="loadAll()">ðŸ”„ Atualizar Dados</button>
                    </div>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar dashboard</div>';
        }
    }

    async function loadDashboardStats() { try { S.stats = await api('GET', '/api/v1/dashboard/stats'); } catch(e) { S.stats = {}; } }

export { renderDashboard };
window.renderDashboard = renderDashboard;
window.loadDashboardStats = loadDashboardStats;
