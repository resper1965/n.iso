// D3 — revogar/desaprovar a assinatura de um controle.
//  - o papel de ESCRITA (consultor) revoga sem senha de aprovador nem admin;
//  - limpa ciso_*/ceo_* do papel indicado e PERSISTE; o outro papel fica intacto;
//  - reason é obrigatório; role inválido → 400;
//  - lote por projeto com aterramento de tenant; grava trilha de auditoria.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('revogar aprovação de controle (D3)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr1','C','ISO 27001:2022','Controller','Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr2','C2','ISO 27001:2022','Controller','Active')`
    ).run();
    // Controles aprovados por um "automator" (sem lastro humano) — o caso real.
    for (const id of ['c1', 'c2']) {
      await env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, status, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua, ceo_approved_by)
         VALUES (?, 'pr1','ISO 27001:2022','A.5.1 X','Approved','Ricardo Esper','2026-08-01','127.0.0.1','System Agent Automator','CEO Fulano')`
      ).bind(id).run();
    }
    // Controle de OUTRO projeto (para o aterramento do lote).
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status, ciso_approved_by) VALUES ('c-outro','pr2','ISO 27001:2022','A.5.1 Z','Approved','Ricardo Esper')`
    ).run();
    // Chave de ESCRITA do consultor (sem senha de aprovador).
    headers = { ...(await sessionFor({ id: 'u1', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (method: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('revoga o sign-off CISO e persiste; o CEO fica intacto', async () => {
    const res = await req('POST', '/api/v1/controls/c1/revoke-approval', { role: 'ciso', reason: 'Aprovação sem lastro humano (automator)' });
    expect(res.status).toBe(200);
    const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ciso_approved_ip, ceo_approved_by FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.ciso_approved_by).toBeNull();
    expect(ctrl.ciso_approved_ip).toBeNull();
    expect(ctrl.ceo_approved_by).toBe('CEO Fulano'); // outro papel intacto
    const log = await env.DB.prepare("SELECT action FROM audit_logs WHERE action='control.approval_revoked'").first<any>();
    expect(log).not.toBeNull();
  });

  it('reason é obrigatório → 400 e não persiste', async () => {
    const res = await req('POST', '/api/v1/controls/c1/revoke-approval', { role: 'ciso' });
    expect(res.status).toBe(400);
    const ctrl = await env.DB.prepare("SELECT ciso_approved_by FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.ciso_approved_by).toBe('Ricardo Esper');
  });

  it('role inválido → 400', async () => {
    const res = await req('POST', '/api/v1/controls/c1/revoke-approval', { role: 'dpo', reason: 'x' });
    expect(res.status).toBe(400);
  });

  it('lote: revoga vários e aterra por projeto (ignora controle de outro tenant)', async () => {
    const res = await req('POST', '/api/v1/projects/pr1/revoke-approvals', { role: 'ciso', control_ids: ['c1', 'c2', 'c-outro'], reason: 'Limpeza de aprovações do automator' });
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.revoked_count).toBe(2); // c-outro é de pr2, não conta
    const c1 = await env.DB.prepare("SELECT ciso_approved_by FROM compliance_controls WHERE id='c1'").first<any>();
    const outro = await env.DB.prepare("SELECT ciso_approved_by FROM compliance_controls WHERE id='c-outro'").first<any>();
    expect(c1.ciso_approved_by).toBeNull();
    expect(outro.ciso_approved_by).toBe('Ricardo Esper'); // intacto (outro projeto)
  });
});
