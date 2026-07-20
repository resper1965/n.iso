import { expect, test } from 'vitest';
import integrations from './integrations';
import type { Bindings, Variables } from '../index';
import { Hono } from 'hono';

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
