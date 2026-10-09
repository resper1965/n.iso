// Tela Encarregado (fatia 8): só leitura. api() REAL; só o fetch é dublado, com o corpo do handler (src/routes/encarregado.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/encarregado.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';

const VISAO = (extra = {}) => ({
    gerado_em: '2026-10-09T12:00:00Z',
    prioridades: [
        { nivel: 'alta', texto: '2 pedidos do titular atrasados', tela: 'titular' },
        { nivel: 'media', texto: '1 documento <b>com</b> revisão vencida', tela: 'documentos' },
    ],
    pedidos_titular: { abertos: 3, atrasados: 2, vencem_em_7_dias: 1, sem_prazo: 0, itens: [] },
    incidentes: { abertos: 1, comunicacoes_atrasadas: 0, comunicacoes_pendentes: 1, sem_avaliacao_de_risco: 0, itens: [] },
    tratamentos: { total: 6, sem_base_legal: 1, dpia_pendente: 1, lia_pendente: 0, sem_responsavel: 0, com_terceiro_vencido: 0 },
    terceiros: { total: 4, sem_tipo: 0, pendentes: 1, vencidos: 1, reprovados: 0 },
    documentos: { revisao_vencida: 1 },
    evidencias: { vencidas: 0, vencem_em_7_dias: 2 },
    lgpd: { carregada: true, total: 20, cobertos: 12, parciais: 3, lacunas: 5 },
    prazos_legais: { nao_definidos: [] },
    ...extra,
});
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);

async function abrir(visao = VISAO()) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    servir({ 'GET /api/v1/projects/p9/encarregado': visao });
    await window.renderEncarregado(el('c'), el('h'), el('a'));
}

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('tela do encarregado', () => {
    it('mostra os cartões e a lista "O que fazer" com o nível, o texto escapado e o botão da tela de destino', async () => {
        await abrir();
        const t = el('c').textContent;
        expect(t).toContain('Pedidos do titular');
        expect(t).toContain('2 atrasados');
        expect(t).toContain('Terceiros vencidos');
        expect(t).toContain('12/20');
        expect(t).toContain('2 pedidos do titular atrasados');
        expect(t).toContain('Alta');
        expect(t).toContain('Média');
        expect(t).toContain('1 documento <b>com</b> revisão vencida');
        expect(el('c').querySelector('b')).toBeNull();
        expect([...el('c').querySelectorAll('[data-action="navigate"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[0])).toEqual(['titular', 'documentos']);
    });

    it('catálogo da LGPD ainda não carregado: o cartão diz isso, sem número inventado', async () => {
        await abrir(VISAO({ lgpd: { carregada: false } }));
        expect(el('c').textContent).toContain('Catálogo ainda não carregado');
        expect(el('c').textContent).not.toContain('/0');
    });

    it('sem nenhuma pendência: mensagem de estar em dia', async () => {
        await abrir(VISAO({ prioridades: [] }));
        expect(el('c').textContent).toContain('Nada atrasado ou faltando');
    });

    it('sem projeto ativo: estado vazio, sem chamar a API', async () => {
        S.activeProject = null; S.projects = [];
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        const f = servir({});
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Sem projeto ativo');
        expect(chamadas(f)).toEqual([]);
    });

    it('falha do servidor: mensagem, não tela quebrada', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        servir({}); // 404 do Worker
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Não foi possível montar a visão');
    });
});

describe('menu n.privacy (casca)', () => {
    const grupo = html.slice(html.indexOf('id="group-privacy"'));
    const ids = [...grupo.slice(0, grupo.indexOf('group-intel')).matchAll(/id="(nav-[a-z-]+)"/g)].map((m) => m[1]);

    it('o grupo reúne a visão do encarregado, o RoPA, a DPIA, os requisitos, os terceiros e o titular, nessa ordem', () => {
        expect(ids).toEqual(['nav-encarregado', 'nav-ropa', 'nav-dpia', 'nav-requisitos', 'nav-terceiros', 'nav-titular']);
    });
    it('o rótulo é a marca n.privacy, com o ponto em destaque e nome acessível', () => {
        expect(html).toMatch(/aria-label="n\.privacy">n<span style="color:var\(--accent\)">\.<\/span>privacy<\/div>/);
    });
    it('cada item do grupo aponta para uma tela que existe no roteador', () => {
        for (const v of ['encarregado', 'ropa', 'dpia', 'requisitos', 'terceiros', 'titular']) expect(rota, v).toContain(`S.view === '${v}'`);
    });
});
