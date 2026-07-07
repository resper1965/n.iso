-- Migration: 0007_saas_metrics.sql
-- Adiciona suporte a maturidade de controles e status de avaliação de evidências

ALTER TABLE compliance_controls ADD COLUMN maturity INTEGER DEFAULT 0;
ALTER TABLE evidence ADD COLUMN evaluation_status TEXT DEFAULT 'pending'; -- pending, conforming, non_conforming, partial
ALTER TABLE evidence ADD COLUMN evaluation_score REAL;
ALTER TABLE evidence ADD COLUMN evaluation_notes TEXT;
