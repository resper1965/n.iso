import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';

export const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
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
    const user = JSON.parse(sessionData);
    
    // Legacy role mapping for backward compatibility.
    // Keep consistent with the login handler (routes/auth.ts): 'admin' is a
    // platform-level admin, not a project-scoped org_admin.
    if (user.role === 'admin') user.role = 'platform_admin';
    else if (user.role === 'user') user.role = 'org_user';
    else if (user.role === 'consultant') user.role = 'platform_admin';
    else if (user.role === 'client_admin') user.role = 'client';

    // Global RBAC enforcement for org_user / client roles
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
  } catch (e) {
    return c.json({ error: 'Unauthorized: Malformed session data' }, 401);
  }
});
