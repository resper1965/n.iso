-- Migration: 0006_security_multi_tenancy.sql
-- Description: Adds project_id to compliance_controls for multi-tenancy isolation.

ALTER TABLE compliance_controls ADD COLUMN project_id TEXT REFERENCES projects(id);

-- Vincular controles existentes ao primeiro projeto para evitar dados órfãos
UPDATE compliance_controls 
SET project_id = (SELECT id FROM projects LIMIT 1) 
WHERE project_id IS NULL;

-- Garantir que maturity_level existe
-- Nota: SQLite não suporta IF NOT EXISTS em ADD COLUMN, 
-- mas como o Hono faz o catch, isto é apenas para novos ambientes.
-- ALTER TABLE compliance_controls ADD COLUMN maturity_level INTEGER DEFAULT 0; 
-- (Comentado pois o Hono já faz o catch e aplica se faltar)
