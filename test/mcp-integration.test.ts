import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index';

// Simula exatamente o que o mcp-server-niso envia: header x-api-key + chave 'write'.
const envWith = (permissions: string) => ({
  DB: {
    prepare: vi.fn().mockReturnThis(), bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ id: 'k1', project_id: '123', status: 'Active', expires_at: null, permissions }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
    batch: vi.fn().mockResolvedValue([]),
  },
  SESSIONS: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ENVIRONMENT: 'test',
});

describe('mcp-server-niso integration', () => {
  it('niso_list_risks (leitura) funciona com api key', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      headers: { 'x-api-key': 'k', 'Authorization': 'Bearer k' },
    });
    // @ts-ignore
    expect((await worker.fetch(req, envWith('read'))).status).toBe(200);
  });

  it('niso_create_risk (escrita) com chave write', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      method: 'POST',
      headers: { 'x-api-key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T', impact: 3, probability: 3 }),
    });
    // @ts-ignore
    const res = await worker.fetch(req, envWith('write'));
    console.log('  >>> create_risk com chave write ->', res.status);
    expect(res.status).toBeLessThan(400);
  });
});

describe('mcp api key: limites preservados', () => {
  it('chave read continua bloqueada em escrita', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      method: 'POST', headers: { 'x-api-key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T' }),
    });
    // @ts-ignore
    expect((await worker.fetch(req, envWith('read'))).status).toBe(403);
  });

  it('chave write NÃO escapa do isolamento de tenant', async () => {
    const req = new Request('http://localhost/api/v1/projects/999/risks', {
      method: 'POST', headers: { 'x-api-key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T' }),
    });
    // @ts-ignore
    expect((await worker.fetch(req, envWith('write'))).status).toBe(403);
  });
});
