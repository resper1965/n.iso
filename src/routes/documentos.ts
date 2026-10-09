import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { criarDocumento, importarDocumentos, lerDocumento, listarDocumentos, publicarVersao, salvarRascunho } from '../services/documentos';
import { validateBody, documentoCriarSchema, versaoSalvarSchema } from '../schemas';

/**
 * Núcleo do n.privacy, fatia 3.1: documentos e versões. Montado em `/api/v1/projects/:projectId`, então o
 * `projectAccessMiddleware` já cortou o projeto antes daqui. Não mexe no fluxo atual de políticas.
 */
export const documentosApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

documentosApp.get('/documentos', async (c) => c.json(await listarDocumentos(c.env.DB, c.req.param('projectId')!)));

documentosApp.get('/documentos/:id', async (c) => {
  const d = await lerDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return d ? c.json(d) : c.json({ error: 'Documento não encontrado' }, 404);
});

documentosApp.post('/documentos', async (c) => {
  try {
    const v = await validateBody(c, documentoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarDocumento(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao criar o documento', e); }
});

// Importa as políticas que já existem (sob demanda, por projeto, repetível). Antes de qualquer `/:id`.
documentosApp.post('/documentos/importar', async (c) => {
  try {
    return c.json({ ok: true, ...(await importarDocumentos(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao importar os documentos', e); }
});

documentosApp.post('/documentos/:id/versoes', async (c) => {
  try {
    const v = await validateBody(c, versaoSalvarSchema);
    if (!v.success) return v.response;
    const r = await salvarRascunho(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data.texto, v.data.origem);
    return r.ok ? c.json({ ok: true, numero: r.numero }, r.criada ? 201 : 200) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar a versão', e); }
});

documentosApp.post('/documentos/:id/versoes/:numero/publicar', async (c) => {
  try {
    const numero = Number(c.req.param('numero'));
    if (!Number.isInteger(numero) || numero < 1) return c.json({ error: 'Número de versão inválido' }, 400);
    const r = await publicarVersao(c.env.DB, c.req.param('projectId')!, c.req.param('id'), numero, c.get('user').email);
    return r.ok ? c.json({ ok: true, numero: r.numero }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao publicar a versão', e); }
});
