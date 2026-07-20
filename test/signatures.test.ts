import { describe, it, expect, vi, beforeAll } from 'vitest';
import worker from '../src/index';

// Mock static content manifest
// @ts-ignore
global.__STATIC_CONTENT_MANIFEST = '{}';
// @ts-ignore
global.__STATIC_CONTENT = {};

// Helper to generate the exact same PBKDF2 hash style as the backend
async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || 'test-salt-12345';
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s}:${hash}`;
}

let password123Hash = '';

const mockEnv = {
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
    batch: vi.fn().mockResolvedValue([]),
  },
  SESSIONS: {
    get: vi.fn().mockResolvedValue(JSON.stringify({
      id: 'usr-1',
      email: '44273656+resper1965@users.noreply.github.com',
      name: 'Ricardo Esper',
      role: 'ciso'
    })),
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
};

describe('nISO Private Signatures Unit Tests', () => {
  beforeAll(async () => {
    password123Hash = await hashPassword('password123');
  });

  describe('Policy Signatures (controls approve)', () => {
    it('should block controls approve without authentication token', async () => {
      const request = new Request('http://localhost/api/v1/controls/A.5.1/approve', {
        method: 'POST',
        body: JSON.stringify({ role: 'ciso', password: 'password123' })
      });
      const envWithoutSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(null)
        }
      };
      // @ts-ignore
      const response = await worker.fetch(request, envWithoutSession);
      expect(response.status).toBe(401);
    });

    it('should fail controls approve with incorrect password', async () => {
      const request = new Request('http://localhost/api/v1/controls/A.5.1/approve', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({ role: 'ciso', password: 'wrongpassword' })
      });
      const localEnv = { ...mockEnv };
      localEnv.DB.first = vi.fn().mockResolvedValue({
        id: 'ctrl-a51',
        project_id: 'proj-1',
        control_id: 'A.5.1',
        title: 'Policy',
        description: 'Universal requirement',
        password_hash: password123Hash,
        name: 'Ricardo Esper',
        email: '44273656+resper1965@users.noreply.github.com',
        role: 'ciso'
      });
      // @ts-ignore
      const response = await worker.fetch(request, localEnv);
      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toContain('Senha incorreta');
    });

    it('should succeed controls approve with correct password', async () => {
      const request = new Request('http://localhost/api/v1/controls/A.5.1/approve', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({ role: 'ciso', password: 'password123' })
      });
      const localEnv = { ...mockEnv };
      localEnv.DB.first = vi.fn().mockResolvedValue({
        id: 'ctrl-a51',
        project_id: 'proj-1',
        control_id: 'A.5.1',
        title: 'Policy',
        description: 'Universal requirement',
        password_hash: password123Hash,
        name: 'Ricardo Esper',
        email: '44273656+resper1965@users.noreply.github.com',
        role: 'ciso'
      });
      // @ts-ignore
      const response = await worker.fetch(request, localEnv);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty('ok', true);
    });
  });

  describe('Evidence Signatures (evidence approve)', () => {
    it('should block evidence approve without authentication token', async () => {
      const request = new Request('http://localhost/api/v1/evidence/ev-1/approve', {
        method: 'PUT',
        body: JSON.stringify({ role: 'ciso', password: 'password123' })
      });
      const envWithoutSession = {
        ...mockEnv,
        SESSIONS: {
          ...mockEnv.SESSIONS,
          get: vi.fn().mockResolvedValue(null)
        }
      };
      // @ts-ignore
      const response = await worker.fetch(request, envWithoutSession);
      expect(response.status).toBe(401);
    });

    it('should fail evidence approve with incorrect password', async () => {
      const request = new Request('http://localhost/api/v1/evidence/ev-1/approve', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({ role: 'ciso', password: 'wrongpassword' })
      });
      const localEnv = { ...mockEnv };
      localEnv.DB.first = vi.fn().mockResolvedValue({
        id: 'ev-1',
        project_id: 'proj-1',
        password_hash: password123Hash,
        name: 'Ricardo Esper',
        email: '44273656+resper1965@users.noreply.github.com',
        role: 'ciso'
      });
      // @ts-ignore
      const response = await worker.fetch(request, localEnv);
      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toContain('Senha incorreta');
    });

    it('should succeed evidence approve with correct password', async () => {
      const request = new Request('http://localhost/api/v1/evidence/ev-1/approve', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({ role: 'ciso', password: 'password123' })
      });
      const localEnv = { ...mockEnv };
      localEnv.DB.first = vi.fn().mockResolvedValue({
        id: 'ev-1',
        project_id: 'proj-1',
        password_hash: password123Hash,
        name: 'Ricardo Esper',
        email: '44273656+resper1965@users.noreply.github.com',
        role: 'ciso'
      });
      // @ts-ignore
      const response = await worker.fetch(request, localEnv);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty('ok', true);
    });
  });
});
