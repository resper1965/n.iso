# Plano Enterprise Grade — nISO

> Estado medido em 2026-09-02, sobre `main` em `0159a61`. Todo número aqui saiu
> de comando executado, não de leitura. Ao atualizar este documento, refaça a
> medição — número herdado envelhece e passa a mentir (ver `AGENTS.md`, regra
> número um).

## Como ler este plano

O nISO **já é** um sistema bem construído. A maior parte do que costuma faltar em
projeto que se diz enterprise grade — portão de review, catraca de cobertura,
deploy com gate, backup exercitado, CSP sem `unsafe-inline` — aqui já existe. Este
plano não recomeça nada disso. Ele ataca as seis lacunas que sobram, na ordem em
que o risco pede.

## O que já está pronto — não refazer

Medido, não presumido:

| Área | Evidência |
|---|---|
| Suíte | 55 arquivos, 480 testes, verdes em 59,6s (`npm run test:coverage`) |
| Catraca | backend 58,89% stmts (piso 53); frontend ~11,6% (piso 10) |
| CI | `tsc --noEmit` + suíte + build + Playwright E2E + `npm audit`, em 3 jobs |
| Deploy | automático na `main`, **recusa publicar com migration D1 pendente**, abre issue em falha e fecha em verde |
| Review | ruleset na `main` (PR + check `test` + branch atualizado, sem bypass), CODEOWNERS em `middleware/`, `auth.ts`, `schema.sql`, `migrations/`, `wrangler.jsonc` |
| Dependências | Dependabot em 4 ecossistemas, com agrupamento de dev-tooling |
| Backup | runbook em `backups/README.md` e **restauração exercitada** em `test/backup-restore.test.ts` — o dump é reaplicado num banco do zero |
| Segurança de borda | CSP sem `'unsafe-inline'` em `script-src`, CORS por allowlist, HSTS 1 ano, `security.txt` com `Expires` calculado |
| Segredos | `wrangler secret`, `repository_token` cifrado em repouso (AES-GCM), CSPRNG em todo token |
| Autenticação | MFA TOTP com códigos de recuperação, revogação de sessão, rate limit de login por conta |
| Multi-tenant | `projectAccessMiddleware` + `requireResourceAccess` + `somenteNess` |
| Observabilidade | log JSON por requisição com `request_id`, Analytics Engine |

## Os seis eixos que faltam

### Eixo 1 — Confiabilidade da mudança

- **Não existe ambiente de pré-produção.** `wrangler.jsonc` declara zero blocos
  `env`. Uma migration vai do D1 local direto para o D1 de produção. O gate de
  deploy impede publicar código à frente do banco, mas nada exercita a migration
  contra dado de forma realista antes dela valer para o cliente.
- **Não existe execução periódica.** Nenhum handler `scheduled`, nenhum cron
  trigger. Backup é ato humano; expiração de token de auditor, purga de
  `rate_limits` e retenção de trilha não têm executor.
- **Não existe versão.** O `CHANGELOG.md` para em 8.0.0 (2026-07-03) e o repo já
  passou do PR #141. Não há como responder a um cliente qual versão ele roda, nem
  correlacionar um incidente a um deploy.

### Eixo 2 — Prova de isolamento

O produto vende controle de acesso (A.5.15, A.8.3). O isolamento existe no
código, mas a prova é parcial:

- `requireResourceAccess` é **convenção manual**: cada rota flat `/:id` precisa
  lembrar de chamá-la, e o esquecimento é silencioso — 200 com dado de outro
  tenant, não erro.
- `test/idor-tenant.test.ts` cobre 13 recursos. Ficam de fora 9 rotas mutantes:
  `capa/:id`, `ropa/:id`, `certifications/:id`, `assets/:id`, `dpia/:id`,
  `webhooks/:id`, `api-keys/:id`, `notifications/:id/read`, `audits/:id`.
- `src/routes/platform.ts` está a **26,1%**, e é onde vivem `/portfolio`,
  `/client/dashboard`, `/client/assessment` e `/client/proposal` — exatamente os
  endpoints que filtram por `client_project_id`.

### Eixo 3 — Contrato e tipos

- **351 ocorrências de `any`** em `src/` (`: any` e `as any`). `tsc --noEmit`
  limpo diz pouco quando o tipo é `any`.
- **Não há OpenAPI.** São ~200 endpoints, e o frontend e o `mcp-server-niso`
  estão acoplados por convenção. Cliente enterprise pede contrato publicado.
- **~46 leituras de corpo sem schema semântico** (dívida já declarada em
  `AGENTS.md`): `bodyGuard` cobre teto e poluição de protótipo, não formato.

### Eixo 4 — Operação observável

- O Analytics Engine **grava e ninguém lê**. Não há SLO, alerta de taxa de erro,
  alerta de latência, nem verificação externa de disponibilidade.
- O único alerta que existe é falha de deploy virando issue. Falha em produção
  fora do deploy é invisível até o cliente ligar.
- Não há runbook de incidente. `SECURITY.md` cobre relato de vulnerabilidade,
  não indisponibilidade ou corrupção de dado.

### Eixo 5 — Identidade corporativa

- **Não há SSO** (SAML/OIDC) nem **SCIM**: zero ocorrência em `src/`. É o item
  que mais trava venda enterprise, porque não tem contorno — ou existe, ou o
  cliente gerencia usuário à mão fora do diretório dele.
- MFA é **opcional e por usuário**. Não há como o cliente exigir MFA para todo o
  seu tenant.
- TTL de sessão e política de senha são globais, não por tenant.

### Eixo 6 — Dado do cliente

- `audit_logs` **não é imutável**: nada no schema barra `UPDATE`/`DELETE`. Trilha
  que o operador pode editar não sustenta auditoria de certificação.
- Não há **retenção** definida para trilha nem para evidência.
- Não há **portabilidade do tenant** (LGPD art. 18, V). Existem exports CSV por
  módulo, não um pacote do cliente inteiro.

---

## Ondas

Cada onda tem critério de saída verificável. Sem a evidência colada, a onda não
fechou.

### Onda 0 — Higiene imediata

| # | Ação | Critério de saída |
|---|---|---|
| 0.1 | ~~Subir `hono` acima de 4.12.33~~ **feito** | `npm audit` sem o advisory GHSA-8j4g-w8fx-2239 — hoje em 4.13.5, 0 vulnerabilidades |
| 0.2 | Expor versão em `/health` (SHA do commit via var de build) | `curl /health` devolve `version`; a sonda de produção do `AGENTS.md` passa a distinguir versão sem heurística |
| 0.3 | Retomar `CHANGELOG.md` e tag por release | tag `vX.Y.Z` na `main`, changelog cobrindo de 8.0.0 até hoje |

> **0.1 é o único item deste plano que é vulnerabilidade ativa.** A versão
> instalada é `hono@4.12.32`; o advisory de ReDoS no middleware de CORS alcança
> `<=4.12.33`, e o nISO monta `cors()` em `'*'` (`src/index.ts:161`). O
> `AGENTS.md` afirma que as vulnerabilidades do `npm audit` "nenhuma chega no
> bundle do Worker" — isso deixou de valer.

### Onda 1 — Provar o isolamento

Segue a análise de testes já feita, na ordem de risco.

| # | Ação | Critério de saída |
|---|---|---|
| 1.1 | Teste de contrato da guarda de recurso — **PARCIAL** | Entregue: `test/contrato-isolamento-topo.test.ts` descobre as 77 rotas lendo o fonte e prova que nenhuma responde 2xx ou 5xx a id forjado (achou os dois 500 de webhooks). **Não** cumpre o critério original: por mutação, removida a guarda de um handler de `evidence.ts`, o teste seguiu VERDE — rota sem guarda devolve 404 para id inexistente, e 404 passa. Falta o 1.6 |
| 1.2 | ~~Estender `idor-tenant.test.ts` aos 9 recursos faltantes~~ **feito** | 8 dos 9 respondem 403 ao tenant vizinho, com a linha conferida depois. O 9º (`notifications/:id/read`) responde **200** por desenho — o escopo dela é o dono, não o projeto — e ali a asserção é sobre a linha, não sobre o status |
| 1.3 | ~~Portfólio e dashboards de cliente~~ **feito** | `platform.ts` de **26,1%** (medido na `main`) para **71,8%**. O "40%" citado numa versão anterior deste documento era a medição intermediária, depois do commit do item 1.2 — não a linha de base |
| 1.4 | ~~Teste parametrizado dos 6 CRUDs de módulo~~ **feito** | os 6 acima de 70%: audits 92,7 · capa 90,9 · training 90,2 · certifications 82,8 · vendors 76,5 · ropa 76,4 |
| 1.5 | Subir a catraca do backend — **PARCIAL** | Alvo original: ~70/55/72/70. Atingido: 65,5 / 54,1 / 72,4 / 68,0 — passa em `functions`, falha nas outras três. Pisos hoje em 62/50/69/64, abaixo do atingido, como degrau; o alvo permanece ~70/55/72/70 |
| 1.6 | **NOVO** — semear recurso real do outro tenant por rota, para o contrato do 1.1 detectar guarda AUSENTE (e não só mal colocada) | remover `requireResourceAccess` de qualquer handler faz o teste falhar |

Fecha o eixo 2. É a onda que um auditor de certificação vai pedir para ver.

> O item 1.2 encontrou defeito na primeira execução: `PUT`/`DELETE
> /api/v1/assets/:id` chamavam a guarda FORA do `try`, e `DELETE
> /api/v1/webhooks/:id` não tinha `try` algum — a negação de acesso escapava
> para o `app.onError` e virava **500 em vez de 403**. O acesso continuava
> negado, mas recusa de rotina contava como erro de servidor na taxa de 5xx do
> eixo 4. Corrigido traduzindo o prefixo `Forbidden` no `app.onError`, o que
> fecha a classe inteira. É o argumento do item 1.1 em forma concreta: a guarda
> ser convenção manual não falha só por ausência — falha também por colocação.

> O item 1.3 confirmou por sonda o que este plano listava como suspeita: em
> `/portfolio` e `/dashboard/stats` o filtro só valia **quando**
> `client_project_id` estava preenchido, então papel de cliente SEM projeto caía
> no ramo de plataforma e recebia a carteira e as contagens de TODOS os tenants.
> A conta é criável hoje (`createUserSchema` declara o campo como
> `.nullable().optional()` e `role` é `z.string()` livre). Corrigido para falhar
> fechado — escopo ausente significa nada, nunca tudo —, junto com a contagem de
> leads, que era global para todo cliente apesar do `somenteNess`.

> O code-review encontrou que essa primeira correção fechava só METADE do
> buraco: ela mantinha a decisão por allowlist de papel-CLIENTE
> (`org_admin|org_user|client`), e `users.role` é TEXT livre. Sonda: papel
> `ciso` escopado ao projeto A — papel que a própria suíte de IDOR usa —
> recebia `["proj-a","proj-b"]` do `/portfolio` e `projects: 2` do
> `/dashboard/stats`. Corrigido invertendo a decisão para allowlist de STAFF
> (`ehEquipeNess`, o mesmo conjunto que `requireResourceAccess` já usa): papel
> desconhecido cai no ramo escopado, que é o lado seguro de errar.

### Achados da onda 1 ainda em aberto

Encontrados pelos testes acima e deliberadamente NÃO corrigidos junto: um exige
migration (e a onda 2 traz o staging onde ensaiá-la), o outro não é verificável
sem o binding `ASSETS`.

| # | Achado | Encaminhamento |
|---|---|---|
| A1 | `/api/v1/client/assessment` e `/api/v1/client/proposal` estão **mortas**: as duas exigem `user.client_lead_id`, coluna que não existe em `schema.sql` nem em nenhuma das 25 migrations, e que o login não seleciona. O comentário que justifica o `somenteNess` em `routes/proposals.ts` afirma que esse é "o caminho legítimo do cliente para a própria proposta" — hoje o cliente não alcança a própria proposta por caminho nenhum | Precisa de migration + `SELECT` no login + quem grava o vínculo. `test/platform-portfolio.test.ts` fixa o 404 atual e FALHA quando a coluna aparecer, forçando revisitar o comentário no mesmo commit |
| A2 | `GET /api/v1/policies/templates/:templateName` devolve **500** para nome inexistente, em vez de 404 — `generate()` lança e o handler traduz tudo para `erro500` | Mesma classe do 403-vs-500 já corrigido. Não dá para verificar a correção sem o binding `ASSETS`, ausente no ambiente de teste |

### Onda 2 — Confiabilidade da mudança

| # | Ação | Critério de saída |
|---|---|---|
| 2.1 | Ambiente `staging` no `wrangler.jsonc` (D1, KV, R2 e Vectorize próprios) | `wrangler deploy --env staging` publica; produção intocada |
| 2.2 | Deploy em dois passos: `main` → staging → aprovação → produção | workflow com `environment: staging` antes de `production` |
| 2.3 | Migration ensaiada em staging antes de produção | passo do `db-migrate.yml` que aplica em staging primeiro |
| 2.4a | ~~Handler `scheduled` + cron trigger~~ **feito** | `src/manutencao.ts` + `triggers.crons` no `wrangler.jsonc`: purga de `rate_limits` e de token de auditor vencido. É a PRIMEIRA execução periódica do sistema |
| 2.4b | ~~Backup diário verificado~~ **feito** | `.github/workflows/db-backup.yml`, agendado, com verificação do dump e issue automática se falhar |
| 2.5 | ~~Runbook de incidente~~ **feito** | `docs/runbook-incidente.md`: sonda, reverter deploy, restaurar D1, migration ruim, MFA perdido, acesso indevido, comunicar |

Os itens 2.4 e 2.5 não exigem infraestrutura nova e estão feitos. Os itens
2.1–2.3 exigem: um ambiente de staging duplica D1, KV, R2 e Vectorize, e é a
única parte do plano que precisa de decisão de orçamento antes de código.

> **Correção ao próprio plano.** O item 2.4 juntava "backup diário verificado" e
> "purga" num handler `scheduled` só. Não cabem no mesmo lugar: o binding D1 não
> expõe API de export, então um Worker não consegue fazer backup — quem exporta é
> o `wrangler d1 export`, que é CLI. O backup virou workflow agendado (2.4b) e a
> purga ficou no cron do Worker (2.4a). Escrever o item errado custou barato aqui
> porque apareceu na implementação; teria custado caro como promessa a cliente.

### Onda 3 — Contrato e operação

| # | Ação | Critério de saída |
|---|---|---|
| 3.1 | OpenAPI gerado dos schemas Zod | `/api/v1/openapi.json` servido; spec versionada no repo |
| 3.2 | `mcp-server-niso` consome o contrato gerado, não strings | build do MCP quebra se um endpoint mudar de forma |
| 3.3 | Fechar as ~46 leituras de corpo sem schema semântico | nenhum `c.req.json()` sem `validateBody` em rota de escrita |
| 3.4 | Reduzir `any` — começando por `middleware/`, `auth.ts`, `helpers.ts` | zero `any` nos caminhos de autorização |
| 3.5 | SLO + alerta consumindo Analytics Engine | alerta dispara em taxa de erro 5xx e em p95 de latência |
| 3.6 | Verificação externa de disponibilidade | uptime check no domínio de produção, notificando fora do GitHub |

### Onda 4 — Enterprise de verdade

O que destrava contrato corporativo. Cada item é projeto próprio, com spec no
padrão do Spec Kit antes do código.

| # | Ação | Critério de saída |
|---|---|---|
| 4.1 | SSO por OIDC (Entra ID, Okta, Google Workspace) | login federado com provisionamento no primeiro acesso |
| 4.2 | SCIM 2.0 para provisionamento e **desprovisionamento** | usuário desligado no IdP perde acesso sem ação manual |
| 4.3 | Política de segurança por tenant | MFA obrigatório, TTL de sessão e allowlist de IP configuráveis por cliente |
| 4.4 | `audit_logs` imutável | trigger que barra `UPDATE`/`DELETE`; teste que prova a barreira |
| 4.5 | Retenção de trilha e evidência | política declarada, executada pelo cron da onda 2 |
| 4.6 | Portabilidade do tenant | export assinado do cliente inteiro (LGPD art. 18, V) |

---

## Sequenciamento

Ondas 0 e 1 são independentes de tudo e devem começar juntas — a 0 porque é
vulnerabilidade ativa, a 1 porque é o risco de maior consequência (vazamento
entre clientes num produto de conformidade).

A onda 2 depende de decisão de custo: um ambiente de staging duplica D1, KV, R2 e
Vectorize. É a única onda que exige orçamento antes de código.

A onda 3 depende da 1 (refatorar tipo e contrato sem teste de isolamento é
apostar), e a 4 depende da 2 (SSO sem staging é publicar autenticação nova
direto em produção).

## O que este plano deliberadamente não faz

- **Não introduz framework no frontend.** Vanilla é decisão registrada.
- **Não persegue cobertura de teste unitário nas views grandes.** `compliance.js`,
  `grc.js` e `monitor.js` são renderers monolíticos presos a `window`; cobertura
  real deles vem de Playwright, e a onda 1 prioriza backend porque é onde o dado
  de outro cliente pode vazar.
- **Não reabre i18n, tema claro ou responsividade.** Decisões já tomadas.
- **Não propõe microserviços.** O composition root de 318 linhas com 31
  sub-routers é uma arquitetura adequada ao tamanho do problema.
