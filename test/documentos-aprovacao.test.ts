import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { criarDocumento, publicarVersao, salvarRascunho } from '../src/services/documentos';
import { criarPedido, registrarCienciaPortal } from '../src/services/pedidos';

/**
 * Fatia 3.4: a aprovação CISO/CEO de documento é por VERSÃO e é derivada dos pedidos: existe pedido `ciso`/`ceo`
 * aprovado cujo hash é o do conteúdo vigente agora. Versão nova invalida sozinha, sem apagar prova. Aprovar documento
 * não assina nada em `compliance_controls` nem em `dpia_assessments`.
 */
const SENHA = 'Senha-forte-123!';
const P = 'da-proj';
const OUTRO = 'da-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, ciso: Record<string, string>, dir: Record<string, string>, analista: Record<string, string>;
type Carimbo = { por: string; em: string } | null;
type Doc = { id: string; versao_vigente: number | null; aprovacao: { ciso: Carimbo; ceo: Carimbo } };

async function documento(titulo: string, texto = 'Texto v1', projeto = P) {
  const c = await criarDocumento(env.DB, projeto, 'cons@ness.lat', { tipo: 'politica', titulo, texto });
  if (!c.ok) throw new Error(c.error);
  const p = await publicarVersao(env.DB, projeto, c.id, 1, 'cons@ness.lat');
  if (!p.ok) throw new Error(p.error);
  return c.id;
}
const pedirAprovacao = (papel: string, emails: string[], ref: string, tipo = 'documento') =>
  chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo, ref_id: ref, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) });
const criado = async (papel: string, emails: string[], ref: string) => {
  const r = await pedirAprovacao(papel, emails, ref);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const decidir = (h: Record<string, string>, id: string, acao: 'aprovar' | 'recusar', corpo: Record<string, unknown> = { senha: SENHA }) =>
  chamar(h, 'POST', `/api/v1/pedidos/${id}/${acao}`, corpo);
const ler = async (id: string) => json<Doc>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/documentos/${id}`));
const publicarV2 = async (id: string, texto = 'Texto v2') => {
  await salvarRascunho(env.DB, P, id, 'cons@ness.lat', texto, 'humano');
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/documentos/${id}/versoes/2/publicar`);
  expect(r.status, await r.clone().text()).toBe(200);
};

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(OUTRO),
    // um controle JÁ assinado: a aprovação de documento não pode mexer nele
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_by, ciso_approved_at) VALUES ('da-ctl', ?, 'ISO 27001:2022', 'A.5.1 Original', 'Texto original', 'Assinante Original', '2026-01-01T00:00:00Z')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness'),
      ('u-dir', 'dir@cliente.com', ?, 'Davi', 'org_user', ?, 'org_ness'),
      ('u-ana', 'analista@cliente.com', ?, 'Ana', 'org_user', ?, 'org_ness')`).bind(senha, senha, P, senha, P, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ciso', ?, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO'),
      ('g-dir', ?, 'Davi Matriz', 'dir@cliente.com', 'executivo', 'Diretor Executivo'),
      ('g-ana', ?, 'Ana', 'analista@cliente.com', 'executivo', 'Analista de TI')`).bind(P, P, P, P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
  dir = await sessionFor({ id: 'u-dir', email: 'dir@cliente.com', role: 'org_user', client_project_id: P });
  analista = await sessionFor({ id: 'u-ana', email: 'analista@cliente.com', role: 'org_user', client_project_id: P });
}, 60_000);

describe('pedir a aprovação de um documento', () => {
  it('cria o pedido com a versão vigente congelada; ciência por esta rota é 400; sem versão vigente 404; sem autoridade 400', async () => {
    const doc = await documento('Política de Acesso');
    const id = await criado('ciso', ['ciso@cliente.com'], doc);
    const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<any>();
    expect(p).toMatchObject({ tipo: 'documento', ref_id: doc, papel_exigido: 'ciso', status: 'aberto' });
    expect(JSON.parse(p.conteudo_json)).toEqual({ titulo: 'Política de Acesso', texto: 'Texto v1', numero: 1 });

    expect((await pedirAprovacao('ciente', ['ciso@cliente.com'], doc)).status).toBe(400);
    const semVigente = await criarDocumento(env.DB, P, 'x', { tipo: 'politica', titulo: 'Só rascunho', texto: 'r' });
    expect((await pedirAprovacao('ciso', ['ciso@cliente.com'], (semVigente as { id: string }).id)).status).toBe(404);
    const doutro = await documento('Do outro', 'Texto', OUTRO);
    expect((await pedirAprovacao('ciso', ['ciso@cliente.com'], doutro)).status).toBe(404);
    expect((await pedirAprovacao('ciso', ['analista@cliente.com'], doc)).status).toBe(400); // analista não tem autoridade de CISO
  });
});

describe('aprovar e a aprovação derivada', () => {
  it('CISO e Direção aprovam; o documento mostra quem e quando, por papel, e nada é escrito em controle ou DPIA', async () => {
    const doc = await documento('Política de Backup');
    expect((await ler(doc)).aprovacao).toEqual({ ciso: null, ceo: null });

    const pCiso = await criado('ciso', ['ciso@cliente.com'], doc);
    const r1 = await decidir(ciso, pCiso, 'aprovar');
    expect(r1.status, await r1.clone().text()).toBe(200);
    let d = await ler(doc);
    expect(d.aprovacao.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(d.aprovacao.ciso!.em).toBeTruthy();
    expect(d.aprovacao.ceo).toBeNull();

    const pCeo = await criado('ceo', ['dir@cliente.com'], doc);
    expect((await decidir(dir, pCeo, 'aprovar')).status).toBe(200);
    d = await ler(doc);
    expect(d.aprovacao.ceo).toMatchObject({ por: 'Davi Matriz' });

    // a prova é a linha do destinatário, com hash lido e MFA; o controle assinado antes segue intacto
    const linha = await env.DB.prepare('SELECT status, hash_lido, canal FROM pedido_destinatarios WHERE pedido_id = ?').bind(pCiso).first<any>();
    const hashPedido = (await env.DB.prepare('SELECT hash FROM pedidos WHERE id = ?').bind(pCiso).first<{ hash: string }>())!.hash;
    expect(linha).toMatchObject({ status: 'aprovado', hash_lido: hashPedido, canal: 'conta' });
    expect(await env.DB.prepare(`SELECT ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id = 'da-ctl'`).first())
      .toEqual({ ciso_approved_by: 'Assinante Original', ceo_approved_by: null });
    expect((await env.DB.prepare('SELECT count(*) AS n FROM dpia_assessments').first<{ n: number }>())!.n).toBe(0);
  });

  it('versão nova torna a aprovação anterior não vigente, sem apagar a prova', async () => {
    const doc = await documento('Política de Senhas');
    const id = await criado('ciso', ['ciso@cliente.com'], doc);
    await decidir(ciso, id, 'aprovar');
    expect((await ler(doc)).aprovacao.ciso).not.toBeNull();
    await publicarV2(doc);
    expect((await ler(doc)).aprovacao).toEqual({ ciso: null, ceo: null });
    expect(await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(id).first()).toEqual({ status: 'aprovado' });
    expect(await env.DB.prepare('SELECT status FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first()).toEqual({ status: 'aprovado' });
  });

  it('quem não tem a autoridade do papel na matriz é recusado (403) e nada é gravado', async () => {
    const doc = await documento('Política de Mesa Limpa');
    const id = (await criarPedido(env.DB, { projectId: P, tipo: 'documento', refId: doc, papel: 'ciso', destinatarios: [{ email: 'analista@cliente.com' }], criadoPor: 'cons@ness.lat' }))!.id;
    const r = await decidir(analista, id, 'aprovar');
    expect(r.status).toBe(403);
    expect((await ler(doc)).aprovacao).toEqual({ ciso: null, ceo: null });
  });

  it('recusa grava o motivo e não aprova', async () => {
    const doc = await documento('Política de Retenção');
    const id = await criado('ciso', ['ciso@cliente.com'], doc);
    const r = await decidir(ciso, id, 'recusar', { senha: SENHA, motivo: 'Falta o prazo de retenção.' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await env.DB.prepare('SELECT status, motivo FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first()).toEqual({ status: 'recusado', motivo: 'Falta o prazo de retenção.' });
    expect((await ler(doc)).aprovacao.ciso).toBeNull();
  });

  it('a lista traz a aprovação de cada documento', async () => {
    const doc = await documento('Política da Lista');
    const id = await criado('ceo', ['dir@cliente.com'], doc);
    await decidir(dir, id, 'aprovar');
    const lista = await json<Doc[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/documentos`));
    expect(lista.find((d) => d.id === doc)?.aprovacao).toMatchObject({ ciso: null, ceo: { por: 'Davi Matriz' } });
    expect(lista.every((d) => d.aprovacao && 'ciso' in d.aprovacao && 'ceo' in d.aprovacao)).toBe(true);
  });
});

describe('ciências do documento', () => {
  type Ciencia = { nome: string; email: string; numero: number; canal: string; em: string; atual: boolean };

  it('lista quem deu ciência de qual versão e por qual canal, mais recente primeiro, e marca a versão atual', async () => {
    const doc = await documento('Política de Ciências', 'Ciências v1');
    // portal
    await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Gil', email: 'gil@cliente.com', ip: null, ua: null });
    // link: pedido de ciência com uma pessoa que dá ciência
    const lote = await criarPedido(env.DB, { projectId: P, tipo: 'documento', refId: doc, papel: 'ciente', destinatarios: [{ email: 'hana@cliente.com', nome: 'Hana' }], criadoPor: 'cons@ness.lat', comLink: true });
    await env.DB.prepare(`UPDATE pedido_destinatarios SET status = 'ciente', decidido_em = ?, canal = 'link', hash_lido = ? WHERE pedido_id = ?`)
      .bind(new Date(Date.now() + 1000).toISOString(), lote!.hash, lote!.id).run();

    let c = await json<Ciencia[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/documentos/${doc}/ciencias`));
    expect(c.map((x) => [x.email, x.numero, x.canal, x.atual])).toEqual([['hana@cliente.com', 1, 'link', true], ['gil@cliente.com', 1, 'portal', true]]);

    await publicarV2(doc, 'Ciências v2');
    c = await json<Ciencia[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/documentos/${doc}/ciencias`));
    expect(c.every((x) => x.numero === 1 && x.atual === false)).toBe(true); // continuam gravadas, agora como versão anterior
  });

  it('documento de outro projeto: 404', async () => {
    const doutro = await documento('Do outro 2', 'Texto', OUTRO);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${P}/documentos/${doutro}/ciencias`)).status).toBe(404);
  });
});
