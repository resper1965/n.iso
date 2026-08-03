-- Migration 0020: contador atômico de tentativas do segundo fator. ADITIVA.
--
-- Por que não entrou na 0019: a 0019 JÁ FOI APLICADA em produção (confirmado por
-- `PRAGMA table_info(users)`, 12 colunas). Migration aplicada é imutável — editar
-- uma faz a `d1_migrations` afirmar que o banco tem algo que ele não tem, e é
-- exatamente a divergência que este repositório passou dias reconciliando.
--
-- ANTES DE APLICAR:
--   1. `npm run db:backup` (runbook em backups/README.md)
--   2. PRAGMA table_info(users);  -- confirme que as colunas abaixo NÃO existem
--
-- O limite de tentativas do MFA vivia no KV (`helpers.rateLimit`), que lê e
-- depois grava — duas operações, num store eventualmente consistente. Sob
-- adivinhação concorrente, N requisições leem o mesmo contador e gravam o mesmo
-- incremento: o limite de 10 vira 10 POR RAJADA. Para um código de 6 dígitos com
-- 3 janelas válidas por vez, essa diferença decide se a força bruta funciona.
--
-- Aqui o incremento é um único UPDATE com CASE — o banco serializa e nenhum
-- incremento se perde.

-- Tentativas acumuladas no balde corrente.
ALTER TABLE users ADD COLUMN totp_fail_count INTEGER DEFAULT 0;
-- Balde de 5 minutos a que o contador pertence; ao virar o balde, ele reinicia.
ALTER TABLE users ADD COLUMN totp_fail_window INTEGER;
