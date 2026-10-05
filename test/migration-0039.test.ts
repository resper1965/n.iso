import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0039 from '../migrations/0039_propostas_envio_aceite.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0039 — envio, aceite e contrato', () => {
  it('acrescenta as colunas e os índices a um banco anterior à 0039, com o CHECK de aceite_origem', async () => {
    await applySchema();
    // Reconstrói o estado de produção: tabelas sem as colunas novas.
    await execSql(`
      DROP TABLE IF EXISTS propostas;
      CREATE TABLE propostas (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, cliente TEXT NOT NULL, criada_por TEXT NOT NULL);
      DROP TABLE IF EXISTS contracts;
      CREATE TABLE contracts (id TEXT PRIMARY KEY, proposal_id TEXT, org_id TEXT NOT NULL DEFAULT 'org_ness');
      DROP TABLE IF EXISTS projects;
      CREATE TABLE projects (id TEXT PRIMARY KEY, client_name TEXT NOT NULL);
    `);
    await execSql(migration0039);

    expect(await colunas('propostas')).toEqual(expect.arrayContaining(['token_hash', 'aceite_origem', 'contrato_id', 'projeto_id', 'ajuste_mensagem']));
    expect(await colunas('contracts')).toEqual(expect.arrayContaining(['proposta_id', 'documento_hash', 'valor_projeto', 'mensalidade', 'prazo_minimo_meses', 'servicos', 'projeto_id']));
    expect(await colunas('projects')).toContain('proposta_id');
    for (const n of ['idx_propostas_token', 'idx_contracts_proposta']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }

    const ins = (id: string, token: string | null, origem: string | null) =>
      env.DB.prepare(`INSERT INTO propostas (id, org_id, cliente, criada_por, token_hash, aceite_origem) VALUES (?, 'o', 'x', 'u', ?, ?)`).bind(id, token, origem).run();
    await expect(ins('a', null, 'x')).rejects.toThrow();
    await ins('b', 'h', 'link');
    await expect(ins('c', 'h', null)).rejects.toThrow();
    await env.DB.prepare(`INSERT INTO contracts (id, proposta_id) VALUES ('k1', 'b')`).run();
    await expect(env.DB.prepare(`INSERT INTO contracts (id, proposta_id) VALUES ('k2', 'b')`).run()).rejects.toThrow();

    await execSql('DROP TABLE propostas; DROP TABLE contracts; DROP TABLE projects;');
    await applySchema(); // devolve o banco ao schema canônico para os outros testes do arquivo
  }, 30_000);
});
