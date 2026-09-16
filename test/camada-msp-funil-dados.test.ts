import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetSessions } from './helpers/d1';

/**
 * Task 9 — as consultas do funil comercial (leads/assessments/proposals),
 * da carteira (`/portfolio`) e das contagens do dashboard passam a filtrar
 * por `conta_id`. `camada-msp-funil.test.ts` já provou QUEM entra no
 * roteador (`somenteMsp`); este arquivo prova QUAIS LINHAS voltam.
 */
describe('dados do funil isolados por conta', () => {
  beforeAll(async () => {
    await applySchema();
    await seedMatrizMsp();
    await resetSessions();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads (id, company_name, contact_email, status, conta_id) VALUES ('lead-a', 'Prospect da A', 'a@x.com', 'New', 'conta-a')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, contact_email, status, conta_id) VALUES ('lead-b', 'Prospect da B', 'b@x.com', 'New', 'conta-b')`),
    ]);
  });

  it('a listagem devolve só os leads da própria conta', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    const body = await res.json<any>();
    const ids = (body.leads ?? body.results ?? body).map((l: any) => l.id);
    expect(ids).toContain('lead-a');
    expect(ids).not.toContain('lead-b');
  });

  it('LEAD DA OUTRA CONSULTORIA NÃO É ALCANÇÁVEL POR ID', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads/lead-b', { headers });
    expect([403, 404]).toContain(res.status);
  });

  it('lead criado nasce carimbado com a conta de quem criou', async () => {
    const headers = await sessionFor({ id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: 'Novo', contact_email: 'novo@x.com' }),
    });
    expect(res.status).toBeLessThan(300);
    const row = await env.DB.prepare(`SELECT conta_id FROM leads WHERE company_name = 'Novo'`).first<{ conta_id: string }>();
    expect(row?.conta_id).toBe('conta-b');
  });

  it('DELETE não remove lead de outra consultoria', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    await pedir(worker, '/api/v1/leads/lead-b', { method: 'DELETE', headers });
    const ainda = await env.DB.prepare(`SELECT id FROM leads WHERE id = 'lead-b'`).first();
    expect(ainda, 'consultor de conta-a apagou lead da conta-b').toBeTruthy();
  });

  /**
   * REQUISITO QUE NÃO PODE FICAR DE FORA (revisão do brief da Task 9): o
   * assessment grava a conta de quem CONDUZIU A VENDA — o dono do lead —,
   * nunca a de quem meramente operou a criação. Sem isso, um consultor de
   * conta-b que abra assessment sobre lead de conta-a materializa a venda de
   * A inteira (assessment → proposta → projeto → cliente) na carteira de B,
   * reabrindo por outro caminho o Critical que a Task 6 fechou em
   * /convert e /sign.
   */
  it('assessment de lead alheio nasce na conta do LEAD, não na de quem operou', async () => {
    const headers = {
      ...(await sessionFor({ id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null })),
      'Content-Type': 'application/json',
    };
    const res = await pedir(worker, '/api/v1/assessments', {
      method: 'POST',
      headers,
      body: JSON.stringify({ client_name: 'Prospect da A', lead_id: 'lead-a' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const { id } = await res.json<any>();
    const row = await env.DB.prepare('SELECT conta_id FROM assessments WHERE id = ?').bind(id).first<{ conta_id: string }>();
    expect(row?.conta_id, 'a venda da conta-a nasceu na carteira da conta-b').toBe('conta-a');
  });

  /**
   * ESCOPO AMPLIADO (revisão do brief da Task 9): `/portfolio` e as contagens
   * de `/dashboard/stats` vazavam a carteira inteira para qualquer staff,
   * pela mesma cadeia `projects.cliente_id → clientes.conta_id` que
   * `requireProjectAccess` já usa (Task 5). `seedMatrizMsp` já planta
   * proj-a1-27001/proj-a2-27001 na conta-a e proj-b1-27001 na conta-b.
   */
  describe('carteira e contagens do dashboard isoladas por conta', () => {
    it('consultor de conta-a não recebe o projeto de conta-b na carteira', async () => {
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/portfolio', { headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const { portfolio } = await res.json<any>();
      const ids = portfolio.map((p: any) => p.id);
      expect(ids).toEqual(expect.arrayContaining(['proj-a1-27001', 'proj-a2-27001']));
      expect(ids, 'consultor de conta-a recebeu projeto de outra consultoria').not.toContain('proj-b1-27001');
    });

    it('platform_admin continua vendo a carteira inteira (único papel global)', async () => {
      const headers = await sessionFor({ id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin', conta_id: null, cliente_id: null });
      const res = await pedir(worker, '/api/v1/portfolio', { headers });
      const { portfolio } = await res.json<any>();
      const ids = portfolio.map((p: any) => p.id);
      expect(ids).toEqual(expect.arrayContaining(['proj-a1-27001', 'proj-b1-27001', 'proj-c-27001']));
    });

    it('a contagem de leads do consultor de conta-a não inclui os de conta-b', async () => {
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/dashboard/stats', { headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const stats = await res.json<any>();
      expect(stats.leads, 'a contagem de leads inclui o funil de outra consultoria').toBe(1);
    });

    it('a contagem de projetos do consultor de conta-a não inclui o de conta-b', async () => {
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/dashboard/stats', { headers });
      const stats = await res.json<any>();
      expect(stats.projects).toBe(3); // proj-a1-27001, proj-a1-27701 e proj-a2-27001 (seedMatrizMsp)
    });
  });
});
