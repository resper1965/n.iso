import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Os três caminhos de documento (upload, assistente, geração por IA) gravavam a evidência como
 * `conforming`, sem revisão e sem controle. Agora entram `pending`, ligadas ao controle do item
 * quando ele tem um, e o upload pelo checklist marca o item.
 */
const P = 'p-doc';
let consultor: Record<string, string>;
let cliente: Record<string, string>;

const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });
const chamar = (caminho: string, init: RequestInit) =>
  worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());
const evidencia = (id: string) => env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<Record<string, unknown>>();
const progresso = (item: string) =>
  env.DB.prepare('SELECT * FROM checklist_progress WHERE project_id = ? AND item_id = ?').bind(P, item).first<Record<string, unknown>>();

function enviar(h: Record<string, string>, itemId?: string) {
  const form = new FormData();
  form.append('file', new File(['conteudo'], 'politica.pdf', { type: 'application/pdf' }));
  if (itemId) form.append('item_id', itemId);
  return chamar(`/api/v1/projects/${P}/documents/upload`, { method: 'POST', headers: h, body: form });
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-a51', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', name: 'Cons', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

describe('geração por IA a partir do checklist', () => {
  it('grava pendente, ligada ao controle do item, e marca o item', async () => {
    const res = await chamar(`/api/v1/projects/${P}/checklist/p15_1/generate`, { method: 'POST', headers: json(consultor) });
    const body = await res.json<{ evidence_id: string }>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    const ev = await evidencia(body.evidence_id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');
    const prog = await progresso('p15_1');
    expect(prog!.is_checked).toBe(1);
    expect(prog!.evidence_id).toBe(body.evidence_id);
  });

  it('item sem controle no texto grava sem controle', async () => {
    const res = await chamar(`/api/v1/projects/${P}/checklist/p3_1/generate`, { method: 'POST', headers: json(consultor) });
    const { evidence_id } = await res.json<{ evidence_id: string }>();
    expect((await evidencia(evidence_id))!.control_id).toBeNull();
  });

  // Review Focus 2
  it('gerar de novo não sobrescreve o arquivo da evidência anterior', async () => {
    const gerar = async () => (await (await chamar(`/api/v1/projects/${P}/checklist/p3_2/generate`, { method: 'POST', headers: json(consultor) })).json<{ evidence_id: string }>()).evidence_id;
    const primeira = await gerar();
    const segunda = await gerar();
    const a = await evidencia(primeira);
    const b = await evidencia(segunda);
    expect(a!.r2_key).not.toBe(b!.r2_key);
    expect(await env.STORAGE.get(String(a!.r2_key))).not.toBeNull();
  });
});

describe('documento do assistente aprovado', () => {
  it('grava pendente e ligado ao controle; item que dava 404 (p15_5) é aceito', async () => {
    const ok = await chamar(`/api/v1/projects/${P}/approve-document`, { method: 'POST', headers: json(consultor), body: JSON.stringify({ itemId: 'p15_1', content: '# Política' }) });
    const body = await ok.json<{ evidence_id: string }>();
    expect(ok.status, JSON.stringify(body)).toBe(200);
    const ev = await evidencia(body.evidence_id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');

    const antes404 = await chamar(`/api/v1/projects/${P}/approve-document`, { method: 'POST', headers: json(consultor), body: JSON.stringify({ itemId: 'p15_5', content: '# Uso aceitável' }) });
    expect(antes404.status).toBe(200);
    // O projeto não tem A.5.10: fica sem controle.
    expect((await evidencia((await antes404.json<{ evidence_id: string }>()).evidence_id))!.control_id).toBeNull();
  });
});

describe('upload de documento', () => {
  it('pelo checklist (cliente): pendente, ligado ao controle, e o item fica marcado', async () => {
    const res = await enviar(cliente, 'p15_1');
    const body = await res.json<{ id: string }>();
    expect(res.status, JSON.stringify(body)).toBe(201);
    const ev = await evidencia(body.id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');
    expect((await progresso('p15_1'))!.evidence_id).toBe(body.id);
  });

  it('sem item: pendente, sem controle e sem marcar nada', async () => {
    const res = await enviar(cliente);
    const { id } = await res.json<{ id: string }>();
    expect(res.status).toBe(201);
    const ev = await evidencia(id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBeNull();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM checklist_progress WHERE evidence_id = ?').bind(id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('item inexistente: 400 e nada no R2', async () => {
    const antes = (await env.STORAGE.list({ prefix: `docs/${P}/` })).objects.length;
    const res = await enviar(cliente, 'p99_9');
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('Item de checklist não encontrado');
    expect((await env.STORAGE.list({ prefix: `docs/${P}/` })).objects.length).toBe(antes);
  });

  // Review Focus 1
  it('não apaga a anotação do item', async () => {
    await env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes) VALUES ('cp-nota', ?, 15, 'p15_2', 0, 'minha anotação')`
    ).bind(P).run();
    expect((await enviar(cliente, 'p15_2')).status).toBe(201);
    const prog = await progresso('p15_2');
    expect(prog!.notes).toBe('minha anotação');
    expect(prog!.is_checked).toBe(1);
  });
});
