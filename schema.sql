-- nISO | Database Schema v3.0
-- Delivery Engine for ness. Consultants
-- Cloudflare D1 (SQLite)

-- ═══════════════════════════════════════════════
-- CORE: USERS & AUTH
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    client_project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- STREAM A: CRM & PRÉ-SALES (Leads, Proposals, Contracts)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    status TEXT DEFAULT 'New', -- New, Assessment, Proposal, Won, Lost
    source TEXT,

    -- Dados CNPJ (BrasilAPI)
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    natureza_juridica TEXT,
    porte TEXT,                           -- MEI, ME, EPP, DEMAIS
    capital_social REAL,
    cnae_fiscal INTEGER,
    cnae_fiscal_descricao TEXT,
    data_inicio_atividade TEXT,
    situacao_cadastral TEXT,              -- ATIVA, BAIXADA, etc.

    -- Endereço
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    municipio TEXT,
    uf TEXT,
    cep TEXT,

    -- Contato extra
    telefone TEXT,

    -- QSA (sócios) como JSON
    qsa TEXT,

    -- Metadado da consulta
    cnpj_fetched_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id),
    assessment_id TEXT,
    status TEXT DEFAULT 'Draft', -- Draft, Sent, Approved, Rejected
    content_html TEXT, -- Printable HTML proposal
    total_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES proposals(id),
    lead_id TEXT REFERENCES leads(id),
    status TEXT DEFAULT 'Pending', -- Pending, Signed
    document_r2_key TEXT,
    signed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- STREAM B: ASSESSMENT PRE-SALES
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id),
    client_name TEXT NOT NULL,
    status TEXT DEFAULT 'In Progress',
    complexity TEXT,
    converted_project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    access_token TEXT,
    pricing_override REAL,
    pricing_desconto REAL,
    pricing_notas TEXT
);

CREATE TABLE IF NOT EXISTS assessment_answers (
    id TEXT PRIMARY KEY,
    assessment_id TEXT REFERENCES assessments(id),
    block INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    complexity_impact TEXT,
    gap_detected INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- STREAM B: DELIVERY ENGINE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_name TEXT,
    client_name TEXT NOT NULL,
    sector TEXT,
    scope TEXT,
    standards TEXT NOT NULL,
    org_role TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    assessment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_phases (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_scope_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    previous_scope TEXT,
    new_scope TEXT NOT NULL,
    change_reason TEXT NOT NULL,
    security_impact TEXT NOT NULL,
    approved_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_interviews (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    track TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    interviewee TEXT,
    gap_detected TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- CORE TABLES (Existing, preserved)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT,
    justification TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_controls (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    standard TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Missing',
    maturity INTEGER DEFAULT 0,
    owner TEXT,
    ciso_approved_by TEXT,
    ciso_approved_at TEXT,
    ceo_approved_by TEXT,
    ceo_approved_at TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    control_id TEXT REFERENCES compliance_controls(id),
    project_id TEXT,
    file_name TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    twyn_ref TEXT,
    file_type TEXT,
    file_size INTEGER,
    uploaded_by TEXT NOT NULL,
    evaluation_status TEXT DEFAULT 'pending',
    evaluation_score REAL,
    evaluation_notes TEXT,
    ciso_approved_by TEXT,
    ciso_approved_at TEXT,
    ceo_approved_by TEXT,
    ceo_approved_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- PORTAL DO AUDITOR EXTERNO
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auditor_tokens (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL,      -- assessment_done, proposal_ready, contract_signed, phase_completed
    title TEXT NOT NULL,
    message TEXT,
    read INTEGER DEFAULT 0,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_assessment_answers_block ON assessment_answers(assessment_id, block);
CREATE INDEX IF NOT EXISTS idx_project_phases ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_interviews ON project_interviews(project_id, track);
CREATE INDEX IF NOT EXISTS idx_evidence_control ON evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cnpj ON leads(cnpj);
CREATE INDEX IF NOT EXISTS idx_proposals_lead ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

-- ═══════════════════════════════════════════════
-- SPRINT 4: RISK ASSESSMENT, VENDORS (KYV), TRAINING
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT, -- Informação, Software, Hardware, Pessoas
    classification TEXT DEFAULT 'Confidential', -- Confidential, Restricted, Internal, Public
    owner TEXT,
    location TEXT, -- ex: AWS S3, local, etc.
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    threat TEXT NOT NULL,
    vulnerability TEXT,
    impact INTEGER NOT NULL DEFAULT 3,
    probability INTEGER NOT NULL DEFAULT 3,
    risk_score INTEGER GENERATED ALWAYS AS (impact * probability) STORED,
    risk_level TEXT,
    treatment TEXT DEFAULT 'Mitigate',
    treatment_plan TEXT,
    control_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL,
    owner TEXT,
    status TEXT DEFAULT 'Open',
    accepted_by TEXT,
    accepted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_history (
    id TEXT PRIMARY KEY,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    project_id TEXT,
    impact INTEGER NOT NULL,
    probability INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- ═══════════════════════════════════════════════
-- SPRINT 5+6+7: ROPA, AUDIT CALENDAR, CAPA, API KEYS, WEBHOOKS
-- ═══════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS corrective_actions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    audit_id TEXT REFERENCES audit_schedule(id) ON DELETE CASCADE,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    control_id TEXT REFERENCES compliance_controls(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    root_cause TEXT,
    action_plan TEXT,
    severity TEXT DEFAULT 'Medium',
    assigned_to TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'Open',
    resolution TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX IF NOT EXISTS idx_ropa_project ON ropa_records(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_schedule_project ON audit_schedule(project_id);
CREATE INDEX IF NOT EXISTS idx_capa_project ON corrective_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);

-- ═══════════════════════════════════════════════
-- SPRINT 8: MARKET READY
-- ═══════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════
-- DOCUMENT INTAKE PIPELINE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    document_type TEXT NOT NULL,  -- organograma, policy, inventory, topology, systems, contracts, incidents, certifications, floorplan, audit_report, ropa, backup_dr
    filename TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_hash TEXT,
    file_size INTEGER,
    file_type TEXT,
    status TEXT DEFAULT 'uploaded',  -- uploaded, extracting, extracted, confirmed, failed
    extracted_data TEXT,     -- JSON estruturado extraído pela AI
    extracted_summary TEXT,  -- Texto legível para revisão pelo consultor
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projdocs_project ON project_documents(project_id);

-- -----------------------------------------------
-- SPRINT F: CHECKLIST PERSISTENCE
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS checklist_progress (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    is_checked INTEGER DEFAULT 0,
    checked_by TEXT REFERENCES users(id),
    checked_at DATETIME,
    evidence_id TEXT REFERENCES evidence(id),
    notes TEXT,
    assigned_to TEXT,
    due_date TEXT,
    UNIQUE(project_id, phase_number, item_id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_progress_project ON checklist_progress(project_id);

-- -----------------------------------------------
-- SPRINT A: CONTEXT & STAKEHOLDERS
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS stakeholders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'external',
    category TEXT,
    requirements TEXT,
    influence TEXT DEFAULT 'Medium',
    communication_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stakeholders_project ON stakeholders(project_id);

CREATE TABLE IF NOT EXISTS context_analysis (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) UNIQUE,
    internal_strengths TEXT,
    internal_weaknesses TEXT,
    external_opportunities TEXT,
    external_threats TEXT,
    legal_requirements TEXT,
    contractual_requirements TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_analysis_project ON context_analysis(project_id);

-- -----------------------------------------------
-- SPRINT D: AUDIT FINDINGS & MANAGEMENT REVIEW
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS audit_findings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    audit_id TEXT REFERENCES audit_schedule(id),
    project_id TEXT REFERENCES projects(id),
    control_id TEXT,
    finding_type TEXT NOT NULL DEFAULT 'observation',
    description TEXT NOT NULL,
    evidence_reviewed TEXT,
    auditor_notes TEXT,
    capa_id TEXT REFERENCES corrective_actions(id),
    status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit ON audit_findings(audit_id);

CREATE TABLE IF NOT EXISTS management_reviews (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    review_date DATE NOT NULL,
    attendees TEXT,
    agenda_json TEXT,
    decisions TEXT,
    action_items TEXT,
    minutes_url TEXT,
    status TEXT DEFAULT 'Planned',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mgmt_reviews_project ON management_reviews(project_id);

-- -----------------------------------------------
-- SPRINT E: AUDITOR COLLABORATION HUB
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS auditor_notes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    auditor_token TEXT NOT NULL,
    control_id TEXT REFERENCES compliance_controls(id),
    note_type TEXT DEFAULT 'question', -- question, observation, evidence_request
    content TEXT NOT NULL,
    response TEXT,
    responded_by TEXT REFERENCES users(id),
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auditor_notes_project ON auditor_notes(project_id);