-- Migration 0024: contador de rate limit ATÔMICO em D1 (janela fixa).
--
-- O helper rateLimit por KV é get-then-put (não atômico) e renova o TTL a cada
-- request (janela deslizante). Para o teto de login POR CONTA — um controle de
-- segurança contra brute force distribuído — isso é fraco: sob concorrência o
-- teto vaza, e a janela nunca fecha. Esta tabela suporta rateLimitD1: upsert de
-- statement único (atômico no D1) com reset por janela fixa.
--
-- Keyspace limitado (uma linha por conta-alvo), então não há TTL: a linha é
-- reaproveitada/resetada no próximo acesso da mesma chave. Aditiva.

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
);
