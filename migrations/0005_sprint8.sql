-- Sprint 8: Market Ready

-- Organizations (Multi-Tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'trial',
    max_projects INTEGER DEFAULT 3,
    max_users INTEGER DEFAULT 5,
    owner_id TEXT,
    logo_url TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Certification Tracker
CREATE TABLE IF NOT EXISTS certification_tracking (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    standard TEXT NOT NULL DEFAULT 'ISO 27001:2022',
    stage TEXT DEFAULT 'Gap Assessment',
    target_date TEXT,
    stage1_date TEXT,
    stage1_status TEXT DEFAULT 'Pending',
    stage2_date TEXT,
    stage2_status TEXT DEFAULT 'Pending',
    certificate_number TEXT,
    certificate_expiry TEXT,
    registrar TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Chat History
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    user_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cert_project ON certification_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_project ON ai_chat_history(project_id);
