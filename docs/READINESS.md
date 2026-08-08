# Production Readiness — nISO

> Estado de prontidão para produção, honesto e rastreável. Atualizado em 2026-08-08.
> Legenda: ✅ verificado · ⚠️ risco conhecido · ⏳ pendente (dono indicado).

## Entrega e deploy

- ✅ **Deploy automatizado** (`.github/workflows/deploy.yml`): dispara no push para
  `main` e via `workflow_dispatch`. Antes disso o deploy era manual e produção
  ficava semanas atrás do `main` — origem, por exemplo, do "questionário sumido".
- ✅ **Gate de deploy**: `tsc` + testes + build do frontend antes de publicar;
  **recusa deploy com migration pendente**.
- ✅ **Ambiente `production`** — aprovação humana configurável em Settings
  ("Required reviewers" no environment).
- ⚠️ **Teste flaky pode bloquear deploy**: o pool `@cloudflare/vitest-pool-workers`
  às vezes emite `TypeError: fetch failed / other side closed` no teardown entre
  arquivos (erro do runtime de teste, não do app). Passou em #60/#61, mas é
  intermitente. **Mitigado no PR #63**: retry de até 2 tentativas no passo de
  testes de `ci.yml` e `deploy.yml` — falha determinística falha nas duas (não
  mascara bug real), só a flakiness é resgatada. (Sem `dangerouslyIgnoreUnhandledErrors`.)

## Segurança

- ✅ **Auth por API key real** (`X-API-Key`), com papéis (`consultant`/`auditor`/
  `read`/`write`/`admin`) e **escopo de projeto** (chave presa a um projeto; falha
  fechado sem projeto). Ver `src/middleware/auth.ts`, `src/auth-policy.ts`.
- ✅ **Separação consultor/auditor** no backend (independência ISO 27001 §9.2).
- ✅ **MFA** no login, revogação de sessão, `X-nISO-Signature` em webhooks.
- ✅ **CSP + security headers + `security.txt`**, rate limit, body guard,
  isolamento multi-tenant (`projectAccessMiddleware`), audit-log append-only.
- ✅ **Chaves de API**: só o hash (SHA-256) é armazenado; texto puro exibido uma
  vez; gestão exclusiva do Platform Admin (tela + gate de backend); expiração
  padrão de 90 dias na criação pela UI.
- ⏳ **Rotação de segredos** (chaves de agente, `CLOUDFLARE_API_TOKEN`): definir
  cadência. Dono: **operação**.

## Testes e qualidade

- ✅ Suíte de **worker** (~340 testes) roda no CI e no gate de deploy.
- ⚠️→✅ Suíte de **frontend** (140, jsdom) era excluída do CI (`vitest.config.mts`
  ignora `frontend/**`) — só rodava localmente. **Passa a rodar no CI e no deploy
  a partir do PR #63.**
- ✅ CI por PR + review automatizado (Codex, CodeRabbit).
- ⏳ **Teste E2E da integração MCP** contra o ambiente publicado — roteiro em
  [`docs/mcp-e2e-validation.md`](./mcp-e2e-validation.md) (criar chave real → MCP
  conecta → consultor escreve, auditor é barrado, projeto errado recusado). Hoje há
  cobertura unitária da política (`test/apikey-role.test.ts`); falta rodar o loop.
  Dono: **plataforma** (emitir a chave pela nova tela de API keys).

## Dados e operação

- ✅ **Backup do D1**: `npm run db:backup` (runbook em `backups/README.md`).
- ✅ **Migrations gated** no deploy (não aplica sozinho; recusa código à frente do schema).
- ✅ **Log estruturado**: uma linha JSON por request (`wrangler tail`).
- ✅ **Analytics Engine**: binding `ANALYTICS` (dataset `niso_metrics`) ligado no
  `wrangler.jsonc`; o dataset é criado no primeiro deploy. O código já era tolerante
  (`registrarMetrica` no-op sem o binding), então a mudança é aditiva. *Se o plano
  da conta não tiver Analytics Engine, o `wrangler deploy` falha nesse passo (deploy
  é atômico — produção não cai); nesse caso, reverter só este binding.*
- ⏳ **Alerta/monitoramento ativo** (erro 5xx, latência, falha de deploy): confirmar
  se há dashboard/alerta consumindo os logs/métricas. Dono: **operação**.
- ⏳ **Plano de DR / teste de restore** do backup: validar restauração ao menos uma
  vez. Dono: **operação**.

## Prova de produção (probe em 2026-08-08T13:22Z)

Evidência de que produção reflete o `main` (não só "o deploy foi tentado"):

- `GET https://niso.ness.workers.dev/health` → `{"status":"ok"}`.
- `/login` serve o shell contendo `nav-api-keys` → a **tela de API keys (#61)** está no ar.
- O bundle `/assets/login-*.js` contém `openJornadaQuestionnaire` → o **questionário
  voltou** em produção (a regressão era produção defasada; o deploy automático corrigiu).

Repetir este probe (health + um marcador do commit) a cada deploy relevante.

## Veredito

- **Piloto assistido com cliente real: pronto.** Pipeline, segurança e dados estão
  em pé, e o probe acima confirma produção no `main`.
- **GA / uso desassistido:** fechar os ⏳ acima (E2E do MCP, Analytics/alerta,
  DR testado, rotação de segredos). O ⚠️ do teste flaky é mitigado pelo PR #63.
