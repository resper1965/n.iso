import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { requireProjectAccess, ForbiddenError, sha256Hex } from '../src/helpers';

const consultorA = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const consultorB = { id: 'u-b-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };
const adminA1 = { id: 'u-a1-admin', role: 'org_admin', conta_id: null, cliente_id: 'cli-a1' };
const userA1 = { id: 'u-a1-user', role: 'org_user', conta_id: null, cliente_id: 'cli-a1' };
const plataforma = { id: 'u-plataforma', role: 'platform_admin', conta_id: null, cliente_id: null };

describe('isolamento entre consultorias', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('consultor alcança projeto de cliente da própria conta', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-a2-27001')).resolves.toBe(true);
  });

  it('CONSULTOR NÃO ALCANÇA PROJETO DE OUTRA CONSULTORIA', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-b1-27001')).rejects.toThrow(ForbiddenError);
    await expect(requireProjectAccess(env.DB, consultorB, 'proj-a1-27001')).rejects.toThrow(ForbiddenError);
  });

  it('consultor não alcança projeto de conta direta', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-c-27001')).rejects.toThrow(ForbiddenError);
  });

  it('admin do cliente vê todos os projetos da empresa dele', async () => {
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a1-27701')).resolves.toBe(true);
  });

  it('admin do cliente não vê outra empresa da mesma consultoria', async () => {
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a2-27001')).rejects.toThrow(ForbiddenError);
  });

  it('usuário comum vê só o projeto concedido, mesmo sendo da mesma empresa', async () => {
    await expect(requireProjectAccess(env.DB, userA1, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, userA1, 'proj-a1-27701')).rejects.toThrow(ForbiddenError);
  });

  it('platform_admin alcança tudo', async () => {
    await expect(requireProjectAccess(env.DB, plataforma, 'proj-b1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, plataforma, 'proj-c-27001')).resolves.toBe(true);
  });

  it('papel desconhecido cai no ramo escopado', async () => {
    const ciso = { id: 'u-ciso', role: 'ciso', conta_id: null, cliente_id: null };
    await expect(requireProjectAccess(env.DB, ciso, 'proj-a1-27001')).rejects.toThrow(ForbiddenError);
  });

  it('projeto inexistente é recusa, não vazamento de existência', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'nao-existe')).rejects.toThrow(ForbiddenError);
  });

  it('a mensagem de projeto inexistente é idêntica à de projeto alheio', async () => {
    // Fixa a mensagem, não só o tipo: uma edição futura que diferencie os dois
    // casos ("não existe" vs. "sem acesso") passaria pelo teste acima, que só
    // olha `ForbiddenError`, e vazaria quais ids existem. Este trava o texto.
    const mensagemDe = async (projectId: string) => {
      try {
        await requireProjectAccess(env.DB, consultorA, projectId);
        throw new Error('esperava ForbiddenError');
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(await mensagemDe('nao-existe')).toBe(await mensagemDe('proj-b1-27001'));
  });
});

describe('chave de API pelo caminho HTTP (não passa por hidrataEscopo)', () => {
  // Estes 11 testes acima usam atores literais com conta_id/cliente_id já
  // prontos — nunca exercitam hidrataEscopo nem o pipeline HTTP de verdade.
  // Foi assim que a quebra de toda chave de API (ela não tem linha em `users`
  // para hidrataEscopo achar) passou despercebida na primeira rodada.
  const CHAVE = 'chave-msp-a1';

  beforeAll(async () => {
    await env.DB.prepare(
      `INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`
    ).bind('key-msp-a1', 'proj-a1-27001', await sha256Hex(CHAVE), 'chave msp a1', 'read', 'Active').run();
  });

  it('chave alcança o próprio projeto e não alcança o de outra consultoria', async () => {
    const propria = await worker.fetch(
      new Request('http://localhost/api/v1/projects/proj-a1-27001/risks', { headers: { 'X-API-Key': CHAVE } }),
      env as any
    );
    expect(propria.status, await propria.clone().text()).toBe(200);

    const alheio = await worker.fetch(
      new Request('http://localhost/api/v1/projects/proj-b1-27001/risks', { headers: { 'X-API-Key': CHAVE } }),
      env as any
    );
    expect(alheio.status).toBe(403);
  });
});
