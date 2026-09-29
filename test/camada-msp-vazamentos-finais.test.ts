import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetData, resetSessions } from './helpers/d1';
import { hashPassword, sha256Hex } from '../src/helpers';
import { provisionar } from '../src/sso';
import { checkCoherence } from '../src/services/coherence';

/**
 * Os quatro caminhos que a revisão FINAL do branch achou, e que nenhuma das dez
 * tarefas alcançou — todas trabalharam a partir de briefs que nomeavam rotas
 * específicas, e estes ficam fora delas.
 *
 * O ator que importa neste arquivo é o `consultor` da conta B. As varreduras de
 * contrato usavam `org_admin` com `client_project_id`, e toda guarda que é
 * allowlist de papel-CLIENTE responde 403 pelo ramo de cliente — o ramo de
 * STAFF, onde os buracos estavam, nunca era exercitado. É por isso que C1 e C2
 * ficaram verdes por dez tarefas.
 */

const CONSULTOR_B = { id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null };
const CONSULTOR_A = { id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const PLATAFORMA = { id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin' };

const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });

describe('C1 — /api/v1/projects sem middleware: listagem e item', () => {
  let b: Record<string, string>;
  let a: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
    b = await sessionFor(CONSULTOR_B);
    a = await sessionFor(CONSULTOR_A);
  });

  it('GET /projects devolve SÓ a carteira da conta do staff', async () => {
    // Antes: `SELECT * FROM projects ORDER BY created_at DESC`, sem `WHERE`, para
    // todo papel não-cliente — a carteira de TODAS as consultorias, inclusive a
    // da conta direta, numa requisição sem parâmetro nenhum.
    const res = await pedir(worker, '/api/v1/projects', { headers: b });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as any[]).map((p) => p.id).sort();
    expect(ids).toEqual(['proj-b1-27001']);
  });

  it('GET /projects não devolve projeto de conta DIRETA para staff de MSP', async () => {
    const res = await pedir(worker, '/api/v1/projects', { headers: a });
    const ids = ((await res.json()) as any[]).map((p) => p.id).sort();
    expect(ids).toEqual(['proj-a1-27001', 'proj-a1-27701', 'proj-a2-27001']);
    expect(ids).not.toContain('proj-c-27001');
  });

  /*
   * ATENÇÃO: os três casos abaixo (`GET /:id` alheio, `GET /:id` próprio,
   * `PUT /:id` alheio) NÃO DISCRIMINAM a correção — eles já eram verdes no código
   * anterior, e foi medido antes de escrevê-los. O `projectAccessMiddleware`
   * montado em `/api/v1/projects/:projectId/*` JÁ cobria `/api/v1/projects/<id>`:
   * o `*` do Hono casa o resto vazio do caminho, ao contrário do que o comentário
   * de `projects.ts` afirmava (comentário corrigido junto com esta onda).
   *
   * Ficam aqui como PINO de comportamento: se um dia o `*` deixar de casar o
   * vazio — numa atualização do Hono, por exemplo —, a guarda própria que essas
   * rotas agora têm segura, e estes casos provam que ela segura. O vazamento real
   * de C1 é a LISTAGEM, e é aquele teste que era vermelho.
   */
  it('GET /projects/:id de outra consultoria é 403', async () => {
    const res = await pedir(worker, '/api/v1/projects/proj-a1-27001', { headers: b });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('Acme');
  });

  it('GET /projects/:id do PRÓPRIO cliente continua 200 (a guarda não fechou demais)', async () => {
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001', { headers: b });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await res.json() as any).id).toBe('proj-b1-27001');
  });

  it('PUT /projects/:id de outra consultoria é 403 e NÃO grava', async () => {
    const res = await pedir(worker, '/api/v1/projects/proj-a1-27001', {
      method: 'PUT',
      headers: json(b),
      body: JSON.stringify({ project_name: 'sequestrado', status: 'Closed' }),
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT project_name, status FROM projects WHERE id = ?')
      .bind('proj-a1-27001').first<any>();
    expect(row?.project_name ?? '').not.toBe('sequestrado');
    expect(row?.status).toBe('Active');
  });

  it('papel FORA da allowlist de papel-cliente é escopado, não liberado', async () => {
    // `users.role` é TEXT livre e `createUserSchema.role` é `z.string()`: o `if`
    // por allowlist de papel-cliente deixava `ciso` passar direto pelas três
    // rotas. Regressão do incidente registrado em `helpers.ts`.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`
    ).bind('u-ciso', 'ciso@a.com', 'h', 'CISO', 'ciso', 'proj-a1-27001').run();
    const ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@a.com', role: 'ciso', client_project_id: 'proj-a1-27001' });

    expect((await pedir(worker, '/api/v1/projects/proj-b1-27001', { headers: ciso })).status).toBe(403);
    const lista = await pedir(worker, '/api/v1/projects', { headers: ciso });
    const ids = ((await lista.json()) as any[]).map((p) => p.id);
    expect(ids).toEqual(['proj-a1-27001']);
  });

  it('platform_admin continua vendo a plataforma inteira', async () => {
    const pa = await sessionFor(PLATAFORMA);
    const res = await pedir(worker, '/api/v1/projects', { headers: pa });
    expect(((await res.json()) as any[]).length).toBe(5);
  });
});

describe('C2 — PUT/GET/DELETE /api/v1/users: escopo do alvo e domínio do papel', () => {
  let b: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
    b = await sessionFor(CONSULTOR_B);
  });

  it('GET /users enumera SÓ a própria conta', async () => {
    const res = await pedir(worker, '/api/v1/users', { headers: b });
    expect(res.status).toBe(200);
    const emails = ((await res.json()) as any[]).map((u) => u.email).sort();
    expect(emails).toEqual(['consultor@b.com']);
    expect(emails).not.toContain('consultor@a.com');
    expect(emails).not.toContain('admin@acme.com');
  });

  it('PUT /users/:id de outra consultoria é 403 e NÃO troca a senha', async () => {
    const antes = await env.DB.prepare('SELECT password_hash, email FROM users WHERE id = ?')
      .bind('u-a-consultor').first<any>();
    const res = await pedir(worker, '/api/v1/users/u-a-consultor', {
      method: 'PUT',
      headers: json(b),
      body: JSON.stringify({ password: 'senha-do-invasor-1', email: 'invasor@b.com' }),
    });
    expect(res.status).toBe(403);
    const depois = await env.DB.prepare('SELECT password_hash, email FROM users WHERE id = ?')
      .bind('u-a-consultor').first<any>();
    expect(depois?.password_hash).toBe(antes?.password_hash);
    expect(depois?.email).toBe('consultor@a.com');
  });

  it('AUTO-PROMOÇÃO A platform_admin É RECUSADA', async () => {
    // A cadeia de takeover inteira dependia deste passo: enumerar,
    // `PUT /users/<próprio id>` com `role: 'platform_admin'`, nova sessão,
    // plataforma inteira.
    const res = await pedir(worker, '/api/v1/users/u-b-consultor', {
      method: 'PUT',
      headers: json(b),
      body: JSON.stringify({ role: 'platform_admin' }),
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind('u-b-consultor').first<any>();
    expect(row?.role).toBe('consultor');
  });

  it('criar usuário com papel de plataforma também é recusado (mesma escalada, outra rota)', async () => {
    const res = await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(b),
      body: JSON.stringify({ email: 'novo-adm@b.com', password: 'senha-forte-1', name: 'Novo', role: 'platform_admin' }),
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind('novo-adm@b.com').first();
    expect(row).toBeNull();
  });

  it('`admin` é bloqueado junto com `platform_admin` — o poder, não a grafia', async () => {
    // `GET /users` normaliza `admin` para `platform_admin`: bloquear só um dos
    // dois nomes seria bloquear a grafia.
    const res = await pedir(worker, '/api/v1/users/u-b-consultor', {
      method: 'PUT',
      headers: json(b),
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /users/:id de outra consultoria é 403 e o usuário continua lá', async () => {
    const res = await pedir(worker, '/api/v1/users/u-a-consultor', { method: 'DELETE', headers: json(b) });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind('u-a-consultor').first();
    expect(row).not.toBeNull();
  });

  it('staff alcança usuário de CLIENTE da própria conta (a guarda não fechou demais)', async () => {
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/users/u-a1-user', {
      method: 'PUT',
      headers: json(a),
      body: JSON.stringify({ name: 'Nome Novo' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind('u-a1-user').first<any>();
    expect(row?.name).toBe('Nome Novo');

    const lista = await pedir(worker, '/api/v1/users', { headers: a });
    const emails = ((await lista.json()) as any[]).map((u) => u.email).sort();
    expect(emails).toEqual(['admin@acme.com', 'consultor@a.com', 'user@acme.com']);
  });

  it('platform_admin continua alcançando todo mundo', async () => {
    const pa = await sessionFor(PLATAFORMA);
    const res = await pedir(worker, '/api/v1/users/u-a-consultor', {
      method: 'PUT',
      headers: json(pa),
      body: JSON.stringify({ name: 'Renomeado pela plataforma' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe('C3 metade A — usuário novo nasce COM escopo', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
  });

  it('POST /users de usuário de cliente grava cliente_id E a concessão', async () => {
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(a),
      body: JSON.stringify({
        email: 'novo@acme.com', password: 'senha-forte-1', name: 'Novo do Acme',
        role: 'org_user', client_project_id: 'proj-a1-27001',
      }),
    });
    expect(res.status, await res.clone().text()).toBe(201);

    const row = await env.DB.prepare('SELECT id, cliente_id, conta_id, client_project_id FROM users WHERE email = ?')
      .bind('novo@acme.com').first<any>();
    expect(row?.cliente_id).toBe('cli-a1');
    expect(row?.conta_id).toBeNull();
    // Coluna legada preservada de propósito: várias listagens ainda a leem.
    expect(row?.client_project_id).toBe('proj-a1-27001');

    const concessao = await env.DB.prepare('SELECT 1 FROM acesso_projeto WHERE user_id = ? AND project_id = ?')
      .bind(row.id, 'proj-a1-27001').first();
    expect(concessao, 'sem a concessão o papel comum não alcança nada').not.toBeNull();

    // O que a concessão compra: o usuário novo ENTRA no projeto dele.
    const dele = await sessionFor({ id: row.id, email: 'novo@acme.com', role: 'org_user', cliente_id: 'cli-a1', client_project_id: 'proj-a1-27001' });
    expect((await pedir(worker, '/api/v1/projects/proj-a1-27001/risks', { headers: dele })).status).toBe(200);
    // E só o dele: o irmão do mesmo cliente não vem de graça.
    expect((await pedir(worker, '/api/v1/projects/proj-a1-27701/risks', { headers: dele })).status).toBe(403);
  });

  it('POST /users de org_admin NÃO emite concessão (ele vê a empresa inteira)', async () => {
    const a = await sessionFor(CONSULTOR_A);
    await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(a),
      body: JSON.stringify({
        email: 'adm2@acme.com', password: 'senha-forte-1', name: 'Admin 2',
        role: 'org_admin', client_project_id: 'proj-a1-27001',
      }),
    });
    const row = await env.DB.prepare('SELECT id, cliente_id FROM users WHERE email = ?').bind('adm2@acme.com').first<any>();
    expect(row?.cliente_id).toBe('cli-a1');
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM acesso_projeto WHERE user_id = ?').bind(row.id).first<any>();
    expect(n?.n).toBe(0);
  });

  it('POST /users de STAFF grava conta_id, e o consultor novo alcança a carteira no dia 1', async () => {
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(a),
      body: JSON.stringify({ email: 'colega@a.com', password: 'senha-forte-1', name: 'Colega', role: 'consultor' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const row = await env.DB.prepare('SELECT id, conta_id, cliente_id FROM users WHERE email = ?').bind('colega@a.com').first<any>();
    expect(row?.conta_id).toBe('conta-a');
    expect(row?.cliente_id).toBeNull();

    const dele = await sessionFor({ id: row.id, email: 'colega@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    expect((await pedir(worker, '/api/v1/projects/proj-a1-27001/risks', { headers: dele })).status).toBe(200);
    expect((await pedir(worker, '/api/v1/projects/proj-b1-27001/risks', { headers: dele })).status).toBe(403);
  });

  it('POST /users não aponta o alvo para projeto de OUTRA consultoria', async () => {
    // `client_project_id` não é rótulo: `/portfolio` e `/client/dashboard` leem
    // dele direto, então apontá-lo para a carteira alheia é entregá-la.
    const b = await sessionFor(CONSULTOR_B);
    const res = await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(b),
      body: JSON.stringify({
        email: 'laranja@b.com', password: 'senha-forte-1', name: 'Laranja',
        role: 'org_user', client_project_id: 'proj-a1-27001',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('SCIM provisiona com cliente_id e concessão, e o provisionado entra no projeto', async () => {
    const TOKEN = 'scim-token-a1';
    await env.DB.prepare('INSERT INTO project_scim (project_id, token_hash) VALUES (?,?)')
      .bind('proj-a1-27001', await sha256Hex(TOKEN)).run();

    const res = await pedir(worker, '/scim/v2/Users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/scim+json' },
      body: JSON.stringify({ userName: 'scim@acme.com', displayName: 'Provisionado' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);

    const row = await env.DB.prepare('SELECT id, cliente_id, client_project_id FROM users WHERE email = ?')
      .bind('scim@acme.com').first<any>();
    expect(row?.cliente_id).toBe('cli-a1');
    expect(row?.client_project_id).toBe('proj-a1-27001');
    const concessao = await env.DB.prepare('SELECT 1 FROM acesso_projeto WHERE user_id = ? AND project_id = ?')
      .bind(row.id, 'proj-a1-27001').first();
    expect(concessao, 'usuário do IdP trancado fora do próprio projeto').not.toBeNull();
  });

  it('SSO provisiona com cliente_id e concessão', async () => {
    const cfg: any = {
      project_id: 'proj-a1-27001', issuer: 'https://idp', client_id: 'cid',
      client_secret: 'x', dominios: 'acme.com', papel_padrao: 'org_user', ativo: 1,
    };
    const p = await provisionar(env as any, cfg, { email: 'sso@acme.com', name: 'Do SSO' } as any);
    const row = await env.DB.prepare('SELECT id, cliente_id, client_project_id FROM users WHERE email = ?')
      .bind('sso@acme.com').first<any>();
    expect(row?.cliente_id).toBe('cli-a1');
    expect(row?.client_project_id).toBe('proj-a1-27001');
    const concessao = await env.DB.prepare('SELECT 1 FROM acesso_projeto WHERE user_id = ? AND project_id = ?')
      .bind(p.id, 'proj-a1-27001').first();
    expect(concessao).not.toBeNull();
  });

  it('/setup cria o staff semente COM conta própria', async () => {
    // `SETUP_KEY` injetada no `env` desta chamada: sem ela a rota é 403 por
    // desenho (falha fechada) e o teste passaria sem exercitar nada.
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Key': 'chave-de-teste' },
        body: JSON.stringify({ email: 'semente@x.com', password: 'senha-forte-1', name: 'Semente' }),
      }),
      { ...env, AI: { run: async () => ({ response: 'stub' }) }, SETUP_KEY: 'chave-de-teste' } as any
    );
    expect(res.status, await res.clone().text()).toBe(201);
    const row = await env.DB.prepare('SELECT conta_id, role FROM users WHERE email = ?').bind('semente@x.com').first<any>();
    expect(row?.role).toBe('consultant');
    expect(row?.conta_id, 'staff semente sem conta não alcança projeto nenhum').toBeTruthy();
    const conta = await env.DB.prepare('SELECT tipo FROM contas WHERE id = ?').bind(row.conta_id).first<any>();
    expect(conta?.tipo).toBe('msp');
  });
});

describe('C3 metade B — contaCriadora não aceita conta do corpo de staff comum', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
  });

  it('STAFF SEM conta_id NÃO CRIA PROJETO NA CARTEIRA DA CONCORRENTE PELO CORPO', async () => {
    // `conta_id` nulo é o estado padrão de todo consultor criado antes da
    // correção de C3. `POST /projects` validava que a conta do corpo EXISTE —
    // nunca que é sua.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-sem-conta', 'novo@x.com', 'h', 'Sem conta', 'consultor')`
    ).run();
    const semConta = await sessionFor({ id: 'u-sem-conta', email: 'novo@x.com', role: 'consultor' });

    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: json(semConta),
      body: JSON.stringify({ client_name: 'Roubado', conta_id: 'conta-b' }),
    });
    expect(res.status).toBe(400);
    const n = await env.DB.prepare(`SELECT COUNT(*) n FROM clientes WHERE nome = 'Roubado'`).first<any>();
    expect(n?.n, 'cliente materializado na carteira da concorrente').toBe(0);
  });

  it('platform_admin continua podendo dizer para qual conta cria', async () => {
    const pa = await sessionFor(PLATAFORMA);
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: json(pa),
      body: JSON.stringify({ client_name: 'Legítimo', conta_id: 'conta-b' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const row = await env.DB.prepare(
      `SELECT conta_id FROM clientes WHERE nome = 'Legítimo'`
    ).first<any>();
    expect(row?.conta_id).toBe('conta-b');
  });
});

/**
 * As escritas do funil que respondem 2xx SEM tocar a linha alheia.
 *
 * O `WHERE` delas já traz `AND conta_id = ?`, então não há vazamento — mas o
 * handler devolve `{ok:true}` mesmo com zero linha casada, e é por isso que a
 * varredura de contrato não consegue julgá-las pelo status (elas estão em
 * `FORA_DA_VARREDURA_3`, em `contrato-isolamento-topo.test.ts`). A asserção que
 * vale é esta: a linha da outra consultoria SOBREVIVE intacta.
 */
describe('escritas do funil que respondem 2xx sem tocar a linha alheia', () => {
  let b: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-a', 'Empresa A', 'New', 'conta-a')`),
      env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name, status, conta_id) VALUES ('as-a', 'lead-a', 'Empresa A', 'In Progress', 'conta-a')`),
      env.DB.prepare(`INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, conta_id) VALUES ('prop-a', 'lead-a', 'as-a', 'Sent', 1000, 'conta-a')`),
    ]);
    b = await sessionFor(CONSULTOR_B);
  });

  it('DELETE de lead e proposta alheios não apaga nada', async () => {
    await pedir(worker, '/api/v1/leads/lead-a', { method: 'DELETE', headers: json(b) });
    await pedir(worker, '/api/v1/proposals/prop-a', { method: 'DELETE', headers: json(b) });
    expect(await env.DB.prepare(`SELECT id FROM leads WHERE id = 'lead-a'`).first()).not.toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM proposals WHERE id = 'prop-a'`).first()).not.toBeNull();
  });

  it('PUT de status de lead e de assessment alheios não grava nada', async () => {
    await pedir(worker, '/api/v1/leads/lead-a/status', {
      method: 'PUT', headers: json(b), body: JSON.stringify({ status: 'Lost' }),
    });
    await pedir(worker, '/api/v1/assessments/as-a', {
      method: 'PUT', headers: json(b), body: JSON.stringify({ status: 'Cancelado', client_name: 'sequestrada' }),
    });
    await pedir(worker, '/api/v1/assessments/as-a/pricing', {
      method: 'PUT', headers: json(b), body: JSON.stringify({ precoFinal: 1 }),
    });

    const lead = await env.DB.prepare(`SELECT status FROM leads WHERE id = 'lead-a'`).first<any>();
    expect(lead?.status).toBe('New');
    const as = await env.DB.prepare(`SELECT status, client_name, pricing_override FROM assessments WHERE id = 'as-a'`).first<any>();
    expect(as?.status).toBe('In Progress');
    expect(as?.client_name).toBe('Empresa A');
    expect(as?.pricing_override ?? null).toBeNull();
  });
});

describe('C4 — sexta lavagem de id: evidence.control_id', () => {
  /** Controle aprovado (assinado) SEM evidência, no projeto da consultoria A. */
  const CTRL_A = 'ctrl-a1-aprovado';

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, ciso_approved_by)
         VALUES (?, 'proj-a1-27001', 'ISO 27001', 'A.5.1 Políticas', 'desc secreta do cliente A', 'Implemented', 'ciso@acme.com')`
      ).bind(CTRL_A),
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, status)
         VALUES ('ctrl-b1', 'proj-b1-27001', 'ISO 27001', 'A.5.1 do B', 'Missing')`
      ),
    ]);
  });

  /** Evidência do projeto de B apontando para um controle do projeto de A. */
  async function plantaEvidenciaCruzada() {
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, file_size, file_type, r2_key, file_hash, uploaded_by, evaluation_status)
       VALUES ('ev-plantada', 'proj-b1-27001', ?, 'plantada.pdf', 10, 'application/pdf', 'k', 'hash', 'consultor@b.com', 'pending')`
    ).bind(CTRL_A).run();
  }

  it('upload NÃO aceita control_id de outro projeto', async () => {
    const b = await sessionFor(CONSULTOR_B);
    const form = new FormData();
    form.append('file', new File(['conteudo'], 'x.pdf', { type: 'application/pdf' }));
    form.append('control_id', CTRL_A);
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001/evidence/upload', {
      method: 'POST', headers: b, body: form,
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM evidence WHERE control_id = ?').bind(CTRL_A).first<any>();
    expect(n?.n).toBe(0);
  });

  it('upload com control_id DO PRÓPRIO projeto continua funcionando', async () => {
    const b = await sessionFor(CONSULTOR_B);
    const form = new FormData();
    form.append('file', new File(['conteudo'], 'x.pdf', { type: 'application/pdf' }));
    form.append('control_id', 'ctrl-b1');
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001/evidence/upload', {
      method: 'POST', headers: b, body: form,
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('EVIDÊNCIA PLANTADA NÃO SILENCIA O ACHADO CRÍTICO DO RELATÓRIO DE PRONTIDÃO', async () => {
    // A pior das pernas de leitura: o `NOT EXISTS` sem escopo fazia uma linha
    // gravada no projeto de OUTRA consultoria apagar "assinatura sem lastro" do
    // relatório de conformidade deste cliente. Adulteração, não vazamento.
    await plantaEvidenciaCruzada();
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/projects/proj-a1-27001/readiness-check', { headers: a });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as any;
    const criticos = (body.achados ?? []).filter((x: any) => x.severidade === 'critico');
    expect(criticos.map((x: any) => x.referencia), 'achado crítico silenciado por evidência de outro tenant').toContain(CTRL_A);
  });

  it('a coerência também não perde o achado por evidência de outro projeto', async () => {
    await plantaEvidenciaCruzada();
    const rel = await checkCoherence(env.DB, 'proj-a1-27001');
    const regras = rel.issues.filter((i) => i.rule === 'control_approved_without_evidence').map((i) => i.id);
    expect(regras).toContain(CTRL_A);
  });

  it('a matriz de rastreabilidade não lista evidência de outro projeto', async () => {
    await plantaEvidenciaCruzada();
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/projects/proj-a1-27001/traceability', { headers: a });
    expect(res.status, await res.clone().text()).toBe(200);
    const texto = await res.text();
    expect(texto, 'evidência de outra consultoria entrou na rastreabilidade do cliente').not.toContain('plantada.pdf');
  });
});
