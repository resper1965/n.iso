import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema } from './helpers/d1';

/**
 * O OTP do portal público de políticas é a ÚNICA credencial que protege o acesso
 * às políticas de um tenant. Em produção ele NUNCA pode voltar no corpo da
 * resposta — senão qualquer um que conheça o project_id lê as políticas do
 * cliente sem nunca acessar o e-mail. O eco em `demo_otp` só existe em dev/test.
 */
const PID = 'proj-otp';
async function requestOtp(environment: string) {
  const e = { ...env, ENVIRONMENT: environment } as any;
  return worker.fetch(new Request('http://localhost/api/v1/public/policies/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: PID, email: 'titular@cliente.com' }),
  }), e);
}

describe('OTP do portal público de políticas', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind(PID, 'Cliente OTP', 'ISO 27001', 'controller', 'Active').run();
  });

  it('em produção NÃO retorna o OTP no corpo, mas o grava no KV', async () => {
    const res = await requestOtp('production');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.demo_otp).toBeUndefined();
    // A mensagem não pode conter o código (nada de 6 dígitos vazando).
    expect(body.message).not.toMatch(/\d{6}/);
    // Mas o OTP foi gerado e guardado no KV para o verify-otp.
    const stored = await env.SESSIONS.get('otp_proj-otp_titular@cliente.com');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).otp).toMatch(/^\d{6}$/);
  });

  it('em dev/test o eco demo_otp existe (afordância de demonstração)', async () => {
    const res = await requestOtp('test');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.demo_otp).toMatch(/^\d{6}$/);
  });

  it('rate-limit: após 5 pedidos no mesmo projeto+e-mail, o 6º é 429', async () => {
    const e = { ...env, ENVIRONMENT: 'test' } as any;
    const pedir = () => worker.fetch(new Request('http://localhost/api/v1/public/policies/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: PID, email: 'flood@cliente.com' }),
    }), e);
    for (let i = 0; i < 5; i++) {
      expect((await pedir()).status).toBe(200);
    }
    expect((await pedir()).status).toBe(429);
  });
});
