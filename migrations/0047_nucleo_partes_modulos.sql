-- 0047 — núcleo do n.privacy, fatia 1.1: módulos, partes, vínculos e departamentos
-- (spec 2026-10-06-nucleo-comum-nprivacy-design, seções 4.1 a 4.3).
--
-- Aditiva: 4 tabelas novas, 1 coluna nova com padrão e 1 gatilho. Nenhuma tabela existente perde dado.
-- `organizations.modulos_contratados` é o teto do que cada projeto da consultoria pode habilitar
-- (JSON; padrão '["iso"]'). `projeto_modulos` guarda o que cada projeto habilitou; todo projeto
-- existente recebe 'iso' aqui, e o gatilho dá 'iso' a todo projeto novo, qualquer que seja o caminho.
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE organizations ADD COLUMN modulos_contratados TEXT NOT NULL DEFAULT '["iso"]';

CREATE TABLE IF NOT EXISTS projeto_modulos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    habilitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    habilitado_por TEXT NOT NULL DEFAULT 'sistema',
    PRIMARY KEY (project_id, modulo)
);
INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
    SELECT id, 'iso', 'migration-0047' FROM projects;
CREATE TRIGGER IF NOT EXISTS projeto_modulo_iso_padrao AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (NEW.id, 'iso', 'sistema');
END;

CREATE TABLE IF NOT EXISTS departamentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, nome)
);

-- Pessoa ou organização do projeto. O papel é do vínculo, não da parte. Sem CPF (spec 4.2).
-- user_id liga a pessoa à conta quando existe; a API da 1.1 não o escreve (entra na conciliação, 1.3).
CREATE TABLE IF NOT EXISTS partes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'pessoa' CHECK (tipo IN ('pessoa', 'organizacao')),
    nome TEXT NOT NULL,
    email TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partes_projeto ON partes(project_id, status);

-- alvo_id não tem FK: aponta para tabelas diferentes conforme alvo_tipo. A API confere que o alvo
-- existe NO projeto antes de gravar.
CREATE TABLE IF NOT EXISTS parte_vinculos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada')),
    alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('projeto', 'item', 'departamento', 'tratamento', 'parte')),
    alvo_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parte_id, papel, alvo_tipo, alvo_id)
);
CREATE INDEX IF NOT EXISTS idx_parte_vinculos_alvo ON parte_vinculos(project_id, alvo_tipo, alvo_id);
