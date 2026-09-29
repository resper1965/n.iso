import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { PHASE_QUESTIONS } from '../src/phase-questions';
import { parseSugestoes } from '../src/agents/control-adequacao';

/**
 * Adequação de controles a partir das respostas (F3) — sugestão (IA) + aplicação
 * aprovada. Guarda-rail: nunca escreve "Implemented"/"Compliant"; toda escrita é
 * um POST /apply humano, auditado e com escopo por projeto.
 */
describe('Adequação de controles (F3)', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity)
       VALUES ('A.5.1','p1','ISO 27001:2022','Políticas de segurança','Missing',0)`
    ).run();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'consultor', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  const req = (metodo: string, path: string, body?: unknown, h = headers, extraEnv?: any) =>
    app.fetch(
      new Request(`http://localhost${path}`, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined }),
      (extraEnv ? { ...env, ...extraEnv } : env) as any
    );

  const salvar = (phase: number, answers: Record<string, string>) =>
    req('PUT', '/api/v1/projects/p1/phase-answers', { phase_number: phase, answers });

  // ── Sugestões (read-only) ────────────────────────────────────────────────
  it('sem IA: sugestões vazias, fonte indisponivel', async () => {
    await salvar(15, { [PHASE_QUESTIONS[15][0].key]: 'Não' });
    const res = await req('GET', '/api/v1/projects/p1/control-adequacao/15/suggestions');
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.fonte).toBe('indisponivel');
    expect(b.sugestoes).toEqual([]);
    expect(b.status_permitidos).not.toContain('Compliant');
  });

  it('com IA: sugestão aterrada entra; control_id/pergunta inválidos e status inseguro saem', async () => {
    const k = PHASE_QUESTIONS[15][0].key;
    await salvar(15, { [k]: 'Não' });
    const saida = JSON.stringify([
      { control_id: 'A.5.1', sugestao_status: 'In Progress', sugestao_maturidade: 2, pergunta_key: k, justificativa: 'Resposta indica política ausente.' },
      { control_id: 'A.5.1', sugestao_status: 'Compliant', pergunta_key: k, justificativa: 'inseguro' }, // status proibido → descartado
      { control_id: 'X.9.9', sugestao_status: 'Planned', pergunta_key: k, justificativa: 'controle inexistente' }, // descartado
      { control_id: 'A.5.1', sugestao_status: 'Planned', pergunta_key: 'forjada', justificativa: 'pergunta forjada' }, // descartado
    ]);
    const res = await req('GET', '/api/v1/projects/p1/control-adequacao/15/suggestions', undefined, headers, { AI: { run: async () => ({ response: saida }) } });
    const b = (await res.json()) as any;
    expect(b.fonte).toBe('ia');
    expect(b.sugestoes.length).toBe(1);
    expect(b.sugestoes[0].control_id).toBe('A.5.1');
    expect(b.sugestoes[0].status_atual).toBe('Missing'); // enriquecido com o estado atual
    expect(b.sugestoes[0].origem).toBe('ia');
  });

  it('sugestões: fase inválida → 400; escopo de outro tenant → 403', async () => {
    expect((await req('GET', '/api/v1/projects/p1/control-adequacao/999/suggestions')).status).toBe(400);
    const h = { ...(await sessionFor({ id: 'u2', email: 'o@c.com', role: 'org_user', client_project_id: 'p-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    expect((await req('GET', '/api/v1/projects/p1/control-adequacao/15/suggestions', undefined, h)).status).toBe(403);
  });

  // ── Aplicação (escrita aprovada) ─────────────────────────────────────────
  it('apply: aplica status+maturidade, muda o controle e audita', async () => {
    const res = await req('POST', '/api/v1/projects/p1/control-adequacao/apply', {
      control_id: 'A.5.1', status: 'In Progress', maturity: 2, justificativa: 'Política em elaboração', pergunta_key: 'p15_q1', phase_number: 15,
    });
    expect(res.status).toBe(200);
    const ctrl = await env.DB.prepare('SELECT status, maturity FROM compliance_controls WHERE id = ?').bind('A.5.1').first<any>();
    expect(ctrl.status).toBe('In Progress');
    expect(ctrl.maturity).toBe(2);
    const { results } = await env.DB.prepare(
      "SELECT justification FROM audit_logs WHERE action = 'control.adequacao.applied' AND project_id = 'p1'"
    ).all();
    expect((results ?? []).length).toBe(1);
    expect((results as any[])[0].justification).toBe('Política em elaboração');
  });

  it('apply: status inseguro (Compliant) é recusado → 400, controle intacto', async () => {
    const res = await req('POST', '/api/v1/projects/p1/control-adequacao/apply', {
      control_id: 'A.5.1', status: 'Compliant', justificativa: 'x',
    });
    expect(res.status).toBe(400);
    const ctrl = await env.DB.prepare('SELECT status FROM compliance_controls WHERE id = ?').bind('A.5.1').first<any>();
    expect(ctrl.status).toBe('Missing'); // não mudou
  });

  it('apply: sem justificativa → 400; sem status nem maturity → 400', async () => {
    expect((await req('POST', '/api/v1/projects/p1/control-adequacao/apply', { control_id: 'A.5.1', status: 'Planned' })).status).toBe(400);
    expect((await req('POST', '/api/v1/projects/p1/control-adequacao/apply', { control_id: 'A.5.1', justificativa: 'ok' })).status).toBe(400);
  });

  it('apply: controle de outro projeto → 404 (isolamento)', async () => {
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','Outro','ISO 27001','controller','Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('B.1','p2','ISO 27001:2022','X','Missing')`
    ).run();
    const res = await req('POST', '/api/v1/projects/p1/control-adequacao/apply', {
      control_id: 'B.1', status: 'Planned', justificativa: 'tentativa cruzada',
    });
    expect(res.status).toBe(404);
  });
});

describe('parseSugestoes (aterramento e guarda-rail)', () => {
  const controles = new Set(['A.5.1', 'A.8.1']);
  const chaves = new Set(['p15_q1']);

  it('descarta status inseguro, control_id e pergunta inválidos; mantém o válido', () => {
    const raw = JSON.stringify([
      { control_id: 'A.5.1', sugestao_status: 'Partial', pergunta_key: 'p15_q1', justificativa: 'ok' },
      { control_id: 'A.5.1', sugestao_status: 'Implemented', pergunta_key: 'p15_q1', justificativa: 'inseguro' },
      { control_id: 'ZZZ', sugestao_status: 'Planned', pergunta_key: 'p15_q1', justificativa: 'id inexistente' },
      { control_id: 'A.8.1', sugestao_status: 'Planned', pergunta_key: 'outra', justificativa: 'pergunta inválida' },
    ]);
    const r = parseSugestoes(raw, controles, chaves);
    expect(r.length).toBe(1);
    expect(r[0].sugestao_status).toBe('Partial');
  });

  it('aceita sugestão só de maturidade (sem status)', () => {
    const raw = JSON.stringify([{ control_id: 'A.5.1', sugestao_maturidade: 3, pergunta_key: 'p15_q1', justificativa: 'evolução' }]);
    const r = parseSugestoes(raw, controles, chaves);
    expect(r.length).toBe(1);
    expect(r[0].sugestao_status).toBeNull();
    expect(r[0].sugestao_maturidade).toBe(3);
  });

  it('lixo → vazio', () => {
    expect(parseSugestoes('sem json', controles, chaves)).toEqual([]);
  });
});
