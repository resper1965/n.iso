// Endpoint que estabelece o control-set 27701:2025 (Anexo A) do ZERO por papel.
// Cobre o buraco real: projetos têm os 93 controles 27001:2022 e ZERO de
// privacidade; o migrate-27701-2025 só transforma uma base 2019 inexistente.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { ISO_27701_2025_CONTROLLER, ISO_27701_2025_PROCESSOR } from '../src/data/iso27701-2025';

describe('Seed 27701:2025 (Anexo A por papel)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  const seed = (projectId: string) =>
    app.fetch(new Request(`http://localhost/api/v1/projects/${projectId}/seed-27701-2025`, { method: 'POST', headers }), env as any);

  const countPriv = async (projectId: string) =>
    (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'"
    ).bind(projectId).first<{ n: number }>())!.n;

  it('Controlador: semeia as 31 tabelas A.1 e atualiza o rótulo (2019→2025)', async () => {
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001:2022, ISO 27701:2019','Controller','Active')`
    ).run();

    const res = await seed('p1');
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.seeded).toBe(ISO_27701_2025_CONTROLLER.length); // 31
    expect(b.catalog_total).toBe(31);
    expect(await countPriv('p1')).toBe(31);

    // rótulo: 2019 substituído por 2025, sem duplicar.
    const proj = await env.DB.prepare("SELECT standards FROM projects WHERE id='p1'").first<{ standards: string }>();
    expect(proj!.standards).toContain('ISO 27701:2025');
    expect(proj!.standards).not.toContain('27701:2019');

    // não tocou nos controles 27001 existentes (não havia; garante que só criou privacidade).
    const codes = await env.DB.prepare("SELECT title FROM compliance_controls WHERE project_id='p1' AND standard='ISO 27701:2025' ORDER BY title LIMIT 1").first<{ title: string }>();
    expect(codes!.title.startsWith('A.1.')).toBe(true);
  });

  it('idempotente: re-rodar não duplica', async () => {
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','C','ISO 27001:2022','Controller','Active')`
    ).run();
    await seed('p2');
    const res2 = await seed('p2');
    const b2 = (await res2.json()) as any;
    expect(b2.seeded).toBe(0);                 // nada novo
    expect(await countPriv('p2')).toBe(31);    // segue 31, sem duplicar
  });

  it('Controlador & Operador: semeia A.1 + A.2 (49)', async () => {
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p3','C','ISO 27001:2022','Controller & Processor','Active')`
    ).run();
    const b = (await (await seed('p3')).json()) as any;
    expect(b.seeded).toBe(ISO_27701_2025_CONTROLLER.length + ISO_27701_2025_PROCESSOR.length); // 49
    expect(await countPriv('p3')).toBe(49);
  });

  it('projeto inexistente → 404', async () => {
    const res = await seed('nao-existe');
    expect(res.status).toBe(404);
  });
});
