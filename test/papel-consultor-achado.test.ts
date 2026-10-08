import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * Independência 9.2 numa sessão HUMANA: quem implementa não registra nem altera
 * achado de auditoria. A chave de API 'consultant' já era barrada
 * (auth-policy.ts); a sessão de um consultor não era.
 */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);
const json = (s: Record<string, string>) => ({ ...s, 'Content-Type': 'application/json' });
const ACHADO = JSON.stringify({ title: 'Achado de teste', severity: 'minor' });

let consultor: Record<string, string>;
let admin: Record<string, string>;

const contarAchados = async () =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_findings').first<{ n: number }>())!.n;

const MENSAGEM = 'consultor não registra achado de auditoria';

describe('consultor não registra achado de auditoria (sessão humana)', () => {
  beforeAll(async () => {
    await applySchema();
    consultor = json(await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }));
    admin = json(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' }));
  });

  it('consultor NÃO cria achado (POST /audits/:id/findings) e nada é gravado', async () => {
    const antes = await contarAchados();
    const res = await req('/api/v1/audits/aud-1/findings', { method: 'POST', headers: consultor, body: ACHADO });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(MENSAGEM);
    expect(await contarAchados()).toBe(antes);
  });

  it('consultor NÃO altera achado (PUT /audit-findings/:id)', async () => {
    const res = await req('/api/v1/audit-findings/af-1', { method: 'PUT', headers: consultor, body: ACHADO });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(MENSAGEM);
  });

  it('consultor NÃO apaga achado (DELETE /audit-findings/:id)', async () => {
    const res = await req('/api/v1/audit-findings/af-1', { method: 'DELETE', headers: consultor });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(MENSAGEM);
  });

  it('a regra barra escrita, não leitura: o GET não traz a mensagem do gate', async () => {
    const res = await req('/api/v1/audits/aud-1/findings', { headers: consultor });
    expect(await res.text()).not.toContain(MENSAGEM);
  });

  it('o bloqueio é do papel consultor, não da rota: platform_admin passa pela mesma guarda', async () => {
    const res = await req('/api/v1/audits/aud-1/findings', { method: 'POST', headers: admin, body: ACHADO });
    expect(await res.text()).not.toContain(MENSAGEM);
  });
});
