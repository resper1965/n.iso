import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit, podeAdministrarOrg } from '../helpers';
import { validateBody, moduloHabilitarSchema, MODULOS, parseModulos, type Modulo } from '../schemas';

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
