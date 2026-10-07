import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { idDoControle } from '../src/helpers';

describe('Seed 27001:2022 (Anexo A)', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
  });
  const seed = (p: string) => app.fetch(new Request(`http://localhost/api/v1/projects/${p}/seed-27001-2022`, { method: 'POST', headers }), env as any);
  const conta = async (p: string) => (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'").bind(p).first<{ n: number }>())!.n;
  const projeto = (...ids: string[]) => env.DB.batch(ids.map((id) => env.DB.prepare(
    `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(id)));

  it('semeia os 93, e a política acha o controle pelo código', async () => {
    await projeto('p1');
    const res = await seed('p1');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).seeded).toBe(93);
    expect(await conta('p1')).toBe(93);
    expect(await idDoControle(env.DB, 'p1', 'A.8.34')).not.toBeNull();
  });

  it('idempotente, inclusive sobre projeto antigo com ids ctrl-a51', async () => {
    await projeto('p2');
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-a51','p2','ISO 27001:2022','A.5.1 Políticas')`).run();
    const b = (await (await seed('p2')).json()) as any;
    expect(b.seeded).toBe(92);
    expect(((await (await seed('p2')).json()) as any).seeded).toBe(0);
    expect(await conta('p2')).toBe(93);
  });

  it('dois projetos semeados não colidem no id', async () => {
    await projeto('p3', 'p4');
    await seed('p3'); await seed('p4');
    expect(await conta('p3')).toBe(93);
    expect(await conta('p4')).toBe(93);
  });
});
