-- Migration 0017: adiciona project_id a audit_logs para escopar corretamente
-- o export/trilha de auditoria por projeto (antes o export filtrava por `actor`,
-- retornando as ações do próprio requisitante em vez das do projeto, e a trilha
-- usava `details LIKE '%projectId%'`). Aditiva/idempotente.

ALTER TABLE audit_logs ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);
