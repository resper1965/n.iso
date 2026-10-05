import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex, genToken } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 3 do acesso de stakeholders: ciência em massa por link com código, para quem não tem conta.
 * A consultoria manda um documento a uma lista de e-mails; cada pessoa recebe um link pessoal (token
 * só no fragmento da URL, só o SHA-256 no banco), abre o conteúdo congelado, pede um código de 6
 * dígitos ao próprio e-mail e confirma. Painel de acompanhamento e reenvio só aos pendentes.
 */
const P = 'pl-proj';
const OUTRO = 'pl-outro';
const POL = 'pl-pol';
const INVALIDO = JSON.stringify({ error: 'Link inválido ou expirado' });

let ipSeq = 0;
const ipNovo = () => `10.7.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const ENV = () => ({ ...workerEnv(), RESEND_API_KEY: 're_teste' });

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ipNovo(), ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), ENV() as any);
const publico = (acao: string, corpo: unknown, ip = ipNovo(), ua = 'Navegador de teste') =>
  app.fetch(new Request(`http://localhost/api/v1/public/pedidos/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': ua }, body: JSON.stringify(corpo),
  }), ENV() as any);

/** E-mails "enviados" (a chamada ao Resend é interceptada). */
let enviados: { to: string; subject: string; html: string }[] = [];
let resendFalha = new Set<string>();
/** Falha só na primeira tentativa para estes e-mails (a segunda entrega). */
let resendFalhaUmaVez = new Set<string>();
let tentativasResend: string[] = [];
beforeEach(() => {
  enviados = [];
  resendFalha = new Set();
  resendFalhaUmaVez = new Set();
  tentativasResend = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${url}`);
    const b = JSON.parse(init.body);
    tentativasResend.push(b.to[0]);
    if (resendFalha.has(b.to[0])) return new Response('{}', { status: 500 });
    if (resendFalhaUmaVez.delete(b.to[0])) return new Response('{}', { status: 500 });
    enviados.push({ to: b.to[0], subject: b.subject, html: b.html });
    return new Response('{"id":"x"}', { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

const tokenDe = (email: string) => {
  const m = [...enviados].reverse().find((e) => e.to === email)?.html.match(/\/politicas#([0-9a-f]{64})/);
  if (!m) throw new Error(`sem link para ${email}`);
  return m[1];
};
const codigoDe = (email: string) => {
  const m = [...enviados].reverse().find((e) => e.to === email)?.html.match(/<strong>(\d{6})<\/strong>/);
  if (!m) throw new Error(`sem código para ${email}`);
  return m[1];
};

let consultor: Record<string, string>, cadmB: Record<string, string>, stakeholder: Record<string, string>;
const dests = async (pedidoId: string) =>
  (await env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email').bind(pedidoId).all<any>()).results;
const resetPolitica = () => env.DB.prepare(`UPDATE compliance_controls SET title = 'Política de Segurança', description = 'Texto v1' WHERE id = ?`).bind(POL).run();

async function lote(emails: string[], extra: Record<string, unknown> = {}) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, {
    tipo: 'politica', ref_id: POL, destinatarios: emails.map((email) => ({ email })), ...extra,
  });
  expect(r.status, await r.clone().text()).toBe(201);
  return r.json<any>();
}

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'b')`).run().catch(() => undefined);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001', 'controller', 'Active', 'org_b')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?, ?, 'ISO 27001', 'Política de Segurança', 'Texto v1')`).bind(POL, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness'),
      ('u-cadmb', 'cadm@b.lat', 'x', 'CadmB', 'consultoria_admin', 'org_b')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cadmB = await sessionFor({ id: 'u-cadmb', email: 'cadm@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  stakeholder = await sessionFor({ id: 'u-stk', email: 'stk@cliente.com', role: 'stakeholder', client_project_id: P });
}, 60_000);

describe('criar o lote', () => {
  it('um token por e-mail, só o SHA-256 no banco, e-mail repetido ignorado, link só no fragmento', async () => {
    await resetPolitica();
    const r = await lote(['Ana@Cliente.com', 'ana@cliente.com ', 'bia@cliente.com']);
    expect(r.enviados).toBe(2);
    const linhas = await dests(r.id);
    expect(linhas.map((d) => d.email)).toEqual(['ana@cliente.com', 'bia@cliente.com']);
    expect(enviados.map((e) => e.to).sort()).toEqual(['ana@cliente.com', 'bia@cliente.com']);
    for (const d of linhas) {
      const token = tokenDe(d.email);
      expect(d.token_hash).toBe(await sha256Hex(token));
      expect(d.token_expira_em).toBeTruthy();
      expect(JSON.stringify(d)).not.toContain(token);
      expect(enviados.find((e) => e.to === d.email)!.html).not.toMatch(/[?&]token=/);
    }
    expect(tokenDe('ana@cliente.com')).not.toBe(tokenDe('bia@cliente.com'));
    // O token não volta na resposta nem fica na trilha.
    expect(JSON.stringify(r)).not.toContain(tokenDe('ana@cliente.com'));
    const trilha = JSON.stringify((await env.DB.prepare('SELECT details FROM audit_logs').all()).results);
    expect(trilha).not.toContain(tokenDe('ana@cliente.com'));
    const p = await env.DB.prepare('SELECT papel_exigido, tipo, status FROM pedidos WHERE id = ?').bind(r.id).first<any>();
    expect(p).toEqual({ papel_exigido: 'ciente', tipo: 'politica', status: 'aberto' });
  });

  it('sem chave de e-mail configurada não cria nada (503); limite de 200 e-mails; documento de outro projeto 404', async () => {
    const semChave = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/pedidos/ciencia`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor },
      body: JSON.stringify({ tipo: 'politica', ref_id: POL, destinatarios: [{ email: 'x@cliente.com' }] }),
    }), workerEnv());
    expect(semChave.status).toBe(503);
    const muitos = Array.from({ length: 201 }, (_, i) => ({ email: `p${i}@cliente.com` }));
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'politica', ref_id: POL, destinatarios: muitos })).status).toBe(400);
    expect((await chamar(cadmB, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'politica', ref_id: POL, destinatarios: [{ email: 'x@c.com' }] })).status).toBe(403);
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('pl-pol-b', ?, 'ISO', 'B')`).bind(OUTRO).run();
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'politica', ref_id: 'pl-pol-b', destinatarios: [{ email: 'x@c.com' }] })).status).toBe(404);
    expect((await chamar(stakeholder, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'politica', ref_id: POL, destinatarios: [{ email: 'x@c.com' }] })).status).toBe(403);
  });
});

describe('link público', () => {
  it('token falso, expirado, de pedido substituído ou malformado: o mesmo 404, byte a byte', async () => {
    await resetPolitica();
    const r = await lote(['exp@cliente.com', 'subst@cliente.com']);
    await env.DB.prepare(`UPDATE pedido_destinatarios SET token_expira_em = datetime('now', '-1 day') WHERE pedido_id = ? AND email = 'exp@cliente.com'`).bind(r.id).run();
    const expirado = tokenDe('exp@cliente.com');
    const doSubstituido = tokenDe('subst@cliente.com');

    const respostas: string[] = [];
    for (const t of [genToken(), 'x', expirado]) {
      for (const [acao, corpo] of [['ver', { token: t }], ['codigo', { token: t }], ['ciencia', { token: t, codigo: '123456', nome: 'Fulano' }]] as const) {
        const res = await publico(acao, corpo);
        expect(res.status, `${acao} ${t.slice(0, 6)}`).toBe(404);
        respostas.push(await res.text());
      }
    }
    // Documento alterado: o pedido vira substituído e o link antigo deixa de valer.
    await env.DB.prepare(`UPDATE compliance_controls SET description = 'Texto v2' WHERE id = ?`).bind(POL).run();
    for (const acao of ['ver', 'codigo']) {
      const res = await publico(acao, { token: doSubstituido });
      expect(res.status, acao).toBe(404);
      respostas.push(await res.text());
    }
    expect(new Set(respostas)).toEqual(new Set([INVALIDO]));
    expect((await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(r.id).first<any>()).status).toBe('substituido');
  });

  it('empresa atrás de NAT: 12 pessoas do mesmo IP leem, pedem código e dão ciência sem 429', async () => {
    await resetPolitica();
    const ip = '10.201.0.1';
    const emails = Array.from({ length: 12 }, (_, i) => `nat${i}@cliente.com`);
    await lote(emails);
    for (const e of emails) {
      const token = tokenDe(e);
      expect((await publico('ver', { token }, ip)).status, e).toBe(200);
      expect((await publico('codigo', { token }, ip)).status, e).toBe(200);
      expect((await publico('ciencia', { token, codigo: codigoDe(e), nome: 'Pessoa NAT' }, ip)).status, e).toBe(200);
    }
  });

  it('limite por IP: 600 em 10 min, a 601ª é 429; o limite por token corta antes da 21ª', async () => {
    const ip = '10.200.0.1';
    // Janela já com 599 chamadas deste IP (600 chamadas reais seria lento): a 600ª passa, a 601ª não.
    await env.DB.prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES (?, 599, ?)`)
      .bind(`pedido-publico:ip:${ip}`, Math.floor(Date.now() / 1000)).run();
    expect((await publico('ver', { token: genToken() }, ip)).status).toBe(404);
    expect((await publico('ver', { token: genToken() }, ip)).status).toBe(429);
    const t = genToken();
    for (let i = 0; i < 20; i++) expect((await publico('ver', { token: t })).status).toBe(404);
    expect((await publico('ver', { token: t })).status).toBe(429);
    const chaves = JSON.stringify((await env.DB.prepare('SELECT key FROM rate_limits').all()).results);
    expect(chaves).not.toContain(t);
  });

  it('ver devolve o conteúdo congelado e o hash, e marca aberto_em', async () => {
    await resetPolitica();
    const r = await lote(['leitor@cliente.com']);
    const res = await publico('ver', { token: tokenDe('leitor@cliente.com') });
    expect(res.status).toBe(200);
    const b = await res.json<any>();
    expect(b.estado).toBe('pendente');
    expect(b.conteudo).toEqual({ title: 'Política de Segurança', description: 'Texto v1' });
    expect(b.hash).toBe(r.hash);
    expect(JSON.stringify(b)).not.toMatch(/token_hash|org_id|criado_por/);
    expect((await dests(r.id))[0].aberto_em).toBeTruthy();
  });

  it('código vai ao e-mail do destinatário; errado ou expirado não libera; certo grava a prova', async () => {
    await resetPolitica();
    const r = await lote(['prova@cliente.com']);
    const token = tokenDe('prova@cliente.com');
    const env1 = await publico('codigo', { token });
    expect(env1.status).toBe(200);
    expect(JSON.stringify(await env1.json())).not.toMatch(/\d{6}/);
    const codigo = codigoDe('prova@cliente.com');
    expect(enviados.at(-1)!.to).toBe('prova@cliente.com');

    const errado = codigo === '000000' ? '111111' : '000000';
    expect((await publico('ciencia', { token, codigo: errado, nome: 'Paula Prova' })).status).toBe(400);
    expect((await dests(r.id))[0].status).toBe('pendente');

    // Código expirado (o KV ainda não o apagou): não libera.
    const destId = (await dests(r.id))[0].id;
    await env.SESSIONS.put(`pedido_otp_${destId}`, JSON.stringify({ h: await sha256Hex(codigo), exp: Date.now() - 1000 }), { expirationTtl: 900 });
    expect((await publico('ciencia', { token, codigo, nome: 'Paula Prova' })).status).toBe(400);
    expect((await dests(r.id))[0].status).toBe('pendente');

    await publico('codigo', { token });
    const novo = codigoDe('prova@cliente.com');
    const ok = await publico('ciencia', { token, codigo: novo, nome: 'Paula Prova' }, '203.0.113.9', 'Firefox/999');
    expect(ok.status, await ok.clone().text()).toBe(200);
    const d = (await dests(r.id))[0];
    expect(d).toMatchObject({ status: 'ciente', canal: 'link', ip: '203.0.113.9', user_agent: 'Firefox/999', hash_lido: r.hash, nome: 'Paula Prova', mfa_usado: 0 });
    expect(d.decidido_em).toBeTruthy();
    // Depois de dar ciência, o código não é reaproveitado e a prova não muda.
    expect((await publico('ciencia', { token, codigo: novo, nome: 'Outro Nome' })).status).toBeGreaterThanOrEqual(400);
    expect((await dests(r.id))[0].nome).toBe('Paula Prova');
    const ver = await (await publico('ver', { token })).json<any>();
    expect(ver.estado).toBe('ciente');
  });

  it('tentativas de código por destinatário são limitadas', async () => {
    await resetPolitica();
    await lote(['bruto@cliente.com']);
    const token = tokenDe('bruto@cliente.com');
    await publico('codigo', { token });
    const codigo = codigoDe('bruto@cliente.com');
    const errado = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await publico('ciencia', { token, codigo: errado, nome: 'Bruno' })).status).toBe(400);
    expect((await publico('ciencia', { token, codigo, nome: 'Bruno' })).status).toBe(429);
    // Estourou: o código guardado foi queimado; só um código novo libera.
    const r = await env.DB.prepare(`SELECT d.id FROM pedido_destinatarios d WHERE d.email = 'bruto@cliente.com'`).first<any>();
    expect(await env.SESSIONS.get(`pedido_otp_${r.id}`)).toBeNull();
    await publico('codigo', { token });
    const novo = codigoDe('bruto@cliente.com');
    expect((await publico('ciencia', { token, codigo: novo, nome: 'Bruno' })).status).toBe(200);
  });

  it('dupla ciência concorrente: uma só grava', async () => {
    await resetPolitica();
    const r = await lote(['dupla@cliente.com']);
    const token = tokenDe('dupla@cliente.com');
    await publico('codigo', { token });
    const codigo = codigoDe('dupla@cliente.com');
    const res = await Promise.all([1, 2, 3].map((i) => publico('ciencia', { token, codigo, nome: `Nome ${i}` })));
    expect(res.map((x) => x.status).filter((s) => s === 200)).toHaveLength(1);
    const d = (await dests(r.id))[0];
    expect(d.status).toBe('ciente');
    const n = await env.DB.prepare(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'pedido.ciente_link' AND details LIKE ?`).bind(`%${r.id}%`).first<any>();
    expect(n.n).toBe(1);
  });

  it('prova imutável: ciência concluída não aceita UPDATE', async () => {
    const d = await env.DB.prepare(`SELECT id FROM pedido_destinatarios WHERE status = 'ciente' LIMIT 1`).first<any>();
    await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET nome = 'Outro' WHERE id = ?`).bind(d.id).run()).rejects.toThrow();
  });
});

describe('painel e reenvio', () => {
  it('painel mostra ciente / pendente / não abriu; reenviar só atinge pendentes e troca o token', async () => {
    await resetPolitica();
    const r = await lote(['lido@cliente.com', 'abriu@cliente.com', 'nunca@cliente.com']);
    const tLido = tokenDe('lido@cliente.com');
    const tAbriu = tokenDe('abriu@cliente.com');
    await publico('ver', { token: tLido });
    await publico('codigo', { token: tLido });
    expect((await publico('ciencia', { token: tLido, codigo: codigoDe('lido@cliente.com'), nome: 'Lia' })).status).toBe(200);
    await publico('ver', { token: tAbriu });

    const painel = await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${r.id}`);
    expect(painel.status).toBe(200);
    const b = await painel.json<any>();
    const sit = Object.fromEntries(b.destinatarios.map((d: any) => [d.email, d.situacao]));
    expect(sit).toEqual({ 'lido@cliente.com': 'ciente', 'abriu@cliente.com': 'pendente', 'nunca@cliente.com': 'nao_abriu' });
    expect(JSON.stringify(b)).not.toContain('token_hash');

    const lista = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos`)).json<any>();
    expect(lista.pedidos.find((p: any) => p.id === r.id)).toMatchObject({ total: 3, cientes: 1, pendentes: 2 });

    const antes = await dests(r.id);
    enviados = [];
    const re = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/${r.id}/reenviar`);
    expect(re.status, await re.clone().text()).toBe(200);
    expect(enviados.map((e) => e.to).sort()).toEqual(['abriu@cliente.com', 'nunca@cliente.com']);
    const depois = await dests(r.id);
    const lido = (l: any[]) => l.find((d) => d.email === 'lido@cliente.com');
    expect(lido(depois)).toEqual(lido(antes));
    // O link antigo do pendente morreu; o novo vale.
    expect((await publico('ver', { token: tAbriu })).status).toBe(404);
    expect((await publico('ver', { token: tokenDe('abriu@cliente.com') })).status).toBe(200);
  });

  it('documento alterado: ciência antiga aparece como versão anterior no painel do pedido novo', async () => {
    await resetPolitica();
    const r = await lote(['v1@cliente.com', 'nada@cliente.com']);
    const t = tokenDe('v1@cliente.com');
    await publico('codigo', { token: t });
    expect((await publico('ciencia', { token: t, codigo: codigoDe('v1@cliente.com'), nome: 'Vera' })).status).toBe(200);
    await env.DB.prepare(`UPDATE compliance_controls SET description = 'Texto v3' WHERE id = ?`).bind(POL).run();

    const velho = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${r.id}`)).json<any>();
    expect(velho.pedido.status).toBe('substituido');
    const novoId = velho.pedido.substituido_por;
    expect(novoId).toBeTruthy();
    const novo = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${novoId}`)).json<any>();
    const v1 = novo.destinatarios.find((d: any) => d.email === 'v1@cliente.com');
    expect(v1.situacao).toBe('nao_abriu');
    expect(v1.versao_anterior).toMatchObject({ hash_lido: r.hash });
    expect(novo.destinatarios.find((d: any) => d.email === 'nada@cliente.com').versao_anterior).toBeNull();
    // Reenviar o pedido novo manda link novo aos dois (ambos pendentes nesta versão).
    enviados = [];
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/${novoId}/reenviar`)).status).toBe(200);
    expect(enviados.map((e) => e.to).sort()).toEqual(['nada@cliente.com', 'v1@cliente.com']);
    // O pedido velho não aceita reenvio.
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/${r.id}/reenviar`)).status).toBe(409);
  });

  it('envio: falha passageira é tentada de novo; falha persistente fica em falhas', async () => {
    await resetPolitica();
    resendFalhaUmaVez = new Set(['passa@cliente.com']);
    resendFalha = new Set(['cai@cliente.com']);
    const r = await lote(['passa@cliente.com', 'cai@cliente.com', 'ok@cliente.com']);
    expect(r.enviados).toBe(2);
    expect(r.falhas).toEqual(['cai@cliente.com']);
    expect(tentativasResend.filter((e) => e === 'passa@cliente.com')).toHaveLength(2);
    expect(tentativasResend.filter((e) => e === 'cai@cliente.com')).toHaveLength(2);
  });

  it('reenviar só às falhas: troca o token só delas; quem já recebeu segue com o link válido', async () => {
    await resetPolitica();
    resendFalha = new Set(['f1@cliente.com', 'f2@cliente.com']);
    const r = await lote(['f1@cliente.com', 'f2@cliente.com', 'chegou@cliente.com']);
    expect(r.falhas.sort()).toEqual(['f1@cliente.com', 'f2@cliente.com']);
    const tChegou = tokenDe('chegou@cliente.com');
    const antes = await dests(r.id);
    resendFalha = new Set();
    enviados = [];
    const re = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/${r.id}/reenviar`, { emails: r.falhas });
    expect(re.status, await re.clone().text()).toBe(200);
    expect(enviados.map((e) => e.to).sort()).toEqual(['f1@cliente.com', 'f2@cliente.com']);
    const depois = await dests(r.id);
    const de = (l: any[], e: string) => l.find((d) => d.email === e);
    expect(de(depois, 'chegou@cliente.com').token_hash).toBe(de(antes, 'chegou@cliente.com').token_hash);
    expect(de(depois, 'f1@cliente.com').token_hash).not.toBe(de(antes, 'f1@cliente.com').token_hash);
    expect((await publico('ver', { token: tChegou })).status).toBe(200);
    expect((await publico('ver', { token: tokenDe('f1@cliente.com') })).status).toBe(200);
  });

  it('linhas antigas do portal aparecem como versão não registrada', async () => {
    await resetPolitica();
    await env.DB.prepare(`INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email) VALUES ('ack-velho', ?, 'Política de Segurança', 'Olga', 'olga@cliente.com')`).bind(P).run();
    const r = await lote(['olga@cliente.com']);
    const b = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${r.id}`)).json<any>();
    expect(b.destinatarios[0].portal_antigo).toMatchObject({ user_name: 'Olga', hash: null });
  });

  it('painel e reenvio de outro projeto/organização: 403/404', async () => {
    await resetPolitica();
    const r = await lote(['iso@cliente.com']);
    expect((await chamar(cadmB, 'GET', `/api/v1/projects/${P}/pedidos/${r.id}`)).status).toBe(403);
    expect((await chamar(cadmB, 'POST', `/api/v1/projects/${P}/pedidos/${r.id}/reenviar`)).status).toBe(403);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/inexistente`)).status).toBe(404);
    expect((await chamar(stakeholder, 'GET', `/api/v1/projects/${P}/pedidos`)).status).toBe(403);
  });
});
