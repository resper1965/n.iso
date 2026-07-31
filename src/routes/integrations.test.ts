import { describe, expect, test } from 'vitest';
import integrations, { isValidWebhookUrl } from './integrations';
import type { Bindings, Variables } from '../index';
import { Hono } from 'hono';

describe('isValidWebhookUrl (SSRF guard)', () => {
  test('accepts public https/http destinations', () => {
    expect(isValidWebhookUrl('https://hooks.example.com/abc')).toBe(true);
    expect(isValidWebhookUrl('http://8.8.8.8/hook')).toBe(true);
  });

  test('rejects non-http protocols and malformed urls', () => {
    expect(isValidWebhookUrl('file:///etc/passwd')).toBe(false);
    expect(isValidWebhookUrl('ftp://example.com')).toBe(false);
    expect(isValidWebhookUrl('not a url')).toBe(false);
  });

  test('rejects loopback and localhost', () => {
    expect(isValidWebhookUrl('http://localhost/x')).toBe(false);
    expect(isValidWebhookUrl('http://127.0.0.1/x')).toBe(false);
    expect(isValidWebhookUrl('http://0.0.0.0/x')).toBe(false);
  });

  test('rejects private ranges', () => {
    expect(isValidWebhookUrl('http://10.1.2.3/x')).toBe(false);
    expect(isValidWebhookUrl('http://172.16.0.1/x')).toBe(false);
    expect(isValidWebhookUrl('http://172.31.255.255/x')).toBe(false);
    expect(isValidWebhookUrl('http://192.168.1.1/x')).toBe(false);
    expect(isValidWebhookUrl('http://100.64.0.1/x')).toBe(false);
    // 172.32.x is public, must NOT be blocked
    expect(isValidWebhookUrl('http://172.32.0.1/x')).toBe(true);
  });

  test('rejects link-local / cloud metadata', () => {
    expect(isValidWebhookUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isValidWebhookUrl('http://169.254.1.1/x')).toBe(false);
  });

  test('rejects alternate IP encodings of loopback', () => {
    expect(isValidWebhookUrl('http://2130706433/x')).toBe(false);   // decimal
    expect(isValidWebhookUrl('http://0x7f.0.0.1/x')).toBe(false);   // hex octet
    expect(isValidWebhookUrl('http://0177.0.0.1/x')).toBe(false);   // octal
    expect(isValidWebhookUrl('http://127.1/x')).toBe(false);        // short form
  });

  test('rejects internal IPv6', () => {
    expect(isValidWebhookUrl('http://[::1]/x')).toBe(false);
    expect(isValidWebhookUrl('http://[fe80::1]/x')).toBe(false);
    expect(isValidWebhookUrl('http://[fd00::1]/x')).toBe(false);
    expect(isValidWebhookUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
  });
});

test('integrations router exports a Hono instance', () => {
  expect(integrations).toBeInstanceOf(Hono);
});

test('GET /api/v1/projects/:id/webhooks fails if no DB binding', async () => {
  // Test wiring - since there's no DB mock here, it should throw or return 500 when attempting to use c.env.DB
  const req = new Request('http://localhost/api/v1/projects/123/webhooks', {
    method: 'GET',
  });
  
  try {
    const res = await integrations.fetch(req);
    // If it doesn't throw, it should be 500 due to c.env.DB being undefined
    expect(res.status).toBe(500);
  } catch (e: any) {
    expect(e.message).toMatch(/env\.DB is undefined|Cannot read properties of undefined/);
  }
});
