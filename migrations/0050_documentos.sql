-- Documentos e versões (fatia 3.1 do núcleo do n.privacy). Só CREATE ... IF NOT EXISTS, sem carga: o hash
-- (SHA-256 canônico) não se calcula em SQLite, então as políticas que já existem entram por
-- POST /api/v1/projects/:projectId/documentos/importar, por projeto e repetível.
CREATE TABLE IF NOT EXISTS documentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'politica' CHECK (tipo IN ('politica', 'norma', 'procedimento')),
    titulo TEXT NOT NULL,
    pai_id TEXT REFERENCES documentos(id) ON DELETE SET NULL,
    dono_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    revisar_a_cada_meses INTEGER CHECK (revisar_a_cada_meses IS NULL OR revisar_a_cada_meses BETWEEN 1 AND 120),
    revisar_ate TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'vigente', 'obsoleto')),
    origem_control_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL, -- transitório: sai quando a ciência passar para a versão (3.3)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documentos_projeto ON documentos(project_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_controle ON documentos(origem_control_id) WHERE origem_control_id IS NOT NULL;

-- Uma versão vigente e um rascunho, no máximo, por documento (índices parciais): é a trava contra duas
-- publicações simultâneas. `project_id` se repete aqui para a tabela entrar na portabilidade.
CREATE TABLE IF NOT EXISTS documento_versoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    texto TEXT NOT NULL,
    hash TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'vigente', 'substituida')),
    origem TEXT NOT NULL DEFAULT 'humano' CHECK (origem IN ('humano', 'agente', 'gerador')),
    criado_por TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (documento_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_vigente ON documento_versoes(documento_id) WHERE estado = 'vigente';
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_rascunho ON documento_versoes(documento_id) WHERE estado = 'rascunho';
