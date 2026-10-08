// Contrato tela↔API do lado da tela (P1): o `api()` aqui é o DE VERDADE e só o `fetch` é dublado,
// com o corpo que cada handler devolve (arquivo:linha ao lado). Cada caso é uma tela que lia o
// campo errado e mostrava vazio sem erro.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/compliance.js';

const $ = (id) => document.getElementById(id);
const tela = () => [$('content'), $('header-title'), $('header-actions')];

beforeEach(() => {
    document.body.innerHTML = `
        <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
        <div id="content"></div><h1 id="header-title"></h1><div id="header-actions"></div>`;
    S.token = 'tok123';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('consumidores que o desembrulho antigo quebrava', () => {
    it('entrevistas: lê `questions` (projects.ts:596)', async () => {
        servir({ 'GET /api/v1/projects/p1/interviews/executiva': {
            ok: true, interviews: [],
            questions: [{ key: 'exec_vision', question: 'Qual a visão estratégica para segurança?' }],
        } });
        S.interviewProgress = {};
        document.body.insertAdjacentHTML('beforeend', '<div id="interview-questions-container"></div><div id="interview-buttons-right"></div>');
        await window.changeInterviewTrack('p1', 'executiva');
        expect($('interview-questions-container').textContent).toContain('Qual a visão estratégica para segurança?');
    });

    it('jornada: S.checklistsConfig recebe `checklists`, não `titles` (platform.ts:554)', async () => {
        S.currentProject = { id: 'p1' };
        S.checklistsConfig = null;
        S.phaseQuestions = null;
        servir({
            'GET /api/v1/projects/p1/phases': { ok: true, phases: [{ phase_number: 0, status: 'in_progress' }] },
            'GET /api/v1/phases/config': { ok: true, titles: ['Fase 0'], checklists: { 0: [{ id: 'p0_1', text: 'Definir sponsor', category: 'Governança' }] } },
        });
        await window.renderProjectDetail(...tela());
        expect(S.checklistsConfig[0][0].id).toBe('p0_1');
    });

    it('análise de lacunas: lê coverage_pct e by_status (projects.ts:1042)', async () => {
        servir({ 'GET /api/v1/projects/p1/gap-analysis': {
            ok: true, total: 2, applicable: 2, by_status: { Implemented: 1, Missing: 1 }, coverage_pct: 50,
            controls_with_evidence: 1, controls_with_risks: 0,
            gaps: [{ control_id: 'c2', title: 'A.5.2', status: 'Missing', evidence_count: 0, risk_count: 0 }],
        } });
        await window.showGapAnalysis('p1');
        const t = $('modal-content').textContent;
        expect(t).toContain('50%');
        expect(t).toContain('Controles com evidencia: 1');
    });

    it('migrar 27701: mostra o resultado (projects.ts:831)', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        const alerta = vi.fn();
        vi.stubGlobal('alert', alerta);
        servir({ 'POST /api/v1/projects/p1/migrate-27701': { ok: true, gaps: [{ control_id: 'A.5.34' }], transformation_ratio: 0.5, new_controls_created: 3 } });
        await window.migrate27701('p1');
        expect(alerta.mock.calls[0][0]).toContain('Novos controles: 3');
    });

    it('políticas em lote: mostra total, sucesso e falhas (policies.ts:390)', async () => {
        vi.stubGlobal('prompt', vi.fn(() => 'A.5.1,A.5.2'));
        vi.stubGlobal('confirm', vi.fn(() => true));
        const alerta = vi.fn();
        vi.stubGlobal('alert', alerta);
        servir({ 'POST /api/v1/projects/p1/generate-policies-bulk': {
            ok: true, total: 2, successful: 1, failed: 1,
            policies: [{ control_id: 'A.5.1', success: true, content_preview: 'Política...' }, { control_id: 'A.5.2', success: false, content_preview: '' }],
        } });
        await window.bulkGeneratePolicies('p1');
        expect(alerta.mock.calls[0][0]).toContain('Sucesso: 1');
        expect(alerta.mock.calls[0][0]).toContain('Falhas: 1');
    });

    it('carteira: lê `portfolio` do envelope de duas listas (platform.ts:547)', async () => {
        const p = { id: 'p1', client_name: 'Acme', project_name: null, overall_progress_pct: 80, completed_phases: 3, phase_count: 41, risk_count: 0, evidence_count: 2 };
        servir({ 'GET /api/v1/portfolio': { ok: true, portfolio: [p], projects: [p] } });
        const [c, h, a] = tela();
        await window.renderPortfolio(c, h, a);
        expect(c.textContent).toContain('Acme');
    });
});

describe('consumidores que liam campo que a resposta não tem', () => {
    it('certificação: lê `certification` do envelope (certifications.ts:61)', async () => {
        S.activeProject = { id: 'p1' };
        servir({ 'GET /api/v1/projects/p1/certification': { ok: true, certification: {
            id: 'cert1', project_id: 'p1', standard: 'ISO 27001:2022', stage: 'Remediation',
            stage1_date: null, stage1_status: null, stage2_date: null, stage2_status: null, registrar: null, target_date: null,
        } } });
        const [c, h, a] = tela();
        await window.renderCertification(c, h, a);
        expect(c.textContent).toContain('Remediação & Implementação');
        expect(c.querySelector('[data-action="updateCertStage"]').dataset.args).toBe('["cert1"]');
    });

    it('certificação ausente: oferece iniciar (certifications.ts:60)', async () => {
        S.activeProject = { id: 'p1' };
        servir({ 'GET /api/v1/projects/p1/certification': { ok: true, certification: null } });
        const [c, h, a] = tela();
        await window.renderCertification(c, h, a);
        expect(a.querySelector('[data-action="initCertification"]')).not.toBeNull();
    });

    it('notas do auditor: a lista vem desembrulhada (auditor.ts:91)', async () => {
        servir({ 'GET /api/v1/projects/p1/auditor-notes': { ok: true, notes: [{
            id: 'n1', project_id: 'p1', control_id: null, note_type: 'evidence_request',
            content: 'Enviar a política assinada', response: null, control_standard: null, control_title: null,
        }] } });
        await window.openAuditorNotesModal('p1');
        expect($('auditor-notes-modal-content').textContent).toContain('Enviar a política assinada');
    });

    it('SoA: o mapa de rastreabilidade recebe a evidência de cada controle (projects.ts:1003)', async () => {
        S.activeProject = { id: 'p1', project_name: 'Projeto' };
        servir({
            'GET /api/v1/projects/p1/controls': { ok: true, controls: [{ id: 'c1', project_id: 'p1', title: 'A.5.1 — Políticas', status: 'Implemented' }] },
            'GET /api/v1/projects/p1/traceability': { ok: true, controls: [{
                id: 'c1', title: 'A.5.1 — Políticas', status: 'Implemented', risks: [],
                evidence: [{ id: 'e1', file_name: 'politica.pdf', created_at: '2026-10-01' }],
            }] },
        });
        await window.renderSoA(...tela());
        expect(window.currentSoATraceMap.c1.evidence).toHaveLength(1);
    });

    it('templates de política: viram opções do seletor (policies.ts:521)', async () => {
        servir({
            // policies.ts, GET .../controls/:controlId/policy (P2): sem texto de política, o modal abre o formulário de geração.
            'GET /api/v1/projects/p1/controls/A.5.1/policy': {
                ok: true, control: { id: 'ctrl-a51', project_id: 'p1', title: 'A.5.1 Políticas', description: '' },
                content: '', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', versions: [],
            },
            'GET /api/v1/policies/templates': { ok: true, templates: ['isms-policy', 'access-control-policy'] },
        });
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const opcoes = [...$('policy-template-select').options].map((o) => o.value);
        expect(opcoes).toEqual(['isms-policy', 'access-control-policy']);
    });
});
