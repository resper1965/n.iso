import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * A área comercial (leads, propostas, precificação) é o CRM da própria ness.:
 * prospects de outras empresas, CNPJ, preço, custo interno e margem. Só
 * `platform_admin` e `comercial` entram.
 *
 * Antes desta regra as rotas não checavam papel nem tenant: `GET /leads` era
 * `SELECT * FROM leads`, e qualquer sessão autenticada — inclusive usuário de
 * cliente e chave de API de projeto — lia a carteira inteira. `org_admin`
 * passava pela trava de escrita e alterava a tabela de preços.
 */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);

const RECUSADOS = ['org_user', 'org_admin', 'client', 'consultor'] as const;

describe('Área comercial: só platform_admin e comercial', () => {
  beforeAll(async () => {
    await applySchema();
  });

  for (const role of RECUSADOS) {
    it(`${role} não lista leads`, async () => {
      const s = await sessionFor({ id: `u-${role}`, email: `${role}@x.com`, role, client_project_id: 'p-1' });
      expect((await req('/api/v1/leads', { headers: s })).status).toBe(403);
    });

    it(`${role} não lista propostas`, async () => {
      const s = await sessionFor({ id: `u-${role}`, email: `${role}@x.com`, role, client_project_id: 'p-1' });
      expect((await req('/api/v1/proposals', { headers: s })).status).toBe(403);
    });
  }

  it('org_admin não altera a tabela de preços', async () => {
    const s = {
      ...(await sessionFor({ id: 'u-oa', email: 'oa@x.com', role: 'org_admin', client_project_id: 'p-1' })),
      'Content-Type': 'application/json',
    };
    const res = await req('/api/v1/proposals/config/pricing', { method: 'PUT', headers: s, body: '{"margem":0}' });
    expect(res.status).toBe(403);
  });

  // Segunda porta para a MESMA tabela de preços (settings.pricing_config), sem
  // trava nenhuma: custo interno, tributos e margem para qualquer sessão.
  for (const role of RECUSADOS) {
    it(`${role} não lê nem altera /pricing-config`, async () => {
      const s = {
        ...(await sessionFor({ id: `u-pc-${role}`, email: `pc-${role}@x.com`, role, client_project_id: 'p-1' })),
        'Content-Type': 'application/json',
      };
      expect((await req('/api/v1/pricing-config', { headers: s })).status).toBe(403);
      expect((await req('/api/v1/pricing-config', { method: 'PUT', headers: s, body: '{"margem":0}' })).status).toBe(403);
    });
  }

  it('consultor não lê nem grava o preço de um assessment', async () => {
    const s = {
      ...(await sessionFor({ id: 'u-cons3', email: 'c3@x.com', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
    expect((await req('/api/v1/assessments/qualquer/pricing', { headers: s })).status).toBe(403);
    expect((await req('/api/v1/assessments/qualquer/pricing', { method: 'PUT', headers: s, body: '{"precoFinal":1}' })).status).toBe(403);
  });

  it('consultor não gera proposta a partir do assessment (preço é ato comercial)', async () => {
    const s = {
      ...(await sessionFor({ id: 'u-cons2', email: 'c2@x.com', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
    const res = await req('/api/v1/assessments/qualquer/generate-proposal', { method: 'POST', headers: s, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('painel: consultor não vê quantos leads existem; comercial vê', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO leads (id, company_name) VALUES ('lead-1', 'Prospect X')`).run();
    const consultor = await sessionFor({ id: 'u-cons', email: 'c@x.com', role: 'consultor' });
    const comercial = await sessionFor({ id: 'u-com', email: 'v@x.com', role: 'comercial' });
    const deConsultor = await (await req('/api/v1/dashboard/stats', { headers: consultor })).json<any>();
    const deComercial = await (await req('/api/v1/dashboard/stats', { headers: comercial })).json<any>();
    expect(deConsultor.leads).toBe(0);
    expect(deComercial.leads).toBe(1);
  });

  for (const role of ['platform_admin', 'comercial']) {
    it(`${role} lista leads e propostas`, async () => {
      const s = await sessionFor({ id: `u-${role}`, email: `${role}@x.com`, role });
      expect((await req('/api/v1/leads', { headers: s })).status).toBe(200);
      expect((await req('/api/v1/proposals', { headers: s })).status).toBe(200);
    });
  }
});
