-- Ciência em massa por link com código (acesso de stakeholders, fatia 3).
--
-- 1. `pedidos.tipo` passa a aceitar `politica` (ref_id = compliance_controls.id). O CHECK só muda
--    por rebuild da tabela no SQLite.
-- 2. `pedido_destinatarios` ganha `aberto_em` (painel: "não abriu") e `token_expira_em` (o link
--    pessoal vence; reenviar emite outro).
-- 3. Prova imutável: decisão gravada (status <> 'pendente') não aceita UPDATE. Correção = novo pedido.
--
-- Rebuild SEM perder linha: `DROP TABLE pedidos` com FK ativa faz DELETE implícito e o
-- ON DELETE CASCADE apagaria os destinatários. Por isso as duas tabelas novas nascem ligadas
-- entre si (`pedido_destinatarios_new` -> `pedidos_new`), a filha antiga cai primeiro, e o
-- RENAME (SQLite >= 3.26) reescreve a FK da filha para `pedidos`.
-- As listas de colunas abaixo são as da 0041: se produção divergir dela, pare e confira antes.

CREATE TABLE pedidos_new (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('dpia', 'politica')),
    ref_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    papel_exigido TEXT NOT NULL CHECK (papel_exigido IN ('ciso', 'ceo', 'ciente')),
    conteudo_json TEXT NOT NULL,
    hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'aprovado', 'recusado', 'substituido', 'cancelado')),
    substituido_por TEXT,
    criado_por TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO pedidos_new (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em)
    SELECT id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em FROM pedidos;

CREATE TABLE pedido_destinatarios_new (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES pedidos_new(id) ON DELETE CASCADE,
    nome TEXT,
    email TEXT NOT NULL,
    user_id TEXT,
    token_hash TEXT,
    token_expira_em DATETIME,
    aberto_em DATETIME,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ciente', 'aprovado', 'recusado')),
    decidido_em DATETIME,
    canal TEXT CHECK (canal IS NULL OR canal IN ('conta', 'link')),
    ip TEXT,
    user_agent TEXT,
    hash_lido TEXT,
    mfa_usado INTEGER,
    motivo TEXT
);
INSERT INTO pedido_destinatarios_new (id, pedido_id, nome, email, user_id, token_hash, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo)
    SELECT id, pedido_id, nome, email, user_id, token_hash, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo FROM pedido_destinatarios;

DROP TABLE pedido_destinatarios;
DROP TABLE pedidos;
ALTER TABLE pedidos_new RENAME TO pedidos;
ALTER TABLE pedido_destinatarios_new RENAME TO pedido_destinatarios;

CREATE INDEX IF NOT EXISTS idx_pedidos_projeto ON pedidos(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_documento ON pedidos(tipo, ref_id, status);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_pedido ON pedido_destinatarios(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_email ON pedido_destinatarios(email);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_user ON pedido_destinatarios(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_dest_token ON pedido_destinatarios(token_hash) WHERE token_hash IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS pedido_dest_prova_imutavel
BEFORE UPDATE ON pedido_destinatarios
WHEN OLD.status <> 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido decidido e imutavel');
END;
