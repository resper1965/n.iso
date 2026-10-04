import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { hashConteudo } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 2 do acesso de stakeholders: pedidos de aprovação/ciência com conteúdo congelado (SHA-256),
 * "Meus pedidos" do destinatário, aprovação com senha que grava a prova e aciona a assinatura do DPIA,
 * e substituição quando o documento muda.
 */
const SENHA = 'Senha-forte-123!';
const P = 'pd-proj';
const OUTRO = 'pd-outro';
const DPIA = 'pd-dpia';
const DPIA_OUTRO = 'pd-dpia-outro';

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...headers, ...extra },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

const criar = (h: Record<string, string>, corpo: Record<string, unknown>, projeto = P) =>
  chamar(h, 'POST', `/api/v1/projects/${projeto}/pedidos`, corpo);

const pedido = async (id: string) => env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<any>();
const destinatarios = async (id: string) =>
  (await env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email').bind(id).all<any>()).results;
const dpia = async (id = DPIA) => env.DB.prepare('SELECT * FROM dpia_assessments WHERE id = ?').bind(id).first<any>();

let consultor: Record<string, string>, consultorAlheio: Record<string, string>, cadm: Record<string, string>,
  cadmB: Record<string, string>, orgAdmin: Record<string, string>, orgUser: Record<string, string>,
  adm: Record<string, string>, stDpo: Record<string, string>, stCeo: Record<string, string>,
  stOutro: Record<string, string>, stSemPedido: Record<string, string>;

const resetDpia = () => env.DB.prepare(
  `UPDATE dpia_assessments SET processing_name = 'Folha de pagamento', data_category_risk = 'Dados de salário', ropa_id = NULL,
     necessity_proportionality = 'Necessário', technical_measures = 'Criptografia', residual_risk_level = 'Medium', dpo_recommendations = NULL,
     dpo_signature = NULL, ceo_signature = NULL, dpo_approved_by = NULL, dpo_approved_at = NULL, status = 'Under Review' WHERE id = ?`
).bind(DPIA).run();

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'b')`).run().catch(() => undefined);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27701', 'controller', 'Active', 'org_b')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, status)
      VALUES (?, ?, 'Folha de pagamento', 'Dados de salário', 'Necessário', 'Criptografia', 'Medium', 'Under Review')`).bind(DPIA, P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES (?, ?, 'Do outro', 'Draft')`).bind(DPIA_OUTRO, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cons2', 'cons2@ness.lat', ?, 'Cons2', 'consultor', NULL, 'org_ness'),
      ('u-cadm', 'cadm@ness.lat', ?, 'Cadm', 'consultoria_admin', NULL, 'org_ness'),
      ('u-cadmb', 'cadm@b.lat', ?, 'CadmB', 'consultoria_admin', NULL, 'org_b'),
      ('u-dpo', 'dpo@cliente.com', ?, 'Dora DPO', 'stakeholder', ?, 'org_ness'),
      ('u-ceo', 'ceo@cliente.com', ?, 'Caio CEO', 'stakeholder', ?, 'org_ness'),
      ('u-sem', 'sem@cliente.com', ?, 'Sem Pedido', 'stakeholder', ?, 'org_ness'),
      ('u-st-outro', 'st@outro.com', ?, 'St Outro', 'stakeholder', ?, 'org_b')`)
      .bind(senha, senha, senha, senha, senha, P, senha, P, senha, P, senha, OUTRO),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-dpo', ?, 'Dora DPO', 'dpo@cliente.com', 'executivo', 'DPO'),
      ('g-ceo', ?, 'Caio CEO', 'ceo@cliente.com', 'executivo', 'CEO')`).bind(P, P, P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  consultorAlheio = await sessionFor({ id: 'u-cons2', email: 'cons2@ness.lat', role: 'consultor' });
  cadm = await sessionFor({ id: 'u-cadm', email: 'cadm@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' });
  cadmB = await sessionFor({ id: 'u-cadmb', email: 'cadm@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  orgAdmin = await sessionFor({ id: 'u-oa', email: 'dono@cliente.com', role: 'org_admin', client_project_id: P });
  orgUser = await sessionFor({ id: 'u-ou', email: 'ou@cliente.com', role: 'org_user', client_project_id: P });
  adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  stDpo = await sessionFor({ id: 'u-dpo', email: 'dpo@cliente.com', role: 'stakeholder', client_project_id: P });
  stCeo = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', role: 'stakeholder', client_project_id: P });
  stSemPedido = await sessionFor({ id: 'u-sem', email: 'sem@cliente.com', role: 'stakeholder', client_project_id: P });
  stOutro = await sessionFor({ id: 'u-st-outro', email: 'st@outro.com', role: 'stakeholder', client_project_id: OUTRO, org_id: 'org_b' });
}, 60_000);

const corpoDpia = (papel: string, emails = ['dpo@cliente.com']) => ({
  tipo: 'dpia', ref_id: DPIA, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })),
});

describe('congelar o conteúdo', () => {
  it('hash estável: a ordem das chaves não muda o hash; conteúdo diferente muda', async () => {
    expect(await hashConteudo({ b: 1, a: { d: 2, c: 3 } })).toBe(await hashConteudo({ a: { c: 3, d: 2 }, b: 1 }));
    expect(await hashConteudo({ a: 1 })).not.toBe(await hashConteudo({ a: 2 }));
    expect(await hashConteudo({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('criar pedido congela o conteúdo do DPIA e grava o SHA-256; mesmo conteúdo, mesmo hash', async () => {
    await resetDpia();
    const r1 = await criar(consultor, corpoDpia('ciente'));
    expect(r1.status, await r1.clone().text()).toBe(201);
    const { id: id1 } = await r1.json<any>();
    const r2 = await criar(cadm, corpoDpia('ciente'));
    expect(r2.status).toBe(201);
    const { id: id2 } = await r2.json<any>();
    const [p1, p2] = [await pedido(id1), await pedido(id2)];
    expect(p1).toMatchObject({ org_id: 'org_ness', project_id: P, tipo: 'dpia', ref_id: DPIA, status: 'aberto', papel_exigido: 'ciente' });
    expect(p1.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(p1.hash).toBe(p2.hash);
    const conteudo = JSON.parse(p1.conteudo_json);
    expect(conteudo.processing_name).toBe('Folha de pagamento');
    expect(p1.hash).toBe(await hashConteudo(conteudo));
    // destinatário ligado à conta pelo e-mail
    expect((await destinatarios(id1))[0]).toMatchObject({ email: 'dpo@cliente.com', user_id: 'u-dpo', status: 'pendente' });
    await env.DB.prepare(`DELETE FROM pedidos WHERE id IN (?, ?)`).bind(id1, id2).run();
  });

  it('documento de outro projeto ou inexistente: 404; corpo inválido: 400', async () => {
    expect((await criar(consultor, { ...corpoDpia('ciso'), ref_id: DPIA_OUTRO })).status).toBe(404);
    expect((await criar(consultor, { ...corpoDpia('ciso'), ref_id: 'nao-existe' })).status).toBe(404);
    expect((await criar(consultor, { ...corpoDpia('ciso'), papel_exigido: 'rei' })).status).toBe(400);
    expect((await criar(consultor, { ...corpoDpia('ciso'), destinatarios: [] })).status).toBe(400);
    expect((await criar(consultor, { ...corpoDpia('ciso'), tipo: 'politica' })).status).toBe(400);
  });
});

describe('quem cria', () => {
  it('org_admin do projeto, consultor designado e consultoria_admin da org criam', async () => {
    for (const h of [orgAdmin, consultor, cadm]) {
      const r = await criar(h, corpoDpia('ciente'));
      expect(r.status, await r.clone().text()).toBe(201);
    }
    await env.DB.prepare('DELETE FROM pedidos').run();
  });

  it('stakeholder, org_user, platform_admin, consultor não designado e outra org: 403, nada criado', async () => {
    for (const h of [stDpo, orgUser, adm, consultorAlheio, cadmB]) {
      const r = await criar(h, corpoDpia('ciente'));
      expect(r.status, await r.clone().text()).toBe(403);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<any>()).n).toBe(0);
  });
});

describe('meus pedidos', () => {
  let meu: string, alheio: string;
  beforeAll(async () => {
    await resetDpia();
    meu = (await (await criar(consultor, corpoDpia('ciso', ['DPO@cliente.com']))).json<any>()).id;
    // Pedido no projeto de OUTRA organização, endereçado (por engano) ao e-mail do stakeholder de P.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
        VALUES ('pd-alheio', 'org_b', ?, 'dpia', ?, 'Alheio', 'ciente', '{}', 'h', 'x')`).bind(OUTRO, DPIA_OUTRO),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, user_id) VALUES ('pdd-alheio', 'pd-alheio', 'dpo@cliente.com', NULL)`),
    ]);
    alheio = 'pd-alheio';
  });

  it('o destinatário vê o seu pedido, com o conteúdo congelado e o hash', async () => {
    const lista = await chamar(stDpo, 'GET', '/api/v1/pedidos');
    expect(lista.status).toBe(200);
    const { pedidos } = await lista.json<any>();
    expect(pedidos.map((p: any) => p.id)).toEqual([meu]);
    const um = await chamar(stDpo, 'GET', `/api/v1/pedidos/${meu}`);
    expect(um.status).toBe(200);
    const corpo = await um.json<any>();
    expect(corpo.pedido.conteudo.processing_name).toBe('Folha de pagamento');
    expect(corpo.pedido.hash).toBe((await pedido(meu)).hash);
    expect(corpo.destinatario.status).toBe('pendente');
  });

  it('quem não é destinatário não lista nem abre (404)', async () => {
    const { pedidos } = await (await chamar(stSemPedido, 'GET', '/api/v1/pedidos')).json<any>();
    expect(pedidos).toEqual([]);
    expect((await chamar(stSemPedido, 'GET', `/api/v1/pedidos/${meu}`)).status).toBe(404);
    expect((await chamar(stCeo, 'GET', `/api/v1/pedidos/${meu}`)).status).toBe(404);
    // nem a consultoria abre pela rota do destinatário
    expect((await chamar(consultor, 'GET', `/api/v1/pedidos/${meu}`)).status).toBe(404);
  });

  it('pedido de outro projeto/org, mesmo com o meu e-mail: não aparece nem abre (404)', async () => {
    expect((await chamar(stDpo, 'GET', `/api/v1/pedidos/${alheio}`)).status).toBe(404);
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${alheio}/aprovar`, { senha: SENHA })).status).toBe(404);
    // e o stakeholder da outra org não vê o pedido de P
    expect((await chamar(stOutro, 'GET', `/api/v1/pedidos/${meu}`)).status).toBe(404);
    const { pedidos } = await (await chamar(stOutro, 'GET', '/api/v1/pedidos')).json<any>();
    expect(pedidos).toEqual([]);
  });
});

describe('aprovar e recusar', () => {
  it('aprovar exige senha; senha errada: 401 e nenhuma prova', async () => {
    await env.DB.prepare('DELETE FROM pedidos').run();
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciso'))).json<any>();
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, {})).status).toBe(400);
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: 'errada-123' })).status).toBe(401);
    expect((await destinatarios(id))[0]).toMatchObject({ status: 'pendente', decidido_em: null, hash_lido: null });
    expect((await dpia()).dpo_signature).toBeNull();
  });

  it('senha correta: grava a prova (hash lido = hash do pedido) e assina o DPIA como DPO', async () => {
    const { id } = (await env.DB.prepare(`SELECT id FROM pedidos WHERE status = 'aberto'`).first<any>())!;
    const r = await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA },
      { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'Navegador-Teste/1.0' });
    expect(r.status, await r.clone().text()).toBe(200);
    const p = await pedido(id);
    const [d] = await destinatarios(id);
    expect(d).toMatchObject({ status: 'aprovado', canal: 'conta', ip: '203.0.113.9', user_agent: 'Navegador-Teste/1.0', hash_lido: p.hash, mfa_usado: 0, nome: 'Dora DPO' });
    expect(d.decidido_em).toBeTruthy();
    expect(p.status).toBe('aprovado');
    const dp = await dpia();
    expect(dp.dpo_signature).toBe('Dora DPO');
    expect(dp.dpo_approved_by).toBe('Dora DPO');
    // decisão tomada não se refaz
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA })).status).toBe(409);
  });

  it('sem autoridade para o papel exigido: 403 e nada gravado (CEO não assina como DPO)', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciso', ['ceo@cliente.com']))).json<any>();
    const r = await chamar(stCeo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status).toBe(403);
    expect((await destinatarios(id))[0].status).toBe('pendente');
    expect((await dpia()).dpo_signature).toBeNull();
  });

  it('papel ceo: a Direção assina o DPIA como CEO', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ceo', ['ceo@cliente.com']))).json<any>();
    const r = await chamar(stCeo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await dpia()).ceo_signature).toBe('Caio CEO');
  });

  it('papel ciente: basta ser destinatário; grava ciência e não assina o DPIA', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciente', ['sem@cliente.com']))).json<any>();
    const r = await chamar(stSemPedido, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await destinatarios(id))[0]).toMatchObject({ status: 'ciente', canal: 'conta' });
    expect((await pedido(id)).status).toBe('aprovado');
    const dp = await dpia();
    expect([dp.dpo_signature, dp.ceo_signature]).toEqual([null, null]);
  });

  it('recusar exige senha e grava a recusa com o motivo; o pedido fica recusado', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciso'))).json<any>();
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/recusar`, { senha: 'errada-123', motivo: 'x' })).status).toBe(401);
    const r = await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/recusar`, { senha: SENHA, motivo: 'Falta o fluxo de dados' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await destinatarios(id))[0]).toMatchObject({ status: 'recusado', motivo: 'Falta o fluxo de dados', hash_lido: (await pedido(id)).hash });
    expect((await pedido(id)).status).toBe('recusado');
    expect((await dpia()).dpo_signature).toBeNull();
  });
});

describe('documento alterado depois do pedido', () => {
  it('editar o DPIA pela rota substitui o pedido; aprovar o antigo: 409; o novo segue para o mesmo destinatário', async () => {
    await env.DB.prepare('DELETE FROM pedidos').run();
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciso'))).json<any>();
    const ed = await chamar(consultor, 'PUT', `/api/v1/dpia/${DPIA}`, {
      processing_name: 'Folha de pagamento v2', data_category_risk: 'Dados de salário', necessity_proportionality: 'Necessário',
      technical_measures: 'Criptografia', residual_risk_level: 'Medium', dpo_recommendations: null, ropa_id: null, status: 'Under Review',
    });
    expect(ed.status, await ed.clone().text()).toBe(200);
    const antigo = await pedido(id);
    expect(antigo.status).toBe('substituido');
    expect(antigo.substituido_por).toBeTruthy();
    const r = await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status).toBe(409);
    expect((await r.json<any>()).substituido_por).toBe(antigo.substituido_por);
    expect((await destinatarios(id))[0].status).toBe('pendente');
    expect((await dpia()).dpo_signature).toBeNull();

    const novo = await pedido(antigo.substituido_por);
    expect(novo).toMatchObject({ status: 'aberto', ref_id: DPIA, papel_exigido: 'ciso' });
    expect(novo.hash).not.toBe(antigo.hash);
    expect(JSON.parse(novo.conteudo_json).processing_name).toBe('Folha de pagamento v2');
    expect((await destinatarios(novo.id)).map((d: any) => d.email)).toEqual(['dpo@cliente.com']);
    const { pedidos } = await (await chamar(stDpo, 'GET', '/api/v1/pedidos')).json<any>();
    expect(pedidos.find((p: any) => p.id === novo.id)?.status).toBe('aberto');
    const ok = await chamar(stDpo, 'POST', `/api/v1/pedidos/${novo.id}/aprovar`, { senha: SENHA });
    expect(ok.status, await ok.clone().text()).toBe(200);
  });

  it('alteração por fora da rota (direto no banco) também é pega na hora de aprovar: 409', async () => {
    await env.DB.prepare('DELETE FROM pedidos').run();
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciso'))).json<any>();
    await env.DB.prepare(`UPDATE dpia_assessments SET technical_measures = 'Outra' WHERE id = ?`).bind(DPIA).run();
    const r = await chamar(stDpo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status).toBe(409);
    expect((await pedido(id)).status).toBe('substituido');
    expect((await dpia()).dpo_signature).toBeNull();
  });

  it('a própria assinatura do DPIA não substitui o pedido (o hash cobre só o conteúdo)', async () => {
    await env.DB.prepare('DELETE FROM pedidos').run();
    await resetDpia();
    const { id: idDpo } = await (await criar(consultor, corpoDpia('ciso'))).json<any>();
    const { id: idCeo } = await (await criar(consultor, corpoDpia('ceo', ['ceo@cliente.com']))).json<any>();
    expect((await chamar(stDpo, 'POST', `/api/v1/pedidos/${idDpo}/aprovar`, { senha: SENHA })).status).toBe(200);
    const r = await chamar(stCeo, 'POST', `/api/v1/pedidos/${idCeo}/aprovar`, { senha: SENHA });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await dpia()).status).toBe('Approved');
  });
});

describe('papéis de cliente e de plataforma como destinatários (revisão da fatia 2)', () => {
  let ou: Record<string, string>, cl: Record<string, string>, pa: Record<string, string>;
  beforeAll(async () => {
    const senha = await hashPassword(SENHA);
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-ou2', 'ou2@cliente.com', ?, 'Olga Usuária', 'org_user', ?, 'org_ness'),
      ('u-cl2', 'cl2@cliente.com', ?, 'Cleo Cliente', 'client', ?, 'org_ness'),
      ('u-pa2', 'pa2@ness.lat', ?, 'Plataforma', 'platform_admin', NULL, 'org_ness')`).bind(senha, P, senha, P, senha).run();
    ou = await sessionFor({ id: 'u-ou2', email: 'ou2@cliente.com', role: 'org_user', client_project_id: P });
    cl = await sessionFor({ id: 'u-cl2', email: 'cl2@cliente.com', role: 'client', client_project_id: P });
    pa = await sessionFor({ id: 'u-pa2', email: 'pa2@ness.lat', role: 'platform_admin' });
  });

  it('org_user e client destinatários dão ciência e recusam com senha (o write-guard deixa passar só essas rotas)', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciente', ['ou2@cliente.com', 'cl2@cliente.com']))).json<any>();
    const r1 = await chamar(ou, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r1.status, await r1.clone().text()).toBe(200);
    const r2 = await chamar(cl, 'POST', `/api/v1/pedidos/${id}/recusar`, { senha: SENHA, motivo: 'Discordo' });
    expect(r2.status, await r2.clone().text()).toBe(200);
    const ds = await destinatarios(id);
    expect(ds.map((d: any) => [d.email, d.status])).toEqual([['cl2@cliente.com', 'recusado'], ['ou2@cliente.com', 'ciente']]);
  });

  it('org_user e client continuam sem criar pedido', async () => {
    for (const h of [ou, cl]) expect((await criar(h, corpoDpia('ciente'))).status).toBe(403);
  });

  it('platform_admin não dá ciência por cliente, mesmo destinatário: 403 e nada gravado', async () => {
    await resetDpia();
    const { id } = await (await criar(consultor, corpoDpia('ciente', ['pa2@ness.lat']))).json<any>();
    const r = await chamar(pa, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status, await r.clone().text()).toBe(403);
    expect((await destinatarios(id))[0].status).toBe('pendente');
  });
});
