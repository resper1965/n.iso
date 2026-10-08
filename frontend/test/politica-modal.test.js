// O modal de política chamava GET .../policy (inexistente), caía na lista GLOBAL de controles
// procurando 'ctrl-<código>' e salvava edição por uma "evidência vinculada" que nunca existia.
// api() REAL; só o fetch é dublado, com o corpo de cada handler (arquivo:linha ao lado).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/compliance.js';

const TEXTO = 'Texto da política de segurança da informação. '.repeat(5);
const controle = (extra = {}) => ({
    id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas de segurança da informação', description: TEXTO,
    ciso_approved_by: null, ciso_approved_at: null, ceo_approved_by: null, ceo_approved_at: null, ...extra,
});
// policies.ts, GET .../controls/:controlId/policy (Task 2)
const corpoPolitica = (ctrl) => ({ ok: true, control: ctrl, content: ctrl.description, hash: 'ab'.repeat(32), versions: [{ id: 'v1', version: 1, created_by: 'x@y.com', created_at: '2026-10-07' }] });
const rotasDoModal = (ctrl, extra = {}) => ({
    'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy': corpoPolitica(ctrl),
    'GET /api/v1/projects/p1/controls/A.5.1/policy': corpoPolitica(ctrl),
    'GET /api/v1/policies/templates': { ok: true, templates: [] }, // policies.ts:521
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const espera = () => new Promise((r) => setTimeout(r, 0));
const modal = () => document.getElementById('modal-content');

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok123';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('modal de política', () => {
    it('lê só a rota do projeto, com o id como veio, e nunca a lista global', async () => {
        // Com uma assinatura: o selo (que mostra o hash) só aparece quando há assinatura.
        const f = servir(rotasDoModal(controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' })));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        expect(chamadas(f)).toContain('GET /api/v1/projects/p1/controls/ctrl_b_a51/policy');
        expect(chamadas(f).some((k) => k === 'GET /api/v1/controls' || k.endsWith('/versions'))).toBe(false);
        expect(modal().textContent).toContain('A.5.1');
        expect(modal().textContent).toContain('ab'.repeat(32));
        // o Líder SGSI já assinou: o único botão "Assinar" é o da Direção
        const assinar = modal().querySelector('[data-action="signPolicy"]');
        expect(JSON.parse(assinar.getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51', 'ceo']);
        expect(JSON.parse(modal().querySelector('[data-action="openPolicyReport"]').getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51']);
    });

    it('controle que não existe no projeto mostra o erro, sem fallback nem formulário de geração', async () => {
        const f = vi.fn(async () => resposta({ error: 'Controle não encontrado' }, 404)); // policies.ts, 404 da Task 2
        vi.stubGlobal('fetch', f);
        await window.openGeneratePolicyModal('p1', 'A.9.9');
        expect(modal().textContent).toContain('Controle não encontrado');
        expect(modal().querySelector('#btn-gen-policy')).toBeNull();
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p1/controls/A.9.9/policy']);
    });

    it('salvar edição grava pela rota de política do controle, sem depender de evidência', async () => {
        const f = servir(rotasDoModal(controle(), {
            'POST /api/v1/projects/p1/controls/ctrl_b_a51/policy': { ok: true, control_id: 'ctrl_b_a51', version: 2 }, // policies.ts:510
        }));
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const editar = document.getElementById('btn-edit-policy');
        editar.onclick();
        document.getElementById('policy-editor-textarea').value = 'Texto novo';
        editar.onclick();
        await espera();
        expect(corpoDe(f, 'POST /api/v1/projects/p1/controls/ctrl_b_a51/policy')).toEqual({ text: 'Texto novo' });
        expect(modal().textContent).not.toContain('evidência vinculada');
    });

    it('salvar texto já assinado pede confirmação; sem ela, não grava', async () => {
        const f = servir(rotasDoModal(controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' })));
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const editar = document.getElementById('btn-edit-policy');
        editar.onclick();
        editar.onclick();
        await espera();
        expect(confirmar).toHaveBeenCalled();
        expect(chamadas(f).some((k) => k.startsWith('POST'))).toBe(false);
    });

    it('assinar pede só a senha, manda o papel para o id real e reabre com o estado do servidor', async () => {
        const f = servir(rotasDoModal(controle(), {
            'POST /api/v1/controls/ctrl_b_a51/approve': { ok: true, role: 'ceo', approved_by: 'Direção', approved_at: '2026-10-07' }, // controls.ts, Task 1
        }));
        const pedir = vi.spyOn(window, 'prompt').mockReturnValue('senha');
        await window.signPolicy('p1', 'ctrl_b_a51', 'ceo');
        expect(pedir).toHaveBeenCalledTimes(1);
        expect(corpoDe(f, 'POST /api/v1/controls/ctrl_b_a51/approve')).toEqual({ role: 'ceo', password: 'senha' });
        expect(chamadas(f)).toContain('GET /api/v1/projects/p1/controls/ctrl_b_a51/policy');
    });

    it('o relatório abre a rota de relatório da política', () => {
        const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
        window.openPolicyReport('p1', 'ctrl_b_a51');
        expect(abrir.mock.calls[0][0]).toContain('/api/v1/projects/p1/controls/ctrl_b_a51/policy/report?token=tok123');
    });
});
