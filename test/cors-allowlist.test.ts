// S3 — CORS por allowlist (não mais `origin: '*'`). Origem conhecida é ecoada em
// Access-Control-Allow-Origin; origem desconhecida não recebe o header.
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';

const req = (origin?: string) =>
  app.fetch(
    new Request('http://localhost/health', {
      method: 'GET',
      headers: origin ? { Origin: origin } : {},
    }),
    env as any
  );

describe('CORS allowlist (S3)', () => {
  it('ecoa a origem permitida', async () => {
    const res = await req('https://niso.ness.com.br');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://niso.ness.com.br');
  });

  it('permite o domínio alternativo', async () => {
    const res = await req('https://n-iso.ness.com.br');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://n-iso.ness.com.br');
  });

  it('permite loopback localhost (dev Vite) em qualquer porta', async () => {
    const res = await req('http://localhost:5173');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('permite loopback 127.0.0.1 (dev Vite) em qualquer porta', async () => {
    const res = await req('http://127.0.0.1:5173');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  it('NÃO devolve ACAO para origem desconhecida', async () => {
    const res = await req('https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('não devolve curinga (*) em nenhum caso', async () => {
    const res = await req('https://niso.ness.com.br');
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });
});
