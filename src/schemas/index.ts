import { ZodSchema } from 'zod';
import { Context } from 'hono';

export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const raw = await c.req.json();
    const result = schema.safeParse(raw);
    if (!result.success) {
      return {
        success: false,
        response: c.json({ error: 'Payload inválido', details: result.error.issues }, 400) as unknown as Response
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
