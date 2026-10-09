import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { alvoDaPublicacao, atualizarDocumento, cienciasDoDocumento, criarDocumento, descartarRascunho, importarDocumentos, lerDocumento, listarDocumentos, marcarRevisado, publicarVersao, salvarRascunho } from '../services/documentos';
import { aplicarTextoNoControle } from '../services/politica-escrita';
import { atualizarExcecao, criarExcecao, listarExcecoes, revogarExcecao } from '../services/excecoes';
import { conferirPedidosDoDocumento } from './pedidos';
import { validateBody, documentoAtualizarSchema, documentoCriarSchema, excecaoAtualizarSchema, excecaoCriarSchema, versaoSalvarSchema } from '../schemas';

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

// ─── Exceções a documentos (fatia 3.5) ───────────────────────────────────────────────────────────────

documentosApp.get('/documentos/:id/excecoes', async (c) => {
  const r = await listarExcecoes(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'Documento não encontrado' }, 404);
});

documentosApp.post('/documentos/:id/excecoes', async (c) => {
  try {
    const v = await validateBody(c, excecaoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarExcecao(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a exceção', e); }
});

documentosApp.put('/documentos/:id/excecoes/:exId', async (c) => {
  try {
    const v = await validateBody(c, excecaoAtualizarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await atualizarExcecao(c.env.DB, projectId, c.req.param('id'), c.req.param('exId'), c.get('user').email, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Escopo, motivo e prazo são o conteúdo congelado do pedido: o pedido aberto é conferido (e substituído).
    await conferirPedidosDoDocumento(c, 'excecao', c.req.param('exId'), projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a exceção', e); }
});

documentosApp.post('/documentos/:id/excecoes/:exId/revogar', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const r = await revogarExcecao(c.env.DB, projectId, c.req.param('id'), c.req.param('exId'), c.get('user').email);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Revogada, a exceção sai do conteúdo conferível: o pedido aberto vira `cancelado`.
    await conferirPedidosDoDocumento(c, 'excecao', c.req.param('exId'), projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao revogar a exceção', e); }
});

documentosApp.get('/documentos/:id/ciencias', async (c) => {
  const r = await cienciasDoDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'Documento não encontrado' }, 404);
});

documentosApp.post('/documentos', async (c) => {
  try {
    const v = await validateBody(c, documentoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarDocumento(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao criar o documento', e); }
});

documentosApp.put('/documentos/:id', async (c) => {
  try {
    const v = await validateBody(c, documentoAtualizarSchema);
    if (!v.success) return v.response;
    // Aposentar ou reativar é decisão humana; o agente pode reorganizar (título, tipo, pai, dono), não mudar o status.
    if (v.data.status !== undefined && c.get('user')?.agente === true) return c.json({ error: 'Forbidden: mudar o status do documento é ato humano, pela interface' }, 403);
    const projectId = c.req.param('projectId')!;
    const r = await atualizarDocumento(c.env.DB, projectId, c.req.param('id'), c.get('user').email, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // O título é conteúdo congelado no pedido de ciência: mudou, o pedido aberto é conferido (e substituído).
    if (r.tituloMudou) await conferirPedidosDoDocumento(c, 'documento', c.req.param('id'), projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o documento', e); }
});

documentosApp.post('/documentos/:id/revisar', async (c) => {
  try {
    const r = await marcarRevisado(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao marcar o documento como revisado', e); }
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
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user').email;
    const r = await publicarVersao(c.env.DB, projectId, c.req.param('id'), numero, ator);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Versão nova vigente: os pedidos de ciência abertos do documento são conferidos (substituídos, se o conteúdo mudou).
    await conferirPedidosDoDocumento(c, 'documento', c.req.param('id'), projectId);
    // Documento que veio de um controle: publicar tem o efeito de uma edição manual da política (texto no controle,
    // aprovações a zero, pedidos conferidos, versão no histórico). Até a 3.3 o controle é a fonte da ciência.
    const alvo = await alvoDaPublicacao(c.env.DB, projectId, c.req.param('id'), numero);
    if (alvo?.controle) await aplicarTextoNoControle(c, projectId, alvo.controle, alvo.texto, ator);
    return c.json({ ok: true, numero: r.numero });
  } catch (e) { return erro500(c, 'Falha ao publicar a versão', e); }
});

documentosApp.delete('/documentos/:id/rascunho', async (c) => {
  try {
    const r = await descartarRascunho(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao descartar o rascunho', e); }
});
