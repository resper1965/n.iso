import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetSessions } from './helpers/d1';

describe('funil comercial por conta', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); await resetSessions(); });

  it('staff de conta MSP alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(200);
  });

  it('STAFF DE CONTA DIRETA NÃO ALCANÇA O FUNIL', async () => {
    const headers = await sessionFor({ id: 'u-c-staff', email: 'staff@c.com', role: 'consultor', conta_id: 'conta-c', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(403);
  });

  it('usuário de cliente não alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-a1-admin', email: 'admin@acme.com', role: 'org_admin', conta_id: null, cliente_id: 'cli-a1' });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(403);
  });

  it('platform_admin alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin', conta_id: null, cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(200);
  });
});
