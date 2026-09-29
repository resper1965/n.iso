import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * O DPO / Líder do SGSI é UM por projeto: é a âncora do organograma e quem
 * responde pelo SGSI. Antes, `is_primary` aceitava vários ao mesmo tempo — a
 * tela ancorava o primeiro e pendurava o selo "DPO / Líder" nos outros, dentro
 * das colunas de área (dois líderes na mesma tela).
 */
const url = '/api/v1/projects/p-lid/governance';
const primarios = async () =>
  (await env.DB.prepare(`SELECT email FROM project_governance WHERE project_id = 'p-lid' AND is_primary = 1 ORDER BY email`).all<{ email: string }>())
    .results.map((r) => r.email);

describe('Líder do SGSI único por projeto', () => {
  let s: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-lid','Cliente','ISO 27001','controller','Active')`).run();
    s = { ...(await sessionFor({ id: 'u-a', email: 'adm@ness.lat', role: 'platform_admin' })), 'Content-Type': 'application/json' };
  });

  it('marcar um novo líder desmarca o anterior', async () => {
    await pedir(worker, url, { method: 'POST', headers: s, body: JSON.stringify({ name: 'Ana', email: 'ana@c.com', role_category: 'executivo', job_title: 'DPO', is_primary: 1 }) });
    await pedir(worker, url, { method: 'POST', headers: s, body: JSON.stringify({ name: 'Bia', email: 'bia@c.com', role_category: 'executivo', job_title: 'CEO', is_primary: 1 }) });
    expect(await primarios()).toEqual(['bia@c.com']);
  });

  it('editar o líder atual mantendo a marca não o desmarca', async () => {
    const bia = await env.DB.prepare(`SELECT id FROM project_governance WHERE email = 'bia@c.com'`).first<{ id: string }>();
    const res = await pedir(worker, url, { method: 'POST', headers: s, body: JSON.stringify({ id: bia!.id, name: 'Bia S.', email: 'bia@c.com', role_category: 'executivo', job_title: 'CEO', is_primary: 1 }) });
    expect(res.status).toBe(200);
    expect(await primarios()).toEqual(['bia@c.com']);
  });

  it('membro sem a marca não mexe no líder', async () => {
    await pedir(worker, url, { method: 'POST', headers: s, body: JSON.stringify({ name: 'Caio', email: 'caio@c.com', role_category: 'tech', job_title: 'CTO', is_primary: 0 }) });
    expect(await primarios()).toEqual(['bia@c.com']);
  });

  it('o líder de outro projeto não é afetado', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-out','Outro','ISO 27001','controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES ('p-out','Zé','ze@o.com','executivo','DPO',1)`).run();
    await pedir(worker, url, { method: 'POST', headers: s, body: JSON.stringify({ name: 'Duda', email: 'duda@c.com', role_category: 'executivo', job_title: 'DPO', is_primary: 1 }) });
    const outro = await env.DB.prepare(`SELECT is_primary FROM project_governance WHERE email = 'ze@o.com'`).first<{ is_primary: number }>();
    expect(outro!.is_primary).toBe(1);
  });
});
