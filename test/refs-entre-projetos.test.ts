import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, seedTwoProjects, pedir } from './helpers/d1';

/**
 * Referência a recurso de OUTRO projeto vinda no corpo.
 *
 * O acesso à rota prova que o chamador alcança o projeto da URL (ou do recurso), não que o
 * `control_id`/`risk_id`/`asset_id`/`audit_id`/`ropa_id` do corpo seja desse projeto. Antes: o risco
 * de A apontava para o controle de B e `GET /projects/A/risks` exibia o título dele (JOIN); a CAPA de
 * A apontava para o risco de B e, pela FK com ON DELETE CASCADE, B apagar o risco apagava a CAPA de
 * A; e 500 (FK, id inexistente) contra 201 (id de B) dizia se o id existia em algum projeto.
 *
 * Contrato: inexistente e de outro projeto respondem o MESMO 400, nada é gravado; o vínculo
 * legítimo e o vínculo ausente continuam funcionando.
 */

const A = 'proj-a';
let h: Record<string, string>;

async function seed() {
  await seedTwoProjects();
  const db = env.DB;
  await db.batch([
    ...['a', 'b'].flatMap((x) => [
      db.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES (?, ?, 'ISO 27001', ?)`).bind(`ctl-${x}`, `proj-${x}`, `Controle ${x}`),
      db.prepare(`INSERT INTO assets (id, project_id, name) VALUES (?, ?, ?)`).bind(`as-${x}`, `proj-${x}`, `Ativo ${x}`),
      db.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES (?, ?, 'Ativo', 'Ameaça')`).bind(`r-${x}`, `proj-${x}`),
      db.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES (?, ?, 'internal', 'Auditoria', '2026-12-01')`).bind(`au-${x}`, `proj-${x}`),
      db.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?, ?, 'Folha')`).bind(`ropa-${x}`, `proj-${x}`),
    ]),
    db.prepare(`INSERT INTO corrective_actions (id, project_id, title) VALUES ('capa-a', 'proj-a', 'CAPA A')`),
    db.prepare(`INSERT INTO dpia_assessments (id, project_id) VALUES ('dpia-a', 'proj-a')`),
    db.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at-a', 'proj-a', 'tok-a', '2099-01-01T00:00:00Z')`),
  ]);
}

function req(caminho: string, metodo: string, corpo: unknown, headers = h) {
  return pedir(worker, caminho, { method: metodo, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
}

const conta = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

/** Afirma 400 com a mensagem do campo, e que o id inexistente recebe EXATAMENTE a mesma resposta. */
async function recusa(caminho: string, metodo: string, base: Record<string, unknown>, campo: string, alheio: string) {
  const r1 = await req(caminho, metodo, { ...base, [campo]: alheio });
  const r2 = await req(caminho, metodo, { ...base, [campo]: 'nao-existe-em-lugar-nenhum' });
  const t1 = await r1.text();
  expect(r1.status, t1).toBe(400);
  expect(r2.status).toBe(400);
  expect(t1).toBe(await r2.text());
  expect(t1).toContain(campo);
}

beforeAll(applySchema);

beforeEach(async () => {
  await resetData();
  await seed();
  // Cliente do projeto A: papel preso a projeto, como quem atacaria pelo corpo.
  h = await sessionFor({ id: 'u-a', email: 'adm@a.com', role: 'org_admin', client_project_id: A });
});

describe('riscos: control_id e asset_id do corpo', () => {
  const base = { asset: 'Servidor', threat: 'Ransomware', treatment: 'Accept' };

  it('POST recusa controle e ativo de outro projeto (e inexistente), sem gravar', async () => {
    const antes = await conta(`SELECT COUNT(*) n FROM risks WHERE project_id = 'proj-a'`);
    await recusa(`/api/v1/projects/${A}/risks`, 'POST', base, 'control_id', 'ctl-b');
    await recusa(`/api/v1/projects/${A}/risks`, 'POST', base, 'asset_id', 'as-b');
    expect(await conta(`SELECT COUNT(*) n FROM risks WHERE project_id = 'proj-a'`)).toBe(antes);
    const lista = await (await pedir(worker, `/api/v1/projects/${A}/risks`, { headers: h })).text();
    expect(lista).not.toContain('Controle b');
  });

  it('PUT recusa controle e ativo de outro projeto, sem alterar', async () => {
    await recusa('/api/v1/risks/r-a', 'PUT', base, 'control_id', 'ctl-b');
    await recusa('/api/v1/risks/r-a', 'PUT', base, 'asset_id', 'as-b');
    const r = await env.DB.prepare(`SELECT control_id, asset_id, asset FROM risks WHERE id = 'r-a'`).first<any>();
    expect(r).toEqual({ control_id: null, asset_id: null, asset: 'Ativo' });
  });

  it('legítimo: vínculo no próprio projeto e vínculo ausente', async () => {
    const p = await req(`/api/v1/projects/${A}/risks`, 'POST', { ...base, control_id: 'ctl-a', asset_id: 'as-a' });
    expect(p.status).toBe(201);
    expect((await req(`/api/v1/projects/${A}/risks`, 'POST', { ...base, control_id: null })).status).toBe(201);
    const u = await req('/api/v1/risks/r-a', 'PUT', { ...base, control_id: 'ctl-a', asset_id: 'as-a' });
    expect(u.status).toBe(200);
    expect(await env.DB.prepare(`SELECT control_id, asset_id FROM risks WHERE id = 'r-a'`).first()).toEqual({ control_id: 'ctl-a', asset_id: 'as-a' });
  });
});

