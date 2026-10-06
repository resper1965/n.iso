import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, workerEnv } from './helpers/d1';

// D1, KV e R2 reais (miniflare). A versão anterior mockava o D1 inteiro: todo
// `first()` devolvia a linha da chave de API, para qualquer consulta, e não pegava
// deriva de schema. Agora as chaves vivem em `api_keys` (por hash, como a
// autenticação lê) e o upload é conferido no bucket de verdade. Só a IA fica stub
// (`workerEnv`): não há binding de Workers AI no pool.
const CHAVE_LEITURA = 'mcp-chave-leitura';
const CHAVE_ESCRITA = 'mcp-chave-escrita';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    ...['123', '999'].map((id) =>
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(id, `Cliente ${id}`, 'ISO 27001', 'controller', 'Active')),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`)
      .bind('k-read', '123', await sha256Hex(CHAVE_LEITURA), 'mcp leitura', 'read', 'Active'),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`)
      .bind('k-write', '123', await sha256Hex(CHAVE_ESCRITA), 'mcp escrita', 'write', 'Active'),
    // `evidence.control_id` tem FK para `compliance_controls`: o mock aceitava qualquer id.
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?,?,?,?,?)`)
      .bind('ctrl-a51', '123', 'ISO 27001:2022', 'A.5.1 Políticas', 'Missing'),
  ]);
});

// Simula exatamente o que o mcp-server-niso envia: header x-api-key.
const chave = (permissions: 'read' | 'write') => (permissions === 'read' ? CHAVE_LEITURA : CHAVE_ESCRITA);
const chamar = (req: Request) => worker.fetch(req, workerEnv());

/** Objetos gravados no R2 para o projeto — a prova de que o upload chegou (ou não) ao bucket. */
const objetosNoR2 = async (projectId: string) =>
  (await env.STORAGE.list({ prefix: `evidence/${projectId}/` })).objects.length;

// Reproduz o corpo que `nisoUploadText` (mcp-server-niso/src/index.ts) monta para
// `niso_create_evidence`: multipart com um Blob de texto no campo `file`.
const uploadDeTexto = (projectId: string, permissions: 'read' | 'write', contentType = 'text/markdown') => {
  const form = new FormData();
  form.append('file', new Blob(['# Politica de Acesso\n\nTexto.'], { type: contentType }), 'politica.md');
  form.append('control_id', 'ctrl-a51');
  return new Request(`http://localhost/api/v1/projects/${projectId}/evidence/upload`, {
    method: 'POST',
    headers: { 'x-api-key': chave(permissions) },
    body: form,
  });
};

describe('mcp-server-niso integration', () => {
  it('niso_list_risks (leitura) funciona com api key', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      headers: { 'x-api-key': chave('read') },
    });
    expect((await chamar(req)).status).toBe(200);
  });

  it('niso_create_risk (escrita) com chave write', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      method: 'POST',
      headers: { 'x-api-key': chave('write'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T', impact: 3, probability: 3 }),
    });
    const res = await chamar(req);
    expect(res.status).toBeLessThan(400);
    const linha = await env.DB.prepare(`SELECT asset, threat FROM risks WHERE project_id = '123'`).first<any>();
    expect(linha).toMatchObject({ asset: 'A', threat: 'T' });
  });

  it('niso_create_evidence registra evidência textual com chave write', async () => {
    const antes = await objetosNoR2('123');
    const res = await chamar(uploadDeTexto('123', 'write'));
    expect(res.status, await res.clone().text()).toBe(201);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    // O SHA-256 é do worker, não do agente: é ele que faz a evidência valer.
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await objetosNoR2('123')).toBe(antes + 1);
    const ev = await env.DB.prepare('SELECT file_hash, control_id FROM evidence WHERE id = ?').bind(body.id).first<any>();
    expect(ev).toMatchObject({ file_hash: body.sha256, control_id: 'ctrl-a51' });
  });
});

describe('mcp api key: limites preservados', () => {
  it('chave read continua bloqueada em escrita', async () => {
    const req = new Request('http://localhost/api/v1/projects/123/risks', {
      method: 'POST', headers: { 'x-api-key': chave('read'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T' }),
    });
    expect((await chamar(req)).status).toBe(403);
  });

  it('niso_create_evidence com chave read toma 403 — nada é gravado no R2', async () => {
    const antes = await objetosNoR2('123');
    const res = await chamar(uploadDeTexto('123', 'read'));
    expect(res.status).toBe(403);
    expect(await objetosNoR2('123')).toBe(antes);
  });

  it('niso_create_evidence NÃO escapa do isolamento de tenant', async () => {
    const res = await chamar(uploadDeTexto('999', 'write'));
    expect(res.status).toBe(403);
    expect(await objetosNoR2('999')).toBe(0);
  });

  // A allow-list de `validateUpload` é a fronteira real: mesmo que alguém chame a
  // API direto, sem passar pelo enum fechado da ferramenta MCP, text/html é
  // recusado — é ele que voltaria ao navegador como XSS armazenado.
  it('upload de evidência recusa tipo fora da allow-list mesmo com chave write', async () => {
    const antes = await objetosNoR2('123');
    const res = await chamar(uploadDeTexto('123', 'write', 'text/html'));
    expect(res.status).toBe(400);
    expect(await objetosNoR2('123')).toBe(antes);
  });

  it('chave write NÃO escapa do isolamento de tenant', async () => {
    const req = new Request('http://localhost/api/v1/projects/999/risks', {
      method: 'POST', headers: { 'x-api-key': chave('write'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'A', threat: 'T' }),
    });
    expect((await chamar(req)).status).toBe(403);
  });
});
