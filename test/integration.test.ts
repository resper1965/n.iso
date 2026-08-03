import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';

// Minimal D1 mock
const mockD1 = {
  prepare: (sql: string) => ({
    bind: (...args: any[]) => ({
      all: async () => ({ results: [], success: true }),
      first: async () => null,
      run: async () => ({ success: true, meta: {} })
    }),
    all: async () => ({ results: [], success: true }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} })
  }),
  batch: async (stmts: any[]) => stmts.map(() => ({ results: [], success: true }))
};

// Minimal KV mock
const mockKV = {
  get: async (key: string) => null,
  put: async (key: string, value: string) => {},
  delete: async (key: string) => {}
};

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // `iat` é obrigatório desde a revogação de sessão: o middleware trata sessão
  // sem ele como revogada quando existe marco de invalidação para o usuário.
  const validSession = { id: 1, email: 'test@example.com', role: 'consultor', iat: Date.now() };
  // O mock devolve a sessão só para a chave de sessão. Antes devolvia o MESMO
  // objeto para qualquer chave, inclusive a de revogação — um KV que responde
  // a tudo não testa nada, e mascarava o comportamento do middleware.
  const mockAuthKV = {
    ...mockKV,
    get: async (key: string) =>
      key.startsWith('session') || !key.includes(':') ? JSON.stringify(validSession) : null,
  };

  describe('Group 1: Public routes (no auth needed)', () => {
    it('GET /api/v1/public/pricing returns tiers array', async () => {
      const res = await app.request('/api/v1/public/pricing', {}, { DB: mockD1, SESSIONS: mockKV });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.tiers)).toBe(true);
    });

    it('GET /api/v1/public/stats returns counts (with mocked D1)', async () => {
      const res = await app.request('/api/v1/public/stats', {}, { DB: mockD1, SESSIONS: mockKV });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toBeTypeOf('object');
    });

    it('GET /api/v1/marketplace/templates returns templates (with mocked D1)', async () => {
      const req = new Request('http://localhost/api/v1/marketplace/templates');
      req.headers.set('Authorization', 'Bearer valid-token');
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.templates)).toBe(true);
    });
  });

  describe('Group 2: Auth enforcement', () => {
    it('GET /api/v1/projects should fail without auth', async () => {
      const res = await app.request('/api/v1/projects', {}, { DB: mockD1, SESSIONS: mockKV });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/assessments should fail without auth', async () => {
      const req = new Request('http://localhost/api/v1/assessments', { method: 'POST' });
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockKV });
      expect(res.status).toBe(401);
    });
  });

  describe('Group 3: Risk sub-router (with mocked auth + D1)', () => {
    it('GET /api/v1/projects/test-project/risks returns empty array from mock D1', async () => {
      const req = new Request('http://localhost/api/v1/projects/test-project/risks');
      req.headers.set('Authorization', 'Bearer valid-token');
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.risks || data)).toBe(true);
    });

    it('POST /api/v1/projects/test-project/risks with valid body returns success', async () => {
      // asset e threat são NOT NULL em risks (schema.sql) — um corpo sem eles
      // violaria a constraint num D1 real, então o payload válido precisa incluí-los.
      const body = JSON.stringify({ asset: 'Servidor de aplicação', threat: 'Acesso não autorizado', probability: 3, impact: 3 });
      const req = new Request('http://localhost/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token', 'Content-Type': 'application/json' },
        body
      });
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('POST /projects/:id/risks rejects a body missing required fields (400)', async () => {
      const req = new Request('http://localhost/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Risk', probability: 3, impact: 3 })
      });
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(400);
    });

    it('POST /projects/:id/risks rejects out-of-range 5x5 scores (400)', async () => {
      const req = new Request('http://localhost/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'A', threat: 'T', impact: 99, probability: 3 })
      });
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(400);
    });
  });

  describe('Group 4: Policy templates (with mocked D1)', () => {
    it('GET /api/v1/policy-templates returns templates from D1', async () => {
      const req = new Request('http://localhost/api/v1/policy-templates');
      req.headers.set('Authorization', 'Bearer valid-token');
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.templates || data)).toBe(true);
    });

    it('GET /api/v1/policy-templates/nonexistent returns 404', async () => {
      const req = new Request('http://localhost/api/v1/policy-templates/nonexistent');
      req.headers.set('Authorization', 'Bearer valid-token');
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(404);
    });
  });

  describe('Group 5: CSV Export routes', () => {
    it('GET /api/v1/projects/test/export/risks returns CSV content-type', async () => {
      const req = new Request('http://localhost/api/v1/projects/test/export/risks');
      req.headers.set('Authorization', 'Bearer valid-token');
      const res = await app.request(req, {}, { DB: mockD1, SESSIONS: mockAuthKV });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
    });
  });
});
