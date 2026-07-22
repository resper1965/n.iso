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
            const leadsCount = Array.isArray(leads) ? leads.length : 0;
            const assessmentsCount = Array.isArray(assessments) ? assessments.length : 0;
            const projectsCount = activeProjects.length;

            const totalControls = Array.isArray(controls) ? controls.length : 0;
            const approvedControls = Array.isArray(controls) ? controls.filter(ctrl => ctrl.status === 'Approved' || ctrl.status === 'Implemented').length : 0;
            const gapsControls = totalControls - approvedControls;
            const complianceRate = totalControls > 0 ? Math.round((approvedControls / totalControls) * 100) : 0;

            const headerHtml = window.renderPageHeader(
                'Dashboard Executivo',
                'Visão geral da governança, conformidade e projetos ativos no nISO',
                `<button class="btn btn-primary" onclick="openCreateLeadModal()">+ Novo Lead</button>
                 <button class="btn btn-ghost" onclick="navigate('monitor')">Monitor</button>`
            );

            const statsHtml = window.renderStatCards([
                { label: 'Leads Ativos', value: leadsCount, color: 'var(--accent)', subtext: 'Oportunidades em pré-venda' },
                { label: 'Levantamentos', value: assessmentsCount, color: '#ffcc00', subtext: 'Assessments cadastrados' },
                { label: 'Projetos em Curso', value: projectsCount, color: '#34c759', subtext: 'Implementações ISO ativas' },
                { label: 'Taxa de Conformidade', value: `${complianceRate}%`, color: complianceRate >= 80 ? '#34c759' : complianceRate >= 50 ? '#ffcc00' : '#00ade8', subtext: `${approvedControls} de ${totalControls} controles` }
            ]);

            const assessmentsTable = window.renderDataTable(
                [
                    { label: 'Cliente', key: 'client_name' },
                    { label: 'Status', key: 'status', render: (row) => window.renderStatusBadge(row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'info', row.status || 'Pendente') },
                    {
                        label: 'Ações', align: 'right', render: (row) => `
                            <button class="btn btn-ghost" style="padding:0.25rem 0.6rem; font-size:0.7rem;" onclick="openAssessmentDetail('${row.id}')">Ver</button>
                            <button class="btn btn-ghost" style="padding:0.25rem 0.6rem; font-size:0.7rem;" onclick="generateProposalFromAssessment('${row.id}')">Proposta</button>
                        `
                    }
                ],
                assessments.slice(0, 5),
                { emptyMessage: 'Nenhum levantamento recente cadastrado.' }
            );

            const projectsTable = window.renderDataTable(
                [
                    { label: 'Projeto', render: (row) => escapeHTML(row.project_name || row.client_name || 'Sem nome') },
                    {
                        label: 'Progresso', render: (row) => `
                            <div style="display:flex; align-items:center; gap:0.75rem; width:100%;">
                                <div class="progress-bar" style="flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;"><div class="progress-fill" style="width:${row.progress || 0}%; background:var(--accent); height:100%;"></div></div>
                                <span style="font-size:0.75rem; font-weight:600; color:var(--accent);">${row.progress || 0}%</span>
                            </div>
                        `
                    },
                    { label: 'Ação', align: 'right', render: (row) => `<button class="btn btn-ghost" style="padding:0.25rem 0.6rem; font-size:0.7rem;" onclick="openProjectDetail('${row.id}')">Gerenciar</button>` }
                ],
                projects.slice(0, 5),
                { emptyMessage: 'Nenhum projeto ativo.' }
            );

            c.innerHTML = `
                <div class="fade-in">
                    ${headerHtml}
                    ${statsHtml}

                    <div class="card fade-in" style="margin-bottom:1.5rem; background:rgba(15,23,42,0.65); border:1px solid rgba(229,235,255,0.08); border-radius:12px; padding:1.5rem; backdrop-filter:blur(24px);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem">
                            <div style="font-family:'Montserrat',sans-serif; font-weight:600; font-size:1rem; color:var(--text);">Burnup de Gaps — Velocidade de Conformidade</div>
                            <span style="background:rgba(0,173,232,0.15); color:var(--accent); padding:0.25rem 0.61rem; border-radius:6px; font-weight:600; font-size:0.75rem;">${complianceRate}% Implementado</span>
                        </div>
                        <div class="progress-bar" style="height:8px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; margin-bottom:1rem">
                            <div class="progress-fill" style="width: ${complianceRate}%; background:linear-gradient(90deg, var(--accent), #34c759); height:100%;"></div>
                        </div>
                        <div style="display:flex; gap:1.5rem; font-size:0.8rem; color:var(--text-dim)">
                            <div><strong style="color:var(--text)">Controles Implementados:</strong> ${approvedControls}</div>
                            <div><strong style="color:var(--text)">Gaps Restantes:</strong> ${gapsControls}</div>
                            <div><strong style="color:var(--text)">Total do ISMS:</strong> ${totalControls}</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:1.5rem;">
                        <div>
                            <h3 style="font-family:'Montserrat',sans-serif; font-weight:600; font-size:1.05rem; margin-bottom:0.8rem; color:var(--text)">Levantamentos Recentes</h3>
                            ${assessmentsTable}
                        </div>
                        <div>
                            <h3 style="font-family:'Montserrat',sans-serif; font-weight:600; font-size:1.05rem; margin-bottom:0.8rem; color:var(--text)">Projetos Ativos</h3>
                            ${projectsTable}
                        </div>
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
