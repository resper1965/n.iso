-- Reconciliação do banco de produção — agosto/2026. USO ÚNICO.
--
-- Fica em ops/ e NÃO em migrations/ de propósito: o wrangler varre
-- `migrations/*.sql` e aplicaria este arquivo junto com as migrations reais.
--
-- ─── Por que existe ────────────────────────────────────────────────────────
--
-- A `d1_migrations` de produção registra 7 entradas (0002…0006 e 0019), mas o
-- banco claramente tem objetos de 0002_policy_templates até 0012 — ele foi
-- criado a partir do `schema.sql` da época, não pela sequência de migrations.
-- O resultado é que a tabela de controle não descreve o banco, e as migrations
-- 0013, 0014, 0016, 0017 e 0018 nunca rodaram.
--
-- Isso não é dívida abstrata. Com o código que está em produção hoje:
--   - `assets.type` / `assets.criticality` não existem  → criar ativo falha
--     (projects.ts:291, platform.ts:22)
--   - `audit_logs.project_id` não existe                → criar webhook e criar
--     ou revogar API key falham (integrations.ts:157,226,246)
--   - `scope_changes` não existe                        → projects.ts:317,331
--   - `dpia_assessments` não tem processing_name e tem
--     system_name NOT NULL                              → criar DPIA falha
--     (projects.ts:511)
--
-- ─── O que este arquivo NÃO faz ────────────────────────────────────────────
--
-- Não roda `ALTER TABLE assets ADD COLUMN description` (a coluna JÁ existe; o
-- SQLite não tem ADD COLUMN IF NOT EXISTS e o statement abortaria o lote), e
-- não recria `project_knowledge` (a 0015 já está no banco).
--
-- ─── Pré-voo obrigatório ───────────────────────────────────────────────────
--
-- O bloco 5 cria um índice UNIQUE em api_keys(key_hash). Se houver hash
-- duplicado, ele falha. Confirme que a consulta abaixo volta VAZIA:
--
--   SELECT key_hash, count(*) AS n FROM api_keys GROUP BY key_hash HAVING n > 1;
--
-- E faça `npm run db:backup` antes. O bloco 2 reconstrói uma tabela com PII.

-- ═══ 1. Colunas da 0013 que faltam ═════════════════════════════════════════
-- `description` está fora: já existe em produção.
ALTER TABLE assets ADD COLUMN type TEXT;
ALTER TABLE assets ADD COLUMN criticality TEXT DEFAULT 'Medium';

ALTER TABLE dpia_assessments ADD COLUMN ropa_id TEXT;
ALTER TABLE dpia_assessments ADD COLUMN processing_name TEXT;
ALTER TABLE dpia_assessments ADD COLUMN data_category_risk TEXT;
ALTER TABLE dpia_assessments ADD COLUMN technical_measures TEXT;
ALTER TABLE dpia_assessments ADD COLUMN residual_risk_level TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_recommendations TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_approved_by TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_approved_at TEXT;

-- ═══ 2. 0014: system_name deixa de ser NOT NULL ════════════════════════════
-- O SQLite não relaxa NOT NULL por ALTER; é o rebuild de tabela em 12 passos.
-- O `PRAGMA table_info` de produção mostrou EXATAMENTE as 14 colunas
-- pré-0013, nenhuma a mais — somadas às 8 do bloco 1, dão as 22 abaixo. Não há
-- coluna extra para ser perdida no DROP, que era o risco desta operação.
CREATE TABLE dpia_assessments_new (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    system_name TEXT,
    data_flow_description TEXT,
    data_subjects_types TEXT,
    personal_data_categories TEXT,
    necessity_proportionality TEXT,
    risks_identified TEXT,
    mitigation_measures TEXT,
    dpo_opinion TEXT,
    dpo_signature TEXT,
    ceo_signature TEXT,
    ropa_id TEXT,
    processing_name TEXT,
    data_category_risk TEXT,
    technical_measures TEXT,
    residual_risk_level TEXT,
    dpo_recommendations TEXT,
    dpo_approved_by TEXT,
    dpo_approved_at TEXT,
    status TEXT DEFAULT 'Draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO dpia_assessments_new (
    id, project_id, system_name, data_flow_description, data_subjects_types,
    personal_data_categories, necessity_proportionality, risks_identified,
    mitigation_measures, dpo_opinion, dpo_signature, ceo_signature, ropa_id,
    processing_name, data_category_risk, technical_measures,
    residual_risk_level, dpo_recommendations, dpo_approved_by,
    dpo_approved_at, status, created_at
)
SELECT
    id, project_id, system_name, data_flow_description, data_subjects_types,
    personal_data_categories, necessity_proportionality, risks_identified,
    mitigation_measures, dpo_opinion, dpo_signature, ceo_signature, ropa_id,
    processing_name, data_category_risk, technical_measures,
    residual_risk_level, dpo_recommendations, dpo_approved_by,
    dpo_approved_at, status, created_at
FROM dpia_assessments;

DROP TABLE dpia_assessments;
ALTER TABLE dpia_assessments_new RENAME TO dpia_assessments;
CREATE INDEX IF NOT EXISTS idx_dpia_project ON dpia_assessments(project_id);

-- ═══ 3. 0016: scope_changes e índices ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS scope_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    change_description TEXT NOT NULL,
    reason TEXT,
    impact_analysis TEXT,
    requested_by TEXT,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scope_changes_project ON scope_changes(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_controls_project ON compliance_controls(project_id);
CREATE INDEX IF NOT EXISTS idx_users_client_project ON users(client_project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ═══ 4. 0017: audit_logs.project_id ════════════════════════════════════════
ALTER TABLE audit_logs ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);

-- ═══ 5. 0018: trilha imutável e unicidade da chave de API ══════════════════
-- POR ÚLTIMO, sempre: os triggers tornam audit_logs append-only e qualquer
-- correção posterior que precise mexer na trilha deixa de ser possível.
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
