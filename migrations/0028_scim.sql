-- Migration 0028: SCIM 2.0 — provisionamento e DESPROVISIONAMENTO (item 4.2).
--
-- O item existe por causa da segunda metade. Provisionar é conveniência;
-- despovisionar é controle: quando alguém é desligado no IdP do cliente, o
-- acesso aqui precisa cair SEM ninguém lembrar de nada. Hoje depende de alguém
-- lembrar, e "alguém lembra" não é um controle que se declara numa auditoria.
--
-- Duas mudanças:
--
-- 1. `users.ativo` — a conta desativada continua existindo (a trilha referencia
--    o e-mail dela; apagar reescreveria o passado), mas não autentica.
--    DEFAULT 1: toda conta existente segue ativa, e nenhum acesso muda ao
--    aplicar esta migration.
--
-- 2. `project_scim` — o token que o IdP usa para falar com a gente. Guardado
--    como HASH, nunca em claro: quem tem acesso ao banco não deve conseguir se
--    passar pelo IdP do cliente. Mesmo tratamento de `api_keys.key_hash`.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: backup. `ALTER TABLE ADD COLUMN`
-- com DEFAULT é aditivo e não reescreve a tabela.

ALTER TABLE users ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS project_scim (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    token_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    criado_por TEXT,
    ultimo_uso_em DATETIME
);

CREATE INDEX IF NOT EXISTS idx_project_scim_token ON project_scim(token_hash);
