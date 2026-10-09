import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit, podeAdministrarOrg } from '../helpers';
import { importarPartes, conciliarResponsaveis } from '../services/partes';
import { conferirPedidosDoDocumento } from './pedidos';
import {
  validateBody, moduloHabilitarSchema, MODULOS, parseModulos, type Modulo,
  departamentoCriarSchema, departamentoAtualizarSchema, parteCriarSchema, parteAtualizarSchema, vinculoCriarSchema,
  MATRIZ_PAPEL_ALVO, type AlvoVinculo,
} from '../schemas';

/**
 * Núcleo do n.privacy, fatia 1.1: módulos, departamentos, partes e vínculos. Montado em
 * `/api/v1/projects/:projectId`, então o `projectAccessMiddleware` já cortou o projeto antes daqui.
 */
export const nucleoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function estadoDosModulos(db: D1Database, projectId: string) {
  const [hab, proj] = await Promise.all([
    db.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind(projectId).all<{ modulo: string }>(),
    db.prepare('SELECT p.org_id, o.modulos_contratados AS contratados FROM projects p LEFT JOIN organizations o ON o.id = p.org_id WHERE p.id = ?')
      .bind(projectId).first<{ org_id: string | null; contratados: string | null }>(),
  ]);
  return { habilitados: hab.results.map((r) => r.modulo), contratados: parseModulos(proj?.contratados), orgId: proj?.org_id ?? null };
}

nucleoApp.get('/modulos', async (c) => {
  const { habilitados, contratados } = await estadoDosModulos(c.env.DB, c.req.param('projectId')!);
  return c.json({ habilitados, contratados });
});

nucleoApp.put('/modulos/:modulo', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const modulo = c.req.param('modulo');
    if (!(MODULOS as readonly string[]).includes(modulo)) return c.json({ error: 'Módulo desconhecido' }, 400);
    const v = await validateBody(c, moduloHabilitarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    const user = c.get('user');
    const est = await estadoDosModulos(db, projectId);
    if (!podeAdministrarOrg(user, est.orgId)) return c.json({ error: 'Forbidden: só o administrador da consultoria habilita módulo' }, 403);
    const ligado = est.habilitados.includes(modulo);
    if (v.data.habilitado) {
      if (!est.contratados.includes(modulo as Modulo)) return c.json({ error: 'Módulo não contratado pela organização' }, 409);
      if (!ligado) {
        await db.prepare('INSERT INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (?, ?, ?)').bind(projectId, modulo, user.email).run();
      }
    } else if (ligado) {
      if (est.habilitados.length === 1) return c.json({ error: 'O projeto precisa de ao menos um módulo' }, 409);
      await db.prepare('DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = ?').bind(projectId, modulo).run();
    }
    await logAudit(db, 'projeto.modulo', user.email, `Módulo ${modulo} ${v.data.habilitado ? 'habilitado' : 'desabilitado'}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao alterar o módulo', e); }
});

const unico = (e: unknown) => String((e as { message?: string })?.message ?? e).includes('UNIQUE');

// ─── departamentos ─────────────────────────────────────────────────────────
nucleoApp.get('/departamentos', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM departamentos WHERE project_id = ? ORDER BY nome').bind(c.req.param('projectId')!).all();
  return c.json(r.results);
});

nucleoApp.post('/departamentos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare('INSERT INTO departamentos (id, project_id, nome) VALUES (?, ?, ?)').bind(id, projectId, v.data.nome).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.criado', c.get('user').email, `Departamento ${v.data.nome} criado`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o departamento', e); }
});

nucleoApp.put('/departamentos/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoAtualizarSchema);
    if (!v.success) return v.response;
    try {
      const r = await c.env.DB.prepare(
        `UPDATE departamentos SET nome = COALESCE(?, nome), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
      ).bind(v.data.nome ?? null, v.data.status ?? null, c.req.param('id'), projectId).run();
      if (!r.meta.changes) return c.json({ error: 'Departamento não encontrado' }, 404);
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.atualizado', c.get('user').email, `Departamento ${c.req.param('id')} atualizado`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o departamento', e); }
});

// ─── partes ────────────────────────────────────────────────────────────────
nucleoApp.get('/partes', async (c) => {
  const { tipo, status } = c.req.query();
  const where = ['project_id = ?'];
  const binds: string[] = [c.req.param('projectId')!];
  if (tipo === 'pessoa' || tipo === 'organizacao') { where.push('tipo = ?'); binds.push(tipo); }
  if (status === 'ativa' || status === 'inativa') { where.push('status = ?'); binds.push(status); }
  const r = await c.env.DB.prepare(`SELECT * FROM partes WHERE ${where.join(' AND ')} ORDER BY nome`).bind(...binds).all();
  return c.json(r.results);
});

nucleoApp.get('/partes/:id', async (c) => {
  const projectId = c.req.param('projectId')!;
  const parte = await c.env.DB.prepare('SELECT * FROM partes WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  if (!parte) return c.json({ error: 'Parte não encontrada' }, 404);
  const vinculos = await c.env.DB.prepare('SELECT id, papel, alvo_tipo, alvo_id, created_at FROM parte_vinculos WHERE parte_id = ? AND project_id = ? ORDER BY created_at')
    .bind(c.req.param('id'), projectId).all();
  return c.json({ ...parte, vinculos: vinculos.results });
});

nucleoApp.post('/partes', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, parteCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, projectId, v.data.tipo, v.data.nome, v.data.email?.toLowerCase() ?? null).run();
    await logAudit(c.env.DB, 'parte.criada', c.get('user').email, `Parte ${v.data.tipo} criada`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a parte', e); }
});

// ─── importar e conciliar (sob demanda, por projeto, repetíveis) ───────────
nucleoApp.post('/partes/importar', async (c) => {
  try {
    return c.json({ ok: true, ...(await importarPartes(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao importar as partes', e); }
});

nucleoApp.post('/partes/conciliar', async (c) => {
  try {
    return c.json({ ok: true, ...(await conciliarResponsaveis(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao conciliar os responsáveis', e); }
});

nucleoApp.put('/partes/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const id = c.req.param('id');
    const v = await validateBody(c, parteAtualizarSchema);
    if (!v.success) return v.response;
    const atual = await c.env.DB.prepare('SELECT nome, email, status FROM partes WHERE id = ? AND project_id = ?')
      .bind(id, projectId).first<{ nome: string; email: string | null; status: string }>();
    if (!atual) return c.json({ error: 'Parte não encontrada' }, 404);
    const email = v.data.email === undefined ? atual.email : (v.data.email?.toLowerCase() ?? null);
    await c.env.DB.prepare('UPDATE partes SET nome = ?, email = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?')
      .bind(v.data.nome ?? atual.nome, email, v.data.status ?? atual.status, id, projectId).run();
    await logAudit(c.env.DB, 'parte.atualizada', c.get('user').email, `Parte ${id} atualizada`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a parte', e); }
});

// ─── vínculos ──────────────────────────────────────────────────────────────
/** `tratamento` é o registro do RoPA (`ropa_records`), que não tem rename (plano da fatia 4, ruling 1). */
async function conferirAlvo(db: D1Database, projectId: string, tipo: AlvoVinculo, id: string): Promise<'ok' | 'inexistente' | 'indisponivel'> {
  if (tipo === 'projeto') return id === projectId ? 'ok' : 'inexistente';
  const tabela = tipo === 'departamento' ? 'departamentos' : tipo === 'parte' ? 'partes' : tipo === 'item' ? 'itens' : tipo === 'tratamento' ? 'ropa_records' : null;
  if (!tabela) return 'indisponivel';
  // `tabela` sai das constantes acima, nunca da requisição; o id vai por bind.
  return (await db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND project_id = ?`).bind(id, projectId).first()) ? 'ok' : 'inexistente';
}

nucleoApp.post('/partes/:id/vinculos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const parteId = c.req.param('id');
    const v = await validateBody(c, vinculoCriarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    if (!(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(parteId, projectId).first())) return c.json({ error: 'Parte não encontrada' }, 404);
    const { papel, alvo_tipo, alvo_id } = v.data;
    if (!MATRIZ_PAPEL_ALVO[alvo_tipo].includes(papel)) return c.json({ error: `O papel ${papel} não se aplica a ${alvo_tipo}` }, 400);
    const alvo = await conferirAlvo(db, projectId, alvo_tipo, alvo_id);
    if (alvo === 'indisponivel') return c.json({ error: `O alvo ${alvo_tipo} ainda não existe nesta versão` }, 400);
    if (alvo === 'inexistente') return c.json({ error: 'Alvo inexistente ou de outro projeto' }, 400);
    const id = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, projectId, parteId, papel, alvo_tipo, alvo_id).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Esse vínculo já existe' }, 409);
      throw e;
    }
    await logAudit(db, 'parte.vinculada', c.get('user').email, `Parte ${parteId}: ${papel} em ${alvo_tipo}`, '', '', projectId);
    // As partes do tratamento entram no conteúdo congelado do pedido de aprovação (fatia 4.3).
    if (alvo_tipo === 'tratamento') await conferirPedidosDoDocumento(c, 'tratamento', alvo_id, projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao vincular a parte', e); }
});

nucleoApp.delete('/partes/:id/vinculos/:vinculoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const alvo = await c.env.DB.prepare('SELECT alvo_tipo, alvo_id FROM parte_vinculos WHERE id = ? AND parte_id = ? AND project_id = ?')
      .bind(c.req.param('vinculoId'), c.req.param('id'), projectId).first<{ alvo_tipo: string; alvo_id: string }>();
    const r = await c.env.DB.prepare('DELETE FROM parte_vinculos WHERE id = ? AND parte_id = ? AND project_id = ?')
      .bind(c.req.param('vinculoId'), c.req.param('id'), projectId).run();
    if (!r.meta.changes) return c.json({ error: 'Vínculo não encontrado' }, 404);
    if (alvo?.alvo_tipo === 'tratamento') await conferirPedidosDoDocumento(c, 'tratamento', alvo.alvo_id, projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o vínculo', e); }
});
