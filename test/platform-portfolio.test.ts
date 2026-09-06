import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * Portfólio e portal do cliente (`src/routes/platform.ts`).
 *
 * São os endpoints que decidem O QUE CADA CLIENTE VÊ, e estavam entre os menos
 * cobertos do backend (26,1% na `main`). O filtro deles não vem de middleware: cada
 * handler compara `user.client_project_id` por conta própria, o que os torna
 * exatamente o tipo de código que precisa de teste e não tinha.
 *
 * O caso do usuário ÓRFÃO — papel de cliente, `client_project_id` NULL — não é
 * hipótese: `createUserSchema` declara `client_project_id` como
 * `.nullable().optional()` e `role` como `z.string()` livre, então um
 * `platform_admin` cria essa conta hoje, sem contornar nada. É a mesma classe
 * que `middleware/auth.ts` já fecha para chave de API, com o mesmo argumento:
 * um escopo ausente tem de significar "nada", nunca "tudo".
 */

const A = 'proj-a';
const B = 'proj-b';

/** Atalho local: o `env` com stub de IA e a montagem vivem em `helpers/d1.ts`. */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);

describe('Portfólio e portal do cliente', () => {
  let admA: Record<string, string>;
  let admB: Record<string, string>;
  let staff: Record<string, string>;
  let orfao: Record<string, string>;
  let cisoA: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');

    await env.DB.batch([
      // `assessment_id` é o que a conversão de assessment grava, e é dele que o
      // portal do cliente deriva o vínculo com o funil comercial.
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, assessment_id) VALUES (?,?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active', 'as-1'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(B, 'Cliente B', 'ISO 27001', 'controller', 'Active'),

      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-adm-a', 'adm@a.com', senha, 'Admin do A', 'org_admin', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-adm-b', 'adm@b.com', senha, 'Admin do B', 'org_admin', B),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-staff', 'staff@ness.io', senha, 'Staff', 'platform_admin', null),
      // Papel de cliente SEM projeto — criável hoje pela rota de usuários.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-orfao', 'orfao@x.com', senha, 'Cliente sem projeto', 'org_admin', null),
      // Papel FORA da lista conhecida de papéis-cliente, escopado a um projeto.
      // `users.role` é TEXT livre e `createUserSchema.role` é `z.string()`: este
      // papel é criável hoje, e a própria suíte de IDOR já o usa.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-ciso-a', 'ciso@a.com', senha, 'CISO do A', 'ciso', A),

      env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status) VALUES (?,?,?,?,?)`)
        .bind('ph-1', A, 1, 'Fase 1', 'completed'),
      env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status) VALUES (?,?,?,?,?)`)
        .bind('ph-2', A, 2, 'Fase 2', 'pending'),

      env.DB.prepare(`INSERT INTO leads (id, company_name, status) VALUES (?,?,?)`).bind('lead-1', 'Empresa Lead', 'New'),
      env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, status) VALUES (?,?,?,?)`)
        .bind('as-1', 'lead-1', 'Empresa Lead', 'In Progress'),
      env.DB.prepare(`INSERT INTO proposals (id, lead_id, assessment_id, status, total_price) VALUES (?,?,?,?,?)`)
        .bind('prop-1', 'lead-1', 'as-1', 'Sent', 100000),

      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?,?)`)
        .bind('at-1', A, 'tok-auditor-valido', '2099-01-01T00:00:00Z'),
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?,?)`)
        .bind('at-2', A, 'tok-auditor-vencido', '2020-01-01T00:00:00Z'),
    ]);

    admA = await sessionFor({ id: 'u-adm-a', email: 'adm@a.com', role: 'org_admin', client_project_id: A });
    admB = await sessionFor({ id: 'u-adm-b', email: 'adm@b.com', role: 'org_admin', client_project_id: B });
    staff = await sessionFor({ id: 'u-staff', email: 'staff@ness.io', role: 'platform_admin' });
    orfao = await sessionFor({ id: 'u-orfao', email: 'orfao@x.com', role: 'org_admin', client_project_id: null });
    cisoA = await sessionFor({ id: 'u-ciso-a', email: 'ciso@a.com', role: 'ciso', client_project_id: A });
  });

  describe('GET /portfolio', () => {
    it('cliente vê só o próprio projeto', async () => {
      const res = await req('/api/v1/portfolio', { headers: admA });
      expect(res.status).toBe(200);
      const { portfolio } = await res.json() as any;
      expect(portfolio.map((p: any) => p.id)).toEqual([A]);
    });

    it('equipe ness. vê a carteira inteira', async () => {
      const res = await req('/api/v1/portfolio', { headers: staff });
      expect(res.status).toBe(200);
      const { portfolio } = await res.json() as any;
      expect(portfolio.map((p: any) => p.id).sort()).toEqual([A, B]);
    });

    it('papel FORA da lista de papéis-cliente é escopado, não promovido a plataforma', async () => {
      // A decisão de ver tudo é por allowlist de STAFF, não por allowlist de
      // papel-cliente: lista de cliente nunca é exaustiva com `role` livre.
      // Antes desta inversão, `ciso` do projeto A recebia a carteira inteira.
      const res = await req('/api/v1/portfolio', { headers: cisoA });
      expect(res.status).toBe(200);
      const { portfolio } = await res.json() as any;
      expect(portfolio.map((p: any) => p.id), 'papel desconhecido virou visão de plataforma').toEqual([A]);

      const stats = await req('/api/v1/dashboard/stats', { headers: cisoA });
      expect((await stats.json() as any).projects).toBe(1);
    });

    it('papel de cliente SEM projeto não vê nada (falha fechado, não aberto)', async () => {
      const res = await req('/api/v1/portfolio', { headers: orfao });
      expect(res.status).toBe(200);
      const { portfolio } = await res.json() as any;
      expect(portfolio, 'escopo ausente virou acesso total à carteira').toEqual([]);
    });
  });

  describe('GET /dashboard/stats', () => {
    it('cliente conta só o próprio projeto', async () => {
      const res = await req('/api/v1/dashboard/stats', { headers: admA });
      expect(res.status).toBe(200);
      expect((await res.json() as any).projects).toBe(1);
    });

    it('equipe ness. conta a plataforma inteira', async () => {
      const res = await req('/api/v1/dashboard/stats', { headers: staff });
      expect((await res.json() as any).projects).toBe(2);
    });

    it('papel de cliente SEM projeto não conta a plataforma inteira', async () => {
      const res = await req('/api/v1/dashboard/stats', { headers: orfao });
      expect(res.status).toBe(200);
      const stats = await res.json() as any;
      expect(stats.projects, 'escopo ausente virou contagem global').toBe(0);
    });

    it('cliente não conta o funil comercial da ness.', async () => {
      // `somenteNess` mantém o cliente fora de lead/proposta/assessment. A
      // contagem de leads escapava dessa política: era global para todos.
      const res = await req('/api/v1/dashboard/stats', { headers: admA });
      expect((await res.json() as any).leads, 'cliente vê o tamanho do funil').toBe(0);

      // E a equipe ness. continua contando de verdade.
      const dela = await req('/api/v1/dashboard/stats', { headers: staff });
      expect((await dela.json() as any).leads).toBe(1);
    });
  });

  describe('GET /client/dashboard', () => {
    it('devolve o projeto do cliente com o progresso das fases', async () => {
      const res = await req('/api/v1/client/dashboard', { headers: admA });
      expect(res.status, await res.clone().text()).toBe(200);
      const body = await res.json() as any;
      expect(body.project.id).toBe(A);
      expect(body.phases).toHaveLength(2);
      expect(body.progress_percent).toBe(50); // 1 de 2 fases concluída
    });

    it('conta sem projeto recebe 404, não o projeto de outro', async () => {
      const res = await req('/api/v1/client/dashboard', { headers: orfao });
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('Cliente B');
    });
  });

  /**
   * Portal do cliente — as duas rotas que estavam MORTAS.
   *
   * Começavam com `if (!user.client_lead_id) return 404`, e
   * `users.client_lead_id` nunca existiu: nem em `schema.sql`, nem em nenhuma
   * das 25 migrations, e o login não seleciona a coluna. Respondiam 404 para
   * qualquer usuário, sempre — inclusive com assessment e proposta no banco.
   *
   * A versão anterior deste arquivo FIXAVA aquele 404 e afirmava que ligar a
   * coluna faria o teste falhar. A coluna não foi criada: o vínculo já existe
   * no banco (`projects.assessment_id`, gravado pela conversão do assessment) e
   * é dali que as rotas passaram a derivá-lo. Um `users.client_lead_id` seria
   * um terceiro lugar guardando o mesmo vínculo, livre para divergir.
   *
   * O que estes testes verificam agora é o oposto do que verificavam: que o
   * cliente ALCANÇA o próprio assessment e a própria proposta — e só os dele.
   */
  describe('GET /client/assessment e /client/proposal', () => {
    it('cliente alcança o próprio assessment pelo projeto', async () => {
      const res = await req('/api/v1/client/assessment', { headers: admA });
      expect(res.status, await res.clone().text()).toBe(200);
      expect((await res.json() as any).assessment_id).toBe('as-1');
    });

    it('cliente alcança a própria proposta', async () => {
      const res = await req('/api/v1/client/proposal', { headers: admA });
      expect(res.status, await res.clone().text()).toBe(200);
      const body = await res.json() as any;
      expect(body.proposal_id).toBe('prop-1');
      expect(body.status).toBe('Sent');
    });

    it('cliente de OUTRO projeto não vê nada — o filtro é o projeto, não um id do corpo', async () => {
      // O `proj-b` não tem assessment vinculado. Se o filtro voltasse a sair de
      // um campo controlável pelo chamador, este é o caso que entregaria a
      // proposta do Cliente A ao Cliente B.
      const as = await req('/api/v1/client/assessment', { headers: admB });
      expect(as.status).toBe(404);
      const prop = await req('/api/v1/client/proposal', { headers: admB });
      expect(prop.status).toBe(404);
      expect(await prop.text()).not.toContain('prop-1');
    });

    it('conta de staff não tem portal de cliente', async () => {
      // `client_project_id` nulo não pode casar com projeto nenhum: escopo
      // ausente significa "nada", nunca "tudo".
      expect((await req('/api/v1/client/assessment', { headers: staff })).status).toBe(404);
      expect((await req('/api/v1/client/proposal', { headers: staff })).status).toBe(404);
      expect((await req('/api/v1/client/assessment', { headers: orfao })).status).toBe(404);
    });

    it('a proposta devolvida é a MAIS RECENTE do assessment', async () => {
      // O mesmo assessment gera proposta pela rota automática e pela manual.
      await env.DB.prepare(
        `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, created_at)
         VALUES (?,?,?,?,?, datetime('now','+1 day'))`
      ).bind('prop-2', 'lead-1', 'as-1', 'Draft', 120000).run();

      const res = await req('/api/v1/client/proposal', { headers: admA });
      expect((await res.json() as any).proposal_id).toBe('prop-2');

      await env.DB.prepare('DELETE FROM proposals WHERE id = ?').bind('prop-2').run();
    });

    it('a coluna client_lead_id continua não existindo — o vínculo sai do projeto', async () => {
      const cols = await env.DB.prepare('PRAGMA table_info(users)').all();
      const nomes = (cols.results as any[]).map(c => c.name);
      expect(nomes, 'client_lead_id foi criada — duplica um vínculo que projects.assessment_id já guarda').not.toContain('client_lead_id');
    });
  });

  describe('GET /auditor/:token/project', () => {
    it('token válido devolve o projeto e suas fases', async () => {
      const res = await req('/api/v1/auditor/tok-auditor-valido/project');
      expect(res.status, await res.clone().text()).toBe(200);
      const body = await res.json() as any;
      expect(body.project.id).toBe(A);
      expect(body.phases).toHaveLength(2);
    });

    it('token vencido é 401 — a expiração vale, não só a existência', async () => {
      const res = await req('/api/v1/auditor/tok-auditor-vencido/project');
      expect(res.status).toBe(401);
    });

    it('token inexistente é 401', async () => {
      expect((await req('/api/v1/auditor/nao-existe/project')).status).toBe(401);
    });
  });

  describe('Config de precificação', () => {
    it('grava e devolve, mesclada sobre o modelo padrão', async () => {
      const put = await req('/api/v1/pricing-config', {
        method: 'PUT',
        headers: { ...staff, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tributos: { iss: 0.07 } }),
      });
      expect(put.status, await put.clone().text()).toBe(200);

      const get = await req('/api/v1/pricing-config', { headers: staff });
      expect(get.status).toBe(200);
      const cfg = await get.json() as any;
      expect(cfg.tributos.iss).toBe(0.07);
      // A mesclagem preserva o que o corpo não mandou — senão salvar um campo
      // apagaria o resto do modelo financeiro.
      expect(Object.keys(cfg.taxaVendaPD ?? {}).length).toBeGreaterThan(0);
    });
  });
});
