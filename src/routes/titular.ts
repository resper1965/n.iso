import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { lerParametros, removerParametro, salvarParametro } from '../services/parametros-legais';
import { atualizarPedido, criarPedido, lerPedido, listarPedidos } from '../services/titular-pedidos';
import { avaliarRisco, criarIncidente, encerrarIncidente, lerIncidente, listarIncidentes, registrarComunicacao } from '../services/incidentes';
import { listarConsentimentos, registrarConsentimento, revogarConsentimento } from '../services/consentimentos';
import {
  validateBody, consentimentoCriarSchema, incidenteComunicacaoSchema, incidenteCriarSchema, incidenteRiscoSchema, parametroLegalSchema,
  titularPedidoAtualizarSchema, titularPedidoCriarSchema,
} from '../schemas';

type Ctx = { Bindings: Bindings; Variables: Variables };

/**
 * Núcleo do n.privacy, fatia 7: pedido do titular, incidente e consentimento (registro interno). Os apps por projeto são montados em
 * `/api/v1/projects/:projectId/...`, então o `projectAccessMiddleware` já cortou o projeto. Os prazos legais são parâmetros globais,
 * lidos por todos e editados só pelo `platform_admin`.
 */

// ─── Prazos legais (globais) ─────────────────────────────────────────────────────────────────────
export const parametrosLegaisApp = new Hono<Ctx>();
const NEGADO = { error: 'Forbidden: só o administrador da plataforma edita os prazos legais' };

parametrosLegaisApp.get('/', async (c) => c.json(await lerParametros(c.env.DB)));

parametrosLegaisApp.put('/:chave', async (c) => {
  try {
    if (c.get('user')?.role !== 'platform_admin') return c.json(NEGADO, 403);
    const v = await validateBody(c, parametroLegalSchema);
    if (!v.success) return v.response;
    const r = await salvarParametro(c.env.DB, c.get('user').email, c.req.param('chave'), v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar o prazo legal', e); }
});

parametrosLegaisApp.delete('/:chave', async (c) => {
  try {
    if (c.get('user')?.role !== 'platform_admin') return c.json(NEGADO, 403);
    return (await removerParametro(c.env.DB, c.get('user').email, c.req.param('chave'))) ? c.json({ ok: true }) : c.json({ error: 'Parâmetro não definido' }, 404);
  } catch (e) { return erro500(c, 'Falha ao remover o prazo legal', e); }
});

// ─── Pedido do titular ───────────────────────────────────────────────────────────────────────────
export const titularPedidosApp = new Hono<Ctx>();

titularPedidosApp.get('/', async (c) => c.json(await listarPedidos(c.env.DB, c.req.param('projectId')!)));

titularPedidosApp.get('/:id', async (c) => {
  const p = await lerPedido(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'Pedido não encontrado' }, 404);
});

titularPedidosApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, titularPedidoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarPedido(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, protocolo: r.protocolo, prazo_em: r.prazo_em }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o pedido do titular', e); }
});

titularPedidosApp.put('/:id', async (c) => {
  try {
    const v = await validateBody(c, titularPedidoAtualizarSchema);
    if (!v.success) return v.response;
    const r = await atualizarPedido(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o pedido do titular', e); }
});

// ─── Incidente ───────────────────────────────────────────────────────────────────────────────────
export const incidentesApp = new Hono<Ctx>();

incidentesApp.get('/', async (c) => c.json(await listarIncidentes(c.env.DB, c.req.param('projectId')!)));

incidentesApp.get('/:id', async (c) => {
  const i = await lerIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return i ? c.json(i) : c.json({ error: 'Incidente não encontrado' }, 404);
});

incidentesApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, incidenteCriarSchema);
    if (!v.success) return v.response;
    const r = await criarIncidente(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, protocolo: r.protocolo, prazo_anpd_em: r.prazo_anpd_em, prazo_titular_em: r.prazo_titular_em }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o incidente', e); }
});

incidentesApp.put('/:id/risco', async (c) => {
  try {
    const v = await validateBody(c, incidenteRiscoSchema);
    if (!v.success) return v.response;
    const r = await avaliarRisco(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao avaliar o risco do incidente', e); }
});

incidentesApp.post('/:id/comunicacoes', async (c) => {
  try {
    const v = await validateBody(c, incidenteComunicacaoSchema);
    if (!v.success) return v.response;
    const r = await registrarComunicacao(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a comunicação', e); }
});

incidentesApp.post('/:id/encerrar', async (c) => {
  try {
    const r = await encerrarIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao encerrar o incidente', e); }
});

// ─── Consentimento ───────────────────────────────────────────────────────────────────────────────
export const consentimentosApp = new Hono<Ctx>();

consentimentosApp.get('/', async (c) => c.json(await listarConsentimentos(c.env.DB, c.req.param('projectId')!, c.req.query('ropa_id') || undefined)));

consentimentosApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, consentimentoCriarSchema);
    if (!v.success) return v.response;
    const r = await registrarConsentimento(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o consentimento', e); }
});

consentimentosApp.post('/:id/revogar', async (c) => {
  try {
    const r = await revogarConsentimento(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao revogar o consentimento', e); }
});
