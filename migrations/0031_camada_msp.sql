-- Migration 0031: camada MSP — contas, clientes e concessão de projeto.
--
-- A plataforma foi construída para UMA consultoria: `PAPEIS_NESS` trata staff e
-- ness como a mesma coisa, e `requireProjectAccess` libera qualquer projeto para
-- qualquer staff. Para vender o SaaS a outras consultorias, o isolamento precisa
-- existir entre elas — hoje não existe.
--
-- Três níveis: conta (quem tem contrato) → cliente (quem certifica, DONO DOS
-- DADOS) → projeto (um escopo). A conta é PONTEIRO para o cliente, nunca
-- container dele: é o que faz o cliente sair da consultoria trocando uma coluna
-- em vez de migrar registro.
--
-- ADITIVA e SEM efeito por si só. As tabelas nascem vazias, as colunas nascem
-- NULL, e nenhum caminho de código muda de comportamento enquanto estiverem
-- assim. O backfill é a migration 0032; a autorização só passa a usar isto
-- depois dela.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: nada além do de sempre (backup).

CREATE TABLE IF NOT EXISTS contas (
    id TEXT PRIMARY KEY,

    -- 'msp' atende clientes de terceiros e enxerga o funil comercial.
    -- 'direto' é o cliente final que assina sozinho e NÃO tem pré-venda.
    tipo TEXT NOT NULL CHECK (tipo IN ('msp', 'direto')),

    nome TEXT NOT NULL,
    plano TEXT NOT NULL DEFAULT 'trial',

    -- NULL = sem teto. Ausência de limite é ausência de restrição, nunca
    -- restrição padrão: um default apertado aqui trancaria contas no deploy
    -- seguinte. Os tetos só passam a ser lidos no Plano 2.
    max_clientes INTEGER,
    max_projetos INTEGER,
    max_usuarios INTEGER,

    -- 'Active' | 'Suspensa'. A suspensão é lida no Plano 2.
    status TEXT NOT NULL DEFAULT 'Active',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,

    -- Quem paga e gerencia este cliente HOJE. É a única coluna que muda quando
    -- o cliente troca de consultoria — por isso os dados não moram aqui embaixo.
    conta_id TEXT NOT NULL REFERENCES contas(id),

    nome TEXT NOT NULL,
    cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A consulta de autorização sobe projeto → cliente → conta a cada requisição de
-- rota escopada. Sem estes índices ela vira varredura.
CREATE INDEX IF NOT EXISTS idx_clientes_conta ON clientes(conta_id);

CREATE TABLE IF NOT EXISTS acesso_projeto (
    user_id TEXT NOT NULL REFERENCES users(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_id)
);

ALTER TABLE projects ADD COLUMN cliente_id TEXT REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_projects_cliente ON projects(cliente_id);

-- Staff de MSP usa `conta_id`; usuário de cliente usa `cliente_id`. Uma pessoa
-- preenche exatamente uma das duas, e `platform_admin` não preenche nenhuma.
ALTER TABLE users ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE users ADD COLUMN cliente_id TEXT REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_users_conta ON users(conta_id);
CREATE INDEX IF NOT EXISTS idx_users_cliente ON users(cliente_id);

-- O funil comercial não tinha dono: a proteção era só por papel. Com dois MSPs
-- na base, isso vaza pipeline entre concorrentes.
ALTER TABLE leads ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE assessments ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE proposals ADD COLUMN conta_id TEXT REFERENCES contas(id);
CREATE INDEX IF NOT EXISTS idx_leads_conta ON leads(conta_id);
CREATE INDEX IF NOT EXISTS idx_assessments_conta ON assessments(conta_id);
CREATE INDEX IF NOT EXISTS idx_proposals_conta ON proposals(conta_id);
