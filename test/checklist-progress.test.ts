import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { sha256Hex } from '../src/helpers';

/**
 * `PUT /projects/:id/checklist-progress` sumiu na decomposição do index.ts
 * (72f1b59), junto com o gap-analysis. A tela segue chamando a rota
 * (`saveChecklistItemMetadata`, globals.js) e engole o 404 num console.error:
 * marcação, nota, responsável e prazo de cada item não persistiam, sem aviso.
 */
const url = (p: string) => `http://localhost/api/v1/projects/${p}/checklist-progress`;
const json = { 'Content-Type': 'application/json' };
const put = (p: string, corpo: unknown, headers: Record<string, string>) =>
  worker.fetch(new Request(url(p), { method: 'PUT', headers: { ...json, ...headers }, body: JSON.stringify(corpo) }), workerEnv() as any);
const get = (p: string, headers: Record<string, string>) =>
  worker.fetch(new Request(url(p), { headers }), workerEnv() as any);

const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (p: string, corpo: unknown) =>
  worker.fetch(new Request(url(p), { method: 'PUT', headers: json, body: JSON.stringify(corpo) }), { ...workerEnv(), AGENTE } as any);

describe('PUT /projects/:id/checklist-progress', () => {
  let adm: Record<string, string>;
  let leitura: Record<string, string>;
  let admB: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-a','a@x.com','x','A','org_admin','p-a'), ('u-ro','ro@x.com','x','RO','org_user','p-a'), ('u-b','b@x.com','x','B','org_admin','p-b'), ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-a','p-a','a.md','k-a','h','x'), ('ev-b','p-b','b.md','k-b','h','x')`),
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, name, key_hash, permissions, status) VALUES ('k-w','p-a','chave', ?, 'write', 'Active')`).bind(await sha256Hex('chave-de-escrita')),
    ]);
    adm = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: 'p-a' });
    leitura = await sessionFor({ id: 'u-ro', email: 'ro@x.com', role: 'org_user', client_project_id: 'p-a' });
    admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: 'p-b' });
  });

  it('grava marcação, nota, responsável e prazo, e o GET devolve', async () => {
    const r = await put('p-a', { items: [{ phase_number: 1, item_id: 'p1_a', is_checked: true, notes: 'ok', assigned_to: 'CTO', due_date: '2026-12-01' }] }, adm);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true, count: 1 });
    const lista = (await (await get('p-a', adm)).json<{ progress: any[] }>()).progress;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ phase_number: 1, item_id: 'p1_a', is_checked: 1, notes: 'ok', assigned_to: 'CTO', due_date: '2026-12-01', checked_by: 'u-a' });
  });

  it('é upsert: gravar de novo o mesmo item atualiza, não duplica', async () => {
    await put('p-a', { items: [{ phase_number: 1, item_id: 'p1_a', is_checked: false, notes: 'revisto' }] }, adm);
    const lista = (await (await get('p-a', adm)).json<{ progress: any[] }>()).progress;
    expect(lista.filter((i) => i.item_id === 'p1_a')).toHaveLength(1);
    expect(lista.find((i) => i.item_id === 'p1_a')).toMatchObject({ is_checked: 0, notes: 'revisto', assigned_to: null });
  });

  it('papel só de leitura também grava o checklist (a allow-list de auth.ts já previa)', async () => {
    const r = await put('p-a', { items: [{ phase_number: 2, item_id: 'p2_a', is_checked: true }] }, leitura);
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('corpo inválido é 400, não 500 nem gravação parcial', async () => {
    const antes = await env.DB.prepare(`SELECT COUNT(*) n FROM checklist_progress WHERE project_id='p-a'`).first<any>();
    const ruins: unknown[] = [
      {},
      { items: 'x' },
      { items: [] },
      { items: [{ phase_number: 'um', item_id: 'p1_a', is_checked: true }] },
      { items: [{ phase_number: 1, item_id: '', is_checked: true }] },
      { items: [{ phase_number: 1, item_id: 'p1_a', is_checked: 'sim' }] },
      { items: [{ phase_number: 99, item_id: 'p1_a', is_checked: true }] },
      { items: [{ phase_number: 1, item_id: 'p1_ok', is_checked: true }, { phase_number: 1, is_checked: true }] },
      { items: Array.from({ length: 501 }, (_, i) => ({ phase_number: 1, item_id: `p1_${i}`, is_checked: true })) },
    ];
    for (const corpo of ruins) {
      const r = await put('p-a', corpo, adm);
      expect(r.status, JSON.stringify(corpo).slice(0, 80)).toBe(400);
    }
    const depois = await env.DB.prepare(`SELECT COUNT(*) n FROM checklist_progress WHERE project_id='p-a'`).first<any>();
    expect(depois.n, 'um corpo inválido gravou parte dos itens').toBe(antes.n);
  });

  it('não vincula evidência de OUTRO projeto', async () => {
    const r = await put('p-a', { items: [{ phase_number: 3, item_id: 'p3_a', is_checked: true, evidence_id: 'ev-b' }] }, adm);
    expect(r.status).toBe(400);
    expect(await env.DB.prepare(`SELECT 1 FROM checklist_progress WHERE item_id='p3_a'`).first()).toBeNull();
    const ok = await put('p-a', { items: [{ phase_number: 3, item_id: 'p3_a', is_checked: true, evidence_id: 'ev-a' }] }, adm);
    expect(ok.status, await ok.clone().text()).toBe(200);
  });

  it('administrador de outro cliente não grava neste projeto', async () => {
    const r = await put('p-a', { items: [{ phase_number: 1, item_id: 'p1_x', is_checked: true }] }, admB);
    expect(r.status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM checklist_progress WHERE item_id='p1_x'`).first()).toBeNull();
  });

  it('o agente grava no próprio projeto, com a autoria do consultor, e não no outro', async () => {
    const r = await comoAgente('p-a', { items: [{ phase_number: 4, item_id: 'p4_a', is_checked: true }] });
    expect(r.status, await r.clone().text()).toBe(200);
    const linha = await env.DB.prepare(`SELECT checked_by FROM checklist_progress WHERE item_id='p4_a'`).first<any>();
    expect(linha.checked_by).toBe('u-cons');
    expect((await comoAgente('p-b', { items: [{ phase_number: 4, item_id: 'p4_b', is_checked: true }] })).status).toBe(403);
  });

  it('chave de API grava sem violar a chave estrangeira de checked_by', async () => {
    const r = await put('p-a', { items: [{ phase_number: 5, item_id: 'p5_a', is_checked: true }] }, { 'X-API-Key': 'chave-de-escrita' });
    expect(r.status, await r.clone().text()).toBe(200);
    const linha = await env.DB.prepare(`SELECT checked_by FROM checklist_progress WHERE item_id='p5_a'`).first<any>();
    expect(linha.checked_by).toBeNull();
  });

  it('deixa trilha com o projeto', async () => {
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action='checklist.updated' AND project_id='p-a' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(log?.details).toContain('item');
  });
});
