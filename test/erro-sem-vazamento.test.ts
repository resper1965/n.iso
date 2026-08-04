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
});
