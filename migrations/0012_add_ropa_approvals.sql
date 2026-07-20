-- Migração D1: Adicionar colunas de aprovação/assinatura à tabela de ROPA para ISO 27701
ALTER TABLE ropa_records ADD COLUMN ciso_approved_by TEXT;
ALTER TABLE ropa_records ADD COLUMN ciso_approved_at TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_by TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_at TEXT;
