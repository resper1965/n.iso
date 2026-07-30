-- Migration 0016: cria a tabela scope_changes (usada pelo código, ausente do schema —
-- os endpoints /:id/scope-changes falhavam com "no such table: scope_changes"; a tabela
-- project_scope_changes existente tem outro modelo de colunas e não é usada pelo código)
-- e adiciona índices em colunas de filtro frequentes. Aditiva/idempotente.

CREATE TABLE IF NOT EXISTS scope_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    change_description TEXT NOT NULL,
    reason TEXT,
    impact_analysis TEXT,
    requested_by TEXT,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scope_changes_project ON scope_changes(project_id);

CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_controls_project ON compliance_controls(project_id);
CREATE INDEX IF NOT EXISTS idx_users_client_project ON users(client_project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
