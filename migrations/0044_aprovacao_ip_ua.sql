-- 0044 — IP e user agent das aprovações CISO/CEO (controles, evidências, ROPA).
-- Produção e staging já têm as 12 colunas (criadas fora de migration). Lá esta migration NÃO roda:
-- só é registrada em d1_migrations (ver migrations/README.md, 0044). Serve a banco novo.
ALTER TABLE compliance_controls ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE compliance_controls ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE compliance_controls ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE compliance_controls ADD COLUMN ceo_approved_ua TEXT;
ALTER TABLE evidence ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE evidence ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE evidence ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE evidence ADD COLUMN ceo_approved_ua TEXT;
ALTER TABLE ropa_records ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE ropa_records ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_ua TEXT;
