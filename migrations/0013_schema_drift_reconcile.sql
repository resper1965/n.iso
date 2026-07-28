-- Migration 0013: reconcile schema drift (CR-3) — ADDITIVE, verify before applying.
--
-- CONTEXTO: o código grava/lê colunas que não existiam no schema versionado
-- (assets.type/criticality/description; várias colunas de dpia_assessments).
-- Esta migration ADICIONA essas colunas a bancos já existentes.
--
-- ⚠️ SQLite/D1 NÃO suporta `ADD COLUMN IF NOT EXISTS`. Se o banco de produção
-- foi alterado à mão, alguma destas colunas pode já existir e o ALTER falhará.
-- ANTES de aplicar, verifique o estado real e remova as linhas de colunas que
-- já existirem:
--     npx wrangler d1 execute niso-db --command "PRAGMA table_info(assets);"
--     npx wrangler d1 execute niso-db --command "PRAGMA table_info(dpia_assessments);"
--
-- Aplicar:  npx wrangler d1 migrations apply niso-db

-- ── assets ────────────────────────────────────────────────────────────────
ALTER TABLE assets ADD COLUMN type TEXT;
ALTER TABLE assets ADD COLUMN criticality TEXT DEFAULT 'Medium';
ALTER TABLE assets ADD COLUMN description TEXT;

-- ── dpia_assessments ──────────────────────────────────────────────────────
ALTER TABLE dpia_assessments ADD COLUMN ropa_id TEXT;
ALTER TABLE dpia_assessments ADD COLUMN processing_name TEXT;
ALTER TABLE dpia_assessments ADD COLUMN data_category_risk TEXT;
ALTER TABLE dpia_assessments ADD COLUMN technical_measures TEXT;
ALTER TABLE dpia_assessments ADD COLUMN residual_risk_level TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_recommendations TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_approved_by TEXT;
ALTER TABLE dpia_assessments ADD COLUMN dpo_approved_at TEXT;

-- ⚠️ ATENÇÃO (não automatizado — decisão do DBA):
-- Em bancos antigos, dpia_assessments.system_name pode ser NOT NULL. O código
-- atual NÃO informa system_name no INSERT (usa processing_name), então a criação
-- de DPIA falhará por violação de NOT NULL. Como dpia_assessments contém PII, o
-- rebuild da tabela (para tornar system_name nullable) deve ser feito de forma
-- controlada e verificada — NÃO incluído aqui. Verifique com:
--     npx wrangler d1 execute niso-db --command "PRAGMA table_info(dpia_assessments);"
