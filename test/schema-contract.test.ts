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

  it('tem as tabelas de documentos legais e as colunas da trilha por campo', async () => {
    await env.DB.prepare(
      `INSERT INTO legal_documents (id, kind, version, classification, title, published_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind('ld1', 'termos', '2026-09', 'material', 'Termos de uso').run();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-legal', 'legal@x', 'h', 'Legal', 'org_user')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO legal_acceptances (id, document_id, user_id, accepted_at, ip, user_agent)
       VALUES (?, ?, ?, datetime('now'), ?, ?)`
    ).bind('la1', 'ld1', 'u-legal', '127.0.0.1', 'vitest').run();
    // CHECK do enum: qualquer outro valor virou bloqueio por digitação errada.
    await expect(
      env.DB.prepare(`INSERT INTO legal_documents (id, kind, version, classification, title) VALUES ('ld2','x','1','urgente','t')`).run()
    ).rejects.toThrow(/CHECK/);

    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id,
                               entity_type, entity_id, field, old_value, new_value, operation_id, created_at)
       VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind('al-campo', 'control.updated', 'u@x', 'Status: Gap → Implementado', 'p1',
           'compliance_controls', 'c1', 'Status', 'Gap', 'Implementado', 'op1').run();
    const row = await env.DB.prepare("SELECT field, old_value, new_value, operation_id FROM audit_logs WHERE id='al-campo'").first<any>();
    expect(row).toEqual({ field: 'Status', old_value: 'Gap', new_value: 'Implementado', operation_id: 'op1' });
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

  it('recusa credencial sem projeto — api_keys, webhooks e auditor_tokens', async () => {
    // O caso do PR #41: chave sem `project_id` virava identidade `client` sem
    // escopo e enxergava projeto de todos os tenants. A guarda de runtime
    // (`src/middleware/auth.ts`) continua sendo a última linha; aqui o schema
    // recusa a linha órfã antes de ela existir. Migration 0021.
    await expect(
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name) VALUES (?, NULL, ?, ?)`)
        .bind('ak-sem-projeto', 'hash-orfao', 'sem escopo').run()
    ).rejects.toThrow(/NOT NULL/i);

    await expect(
      env.DB.prepare(`INSERT INTO webhooks (id, url, events) VALUES (?, ?, ?)`)
        .bind('wh-sem-projeto', 'https://x/y', 'evidence.uploaded').run()
    ).rejects.toThrow(/NOT NULL/i);

    await expect(
      env.DB.prepare(`INSERT INTO auditor_tokens (id, token, expires_at) VALUES (?, ?, ?)`)
        .bind('at-sem-projeto', 'tok-orfao', '2099-01-01T00:00:00Z').run()
    ).rejects.toThrow(/NOT NULL/i);
  });

  it('mantém nullable onde a ausência é legítima — users e audit_logs', async () => {
    // Contraprova do teste acima: endurecer indiscriminadamente quebraria o
    // `platform_admin` (não pertence a projeto) e o registro de ação de
    // plataforma na trilha (login, user.created). Os dois casos são de projeto,
    // não descuido — se alguém colocar NOT NULL aqui, este teste avisa.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id)
       VALUES ('u-admin','admin@ness.io','hash','Admin','platform_admin', NULL)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, project_id, created_at)
       VALUES ('al-plataforma','user.created','admin@ness.io','sem projeto', NULL, datetime('now'))`
    ).run();

    const u = await env.DB.prepare("SELECT client_project_id FROM users WHERE id='u-admin'").first<any>();
    const l = await env.DB.prepare("SELECT project_id FROM audit_logs WHERE id='al-plataforma'").first<any>();
    expect(u.client_project_id).toBeNull();
    expect(l.project_id).toBeNull();
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
  it('management_reviews tem as colunas de assinatura que existem em produção (F10)', async () => {
    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('management_reviews')").all<any>();
    const colunas = results.map((r) => r.name);
    for (const c of ['ciso_signed_by', 'ciso_signed_at', 'ciso_signed_ip', 'ceo_signed_by', 'ceo_signed_at', 'ceo_signed_ip']) {
      expect(colunas).toContain(c);
    }
  });
  it('organizations e tabelas comerciais trazem as colunas da organização', async () => {
    const colunas = async (t: string) =>
      (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<any>()).results.map((r) => r.name);
    for (const c of ['cnpj', 'cor_destaque', 'selo_niso', 'prefixo_proposta', 'proximo_numero', 'config_preco', 'textos', 'secoes_desligadas']) {
      expect(await colunas('organizations'), c).toContain(c);
    }
    for (const t of ['leads', 'assessments', 'proposals', 'contracts']) {
      expect(await colunas(t), t).toContain('org_id');
    }
    const ness = await env.DB.prepare(`SELECT name, prefixo_proposta, proximo_numero FROM organizations WHERE id = 'org_ness'`).first<any>();
    expect(ness).toEqual({ name: 'ness.', prefixo_proposta: 'NESS', proximo_numero: 1 });
  });
  it('multiconsultoria (0040): org_id em users e projects, termo e logo em organizations, índices', async () => {
    const colunas = async (t: string) =>
      (await env.DB.prepare(`SELECT name, "notnull", dflt_value FROM pragma_table_info('${t}')`).all<any>()).results;
    for (const t of ['users', 'projects']) {
      const c = (await colunas(t)).find((r: any) => r.name === 'org_id');
      expect(c, t).toMatchObject({ notnull: 1, dflt_value: "'org_ness'" });
    }
    const org = (await colunas('organizations')).map((r: any) => r.name);
    for (const c of ['termo_aceito_em', 'termo_versao', 'logo_chave']) expect(org, c).toContain(c);
    for (const n of ['idx_projects_org', 'idx_users_org']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").bind(n).first(), n).toBeTruthy();
    }
  });
  it('servicos existe e o CHECK recusa tipo desconhecido', async () => {
    const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='servicos'").first();
    expect(t).toBeTruthy();
    await expect(
      env.DB.prepare(`INSERT INTO servicos (id, org_id, nome, tipo) VALUES ('s1', 'org_ness', 'x', 'pacote')`).run()
    ).rejects.toThrow();
  });
  it('propostas e proposta_itens: colunas, CHECK de status e unicidade de número por organização', async () => {
    const colunas = async (t: string) =>
      (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<any>()).results.map((r) => r.name);
    for (const c of ['org_id', 'lead_id', 'assessment_id', 'numero', 'revisao', 'status', 'cliente', 'secoes_editadas', 'documento_conteudo', 'documento_html', 'documento_hash', 'desconto_aprovado_por', 'criada_por']) {
      expect(await colunas('propostas'), c).toContain(c);
    }
    for (const c of ['proposta_id', 'ordem', 'servico_id', 'servico', 'valor_base', 'desconto_pct', 'valor', 'texto_cliente']) {
      expect(await colunas('proposta_itens'), c).toContain(c);
    }
    const ins = (id: string, org: string, numero: string | null, status = 'rascunho') =>
      env.DB.prepare(`INSERT INTO propostas (id, org_id, numero, status, cliente, criada_por) VALUES (?, ?, ?, ?, 'x', 'u')`).bind(id, org, numero, status).run();
    await expect(ins('pr_x', 'org_ness', 'NESS-2026-001', 'outra')).rejects.toThrow();
    await ins('pr_a', 'org_ness', 'NESS-2026-001');
    await expect(ins('pr_b', 'org_ness', 'NESS-2026-001')).rejects.toThrow();
    await ins('pr_c', 'outra_org', 'NESS-2026-001');
    await ins('pr_d', 'org_ness', null);
    await ins('pr_e', 'org_ness', null);
    await env.DB.prepare(`DELETE FROM propostas WHERE id IN ('pr_a','pr_c','pr_d','pr_e')`).run();
  });
  it('colunas de envio, aceite e contrato (0039): CHECK de aceite_origem e índices únicos', async () => {
    const colunas = async (t: string) =>
      (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<any>()).results.map((r) => r.name);
    for (const c of ['token_hash', 'link_gerado_em', 'enviada_em', 'enviada_para', 'visualizada_em', 'aceite_nome', 'aceite_cargo', 'aceite_email', 'aceite_ip', 'aceite_em', 'aceite_origem', 'aceite_comprovante', 'recusa_motivo', 'ajuste_mensagem', 'contrato_id', 'projeto_id']) {
      expect(await colunas('propostas'), c).toContain(c);
    }
    for (const c of ['proposta_id', 'documento_hash', 'valor_projeto', 'mensalidade', 'prazo_minimo_meses', 'servicos', 'projeto_id']) {
      expect(await colunas('contracts'), c).toContain(c);
    }
    expect(await colunas('projects')).toContain('proposta_id');

    const ins = (id: string, token: string | null, origem: string | null = null) =>
      env.DB.prepare(`INSERT INTO propostas (id, org_id, numero, cliente, criada_por, token_hash, aceite_origem) VALUES (?, 'org_ness', ?, 'x', 'u', ?, ?)`).bind(id, id, token, origem).run();
    await expect(ins('pt_x', null, 'x')).rejects.toThrow();
    await ins('pt_a', 'h1', 'link');
    await ins('pt_b', null, 'manual');
    await expect(ins('pt_c', 'h1')).rejects.toThrow();
    await ins('pt_d', null);
    await ins('pt_e', null);

    const ctr = (id: string, proposta: string | null) =>
      env.DB.prepare(`INSERT INTO contracts (id, proposta_id) VALUES (?, ?)`).bind(id, proposta).run();
    await ctr('ct_a', 'pt_a');
    await expect(ctr('ct_b', 'pt_a')).rejects.toThrow();
    await ctr('ct_c', null);
    await ctr('ct_d', null);
    await env.DB.prepare(`DELETE FROM contracts WHERE id IN ('ct_a','ct_c','ct_d')`).run();
    await env.DB.prepare(`DELETE FROM propostas WHERE id LIKE 'pt_%'`).run();
  });
  it('a org_ness nasce com os termos iniciais', async () => {
    const r = await env.DB.prepare(`SELECT textos FROM organizations WHERE id = 'org_ness'`).first<any>();
    const t = JSON.parse(r.textos);
    expect(t.termos).toContain('## Foro');
    expect(t.termos).toContain('## Obrigações da ness.');
    expect(JSON.stringify(t)).not.toMatch(/\{org\}|de ness\./);
    expect(t.pagamentoPadrao).toBe('40/30/30');
    for (const k of ['sobre', 'comoTrabalhamos', 'premissas']) expect(t[k].length, k).toBeGreaterThan(50);
  });
});
