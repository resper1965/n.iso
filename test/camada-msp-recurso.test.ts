import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { requireResourceAccess, ForbiddenError } from '../src/helpers';

const consultorA = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const consultorB = { id: 'u-b-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };

describe('requireResourceAccess entre consultorias', () => {
  beforeAll(async () => {
    await applySchema();
    await seedMatrizMsp();
    // `risks` não tem `title`/`status`: as colunas obrigatórias são `asset` e
    // `threat`, e `risk_score` é GENERATED — não se insere nela.
    await env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset, threat) VALUES ('risco-a', 'proj-a1-27001', 'Servidor de aplicação', 'Acesso indevido')`
    ).run();
  });

  it('consultor da conta dona alcança o recurso', async () => {
    await expect(requireResourceAccess(env.DB, 'risks', 'risco-a', consultorA)).resolves.toBe(true);
  });

  it('CONSULTOR DE OUTRA CONSULTORIA NÃO ALCANÇA', async () => {
    await expect(requireResourceAccess(env.DB, 'risks', 'risco-a', consultorB)).rejects.toThrow(ForbiddenError);
  });

  it('tabela fora da allowlist continua sendo erro, não recusa', async () => {
    await expect(requireResourceAccess(env.DB, 'users', 'u-a1-user', consultorA)).rejects.toThrow('Invalid table');
  });
});
