import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

/**
 * Diagnóstico de Prontidão (F1, determinístico) — GET
 * /api/v1/projects/:id/readiness-check. Cada regra é exercitada com e sem o gap.
 */
describe('Diagnóstico de prontidão (D1 real)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`
    ).run();
    headers = await sessionFor({ id: 'u1', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() });
  });

  async function check(projectId = 'p1', h = headers) {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/projects/${projectId}/readiness-check`, { headers: h }),
      env as any
    );
    return { status: res.status, body: (await res.json()) as any };
  }

  it('rotula como auto-diagnóstico (não auditoria) e projeto vazio não tem achados', async () => {
    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body.rotulo).toMatch(/não é auditoria/i);
    expect(body.resumo.total).toBe(0);
  });

  it('controle Implemented sem evidência → achado ALTO de evidência faltante', async () => {
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c1','p1','ISO 27001:2022','Política','Implemented')`
    ).run();
    const { body } = await check();
    const a = body.achados.find((x: any) => x.referencia === 'c1');
    expect(a).toBeTruthy();
    expect(a.categoria).toBe('evidencia_faltante');
    expect(a.severidade).toBe('alto');
  });

  it('controle assinado sem evidência → achado CRÍTICO', async () => {
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status, ciso_approved_by) VALUES ('c2','p1','ISO 27001:2022','Acesso','Missing','ciso@ness.io')`
    ).run();
    const { body } = await check();
    const a = body.achados.find((x: any) => x.referencia === 'c2');
    expect(a).toBeTruthy();
    expect(a.severidade).toBe('critico');
    expect(a.categoria).toBe('doc_inconsistente');
  });

  it('status Missing com maturidade > 0 → achado MÉDIO de inconsistência', async () => {
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('c3','p1','ISO 27001:2022','Backup','Missing',3)`
    ).run();
    const { body } = await check();
    const a = body.achados.find((x: any) => x.referencia === 'c3' && x.requisito.includes('maturidade'));
    expect(a).toBeTruthy();
    expect(a.severidade).toBe('medio');
  });

  it('evidência rejeitada → achado ALTO', async () => {
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c4','p1','ISO 27001:2022','Log','Compliant')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by, evaluation_status) VALUES ('e4','p1','c4','log.pdf','k/e4','h4','u1','rejected')`
    ).run();
    const { body } = await check();
    const a = body.achados.find((x: any) => x.referencia === 'c4' && x.requisito.includes('válida'));
    expect(a).toBeTruthy();
    expect(a.severidade).toBe('alto');
  });

  it('controle com evidência aprovada NÃO gera achado de evidência faltante', async () => {
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c5','p1','ISO 27001:2022','Cripto','Implemented')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by, evaluation_status) VALUES ('e5','p1','c5','cripto.pdf','k/e5','h5','u1','approved')`
    ).run();
    const { body } = await check();
    expect(body.achados.find((x: any) => x.referencia === 'c5')).toBeFalsy();
  });

  it('controles Missing são agregados num único achado', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('m1','p1','ISO 27001:2022','A','Missing')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('m2','p1','ISO 27001:2022','B','Missing')`),
    ]);
    const { body } = await check();
    const agg = body.achados.filter((x: any) => x.categoria === 'doc_faltante' && x.requisito.includes('Implementação'));
    expect(agg.length).toBe(1);
    expect(agg[0].descricao).toContain('2 controle');
  });

  it('projeto de OUTRO tenant é barrado por escopo (403)', async () => {
    const h = await sessionFor({ id: 'u2', email: 'leitor@c.com', role: 'org_user', client_project_id: 'p-outro', iat: Date.now() });
    const { status } = await check('p1', h);
    expect(status).toBe(403);
  });

  it('projeto inexistente → 404', async () => {
    const { status } = await check('nao-existe');
    expect(status).toBe(404);
  });
});
