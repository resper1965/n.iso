// Pedido de aprovação de política: quem pede escolhe só Líder SGSI ou Direção, e acompanha a
// aprovação ou a recusa (com o motivo). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/meus-pedidos.js';
import '../src/views/compliance.js';

const $ = (id) => document.getElementById(id);
const espera = () => new Promise((r) => setTimeout(r, 0));
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="alvo"></div>';
    S.token = 'tok123';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('pedido de aprovação de política', () => {
    it('o modal oferece só Líder SGSI e Direção e envia tipo politica com o id do controle', async () => {
        const f = servir({
            // governance.ts:66-70 devolve a lista crua
            'GET /api/v1/projects/p1/governance': [{ email: 'dir@cliente.com', name: 'Davi', job_title: 'Diretor Executivo', role_category: 'executivo' }],
            // routes/pedidos.ts, POST / (201)
            'POST /api/v1/projects/p1/pedidos': { ok: true, id: 'pd1', hash: 'h', links: [] },
        });
        await window.abrirPedidoAprovacao('p1', 'politica', 'ctrl_b_a51');
        expect([...$('pn-papel').options].map((o) => o.value)).toEqual(['ciso', 'ceo']);
        $('pn-papel').value = 'ceo';
        document.querySelector('input[name="pn-dest"]').checked = true;
        await window.enviarPedidoAprovacao(null, 'p1', 'politica', 'ctrl_b_a51');
        expect(corpoDe(f, 'POST /api/v1/projects/p1/pedidos')).toEqual({
            tipo: 'politica', ref_id: 'ctrl_b_a51', papel_exigido: 'ceo', destinatarios: [{ email: 'dir@cliente.com', nome: 'Davi' }],
        });
    });

    it('para DPIA, a ciência continua entre as opções', async () => {
        servir({ 'GET /api/v1/projects/p1/governance': [] });
        await window.abrirPedidoAprovacao('p1', 'dpia', 'dp1');
        expect([...$('pn-papel').options].map((o) => o.value)).toEqual(['ciso', 'ceo', 'ciente']);
    });

    it('quem pediu vê o pedido de aprovação de política e a recusa com o motivo', async () => {
        servir({
            // routes/pedidos.ts, GET / do projeto (sem `ok`: o api() devolve o objeto)
            'GET /api/v1/projects/p1/pedidos': { pedidos: [
                { id: 'pd1', tipo: 'politica', titulo: 'Política: A.5.1 Políticas', papel_exigido: 'ceo', status: 'recusado', total: 1, cientes: 0, pendentes: 0, nao_abriram: 0, criado_em: '2026-10-07' },
                { id: 'pd2', tipo: 'dpia', titulo: 'DPIA: Folha', papel_exigido: 'ciso', status: 'aberto', total: 1, cientes: 0, pendentes: 1, nao_abriram: 1, criado_em: '2026-10-07' },
            ] },
            // routes/pedidos.ts, GET /:id do projeto
            'GET /api/v1/projects/p1/pedidos/pd1': {
                pedido: { id: 'pd1', tipo: 'politica', titulo: 'Política: A.5.1 Políticas', papel_exigido: 'ceo', status: 'recusado', hash: 'h' },
                sem_link: 0,
                destinatarios: [{ email: 'dir@cliente.com', nome: 'Davi', status: 'recusado', situacao: 'recusado', decidido_em: '2026-10-07', motivo: 'Falta a seção de backup', versao_anterior: null, portal_antigo: null }],
            },
        });
        await window.renderCienciaLink($('alvo'), 'p1');
        expect($('alvo').textContent).toContain('Política: A.5.1 Políticas');
        expect($('alvo').textContent).toContain('Aprovação da Direção Executiva');
        expect($('alvo').textContent).not.toContain('DPIA: Folha');
        await window.abrirAcompanhamento('p1', 'pd1');
        expect($('modal-content').textContent).toContain('Recusado');
        expect($('modal-content').textContent).toContain('Falta a seção de backup');
    });

    it('o modal da política mostra "Pedir aprovação" para quem pede, com o id do controle', async () => {
        const texto = 'Texto da política. '.repeat(10);
        servir({
            'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy': { ok: true, control: { id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas', description: texto }, content: texto, hash: 'h', versions: [] },
            'GET /api/v1/policies/templates': { ok: true, templates: [] },
        });
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        const b = $('modal-content').querySelector('[data-action="abrirPedidoAprovacao"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p1', 'politica', 'ctrl_b_a51']);

        S.user = { role: 'org_user' };
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        await espera();
        expect($('modal-content').querySelector('[data-action="abrirPedidoAprovacao"]')).toBeNull();
    });
});
