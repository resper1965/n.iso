// Solicitação de mudança: tornar `owner` gravável em PUT /api/v1/controls/:id.
//  - PUT {"owner":"X"} → 200 {ok:true} e o GET reflete owner:"X";
//  - owner é metadado organizacional: NÃO invalida aprovações (ciso_/ceo_) nem
//    toca status/maturity;
//  - isolamento por projeto continua valendo (tenant sem acesso → 403).
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('PUT /controls/:id — owner gravável', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr1','C','ISO 27001:2022','Controller','Active')`
    ).run();
    // Controle já aprovado, para provar que gravar owner NÃO derruba o sign-off.
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, maturity, ciso_approved_by, ceo_approved_by)
       VALUES ('c1','pr1','ISO 27001:2022','A.5.1 Políticas','Texto vigente','In Progress',3,'DPO Fulano','CEO Beltrano')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (method: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('grava owner-only e o GET reflete, sem afetar outros campos', async () => {
    const res = await req('PUT', '/api/v1/controls/c1', { owner: 'Maria Silva' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const ctrl = await env.DB.prepare(
      "SELECT owner, status, maturity, description, ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id='c1'"
    ).first<any>();
    expect(ctrl.owner).toBe('Maria Silva');
    // Nenhum outro campo tocado.
    expect(ctrl.status).toBe('In Progress');
    expect(ctrl.maturity).toBe(3);
    expect(ctrl.description).toBe('Texto vigente');
    // owner é metadado: as aprovações permanecem intactas.
    expect(ctrl.ciso_approved_by).toBe('DPO Fulano');
    expect(ctrl.ceo_approved_by).toBe('CEO Beltrano');
  });

  it('aceita string vazia para limpar o responsável', async () => {
    await req('PUT', '/api/v1/controls/c1', { owner: 'Alguém' });
    const res = await req('PUT', '/api/v1/controls/c1', { owner: '' });
    expect(res.status).toBe(200);
    const ctrl = await env.DB.prepare("SELECT owner FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.owner).toBe('');
  });

  it('mantém o isolamento por tenant: org_admin de outro projeto não grava', async () => {
    const alienHeaders = { ...(await sessionFor({ id: 'u2', email: 'org@cliente.io', role: 'org_admin', client_project_id: 'pr-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await app.fetch(new Request('http://localhost/api/v1/controls/c1', { method: 'PUT', headers: alienHeaders, body: JSON.stringify({ owner: 'Invasor' }) }), env as any);
    expect(res.status).toBe(403);
    const ctrl = await env.DB.prepare("SELECT owner FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.owner).toBeNull();
  });
});

describe('PATCH /projects/:id/controls — reatribuição de owner em lote', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr1','C','ISO 27001:2022','Controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('pr2','C2','ISO 27001:2022','Controller','Active')`).run();
    // Dois controles do João no pr1, um da Ana no pr1, e um do João no pr2 (tenant à parte).
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES ('c1','pr1','ISO 27001:2022','A.5.1','João')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES ('c2','pr1','ISO 27001:2022','A.5.2','João')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES ('c3','pr1','ISO 27001:2022','A.5.3','Ana')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES ('c4','pr2','ISO 27001:2022','A.5.1','João')`).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (method: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('reatribui só os controles do owner_from DENTRO do projeto', async () => {
    const res = await req('PATCH', '/api/v1/projects/pr1/controls', { owner_from: 'João', owner_to: 'Carlos' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reassigned_count: 2 });
    const rows = await env.DB.prepare("SELECT id, owner FROM compliance_controls ORDER BY id").all<any>();
    const byId = Object.fromEntries(rows.results.map((r: any) => [r.id, r.owner]));
    expect(byId.c1).toBe('Carlos');
    expect(byId.c2).toBe('Carlos');
    expect(byId.c3).toBe('Ana');   // outro owner intacto
    expect(byId.c4).toBe('João');  // outro projeto intacto
  });

  it('exige owner_from e owner_to', async () => {
    expect((await req('PATCH', '/api/v1/projects/pr1/controls', { owner_to: 'X' })).status).toBe(400);
    expect((await req('PATCH', '/api/v1/projects/pr1/controls', { owner_from: 'João' })).status).toBe(400);
  });
});
