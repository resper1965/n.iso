-- Migration 0027: SSO por OIDC, por tenant (item 4.1 do enterprise-grade-plan.md).
--
-- Hoje só existe login por senha. Cliente corporativo com IdP próprio (Entra ID,
-- Okta, Google Workspace) precisa que o desligamento de alguém no IdP tire o
-- acesso aqui — e isso é impossível quando a senha vive neste banco.
--
-- ADITIVA e SEM efeito por si só: tabela vazia significa "nenhum tenant usa
-- SSO", e o login por senha segue sendo o único caminho. Cada linha é ligada
-- explicitamente (`ativo = 1`) depois de configurada e testada.
--
-- `client_secret` é gravado CIFRADO (src/secret-crypto.ts, AES-256-GCM com
-- TOKEN_ENC_KEY). Sem o secret configurado no Worker, a rota de gravação recusa
-- — segredo de IdP em texto claro no banco seria pior que não ter SSO.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: backup, como sempre. Nenhum
-- caminho de código muda de comportamento enquanto a tabela estiver vazia.

CREATE TABLE IF NOT EXISTS project_sso (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),

    -- URL do emissor, exatamente como o IdP a publica. O documento de descoberta
    -- é buscado em <issuer>/.well-known/openid-configuration e o campo `issuer`
    -- de lá tem de bater com este — é o que impede um documento de descoberta
    -- forjado apontar para outro emissor.
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,

    -- Domínios de e-mail que entram por este IdP, separados por vírgula. É por
    -- aqui que a tela de login descobre para onde mandar quem digitou o e-mail.
    dominios TEXT NOT NULL,

    -- Papel dado a quem entra pela primeira vez. Restrito a papéis de CLIENTE:
    -- a rota de gravação recusa papel de staff, porque provisionamento
    -- automático nunca deve poder criar acesso de plataforma.
    papel_padrao TEXT NOT NULL DEFAULT 'org_user',

    ativo INTEGER NOT NULL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_por TEXT
);

-- A busca do login é por domínio de e-mail, não por projeto.
CREATE INDEX IF NOT EXISTS idx_project_sso_ativo ON project_sso(ativo);
