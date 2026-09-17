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
    // Cadeia conta→cliente: sem ela `p1` nasce órfão e nem o consultor da
    // própria conta alcança o projeto.
    await env.DB.prepare(
      `INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-jd', 'msp', 'Conta JD', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-jd', 'conta-jd', 'ACME S.A.', 'Active')`
    ).run();
    // Segundo cliente: dá ao "outro tenant" da suíte um `cliente_id` real,
    // para que o 403 meça a DESIGUALDADE de cliente, não a ausência de um.
    await env.DB.prepare(
      `INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-jd-outro', 'conta-jd', 'Outro Cliente', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, scope, standards, org_role, status, cliente_id)
       VALUES ('p1','ACME S.A.','Sede e nuvem','ISO 27001','controller','Active','cli-jd')`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'consultor', conta_id: 'conta-jd', cliente_id: null, iat: Date.now() })), 'Content-Type': 'application/json' };
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

  // Reescrito para a camada MSP: `projectAccessMiddleware` chama
  // `requireProjectAccess` ANTES do handler, e projeto inexistente recusa com o
  // mesmo 403 de projeto alheio — responder diferente diria a quem sonda quais
  // ids existem (mesma regra de `camada-msp-isolamento.test.ts`). O 404 real do
  // handler só é alcançável por `platform_admin`, que pula essa checagem.
  it('projeto inexistente é recusa por escopo (403) para ator de tenant', async () => {
    const res = await req('GET', '/api/v1/projects/nao-existe/journey-dossier');
    expect(res.status).toBe(403);
  });

  it('projeto inexistente → 404 quando o ator é platform_admin', async () => {
    const admin = { ...(await sessionFor({ id: 'u-admin', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await req('GET', '/api/v1/projects/nao-existe/journey-dossier', undefined, admin);
    expect(res.status).toBe(404);
  });

  it('projeto de outro tenant é barrado por escopo (403)', async () => {
    const h = { ...(await sessionFor({ id: 'u2', email: 'o@c.com', role: 'org_user', conta_id: null, cliente_id: 'cli-jd-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await req('GET', '/api/v1/projects/p1/journey-dossier', undefined, h);
    expect(res.status).toBe(403);
  });
});
