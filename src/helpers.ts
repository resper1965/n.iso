export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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
  'performance_metrics', 'webhooks', 'api_keys'
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
