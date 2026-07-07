-- Sprint 4: Risk Assessment, Vendors (KYV), Training Records

CREATE TABLE IF NOT EXISTS risks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    asset TEXT NOT NULL,
    threat TEXT NOT NULL,
    vulnerability TEXT,
    impact INTEGER NOT NULL DEFAULT 3,
    probability INTEGER NOT NULL DEFAULT 3,
    risk_score INTEGER GENERATED ALWAYS AS (impact * probability) STORED,
    risk_level TEXT,
    treatment TEXT DEFAULT 'Mitigate',
    treatment_plan TEXT,
    control_id TEXT,
    owner TEXT,
    status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    category TEXT,
    has_iso27001 INTEGER DEFAULT 0,
    has_iso27701 INTEGER DEFAULT 0,
    has_soc2 INTEGER DEFAULT 0,
    trust_score INTEGER DEFAULT 0,
    diligence_level TEXT DEFAULT 'High',
    dpa_signed INTEGER DEFAULT 0,
    last_assessment_date TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_records (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    employee_name TEXT NOT NULL,
    training_name TEXT NOT NULL,
    completion_date TEXT,
    score INTEGER,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_vendors_project ON vendors(project_id);
CREATE INDEX IF NOT EXISTS idx_training_project ON training_records(project_id);
