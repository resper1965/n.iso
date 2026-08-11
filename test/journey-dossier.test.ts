import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { PHASE_QUESTIONS } from '../src/phase-questions';

/**
 * Dossiê da Jornada (F3): consolidação read-only das respostas por fase num
 * documento apresentável, com escopo por projeto.
 */
describe('Dossiê da Jornada (F3)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, scope, standards, org_role, status)
       VALUES ('p1','ACME S.A.','Sede e nuvem','ISO 27001','controller','Active')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (metodo: string, path: string, body?: unknown, h = headers) =>
    app.fetch(new Request(`http://localhost${path}`, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined }), env as any);

  const salvar = (phase: number, answers: Record<string, string>) =>
    req('PUT', '/api/v1/projects/p1/phase-answers', { phase_number: phase, answers });

  it('consolida só as fases com resposta, ancoradas em título/cláusula', async () => {
    await salvar(0, { [PHASE_QUESTIONS[0][0].key]: 'Assinada' });
    await salvar(1, { [PHASE_QUESTIONS[1][0].key]: 'Moderado', [PHASE_QUESTIONS[1][1].key]: 'Proteger receita' });

    const res = await req('GET', '/api/v1/projects/p1/journey-dossier');
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;

    expect(b.projeto.client_name).toBe('ACME S.A.');
    expect(b.projeto.scope).toBe('Sede e nuvem');
    expect(b.secoes.length).toBe(2); // fases 0 e 1 (as que têm resposta)
    expect(b.secoes.map((s: any) => s.phase)).toEqual([0, 1]);
    expect(b.secoes[1].clausula).toBe('5.2 & 6.2'); // ancorado na cláusula da fase
    // a resposta preenchida aparece; a não preenchida vem como null
    const q1 = b.secoes[1].respostas.find((r: any) => r.pergunta_key === PHASE_QUESTIONS[1][0].key);
    expect(q1.resposta).toBe('Moderado');
    expect(b.resumo.fases_iniciadas).toBe(2);
    expect(b.resumo.respondidas).toBe(3);
  });

  it('fase sem nenhuma resposta não vira seção', async () => {
    await salvar(1, { [PHASE_QUESTIONS[1][0].key]: 'Baixo' });
    const b = (await (await req('GET', '/api/v1/projects/p1/journey-dossier')).json()) as any;
    expect(b.secoes.length).toBe(1);
    expect(b.secoes[0].phase).toBe(1);
  });

  it('projeto sem respostas → dossiê vazio, mas 200 com cabeçalho', async () => {
    const b = (await (await req('GET', '/api/v1/projects/p1/journey-dossier')).json()) as any;
    expect(b.secoes).toEqual([]);
    expect(b.resumo.fases_iniciadas).toBe(0);
    expect(b.projeto.client_name).toBe('ACME S.A.');
  });

  it('projeto inexistente → 404', async () => {
    const res = await req('GET', '/api/v1/projects/nao-existe/journey-dossier');
    expect(res.status).toBe(404);
  });

  it('projeto de outro tenant é barrado por escopo (403)', async () => {
    const h = { ...(await sessionFor({ id: 'u2', email: 'o@c.com', role: 'org_user', client_project_id: 'p-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await req('GET', '/api/v1/projects/p1/journey-dossier', undefined, h);
    expect(res.status).toBe(403);
  });
});
