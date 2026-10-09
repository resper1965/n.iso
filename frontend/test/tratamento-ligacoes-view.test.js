// Modal Ligações do tratamento (fatia 4.1/4.2): base legal, itens, departamentos, partes, transferências e diagrama.
// api() REAL; só o fetch é dublado, com o corpo de cada handler (src/routes/ropa.ts). A query string não entra na chave.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/tratamento-ligacoes.js';

const B = '/api/v1/projects/p9/ropa/r1';
const LIG = (extra = {}) => ({
    base_legal: { id: 'lgpd:art7:i', referencia: 'art. 7, I', titulo: 'Base <b>x</b>' },
    itens: [{ id: 'it1', nome: 'ERP <i>x</i>', tipo: 'sistema' }],
    departamentos: [{ id: 'dp1', nome: 'RH' }],
    partes: [{ vinculo_id: 'v1', parte_id: 'pa1', nome: 'Operadora <b>y</b>', tipo: 'organizacao', papel: 'operador' }],
    transferencias: [{ id: 't1', pais: 'Chile', destinatario_parte_id: 'pa1', destinatario: 'Operadora <b>y</b>', mecanismo: 'cláusulas', observacao: null }],
    ...extra,
});
const rotas = (extra = {}) => ({
    [`GET ${B}/ligacoes`]: LIG(),
    [`GET ${B}/diagrama`]: { mermaid: 'flowchart LR\n  n0["Folha"]' },
    'GET /api/v1/projects/p9/assets': { ok: true, assets: [{ id: 'it1', name: 'ERP' }, { id: 'it2', name: 'Folha' }] },
    'GET /api/v1/projects/p9/departamentos': [{ id: 'dp1', nome: 'RH' }, { id: 'dp2', nome: 'TI' }],
    'GET /api/v1/projects/p9/partes': [{ id: 'pa1', nome: 'Operadora', status: 'ativa' }, { id: 'pa2', nome: 'Antiga', status: 'inativa' }],
    'GET /api/v1/requisitos': [
        { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Bases', pai_id: null },
        { id: 'lgpd:art7:i', fonte_id: 'lgpd', referencia: 'art. 7, I', titulo: 'Base <b>x</b>', pai_id: 'lgpd:art7' },
        { id: 'lgpd:art9', fonte_id: 'lgpd', referencia: 'art. 9', titulo: 'Acesso', pai_id: null },
    ],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

async function abrir(extra = {}) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.openLigacoesTratamento('p9', 'r1');
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.ropa = [{ id: 'r1', processing_purpose: 'Folha de <b>pagamento</b>' }];
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('modal de ligações', () => {
    it('mostra base legal, itens, departamentos, partes e transferências, tudo escapado', async () => {
        await abrir();
        const m = el('modal-content');
        expect(m.textContent).toContain('Folha de <b>pagamento</b>');
        expect(m.textContent).toContain('art. 7, I — Base <b>x</b>');
        expect(m.textContent).toContain('Operadora <b>y</b>');
        expect(m.textContent).toContain('Operador');
        expect(m.textContent).toContain('Chile');
        expect(m.textContent).toContain('cláusulas');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
    });

    it('itens e departamentos: marcados vêm de ligações; só as bases do art. 7 e 11 entram no seletor; parte inativa fica de fora', async () => {
        await abrir();
        const marcado = (tipo) => [...document.querySelectorAll(`input[data-tl="${tipo}"]`)].map((i) => `${i.value}:${i.checked}`);
        expect(marcado('item')).toEqual(['it1:true', 'it2:false']);
        expect(marcado('depto')).toEqual(['dp1:true', 'dp2:false']);
        expect([...el('tl-base').querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'lgpd:art7:i']);
        expect([...el('tl-parte').querySelectorAll('option')].map((o) => o.value)).toEqual(['pa1']);
    });

    it('diagrama aparece como texto, sem virar HTML, e tem botão de copiar', async () => {
        await abrir({ [`GET ${B}/diagrama`]: { mermaid: 'flowchart LR\n  n0["<img src=x onerror=alert(1)>"]' } });
        expect(el('tl-diagrama').textContent).toContain('flowchart LR');
        expect(el('tl-diagrama').querySelector('img')).toBeNull();
        expect(document.querySelector('[data-action="copiarDiagramaTratamento"]')).not.toBeNull();
    });

    it('sem bases no catálogo: aviso no lugar do seletor', async () => {
        await abrir({ 'GET /api/v1/requisitos': [] });
        expect(el('tl-base')).toBeNull();
        expect(el('modal-content').textContent).toContain('ainda não tem as bases legais carregadas');
    });

    it('papel só de leitura vê as ligações, sem seletores nem botões, e não busca listas de edição', async () => {
        S.user = { role: 'org_user' };
        const f = await abrir();
        const m = el('modal-content');
        expect(m.textContent).toContain('ERP');
        expect(m.querySelector('input, select, [data-action="salvarItensTratamento"], [data-action="removerParteTratamento"]')).toBeNull();
        expect(chamadas(f)).not.toContain('GET /api/v1/projects/p9/assets');
    });
});

describe('ações', () => {
    it('salvar itens manda os marcados; salvar departamentos idem', async () => {
        const f = await abrir({ [`PUT ${B}/itens`]: { ok: true, total: 2 }, [`PUT ${B}/departamentos`]: { ok: true, total: 1 } });
        document.querySelector('input[data-tl="item"][value="it2"]').checked = true;
        await window.salvarItensTratamento('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/itens`)).toEqual({ itens: ['it1', 'it2'] });
        document.querySelector('input[data-tl="depto"][value="dp1"]').checked = false;
        await window.salvarDepartamentosTratamento('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/departamentos`)).toEqual({ departamentos: [] });
    });

    it('salvar base legal manda a finalidade (campo obrigatório) e a base; vazio desliga', async () => {
        const f = await abrir({ 'PUT /api/v1/ropa/r1': { ok: true } });
        el('tl-base').value = '';
        await window.salvarBaseLegalTratamento('p9', 'r1');
        expect(corpoDe(f, 'PUT /api/v1/ropa/r1')).toEqual({ processing_purpose: 'Folha de <b>pagamento</b>', base_legal_id: null });
    });

    it('ligar parte usa o vínculo existente com alvo tratamento; remover chama o DELETE do vínculo', async () => {
        const f = await abrir({ 'POST /api/v1/projects/p9/partes/pa1/vinculos': { ok: true, id: 'v2' }, 'DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1': { ok: true } });
        el('tl-papel').value = 'suboperador';
        await window.adicionarParteTratamento('p9', 'r1');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/partes/pa1/vinculos')).toEqual({ papel: 'suboperador', alvo_tipo: 'tratamento', alvo_id: 'r1' });
        await window.removerParteTratamento('p9', 'r1', 'pa1', 'v1');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1');
    });

    it('transferência: país obrigatório (não envia sem ele); com país manda destinatário e mecanismo; remover chama o DELETE', async () => {
        const f = await abrir({ [`POST ${B}/transferencias`]: { ok: true, id: 't2' }, [`DELETE ${B}/transferencias/t1`]: { ok: true } });
        el('tl-pais').value = '  ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(chamadas(f)).not.toContain(`POST ${B}/transferencias`);
        el('tl-pais').value = ' Estados Unidos ';
        el('tl-dest').value = 'pa1';
        el('tl-mec').value = ' cláusulas-padrão ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(corpoDe(f, `POST ${B}/transferencias`)).toEqual({ pais: 'Estados Unidos', destinatario_parte_id: 'pa1', mecanismo: 'cláusulas-padrão' });
        await window.removerTransferenciaTratamento('p9', 'r1', 't1');
        expect(chamadas(f)).toContain(`DELETE ${B}/transferencias/t1`);
    });

    it('erro do servidor vira aviso e não derruba a tela', async () => {
        await abrir();
        await window.salvarItensTratamento('p9', 'r1'); // PUT sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});
