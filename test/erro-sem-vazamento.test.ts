import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * O 500 não pode carregar a mensagem crua do D1 — e precisa carregar o
 * `request_id` que liga a resposta à linha do log.
 *
 * O erro aqui é REAL, não simulado: dois POSTs de lead com o mesmo CNPJ violam
 * `idx_leads_cnpj`, e o SQLite responde
 * `D1_ERROR: UNIQUE constraint failed: leads.cnpj: SQLITE_CONSTRAINT`.
 * Essa string nomeia a tabela e a coluna — é exatamente o que ia para o cliente
 * antes, e é o que este teste exige que fique só no log.
 *
 * Simular o erro (jogar um `new Error('UNIQUE constraint failed')`) provaria
 * apenas que o helper repassa o que recebe. Só o D1 de verdade prova que o
 * formato da mensagem que ele emite hoje continua contido.
 */

const PROJ = 'proj-vaz';
const CNPJ = '11222333000181';

function testEnv() {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) } } as any;
}

async function req(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), testEnv());
}

/** Padrões que só podem existir se o interior do banco vazou. */
const VAZAMENTO = /UNIQUE|constraint|SQLITE|D1_ERROR|leads\.cnpj|INSERT INTO|idx_leads/i;

describe('500 correlaciona em vez de vazar', () => {
  let admin: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`
    ).bind(PROJ, 'Cliente Vaz', 'ISO 27001', 'controller', 'Active').run();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`
    ).bind('usr-vaz', 'vaz@ness.io', 'x:y', 'Admin Vaz', 'platform_admin', null).run();

    admin = await sessionFor({
      id: 'usr-vaz', email: 'vaz@ness.io', name: 'Admin Vaz', role: 'platform_admin',
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function criarLead(cnpj: string) {
    return req('/api/v1/leads', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: 'Empresa Vaz', cnpj }),
    });
  }

  it('a violação de constraint do D1 vira 500 sem nome de tabela nem de coluna', async () => {
    expect((await criarLead(CNPJ)).status).toBe(201);

    const res = await criarLead(CNPJ);
    expect(res.status).toBe(500);

    const corpo = (await res.json()) as Record<string, unknown>;

    // A mensagem de negócio continua: diz QUAL operação falhou, sem dizer nada
    // sobre como o banco é feito.
    expect(corpo.error).toBe('Falha ao criar lead');
    // O campo que carregava `e.message` deixou de existir.
    expect(corpo.detail).toBeUndefined();
    // E nada no corpo inteiro pode conter o texto do SQLite.
    expect(JSON.stringify(corpo)).not.toMatch(VAZAMENTO);

    expect(typeof corpo.request_id).toBe('string');
    expect((corpo.request_id as string).length).toBeGreaterThan(0);
  });

  it('o request_id da resposta é o mesmo do log, e só o log tem a mensagem crua', async () => {
    const cnpj = '99888777000166';
    expect((await criarLead(cnpj)).status).toBe(201);

    // `log()` de nível error escreve em console.error; capturamos as linhas JSON.
    const linhas: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      linhas.push(String(args[0]));
    });

    const res = await criarLead(cnpj);
    expect(res.status).toBe(500);
    const corpo = (await res.json()) as { request_id: string };

    const eventos = linhas
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e): e is Record<string, any> => !!e);

    // 1. A linha do erro traz o detalhe que o cliente não recebeu...
    const erro = eventos.find((e) => e.msg === 'erro_handler');
    expect(erro, 'o handler precisa emitir uma linha de erro estruturada').toBeDefined();
    expect(erro!.erro).toMatch(/UNIQUE constraint failed/);
    expect(erro!.rota).toBe('/api/v1/leads');
    expect(erro!.metodo).toBe('POST');

    // 2. ...sob o MESMO id que voltou na resposta.
    expect(erro!.request_id).toBe(corpo.request_id);

    // 3. E a linha de acesso da mesma requisição usa esse id também, então o
    //    suporte chega ao status, à rota e ao ator a partir do que o cliente cita.
    const acesso = eventos.find((e) => e.msg === 'request' && e.rota === '/api/v1/leads');
    expect(acesso, 'o middleware de acesso precisa logar a mesma requisição').toBeDefined();
    expect(acesso!.request_id).toBe(corpo.request_id);
    expect(acesso!.status).toBe(500);
  });

  it('o 403 de autorização continua devolvendo a própria mensagem', async () => {
    // O `startsWith('Forbidden')` roda ANTES do 500 nos handlers com
    // requireResourceAccess. Se o erro500 tivesse engolido esse ramo, o IDOR
    // fechado nos PRs #41–#43 e #48 voltaria calado — aqui ele grita.
    // A cobertura ampla desse invariante está em `test/idor-tenant.test.ts`;
    // este caso existe para que a regressão apareça junto da mudança que a causa.
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`
    ).bind('proj-vaz-outro', 'Outro', 'ISO 27001', 'controller', 'Active').run();
    await env.DB.prepare(
      `INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?,?,?)`
    ).bind('ropa-alheio', 'proj-vaz-outro', 'Alheio').run();

    const cliente = await sessionFor({
      id: 'usr-vaz-cli', email: 'cli@vaz.com', name: 'Cliente', role: 'org_admin',
      client_project_id: PROJ,
    });

    const res = await req('/api/v1/ropa/ropa-alheio', { method: 'DELETE', headers: cliente });
    expect(res.status).toBe(403);
    const corpo = (await res.json()) as { error: string };
    expect(corpo.error).toMatch(/^Forbidden/);
  });

  // evidence.ts e ropa.ts ainda devolviam `detail: e.message` — achado quando um
  // mock de D1 virou D1 real e o 500 passou a trazer `D1_ERROR: FOREIGN KEY ...`.
  // Os dois erros abaixo também são reais: FK violada no próprio SQLite.
  const VAZAMENTO_FK = /FOREIGN KEY|constraint|SQLITE|D1_ERROR|INSERT INTO|DELETE FROM/i;

  async function exigeSemVazamento(res: Response, mensagem: string) {
    expect(res.status).toBe(500);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.error).toBe(mensagem);
    expect(corpo.detail).toBeUndefined();
    expect(JSON.stringify(corpo)).not.toMatch(VAZAMENTO_FK);
    expect(typeof corpo.request_id).toBe('string');
    expect((corpo.request_id as string).length).toBeGreaterThan(0);
  }

  it('evidence: excluir evidência referenciada pelo checklist vira 500 sem texto do D1', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
        .bind('ev-vaz', PROJ, 'a.pdf', 'evidence/proj-vaz/ev-vaz-a.pdf', 'h', 'vaz@ness.io'),
      env.DB.prepare(`INSERT INTO checklist_progress (project_id, phase_number, item_id, evidence_id) VALUES (?,?,?,?)`)
        .bind(PROJ, 1, 'item-vaz', 'ev-vaz'),
    ]);
    await env.STORAGE.put('evidence/proj-vaz/ev-vaz-a.pdf', 'conteudo');
    const res = await req('/api/v1/evidence/ev-vaz', { method: 'DELETE', headers: admin });
    await exigeSemVazamento(res, 'Erro ao excluir evidência');
    // O banco recusou: a linha continua, então o arquivo para o qual ela aponta
    // também precisa continuar. Antes o R2 era apagado primeiro.
    expect(await env.DB.prepare('SELECT id FROM evidence WHERE id = ?').bind('ev-vaz').first()).not.toBeNull();
    expect(await env.STORAGE.head('evidence/proj-vaz/ev-vaz-a.pdf')).not.toBeNull();
  });

  it('evidence: falha do R2 ao excluir não derruba a exclusão nem deixa a linha', async () => {
    await env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
      .bind('ev-r2', PROJ, 'b.pdf', 'evidence/proj-vaz/ev-r2-b.pdf', 'h', 'vaz@ness.io').run();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = new Proxy(env.STORAGE, {
      get(alvo, prop) {
        if (prop === 'delete') return async () => { throw new Error('R2 indisponível'); };
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/evidence/ev-r2', { method: 'DELETE', headers: admin }),
      { ...testEnv(), STORAGE: storage },
    );
    expect(res.status).toBe(200);
    expect(await env.DB.prepare('SELECT id FROM evidence WHERE id = ?').bind('ev-r2').first()).toBeNull();
  });

  it('ropa: criar ROPA em projeto inexistente vira 500 sem texto do D1', async () => {
    const res = await req('/api/v1/projects/proj-vaz-inexistente/ropa', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ processing_purpose: 'Folha', legal_basis: 'Contrato' }),
    });
    await exigeSemVazamento(res, 'Falha ao criar ROPA');
  });

  // IA indisponível: o agente devolve `success:false` com o texto cru de cada
  // provedor (gateway, Workers AI, binding direto). Isso fica no log, não no 500.
  const PROVEDOR = 'texto-cru-do-provedor-xyz';
  const envSemIa = () => ({ ...testEnv(), AI: { run: async () => { throw new Error(PROVEDOR); } } });

  async function exigeSemProvedor(res: Response, mensagem: string) {
    expect(res.status).toBe(500);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.error).toBe(mensagem);
    expect(corpo.detail).toBeUndefined();
    expect(JSON.stringify(corpo)).not.toMatch(new RegExp(`${PROVEDOR}|ai-gateway|workers-ai`));
    expect(typeof corpo.request_id).toBe('string');
  }

  it('evidence: avaliar com IA indisponível não devolve o texto do provedor', async () => {
    await env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
      .bind('ev-ia', PROJ, 'c.pdf', 'evidence/proj-vaz/ev-ia-c.pdf', 'h', 'vaz@ness.io').run();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-ia/evaluate', {
      method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'politica de acesso' }),
    }), envSemIa());
    await exigeSemProvedor(res, 'Falha ao avaliar evidência');
  });

  it('policies: gerar política com IA indisponível não devolve o texto do provedor', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await worker.fetch(new Request(`http://localhost/api/v1/projects/${PROJ}/generate-policy`, {
      method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ control_id: 'A.5.1' }),
    }), envSemIa());
    await exigeSemProvedor(res, 'Falha ao gerar política');
  });

  it('webhooks: teste que falha devolve 502 sem a mensagem da exceção', async () => {
    await env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, status) VALUES (?,?,?,?,?)`)
      .bind('wh-vaz', PROJ, 'https://93.184.216.34/hook', '["test"]', 'Active').run();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED texto-interno-abc'));
    const res = await req('/api/v1/webhooks/test/wh-vaz', { method: 'POST', headers: admin });
    expect(res.status).toBe(502);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.ok).toBe(false);
    expect(JSON.stringify(corpo)).not.toMatch(/ECONNREFUSED|texto-interno/);
    expect(typeof corpo.request_id).toBe('string');
    const wh = await env.DB.prepare('SELECT failure_count FROM webhooks WHERE id = ?').bind('wh-vaz').first<{ failure_count: number }>();
    expect(wh!.failure_count).toBe(1);
  });

  it('ropa: relatório HTML que falha devolve 500 sem a exceção e com o request_id', async () => {
    // A mensagem traz HTML de propósito: antes ia interpolada crua na página.
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => /FROM projects/.test(sql)
            ? { bind: () => ({ first: async () => { throw new Error('D1_ERROR: <img src=x onerror=alert(1)>'); } }) }
            : alvo.prepare(sql);
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const linhas: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { linhas.push(String(args[0])); });

    const res = await worker.fetch(
      new Request(`http://localhost/api/v1/projects/${PROJ}/ropa/report`, { headers: admin }),
      { ...testEnv(), DB: db },
    );
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).not.toMatch(/D1_ERROR|<img|onerror/);

    // O detalhe foi para o log, e a página cita o MESMO request_id.
    const erro = linhas
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((ev) => ev?.msg === 'erro_handler');
    expect(erro, 'a falha precisa ir ao log estruturado').toBeDefined();
    expect(erro.erro).toMatch(/D1_ERROR/);
    expect(html).toContain(erro.request_id);
  });
});

/**
 * Catraca: nenhum handler em src/routes volta a devolver a mensagem crua da
 * exceção em `detail`. O caminho certo é `erro500(c, mensagem, e)`.
 * `?raw` inlina o fonte em tempo de build (mesmo método de any-catraca.test.ts).
 */
const ROTAS = import.meta.glob('../src/routes/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('catraca: mensagem de exceção em resposta de src/routes', () => {
  it('o leitor enxerga as rotas', () => {
    expect(Object.keys(ROTAS).length).toBeGreaterThan(10);
  });

  it('nenhuma rota devolve detail: <erro>.message nem interpola ${e.message}', () => {
    const PADRAO = /detail:\s*\w+\??\.message|\$\{\s*(e|err|error)\??\.message\s*\}/;
    const achados = Object.entries(ROTAS).flatMap(([arq, txt]) =>
      txt.split('\n').flatMap((l, i) => (PADRAO.test(l) ? [`${arq}:${i + 1}`] : [])));
    expect(achados, `Use erro500(c, mensagem, e) ou registraErro(c, e): ${achados.join(', ')}`).toEqual([]);
  });
});
