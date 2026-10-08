-- 0046 — avisos de prazo (sino + e-mail), spec 2026-10-07-avisos-de-prazo-design.
--
-- Registro de idempotência da rotina diária das 08:00 (src/services/avisos-prazo.ts): uma linha por
-- (fonte, item, marco, pessoa, vencimento). A notificação do sino só nasce quando a linha entra, e o
-- e-mail-resumo marca email_enviado_em depois do envio confirmado.
--
-- A UNIQUE inclui vence_em: prazo adiado, certificado renovado e a revisão anual de política voltam a
-- avisar. Tabela nova, só CREATE ... IF NOT EXISTS; nenhuma tabela existente muda.
CREATE TABLE IF NOT EXISTS avisos_prazo (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fonte TEXT NOT NULL,
    item_id TEXT NOT NULL,
    marco TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vence_em TEXT NOT NULL,
    titulo TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_enviado_em DATETIME,
    UNIQUE(fonte, item_id, marco, user_id, vence_em)
);
CREATE INDEX IF NOT EXISTS idx_avisos_prazo_email ON avisos_prazo(email_enviado_em, user_id);
