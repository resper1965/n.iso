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

  it('deduplica por CNPJ mesmo com o nome e a máscara escritos diferente', async () => {
    // Primeira chamada COM máscara, segunda SEM — se a comparação não
    // normalizasse os dois lados da mesma forma, isto duplicaria o cliente
    // mesmo com o CNPJ sendo, na prática, o mesmo número.
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const criar = (nome: string, cnpj: string) => pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: nome, standards: 'ISO 27001', cnpj }),
    });
    await criar('Acme S.A.', '11.222.333/0001-81');
    await criar('Acme SA', '11222333000181');

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

  it('USUÁRIO DE CLIENTE NÃO CRIA PROJETO (poluiria a tabela clientes da consultoria)', async () => {
    const headers = await sessionFor({
      id: 'u-a1-admin', email: 'admin@acme.com', role: 'org_admin',
      conta_id: null, cliente_id: 'cli-a1',
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Cliente Não Devia Criar', standards: 'ISO 27001' }),
    });
    expect(res.status).toBe(403);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM clientes WHERE nome = 'Cliente Não Devia Criar'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('staff de conta DIRETA também cria projeto (ehStaffDeConta, não somenteMsp — pré-venda não existe para ela)', async () => {
    const headers = await sessionFor({
      id: 'u-c-staff', email: 'staff@c.com', role: 'consultor',
      conta_id: 'conta-c', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Cliente Direto Novo', standards: 'ISO 27001' }),
    });
    expect(res.status, await res.clone().text()).toBeLessThan(300);
  });

  it('conta_id inexistente no corpo é recusado com 400 — não depende da FK para isso', async () => {
    const headers = await sessionFor({
      id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin',
      conta_id: null, cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Fantasma', standards: 'ISO 27001', conta_id: 'conta-nao-existe' }),
    });
    expect(res.status).toBe(400);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE client_name = 'Fantasma'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe('convert/sign: a conta é a de quem vendeu, não a de quem opera o botão', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
  });

  it('assessment vendido pela conta-a não migra para conta-b só porque conta-b converteu', async () => {
    await env.DB.prepare(
      `INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-x', 'Cliente Vendido Por A', 'in_progress', 'conta-a')`
    ).run();

    // consultor de OUTRA consultoria aperta converter — somenteMsp exige papel
    // de staff e conta tipo msp, mas não que o operador pertença à MESMA conta
    // da origem da venda (gap que fica para outra tarefa fechar).
    const headersB = await sessionFor({
      id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor',
      conta_id: 'conta-b', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/assessments/assm-x/convert', { method: 'POST', headers: headersB });
    expect(res.status, await res.clone().text()).toBe(201);
    const { project_id } = await res.json<any>();

    const row = await env.DB.prepare(
      `SELECT c.conta_id FROM projects p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
    ).bind(project_id).first<{ conta_id: string }>();
    expect(row?.conta_id, 'o projeto tem de nascer na conta que VENDEU, não na de quem converteu').toBe('conta-a');
  });

  it('proposta vendida pela conta-a não migra para conta-b só porque conta-b assinou', async () => {
    await env.DB.prepare(
      `INSERT INTO leads (id, company_name, status, conta_id) VALUES ('lead-x', 'Empresa Vendida Por A', 'Proposal', 'conta-a')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, status, conta_id) VALUES ('prop-x', 'lead-x', 'Draft', 'conta-a')`
    ).run();

    const headersB = await sessionFor({
      id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor',
      conta_id: 'conta-b', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/proposals/prop-x/sign', { method: 'POST', headers: headersB });
    expect(res.status, await res.clone().text()).toBe(200);
    const { project_id } = await res.json<any>();

    const row = await env.DB.prepare(
      `SELECT c.conta_id FROM projects p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
    ).bind(project_id).first<{ conta_id: string }>();
    expect(row?.conta_id, 'o projeto tem de nascer na conta que VENDEU, não na de quem assinou').toBe('conta-a');
  });

  it('proposta sem lead usa o nome do assessment de origem, não um "Cliente" genérico compartilhado', async () => {
    await env.DB.prepare(
      `INSERT INTO assessments (id, client_name, status, conta_id) VALUES ('assm-y', 'Empresa Sem Lead', 'in_progress', 'conta-a')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO proposals (id, assessment_id, status, conta_id) VALUES ('prop-y', 'assm-y', 'Draft', 'conta-a')`
    ).run();

    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/proposals/prop-y/sign', { method: 'POST', headers });
    expect(res.status, await res.clone().text()).toBe(200);
    const { project_id } = await res.json<any>();

    const projeto = await env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(project_id).first<{ client_name: string }>();
    expect(projeto?.client_name).toBe('Empresa Sem Lead');
  });

  it('proposta sem lead e sem assessment de origem com nome recusa (400), sem deixar mutação pela metade', async () => {
    await env.DB.prepare(
      `INSERT INTO proposals (id, status, conta_id) VALUES ('prop-z', 'Draft', 'conta-a')`
    ).run();

    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/proposals/prop-z/sign', { method: 'POST', headers });
    expect(res.status).toBe(400);

    // A recusa aconteceu ANTES da mutação: a proposta continua Draft e não
    // sobrou contrato órfão de uma assinatura que nunca completou.
    const proposta = await env.DB.prepare('SELECT status FROM proposals WHERE id = ?').bind('prop-z').first<{ status: string }>();
    expect(proposta?.status).toBe('Draft');

    const contratos = await env.DB.prepare('SELECT COUNT(*) n FROM contracts WHERE proposal_id = ?').bind('prop-z').first<{ n: number }>();
    expect(contratos?.n).toBe(0);
  });
});
