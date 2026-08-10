import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { PHASE_QUESTIONS } from '../src/phase-questions';

/**
 * Questionário por fase da jornada (F1): banco de perguntas + persistência das
 * respostas por projeto (GET/PUT /phase-answers), com escopo.
 */
describe('Questionário da jornada por fase (D1 real)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (metodo: string, path: string, body?: unknown, h = headers) =>
    app.fetch(new Request(`http://localhost${path}`, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('o banco cobre as 41 fases, com chaves estáveis por fase', () => {
    expect(Object.keys(PHASE_QUESTIONS).length).toBe(41);
    expect(PHASE_QUESTIONS[1][0].key).toBe('p1_q1');
    expect(PHASE_QUESTIONS[3].every((q) => q.key.startsWith('p3_q'))).toBe(true);
  });

  it('GET /phase-questions serve o banco', async () => {
    const res = await req('GET', '/api/v1/phase-questions');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body['1'][0].question).toMatch(/apetite de risco/i);
  });

  it('PUT salva respostas de uma fase e GET as devolve', async () => {
    const k1 = PHASE_QUESTIONS[1][0].key; // p1_q1
    const k2 = PHASE_QUESTIONS[1][1].key; // p1_q2
    const put = await req('PUT', '/api/v1/projects/p1/phase-answers', {
      phase_number: 1, answers: { [k1]: 'Moderado', [k2]: 'Proteger receita, marca e dados de clientes' },
    });
    expect(put.status).toBe(200);
    expect((await put.json() as any).saved).toBe(2);

    const get = await req('GET', '/api/v1/projects/p1/phase-answers');
    const rows = (await get.json()) as any[];
    expect(rows.find((r) => r.question_key === k1)?.answer).toBe('Moderado');
    expect(rows.length).toBe(2);
  });

  it('PUT é upsert — reeditar a mesma pergunta atualiza, não duplica', async () => {
    const k1 = PHASE_QUESTIONS[1][0].key;
    await req('PUT', '/api/v1/projects/p1/phase-answers', { phase_number: 1, answers: { [k1]: 'Baixo' } });
    await req('PUT', '/api/v1/projects/p1/phase-answers', { phase_number: 1, answers: { [k1]: 'Alto' } });
    const rows = (await (await req('GET', '/api/v1/projects/p1/phase-answers')).json()) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].answer).toBe('Alto');
  });

  it('ignora chave de pergunta que não pertence à fase', async () => {
    const put = await req('PUT', '/api/v1/projects/p1/phase-answers', {
      phase_number: 1, answers: { forjada_q9: 'x', [PHASE_QUESTIONS[1][0].key]: 'Baixo' },
    });
    expect((await put.json() as any).saved).toBe(1); // só a válida
  });

  it('corpo inválido → 400', async () => {
    const res = await req('PUT', '/api/v1/projects/p1/phase-answers', { answers: {} });
    expect(res.status).toBe(400);
  });

  it('projeto de outro tenant é barrado por escopo (403)', async () => {
    const h = { ...(await sessionFor({ id: 'u2', email: 'o@c.com', role: 'org_user', client_project_id: 'p-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await req('GET', '/api/v1/projects/p1/phase-answers', undefined, h);
    expect(res.status).toBe(403);
  });
});
