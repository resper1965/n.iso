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
      env.DB.prepare(`INSERT INTO proposals (id, lead_id, status, total_price, conta_id) VALUES ('prop-a', 'lead-a', 'Draft', 50000, 'conta-a')`),
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

  it('conta_id não sai no JSON de GET /leads/:id — é escopo interno, não campo de produto', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads/lead-a', { headers });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json<any>();
    expect(body).not.toHaveProperty('conta_id');
  });

  it('conta_id não sai no JSON de GET /proposals/:id — mesma razão', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/proposals/prop-a', { headers });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json<any>();
    expect(body).not.toHaveProperty('conta_id');
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

    // Achado da varredura (segunda rodada de correção): a atribuição acima
    // protege ONDE o assessment nasce, mas é uma escrita SEPARADA na tabela
    // `leads` que avança o funil do lead alheio — sem gate, qualquer staff de
    // qualquer conta `msp` empurrava ('New' → 'Assessment') um lead que não é
    // dele só por referenciá-lo no corpo.
    const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-a').first<{ status: string }>();
    expect(lead?.status, 'operador de outra conta avançou o status do lead alheio').toBe('New');
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

    /**
     * `GET /dashboard` (sem `/stats`) tinha o MESMO defeito: contagens sem
     * `WHERE` para qualquer staff que passasse do guard de papel-cliente no
     * topo da rota. Mesma correção de `/dashboard/stats`, mesmo teste.
     */
    it('GET /dashboard também escopa por conta, não só /dashboard/stats', async () => {
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/dashboard', { headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const stats = await res.json<any>();
      expect(stats.leads, 'GET /dashboard conta o funil de outra consultoria').toBe(1);
      expect(stats.projects, 'GET /dashboard conta o projeto de outra consultoria').toBe(3);
    });

    it('GET /dashboard continua global para platform_admin', async () => {
      const headers = await sessionFor({ id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin', conta_id: null, cliente_id: null });
      const res = await pedir(worker, '/api/v1/dashboard', { headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const stats = await res.json<any>();
      expect(stats.projects).toBe(5); // as 5 linhas de seedMatrizMsp
    });
  });

  /**
   * Varredura de escritas do funil (segunda rodada de correção): toda
   * escrita em `leads`/`assessments`/`proposals` que localiza a linha por um
   * id do corpo ou do path precisa conferir a conta antes de escrever.
   * `POST /proposals` (criação manual) tinha DOIS problemas: nenhum gate no
   * `assessment_id` de origem, e nenhuma relação conferida entre `lead_id` e
   * `assessment_id` — os dois vêm independentes no corpo. Fica depois das
   * contagens de carteira/dashboard acima de propósito: os leads que cria
   * aqui alterariam aquelas contagens se viessem antes.
   */
  describe('POST /proposals — escritas por id do corpo', () => {
    beforeAll(async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-a', 'Venda da A', 'in_progress', 'conta-a')`),
      ]);
    });

    it('assessment de origem de outra conta é recusado (404): não cria proposta nem toca o lead', async () => {
      const headers = {
        ...(await sessionFor({ id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_id: 'lead-a', assessment_id: 'assm-a', total_price: 1000, content_html: '<p>x</p>' }),
      });
      expect(res.status, await res.clone().text()).toBe(404);

      const semProposta = await env.DB.prepare(`SELECT COUNT(*) n FROM proposals WHERE assessment_id = 'assm-a'`).first<{ n: number }>();
      expect(semProposta?.n, 'proposta nasceu a partir de assessment de outra consultoria').toBe(0);
      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-a').first<{ status: string }>();
      expect(lead?.status, 'lead alheio avançou mesmo com a criação recusada').toBe('New');
    });

    it('lead_id de OUTRA conta, no corpo de uma proposta legítima, não é avançado (proposta nasce, lead alheio fica intacto)', async () => {
      // `assm-a` é da conta-a e o operador é da conta-a: a proposta É
      // legítima. Mas o `lead_id` do corpo aponta para `lead-b` (conta-b) —
      // as duas chaves vêm independentes no corpo, sem relação nenhuma
      // conferida no banco. A proposta nasce (o assessment de origem já foi
      // verificado), mas o lead que não é da mesma conta não é tocado.
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_id: 'lead-b', assessment_id: 'assm-a', total_price: 2000, content_html: '<p>y</p>' }),
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const { id } = await res.json<any>();

      const proposta = await env.DB.prepare('SELECT conta_id FROM proposals WHERE id = ?').bind(id).first<{ conta_id: string }>();
      expect(proposta?.conta_id).toBe('conta-a');
      const leadB = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-b').first<{ status: string }>();
      expect(leadB?.status, 'lead de outra conta foi avançado por um lead_id sem relação com o assessment').toBe('New');
    });

    it('caminho legítimo: assessment e lead da MESMA conta do operador — a proposta nasce e o lead avança', async () => {
      await env.DB.prepare(
        `INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-a2', 'Segundo prospect da A', 'New', 'conta-a')`
      ).run();
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_id: 'lead-a2', assessment_id: 'assm-a', total_price: 3000, content_html: '<p>z</p>' }),
      });
      expect(res.status, await res.clone().text()).toBe(201);

      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-a2').first<{ status: string }>();
      expect(lead?.status, 'fluxo legítimo deveria avançar o próprio lead').toBe('Proposal');
    });
  });
});
