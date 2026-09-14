-- Migration 0029: documentos legais do n.iso versionados, com classificação, e
-- o registro de aceite de cada usuário.
--
-- A `classification` é CAMPO DO DOCUMENTO, não julgamento de quem publica: é
-- ela que decide se uma versão nova apenas avisa ('comum') ou barra o acesso
-- até o aceite ('material' — mudança de base legal ou de retenção). Deixar isso
-- a critério de quem sobe a versão faria a decisão variar por pessoa e por
-- pressa, que é exatamente o que não pode acontecer num registro de aceite.
--
-- O aceite guarda data, IP e user-agent: sem os três, o registro não prova nada
-- em disputa. É append-only na prática — não há caminho de UPDATE.
--
-- Aditiva: nenhuma tabela existente é tocada.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: backup, e que não existam tabelas
-- `legal_documents`/`legal_acceptances` de outra origem (CREATE IF NOT EXISTS
-- silenciaria uma colisão). Só cria tabelas e índices; nada existente muda.
-- Sem documento publicado, o gate do middleware não barra ninguém.

CREATE TABLE IF NOT EXISTS legal_documents (
    id TEXT PRIMARY KEY,
    -- 'terms' | 'privacy'. Texto livre de propósito: um documento novo
    -- (subprocessadores, por exemplo) não deve exigir migration.
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('comum', 'material')),
    title TEXT NOT NULL,
    url TEXT,
    -- Só documento publicado é exigível. Rascunho fica com published_at nulo e
    -- não entra na conta de pendências.
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (kind, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_kind ON legal_documents(kind, published_at);

CREATE TABLE IF NOT EXISTS legal_acceptances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    document_id TEXT NOT NULL REFERENCES legal_documents(id),
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    user_agent TEXT,
    -- Aceitar duas vezes o MESMO documento é ruído, não é fato novo.
    UNIQUE (user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(user_id);
