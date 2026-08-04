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
    'SELECT id, project_id, name, permissions, status, expires_at FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first();

  if (!row || row.status !== 'Active' || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return c.json({ error: 'Unauthorized: Invalid or expired API key' }, 401);
  }

  // Todo o isolamento de tenant de uma chave se apoia no `project_id` que ela
  // carrega — é ele que vira `client_project_id` logo abaixo. A coluna é
  // nullable no schema (`project_id TEXT REFERENCES projects(id)`), e uma chave
  // sem projeto passaria daqui como `client` sem escopo: o filtro do portfólio
  // (routes/platform.ts) só restringe quando `client_project_id` é truthy, então
  // ela enxergaria os projetos de TODOS os tenants. Hoje o único caminho de
  // criação tira o id do path e nunca grava nulo, mas isso é garantia de
  // chamador, não do schema — falha fechado aqui, no ponto onde a chave vira
  // identidade.
  if (!row.project_id) {
    return c.json({ error: 'Unauthorized: API key is not scoped to a project' }, 401);
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
  //
  // `id` continua sendo só `apikey:<id>`: é ele que o rate limit usa como conta
  // (middleware/rate-limit.ts) e o nome não tem por que entrar nessa chave.
  //
  // `email` é o campo que vira `actor` no audit_logs e `uploaded_by` na evidência,
  // então é onde a rastreabilidade humana precisa aparecer: `apikey:<id>` sozinho
  // diz QUE chave agiu, mas o auditor quer QUEM. O prefixo vem antes do nome de
  // propósito — o nome é texto que o criador da chave escolhe, e um nome como
  // "admin@ness.io" passaria por usuário real se aparecesse primeiro. Com o
  // prefixo na frente, todo ator de chave é inconfundível, escreva-se o que for
  // no nome.
  return {
    user: {
      id: `apikey:${row.id}`,
      email: atorDaChave(row.id as string, row.name as string | null),
      role: 'client',
      client_project_id: row.project_id,
    },
    writeCapable,
  };
}

/** Identidade da chave para a trilha de auditoria: `apikey:<id> (<nome>)`. */
function atorDaChave(id: string, name: string | null): string {
  // Quebra de linha no nome viraria injeção de linha falsa num log lido como
  // texto; o teto evita que um nome enorme inche cada registro de auditoria.
  const limpo = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpo ? `apikey:${id} (${limpo})` : `apikey:${id}`;
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
    //
    // `consultant` → `consultor`, e NÃO `platform_admin`. Esta linha era a única
    // das três que traduzia a palavra assim: o login (routes/auth.ts) e a
    // listagem (routes/users.ts) sempre mandaram para `consultor`. Como o
    // middleware roda em toda requisição, uma sessão que ainda carregasse
    // `consultant` — emitida antes daquela normalização, ou reescrita por outro
    // caminho — era promovida a administrador de plataforma a cada chamada.
    //
    // Consultor entrega serviço a cliente; administrador opera a plataforma.
    // São coisas diferentes, e uma letra de diferença entre as duas grafias não
    // pode ser o que decide qual delas a conta é.
    if (user.role === 'admin') user.role = 'platform_admin';
    else if (user.role === 'user') user.role = 'org_user';
    else if (user.role === 'consultant') user.role = 'consultor';
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
