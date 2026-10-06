// Testes de `src/state.js` — a hidratacao do estado global `S` a partir do
// localStorage. E o primeiro codigo que roda no boot: um valor corrompido aqui
// derruba a aplicacao inteira antes de qualquer tela aparecer. O modulo tem
// `safeParse` justamente para isso, e nada garantia que continuasse valendo.
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `S` e construido no topo do modulo, uma vez. Para testar formas diferentes de
 * localStorage e preciso reimportar o modulo do zero a cada caso.
 */
async function carregaEstado() {
    vi.resetModules();
    const mod = await import('../src/state.js');
    return mod.S;
}

describe('state.js — hidratacao a partir do localStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('le o token cru, sem validacao de forma', async () => {
        localStorage.setItem('niso_token', 'abc.def');
        expect((await carregaEstado()).token).toBe('abc.def');
    });

    it('token ausente vira null, nao undefined', async () => {
        expect((await carregaEstado()).token).toBeNull();
    });

    it('aceita usuario com email', async () => {
        localStorage.setItem('niso_user', JSON.stringify({ email: 'a@b.c', role: 'consultant' }));
        const S = await carregaEstado();
        expect(S.user.email).toBe('a@b.c');
        expect(S.user.role).toBe('consultant');
    });

    it('aceita usuario que so tem id', async () => {
        localStorage.setItem('niso_user', JSON.stringify({ id: 7 }));
        expect((await carregaEstado()).user).toEqual({ id: 7 });
    });

    it('rejeita usuario sem email e sem id, e limpa a chave', async () => {
        localStorage.setItem('niso_user', JSON.stringify({ nome: 'Fulano' }));
        expect((await carregaEstado()).user).toBeNull();
        expect(localStorage.getItem('niso_user')).toBeNull();
    });

    it('rejeita array onde se espera objeto', async () => {
        localStorage.setItem('niso_user', JSON.stringify([{ email: 'a@b.c' }]));
        expect((await carregaEstado()).user).toBeNull();
        expect(localStorage.getItem('niso_user')).toBeNull();
    });

    it('rejeita primitivo (JSON valido, forma errada)', async () => {
        localStorage.setItem('niso_user', '42');
        expect((await carregaEstado()).user).toBeNull();
    });

    it('rejeita null literal sem explodir', async () => {
        localStorage.setItem('niso_user', 'null');
        expect((await carregaEstado()).user).toBeNull();
    });

    it('JSON corrompido nao derruba o boot e a chave e removida', async () => {
        localStorage.setItem('niso_user', '{"email":"a@b.c"');
        const S = await carregaEstado();
        expect(S.user).toBeNull();
        expect(S.view).toBe('dashboard');
        expect(localStorage.getItem('niso_user')).toBeNull();
    });

    it('projeto ativo sem id e descartado', async () => {
        localStorage.setItem('niso_activeProject', JSON.stringify({ project_name: 'Acme' }));
        const S = await carregaEstado();
        expect(S.activeProject).toBeNull();
        expect(S.currentProject).toBeNull();
    });

    it('projeto ativo com id alimenta activeProject e currentProject', async () => {
        localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'p1', project_name: 'Acme' }));
        const S = await carregaEstado();
        expect(S.activeProject.id).toBe('p1');
        expect(S.currentProject.id).toBe('p1');
    });

    it('phaseChecks corrompido vira objeto vazio, nao null', async () => {
        localStorage.setItem('niso_phaseChecks', 'nao-e-json');
        expect((await carregaEstado()).phaseChecks).toEqual({});
    });

    it('phaseChecks valido e preservado', async () => {
        localStorage.setItem('niso_phaseChecks', JSON.stringify({ p1_0: ['a'] }));
        expect((await carregaEstado()).phaseChecks).toEqual({ p1_0: ['a'] });
    });

    it('expoe S em window para o codigo global legado', async () => {
        const S = await carregaEstado();
        expect(window.S).toBe(S);
    });

    it('defaults de colecao sao arrays vazios (views iteram sem checar)', async () => {
        const S = await carregaEstado();
        for (const chave of ['leads', 'assessments', 'projects', 'controls']) {
            expect(Array.isArray(S[chave])).toBe(true);
            expect(S[chave]).toHaveLength(0);
        }
    });
});
