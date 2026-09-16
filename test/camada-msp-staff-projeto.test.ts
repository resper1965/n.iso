import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetSessions } from './helpers/d1';

/**
 * Regressão da Task 8: um rename mecânico trocou a guarda de staff antiga por
 * `somenteMsp` em TODA rota que a usava — inclusive SCIM, SSO e política de
 * segurança de projeto, que não são funil comercial. Resultado:
 * conta `direto` (cliente final que assina sozinho) perdia o direito de
 * configurar o próprio SSO/SCIM/MFA, porque `somenteMsp` também checa
 * `contas.tipo = 'msp'` — condição que só faz sentido para pré-venda.
 *
 * A correção divide a guarda em duas: `somenteStaff` (só pergunta "é staff?",
 * usada em SCIM/SSO/security-policy/trilha) e `somenteMsp` (pergunta "é staff
 * E a conta vende para terceiros?", usada só no funil comercial). Este arquivo
 * prova as duas metades: conta `direto` volta a configurar o próprio projeto,
 * e continua fora do funil.
 */

const PROJ = 'proj-c-27001'; // seedMatrizMsp: cli-c -> conta-c (tipo 'direto')

describe('somenteStaff x somenteMsp — divisão pós-regressão', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); await resetSessions(); });

  it('staff de conta DIRETA volta a configurar a política de segurança do próprio projeto', async () => {
    const headers = await sessionFor({
      id: 'u-c-staff', email: 'staff@c.com', role: 'consultor',
      conta_id: 'conta-c', cliente_id: null,
    });
    const res = await pedir(worker, `/api/v1/projects/${PROJ}/security-policy`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_obrigatorio: true }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it('staff de conta DIRETA volta a configurar o próprio SSO', async () => {
    const chaveCripto = (env as any).TOKEN_ENC_KEY;
    const headers = await sessionFor({
      id: 'u-c-staff', email: 'staff@c.com', role: 'consultor',
      conta_id: 'conta-c', cliente_id: null,
    });

    const leitura = await pedir(worker, `/api/v1/projects/${PROJ}/sso`, { headers });
    expect(leitura.status, await leitura.clone().text()).toBe(200);

    if (!chaveCripto) return; // sem TOKEN_ENC_KEY neste ambiente, só a leitura é verificável
    const escrita = await pedir(worker, `/api/v1/projects/${PROJ}/sso`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuer: 'https://idp.exemplo.com', client_id: 'cliente-niso', client_secret: 'segredo',
        dominios: 'gama.com', papel_padrao: 'org_user', ativo: true,
      }),
    });
    expect(escrita.status, await escrita.clone().text()).toBe(200);
  });

  it('USUÁRIO DE CLIENTE (org_admin) CONTINUA RECUSADO em security-policy e sso — a guarda de staff não afrouxou', async () => {
    const headers = await sessionFor({
      id: 'u-c-admin-cliente', email: 'admin@gama.com', role: 'org_admin',
      conta_id: null, cliente_id: 'cli-c',
    });
    const politica = await pedir(worker, `/api/v1/projects/${PROJ}/security-policy`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_obrigatorio: true }),
    });
    expect(politica.status).toBe(403);

    const sso = await pedir(worker, `/api/v1/projects/${PROJ}/sso`, { headers });
    expect(sso.status).toBe(403);
  });

  it('staff de conta DIRETA continua recusado no funil comercial (somenteMsp não afrouxou)', async () => {
    const headers = await sessionFor({
      id: 'u-c-staff', email: 'staff@c.com', role: 'consultor',
      conta_id: 'conta-c', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(403);
  });
});
