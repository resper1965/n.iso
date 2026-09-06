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
| 0.2 | ~~Expor versão em `/health`~~ **feito** | `/health` devolve `version` (SHA injetado por `wrangler deploy --var VERSAO_SHA`), mais `deployment_id` e `deployed_at` do binding `version_metadata` — que distinguem dois deploys do MESMO commit. Sem a var, responde `"dev"`, que é a verdade e não um placeholder. `AGENTS.md` atualizado; a sonda antiga fica como segunda evidência, porque prova comportamento e não só um rótulo. A sonda de `uptime.yml` alerta se `/health` voltar sem o campo — deploy que não saiu |
| 0.3 | Retomar `CHANGELOG.md` e tag por release — **changelog feito; push das tags bloqueado** | `CHANGELOG.md` reconstruído do histórico do git, de 8.0.0 até hoje, agrupado em 8.1.0 / 8.2.0 / 8.3.0 — e a lacuna de dois meses fica registrada no topo em vez de apagada. As três tags anotadas foram criadas apontando para os commits certos da `main`, mas `git push origin v8.1.0 v8.2.0 v8.3.0` devolve **403** neste ambiente (mesma classe do bloqueio em `/actions/variables`). Rodar esse comando é o que falta |

> **0.1 é o único item deste plano que é vulnerabilidade ativa.** A versão
> instalada é `hono@4.12.32`; o advisory de ReDoS no middleware de CORS alcança
> `<=4.12.33`, e o nISO monta `cors()` em `'*'` (`src/index.ts:161`). O
> `AGENTS.md` afirma que as vulnerabilidades do `npm audit` "nenhuma chega no
> bundle do Worker" — isso deixou de valer.

### Onda 1 — Provar o isolamento

Segue a análise de testes já feita, na ordem de risco.

| # | Ação | Critério de saída |
|---|---|---|
| 1.1 | ~~Teste de contrato da guarda de recurso~~ **feito** (com o 1.6) | `test/contrato-isolamento-topo.test.ts` descobre as 77 rotas lendo o fonte e faz DUAS varreduras. A parcialidade anotada aqui antes — a de que a mutação em `evidence.ts` deixava o teste verde — foi fechada pelo 1.6 |
| 1.2 | ~~Estender `idor-tenant.test.ts` aos 9 recursos faltantes~~ **feito** | 8 dos 9 respondem 403 ao tenant vizinho, com a linha conferida depois. O 9º (`notifications/:id/read`) responde **200** por desenho — o escopo dela é o dono, não o projeto — e ali a asserção é sobre a linha, não sobre o status |
| 1.3 | ~~Portfólio e dashboards de cliente~~ **feito** | `platform.ts` de **26,1%** (medido na `main`) para **71,8%**. O "40%" citado numa versão anterior deste documento era a medição intermediária, depois do commit do item 1.2 — não a linha de base |
| 1.4 | ~~Teste parametrizado dos 6 CRUDs de módulo~~ **feito** | os 6 acima de 70%: audits 92,7 · capa 90,9 · training 90,2 · certifications 82,8 · vendors 76,5 · ropa 76,4 |
| 1.5 | ~~Subir a catraca do backend~~ **feito** | Alvo original ~70/55/72/70, batido nas QUATRO métricas: **70,71 / 58,33 / 77,35 / 73,21**. O que fechou a diferença foi cobrir o funil comercial — `routes/assessments.ts` era o arquivo menos coberto do backend (15,7%) e é por onde entra dinheiro: questionário, precificação, proposta e conversão em projeto. Pisos subidos para 69/57/76/72, um ponto abaixo do atingido |
| 1.6 | ~~Semear recurso real do outro tenant, para o contrato detectar guarda AUSENTE~~ **feito** | Critério cumprido e verificado por mutação: removida a chamada de `requireResourceAccess` em `src/routes/evidence.ts:18`, a varredura 1 segue verde e a **varredura 2 falha** com `200 GET /api/v1/evidence/:id/detail`. A semeadura é derivada do banco (`sqlite_master` + `PRAGMA table_info`), então tabela nova entra sozinha. Rota que para no 400 antes da guarda também falha o teste — força um corpo mínimo em `CORPOS` em vez de passar por verde sem exercitar nada |

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

Os três foram corrigidos depois — o A1 sem a migration que este documento
previa, porque a previsão estava errada (ver a linha dele).

| # | Achado | Encaminhamento |
|---|---|---|
| A1 | ~~`/api/v1/client/assessment` e `/api/v1/client/proposal` estão **mortas**~~ **corrigido, e sem migration** | O encaminhamento anterior dizia "precisa de migration + SELECT no login + quem grava o vínculo". Estava errado: o vínculo **já existe** no banco. `POST /assessments/:id/convert` grava `projects.assessment_id`, e as duas rotas que criam proposta gravam `proposals.assessment_id` — o caminho é `users.client_project_id → projects.assessment_id → assessments.id ↳ proposals.assessment_id`. Criar `users.client_lead_id` seria um terceiro lugar guardando o mesmo vínculo, livre para divergir. O isolamento sai de graça: o filtro é o projeto do próprio usuário, sem id vindo do chamador. O comentário mentiroso do `proposals.ts` foi corrigido no mesmo commit |
| A2 | ~~`GET /api/v1/policies/templates/:templateName` devolve **500** para nome inexistente~~ **corrigido** | O bloqueio era o binding `ASSETS` ausente no teste; resolvido apontando o `wrangler.test.jsonc` para `src` (onde os templates moram), e não para `frontend/dist` — que amarraria a suíte a um build prévio. `generate()` passou a lançar `TemplateNaoEncontrado`, e só esse tipo vira 404: 5xx do ASSETS continua 500, porque aí a falha é nossa |
| A4 | **NOVO** — três rotas de `/api/v1/auth` estavam MORTAS por ordem de montagem: `app.route('/api/v1/auth', authApp)` vem ANTES de `app.use('/api/v1/*', authMiddleware)`, e sub-router em Hono é handler — quando responde, a cadeia para. Conferido em produção: `GET /auth/me` devolvia **200 `{}`** sem credencial nenhuma, `POST /auth/reset-password-first` devolvia **403 sempre**, `POST /auth/change-password` estourava **500 sempre**. O primeiro é o fluxo obrigatório de primeiro acesso do `globals.js` | Corrigido: as três passam a declarar `authMiddleware` explicitamente, e entraram no allow-list de auto-serviço do papel read-only (sem isso um `org_user` novo recebia 403 ao definir a primeira senha e ficava trancado para fora). `/logout` fica público de propósito — sessão expirada tem de poder ser limpa |
| A5 | **NOVO** — não havia **política de senha nenhuma**: `/change-password`, `/reset-password`, `/reset-password-first` e a criação de usuário aceitavam qualquer string, inclusive um caractere. É o controle que os relatórios gerados por este produto recomendam ao cliente | Piso de 8 caracteres (NIST SP 800-63B) em senha NOVA. `loginSchema` fica em `min(1)`: recusar no login uma senha curta já cadastrada trancaria a conta sem ganho de segurança |
| A6 | **NOVO, achado ao construir o staging** — produção tem **20 objetos que o `schema.sql` não declara**: 12 tabelas e 8 índices de uma implementação anterior. Nenhuma é referenciada por `src/` (conferido por grep em FROM/INTO/UPDATE/JOIN), e três guardam dado que ninguém lê: `evidence_control_links` (39 linhas), `phase_responses` (50) e `security_kpis` (5). A suíte nunca pegaria isso: ela constrói o banco a partir do `schema.sql`, então vê o que o repositório DECLARA, nunca o que produção TEM | Registrado em `docs/drift-schema-conhecido.txt` e vigiado pelo item 2.6. **Não apagado**: descarte de dado de cliente é decisão de retenção (onda 4.5), com backup na mão, não faxina de CI |
| A3 | **NOVO, achado ao fechar o A2** — o catálogo `listAvailableTemplates()` anunciava `soa-template`, arquivo que **nunca existiu**: o consultor clicava e recebia erro. E omitia `risk-policy` e `vendor-risk-assessment`, que existem e ficavam invisíveis. Havia teste afirmando que a lista contém `soa-template` — ele pinava a falha em vez de pegá-la | Catálogo corrigido para o que existe; `test/policies-templates.test.ts` busca CADA nome pelo ASSETS real e falha se algum não voltar 200. **A lacuna de conteúdo foi fechada depois**: `soa-template.md` passou a existir, com os 93 controles do Anexo A:2022 nomeados um a um (37/8/14/34 por tema), as colunas que a Cl. 6.1.3 d) exige e a orientação sobre exclusão justificada — que é onde a certificação costuma travar. Teste confere a contagem por tema e a presença de controles NOVOS de 2022, para um arquivo montado da lista de 2013 não passar |

### Onda 2 — Confiabilidade da mudança

| # | Ação | Critério de saída |
|---|---|---|
| 2.1 | ~~Ambiente `staging`~~ **feito** | No ar em `https://niso-staging.ness.workers.dev`, com D1, KV, R2, Analytics Engine e secrets próprios. Produção intocada (sonda `200` depois de cada deploy de staging). Sem Vectorize por decisão declarada — apontar staging para o índice de produção faria ingestão de teste gravar vetor no índice do cliente; e sem cron, desligado com `"crons": []` (o primeiro deploy mostrou que ele É herdado, ao contrário do que o comentário dizia) |
| 2.2 | Deploy em dois passos — **escrito, aguardando UM ajuste de Settings** | Job `staging` roda antes de `deploy`, com sonda de fumaça. Confirmado no merge do #161: `staging → skipped`, `deploy → success`. Falta criar o environment `staging` com o secret `CLOUDFLARE_API_TOKEN` e a variável `STAGING_ATIVO=true` — ação de Settings do repositório, que o proxy desta sessão bloqueia (`403` em `/actions/variables`). Ordem importa: environment com secret ANTES da variável, senão o job trava a entrega de produção. Passo a passo em `docs/staging.md` |
| 2.3 | Migration ensaiada em staging — **escrito, sob o mesmo gate do 2.2** | Passo `Ensaiar migrations em staging` no `db-migrate.yml`, antes do apply de produção. Quando pulado, emite `::warning::` dizendo que a migration vai sem ensaio. O banco de staging já está no MESMO ponto de migration que produção (`No migrations to apply`), então o ensaio é válido a partir da próxima |
| 2.6 | **NOVO** — detecção de drift de schema | `.github/workflows/schema-drift.yml`, semanal. Compara o `sqlite_master` de produção com o que o `schema.sql` declara (aplicado num SQLite em memória por `scripts/objetos-do-schema.mjs`, não por regex) e abre issue só em drift NOVO |
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
| 3.1 | ~~OpenAPI gerado dos schemas Zod~~ **feito** | `GET /api/v1/openapi.json` servido (autenticado — o documento enumera caminho, método e a forma de cada corpo, é mapa de superfície de ataque) e `docs/openapi.json` versionado, para mudança de contrato aparecer no diff. 50 caminhos, gerados dos MESMOS objetos Zod que os handlers executam — não há segunda fonte de verdade. A tabela rota↔schema é manual (o runtime não lê o fonte), e três catracas em `test/openapi.test.ts` a mantêm honesta, todas verificadas por mutação: rota validada fora do contrato, entrada órfã, e snapshot velho |
| 3.2 | ~~`mcp-server-niso` consome o contrato gerado~~ **feito** | `nisoContrato(rota, params, corpo)` aceita só chave de `ROTAS` (gerado de `docs/openapi.json`) e exige os campos que o schema marca como obrigatórios. Critério cumprido literalmente e verificado por mutação: renomear a rota no contrato dá `TS2345` no `index.ts`; acrescentar um obrigatório dá `Property 'campo_novo' is missing`. **Achou um bug vivo ao ser escrito**: `niso_respond_auditor_note` mandava POST para `/auditor-notes/:id/respond`, que só aceita PUT — 404, sem nada acusando. Rotas de leitura ficam de fora: o contrato só descreve o que passa por `validateBody`, e inventar entrada para GET seria descrever à mão o que ninguém valida |
| 3.3 | Fechar as leituras de corpo sem schema semântico — **PARCIAL, com catraca** | De 53 para **40**. Fechadas as de maior custo: senha (4 entradas), escopo de acesso (`PUT /admin/users/:id`, que altera `role` e `client_project_id`), as três rotas **sem autenticação** do portal público, e os cinco `PUT /:id` dos módulos — que passavam `body.campo` direto ao `.bind()` e por isso devolviam **500 com corpo parcial**, não 400. As 40 restantes estão sob catraca em `test/validacao-corpo.test.ts`: o número pode cair, nunca subir |
| 3.4 | ~~Reduzir `any` nos caminhos de autorização~~ **feito para o critério declarado** | `requireResourceAccess`, `requireProjectAccess` e `somenteNess` recebiam `user: any`; `resolveApiKeyUser` recebia `c: any`; o middleware lia `(user as any).mfa_pending` — o campo que decide se o segundo fator vale. Todos tipados (`AtorAutorizado`, `Context<…>`, `LinhaChaveApi`). Catraca em `test/validacao-corpo.test.ts`, verificada por mutação. O `any` do RESTO do projeto continua sendo dívida separada — o critério era "nos caminhos de autorização", e é só isso que está fechado |
| 3.5 | ~~SLO + alerta consumindo Analytics Engine~~ **feito** | `scripts/slo.mjs` + `.github/workflows/slo.yml`, a cada 6h. Tetos: 5xx > 1% em 24h, e p95 > 800 ms fora das rotas de IA (a IA leva segundos por desenho; misturá-la faria o p95 subir com a ADOÇÃO). **Verificado contra o dataset real de produção**, não só escrito: 319 requisições em 24h, 0 erros 5xx, p95 0 ms, p99 8 ms. Três mutações confirmaram que morde — teto rebaixado dispara a violação, erro de SQL vira falha em vez de "sem dados", e não-medir (código 2) é distinto de medir-e-violar (código 1) |
| 3.6 | Verificação externa de disponibilidade — **PARCIAL** | `.github/workflows/uptime.yml`: sonda a cada 15 min, de fora da Cloudflare, com as duas checagens da seção 0 do runbook (`/health` e o envelope de validação do login). Abre issue única `uptime` e fecha sozinha ao voltar. **Não** cumpre o "notificando fora do GitHub", e a latência de detecção é de dezenas de minutos porque o schedule do Actions atrasa por fila — melhor que "ninguém vê", pior que monitoramento de verdade |

### Onda 4 — Enterprise de verdade

O que destrava contrato corporativo. Cada item é projeto próprio, com spec no
padrão do Spec Kit antes do código.

| # | Ação | Critério de saída |
|---|---|---|
| 4.1 | ~~SSO por OIDC~~ **feito** | `src/sso.ts` + rotas públicas `/api/v1/public/sso/{iniciar,callback}`, config por tenant em `PUT /api/v1/projects/:projectId/sso` (só ness.). PKCE S256, `state` de uso único, `nonce` conferido, `issuer` do documento de descoberta validado contra o configurado, `aud` = nosso `client_id`, `email_verified` exigido, allow-list de algoritmo (RS256/384/512 — `alg:none` e HS256 recusados). 36 testes com chaves RSA geradas e tokens assinados de verdade: cada recusa corresponde a um ataque conhecido. Provisionamento JIT dá o papel do TENANT, nunca o do IdP, e nunca papel de plataforma; conta de outro cliente não é movida de tenant |
| 4.2 | ~~SCIM 2.0~~ **feito** | `/scim/v2/Users` (GET com filtro `userName eq`, GET por id, POST, PUT, PATCH, DELETE) + `ServiceProviderConfig` que declara o que NÃO suportamos. Token por tenant, guardado como hash. Critério de saída verificado em três partes: o `PATCH active:false` funciona nas DUAS sintaxes que a RFC permite (Okta e Entra se dividem entre elas), a sessão viva cai na hora (sem isso o desligado ficaria dentro 24h), e o login passa a recusar com a MESMA mensagem de senha errada. `DELETE` desativa sem apagar — a trilha referencia a conta. `/Groups` fora, e declarado: o produto não tem grupo, e responder lista vazia faria o IdP acreditar que sincronizou o que não existe. Ver `docs/sso-scim.md` |
| 4.3 | ~~Política de segurança por tenant~~ **feito** | Tabela `project_security_policy` (migration `0026`, aditiva e SEM efeito enquanto vazia — default apertado numa migration trancaria clientes no deploy seguinte). MFA obrigatório, TTL de sessão e allowlist de IP (IPv4 + CIDR), aplicados no `authMiddleware` depois da identidade estar resolvida. Três caminhos de saída garantidos por teste: staff nunca é alcançado por política de tenant; MFA obrigatório não bloqueia as rotas de CONFIGURAR o MFA; allowlist malformada e TTL curto demais são recusados na ESCRITA. Cliente lê a própria política, mas só a ness. escreve — afrouxar de dentro tornaria o controle inútil |
| 4.4 | ~~`audit_logs` imutável~~ **feito, com o limite declarado** | Os triggers da migration `0018` barram UPDATE/DELETE e estão em produção. O degrau que faltava — `DROP TRIGGER` é uma linha para quem administra o banco — está fechado por `src/trilha.ts`: o cron arquiva o dia FECHADO num JSONL no bucket `niso-trilha` (separado do de evidências), e cada dia carrega o SHA-256 do anterior. `GET /api/v1/admin/trilha/verificar` percorre a cadeia e RECALCULA cada digest — comparar metadado seria teatro, porque quem reescreve o objeto reescreve o metadado. Dois testes de adulteração: apagar uma linha quebra o digest; reescrever com digest recalculado quebra o ELO seguinte. **Limite que permanece, declarado no runbook**: não protege contra escrita simultânea no bucket e no banco, nem cobre o dia corrente |
| 4.5 | ~~Retenção~~ **feito** | `docs/retencao.md` declara, e a tabela `RETENCAO` em `src/manutencao.ts` executa — os números ficam num lugar só para os dois não divergirem. Apaga: `notifications` e `ai_chat_history` (180 d), `rate_limits` (7 d após fechar a janela), `auditor_tokens` vencidos (90 d). **Não apaga registro de GRC**, e há teste que insere risco e evidência com 3000 dias exigindo que sobrevivam. `audit_logs` fica de fora por duas barreiras somadas — os triggers recusam DELETE, e o crescimento é contido pelo arquivamento do 4.4. A consequência (a tabela cresce sem limite no D1) está assumida por escrito, com o caminho de saída: podar exige derrubar o trigger de propósito, nunca uma rotina automática |
| 4.6 | ~~Portabilidade do tenant~~ **feito** | `GET /api/v1/projects/:projectId/export`. Tabelas descobertas do BANCO (`sqlite_master` + `PRAGMA`), não de lista — export incompleto é pior que nenhum, porque parece completo, e há teste que cria tabela em tempo de execução para provar que ela entra. Credenciais (`api_keys`, `auditor_tokens`) ficam de fora por decisão explícita. `sha256` sempre; HMAC quando `EXPORT_SIGNING_KEY` existir, com o motivo escrito no manifesto quando não. Isolamento pelo `projectAccessMiddleware`, com teste de vizinho. Ver `docs/portabilidade.md` |

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
