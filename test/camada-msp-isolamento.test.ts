import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { requireProjectAccess, ForbiddenError } from '../src/helpers';

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
});
