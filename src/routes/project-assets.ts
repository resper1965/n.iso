import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, erro500 } from '../helpers';
import { listarAtivos, lerAtivo, criarAtivo, atualizarAtivo, removerAtivo, CAMPOS_ATIVO, type CamposAtivo } from '../services/itens';
import { validateBody, assetSchema, assetUpdateSchema } from '../schemas';

// Rotas de ativos dentro do projeto (/api/v1/projects/:id/assets*). Extraídas de
// routes/projects.ts para reduzir aquele arquivo. Registradas no MESMO projectsApp
// via registerAssetRoutes(app) — é um move puro, sem mudança de rota nem de
// middleware (o projectAccessMiddleware continua valendo por estarem sob /projects).

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
    return c.json({ ok: true, assets: await listarAtivos(c.env.DB, projectId) });
  });

  app.post('/:id/assets', async (c) => {
    try {
      const projectId = c.req.param('id');
      const user = c.get('user');
      if (user && (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== projectId))) {
        return c.json({ error: 'Forbidden: Cannot create asset in this project' }, 403);
      }
      const valid = await validateBody(c, assetSchema);
      if (!valid.success) return valid.response;
      const id = await criarAtivo(c.env.DB, projectId, valid.data as CamposAtivo & { name: string });

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
      const valid = await validateBody(c, assetUpdateSchema);
      if (!valid.success) return valid.response;
      const body = valid.data as CamposAtivo;
      const campos: CamposAtivo = {};
      for (const f of CAMPOS_ATIVO) if (body[f] !== undefined) campos[f] = body[f];
      if (!Object.keys(campos).length) return c.json({ error: 'Nenhum campo para atualizar' }, 400);

      const changes = await atualizarAtivo(c.env.DB, assetId, projectId, campos);
      if (!changes) return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);

      await logAudit(c.env.DB, 'asset.updated', user?.email || 'system', `Ativo ${assetId} atualizado no projeto ${projectId}`, '', '', projectId);
      return c.json({ ok: true, asset: await lerAtivo(c.env.DB, assetId) });
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
      if (!(await removerAtivo(c.env.DB, assetId, projectId))) {
        return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);
      }

      await logAudit(c.env.DB, 'asset.removed', user?.email || 'system', `Ativo ${assetId} removido do projeto ${projectId}`, '', '', projectId);
      return c.json({ ok: true });
    } catch (e: any) {
      return erro500(c, 'Falha ao remover ativo', e);
    }
  });
}
