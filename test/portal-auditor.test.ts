import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, workerEnv } from './helpers/d1';

/**
 * Portal do auditor externo (P5): o token do link vai no CORPO, é procurado pelo hash e prende tudo
 * ao projeto dele. Vencido, revogado ou desconhecido: o mesmo 404, sem dizer qual.
 */
const A = 'pa-a';
const B = 'pa-b';
const INVALIDO = JSON.stringify({ error: 'Link inválido ou expirado' });
// Travessão e aspas tipográficas ficam fora do Latin-1: cabeçalho cru com eles derruba a resposta.
const NOME_DIFICIL = 'relatório “final” — v2.txt';

let ipSeq = 0;
const portal = (acao: string, corpo: unknown, ip = `10.55.0.${++ipSeq % 250}`) =>
  app.fetch(new Request(`http://localhost/api/v1/public/auditor/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo),
  }), workerEnv());

type EvidenciaPortal = { id: string; file_name: string; file_hash: string; evaluation_status: string; ciso_approved_by: string | null; ciso_approved_at: string | null };
type ControlePortal = { id: string; status: string; maturity: number; aplicavel: boolean; justificativa_exclusao: string | null; evidencias: EvidenciaPortal[] };
type Ver = { projeto: Record<string, unknown>; expira_em: string; controles: ControlePortal[]; evidencias_sem_controle: EvidenciaPortal[] };

beforeAll(async () => {
  await applySchema();
  const db = env.DB;
  const tok = (id: string, projeto: string, hash: string, expira: string, revogado: string | null = null) =>
    db.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ${expira}, ?)`).bind(id, projeto, hash, revogado);
  const ctl = (id: string, projeto: string, norma: string, titulo: string, status: string, maturidade: number, descricao: string) =>
    db.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity, description) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projeto, norma, titulo, status, maturidade, descricao);
  const ev = (id: string, controle: string | null, projeto: string, nome: string, chave: string, hash: string, avaliacao: string) =>
    db.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
                VALUES (?, ?, ?, ?, ?, ?, 'text/plain', 11, 'cons@ness.lat', ?)`).bind(id, controle, projeto, nome, chave, hash, avaliacao);
  await db.batch([
    db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, scope, repository_token) VALUES (?, 'Cliente A', 'ISO 27001:2022', 'Controller', 'Active', 'Sede e nuvem', 'segredo-repo')`).bind(A),
    db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente B', 'ISO 27001:2022', 'Controller', 'Active')`).bind(B),
    ctl('pa-c1', A, 'ISO 27001:2022', 'A.5.1 — Políticas', 'Implemented', 3, 'como implementamos'),
    ctl('pa-c2', A, 'ISO 27001:2022', 'A.7.4 — Monitoramento físico', 'Not Applicable', 0, 'Sem instalação física própria'),
    ctl('pa-c3', A, 'ISO 27701:2025', 'A.1.2.2 — Finalidade', 'Missing', 0, ''),
    ctl('pa-cb', B, 'ISO 27001:2022', 'A.5.1 — Políticas do B', 'Implemented', 2, ''),
    ev('pa-e1', 'pa-c1', A, NOME_DIFICIL, 'pa/e1.txt', 'hash-e1', 'conforming'),
    ev('pa-e2', null, A, 'ata.pdf', 'pa/e2.pdf', 'hash-e2', 'pending'),
    // Dado legado: evidência de A ligada a controle de B. Vai para "sem controle" e o id de B não sai.
    ev('pa-e3', 'pa-cb', A, 'legado.pdf', 'pa/e3.pdf', 'hash-e3', 'pending'),
    ev('pa-eb', 'pa-cb', B, 'segredo-b.pdf', 'pa/eb.pdf', 'hash-eb', 'conforming'),
    // A revisão (assinatura do Líder SGSI) vai ao auditor; IP e user-agent da assinatura, não.
    db.prepare(`UPDATE evidence SET ciso_approved_by = 'lider@cliente.test', ciso_approved_at = '2026-10-02 10:00:00',
                ciso_approved_ip = '203.0.113.77', ciso_approved_ua = 'NavegadorDoLider/1.0' WHERE id = 'pa-e1'`),
    tok('pa-t-a', A, await sha256Hex('tok-a'), `datetime('now', '+1 day')`),
    tok('pa-t-venc', A, await sha256Hex('tok-venc'), `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`),
    tok('pa-t-rev', A, await sha256Hex('tok-rev'), `datetime('now', '+1 day')`, '2026-10-01 00:00:00'),
    tok('pa-t-b', B, await sha256Hex('tok-b'), `datetime('now', '+1 day')`),
  ]);
  await env.STORAGE.put('pa/e1.txt', 'conteudo-e1');
  await env.STORAGE.put('pa/eb.pdf', 'conteudo-b');
});

describe('POST /ver', () => {
  it('projeto, SoA e evidências por controle, só do projeto do token', async () => {
    const r = await portal('ver', { token: 'tok-a' });
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await r.json<Ver>();
    expect(d.projeto).toEqual({ client_name: 'Cliente A', project_name: null, scope: 'Sede e nuvem', standards: 'ISO 27001:2022', org_role: 'Controller' });
    expect(d.controles.map((c) => c.id).sort()).toEqual(['pa-c1', 'pa-c2', 'pa-c3']);
    const c1 = d.controles.find((c) => c.id === 'pa-c1');
    expect(c1).toMatchObject({ aplicavel: true, justificativa_exclusao: null, status: 'Implemented', maturity: 3 });
    expect(c1?.evidencias.map((e) => [e.id, e.file_hash, e.evaluation_status, e.ciso_approved_by, e.ciso_approved_at]))
      .toEqual([['pa-e1', 'hash-e1', 'conforming', 'lider@cliente.test', '2026-10-02 10:00:00']]);
    expect(d.controles.find((c) => c.id === 'pa-c2')).toMatchObject({ aplicavel: false, justificativa_exclusao: 'Sem instalação física própria' });
    expect(d.evidencias_sem_controle.map((e) => e.id).sort()).toEqual(['pa-e2', 'pa-e3']);
    expect(d.expira_em).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('nada do outro projeto, nem chave do R2, token, hash do token, segredo do projeto ou IP/UA da assinatura', async () => {
    const texto = await (await portal('ver', { token: 'tok-a' })).text();
    for (const proibido of ['pa-b', 'pa-cb', 'pa-eb', 'segredo-b', 'pa/e1.txt', 'tok-a', await sha256Hex('tok-a'), 'segredo-repo', 'como implementamos', 'token',
      '203.0.113.77', 'NavegadorDoLider']) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it('vencido (gravado em ISO há um minuto), revogado e desconhecido: o mesmo 404; vazio é 400', async () => {
    for (const token of ['tok-venc', 'tok-rev', 'nao-existe']) {
      const r = await portal('ver', { token });
      expect([r.status, await r.text()], token).toEqual([404, INVALIDO]);
    }
    expect((await portal('ver', { token: '' })).status).toBe(400);
  });

  it('token fora do corpo não vale: nem na query, nem no caminho antigo', async () => {
    const r = await app.fetch(new Request('http://localhost/api/v1/public/auditor/ver?token=tok-a'), workerEnv());
    expect(r.status).not.toBe(200);
    expect(app.routes.some((rt) => rt.path.startsWith('/api/v1/auditor/'))).toBe(false);
  });
});

describe('POST /evidencia', () => {
  it('baixa o arquivo do projeto do token, com o nome codificado (RFC 5987), e registra na trilha', async () => {
    const r = await portal('evidencia', { token: 'tok-a', evidence_id: 'pa-e1' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.text()).toBe('conteudo-e1');
    const nome = encodeURIComponent(NOME_DIFICIL);
    expect(r.headers.get('Content-Disposition')).toBe(`attachment; filename="${nome}"; filename*=UTF-8''${nome}`);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const log = await env.DB.prepare(`SELECT actor, project_id FROM audit_logs WHERE action = 'auditor.evidence_downloaded' AND details LIKE '%pa-e1%'`)
      .first<{ actor: string; project_id: string }>();
    expect(log).toEqual({ actor: 'auditor:pa-t-a', project_id: A });
  });

  it('evidência de outro projeto, inexistente ou sem arquivo, e token alheio ou revogado: 404', async () => {
    for (const evidence_id of ['pa-eb', 'nao-existe', 'pa-e2']) {
      expect((await portal('evidencia', { token: 'tok-a', evidence_id })).status, evidence_id).toBe(404);
    }
    expect((await portal('evidencia', { token: 'tok-b', evidence_id: 'pa-e1' })).status).toBe(404);
    expect((await portal('evidencia', { token: 'tok-rev', evidence_id: 'pa-e1' })).status).toBe(404);
  });
});

describe('notas', () => {
  it('a nota grava o id do token, nunca o token, e a lista é só do projeto', async () => {
    const r = await portal('notas/criar', { token: 'tok-a', control_id: 'pa-c1', content: 'Onde está a ata da análise crítica?' });
    expect(r.status, await r.clone().text()).toBe(200);
    const { id } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT auditor_token FROM auditor_notes WHERE id = ?').bind(id).first('auditor_token')).toBe('pa-t-a');
    await portal('notas/criar', { token: 'tok-b', content: 'Pergunta do B' });
    const lista = await (await portal('notas', { token: 'tok-a' })).json<{ notas: { id: string; control_title: string | null }[] }>();
    expect(lista.notas.map((n) => [n.id, n.control_title])).toEqual([[id, 'A.5.1 — Políticas']]);
  });
});

describe('limite por IP', () => {
  it('acima de 600 em 10 minutos: 429 antes de olhar o token', async () => {
    await env.DB.prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES ('auditor-publico:ip:10.99.0.1', 600, ?)`)
      .bind(Math.floor(Date.now() / 1000)).run();
    expect((await portal('ver', { token: 'tok-a' }, '10.99.0.1')).status).toBe(429);
  });
});
