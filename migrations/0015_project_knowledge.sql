-- Migration 0015: cria a tabela project_knowledge (Knowledge Base / RAG).
-- O KnowledgeService.ingest() faz INSERT nesta tabela, que não existia no schema —
-- a ingestão de documentos falhava em runtime (no such table: project_knowledge).
-- Aditiva e idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS project_knowledge (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'other',
    content TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON project_knowledge(project_id);
