import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import reconcileSql from '../ops/reconcile-2026-08.sql?raw';

/**
 * Ensaio do script que vai tocar o banco de produção.
 *
 * `ops/reconcile-2026-08.sql` corrige cinco migrations que nunca rodaram em
 * produção. Ele já foi escrito uma vez a partir da leitura dos PRAGMAs — e SQL
 * lido não é SQL executado. O modo de falha aqui não é o script estar
 * conceitualmente errado: é um `ALTER TABLE ADD COLUMN` numa coluna que já
 * existe abortar o lote no meio, deixando o banco em estado parcial.
 *
 * Este teste reconstrói o banco no formato EXATO que os PRAGMAs de produção
 * mostraram em 2026-08-03 — inclusive as divergências (`assets.description`
 * presente, `system_name` NOT NULL, `project_knowledge` já criada) — e roda o
 * script em cima. É o ensaio que o runbook manda fazer antes de restaurar um
 * backup, aplicado à migration.
 */

/** Estado de produção em 2026-08-03, transcrito dos PRAGMAs. */
const PRODUCAO = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL
);
CREATE TABLE evidence (id TEXT PRIMARY KEY, project_id TEXT);
CREATE TABLE compliance_controls (id TEXT PRIMARY KEY, project_id TEXT);
CREATE TABLE users (id TEXT PRIMARY KEY, client_project_id TEXT);
CREATE TABLE api_keys (id TEXT PRIMARY KEY, key_hash TEXT);
-- project_knowledge JÁ existe: a 0015 é a única das faltantes que rodou.
CREATE TABLE project_knowledge (id TEXT PRIMARY KEY, project_id TEXT);

-- assets: com os ratings da 0009 E com description — mas SEM type/criticality.
-- É essa description que aborta a 0013 original.
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  classification TEXT DEFAULT 'Confidential',
  owner TEXT,
  location TEXT,
  status TEXT DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confidentiality_rating INTEGER DEFAULT 3,
  integrity_rating INTEGER DEFAULT 3,
  availability_rating INTEGER DEFAULT 3,
  description TEXT
);

-- dpia_assessments: as 14 colunas pré-0013, com system_name NOT NULL.
CREATE TABLE dpia_assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  system_name TEXT NOT NULL,
  data_flow_description TEXT,
  data_subjects_types TEXT,
  personal_data_categories TEXT,
  necessity_proportionality TEXT,
  risks_identified TEXT,
  mitigation_measures TEXT,
  dpo_opinion TEXT,
  dpo_signature TEXT,
  ceo_signature TEXT,
  status TEXT DEFAULT 'Draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- audit_logs: 7 colunas, SEM project_id e SEM os triggers da 0018.
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT,
  justification TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

async function colunas(tabela: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tabela})`).all<any>();
  return (results || []).map((r: any) => r.name);
}

describe('ops/reconcile-2026-08.sql contra o estado real de produção', () => {
  beforeAll(async () => {
    await execSql(PRODUCAO);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name) VALUES ('p1','Cliente Um')`),
      // Linha com PII: o bloco 2 reconstrói esta tabela via DROP + RENAME.
      env.DB.prepare(
        `INSERT INTO dpia_assessments (id, project_id, system_name, dpo_opinion, status)
         VALUES ('d1','p1','Sistema Legado','Parecer do DPO sobre titular X','Approved')`
      ),
      env.DB.prepare(`INSERT INTO audit_logs (id, action, actor) VALUES ('l1','anterior','a@b.c')`),
      env.DB.prepare(`INSERT INTO api_keys (id, key_hash) VALUES ('k1','hash-unico')`),
    ]);

    // O script inteiro, de uma vez. Se qualquer statement abortar, os expects
    // seguintes falham — que é exatamente o sinal que queremos.
    await execSql(reconcileSql);
  });

  it('não aborta em assets.description, que já existia', async () => {
    // Este era o único statement da 0013 fadado a falhar em produção. Se o
    // script tivesse mantido o `ADD COLUMN description`, o lote morria aqui e
    // nada abaixo teria sido aplicado.
    const c = await colunas('assets');
    expect(c).toContain('type');
    expect(c).toContain('criticality');
    expect(c.filter(n => n === 'description').length).toBe(1);
  });

  it('dpia_assessments fica com as 22 colunas e system_name aceita NULL', async () => {
    const c = await colunas('dpia_assessments');
    expect(c.length).toBe(22);
    expect(c).toContain('processing_name');

    // O motivo de existir da 0014: o INSERT do código omite system_name.
    await env.DB.prepare(
      `INSERT INTO dpia_assessments (id, project_id, processing_name, status)
       VALUES ('d2','p1','Tratamento novo','Draft')`
    ).run();
    const nova = await env.DB.prepare("SELECT system_name FROM dpia_assessments WHERE id='d2'").first<any>();
    expect(nova.system_name).toBeNull();
  });

  it('o rebuild preserva os dados, inclusive a PII', async () => {
    // DROP TABLE + RENAME numa tabela com dado pessoal: se a cópia falhar, o
    // dado some e não há como saber depois.
    const antiga = await env.DB.prepare("SELECT * FROM dpia_assessments WHERE id='d1'").first<any>();
    expect(antiga.system_name).toBe('Sistema Legado');
    expect(antiga.dpo_opinion).toBe('Parecer do DPO sobre titular X');
    expect(antiga.status).toBe('Approved');
  });

  it('audit_logs ganha project_id sem perder a trilha existente', async () => {
    expect(await colunas('audit_logs')).toContain('project_id');
    const antiga = await env.DB.prepare("SELECT action FROM audit_logs WHERE id='l1'").first<any>();
    expect(antiga.action).toBe('anterior');
  });

  it('scope_changes passa a existir', async () => {
    const t = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='scope_changes'"
    ).first<any>();
    expect(t?.name).toBe('scope_changes');
  });

  it('a trilha vira append-only — o controle que produção não tinha', async () => {
    let bloqueou = false;
    try {
      await env.DB.prepare("DELETE FROM audit_logs WHERE id='l1'").run();
    } catch {
      bloqueou = true;
    }
    expect(bloqueou).toBe(true);
  });

  it('o índice UNIQUE de api_keys recusa hash duplicado', async () => {
    let recusou = false;
    try {
      await env.DB.prepare(`INSERT INTO api_keys (id, key_hash) VALUES ('k2','hash-unico')`).run();
    } catch {
      recusou = true;
    }
    expect(recusou).toBe(true);
  });

  it('o INSERT de ativo que hoje falha em produção passa a funcionar', async () => {
    // projects.ts:291 — grava type e criticality, que não existem lá.
    await env.DB.prepare(
      `INSERT INTO assets (id, project_id, name, type, category, owner, criticality, description)
       VALUES ('a1','p1','Servidor','Hardware','TI','ops','High','desc')`
    ).run();
    const a = await env.DB.prepare("SELECT criticality FROM assets WHERE id='a1'").first<any>();
    expect(a.criticality).toBe('High');
  });
});
