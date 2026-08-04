# Migrations — runbook

Não aplique nada antes de terminar a FASE 1. Este documento é sequencial.

Companheiro de `backups/README.md` (backup e restauração). Este trata do estado
das migrations em produção, que hoje diverge do repositório.

## O problema

`npx wrangler d1 migrations list niso-db --remote` reporta **17 migrations pendentes,
incluindo 0013–0018**. Dois resumos anteriores afirmaram que elas tinham sido
aplicadas. Não foram — ou a tabela de controle `d1_migrations` não reflete o banco.

Duas evidências de que a lista de pendentes **não é confiável**:

1. Ela contém 4 arquivos que **não existem neste repositório, em nenhum branch**
   (`git log --all` = 0 ocorrências):
   - `0012_evidence_controls_link.sql`
   - `0012_stakeholder_requirement_type.sql`
   - `0013_add_performance_indexes.sql`
   - `0013_translate_controls_ptbr.sql`

   `wrangler` só lista arquivos que existem no `migrations/` local. Logo: **a sua
   máquina tem arquivos de migration que não estão no git.** Ninguém revisou esses
   arquivos e eles não passaram por PR.

2. Ela **omite** arquivos que existem no repositório (`0002_add_users.sql`,
   `0003_sprint4_modules.sql` … `0006_security_multi_tenancy.sql`), ou seja, esses
   constam como aplicados.

Hipótese mais provável: o banco de produção foi criado direto de `schema.sql`, e a
`d1_migrations` foi populada parcialmente. Nesse caso os objetos das 0013–0018 **já
existem** e um `migrations apply` cego falha no primeiro `ALTER TABLE ADD COLUMN`
(SQLite não tem `ADD COLUMN IF NOT EXISTS`).

## Por que isso é urgente, e não cosmético

`src/routes/auth.ts:54` faz `SELECT ... totp_enabled FROM users`. Essa coluna não
existe em produção (seu `PRAGMA table_info(users)` mostrou 8 colunas). O PR #31 está
**deliberadamente sem merge** por causa disso: `deploy.yml` dispara em `push: main`,
então mergear antes de aplicar a 0019 derruba o login de todos os usuários com
`no such column: totp_enabled`.

Ordem obrigatória: **migration primeiro, merge depois.**

---

## FASE 0 — Backup, verificado

```powershell
npm run db:backup
```

Depois confirme que o arquivo existe e não está vazio:

```powershell
Get-ChildItem backups\ | Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, Length
```

Se o arquivo tiver 0 bytes ou o comando falhar, **pare aqui**. Backup não verificado
não é backup.

## FASE 1 — Sondas somente-leitura

Rode **todas** e cole a saída. Não interprete, não decida ainda.

```powershell
npx wrangler d1 execute niso-db --remote --command "SELECT * FROM d1_migrations ORDER BY id;"
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(users);"
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(assets);"
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(dpia_assessments);"
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(audit_logs);"
npx wrangler d1 execute niso-db --remote --command "SELECT name, type FROM sqlite_master WHERE name IN ('project_knowledge','scope_changes','audit_logs_no_update','audit_logs_no_delete','idx_api_keys_key_hash');"
npx wrangler d1 execute niso-db --remote --command "SELECT key_hash, count(*) AS n FROM api_keys GROUP BY key_hash HAVING n > 1;"
```

E na sua máquina, para explicar os 4 arquivos fantasma:

```powershell
Get-ChildItem migrations\ | Select-Object Name
git status --porcelain migrations/
git log --oneline -1
```

## FASE 2 — Arquivos de migration fora do git

Se `git status` mostrar os 4 arquivos como *untracked*, eles são locais seus. Duas
saídas, escolha **uma**:

- **Se são lixo** (experimento antigo): mova para fora do `migrations/`. Não delete
  antes de guardar cópia — pode conter DDL que alguém aplicou à mão em produção, e
  aí é a única pista do que foi feito.
- **Se contêm mudança real que já está em produção**: cole o conteúdo deles aqui
  antes de mover. Precisamos saber o que o banco tem que o repositório não tem.

Enquanto eles estiverem em `migrations/`, **nenhum** `migrations apply` é seguro:
o comando aplica tudo que está pendente, não só o que você quer.

## FASE 3 — Reconciliar `d1_migrations` (não re-executar DDL)

Só depois de eu ver a saída da FASE 1. A regra por migration:

| Migration | Idempotente? | Se o objeto já existir |
|---|---|---|
| 0013 drift reconcile | **Não** (`ALTER ADD COLUMN` puro) | registrar como aplicada, **não** rodar |
| 0014 dpia nullable | **Não** (`DROP TABLE` + rebuild, PII) | registrar, **não** rodar — ver aviso abaixo |
| 0015 project_knowledge | Sim (`IF NOT EXISTS`) | rodar é inofensivo |
| 0016 scope_changes + índices | Sim | rodar é inofensivo |
| 0017 audit_logs.project_id | **Não** (`ALTER ADD COLUMN`) | registrar se a coluna existir |
| 0018 hardening | Sim (`IF NOT EXISTS`) | rodar é inofensivo |
| 0019 mfa totp | **Não** | **rodar** — confirmado ausente |

Registrar-sem-executar é um INSERT na tabela de controle:

```sql
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0013_schema_drift_reconcile.sql');
```

⚠️ **0014 é a mais perigosa e não deve ser rodada sem conferência manual.** Ela faz
`DROP TABLE dpia_assessments` depois de copiar uma lista **fixa** de 22 colunas.
Qualquer coluna extra na tabela de produção é perdida silenciosamente — e a tabela
tem PII. A lista exata exigida está no cabeçalho de `migrations/0014_*.sql`. Se o
`PRAGMA table_info(dpia_assessments)` da FASE 1 mostrar uma coluna a mais, **aborte
a 0014** e me diga qual é.

## FASE 4 — Aplicar

Somente as migrations que a FASE 3 concluir que faltam de verdade. Uma por vez,
conferindo o resultado entre elas.

**A 0019 já foi aplicada** — o `PRAGMA table_info(users)` mostrou as 4 colunas
`totp_*`. Não reaplique: `ALTER TABLE ADD COLUMN` não é idempotente.

**A 0020 é nova** e nasceu da revisão de segurança do PR #31. Ela adiciona o
contador atômico de tentativas do segundo fator, sem o qual o limite de 10
tentativas não é respeitado sob adivinhação concorrente:

```powershell
npx wrangler d1 execute niso-db --remote --file migrations/0020_mfa_rate_limit.sql
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(users);"
```

Espere ver `totp_fail_count` e `totp_fail_window` na saída. Registre depois:

```sql
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0020_mfa_rate_limit.sql');
```

**A 0021 é nova** e endurece `project_id` para `NOT NULL` em `api_keys`,
`webhooks` e `auditor_tokens` — as três tabelas cuja linha órfã é credencial sem
dono (contexto no PR #41 e no cabeçalho do arquivo). É rebuild de tabela
(`DROP` + `RENAME`), então tem pré-voo **obrigatório**: rode a contagem abaixo e
só aplique com `orfas = 0` nas três linhas.

```powershell
npx wrangler d1 execute niso-db --remote --command "
  SELECT 'api_keys' AS tabela, count(*) AS orfas FROM api_keys WHERE project_id IS NULL
  UNION ALL SELECT 'webhooks',       count(*) FROM webhooks       WHERE project_id IS NULL
  UNION ALL SELECT 'auditor_tokens', count(*) FROM auditor_tokens WHERE project_id IS NULL;"

npx wrangler d1 execute niso-db --remote --file migrations/0021_project_scope_not_null.sql
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(api_keys);"
```

Espere ver `notnull = 1` em `project_id`. Registre depois:

```sql
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0021_project_scope_not_null.sql');
```

Se alguma contagem vier > 0, **não aplique**: uma credencial sem projeto é
achado de segurança, não linha a descartar em silêncio. Registre, revogue
(`DELETE ... WHERE project_id IS NULL`) e só então rode. O `INSERT..SELECT` da
migration copia tudo de propósito — com órfã, ele aborta **antes** do `DROP`, e
nada se perde.

Prefira `execute --file` a `migrations apply` enquanto a `d1_migrations` estiver
divergente — `apply` decide sozinho o conjunto, e é justamente esse conjunto que
está errado. Depois de aplicar por arquivo, registre na tabela de controle com o
`INSERT OR IGNORE` acima.

## FASE 5 — Só então

Me avise com a saída de:

```powershell
npx wrangler d1 execute niso-db --remote --command "PRAGMA table_info(users);"
npx wrangler d1 migrations list niso-db --remote
```

Com `totp_enabled` **e** `totp_fail_count` presentes em produção, **eu mergeio o
PR #31** e o deploy roda. Nessa ordem, nunca na inversa: `deploy.yml` dispara em
`push: main`, e `src/routes/auth.ts` consulta `totp_enabled` no login. Código na
frente da migration derruba o login de todo mundo.

---

## Não faça

- `npx wrangler d1 migrations apply niso-db --remote` sem terminar a FASE 3. Aplica
  17 arquivos, 4 dos quais ninguém revisou, e um deles dropa tabela com PII.
- Mergear o #31 você mesmo. O deploy é automático em `main`; sem a 0019 o login cai.
- Reportar "aplicado com sucesso" sem colar a saída do `PRAGMA`. As duas afirmações
  anteriores de que 0013–0018 estavam aplicadas se provaram falsas — a partir daqui
  só conta evidência colada.

## Pendência separada, não bloqueia isto

`RESEND_API_KEY` vazou em saída de deploy e no chat. Rotacione no painel do Resend e
regrave com `npx wrangler secret put RESEND_API_KEY`. Confirme que foi feito.

---

## Estado real de produção (apurado em 2026-08-03)

As sondas da FASE 1 foram rodadas. O que elas mostraram:

| Migration | Situação em produção |
|---|---|
| 0002…0006, 0019 | aplicadas **e** registradas |
| 0002_policy_templates, 0007…0012 | objetos existem (vieram do `schema.sql`), **não** registradas |
| **0013, 0014, 0016, 0017, 0018** | **nunca aplicadas** |
| 0015 | aplicada (`project_knowledge` existe), não registrada |

A `d1_migrations` tem 7 linhas e o banco tem objetos de 12 migrations: ele foi
criado a partir do `schema.sql` da época, não pela sequência de migrations. Por
isso a lista de pendentes do wrangler não descreve o banco.

**As faltantes quebram funcionalidade que está no ar hoje**, não são dívida
abstrata:

| Falta | Quebra |
|---|---|
| `assets.type`, `assets.criticality` | criar ativo (`projects.ts:291`, `platform.ts:22`) |
| `audit_logs.project_id` | criar webhook, criar/revogar API key (`integrations.ts:157,226,246`) |
| tabela `scope_changes` | mudança de escopo (`projects.ts:317,331`) |
| `dpia_assessments.processing_name`, `system_name` NOT NULL | criar DPIA (`projects.ts:511`) |
| triggers da 0018 | `audit_logs` **não** é append-only em produção |

### Como corrigir

`ops/reconcile-2026-08.sql` aplica exatamente o que falta — sem os dois
statements que abortariam o lote (`assets.description` já existe, e
`project_knowledge` também). Depois, `ops/reconcile-2026-08-registro.sql`
acerta a `d1_migrations`.

Os dois arquivos ficam em `ops/` e não em `migrations/` porque o wrangler varre
`migrations/*.sql` e os aplicaria junto com as migrations reais.

### Os 4 arquivos fora do git

`git status --porcelain migrations/` confirmou que estes existem **só na máquina
de desenvolvimento**, como untracked:

```
?? migrations/0012_evidence_controls_link.sql
?? migrations/0012_stakeholder_requirement_type.sql
?? migrations/0013_add_performance_indexes.sql
?? migrations/0013_translate_controls_ptbr.sql
```

Enquanto estiverem ali, `wrangler d1 migrations apply` aplicaria DDL que nunca
passou por revisão. Guarde uma cópia fora de `migrations/` antes de removê-los —
podem ser a única pista de alguma alteração feita à mão em produção.
