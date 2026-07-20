import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireResourceAccess } from '../helpers';

const integrations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Helper para validar URLs de webhook (SSRF guard) */
function isValidWebhookUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return false;
    if (hostname.includes('169.254.169.254')) return false;
    return ['http:', 'https:'].includes(url.protocol);
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

integrations.get('/api/v1/projects/:id/webhooks', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, webhooks: result.results });
});

integrations.post('/api/v1/projects/:id/webhooks', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO webhooks (id, project_id, url, events, secret, status, failure_count, created_at)
     VALUES (?, ?, ?, ?, ?, 'Active', 0, ?)`
  ).bind(id, projectId, body.url, body.events, body.secret || '', now).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_created', user.email, `Webhook ${id} created for ${body.url}`).run();
  return c.json({ ok: true, id }, 201);
});

integrations.delete('/api/v1/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'webhooks', id, c.get('user'));
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_deleted', user.email, `Webhook ${id} deleted`).run();
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

  try {
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test', project_id: webhook.project_id, timestamp: new Date().toISOString() }),
    });
    await c.env.DB.prepare('UPDATE webhooks SET last_triggered_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    return c.json({ ok: true, status: resp.status });
  } catch (e: any) {
    await c.env.DB.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').bind(id).run();
    return c.json({ ok: false, error: e.message }, 502);
  }
});

// ─── 7B. API Keys ───────────────────────────────────────────────────────────

integrations.post('/api/v1/projects/:id/api-keys', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
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
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_created', user.email, `API key ${id} created`).run();

  // ponytail: plaintext key returned ONCE — never stored
  return c.json({ ok: true, id, key: plainKey }, 201);
});

integrations.get('/api/v1/projects/:id/api-keys', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare(
    'SELECT id, name, permissions, status, last_used_at, created_at FROM api_keys WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, keys: result.results });
});

integrations.delete('/api/v1/api-keys/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c.env.DB, 'api_keys', id, c.get('user'));
  await c.env.DB.prepare("UPDATE api_keys SET status = 'Revoked' WHERE id = ?").bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_revoked', user.email, `API key ${id} revoked`).run();
  return c.json({ ok: true });
});

// ─── 7C. Bulk Export (CSV) ──────────────────────────────────────────────────

integrations.get('/api/v1/projects/:id/export/risks', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM risks WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'asset,threat,vulnerability,impact,probability,risk_level,treatment,owner,status';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.asset)},${safeCsvCell(r.threat)},${safeCsvCell(r.vulnerability)},${safeCsvCell(r.impact)},${safeCsvCell(r.probability)},${safeCsvCell(r.risk_level)},${safeCsvCell(r.treatment)},${safeCsvCell(r.owner)},${safeCsvCell(r.status)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="risks.csv"' } });
});

integrations.get('/api/v1/projects/:id/export/vendors', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM vendors WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,trust_score,diligence_level,has_iso27001,has_soc2,dpa_signed';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.trust_score)},${safeCsvCell(r.diligence_level)},${safeCsvCell(r.has_iso27001)},${safeCsvCell(r.has_soc2)},${safeCsvCell(r.dpa_signed)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="vendors.csv"' } });
});

integrations.get('/api/v1/projects/:id/export/training', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM training_records WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'employee_name,training_name,status,score,completion_date';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.employee_name)},${safeCsvCell(r.training_name)},${safeCsvCell(r.status)},${safeCsvCell(r.score)},${safeCsvCell(r.completion_date)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="training.csv"' } });
});

integrations.get('/api/v1/projects/:id/export/audit-log', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT * FROM audit_logs WHERE actor = ? ORDER BY created_at DESC LIMIT 500').bind(user.email).all();
  const rows = (result.results || []) as any[];
  const headers = 'id,action,actor,details,created_at';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.id)},${safeCsvCell(r.action)},${safeCsvCell(r.actor)},${safeCsvCell(r.details)},${safeCsvCell(r.created_at)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' } });
});

integrations.get('/api/v1/projects/:id/export/assets', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM assets WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,classification,owner,location,status,description,confidentiality_rating,integrity_rating,availability_rating';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.classification)},${safeCsvCell(r.owner)},${safeCsvCell(r.location)},${safeCsvCell(r.status)},${safeCsvCell(r.description)},${safeCsvCell(r.confidentiality_rating)},${safeCsvCell(r.integrity_rating)},${safeCsvCell(r.availability_rating)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="assets.csv"' } });
});

export default integrations;
