// n.iso e n.privacy (produtos separados sobre o mesmo cadastro): casca por domínio, menu, projetos do produto, sem acesso,
// link para o outro produto e o cartão de produtos do projeto. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import html from '../login.html?raw';
import { produtoAtual, aplicarCasca, projetosDoProduto, temProduto, enderecoDoProduto, semAcesso, atualizarLinkCruzado, SO_ISO, SO_PRIVACY } from '../src/produto.js';

const loc = (url) => { const u = new URL(url); return { hostname: u.hostname, search: u.search, origin: u.origin }; };
const el = (id) => document.getElementById(id);
const visiveis = () => [...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
const montarApp = () => { document.open(); document.write(html); document.close(); };

beforeEach(() => { try { sessionStorage.clear(); } catch (e) { /* jsdom */ } S.user = { role: 'platform_admin' }; S.activeProject = null; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('produtoAtual', () => {
    it('nprivacy.* é n.privacy; o domínio do n.iso e os legados são n.iso', () => {
        expect(produtoAtual(loc('https://nprivacy.ness.com.br/login'))).toBe('privacy');
        expect(produtoAtual(loc('https://niso.ness.com.br/login'))).toBe('iso');
        expect(produtoAtual(loc('https://n-iso.ness.com.br/'))).toBe('iso');
        expect(produtoAtual(loc('https://niso.ness.workers.dev/'))).toBe('iso');
    });
    it('?produto= só vale em localhost e fica guardado na aba', () => {
        expect(produtoAtual(loc('https://niso.ness.com.br/?produto=privacy'))).toBe('iso');
        expect(produtoAtual(loc('http://127.0.0.1:8787/login?produto=privacy'))).toBe('privacy');
        expect(produtoAtual(loc('http://127.0.0.1:8787/login'))).toBe('privacy');
        expect(produtoAtual(loc('http://localhost:8787/login?produto=iso'))).toBe('iso');
    });
});

describe('projetos do produto', () => {
    const P = [{ id: 'a', modulos: ['iso'] }, { id: 'b', modulos: ['privacy'] }, { id: 'c', modulos: ['iso', 'privacy'] }, { id: 'd' }];
    it('cada domínio lista só os projetos com o seu produto; sem a lista (resposta antiga) conta como n.iso', () => {
        expect(projetosDoProduto(P, 'iso').map((p) => p.id)).toEqual(['a', 'c', 'd']);
        expect(projetosDoProduto(P, 'privacy').map((p) => p.id)).toEqual(['b', 'c']);
        expect(projetosDoProduto(null, 'iso')).toEqual([]);
        expect(temProduto({ modulos: [] }, 'iso')).toBe(true);
    });
});

describe('casca', () => {
    it('n.privacy: título, marca, texto de entrada e menu só com as telas do produto e o cadastro', () => {
        montarApp();
        aplicarCasca('privacy');
        expect(document.title).toBe('n.privacy | ness. Privacidade');
        expect(el('sidebar-logo-mark').textContent).toBe('n.privacy');
        expect(document.querySelector('.entry-mark').textContent).toBe('n.privacy');
        expect(document.querySelector('.entry-title').textContent).toContain('Privacidade e LGPD');
        const v = visiveis();
        for (const id of SO_PRIVACY) expect(v, id).toContain(id);
        for (const id of SO_ISO) expect(v, id).not.toContain(id);
        for (const id of ['nav-partes', 'nav-documentos', 'nav-evidence', 'nav-ropa', 'nav-dpia', 'nav-assets']) expect(v, id).toContain(id);
        // o grupo comercial inteiro some (rótulo também)
        expect(el('group-sales').dataset.foraDoProduto).toBe('1');
        expect(el('label-group-sales').dataset.foraDoProduto).toBe('1');
        expect(document.querySelector('[data-args=\'["group-privacy"]\']').textContent).toBe('Privacidade');
    });
    it('n.iso: igual ao de sempre, sem as telas exclusivas do n.privacy, e com RoPA e DPIA', () => {
        montarApp();
        aplicarCasca('iso');
        expect(document.title).toBe('n.iso | ness. Agentic GRC');
        expect(el('sidebar-logo-mark').textContent).toBe('n.iso');
        const v = visiveis();
        for (const id of SO_PRIVACY) expect(v, id).not.toContain(id);
        for (const id of [...SO_ISO, 'nav-ropa', 'nav-dpia']) expect(v, id).toContain(id);
        expect(el('group-sales').dataset.foraDoProduto).toBe('');
        expect(document.querySelectorAll('.entry-section:not([hidden])').length).toBeGreaterThan(0);
    });
    it('todo item do menu é de um produto, do outro ou dos dois (nenhum id inventado nas listas)', () => {
        montarApp();
        const ids = new Set([...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].map((n) => n.id));
        for (const id of [...SO_ISO, ...SO_PRIVACY]) expect(ids.has(id), id).toBe(true);
    });
});

describe('sem acesso e link cruzado', () => {
    it('sem projeto do produto: mensagem e link para o outro produto', () => {
        document.body.innerHTML = '<div id="c"></div>';
        semAcesso(el('c'), 'privacy');
        expect(el('c').textContent).toContain('Você não tem acesso ao n.privacy');
        expect(el('c').querySelector('a').getAttribute('href')).toBe('http://localhost:3000/login?produto=iso'); // jsdom roda em localhost
    });
    it('o link para o outro produto só aparece quando o projeto ativo tem os dois', () => {
        document.body.innerHTML = '<nav id="sidebar"></nav>';
        S.activeProject = { id: 'a', modulos: ['iso'] };
        atualizarLinkCruzado();
        expect(el('link-outro-produto')).toBeNull();
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        atualizarLinkCruzado();
        expect(el('link-outro-produto').textContent).toBe('Abrir este projeto no n.privacy');
        S.activeProject = { id: 'a', modulos: ['iso'] };
        atualizarLinkCruzado();
        expect(el('link-outro-produto')).toBeNull();
    });
    it('endereço do outro produto: domínio próprio em produção, mesma origem com ?produto em localhost', () => {
        expect(enderecoDoProduto('privacy', loc('https://niso.ness.com.br/'))).toBe('https://nprivacy.ness.com.br/');
        expect(enderecoDoProduto('iso', loc('https://nprivacy.ness.com.br/'))).toBe('https://niso.ness.com.br/');
        expect(enderecoDoProduto('privacy', loc('http://127.0.0.1:8787/login'))).toBe('http://127.0.0.1:8787/login?produto=privacy');
    });
});

describe('produtos do projeto', () => {
    const abrir = async (estado, extra = {}) => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir({ 'GET /api/v1/projects/p9/modulos': estado, 'GET /api/v1/projects': [], ...extra });
        await window.abrirProdutosDoProjeto('p9');
        return f;
    };
    const acoes = () => [...document.querySelectorAll('[data-action="alternarProdutoDoProjeto"]')].map((b) => JSON.parse(b.getAttribute('data-args')).slice(1));

    it('mostra os dois produtos; habilita o contratado e desliga o ligado; o não contratado não tem botão', async () => {
        await abrir({ habilitados: ['iso'], contratados: ['iso'] });
        expect(el('produtos-do-projeto').textContent).toContain('não contratado pela organização');
        expect(acoes()).toEqual([['iso', false]]);
        await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] });
        expect(acoes()).toEqual([['iso', false], ['privacy', true]]);
    });
    it('quem não administra só vê', async () => {
        S.user = { role: 'consultor' };
        await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] });
        expect(acoes()).toEqual([]);
    });
    it('alternar manda o PUT certo e recarrega', async () => {
        const f = await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] }, { 'PUT /api/v1/projects/p9/modulos/privacy': { ok: true } });
        await window.alternarProdutoDoProjeto('p9', 'privacy', true);
        const c = f.mock.calls.find(([u, o]) => o?.method === 'PUT');
        expect(new URL(c[0], 'http://x').pathname).toBe('/api/v1/projects/p9/modulos/privacy');
        expect(JSON.parse(c[1].body)).toEqual({ habilitado: true });
    });
});
