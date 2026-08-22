import { log, requestId, resumoErro } from './observability';

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Resposta 500 sem vazar o interior do banco.
 *
 * `e.message` num Worker com D1 é a mensagem crua do SQLite: nome de tabela,
 * nome de coluna, constraint violada, às vezes um fragmento do SQL. Devolver
 * isso ao cliente entrega o schema de graça a quem sonda a API — e sonda é
 * exatamente o que acontece com uma API de conformidade exposta na internet.
 *
 * A troca é vazamento por correlação: o detalhe vai para o log estruturado, o
 * cliente recebe o `request_id` para citar no suporte. É o MESMO id que o
 * middleware de acesso em `src/index.ts` põe na linha `{"msg":"request",...}`,
 * então uma reclamação ("deu erro, request_id X") encontra a linha do erro e a
 * linha de acesso da mesma requisição num `wrangler tail` filtrado por campo.
 *
 * A mensagem de negócio ('Falha ao criar assessment') continua indo ao cliente:
 * ela diz qual operação falhou sem dizer nada sobre como o banco é feito.
 *
 * Não use para 403 nem para 400 — autorização e validação respondem sobre o
 * pedido do cliente, não sobre o estado interno, e a mensagem delas é útil.
 */
export function erro500(c: any, mensagem: string, e: unknown) {
  return c.json({ error: mensagem, request_id: registraErro(c, e) }, 500);
}

/**
 * Registra a exceção no log estruturado e devolve o `request_id` da requisição.
 *
 * Existe separado do `erro500` para as poucas rotas que respondem HTML em vez
 * de JSON (relatório DPIA, relatório ROPA) e para falha por item dentro de uma
 * resposta 200 — elas precisam do mesmo par log/id sem o envelope JSON.
 */
export function registraErro(c: any, e: unknown): string {
  const rid = c.get?.('requestId') || requestId(c);
  log('error', {
    msg: 'erro_handler',
    request_id: rid,
    metodo: c.req?.method,
    rota: c.req?.url ? new URL(c.req.url).pathname : undefined,
    ator: c.get?.('user')?.email,
    // resumoErro traz mensagem + primeira linha do stack: o suficiente para
    // localizar a falha sem despejar stack inteiro (ruído e, às vezes, valor
    // de variável — este produto trata PII sob LGPD).
    erro: resumoErro(e),
  });
  return rid;
}

/**
 * Registra uma entrada no trilho de auditoria (append-only; ver schema.sql —
 * triggers `audit_logs_no_update`/`_no_delete` garantem imutabilidade, controle
 * de integridade de log da ISO 27001 A.8.15).
 *
 * S-log — minimização (LGPD/ISO 27701): `details` descreve a AÇÃO e o ALVO
 * (ids, nomes de entidade de negócio, ação), nunca CONTEÚDO de titular de dados
 * (texto de perguntas ao AI, corpo de mensagens, respostas de formulário). O
 * `actor` (e-mail) é retido de propósito: identificar quem fez o quê é a própria
 * finalidade do trilho. Como a tabela é imutável por design, a minimização é
 * feita na ESCRITA — não há como "limpar" depois sem quebrar a imutabilidade.
 */
export async function logAudit(
  db: D1Database,
  action: string,
  actor: string,
  details: string,
  justification: string = '',
  ip: string = '',
  projectId?: string
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(genId(), action, actor, details, justification, ip, projectId ?? null)
    .run();
}

export async function createNotification(
  db: D1Database,
  type: string,
  title: string,
  message: string,
  userId?: string,
  link?: string,
  actionType?: string,
  targetId?: string
) {
  await db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, read, link, action_type, target_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))`
  ).bind(genId(), userId || null, type, title, message, link || null, actionType || null, targetId || null).run();
}

const ALLOWED_TABLES = [
  'risks', 'vendors', 'training_records', 'ropa_records', 'corrective_actions',
  'compliance_controls', 'evidence', 'assets', 'stakeholders', 'dpia_assessments',
  'audit_schedule', 'certification_tracking', 'audit_findings', 'management_reviews',
  'performance_metrics', 'webhooks', 'api_keys', 'auditor_notes'
];

export async function requireResourceAccess(db: D1Database, table: string, resourceId: string, user: any) {
  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error('Invalid table');
  }
  if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;

  const row = await db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).bind(resourceId).first() as any;
  if (!row || row.project_id !== user.client_project_id) {
    throw new Error('Forbidden: No access to this resource');
  }
  return true;
}

/**
 * Garante que o usuário tem acesso ao projeto. Papéis de staff (consultor/
 * platform_admin/consultant) têm acesso total; demais papéis são restritos ao
 * seu client_project_id. Lança em caso de negação (fail-closed).
 */
export function requireProjectAccess(user: any, projectId: string): true {
  if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;
  if (user.client_project_id === projectId) return true;
  throw new Error('Forbidden: No access to this project');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTORIDADE DE ASSINATURA — sai de project_governance, e só de lá
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `users.role` diz o que a pessoa OPERA na plataforma; `project_governance` diz
 * quem ela É naquele projeto. Só o segundo pode decidir o que ela ASSINA — a
 * mesma pessoa é DPO num cliente, consultor noutro e nada num terceiro, e é
 * exatamente por isso que a matriz de governança existe.
 *
 * Antes, cada caminho de assinatura respondia isso do seu jeito, e os dois
 * erravam em direções opostas:
 *
 *   - `evidence.ts` isentava `platform_admin`/`ciso`/`ceo` da matriz inteira,
 *     então um papel de plataforma assinava como Líder SGSI em QUALQUER projeto;
 *   - `ropa.ts` não olhava papel nenhum, mas só checava cargo `if (userGov)` —
 *     quem não estava na matriz passava sem checagem alguma, e assinava os DOIS
 *     papéis do mesmo registro.
 *
 * Nos dois casos o resultado é o mesmo para a auditoria: `ciso_approved_by` e
 * `ceo_approved_by` com o mesmo nome. Aprovação dupla assinada pela mesma
 * pessoa é aprovação simples com dois carimbos.
 */
export type PapelAssinatura = 'ciso' | 'ceo';

/** Papéis que ADMINISTRAM a plataforma. Operar não é aprovar. */
const PAPEIS_DE_PLATAFORMA = new Set(['platform_admin', 'admin']);

export interface AutoridadeAssinatura {
  /** A pessoa está designada na matriz DESTE projeto. */
  designado: boolean;
  ehLiderSgsi: boolean;
  ehDirecao: boolean;
  /** Nome como consta na matriz, para o carimbo da assinatura. */
  nome: string | null;
  /** A conta administra a plataforma — e por isso não assina nada nela. */
  papelDePlataforma: boolean;
}

export async function autoridadeDeAssinatura(
  db: D1Database,
  projectId: string,
  user: { email?: string; role?: string }
): Promise<AutoridadeAssinatura> {
  const gov = await db
    .prepare('SELECT name, job_title FROM project_governance WHERE project_id = ? AND email = ?')
    .bind(projectId, user.email || '')
    .first<any>();

  const cargo = (gov?.job_title || '').toLowerCase();
  return {
    designado: !!gov,
    ehLiderSgsi: cargo.includes('sgsi') || cargo.includes('dpo') || cargo.includes('ciso'),
    ehDirecao: cargo.includes('ceo') || cargo.includes('diret') || cargo.includes('execut'),
    nome: gov?.name ?? null,
    papelDePlataforma: PAPEIS_DE_PLATAFORMA.has(user.role || ''),
  };
}

/**
 * Motivo da recusa, ou `null` se a assinatura é legítima. Falha fechado: sem
 * designação na matriz não há assinatura, para ninguém.
 */
export function recusaDeAssinatura(a: AutoridadeAssinatura, papel: PapelAssinatura): string | null {
  // Quem administra o sistema não carimba conformidade nele. Sem esta regra, a
  // separação entre operar e aprovar depende de a conta de administração nunca
  // ser designada numa matriz — ou seja, de disciplina. Aqui ela é do código.
  //
  // Consultor NÃO entra nesta lista: entregar serviço a cliente e assinar como
  // DPO daquele cliente é a mesma pessoa exercendo o papel que a matriz lhe deu.
  if (a.papelDePlataforma) {
    return 'Operação proibida: conta de administração da plataforma não assina documentos de conformidade. Use a conta profissional designada na matriz de Governança.';
  }
  if (!a.designado) {
    return 'Operação proibida: usuário não designado na matriz de Governança deste projeto.';
  }
  // Segregação antes da checagem de cargo: quem acumula os dois títulos ainda
  // assim não assina os dois papéis.
  if (papel === 'ceo' && a.ehLiderSgsi) {
    return 'Operação proibida: o Líder SGSI não pode assinar como Direção Executiva (Segregação de Funções).';
  }
  if (papel === 'ciso' && !a.ehLiderSgsi) {
    return 'Apenas o Líder SGSI / DPO designado pode realizar esta assinatura. Verifique o cargo registrado na matriz de Governança do projeto.';
  }
  if (papel === 'ceo' && !a.ehDirecao) {
    return 'Apenas a Direção Executiva designada pode realizar esta assinatura. Verifique o cargo registrado na matriz de Governança do projeto.';
  }
  return null;
}

/** Papéis internos da ness. — os únicos que enxergam o funil comercial. */
const PAPEIS_NESS = new Set(['consultor', 'consultant', 'platform_admin']);

/**
 * Guarda de papel para o pipeline comercial da ness. (lead → assessment →
 * proposta). Estes registros não pertencem a projeto nenhum: não existe
 * `project_id` para comparar, então `requireResourceAccess` não alcança essas
 * rotas e o isolamento tem de ser por PAPEL.
 *
 * Sem esta guarda, o `org_admin` de um cliente — que o RBAC global deixa
 * escrever, porque a lista read-only só cobre `org_user` e `client` — lia a
 * carteira comercial inteira (contato, CNPJ, preço, HTML da proposta) de TODOS
 * os outros clientes e ainda aprovava ou excluía proposta alheia. Confirmado
 * por sonda: `GET /api/v1/proposals/:id` devolvia 200 com o `content_html` de
 * outro cliente e `DELETE` removia a linha.
 */
export async function somenteNess(c: any, next: () => Promise<void>) {
  const user = c.get('user');
  if (!user || !PAPEIS_NESS.has(user.role)) {
    return c.json({ error: 'Forbidden: Área comercial restrita à equipe ness.' }, 403);
  }
  await next();
}

/** Escape HTML entities para prevenir XSS em templates HTML */
export function escapeHtml(s: string): string {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** SHA-256 de uma string, em hex. Usado para hashear/lookup de API keys. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Gera um token criptograficamente seguro para sessões */
export function genToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Gera um código numérico de N dígitos com CSPRNG (rejection sampling, sem viés de módulo).
 *  digits deve ser inteiro em 1..9 (acima de 9, 10**digits estoura Uint32 e o loop nunca termina). */
export function genNumericCode(digits = 6): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 9) {
    throw new Error('genNumericCode: digits deve ser um inteiro entre 1 e 9');
  }
  const max = 10 ** digits;
  const limit = Math.floor(0xffffffff / max) * max;
  const arr = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(arr);
    x = arr[0];
  } while (x >= limit);
  return String(x % max).padStart(digits, '0');
}

/** Comparação de tempo constante para hashes/tokens (evita timing side-channels) */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Comprimento diferente NÃO retorna cedo (evita vazar o tamanho por timing):
  // a diferença de tamanho entra no acumulador e iteramos sobre o maior comprimento.
  let result = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * Rate limit best-effort baseado em KV. Retorna true se a ação é permitida.
 * Incrementa um contador com janela deslizante por expiração de TTL.
 * ponytail: get-then-put não é atômico no KV (eventual consistency); é proteção
 * básica contra brute force, não um limitador rígido.
 */
export async function rateLimit(kv: KVNamespace, key: string, max: number, windowSec: number): Promise<boolean> {
  const k = `ratelimit:${key}`;
  const current = parseInt((await kv.get(k)) || '0', 10) || 0;
  if (current >= max) return false;
  await kv.put(k, String(current + 1), { expirationTtl: windowSec });
  return true;
}

/**
 * Rate limit ATÔMICO de JANELA FIXA em D1. Retorna true se a ação é permitida.
 *
 * Existe para controles de SEGURANÇA (ex.: brute force de login por conta), onde
 * o `rateLimit` por KV é fraco em dois pontos que o Codex apontou no #113:
 *  - get-then-put não é atômico → sob concorrência distribuída o teto vaza;
 *  - o TTL é renovado a cada request → a janela desliza e nunca fecha (um
 *    usuário legítimo espaçando logins pode tomar 429 sem nunca estourar N/janela).
 *
 * Aqui o incremento é um upsert de statement ÚNICO (atômico no D1) e a janela é
 * FIXA: quando `window_start + windowSec` já passou, o contador zera e a janela
 * reinicia. Use só onde o keyspace é limitado (ex.: por conta-alvo) — não há TTL,
 * a linha é reaproveitada na próxima chamada da mesma chave.
 */
export async function rateLimitD1(db: D1Database, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start + ?3 <= ?2 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start + ?3 <= ?2 THEN ?2 ELSE rate_limits.window_start END
     RETURNING count`
  ).bind(key, now, windowSec).first<{ count: number }>();
  return (row?.count ?? 1) <= max;
}

/** Envia e-mail usando a API do Resend se RESEND_API_KEY estiver presente. Caso contrário, simula em log */
export async function sendEmail(c: any, to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = c.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL SIMULATION] Envio para: ${to}\nAssunto: ${subject}\nConteúdo: ${html}`);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'nISO <noreply@ness.lat>',
        to: [to],
        subject: subject,
        html: html
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[EMAIL ERROR] Falha no Resend API: ${res.status} - ${errText}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[EMAIL ERROR] Erro no envio de e-mail: ${e}`);
    return false;
  }
}

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || crypto.randomUUID();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.includes(':')) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return constantTimeEqual(legacyHash, stored);
  }
  const [salt] = stored.split(':');
  const rehash = await hashPassword(password, salt);
  return constantTimeEqual(rehash, stored);
}


// ─── Paginação ───────────────────────────────────────────────────────────────

/** Teto de linhas por listagem. Cliente que precisa de mais usa `offset`. */
export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 200;

/**
 * Lê `?limit` e `?offset` da query e devolve valores seguros.
 *
 * As listagens não tinham LIMIT nenhum: 4 de 67 consultas. Num projeto com
 * milhares de evidências, `SELECT * FROM evidence WHERE project_id = ?` carrega
 * tudo na memória do worker e estoura o limite de CPU antes de responder.
 *
 * ponytail: o formato da resposta continua sendo array. Paginação com envelope
 * (`{items, total, page}`) quebraria as 67 chamadas do frontend de uma vez —
 * o teto protege o servidor sem exigir mudança no cliente. Quem quiser paginar
 * de fato passa `?limit=&offset=`, e o header `X-Has-More` diz se sobrou.
 */
export function pageParams(c: any): { limit: number; offset: number } {
  const bruto = Number(c.req.query('limit'));
  const limit = Number.isFinite(bruto) && bruto > 0 ? Math.min(bruto, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const off = Number(c.req.query('offset'));
  const offset = Number.isFinite(off) && off > 0 ? Math.floor(off) : 0;
  return { limit, offset };
}

/**
 * Executa uma listagem com teto. Pede uma linha a mais que o limite para saber
 * se há continuação, sem pagar um COUNT(*) separado.
 */
export async function listPaged<T = any>(
  c: any,
  sql: string,
  binds: unknown[] = []
): Promise<{ results: T[]; hasMore: boolean; limit: number; offset: number }> {
  const { limit, offset } = pageParams(c);
  const { results } = await c.env.DB.prepare(`${sql} LIMIT ? OFFSET ?`)
    .bind(...binds, limit + 1, offset)
    .all();
  const linhas = (results || []) as T[];
  const hasMore = linhas.length > limit;
  return { results: hasMore ? linhas.slice(0, limit) : linhas, hasMore, limit, offset };
}

/** Resposta de listagem: array puro (contrato antigo) + metadados no header. */
export function pagedJson(c: any, p: { results: unknown[]; hasMore: boolean; limit: number; offset: number }) {
  return c.json(p.results, 200, {
    'X-Has-More': String(p.hasMore),
    'X-Page-Limit': String(p.limit),
    'X-Page-Offset': String(p.offset),
  });
}

// ─── Invalidação de sessão ───────────────────────────────────────────────────
// Sessões vivem no KV sob um token aleatório, então não dá para enumerar as de
// um usuário e apagá-las. Em vez disso guardamos um marco por usuário: toda
// sessão emitida ANTES dele deixa de valer. O TTL é o mesmo da sessão mais
// longa (24h), então a chave some sozinha quando não pode mais barrar nada.

/** TTL de sessão (24h). Marco de invalidação não precisa durar mais que isso. */
export const SESSION_TTL_SEC = 86400;

/**
 * Invalida todas as sessões já emitidas para um usuário. Chame ao trocar senha,
 * mudar papel ou excluir o usuário — sem isso, uma sessão roubada sobrevive à
 * troca de senha por até 24h, e um rebaixamento de papel demora o mesmo tanto.
 */
export async function invalidateUserSessions(kv: KVNamespace, userId: string | number): Promise<void> {
  if (!userId) return;
  await kv.put(`sessions_invalid_before:${userId}`, String(Date.now()), { expirationTtl: SESSION_TTL_SEC });
}

/** True se a sessão (emitida em `iat`) foi invalidada depois de emitida. */
export async function sessionRevoked(kv: KVNamespace, userId: string | number | undefined, iat: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const marco = await kv.get(`sessions_invalid_before:${userId}`);
  if (!marco) return false;
  // Sessão sem `iat` é anterior a esta mudança: trate como revogada (falha fechada).
  return !iat || iat < Number(marco);
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/** Teto de upload. R2 aceita muito mais; o limite existe para conter abuso. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Tipos aceitos como evidência. Allow-list, não deny-list: o que não está aqui
 * é recusado. `text/html` e `image/svg+xml` ficam de fora de propósito — são
 * servidos de volta ao navegador e viram XSS armazenado.
 */
export const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/zip',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Valida tamanho e tipo do arquivo. Devolve a mensagem de erro, ou null se ok. */
export function validateUpload(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Arquivo excede o limite de ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`;
  }
  if (file.size === 0) return 'Arquivo vazio';
  const tipo = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_UPLOAD_TYPES.has(tipo)) {
    return `Tipo de arquivo não aceito: ${tipo || 'desconhecido'}`;
  }
  return null;
}
// ─── Webhook: assinatura HMAC ────────────────────────────────────────────────

/**
 * Assina o corpo de um webhook com HMAC-SHA256.
 *
 * Sem assinatura, quem recebe não tem como distinguir um evento nosso de um
 * POST forjado por qualquer um que descubra a URL — e a URL vai em texto puro
 * em log, proxy e histórico de navegador. O receptor age sobre o conteúdo
 * (cria ticket, notifica auditor), então forjar evento é forjar fato.
 *
 * Formato `t=<epoch>,v1=<hex>`, e o timestamp entra no que é assinado. Sem ele,
 * uma requisição legítima capturada pode ser reenviada indefinidamente — a
 * assinatura continuaria válida. Cabe ao receptor recusar `t` antigo.
 */
export async function signWebhook(secret: string, payload: string, timestampSec?: number): Promise<string> {
  const t = timestampSec ?? Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(assinatura)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

/**
 * Confere uma assinatura. Existe para o teste e para quem for escrever o
 * receptor do outro lado — a verificação real acontece fora daqui.
 * Usa comparação de tempo constante.
 */
export async function verifyWebhookSignature(secret: string, payload: string, header: string): Promise<boolean> {
  const t = header.match(/t=(\d+)/)?.[1];
  if (!t) return false;
  const esperado = await signWebhook(secret, payload, Number(t));
  return constantTimeEqual(esperado, header);
}

