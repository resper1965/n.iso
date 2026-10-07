import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Revisão final do P4: trocar o controle da evidência apaga as assinaturas (a revisão foi
 * contra outro controle) e editar o conteúdo passa a autoria para quem editou (segregação).
 */
const P = 'p-revfinal';
let lider: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());
const linha = (id: string) => env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<Record<string, unknown>>();

async function enviarComoCliente(): Promise<string> {
  const form = new FormData();
  form.append('file', new File(['texto da evidencia'], 'ev.txt', { type: 'text/plain' }));
  const up = await chamar(`/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: cliente, body: form });
  expect(up.status).toBe(201);
  return (await up.json<{ id: string }>()).id;
}
const assinar = (id: string, file_hash: string) =>
  chamar(`/api/v1/evidence/${id}/approve`, { method: 'POST', headers: lider, body: JSON.stringify({ role: 'ciso', password: 'password123', file_hash }) });

beforeAll(async () => {
  await applySchema();
  const hash = await hashPassword('password123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('rf-1', ?, 'ISO 27001:2022', 'A.5.1')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('rf-2', ?, 'ISO 27001:2022', 'A.5.2')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-l', 'lider@ness.lat', ?, 'Lia Lider', 'consultor')`).bind(hash),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-c', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-l', ?, 'Lia Lider', 'lider@ness.lat', 'consultor', 'Líder do SGSI')`).bind(P),
  ]);
  lider = { ...(await sessionFor({ id: 'u-l', email: 'lider@ness.lat', name: 'Lia Lider', role: 'consultor' })), 'Content-Type': 'application/json' };
  cliente = await sessionFor({ id: 'u-c', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

describe('trocar o controle da evidência', () => {
  it('volta a pendente, apaga a assinatura, registra na trilha, e dá para assinar de novo', async () => {
    const id = await enviarComoCliente();
    const hash = String((await linha(id))!.file_hash);
    expect((await assinar(id, hash)).status).toBe(200);
    expect((await linha(id))!.ciso_approved_by).not.toBeNull();

    const r = await chamar(`/api/v1/evidence/${id}`, { method: 'PUT', headers: lider, body: JSON.stringify({ control_id: 'rf-2' }) });
    expect(r.status).toBe(200);
    const ev = await linha(id);
    expect(ev!.evaluation_status).toBe('pending');
    for (const col of ['ciso_approved_by', 'ciso_approved_at', 'ciso_approved_ip', 'ciso_approved_ua', 'ceo_approved_by', 'ceo_approved_at', 'ceo_approved_ip', 'ceo_approved_ua']) {
      expect(ev![col], col).toBeNull();
    }
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'evidence.relinked' ORDER BY created_at DESC LIMIT 1`).first<{ details: string }>();
    expect(log!.details).toContain('Lia Lider');
    expect(log!.details).toContain('rf-2');

    expect((await assinar(id, hash)).status).toBe(200);
  });
});

describe('editar o conteúdo passa a autoria', () => {
  it('quem editou não pode revisar; o autor anterior vai à trilha', async () => {
    const id = await enviarComoCliente();
    const r = await chamar(`/api/v1/evidence/${id}/content`, { method: 'PUT', headers: lider, body: JSON.stringify({ content: 'texto novo' }) });
    expect(r.status, await r.clone().text()).toBe(200);
    const { sha256 } = await r.json<{ sha256: string }>();
    expect((await linha(id))!.uploaded_by).toBe('lider@ness.lat');
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'evidence.content_updated' ORDER BY created_at DESC LIMIT 1`).first<{ details: string }>();
    expect(log!.details).toContain('cli@cliente.com');

    const s = await assinar(id, sha256);
    expect(s.status).toBe(403);
    expect((await s.json<{ error: string }>()).error).toBe('Quem enviou a evidência não pode revisá-la');
  });
});
