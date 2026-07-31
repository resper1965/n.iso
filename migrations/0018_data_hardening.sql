-- Migration 0018: hardening de dados (seguro, sem rebuild).
-- ⚠️ Faça backup antes: `npm run db:backup` (ver backups/README.md).
--
-- 1) audit_logs imutável (append-only): triggers bloqueiam UPDATE/DELETE no DB.
--    O código só faz INSERT em audit_logs, então isto não quebra nada.
-- 2) Unicidade do hash de API key (o lookup de auth depende dela).
--    Requer que não existam key_hash duplicados (chaves são UUIDs aleatórios).

CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
