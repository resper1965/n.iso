import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Revisão da fatia 2, ponto 1: TOCTOU na decisão do pedido. Entre a conferência do hash e o `batch`
 * final, o documento pode mudar, o pedido pode ser substituído e a mesma pessoa pode recusar em
 * outra aba. Em nenhum desses casos o DPIA pode sair assinado.
 *
 * A janela é forçada com um D1 que executa uma mutação imediatamente ANTES do `batch` da decisão
 * (o único `batch` do caminho de aprovar quando o pedido está vigente).
 */
const SENHA = 'Senha-forte-123!';
const P = 'cr-proj';
const DPIA = 'cr-dpia';

const dbComJanela = (antesDoBatch: () => Promise<unknown>) => {
  let usada = false;
  return new Proxy(env.DB, {
    get(alvo, prop) {
      if (prop === 'batch') {
        return async (stmts: D1PreparedStatement[]) => {
          if (!usada) { usada = true; await antesDoBatch(); }
          return alvo.batch(stmts);
        };
      }
      const v = (alvo as any)[prop];
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
};

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, db?: D1Database) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...(db ? { DB: db } : {}) });

let consultor: Record<string, string>, stDpo: Record<string, string>;
const dpia = () => env.DB.prepare('SELECT dpo_signature, status FROM dpia_assessments WHERE id = ?').bind(DPIA).first<any>();
const dest = (pedidoId: string) => env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ?').bind(pedidoId).first<any>();
const novoPedido = async () => {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`,
    { tipo: 'dpia', ref_id: DPIA, papel_exigido: 'ciso', destinatarios: [{ email: 'dpo@cliente.com' }] });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json<any>()).id as string;
};
const aprovar = (id: string, db?: D1Database) => chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA }, db);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, technical_measures, status) VALUES (?, ?, 'Folha', 'Cripto', 'Under Review')`).bind(DPIA, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-dpo', 'dpo@cliente.com', ?, 'Dora DPO', 'stakeholder', ?, 'org_ness')`).bind(senha, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-dpo', ?, 'Dora DPO', 'dpo@cliente.com', 'executivo', 'DPO')`).bind(P, P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  stDpo = await sessionFor({ id: 'u-dpo', email: 'dpo@cliente.com', role: 'stakeholder', client_project_id: P });
}, 60_000);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pedidos'),
    env.DB.prepare(`UPDATE dpia_assessments SET processing_name = 'Folha', technical_measures = 'Cripto', dpo_signature = NULL,
      dpo_approved_by = NULL, dpo_approved_at = NULL, status = 'Under Review' WHERE id = ?`).bind(DPIA),
  ]);
});

describe('janela entre a conferência e o batch da decisão', () => {
  it('documento alterado na janela: 409, sem assinatura e sem prova', async () => {
    const id = await novoPedido();
    const r = await aprovar(id, dbComJanela(() =>
      env.DB.prepare(`UPDATE dpia_assessments SET technical_measures = 'Outra' WHERE id = ?`).bind(DPIA).run()));
    expect(r.status, await r.clone().text()).toBe(409);
    expect((await dpia()).dpo_signature).toBeNull();
    expect((await dest(id)).status).toBe('pendente');
  });

  it('pedido substituído na janela: 409, sem assinatura e sem prova', async () => {
    const id = await novoPedido();
    const r = await aprovar(id, dbComJanela(() =>
      env.DB.prepare(`UPDATE pedidos SET status = 'substituido' WHERE id = ?`).bind(id).run()));
    expect(r.status, await r.clone().text()).toBe(409);
    expect((await dpia()).dpo_signature).toBeNull();
    expect((await dest(id)).status).toBe('pendente');
  });

  it('a mesma pessoa recusou em outra aba na janela: 409 e o DPIA NÃO é assinado', async () => {
    const id = await novoPedido();
    const r = await aprovar(id, dbComJanela(() =>
      env.DB.prepare(`UPDATE pedido_destinatarios SET status = 'recusado', decidido_em = '2026-01-01T00:00:00.000Z' WHERE pedido_id = ?`).bind(id).run()));
    expect(r.status, await r.clone().text()).toBe(409);
    expect((await dpia()).dpo_signature).toBeNull();
    expect((await dest(id)).status).toBe('recusado');
  });

  it('aprovar e recusar ao mesmo tempo: uma decisão só, e assinatura só se a que ficou foi a aprovação', async () => {
    const id = await novoPedido();
    const [ra, rr] = await Promise.all([
      aprovar(id),
      chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/recusar`, { senha: SENHA, motivo: 'Não' }),
    ]);
    expect([ra.status, rr.status].sort()).toEqual([200, 409]);
    const d = await dest(id);
    const assinado = (await dpia()).dpo_signature;
    if (d.status === 'recusado') expect(assinado).toBeNull();
    else expect(assinado).toBe('Dora DPO');
  });

  it('sem janela, aprovar segue assinando (controle)', async () => {
    const id = await novoPedido();
    expect((await aprovar(id)).status).toBe(200);
    expect((await dpia()).dpo_signature).toBe('Dora DPO');
  });
});
