-- 0056 — núcleo do n.privacy, fatia 5: DPIA e LIA nascem do tratamento (spec seção 5).
--
-- 1. `dpia_assessments.ropa_id` ganha integridade no BANCO sem reconstruir a tabela (que tem assinatura e deriva histórica,
--    ver 0013): três triggers dão o efeito de uma FK `ON DELETE SET NULL` e conferem o PROJETO, o que uma FK não faz.
--    Primeiro zera a referência morta que já exista (só quem aponta para registro inexistente).
-- 2. `lia_assessments`: teste de legítimo interesse, uma por tratamento (`ropa_id` único), apagada junto com ele.
-- Aditiva: nada que já exista perde dado além da referência morta do passo 1.

UPDATE dpia_assessments SET ropa_id = NULL WHERE ropa_id IS NOT NULL AND ropa_id NOT IN (SELECT id FROM ropa_records);

CREATE TRIGGER IF NOT EXISTS dpia_ropa_do_projeto_ins
BEFORE INSERT ON dpia_assessments
WHEN NEW.ropa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'ropa_id inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS dpia_ropa_do_projeto_upd
BEFORE UPDATE OF ropa_id ON dpia_assessments
WHEN NEW.ropa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'ropa_id inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS dpia_ropa_apagada
AFTER DELETE ON ropa_records
BEGIN
    UPDATE dpia_assessments SET ropa_id = NULL WHERE ropa_id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS lia_assessments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL UNIQUE REFERENCES ropa_records(id) ON DELETE CASCADE,
    finalidade_legitima TEXT,
    necessidade TEXT,
    balanceamento TEXT,
    salvaguardas TEXT,
    conclusao TEXT CHECK (conclusao IS NULL OR conclusao IN ('prevalece', 'nao_prevalece')),
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'concluida')),
    concluida_em DATETIME,
    concluida_por TEXT,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (status = 'rascunho' OR (conclusao IS NOT NULL AND concluida_em IS NOT NULL AND concluida_por IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_lia_projeto ON lia_assessments(project_id, status);
