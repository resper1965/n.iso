import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';

export const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const sessionId = c.req.header('X-Session-ID') || c.req.header('Authorization')?.replace('Bearer ', '');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized: Missing session token' }, 401);
  }

  const sessionData = await c.env.SESSIONS.get(`session_${sessionId}`);
  if (!sessionData) {
    return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
  }

  try {
    const user = JSON.parse(sessionData);
    
    // Legacy role mapping for backward compatibility
    if (user.role === 'admin') user.role = 'org_admin';
    else if (user.role === 'user') user.role = 'org_user';
    else if (user.role === 'consultant') user.role = 'platform_admin';
    else if (user.role === 'client_admin') user.role = 'client';

    // Global RBAC enforcement for org_user / client roles
    const method = c.req.method.toUpperCase();
    const path = new URL(c.req.url).pathname;

    if ((user.role === 'org_user' || user.role === 'client') && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
      const allowedWritePaths = [
        '/checklist-progress',
        '/evidence',
        '/documents/upload',
        '/policy-acknowledgments',
        '/policies/ack',
        '/mcp/execute',
        '/chat'
      ];
      const isAllowed = allowedWritePaths.some(p => path.includes(p));
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
