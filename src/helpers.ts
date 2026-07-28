export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function logAudit(
  db: D1Database,
  action: string,
  actor: string,
  details: string,
  justification: string = '',
  ip: string = ''
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(genId(), action, actor, details, justification, ip)
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

export function requireProjectAccess(user: any, projectId: string) {
  if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;
  if (user.client_project_id === projectId) return true;
}

/** Escape HTML entities para prevenir XSS em templates HTML */
export function escapeHtml(s: string): string {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Gera um token criptograficamente seguro para sessões */
export function genToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Gera um código numérico de N dígitos com CSPRNG (rejection sampling, sem viés de módulo) */
export function genNumericCode(digits = 6): string {
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
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

