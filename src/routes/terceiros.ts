import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { definirTipo, desligarDocumento, lerTerceiro, ligarDocumento, listarTerceiros, registrarAvaliacao, type PapelDocumento } from '../services/terceiros';
import { validateBody, avaliacaoTerceiroSchema, terceiroDocumentoSchema, terceiroTipoSchema } from '../schemas';

/**
 * Núcleo do n.privacy, fatia 6: terceiros tipificados. Montado em `/api/v1/projects/:projectId/terceiros`, então o
 * `projectAccessMiddleware` já cortou o projeto antes daqui. O tipo define o método; a situação é derivada da validade.
 */
export const terceirosApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

terceirosApp.get('/', async (c) => c.json(await listarTerceiros(c.env.DB, c.req.param('projectId')!)));

terceirosApp.get('/:parteId', async (c) => {
  const t = await lerTerceiro(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'));
  return t ? c.json(t) : c.json({ error: 'Terceiro não encontrado' }, 404);
});

terceirosApp.put('/:parteId/tipo', async (c) => {
  try {
    const v = await validateBody(c, terceiroTipoSchema);
    if (!v.success) return v.response;
    const r = await definirTipo(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data.terceiro_tipo);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao definir o tipo do terceiro', e); }
});

terceirosApp.post('/:parteId/avaliacoes', async (c) => {
  try {
    const v = await validateBody(c, avaliacaoTerceiroSchema);
    if (!v.success) return v.response;
    const r = await registrarAvaliacao(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, metodo: r.metodo }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a avaliação', e); }
});

terceirosApp.post('/:parteId/documentos', async (c) => {
  try {
    const v = await validateBody(c, terceiroDocumentoSchema);
    if (!v.success) return v.response;
    const r = await ligarDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data.documento_id, v.data.papel);
    return r.ok ? c.json({ ok: true }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao ligar o documento', e); }
});

terceirosApp.delete('/:parteId/documentos/:documentoId', async (c) => {
  try {
    const papel = (c.req.query('papel') || 'dpa') as PapelDocumento;
    if (!['dpa', 'contrato', 'outro'].includes(papel)) return c.json({ error: 'papel deve ser dpa, contrato ou outro' }, 400);
    const ok = await desligarDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, c.req.param('documentoId'), papel);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Ligação não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao desligar o documento', e); }
});
