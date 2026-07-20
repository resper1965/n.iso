import { describe, it, expect } from 'vitest';
import risks from './risks';
import { Hono } from 'hono';

describe('Risks Router', () => {
  it('should be a Hono instance', () => {
    expect(risks).toBeInstanceOf(Hono);
  });

  it('should have route handlers registered', () => {
    const routes = risks.routes;
    const paths = routes.map(r => r.path);
    expect(paths).toContain('/api/v1/projects/:id/risks');
    expect(paths).toContain('/api/v1/risks/:id');
    expect(paths).toContain('/api/v1/projects/:id/risks/history');
  });

  it('GET /api/v1/projects/test-id/risks returns error without DB (route is wired)', async () => {
    const res = await risks.request('/api/v1/projects/test-id/risks');
    // Without DB binding, it should error but NOT 404 (proving route exists)
    expect(res.status).not.toBe(404);
  });
});
