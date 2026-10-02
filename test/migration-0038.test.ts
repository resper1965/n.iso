import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0038 from '../migrations/0038_propostas.sql?raw';

const termos = (id: string) =>
  env.DB.prepare(`SELECT json_extract(textos, '$.termos') AS t FROM organizations WHERE id = ?`).bind(id).first<{ t: string | null }>();

describe('migration 0038 — propostas', () => {
  it('cria as tabelas e os índices num banco sem elas', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS proposta_itens; DROP TABLE IF EXISTS propostas;');
    await execSql(migration0038);
    for (const n of ['propostas', 'proposta_itens']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(n).first(), n).toBeTruthy();
    }
    for (const n of ['idx_propostas_numero', 'idx_propostas_org', 'idx_proposta_itens']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }
    // A 0038 deixa propostas no formato antigo (sem as colunas da 0039): devolve o schema canônico aos outros testes.
    await execSql('DROP TABLE proposta_itens; DROP TABLE propostas;');
    await applySchema();
  }, 30_000);

  it('preenche os termos da ness. quando vazios e não sobrescreve os já preenchidos', async () => {
    await applySchema();
    await env.DB.prepare(`UPDATE organizations SET textos = NULL WHERE id = 'org_ness'`).run();
    await execSql(migration0038);
    expect((await termos('org_ness'))?.t).toContain('## Foro');

    await env.DB.prepare(`UPDATE organizations SET textos = '{"termos":"meus termos"}' WHERE id = 'org_ness'`).run();
    await execSql(migration0038);
    expect((await termos('org_ness'))?.t).toBe('meus termos');
  }, 30_000);

  it('preenche só as chaves ausentes ou vazias: sobre e equipe preenchidos ficam, termos entra', async () => {
    await applySchema();
    await env.DB.prepare(`UPDATE organizations SET textos = '{"sobre":"Somos nós.","equipe":"Ana e Bia.","premissas":""}' WHERE id = 'org_ness'`).run();
    await execSql(migration0038);
    const r = await env.DB.prepare(`SELECT textos FROM organizations WHERE id = 'org_ness'`).first<{ textos: string }>();
    const t = JSON.parse(r!.textos);
    expect(t.sobre).toBe('Somos nós.');
    expect(t.equipe).toBe('Ana e Bia.');
    expect(t.termos).toContain('## Foro');
    expect(t.premissas).toContain('ponto focal');
  }, 30_000);
});
