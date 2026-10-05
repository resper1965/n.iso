-- Migration 0035: assinaturas da análise crítica (F10) — ADITIVA, NÃO IDEMPOTENTE.
--
-- CONTEXTO: o D1 de produção já tem estas seis colunas em `management_reviews`
-- (apurado por PRAGMA em 2026-10-01), mas nem `schema.sql` nem as migrations as
-- declaravam: banco novo divergia de produção. O `schema.sql` agora as traz; esta
-- migration leva o MESMO DDL a bancos criados antes da correção (staging antigo,
-- backup restaurado de versão anterior).
--
-- ⚠️ SQLite/D1 NÃO tem `ADD COLUMN IF NOT EXISTS`. Em PRODUÇÃO NÃO EXECUTE ESTE
-- ARQUIVO: as colunas existem e o primeiro ALTER aborta com "duplicate column".
-- Em produção apenas REGISTRE a migration como aplicada (migrations/README.md):
--     INSERT OR IGNORE INTO d1_migrations (name)
--       VALUES ('0035_management_reviews_assinaturas.sql');

ALTER TABLE management_reviews ADD COLUMN ciso_signed_by TEXT;
ALTER TABLE management_reviews ADD COLUMN ciso_signed_at DATETIME;
ALTER TABLE management_reviews ADD COLUMN ciso_signed_ip TEXT;
ALTER TABLE management_reviews ADD COLUMN ceo_signed_by TEXT;
ALTER TABLE management_reviews ADD COLUMN ceo_signed_at DATETIME;
ALTER TABLE management_reviews ADD COLUMN ceo_signed_ip TEXT;
