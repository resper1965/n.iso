import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, erro500 } from '../helpers';

// Rotas de ativos dentro do projeto (/api/v1/projects/:id/assets*). Extraídas de
// routes/projects.ts para reduzir aquele arquivo. Registradas no MESMO projectsApp
// via registerAssetRoutes(app) — é um move puro, sem mudança de rota nem de
// middleware (o projectAccessMiddleware continua valendo por estarem sob /projects).

const ASSET_UPDATABLE_FIELDS = [
  'name', 'type', 'category', 'classification', 'criticality', 'description',
  'owner', 'location', 'confidentiality_rating', 'integrity_rating', 'availability_rating',
] as const;

export function registerAssetRoutes(app: Hono<{ Bindings: Bindings; Variables: Variables }>) {
  app.get('/:id/assets', async (c) => {
    const projectId = c.req.param('id');
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (user.client_project_id && user.client_project_id !== projectId) {
        return c.json({ error: 'Forbidden: Access denied to assets of another project' }, 403);
      }
    }
    // Ativos removidos (soft delete) ficam de fora da listagem padrão.
    // COALESCE porque `status` é nullable: `status != 'Removido'` é NULL (falso)
    // para linhas antigas sem status, e elas sumiriam da listagem.
    const result = await c.env.DB.prepare(
      "SELECT * FROM assets WHERE project_id = ? AND COALESCE(status, '') != 'Removido' ORDER BY created_at DESC"
    ).bind(projectId).all();
    return c.json({ ok: true, assets: result.results });
  });

  app.post('/:id/assets', async (c) => {
    try {
      const projectId = c.req.param('id');
      const user = c.get('user');
      if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
        return c.json({ error: 'Forbidden: Cannot create asset in this project' }, 403);
      }
      const body = await c.req.json<any>();
      const id = genId();
      await c.env.DB.prepare(
        `INSERT INTO assets (id, project_id, name, type, category, owner, criticality, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, projectId, body.name, body.type, body.category || 'Hardware', body.owner || '', body.criticality || 'Medium', body.description || '').run();

      await logAudit(c.env.DB, 'asset.created', user?.email || 'system', `Asset ${id} created for project ${projectId}`, '', '', projectId);
      return c.json({ ok: true, id }, 201);
    } catch (e: any) {
      return erro500(c, 'Falha ao criar ativo', e);
    }
  });

  app.put('/:id/assets/:assetId', async (c) => {
    try {
      const projectId = c.req.param('id');
      const assetId = c.req.param('assetId');
      const user = c.get('user');
      if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
        return c.json({ error: 'Forbidden: Cannot update asset in this project' }, 403);
      }
      const body = await c.req.json<any>();

      const updates: string[] = [];
      const values: any[] = [];
      for (const field of ASSET_UPDATABLE_FIELDS) {
        if (body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(body[field]);
        }
      }
      if (!updates.length) return c.json({ error: 'Nenhum campo para atualizar' }, 400);
      updates.push("updated_at = datetime('now')");
      values.push(assetId, projectId);

      const result = await c.env.DB.prepare(
        `UPDATE assets SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`
      ).bind(...values).run();
      if (!result.meta?.changes) {
        return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);
      }

      await logAudit(c.env.DB, 'asset.updated', user?.email || 'system', `Ativo ${assetId} atualizado no projeto ${projectId}`, '', '', projectId);
      const updated = await c.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(assetId).first();
      return c.json({ ok: true, asset: updated });
    } catch (e: any) {
      return erro500(c, 'Falha ao atualizar ativo', e);
    }
  });

  app.delete('/:id/assets/:assetId', async (c) => {
    try {
      const projectId = c.req.param('id');
      const assetId = c.req.param('assetId');
      const user = c.get('user');
      if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
        return c.json({ error: 'Forbidden: Cannot remove asset from this project' }, 403);
      }

      // Soft delete: plataforma de GRC precisa preservar o histórico do ativo
      // para trilha de auditoria, então não há DELETE físico aqui. Remover um
      // ativo já removido também responde 404 (não é idempotente de propósito,
      // pra deixar claro no cliente que não havia nada a remover).
      const result = await c.env.DB.prepare(
        "UPDATE assets SET status = 'Removido', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status != 'Removido'"
      ).bind(assetId, projectId).run();
      if (!result.meta?.changes) {
        return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);
      }

      await logAudit(c.env.DB, 'asset.removed', user?.email || 'system', `Ativo ${assetId} removido do projeto ${projectId}`, '', '', projectId);
      return c.json({ ok: true });
    } catch (e: any) {
      return erro500(c, 'Falha ao remover ativo', e);
    }
  });
}
