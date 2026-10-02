// Rotas públicas do cliente (fatia 4, Tarefa 4): ver, aceitar, recusar, ajuste. Sem sessão; o token
// vai no corpo. D1 real. Review Focus 1, 2, 3 e 5 do plano.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { sha256Hex, genToken } from '../src/helpers';

const db = () => env.DB as D1Database;
let ipSeq = 0;
/** Cada chamada vem de um IP novo, salvo quando o teste fixa um: o limite por IP é testado à parte. */
const chamar = (acao: string, corpo: unknown, ip = `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`) =>
  app.fetch(new Request(`http://localhost/api/v1/public/propostas/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo),
  }), workerEnv() as any);

const ITEM = { nome: 'Implementação ISO 27001', norma: 'ISO 27001', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [], formaPreco: 'fixo', valorFixo: 90000, entregaveis: ['x'], criterioAceite: 'ok', fases: [{ nome: 'Diagnóstico', percentual: 100 }] };

let seq = 0;
/** Proposta com token conhecido; memória, margem e consultor com marcas que não podem chegar ao cliente. */
async function proposta(o: { status?: string; validaAte?: string } = {}) {
  const id = `pp-${String(++seq).padStart(3, '0')}`;
  const numero = `NESS-2026-${seq}`;
  const token = genToken();
  await db().batch([
    db().prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES (?, 'Cliente', ?, 'Proposal', 'org_ness')`).bind(`l-${id}`, `998877${String(10000000 + seq)}`),
    db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, revisao, status, cliente, consultor_email, total_projeto, mensalidade, memoria, margem,
      documento_html, documento_hash, valida_ate, criada_por, token_hash)
      VALUES (?, 'org_ness', ?, ?, 2, ?, 'Cliente Ltda.', 'consultor-secreto@ness.lat', 90000, 0, '{"faixa":"MEMORIA-SECRETA"}', '{"pct":"MARGEM-SECRETA"}',
      '<p>documento congelado</p>', 'hash-doc', ?, 'com@ness.lat', ?)`)
      .bind(id, `l-${id}`, numero, o.status ?? 'enviada', o.validaAte ?? '2099-12-31', await sha256Hex(token)),
    db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico, valor, desconto_pct) VALUES (?, ?, 0, ?, 90000, 7)`).bind(`${id}-i`, id, JSON.stringify(ITEM)),
  ]);
  return { id, token, leadId: `l-${id}`, numero };
}
const linha = (id: string) => db().prepare('SELECT * FROM propostas WHERE id = ?').bind(id).first<any>();
const conta = async (sql: string, ...b: unknown[]) => (await db().prepare(sql).bind(...b).first<{ n: number }>())!.n;
const ACEITE = { nome: 'Maria Cliente', cargo: 'Diretora', email: 'maria@cliente.com', poderes: true };
const INVALIDO = JSON.stringify({ error: 'Link inválido ou expirado' });

describe('rotas públicas da proposta', () => {
  const espioes: any[] = [];
  const espiar = () => espioes.push(vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'));
  const logs = () => JSON.stringify(espioes.flatMap((s) => s.mock.calls));
  afterEach(() => { vi.restoreAllMocks(); espioes.length = 0; });

  beforeAll(async () => {
    await applySchema();
    await db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-com','com@ness.lat','x','Com','comercial')`).run();
  }, 60_000);

  it('token desconhecido, malformado, revogado, rotacionado, vencido ou de proposta respondida: o mesmo 404, byte a byte', async () => {
    const revogada = await proposta();
    await db().prepare('UPDATE propostas SET token_hash = NULL WHERE id = ?').bind(revogada.id).run();
    const rotacionada = await proposta();
    await db().prepare('UPDATE propostas SET token_hash = ? WHERE id = ?').bind(await sha256Hex(genToken()), rotacionada.id).run();
    const vencidas = [await proposta({ validaAte: '2020-01-01' }), await proposta({ validaAte: '2020-01-01' }), await proposta({ validaAte: '2020-01-01' }), await proposta({ validaAte: '2020-01-01' })];
    const tokensMortos = [genToken(), 'x', revogada.token, rotacionada.token];
    const corpos: Record<string, (t: string) => unknown> = {
      ver: (t) => ({ token: t }), aceitar: (t) => ({ token: t, ...ACEITE }), recusar: (t) => ({ token: t, motivo: 'caro' }), ajuste: (t) => ({ token: t, mensagem: 'mude' }),
    };
    const respostas: string[] = [];
    for (const [acao, corpo] of Object.entries(corpos)) {
      for (const t of tokensMortos) {
        const r = await chamar(acao, corpo(t));
        expect(r.status, `${acao} ${t.slice(0, 6)}`).toBe(404);
        respostas.push(await r.text());
      }
    }
    // vencida: nas ações, o mesmo 404 (cada ação numa proposta vencida diferente, todas ainda "enviada" no banco)
    for (const [k, acao] of ['aceitar', 'recusar', 'ajuste'].entries()) {
      const r = await chamar(acao, corpos[acao](vencidas[k].token));
      expect(r.status, acao).toBe(404);
      respostas.push(await r.text());
      expect((await linha(vencidas[k].id)).status).toBe('expirada');
    }
    // estados respondidos e substituída: recusar e ajuste dão o mesmo 404; aceitar de recusada/substituida também
    for (const st of ['aceita', 'recusada', 'substituida', 'expirada', 'gerada']) {
      const p = await proposta({ status: st });
      for (const acao of ['recusar', 'ajuste', ...(st === 'aceita' ? [] : ['aceitar'])]) {
        const r = await chamar(acao, corpos[acao](p.token));
        expect(r.status, `${acao} ${st}`).toBe(404);
        respostas.push(await r.text());
      }
    }
    expect(new Set(respostas)).toEqual(new Set([INVALIDO]));
    expect(await conta('SELECT COUNT(*) n FROM contracts')).toBe(0);
  }, 120_000);

  it('ver: só o documento e metadados públicos; nada de memória, margem, desconto ou consultor', async () => {
    const p = await proposta();
    const r = await chamar('ver', { token: p.token });
    expect(r.status).toBe(200);
    const texto = await r.text();
    const b = JSON.parse(texto);
    expect(Object.keys(b).sort()).toEqual(['estado', 'html', 'numero', 'revisao', 'validaAte']);
    expect(b).toEqual({ estado: 'visualizada', html: '<p>documento congelado</p>', numero: p.numero, revisao: 2, validaAte: '2099-12-31' });
    for (const s of ['MEMORIA', 'MARGEM', 'memoria', 'margem', 'consultor', 'desconto', '90000', 'hash-doc', 'token']) expect(texto, s).not.toContain(s);
  }, 60_000);

  it('ver: a primeira abertura marca visualizada uma vez (trilha e notificação únicas, sem o token)', async () => {
    espiar();
    const p = await proposta();
    for (let i = 0; i < 3; i++) expect((await chamar('ver', { token: p.token })).status).toBe(200);
    const l = await linha(p.id);
    expect(l.status).toBe('visualizada');
    expect(l.visualizada_em).toBeTruthy();
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.visualizada' AND details LIKE ?`, `%${p.id}%`)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE user_id = 'u-com' AND target_id = ?`, p.id)).toBe(1);
    const tudo = JSON.stringify([(await db().prepare('SELECT * FROM audit_logs').all()).results, (await db().prepare('SELECT * FROM notifications').all()).results]);
    expect(tudo).not.toContain(p.token);
    expect(logs()).not.toContain(p.token);
  }, 60_000);

  it('ver: vencida marca expirada e não mostra o documento; respondidas mostram só o estado', async () => {
    const v = await proposta({ validaAte: '2020-01-01' });
    for (let i = 0; i < 2; i++) {
      const r = await chamar('ver', { token: v.token });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ estado: 'expirada' });
    }
    expect((await linha(v.id)).status).toBe('expirada');

    const a = await proposta();
    expect((await chamar('aceitar', { token: a.token, ...ACEITE })).status).toBe(200);
    const ra = await (await chamar('ver', { token: a.token })).json<any>();
    expect(Object.keys(ra).sort()).toEqual(['aceitaEm', 'aceitaPor', 'estado']);
    expect(ra).toMatchObject({ estado: 'aceita', aceitaPor: 'Maria Cliente' });
    expect(ra.aceitaEm).toBe((await linha(a.id)).aceite_em);

    for (const st of ['recusada', 'substituida']) {
      const p = await proposta({ status: st });
      const r = await chamar('ver', { token: p.token });
      expect(r.status, st).toBe(200);
      expect(await r.json(), st).toEqual({ estado: st });
    }
  }, 60_000);

  it('aceitar: poderes precisa ser true; corpo estrito', async () => {
    const p = await proposta();
    for (const corpo of [{ ...ACEITE, poderes: false }, { nome: 'Maria', cargo: 'CEO', email: 'm@c.com' }, { ...ACEITE, email: 'nao-e-email' }, { ...ACEITE, nome: 'M' }, { ...ACEITE, extra: 1 }]) {
      expect((await chamar('aceitar', { token: p.token, ...corpo })).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await linha(p.id)).status).toBe('enviada');
  }, 60_000);

  it('aceitar: fecha a venda pelo link com IP e devolve só ok e a data', async () => {
    espiar();
    const p = await proposta();
    const r = await chamar('aceitar', { token: p.token, ...ACEITE }, '203.0.113.50');
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await r.json<any>();
    expect(Object.keys(b).sort()).toEqual(['aceitaEm', 'ok']);
    const l = await linha(p.id);
    expect(l).toMatchObject({ status: 'aceita', aceite_origem: 'link', aceite_nome: 'Maria Cliente', aceite_cargo: 'Diretora', aceite_email: 'maria@cliente.com', aceite_ip: '203.0.113.50', aceite_em: b.aceitaEm });
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', p.id)).toBe(1);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', p.id)).toBe(1);
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(p.leadId).first<any>()).status).toBe('Won');
    expect(JSON.stringify((await db().prepare('SELECT * FROM audit_logs').all()).results)).not.toContain(p.token);
    expect(logs()).not.toContain(p.token);
    const de = await chamar('aceitar', { token: p.token, ...ACEITE });
    expect(de.status).toBe(409);
    expect(await de.json()).toEqual({ error: 'Esta proposta já foi respondida' });
  }, 60_000);

  it('aceite duplo concorrente: um 200, um 409; um contrato e um projeto', async () => {
    const p = await proposta();
    const rs = await Promise.all([chamar('aceitar', { token: p.token, ...ACEITE }), chamar('aceitar', { token: p.token, ...ACEITE })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', p.id)).toBe(1);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', p.id)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.aceita' AND details LIKE ?`, `%${p.id}%`)).toBe(1);
  }, 60_000);

  it('aceitar proposta enviada e vencida que nunca foi aberta: 404 e expirada, sem contrato', async () => {
    const p = await proposta({ validaAte: '2020-01-01' });
    const r = await chamar('aceitar', { token: p.token, ...ACEITE });
    expect(r.status).toBe(404);
    expect(await r.text()).toBe(INVALIDO);
    expect((await linha(p.id)).status).toBe('expirada');
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', p.id)).toBe(0);
  }, 60_000);

  it('recusar: proposta recusada com o motivo, lead Lost, notificação e trilha', async () => {
    const p = await proposta({ status: 'visualizada' });
    const r = await chamar('recusar', { token: p.token, motivo: 'Fora do orçamento' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(await linha(p.id)).toMatchObject({ status: 'recusada', recusa_motivo: 'Fora do orçamento' });
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(p.leadId).first<any>()).status).toBe('Lost');
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE user_id = 'u-com' AND target_id = ? AND action_type = 'proposta_recusada'`, p.id)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.recusada' AND details LIKE ?`, `%${p.id}%`)).toBe(1);
    // sem motivo também vale
    const q = await proposta();
    expect((await chamar('recusar', { token: q.token })).status).toBe(200);
    expect((await chamar('recusar', { token: q.token })).status).toBe(404);
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.recusada' AND details LIKE ?`, `%${q.id}%`)).toBe(1);
  }, 60_000);

  it('recusar e aceitar concorrentes: só um efeito', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await proposta();
      const [ra, rr] = await Promise.all([chamar('aceitar', { token: p.token, ...ACEITE }), chamar('recusar', { token: p.token })]);
      const l = await linha(p.id);
      const lead = (await db().prepare('SELECT status FROM leads WHERE id = ?').bind(p.leadId).first<any>()).status;
      const contratos = await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', p.id);
      if (l.status === 'aceita') {
        expect([ra.status, rr.status]).toEqual([200, 404]);
        expect([lead, contratos]).toEqual(['Won', 1]);
        expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.recusada' AND details LIKE ?`, `%${p.id}%`)).toBe(0);
      } else {
        expect(l.status).toBe('recusada');
        expect([ra.status, rr.status]).toEqual([404, 200]);
        expect([lead, contratos]).toEqual(['Lost', 0]);
        expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', p.id)).toBe(0);
      }
    }
  }, 120_000);

  it('ajuste: acumula as mensagens com data, notifica o criador e a proposta continua aberta', async () => {
    const p = await proposta({ status: 'visualizada' });
    expect((await chamar('ajuste', { token: p.token, mensagem: '' })).status).toBe(400);
    for (const m of ['Tirar o item 2', 'Parcelar em 4']) {
      const r = await chamar('ajuste', { token: p.token, mensagem: m });
      expect(r.status, await r.clone().text()).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
    }
    const l = await linha(p.id);
    expect(l.status).toBe('visualizada');
    expect(l.ajuste_mensagem).toMatch(/^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] Tirar o item 2\n\n\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] Parcelar em 4$/);
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE user_id = 'u-com' AND target_id = ? AND action_type = 'proposta_ajuste'`, p.id)).toBe(2);
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.ajuste_pedido' AND details LIKE ?`, `%${p.id}%`)).toBe(2);
    // teto do total: o mais antigo sai, o mais novo fica inteiro
    for (let i = 0; i < 12; i++) await chamar('ajuste', { token: p.token, mensagem: `${i}`.padEnd(2000, 'x') });
    const final = (await linha(p.id)).ajuste_mensagem as string;
    expect(final.length).toBeLessThanOrEqual(20000);
    expect(final.endsWith('11'.padEnd(2000, 'x'))).toBe(true);
    // de enviada continua enviada
    const q = await proposta();
    expect((await chamar('ajuste', { token: q.token, mensagem: 'oi' })).status).toBe(200);
    expect((await linha(q.id)).status).toBe('enviada');
  }, 60_000);

  it('limite por IP: 30 em 10 min, depois 429 em qualquer rota e com qualquer corpo', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 30; i++) expect((await chamar('ver', { token: genToken() }, ip)).status, `#${i}`).toBe(404);
    const p = await proposta();
    for (const [acao, corpo] of [['ver', { token: p.token }], ['aceitar', { token: p.token, ...ACEITE }], ['recusar', {}], ['ajuste', { mensagem: 1 }]] as const) {
      const r = await chamar(acao, corpo, ip);
      expect(r.status, acao).toBe(429);
      expect(await r.json()).toEqual({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
    }
    expect((await linha(p.id)).status).toBe('enviada');
    expect((await chamar('ver', { token: p.token }, '198.51.100.78')).status).toBe(200);
  }, 120_000);

  it('limite por token: 20 em 10 min, mesmo variando o IP; a chave não guarda o token', async () => {
    const p = await proposta();
    for (let i = 0; i < 20; i++) expect((await chamar('ver', { token: p.token })).status, `#${i}`).toBe(200);
    expect((await chamar('aceitar', { token: p.token, ...ACEITE })).status).toBe(429);
    expect((await linha(p.id)).status).toBe('visualizada');
    const chaves = JSON.stringify((await db().prepare('SELECT key FROM rate_limits').all()).results);
    expect(chaves).not.toContain(p.token);
    expect(chaves).toContain(await sha256Hex(p.token));
  }, 120_000);
});
