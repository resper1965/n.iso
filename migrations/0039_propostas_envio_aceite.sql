-- Envio, aceite e fechamento da proposta (fatia 4 do sistema de propostas).
-- propostas: só o hash do token fica no banco. contracts e projects: vínculo
-- novo com a proposta. O UNIQUE parcial de contracts.proposta_id é a última
-- defesa contra dois contratos para a mesma proposta.
ALTER TABLE propostas ADD COLUMN token_hash TEXT;
ALTER TABLE propostas ADD COLUMN link_gerado_em DATETIME;
ALTER TABLE propostas ADD COLUMN enviada_em DATETIME;
ALTER TABLE propostas ADD COLUMN enviada_para TEXT;
ALTER TABLE propostas ADD COLUMN visualizada_em DATETIME;
ALTER TABLE propostas ADD COLUMN aceite_nome TEXT;
ALTER TABLE propostas ADD COLUMN aceite_cargo TEXT;
ALTER TABLE propostas ADD COLUMN aceite_email TEXT;
ALTER TABLE propostas ADD COLUMN aceite_ip TEXT;
ALTER TABLE propostas ADD COLUMN aceite_em DATETIME;
ALTER TABLE propostas ADD COLUMN aceite_origem TEXT CHECK (aceite_origem IS NULL OR aceite_origem IN ('link', 'manual'));
ALTER TABLE propostas ADD COLUMN aceite_comprovante TEXT;
ALTER TABLE propostas ADD COLUMN recusa_motivo TEXT;
ALTER TABLE propostas ADD COLUMN ajuste_mensagem TEXT;
ALTER TABLE propostas ADD COLUMN contrato_id TEXT;
ALTER TABLE propostas ADD COLUMN projeto_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_token ON propostas(token_hash) WHERE token_hash IS NOT NULL;

ALTER TABLE contracts ADD COLUMN proposta_id TEXT;
ALTER TABLE contracts ADD COLUMN documento_hash TEXT;
ALTER TABLE contracts ADD COLUMN valor_projeto REAL;
ALTER TABLE contracts ADD COLUMN mensalidade REAL;
ALTER TABLE contracts ADD COLUMN prazo_minimo_meses INTEGER;
ALTER TABLE contracts ADD COLUMN servicos TEXT;
ALTER TABLE contracts ADD COLUMN projeto_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_proposta ON contracts(proposta_id) WHERE proposta_id IS NOT NULL;

ALTER TABLE projects ADD COLUMN proposta_id TEXT;
