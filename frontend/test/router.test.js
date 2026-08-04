// Testes de `src/router.js` — `navigate()` decide DUAS coisas que importam:
// para qual tela o usuario vai (papeis de cliente sao desviados) e qual item da
// barra lateral recebe `active` + `aria-current`. A primeira e uma regra de
// visibilidade; a segunda e orientacao e acessibilidade.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { navigate } from '../src/router.js';
import { S } from '../src/state.js';

// Os ids reais da barra lateral, copiados de `frontend/index.html`. Se um id
// mudar la e nao aqui, os testes de destaque param de refletir a pagina — e e
// exatamente por isso que a lista fica explicita.
const IDS_SIDEBAR = [
    'nav-dashboard', 'nav-projects', 'nav-leads', 'nav-assessments', 'nav-proposals',
    'nav-project', 'nav-monitor', 'nav-soa', 'nav-governance', 'nav-stakeholders',
    'nav-context', 'nav-assets', 'nav-risks', 'nav-vendors', 'nav-training',
    'nav-acknowledgments', 'nav-policies', 'nav-audits', 'nav-capa', 'nav-mgmt',
    'nav-evidence', 'nav-ropa', 'nav-dpia', 'nav-ai', 'nav-knowledge',
    'nav-audit-trail', 'nav-users', 'nav-settings',
];

// `render()` despacha para funcoes globais que os modulos de view penduram em
// `window`. Aqui elas viram espioes: o alvo do teste e o roteador, nao a view.
const VIEWS = [
    'renderDashboard', 'renderLeads', 'renderAssessments', 'renderProposals', 'renderProjects',
    'renderMonitor', 'renderAssets', 'renderMetrics', 'renderAuditTrail', 'renderAcknowledgments',
    'renderPoliciesDashboard', 'renderRisks', 'renderVendors', 'renderTraining', 'renderROPA',
    'renderDPIA', 'renderAudits', 'renderCAPA', 'renderEvidence', 'renderControls',
    'renderGovernance', 'renderCertification', 'renderAIChat', 'renderKnowledge', 'renderSettings',
    'renderUsers', 'renderAssessmentDetail', 'renderSelfServiceAssessment', 'renderProjectDetail',
    'renderSoA', 'renderStakeholders', 'renderContext', 'renderAuditExecution',
    'renderManagementReview', 'updateActiveProjectWidget', 'updateHeaderUser',
];

function itemAtivo() {
    return document.querySelector('.sidebar-nav.active');
}

describe('navigate()', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="content"></div><div id="header-title"></div><div id="header-actions"></div>
            ${IDS_SIDEBAR.map((id) => `<div class="sidebar-nav" id="${id}"></div>`).join('')}
        `;
        for (const nome of VIEWS) globalThis[nome] = vi.fn();
        S.user = null;
        S.view = 'dashboard';
    });

    describe('desvio por papel — o que o usuario PODE ver', () => {
        it.each(['org_admin', 'org_user', 'client'])(
            'papel %s pedindo "dashboard" cai em project-detail',
            (role) => {
                S.user = { role };
                navigate('dashboard');
                expect(S.view).toBe('project-detail');
                expect(globalThis.renderProjectDetail).toHaveBeenCalledTimes(1);
                expect(globalThis.renderDashboard).not.toHaveBeenCalled();
            }
        );

        it.each(['org_admin', 'org_user', 'client'])(
            'papel %s pedindo "projects" cai em project-detail',
            (role) => {
                S.user = { role };
                navigate('projects');
                expect(S.view).toBe('project-detail');
                expect(globalThis.renderProjects).not.toHaveBeenCalled();
            }
        );

        it.each(['platform_admin', 'consultant', 'consultor', 'admin'])(
            'papel interno %s ve o dashboard de verdade',
            (role) => {
                S.user = { role };
                navigate('dashboard');
                expect(S.view).toBe('dashboard');
                expect(globalThis.renderDashboard).toHaveBeenCalledTimes(1);
            }
        );

        it('sem usuario nao ha desvio (boot antes do login)', () => {
            navigate('dashboard');
            expect(S.view).toBe('dashboard');
        });

        // LIMITE CONHECIDO, documentado de proposito: o desvio cobre so
        // "dashboard" e "projects". Um papel de cliente que chame
        // `navigate('leads')` — pelo console, por um onclick sobrevivente ou
        // por uma notificacao — chega na tela comercial. A defesa real e o
        // backend (`authMiddleware` + `projectAccessMiddleware`); o roteador
        // apenas esconde, nao autoriza. O teste existe para que ninguem
        // confunda uma coisa com a outra.
        it('papel de cliente NAO e barrado em outras telas pelo roteador', () => {
            S.user = { role: 'org_user' };
            navigate('leads');
            expect(S.view).toBe('leads');
            expect(globalThis.renderLeads).toHaveBeenCalledTimes(1);
        });
    });

    describe('estado que acompanha a navegacao', () => {
        it('funde o objeto `data` em S', () => {
            navigate('assessment-detail', { currentAssessment: { id: 'a1' }, currentBlock: 3 });
            expect(S.currentAssessment).toEqual({ id: 'a1' });
            expect(S.currentBlock).toBe(3);
        });

        it('chama updateActiveProjectWidget e updateHeaderUser em toda navegacao', () => {
            navigate('risks');
            expect(globalThis.updateActiveProjectWidget).toHaveBeenCalledTimes(1);
            expect(globalThis.updateHeaderUser).toHaveBeenCalledTimes(1);
        });
    });

    describe('destaque na barra lateral', () => {
        it('marca active + aria-current no item da view', () => {
            navigate('risks');
            const el = document.getElementById('nav-risks');
            expect(el.classList.contains('active')).toBe(true);
            expect(el.getAttribute('aria-current')).toBe('page');
        });

        it('limpa o destaque anterior antes de marcar o novo', () => {
            navigate('risks');
            navigate('vendors');
            const anterior = document.getElementById('nav-risks');
            expect(anterior.classList.contains('active')).toBe(false);
            expect(anterior.hasAttribute('aria-current')).toBe(false);
            expect(itemAtivo().id).toBe('nav-vendors');
        });

        it('view composta com prefixo valido resolve o item certo', () => {
            // 'project-detail' -> 'nav-project' e 'policies-dashboard' -> 'nav-policies'
            navigate('project-detail');
            expect(itemAtivo().id).toBe('nav-project');
            navigate('policies-dashboard');
            expect(itemAtivo().id).toBe('nav-policies');
        });

        // BUG REAL (nao corrigido nesta tarefa — corrigir logica do frontend
        // esta fora de escopo). `navigate()` deriva o id do item por
        // `view.split('-')[0]`, isto e, so o primeiro segmento. Views cujo item
        // na barra lateral tem id com mais de um segmento ficam SEM nenhum item
        // ativo e sem `aria-current`: o usuario perde a referencia de onde
        // esta, e o leitor de tela nao anuncia a pagina atual.
        //   'audit-trail'       -> procura 'nav-audit'       (existe 'nav-audit-trail')
        //   'management-review' -> procura 'nav-management'  (existe 'nav-mgmt')
        //   'assessment-detail' -> procura 'nav-assessment'  (existe 'nav-assessments')
        //   'audit-execution'   -> procura 'nav-audit'       (existe 'nav-audits')
        //   'certification'     -> nao ha item na barra (destino de changeActiveProject)
        // Estes testes fixam o comportamento ATUAL. Ao corrigir, eles falham —
        // e e esse o sinal de que a correcao pegou.
        it.each([
            ['audit-trail', 'nav-audit-trail'],
            ['management-review', 'nav-mgmt'],
            ['assessment-detail', 'nav-assessments'],
            ['audit-execution', 'nav-audits'],
            ['certification', null],
        ])('BUG: view "%s" nao destaca item nenhum (esperado: %s)', (view) => {
            navigate('risks');
            navigate(view);
            expect(itemAtivo()).toBeNull();
            expect(document.querySelector('[aria-current]')).toBeNull();
        });
    });
});
