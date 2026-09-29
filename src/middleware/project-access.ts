import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { requireProjectAccess } from '../helpers';

// Segmentos literais sob /api/v1/projects/<seg>/... que NÃO são IDs de projeto
// e portanto não devem passar pela checagem de tenant. Se uma rota literal for
// adicionada aqui no futuro, registre-a nesta lista, senão o segmento será
// tratado como id de projeto e negado para clientes.
//  - `admin`: rotas administrativas (ex.: POST /projects/admin/encrypt-tokens),
//    protegidas por checagem de platform_admin no próprio handler.
const RESERVED_SEGMENTS = new Set<string>(['admin']);

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
