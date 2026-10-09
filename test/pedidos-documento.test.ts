import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { criarDocumento, publicarVersao, salvarRascunho } from '../src/services/documentos';
import { registrarCienciaPortal } from '../src/services/pedidos';

/**
 * Fatia 3.3: a ciência aponta para a VERSÃO do documento. O pedido `tipo = 'documento'` congela a versão
 * vigente (titulo, texto, numero); publicar versão nova substitui o pedido aberto e a ciência antiga continua
 * gravada no pedido antigo. Quem leu pelo portal público (canal `portal`) não é copiado para o pedido novo.
 */
const P = 'pd-proj';
const OUTRO = 'pd-outro';
const ENV = () => ({ ...workerEnv(), RESEND_API_KEY: 're_teste' });
let ipSeq = 0;
const ipNovo = () => `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ipNovo(), ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), ENV() as any);
const publico = (acao: string, corpo: unknown, ip = ipNovo()) =>
  app.fetch(new Request(`http://localhost/api/v1/public/pedidos/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': 'Navegador de teste' }, body: JSON.stringify(corpo),
  }), ENV() as any);

let enviados: { to: string; subject: string; html: string }[] = [];
beforeEach(() => {
  enviados = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${url}`);
    const b = JSON.parse(init.body);
    enviados.push({ to: b.to[0], subject: b.subject, html: b.html });
    return new Response('{"id":"x"}', { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

const tokenDe = (email: string) => [...enviados].reverse().find((e) => e.to === email)?.html.match(/\/politicas#([0-9a-f]{64})/)?.[1];
const codigoDe = (email: string) => [...enviados].reverse().find((e) => e.to === email)?.html.match(/<strong>(\d{6})<\/strong>/)?.[1];

let consultor: Record<string, string>;

/** Documento vigente (versão 1 publicada) no projeto. */
async function novoDocumento(titulo: string, texto = 'Texto v1', projeto = P) {
  const c = await criarDocumento(env.DB, projeto, 'cons@ness.lat', { tipo: 'politica', titulo, texto });
  if (!c.ok) throw new Error(c.error);
  const p = await publicarVersao(env.DB, projeto, c.id, 1, 'cons@ness.lat');
  if (!p.ok) throw new Error(p.error);
  return c.id;
}
async function lote(docId: string, emails: string[]) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'documento', ref_id: docId, destinatarios: emails.map((email) => ({ email })) });
  expect(r.status, await r.clone().text()).toBe(201);
  return r.json<{ id: string; hash: string }>();
}
async function cienteLink(email: string) {
  const token = tokenDe(email)!;
  await publico('ver', { token });
  await publico('codigo', { token });
  const r = await publico('ciencia', { token, codigo: codigoDe(email), nome: 'Pessoa Teste' });
  expect(r.status, await r.clone().text()).toBe(200);
}
const pedidosDoDoc = async (docId: string) =>
  (await env.DB.prepare('SELECT * FROM pedidos WHERE tipo = ? AND ref_id = ? ORDER BY criado_em, rowid').bind('documento', docId).all<any>()).results;
const dests = async (pedidoId: string) =>
  (await env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email').bind(pedidoId).all<any>()).results;
const publicarV2 = async (docId: string, texto = 'Texto v2') => {
  await salvarRascunho(env.DB, P, docId, 'cons@ness.lat', texto, 'humano');
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/documentos/${docId}/versoes/2/publicar`);
  expect(r.status, await r.clone().text()).toBe(200);
};

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-pd', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-pd', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-pd', email: 'cons@ness.lat', role: 'consultor' });
}, 60_000);

describe('lote de ciência de documento', () => {
  it('congela a versão vigente (titulo, texto, numero) e manda um link por e-mail', async () => {
    const doc = await novoDocumento('Política de Acesso');
    const r = await lote(doc, ['ana@cliente.com', 'bia@cliente.com']);
    const p = (await pedidosDoDoc(doc))[0];
    expect(p).toMatchObject({ id: r.id, tipo: 'documento', papel_exigido: 'ciente', status: 'aberto', titulo: 'Documento: Política de Acesso' });
    expect(JSON.parse(p.conteudo_json)).toEqual({ titulo: 'Política de Acesso', texto: 'Texto v1', numero: 1 });
    expect(tokenDe('ana@cliente.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenDe('bia@cliente.com')).not.toBe(tokenDe('ana@cliente.com'));
  });

  it('documento inexistente, sem versão vigente ou de outro projeto: 404, e nenhum pedido gravado', async () => {
    const semVigente = await criarDocumento(env.DB, P, 'x', { tipo: 'politica', titulo: 'Só rascunho', texto: 'rascunho' });
    const doutro = await novoDocumento('Do outro projeto', 'Texto', OUTRO);
    const antes = (await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<{ n: number }>())!.n;
    for (const ref_id of ['nao-existe', (semVigente as { id: string }).id, doutro]) {
      const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'documento', ref_id, destinatarios: [{ email: 'x@cliente.com' }] });
      expect(r.status, ref_id).toBe(404);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<{ n: number }>())!.n).toBe(antes);
  });

  it('aprovação (ciso/ceo) de documento não existe nesta fatia: o pedido comum recusa o tipo', async () => {
    const doc = await novoDocumento('Sem aprovação');
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'documento', ref_id: doc, papel_exigido: 'ciso', destinatarios: [{ email: 'a@cliente.com' }] });
    expect(r.status).toBe(400);
  });
});

describe('versão nova substitui o pedido; a ciência da versão antiga fica', () => {
  it('publicar a versão 2 substitui o pedido aberto e o novo leva a versão 2 aos mesmos destinatários, pendentes', async () => {
    const doc = await novoDocumento('Política de Backup');
    const { id: v1 } = await lote(doc, ['ana@cliente.com', 'bia@cliente.com']);
    await cienteLink('ana@cliente.com'); // Ana deu ciência da versão 1
    await publicarV2(doc);

    const [antigo, novo] = await pedidosDoDoc(doc);
    expect(antigo).toMatchObject({ id: v1, status: 'substituido', substituido_por: novo.id });
    expect(novo).toMatchObject({ status: 'aberto', papel_exigido: 'ciente' });
    expect(JSON.parse(novo.conteudo_json)).toEqual({ titulo: 'Política de Backup', texto: 'Texto v2', numero: 2 });

    // a prova da versão 1 continua onde estava
    const daAna = (await dests(v1)).find((d) => d.email === 'ana@cliente.com');
    expect(daAna).toMatchObject({ status: 'ciente', hash_lido: antigo.hash, canal: 'link' });
    // e na versão 2 todos voltam a pendente
    expect((await dests(novo.id)).map((d) => [d.email, d.status])).toEqual([['ana@cliente.com', 'pendente'], ['bia@cliente.com', 'pendente']]);
  });

  it('publicar a versão 2 manda link novo a quem estava pendente, e o texto que ele abre é o da versão 2', async () => {
    const doc = await novoDocumento('Política de Senhas');
    await lote(doc, ['carla@cliente.com']);
    const tokenAntigo = tokenDe('carla@cliente.com');
    await publicarV2(doc, 'Texto v2 das senhas');
    const tokenNovo = tokenDe('carla@cliente.com');
    expect(tokenNovo).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenNovo).not.toBe(tokenAntigo);
    const ver = await publico('ver', { token: tokenNovo });
    expect(ver.status, await ver.clone().text()).toBe(200);
    expect(JSON.stringify(await ver.json())).toContain('Texto v2 das senhas');
  });

  it('confirmar com o código da versão 1 depois que a versão 2 saiu não grava ciência nenhuma', async () => {
    const doc = await novoDocumento('Política de Mesa Limpa');
    await lote(doc, ['dora@cliente.com']);
    const token = tokenDe('dora@cliente.com')!;
    await publico('ver', { token });
    await publico('codigo', { token });
    const codigo = codigoDe('dora@cliente.com');
    await publicarV2(doc, 'Texto v2 da mesa limpa'); // sai ANTES de a Dora confirmar
    const r = await publico('ciencia', { token, codigo, nome: 'Dora' });
    expect(r.status).not.toBe(200);
    for (const p of await pedidosDoDoc(doc)) {
      expect((await dests(p.id)).filter((d) => d.status === 'ciente'), p.id).toEqual([]);
    }
  });

  it('gravar uma versão nova pela edição da política do controle também substitui o pedido do documento', async () => {
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('pd-ctl', ?, 'ISO 27001:2022', 'A.5.1 Controle', 'Catálogo')`).bind(P).run();
    const h = await sessionFor({ id: 'u-pd', email: 'cons@ness.lat', role: 'consultor' });
    // primeira edição: cria o documento do controle e publica a versão 1
    await chamar(h, 'POST', `/api/v1/projects/${P}/controls/pd-ctl/policy`, { text: 'Versão 1 do controle' });
    const doc = (await env.DB.prepare(`SELECT id FROM documentos WHERE origem_control_id = 'pd-ctl'`).first<{ id: string }>())!.id;
    const { id: ped } = await lote(doc, ['eva@cliente.com']);
    await chamar(h, 'POST', `/api/v1/projects/${P}/controls/pd-ctl/policy`, { text: 'Versão 2 do controle' });
    expect((await pedidosDoDoc(doc)).map((p) => [p.id === ped ? 'antigo' : 'novo', p.status])).toEqual([['antigo', 'substituido'], ['novo', 'aberto']]);
  });
});

describe('ciência pelo portal (canal portal)', () => {
  it('grava a ciência como prova completa num pedido "em pé" do documento, e repetir não duplica', async () => {
    const doc = await novoDocumento('Política do Portal');
    const a = await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Fábio', email: 'Fabio@Cliente.com', ip: '9.9.9.9', ua: 'UA do portal' });
    expect(a).toMatchObject({ ok: true, numero: 1, jaExistia: false });
    const [pedido] = await pedidosDoDoc(doc);
    expect(pedido).toMatchObject({ criado_por: 'sistema:portal', papel_exigido: 'ciente', status: 'aberto' });
    const d = (await dests(pedido.id))[0];
    expect(d).toMatchObject({ email: 'fabio@cliente.com', nome: 'Fábio', status: 'ciente', canal: 'portal', hash_lido: pedido.hash, ip: '9.9.9.9', user_agent: 'UA do portal', mfa_usado: 0, token_hash: null });
    expect(d.decidido_em).toBeTruthy();

    const b = await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Fábio', email: 'fabio@cliente.com', ip: '9.9.9.9', ua: 'UA' });
    expect(b).toMatchObject({ ok: true, numero: 1, jaExistia: true });
    expect((await pedidosDoDoc(doc))).toHaveLength(1);
    expect(await dests(pedido.id)).toHaveLength(1);
  });

  it('documento sem versão vigente ou de outro projeto: 404', async () => {
    const semVigente = await criarDocumento(env.DB, P, 'x', { tipo: 'politica', titulo: 'Só rascunho 2', texto: 'rascunho' });
    const doutro = await novoDocumento('Do outro 2', 'Texto', OUTRO);
    for (const documentoId of [(semVigente as { id: string }).id, doutro, 'nao-existe']) {
      expect(await registrarCienciaPortal(env.DB, { projectId: P, documentoId, nome: 'X', email: 'x@c.com', ip: null, ua: null })).toMatchObject({ ok: false, status: 404 });
    }
  });

  it('versão nova: o destinatário do portal NÃO é copiado para o pedido novo e nenhum e-mail sai para ele', async () => {
    const doc = await novoDocumento('Política do Portal 2');
    await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Gil', email: 'gil@cliente.com', ip: null, ua: null });
    enviados.length = 0;
    await publicarV2(doc);
    const [antigo, novo] = await pedidosDoDoc(doc);
    expect(antigo.status).toBe('substituido');
    expect((await dests(antigo.id)).map((d) => [d.email, d.status, d.canal])).toEqual([['gil@cliente.com', 'ciente', 'portal']]);
    expect(await dests(novo.id)).toEqual([]); // contêiner novo, sem ninguém
    expect(enviados.filter((e) => e.to === 'gil@cliente.com')).toEqual([]);

    // o Gil volta ao portal e dá ciência da versão 2: cai no contêiner novo
    const r = await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Gil', email: 'gil@cliente.com', ip: null, ua: null });
    expect(r).toMatchObject({ ok: true, numero: 2, jaExistia: false });
    expect((await dests(novo.id)).map((d) => d.email)).toEqual(['gil@cliente.com']);
  });

  it('o pedido "em pé" não se mistura com o lote por link do mesmo documento', async () => {
    const doc = await novoDocumento('Política Mista');
    const { id: lotePedido } = await lote(doc, ['hana@cliente.com']);
    await registrarCienciaPortal(env.DB, { projectId: P, documentoId: doc, nome: 'Ivo', email: 'ivo@cliente.com', ip: null, ua: null });
    expect((await dests(lotePedido)).map((d) => d.email)).toEqual(['hana@cliente.com']);
    expect((await pedidosDoDoc(doc)).filter((p) => p.criado_por === 'sistema:portal')).toHaveLength(1);
  });
});
