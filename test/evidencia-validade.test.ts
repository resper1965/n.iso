import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { vencerEvidencias } from '../src/services/evidencia-validade';
import { avisosDePrazo, itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

/** Fatia 8: evidência com validade e ligada a requisito. Vencida volta a pending, sem apagar a assinatura; a cobertura da LGPD a conta. */
const HOJE = '2026-10-07';
const db = () => env.DB;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
const amanha = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const evid = (id: string, extra: { valido?: string | null; status?: string; projeto?: string; ciso?: string | null } = {}) =>
  db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, evaluation_status, valido_ate, ciso_approved_by) VALUES (?, ?, ?, 'k', 'h', 'u', ?, ?, ?)`)
    .bind(id, extra.projeto ?? 'p1', `${id}.pdf`, extra.status ?? 'conforming', extra.valido === undefined ? null : extra.valido, extra.ciso ?? null);
const lerStatus = async (id: string) => (await db().prepare('SELECT evaluation_status AS s, ciso_approved_by AS c FROM evidence WHERE id = ?').bind(id).first<{ s: string; c: string | null }>())!;

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), ('p2', 'Cliente p2', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
  ]);
  await habilitarPrivacy('p1', 'p2');
});

describe('vencerEvidencias', () => {
  it('volta a pending a vencida, mantém a assinatura, não toca em sem validade, futura ou já pendente, e registra na trilha', async () => {
    await db().batch([
      evid('vencida', { valido: '2026-10-01', ciso: 'Ana' }), evid('hoje', { valido: HOJE }), evid('futura', { valido: '2027-01-01' }), evid('sem'),
      evid('jaPendente', { valido: '2026-09-01', status: 'pending' }), evid('parcial', { valido: '2026-09-01', status: 'partial' }),
    ]);
    expect(await vencerEvidencias(db(), HOJE)).toBe(2);
    expect(await lerStatus('vencida')).toEqual({ s: 'pending', c: 'Ana' }); // a assinatura fica
    expect((await lerStatus('parcial')).s).toBe('pending');
    for (const id of ['hoje', 'futura', 'sem']) expect((await lerStatus(id)).s, id).toBe('conforming');
    const log = await db().prepare(`SELECT details, project_id FROM audit_logs WHERE action = 'evidencia.vencida' AND details LIKE '%vencida.pdf%'`).first<{ details: string; project_id: string }>();
    expect(log!.project_id).toBe('p1');
    expect(log!.details).toContain('conforming → pending');
  });

  it('rodar duas vezes no dia não repete a mudança nem a trilha', async () => {
    await evid('v', { valido: '2026-10-01' }).run();
    expect(await vencerEvidencias(db(), HOJE)).toBe(1);
    const antes = (await db().prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'evidencia.vencida'`).first<{ n: number }>())!.n;
    expect(await vencerEvidencias(db(), HOJE)).toBe(0);
    expect((await db().prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'evidencia.vencida'`).first<{ n: number }>())!.n).toBe(antes);
  });

  it('a rotina diária de avisos vence as evidências antes de avisar', async () => {
    await evid('v', { valido: '2026-10-01' }).run();
    await avisosDePrazo({ DB: db() } as any, HOJE);
    expect((await lerStatus('v')).s).toBe('pending');
  });
});

describe('fonte evidencia nos avisos', () => {
  it('D-7, D0 e atraso entram; sem validade e longe não; o título cita o arquivo', async () => {
    await db().batch([evid('d7', { valido: '2026-10-14' }), evid('d0', { valido: HOJE }), evid('atr', { valido: '2026-10-01' }), evid('longe', { valido: '2026-12-31' }), evid('sem')]);
    const it = (await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'evidencia');
    expect(Object.fromEntries(it.map((i) => [i.item_id, i.marco]))).toEqual({ d7: 'D-7', d0: 'D0', atr: 'atraso-2026-W41' });
    expect(it.find((i) => i.item_id === 'd0')!.titulo).toBe('Evidência d0.pdf');
    expect(tituloDoAviso({ fonte: 'evidencia', titulo: 'Evidência d0.pdf', marco: 'D0' })).toBe('Evidência d0.pdf vence hoje');
  });
  it('renovar a validade tira o item', async () => {
    await evid('r', { valido: '2026-10-01' }).run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'evidencia')).toHaveLength(1);
    await db().prepare(`UPDATE evidence SET valido_ate = '2027-06-30' WHERE id = 'r'`).run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'evidencia')).toHaveLength(0);
  });
});

describe('rotas e cobertura', () => {
  let consultor: Record<string, string>, cliente: Record<string, string>;
  const B = '/api/v1/projects/p1';
  beforeEach(async () => {
    await db().batch([
      db().prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), ('p2', 'Cliente p2', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', 'p1', 'org_ness')`),
      db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'p1', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
      db().prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
      db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:a', 'lgpd', 'art. 1', 'Um'), ('lgpd:b', 'lgpd', 'art. 2', 'Dois'), ('lgpd:c', 'lgpd', 'art. 3', 'Três'), ('lgpd:d', 'lgpd', 'art. 4', 'Quatro'), ('lgpd:e', 'lgpd', 'art. 5', 'Cinco')`),
    ]);
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'p1' });
  });

  it('define e limpa a validade; data inválida é 400; evidência de outro projeto é 404; cliente não escreve', async () => {
    await evid('rota1').run();
    expect((await chamar(consultor, 'PUT', `${B}/evidence/rota1/validade`, { valido_ate: '2027-05-31' })).status).toBe(200);
    expect((await db().prepare('SELECT valido_ate AS v FROM evidence WHERE id = ?').bind('rota1').first<{ v: string }>())!.v).toBe('2027-05-31');
    for (const corpo of [{ valido_ate: '31/05/2027' }, { valido_ate: '2027-02-30' }, {}, { valido_ate: '2027-05-31', extra: 1 }]) {
      expect((await chamar(consultor, 'PUT', `${B}/evidence/rota1/validade`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar(consultor, 'PUT', `${B}/evidence/rota1/validade`, { valido_ate: null })).status).toBe(200);
    expect((await db().prepare('SELECT valido_ate AS v FROM evidence WHERE id = ?').bind('rota1').first<{ v: string | null }>())!.v).toBeNull();
    await evid('alheia', { projeto: 'p2' }).run();
    expect((await chamar(consultor, 'PUT', `${B}/evidence/alheia/validade`, { valido_ate: '2027-05-31' })).status).toBe(404);
    expect((await chamar(cliente, 'PUT', `${B}/evidence/rota1/validade`, { valido_ate: '2027-05-31' })).status).toBe(403);
  });

  it('liga a evidência a requisitos: troca o conjunto, id desconhecido é 400, evidência alheia é 404, leitura mostra a validade', async () => {
    await evid('rota2', { valido: '2027-01-31' }).run();
    expect((await chamar(consultor, 'PUT', `${B}/evidence/rota2/requisitos`, { requisitos: ['lgpd:a', 'lgpd:a', 'lgpd:b'] })).status).toBe(200);
    const l = await json<{ valido_ate: string; requisitos: { id: string }[] }>(await chamar(cliente, 'GET', `${B}/evidence/rota2/requisitos`));
    expect(l.valido_ate).toBe('2027-01-31');
    expect(l.requisitos.map((r) => r.id)).toEqual(['lgpd:a', 'lgpd:b']);
    const ruim = await chamar(consultor, 'PUT', `${B}/evidence/rota2/requisitos`, { requisitos: ['fantasma'] });
    expect(ruim.status).toBe(400);
    expect((await json<{ requisitos: unknown[] }>(await chamar(consultor, 'GET', `${B}/evidence/rota2/requisitos`))).requisitos).toHaveLength(2);
    expect((await chamar(consultor, 'PUT', `${B}/evidence/alheia/requisitos`, { requisitos: ['lgpd:a'] })).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${B}/evidence/alheia/requisitos`)).status).toBe(404);
  });

  it('cobertura: evidência conforme e em dia cobre; parcial é parcial; vencida, pendente e não conforme não contam; evidência de outro projeto não vaza', async () => {
    await db().batch([
      evid('ok', { valido: amanha() }), evid('semval'), evid('parc', { status: 'partial' }), evid('venc', { valido: ontem() }), evid('pend', { status: 'pending' }), evid('nc', { status: 'non_conforming' }),
      evid('outro', { projeto: 'p2' }),
    ]);
    const liga = (e: string, r: string, projeto = 'p1') => db().prepare(`INSERT INTO evidencia_requisitos (evidencia_id, requisito_id, project_id) VALUES (?, ?, ?)`).bind(e, r, projeto);
    await db().batch([liga('ok', 'lgpd:a'), liga('parc', 'lgpd:b'), liga('venc', 'lgpd:c'), liga('pend', 'lgpd:d'), liga('nc', 'lgpd:d'), liga('semval', 'lgpd:e'), liga('outro', 'lgpd:c', 'p2')]);
    const r = await json<{ itens: { requisito_id: string; situacao: string; origens: { tipo: string; id: string }[] }[] }>(await chamar(consultor, 'GET', `${B}/requisitos/lacunas?fonte=lgpd`));
    const sit = Object.fromEntries(r.itens.map((i) => [i.requisito_id, i.situacao]));
    expect(sit).toEqual({ 'lgpd:a': 'coberto', 'lgpd:b': 'parcial', 'lgpd:c': 'lacuna', 'lgpd:d': 'lacuna', 'lgpd:e': 'coberto' });
    expect(r.itens.find((i) => i.requisito_id === 'lgpd:a')!.origens).toMatchObject([{ tipo: 'evidencia', id: 'ok' }]);
  });
});
