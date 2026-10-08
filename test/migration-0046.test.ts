import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0046 from '../migrations/0046_avisos_prazo.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0046 — avisos_prazo', () => {
  it('cria a tabela num banco sem ela, com a UNIQUE que inclui o vencimento, e convive com o schema canônico', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS avisos_prazo;');
    expect(await colunas('avisos_prazo')).toEqual([]);

    await execSql(migration0046);

    expect(await colunas('avisos_prazo')).toEqual(['id', 'project_id', 'fonte', 'item_id', 'marco', 'user_id', 'vence_em', 'titulo', 'criado_em', 'email_enviado_em']);
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_avisos_prazo_email'").first()).toBeTruthy();

    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p46','C','ISO 27001:2022','Controller','Active')`),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES ('u46','u46@x.com','x','U','consultor')`),
    ]);
    const inserir = (id: string, vence: string) => env.DB.prepare(
      `INSERT OR IGNORE INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo) VALUES (?, 'p46', 'capa', 'c1', 'D0', 'u46', ?, 'CAPA')`
    ).bind(id, vence).run();
    expect((await inserir('a1', '2026-10-07')).meta.changes).toBe(1);
    expect((await inserir('a2', '2026-10-07')).meta.changes, 'mesmo marco do mesmo prazo não entra duas vezes').toBe(0);
    expect((await inserir('a3', '2026-11-07')).meta.changes, 'prazo adiado é outro aviso').toBe(1);
    const linha = await env.DB.prepare(`SELECT criado_em, email_enviado_em FROM avisos_prazo WHERE id = 'a1'`).first<{ criado_em: string; email_enviado_em: string | null }>();
    expect(linha?.criado_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(linha?.email_enviado_em).toBeNull();

    await execSql(migration0046); // reaplicar não quebra (IF NOT EXISTS)
    await applySchema();
  }, 30_000);
});
