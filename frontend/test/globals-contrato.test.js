// Contrato tela↔API das funções de `src/globals.js`, com o `api()` real e só o `fetch` dublado.
// Mesmo preâmbulo de globals-ui.test.js: o módulo roda `initApp()` no import (sem token ele só
// mostra o overlay), então o overlay tem de existir antes.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
});

beforeEach(() => {
    document.body.innerHTML = `
        <div id="login-overlay" class="hidden"></div>
        <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
        <div id="content"></div>`;
    S.token = 'tok123';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('alteração de escopo (projects.ts:745-767)', () => {
    it('histórico: lê a lista crua e as colunas reais da tabela', async () => {
        servir({ 'GET /api/v1/projects/p1/scope-changes': [{
            id: 's1', project_id: 'p1', change_description: 'Incluir a API de pagamentos', reason: 'Produto novo',
            impact_analysis: 'Novos ativos de cartão', requested_by: 'ciso@acme.com.br', status: 'Pending', created_at: '2026-10-01 10:00:00',
        }] });
        await window.openScopeChangeModal('p1', { scope: 'Escopo atual' });
        const t = document.getElementById('modal-content').textContent;
        expect(t).toContain('Incluir a API de pagamentos');
        expect(t).toContain('Produto novo');
        expect(t).toContain('Novos ativos de cartão');
        expect(t).toContain('ciso@acme.com.br');
    });

    it('registrar: manda os campos que scopeChangeSchema exige', async () => {
        const f = servir({ 'POST /api/v1/projects/p1/scope-changes': { ok: true, id: 's2' } });
        document.body.insertAdjacentHTML('beforeend', `
            <textarea id="scope-new">Novo escopo</textarea><input id="scope-reason" value="Motivo">
            <textarea id="scope-impact">Impacto</textarea><input id="scope-approved-by" value="CISO">`);
        await window.submitScopeChange('p1', 'Escopo atual');
        const [, opts] = f.mock.calls.find(([u]) => String(u).endsWith('/scope-changes'));
        expect(JSON.parse(opts.body)).toEqual({ change_description: 'Novo escopo', reason: 'Motivo', impact_analysis: 'Impacto', requested_by: 'CISO' });
    });

    it('registrar recusado pelo servidor: avisa e não finge que gravou', async () => {
        servir({});
        document.body.insertAdjacentHTML('beforeend', `
            <textarea id="scope-new">Novo escopo</textarea><input id="scope-reason" value="Motivo">
            <textarea id="scope-impact"></textarea><input id="scope-approved-by" value="CISO">`);
        S.activeProject = { id: 'p1', scope: 'Escopo atual' };
        await window.submitScopeChange('p1', 'Escopo atual');
        expect(document.querySelector('.toast-error')?.textContent).toContain('alteração de escopo');
        expect(S.activeProject.scope).toBe('Escopo atual');
    });
});
