-- Catálogo de serviços da organização (spec do sistema de propostas, seção 3).
-- Campos de lista/estrutura são JSON validado por servicoSchema, e a proposta
-- (fatia 3) guarda CÓPIA do serviço, então editar aqui não muda proposta gerada.
CREATE TABLE IF NOT EXISTS servicos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    norma TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL CHECK (tipo IN ('projeto', 'avulso', 'recorrente')),
    forma_preco TEXT CHECK (forma_preco IS NULL OR forma_preco IN ('fixo', 'esforco')),
    valor_fixo REAL,
    mensalidade REAL,
    prazo_minimo_meses INTEGER,
    dias_por_faixa TEXT,
    fases TEXT,
    entregaveis TEXT,
    criterio_aceite TEXT NOT NULL DEFAULT '',
    incluso_mes TEXT,
    premissas TEXT,
    exclusoes TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_servicos_org ON servicos(org_id, ativo);
