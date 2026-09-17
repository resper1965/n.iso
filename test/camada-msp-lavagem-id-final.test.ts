import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetData, resetSessions } from './helpers/d1';

/**
 * Os três achados do re-review da onda anterior — dois deles dentro do código que
 * a própria onda escreveu.
 *
 * Os três são o MESMO padrão: um id chega pelo corpo ou pelo path sem validação,
 * é gravado numa linha, e depois é desreferenciado a partir dessa linha — que o
 * operador legitimamente possui. Ter validado o container nunca validou o
 * conteúdo.
 */

const CONSULTOR_A = { id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const CONSULTOR_B = { id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null };

const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });

const base = async () => {
  await applySchema();
  await resetData();
  await resetSessions();
  await seedMatrizMsp();
};

describe('A1 — PUT /users/:id: o projeto ARMAZENADO no alvo também é projeto alheio', () => {
  /**
   * Staff da conta A cujo `client_project_id` aponta para projeto da conta B.
   * É estado criável por `platform_admin` (cuja checagem passa tudo) e é o
   * bastante: nenhuma guarda do `PUT` olhava essa coluna quando o corpo não a
   * mandava.
   */
  beforeEach(async () => {
    await base();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, conta_id, cliente_id, client_project_id)
       VALUES ('u-a-cruzado', 'cruzado@a.com', 'hash-original', 'Cruzado', 'consultor', 'conta-a', NULL, 'proj-b1-27001')`
    ).run();
  });

  it('UMA requisição NÃO re-ancora o alvo ao cliente da concorrente nem concede o projeto dela', async () => {
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/users/u-a-cruzado', {
      method: 'PUT',
      headers: json(a),
      // Só `role` (e a senha que o consultor escolhe): `client_project_id` não
      // vem no corpo, então `alvoProjeto` é `undefined` e a guarda de projeto
      // não tinha o que julgar. O `projeto` usado adiante saía da linha do alvo.
      body: JSON.stringify({ role: 'client', password: 'senha-do-invasor-1' }),
    });
    expect(res.status).toBe(403);

    const row = await env.DB.prepare(
      'SELECT role, cliente_id, password_hash FROM users WHERE id = ?'
    ).bind('u-a-cruzado').first<any>();
    expect(row?.cliente_id, 'alvo re-ancorado ao cliente da outra consultoria').not.toBe('cli-b1');
    expect(row?.role).toBe('consultor');
    expect(row?.password_hash, 'senha definida pelo invasor na mesma requisição').toBe('hash-original');

    const concessao = await env.DB.prepare(
      'SELECT 1 FROM acesso_projeto WHERE user_id = ? AND project_id = ?'
    ).bind('u-a-cruzado', 'proj-b1-27001').first();
    expect(concessao, 'concessão real emitida num projeto da concorrente').toBeNull();
  });

  it('repapelar alguém cujo projeto é DA PRÓPRIA conta continua funcionando', async () => {
    // A guarda não pode fechar demais: mover papel dentro da carteira é o caso
    // legítimo que este ramo existe para servir.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, cliente_id, client_project_id)
       VALUES ('u-a1-proprio', 'proprio@acme.com', 'h', 'Próprio', 'org_user', 'cli-a1', 'proj-a1-27001')`
    ).run();
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/users/u-a1-proprio', {
      method: 'PUT',
      headers: json(a),
      body: JSON.stringify({ role: 'client' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const row = await env.DB.prepare('SELECT role, cliente_id FROM users WHERE id = ?')
      .bind('u-a1-proprio').first<any>();
    expect(row?.role).toBe('client');
    expect(row?.cliente_id).toBe('cli-a1');
  });
});

describe('A2 — org_admin sem projeto: NULL não casa com NULL', () => {
  beforeEach(base);

  it('CADEIA COMPLETA: consultor fabrica org_admin sem projeto e ele NÃO alcança usuário de projeto NULL', async () => {
    // Bootstrap de um passo: `role:'org_admin'` é papel de cliente (passa o
    // gate de papel de plataforma) e sem `client_project_id` não há projeto a
    // recusar. Daí o ramo `alvo.client_project_id === admin.client_project_id`
    // com os dois `null` entregava todo consultor e todo platform_admin.
    const b = await sessionFor(CONSULTOR_B);
    const criado = await pedir(worker, '/api/v1/users', {
      method: 'POST',
      headers: json(b),
      body: JSON.stringify({ email: 'laranja@b.com', password: 'senha-forte-1', name: 'Laranja', role: 'org_admin' }),
    });
    expect(criado.status, await criado.clone().text()).toBe(201);
    const novo = await env.DB.prepare('SELECT id, client_project_id FROM users WHERE email = ?')
      .bind('laranja@b.com').first<any>();
    expect(novo?.client_project_id, 'o passo 1 da cadeia depende do projeto NULO').toBeNull();

    const dele = await sessionFor({ id: novo.id, email: 'laranja@b.com', role: 'org_admin', client_project_id: null });

    // Alvos de projeto NULO: o consultor da OUTRA consultoria e a conta que
    // opera o SaaS. O gate de papel bloqueia ATRIBUIR papel de plataforma,
    // nunca EDITAR um platform_admin.
    for (const alvo of ['u-a-consultor', 'u-plataforma']) {
      const res = await pedir(worker, `/api/v1/users/${alvo}`, {
        method: 'PUT',
        headers: json(dele),
        body: JSON.stringify({ email: `sequestrado-${alvo}@b.com`, password: 'senha-do-invasor-1' }),
      });
      expect(res.status, `alvo ${alvo}`).toBe(403);
      const row = await env.DB.prepare('SELECT email, password_hash FROM users WHERE id = ?').bind(alvo).first<any>();
      expect(row?.email).not.toBe(`sequestrado-${alvo}@b.com`);
      expect(row?.password_hash).toBe('h');
    }
  });

  it('org_admin COM projeto continua alcançando quem está no projeto dele', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, cliente_id, client_project_id)
         VALUES ('u-adm-proj', 'adm@acme.com2', 'h', 'Adm', 'org_admin', 'cli-a1', 'proj-a1-27001')`
      ),
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, cliente_id, client_project_id)
         VALUES ('u-alvo-proj', 'alvo@acme.com', 'h', 'Alvo', 'org_user', 'cli-a1', 'proj-a1-27001')`
      ),
    ]);
    const adm = await sessionFor({ id: 'u-adm-proj', email: 'adm@acme.com2', role: 'org_admin', cliente_id: 'cli-a1', client_project_id: 'proj-a1-27001' });
    const res = await pedir(worker, '/api/v1/users/u-alvo-proj', {
      method: 'PUT',
      headers: json(adm),
      body: JSON.stringify({ name: 'Renomeado' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe('A3 — sétima família: control_id desreferenciado sem predicado de projeto', () => {
  /** Controle do projeto da consultoria A, com título que o cliente dela lê. */
  const CTRL_A = 'ctrl-a1-politicas';

  beforeEach(async () => {
    await base();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, description, status)
         VALUES (?, 'proj-a1-27001', 'ISO 27001', 'A.5.1 Políticas do Acme', 'desc secreta do cliente A', 'Implemented')`
      ).bind(CTRL_A),
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, status)
         VALUES ('ctrl-b1', 'proj-b1-27001', 'ISO 27001', 'A.5.1 do Delta', 'Missing')`
      ),
    ]);
  });

  /** Risco no projeto de B apontando para um controle do projeto de A. */
  async function plantaRiscoCruzado() {
    await env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, control_id)
       VALUES ('risk-plantado', 'proj-b1-27001', 'Ativo plantado pelo B', 'Ameaca plantada pelo B', 5, 5, 'Critical', ?)`
    ).bind(CTRL_A).run();
  }

  it('RISCO DE OUTRO PROJETO NÃO APARECE NA MATRIZ DE RASTREABILIDADE', async () => {
    // O pior caminho: a matriz é o que a consultoria A ENTREGA ao cliente dela.
    // Staff de B planta o risco no próprio projeto e ele sai no documento de A.
    await plantaRiscoCruzado();
    const a = await sessionFor(CONSULTOR_A);
    const res = await pedir(worker, '/api/v1/projects/proj-a1-27001/traceability', { headers: a });
    expect(res.status, await res.clone().text()).toBe(200);
    const texto = await res.text();
    expect(texto, 'risco de outra consultoria entrou na rastreabilidade do cliente').not.toContain('Ameaca plantada pelo B');
    expect(texto).not.toContain('risk-plantado');
  });

  it('a listagem de riscos não empresta título e norma de controle de outro projeto', async () => {
    await plantaRiscoCruzado();
    const b = await sessionFor(CONSULTOR_B);
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001/risks', { headers: b });
    expect(res.status, await res.clone().text()).toBe(200);
    const texto = await res.text();
    expect(texto, 'JOIN sem predicado de projeto vazou o controle do outro tenant').not.toContain('A.5.1 Políticas do Acme');
  });

  it('POST de risco NÃO aceita control_id de outro projeto', async () => {
    const b = await sessionFor(CONSULTOR_B);
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001/risks', {
      method: 'POST',
      headers: json(b),
      body: JSON.stringify({ asset: 'Ativo do B', threat: 'Ameaça do B', control_id: CTRL_A }),
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM risks WHERE control_id = ?').bind(CTRL_A).first<any>();
    expect(n?.n).toBe(0);
  });

  it('POST de risco com control_id DO PRÓPRIO projeto continua funcionando', async () => {
    const b = await sessionFor(CONSULTOR_B);
    const res = await pedir(worker, '/api/v1/projects/proj-b1-27001/risks', {
      method: 'POST',
      headers: json(b),
      body: JSON.stringify({ asset: 'Ativo do B', threat: 'Ameaça do B', control_id: 'ctrl-b1' }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('PUT de risco NÃO re-aponta o control_id para outro projeto', async () => {
    await env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, control_id)
       VALUES ('risk-b', 'proj-b1-27001', 'Ativo do B', 'Ameaça do B', 3, 3, 'Medium', 'ctrl-b1')`
    ).run();
    const b = await sessionFor(CONSULTOR_B);
    const res = await pedir(worker, '/api/v1/risks/risk-b', {
      method: 'PUT',
      headers: json(b),
      body: JSON.stringify({ asset: 'Ativo do B', threat: 'Ameaça do B', control_id: CTRL_A }),
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT control_id FROM risks WHERE id = ?').bind('risk-b').first<any>();
    expect(row?.control_id).toBe('ctrl-b1');
  });

  it('nota de auditor não grava control_id de outro projeto nem o desreferencia', async () => {
    // O token escopa a nota ao projeto dele; `control_id` vinha cru do corpo e
    // os dois `JOIN` de leitura o desreferenciavam sem predicado de projeto.
    await env.DB.prepare(
      `INSERT INTO auditor_tokens (id, project_id, token, expires_at)
       VALUES ('tok-b', 'proj-b1-27001', 'token-do-b', datetime('now', '+7 days'))`
    ).run();
    const res = await pedir(worker, '/api/v1/auditor/token-do-b/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ control_id: CTRL_A, content: 'nota plantada' }),
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM auditor_notes WHERE control_id = ?').bind(CTRL_A).first<any>();
    expect(n?.n).toBe(0);
  });
});
