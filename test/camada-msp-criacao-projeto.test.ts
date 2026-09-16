import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetData, resetSessions } from './helpers/d1';

describe('criação de projeto pendura o cliente', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
  });

  it('projeto criado por staff nasce no cliente, e o criador o alcança', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Empresa Nova', standards: 'ISO 27001' }),
    });
    expect(res.status).toBeLessThan(300);

    const proj = await env.DB.prepare(
      `SELECT p.id, p.cliente_id, c.conta_id FROM projects p
         JOIN clientes c ON c.id = p.cliente_id
        WHERE p.client_name = 'Empresa Nova'`
    ).first<{ id: string; cliente_id: string; conta_id: string }>();

    expect(proj?.cliente_id).toBeTruthy();
    expect(proj?.conta_id).toBe('conta-a');

    // O ponto que importa: o projeto novo é ALCANÇÁVEL. Órfão daria 403.
    const leitura = await pedir(worker, `/api/v1/projects/${proj!.id}/risks`, { headers });
    expect(leitura.status).toBe(200);
  });

  it('segundo projeto do mesmo cliente reusa o cliente, não cria outro', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const corpo = (escopo: string) => ({
      method: 'POST' as const,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Repetida', standards: escopo }),
    });
    await pedir(worker, '/api/v1/projects', corpo('ISO 27001'));
    await pedir(worker, '/api/v1/projects', corpo('ISO 27701'));

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM clientes WHERE nome = 'Repetida' AND conta_id = 'conta-a'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('MESMO NOME EM CONSULTORIAS DIFERENTES SÃO CLIENTES DIFERENTES', async () => {
    const criar = async (userId: string, contaId: string) => {
      const headers = await sessionFor({
        id: userId, email: `${userId}@x.com`, role: 'consultor',
        conta_id: contaId, cliente_id: null,
      });
      return pedir(worker, '/api/v1/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Homônima', standards: 'ISO 27001' }),
      });
    };
    await criar('u-a-consultor', 'conta-a');
    await criar('u-b-consultor', 'conta-b');

    const { results } = await env.DB.prepare(
      `SELECT conta_id FROM clientes WHERE nome = 'Homônima' ORDER BY conta_id`
    ).all<{ conta_id: string }>();
    expect(results.map(r => r.conta_id)).toEqual(['conta-a', 'conta-b']);
  });

  it('deduplica por CNPJ mesmo com o nome escrito diferente', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const criar = (nome: string) => pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: nome, standards: 'ISO 27001', cnpj: '11222333000181' }),
    });
    await criar('Acme S.A.');
    await criar('Acme SA');

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM clientes WHERE cnpj = '11222333000181'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('criador sem conta e sem conta_id no corpo é recusado, não cria órfão', async () => {
    const headers = await sessionFor({
      id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin',
      conta_id: null, cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Sem Dono', standards: 'ISO 27001' }),
    });
    expect(res.status).toBe(400);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE client_name = 'Sem Dono'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
