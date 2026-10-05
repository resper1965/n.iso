import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, workerEnv, sessionFor } from './helpers/d1';

const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, e: any = workerEnv()) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), e);
const db = () => env.DB as D1Database;

let com: Record<string, string>, admB: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
let seq = 0;
const lead = (id: string, status: string, criado: string, org = 'org_ness') =>
  db().prepare(`INSERT INTO leads (id, company_name, status, org_id, created_at) VALUES (?, 'Emp', ?, ?, ?)`).bind(id, status, org, criado);
const prop = (o: { lead: string; numero: string; rev?: number; status: string; org?: string; total?: number; mens?: number; enviada?: boolean; aceite?: string; motivo?: string | null; atualizada?: string }) =>
  db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, revisao, status, cliente, total_projeto, mensalidade, gerada_em, enviada_em, aceite_em, recusa_motivo, criada_por, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Cli', ?, ?, '2026-02-01 12:00:00', ?, ?, ?, 'x', '2026-02-15 12:00:00', ?)`)
    .bind(`pp-${++seq}`, o.org ?? 'org_ness', o.lead, o.numero, o.rev ?? 1, o.status, o.total ?? 0, o.mens ?? 0,
      o.enviada === false ? null : '2026-02-02 12:00:00', o.aceite ?? null, o.motivo ?? null, o.atualizada ?? '2026-02-15 12:00:00');

describe('transições de lead (PUT /leads/:id/status)', () => {
  beforeAll(async () => {
    await applySchema();
    await db().batch([
      db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_ness','ness.','ness')`),
      db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b','B','b')`),
    ]);
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial', org_id: 'org_ness' });
  }, 60_000);

  const criar = async (status: string) => {
    const id = `l-${++seq}`;
    await lead(id, status, '2026-02-01 12:00:00').run();
    return id;
  };
  const mudar = (id: string, status: string) => chamar('PUT', `/api/v1/leads/${id}/status`, com, { status });
  const estado = async (id: string) => (await db().prepare('SELECT status FROM leads WHERE id = ?').bind(id).first<any>()).status;

  const VALIDAS: [string, string][] = [
    ['New', 'Assessment'], ['New', 'Proposal'], ['Assessment', 'Proposal'], ['Assessment', 'Lost'],
    ['Proposal', 'Won'], ['Proposal', 'Lost'], ['New', 'Lost'], ['Lost', 'New'],
  ];
  for (const [de, para] of VALIDAS) {
    it(`${de} → ${para} é permitida e deixa trilha`, async () => {
      const id = await criar(de);
      const r = await mudar(id, para);
      expect(r.status, await r.clone().text()).toBe(200);
      expect(await estado(id)).toBe(para);
      const a = await db().prepare(`SELECT actor, details FROM audit_logs WHERE action = 'lead.status' AND details LIKE ? ORDER BY created_at DESC`).bind(`%"${id}"%`).first<any>();
      expect(a.actor).toBe('com@ness.lat');
      expect(JSON.parse(a.details)).toEqual({ lead_id: id, de, para });
    });
  }

  const INVALIDAS: [string, string][] = [
    ['Won', 'New'], ['Won', 'Lost'], ['Won', 'Proposal'], ['Won', 'Assessment'],
    ['New', 'Won'], ['Assessment', 'Won'], ['Assessment', 'New'], ['Proposal', 'New'], ['Proposal', 'Assessment'],
    ['Lost', 'Won'], ['Lost', 'Proposal'], ['Lost', 'Assessment'],
    ['New', 'New'], ['Lost', 'Lost'], ['Won', 'Won'],
  ];
  for (const [de, para] of INVALIDAS) {
    it(`${de} → ${para} é recusada com 409 e não muda nada`, async () => {
      const id = await criar(de);
      const r = await mudar(id, para);
      expect(r.status).toBe(409);
      expect((await r.json<any>()).error).toBe(`Transição de status inválida: ${de} → ${para}`);
      expect(await estado(id)).toBe(de);
      expect(await db().prepare(`SELECT 1 FROM audit_logs WHERE action = 'lead.status' AND details LIKE ?`).bind(`%"${id}"%`).first()).toBeNull();
    });
  }

  it('status fora do enum → 400; lead inexistente → 404', async () => {
    const id = await criar('New');
    expect((await mudar(id, 'ganho')).status).toBe(400);
    expect((await mudar('nao-existe', 'Lost')).status).toBe(404);
  });

  it('corrida: dois PUT simultâneos sobre o mesmo estado lido → um 200 e um 409', async () => {
    const id = await criar('New');
    const rs = await Promise.all([mudar(id, 'Assessment'), mudar(id, 'Proposal')]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe('GET /api/v1/funil', () => {
  const Q = '?de=2026-01-01&ate=2026-03-31';
  beforeAll(async () => {
    await applySchema();
    await resetData(); // o arquivo todo compartilha o D1: zera o que o bloco anterior semeou
    await db().batch([
      db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_ness','ness.','ness')`),
      db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b','B','b')`),
      db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      db().prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      // org_ness
      lead('f1', 'Won', '2026-01-10 12:00:00'),
      lead('f2', 'Proposal', '2026-02-01 12:00:00'),
      lead('f3', 'Lost', '2026-03-01 12:00:00'),
      lead('f5', 'New', '2026-04-01 02:30:00'), // 31/03 23:30 em Brasília: dentro da janela
      lead('f6', 'New', '2026-04-01 03:30:00'), // 01/04 00:30 em Brasília: fora
      lead('f7', 'New', '2025-12-31 23:30:00'), // 31/12 20:30 em Brasília: fora
      prop({ lead: 'f1', numero: 'N-1', rev: 1, status: 'substituida', total: 90000, mens: 4000 }),
      prop({ lead: 'f1', numero: 'N-1', rev: 2, status: 'aceita', total: 100000, mens: 5000, aceite: '2026-02-09 12:00:00' }),
      prop({ lead: 'f2', numero: 'N-2', rev: 1, status: 'enviada', total: 50000, mens: 2000 }), // revisão antiga ainda "aberta"
      prop({ lead: 'f2', numero: 'N-2', rev: 2, status: 'visualizada', total: 70000, mens: 3000 }),
      prop({ lead: 'f2', numero: 'N-3', status: 'gerada', total: 20000, mens: 1000, enviada: false }),
      prop({ lead: 'f3', numero: 'N-4', status: 'recusada', motivo: '  Preço Alto ', atualizada: '2026-03-10 12:00:00' }),
      prop({ lead: 'f3', numero: 'N-5', status: 'recusada', motivo: 'preço alto', atualizada: '2026-03-11 12:00:00' }),
      prop({ lead: 'f3', numero: 'N-6', status: 'recusada', motivo: '   ', atualizada: '2026-03-12 12:00:00' }),
      prop({ lead: 'f3', numero: 'N-7', status: 'recusada', motivo: 'Escopo', atualizada: '2025-06-12 12:00:00' }), // fora da janela
      // org_b: valores diferentes, nada disto pode entrar
      lead('b1', 'Won', '2026-02-01 12:00:00', 'org_b'),
      prop({ lead: 'b1', numero: 'B-1', status: 'aceita', org: 'org_b', total: 777777, mens: 7777, aceite: '2026-02-20 12:00:00' }),
      prop({ lead: 'b1', numero: 'B-2', status: 'enviada', org: 'org_b', total: 555555, mens: 5555 }),
      prop({ lead: 'b1', numero: 'B-3', status: 'recusada', org: 'org_b', motivo: 'preço alto', atualizada: '2026-03-01 12:00:00' }),
    ]);
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial', org_id: 'org_ness' });
    admB = await sessionFor({ id: 'u-ab', email: 'ab@b.com', role: 'consultoria_admin', org_id: 'org_b' });
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
    cliente = await sessionFor({ id: 'u-cli', email: 'c@cli.com', role: 'org_admin', client_project_id: 'p-a' });
  }, 60_000);

  const funil = async (q = Q, h = com) => {
    const r = await chamar('GET', '/api/v1/funil' + q, h);
    expect(r.status, await r.clone().text()).toBe(200);
    return r.json<any>();
  };

  it('contagem de leads por status: só os criados na janela (em Brasília), da organização', async () => {
    const f = await funil();
    expect(f.leads).toEqual({ New: 1, Assessment: 0, Proposal: 1, Won: 1, Lost: 1 });
    expect(f.periodo).toEqual({ de: '2026-01-01', ate: '2026-03-31' });
  });

  it('conversão por lead distinto e percentual da etapa anterior', async () => {
    const f = await funil();
    expect(f.conversao).toEqual([
      { etapa: 'leads criados', leads: 4, percentualDaAnterior: 100 },
      { etapa: 'proposta gerada', leads: 3, percentualDaAnterior: 75 },
      { etapa: 'proposta enviada', leads: 3, percentualDaAnterior: 100 },
      { etapa: 'proposta aceita', leads: 1, percentualDaAnterior: 33.3 },
    ]);
  });

  it('percentual é 0 quando a etapa anterior é 0 (janela sem nada)', async () => {
    const f = await funil('?de=2024-01-01&ate=2024-01-31');
    expect(f.conversao.map((e: any) => [e.leads, e.percentualDaAnterior])).toEqual([[0, 100], [0, 0], [0, 0], [0, 0]]);
    expect(f.cicloMedioDias).toBeNull();
  });

  it('pipeline: só a revisão mais recente, projeto e mensalidade SEPARADOS', async () => {
    const f = await funil();
    expect(f.pipeline).toEqual({ propostas: 2, totalProjeto: 90000, mensalidade: 4000 });
  });

  it('ganho (por aceite_em na janela) e ciclo médio em dias, 1 casa', async () => {
    const f = await funil();
    expect(f.ganho).toEqual({ propostas: 1, totalProjeto: 100000, mensalidade: 5000 });
    expect(f.cicloMedioDias).toBe(30);
  });

  it('perdas agrupadas sem variação de caixa/espaço, vazio vira "sem motivo", fora da janela não conta', async () => {
    const f = await funil();
    expect(f.perdas).toEqual([{ motivo: 'preço alto', quantidade: 2 }, { motivo: 'sem motivo', quantidade: 1 }]);
  });

  it('propostas por status (criadas na janela)', async () => {
    const f = await funil();
    expect(f.propostasPorStatus).toMatchObject({ substituida: 1, aceita: 1, enviada: 1, visualizada: 1, gerada: 1, recusada: 4, rascunho: 0 });
  });

  it('organização alheia não entra na conta; a outra vê a sua', async () => {
    const f = await funil(Q, admB);
    expect(f.leads.Won).toBe(1);
    expect(f.ganho).toEqual({ propostas: 1, totalProjeto: 777777, mensalidade: 7777 });
    expect(f.pipeline).toEqual({ propostas: 1, totalProjeto: 555555, mensalidade: 5555 });
    expect(f.perdas).toEqual([{ motivo: 'preço alto', quantidade: 1 }]);
    expect(JSON.stringify(await funil())).not.toContain('777777');
  });

  it('datas em Brasília: lead de 23:30 de 31/12 (BR) cai na janela de 31/12', async () => {
    await db().prepare(`INSERT INTO leads (id, company_name, status, org_id, created_at) VALUES ('tz1','Emp','New','org_ness','2027-01-01 02:30:00')`).run();
    expect((await funil('?de=2026-12-31&ate=2026-12-31')).leads.New).toBe(1);
    expect((await funil('?de=2027-01-01&ate=2027-01-01')).leads.New).toBe(0);
  });

  it('padrão: últimos 90 dias em Brasília', async () => {
    const f = await funil('');
    const d = (s: string) => Date.parse(s + 'T00:00:00Z');
    expect((d(f.periodo.ate) - d(f.periodo.de)) / 86_400_000).toBe(89);
  });

  it('janela inválida, invertida ou longa → 400', async () => {
    for (const q of ['?de=2026-03-31&ate=2026-01-01', '?de=2025-01-01&ate=2026-03-31', '?de=2026-13-01&ate=2026-03-31', '?de=abc&ate=2026-03-31', '?de=2026-02-30&ate=2026-03-31', '?ate=2026-02-30']) {
      expect((await chamar('GET', '/api/v1/funil' + q, com)).status, q).toBe(400);
    }
    expect((await chamar('GET', '/api/v1/funil?de=2025-03-30&ate=2026-03-31', com)).status).toBe(400); // 367 dias
    expect((await chamar('GET', '/api/v1/funil?de=2025-03-31&ate=2026-03-31', com)).status).toBe(200); // 366 dias
  });

  it('consultor, cliente e agente → 403; sem sessão → 401', async () => {
    expect((await chamar('GET', '/api/v1/funil' + Q, consultor)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/funil' + Q, cliente)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/funil' + Q, {}, undefined, { ...workerEnv(), AGENTE: { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' } })).status).toBe(403);
    expect((await chamar('GET', '/api/v1/funil' + Q, {})).status).toBe(401);
  });
});
