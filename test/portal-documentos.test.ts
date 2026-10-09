import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';
import { criarDocumento, publicarVersao, salvarRascunho } from '../src/services/documentos';

/**
 * Portal público /politicas (fatia 3.3): lista os documentos com versão vigente e registra a ciência como
 * prova de pedido (canal `portal`), não mais em `policy_acknowledgments`. Sessão por código no e-mail.
 */
const P = 'pt-proj';
const OUTRO = 'pt-outro';
const E = { ...env, ENVIRONMENT: 'test' } as any; // em teste o request-otp devolve demo_otp

const publico = (metodo: string, caminho: string, corpo?: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request('http://localhost/api/v1/public' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Navegador do portal', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), E);
const json = async <T>(r: Response) => (await r.json()) as T;

/** Sessão do portal: pede o código, confirma, devolve o token. */
async function sessao(email: string, nome = 'Pessoa Portal', projeto = P) {
  const pedido = await publico('POST', '/policies/request-otp', { project_id: projeto, name: nome, email });
  expect(pedido.status, await pedido.clone().text()).toBe(200);
  const { demo_otp } = await json<{ demo_otp: string }>(pedido);
  const v = await publico('POST', '/policies/verify-otp', { project_id: projeto, email, otp: demo_otp });
  expect(v.status, await v.clone().text()).toBe(200);
  return (await json<{ token: string }>(v)).token;
}
type Doc = { id: string; tipo: string; titulo: string; numero: number; texto: string; ciencia: null | { numero: number; em: string; atual: boolean } };
const listar = async (token: string) => {
  const r = await publico('GET', `/policies/list?token=${token}`);
  expect(r.status, await r.clone().text()).toBe(200);
  return json<{ documents: Doc[]; legacy: { policy_type: string }[]; project: { client_name: string }; user: { email: string; name: string } }>(r);
};
const ack = (token: string, corpo: unknown) => publico('POST', `/policies/ack?token=${token}`, corpo);

async function documento(titulo: string, texto = 'Texto v1', projeto = P, tipo: 'politica' | 'norma' | 'procedimento' = 'politica') {
  const c = await criarDocumento(env.DB, projeto, 'cons@ness.lat', { tipo, titulo, texto });
  if (!c.ok) throw new Error(c.error);
  const p = await publicarVersao(env.DB, projeto, c.id, 1, 'cons@ness.lat');
  if (!p.ok) throw new Error(p.error);
  return c.id;
}
const nLegado = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM policy_acknowledgments').first<{ n: number }>())!.n;

let docA: string;
let rascunho: string;
let outro: string;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Portal', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(OUTRO),
    // controle com texto de catálogo: NÃO aparece no portal
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('pt-ctl', ?, 'ISO 27001', 'A.5.1 Só catálogo', 'Descrição do catálogo')`).bind(P),
    // ciência antiga, sem versão nem hash
    env.DB.prepare(`INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email) VALUES ('pa-1', ?, 'Política Antiga', 'Léo', 'leo@cliente.com')`).bind(P),
  ]);
  docA = await documento('Política de Acesso', 'Texto v1 do acesso');
  await documento('Procedimento de Backup', 'Passo a passo', P, 'procedimento');
  const r = await criarDocumento(env.DB, P, 'x', { tipo: 'politica', titulo: 'Só rascunho', texto: 'rascunho' });
  rascunho = (r as { id: string }).id;
  outro = await documento('Do outro projeto', 'Texto', OUTRO);
}, 60_000);

describe('listar', () => {
  it('traz só os documentos do projeto com versão vigente, com o texto, sem controle de catálogo nem rascunho', async () => {
    const token = await sessao('lia@cliente.com', 'Lia');
    const l = await listar(token);
    expect(l.documents.map((d) => d.titulo)).toEqual(['Política de Acesso', 'Procedimento de Backup']);
    expect(l.documents[0]).toMatchObject({ id: docA, tipo: 'politica', numero: 1, texto: 'Texto v1 do acesso', ciencia: null });
    expect(l.documents.map((d) => d.id)).not.toContain(rascunho);
    expect(l.documents.map((d) => d.id)).not.toContain(outro);
    expect(JSON.stringify(l)).not.toContain('Descrição do catálogo');
    expect(l.project.client_name).toBe('Cliente Portal');
    expect(l.user).toEqual({ name: 'Lia', email: 'lia@cliente.com' });
  });

  it('mostra a ciência antiga (sem prova de versão) em `legacy`, só a do e-mail da sessão', async () => {
    const leo = await listar(await sessao('leo@cliente.com', 'Léo'));
    expect(leo.legacy.map((a) => a.policy_type)).toEqual(['Política Antiga']);
    const outra = await listar(await sessao('mara@cliente.com', 'Mara'));
    expect(outra.legacy).toEqual([]);
  });

  it('sem token ou com sessão inválida: 401', async () => {
    expect((await publico('GET', '/policies/list')).status).toBe(401);
    expect((await publico('GET', '/policies/list?token=pubpol_naoexiste')).status).toBe(401);
  });
});

describe('dar ciência', () => {
  it('grava a ciência como prova (versão, hash, IP, user-agent), aparece na lista e NÃO escreve em policy_acknowledgments', async () => {
    const token = await sessao('ana@cliente.com', 'Ana');
    const antes = await nLegado();
    const r = await ack(token, { documento_id: docA });
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo = await json<{ ok: boolean; numero: number; hash: string; acknowledged_at: string; ja_registrada: boolean }>(r);
    expect(corpo).toMatchObject({ ok: true, numero: 1, ja_registrada: false });
    expect(corpo.hash).toMatch(/^[0-9a-f]{64}$/);

    const d = await env.DB.prepare(`SELECT pd.*, p.hash AS hash_pedido FROM pedido_destinatarios pd JOIN pedidos p ON p.id = pd.pedido_id WHERE pd.email = 'ana@cliente.com'`).first<any>();
    expect(d).toMatchObject({ nome: 'Ana', status: 'ciente', canal: 'portal', ip: '203.0.113.7', user_agent: 'Navegador do portal', mfa_usado: 0 });
    expect(d.hash_lido).toBe(d.hash_pedido);
    expect(d.hash_lido).toBe(corpo.hash);

    const l = await listar(token);
    expect(l.documents.find((x) => x.id === docA)?.ciencia).toMatchObject({ numero: 1, atual: true });
    expect(l.documents.find((x) => x.titulo === 'Procedimento de Backup')?.ciencia).toBeNull();
    expect(await nLegado()).toBe(antes);
  });

  it('repetir não duplica e avisa que já estava registrada', async () => {
    const token = await sessao('beto@cliente.com', 'Beto');
    await ack(token, { documento_id: docA });
    const r = await ack(token, { documento_id: docA });
    expect(await json(r)).toMatchObject({ ok: true, numero: 1, ja_registrada: true });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedido_destinatarios WHERE email = 'beto@cliente.com'`).first<{ n: number }>())!.n).toBe(1);
  });

  it('nome e e-mail do corpo não existem mais: campo extra é 400, e valem os da sessão', async () => {
    const token = await sessao('cris@cliente.com', 'Cris');
    expect((await ack(token, { documento_id: docA, user_email: 'outro@cliente.com', user_name: 'Outro' })).status).toBe(400);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedido_destinatarios WHERE email = 'outro@cliente.com'`).first<{ n: number }>())!.n).toBe(0);
    expect((await ack(token, { documento_id: docA })).status).toBe(200);
    expect(await env.DB.prepare(`SELECT nome FROM pedido_destinatarios WHERE email = 'cris@cliente.com'`).first()).toEqual({ nome: 'Cris' });
  });

  it('documento de outro projeto, só em rascunho ou inexistente: 404; sem token: 401', async () => {
    const token = await sessao('dani@cliente.com', 'Dani');
    for (const documento_id of [outro, rascunho, 'nao-existe']) expect((await ack(token, { documento_id })).status, documento_id).toBe(404);
    expect((await ack(token, {})).status).toBe(400);
    expect((await publico('POST', '/policies/ack', { documento_id: docA })).status).toBe(401);
    expect((await publico('POST', '/policies/ack?token=pubpol_naoexiste', { documento_id: docA })).status).toBe(401);
  });

  it('a sessão de um projeto não dá ciência em documento de outro (mesmo sabendo o id)', async () => {
    const tokenOutro = await sessao('edu@outro.com', 'Edu', OUTRO);
    expect((await ack(tokenOutro, { documento_id: docA })).status).toBe(404);
    expect((await ack(tokenOutro, { documento_id: outro })).status).toBe(200);
  });

  it('deixa trilha com o documento e a versão', async () => {
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'policy.acknowledged_public' ORDER BY created_at DESC LIMIT 1`).first<{ details: string }>();
    expect(t?.details).toContain('versão');
  });
});

describe('versão nova', () => {
  it('a ciência da versão 1 aparece como versão anterior, e a nova ciência cai na versão 2', async () => {
    const doc = await documento('Política de Mesa', 'Mesa v1');
    const token = await sessao('fabi@cliente.com', 'Fabi');
    await ack(token, { documento_id: doc });
    await salvarRascunho(env.DB, P, doc, 'cons@ness.lat', 'Mesa v2', 'humano');
    const admin = await sessionFor({ id: 'u-pt', email: 'cons@ness.lat', role: 'platform_admin' });
    const pub = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/documentos/${doc}/versoes/2/publicar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...admin },
    }), E);
    expect(pub.status, await pub.clone().text()).toBe(200);

    const antes = (await listar(token)).documents.find((d) => d.id === doc)!;
    expect(antes).toMatchObject({ numero: 2, texto: 'Mesa v2', ciencia: { numero: 1, atual: false } });
    const r = await ack(token, { documento_id: doc });
    expect(await json(r)).toMatchObject({ numero: 2, ja_registrada: false });
    expect((await listar(token)).documents.find((d) => d.id === doc)?.ciencia).toMatchObject({ numero: 2, atual: true });
  });
});

describe('código por e-mail', () => {
  it('depois de 5 códigos errados o 6º responde 429, o código certo já foi descartado, e pedir outro código recomeça', async () => {
    const email = 'gabi@cliente.com';
    const pedido = await publico('POST', '/policies/request-otp', { project_id: P, name: 'Gabi', email });
    const { demo_otp } = await json<{ demo_otp: string }>(pedido);
    const errado = demo_otp === '000000' ? '111111' : '000000';
    const verificar = (otp: string) => publico('POST', '/policies/verify-otp', { project_id: P, email, otp });
    for (let i = 0; i < 5; i++) expect((await verificar(errado)).status, `tentativa ${i + 1}`).toBe(400);
    expect((await verificar(errado)).status).toBe(429);
    expect((await verificar(demo_otp)).status).toBe(400); // o código foi descartado ao estourar: nem o certo vale mais

    const novo = await json<{ demo_otp: string }>(await publico('POST', '/policies/request-otp', { project_id: P, name: 'Gabi', email }));
    expect((await verificar(novo.demo_otp)).status).toBe(200);
  });
});
