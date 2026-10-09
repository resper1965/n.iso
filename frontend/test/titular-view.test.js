// Tela Titular e incidentes (fatia 7): pedidos, incidentes, consentimentos e prazos legais. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/titular.js';

const B = '/api/v1/projects/p9';
const PEDIDOS = [
    { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', recebido_em: '2026-10-01', prazo_em: '2026-10-16T00:00:00.000Z', status: 'recebido', situacao_prazo: 'no_prazo' },
    { id: 'b', protocolo: 'PT-2026-0002', tipo: 'correcao', canal: 'outro', recebido_em: '2026-10-02', prazo_em: null, status: 'em_andamento', situacao_prazo: 'sem_prazo' },
    { id: 'c', protocolo: 'PT-2026-0003', tipo: 'oposicao', canal: 'outro', recebido_em: '2026-09-01', prazo_em: '2026-09-16', status: 'recebido', situacao_prazo: 'atrasado' },
];
const INCIDENTES = [{ id: 'i1', protocolo: 'IN-2026-0001', titulo: 'Acesso <b>indevido</b>', ciencia_em: '2026-10-01T10:00:00Z', risco_titular: 'relevante', status: 'avaliado', prazo_anpd_em: '2026-10-04T10:00:00.000Z', prazo_titular_em: null, comunicacao_anpd_em: null, comunicacao_titular_em: null, situacao_anpd: 'atrasado', situacao_titular: 'sem_prazo' }];
const CONSENT = [
    { id: 'k1', ropa_id: 'r1', tratamento: 'Marketing <i>x</i>', titular_ref: 'ref-001', finalidade: 'E-mail', versao_aviso: 'Aviso v3', obtido_em: '2026-10-01', revogado_em: null, vigente: true },
    { id: 'k2', ropa_id: 'r1', tratamento: 'Marketing', titular_ref: 'ref-002', finalidade: 'E-mail', versao_aviso: 'Aviso v2', obtido_em: '2026-09-01', revogado_em: '2026-10-05T10:00:00Z', vigente: false },
];
const PARAMS = [
    { chave: 'titular.resposta', descricao: 'Prazo de resposta ao pedido do titular', definido: true, valor: 15, unidade: 'dias_corridos', fonte: 'Fonte <b>X</b>', revisado_em: '2026-10-01', revisado_por: 'Dra. Teste' },
    { chave: 'incidente.comunicacao_anpd', descricao: 'Prazo de comunicação do incidente à ANPD', definido: false },
];
const rotas = (extra = {}) => ({
    [`GET ${B}/titular-pedidos`]: PEDIDOS, [`GET ${B}/incidentes`]: INCIDENTES, [`GET ${B}/consentimentos`]: CONSENT,
    'GET /api/v1/parametros-legais': PARAMS, [`GET ${B}/ropa`]: [{ id: 'r1', processing_purpose: 'Marketing' }], ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

async function abrir(aba, extra = {}) {
    S.titularAba = aba;
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.renderTitular(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('abas', () => {
    it('mostra as quatro abas e abre em Pedidos; trocar de aba guarda a escolha e redesenha', async () => {
        await abrir(undefined);
        expect([...el('c').querySelectorAll('[data-action="escolherAbaTitular"]')].map((b) => b.textContent)).toEqual(['Pedidos do titular', 'Incidentes', 'Consentimentos', 'Prazos legais']);
        window.escolherAbaTitular('incidentes');
        expect(S.titularAba).toBe('incidentes');
        expect(window.render).toHaveBeenCalled();
    });
    it('sem projeto ativo: estado vazio', async () => {
        S.activeProject = null; S.projects = [];
        await abrir('pedidos');
        expect(el('c').textContent).toContain('Sem projeto ativo');
    });
});

describe('pedidos', () => {
    it('lista protocolo, tipo, prazo ("Não calculado" quando não há) e a situação do prazo', async () => {
        await abrir('pedidos');
        const t = el('c').textContent;
        expect(t).toContain('PT-2026-0001');
        expect(t).toContain('Acesso aos dados');
        expect(t).toContain('16/10/2026');
        expect(t).toContain('Não calculado');
        expect(t).toContain('No prazo');
        expect(t).toContain('Prazo não calculado');
        expect(t).toContain('Atrasado');
        expect(el('a').querySelector('[data-action="abrirNovoPedidoTitular"]')).not.toBeNull();
    });
    it('papel só de leitura não tem o botão de registrar', async () => {
        S.user = { role: 'org_user' };
        await abrir('pedidos');
        expect(el('a').innerHTML).toBe('');
    });
    it('registrar manda tipo, canal, contato e, só se preenchida, a data; mostra o protocolo e o prazo', async () => {
        const f = await abrir('pedidos', { [`POST ${B}/titular-pedidos`]: { ok: true, id: 'n', protocolo: 'PT-2026-0004', prazo_em: '2026-10-25T00:00:00.000Z' } });
        window.abrirNovoPedidoTitular('p9');
        el('pt-tipo').value = 'portabilidade'; el('pt-canal').value = 'email'; el('pt-nome').value = ' Fulano '; el('pt-desc').value = '';
        await window.salvarNovoPedidoTitular('p9');
        expect(corpoDe(f, `POST ${B}/titular-pedidos`)).toEqual({ tipo: 'portabilidade', canal: 'email', titular_nome: 'Fulano', titular_contato: null, descricao: null });
        expect(document.body.textContent).toContain('PT-2026-0004');
        expect(document.body.textContent).toContain('25/10/2026');
    });
    it('abrir o pedido mostra descrição e resposta escapadas; responder manda status e texto; respondido trava a resposta', async () => {
        const base = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: 'Ana <b>x</b>', titular_contato: null, descricao: 'Quero <i>meus</i> dados', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: null };
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos/a`]: { ...base, status: 'recebido' }, [`PUT ${B}/titular-pedidos/a`]: { ok: true } });
        await window.abrirPedidoTitular('p9', 'a');
        const m = el('modal-content');
        expect(m.textContent).toContain('Ana <b>x</b>');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
        el('pt-status').value = 'respondido'; el('pt-resp').value = ' Segue o relatório. ';
        await window.salvarPedidoTitular('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a`)).toEqual({ status: 'respondido', resposta_texto: 'Segue o relatório.' });
        servir(rotas({ [`GET ${B}/titular-pedidos/a`]: { ...base, status: 'respondido', resposta_texto: 'Segue.' } }));
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('pt-resp').disabled).toBe(true);
    });
});

describe('incidentes', () => {
    it('lista com risco, situações de prazo e título escapado', async () => {
        await abrir('incidentes');
        const t = el('c').textContent;
        expect(t).toContain('IN-2026-0001');
        expect(t).toContain('Acesso <b>indevido</b>');
        expect(t).toContain('Relevante');
        expect(t).toContain('Atrasado');
        expect(el('c').querySelector('b')).toBeNull();
    });
    it('registrar exige título e ciência (sem eles não chama a API) e mostra o protocolo', async () => {
        const f = await abrir('incidentes', { [`POST ${B}/incidentes`]: { ok: true, id: 'n', protocolo: 'IN-2026-0002', prazo_anpd_em: null, prazo_titular_em: null } });
        window.abrirNovoIncidente('p9');
        await window.salvarNovoIncidente('p9');
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes`);
        el('in-titulo').value = ' Perda de notebook '; el('in-ciencia').value = '2026-10-08';
        await window.salvarNovoIncidente('p9');
        expect(corpoDe(f, `POST ${B}/incidentes`)).toEqual({ titulo: 'Perda de notebook', descricao: null, ocorrido_em: null, ciencia_em: '2026-10-08' });
        expect(document.body.textContent).toContain('IN-2026-0002');
        expect(document.body.textContent).toContain('Prazos não calculados');
    });
    it('abrir mostra prazos e ações; avaliar, comunicar e encerrar chamam as rotas certas', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`PUT ${B}/incidentes/i1/risco`]: { ok: true }, [`POST ${B}/incidentes/i1/comunicacoes`]: { ok: true }, [`POST ${B}/incidentes/i1/encerrar`]: { ok: true },
        });
        await window.abrirIncidente('p9', 'i1');
        expect(el('in-prazos').textContent).toContain('prazo não calculado');
        el('in-risco').value = 'baixo'; el('in-aval').value = ' pouco dado ';
        await window.avaliarRiscoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/risco`)).toEqual({ risco_titular: 'baixo', avaliacao_texto: 'pouco dado' });
        await window.registrarComunicacaoIncidente('p9', 'i1', 'anpd');
        expect(corpoDe(f, `POST ${B}/incidentes/i1/comunicacoes`)).toEqual({ destino: 'anpd' });
        await window.encerrarIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`POST ${B}/incidentes/i1/encerrar`);
    });
    it('incidente encerrado e papel de leitura não têm ações', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], status: 'encerrado' } });
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="encerrarIncidente"]')).toBeNull();
        S.user = { role: 'org_user' };
        servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } }));
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="encerrarIncidente"]')).toBeNull();
    });
    it('erro de regra do servidor (409 no encerramento) vira aviso e não derruba a tela', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        await window.abrirIncidente('p9', 'i1');
        await window.encerrarIncidente('p9', 'i1'); // POST sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});

describe('consentimentos', () => {
    it('lista vigentes e revogados; só o vigente tem Revogar; aviso de pseudonimização; texto escapado', async () => {
        await abrir('consentimentos');
        const t = el('c').textContent;
        expect(t).toContain('Marketing <i>x</i>');
        expect(t).toContain('Vigente');
        expect(t).toContain('Revogado em 05/10/2026');
        expect(t).toContain('Não registre CPF');
        expect([...el('c').querySelectorAll('[data-action="revogarConsentimento"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[1])).toEqual(['k1']);
        expect(el('c').querySelector('i')).toBeNull();
    });
    it('registrar exige todos os campos e manda o tratamento escolhido; revogar chama a rota', async () => {
        const f = await abrir('consentimentos', { [`POST ${B}/consentimentos`]: { ok: true, id: 'n' }, [`POST ${B}/consentimentos/k1/revogar`]: { ok: true } });
        await window.abrirNovoConsentimento('p9');
        await window.salvarNovoConsentimento('p9');
        expect(chamadas(f)).not.toContain(`POST ${B}/consentimentos`);
        el('co-ref').value = 'ref-9'; el('co-fin').value = 'Newsletter'; el('co-aviso').value = 'Aviso v4'; el('co-data').value = '2026-10-08'; el('co-canal').value = '';
        await window.salvarNovoConsentimento('p9');
        expect(corpoDe(f, `POST ${B}/consentimentos`)).toEqual({ ropa_id: 'r1', canal: null, titular_ref: 'ref-9', finalidade: 'Newsletter', versao_aviso: 'Aviso v4', obtido_em: '2026-10-08' });
        await window.revogarConsentimento('p9', 'k1');
        expect(chamadas(f)).toContain(`POST ${B}/consentimentos/k1/revogar`);
    });
    it('sem tratamento cadastrado: avisa e não abre o formulário', async () => {
        await abrir('consentimentos', { [`GET ${B}/ropa`]: [] });
        await window.abrirNovoConsentimento('p9');
        expect(el('co-ref')).toBeNull();
        expect(document.body.textContent).toContain('Cadastre um tratamento');
    });
});

describe('prazos legais', () => {
    it('mostra o valor, a fonte e quem revisou, ou "Não definido"; só o administrador vê Editar/Definir', async () => {
        await abrir('prazos');
        const t = el('c').textContent;
        expect(t).toContain('15 dias corridos');
        expect(t).toContain('Fonte <b>X</b>');
        expect(t).toContain('01/10/2026 por Dra. Teste');
        expect(t).toContain('Não definido');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('[data-action="editarParametroLegal"]')).toBeNull();
        S.user = { role: 'platform_admin' };
        await abrir('prazos');
        expect([...el('c').querySelectorAll('[data-action="editarParametroLegal"]')].map((b) => b.textContent)).toEqual(['Editar', 'Definir']);
    });
    it('salvar exige valor, fonte, data e revisor; manda o corpo certo; remover chama o DELETE', async () => {
        S.user = { role: 'platform_admin' };
        const f = await abrir('prazos', { 'PUT /api/v1/parametros-legais/titular.resposta': { ok: true }, 'DELETE /api/v1/parametros-legais/titular.resposta': { ok: true } });
        window.editarParametroLegal('titular.resposta', 'Prazo de resposta', '', 'dias_corridos', '', '', '', true);
        await window.salvarParametroLegal('titular.resposta');
        expect(chamadas(f)).not.toContain('PUT /api/v1/parametros-legais/titular.resposta');
        el('pl-valor').value = '15'; el('pl-unidade').value = 'dias_uteis'; el('pl-fonte').value = ' Lei X, art. Y '; el('pl-rev-em').value = '2026-10-01'; el('pl-rev-por').value = ' Dra. Teste ';
        await window.salvarParametroLegal('titular.resposta');
        expect(corpoDe(f, 'PUT /api/v1/parametros-legais/titular.resposta')).toEqual({ valor: 15, unidade: 'dias_uteis', fonte: 'Lei X, art. Y', revisado_em: '2026-10-01', revisado_por: 'Dra. Teste' });
        await window.removerParametroLegal('titular.resposta');
        expect(chamadas(f)).toContain('DELETE /api/v1/parametros-legais/titular.resposta');
    });
});
