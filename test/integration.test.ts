import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, designarConsultor } from './helpers/d1';

// D1 e KV reais (miniflare), com o schema.sql canônico. A versão anterior usava
// um D1 de mentira que devolvia lista vazia para qualquer consulta e sucesso para
// qualquer escrita — não pegava deriva de schema. O consultor da sessão é
// designado (D5) nos projetos que estas rotas tocam; o resto do banco fica vazio,
// como o mock deixava.
const PROJETOS = ['test-project', 'test'];
const EMAIL = 'test@example.com';

describe('Integration Tests', () => {
  let auth: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch(PROJETOS.map((id) =>
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(id, `Cliente ${id}`, 'ISO 27001', 'controller', 'Active')));
    await designarConsultor(EMAIL, ...PROJETOS);
    auth = await sessionFor({ id: `cons:${EMAIL}`, email: EMAIL, role: 'consultor' });
  });

  const pedir = (path: string, init: RequestInit = {}) =>
    app.request(path, init, env);
  const comAuth = (path: string, init: RequestInit = {}) =>
    pedir(path, { ...init, headers: { ...auth, ...((init.headers as Record<string, string>) ?? {}) } });

  describe('Group 1: Public routes (no auth needed)', () => {
    it('GET /api/v1/public/pricing returns tiers array', async () => {
      const res = await pedir('/api/v1/public/pricing');
      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.tiers)).toBe(true);
    });

    it('GET /api/v1/public/stats returns counts', async () => {
      const res = await pedir('/api/v1/public/stats');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toBeTypeOf('object');
    });

    it('GET /api/v1/marketplace/templates returns templates', async () => {
      const res = await comAuth('/api/v1/marketplace/templates');
      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.templates)).toBe(true);
    });
  });

  describe('Group 2: Auth enforcement', () => {
    it('GET /api/v1/projects should fail without auth', async () => {
      const res = await pedir('/api/v1/projects');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/assessments should fail without auth', async () => {
      const res = await pedir('/api/v1/assessments', { method: 'POST' });
      expect(res.status).toBe(401);
    });
  });

  describe('Group 3: Risk sub-router (auth + D1 reais)', () => {
    it('GET /api/v1/projects/test-project/risks returns empty array', async () => {
      const res = await comAuth('/api/v1/projects/test-project/risks');
      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.risks || data)).toBe(true);
    });

    it('POST /api/v1/projects/test-project/risks with valid body returns success', async () => {
      // asset e threat são NOT NULL em risks (schema.sql).
      const res = await comAuth('/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'Servidor de aplicação', threat: 'Acesso não autorizado', probability: 3, impact: 3 }),
      });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      // Com D1 real dá para conferir que o INSERT gravou de fato.
      const linha = await env.DB.prepare(`SELECT asset FROM risks WHERE project_id = 'test-project'`).first<any>();
      expect(linha?.asset).toBe('Servidor de aplicação');
    });

    it('POST /projects/:id/risks rejects a body missing required fields (400)', async () => {
      const res = await comAuth('/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Risk', probability: 3, impact: 3 }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /projects/:id/risks rejects out-of-range 5x5 scores (400)', async () => {
      const res = await comAuth('/api/v1/projects/test-project/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'A', threat: 'T', impact: 99, probability: 3 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Group 4: Policy templates', () => {
    it('GET /api/v1/policy-templates returns templates from D1', async () => {
      const res = await comAuth('/api/v1/policy-templates');
      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.templates || data)).toBe(true);
    });

    it('GET /api/v1/policy-templates/nonexistent returns 404', async () => {
      const res = await comAuth('/api/v1/policy-templates/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Group 5: CSV Export routes', () => {
    it('GET /api/v1/projects/test/export/risks returns CSV content-type', async () => {
      const res = await comAuth('/api/v1/projects/test/export/risks');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
    });
  });
});
