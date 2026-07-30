-- Migration 0014: torna dpia_assessments.system_name NULLABLE em bancos legados.
--
-- Depende de 0013 (que adiciona ropa_id/processing_name/... à tabela). Em bancos
-- antigos system_name era NOT NULL, mas o INSERT atual usa processing_name e omite
-- system_name — então toda criação de DPIA falharia. SQLite não permite alterar
-- NOT NULL via ALTER, então fazemos o rebuild padrão da tabela (12-step), preservando
-- todas as colunas e dados (incl. PII). Não há FKs de entrada para dpia_assessments,
-- então DROP/RENAME é seguro.
--
-- ⚠️ PRÉ-VOO OBRIGATÓRIO (bancos alterados à mão podem divergir). O INSERT..SELECT
-- abaixo copia APENAS a lista fixa de colunas; qualquer coluna EXTRA na tabela legada
-- seria SILENCIOSAMENTE PERDIDA no DROP — inaceitável para uma tabela com PII. Antes
-- de aplicar, rode:
--     npx wrangler d1 execute niso-db --command "PRAGMA table_info(dpia_assessments);"
-- e confirme que o conjunto de colunas é EXATAMENTE (nenhuma a mais):
--   id, project_id, system_name, data_flow_description, data_subjects_types,
--   personal_data_categories, necessity_proportionality, risks_identified,
--   mitigation_measures, dpo_opinion, dpo_signature, ceo_signature, ropa_id,
--   processing_name, data_category_risk, technical_measures, residual_risk_level,
--   dpo_recommendations, dpo_approved_by, dpo_approved_at, status, created_at
-- Se houver QUALQUER coluna adicional: NÃO aplique como está — adicione-a à tabela
-- _new e às duas listas do INSERT abaixo antes de rodar (ou aborte).
--
-- Nota Squawk (DROP/RENAME/índice não-concorrente): inerente à relaxação de NOT NULL
-- no SQLite (rebuild de tabela). É aceitável para D1 (SQLite de tenant único; a operação
-- é rápida e roda numa janela de migração, não sob carga).

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
    processing_name, data_category_risk, technical_measures, residual_risk_level,
    dpo_recommendations, dpo_approved_by, dpo_approved_at, status, created_at
)
SELECT
    id, project_id, system_name, data_flow_description, data_subjects_types,
    personal_data_categories, necessity_proportionality, risks_identified,
    mitigation_measures, dpo_opinion, dpo_signature, ceo_signature, ropa_id,
    processing_name, data_category_risk, technical_measures, residual_risk_level,
    dpo_recommendations, dpo_approved_by, dpo_approved_at, status, created_at
FROM dpia_assessments;

DROP TABLE dpia_assessments;
ALTER TABLE dpia_assessments_new RENAME TO dpia_assessments;
CREATE INDEX IF NOT EXISTS idx_dpia_project ON dpia_assessments(project_id);
