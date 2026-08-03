-- Registro na `d1_migrations` — rodar SOMENTE depois de `reconcile-2026-08.sql`
-- ter terminado sem erro, e depois da conferência do bloco final abaixo.
--
-- Sem isto, `wrangler d1 migrations apply` continua achando que 17 migrations
-- estão pendentes e tentaria reaplicar tudo na próxima vez que alguém rodar.
--
-- As entradas de 0002_policy_templates a 0012 registram objetos que o banco JÁ
-- TEM, vindos do `schema.sql` e não da sequência de migrations. O PRAGMA de
-- produção já provou duas delas — `assets` tem as três colunas de rating da
-- 0009, `dpia_assessments` tem `dpo_signature` da 0008. Confirme as restantes
-- antes de rodar este arquivo:
--
--   SELECT name FROM sqlite_master WHERE name IN
--     ('policy_templates','project_governance');
--   PRAGMA table_info(compliance_controls);   -- espera-se `maturity`   (0007)
--   PRAGMA table_info(projects);              -- espera-se `cnpj`       (0010)
--   PRAGMA table_info(ropa_records);          -- espera-se `ciso_approved_by` (0012)
--
-- Se alguma faltar, NÃO registre a migration correspondente — aplique-a.

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0002_policy_templates.sql'),
  ('0007_saas_metrics.sql'),
  ('0008_iso27701_2025.sql'),
  ('0009_asset_cid_ratings.sql'),
  ('0010_company_governance.sql'),
  ('0011_seed_twyn_governance.sql'),
  ('0012_add_ropa_approvals.sql'),
  ('0013_schema_drift_reconcile.sql'),
  ('0014_dpia_system_name_nullable.sql'),
  ('0015_project_knowledge.sql'),
  ('0016_scope_changes_and_indices.sql'),
  ('0017_audit_logs_project.sql'),
  ('0018_data_hardening.sql'),
  ('0020_mfa_rate_limit.sql');

-- Conferência final: a lista abaixo deve ficar VAZIA.
--   npx wrangler d1 migrations list niso-db --remote
