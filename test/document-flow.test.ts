import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index';

// Mock global for Hono's serveStatic
// @ts-ignore
global.__STATIC_CONTENT_MANIFEST = '{}';
// @ts-ignore
global.__STATIC_CONTENT = {};

describe('nISO Document Generation and Persistence E2E API Flow', () => {
  it('should generate an internal document, persist it, and allow retrieval/updating', async () => {
    // 1. Mock DB and STORAGE bindings
    const mockProject = { id: 'proj-123', client_name: 'ness. testing', sector: 'GRC Tech', scope: 'ISO 27001:2022' };
    const mockEvidence = { id: 'ev-123', file_name: 'Declaração de Escopo.md', r2_key: 'projects/proj-123/evidence/p3_1.md', file_type: 'text/markdown' };

    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async function() {
        const query = (this as any).queryStr || '';
        if (query.includes('FROM projects')) return mockProject;
        if (query.includes('FROM evidence')) return mockEvidence;
        return { id: 'ok' };
      }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    // Store the queries executed for assertion validation
    // @ts-ignore
    mockDb.prepare = vi.fn().mockImplementation(function(queryStr) {
      return {
        queryStr,
        bind: vi.fn().mockReturnThis(),
        first: mockDb.first,
        run: mockDb.run
      };
    });

    const mockStorage = {
      put: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue({
        text: async () => '# Declaração de Escopo\n\nEste é o escopo mockado do projeto ness.'
      })
    };

    const mockAi = {
      run: vi.fn().mockResolvedValue({
        success: true,
        content: 'Controle de Escopo ISO 27001 gerado com sucesso por Llama 3.'
      })
    };

    const mockSessions = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ id: 'user-123', email: 'test@ness.dev', role: 'admin' })),
      put: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true)
    };

    const env = {
      DB: mockDb,
      STORAGE: mockStorage,
      AI: mockAi,
      SESSIONS: mockSessions,
      ENVIRONMENT: 'test',
      SETUP_KEY: 'test-123'
    };

    const authHeaders = {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    };

    // 2. Test POST /api/v1/projects/proj-123/checklist/p3_1/generate
    const generateReq = new Request('http://localhost/api/v1/projects/proj-123/checklist/p3_1/generate', {
      method: 'POST',
      headers: authHeaders
    });
    // @ts-ignore
    const generateRes = await worker.fetch(generateReq, env);
    expect(generateRes.status).toBe(200);
    const generateData = await generateRes.json() as any;
    expect(generateData.ok).toBe(true);
    expect(generateData).toHaveProperty('evidence_id');
    expect(generateData.file_name).toBe('Declaração de escopo documentada (Cl 4.3).md');

    // 3. Test GET /api/v1/evidence/ev-123/content
    const getReq = new Request('http://localhost/api/v1/evidence/ev-123/content', {
      method: 'GET',
      headers: authHeaders
    });
    // @ts-ignore
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json() as any;
    expect(getData.ok).toBe(true);
    expect(getData.file_name).toBe('Declaração de Escopo.md');
    expect(getData.content).toContain('# Declaração de Escopo');

    // 4. Test PUT /api/v1/evidence/ev-123/content
    const putReq = new Request('http://localhost/api/v1/evidence/ev-123/content', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ content: '# Novo Escopo\n\nTexto atualizado.' })
    });
    // @ts-ignore
    const putRes = await worker.fetch(putReq, env);
    expect(putRes.status).toBe(200);
    const putData = await putRes.json() as any;
    expect(putData.ok).toBe(true);
  });
});
