-- Ciência por versão de documento (fatia 3.3 do núcleo do n.privacy).
--
-- 1. `pedidos.tipo` passa a aceitar `documento` (ref_id = documentos.id; o conteúdo congelado é a versão
--    vigente: titulo, texto e numero).
-- 1b. `pedidos.tipo` também aceita `excecao` (exceção a documento, fatia 3.5): entra AGORA porque esta tabela é prova e
--    reconstruí-la uma segunda vez, só por um valor de CHECK, seria risco sem ganho. Nenhum código grava `excecao` ainda.
-- 2. `pedido_destinatarios.canal` passa a aceitar `portal`: a ciência de quem entra pelo portal público
--    /politicas com código por e-mail, gravada já decidida.
--
-- Os dois CHECKs só mudam por rebuild da tabela no SQLite. É PROVA: o rebuild não pode perder linha nem
-- trigger. `DROP TABLE pedidos` com FK ativa faz DELETE implícito e o ON DELETE CASCADE apagaria os
-- destinatários, então as duas tabelas novas nascem ligadas entre si (`pedido_destinatarios_new` ->
-- `pedidos_new`), a filha antiga cai primeiro e o RENAME (SQLite >= 3.26) reescreve a FK da filha para
-- `pedidos`. O DROP também leva os TRIGGERS junto: os dois (0042 e 0043) são recriados no fim.
--
-- Mesmo molde da 0042. As listas de colunas abaixo são as do schema.sql de hoje: se a produção divergir
-- (PRAGMA table_info de `pedidos` e de `pedido_destinatarios`), pare e confira antes de aplicar.

CREATE TABLE pedidos_new (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('dpia', 'politica', 'documento', 'excecao')),
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
    canal TEXT CHECK (canal IS NULL OR canal IN ('conta', 'link', 'portal')),
    ip TEXT,
    user_agent TEXT,
    hash_lido TEXT,
    mfa_usado INTEGER,
    motivo TEXT
);
INSERT INTO pedido_destinatarios_new (id, pedido_id, nome, email, user_id, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo)
    SELECT id, pedido_id, nome, email, user_id, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo FROM pedido_destinatarios;

DROP TABLE pedido_destinatarios;
DROP TABLE pedidos;
ALTER TABLE pedidos_new RENAME TO pedidos;
ALTER TABLE pedido_destinatarios_new RENAME TO pedido_destinatarios;

CREATE INDEX IF NOT EXISTS idx_pedidos_projeto ON pedidos(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_documento ON pedidos(tipo, ref_id, status);
-- Um pedido "em pé" aberto por documento para a ciência do portal público (criado_por = 'sistema:portal'):
-- dois acessos simultâneos não criam dois contêineres. A substituição marca o antigo ANTES de criar o novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_portal_aberto ON pedidos(tipo, ref_id) WHERE criado_por = 'sistema:portal' AND status = 'aberto';
CREATE INDEX IF NOT EXISTS idx_pedido_dest_pedido ON pedido_destinatarios(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_email ON pedido_destinatarios(email);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_user ON pedido_destinatarios(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_dest_token ON pedido_destinatarios(token_hash) WHERE token_hash IS NOT NULL;

-- Prova imutável do pedido (0043): conteúdo, hash e documento nunca mudam; fechado não muda de status
-- nem de substituto. `org_id` livre (transferência de projeto). DELETE livre (cascata do projeto).
CREATE TRIGGER IF NOT EXISTS pedido_prova_imutavel
BEFORE UPDATE ON pedidos
WHEN NEW.hash IS NOT OLD.hash
  OR NEW.conteudo_json IS NOT OLD.conteudo_json
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.ref_id IS NOT OLD.ref_id
  OR NEW.papel_exigido IS NOT OLD.papel_exigido
  OR (OLD.status <> 'aberto' AND (NEW.status IS NOT OLD.status OR NEW.substituido_por IS NOT OLD.substituido_por))
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido e imutavel');
END;

-- Prova imutável do destinatário (0042): decisão gravada não muda; correção é um pedido novo.
CREATE TRIGGER IF NOT EXISTS pedido_dest_prova_imutavel
BEFORE UPDATE ON pedido_destinatarios
WHEN OLD.status <> 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido decidido e imutavel');
END;
