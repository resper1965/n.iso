import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Critério de pronto da fatia (spec, seção 5, item 4): a evidência é enviada pelo checklist,
 * fica ligada ao controle, pendente; depois da revisão (assinatura do Líder SGSI) aparece
 * conforme na rastreabilidade e conta na análise de lacunas.
 */
const P = 'p-jornada';
let lider: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());

beforeAll(async () => {
  await applySchema();
  const hash = await hashPassword('password123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctl-j51', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação', 'Missing')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-lider', 'lider@ness.lat', ?, 'Lia Lider', 'consultor')`).bind(hash),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-l', ?, 'Lia Lider', 'lider@ness.lat', 'consultor', 'Líder do SGSI')`).bind(P),
  ]);
  lider = { ...(await sessionFor({ id: 'u-lider', email: 'lider@ness.lat', name: 'Lia Lider', role: 'consultor' })), 'Content-Type': 'application/json' };
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

describe('evidência pelo checklist até a rastreabilidade', () => {
  it('enviada pendente e ligada; revisada, aparece conforme e conta nas lacunas', async () => {
    const form = new FormData();
    form.append('file', new File(['politica assinada'], 'politica.pdf', { type: 'application/pdf' }));
    form.append('item_id', 'p15_1');
    const up = await chamar(`/api/v1/projects/${P}/documents/upload`, { method: 'POST', headers: cliente, body: form });
    const { id } = await up.json<{ id: string }>();
    expect(up.status).toBe(201);

    const antes = await (await chamar(`/api/v1/projects/${P}/traceability`, { headers: lider })).json<any>();
    const ctl = antes.controls.find((c: any) => c.id === 'ctl-j51');
    expect(ctl.evidence).toEqual([expect.objectContaining({ id, evaluation_status: 'pending' })]);

    const gap = await (await chamar(`/api/v1/projects/${P}/gap-analysis`, { headers: lider })).json<any>();
    expect(gap.controls_with_evidence).toBe(1);
    expect(gap.gaps.find((g: any) => g.control_id === 'ctl-j51').evidence_count).toBe(1);

    const rev = await chamar(`/api/v1/evidence/${id}/approve`, { method: 'POST', headers: lider, body: JSON.stringify({ role: 'ciso', password: 'password123' }) });
    expect(rev.status, await rev.clone().text()).toBe(200);

    const depois = await (await chamar(`/api/v1/projects/${P}/traceability`, { headers: lider })).json<any>();
    expect(depois.controls.find((c: any) => c.id === 'ctl-j51').evidence[0].evaluation_status).toBe('conforming');
  });
});
