import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { transferirProjeto, MSG_CORRIDA } from '../src/services/transferencia-projeto';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Fatia 5, tarefa 5: transferência de projeto para a organização do cliente (só platform_admin).
 *
 * Mexe em acesso: o que se prova é que, na requisição SEGUINTE à transferência, o consultor e o
 * agente da organização de origem já não alcançam o projeto; que o administrador da organização de
 * destino alcança; que o cliente do projeto não percebe nada; e que tudo acontece num batch só,
 * guardado pela organização de origem lida antes (corrida e repetição não agem duas vezes).
 */
const SENHA = 'Senha-forte-123!';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, extraEnv: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), ...extraEnv } as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const todos = async <T = any>(sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).all<T>()).results;
const transferir = (projeto: string, corpo: unknown, sessao: Record<string, string>, extraEnv: Record<string, unknown> = {}) =>
  chamar('POST', `/api/v1/platform/projects/${projeto}/transferir`, sessao, corpo, extraEnv);
const MOTIVO = 'Cliente contratou a consultoria B; pedido formal de 01/10';
const agente = (projeto: string) => ({ AGENTE: { concessaoId: `c-${projeto}`, userId: 'u-cn', email: 'cn@ness.lat', projectId: projeto } });

const S: Record<string, Record<string, string>> = {};

/** Projeto da ness. com consultor designado (e-mail em outra caixa), designações que NÃO saem e um agente ativo. */
async function semearProjeto(id: string) {
  const d = env.DB;
  await d.batch([
    d.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(id),
    d.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      (?, ?, 'CN', 'CN@Ness.LAT', 'consultor', 'Consultor'),
      (?, ?, 'CB', 'cb@b.lat', 'consultor', 'Consultor'),
      (?, ?, 'Externo', 'externo@fora.lat', 'consultor', 'Consultor'),
      (?, ?, 'CN', 'cn@ness.lat', 'tech', 'CTO')`).bind(`g-cn-${id}`, id, `g-cb-${id}`, id, `g-ext-${id}`, id, `g-tech-${id}`, id),
    d.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES (?, 'u-cn', ?, datetime('now', '+30 days'))`).bind(`c-${id}`, id),
    d.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, revogado_em, revogado_por) VALUES (?, 'u-cn', ?, datetime('now', '+30 days'), '2026-01-01 00:00:00', 'cliente@x.com')`).bind(`c-velha-${id}`, id),
    d.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES (?, ?, 'A', 'T')`).bind(`r-${id}`, id),
  ]);
}

beforeAll(async () => {
  await applySchema();
  const d = env.DB;
  const h = await hashPassword(SENHA);
  await d.batch([
    d.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, status) VALUES
      ('org_b', 'Consultoria B', 'consultoria-b', 100, 100, 'Active'),
      ('org_c', 'Consultoria C', 'consultoria-c', 100, 100, 'Active'),
      ('org_s', 'Consultoria S', 'consultoria-s', 100, 100, 'Suspended')`),
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',1),
      ('u-cn','cn@ness.lat',?,'CN','consultor',NULL,'org_ness',1),
      ('u-an','an@ness.lat',?,'AN','consultoria_admin',NULL,'org_ness',1),
      ('u-comn','comn@ness.lat',?,'ComN','comercial',NULL,'org_ness',1),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1),
      ('u-cb','cb@b.lat',?,'CB','consultor',NULL,'org_b',1),
      ('u-cli','cli@cliente.lat',?,'Cli','org_admin','p-t1','org_ness',1)`).bind(h, h, h, h, h, h, h),
  ]);
  for (const p of ['p-t1', 'p-t2', 'p-t3', 'p-t4', 'p-t5', 'p-t6']) await semearProjeto(p);
  // venda que originou p-t1: fica com a ness. (quem vendeu)
  await d.batch([
    d.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-t1', 'Lead', 'Won', 'org_ness')`),
    d.prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, cliente, criada_por, status, projeto_id) VALUES ('pr-t1', 'org_ness', 'l-t1', 'NESS-2026-001', 'Cliente', 'comn@ness.lat', 'aceita', 'p-t1')`),
    d.prepare(`INSERT INTO contracts (id, lead_id, status, org_id, proposta_id, projeto_id) VALUES ('ct-t1', 'l-t1', 'Signed', 'org_ness', 'pr-t1', 'p-t1')`),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  S.cn = await sessionFor({ id: 'u-cn', email: 'cn@ness.lat', role: 'consultor', org_id: 'org_ness' });
  S.an = await sessionFor({ id: 'u-an', email: 'an@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' });
  S.comn = await sessionFor({ id: 'u-comn', email: 'comn@ness.lat', role: 'comercial', org_id: 'org_ness' });
  S.ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  S.cb = await sessionFor({ id: 'u-cb', email: 'cb@b.lat', role: 'consultor', org_id: 'org_b' });
  S.cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.lat', role: 'org_admin', client_project_id: 'p-t1' });
}, 60_000);

describe('POST /api/v1/platform/projects/:id/transferir', () => {
  it('muda a organização; a origem perde o acesso na requisição seguinte; o destino ganha; o cliente segue', async () => {
    // antes: o consultor e o agente da ness. alcançam; o administrador de org_b não
    expect((await chamar('GET', '/api/v1/projects/p-t1', S.cn)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-t1/risks', {}, undefined, agente('p-t1'))).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-t1', S.ab)).status).toBe(403);

    const r = await transferir('p-t1', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa);
    const body = await r.json<any>();
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ ok: true, origem: 'org_ness', destino: 'org_b' });
    expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-t1'))?.org_id).toBe('org_b');

    // consultor da ness.: fora, e o projeto some das listas dele
    expect([403, 404]).toContain((await chamar('GET', '/api/v1/projects/p-t1', S.cn)).status);
    expect([403, 404]).toContain((await chamar('GET', '/api/v1/projects/p-t1/risks', S.cn)).status);
    const lista = await (await chamar('GET', '/api/v1/projects', S.cn)).json<any[]>();
    expect(lista.map((p) => p.id)).not.toContain('p-t1');
    expect(lista.map((p) => p.id)).toContain('p-t2');
    // agente da ness.: 401 na próxima chamada
    expect((await chamar('GET', '/api/v1/projects/p-t1/risks', {}, undefined, agente('p-t1'))).status).toBe(401);
    // administrador de org_b: alcança sem designação
    expect((await chamar('GET', '/api/v1/projects/p-t1', S.ab)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-t1/risks', S.ab)).status).toBe(200);

    // cliente do projeto: entra (login de verdade) e alcança o próprio projeto; a conta não muda
    const login = await chamar('POST', '/api/v1/auth/login', {}, { email: 'cli@cliente.lat', password: SENHA });
    const l = await login.json<any>();
    expect(login.status, JSON.stringify(l)).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-t1', { Authorization: `Bearer ${l.token}` })).status).toBe(200);
    expect((await chamar('GET', '/api/v1/projects/p-t1', S.cli)).status).toBe(200);
    expect(await um('SELECT org_id, client_project_id, role FROM users WHERE id = ?', 'u-cli')).toEqual({ org_id: 'org_ness', client_project_id: 'p-t1', role: 'org_admin' });

    // governança: sai só o consultor da ORIGEM (sem diferença de caixa); o resto fica
    const g = await todos<{ id: string }>('SELECT id FROM project_governance WHERE project_id = ? ORDER BY id', 'p-t1');
    expect(g.map((x) => x.id)).toEqual(['g-cb-p-t1', 'g-ext-p-t1', 'g-tech-p-t1']);
    // efeito colateral documentado: consultor de org_b que já constava na governança passa a alcançar
    expect((await chamar('GET', '/api/v1/projects/p-t1', S.cb)).status).toBe(200);

    // concessões: a ativa é revogada pelo platform_admin; a já revogada não é reescrita
    expect(await um('SELECT revogado_por FROM agente_concessoes WHERE id = ?', 'c-p-t1')).toEqual({ revogado_por: 'pa@ness.lat' });
    expect((await um('SELECT revogado_em FROM agente_concessoes WHERE id = ?', 'c-p-t1'))?.revogado_em).toBeTruthy();
    expect(await um('SELECT revogado_em, revogado_por FROM agente_concessoes WHERE id = ?', 'c-velha-p-t1'))
      .toEqual({ revogado_em: '2026-01-01 00:00:00', revogado_por: 'cliente@x.com' });

    // trilha: uma linha, com origem, destino, motivo, os consultores removidos e o projeto
    const t = await todos<any>(`SELECT actor, details, project_id FROM audit_logs WHERE action = 'projeto.transferido' AND project_id = ?`, 'p-t1');
    expect(t).toHaveLength(1);
    expect(t[0].actor).toBe('pa@ness.lat');
    for (const trecho of ['org_ness', 'org_b', MOTIVO, 'CN@Ness.LAT']) expect(t[0].details).toContain(trecho);

    // a venda fica com quem vendeu
    expect((await um('SELECT org_id FROM propostas WHERE id = ?', 'pr-t1'))?.org_id).toBe('org_ness');
    expect((await um('SELECT org_id FROM contracts WHERE id = ?', 'ct-t1'))?.org_id).toBe('org_ness');
  });

  it('repetição, destino inexistente ou suspenso e projeto inexistente: recusa sem efeito', async () => {
    expect((await transferir('p-t2', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa)).status).toBe(200);
    // segunda chamada igual: agora a origem é o destino
    expect((await transferir('p-t2', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa)).status).toBe(409);
    expect((await transferir('p-t2', { orgDestinoId: 'org_nao_existe', motivo: MOTIVO }, S.pa)).status).toBe(404);
    expect((await transferir('p-t2', { orgDestinoId: 'org_s', motivo: MOTIVO }, S.pa)).status).toBe(409);
    expect((await transferir('p-nao-existe', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa)).status).toBe(404);
    expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-t2'))?.org_id).toBe('org_b');
    expect((await um(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'projeto.transferido' AND project_id = ?`, 'p-t2'))?.n).toBe(1);
  });

  it('só o platform_admin: equipe, cliente e agente recebem 403; corpo fora do contrato → 400', async () => {
    const corpo = { orgDestinoId: 'org_b', motivo: MOTIVO };
    for (const quem of ['an', 'cn', 'comn', 'ab', 'cb', 'cli']) {
      expect((await transferir('p-t3', corpo, S[quem])).status, quem).toBe(403);
    }
    // o agente nem chega à rota: FORA_DO_AGENTE cobre /api/v1/platform
    const ra = await transferir('p-t3', corpo, {}, agente('p-t3'));
    expect(ra.status).toBe(403);
    expect((await ra.json<any>()).error).toContain('fora do alcance do agente');
    // X-Org-Id não dá nada a quem não é platform_admin
    expect((await transferir('p-t3', corpo, { ...S.ab, 'X-Org-Id': 'org_ness' })).status).toBe(403);
    expect((await transferir('p-t3', { orgDestinoId: 'org_b', motivo: 'curt' }, S.pa)).status).toBe(400);
    expect((await transferir('p-t3', { orgDestinoId: 'org_b', motivo: 'x'.repeat(501) }, S.pa)).status).toBe(400);
    expect((await transferir('p-t3', { orgDestinoId: 'org_b', motivo: MOTIVO, extra: 1 }, S.pa)).status).toBe(400);
    expect((await transferir('p-t3', { motivo: MOTIVO }, S.pa)).status).toBe(400);
    expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-t3'))?.org_id).toBe('org_ness');
    expect((await um('SELECT revogado_em FROM agente_concessoes WHERE id = ?', 'c-p-t3'))?.revogado_em).toBeNull();
  });

  it('atomicidade: falha na revogação ou na governança e nada muda', async () => {
    for (const gatilho of [
      `CREATE TRIGGER falha_t4 BEFORE UPDATE ON agente_concessoes BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
      `CREATE TRIGGER falha_t4 BEFORE DELETE ON project_governance BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
    ]) {
      await env.DB.prepare(gatilho).run();
      try {
        expect((await transferir('p-t4', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa)).status).toBe(500);
      } finally {
        await env.DB.prepare('DROP TRIGGER falha_t4').run();
      }
      expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-t4'))?.org_id).toBe('org_ness');
      expect((await um('SELECT COUNT(*) AS n FROM project_governance WHERE project_id = ?', 'p-t4'))?.n).toBe(4);
      expect((await um('SELECT revogado_em FROM agente_concessoes WHERE id = ?', 'c-p-t4'))?.revogado_em).toBeNull();
      expect((await um(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'projeto.transferido' AND project_id = ?`, 'p-t4'))?.n).toBe(0);
    }
  });

  it('duas transferências simultâneas para destinos diferentes: uma vence, a outra 409', async () => {
    const [a, b] = await Promise.all([
      transferir('p-t5', { orgDestinoId: 'org_b', motivo: MOTIVO }, S.pa),
      transferir('p-t5', { orgDestinoId: 'org_c', motivo: MOTIVO }, S.pa),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const vencedor = a.status === 200 ? 'org_b' : 'org_c';
    expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-t5'))?.org_id).toBe(vencedor);
    expect((await um(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'projeto.transferido' AND project_id = ?`, 'p-t5'))?.n).toBe(1);
  });

  it('corrida determinística: a origem muda entre a leitura e o batch → o UPDATE guardado não age (nada muda)', async () => {
    // As duas chamadas leem a origem (org_ness) e só então os batches correm, em sequência.
    let liberar!: () => void;
    const barreira = new Promise<void>((r) => (liberar = r));
    let chegaram = 0;
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'batch') return async (stmts: D1PreparedStatement[]) => {
          if (++chegaram === 2) liberar();
          await barreira;
          return alvo.batch(stmts);
        };
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const e = (destino: string) => ({ projetoId: 'p-t6', orgDestinoId: destino, motivo: MOTIVO, atorEmail: 'pa@ness.lat', ip: '' });
    const rs = await Promise.all([transferirProjeto(db, e('org_b')), transferirProjeto(db, e('org_c'))]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toEqual({ ok: false, motivo: 'corrida' });
    expect((await um(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'projeto.transferido' AND project_id = ?`, 'p-t6'))?.n).toBe(1);
    // a mensagem da resposta HTTP da corrida perdida (409)
    expect(MSG_CORRIDA).toEqual({ error: 'O projeto mudou de organização; tente de novo' });
  });
});
