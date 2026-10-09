-- 0058 — núcleo do n.privacy, fatia 7: pedido do titular, incidente e consentimento, só registro interno (spec seção 5).
--
-- Aditiva, SEM carga: 4 tabelas novas. `parametros_legais` NÃO traz nenhum valor de prazo: o prazo legal é parâmetro editável
-- (fonte e revisão obrigatórias), cadastrado pelo administrador da plataforma com o material revisado pelo jurídico; sem ele o prazo
-- do pedido/incidente fica nulo ("não calculado"). O prazo é CONGELADO no registro na criação (`prazo_em`, `prazo_anpd_em`,
-- `prazo_titular_em`): mudar o parâmetro depois não reescreve um pedido já recebido.
-- Encerrar incidente exige risco avaliado, e risco `relevante` exige a comunicação à ANPD registrada (CHECK, vale também para SQL direto).
CREATE TABLE IF NOT EXISTS parametros_legais (
    chave TEXT PRIMARY KEY,
    valor INTEGER NOT NULL CHECK (valor > 0),
    unidade TEXT NOT NULL CHECK (unidade IN ('horas', 'dias_corridos', 'dias_uteis')),
    fonte TEXT NOT NULL,
    revisado_em TEXT NOT NULL,
    revisado_por TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS titular_pedidos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    protocolo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro')),
    canal TEXT NOT NULL DEFAULT 'outro' CHECK (canal IN ('email', 'telefone', 'formulario', 'presencial', 'outro')),
    titular_nome TEXT,
    titular_contato TEXT,
    descricao TEXT,
    recebido_em TEXT NOT NULL,
    prazo_em TEXT,
    status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'em_andamento', 'respondido', 'negado', 'arquivado')),
    respondido_em TEXT,
    resposta_texto TEXT,
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, protocolo),
    CHECK (status NOT IN ('respondido', 'negado') OR respondido_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_titular_pedidos_projeto ON titular_pedidos(project_id, status, prazo_em);

CREATE TABLE IF NOT EXISTS incidentes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    protocolo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    ocorrido_em TEXT,
    ciencia_em TEXT NOT NULL,
    risco_titular TEXT CHECK (risco_titular IS NULL OR risco_titular IN ('sem_risco', 'baixo', 'relevante')),
    avaliacao_texto TEXT,
    comunicacao_anpd_em TEXT,
    comunicacao_titular_em TEXT,
    prazo_anpd_em TEXT,
    prazo_titular_em TEXT,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'avaliado', 'comunicado', 'encerrado')),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, protocolo),
    CHECK (status <> 'encerrado' OR risco_titular IS NOT NULL),
    CHECK (status <> 'encerrado' OR risco_titular <> 'relevante' OR comunicacao_anpd_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_incidentes_projeto ON incidentes(project_id, status);

CREATE TABLE IF NOT EXISTS consentimentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    titular_ref TEXT NOT NULL,
    finalidade TEXT NOT NULL,
    versao_aviso TEXT NOT NULL,
    obtido_em TEXT NOT NULL,
    canal TEXT,
    revogado_em TEXT,
    revogado_por TEXT,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consentimentos_ropa ON consentimentos(ropa_id);
CREATE INDEX IF NOT EXISTS idx_consentimentos_projeto ON consentimentos(project_id, revogado_em);
