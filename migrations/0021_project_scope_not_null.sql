-- Migration 0021: `project_id` NOT NULL nas tabelas que CONCEDEM acesso.
--
-- ⚠️ Faça backup antes: `npm run db:backup` (ver backups/README.md).
--
-- ── Por quê ─────────────────────────────────────────────────────────────────
-- O PR #41 fechou em RUNTIME (`src/middleware/auth.ts`) o caso de uma chave de
-- API sem `project_id`: ela virava identidade `client` sem escopo, e o filtro do
-- portfólio (`src/routes/platform.ts`) só restringe quando `client_project_id` é
-- truthy — ou seja, a chave órfã enxergava projeto de TODOS os tenants. A guarda
-- continua lá e continua sendo a última linha; esta migration tira o caso do
-- reino do possível, no schema, onde ele nasceu:
--
--     project_id TEXT REFERENCES projects(id)   -- sem NOT NULL
--
-- Há um segundo caminho, independente do middleware: `requireResourceAccess`
-- (`src/helpers.ts`) autoriza comparando `row.project_id !== user.client_project_id`.
-- Em JS, `null !== null` é FALSO — logo, uma linha órfã é acessível por qualquer
-- usuário não-staff cujo `client_project_id` também seja nulo (e ele pode existir:
-- `POST /users` grava `targetProject || null`). `api_keys` e `webhooks` estão na
-- ALLOWED_TABLES dessa função.
--
-- ── Por que SÓ estas três tabelas ───────────────────────────────────────────
-- Critério: (1) a linha concede acesso — é credencial, não dado de negócio; e
-- (2) o conjunto de colunas NUNCA mudou em nenhuma das 20 migrations anteriores
-- (`api_keys` e `webhooks` nasceram na 0004 e estão idênticas no `schema.sql`;
-- `auditor_tokens` só existe no `schema.sql`). O (2) importa porque rebuild de
-- tabela copia uma lista FIXA de colunas: em tabela com deriva, coluna extra
-- some silenciosamente no DROP — foi o alerta escrito no cabeçalho da 0014.
-- Tabelas de negócio (evidence, risks, assets, ropa_records, ...) ficaram de
-- fora de propósito: já sofreram ALTER em migrations, produção diverge do
-- repositório (ver migrations/README.md) e o ganho não paga o risco de rebuild.
-- `audit_logs.project_id` PRECISA seguir nullable: das 97 chamadas de `logAudit`,
-- a maioria é ação de plataforma (login, user.created) que não pertence a projeto.
--
-- ── PRÉ-VOO OBRIGATÓRIO (rode ANTES, contra produção) ───────────────────────
-- Migration que aborta por dado pré-existente é pior que o problema. Rode:
--
--   npx wrangler d1 execute niso-db --remote --command "
--     SELECT 'api_keys' AS tabela, count(*) AS orfas FROM api_keys WHERE project_id IS NULL
--     UNION ALL SELECT 'webhooks',       count(*) FROM webhooks       WHERE project_id IS NULL
--     UNION ALL SELECT 'auditor_tokens', count(*) FROM auditor_tokens WHERE project_id IS NULL;"
--
-- Esperado: `orfas = 0` nas três linhas. Todo caminho de escrita tira o
-- `project_id` do path e nunca grava nulo (`integrations.ts:153,221`,
-- `projects.ts:655`), então zero é o resultado provável — mas provável não é
-- verificado.
--
-- Se QUALQUER contagem for > 0: NÃO aplique ainda. Uma linha órfã aqui é
-- credencial sem dono, e o tratamento é decisão de operador, não de migration —
-- por isso o INSERT..SELECT abaixo NÃO filtra `IS NOT NULL`: descartar em
-- silêncio esconderia um evento de segurança. Registre o caso, revogue e só
-- então aplique:
--
--   DELETE FROM api_keys       WHERE project_id IS NULL;
--   DELETE FROM webhooks       WHERE project_id IS NULL;
--   DELETE FROM auditor_tokens WHERE project_id IS NULL;
--
-- ── Como ────────────────────────────────────────────────────────────────────
-- SQLite/D1 não tem `ALTER TABLE ... ALTER COLUMN`: adicionar NOT NULL a coluna
-- existente exige o rebuild de 12 passos (criar nova, copiar, dropar, renomear),
-- recriando os índices — que morrem junto com a tabela no DROP. Nenhuma das três
-- tem FK de entrada (`grep "REFERENCES api_keys|webhooks|auditor_tokens"` = 0),
-- então DROP/RENAME não deixa referência pendurada.
--
-- Cada bloco começa por `DROP TABLE IF EXISTS <t>_new` para que uma tentativa
-- interrompida (ex.: abortada pelo pré-voo não feito) possa ser repetida depois
-- de corrigir o dado, sem resíduo.
--
-- Nota Squawk (DROP/RENAME/índice não-concorrente): inerente a endurecer NOT NULL
-- no SQLite. Aceitável para D1 (SQLite de tenant único, tabelas pequenas, janela
-- de migração — não sob carga).

-- ── 1) api_keys ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS api_keys_new;

CREATE TABLE api_keys_new (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read',
    last_used_at DATETIME,
    expires_at DATETIME,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO api_keys_new (
    id, project_id, key_hash, name, permissions, last_used_at, expires_at, status, created_at
)
SELECT
    id, project_id, key_hash, name, permissions, last_used_at, expires_at, status, created_at
FROM api_keys;

DROP TABLE api_keys;
ALTER TABLE api_keys_new RENAME TO api_keys;

CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- ── 2) webhooks ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS webhooks_new;

CREATE TABLE webhooks_new (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    status TEXT DEFAULT 'Active',
    last_triggered_at DATETIME,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO webhooks_new (
    id, project_id, url, events, secret, status, last_triggered_at, failure_count, created_at
)
SELECT
    id, project_id, url, events, secret, status, last_triggered_at, failure_count, created_at
FROM webhooks;

DROP TABLE webhooks;
ALTER TABLE webhooks_new RENAME TO webhooks;

CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);

-- ── 3) auditor_tokens ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS auditor_tokens_new;

CREATE TABLE auditor_tokens_new (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO auditor_tokens_new (
    id, project_id, token, expires_at, created_by, created_at
)
SELECT
    id, project_id, token, expires_at, created_by, created_at
FROM auditor_tokens;

DROP TABLE auditor_tokens;
ALTER TABLE auditor_tokens_new RENAME TO auditor_tokens;

CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token);
