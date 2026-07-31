import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
// `?raw` inlina o arquivo como string em tempo de build (Vite), então o teste roda
// no pool workerd sem tocar node:fs — que é justamente o que quebrava a suíte antes.
import schemaSql from '../schema.sql?raw';

/**
 * Teste de CONTRATO entre código e schema, contra um D1 real (miniflare).
 *
 * Os testes de API existentes mockam o D1 (`first()` devolve `{ok:true}` para
 * qualquer query), então nunca detectam schema drift: foi assim que o código
 * passou a gravar colunas inexistentes (sha256_hash, colunas de DPIA, assets.type)
 * e tabelas que faltavam (project_knowledge, scope_changes) sem nenhum teste falhar.
 *
 * Aqui aplicamos o schema.sql de verdade e executamos os MESMOS INSERTs que os
 * handlers usam. Se uma coluna sumir do schema ou o código gravar uma coluna que
 * não existe, este teste falha com "no such column" — que é o objetivo.
 */

async function exec(sql: string) {
  // D1 exec() não aceita múltiplos statements de forma confiável; separamos por ';'
  // respeitando os blocos BEGIN...END dos triggers.
  const statements: string[] = [];
  let buf = '';
  let inTrigger = false;
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.replace(/--.*$/, '');
    if (!line.trim()) continue;
    if (/CREATE\s+TRIGGER/i.test(line)) inTrigger = true;
    buf += line + '\n';
    if (inTrigger) {
      if (/^\s*END\s*;/i.test(line)) { statements.push(buf); buf = ''; inTrigger = false; }
      continue;
    }
    if (line.trim().endsWith(';')) { statements.push(buf); buf = ''; }
  }
  for (const st of statements) {
    if (!st.trim()) continue;
    await env.DB.prepare(st).run();
  }
}

describe('schema contract (real D1)', () => {
  beforeAll(async () => {
    await exec(schemaSql);
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role) VALUES ('p1','Cliente Teste','ISO 27001','controller')`
    ).run();
  });

  it('applies schema.sql cleanly', async () => {
    const row = await env.DB.prepare("SELECT count(*) AS n FROM projects WHERE id='p1'").first<any>();
    expect(row.n).toBe(1);
  });

  it('accepts the evidence INSERT the upload handlers use (file_hash)', async () => {
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
    ).bind('e1', 'p1', null, 'f.md', 10, 'text/markdown', 'k', 'deadbeef', 'u@x').run();
    const ev = await env.DB.prepare("SELECT file_hash FROM evidence WHERE id='e1'").first<any>();
    expect(ev.file_hash).toBe('deadbeef');
  });

  it('accepts the assets INSERT the handler uses (type, criticality, description)', async () => {
    await env.DB.prepare(
      `INSERT INTO assets (id, project_id, name, type, category, owner, criticality, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind('a1', 'p1', 'DB', 'Software', 'Hardware', 'ops', 'Medium', 'desc').run();
    const a = await env.DB.prepare("SELECT type, criticality FROM assets WHERE id='a1'").first<any>();
    expect(a.type).toBe('Software');
  });

  it('accepts the DPIA INSERT the handler uses (processing_name, no system_name)', async () => {
    await env.DB.prepare(
      `INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, dpo_recommendations, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`
    ).bind('d1', 'p1', null, 'proc', 'risk', 'np', 'tm', 'Medium', null, new Date().toISOString()).run();
    const d = await env.DB.prepare("SELECT processing_name FROM dpia_assessments WHERE id='d1'").first<any>();
    expect(d.processing_name).toBe('proc');
  });

  it('has the tables the code queries (project_knowledge, scope_changes)', async () => {
    await env.DB.prepare(
      `INSERT INTO project_knowledge (id, project_id, title, type, content, metadata) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind('k1', 'p1', 'Doc', 'procedure', 'texto', '{}').run();
    await env.DB.prepare(
      `INSERT INTO scope_changes (id, project_id, change_description, reason, impact_analysis, requested_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`
    ).bind('s1', 'p1', 'mudança', 'motivo', 'impacto', 'u@x').run();
    const k = await env.DB.prepare("SELECT count(*) AS n FROM project_knowledge").first<any>();
    const s = await env.DB.prepare("SELECT count(*) AS n FROM scope_changes").first<any>();
    expect(k.n).toBe(1);
    expect(s.n).toBe(1);
  });

  it('stores project_id on audit_logs (project-scoped export depends on it)', async () => {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind('al1', 'test.action', 'u@x', 'detalhe', '', '', 'p1').run();
    const row = await env.DB.prepare("SELECT project_id FROM audit_logs WHERE id='al1'").first<any>();
    expect(row.project_id).toBe('p1');
  });

  it('enforces the append-only audit trail', async () => {
    // Autocontido: o pool isola o storage por teste, então a linha do teste
    // anterior não existe aqui — sem inserir, o UPDATE não casaria nada e o
    // trigger nunca dispararia (o teste passaria por engano).
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, project_id, created_at)
       VALUES ('al2','test.action','u@x','detalhe','p1', datetime('now'))`
    ).run();

    await expect(
      env.DB.prepare("UPDATE audit_logs SET action='tampered' WHERE id='al2'").run()
    ).rejects.toThrow(/append-only/);
    await expect(
      env.DB.prepare("DELETE FROM audit_logs WHERE id='al2'").run()
    ).rejects.toThrow(/append-only/);

    const row = await env.DB.prepare("SELECT action FROM audit_logs WHERE id='al2'").first<any>();
    expect(row.action).toBe('test.action');
  });

  it('enforces unique api_keys.key_hash', async () => {
    await env.DB.prepare(
      `INSERT INTO api_keys (id, project_id, key_hash, name) VALUES (?, ?, ?, ?)`
    ).bind('ak1', 'p1', 'samehash', 'k1').run();
    await expect(
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name) VALUES (?, ?, ?, ?)`)
        .bind('ak2', 'p1', 'samehash', 'k2').run()
    ).rejects.toThrow();
  });
});
