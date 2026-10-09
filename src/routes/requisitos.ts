import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit } from '../helpers';
import {
  definirRequisitosDaEvidencia, definirRequisitosDoDocumento, lacunasDaFonte, lerRequisito, ligarControles, listarFontes, listarRequisitos,
  requisitosDaEvidencia, requisitosDoDocumento, semearCatalogo, veMapeamentoProposto,
} from '../services/requisitos';
import { documentoRequisitosSchema, evidenciaValidadeSchema, mapeamentoSchema, requisitoAtualizarSchema, validateBody } from '../schemas';
import { definirValidade } from '../services/evidencia-validade';

type Ctx = { Bindings: Bindings; Variables: Variables };

/**
 * Núcleo do n.privacy, fatia 2: catálogo de requisitos. Global (sem project_id): todos leem; só o `platform_admin`
 * escreve, com trilha. O cliente nunca recebe mapeamento `proposto` (spec 4.5). O agente só lê (`FORA_DO_AGENTE`).
 */
export const requisitosApp = new Hono<Ctx>();

const soAdmin = (c: { get: (k: 'user') => Variables['user'] }) => c.get('user')?.role === 'platform_admin';
const NEGADO = { error: 'Forbidden: só o administrador da plataforma edita o catálogo de requisitos' };

requisitosApp.get('/fontes', async (c) => c.json(await listarFontes(c.env.DB)));

requisitosApp.get('/', async (c) => c.json(await listarRequisitos(c.env.DB, c.req.query('fonte') || undefined)));

requisitosApp.post('/semear', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const r = await semearCatalogo(c.env.DB);
    const ligados = await ligarControles(c.env.DB);
    await logAudit(c.env.DB, 'requisitos.semear', c.get('user').email, `Seed do catálogo: ${r.fontes} fontes e ${r.requisitos} requisitos criados, ${ligados} controles ligados`);
    return c.json({ ok: true, ...r, controles_ligados: ligados });
  } catch (e) { return erro500(c, 'Falha ao semear o catálogo de requisitos', e); }
});

// ─── Mapeamentos (declaradas antes de `/:id`, que casaria qualquer segmento) ───────────────────────────

const existe = async (db: D1Database, id: string) => !!(await db.prepare('SELECT 1 FROM requisitos WHERE id = ?').bind(id).first());

requisitosApp.post('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, mapeamentoSchema);
    if (!v.success) return v.response;
    const m = v.data;
    if (!(await existe(c.env.DB, m.de_id)) || !(await existe(c.env.DB, m.para_id))) return c.json({ error: 'Requisito não encontrado' }, 404);
    try {
      await c.env.DB.prepare(
        `INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em, nota) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(m.de_id, m.para_id, m.tipo, m.estado, m.validado_por ?? null, m.validado_em ?? null, m.nota ?? null).run();
    } catch (e) {
      if (/UNIQUE|PRIMARY KEY/i.test(String((e as Error)?.message))) return c.json({ error: 'Esse mapeamento já existe' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${m.de_id} → ${m.para_id} (${m.tipo}, ${m.estado}) criado`);
    return c.json({ ok: true }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o mapeamento', e); }
});

requisitosApp.put('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, mapeamentoSchema);
    if (!v.success) return v.response;
    const m = v.data;
    const r = await c.env.DB.prepare(
      `UPDATE requisito_mapeamentos SET tipo = ?, estado = ?, validado_por = ?, validado_em = ?, nota = ? WHERE de_id = ? AND para_id = ?`
    ).bind(m.tipo, m.estado, m.validado_por ?? null, m.validado_em ?? null, m.nota ?? null, m.de_id, m.para_id).run();
    if (!r.meta.changes) return c.json({ error: 'Mapeamento não encontrado' }, 404);
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${m.de_id} → ${m.para_id} alterado para ${m.tipo}, ${m.estado}`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o mapeamento', e); }
});

requisitosApp.delete('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const de = c.req.query('de'), para = c.req.query('para');
    if (!de || !para) return c.json({ error: 'Informe de e para' }, 400);
    const r = await c.env.DB.prepare('DELETE FROM requisito_mapeamentos WHERE de_id = ? AND para_id = ?').bind(de, para).run();
    if (!r.meta.changes) return c.json({ error: 'Mapeamento não encontrado' }, 404);
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${de} → ${para} removido`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o mapeamento', e); }
});

// ─── Requisito ───────────────────────────────────────────────────────────────────────────────────────

requisitosApp.get('/:id', async (c) => {
  const r = await lerRequisito(c.env.DB, c.req.param('id'), veMapeamentoProposto(c.get('user')?.role));
  return r ? c.json(r) : c.json({ error: 'Requisito não encontrado' }, 404);
});

requisitosApp.put('/:id', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, requisitoAtualizarSchema);
    if (!v.success) return v.response;
    const id = c.req.param('id');
    const antes = await c.env.DB.prepare('SELECT titulo FROM requisitos WHERE id = ?').bind(id).first<{ titulo: string }>();
    if (!antes) return c.json({ error: 'Requisito não encontrado' }, 404);
    await c.env.DB.prepare(`UPDATE requisitos SET titulo = ?, updated_at = datetime('now') WHERE id = ?`).bind(v.data.titulo, id).run();
    await logAudit(c.env.DB, 'requisitos.titulo', c.get('user').email, `Requisito ${id}: título "${antes.titulo}" → "${v.data.titulo}"`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o requisito', e); }
});

requisitosApp.delete('/:id', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const id = c.req.param('id');
    if (!(await existe(c.env.DB, id))) return c.json({ error: 'Requisito não encontrado' }, 404);
    const uso = await c.env.DB.prepare(
      `SELECT (SELECT count(*) FROM documento_requisitos WHERE requisito_id = ?1) AS documentos,
              (SELECT count(*) FROM compliance_controls WHERE requisito_id = ?1) AS controles,
              (SELECT count(*) FROM requisitos WHERE pai_id = ?1) AS filhos`
    ).bind(id).first<{ documentos: number; controles: number; filhos: number }>();
    if (uso && (uso.documentos || uso.controles || uso.filhos)) {
      return c.json({ error: 'Requisito em uso: há documento, controle ou requisito filho apontando para ele', ...uso }, 409);
    }
    await c.env.DB.prepare('DELETE FROM requisitos WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'requisitos.remover', c.get('user').email, `Requisito ${id} removido`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o requisito', e); }
});

// ─── Por projeto (montado em /api/v1/projects/:projectId) ──────────────────────────────────────────────

export const projetoRequisitosApp = new Hono<Ctx>();

projetoRequisitosApp.get('/documentos/:id/requisitos', async (c) => {
  const projectId = c.req.param('projectId')!;
  const doc = await c.env.DB.prepare('SELECT id FROM documentos WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  return doc ? c.json(await requisitosDoDocumento(c.env.DB, projectId, c.req.param('id'))) : c.json({ error: 'Documento não encontrado' }, 404);
});

projetoRequisitosApp.put('/documentos/:id/requisitos', async (c) => {
  try {
    const v = await validateBody(c, documentoRequisitosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirRequisitosDoDocumento(c.env.DB, projectId, c.req.param('id'), v.data.requisitos);
    if (!r) return c.json({ error: 'Documento não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Requisito não encontrado', desconhecidos: r.desconhecidos }, 400);
    await logAudit(c.env.DB, 'documento.requisitos', c.get('user').email, `Documento ${c.req.param('id')}: ${r.total} requisitos ligados`, '', '', projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os requisitos ao documento', e); }
});

projetoRequisitosApp.get('/evidence/:evidenceId/requisitos', async (c) => {
  const projectId = c.req.param('projectId')!;
  const ev = await c.env.DB.prepare('SELECT valido_ate FROM evidence WHERE id = ? AND project_id = ?').bind(c.req.param('evidenceId'), projectId).first<{ valido_ate: string | null }>();
  if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);
  return c.json({ valido_ate: ev.valido_ate, requisitos: await requisitosDaEvidencia(c.env.DB, projectId, c.req.param('evidenceId')) });
});

projetoRequisitosApp.put('/evidence/:evidenceId/requisitos', async (c) => {
  try {
    const v = await validateBody(c, documentoRequisitosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirRequisitosDaEvidencia(c.env.DB, projectId, c.req.param('evidenceId'), v.data.requisitos);
    if (!r) return c.json({ error: 'Evidência não encontrada' }, 404);
    if (!r.ok) return c.json({ error: 'Requisito não encontrado', desconhecidos: r.desconhecidos }, 400);
    await logAudit(c.env.DB, 'evidencia.requisitos', c.get('user').email, `Evidência ${c.req.param('evidenceId')}: ${r.total} requisitos ligados`, '', '', projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os requisitos à evidência', e); }
});

projetoRequisitosApp.put('/evidence/:evidenceId/validade', async (c) => {
  try {
    const v = await validateBody(c, evidenciaValidadeSchema);
    if (!v.success) return v.response;
    const r = await definirValidade(c.env.DB, c.req.param('projectId')!, c.req.param('evidenceId'), c.get('user').email, v.data.valido_ate);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao definir a validade da evidência', e); }
});

projetoRequisitosApp.get('/requisitos/lacunas', async (c) => {
  try {
    const fonte = c.req.query('fonte') || 'lgpd';
    const itens = await lacunasDaFonte(c.env.DB, c.req.param('projectId')!, fonte);
    const total = (s: string) => itens.filter((i) => i.situacao === s).length;
    return c.json({ fonte, resumo: { total: itens.length, cobertos: total('coberto'), parciais: total('parcial'), lacunas: total('lacuna') }, itens });
  } catch (e) { return erro500(c, 'Falha ao calcular as lacunas', e); }
});
