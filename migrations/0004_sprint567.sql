-- Sprint 5+6+7: Advanced Compliance, Enterprise, Integration

-- ROPA (Record of Processing Activities) - Sprint 5
CREATE TABLE IF NOT EXISTS ropa_records (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    processing_purpose TEXT NOT NULL,
    data_categories TEXT,
    data_subjects TEXT,
    legal_basis TEXT,
    retention_period TEXT,
    recipients TEXT,
    international_transfers INTEGER DEFAULT 0,
    transfer_safeguards TEXT,
    dpia_required INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    owner TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit Calendar - Sprint 6
CREATE TABLE IF NOT EXISTS audit_schedule (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    audit_type TEXT NOT NULL,
    title TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    auditor_name TEXT,
    scope TEXT,
    status TEXT DEFAULT 'Planned',
    findings_count INTEGER DEFAULT 0,
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Corrective Actions (CAPA) - Sprint 6
CREATE TABLE IF NOT EXISTS corrective_actions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    audit_id TEXT,
    risk_id TEXT,
    control_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT DEFAULT 'Medium',
    assigned_to TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'Open',
    resolution TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys - Sprint 7
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read',
    last_used_at DATETIME,
    expires_at DATETIME,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Configs - Sprint 7
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    status TEXT DEFAULT 'Active',
    last_triggered_at DATETIME,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add maturity_level to compliance_controls - Sprint 5
-- (D1 doesn't support ALTER ADD COLUMN IF NOT EXISTS, using pragma workaround)

CREATE INDEX IF NOT EXISTS idx_ropa_project ON ropa_records(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_schedule_project ON audit_schedule(project_id);
CREATE INDEX IF NOT EXISTS idx_capa_project ON corrective_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);
