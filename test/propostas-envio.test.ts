// Envio por e-mail, link e aceite manual (fatia 4, Tarefa 3). D1 real; o Resend é um fetch falso.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { sha256Hex } from '../src/helpers';

const db = () => env.DB as D1Database;
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), RESEND_API_KEY: 'chave-de-teste' } as any);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

let seq = 0;
async function proposta(o: { status?: string; org?: string } = {}) {
  const id = `pe-${String(++seq).padStart(3, '0')}`;
  await db().batch([
    db().prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES (?, 'Cliente', ?, 'Proposal', ?)`).bind(`l-${id}`, `1122233${String(1000000 + seq)}`, o.org ?? 'org_ness'),
    db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, total_projeto, mensalidade, documento_html, documento_hash, valida_ate, criada_por)
      VALUES (?, ?, ?, ?, ?, 'Cliente Ltda.', 8200, 0, '<p>doc</p>', 'h', '2026-12-31', 'com@ness.lat')`)
      .bind(id, o.org ?? 'org_ness', `l-${id}`, `NESS-2026-${seq}`, o.status ?? 'gerada'),
    db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico, valor) VALUES (?, ?, 0, ?, 8200)`)
      .bind(`${id}-i`, id, JSON.stringify({ nome: 'Treinamento LGPD', norma: '', tipo: 'avulso', descricao: '', premissas: [], exclusoes: [], formaPreco: 'fixo', valorFixo: 8200, entregaveis: ['x'], criterioAceite: 'ok' })),
  ]);
  return id;
}
const linha = (id: string) => db().prepare('SELECT * FROM propostas WHERE id = ?').bind(id).first<any>();

describe('envio, link e aceite manual', () => {
  let com: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
  let corposResend: any[];
  let resendOk = true;

  beforeAll(async () => {
    await applySchema();
    await db().batch([
      db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      db().prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
    consultor = await sessionFor({ id: 'u-con', email: 'con@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-a' });
  }, 60_000);

  const espioes: any[] = [];
  const preparar = () => {
    corposResend = []; resendOk = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      corposResend.push(JSON.parse(init.body));
      return new Response(resendOk ? '{}' : 'falhou', { status: resendOk ? 200 : 500 });
    }) as any);
    espioes.push(vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'));
  };
  const logs = () => JSON.stringify(espioes.flatMap((s) => s.mock.calls));
  afterEach(() => { vi.restoreAllMocks(); espioes.length = 0; });
  const tokenDoEmail = () => /proposta#([0-9a-f]{64})/.exec(corposResend[0].html)![1];

  it('papéis: consultor, cliente e agente 403; outra organização 404', async () => {
    const id = await proposta();
    const outra = await proposta({ org: 'org_b' });
    for (const rota of ['enviar', 'link', 'revogar-link', 'aceite-manual']) {
      for (const h of [consultor, cliente]) expect((await chamar('POST', `/api/v1/propostas/${id}/${rota}`, h, {})).status, rota).toBe(403);
      const r = await app.fetch(new Request(`http://localhost/api/v1/propostas/${id}/${rota}`, { method: 'POST', headers: { ...json, 'X-Agente-Confirmado': '1' }, body: '{}' }), { ...workerEnv(), AGENTE } as any);
      expect(r.status, rota).toBe(403);
    }
    preparar();
    const corpos: Record<string, unknown> = { enviar: { email: 'a@b.com' }, link: {}, 'revogar-link': {}, 'aceite-manual': { nome: 'Ana', cargo: 'CEO', email: 'a@b.com', comprovante: 'contrato assinado' } };
    for (const [rota, corpo] of Object.entries(corpos)) expect((await chamar('POST', `/api/v1/propostas/${outra}/${rota}`, com, corpo)).status, rota).toBe(404);
    expect(corposResend).toHaveLength(0);
  }, 60_000);

  it('enviar: rascunho 409; corpo inválido 400; estados finais 409', async () => {
    preparar();
    const id = await proposta({ status: 'rascunho' });
    expect((await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'a@b.com' })).status).toBe(409);
    const g = await proposta();
    expect((await chamar('POST', `/api/v1/propostas/${g}/enviar`, com, { email: 'nao-e-email' })).status).toBe(400);
    expect((await chamar('POST', `/api/v1/propostas/${g}/enviar`, com, { email: 'a@b.com', extra: 1 })).status).toBe(400);
    for (const st of ['expirada', 'aceita', 'recusada', 'substituida']) {
      const x = await proposta({ status: st });
      expect((await chamar('POST', `/api/v1/propostas/${x}/enviar`, com, { email: 'a@b.com' })).status, st).toBe(409);
      expect((await chamar('POST', `/api/v1/propostas/${x}/link`, com, {})).status, st).toBe(409);
    }
    expect(corposResend).toHaveLength(0);
  }, 60_000);

  it('enviar: e-mail com remetente, Reply-To e link; só o hash no banco; o token não vaza', async () => {
    preparar();
    const id = await proposta();
    const r = await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'cliente@empresa.com', mensagem: '<b>Oi</b> "tudo"' });
    expect(r.status, await r.clone().text()).toBe(200);
    const corpoResposta = await r.text();
    const t = tokenDoEmail();
    expect(corpoResposta).not.toContain(t);
    const e = corposResend[0];
    expect(e.to).toEqual(['cliente@empresa.com']);
    expect(e.reply_to).toBe('com@ness.lat');
    expect(e.from).toMatch(/^[^<>"\r\n]+ via n\.iso <noreply@ness\.com\.br>$/);
    expect(e.html).toContain(`https://niso.ness.com.br/proposta#${t}`);
    expect(e.html).toContain('31/12/2026');
    expect(e.html).toContain('Ver e responder a proposta');
    expect(e.html).not.toContain('<b>Oi</b>');
    expect(e.html).toContain('&lt;b&gt;Oi&lt;/b&gt;');
    const p = await linha(id);
    expect(p).toMatchObject({ status: 'enviada', enviada_para: 'cliente@empresa.com', token_hash: await sha256Hex(t) });
    expect(p.enviada_em).toBeTruthy();
    expect(JSON.stringify((await db().prepare('SELECT * FROM audit_logs').all()).results)).not.toContain(t);
    const a = await db().prepare(`SELECT details FROM audit_logs WHERE action = 'proposta.enviada'`).first<any>();
    expect(a.details).toContain('cliente@empresa.com');
    expect(logs()).not.toContain(t);
  }, 60_000);

  it('segundo enviar troca o token_hash: o hash antigo não existe mais', async () => {
    preparar();
    const id = await proposta();
    await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'a@b.com' });
    const antigo = (await linha(id)).token_hash;
    await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'a@b.com' });
    const novo = (await linha(id)).token_hash;
    expect(novo).not.toBe(antigo);
    expect(await db().prepare('SELECT 1 FROM propostas WHERE token_hash = ?').bind(antigo).first()).toBeNull();
    // visualizada volta a enviada
    await db().prepare(`UPDATE propostas SET status = 'visualizada' WHERE id = ?`).bind(id).run();
    expect((await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'a@b.com' })).status).toBe(200);
    expect((await linha(id)).status).toBe('enviada');
  }, 60_000);

  it('falha do e-mail: 502 e nada muda (estado e token_hash anteriores)', async () => {
    preparar();
    const id = await proposta();
    expect((await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'a@b.com' })).status).toBe(200);
    const antes = await linha(id);
    resendOk = false;
    await db().prepare(`UPDATE propostas SET status = 'visualizada' WHERE id = ?`).bind(id).run();
    const r = await chamar('POST', `/api/v1/propostas/${id}/enviar`, com, { email: 'outro@b.com' });
    expect(r.status).toBe(502);
    const depois = await linha(id);
    expect(depois.status).toBe('visualizada');
    expect(depois.token_hash).toBe(antes.token_hash);
    expect(depois.enviada_para).toBe('a@b.com');
    // de gerada: continua gerada, sem hash
    const g = await proposta();
    expect((await chamar('POST', `/api/v1/propostas/${g}/enviar`, com, { email: 'a@b.com' })).status).toBe(502);
    expect(await linha(g)).toMatchObject({ status: 'gerada', token_hash: null, enviada_em: null });
    expect(await db().prepare(`SELECT 1 FROM audit_logs WHERE action = 'proposta.enviada' AND details LIKE ?`).bind(`%${g}%`).first()).toBeNull();
  }, 60_000);

  it('link: devolve a URL uma vez, o banco guarda o SHA-256 do token e o link anterior morre', async () => {
    preparar();
    const id = await proposta();
    const r = await chamar('POST', `/api/v1/propostas/${id}/link`, com);
    expect(r.status).toBe(200);
    const { url } = await r.json<any>();
    expect(url).toMatch(/^https:\/\/niso\.ness\.com\.br\/proposta#[0-9a-f]{64}$/);
    const t = url.split('#')[1];
    const p = await linha(id);
    expect(p.token_hash).toBe(await sha256Hex(t));
    expect(p.token_hash).not.toBe(t);
    expect(p.status).toBe('enviada');
    expect(p.link_gerado_em).toBeTruthy();
    expect(corposResend).toHaveLength(0);
    const { url: url2 } = await (await chamar('POST', `/api/v1/propostas/${id}/link`, com)).json<any>();
    const t2 = url2.split('#')[1];
    expect(t2).not.toBe(t);
    expect(await db().prepare('SELECT 1 FROM propostas WHERE token_hash = ?').bind(await sha256Hex(t)).first()).toBeNull();
    const audit = JSON.stringify((await db().prepare('SELECT * FROM audit_logs').all()).results);
    expect(audit).not.toContain(t);
    expect(audit).not.toContain(t2);
    expect(await db().prepare(`SELECT 1 FROM audit_logs WHERE action = 'proposta.link_gerado'`).first()).toBeTruthy();
    expect(logs()).not.toContain(t2);
  }, 60_000);

  it('revogar-link zera o token_hash e registra na trilha', async () => {
    preparar();
    const id = await proposta();
    await chamar('POST', `/api/v1/propostas/${id}/link`, com);
    expect((await linha(id)).token_hash).toBeTruthy();
    expect((await chamar('POST', `/api/v1/propostas/${id}/revogar-link`, com)).status).toBe(200);
    expect((await linha(id)).token_hash).toBeNull();
    expect(await db().prepare(`SELECT 1 FROM audit_logs WHERE action = 'proposta.link_revogado' AND details LIKE ?`).bind(`%${id}%`).first()).toBeTruthy();
  }, 60_000);

  it('aceite-manual fecha a venda; corpo inválido 400; segunda vez 409', async () => {
    preparar();
    const id = await proposta();
    const corpo = { nome: 'Ana Souza', cargo: 'Diretora', email: 'ana@cliente.com', comprovante: 'Contrato assinado em 02/10, arquivo X' };
    expect((await chamar('POST', `/api/v1/propostas/${id}/aceite-manual`, com, { ...corpo, comprovante: 'x' })).status).toBe(400);
    const r = await chamar('POST', `/api/v1/propostas/${id}/aceite-manual`, { ...com, 'CF-Connecting-IP': '203.0.113.7' }, corpo);
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await r.json<any>();
    expect(b.contratoId).toBeTruthy();
    expect(b.projetoId).toBeTruthy();
    expect(await linha(id)).toMatchObject({ status: 'aceita', aceite_origem: 'manual', aceite_nome: 'Ana Souza', aceite_ip: '203.0.113.7', aceite_comprovante: corpo.comprovante, contrato_id: b.contratoId });
    expect((await chamar('POST', `/api/v1/propostas/${id}/aceite-manual`, com, corpo)).status).toBe(409);
    const rasc = await proposta({ status: 'rascunho' });
    expect((await chamar('POST', `/api/v1/propostas/${rasc}/aceite-manual`, com, corpo)).status).toBe(409);
  }, 60_000);
});
