import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0041 from '../migrations/0041_pedidos.sql?raw';
import migration0042 from '../migrations/0042_pedidos_ciencia_link.sql?raw';
import migration0043 from '../migrations/0043_pedidos_imutavel.sql?raw';
import migration0051 from '../migrations/0051_pedidos_documento.sql?raw';
import migration0055 from '../migrations/0055_pedidos_tratamento.sql?raw';

const ped = (id: string, tipo: string) =>
  env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
    VALUES (?, 'org_ness', 'm55', ?, 'r', 't', 'ciente', '{"a":1}', 'h', 'u')`).bind(id, tipo);
const dest = (id: string, pedido: string, canal: string | null) =>
  env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, canal) VALUES (?, ?, ?, 'pendente', ?)`).bind(id, pedido, `${id}@x.io`, canal);

describe('migration 0055 — tipo tratamento (e avaliacao_terceiro) em pedidos', () => {
  it('sobre o banco da 0051: preserva linhas e provas, aceita os tipos novos e mantém triggers, índices e cascata', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS pedido_destinatarios; DROP TABLE IF EXISTS pedidos;');
    await execSql(migration0041);
    await execSql(migration0042);
    await execSql(migration0043);
    await execSql(migration0051);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m55', 'C', 'ISO', 'controller', 'Active')`).run();
    await env.DB.batch([
      ped('p-dpia', 'dpia'), ped('p-doc', 'documento'), ped('p-exc', 'excecao'),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo)
        VALUES ('d-aprov', 'p-doc', 'Ana', 'ana@x.io', 'tok1', '2030-01-01', '2026-10-01', 'aprovado', '2026-10-02', 'link', '1.2.3.4', 'UA', 'h', 1, 'ok')`),
      dest('d-pend', 'p-doc', null),
      dest('d-portal', 'p-exc', 'portal'),
    ]);
    const antes = (await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results;
    const pedidosAntes = (await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results;

    await execSql(migration0055);

    // nada se perdeu e nenhum valor mudou, coluna a coluna
    expect((await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results).toEqual(antes);
    expect((await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results).toEqual(pedidosAntes);

    // a FK da filha aponta para `pedidos` (e não para a tabela temporária do rebuild)
    const fk = (await env.DB.prepare('PRAGMA foreign_key_list(pedido_destinatarios)').all<{ table: string; on_delete: string }>()).results;
    expect(fk.map((f) => [f.table, f.on_delete])).toEqual([['pedidos', 'CASCADE']]);

    // tipos novos entram; fora da lista continua recusado (o CHECK é o DA MIGRATION, não o do schema canônico)
    await ped('p-trat', 'tratamento').run();
    await ped('p-aval', 'avaliacao_terceiro').run();
    await expect(ped('p-x', 'outro').run()).rejects.toThrow();
    await dest('d-trat', 'p-trat', 'conta').run();

    // os índices (token continua único parcial; o do portal continua único parcial)
    for (const n of ['idx_pedidos_projeto', 'idx_pedidos_documento', 'idx_pedidos_portal_aberto', 'idx_pedido_dest_pedido', 'idx_pedido_dest_email', 'idx_pedido_dest_user', 'idx_pedido_dest_token']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind(n).first(), n).toBeTruthy();
    }
    await expect(env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, token_hash) VALUES ('d-dup', 'p-trat', 'dup@x.io', 'tok1')`).run()).rejects.toThrow(/UNIQUE/);
    const portal = (id: string) => env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES (?, 'org_ness', 'm55', 'documento', 'doc-x', 't', 'ciente', '{}', 'h', 'sistema:portal')`).bind(id);
    await portal('c1').run();
    await expect(portal('c2').run()).rejects.toThrow(/UNIQUE/);

    // os DOIS triggers de prova sobreviveram ao DROP e seguem valendo
    for (const t of ['pedido_prova_imutavel', 'pedido_dest_prova_imutavel']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(t).first(), t).toBeTruthy();
    }
    await expect(env.DB.prepare(`UPDATE pedidos SET hash = 'outro' WHERE id = 'p-doc'`).run()).rejects.toThrow(/imutavel/);
    await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET nome = 'x' WHERE id = 'd-aprov'`).run()).rejects.toThrow(/imutavel/);
    await env.DB.prepare(`UPDATE pedido_destinatarios SET aberto_em = CURRENT_TIMESTAMP WHERE id = 'd-pend'`).run(); // pendente ainda muda

    // a cascata continua: apagar o pedido leva os destinatários
    await env.DB.prepare(`DELETE FROM pedidos WHERE id = 'p-trat'`).run();
    expect(await env.DB.prepare(`SELECT id FROM pedido_destinatarios WHERE pedido_id = 'p-trat'`).first()).toBeNull();

    await applySchema(); // convive com o schema canônico
  }, 30_000);

  it('o schema canônico aceita os mesmos tipos', async () => {
    await applySchema();
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('m55', 'C', 'ISO', 'controller', 'Active')`).run();
    await ped('s-trat', 'tratamento').run();
    await ped('s-aval', 'avaliacao_terceiro').run();
    await expect(ped('s-x', 'outro').run()).rejects.toThrow();
  });
});
