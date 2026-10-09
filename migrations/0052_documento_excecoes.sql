-- Exceções a documentos (fatia 3.5 do núcleo do n.privacy). Só CREATE ... IF NOT EXISTS, sem carga.
--
-- Uma exceção diz a quem ou ao quê ela vale (`escopo`), por quê (`motivo`) e até quando (`vence_em`, AAAA-MM-DD).
-- A aprovação NÃO tem coluna aqui: é um pedido `tipo = 'excecao'` (a 0051 já aceita) com `ref_id` = esta linha, e a
-- prova é a linha do destinatário. A exceção está aprovada se existe pedido aprovado com o hash do conteúdo atual
-- (escopo, motivo, vence_em): mudar qualquer um invalida a aprovação sozinho. `status` guarda só o que é ato:
-- `ativa` ou `revogada`. Vencida, aprovada e aguardando são derivadas.
CREATE TABLE IF NOT EXISTS documento_excecoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    escopo TEXT NOT NULL,
    motivo TEXT NOT NULL,
    vence_em TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'revogada')),
    criado_por TEXT,
    revogada_em DATETIME,
    revogada_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_excecoes_documento ON documento_excecoes(documento_id, status);
CREATE INDEX IF NOT EXISTS idx_excecoes_projeto ON documento_excecoes(project_id, status, vence_em);
