import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { visaoDoEncarregado } from '../services/encarregado';

/**
 * Núcleo do n.privacy, fatia 8: visão do encarregado. Só leitura. Montado em `/api/v1/projects/:projectId/encarregado`, então o
 * `projectAccessMiddleware` já cortou o projeto antes daqui.
 */
export const encarregadoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

encarregadoApp.get('/', async (c) => {
  try { return c.json(await visaoDoEncarregado(c.env.DB, c.req.param('projectId')!)); }
  catch (e) { return erro500(c, 'Falha ao montar a visão do encarregado', e); }
});
