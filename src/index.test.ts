import { describe, it, expect } from 'vitest';
import app from './index';

describe('nISO API Smoke Tests', () => {
  it('GET /api/v1/public/pricing returns 200 with pricing tiers', async () => {
    // Hono's app.request() doesn't need real bindings for public endpoints
    const res = await app.request('/api/v1/public/pricing');
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean, tiers: unknown[] };
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('tiers');
    expect(Array.isArray(data.tiers)).toBe(true);
    expect(data.tiers.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/public/stats returns 200', async () => {
    // Mock DB for the stats endpoint which queries the database
    const MOCK_ENV = {
      DB: {
        prepare: () => ({
          first: async () => ({
            cnt: 1
          }),
          bind: () => ({
            first: async () => ({
              cnt: 1
            })
          })
        })
      }
    };
    const res = await app.request('/api/v1/public/stats', {}, MOCK_ENV as any);
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean, projects: number };
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('projects');
  });
});
