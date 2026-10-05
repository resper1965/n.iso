-- Migration 0036: organização comercial (fatia 1 do sistema de propostas).
-- Aditiva. As colunas NÃO existem em produção: esta migration roda normalmente
-- (`wrangler d1 migrations apply niso-db --remote`), depois de `npm run db:backup`.
ALTER TABLE organizations ADD COLUMN cnpj TEXT;
ALTER TABLE organizations ADD COLUMN cor_destaque TEXT DEFAULT '#00ade8';
ALTER TABLE organizations ADD COLUMN selo_niso INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN prefixo_proposta TEXT;
ALTER TABLE organizations ADD COLUMN proximo_numero INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN config_preco TEXT;
ALTER TABLE organizations ADD COLUMN textos TEXT;
ALTER TABLE organizations ADD COLUMN secoes_desligadas TEXT;
ALTER TABLE leads ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE assessments ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE proposals ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE contracts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta, proximo_numero)
VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS', 1);
