-- 0057 — núcleo do n.privacy, fatia 6: terceiros (TPRM) tipificados (spec seção 5).
--
-- O terceiro é uma parte do tipo `organizacao` (fatia 1). Aditiva: 1 coluna anulável e 2 tabelas novas; nenhuma linha muda.
-- `partes.terceiro_tipo` diz que tipo de terceiro é (e o servidor deduz o método da avaliação a partir dele).
-- `avaliacoes_terceiro` guarda o HISTÓRICO de avaliações (a situação vigente/vencida/pendente é derivada de `valido_ate`).
-- `documento_partes` liga um documento a uma parte como DPA, contrato ou outro (a spec pede `documentos.tipo = 'contrato'`, mas
-- mudar esse CHECK exigiria reconstruir `documentos` e as tabelas filhas; o ganho não paga o risco).
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE partes ADD COLUMN terceiro_tipo TEXT CHECK (terceiro_tipo IS NULL OR terceiro_tipo IN ('grande_provedor', 'medio', 'pequeno', 'critico'));

CREATE TABLE IF NOT EXISTS avaliacoes_terceiro (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    metodo TEXT NOT NULL CHECK (metodo IN ('trust_center', 'questionario', 'auditoria')),
    resultado TEXT NOT NULL CHECK (resultado IN ('aprovado', 'com_ressalvas', 'reprovado')),
    valido_ate TEXT NOT NULL,
    evidencia_url TEXT,
    observacao TEXT,
    avaliado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aval_terceiro_parte ON avaliacoes_terceiro(parte_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aval_terceiro_projeto ON avaliacoes_terceiro(project_id, valido_ate);

CREATE TABLE IF NOT EXISTS documento_partes (
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL DEFAULT 'dpa' CHECK (papel IN ('dpa', 'contrato', 'outro')),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_id, parte_id, papel)
);
CREATE INDEX IF NOT EXISTS idx_doc_partes_parte ON documento_partes(parte_id);
