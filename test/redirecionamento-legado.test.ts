// Hosts legados redirecionam para o canônico (Tarefa 8 da arrumação final). 308, não 301/302:
// preserva método e corpo, então POST de webhook, SCIM e token OAuth chegam inteiros.
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { workerEnv } from './helpers/d1';

const chamar = (url: string, init: RequestInit = {}) => app.fetch(new Request(url, init), workerEnv() as any, {} as any);

describe('redirecionamento dos hosts legados', () => {
  it('GET em n-iso.ness.com.br vira 308 para o canônico, com caminho e query', async () => {
    const res = await chamar('https://n-iso.ness.com.br/health?x=1');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://niso.ness.com.br/health?x=1');
  });

  it('POST em niso.ness.workers.dev vira 308 (método e corpo preservados), não 301/302', async () => {
    const res = await chamar('https://niso.ness.workers.dev/scim/v2/Users', {
      method: 'POST', headers: { 'Content-Type': 'application/scim+json' }, body: '{}',
    });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://niso.ness.com.br/scim/v2/Users');
  });

  it('rotas do OAuth/MCP no host legado também redirecionam', async () => {
    const res = await chamar('https://n-iso.ness.com.br/oauth/token', { method: 'POST', body: 'grant_type=x' });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://niso.ness.com.br/oauth/token');
  });

  it('o canônico NÃO redireciona', async () => {
    expect((await chamar('https://niso.ness.com.br/health')).status).toBe(200);
  });
});
