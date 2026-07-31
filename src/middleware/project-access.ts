import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { requireProjectAccess } from '../helpers';

// Segmentos literais sob /api/v1/projects/<seg>/... que NÃO são IDs de projeto
// e portanto não devem passar pela checagem de tenant. Atualmente vazio — a única
// rota assim (/projects/dashboard/stats) era duplicata morta de /dashboard/stats e
// foi removida. Se uma rota literal for adicionada aqui no futuro, registre-a nesta
// lista, senão o segmento será tratado como id de projeto e negado para clientes.
const RESERVED_SEGMENTS = new Set<string>([]);

/**
 * Reforça o isolamento multi-tenant para todas as rotas com escopo de projeto
 * (/api/v1/projects/:projectId/*). Deve ser montado APÓS o authMiddleware, que
 * popula c.get('user'). Rotas cujo primeiro segimento é reservado (ex.: dashboard)
 * ou sem projectId são deixadas passar — elas fazem sua própria verificação.
 */
export const projectAccessMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');

  if (user && projectId && !RESERVED_SEGMENTS.has(projectId)) {
    try {
      requireProjectAccess(user, projectId);
    } catch {
      return c.json({ error: 'Forbidden: No access to this project' }, 403);
    }
  }

  await next();
});
