-- 0059 — núcleo do n.privacy, fatia 8: evidência com validade e ligada a requisito (spec 4.7).
--
-- Aditiva: 1 coluna anulável e 1 tabela. `evidence.valido_ate` (AAAA-MM-DD, opcional): a evidência vencida volta a `pending` pela rotina
-- diária (a assinatura gravada NÃO é apagada: ela atesta o conteúdo; o que venceu é a avaliação). `evidencia_requisitos` liga a evidência a
-- um requisito do catálogo, com ou sem controle ISO. Nenhum fluxo de upload, avaliação ou assinatura de `evidence` muda.
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE evidence ADD COLUMN valido_ate TEXT;

CREATE TABLE IF NOT EXISTS evidencia_requisitos (
    evidencia_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evidencia_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_evid_requisitos_requisito ON evidencia_requisitos(requisito_id);
CREATE INDEX IF NOT EXISTS idx_evid_requisitos_projeto ON evidencia_requisitos(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_validade ON evidence(valido_ate);
