// A Central de Evidências não tinha como trocar o controle de uma evidência (o PUT existia sem
// tela) e lia `ai_status`, coluna que não existe: toda evidência aparecia "Não avaliado".
// Usa o api() real sobre um fetch dublado; formatos de src/routes/evidence.ts:345 ({ok, evidence})
// e src/routes/projects.ts:535 ({ok, controls}).
import { describe, it, expect, beforeEach } from 'vitest';
import { servir } from './servir-api.js';
import '../src/ui.js';
import '../src/views/compliance.js';
import { S } from '../src/state.js';

const EVIDENCIAS = [
    { id: 'ev-1', file_name: 'politica.pdf', control_id: null, evaluation_status: 'pending' },
    { id: 'ev-2', file_name: 'log.txt', control_id: 'ctl-1', evaluation_status: 'conforming' },
];
const CONTROLES = [{ id: 'ctl-1', title: 'A.5.1 — Políticas <img src=x onerror=alert(1)>' }];
let f;

function tela() {
    return { c: document.createElement('div'), h: document.createElement('div'), a: document.createElement('div') };
}

beforeEach(() => {
    f = servir({
        'GET /api/v1/projects/p1/evidence': { ok: true, evidence: EVIDENCIAS },
        'GET /api/v1/projects/p1/controls': { ok: true, controls: CONTROLES },
        'PUT /api/v1/evidence/ev-1': { ok: true },
        'PUT /api/v1/evidence/ev-2': { ok: true },
    });
    S.currentProject = { id: 'p1' };
    S.user = { role: 'consultor' };
});

describe('Central de Evidências', () => {
    it('mostra o seletor de controle com o vínculo atual e o status traduzido', async () => {
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        const seletores = c.querySelectorAll('select[data-action-change="vincularEvidenciaControle"]');
        expect(seletores).toHaveLength(2);
        expect(seletores[1].value).toBe('ctl-1');
        expect(seletores[0].value).toBe('');
        expect(c.querySelector('img')).toBeNull();
        expect(c.textContent).toContain('Conforme');
        expect(c.textContent).toContain('Pendente');
    });

    it('cliente vê o controle, sem seletor', async () => {
        S.user = { role: 'org_user' };
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        expect(c.querySelector('select[data-action-change="vincularEvidenciaControle"]')).toBeNull();
        expect(c.textContent).toContain('A.5.1');
    });

    it('trocar o controle chama o PUT da evidência; vazio desassocia', async () => {
        await window.vincularEvidenciaControle('ev-1', 'ctl-1');
        await window.vincularEvidenciaControle('ev-2', '');
        const corpos = f.mock.calls.filter(([, o]) => o.method === 'PUT').map(([u, o]) => [u, JSON.parse(o.body)]);
        expect(corpos).toEqual([
            [expect.stringContaining('/api/v1/evidence/ev-1'), { control_id: 'ctl-1' }],
            [expect.stringContaining('/api/v1/evidence/ev-2'), { control_id: null }],
        ]);
    });
});
