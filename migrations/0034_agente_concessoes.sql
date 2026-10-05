-- Concessão de acesso de um agente de IA (MCP remoto) a UM projeto, em nome
-- de um consultor. O token OAuth carrega `concessaoId`; esta linha é o que
-- revalida o acesso a cada chamada e o que o cliente vê e revoga.
CREATE TABLE IF NOT EXISTS agente_concessoes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cliente_mcp TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em DATETIME,
    expira_em DATETIME NOT NULL,
    revogado_em DATETIME,
    revogado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_agente_concessoes_projeto ON agente_concessoes(project_id);
