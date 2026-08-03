import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, seedTwoProjects } from './helpers/d1';

/**
 * Contrato da resposta de erro de validação.
 *
 * `validateBody` devolvia `result.error.issues` cru, ou seja, a forma interna
 * do zod era o contrato público da API. O bump para o zod 4 mostrou o custo:
 * `received` sumiu de `invalid_type` e o texto das mensagens mudou. Os testes
 * existentes não pegaram nada, porque todos conferiam só o status 400 — o
 * mesmo erro de sempre, testar o que é fácil em vez do que quebra o cliente.
 *
 * Estes testes fixam a forma. Se um bump futuro de zod mudar a estrutura, é
 * aqui que aparece — e não no cliente de alguém.
 */
describe('Contrato do erro de validação', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'a@b.c', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function corpoInvalido() {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/proj-a/ropa', {
        method: 'POST',
        headers,
        // `processing_purpose` é o único obrigatório do ropaSchema.
        body: JSON.stringify({ data_categories: 'nome, e-mail' }),
      }),
      env as any
    );
    return { status: res.status, body: await res.json() as any };
  }

  it('devolve 400 com error e details', async () => {
    const { status, body } = await corpoInvalido();
    expect(status).toBe(400);
    expect(body.error).toBe('Payload inválido');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('cada item tem exatamente path e message, como string', async () => {
    // A forma é nossa, não a do zod. Campo a mais aqui significa que voltamos
    // a vazar estrutura de biblioteca para o cliente.
    const { body } = await corpoInvalido();
    for (const item of body.details) {
      expect(Object.keys(item).sort()).toEqual(['message', 'path']);
      expect(typeof item.path).toBe('string');
      expect(typeof item.message).toBe('string');
      expect(item.message.length).toBeGreaterThan(0);
    }
  });

  it('path aponta o campo que falhou', async () => {
    const { body } = await corpoInvalido();
    expect(body.details.some((i: any) => i.path === 'processing_purpose')).toBe(true);
  });

  it('o frontend continua conseguindo montar a mensagem', async () => {
    // `frontend/src/api.js:32` faz exatamente isto. Se quebrar, o usuário vê
    // "API Error" em vez do motivo real.
    const { body } = await corpoInvalido();
    const mensagens = body.details.map((i: any) => i.message);
    expect(mensagens.length).toBeGreaterThan(0);
    // Nenhum item pode vir indefinido — é o que aconteceria se `message`
    // sumisse da forma. Não dá para checar a substring 'undefined' no texto:
    // a mensagem legítima do zod para campo ausente é "received undefined".
    for (const m of mensagens) expect(typeof m).toBe('string');
    expect(mensagens.join(', ')).toBeTruthy();
  });

  it('JSON malformado é 400 sem details', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/proj-a/ropa', {
        method: 'POST', headers, body: '{isto nao e json',
      }),
      env as any
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.details).toBeUndefined();
  });
});
