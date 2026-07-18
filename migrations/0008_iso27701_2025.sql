-- Migration: 0008_iso27701_2025.sql
-- Adiciona suporte a consentimento e assinaturas digitais na transição para a ISO/IEC 27701:2025

ALTER TABLE ropa_records ADD COLUMN consent_details TEXT;
ALTER TABLE ropa_records ADD COLUMN data_subject_rights_details TEXT;

ALTER TABLE dpia_assessments ADD COLUMN dpo_signature TEXT;
ALTER TABLE dpia_assessments ADD COLUMN ceo_signature TEXT;
