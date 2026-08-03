import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { interpretarRetencao, ropaVencidos } from '../src/services/data-subject';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Direitos do titular (LGPD art. 18) e retenção (art. 16).
 *
 * O que se testa aqui não é "a rota responde 200" — é que o direito foi
 * exercido de fato: o dado sumiu do banco, o fato continuou lá, e a trilha
 * registrou. Num sistema de conformidade, atender sem registrar não conta.
 */

const IDENT = 'Maria Silva';

describe('Interpretação de prazo de retenção (unitário)', () => {
  it('entende as formas que o consultor realmente escreve', () => {
    expect(interpretarRetencao('5 anos')).toBe(5 * 365);
    expect(interpretarRetencao('6 meses')).toBe(180);
    expect(interpretarRetencao('30 dias')).toBe(30);
    expect(interpretarRetencao('12 months')).toBe(360);
    expect(interpretarRetencao('2 years')).toBe(730);
  });

  it('devolve null quando não dá para entender — não é o mesmo que "não venceu"', () => {
    expect(interpretarRetencao('enquanto necessário')).toBeNull();
    expect(interpretarRetencao('')).toBeNull();
    expect(interpretarRetencao(null)).toBeNull();
    expect(interpretarRetencao(undefined)).toBeNull();
  });

  it('trata prazo indeterminado como não avaliável, não como vencido', () => {
    expect(interpretarRetencao('indeterminado')).toBeNull();
    expect(interpretarRetencao('permanente')).toBeNull();
  });
});

describe('Requisição de titular', () => {
  let dpo: Record<string, string>;
  let leitor: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente Um','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','Cliente Dois','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','dpo@ness.io',?,'DPO','platform_admin')`).bind(hash),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u2','leitor@c.com',?,'Leitor','org_user','p1')`).bind(hash),

      // A mesma pessoa aparece em três tabelas do projeto p1...
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status) VALUES ('t1','p1',?,'Conscientização','Completed')`).bind(IDENT),
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status) VALUES ('t2','p1',?,'Phishing','Completed')`).bind(IDENT),
      env.DB.prepare(`INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES ('a1','p1','ISP',?,'maria@empresa.com','1.2.3.4','Mozilla')`).bind(IDENT),
      env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type) VALUES ('s1','p1',?,'internal')`).bind(IDENT),

      // ...e um homônimo em OUTRO projeto, que não pode ser tocado.
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status) VALUES ('t9','p2',?,'Outro','Completed')`).bind(IDENT),

      // E outra pessoa no mesmo projeto, que também não pode ser tocada.
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status) VALUES ('t3','p1','João Souza','Conscientização','Completed')`),
    ]);

    dpo = { ...(await sessionFor({ id: 'u1', email: 'dpo@ness.io', role: 'platform_admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    leitor = { ...(await sessionFor({ id: 'u2', email: 'leitor@c.com', role: 'org_user', client_project_id: 'p1', iat: Date.now() })), 'Content-Type': 'application/json' };
  });

  async function req(path: string, init: RequestInit = {}, h = dpo) {
    return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: h }), env as any);
  }

  it('localiza o titular em todas as tabelas onde ele aparece', async () => {
    const res = await req(`/api/v1/projects/p1/data-subject?identificador=${encodeURIComponent(IDENT)}`);
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.encontrado).toBe(true);
    expect(body.total_registros).toBe(4); // 2 treinamentos + 1 aceite + 1 stakeholder
    expect(body.ocorrencias.map((o: any) => o.tabela).sort()).toEqual(
      ['policy_acknowledgments', 'stakeholders', 'training_records']
    );
  });

  it('não devolve dado de terceiro com nome parecido', async () => {
    // Busca por igualdade, não LIKE: `%a%` casaria com meio mundo, e devolver
    // dado de outra pessoa numa requisição de titular é vazamento.
    const res = await req('/api/v1/projects/p1/data-subject?identificador=Maria');
    expect((await res.json() as any).encontrado).toBe(false);
  });

  it('a consulta entra na trilha de auditoria', async () => {
    await req(`/api/v1/projects/p1/data-subject?identificador=${encodeURIComponent(IDENT)}`);
    const log = await env.DB.prepare(
      "SELECT actor, project_id FROM audit_logs WHERE action='lgpd.titular.consulta' ORDER BY rowid DESC LIMIT 1"
    ).first<any>();
    expect(log).not.toBeNull();
    expect(log.actor).toBe('dpo@ness.io');
    expect(log.project_id).toBe('p1');
  });

  it('papel read-only não consulta nem elimina dado de titular', async () => {
    expect((await req('/api/v1/projects/p1/data-subject?identificador=x', {}, leitor)).status).toBe(403);
    expect((await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST', body: JSON.stringify({ identificador: IDENT, justificativa: 'teste' }),
    }, leitor)).status).toBe(403);
  });

  it('eliminação anonimiza o dado e PRESERVA o fato', async () => {
    const res = await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST',
      body: JSON.stringify({ identificador: IDENT, justificativa: 'Pedido do titular via canal do DPO, protocolo 123' }),
    });
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.total).toBe(4);

    // O dado pessoal sumiu...
    const t = await env.DB.prepare("SELECT employee_name, training_name, status FROM training_records WHERE id='t1'").first<any>();
    expect(t.employee_name).toBe('[ANONIMIZADO]');
    // ...mas a evidência de que o treinamento aconteceu continua lá. Apagar a
    // linha destruiria a prova do controle A.6.3 do cliente.
    expect(t.training_name).toBe('Conscientização');
    expect(t.status).toBe('Completed');

    // IP e user-agent do aceite também são dado pessoal.
    const a = await env.DB.prepare("SELECT user_name, user_email, ip_address, policy_type FROM policy_acknowledgments WHERE id='a1'").first<any>();
    expect(a.user_name).toBe('[ANONIMIZADO]');
    expect(a.user_email).toBe('[ANONIMIZADO]');
    expect(a.ip_address).toBe('');
    expect(a.policy_type).toBe('ISP');
  });

  it('eliminação não vaza para outro projeto nem para homônimo de outro tenant', async () => {
    await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST',
      body: JSON.stringify({ identificador: IDENT, justificativa: 'pedido' }),
    });
    const outroProjeto = await env.DB.prepare("SELECT employee_name FROM training_records WHERE id='t9'").first<any>();
    expect(outroProjeto.employee_name).toBe(IDENT); // intacto
  });

  it('eliminação não atinge outra pessoa do mesmo projeto', async () => {
    await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST',
      body: JSON.stringify({ identificador: IDENT, justificativa: 'pedido' }),
    });
    const outra = await env.DB.prepare("SELECT employee_name FROM training_records WHERE id='t3'").first<any>();
    expect(outra.employee_name).toBe('João Souza');
  });

  it('eliminação exige justificativa — é o que a trilha vai mostrar ao auditor', async () => {
    const res = await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST', body: JSON.stringify({ identificador: IDENT }),
    });
    expect(res.status).toBe(400);
  });

  it('eliminação de titular inexistente responde 404, não sucesso vazio', async () => {
    const res = await req('/api/v1/projects/p1/data-subject/erase', {
      method: 'POST', body: JSON.stringify({ identificador: 'Ninguém', justificativa: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('Retenção vencida', () => {
  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','dpo@ness.io',?,'DPO','platform_admin')`).bind(hash),
      // Criado há ~2 anos, retenção de 6 meses: vencido.
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, retention_period, created_at) VALUES ('r1','p1','Folha antiga','6 meses',?)`).bind(new Date(Date.now() - 730 * 86400000).toISOString()),
      // Criado ontem, retenção de 5 anos: dentro do prazo.
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, retention_period, created_at) VALUES ('r2','p1','Folha atual','5 anos',?)`).bind(new Date(Date.now() - 86400000).toISOString()),
      // Prazo que não dá para interpretar: não pode ser reportado como vencido.
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, retention_period, created_at) VALUES ('r3','p1','Indefinido','enquanto necessário',?)`).bind(new Date(Date.now() - 3650 * 86400000).toISOString()),
    ]);
  });

  it('lista só o que passou do prazo declarado', async () => {
    const v = await ropaVencidos(env.DB, 'p1');
    expect(v.map(x => x.id)).toEqual(['r1']);
    expect(v[0].dias_vencido).toBeGreaterThan(500);
  });

  it('o endpoint relata sem apagar nada', async () => {
    const headers = await sessionFor({ id: 'u1', email: 'dpo@ness.io', role: 'platform_admin', iat: Date.now() });
    const res = await app.fetch(new Request('http://localhost/api/v1/projects/p1/data-subject/retencao', { headers }), env as any);
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);

    // Nada foi removido — a decisão é do DPO.
    const n = await env.DB.prepare("SELECT count(*) AS n FROM ropa_records WHERE project_id='p1'").first<any>();
    expect(n.n).toBe(3);
  });
});
