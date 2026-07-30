import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { sha256Hex } from '../helpers';

/**
 * Resolve o usuário a partir de uma API key (X-API-Key). Retorna o contexto de
 * usuário (escopado ao projeto da chave, papel read-only `client`) ou uma Response
 * de erro. A chave só é aceita se existir, estiver Active e não expirada.
 */
async function resolveApiKeyUser(c: any, apiKey: string): Promise<Variables['user'] | Response> {
  const keyHash = await sha256Hex(apiKey);
  const row = await c.env.DB.prepare(
    'SELECT id, project_id, permissions, status, expires_at FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first();

  if (!row || row.status !== 'Active' || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return c.json({ error: 'Unauthorized: Invalid or expired API key' }, 401);
  }

  // Enforce permissions: chaves 'read' (o default) não podem executar mutações.
  const method = c.req.method.toUpperCase();
  const writeCapable = row.permissions === 'write' || row.permissions === 'admin';
  if (!writeCapable && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    return c.json({ error: 'Forbidden: read-only API key cannot perform write operations' }, 403);
  }

  // last_used_at é best-effort: não deve derrubar a request se falhar.
  await c.env.DB.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run().catch(() => {});

  // API keys entram como papel `client` escopado ao projeto: herdam o mesmo
  // isolamento de tenant e o write-guard read-only já aplicados abaixo.
  return {
    id: `apikey:${row.id}`,
    email: `apikey:${row.id}`,
    role: 'client',
    client_project_id: row.project_id,
  };
}

export const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  let user: Variables['user'];

  const apiKey = c.req.header('X-API-Key');
  if (apiKey) {
    const resolved = await resolveApiKeyUser(c, apiKey);
    if (resolved instanceof Response) return resolved;
    user = resolved;
  } else {
    const sessionId =
      c.req.header('X-Session-ID') ||
      c.req.header('Authorization')?.replace('Bearer ', '') ||
      c.req.query('token') ||
      c.req.query('sessionId') ||
      c.req.query('session_id') ||
      c.req.query('session');

    if (!sessionId) {
      return c.json({ error: 'Unauthorized: Missing session token' }, 401);
    }

    const sessionData = (await c.env.SESSIONS.get(`session_${sessionId}`)) || (await c.env.SESSIONS.get(sessionId));
    if (!sessionData) {
      return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
    }

    try {
      user = JSON.parse(sessionData);
    } catch (e) {
      return c.json({ error: 'Unauthorized: Malformed session data' }, 401);
    }

    // Legacy role mapping for backward compatibility.
    // Keep consistent with the login handler (routes/auth.ts): 'admin' is a
    // platform-level admin, not a project-scoped org_admin.
    if (user.role === 'admin') user.role = 'platform_admin';
    else if (user.role === 'user') user.role = 'org_user';
    else if (user.role === 'consultant') user.role = 'platform_admin';
    else if (user.role === 'client_admin') user.role = 'client';
  }

  // Global RBAC enforcement for org_user / client roles (aplica a sessões E API keys).
  const method = c.req.method.toUpperCase();
  const path = new URL(c.req.url).pathname;

  if ((user.role === 'org_user' || user.role === 'client') && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    // Allow-list preciso (método + rota) das escritas permitidas a papéis
    // read-only. Matching por sufixo/regex — nunca substring — para que
    // DELETE de evidência e ações de aprovação/assinatura/avaliação fiquem
    // sempre bloqueadas (antes vazavam via path.includes('/evidence')).
    const allowedWrites: Array<{ methods: string[]; test: (p: string) => boolean }> = [
      { methods: ['PUT', 'POST'], test: p => p.endsWith('/checklist-progress') },
      { methods: ['POST'], test: p => p.endsWith('/evidence/upload') },
      { methods: ['PUT'], test: p => /\/evidence\/[^/]+\/content$/.test(p) },
      { methods: ['POST'], test: p => p.endsWith('/documents/upload') },
      { methods: ['POST', 'PUT'], test: p => p.endsWith('/policy-acknowledgments') },
      { methods: ['POST', 'PUT'], test: p => p.endsWith('/policies/ack') },
      { methods: ['POST'], test: p => p.endsWith('/mcp/execute') },
      { methods: ['POST'], test: p => p.endsWith('/chat') },
    ];
    const isAllowed = allowedWrites.some(a => a.methods.includes(method) && a.test(path));
    if (!isAllowed) {
      return c.json({ error: 'Forbidden: Read-only role cannot perform write operations' }, 403);
    }
  }

  c.set('user', user);
  await next();
});
