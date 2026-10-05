import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, sha256Hex } from '../src/helpers';
import { hashConteudo } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 5 do acesso de stakeholders: a prova dos pedidos é imutável e o auditor a lê.
 *
 * 1. Imutável: a decisão gravada (ciência, aprovação, recusa) não muda por rota nenhuma. O banco
 *    recusa UPDATE na linha decidida (trigger `pedido_dest_prova_imutavel`); DELETE fica livre no
 *    banco porque apagar o projeto precisa cascatear, e a garantia é que NENHUMA rota apaga — conferida
 *    no fonte e por varredura de todas as rotas montadas que não são GET. Correção = pedido novo.
 * 2. Auditor: o portal do auditor externo (token preso a UM projeto, `auditor_tokens`) lê a prova do
 *    projeto dele, só por GET, sem token nem hash de token.
 */
const SENHA = 'Senha-forte-123!';
const P = 'pv-proj';
const Q = 'pv-outro';
const POL = 'pv-pol';
const TOKEN_CLARO = 'a'.repeat(64);

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.9', ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), RESEND_API_KEY: 're_teste' } as any);

// Nenhuma rota sai para a rede durante a varredura (Resend, CNPJ, webhooks).
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 503 })); });
afterEach(() => vi.restoreAllMocks());

/** Tudo o que é prova: linhas decididas inteiras; do pedido, o congelado sempre e o status quando já fechou. */
async function fotoDaProva(): Promise<unknown> {
  const dests = (await env.DB.prepare(`SELECT * FROM pedido_destinatarios WHERE status <> 'pendente' ORDER BY id`).all()).results;
  const pedidos = (await env.DB.prepare(
    `SELECT id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por, criado_em,
            CASE WHEN status = 'aberto' THEN NULL ELSE status END AS status_fechado,
            CASE WHEN status = 'aberto' THEN NULL ELSE substituido_por END AS substituto
       FROM pedidos ORDER BY id`).all()).results;
  return { dests, pedidos };
}

let hashPol: string;
let cadm: Record<string, string>;
const U = {
  cadm: { id: 'pv-cadm', email: 'cadm@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' },
  orgAdmin: { id: 'pv-oa', email: 'dono@cliente.com', role: 'org_admin', client_project_id: P },
  adm: { id: 'pv-adm', email: 'adm@ness.lat', role: 'platform_admin' },
  stk: { id: 'pv-stk', email: 'dora@cliente.com', role: 'stakeholder', client_project_id: P },
};

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'b')`).run().catch(() => undefined);
  const conteudo = { title: 'Política de Segurança', description: 'Texto v1' };
  hashPol = await hashConteudo(conteudo);
  const cj = JSON.stringify(conteudo);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27001', 'controller', 'Active', 'org_b')`).bind(Q),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?, ?, 'ISO 27001', 'Política de Segurança', 'Texto v1')`).bind(POL, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('pv-cadm', 'cadm@ness.lat', ?, 'Cadm', 'consultoria_admin', NULL, 'org_ness'),
      ('pv-oa', 'dono@cliente.com', ?, 'Dono', 'org_admin', ?, 'org_ness'),
      ('pv-stk', 'dora@cliente.com', ?, 'Dora', 'stakeholder', ?, 'org_ness')`).bind(senha, senha, P, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('pv-g-dora', ?, 'Dora', 'dora@cliente.com', 'executivo', 'DPO')`).bind(P),
    // Concluído por conta (aprovado, com MFA), o que ele substituiu e um aberto com ciência dada e pendente.
    env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por) VALUES
      ('pv-ap', 'org_ness', ?, 'politica', ?, 'Política: Política de Segurança', 'ciente', ?, ?, 'aprovado', NULL, 'cadm@ness.lat'),
      ('pv-sub', 'org_ness', ?, 'politica', ?, 'Política: versão velha', 'ciente', '{"title":"velha"}', 'hash-velho', 'substituido', 'pv-ap', 'cadm@ness.lat'),
      ('pv-ab', 'org_ness', ?, 'politica', ?, 'Política: Política de Segurança', 'ciente', ?, ?, 'aberto', NULL, 'cadm@ness.lat'),
      ('pq-1', 'org_b', ?, 'politica', 'pq-pol', 'Política do outro', 'ciente', '{}', 'hash-outro', 'aprovado', NULL, 'cadm@b.lat')`)
      .bind(P, POL, cj, hashPol, P, POL, P, POL, cj, hashPol, Q),
    env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, user_id, token_hash, token_expira_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado) VALUES
      ('pv-d1', 'pv-ap', 'Dora', 'dora@cliente.com', 'pv-stk', NULL, NULL, 'ciente', '2026-10-01T10:00:00.000Z', 'conta', '10.1.1.1', 'Navegador A', ?, 1),
      ('pv-d0', 'pv-sub', 'Dora', 'dora@cliente.com', 'pv-stk', NULL, NULL, 'ciente', '2026-09-01T10:00:00.000Z', 'conta', '10.1.1.1', 'Navegador A', 'hash-velho', 0),
      ('pv-d3', 'pv-ab', 'Lia', 'lia@cliente.com', NULL, ?, datetime('now','+30 days'), 'ciente', '2026-10-02T10:00:00.000Z', 'link', '10.2.2.2', 'Navegador B', ?, 0),
      ('pv-d4', 'pv-ab', 'Rui', 'rui@cliente.com', NULL, 'hash-do-token-do-rui', datetime('now','+30 days'), 'pendente', NULL, NULL, NULL, NULL, NULL, NULL),
      ('pq-d1', 'pq-1', 'Fulano Outro', 'fulano@outro.com', NULL, 'hash-token-outro', datetime('now','+30 days'), 'ciente', '2026-10-01T10:00:00.000Z', 'link', '10.3.3.3', 'Navegador C', 'hash-outro', 0)`)
      .bind(hashPol, await sha256Hex(TOKEN_CLARO), hashPol),
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES
      ('pv-at', ?, 'tok-aud-p', '2099-01-01T00:00:00Z'), ('pv-at-venc', ?, 'tok-aud-venc', '2020-01-01T00:00:00Z'), ('pv-at-q', ?, 'tok-aud-q', '2099-01-01T00:00:00Z')`)
      .bind(P, P, Q),
  ]);
  cadm = await sessionFor(U.cadm);
});

describe('prova imutável', () => {
  it('o banco recusa UPDATE em qualquer coluna da linha decidida; a pendente ainda muda', async () => {
    const cols = (await env.DB.prepare(`PRAGMA table_info(pedido_destinatarios)`).all<any>()).results.map((c) => c.name as string);
    for (const c of cols) {
      await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET "${c}" = "${c}" WHERE id = 'pv-d1'`).run(), c).rejects.toThrow(/imutavel/);
    }
    await env.DB.prepare(`UPDATE pedido_destinatarios SET aberto_em = aberto_em WHERE id = 'pv-d4'`).run();
  });

  it('nenhum fonte apaga pedido/destinatário, nem atualiza decisão ou pedido fechado', () => {
    const fontes = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const achados: string[] = [];
    for (const [arq, txt] of Object.entries(fontes)) {
      if (/DELETE\s+FROM\s+pedido/i.test(txt)) achados.push(`${arq}: DELETE FROM pedido…`);
      // Cada UPDATE vai até o fim da string SQL (crase): a guarda de status tem de estar no próprio statement.
      for (const m of txt.matchAll(/UPDATE\s+(pedido_destinatarios|pedidos)\b[^`]*/gi)) {
        const guarda = m[1] === 'pedidos' ? /status\s*=\s*'aberto'/ : /status\s*=\s*'pendente'/;
        if (!guarda.test(m[0])) achados.push(`${arq}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(Object.keys(fontes).length).toBeGreaterThan(30);
    expect(achados).toEqual([]);
  });

  it('varredura: nenhuma rota que não é GET altera ou apaga a prova', async () => {
    const corpos: Record<string, unknown> = {
      'POST /api/v1/pedidos/:id/aprovar': { senha: SENHA },
      'POST /api/v1/pedidos/:id/recusar': { senha: SENHA, motivo: 'tentativa de reverter' },
      'POST /api/v1/public/pedidos/ver': { token: TOKEN_CLARO },
      'POST /api/v1/public/pedidos/codigo': { token: TOKEN_CLARO },
      'POST /api/v1/public/pedidos/ciencia': { token: TOKEN_CLARO, codigo: '123456', nome: 'Lia' },
    };
    const vistas = new Set<string>();
    const rotas = app.routes.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) && r.path !== '/*'
      && !vistas.has(`${r.method} ${r.path}`) && vistas.add(`${r.method} ${r.path}`));
    expect(rotas.length).toBeGreaterThan(150);
    const antes = await fotoDaProva();
    const chamadas: number[] = [];
    for (const id of ['pv-ap', 'pv-ab', 'pv-d3']) {
      for (const quem of Object.values(U)) {
        for (const r of rotas) {
          const caminho = r.path
            .replace(/^\/api\/v1\/(platform\/)?projects\/:\w+/, (_t, plat = '') => `/api/v1/${plat}projects/${P}`)
            .replace(/:(\w+)/g, (_t, n: string) => (n.toLowerCase().includes('token') ? 'tok-aud-p' : n === 'projectId' ? P : id));
          // Sessão nova a cada chamada: /auth/logout e afins derrubariam a do usuário no meio da varredura.
          const res = await chamar(await sessionFor(quem), r.method, caminho, corpos[`${r.method} ${r.path}`]);
          chamadas.push(res.status);
        }
      }
    }
    expect(chamadas.length).toBe(rotas.length * 3 * Object.keys(U).length);
    expect(await fotoDaProva()).toEqual(antes);
  }, 1_200_000);

  it('correção é pedido novo: a prova anterior fica como estava', async () => {
    const antes = await env.DB.prepare(`SELECT * FROM pedido_destinatarios WHERE id = 'pv-d1'`).first();
    const r = await chamar(cadm, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`,
      { tipo: 'politica', ref_id: POL, destinatarios: [{ email: 'dora@cliente.com' }] });
    expect(r.status, await r.clone().text()).toBe(201);
    const novo = await r.json<any>();
    expect(novo.id).not.toBe('pv-ap');
    expect(await env.DB.prepare(`SELECT status FROM pedido_destinatarios WHERE pedido_id = ?`).bind(novo.id).first('status')).toBe('pendente');
    expect(await env.DB.prepare(`SELECT * FROM pedido_destinatarios WHERE id = 'pv-d1'`).first()).toEqual(antes);
  });

  it('DELETE fica livre no banco: apagar o projeto cascateia pedido e prova', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pv-tmp', 'Tmp', 'ISO 27001', 'controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, criado_por)
        VALUES ('pv-tmp-p', 'org_ness', 'pv-tmp', 'politica', 'x', 't', 'ciente', '{}', 'h', 'aprovado', 'u')`),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, decidido_em, canal, hash_lido) VALUES ('pv-tmp-d', 'pv-tmp-p', 'x@y.com', 'ciente', '2026-10-01', 'link', 'h')`),
    ]);
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'pv-tmp'`).run();
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedido_destinatarios WHERE id = 'pv-tmp-d'`).first('n')).toBe(0);
  });
});

describe('auditor lê a prova do projeto dele', () => {
  const ler = (token: string) => chamar({}, 'GET', `/api/v1/auditor/${token}/pedidos`);

  it('quem, quando, ip, user-agent, hash lido, canal, MFA, versão e substituição', async () => {
    const r = await ler('tok-aud-p');
    expect(r.status, await r.clone().text()).toBe(200);
    const { pedidos } = await r.json<any>();
    expect(pedidos.map((p: any) => p.id).sort()).toEqual(expect.arrayContaining(['pv-ab', 'pv-ap', 'pv-sub']));
    const ap = pedidos.find((p: any) => p.id === 'pv-ap');
    expect(ap).toMatchObject({ tipo: 'politica', ref_id: POL, papel_exigido: 'ciente', hash: hashPol, status: 'aprovado' });
    expect(ap.conteudo).toEqual({ title: 'Política de Segurança', description: 'Texto v1' });
    expect(pedidos.find((p: any) => p.id === 'pv-sub')).toMatchObject({ status: 'substituido', substituido_por: 'pv-ap' });
    expect(ap.destinatarios).toEqual([{
      nome: 'Dora', email: 'dora@cliente.com', status: 'ciente', decidido_em: '2026-10-01T10:00:00.000Z', aberto_em: null,
      canal: 'conta', ip: '10.1.1.1', user_agent: 'Navegador A', hash_lido: hashPol, mfa_usado: 1, motivo: null,
    }]);
    expect(pedidos.find((p: any) => p.id === 'pv-ab').destinatarios.map((d: any) => [d.email, d.status, d.canal]))
      .toEqual([['lia@cliente.com', 'ciente', 'link'], ['rui@cliente.com', 'pendente', null]]);
  });

  it('nunca token, hash de token nem prazo do link; nunca outro projeto', async () => {
    const texto = await (await ler('tok-aud-p')).text();
    expect(texto).not.toMatch(/token/i);
    expect(texto).not.toContain(await sha256Hex(TOKEN_CLARO));
    expect(texto).not.toContain('hash-do-token-do-rui');
    expect(texto).not.toContain('pq-1');
    expect(texto).not.toContain('fulano@outro.com');
    const q = await (await ler('tok-aud-q')).json<any>();
    expect(q.pedidos.map((p: any) => p.id)).toEqual(['pq-1']);
  });

  it('token inexistente ou vencido: 401', async () => {
    expect((await ler('tok-aud-venc')).status).toBe(401);
    expect((await ler('nao-existe')).status).toBe(401);
  });

  it('somente leitura: a rota só existe em GET', () => {
    const metodos = app.routes.filter((r) => r.path.startsWith('/api/v1/auditor/:token/pedidos')).map((r) => r.method);
    expect([...new Set(metodos)]).toEqual(['GET']);
  });
});
