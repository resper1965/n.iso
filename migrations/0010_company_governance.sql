-- Migração: Ficha Cadastral e Governança do Projeto
ALTER TABLE projects ADD COLUMN cnpj TEXT;
ALTER TABLE projects ADD COLUMN employee_count INTEGER;

CREATE TABLE IF NOT EXISTS project_governance (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    role_category TEXT NOT NULL, -- 'consultor', 'executivo', 'tech', 'operacoes'
    job_title TEXT NOT NULL,     -- 'CEO', 'CTO', 'CISO', 'DPO', etc.
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
