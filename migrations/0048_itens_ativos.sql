-- 0048 — núcleo do n.privacy, fatia 1.2: os ativos viram itens (spec 2026-10-06, seção 4.4).
--
-- `assets` é RENOMEADA para `itens`, não copiada: os ids e as linhas ficam onde estão, e o SQLite reescreve
-- sozinho a FK de `risks.asset_id` (que em banco novo aponta para `assets`). As colunas de segurança vão
-- para `item_seguranca` (1:1, mesmo id); as que sobram no núcleo ganham o nome em português e as antigas
-- são soltas. `Removido` vira 'removido'; qualquer outro valor (inclusive NULL) vira 'ativo'.
-- Em produção (2026-10-09): 27 ativos, 3 projetos, todos 'Active', 20 riscos ligados, 0 órfãos.
--
-- RENAME COLUMN, ADD COLUMN e DROP COLUMN não são idempotentes: aplicar duas vezes falha.
ALTER TABLE assets RENAME TO itens;

CREATE TABLE IF NOT EXISTS item_seguranca (
    item_id TEXT PRIMARY KEY REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT,
    subtipo TEXT,
    classificacao TEXT DEFAULT 'Confidential',
    criticidade TEXT DEFAULT 'Medium',
    localizacao TEXT,
    nota_c INTEGER DEFAULT 3,
    nota_i INTEGER DEFAULT 3,
    nota_d INTEGER DEFAULT 3
);
INSERT INTO item_seguranca (item_id, project_id, categoria, subtipo, classificacao, criticidade, localizacao, nota_c, nota_i, nota_d)
    SELECT id, project_id, category, type, classification, criticality, location, confidentiality_rating, integrity_rating, availability_rating FROM itens;

ALTER TABLE itens RENAME COLUMN name TO nome;
ALTER TABLE itens RENAME COLUMN description TO descricao;
ALTER TABLE itens RENAME COLUMN owner TO responsavel_texto;
ALTER TABLE itens RENAME COLUMN status TO status_legado;
ALTER TABLE itens ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido'));
UPDATE itens SET status = CASE WHEN status_legado = 'Removido' THEN 'removido' ELSE 'ativo' END;
ALTER TABLE itens ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ativo' CHECK (tipo IN ('sistema', 'ativo', 'base', 'processo'));
ALTER TABLE itens ADD COLUMN departamento_id TEXT REFERENCES departamentos(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_assets_project;
ALTER TABLE itens DROP COLUMN status_legado;
ALTER TABLE itens DROP COLUMN type;
ALTER TABLE itens DROP COLUMN category;
ALTER TABLE itens DROP COLUMN classification;
ALTER TABLE itens DROP COLUMN criticality;
ALTER TABLE itens DROP COLUMN location;
ALTER TABLE itens DROP COLUMN confidentiality_rating;
ALTER TABLE itens DROP COLUMN integrity_rating;
ALTER TABLE itens DROP COLUMN availability_rating;
CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(project_id, tipo, status);
