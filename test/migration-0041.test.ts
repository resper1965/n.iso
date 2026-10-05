import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0041 from '../migrations/0041_pedidos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0041 — pedidos', () => {
  it('cria pedidos e pedido_destinatarios num banco sem elas, e convive com o schema canônico', async () => {
    await applySchema();
    // Estado de produção antes da 0041: as duas tabelas não existem.
    await execSql(`
      DROP TABLE IF EXISTS pedido_destinatarios;
      DROP TABLE IF EXISTS pedidos;
    `);
    expect(await colunas('pedidos')).toEqual([]);

    await execSql(migration0041);

    expect(await colunas('pedidos')).toEqual(expect.arrayContaining(['org_id', 'project_id', 'tipo', 'ref_id', 'conteudo_json', 'hash', 'status', 'substituido_por']));
    expect(await colunas('pedido_destinatarios')).toEqual(expect.arrayContaining(['pedido_id', 'email', 'user_id', 'token_hash', 'hash_lido', 'canal', 'ip', 'user_agent', 'mfa_usado']));
    for (const n of ['idx_pedidos_projeto', 'idx_pedidos_documento', 'idx_pedido_dest_pedido', 'idx_pedido_dest_token']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }
    await execSql(migration0041); // reaplicar não quebra (IF NOT EXISTS)
    await applySchema();
  }, 30_000);
});
