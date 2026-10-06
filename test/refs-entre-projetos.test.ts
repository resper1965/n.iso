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

describe('CAPA: audit_id, risk_id e control_id do corpo', () => {
  // Corpo completo: campo ausente vira `undefined` no bind, que o D1 recusa (500) — defeito à parte.
  const base = { title: 'Corrigir', description: 'd', severity: 'High', assigned_to: 'x@a.com', due_date: '2026-12-31', status: 'Open' };

  it('POST recusa as três referências de outro projeto, sem gravar', async () => {
    for (const [campo, alheio] of [['audit_id', 'au-b'], ['risk_id', 'r-b'], ['control_id', 'ctl-b']]) {
      await recusa(`/api/v1/projects/${A}/capa`, 'POST', base, campo, alheio);
    }
    expect(await conta(`SELECT COUNT(*) n FROM corrective_actions`)).toBe(1);
  });

  it('PUT recusa as três referências de outro projeto, sem alterar', async () => {
    for (const [campo, alheio] of [['audit_id', 'au-b'], ['risk_id', 'r-b'], ['control_id', 'ctl-b']]) {
      await recusa('/api/v1/capa/capa-a', 'PUT', base, campo, alheio);
    }
    const c = await env.DB.prepare(`SELECT audit_id, risk_id, control_id, title FROM corrective_actions WHERE id = 'capa-a'`).first();
    expect(c).toEqual({ audit_id: null, risk_id: null, control_id: null, title: 'CAPA A' });
  });

  it('B apagar o próprio risco não apaga CAPA de A (o cascade não alcança)', async () => {
    await req(`/api/v1/projects/${A}/capa`, 'POST', { ...base, risk_id: 'r-b' });
    await req('/api/v1/capa/capa-a', 'PUT', { ...base, risk_id: 'r-b' });
    const hb = await sessionFor({ id: 'u-b', email: 'adm@b.com', role: 'org_admin', client_project_id: 'proj-b' });
    const del = await pedir(worker, '/api/v1/risks/r-b', { method: 'DELETE', headers: hb });
    expect(del.status).toBe(200);
    expect(await conta(`SELECT COUNT(*) n FROM corrective_actions WHERE project_id = 'proj-a'`)).toBe(1);
  });

  it('legítimo: referências do próprio projeto e nenhuma', async () => {
    const corpo = { ...base, audit_id: 'au-a', risk_id: 'r-a', control_id: 'ctl-a' };
    expect((await req(`/api/v1/projects/${A}/capa`, 'POST', corpo)).status).toBe(201);
    expect((await req(`/api/v1/projects/${A}/capa`, 'POST', base)).status).toBe(201);
    expect((await req('/api/v1/capa/capa-a', 'PUT', corpo)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT risk_id FROM corrective_actions WHERE id = 'capa-a'`).first()).toEqual({ risk_id: 'r-a' });
  });
});

describe('achado de auditoria: control_id do corpo', () => {
  // `observation`: NC (major/minor) cria CAPA com `updated_at`, coluna que corrective_actions não
  // tem — 500 em qualquer caso, defeito à parte; com ele o vermelho daqui não provaria nada.
  const base = { project_id: A, finding_type: 'observation', description: 'Sem backup testado' };

  it('recusa controle de outro projeto, sem gravar achado', async () => {
    await recusa('/api/v1/audits/au-a/findings', 'POST', base, 'control_id', 'ctl-b');
    expect(await conta(`SELECT COUNT(*) n FROM audit_findings`)).toBe(0);
  });

  it('legítimo: controle do próprio projeto', async () => {
    const res = await req('/api/v1/audits/au-a/findings', 'POST', { ...base, control_id: 'ctl-a' });
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe('nota do auditor externo (token): control_id do corpo', () => {
  it('recusa controle de outro projeto, sem gravar', async () => {
    await recusa('/api/v1/auditor/tok-a/notes', 'POST', { content: 'Pergunta' }, 'control_id', 'ctl-b');
    expect(await conta(`SELECT COUNT(*) n FROM auditor_notes`)).toBe(0);
  });

  it('legítimo: controle do próprio projeto', async () => {
    expect((await req('/api/v1/auditor/tok-a/notes', 'POST', { content: 'Pergunta', control_id: 'ctl-a' }, {})).status).toBe(200);
  });
});

describe('DPIA: ropa_id do corpo', () => {
  const base = { processing_name: 'X', data_category_risk: 'Alto', necessity_proportionality: 'ok', technical_measures: 'cripto' };

  it('POST e PUT recusam ROPA de outro projeto, sem gravar', async () => {
    await recusa(`/api/v1/projects/${A}/dpia`, 'POST', base, 'ropa_id', 'ropa-b');
    await recusa('/api/v1/dpia/dpia-a', 'PUT', base, 'ropa_id', 'ropa-b');
    expect(await conta(`SELECT COUNT(*) n FROM dpia_assessments`)).toBe(1);
    expect(await env.DB.prepare(`SELECT ropa_id FROM dpia_assessments WHERE id = 'dpia-a'`).first()).toEqual({ ropa_id: null });
  });

  it('legítimo: ROPA do próprio projeto', async () => {
    expect((await req(`/api/v1/projects/${A}/dpia`, 'POST', { ...base, ropa_id: 'ropa-a' })).status).toBe(201);
    expect((await req('/api/v1/dpia/dpia-a', 'PUT', { ...base, ropa_id: 'ropa-a' })).status).toBe(200);
  });
});
