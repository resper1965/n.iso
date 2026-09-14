import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireResourceAccess, genToken, signWebhook } from '../helpers';
import { validateBody, createWebhookSchema, createApiKeySchema } from '../schemas';

const integrations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Normaliza um hostname que seja um literal IPv4 em qualquer codificação aceita
 * (decimal "2130706433", octal "0177.0.0.1", hex "0x7f.0.0.1", forma curta "127.1")
 * para a forma pontilhada canônica. Retorna null se não for um literal IPv4.
 * Sem isso, `127.0.0.1` seria bloqueado mas `2130706433` passaria.
 */
function canonicalizeIpv4(host: string): string | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const p of parts) {
    if (p === '') return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }

  // Formas curtas: a.b.c -> a.b.0.c ; a.b -> a.0.0.b ; a -> inteiro de 32 bits
  let value: number;
  const last = nums[nums.length - 1];
  const maxLast = 2 ** (8 * (4 - (nums.length - 1)));
  if (last >= maxLast) return null;
  if (nums.slice(0, -1).some(n => n > 255)) return null;
  value = last;
  for (let i = nums.length - 2; i >= 0; i--) {
    value += nums[i] * 2 ** (8 * (3 - i));
  }
  if (value > 0xffffffff) return null;

  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
}

/** true se o IPv4 pontilhado pertence a faixa privada/loopback/link-local/reservada. */
function isPrivateIpv4(dotted: string): boolean {
  const [a, b] = dotted.split('.').map(Number);
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 127) return true;                       // loopback
  if (a === 0) return true;                         // 0.0.0.0/8
  if (a === 169 && b === 254) return true;          // link-local (inclui metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT 100.64.0.0/10
  if (a >= 224) return true;                        // multicast/reservado
  return false;
}

/**
 * SSRF guard para URLs de webhook: exige http(s) e bloqueia destinos internos
 * (loopback, faixas privadas, link-local/metadata, IPv6 interno), incluindo
 * codificações alternativas de IP.
 * Só destinos LITERAIS. O caso de hostname que resolve para IP interno (DNS
 * rebinding) é coberto por `resolveHostIsPublic` (resolução via DoH), chamada na
 * criação e antes de cada entrega.
 */
export function isValidWebhookUrl(urlStr: string): boolean {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;

  let hostname = url.hostname.toLowerCase();

  // IPv6 literal chega entre colchetes na URL: [::1]
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  if (hostname.includes(':')) {
    const v6 = hostname.replace(/%.*$/, ''); // remove zone id
    if (v6 === '::1' || v6 === '::') return false;              // loopback / unspecified
    if (/^fe[89ab][0-9a-f]:/i.test(v6)) return false;           // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/i.test(v6)) return false;           // unique local fc00::/7
    // IPv4 mapeado. O parser de URL normaliza ::ffff:127.0.0.1 para a forma
    // hexadecimal ::ffff:7f00:1, então tratamos as duas representações.
    const mappedDotted = v6.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedDotted) {
      const canon = canonicalizeIpv4(mappedDotted[1]);
      if (canon && isPrivateIpv4(canon)) return false;
    } else {
      const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
      if (mappedHex) {
        const hi = parseInt(mappedHex[1], 16);
        const lo = parseInt(mappedHex[2], 16);
        const dotted = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
        if (isPrivateIpv4(dotted)) return false;
      }
    }
    return true;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;

  const canon = canonicalizeIpv4(hostname);
  if (canon) return !isPrivateIpv4(canon);

  return true;
}

/** true se o endereço IPv6 (texto) é loopback/link-local/ULA ou IPv4-mapeado interno. */
function isPrivateIpv6(addr: string): boolean {
  const v6 = addr.toLowerCase().replace(/%.*$/, '');
  if (v6 === '::1' || v6 === '::') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(v6)) return true;   // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(v6)) return true;   // ULA fc00::/7
  const m = v6.match(/(\d+\.\d+\.\d+\.\d+)$/);        // ::ffff:1.2.3.4 (decimal)
  if (m) { const c = canonicalizeIpv4(m[1]); if (c && isPrivateIpv4(c)) return true; }
  // IPv4-mapeado em HEX: ::ffff:7f00:1 (loopback), ::ffff:a9fe:a9fe (metadata).
  // Um AAAA controlado pelo atacante pode vir nesta forma; sem isto passava como
  // público e o rebinding para IP interno seguia aberto (P1 da revisão do Codex).
  const mh = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mh) {
    const hi = parseInt(mh[1], 16), lo = parseInt(mh[2], 16);
    const dotted = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
    if (isPrivateIpv4(dotted)) return true;
  }
  return false;
}

/**
 * S8 — fecha o gap de DNS rebinding do `isValidWebhookUrl` (que só vê destinos
 * LITERAIS). Resolve o hostname via DNS-over-HTTPS (Cloudflare) e exige que TODOS
 * os IPs resolvidos sejam públicos. Fail-closed: erro de resolução ou host sem
 * A/AAAA público → false.
 *
 * Usado tanto na criação quanto IMEDIATAMENTE antes do fetch de entrega, para
 * minimizar a janela TOCTOU — o fetch do Workers não permite pinar o IP resolvido
 * (conectar pelo IP quebraria SNI/TLS), então resolver logo antes é o mais forte
 * possível aqui. Literais de IP não precisam de DNS (já cobertos por isValidWebhookUrl).
 */
export async function resolveHostIsPublic(hostname: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (canonicalizeIpv4(host) || host.includes(':')) return true; // literal IP: já validado
  try {
    let temPublico = false;
    for (const tipo of ['A', 'AAAA']) {
      const r = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${tipo}`, {
        headers: { accept: 'application/dns-json' },
      });
      if (!r.ok) return false;
      const j = (await r.json()) as any;
      for (const ans of j.Answer || []) {
        if (ans.type === 1) { // A
          const c = canonicalizeIpv4(ans.data);
          if (!c || isPrivateIpv4(c)) return false;
          temPublico = true;
        } else if (ans.type === 28) { // AAAA
          if (isPrivateIpv6(ans.data)) return false;
          temPublico = true;
        }
      }
    }
    return temPublico; // sem nenhum A/AAAA público → fail closed
  } catch {
    return false;
  }
}

/** Previne CSV Injection (Formula Injection) e escapa aspas */
function safeCsvCell(val: any): string {
  let s = String(val ?? '');
  s = s.replace(/"/g, '""');
  // Se começar com =, +, -, @, injetar um ' na frente para evitar execução de fórmulas
  if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
    s = "'" + s;
  }
  return `"${s}"`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SPRINT 7: INTEGRATION & SCALE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 7A. Webhooks (CRUD + Test) ─────────────────────────────────────────────

integrations.get('/api/v1/projects/:projectId/webhooks', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, webhooks: result.results });
});

integrations.post('/api/v1/projects/:projectId/webhooks', async (c) => {
  const projectId = c.req.param('projectId');
  const valid = await validateBody(c, createWebhookSchema);
  if (!valid.success) return valid.response;
  const body = valid.data;

  // SSRF guard na CRIAÇÃO: só o bloqueio SÍNCRONO de IP literal (loopback, faixas
  // privadas, link-local/metadata, IPv6 interno, codificações alternativas).
  // A resolução DoH (anti-rebinding) NÃO roda aqui de propósito: é uma chamada de
  // rede externa que tornaria a criação lenta e dependente do resolvedor — e, no
  // CI, flaky (timeout). O rebinding se defende no MOMENTO que importa, a ENTREGA:
  // resolveHostIsPublic é chamado imediatamente antes de cada fetch de saída, com
  // a menor janela TOCTOU possível. Um destino que resolve para IP interno é então
  // barrado ali, mesmo que tenha passado na criação.
  if (!isValidWebhookUrl(body.url)) {
    return c.json({ error: 'Invalid or forbidden webhook URL (SSRF Guard)' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Segredo opcional na API significava, na prática, webhook sem assinatura —
  // ninguém preenche campo opcional. Gera um se não vier.
  const secret = body.secret || genToken();
  await c.env.DB.prepare(
    `INSERT INTO webhooks (id, project_id, url, events, secret, status, failure_count, created_at)
     VALUES (?, ?, ?, ?, ?, 'Active', 0, ?)`
  ).bind(id, projectId, body.url, body.events, secret, now).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_created', user.email, `Webhook ${id} created for ${body.url}`, projectId).run();
  // ponytail: segredo devolvido UMA vez, como a chave de API. Quem recebe
  // precisa dele para conferir a assinatura, e não há endpoint que o leia de
  // volta — se perder, recria o webhook.
  return c.json({ ok: true, id, secret, gerado: !body.secret }, 201);
});

integrations.delete('/api/v1/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'webhooks', id, c.get('user'));
  const wh = await c.env.DB.prepare('SELECT project_id FROM webhooks WHERE id = ?').bind(id).first() as any;
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_deleted', user.email, `Webhook ${id} deleted`, wh?.project_id ?? null).run();
  return c.json({ ok: true });
});

integrations.post('/api/v1/webhooks/test/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'webhooks', id, c.get('user'));
  const webhook = await c.env.DB.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first() as any;
  if (!webhook) return c.json({ error: 'Webhook not found' }, 404);

  if (!isValidWebhookUrl(webhook.url)) {
    return c.json({ error: 'Invalid or forbidden webhook URL (SSRF Guard)' }, 400);
  }
  // S8: resolve o host IMEDIATAMENTE antes de disparar — se o DNS foi apontado
  // para um IP interno depois da criação (rebinding), barra aqui.
  if (!(await resolveHostIsPublic(webhook.url ? new URL(webhook.url).hostname : ''))) {
    return c.json({ error: 'Webhook host resolves to a non-public address (SSRF Guard)' }, 400);
  }

  try {
    const corpo = JSON.stringify({
      event: 'test',
      event_id: crypto.randomUUID(),
      project_id: webhook.project_id,
      timestamp: new Date().toISOString(),
    });
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
    // Webhook antigo pode não ter segredo (a coluna aceitava ''); nesse caso
    // segue sem assinatura em vez de quebrar a integração existente.
    if (webhook.secret) {
      cabecalhos['X-nISO-Signature'] = await signWebhook(webhook.secret, corpo);
    }
    const resp = await fetch(webhook.url, { method: 'POST', headers: cabecalhos, body: corpo });
    await c.env.DB.prepare('UPDATE webhooks SET last_triggered_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    return c.json({ ok: true, status: resp.status });
  } catch (e: any) {
    await c.env.DB.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').bind(id).run();
    return c.json({ ok: false, error: e.message }, 502);
  }
});

// ─── 7B. API Keys ───────────────────────────────────────────────────────────

integrations.post('/api/v1/projects/:projectId/api-keys', async (c) => {
  if (c.get('user').role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: gestão de API keys é exclusiva do Platform Admin' }, 403);
  }
  const projectId = c.req.param('projectId');
  const valid = await validateBody(c, createApiKeySchema);
  if (!valid.success) return valid.response;
  const body = valid.data;
  const id = crypto.randomUUID();
  const plainKey = crypto.randomUUID() + '-' + crypto.randomUUID();
  const keyBytes = new TextEncoder().encode(plainKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
  const keyHash = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, project_id, key_hash, name, permissions, expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)`
  ).bind(id, projectId, keyHash, body.name, body.permissions || 'read', body.expires_at || null, now).run();

  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_created', user.email, `API key ${id} created`, projectId).run();

  // ponytail: plaintext key returned ONCE — never stored
  return c.json({ ok: true, id, key: plainKey }, 201);
});

integrations.get('/api/v1/projects/:projectId/api-keys', async (c) => {
  if (c.get('user').role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: gestão de API keys é exclusiva do Platform Admin' }, 403);
  }
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare(
    'SELECT id, name, permissions, status, last_used_at, created_at FROM api_keys WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, keys: result.results });
});

integrations.delete('/api/v1/api-keys/:id', async (c) => {
  if (c.get('user').role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: gestão de API keys é exclusiva do Platform Admin' }, 403);
  }
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'api_keys', id, c.get('user'));
  const ak = await c.env.DB.prepare('SELECT project_id FROM api_keys WHERE id = ?').bind(id).first() as any;
  await c.env.DB.prepare("UPDATE api_keys SET status = 'Revoked' WHERE id = ?").bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_revoked', user.email, `API key ${id} revoked`, ak?.project_id ?? null).run();
  return c.json({ ok: true });
});

// ─── 7C. Bulk Export (CSV) ──────────────────────────────────────────────────

integrations.get('/api/v1/projects/:projectId/export/risks', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM risks WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'asset,threat,vulnerability,impact,probability,risk_level,treatment,owner,status';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.asset)},${safeCsvCell(r.threat)},${safeCsvCell(r.vulnerability)},${safeCsvCell(r.impact)},${safeCsvCell(r.probability)},${safeCsvCell(r.risk_level)},${safeCsvCell(r.treatment)},${safeCsvCell(r.owner)},${safeCsvCell(r.status)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="risks.csv"' } });
});

integrations.get('/api/v1/projects/:projectId/export/vendors', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM vendors WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,trust_score,diligence_level,has_iso27001,has_soc2,dpa_signed';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.trust_score)},${safeCsvCell(r.diligence_level)},${safeCsvCell(r.has_iso27001)},${safeCsvCell(r.has_soc2)},${safeCsvCell(r.dpa_signed)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="vendors.csv"' } });
});

integrations.get('/api/v1/projects/:projectId/export/training', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM training_records WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'employee_name,training_name,status,score,completion_date';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.employee_name)},${safeCsvCell(r.training_name)},${safeCsvCell(r.status)},${safeCsvCell(r.score)},${safeCsvCell(r.completion_date)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="training.csv"' } });
});

integrations.get('/api/v1/projects/:projectId/export/audit-log', async (c) => {
  const projectId = c.req.param('projectId');
  const user = c.get('user');
  // Escopado ao PROJETO (antes filtrava por actor, exportando as ações do próprio
  // requisitante). Fallback LIKE cobre linhas legadas sem project_id populado.
  const result = await c.env.DB.prepare(
    'SELECT * FROM audit_logs WHERE project_id = ? OR (project_id IS NULL AND details LIKE ?) ORDER BY created_at DESC LIMIT 500'
  ).bind(projectId, `%${projectId}%`).all();
  const rows = (result.results || []) as any[];
  const headers = 'id,action,actor,details,created_at';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.id)},${safeCsvCell(r.action)},${safeCsvCell(r.actor)},${safeCsvCell(r.details)},${safeCsvCell(r.created_at)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' } });
});

integrations.get('/api/v1/projects/:projectId/export/assets', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM assets WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,classification,owner,location,status,description,confidentiality_rating,integrity_rating,availability_rating';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.classification)},${safeCsvCell(r.owner)},${safeCsvCell(r.location)},${safeCsvCell(r.status)},${safeCsvCell(r.description)},${safeCsvCell(r.confidentiality_rating)},${safeCsvCell(r.integrity_rating)},${safeCsvCell(r.availability_rating)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="assets.csv"' } });
});

export default integrations;
