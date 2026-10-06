import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, seedTwoProjects } from './helpers/d1';
import {
  projetoCriarSchema, projetoAtualizarSchema, revogarAprovacaoSchema, assessmentRespostasPublicasSchema,
  assessmentPrecoSchema, documentoGerarSchema, precificacaoConfigSchema, metricaCriarSchema,
} from '../src/schemas';

/**
 * Item T3: corpos que eram lidos sem schema. Cada caso fixa o que PASSA (formato
 * que o frontend já manda) e o que passa a ser recusado (tipo errado, coleção
 * sem teto, escalar onde se espera objeto).
 */
describe('Schemas de corpo (T3)', () => {
  it('projeto: aceita o corpo do formulário e recusa tipo errado', () => {
    expect(projetoCriarSchema.safeParse({ client_name: 'ACME', sector: 'Fintech' }).success).toBe(true);
    expect(projetoCriarSchema.safeParse({ client_name: { $ne: 1 } }).success).toBe(false);
    expect(projetoAtualizarSchema.safeParse({ status: 'active', repository_token: null }).success).toBe(true);
    expect(projetoAtualizarSchema.safeParse({ status: 5 }).success).toBe(false);
  });

  it('revogação em lote: lista de strings com teto', () => {
    expect(revogarAprovacaoSchema.safeParse({ role: 'ciso', reason: 'x', control_ids: ['a'] }).success).toBe(true);
    expect(revogarAprovacaoSchema.safeParse({ role: 'ciso', control_ids: 'a' }).success).toBe(false);
    expect(revogarAprovacaoSchema.safeParse({ control_ids: Array(1001).fill('a') }).success).toBe(false);
  });

  it('assessment: respostas do frontend passam; bloco sem array não', () => {
    const ok = { block: 1, answers: [{ question_key: 'k', question: '', answer: 'v', notes: '' }] };
    expect(assessmentRespostasPublicasSchema.safeParse(ok).success).toBe(true);
    expect(assessmentRespostasPublicasSchema.safeParse({ block: 1, answers: 'x' }).success).toBe(false);
    expect(assessmentRespostasPublicasSchema.safeParse({ ...ok, block: '1' }).success).toBe(false);
    // NaN do parseFloat vira null no JSON e já era aceito.
    expect(assessmentPrecoSchema.safeParse({ precoFinal: null, desconto: 10 }).success).toBe(true);
    expect(assessmentPrecoSchema.safeParse({ precoFinal: 'caro' }).success).toBe(false);
  });

  it('documento, config de preço e MCP: forma mínima exigida', () => {
    expect(documentoGerarSchema.safeParse({ itemId: 'p1', fields: { a: 'b' } }).success).toBe(true);
    expect(documentoGerarSchema.safeParse({ itemId: 'p1', fields: [] }).success).toBe(false);
    expect(precificacaoConfigSchema.safeParse({ tetoDesconto: 10 }).success).toBe(true);
    expect(precificacaoConfigSchema.safeParse([1, 2]).success).toBe(false);
    expect(precificacaoConfigSchema.safeParse('x').success).toBe(false);
    expect(metricaCriarSchema.safeParse({ metric_name: 'm', target_value: '10' }).success).toBe(false);
  });
});

describe('Rotas com schema novo (T3)', () => {
  let headers: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'a@b.c', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });
  const req = (method: string, path: string, body: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers, body: JSON.stringify(body) }), env as any);

  it('PUT /projects/:id com status de tipo errado devolve 400 no envelope padrão', async () => {
    const res = await req('PUT', '/api/v1/projects/proj-a', { status: { x: 1 } });
    expect(res.status).toBe(400);
    const b = (await res.json()) as any;
    expect(b.error).toBe('Payload inválido');
    expect(b.details[0].path).toBe('status');
  });

  it('PUT /projects/:id com campo válido continua gravando', async () => {
    const res = await req('PUT', '/api/v1/projects/proj-a', { scope: 'Escopo novo' });
    expect(res.status).toBe(200);
  });

  it('PUT /platform/pricing-config recusa array', async () => {
    const res = await req('PUT', '/api/v1/platform/pricing-config', [1]);
    expect(res.status).toBe(400);
  });
});
