import { ZodSchema, ZodError } from 'zod';
import { Context } from 'hono';

/**
 * Normaliza os erros de validação para uma forma que é NOSSA.
 *
 * Antes isto devolvia `result.error.issues` cru — a estrutura interna do zod
 * virava contrato público da API. O bump para o zod 4 mostrou o preço: o campo
 * `received` deixou de existir em `invalid_type` e o texto das mensagens mudou
 * ("Expected string, received number" virou "Invalid input: expected string,
 * received number"). Nenhum teste pegou, porque todos só conferiam o status 400.
 *
 * `path` e `message` existem nas duas versões e são o que o cliente de fato
 * usa (`frontend/src/api.js` faz `details.map(i => i.message)`). O resto era
 * detalhe de implementação vazando para fora.
 */
function detalhes(erro: ZodError): Array<{ path: string; message: string }> {
  return erro.issues.map(i => ({
    path: i.path.map(String).join('.'),
    message: i.message,
  }));
}

export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const raw = await c.req.json();
    const result = schema.safeParse(raw);
    if (!result.success) {
      return {
        success: false,
        response: c.json({ error: 'Payload inválido', details: detalhes(result.error) }, 400) as unknown as Response
      };
    }
    return { success: true, data: result.data };
  } catch (e: any) {
    return {
      success: false,
      response: c.json({ error: 'Formato JSON inválido' }, 400) as unknown as Response
    };
  }
}

export * from './auth';
export * from './users';
export * from './integrations';
export * from './resources';
export * from './domain';
