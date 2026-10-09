// O agente grava política como RASCUNHO (fatia 3.2). Sem este aviso o consultor não teria como ver nem publicar o
// que o agente propôs. api() REAL; só o fetch é dublado, com o corpo de cada handler (arquivo ao lado).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/compliance.js';

const TEXTO = 'Texto da política de segurança da informação. '.repeat(5);
const controle = (extra = {}) => ({ id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas', description: TEXTO, ciso_approved_by: null, ceo_approved_by: null, ...extra });
// policies.ts, GET .../controls/:controlId/policy (a resposta ganhou `rascunho`)
const corpo = (ctrl, rascunho) => ({ ok: true, control: ctrl, content: ctrl.description, hash: 'ab'.repeat(32), versions: [], rascunho });
const RASCUNHO = { documento_id: 'doc1', numero: 3, texto: 'Proposta do agente', origem: 'agente', criado_por: 'agente de x@ness.lat (Cliente)', criado_em: '2026-10-09 10:00:00' };
const rotas = (ctrl, rascunho, extra = {}) => ({
    'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy': corpo(ctrl, rascunho),
    'GET /api/v1/policies/templates': { ok: true, templates: [] },
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const modal = () => document.getElementById('modal-content');
const espera = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok123';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('rascunho do agente no modal de política', () => {
    it('mostra o aviso com autor, data e texto, e os dois botões', async () => {
        servir(rotas(controle(), RASCUNHO));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        const aviso = modal().querySelector('#policy-rascunho');
        expect(aviso).not.toBeNull();
        expect(aviso.textContent).toContain('Rascunho do agente aguardando revisão');
        expect(aviso.textContent).toContain('agente de x@ness.lat (Cliente)');
        expect(aviso.textContent).toContain('Proposta do agente');
        expect(aviso.textContent).toContain('A política vigente só muda quando você publicar');
        expect(JSON.parse(aviso.querySelector('[data-action="publicarRascunhoPolitica"]').getAttribute('data-args'))).toEqual(['p1', 'doc1', 3, 'ctrl_b_a51']);
        expect(JSON.parse(aviso.querySelector('[data-action="descartarRascunhoPolitica"]').getAttribute('data-args'))).toEqual(['p1', 'doc1', 'ctrl_b_a51']);
    });

    it('sem rascunho, nada aparece', async () => {
        servir(rotas(controle(), null));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        expect(modal().querySelector('#policy-rascunho')).toBeNull();
    });

    it('também aparece quando o controle ainda não tem política (formulário de geração)', async () => {
        servir(rotas(controle({ description: 'Catálogo' }), RASCUNHO));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        expect(modal().querySelector('#btn-gen-policy')).not.toBeNull();
        expect(modal().querySelector('#policy-rascunho')).not.toBeNull();
    });

    it('o texto do rascunho nunca vira HTML', async () => {
        servir(rotas(controle(), { ...RASCUNHO, texto: '<img src=x onerror=alert(1)>', criado_por: '<b>x</b>' }));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        const aviso = modal().querySelector('#policy-rascunho');
        expect(aviso.querySelector('img')).toBeNull();
        expect(aviso.querySelector('b')).toBeNull();
        expect(aviso.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('Publicar chama a rota de publicação e reabre o modal', async () => {
        const f = servir(rotas(controle(), RASCUNHO, { 'POST /api/v1/projects/p1/documentos/doc1/versoes/3/publicar': { ok: true, numero: 3 } }));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        await window.publicarRascunhoPolitica('p1', 'doc1', 3, 'ctrl_b_a51');
        await espera();
        const c = chamadas(f);
        expect(c).toContain('POST /api/v1/projects/p1/documentos/doc1/versoes/3/publicar');
        expect(c.filter((k) => k === 'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy')).toHaveLength(2);
    });

    it('Descartar chama a rota de descarte e reabre o modal', async () => {
        const f = servir(rotas(controle(), RASCUNHO, { 'DELETE /api/v1/projects/p1/documentos/doc1/rascunho': { ok: true } }));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        await window.descartarRascunhoPolitica('p1', 'doc1', 'ctrl_b_a51');
        await espera();
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p1/documentos/doc1/rascunho');
    });

    it('falha ao publicar mostra o erro e não reabre o modal', async () => {
        const f = servir(rotas(controle(), RASCUNHO)); // sem a rota de publicar: 404 do Worker
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        await window.publicarRascunhoPolitica('p1', 'doc1', 3, 'ctrl_b_a51');
        await espera();
        expect(chamadas(f).filter((k) => k.startsWith('GET /api/v1/projects/p1/controls/'))).toHaveLength(1);
    });
});
