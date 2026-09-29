import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { ForbiddenError, erro500, requireProjectAccess, requireResourceAccess } from '../src/helpers';
import app from '../src/index';
import { env } from 'cloudflare:test';
import { applySchema, seedTwoProjects, sessionFor } from './helpers/d1';

/**
 * Negação de acesso é um TIPO, não um prefixo de string.
 *
 * Antes disto, 39 handlers decidiam entre 403 e 500 comparando
 * `e.message.startsWith('Forbidden')`. Quem lançasse uma negação com outra
 * mensagem — "Sem acesso ao projeto" — recebia 500: a recusa virava falha de
 * servidor, e tanto o cliente quanto o log passavam a mentir sobre o que
 * aconteceu.
 *
 * Estes testes fixam o contrato pelo tipo, nos três caminhos por onde uma
 * negação pode sair: o funil `erro500`, o handler global de erro, e as duas
 * funções que negam.
 */

describe('ForbiddenError', () => {
  // O pool de Workers isola storage por ARQUIVO, não por teste: semear uma vez.
  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    await env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level) VALUES (?,?,?,?,?,?,?)`
    ).bind('rsk-b', 'proj-b', 'Ativo B', 'Ameaça B', 3, 3, 'Medium').run();
  });

  it('requireProjectAccess lança ForbiddenError, não Error genérico', () => {
    const usuario = { role: 'org_admin', client_project_id: 'proj-a' };
    expect(() => requireProjectAccess(usuario, 'proj-b')).toThrow(ForbiddenError);
  });

  it('requireResourceAccess lança ForbiddenError quando o recurso é de outro tenant', async () => {
    const usuario = { role: 'org_admin', client_project_id: 'proj-a' };
    await expect(requireResourceAccess(env.DB, 'risks', 'rsk-b', usuario)).rejects.toThrow(ForbiddenError);
  });

  it('erro500 devolve 403 — e não 500 — quando o erro é uma negação', async () => {
    const teste = new Hono();
    teste.get('/x', (c) => erro500(c, 'Falha ao atualizar coisa', new ForbiddenError('Sem acesso a este projeto')));
    const res = await teste.request('/x');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Sem acesso a este projeto' });
  });

  it('erro500 continua devolvendo 500 para erro comum', async () => {
    const teste = new Hono();
    teste.get('/x', (c) => erro500(c, 'Falha ao atualizar coisa', new Error('coluna inexistente')));
    const res = await teste.request('/x');

    expect(res.status).toBe(500);
    const corpo = await res.json() as any;
    expect(corpo.error).toBe('Falha ao atualizar coisa');
    // A mensagem interna não vaza; o request_id é a ponte para o log.
    expect(JSON.stringify(corpo)).not.toContain('coluna inexistente');
    expect(corpo.request_id).toBeTruthy();
  });

  it('negação que escapa sem try/catch vira 403 pelo handler global, não 500', async () => {
    const headers = await sessionFor({ id: 'u-a', email: 'a@a.com', role: 'org_admin', client_project_id: 'proj-a' });

    // Rota de projeto alheio: a negação sai do middleware de tenant.
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/proj-b/risks', { headers }),
      env as any
    );
    expect(res.status).toBe(403);
  });
});
