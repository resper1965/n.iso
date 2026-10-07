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

    it('troca de controle redesenha a lista; rótulos do Líder SGSI', async () => {
        document.body.innerHTML = '<div id="main-content"></div><div id="header-title"></div><div id="header-actions"></div>';
        S.view = 'evidence';
        await window.vincularEvidenciaControle('ev-1', 'ctl-1');
        const c = document.getElementById('main-content');
        expect(c.querySelectorAll('select[data-action-change="vincularEvidenciaControle"]')).toHaveLength(2);
        expect(c.textContent).toContain('Revisar (Líder SGSI)');
        expect(c.textContent).toContain('Revisadas (Líder SGSI)');
        expect(c.textContent).not.toContain('DPO');
        S.view = undefined;
    });

    it('upload do modal usa {ok,id,sha256} e o nome do arquivo escolhido, e relista', async () => {
        document.body.innerHTML = '<div id="main-content"></div><div id="header-title"></div><div id="header-actions"></div>'
            + '<input type="file" id="ev-file"><input id="ev-control-id"><div id="ev-msg"></div><button id="btn-ev-upload"></button>';
        S.view = 'evidence';
        const sha = 'ab'.repeat(32);
        const f2 = servir({
            'POST /api/v1/projects/p1/evidence/upload': { ok: true, id: 'ev-9', sha256: sha },
            'GET /api/v1/projects/p1/evidence': { ok: true, evidence: EVIDENCIAS },
            'GET /api/v1/projects/p1/controls': { ok: true, controls: CONTROLES },
        });
        const input = document.getElementById('ev-file');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'laudo.pdf')], configurable: true });
        await window.doEvidenceUpload('p1');
        expect(document.getElementById('ev-msg').textContent).toBe(`Evidencia enviada: laudo.pdf (SHA-256: ${sha.substring(0, 16)}...)`);
        expect(f2.mock.calls.some(([u, o]) => (o?.method || 'GET') === 'GET' && String(u).endsWith('/evidence'))).toBe(true);
        expect(document.getElementById('main-content').querySelectorAll('select').length).toBe(2);
        S.view = undefined;
    });
});
