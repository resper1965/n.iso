import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { sha256Hex, sessionRevoked } from '../helpers';

/**
 * Resolve o usuário a partir de uma API key (X-API-Key). Retorna o contexto de
 * usuário (escopado ao projeto da chave, papel read-only `client`) ou uma Response
 * de erro. A chave só é aceita se existir, estiver Active e não expirada.
 */
async function resolveApiKeyUser(c: any, apiKey: string): Promise<{ user: Variables['user']; writeCapable: boolean } | Response> {
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

  // API keys entram como papel `client` escopado ao projeto, herdando o isolamento
  // de tenant. `writeCapable` é devolvido porque a autorização de escrita de uma
  // chave é o campo `permissions` acima — não o allow-list de humano read-only.
  return {
    user: {
      id: `apikey:${row.id}`,
      email: `apikey:${row.id}`,
      role: 'client',
      client_project_id: row.project_id,
    },
    writeCapable,
  };
}

// Rotas públicas validadas por token NO PRÓPRIO handler (não exigem sessão nISO):
// - portal do auditor externo (/api/v1/auditor/:token/...) valida contra auditor_tokens;
// - links públicos de assessment (/api/v1/assessments/public/:token...) validam access_token.
// Obs.: '/api/v1/auditor/' NÃO casa com '/api/v1/auditor-notes/...' (rota interna autenticada).
const PUBLIC_TOKEN_PREFIXES = ['/api/v1/assessments/public/', '/api/v1/auditor/'];

// Único conjunto que uma sessão AINDA pendente de segundo fator pode alcançar.
// Lista fechada, não prefixo: `/setup`, `/activate` e sobretudo `/disable` não
// entram — ver o comentário na checagem, abaixo.
const MFA_PENDENTE_PERMITIDO = new Set([
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/mfa/status',
]);

// Auto-serviço de MFA do próprio usuário. Não toca dado de tenant nenhum, e é o
// caminho que um papel read-only PRECISA percorrer para conseguir entrar: sem
// esta entrada no allow-list, um `org_user` com MFA ativo recebe 403 em
// /verify e fica trancado para fora em definitivo, mesmo com o código correto.
const MFA_AUTO_SERVICO = /^\/api\/v1\/auth\/mfa\/(setup|activate|verify|disable)$/;

export const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_TOKEN_PREFIXES.some(p => path.startsWith(p))) {
    return next();
  }

  let user: Variables['user'];
  let apiKeyWriteCapable = false;

  const apiKey = c.req.header('X-API-Key');
  if (apiKey) {
    const resolved = await resolveApiKeyUser(c, apiKey);
    if (resolved instanceof Response) return resolved;
    user = resolved.user;
    apiKeyWriteCapable = resolved.writeCapable;
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

    // Sessão pode ter sido revogada depois de emitida (troca de senha, mudança
    // de papel, exclusão do usuário). Sem esta checagem, uma sessão roubada
    // sobrevive à troca de senha por até 24h — a sessão vive no KV sob um token
    // aleatório e não há como enumerá-la para apagar.
    if (await sessionRevoked(c.env.SESSIONS, (user as any).id, (user as any).iat)) {
      return c.json({ error: 'Unauthorized: Session revoked, please sign in again' }, 401);
    }

    // Sessão pendente de segundo fator: só pode falar com /verify e /status.
    // Sem esta trava o MFA seria decorativo — o token do login já daria acesso
    // a tudo. E liberar todo o /auth/mfa/* era quase tão ruim: quem tem a senha
    // obtém a sessão pendente e a usa em /disable, apresentando a MESMA senha
    // para desligar o segundo fator. O fator caía com exatamente aquilo que ele
    // existe para complementar.
    if ((user as any).mfa_pending && !MFA_PENDENTE_PERMITIDO.has(path.replace(/\/+$/, ''))) {
      return c.json({ error: 'Unauthorized: Second factor required', mfa_required: true }, 401);
    }

    // Guarda o identificador para que /auth/mfa/verify possa reescrever a
    // própria sessão ao confirmar o código.
    c.set('sessionId', sessionId);

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

  // Chave de API com permissão de escrita já foi autorizada por `permissions` acima;
  // o allow-list abaixo existe para papéis HUMANOS read-only. Sem esta exceção, uma
  // integração legítima (o mcp-server-niso) tomava 403 mesmo com chave 'write'.
  // O isolamento de tenant continua valendo — projectAccessMiddleware roda depois.
  if (!apiKeyWriteCapable && (user.role === 'org_user' || user.role === 'client') && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
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
      { methods: ['POST'], test: p => MFA_AUTO_SERVICO.test(p) },
    ];
    const isAllowed = allowedWrites.some(a => a.methods.includes(method) && a.test(path));
    if (!isAllowed) {
      return c.json({ error: 'Forbidden: Read-only role cannot perform write operations' }, 403);
    }
  }

  c.set('user', user);
  await next();
});
