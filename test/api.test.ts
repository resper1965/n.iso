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

    it('should allow platform_admin to call PUT and DELETE users', async () => {
      const putRequest = new Request('http://localhost/api/v1/users/456', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name', role: 'org_admin' })
      });
      const deleteRequest = new Request('http://localhost/api/v1/users/456', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer admin-token' }
      });

      const envWithSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, role: 'platform_admin' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: '456', email: 'test@example.com' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }
      };

      // @ts-ignore
      const putResponse = await worker.fetch(putRequest, envWithSession);
      expect(putResponse.status).toBe(200);

      // @ts-ignore
      const deleteResponse = await worker.fetch(deleteRequest, envWithSession);
      expect(deleteResponse.status).toBe(200);
    });

    it('should enforce read-only role (org_user) to block write but allow checklist-progress and evidence upload', async () => {
      const blockRequest = new Request('http://localhost/api/v1/projects/123/risks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Risk' })
      });
      
      const allowChecklistRequest = new Request('http://localhost/api/v1/projects/123/checklist-progress', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: 'p1_1', is_checked: 1 })
      });

      const envWithSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 3, role: 'org_user', client_project_id: '123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        }
      };

      // @ts-ignore
      const blockResponse = await worker.fetch(blockRequest, envWithSession);
      expect(blockResponse.status).toBe(403);

      // @ts-ignore
      const allowResponse = await worker.fetch(allowChecklistRequest, envWithSession);
      expect(allowResponse.status).not.toBe(403);
    });

    it('should map legacy roles to new roles for compatibility', async () => {
      const request = new Request('http://localhost/api/v1/users', {
        headers: { 'Authorization': 'Bearer old-admin-token' }
      });
      const envWithLegacySession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, role: 'admin' })), // legacy admin
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, envWithLegacySession);
      expect(response.status).toBe(200);
    });
  });
});
