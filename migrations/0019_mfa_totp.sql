-- Migration 0019: segundo fator (TOTP) por usuário. ADITIVA, sem rebuild.
--
-- ANTES DE APLICAR EM PRODUÇÃO:
--   1. `npm run db:backup` (runbook em backups/README.md)
--   2. Confira que as colunas ainda não existem:
--      PRAGMA table_info(users);
--
-- Todas as colunas nascem com MFA desligado, então nenhum usuário existente é
-- trancado para fora. Habilitar é ação do próprio usuário.
--
-- `totp_secret` guarda o segredo em base32. Não é hash: TOTP exige o segredo
-- em claro para recalcular o código a cada janela — é a mesma propriedade que
-- qualquer implementação de TOTP tem. Quem tem acesso de leitura ao D1 já tem
-- acesso ao dado de conformidade; o segundo fator protege a sessão, não o banco.

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
-- Códigos de recuperação, armazenados como SHA-256 separados por vírgula.
-- Estes SIM são hash: só precisam ser comparados, nunca reexibidos.
ALTER TABLE users ADD COLUMN totp_recovery_hashes TEXT;
-- Última janela usada, para impedir reuso do mesmo código dentro dos 30s.
ALTER TABLE users ADD COLUMN totp_last_window INTEGER;
