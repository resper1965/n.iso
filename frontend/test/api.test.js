// Testes de `src/api.js` — a camada por onde passa TODA chamada ao backend.
// Ela decide tres coisas de consequencia alta e nenhuma delas era coberta:
//   1. quando deslogar o usuario (401);
//   2. qual mensagem de erro chega na tela;
//   3. qual pedaco do envelope `{ ok:true, X:[...] }` a view enxerga.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, API_BASE } from '../src/api.js';
import { S } from '../src/state.js';

/** Resposta minima com a superficie que `api()` consome de fetch. */
function resposta(corpo, { status = 200, contentType = 'application/json' } = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
        json: async () => corpo,
        text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    };
}

/** Erro de rede com o `name` que `api()` discrimina. */
function erroDeRede(nome) {
    const e = new Error(nome);
    e.name = nome;
    return e;
}

describe('api()', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        S.token = null;
        delete window.doLogout;
    });

    afterEach(() => {
        S.token = null;
    });

    describe('montagem da requisicao', () => {
        it('aponta para 127.0.0.1:8787 quando roda em localhost', () => {
            // O jsdom serve a pagina em localhost, entao este teste fixa o
            // comportamento de desenvolvimento: API separada do estatico.
            expect(API_BASE).toBe('http://127.0.0.1:8787');
        });

        it('nao manda Authorization quando nao ha token', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('GET', '/api/v1/leads');
            const [, opcoes] = fetchMock.mock.calls[0];
            expect(opcoes.headers.Authorization).toBeUndefined();
            expect(opcoes.headers['Content-Type']).toBe('application/json');
        });

        it('manda Bearer quando ha token no estado', async () => {
            S.token = 'tok-123';
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('GET', '/api/v1/leads');
            const [, opcoes] = fetchMock.mock.calls[0];
            expect(opcoes.headers.Authorization).toBe('Bearer tok-123');
        });

        it('serializa o corpo e preserva o metodo', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('POST', '/api/v1/leads', { nome: 'ness.' });
            const [url, opcoes] = fetchMock.mock.calls[0];
            expect(url).toBe(API_BASE + '/api/v1/leads');
            expect(opcoes.method).toBe('POST');
            expect(opcoes.body).toBe('{"nome":"ness."}');
        });

        it('nao envia corpo quando nao ha corpo', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('DELETE', '/api/v1/leads/1');
            expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
        });
    });

    describe('desembrulho do envelope { ok:true, X:[...] }', () => {
        it('devolve o array direto quando o envelope tem exatamente um array', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, risks: [{ id: 'r1' }, { id: 'r2' }] }));
            const r = await api('GET', '/api/v1/projects/p1/risks');
            expect(Array.isArray(r)).toBe(true);
            expect(r).toHaveLength(2);
        });

        it('devolve o objeto inteiro quando o envelope nao tem array', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, ativo: true, codigos_recuperacao_restantes: 8 }));
            const r = await api('GET', '/api/v1/auth/mfa/status');
            expect(r.ativo).toBe(true);
            expect(r.codigos_recuperacao_restantes).toBe(8);
        });

        it('array vazio no envelope tambem e desembrulhado', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, controls: [] }));
            expect(await api('GET', '/api/v1/projects/p1/controls')).toEqual([]);
        });

        // ARESTA AFIADA, nao bug novo: `src/views/security.js` ja convive com
        // isto no fluxo de MFA (ver o comentario em doMfaActivate). O teste
        // existe para que a perda das chaves irmas seja uma decisao visivel e
        // nao uma surpresa em um endpoint novo.
        it('perde as chaves irmas quando o envelope tem array E outros dados', async () => {
            fetchMock.mockResolvedValue(
                resposta({ ok: true, recovery_codes: ['a', 'b'], aviso: 'Guarde agora' })
            );
            const r = await api('POST', '/api/v1/auth/mfa/activate', { codigo: '123456' });
            expect(r).toEqual(['a', 'b']);
            expect(r.aviso).toBeUndefined();
        });

        it('nao desembrulha quando `ok` nao e exatamente true', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: 1, risks: [{ id: 'r1' }] }));
            const r = await api('GET', '/api/v1/projects/p1/risks');
            expect(Array.isArray(r)).toBe(false);
            expect(r.risks).toHaveLength(1);
        });

        it('array cru (sem envelope) passa intacto', async () => {
            fetchMock.mockResolvedValue(resposta([{ id: 'l1' }]));
            expect(await api('GET', '/api/v1/leads')).toEqual([{ id: 'l1' }]);
        });
    });

    describe('traducao de erro', () => {
        it('usa o campo `error` do corpo', async () => {
            fetchMock.mockResolvedValue(resposta({ error: 'Projeto nao encontrado' }, { status: 404 }));
            await expect(api('GET', '/api/v1/projects/x')).rejects.toThrow('Projeto nao encontrado');
        });

        it('junta as mensagens de `details` quando nao ha `error`', async () => {
            fetchMock.mockResolvedValue(
                resposta(
                    { details: [{ message: 'email obrigatorio' }, { message: 'senha obrigatoria' }] },
                    { status: 400 }
                )
            );
            await expect(api('POST', '/api/v1/auth/login', {})).rejects.toThrow(
                'email obrigatorio, senha obrigatoria'
            );
        });

        it('cai para "API Error" quando o corpo nao explica nada', async () => {
            fetchMock.mockResolvedValue(resposta({}, { status: 500 }));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow('API Error');
        });

        it('status de erro vence o desembrulho do envelope', async () => {
            fetchMock.mockResolvedValue(
                resposta({ ok: true, risks: [], error: 'Sem acesso ao projeto' }, { status: 403 })
            );
            await expect(api('GET', '/api/v1/projects/p1/risks')).rejects.toThrow('Sem acesso ao projeto');
        });

        it('resposta que nao e JSON vira erro explicito, nao parse quebrado', async () => {
            fetchMock.mockResolvedValue(
                resposta('<!DOCTYPE html><html>...', { status: 502, contentType: 'text/html' })
            );
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow(
                'Resposta HTTP 502 não é JSON (/api/v1/leads)'
            );
        });

        it('timeout de 30s vira mensagem com o caminho chamado', async () => {
            fetchMock.mockRejectedValue(erroDeRede('TimeoutError'));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow(
                'Tempo esgotado ao chamar /api/v1/leads (30s)'
            );
        });

        it('abort vira "Requisicao cancelada"', async () => {
            fetchMock.mockRejectedValue(erroDeRede('AbortError'));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow(/cancelada/);
        });

        it('qualquer outra falha de fetch vira "Falha de rede"', async () => {
            fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow(
                'Falha de rede ao chamar /api/v1/leads'
            );
        });
    });

    describe('401 e logout automatico', () => {
        it('desloga em 401 de rota comum', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Unauthorized' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('Unauthorized');
            expect(window.doLogout).toHaveBeenCalledTimes(1);
        });

        it('nao desloga em 401 do proprio login', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Credenciais invalidas' }, { status: 401 }));
            await expect(api('POST', '/api/v1/auth/login', {})).rejects.toThrow('Credenciais invalidas');
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        // Invariante do AGENTS.md: 401 nas rotas de MFA e resposta ESPERADA a
        // erro do usuario. Sem a isencao, errar um digito destruia a sessao.
        it.each([
            '/api/v1/auth/mfa/verify',
            '/api/v1/auth/mfa/activate',
            '/api/v1/auth/mfa/setup',
            '/api/v1/auth/mfa/disable',
        ])('nao desloga em 401 de %s e propaga a mensagem do servidor', async (rota) => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Codigo invalido' }, { status: 401 }));
            await expect(api('POST', rota, { codigo: '000000' })).rejects.toThrow('Codigo invalido');
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        it('nao quebra quando window.doLogout ainda nao foi registrado', async () => {
            fetchMock.mockResolvedValue(resposta({ error: 'Unauthorized' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('Unauthorized');
        });

        it('403 nao desloga (falta de permissao nao e sessao expirada)', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Somente leitura' }, { status: 403 }));
            await expect(api('POST', '/api/v1/projects', {})).rejects.toThrow('Somente leitura');
            expect(window.doLogout).not.toHaveBeenCalled();
        });
    });
});
