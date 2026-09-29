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
   * REQUISITO QUE NÃO PODE FICAR DE FORA (revisão do brief da Task 9), depois
   * fechado de vez (terceira revisão): "atribuição correta não conserta
   * escrita de terceiro no funil de quem vendeu" — o mesmo argumento que
   * fechou `/convert` e `/sign` vale para a CRIAÇÃO do assessment. A versão
   * antiga desta regra deixava a criação passar (201) e só corrigia a conta
   * gravada; isso produzia um assessment que o próprio criador não conseguia
   * operar depois (`/convert`/`/sign` já recusam quem não é da conta de
   * origem) — poluição na carteira do concorrente com o próximo passo
   * travado. Você só opera o funil da SUA conta: lead de OUTRA consultoria
   * responde 404 na criação, não 403 (confirmaria a existência do lead na
   * consultoria concorrente).
   *
   * A regra de atribuição (Ruling 14: o assessment nasce na conta do LEAD,
   * não do operador) continua viva — só deixa de ser exercida por operador
   * alheio. Os dois caminhos legítimos que restam, cobertos abaixo:
   * `platform_admin` (papel global) e lead SEM DONO (`conta_id` nulo, cai no
   * operador — fallback da própria fórmula de atribuição).
   *
   * Fica depois das contagens de carteira/dashboard acima de propósito: os
   * leads que cria aqui (conta-a) alterariam aquelas contagens se viessem
   * antes.
   */
  describe('POST /assessments — a criação em si é escopada', () => {
    it('CONSULTOR DE OUTRA CONSULTORIA NÃO CRIA assessment sobre lead alheio (404, não 403)', async () => {
      const headers = {
        ...(await sessionFor({ id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_name: 'Prospect da A', lead_id: 'lead-a' }),
      });
      expect(res.status, await res.clone().text()).toBe(404);

      const semAssessment = await env.DB.prepare(`SELECT COUNT(*) n FROM assessments WHERE lead_id = 'lead-a'`).first<{ n: number }>();
      expect(semAssessment?.n, 'assessment nasceu sobre lead de outra consultoria mesmo com a criação recusada').toBe(0);

      // Redundante com o 404 acima de propósito (decisão explícita): antes
      // esta era a asserção PRINCIPAL, provando que a atribuição corrigia a
      // conta mesmo com a criação passando. Hoje a criação nem passa — mas
      // manter a checagem de que o status do lead alheio não se move não
      // custa nada e sustenta a regra por dois lados.
      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-a').first<{ status: string }>();
      expect(lead?.status, 'operador de outra conta avançou o status do lead alheio').toBe('New');
    });

    /**
     * Achado da revisão (4ª rodada): o gate só disparava com `lead` truthy —
     * `lead_id` de outra conta dava 404, `lead_id` INEXISTENTE dava 201. A
     * diferença sozinha respondia "esse id existe em outra consultoria?",
     * que é exatamente o que a decisão de 404 existe para negar. As duas
     * respostas agora são idênticas.
     */
    it('lead_id INEXISTENTE também é 404 — não um oráculo que diferencia "alheio" de "não existe"', async () => {
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_name: 'Prospect fantasma', lead_id: 'lead-nao-existe' }),
      });
      expect(res.status, await res.clone().text()).toBe(404);
      const semAssessment = await env.DB.prepare(`SELECT COUNT(*) n FROM assessments WHERE lead_id = 'lead-nao-existe'`).first<{ n: number }>();
      expect(semAssessment?.n, 'assessment nasceu com lead_id pendurado no vazio').toBe(0);
    });

    it('platform_admin cria assessment sobre lead de qualquer conta, e ele nasce na conta do LEAD (Ruling 14 continua valendo)', async () => {
      await env.DB.prepare(
        `INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-a-plataforma', 'Prospect da A via plataforma', 'New', 'conta-a')`
      ).run();
      const headers = {
        ...(await sessionFor({ id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin', conta_id: null, cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_name: 'Prospect da A via plataforma', lead_id: 'lead-a-plataforma' }),
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const { id } = await res.json<any>();
      const row = await env.DB.prepare('SELECT conta_id FROM assessments WHERE id = ?').bind(id).first<{ conta_id: string }>();
      expect(row?.conta_id, 'o assessment tem de nascer na conta do LEAD, não órfão do platform_admin').toBe('conta-a');
    });

    it('lead sem dono (conta_id nulo) cai no operador — segundo caminho legítimo da atribuição', async () => {
      await env.DB.prepare(`INSERT INTO leads (id, company_name, status) VALUES ('lead-sem-dono', 'Prospect sem dono', 'New')`).run();
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_name: 'Prospect assumido pela A', lead_id: 'lead-sem-dono' }),
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const { id } = await res.json<any>();
      const row = await env.DB.prepare('SELECT conta_id FROM assessments WHERE id = ?').bind(id).first<{ conta_id: string }>();
      expect(row?.conta_id, 'lead sem dono deveria ser assumido pelo operador').toBe('conta-a');
      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-sem-dono').first<{ status: string }>();
      expect(lead?.status, 'lead assumido deveria avançar no funil').toBe('Assessment');
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

    /**
     * Achado da revisão (4ª rodada): esta rotina, na versão anterior, media
     * o estado VULNERÁVEL como esperado — esperava 201 e só conferia que o
     * `status` do lead alheio não avançava. Isso não bastava: o `lead_id` de
     * `lead-b` era gravado CRU na proposta mesmo assim ("lavagem de id" —
     * validar o assessment não valida o que veio junto no corpo), e reaparecia
     * sem checagem em toda leitura que faz `JOIN leads` (a listagem, `GET
     * /:id`) e em `/sign`, que chegava a marcar o lead alheio como `'Won'`.
     * Invertido: `lead_id` de outra conta agora recusa a criação inteira.
     */
    it('lead_id de OUTRA conta no corpo é recusado (404) mesmo com assessment_id legítimo — não fica gravado cru na proposta', async () => {
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_id: 'lead-b', assessment_id: 'assm-a', total_price: 2000, content_html: '<p>y</p>' }),
      });
      expect(res.status, await res.clone().text()).toBe(404);

      const semProposta = await env.DB.prepare(`SELECT COUNT(*) n FROM proposals WHERE lead_id = 'lead-b'`).first<{ n: number }>();
      expect(semProposta?.n, 'proposta nasceu com lead_id de outra consultoria gravado cru').toBe(0);
      const leadB = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-b').first<{ status: string }>();
      expect(leadB?.status, 'lead de outra conta foi avançado').toBe('New');
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

  /**
   * "Lavagem de id" (achado da revisão, 4ª rodada): um id do corpo, gravado
   * cru DENTRO de uma linha que passou pelo gate, sai do outro lado parecendo
   * confiável — porque a checagem foi na linha que o carrega, não no id em
   * si. Os gates de criação (acima) fecham o vazamento para DAQUI PRA FRENTE;
   * estes três testes provam a defesa em profundidade para dado LEGADO — uma
   * proposta/assessment que já carregava um `lead_id` alheio de antes de os
   * gates existirem. Os fixtures abaixo simulam esse legado com `INSERT`
   * direto (o gate na criação impede reproduzir isso pela própria API).
   */
  describe('defesa em profundidade contra lead_id alheio em dado legado', () => {
    it('/sign não usa dado do lead alheio nem o marca como Won, mesmo com lead_id legado gravado na proposta', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO leads (id, company_name, razao_social, cnpj, status, conta_id) VALUES ('lead-b-legado', 'Empresa Legado B', 'Legado B Razão Social', '11222333000199', 'Proposal', 'conta-b')`),
        env.DB.prepare(`INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-legado-sign', 'Cliente Legado A', 'in_progress', 'conta-a')`),
        env.DB.prepare(`INSERT INTO proposals (id, lead_id, assessment_id, status, conta_id) VALUES ('prop-legado-sign', 'lead-b-legado', 'assm-legado-sign', 'Draft', 'conta-a')`),
      ]);
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/proposals/prop-legado-sign/sign', { method: 'POST', headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const { project_id } = await res.json<any>();

      // O nome que vira projeto/cliente é o do assessment (fallback seguro),
      // nunca o da empresa alheia gravada no lead legado.
      const projeto = await env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(project_id).first<{ client_name: string }>();
      expect(projeto?.client_name, 'nome da empresa alheia vazou para o projeto').toBe('Cliente Legado A');

      // O lead alheio não é marcado como Won — essa é a mutação irreversível
      // que este handler existe para proteger.
      const leadAlheio = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-b-legado').first<{ status: string }>();
      expect(leadAlheio?.status, 'lead de outra consultoria foi marcado Won por uma proposta que não é dela').not.toBe('Won');
    });

    it('/convert não usa o CNPJ do lead alheio para materializar cliente, mesmo com lead_id legado gravado no assessment', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO leads (id, company_name, cnpj, status, conta_id) VALUES ('lead-b-cnpj', 'Empresa CNPJ B', '99888777000166', 'New', 'conta-b')`),
        env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, status, conta_id) VALUES ('assm-legado-convert', 'lead-b-cnpj', 'Cliente Convert Legado', 'in_progress', 'conta-a')`),
      ]);
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/assessments/assm-legado-convert/convert', { method: 'POST', headers });
      expect(res.status, await res.clone().text()).toBe(201);
      const { project_id } = await res.json<any>();

      const cliente = await env.DB.prepare(
        `SELECT c.cnpj FROM projects p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
      ).bind(project_id).first<{ cnpj: string | null }>();
      expect(cliente?.cnpj, 'CNPJ do lead de outra consultoria vazou para o cliente de quem converteu').not.toBe('99888777000166');
    });

    it('/generate-proposal não grava o lead_id alheio na proposta gerada, mesmo com lead_id legado no assessment', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-b-genprop', 'Empresa GenProp B', 'New', 'conta-b')`),
        env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, status, conta_id) VALUES ('assm-legado-genprop', 'lead-b-genprop', 'Cliente GenProp Legado', 'in_progress', 'conta-a')`),
      ]);
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments/assm-legado-genprop/generate-proposal', {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      expect(res.status, await res.clone().text()).toBeLessThan(300);
      const { proposal_id } = await res.json<any>();

      const proposta = await env.DB.prepare('SELECT lead_id FROM proposals WHERE id = ?').bind(proposal_id).first<{ lead_id: string | null }>();
      expect(proposta?.lead_id, 'lead_id de outra consultoria vazou para a proposta gerada automaticamente').toBeNull();
    });

    /**
     * Caminho feliz sem cobertura (achado da re-revisão): o único teste de
     * `/generate-proposal` até aqui afirmava `lead_id === null` (caso
     * alheio). Uma regressão que passasse a anular o `lead_id` SEMPRE
     * (mesma conta inclusive) ficaria verde sem este teste — e o sintoma é
     * silencioso: proposta sem lead, listagem sem `company_name`, `/sign`
     * caindo no nome do assessment em vez de travar em nada visível.
     */
    it('/generate-proposal PRESERVA o lead_id quando o lead é da MESMA conta do assessment', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-a-genprop', 'Prospect A GenProp', 'New', 'conta-a')`),
        env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, status, conta_id) VALUES ('assm-a-genprop', 'lead-a-genprop', 'Cliente A GenProp', 'in_progress', 'conta-a')`),
      ]);
      const headers = {
        ...(await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null })),
        'Content-Type': 'application/json',
      };
      const res = await pedir(worker, '/api/v1/assessments/assm-a-genprop/generate-proposal', {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      expect(res.status, await res.clone().text()).toBeLessThan(300);
      const { proposal_id } = await res.json<any>();

      const proposta = await env.DB.prepare('SELECT lead_id FROM proposals WHERE id = ?').bind(proposal_id).first<{ lead_id: string | null }>();
      expect(proposta?.lead_id, 'fluxo legítimo perdeu o lead_id que deveria preservar').toBe('lead-a-genprop');
    });
  });

  /**
   * O gêmeo do Critical anterior (re-revisão, 6ª rodada): `proposal.assessment_id`
   * é o MESMO padrão de `proposal.lead_id` — um id gravado dentro da proposta
   * já verificada, nunca checado por si só. Sem revalidar em `/sign`,
   * `assessmentDaProposta.client_name` fazia `clientName` cair no nome do
   * cliente de uma assessment ALHEIA, materializando esse nome como cliente
   * na carteira de quem assina; e `projects.assessment_id` gravava o id cru,
   * que É lido de volta em `platform.ts` (`GET /client/assessment`, `GET
   * /client/proposal`) — ao contrário de `contracts.lead_id`, a exceção
   * registrada sem caminho de leitura.
   */
  describe('proposals.ts /:id/sign — assessment_id é o gêmeo do lead_id', () => {
    it('/sign não usa o nome do assessment alheio nem grava assessment_id alheio no projeto', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-b-sign-gemeo', 'Empresa Gêmeo B', 'in_progress', 'conta-b')`),
        env.DB.prepare(`INSERT INTO proposals (id, assessment_id, status, conta_id) VALUES ('prop-gemeo-sign', 'assm-b-sign-gemeo', 'Draft', 'conta-a')`),
      ]);
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/proposals/prop-gemeo-sign/sign', { method: 'POST', headers });
      // Sem lead e com o assessment alheio recusado por revalidação, não
      // sobra nome nenhum para determinar o cliente — recusa em vez de
      // inventar (mesma regra do "balde" já documentada no handler).
      expect(res.status, await res.clone().text()).toBe(400);

      const semProjeto = await env.DB.prepare(`SELECT COUNT(*) n FROM projects WHERE assessment_id = 'assm-b-sign-gemeo'`).first<{ n: number }>();
      expect(semProjeto?.n, 'projeto nasceu com assessment_id de outra consultoria gravado cru').toBe(0);
    });

    it('caminho legítimo: assessment da MESMA conta preserva o nome e o assessment_id do projeto', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-a-sign-gemeo', 'Cliente Gêmeo A', 'in_progress', 'conta-a')`),
        env.DB.prepare(`INSERT INTO proposals (id, assessment_id, status, conta_id) VALUES ('prop-gemeo-sign-legitimo', 'assm-a-sign-gemeo', 'Draft', 'conta-a')`),
      ]);
      const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
      const res = await pedir(worker, '/api/v1/proposals/prop-gemeo-sign-legitimo/sign', { method: 'POST', headers });
      expect(res.status, await res.clone().text()).toBe(200);
      const { project_id } = await res.json<any>();

      const projeto = await env.DB.prepare('SELECT client_name, assessment_id FROM projects WHERE id = ?').bind(project_id).first<{ client_name: string; assessment_id: string }>();
      expect(projeto?.client_name, 'fluxo legítimo deveria usar o nome do próprio assessment').toBe('Cliente Gêmeo A');
      expect(projeto?.assessment_id, 'fluxo legítimo deveria preservar o assessment_id').toBe('assm-a-sign-gemeo');
    });
  });
});
