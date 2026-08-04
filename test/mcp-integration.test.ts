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
  STORAGE: { put: vi.fn().mockResolvedValue(undefined) },
  ENVIRONMENT: 'test',
});

// Reproduz o corpo que `nisoUploadText` (mcp-server-niso/src/index.ts) monta para
// `niso_create_evidence`: multipart com um Blob de texto no campo `file`.
const uploadDeTexto = (projectId: string, contentType = 'text/markdown') => {
  const form = new FormData();
  form.append('file', new Blob(['# Politica de Acesso\n\nTexto.'], { type: contentType }), 'politica.md');
  form.append('control_id', 'ctrl-a51');
  return new Request(`http://localhost/api/v1/projects/${projectId}/evidence/upload`, {
    method: 'POST',
    headers: { 'x-api-key': 'k' },
    body: form,
  });
};

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

  it('niso_create_evidence registra evidência textual com chave write', async () => {
    const env = envWith('write');
    // @ts-ignore
    const res = await worker.fetch(uploadDeTexto('123'), env);
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    // O SHA-256 é do worker, não do agente: é ele que faz a evidência valer.
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(env.STORAGE.put).toHaveBeenCalled();
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

  it('niso_create_evidence com chave read toma 403 — nada é gravado no R2', async () => {
    const env = envWith('read');
    // @ts-ignore
    const res = await worker.fetch(uploadDeTexto('123'), env);
    expect(res.status).toBe(403);
    expect(env.STORAGE.put).not.toHaveBeenCalled();
  });

  it('niso_create_evidence NÃO escapa do isolamento de tenant', async () => {
    const env = envWith('write');
    // @ts-ignore
    const res = await worker.fetch(uploadDeTexto('999'), env);
    expect(res.status).toBe(403);
    expect(env.STORAGE.put).not.toHaveBeenCalled();
  });

  // A allow-list de `validateUpload` é a fronteira real: mesmo que alguém chame a
  // API direto, sem passar pelo enum fechado da ferramenta MCP, text/html é
  // recusado — é ele que voltaria ao navegador como XSS armazenado.
  it('upload de evidência recusa tipo fora da allow-list mesmo com chave write', async () => {
    const env = envWith('write');
    // @ts-ignore
    const res = await worker.fetch(uploadDeTexto('123', 'text/html'), env);
    expect(res.status).toBe(400);
    expect(env.STORAGE.put).not.toHaveBeenCalled();
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
