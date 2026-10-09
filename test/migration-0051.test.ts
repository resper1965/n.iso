import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0041 from '../migrations/0041_pedidos.sql?raw';
import migration0042 from '../migrations/0042_pedidos_ciencia_link.sql?raw';
import migration0043 from '../migrations/0043_pedidos_imutavel.sql?raw';
import migration0051 from '../migrations/0051_pedidos_documento.sql?raw';

const ped = (id: string, tipo: string) =>
  env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
    VALUES (?, 'org_ness', 'm51', ?, 'r', 't', 'ciente', '{"a":1}', 'h', 'u')`).bind(id, tipo);
const dest = (id: string, pedido: string, canal: string | null) =>
  env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, canal) VALUES (?, ?, ?, 'pendente', ?)`).bind(id, pedido, `${id}@x.io`, canal);

describe('migration 0051 — tipo documento e canal portal em pedidos', () => {
  it('sobre o banco da 0043: preserva linhas, aceita documento e portal, e a prova continua imutável', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS pedido_destinatarios; DROP TABLE IF EXISTS pedidos;');
    await execSql(migration0041);
    await execSql(migration0042);
    await execSql(migration0043);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m51', 'C', 'ISO', 'controller', 'Active')`).run();
    await env.DB.batch([
      ped('p-dpia', 'dpia'), ped('p-pol', 'politica'),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo)
        VALUES ('d-ciente', 'p-pol', 'Ana', 'ana@x.io', 'tok1', '2030-01-01', '2026-10-01', 'ciente', '2026-10-02', 'link', '1.2.3.4', 'UA', 'h', 1, 'ok')`),
      dest('d-pend', 'p-pol', null),
      dest('d-dpia', 'p-dpia', 'conta'),
    ]);
    const antes = (await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results;
    const pedidosAntes = (await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results;

    await execSql(migration0051);

    // nada se perdeu e nenhum valor mudou, coluna a coluna
    expect((await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results).toEqual(antes);
    expect((await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results).toEqual(pedidosAntes);

    // a FK da filha aponta para `pedidos` (e não para a tabela temporária do rebuild)
    const fk = (await env.DB.prepare('PRAGMA foreign_key_list(pedido_destinatarios)').all<{ table: string; on_delete: string }>()).results;
    expect(fk.map((f) => [f.table, f.on_delete])).toEqual([['pedidos', 'CASCADE']]);

    // tipo e canal novos entram; valores fora da lista continuam recusados
    await ped('p-doc', 'documento').run();
    await dest('d-portal', 'p-doc', 'portal').run();
    await expect(ped('p-x', 'outro').run()).rejects.toThrow();
    await expect(dest('d-fax', 'p-doc', 'fax').run()).rejects.toThrow();

    // os cinco índices, e o do token continua único parcial
    for (const n of ['idx_pedidos_projeto', 'idx_pedidos_documento', 'idx_pedido_dest_pedido', 'idx_pedido_dest_email', 'idx_pedido_dest_user', 'idx_pedido_dest_token']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind(n).first(), n).toBeTruthy();
    }
    await expect(env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, token_hash) VALUES ('d-dup', 'p-doc', 'dup@x.io', 'tok1')`).run()).rejects.toThrow(/UNIQUE/);

    // os DOIS triggers de prova sobreviveram ao DROP
    for (const t of ['pedido_prova_imutavel', 'pedido_dest_prova_imutavel']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(t).first(), t).toBeTruthy();
    }
    await expect(env.DB.prepare(`UPDATE pedidos SET hash = 'outro' WHERE id = 'p-pol'`).run()).rejects.toThrow(/imutavel/);
    await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET nome = 'x' WHERE id = 'd-ciente'`).run()).rejects.toThrow(/imutavel/);
    await env.DB.prepare(`UPDATE pedido_destinatarios SET aberto_em = CURRENT_TIMESTAMP WHERE id = 'd-pend'`).run(); // pendente ainda muda

    // a cascata continua: apagar o pedido leva os destinatários
    await env.DB.prepare(`DELETE FROM pedidos WHERE id = 'p-doc'`).run();
    expect(await env.DB.prepare(`SELECT id FROM pedido_destinatarios WHERE pedido_id = 'p-doc'`).first()).toBeNull();

    await applySchema(); // convive com o schema canônico
  }, 30_000);
});
