import { describe, it, expect, vi, beforeAll } from 'vitest';
import worker from '../src/index';

// Mock global for Hono's serveStatic
// @ts-ignore
global.__STATIC_CONTENT_MANIFEST = '{}';
// @ts-ignore
global.__STATIC_CONTENT = {};

// Mock environment for D1, KV, etc.
const mockEnv = {
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ ok: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
    batch: vi.fn().mockResolvedValue([]),
  },
  SESSIONS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  STORAGE: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
  AI: {
    run: vi.fn(),
  },
  VECTOR_INDEX: {
    query: vi.fn(),
    upsert: vi.fn(),
  },
  ENVIRONMENT: 'test',
  SETUP_KEY: 'test-123',
};

describe('nISO API Unit Tests (Mocked Env)', () => {
  it('should return 200 for public pricing endpoint', async () => {
    const request = new Request('http://localhost/api/v1/public/pricing');
    // @ts-ignore
    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data).toHaveProperty('ok', true);
  });

  it('should return 401 for protected dashboard endpoint without token', async () => {
    const request = new Request('http://localhost/api/v1/dashboard/stats');
    // @ts-ignore
    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(401);
  });

  describe('RBAC & IDOR Protections', () => {
    it('should allow ADMIN to list users', async () => {
      const request = new Request('http://localhost/api/v1/admin/users', {
        headers: { 'Authorization': 'Bearer admin-token' }
      });
      // Mocking session check logic
      const envWithSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, role: 'admin' })),
        }
      };
      // @ts-ignore
      const response = await worker.fetch(request, envWithSession);
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should block CLIENT from accessing admin users', async () => {
      const request = new Request('http://localhost/api/v1/admin/users', {
        headers: { 'Authorization': 'Bearer client-token' }
      });
      const envWithClientSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client' })),
        }
      };
      // @ts-ignore
      const response = await worker.fetch(request, envWithClientSession);
      expect(response.status).toBe(403);
    });

    it('should block cross-organization project access (IDOR)', async () => {
      const request = new Request('http://localhost/api/v1/projects/999', {
        headers: { 'Authorization': 'Bearer client-token' }
      });
      const envWithClientSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ 
            id: 2, 
            role: 'client', 
            client_project_id: '123' // Only has access to project 123
          })),
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, envWithClientSession);
      expect(response.status).toBe(403);
    });
  });
});
