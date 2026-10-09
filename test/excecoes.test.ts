import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { criarDocumento, publicarVersao } from '../src/services/documentos';

/**
 * Fatia 3.5: exceção a documento. A aprovação é um pedido `tipo = 'excecao'` (ref_id = a exceção), a situação é
 * derivada (revogada, vencida, aprovada, aguardando, sem_pedido) e mudar escopo, motivo ou data invalida a aprovação.
 */
const SENHA = 'Senha-forte-123!';
const P = 'ex-proj';
const OUTRO = 'ex-outro';
const P_AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-ex' };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, e: object = workerEnv()) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), e as any);
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, ciso: Record<string, string>;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Exc = { id: string; escopo: string; motivo: string; vence_em: string; status: string; situacao: string; aprovacao: { por: string; em: string; papel: string } | null };
async function documento(titulo = 'Política de Acesso', projeto = P) {
  const c = await criarDocumento(env.DB, projeto, 'cons@ness.lat', { tipo: 'politica', titulo, texto: 'Texto v1' });
  if (!c.ok) throw new Error(c.error);
  await publicarVersao(env.DB, projeto, c.id, 1, 'cons@ness.lat');
  return c.id;
}
const base = (doc: string) => `/api/v1/projects/${P}/documentos/${doc}/excecoes`;
const nova = async (doc: string, extra: object = {}) => {
  const r = await chamar(consultor, 'POST', base(doc), { escopo: 'Equipe de suporte', motivo: 'Migração em curso', vence_em: dias(30), ...extra });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const listar = async (doc: string) => json<Exc[]>(await chamar(consultor, 'GET', base(doc)));
const achar = async (doc: string, id: string) => (await listar(doc)).find((x) => x.id === id)!;
const pedir = (ref: string, papel = 'ciso', emails = ['ciso@cliente.com']) =>
  chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'excecao', ref_id: ref, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) });
const pedido = async (ref: string, papel = 'ciso') => {
  const r = await pedir(ref, papel);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const aprovar = (id: string) => chamar(ciso, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
const statusPedidos = async (ref: string) =>
  (await env.DB.prepare(`SELECT status FROM pedidos WHERE tipo = 'excecao' AND ref_id = ? ORDER BY criado_em, rowid`).bind(ref).all<{ status: string }>()).results.map((r) => r.status);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ex-ctl', ?, 'ISO 27001:2022', 'A.5.1 Controle', 'Texto')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness')`).bind(senha, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ciso', ?, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO')`).bind(P, P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ex', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
}, 60_000);

describe('registrar a exceção', () => {
  it('cria com escopo, motivo e prazo; a lista mostra sem pedido e sem aprovação', async () => {
    const doc = await documento();
    const id = await nova(doc);
    expect(await achar(doc, id)).toMatchObject({ escopo: 'Equipe de suporte', motivo: 'Migração em curso', vence_em: dias(30), status: 'ativa', situacao: 'sem_pedido', aprovacao: null });
  });

  it('prazo no passado, formato errado, data impossível, escopo ou motivo vazios, campo extra: 400, e nada é gravado', async () => {
    const doc = await documento('Para validar');
    for (const corpo of [
      { vence_em: dias(-1) }, { vence_em: '31/12/2027' }, { vence_em: '2027-02-30' }, { vence_em: '' },
      { escopo: '  ' }, { motivo: '' }, { extra: 'x' },
    ]) {
      const r = await chamar(consultor, 'POST', base(doc), { escopo: 'e', motivo: 'm', vence_em: dias(10), ...corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
    expect(await listar(doc)).toEqual([]);
  });

  it('hoje vale; documento inexistente ou de outro projeto: 404', async () => {
    const doc = await documento('Prazo hoje');
    await nova(doc, { vence_em: dias(0) });
    const doutro = await documento('Do outro', OUTRO);
    for (const ref of ['nao-existe', doutro]) {
      expect((await chamar(consultor, 'POST', base(ref), { escopo: 'e', motivo: 'm', vence_em: dias(10) })).status, ref).toBe(404);
      expect((await chamar(consultor, 'GET', base(ref))).status, ref).toBe(404);
    }
  });
});

describe('aprovação por pedido', () => {
  it('pedir: congela escopo, motivo e prazo; ciência é 400; exceção alheia é 404; depois de aprovada a lista mostra quem aprovou e nada é assinado em controle', async () => {
    const doc = await documento('Para aprovar');
    const id = await nova(doc);
    const ped = await pedido(id);
    const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(ped).first<any>();
    expect(p).toMatchObject({ tipo: 'excecao', ref_id: id, papel_exigido: 'ciso', status: 'aberto' });
    expect(JSON.parse(p.conteudo_json)).toEqual({ escopo: 'Equipe de suporte', motivo: 'Migração em curso', vence_em: dias(30) });
    expect((await achar(doc, id)).situacao).toBe('aguardando');

    expect((await pedir(id, 'ciente')).status).toBe(400);
    expect((await pedir('nao-existe')).status).toBe(404);

    const r = await aprovar(ped);
    expect(r.status, await r.clone().text()).toBe(200);
    const e = await achar(doc, id);
    expect(e.situacao).toBe('aprovada');
    expect(e.aprovacao).toMatchObject({ por: 'Cida Matriz', papel: 'ciso' });
    expect(await env.DB.prepare(`SELECT ciso_approved_by FROM compliance_controls WHERE id = 'ex-ctl'`).first()).toEqual({ ciso_approved_by: null });
    expect((await env.DB.prepare('SELECT count(*) AS n FROM dpia_assessments').first<{ n: number }>())!.n).toBe(0);
  });

  it('mudar escopo, motivo ou prazo invalida a aprovação e substitui o pedido aberto; a prova antiga fica', async () => {
    const doc = await documento('Para editar');
    const id = await nova(doc);
    const ped = await pedido(id);
    await aprovar(ped);
    expect((await achar(doc, id)).situacao).toBe('aprovada');

    const r = await chamar(consultor, 'PUT', `${base(doc)}/${id}`, { motivo: 'Motivo novo' });
    expect(r.status, await r.clone().text()).toBe(200);
    const e = await achar(doc, id);
    expect(e).toMatchObject({ motivo: 'Motivo novo', situacao: 'sem_pedido', aprovacao: null });
    expect(await env.DB.prepare('SELECT status FROM pedido_destinatarios WHERE pedido_id = ?').bind(ped).first()).toEqual({ status: 'aprovado' });
    expect(await statusPedidos(id)).toEqual(['aprovado']);

    // com pedido aberto no meio, a edição o substitui
    const ped2 = await pedido(id);
    await chamar(consultor, 'PUT', `${base(doc)}/${id}`, { vence_em: dias(60) });
    expect(await statusPedidos(id)).toEqual(['aprovado', 'substituido', 'aberto']);
    expect((await achar(doc, id)).situacao).toBe('aguardando');
    expect(ped2).toBeTruthy();
  });

  it('PUT: nada para atualizar, prazo passado e exceção revogada são recusados', async () => {
    const doc = await documento('Para recusar edição');
    const id = await nova(doc);
    expect((await chamar(consultor, 'PUT', `${base(doc)}/${id}`, {})).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base(doc)}/${id}`, { vence_em: dias(-3) })).status).toBe(400);
    await chamar(consultor, 'POST', `${base(doc)}/${id}/revogar`);
    expect((await chamar(consultor, 'PUT', `${base(doc)}/${id}`, { motivo: 'x' })).status).toBe(409);
    expect((await chamar(consultor, 'PUT', `${base(doc)}/nao-existe`, { motivo: 'x' })).status).toBe(404);
  });
});

describe('vencida e revogada', () => {
  it('passou do prazo: vencida, mesmo aprovada', async () => {
    const doc = await documento('Para vencer');
    const id = await nova(doc);
    await aprovar(await pedido(id));
    await env.DB.prepare(`UPDATE documento_excecoes SET vence_em = ? WHERE id = ?`).bind(dias(-1), id).run();
    expect((await achar(doc, id)).situacao).toBe('vencida');
  });

  it('revogar: situação revogada, pedido aberto cancelado, segunda revogação 409, exceção revogada não recebe pedido novo', async () => {
    const doc = await documento('Para revogar');
    const id = await nova(doc);
    await pedido(id);
    const r = await chamar(consultor, 'POST', `${base(doc)}/${id}/revogar`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await achar(doc, id)).toMatchObject({ status: 'revogada', situacao: 'revogada' });
    expect(await statusPedidos(id)).toEqual(['cancelado']);
    expect(await env.DB.prepare('SELECT revogada_por FROM documento_excecoes WHERE id = ?').bind(id).first()).toEqual({ revogada_por: 'cons@ness.lat' });
    expect((await chamar(consultor, 'POST', `${base(doc)}/${id}/revogar`)).status).toBe(409);
    expect((await pedir(id)).status).toBe(404);
  });

  it('o agente cria, mas não revoga', async () => {
    const doc = await documento('Do agente');
    const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
      app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), AGENTE: P_AGENTE } as any);
    const c = await comoAgente('POST', base(doc), { escopo: 'e', motivo: 'm', vence_em: dias(10) });
    expect(c.status, await c.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(c)).id;
    expect((await comoAgente('POST', `${base(doc)}/${id}/revogar`)).status).toBe(403);
    expect((await achar(doc, id)).status).toBe('ativa');
  });
});
