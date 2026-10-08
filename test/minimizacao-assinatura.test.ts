import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { semRastroDeAssinatura } from '../src/helpers';

/**
 * Minimização: IP e user-agent de quem assina ficam só no banco e na trilha; nem as leituras JSON
 * nem os relatórios HTML os devolvem.
 */
const PROJ = 'p-min';
const IP = '203.0.113.9';
const UA = 'NavegadorDoLider/1.0';
const RASTRO = /_(approved|signed)_(ip|ua)"/;

let h: Record<string, string>;
const get = (path: string) => worker.fetch(new Request(`http://localhost${path}`, { headers: h }), { ...env, AI: { run: async () => ({}) } } as any);
const texto = async (path: string) => { const r = await get(path); expect(r.status, path).toBe(200); return r.text(); };

beforeEach(async () => {
  await applySchema(); await resetData(); await resetSessions();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente Min', 'ISO 27001:2022', 'Controller', 'Active')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua)
                    VALUES ('c-min', ?, 'ISO 27001:2022', 'A.5.1 Políticas', 'texto', 'lider@x.test', '2026-10-07', ?, ?)`).bind(PROJ, IP, UA),
    env.DB.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, uploaded_by, ciso_approved_by, ciso_approved_ip, ciso_approved_ua)
                    VALUES ('e-min', 'c-min', ?, 'a.pdf', 'docs/a.pdf', 'h', 'u@x.test', 'lider@x.test', ?, ?)`).bind(PROJ, IP, UA),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua)
                    VALUES ('r-min', ?, 'Finalidade', 'Approved', 'lider@x.test', '2026-10-07', ?, ?)`).bind(PROJ, IP, UA),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d-min', ?, 'Sistema', 'Draft')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date, status, ciso_signed_by, ciso_signed_ip) VALUES ('m-min', ?, '2026-10-01', 'Completed', 'lider@x.test', ?)`).bind(PROJ, IP),
  ]);
  h = await sessionFor({ id: 'u-min', email: 'admin@ness.io', role: 'platform_admin' });
});

describe('semRastroDeAssinatura', () => {
  it('tira *_approved_ip/ua e *_signed_ip, mantém quem e quando assinou', () => {
    expect(semRastroDeAssinatura({ a: 1, ciso_approved_by: 'x', ceo_approved_ip: 'i', ceo_approved_ua: 'u', ciso_signed_ip: 'i' }))
      .toEqual({ a: 1, ciso_approved_by: 'x' });
  });
});

describe('leituras JSON sem IP/UA de assinatura', () => {
  it('controle: lista global, lista do projeto, política, painel do cliente e pacote de auditoria', async () => {
    const cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.test', role: 'client', client_project_id: PROJ });
    const dash = await worker.fetch(new Request('http://localhost/api/v1/client/dashboard', { headers: cliente }), { ...env, AI: { run: async () => ({}) } } as any);
    expect(dash.status).toBe(200);
    const td = await dash.text();
    expect(td).toContain('lider@x.test');
    expect(td).not.toMatch(RASTRO);
    expect(td).not.toContain(IP);
    for (const p of ['/api/v1/controls', `/api/v1/projects/${PROJ}/controls`, `/api/v1/projects/${PROJ}/controls/c-min/policy`, `/api/v1/projects/${PROJ}/audit-pack`]) {
      const t = await texto(p);
      expect(t, p).toContain('lider@x.test');
      expect(t, p).not.toMatch(RASTRO);
      expect(t, p).not.toContain(IP);
    }
  });

  it('evidência: lista, detalhe e documentos', async () => {
    for (const p of [`/api/v1/projects/${PROJ}/evidence`, '/api/v1/evidence/e-min/detail', `/api/v1/projects/${PROJ}/documents`]) {
      const t = await texto(p);
      expect(t, p).toContain('lider@x.test');
      expect(t, p).not.toMatch(RASTRO);
      expect(t, p).not.toContain(IP);
    }
  });

  it('ROPA: lista sem rastro; relatório HTML também não traz o IP', async () => {
    const t = await texto(`/api/v1/projects/${PROJ}/ropa`);
    expect(t).toContain('lider@x.test');
    expect(t).not.toMatch(RASTRO);
    const rel = await texto(`/api/v1/projects/${PROJ}/ropa/report`);
    expect(rel).toContain('lider@x.test');
    expect(rel).not.toContain(IP);
  });

  it('DPIA: lista e relatório sem rastro; análise crítica sem IP', async () => {
    expect(await texto(`/api/v1/projects/${PROJ}/dpia`)).not.toMatch(RASTRO);
    expect(await texto(`/api/v1/projects/${PROJ}/dpia/d-min/report`)).not.toContain(IP);
    expect(await texto(`/api/v1/projects/${PROJ}/management-reviews`)).not.toMatch(RASTRO);
  });

  it('política: relatório HTML também não traz o IP nem o UA', async () => {
    const rel = await texto(`/api/v1/projects/${PROJ}/controls/c-min/policy/report`);
    expect(rel).toContain('lider@x.test');
    expect(rel).not.toContain(IP);
    expect(rel).not.toContain(UA);
  });

  it('o banco continua guardando o rastro', async () => {
    const c = await env.DB.prepare(`SELECT ciso_approved_ip FROM compliance_controls WHERE id='c-min'`).first<any>();
    expect(c.ciso_approved_ip).toBe(IP);
  });
});
