-- 0053 — núcleo do n.privacy, fatia 2: catálogo de requisitos (spec 4.5 e 4.6).
--
-- Aditiva: 4 tabelas novas e 1 coluna anulável em compliance_controls. Sem carga: o seed (ISO, LGPD, GDPR) é
-- feito por POST /api/v1/requisitos/semear, idempotente. Catálogo GLOBAL (sem project_id), como o 27701 de hoje.
-- `requisito_mapeamentos.estado` só vira 'validado_juridico' com quem validou e quando (CHECK); o cliente só vê
-- o validado. `documento_requisitos` liga documento a requisito (o documento existe sem nenhuma linha aqui).
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
CREATE TABLE IF NOT EXISTS requisito_fontes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    versao TEXT,
    vigente_desde TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requisitos (
    id TEXT PRIMARY KEY,
    fonte_id TEXT NOT NULL REFERENCES requisito_fontes(id),
    referencia TEXT NOT NULL,
    titulo TEXT NOT NULL,
    pai_id TEXT REFERENCES requisitos(id),
    papel TEXT CHECK (papel IS NULL OR papel IN ('controlador', 'operador')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fonte_id, referencia)
);
CREATE INDEX IF NOT EXISTS idx_requisitos_fonte ON requisitos(fonte_id, referencia);
CREATE INDEX IF NOT EXISTS idx_requisitos_pai ON requisitos(pai_id);

CREATE TABLE IF NOT EXISTS requisito_mapeamentos (
    de_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    para_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('equivalente', 'parcial', 'relacionado')),
    estado TEXT NOT NULL DEFAULT 'proposto' CHECK (estado IN ('proposto', 'validado_juridico')),
    validado_por TEXT,
    validado_em TEXT,
    nota TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (de_id, para_id),
    CHECK (de_id <> para_id),
    CHECK (estado = 'proposto' OR (validado_por IS NOT NULL AND validado_em IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mapeamentos_para ON requisito_mapeamentos(para_id);

CREATE TABLE IF NOT EXISTS documento_requisitos (
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_requisitos_requisito ON documento_requisitos(requisito_id);
CREATE INDEX IF NOT EXISTS idx_doc_requisitos_projeto ON documento_requisitos(project_id);

ALTER TABLE compliance_controls ADD COLUMN requisito_id TEXT REFERENCES requisitos(id) ON DELETE SET NULL;
