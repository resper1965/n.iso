-- 0054 — núcleo do n.privacy, fatia 4.1: o registro do RoPA (`ropa_records`, que É o tratamento) passa a apontar para o
-- que ele usa (spec seção 5). Aditiva: 3 tabelas novas e 1 coluna anulável; nenhuma linha existente muda.
--
-- Itens (sistemas, bases, processos) e departamentos são N:N com `project_id`; a transferência internacional vira linha
-- própria (país, destinatário = parte, mecanismo). As partes do tratamento (operador, cocontrolador, suboperador) NÃO têm
-- tabela: usam `parte_vinculos` com `alvo_tipo = 'tratamento'`, que a 0047 já aceita. `base_legal_id` aponta para o catálogo
-- de requisitos (0053); o texto livre `legal_basis` continua.
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE ropa_records ADD COLUMN base_legal_id TEXT REFERENCES requisitos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tratamento_itens (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_trat_itens_item ON tratamento_itens(item_id);

CREATE TABLE IF NOT EXISTS tratamento_departamentos (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    departamento_id TEXT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, departamento_id)
);
CREATE INDEX IF NOT EXISTS idx_trat_deptos_depto ON tratamento_departamentos(departamento_id);

CREATE TABLE IF NOT EXISTS tratamento_transferencias (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    pais TEXT NOT NULL,
    destinatario_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    mecanismo TEXT,
    observacao TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trat_transf_ropa ON tratamento_transferencias(ropa_id);
CREATE INDEX IF NOT EXISTS idx_trat_transf_projeto ON tratamento_transferencias(project_id);
