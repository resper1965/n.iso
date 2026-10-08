// I1: o link do questionário de autoatendimento (?assessment=<token>) precisa aparecer na tela.
// GET /api/v1/assessments/:id devolve o access_token (assessments.ts:244); a rota pública
// responde 410 depois de status 'converted' (assessments.ts:192), então o botão some nesse caso.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
    await import('../src/data/assessment.js');
    await import('../src/views/commercial.js');
});

beforeEach(() => {
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div><div id="c"></div><div id="h"></div><div id="a"></div>';
    S.token = 'tok'; S.currentAssessmentId = 'as1'; S.currentBlock = 1;
});
afterEach(() => { vi.unstubAllGlobals(); });

const rotas = (as) => ({ 'GET /api/v1/assessments/as1': as, 'GET /api/v1/assessments/as1/answers': [] });
const botao = () => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Copiar link do questionário'));

describe('link do questionário', () => {
    it('com access_token e levantamento em andamento: botão copia o link com o token codificado', async () => {
        servir(rotas({ id: 'as1', client_name: 'ACME', status: 'in_progress', access_token: 'a b/c' }));
        const escrever = vi.fn(async () => {});
        vi.stubGlobal('navigator', { clipboard: { writeText: escrever } });
        await window.renderAssessmentDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        expect(botao()).toBeTruthy();
        expect(botao().getAttribute('data-action')).toBe('copyAssessmentLink');
        await window.copyAssessmentLink(...JSON.parse(botao().getAttribute('data-args')));
        expect(escrever).toHaveBeenCalledWith(`${location.origin}/?assessment=a%20b%2Fc`);
    });

    it('clipboard indisponível: mostra o link num campo para copiar à mão', async () => {
        servir(rotas({ id: 'as1', client_name: 'ACME', status: 'in_progress', access_token: 'tk' }));
        vi.stubGlobal('navigator', {});
        await window.renderAssessmentDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        await window.copyAssessmentLink(...JSON.parse(botao().getAttribute('data-args')));
        expect(document.getElementById('assessment-link-url').value).toBe(`${location.origin}/?assessment=tk`);
    });

    it('convertido: sem botão (a rota pública devolve 410)', async () => {
        servir(rotas({ id: 'as1', client_name: 'ACME', status: 'converted', access_token: 'tk' }));
        await window.renderAssessmentDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        expect(botao()).toBeUndefined();
    });

    it('sem access_token: sem botão', async () => {
        servir(rotas({ id: 'as1', client_name: 'ACME', status: 'in_progress' }));
        await window.renderAssessmentDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        expect(botao()).toBeUndefined();
    });
});
