import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { PHASE_QUESTIONS } from '../src/phase-questions';
import { parseInterpretacao } from '../src/agents/phase-interpretation';

/**
 * Interpretação por fase (F2): camada determinística (cobertura + perguntas sem
 * resposta) SEMPRE presente; camada de IA (PhaseInterpretationAgent) por cima,
 * com aterramento — nunca derruba a resposta, e todo ponto cita uma pergunta.
 */
describe('Interpretação da fase (F2)', () => {
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

  const put = (path: string, body: unknown, h = headers) =>
    app.fetch(new Request(`http://localhost${path}`, { method: 'PUT', headers: h, body: JSON.stringify(body) }), env as any);

  // GET interpret, opcionalmente com um binding AI dublado.
  const interpret = (phase: number, opts: { query?: string; aiRun?: (m: string, o: any) => Promise<any>; h?: Record<string, string> } = {}) =>
    app.fetch(
      new Request(`http://localhost/api/v1/projects/p1/phase-answers/${phase}/interpret${opts.query ?? ''}`, { headers: opts.h ?? headers }),
      (opts.aiRun ? { ...env, AI: { run: opts.aiRun } } : env) as any
    );

  it('fase inválida → 400', async () => {
    const res = await interpret(999);
    expect(res.status).toBe(400);
  });

  it('sem IA: devolve cobertura determinística e interpretacao null', async () => {
    const k1 = PHASE_QUESTIONS[1][0].key;
    const k2 = PHASE_QUESTIONS[1][1].key;
    await put('/api/v1/projects/p1/phase-answers', { phase_number: 1, answers: { [k1]: 'Moderado', [k2]: 'Proteger receita' } });

    const res = await interpret(1); // env sem AI
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.fonte).toBe('indisponivel');
    expect(b.interpretacao).toBeNull();
    expect(b.cobertura.total).toBe(PHASE_QUESTIONS[1].length);
    expect(b.cobertura.respondidas).toBe(2);
    expect(b.cobertura.sem_resposta.length).toBe(PHASE_QUESTIONS[1].length - 2);
    expect(b.clausula).toBe('5.2 & 6.2'); // ancorado na cláusula da fase
  });

  it('com IA: diagnóstico entra, e ponto sem pergunta válida é descartado (aterramento)', async () => {
    const k1 = PHASE_QUESTIONS[1][0].key;
    await put('/api/v1/projects/p1/phase-answers', { phase_number: 1, answers: { [k1]: 'Não definido' } });

    const saida = JSON.stringify({
      prontidao: 'critico',
      resumo: 'Apetite de risco não definido compromete a base da fase.',
      pontos: [
        { severidade: 'alto', pergunta_key: k1, observacao: 'Sem apetite de risco declarado.' },
        { severidade: 'alto', pergunta_key: 'forjada_q9', observacao: 'inventada' },
      ],
      proximos_passos: ['Formalizar o apetite de risco em ata da direção.'],
    });
    const res = await interpret(1, { aiRun: async () => ({ response: saida }) });
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.fonte).toBe('ia');
    expect(b.interpretacao.prontidao).toBe('critico');
    expect(b.interpretacao.pontos.length).toBe(1); // a forjada saiu
    expect(b.interpretacao.pontos[0].pergunta_key).toBe(k1);
    expect(b.interpretacao.origem).toBe('ia');
  });

  it('com IA: saída não-JSON não quebra — cobertura intacta, interpretacao null', async () => {
    const k1 = PHASE_QUESTIONS[1][0].key;
    await put('/api/v1/projects/p1/phase-answers', { phase_number: 1, answers: { [k1]: 'Baixo' } });
    const res = await interpret(1, { aiRun: async () => ({ response: 'desculpe, não consegui' }) });
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.interpretacao).toBeNull();
    expect(b.cobertura.respondidas).toBe(1);
  });

  it('projeto de outro tenant é barrado por escopo (403)', async () => {
    const h = { ...(await sessionFor({ id: 'u2', email: 'o@c.com', role: 'org_user', client_project_id: 'p-outro', iat: Date.now() })), 'Content-Type': 'application/json' };
    const res = await interpret(1, { h });
    expect(res.status).toBe(403);
  });
});

describe('parseInterpretacao (aterramento)', () => {
  const chaves = new Set(['p1_q1', 'p1_q2']);

  it('extrai objeto em cerca ```json e normaliza campos', () => {
    const raw = '```json\n{"prontidao":"xpto","resumo":"ok","pontos":[{"severidade":"grave","pergunta_key":"p1_q1","observacao":"x"}],"proximos_passos":["a"]}\n```';
    const r = parseInterpretacao(raw, chaves)!;
    expect(r.prontidao).toBe('atencao'); // valor inválido → default
    expect(r.pontos[0].severidade).toBe('medio'); // severidade inválida → default
    expect(r.proximos_passos).toEqual(['a']);
  });

  it('descarta ponto cuja pergunta_key não pertence à fase', () => {
    const raw = '{"prontidao":"em_dia","resumo":"","pontos":[{"severidade":"alto","pergunta_key":"forjada","observacao":"x"}],"proximos_passos":[]}';
    const r = parseInterpretacao(raw, chaves)!;
    expect(r.pontos.length).toBe(0);
  });

  it('lixo sem objeto JSON → null', () => {
    expect(parseInterpretacao('sem json aqui', chaves)).toBeNull();
    expect(parseInterpretacao('', chaves)).toBeNull();
  });
});
