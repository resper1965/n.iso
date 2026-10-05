import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0041 from '../migrations/0041_pedidos.sql?raw';
import migration0042 from '../migrations/0042_pedidos_ciencia_link.sql?raw';
import migration0043 from '../migrations/0043_pedidos_imutavel.sql?raw';

/**
 * 0043: o pedido também é prova. O conteúdo congelado e o hash nunca mudam (correção é pedido novo);
 * pedido fechado (status <> 'aberto') não muda de status nem de substituto. `org_id` continua livre:
 * a transferência de projeto entre organizações o atualiza.
 */
const pedido = (id: string, status: string) =>
  env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, criado_por)
    VALUES (?, 'org_ness', 'm43', 'politica', 'c', 't', 'ciente', '{"a":1}', 'h', ?, 'u')`).bind(id, status).run();

async function regrasDoTrigger() {
  const recusa = (sql: string) => expect(env.DB.prepare(sql).run(), sql).rejects.toThrow(/pedido/);
  // Aberto: hash, conteúdo e identidade do documento travados; status e substituto mudam (substituição, decisão).
  await recusa(`UPDATE pedidos SET hash = 'outro' WHERE id = 'p-ab'`);
  await recusa(`UPDATE pedidos SET conteudo_json = '{}' WHERE id = 'p-ab'`);
  await recusa(`UPDATE pedidos SET ref_id = 'outro' WHERE id = 'p-ab'`);
  await recusa(`UPDATE pedidos SET papel_exigido = 'ceo' WHERE id = 'p-ab'`);
  await env.DB.prepare(`UPDATE pedidos SET status = 'substituido', substituido_por = 'p-novo' WHERE id = 'p-ab' AND status = 'aberto'`).run();
  // Fechado: nem status nem substituto voltam.
  await recusa(`UPDATE pedidos SET status = 'aberto' WHERE id = 'p-ab'`);
  await recusa(`UPDATE pedidos SET substituido_por = NULL WHERE id = 'p-ab'`);
  await recusa(`UPDATE pedidos SET status = 'cancelado' WHERE id = 'p-ap'`);
  await recusa(`UPDATE pedidos SET hash = 'x' WHERE id = 'p-ap'`);
  // org_id livre (transferência), mesmo fechado; os outros dois fechamentos ainda saem de aberto.
  await env.DB.prepare(`UPDATE pedidos SET org_id = 'org_b' WHERE id IN ('p-ab', 'p-ap')`).run();
  await pedido('p-c', 'aberto');
  await env.DB.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE id = 'p-c' AND status = 'aberto'`).run();
  const linhas = (await env.DB.prepare(`SELECT id, org_id, status, substituido_por, hash FROM pedidos ORDER BY id`).all()).results;
  expect(linhas).toEqual([
    { id: 'p-ab', org_id: 'org_b', status: 'substituido', substituido_por: 'p-novo', hash: 'h' },
    { id: 'p-ap', org_id: 'org_b', status: 'aprovado', substituido_por: null, hash: 'h' },
    { id: 'p-c', org_id: 'org_ness', status: 'cancelado', substituido_por: null, hash: 'h' },
  ]);
  // Apagar o projeto ainda cascateia (o trigger é só de UPDATE).
  await env.DB.prepare(`DELETE FROM projects WHERE id = 'm43'`).run();
  expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedidos`).first('n')).toBe(0);
}

describe('migration 0043 — pedido imutável', () => {
  it('sobre o banco da 0042 com linhas: preserva tudo e passa a recusar a mudança da prova', async () => {
    await applySchema();
    await execSql(`DROP TABLE IF EXISTS pedido_destinatarios; DROP TABLE IF EXISTS pedidos;`);
    await execSql(migration0041);
    await execSql(migration0042);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m43', 'C', 'ISO', 'controller', 'Active')`).run();
    await pedido('p-ab', 'aberto');
    await pedido('p-ap', 'aprovado');
    await env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, hash_lido, canal) VALUES ('d1', 'p-ap', 'a@x.io', 'ciente', 'h', 'conta')`).run();

    await execSql(migration0043);

    expect((await env.DB.prepare(`SELECT id FROM pedidos ORDER BY id`).all()).results).toEqual([{ id: 'p-ab' }, { id: 'p-ap' }]);
    expect(await env.DB.prepare(`SELECT hash_lido FROM pedido_destinatarios WHERE id = 'd1'`).first('hash_lido')).toBe('h');
    expect(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'pedido_prova_imutavel'`).first()).toBeTruthy();
    await execSql(migration0043); // idempotente
    await regrasDoTrigger();
  }, 30_000);

  it('o schema.sql canônico traz o mesmo trigger', async () => {
    await applySchema();
    await env.DB.prepare(`DELETE FROM pedidos`).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('m43', 'C', 'ISO', 'controller', 'Active')`).run();
    await pedido('p-ab', 'aberto');
    await pedido('p-ap', 'aprovado');
    await regrasDoTrigger();
  }, 30_000);
});
