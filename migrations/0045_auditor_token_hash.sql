-- 0045 — token do auditor externo guardado só em hash, e revogável (fatia de jornada, P5).
--
-- O link do auditor dá leitura de toda a evidência do projeto. Até aqui o token ficava em claro em
-- auditor_tokens.token e era copiado em claro para auditor_notes.auditor_token, que a tela do
-- projeto e o export de portabilidade levam. Agora o banco guarda só o SHA-256 (mesma disciplina de
-- api_keys.key_hash e pedido_destinatarios.token_hash) e as notas guardam o id do token.
--
-- Tokens existentes NÃO migram: SQLite não calcula SHA-256. Em produção a tabela tinha 0 linhas em
-- 2026-10-07; quem tiver link anterior pede outro à consultoria.
UPDATE auditor_notes
   SET auditor_token = COALESCE((SELECT t.id FROM auditor_tokens t WHERE t.token = auditor_notes.auditor_token), auditor_token);

DELETE FROM auditor_tokens;

-- O índice idx_auditor_tokens acompanha a coluna renomeada.
ALTER TABLE auditor_tokens RENAME COLUMN token TO token_hash;
ALTER TABLE auditor_tokens ADD COLUMN revoked_at DATETIME;
ALTER TABLE auditor_tokens ADD COLUMN revoked_by TEXT;
