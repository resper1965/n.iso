# Migrations

Companheiro de [`backups/README.md`](../backups/README.md) (backup e restauração). O runbook do
incidente de agosto de 2026, quando a `d1_migrations` de produção divergia do repositório, foi
arquivado em [`docs/arquivo/reconciliacao-migrations-2026-08.md`](../docs/arquivo/reconciliacao-migrations-2026-08.md).

## Estado

- Última migration no repositório: **0051** (`ls migrations/*.sql | tail -1`). São 49 arquivos
  `.sql` (`ls migrations/*.sql | wc -l`): não existe 0001, há três 0002 de antes da numeração
  estável, e **não existem 0031 a 0033** (eram da camada MSP, que entrou por engano no #204 e
  saiu no #206).
- Produção sem migration pendente é condição de deploy: `.github/workflows/deploy.yml` roda
  `wrangler d1 migrations list niso-db --remote` e recusa publicar se a resposta não for
  "No migrations to apply". Confira você mesmo antes de afirmar o estado de produção.
- `ops/` guarda os dois SQL da reconciliação de 2026-08 (`reconcile-2026-08.sql` e
  `reconcile-2026-08-registro.sql`). Já foram executados; ficam como registro do que foi
  feito à mão no banco.

## Migration nova

1. Schema muda em **dois** lugares: `schema.sql` (índice depois da tabela) e a migration
   numerada. `*.sql` é sempre LF (`.gitattributes`).
2. Backup: `npm run db:backup` (ver `backups/README.md`).
3. Aplicar: `npx wrangler d1 migrations apply niso-db --remote` (antes do merge) ou, depois do
   merge, o workflow manual `db-migrate.yml`. O workflow só roda na `main` (o ambiente `production`
   não aceita outra branch), onde a migration nova só existe depois do merge; o deploy do merge
   recusa de propósito, então rode *Deploy* em seguida.
4. Conferir: `npx wrangler d1 migrations list niso-db --remote` responde "No migrations to
   apply" e `PRAGMA table_info(<tabela>)` mostra a coluna.
5. Só então o merge: o deploy recusa migration pendente.

**Registrar sem executar.** Quando produção já tem o objeto (coluna criada à mão, por
exemplo) e o `ADD COLUMN` abortaria com "duplicate column", a migration não é executada: só se
registra o nome em `d1_migrations` (`INSERT OR IGNORE INTO d1_migrations (name) VALUES (...)`),
antes do merge. É o caso da 0035, abaixo.

A 0011 já foi aplicada e teve o conteúdo trocado por `SELECT 1;` em 2026-10-06: semeava dado de
cliente. O arquivo fica porque `d1_migrations` guarda o nome.

---

## 0035 — assinaturas da análise crítica (F10, 2026-10-01)

`management_reviews` em produção já tem `ciso_signed_by/at/ip` e
`ceo_signed_by/at/ip` (confirmado por `pragma_table_info` em 2026-10-01); nem o
`schema.sql` nem as migrations as declaravam. O `schema.sql` agora as traz, e a
`0035_management_reviews_assinaturas.sql` leva o mesmo DDL a bancos antigos.

**Em produção a 0035 NÃO é executada** (`ADD COLUMN` não é idempotente: abortaria
com "duplicate column"). Só se registra, e o deploy deixa de ver migration pendente:

```powershell
npx wrangler d1 execute niso-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0035_management_reviews_assinaturas.sql');"
npx wrangler d1 migrations list niso-db --remote   # esperado: "No migrations to apply"
```

Ordem: registrar **antes** do merge, porque `deploy.yml` recusa migration pendente.

---

## 0036 — organização comercial (propostas, fatia 1, 2026-10-02)

Adiciona a `organizations` as colunas `cnpj`, `cor_destaque`, `selo_niso`,
`prefixo_proposta`, `proximo_numero`, `config_preco`, `textos` e
`secoes_desligadas`; `org_id` (default `org_ness`) a `leads`, `assessments`,
`proposals` e `contracts`; e semeia a linha `org_ness`. Conferido em produção em
2026-10-02 por `pragma_table_info`: nenhuma dessas colunas existia e
`organizations` estava vazia.

**Diferente da 0035, esta RODA em produção** (as colunas ainda não existem).
`org_id` não tem `REFERENCES`: o SQLite não aceita `ADD COLUMN` com FK e default
não nulo, e `schema.sql` e migration precisam do mesmo DDL.

Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote`
→ `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to
apply") → merge, porque `deploy.yml` recusa migration pendente. Entre aplicar a 0045 e publicar o código novo,
as rotas do auditor do código antigo respondem 500 (a coluna `token` não existe mais); sem efeito com 0
tokens em produção, mas aplique e publique em seguida.

---

## 0038 — tabelas da proposta (propostas, fatia 3, 2026-10-02)

Cria `propostas` e `proposta_itens` (tabelas novas, com índices) e preenche
`organizations.textos` da `org_ness` com os textos iniciais (sobre, como
trabalhamos, premissas, termos, pagamento) só nas chaves ausentes ou vazias:
`json_patch` com o que já existe vencendo, então nada que a consultoria já
escreveu é sobrescrito e `termos` sempre fica preenchido. Conferido em produção em 2026-10-02, só por leitura: as duas tabelas
não existiam e `textos` da `org_ness` era `NULL`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0039 — envio, aceite e contrato da proposta (fatia 4, 2026-10-02)

`ALTER TABLE ... ADD COLUMN` em três tabelas existentes: `propostas` (token_hash,
envio, visualização, aceite, recusa, ajuste, `contrato_id`, `projeto_id`),
`contracts` (`proposta_id`, `documento_hash`, valores, `servicos`, `projeto_id`)
e `projects` (`proposta_id`), mais os índices únicos parciais `idx_propostas_token`
e `idx_contracts_proposta` (este último é a última defesa contra dois contratos
da mesma proposta). Conferido em produção em 2026-10-02, só por leitura
(`pragma_table_info`): nenhuma das colunas novas existia nas três tabelas.
`ALTER ADD COLUMN` com `CHECK` (`aceite_origem`) é aceito pelo SQLite do D1.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0040 — multiconsultoria (fatia 5, 2026-10-02)

`ALTER TABLE ... ADD COLUMN`: `users.org_id` e `projects.org_id`, ambos
`TEXT NOT NULL DEFAULT 'org_ness'` e sem `REFERENCES` (como nas tabelas
comerciais: `ALTER` não aceita FK com default). O DEFAULT é o backfill: toda
conta e todo projeto existentes passam a ser da ness. `organizations` ganha
`termo_aceito_em`, `termo_versao` e `logo_chave`. Índices `idx_users_org` e
`idx_projects_org`, e o índice ÚNICO parcial `idx_organizations_prefixo`
(`prefixo_proposta`, `WHERE prefixo_proposta IS NOT NULL`): violação vira 409
na criação de organização e em `PUT /org/config`. Conferido em produção em
2026-10-02, só por leitura (`pragma_table_info`): nenhuma das cinco colunas
existia; e nenhum prefixo repetido entre organizações (`GROUP BY
prefixo_proposta HAVING COUNT(*) > 1` vazio), senão o índice falharia.

Depois de aplicar, a conferência é `SELECT COUNT(*) FROM users WHERE org_id <>
'org_ness'` e o mesmo em `projects`: as duas têm de dar 0.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0041 — pedidos de aprovação e ciência (acesso de stakeholders, fatia 2, 2026-10-04)

Cria duas tabelas novas, com índices: `pedidos` (um por documento/ação, com
`org_id` e `project_id`, o conteúdo congelado em `conteudo_json` e o SHA-256
dele em `hash`; `status` em `aberto|aprovado|recusado|substituido|cancelado`,
`substituido_por` aponta o pedido que nasceu quando o documento mudou) e
`pedido_destinatarios` (uma linha por pessoa, com a prova da decisão:
`decidido_em`, `canal`, `ip`, `user_agent`, `hash_lido`, `mfa_usado`, `motivo`;
`token_hash` fica para a fatia 3, com índice único parcial). `tipo` aceita só
`dpia` por enquanto (CHECK): tipo novo exige migration. Só `CREATE ... IF NOT
EXISTS`, nenhuma tabela existente é alterada.

Conferência depois de aplicar: `PRAGMA table_info(pedidos)` e
`PRAGMA table_info(pedido_destinatarios)` mostram as colunas acima.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0042 — ciência por link com código (acesso de stakeholders, fatia 3, 2026-10-04)

Rebuild de `pedidos` e `pedido_destinatarios` (exige a 0041 aplicada antes).
`pedidos.tipo` passa a aceitar `politica` (ref_id = `compliance_controls.id`):
CHECK só muda por rebuild no SQLite. `pedido_destinatarios` ganha `aberto_em`
(painel: "não abriu") e `token_expira_em` (o link pessoal vence em 30 dias;
reenviar emite outro). Trigger `pedido_dest_prova_imutavel`: linha com
`status <> 'pendente'` não aceita UPDATE (DELETE não é bloqueado: apagar o
projeto apaga os pedidos em cascata).

Ordem do rebuild, para não perder linha: com FK ativa, `DROP TABLE pedidos`
faz DELETE implícito e o `ON DELETE CASCADE` apagaria os destinatários. Por
isso as tabelas novas nascem ligadas entre si (`pedido_destinatarios_new` ->
`pedidos_new`), a filha antiga cai primeiro, depois a mãe, e o `RENAME`
reescreve a FK da filha para `pedidos`. `test/migration-0042.test.ts` prova
sobre o banco da 0041 com linhas: nada some e a FK aponta para `pedidos`.

Conferência depois de aplicar:
`SELECT COUNT(*) FROM pedido_destinatarios` igual ao de antes,
`PRAGMA table_info(pedido_destinatarios)` com `aberto_em` e `token_expira_em`,
`PRAGMA foreign_key_list(pedido_destinatarios)` apontando para `pedidos`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0043 — pedido imutável (acesso de stakeholders, fatia 5, 2026-10-05)

Só cria o trigger `pedido_prova_imutavel` (`BEFORE UPDATE ON pedidos`); nenhuma
tabela ou linha muda. O trigger recusa mudar `hash`, `conteudo_json`, `tipo`,
`ref_id` e `papel_exigido` em qualquer pedido, e `status`/`substituido_por` em
pedido fechado (`status <> 'aberto'`). Continua permitido: o pedido aberto
virar `substituido` (com `substituido_por`), `cancelado`, `aprovado` ou
`recusado`, e mudar `org_id` (transferência de projeto). DELETE não é
bloqueado: apagar o projeto apaga os pedidos em cascata.
`test/migration-0043.test.ts` aplica 0041, 0042 e 0043 sobre linhas e confere
as regras, também contra o `schema.sql`.

Conferência depois de aplicar:
`SELECT name FROM sqlite_master WHERE type='trigger' AND name='pedido_prova_imutavel'`
devolve uma linha.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0044 — IP e user agent das aprovações (fatia 0, 2026-10)

As 12 colunas `*_approved_ip/ua` de `compliance_controls`, `evidence` e `ropa_records` existem
em produção e no `schema.sql`, mas nenhuma migration as criava. A 0044 leva o DDL a banco novo.
Produção (`niso-db`) tem as 12 colunas (conferido por `pragma_table_info` em 2026-10-07).

**Em produção a 0044 NÃO é executada** (abortaria com "duplicate column"). Só se registra, antes
do merge:

    npx wrangler d1 execute niso-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0044_aprovacao_ip_ua.sql');"
    npx wrangler d1 migrations list niso-db --remote   # esperado: "No migrations to apply"

## 0045 — token do auditor em hash e revogável (fatia de jornada, P5, 2026-10)

`auditor_tokens.token` vira `token_hash` (SHA-256 do token do link; o índice `idx_auditor_tokens`
acompanha o RENAME) e ganha `revoked_at` e `revoked_by`. As notas (`auditor_notes.auditor_token`)
passam a guardar o id do token, não o token. Os tokens existentes são apagados: SQLite não calcula
SHA-256, então token em claro não migra. Em 2026-10-07 a tabela tinha 0 linhas em produção.

Conferência antes de aplicar: `SELECT COUNT(*) FROM auditor_tokens` (se não for 0, avise a
consultoria: esses links deixam de abrir). Depois: `PRAGMA table_info(auditor_tokens)` mostra
`token_hash`, `revoked_at` e `revoked_by`, e não mostra `token`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply")
→ merge, porque `deploy.yml` recusa migration pendente.

---

## 0046 — avisos de prazo (2026-10)

Cria `avisos_prazo` (uma linha por fonte, item, marco, pessoa e vencimento; `UNIQUE(fonte, item_id,
marco, user_id, vence_em)`) e o índice `idx_avisos_prazo_email`. Só `CREATE ... IF NOT EXISTS`,
nenhuma tabela existente muda.

Conferência depois de aplicar: `PRAGMA table_info(avisos_prazo)` mostra `id, project_id, fonte,
item_id, marco, user_id, vence_em, titulo, criado_em, email_enviado_em`.

**Esta RODA em produção.** Hoje a produção está na 0044: a 0045 ainda não foi aplicada, então
`migrations apply` aplicará a 0045 e a 0046 juntas. Ordem: `npm run db:backup` (antes) → `npx wrangler
d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado:
"No migrations to apply") → merge, porque `deploy.yml` recusa migration pendente. O cron novo (`0 11 * * *`) entra com o deploy;
sem a tabela, a rotina registraria falha em todo item.

---

## 0047 — núcleo do n.privacy, fatia 1.1 (2026-10)

Cria `projeto_modulos`, `departamentos`, `partes` e `parte_vinculos`, acrescenta
`organizations.modulos_contratados` (padrão `["iso"]`) e o gatilho `projeto_modulo_iso_padrao`. Os
projetos que já existem recebem o módulo `iso`. Só `CREATE ... IF NOT EXISTS` e um `ALTER ... ADD COLUMN`
(não idempotente: aplicar duas vezes falha com "duplicate column"). Nenhuma tabela existente perde dado.

Conferência depois de aplicar: `PRAGMA table_info(partes)` mostra `id, project_id, tipo, nome, email,
user_id, status, created_at, updated_at`; `SELECT modulo, count(*) FROM projeto_modulos GROUP BY modulo`
mostra `iso` com a contagem de `projects`; `PRAGMA table_info(organizations)` lista `modulos_contratados`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply") →
merge, porque `deploy.yml` recusa migration pendente.

## 0049 — responsável aponta para a parte, fatia 1.3 (2026-10)

Cinco `ALTER TABLE ... ADD COLUMN ... REFERENCES partes(id) ON DELETE SET NULL`: `risks.owner_parte_id`,
`compliance_controls.owner_parte_id`, `ropa_records.owner_parte_id`, `corrective_actions.assigned_to_parte_id`
e `checklist_progress.assigned_to_parte_id`. O texto do responsável fica onde está. Sem carga: quem liga
texto a parte é `POST /api/v1/projects/:projectId/partes/importar` e `.../partes/conciliar`, por projeto.
ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column". Nenhuma linha muda.

Conferência depois de aplicar: `PRAGMA table_info(risks)` lista `owner_parte_id` (e igual nas outras quatro).

**Esta RODA em produção, aditiva, sem janela.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations
apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0050 — documentos e versões, fatia 3.1 (2026-10)

Cria `documentos` e `documento_versoes` (duas tabelas e quatro índices, todos `IF NOT EXISTS`). Sem carga e sem
`ALTER`: nenhuma tabela existente muda e nenhuma linha é copiada. As políticas que já existem entram por
`POST /api/v1/projects/:projectId/documentos/importar`, por projeto e repetível, porque o hash SHA-256 não se
calcula em SQLite. Os índices parciais `idx_doc_versao_vigente` e `idx_doc_versao_rascunho` garantem uma versão
vigente e um rascunho, no máximo, por documento.

Conferência depois de aplicar: `PRAGMA table_info(documentos)` e `PRAGMA table_info(documento_versoes)` listam as
colunas; `SELECT count(*) FROM documentos` devolve 0 até a importação. Depois do `importar`, o esperado em produção é
**um documento por controle que já tenha versão de política** (medido em 09/10/2026: 4 controles, 9 versões).

**Esta RODA em produção, aditiva, sem janela.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply
niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0051 — pedidos aceitam `documento` e canal `portal`, fatia 3.3 (2026-10)

**Reconstrói `pedidos` e `pedido_destinatarios`**, que são PROVA (ciência e aprovação com hash, IP e user-agent), para
ampliar dois CHECKs: `pedidos.tipo` ganha `documento` e `pedido_destinatarios.canal` ganha `portal`. Mesmo molde da 0042:
as duas tabelas novas nascem ligadas entre si, a filha antiga cai primeiro, o `RENAME` reescreve a FK, e os **dois
triggers** de prova (0042 e 0043, que o `DROP TABLE` leva junto) e os índices são recriados no fim. Acrescenta o índice
único parcial `idx_pedidos_portal_aberto` (um pedido "em pé" aberto do portal por documento).

**Antes de aplicar em produção** (a 0042 já avisava de deriva): conferir `PRAGMA table_info(pedidos)` e
`PRAGMA table_info(pedido_destinatarios)` contra o `schema.sql` (16 colunas na filha), anotar `SELECT count(*)` de cada
tabela e de `pedido_destinatarios WHERE status <> 'pendente'`, e rodar `npm run db:backup`. **Depois:** as contagens iguais,
`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('pedidos','pedido_destinatarios')` devolvendo os
dois triggers e `PRAGMA foreign_key_list(pedido_destinatarios)` apontando para `pedidos`.

**Ordem de rollout:** 0050 → `POST /projects/:id/documentos/importar` em cada projeto → 0051 → merge/deploy. Sem o
`importar`, o portal `/politicas` fica vazio (ele só lista documento com versão vigente). Hoje, em produção, `pedidos` não tem
pedido de política e `policy_acknowledgments` não tem linha (medido em 09/10/2026), então não há prova de política a perder.
