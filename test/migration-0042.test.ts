import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0041 from '../migrations/0041_pedidos.sql?raw';
import migration0042 from '../migrations/0042_pedidos_ciencia_link.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0042 — ciência por link', () => {
  it('sobre o banco da 0041: preserva as linhas, aceita tipo politica, ganha aberto_em/token_expira_em e a prova imutável', async () => {
    await applySchema();
    await execSql(`
      DROP TABLE IF EXISTS pedido_destinatarios;
      DROP TABLE IF EXISTS pedidos;
    `);
    await execSql(migration0041);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m42', 'C', 'ISO', 'controller', 'Active')`).run();
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('pm1', 'org_ness', 'm42', 'dpia', 'd', 't', 'ciente', '{}', 'h', 'u')`).run();
    await env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, hash_lido, canal) VALUES
      ('dm1', 'pm1', 'a@x.io', 'ciente', 'h', 'conta'), ('dm2', 'pm1', 'b@x.io', 'pendente', NULL, NULL)`).run();

    await execSql(migration0042);

    expect(await colunas('pedido_destinatarios')).toEqual(expect.arrayContaining(['aberto_em', 'token_expira_em', 'token_hash', 'hash_lido']));
    const linhas = (await env.DB.prepare('SELECT id, status, hash_lido FROM pedido_destinatarios ORDER BY id').all()).results;
    expect(linhas).toEqual([{ id: 'dm1', status: 'ciente', hash_lido: 'h' }, { id: 'dm2', status: 'pendente', hash_lido: null }]);
    expect(await env.DB.prepare(`SELECT id FROM pedidos WHERE id = 'pm1'`).first()).toBeTruthy();
    const fk = (await env.DB.prepare(`PRAGMA foreign_key_list(pedido_destinatarios)`).all<any>()).results;
    expect(fk.map((f) => f.table)).toEqual(['pedidos']);
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('pm2', 'org_ness', 'm42', 'politica', 'c', 't', 'ciente', '{}', 'h', 'u')`).run();
    await expect(env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('pm3', 'org_ness', 'm42', 'outro', 'c', 't', 'ciente', '{}', 'h', 'u')`).run()).rejects.toThrow();
    for (const n of ['idx_pedidos_projeto', 'idx_pedidos_documento', 'idx_pedido_dest_pedido', 'idx_pedido_dest_email', 'idx_pedido_dest_user', 'idx_pedido_dest_token']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }
    // Prova imutável: decisão gravada não muda; pendente ainda muda.
    await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET nome = 'x' WHERE id = 'dm1'`).run()).rejects.toThrow();
    await env.DB.prepare(`UPDATE pedido_destinatarios SET aberto_em = CURRENT_TIMESTAMP WHERE id = 'dm2'`).run();

    await applySchema(); // convive com o schema canônico
  }, 30_000);
});
