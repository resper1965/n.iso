import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { logAudit, erro500 } from '../helpers';

/**
 * Agentes de IA com acesso a um projeto (MCP remoto). O cliente vê e revoga;
 * o platform_admin também; o consultor revoga os próprios. O isolamento entre
 * projetos vem do projectAccessMiddleware (montado antes).
 */
export const agentesApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const podeVer = (role: string) => ['platform_admin', 'org_admin', 'consultor', 'consultant'].includes(role);

agentesApp.get('/projects/:projectId/agentes', async (c) => {
  const user = c.get('user');
  if (!podeVer(user.role)) return c.json({ error: 'Forbidden' }, 403);
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT ac.id, u.email AS consultor, ac.cliente_mcp, ac.criado_em, ac.ultimo_uso_em, ac.expira_em, ac.revogado_em
         FROM agente_concessoes ac JOIN users u ON u.id = ac.user_id
        WHERE ac.project_id = ? ORDER BY ac.criado_em DESC`
    ).bind(c.req.param('projectId')).all();
    return c.json(results || []);
  } catch (e: any) {
    return erro500(c, 'Falha ao listar agentes', e);
  }
});

agentesApp.post('/projects/:projectId/agentes/:id/revogar', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  try {
    const conc = await c.env.DB.prepare(`SELECT user_id FROM agente_concessoes WHERE id = ? AND project_id = ?`)
      .bind(id, projectId).first<{ user_id: string }>();
    if (!conc) return c.json({ error: 'Acesso de agente não encontrado' }, 404);
    const dono = conc.user_id === user.id && (user.role === 'consultor' || user.role === 'consultant');
    if (!(user.role === 'platform_admin' || user.role === 'org_admin' || dono)) return c.json({ error: 'Forbidden' }, 403);
    await c.env.DB.prepare(`UPDATE agente_concessoes SET revogado_em = datetime('now'), revogado_por = ? WHERE id = ? AND project_id = ? AND revogado_em IS NULL`)
      .bind(user.email, id, projectId).run();
    await logAudit(c.env.DB, 'agente.revogado', user.email, `Acesso de agente ${id} revogado`, '', c.req.header('CF-Connecting-IP') || '', projectId);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao revogar agente', e);
  }
});
