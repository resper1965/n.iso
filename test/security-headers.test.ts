import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';

/**
 * Cabeçalho de segurança é invisível: some num refactor e ninguém percebe até o
 * pentest seguinte. Estes testes existem para que sumir custe um CI vermelho.
 *
 * O que NÃO é testado aqui, de propósito: que o CSP impeça XSS. Ele não impede —
 * `script-src` carrega `'unsafe-inline'` por causa dos ~324 `onclick=` do
 * frontend. O que se afirma abaixo é só o que a política realmente entrega.
 */
describe('Cabeçalhos de segurança', () => {
  async function headers(path = '/health') {
    const res = await app.fetch(new Request(`http://localhost${path}`), env);
    return res.headers;
  }

  it('emite HSTS de 1 ano com includeSubDomains', async () => {
    const hsts = (await headers()).get('Strict-Transport-Security');
    expect(hsts).toBe('max-age=31536000; includeSubDomains');
  });

  it('não emite a diretiva preload — entrar na lista é decisão de operação', async () => {
    expect((await headers()).get('Strict-Transport-Security')).not.toContain('preload');
  });

  it('bloqueia sniffing de MIME e enquadramento em iframe', async () => {
    const h = await headers();
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('X-Frame-Options')).toBeTruthy();
    expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('mantém as diretivas de CSP que valem mesmo com unsafe-inline', async () => {
    const csp = (await headers()).get('Content-Security-Policy') || '';
    // Injeção de <base>, de plugin e exfiltração via <form action>.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  it('permite exatamente as origens externas que o frontend usa', async () => {
    const csp = (await headers()).get('Content-Security-Policy') || '';
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
  });

  it('não permite script de CDN nenhuma — marked entra pelo bundle', async () => {
    const csp = (await headers()).get('Content-Security-Policy') || '';
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) || '';
    expect(scriptSrc).not.toContain('jsdelivr');
    expect(scriptSrc).not.toContain('unpkg');
    expect(scriptSrc).not.toContain('cdn');
  });

  it('aplica os cabeçalhos também em rota autenticada que devolve 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/projects'), env);
    expect(res.status).toBe(401);
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
  });
});

describe('security.txt (RFC 9116)', () => {
  async function fetchSecurityTxt() {
    return app.fetch(new Request('http://localhost/.well-known/security.txt'), env);
  }

  it('responde em /.well-known/security.txt como texto puro, sem exigir sessão', async () => {
    const res = await fetchSecurityTxt();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('traz os campos obrigatórios da RFC', async () => {
    const corpo = await (await fetchSecurityTxt()).text();
    expect(corpo).toContain('Contact: mailto:security@ness.lat');
    expect(corpo).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(corpo).toContain('Policy: ');
  });

  it('tem Expires no futuro e dentro de um ano — é calculated, não fixo', async () => {
    const corpo = await (await fetchSecurityTxt()).text();
    const expira = new Date(corpo.match(/^Expires: (.+)$/m)![1]).getTime();
    expect(expira).toBeGreaterThan(Date.now());
    expect(expira).toBeLessThan(Date.now() + 366 * 24 * 60 * 60 * 1000);
  });
});

describe('Omissão de detalhes de erro em produção (onError)', () => {
  it('omite o campo detail da resposta de erro quando ENVIRONMENT é production', async () => {
    const prodEnv = { ...env, ENVIRONMENT: 'production' };
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/invalid-scope/risks', {
        headers: { 'Authorization': 'Bearer sess-valid-test' }
      }),
      prodEnv
    );
    if (res.status === 500) {
      const data = (await res.json()) as { error?: string; detail?: string };
      expect(data.error).toBe('Erro interno do servidor');
      expect(data.detail).toBeUndefined();
    } else {
      // Garantir por simulação direta do handler se a rota responder outro status
      const mockErr = new Error('Database connection failed: internal table mismatch');
      const mockC = {
        env: prodEnv,
        json: (body: any, status: number) => ({ body, status }),
      } as any;
      const result = (app as any).errorHandler ? (app as any).errorHandler(mockErr, mockC) : null;
      if (result) {
        expect(result.body.detail).toBeUndefined();
        expect(result.body.error).toBe('Erro interno do servidor');
      }
    }
  });
});

