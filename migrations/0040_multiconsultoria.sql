-- Multiconsultoria (fatia 5 do sistema de propostas).
-- users e projects ganham org_id. O DEFAULT faz o backfill: tudo o que existe
-- hoje é da ness. Sem REFERENCES, como nas tabelas comerciais, porque ALTER
-- TABLE não aceita FK com default. organizations ganha o aceite do termo de
-- uso e a chave do logo no R2.
ALTER TABLE users ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE organizations ADD COLUMN termo_aceito_em DATETIME;
ALTER TABLE organizations ADD COLUMN termo_versao TEXT;
ALTER TABLE organizations ADD COLUMN logo_chave TEXT;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
