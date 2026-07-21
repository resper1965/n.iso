import { S } from './state.js';

export     function navigate(view, data) {
        let targetView = view;
        const isClient = S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client');
        if (isClient && (view === 'dashboard' || view === 'projects')) {
            targetView = 'project-detail';
        }
        
        S.view = targetView;
        if (data) Object.assign(S, data);
        
        // Update active states in sidebar
        document.querySelectorAll('.sidebar-nav').forEach(el => el.classList.remove('active'));
        const navId = `nav-${targetView.split('-')[0]}`;
        const el = document.getElementById(navId);
        if (el) el.classList.add('active');

        render();
    }

    export function render() {
        const c = document.getElementById('content');
        const h = document.getElementById('header-title');
        const a = document.getElementById('header-actions');
        
        if (S.view === 'dashboard') renderDashboard(c, h, a);
        else if (S.view === 'leads') renderLeads(c, h, a);
        else if (S.view === 'assessments') renderAssessments(c, h, a);
        else if (S.view === 'proposals') renderProposals(c, h, a);
        else if (S.view === 'projects') renderProjects(c, h, a);
        else if (S.view === 'monitor') renderMonitor(c, h, a);
        else if (S.view === 'assets') renderAssets(c, h, a);
        else if (S.view === 'metrics') renderMetrics(c, h, a);
        else if (S.view === 'audit-trail') renderAuditTrail(c, h, a);
        else if (S.view === 'acknowledgments') renderAcknowledgments(c, h, a);
        else if (S.view === 'policies-dashboard') renderPoliciesDashboard(c, h, a);
        else if (S.view === 'risks') renderRisks(c, h, a);
        else if (S.view === 'vendors') renderVendors(c, h, a);
        else if (S.view === 'training') renderTraining(c, h, a);
        else if (S.view === 'ropa') renderROPA(c, h, a);
        else if (S.view === 'dpia') renderDPIA(c, h, a);
        else if (S.view === 'audits') renderAudits(c, h, a);
        else if (S.view === 'capa') renderCAPA(c, h, a);
        else if (S.view === 'evidence') renderEvidence(c, h, a);
        else if (S.view === 'controls') renderControls(c, h, a);
        else if (S.view === 'governance') renderGovernance(c, h, a);
        else if (S.view === 'certification') renderCertification(c, h, a);
        else if (S.view === 'ai-chat') renderAIChat(c, h, a);
        else if (S.view === 'knowledge') renderKnowledge(c, h, a);
        else if (S.view === 'settings') renderSettings(c, h, a);
        else if (S.view === 'users') renderUsers(c, h, a);
        else if (S.view === 'assessment-detail') renderAssessmentDetail(c, h, a);
        else if (S.view === 'self-service') renderSelfServiceAssessment(S.currentAssessmentId);
        else if (S.view === 'project-detail') renderProjectDetail(c, h, a);
        else if (S.view === 'soa') renderSoA(c, h, a);
        else if (S.view === 'stakeholders') renderStakeholders(c, h, a);
        else if (S.view === 'context') renderContext(c, h, a);
        else if (S.view === 'audit-execution') renderAuditExecution(c, h, a);
        else if (S.view === 'management-review') renderManagementReview(c, h, a);
        updateActiveProjectWidget();
        updateHeaderUser();
    }

window.navigate = navigate;
window.render = render;
