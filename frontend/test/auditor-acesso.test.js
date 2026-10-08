// Acesso do auditor externo na tela de Auditorias: só a equipe da consultoria vê; o link aparece
// uma vez depois de gerado; revogar chama a rota do próprio projeto; dado do servidor é escapado.
// Usa o api() REAL sobre fetch dublado (servir-api.js), com o corpo que os handlers devolvem
// (src/routes/projects.ts: POST /:id/auditor-token, GET /:id/auditor-token, POST .../revogar).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';

const LISTA = { tokens: [{ id: 't1', created_by: '<img src=x>', created_at: '2026-10-01 12:00:00', expires_at: '2026-10-31 12:00:00' }] };
const LINK = 'https://niso.ness.com.br/auditor#' + 'a'.repeat(64);
const GET = 'GET /api/v1/projects/p1/auditor-token';
const POST = 'POST /api/v1/projects/p1/auditor-token';
const REVOGAR = 'POST /api/v1/projects/p1/auditor-token/t1/revogar';

let renderAcessoAuditor;
let el;

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
    await import('../src/views/grc.js');
    ({ renderAcessoAuditor } = await import('../src/views/auditor-acesso.js'));
});

beforeEach(() => {
    document.body.innerHTML = '<div id="alvo"></div>';
    el = document.getElementById('alvo');
    S.token = 'tok';
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const chamadas = (f, chave) => { const [m, p] = chave.split(" "); return f.mock.calls.filter(([u, o]) => (o?.method || "GET") === m && new URL(u, "http://localhost").pathname === p); };

describe('acesso do auditor externo', () => {
    it('papel de cliente não vê o cartão e nada é pedido à API', async () => {
        const f = servir({});
        await renderAcessoAuditor(el, 'p1', 'org_admin');
        expect(el.innerHTML).toBe('');
        expect(f).not.toHaveBeenCalled();
    });

    it('consultor vê os links válidos, com o dado do servidor escapado', async () => {
        const f = servir({ [GET]: LISTA });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        expect(chamadas(f, GET)).toHaveLength(1);
        expect(el.querySelector('#aud-ext-titulo').textContent).toBe('Acesso do auditor externo');
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toContain('<img src=x>');
        const revogar = el.querySelector('[data-action="revogarAcessoAuditor"]');
        expect(JSON.parse(revogar.getAttribute('data-args'))).toEqual(['p1', 't1']);
    });

    it('sem link válido: diz que não há', async () => {
        servir({ [GET]: { tokens: [] } });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        expect(el.querySelector('#aud-ext-lista').textContent).toContain('Nenhum link válido agora');
    });

    it('gerar mostra o link uma vez, com o aviso, e recarrega a lista', async () => {
        const f = servir({ [GET]: LISTA, [POST]: { id: 't2', url: LINK, expires_at: '2026-10-14 12:00:00' } });
        await renderAcessoAuditor(el, 'p1', 'consultoria_admin');
        document.getElementById('aud-ext-dias').value = '7';
        await window.gerarAcessoAuditor('p1');
        const post = chamadas(f, POST);
        expect(post).toHaveLength(1);
        expect(JSON.parse(post[0][1].body)).toEqual({ days_valid: 7 });
        expect(document.getElementById('aud-ext-link').value).toBe(LINK);
        expect(document.getElementById('aud-ext-novo').textContent).toContain('não aparece de novo');
        expect(chamadas(f, GET)).toHaveLength(2);
    });

    it('validade fora de 1 a 365 dias não chama a API e diz o porquê', async () => {
        const f = servir({ [GET]: LISTA });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        f.mockClear();
        for (const v of ['0', '366', '', '2.5']) {
            document.getElementById('aud-ext-dias').value = v;
            await window.gerarAcessoAuditor('p1');
        }
        expect(f).not.toHaveBeenCalled();
        expect(document.getElementById('aud-ext-erro').textContent).toContain('1 a 365');
    });

    it('revogar pede confirmação e chama a rota do próprio projeto', async () => {
        const f = servir({ [GET]: LISTA, [REVOGAR]: { revogado: true } });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        const confirma = vi.spyOn(window, 'confirm').mockReturnValue(true);
        await window.revogarAcessoAuditor('p1', 't1');
        expect(confirma).toHaveBeenCalled();
        expect(chamadas(f, REVOGAR)).toHaveLength(1);
        confirma.mockReturnValue(false);
        f.mockClear();
        await window.revogarAcessoAuditor('p1', 't1');
        expect(f).not.toHaveBeenCalled();
    });

    it('revogar limpa o link recém-gerado; gerar sem #aud-ext-erro não quebra', async () => {
        servir({ [GET]: LISTA, [POST]: { id: 't2', url: LINK, expires_at: '2026-10-14 12:00:00' }, [REVOGAR]: { revogado: true } });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        await window.gerarAcessoAuditor('p1');
        expect(document.getElementById('aud-ext-link')).not.toBeNull();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await window.revogarAcessoAuditor('p1', 't1');
        expect(document.getElementById('aud-ext-link')).toBeNull();
        expect(document.getElementById('aud-ext-novo').innerHTML).toBe('');
        document.body.innerHTML = '';
        await expect(window.gerarAcessoAuditor('p1')).resolves.toBeUndefined();
    });

    it('copiar usa a área de transferência e, sem ela, seleciona o campo', async () => {
        servir({ [GET]: LISTA, [POST]: { id: 't2', url: LINK, expires_at: '2026-10-14 12:00:00' } });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        await window.gerarAcessoAuditor('p1');
        const grava = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { clipboard: { writeText: grava } });
        await window.copiarLinkAuditor();
        expect(grava).toHaveBeenCalledWith(LINK);
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('x')) } });
        const sel = vi.spyOn(document.getElementById('aud-ext-link'), 'select');
        await window.copiarLinkAuditor();
        expect(sel).toHaveBeenCalled();
    });

    it('a tela de Auditorias monta o cartão', async () => {
        servir({ 'GET /api/v1/projects/p1/audits': [], [GET]: LISTA });
        S.activeProject = { id: 'p1', project_name: 'P' };
        S.user = { role: 'consultor' };
        const c = document.createElement('div');
        await window.renderAudits(c, document.createElement('div'), document.createElement('div'));
        expect(c.querySelector('#aud-ext-titulo')?.textContent).toBe('Acesso do auditor externo');
    });
});
