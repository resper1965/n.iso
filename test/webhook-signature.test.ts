import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { signWebhook, verifyWebhookSignature, hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Assinatura HMAC de webhook.
 *
 * Sem ela, quem recebe não distingue um evento nosso de um POST forjado por
 * quem descobrir a URL — e a URL circula em log, proxy e histórico. O receptor
 * age sobre o conteúdo (abre ticket, notifica auditor), então forjar evento é
 * forjar fato.
 */
describe('Assinatura HMAC (unitário)', () => {
  const segredo = 'segredo-de-teste';
  const corpo = JSON.stringify({ event: 'test', project_id: 'p1' });

  it('produz o formato t=<epoch>,v1=<hex>', async () => {
    const sig = await signWebhook(segredo, corpo);
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('a própria assinatura confere', async () => {
    const sig = await signWebhook(segredo, corpo);
    expect(await verifyWebhookSignature(segredo, corpo, sig)).toBe(true);
  });

  it('corpo alterado invalida a assinatura', async () => {
    const sig = await signWebhook(segredo, corpo);
    expect(await verifyWebhookSignature(segredo, corpo + ' ', sig)).toBe(false);
  });

  it('segredo errado invalida a assinatura', async () => {
    const sig = await signWebhook(segredo, corpo);
    expect(await verifyWebhookSignature('outro-segredo', corpo, sig)).toBe(false);
  });

  it('o timestamp faz parte do que é assinado — replay com t trocado não passa', async () => {
    // Sem isto, uma requisição legítima capturada valeria para sempre.
    const sig = await signWebhook(segredo, corpo, 1000);
    const adulterada = sig.replace('t=1000', 't=999999');
    expect(await verifyWebhookSignature(segredo, corpo, adulterada)).toBe(false);
  });

  it('assinaturas em instantes diferentes são diferentes', async () => {
    const a = await signWebhook(segredo, corpo, 1000);
    const b = await signWebhook(segredo, corpo, 2000);
    expect(a).not.toBe(b);
  });

  it('header sem t é recusado em vez de aceito por omissão', async () => {
    expect(await verifyWebhookSignature(segredo, corpo, 'v1=abc')).toBe(false);
    expect(await verifyWebhookSignature(segredo, corpo, '')).toBe(false);
  });
});

describe('Criação de webhook', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','a@b.c',?,'A','platform_admin')`).bind(hash),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'a@b.c', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function criar(body: unknown) {
    return app.fetch(
      new Request('http://localhost/api/v1/projects/p1/webhooks', { method: 'POST', headers, body: JSON.stringify(body) }),
      env as any
    );
  }

  it('gera segredo quando o cliente não informa, e devolve uma vez', async () => {
    // Campo opcional que ninguém preenche = webhook sem assinatura na prática.
    const res = await criar({ url: 'https://exemplo.com/hook', events: 'risk.created' });
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.gerado).toBe(true);
    expect(body.secret).toBeTruthy();
    expect(body.secret.length).toBeGreaterThanOrEqual(32);

    const gravado = await env.DB.prepare('SELECT secret FROM webhooks WHERE id = ?').bind(body.id).first<any>();
    expect(gravado.secret).toBe(body.secret);
  });

  it('respeita o segredo informado pelo cliente', async () => {
    const res = await criar({ url: 'https://exemplo.com/hook2', events: 'risk.created', secret: 'meu-segredo-proprio' });
    const body = await res.json() as any;
    expect(body.gerado).toBe(false);
    expect(body.secret).toBe('meu-segredo-proprio');
  });

  it('dois webhooks recebem segredos distintos', async () => {
    const a = await (await criar({ url: 'https://exemplo.com/a', events: 'e' })).json() as any;
    const b = await (await criar({ url: 'https://exemplo.com/b', events: 'e' })).json() as any;
    expect(a.secret).not.toBe(b.secret);
  });

  it('a guarda de SSRF continua valendo na criação', async () => {
    expect((await criar({ url: 'http://169.254.169.254/latest/meta-data', events: 'e' })).status).toBe(400);
    expect((await criar({ url: 'http://127.0.0.1:8787/admin', events: 'e' })).status).toBe(400);
  });
});
