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

    it('should allow platform_admin to create new users', async () => {
      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'newuser@example.com', password: 'password123', name: 'New User', role: 'org_admin', client_project_id: '123' })
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
          run: vi.fn().mockResolvedValue({ success: true }),
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, envWithSession);
      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data).toHaveProperty('id');
      expect(data.email).toBe('newuser@example.com');
      expect(data.role).toBe('org_admin');
    });

    it('should allow org_admin to create users for their own project and restrict roles', async () => {
      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer org-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'orguser@example.com', password: 'password123', name: 'Org User', role: 'org_user', client_project_id: 'diff-project-123' })
      });

      const envWithSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'org_admin', client_project_id: 'my-project-123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, envWithSession);
      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data.client_project_id).toBe('my-project-123'); // project_id coerced
      expect(data.role).toBe('org_user');
    });

    it('should prevent org_admin from creating platform_admin users', async () => {
      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer org-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'badadmin@example.com', password: 'password123', name: 'Bad Admin', role: 'platform_admin' })
      });

      const envWithSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'org_admin', client_project_id: 'my-project-123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, envWithSession);
      expect(response.status).toBe(403);
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

    it('should handle project assets CRUD scoping correctly', async () => {
      // 1. Create asset under own project
      const createRequest = new Request('http://localhost/api/v1/projects/123/assets', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer client-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Database RDS', category: 'Software', classification: 'Confidential', owner: 'DevOps', location: 'AWS', status: 'Active' })
      });

      // 2. Access assets list
      const getRequest = new Request('http://localhost/api/v1/projects/123/assets', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer client-token' }
      });

      // 3. Block access to another project assets list
      const getOtherRequest = new Request('http://localhost/api/v1/projects/999/assets', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer client-token' }
      });

      const dbMock = {
        ...mockEnv.DB,
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ id: 'a1', name: 'Database RDS' }] }),
        run: vi.fn().mockResolvedValue({ success: true })
      };

      const env = {
        ...mockEnv,
        DB: dbMock,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'org_admin', client_project_id: '123' }))
        }
      };

      // @ts-ignore
      const createRes = await worker.fetch(createRequest, env);
      expect(createRes.status).toBe(201);

      // @ts-ignore
      const getRes = await worker.fetch(getRequest, env);
      expect(getRes.status).toBe(200);

      // @ts-ignore
      const getOtherRes = await worker.fetch(getOtherRequest, env);
      expect(getOtherRes.status).toBe(403);
    });

    it('should block client from a project-scoped route of another project (tenant middleware)', async () => {
      // /projects/:id/risks previously had no access check — now guarded by projectAccessMiddleware.
      const clientEnv = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 9, role: 'client', client_project_id: '123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 'r1', project_id: '999' }] }),
        },
      };

      const ownReq = new Request('http://localhost/api/v1/projects/123/risks', {
        headers: { 'Authorization': 'Bearer client-token' },
      });
      const otherReq = new Request('http://localhost/api/v1/projects/999/risks', {
        headers: { 'Authorization': 'Bearer client-token' },
      });

      // @ts-ignore
      expect((await worker.fetch(ownReq, clientEnv)).status).toBe(200);
      // @ts-ignore
      expect((await worker.fetch(otherReq, clientEnv)).status).toBe(403);
    });

    it('should allow staff (consultor) to access any project scope', async () => {
      const staffEnv = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, role: 'consultor' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        },
      };
      const req = new Request('http://localhost/api/v1/projects/any-project/risks', {
        headers: { 'Authorization': 'Bearer staff-token' },
      });
      // @ts-ignore
      expect((await worker.fetch(req, staffEnv)).status).toBe(200);
    });

    it('should block a read-only role from deleting or approving evidence but allow upload', async () => {
      const clientEnv = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 9, role: 'org_user', client_project_id: '123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'ev1', project_id: '123', r2_key: 'k' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        },
      };

      const del = new Request('http://localhost/api/v1/evidence/ev1', {
        method: 'DELETE', headers: { 'Authorization': 'Bearer t' },
      });
      const approve = new Request('http://localhost/api/v1/evidence/ev1/approve', {
        method: 'POST', headers: { 'Authorization': 'Bearer t', 'Content-Type': 'application/json' }, body: '{}',
      });
      const fd = new FormData();
      fd.append('file', new File(['evidencia'], 'evidence.txt', { type: 'text/plain' }));
      const upload = new Request('http://localhost/api/v1/projects/123/evidence/upload', {
        method: 'POST', headers: { 'Authorization': 'Bearer t' }, body: fd,
      });

      // @ts-ignore
      expect((await worker.fetch(del, clientEnv)).status).toBe(403);
      // @ts-ignore
      expect((await worker.fetch(approve, clientEnv)).status).toBe(403);
      // upload com arquivo válido: passa o RBAC guard e persiste (201)
      // @ts-ignore
      expect((await worker.fetch(upload, clientEnv)).status).toBe(201);
    });

    it('should authenticate a valid API key scoped to its project and 401 an invalid one', async () => {
      const validEnv = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'k1', project_id: '123', status: 'Active', expires_at: null, permissions: 'read' }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        },
      };
      const ok = new Request('http://localhost/api/v1/projects/123/risks', { headers: { 'X-API-Key': 'valid-key' } });
      // @ts-ignore
      expect((await worker.fetch(ok, validEnv)).status).toBe(200);

      const invalidEnv = {
        ...mockEnv,
        DB: { ...mockEnv.DB, prepare: vi.fn().mockReturnThis(), bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) },
      };
      const bad = new Request('http://localhost/api/v1/projects/123/risks', { headers: { 'X-API-Key': 'bad-key' } });
      // @ts-ignore
      expect((await worker.fetch(bad, invalidEnv)).status).toBe(401);
    });

    it('should block an API key from another project (tenant scope)', async () => {
      const env = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'k1', project_id: '123', status: 'Active', expires_at: null }),
          run: vi.fn().mockResolvedValue({ success: true }),
        },
      };
      const other = new Request('http://localhost/api/v1/projects/999/risks', { headers: { 'X-API-Key': 'valid-key' } });
      // @ts-ignore
      expect((await worker.fetch(other, env)).status).toBe(403);
    });

    it('should block a read-only API key from writes but allow a write-capable key', async () => {
      const readEnv = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'k1', project_id: '123', status: 'Active', expires_at: null, permissions: 'read' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        },
      };
      const roWrite = new Request('http://localhost/api/v1/projects/123/evidence/upload', { method: 'POST', headers: { 'X-API-Key': 'ro' } });
      // @ts-ignore
      expect((await worker.fetch(roWrite, readEnv)).status).toBe(403);

      const writeEnv = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'k2', project_id: '123', status: 'Active', expires_at: null, permissions: 'write' }),
          run: vi.fn().mockResolvedValue({ success: true }),
        },
      };
      const fd = new FormData();
      fd.append('file', new File(['x'], 'e.txt', { type: 'text/plain' }));
      const rwWrite = new Request('http://localhost/api/v1/projects/123/evidence/upload', { method: 'POST', headers: { 'X-API-Key': 'rw' }, body: fd });
      // @ts-ignore
      expect((await worker.fetch(rwWrite, writeEnv)).status).toBe(201);
    });

    it('should reach public token routes without a session (auditor portal + assessment)', async () => {
      const auditorEnv = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ project_id: '123' }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        },
      };
      // No Authorization header — the token in the path is the credential.
      const auditor = new Request('http://localhost/api/v1/auditor/tok123/notes');
      // @ts-ignore
      expect((await worker.fetch(auditor, auditorEnv)).status).toBe(200);

      const assessEnv = {
        ...mockEnv,
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'a1', client_name: 'X', status: 'In Progress' }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        },
      };
      const assess = new Request('http://localhost/api/v1/assessments/public/tok456');
      // @ts-ignore
      expect((await worker.fetch(assess, assessEnv)).status).toBe(200);
    });

    it('should still require a session for internal auditor-notes routes', async () => {
      const req = new Request('http://localhost/api/v1/projects/123/auditor-notes');
      // @ts-ignore
      expect((await worker.fetch(req, mockEnv)).status).toBe(401);
    });

    it('should block cross-project access on every route mounting style', async () => {
      // As rotas com escopo de projeto são montadas de 3 formas diferentes e todas
      // resolvem para /api/v1/projects/<id>/... — este teste garante que o
      // projectAccessMiddleware cobre as três, não só a que já era testada.
      const paths = [
        '/api/v1/projects/999/evidence',              // A: sub-app em /projects/:projectId
        '/api/v1/projects/999/stakeholders',          // B: montado em /api/v1
        '/api/v1/projects/999/webhooks',              // C: montado em '' com path completo
        '/api/v1/projects/999/risks',                 // C
        '/api/v1/projects/999/export/audit-log',      // C (export CSV)
      ];
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 9, role: 'client', client_project_id: '123' })),
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        },
      };
      for (const p of paths) {
        const req = new Request(`http://localhost${p}`, { headers: { 'Authorization': 'Bearer t' } });
        // @ts-ignore
        const res = await worker.fetch(req, env);
        expect(res.status, `${p} deveria negar acesso cross-project`).toBe(403);
      }
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

  describe('RBAC and Scoping checks', () => {
    it('should restrict project listing for client role to their bound project', async () => {
      const request = new Request('http://localhost/api/v1/projects', {
        headers: { 'Authorization': 'Bearer client-token' }
      });
      
      const firstMock = vi.fn().mockResolvedValue({ id: '123', client_name: 'Client Proj' });
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client', client_project_id: '123' }))
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: firstMock
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('123');
      expect(firstMock).toHaveBeenCalled();
    });

    it('should restrict controls listing for client role to their bound project', async () => {
      const request = new Request('http://localhost/api/v1/controls', {
        headers: { 'Authorization': 'Bearer client-token' }
      });

      const allMock = vi.fn().mockResolvedValue({ results: [{ id: 'ctrl_1', project_id: '123' }] });
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client', client_project_id: '123' }))
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          all: allMock
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].project_id).toBe('123');
    });

    it('should block client access to other project evidence detail', async () => {
      const request = new Request('http://localhost/api/v1/evidence/evidence_other/detail', {
        headers: { 'Authorization': 'Bearer client-token' }
      });

      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client', client_project_id: '123' }))
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'evidence_other', project_id: '456' })
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(403);
    });

    it('should block client access to other project control maturity update', async () => {
      const request = new Request('http://localhost/api/v1/controls/ctrl_other/maturity', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer client-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ maturity: 3 })
      });

      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client', client_project_id: '123' }))
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnThis(),
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'ctrl_other', project_id: '456' })
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(403);
    });

    it('should block client access to global platform-wide dashboard', async () => {
      const request = new Request('http://localhost/api/v1/dashboard', {
        headers: { 'Authorization': 'Bearer client-token' }
      });

      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(JSON.stringify({ id: 2, role: 'client', client_project_id: '123' }))
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(403);
    });
  });

  describe('Password Recovery flow', () => {
    it('should generate a recovery token when email exists', async () => {
      const request = new Request('http://localhost/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      });

      const dbMock = {
        ...mockEnv.DB,
        first: vi.fn().mockResolvedValue({ id: 'u_test', email: 'test@example.com' })
      };

      const putSpy = vi.fn();
      const sessionsMock = {
        ...mockEnv.SESSIONS,
        put: putSpy
      };

      const env = {
        ...mockEnv,
        DB: dbMock,
        SESSIONS: sessionsMock,
        ENVIRONMENT: 'development'
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty('ok', true);
      expect(data).toHaveProperty('reset_token');
      expect(putSpy).toHaveBeenCalled();
    });

    it('should reset password with valid token', async () => {
      const request = new Request('http://localhost/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'recovery-token-123', newPassword: 'newPassword123' })
      });

      const getSpy = vi.fn().mockResolvedValue(JSON.stringify({ email: 'test@example.com' }));
      const deleteSpy = vi.fn();
      const runSpy = vi.fn().mockResolvedValue({ success: true });

      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: getSpy,
          delete: deleteSpy
        },
        DB: {
          ...mockEnv.DB,
          run: runSpy
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty('ok', true);
      expect(getSpy).toHaveBeenCalledWith('reset_token:recovery-token-123');
      expect(runSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith('reset_token:recovery-token-123');
    });
  });

  describe('Policy Templates', () => {
    it('should return all templates from DB', async () => {
      const request = new Request('http://localhost/api/v1/policy-templates', {
        headers: { 'Authorization': 'Bearer admin-token' }
      });
      
      const allSpy = vi.fn().mockResolvedValue({
        results: [
          { id: 'isp', title: 'Information Security Policy (ISP)', iso_ref: '5.1' }
        ]
      });
      const getSpy = vi.fn().mockResolvedValue(JSON.stringify({ id: 'admin1', role: 'platform_admin' }));
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: getSpy
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnValue({ all: allSpy })
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
      expect(data.templates).toBeDefined();
      expect(data.templates.length).toBe(1);
      expect(data.templates[0].id).toBe('isp');
    });

    it('should return marketplace templates enriched from DB', async () => {
      const request = new Request('http://localhost/api/v1/marketplace/templates', {
        headers: { 'Authorization': 'Bearer admin-token' }
      });
      
      const allSpy = vi.fn().mockResolvedValue({
        results: [
          { id: 'isp', title: 'Information Security Policy (ISP)', iso_ref: '5.1' }
        ]
      });
      const getSpy = vi.fn().mockResolvedValue(JSON.stringify({ id: 'admin1', role: 'platform_admin' }));
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: getSpy
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnValue({ all: allSpy })
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
      expect(data.templates).toBeDefined();
      expect(data.templates[0]).toHaveProperty('popularity');
    });
  });

  describe('Public Policy Portal OTP Flow', () => {
    it('should generate OTP and store in KV SESSIONS', async () => {
      const request = new Request('http://localhost/api/v1/public/policies/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'proj1', name: 'Maria Silva', email: 'maria@empresa.com' })
      });

      const putSpy = vi.fn().mockResolvedValue(undefined);
      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          put: putSpy
        },
        DB: {
          ...mockEnv.DB,
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'proj1', client_name: 'Empresa Teste' }),
              run: vi.fn().mockResolvedValue({ success: true })
            })
          })
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
      expect(data.demo_otp).toBeDefined();
      expect(putSpy).toHaveBeenCalledWith(
        'otp_proj1_maria@empresa.com',
        expect.stringContaining(data.demo_otp),
        expect.objectContaining({ expirationTtl: 900 })
      );
    });

    it('should verify OTP and grant public policy session token', async () => {
      const request = new Request('http://localhost/api/v1/public/policies/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'proj1', email: 'maria@empresa.com', otp: '123456' })
      });

      const getSpy = vi.fn().mockResolvedValue(JSON.stringify({
        otp: '123456',
        name: 'Maria Silva',
        email: 'maria@empresa.com',
        project_id: 'proj1'
      }));
      const putSpy = vi.fn().mockResolvedValue(undefined);
      const deleteSpy = vi.fn().mockResolvedValue(undefined);

      const env = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: getSpy,
          put: putSpy,
          delete: deleteSpy
        }
      };

      // @ts-ignore
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
      expect(deleteSpy).toHaveBeenCalledWith('otp_proj1_maria@empresa.com');
    });
  });
});
