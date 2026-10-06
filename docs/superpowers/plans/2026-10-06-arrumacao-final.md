# Arrumação final do n.iso — plano de implementação

> Nome do cliente e de pessoas trocados por `<cliente>` ao entrar na `main` (2026-10-06): o repositório é público. A lista exata de caminhos para a Tarefa 13 sai de `git log --all --name-only --diff-filter=A`, não deste arquivo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar o produto em produção: corrigir o que o usuário vê quebrado, fixar uma URL canônica, limpar o GitHub e os dados de cliente, reescrever a documentação velha e cortar uma versão.

**Architecture:** ondas sequenciais, um PR por tarefa de código (CI verde no SHA atual, branch em dia, merge um por vez, deploy, sonda). Higiene do GitHub e reescrita de histórico só depois de todo o código entrar, porque a reescrita muda todos os SHAs.

**Tech Stack:** Cloudflare Workers + Hono + D1 + KV + R2 + Vectorize, SPA vanilla JS (Vite), vitest com @cloudflare/vitest-pool-workers, GitHub Actions.

**Spec:** desenho aprovado em chat em 2026-10-06 (ondas 0–7), mais os inventários `docs/superpowers/arrumacao/inventario-docs.md` e `inventario-github.md`, e o relatório de finalização (resumido na seção "Fatos de base" abaixo).

## Decisões do dono (2026-10-06)

1. O repositório fica **público até o fim** desta arrumação; o dono o torna privado quando o agente avisar (Tarefa 14).
2. **Reescrever o histórico** para apagar o material da <cliente>: sim, por último (Tarefa 13).
3. Hosts legados `n-iso.ness.com.br` e `niso.ness.workers.dev`: **redirecionamento 308** para `niso.ness.com.br` (sugestão do agente; executar salvo objeção do dono).
4. **Remover** "Gerar SoA (IA)". Tela "Conhecimento" (RAG/Vectorize): **DECISÃO PENDENTE** (religar ou remover) — Tarefa 6 só executa com a resposta.
5. Versão: a que a convenção do CHANGELOG indicar (Tarefa 12).

## Fatos de base (medidos em 2026-10-06; reconfira antes de afirmar)

- `origin/main` = `c06d15c` (#283). Produção em `/health` acompanha o último deploy verde. PR aberto #284 (DPIA status + catraca de colunas); #277 (TypeScript 7, decisão do dono, fora deste plano); #189 (TPRM, draft, obsoleto).
- `any` em `src/`: TETO 566 (`test/any-catraca.test.ts:19`). Catracas ativas: any, vazamento de erro (`test/erro-sem-vazamento.test.ts`), colunas (no #284).
- Tabelas no `schema.sql`: 58. Última migration: 0043.

## Global Constraints

- Branch sempre a partir de `origin/main`; um PR por tarefa; merge só com CI (`test`, `e2e`, `audit`) verde **no SHA atual** e `behind_by == 0`; depois do merge, esperar o deploy e sondar `/health` (versão = SHA do merge) e um comportamento.
- Ritmo do dono: testes locais **só dos arquivos tocados** + `npx tsc --noEmit`; a suíte completa é do CI.
- Commits em português, conventional, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Texto visível: PT-BR, marca `ness.` (minúsculo, com ponto) e produto `n.iso`; sem emoji, sem itálico. Identificadores de código podem manter `niso`/`NISO_*`. **Não renomear** o cabeçalho de webhook `X-nISO-Signature` (quebra receptores dos clientes).
- Frontend sem handler inline nem `<script>` inline (CSP `script-src 'self'`); eventos por `data-action`.
- Schema muda em dois lugares (`schema.sql` + migration); `schema.sql` em LF (nunca regravar em CRLF).
- Nunca afirmar "mergeado/aplicado/em produção" sem a evidência da regra número um do AGENTS.md.
- Dados de produção: só leitura, salvo pedido explícito do dono.

## Review Focus

- E-mail de proposta, de ciência e de convite gerado a partir de staging ou de host legado: o link precisa apontar para `niso.ness.com.br` (Tarefa 7, teste do `APP_URL`).
- Callback de SSO e `base_url` do SCIM acessados por host legado: o valor precisa ser o canônico, senão o IdP do cliente recusa o login (Tarefa 7).
- POST em host legado (webhook, SCIM, OAuth token): o redirecionamento precisa ser 308 (preserva método e corpo), não 301/302 (Tarefa 8).
- DPIA criada ou editada pela tela: o texto digitado precisa persistir e voltar na leitura (Tarefa 4).
- ROPA aprovada editada sem `status`: não pode voltar para rascunho nem perder assinaturas (Tarefa 2).

---

## Onda 1 — fechar o que está em voo

### Task 1: Mergear o #284 (DPIA status + catraca de colunas + entrevista 500)

**Files:** nenhum (PR existente `fix/dpia-status-e-colunas`).

- [ ] **Step 1:** `gh pr checks 284` até `test`, `e2e`, `audit` verdes; conferir `gh api repos/resper1965/n.iso/compare/main...pull/284/head --jq .behind_by` = 0 (se >0, `gh pr update-branch 284` e esperar o CI de novo).
- [ ] **Step 2:** `gh pr merge 284 --squash --delete-branch`; confirmar `merged=true`.
- [ ] **Step 3:** esperar o deploy (`gh run list --workflow=deploy.yml --limit 1`) com `conclusion=success` e `headSha` = SHA do merge; `curl -s https://niso.ness.com.br/health` com esse `version`.

## Onda 2 — segurança e funções quebradas

### Task 2: ROPA — PUT não aprova nem reverte aprovação

**Files:**
- Modify: `src/routes/ropa.ts` (PUT, hoje grava `body.status || 'Draft'`), `src/schemas/domain.ts` (`ropaSchema.status`, hoje texto livre)
- Test: `test/ropa-status-put.test.ts` (novo)

Mesma correção já feita para a DPIA no #284 (`dpiaSchema` + guarda em `src/routes/platform.ts`, PUT `/dpia/:id`): copiar o padrão.

- [ ] **Step 1: teste falhando** — casos: (a) PUT `{status:'Approved'}` em ROPA `Draft` ⇒ espera 400 e status/assinaturas inalterados; (b) ROPA `Approved` + PUT só com um campo de conteúdo (sem `status`) ⇒ espera 200 e status continua `Approved`, `ciso_approved_by` intacto; (c) ROPA `Approved` + PUT com `status:'Draft'` ⇒ 400 apontando "Revogar aprovação"; (d) PUT `{status:'Under Review'}` em `Draft` ⇒ 200.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2 --testTimeout=120000 test/ropa-status-put.test.ts` ⇒ FAIL em (a), (b), (c).
- [ ] **Step 3: implementar** — `ropaSchema.status`: `z.enum(['Draft','Under Review'], { error: "status aceita 'Draft' ou 'Under Review'. Aprovar o ROPA é pelo fluxo de aprovação, não pela edição." }).optional().nullable()`; no PUT, ler `status` atual (`SELECT project_id, status FROM ropa_records WHERE id = ?`), recusar mudança de status se `Approved` (mesma mensagem da DPIA trocando o nome), e gravar com `setParcial(body, { <colunas de conteúdo do ROPA>: null, status: 'Draft' })` de `src/helpers.ts` em vez do UPDATE com todas as colunas. Conferir se o frontend do ROPA oferece `Approved` no formulário de edição (`frontend/src/views/privacy.js`) e retirar, como no #284.
- [ ] **Step 4:** rodar o teste novo + `test/revogar-aprovacoes.test.ts` + `test/assinatura-governanca.test.ts` + `test/any-catraca.test.ts` ⇒ PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `fix(ropa): PUT não aprova ROPA nem a devolve a rascunho`; PR; ciclo de merge da Task 1.

### Task 3: Remover "Gerar SoA (IA)" (rota inexistente)

**Files:**
- Modify: `frontend/src/views/compliance.js:684` (botão `data-action="generateSoA"`), `:2396-2426` (`generateSoA` e `window.generateSoA`); `mcp-server-niso/src/ferramentas.ts:241` (definição `niso_generate_soa`) e `:573-576` (case); `src/middleware/rate-limit.ts:22` (tirar `generate-soa` da regex); `test/input-validation.test.ts:101` (caso da rota que não existe); `test/contrato-mcp.test.ts:83` (`toHaveLength(24)` ⇒ 23) e qualquer outra contagem de ferramentas (`git grep -n "24 ferramentas\|toHaveLength(24)" -- test docs mcp-server-niso src`)
- Test: novo caso em `frontend/test/` que afirma que a tela de conformidade não renderiza botão `generateSoA`

- [ ] **Step 1:** teste de frontend falhando (o botão existe hoje).
- [ ] **Step 2:** remover botão, função, export em `window`, ferramenta MCP, regex e o caso de teste da rota; ajustar contagens.
- [ ] **Step 3:** `cd frontend && npx vitest run --maxWorkers=2 <teste>`; `npx vitest run --maxWorkers=2 --testTimeout=120000 test/contrato-mcp.test.ts test/input-validation.test.ts`; `npx tsc --noEmit` (raiz e `mcp-server-niso`).
- [ ] **Step 4:** commit `refactor: remove "Gerar SoA (IA)", rota que não existia desde o refactor 72f1b59`; PR; merge.

### Task 4: DPIA — o texto editado pela tela não é salvo

Causa: `frontend/src/views/privacy.js:409-416` e `:454-460` enviam colunas legadas (`system_name`, `data_flow_description`, `data_subjects_types`, `personal_data_categories`, `risks_identified`, `mitigation_measures`, `dpo_opinion`), que existem em `dpia_assessments` (`schema.sql`) mas que a API não grava: o POST (`src/routes/projects.ts:1039`) e o PUT (`setParcial` em `src/routes/platform.ts`) só gravam `processing_name`, `data_category_risk`, `necessity_proportionality`, `technical_measures`, `residual_risk_level`, `dpo_recommendations`, `ropa_id`, `status`.

Decisão de desenho (menor diff, sem migration, sem perder dado já gravado): **a API passa a aceitar e gravar também as 7 colunas legadas** que a tela usa e lê.

**Files:**
- Modify: `src/schemas/domain.ts` (`dpiaSchema`: acrescentar as 7 colunas como `longoOpcional`), `src/routes/projects.ts` (INSERT da DPIA inclui as 7), `src/routes/platform.ts` (mapa do `setParcial` do PUT inclui as 7 com valor vazio `null`), `src/services/pedidos.ts` (`COLUNAS_DPIA`: incluir as 7 para que editar o texto substitua o pedido de aprovação aberto — confira o nome real da constante)
- Test: `test/dpia-campos-tela.test.ts` (novo)

- [ ] **Step 1: teste falhando** — POST com `system_name`, `risks_identified`, `dpo_opinion` ⇒ GET devolve os mesmos valores; PUT alterando `mitigation_measures` ⇒ GET devolve o novo valor e os outros campos intactos; PUT de texto numa DPIA com pedido de aprovação aberto ⇒ pedido vira `substituido`.
- [ ] **Step 2:** rodar ⇒ FAIL (valores voltam `null`).
- [ ] **Step 3:** implementar as 4 mudanças acima.
- [ ] **Step 4:** rodar o teste novo + `test/dpia-status-put.test.ts` + `test/dpia-aprovacao.test.ts` + `test/pedidos.test.ts` + `test/colunas-catraca.test.ts` + `test/openapi.test.ts` (regerar `npm run openapi` se o schema mudar; arquivos gerados em LF) ⇒ PASS.
- [ ] **Step 5:** commit `fix(dpia): texto editado pela tela passa a ser gravado`; PR; merge.

### Task 5: Entrevista — tela e API em formatos diferentes; botão "IA" da evidência sem ação

**Files:**
- Modify: `frontend/src/views/project.js:797-804` (payload da entrevista) e/ou `src/schemas/domain.ts:278` (`interviewSchema`); `frontend/src/views/compliance.js:1501` (`data-action="evaluateEvidenceAI"` sem função) — criar a função chamando `POST /api/v1/evidence/:id/evaluate` (rota existe em `src/routes/evidence.ts:163`) e exibir o resultado com `escapeHTML`, ou remover o botão se a avaliação já existir em outro lugar da mesma tela
- Remove (código morto confirmado sem chamador): `downloadExecutiveReport` (`frontend/src/views/monitor.js:185-187`, `:1863`), `openInviteClientModal`/`doInviteClient` (`frontend/src/globals.js:1107-1129`, senha `'Niso@' + Math.random()`), campo `popularity` aleatório (`src/routes/platform.ts:288`)
- Test: `frontend/test/entrevista-envio.test.js` e `frontend/test/evidencia-avaliar.test.js` (novos)

- [ ] **Step 1:** confirmar se a tela de entrevistas é alcançável pelo menu (`project.js:726-830`). Se NÃO for, remover a tela e a rota e registrar no PR; se for, seguir.
- [ ] **Step 2: testes falhando** — o envio da entrevista monta `{ answers: [...] }` no formato do `interviewSchema`; o clique em "IA" chama a rota de avaliação com o id certo.
- [ ] **Step 3:** implementar; remover o código morto listado.
- [ ] **Step 4:** rodar os testes novos + `test/entrevistas-resumo.test.ts` ⇒ PASS.
- [ ] **Step 5:** commit `fix(frontend): entrevista no formato da API, botão de avaliação por IA e remoção de código morto`; PR; merge.

### Task 6: Tela "Conhecimento" — DECISÃO PENDENTE

Só executar depois da resposta do dono.
- **Religar:** recriar `GET /api/v1/projects/:projectId/knowledge/search` e `POST .../knowledge/ingest` usando `KnowledgeService` (`src/services/knowledge-service.ts:20`) e `ingestSchema` (`src/schemas/domain.ts:237`), com `projectAccessMiddleware`, rate limit `ia` (já cobre `ingest`), `validateBody`, modelo `EMBEDDING_MODEL`; criar `window.viewKnowledge`; testes de isolamento por projeto (busca de A nunca devolve item de B) e de escape no frontend. Tamanho M.
- **Remover:** item de menu (`frontend/login.html:390`), `frontend/src/views/ai.js` (parte de conhecimento), `ingestSchema`, `KnowledgeService.ingest` se ficar sem uso, `ingest` da regex de rate limit, testes de frontend que cobrem a tela (`frontend/test/ai-views.test.js`, só a parte de conhecimento). Tamanho S.

## Onda 3 — URL canônica `niso.ness.com.br`

### Task 7: Fonte única da URL

**Files:**
- Create: `src/config/url.ts`
- Modify: `src/routes/propostas.ts:430,476,498`, `src/routes/pedidos.ts:250,287`, `src/routes/users.ts:127`, `src/index.ts:215-219` (security.txt), `:240-244` (`CORS_ORIGENS`), `:522` (`resourceMetadata.resource`), `src/openapi.ts:364`, `src/mcp/servidor.ts:238` (`allowedHostnames`), `src/routes/public.ts:249-250` (`redirectUriDe`), `src/routes/projects.ts:58` e `src/routes/scim.ts:84` (`base_url`/`location` do SCIM), `wrangler.jsonc` (var `APP_URL` em produção e em `env.staging`)
- Test: `test/url-canonica.test.ts` (novo)

```ts
// src/config/url.ts
/**
 * Endereço canônico do n.iso. Links de e-mail, callback de SSO, base do SCIM e o recurso
 * OAuth do MCP saem daqui, NUNCA do host da requisição: o IdP do cliente cadastra um
 * callback só, e um host legado gerava outro. Staging sobrescreve por `env.APP_URL`.
 */
export const APP_URL_PADRAO = 'https://niso.ness.com.br';

export function appUrl(env?: { APP_URL?: string }): string {
  return (env?.APP_URL || APP_URL_PADRAO).replace(/\/+$/, '');
}

/** Hosts que o Worker atende. Os legados só redirecionam (ver middleware de redirecionamento). */
export const HOST_CANONICO = 'niso.ness.com.br';
export const HOSTS_LEGADOS = ['n-iso.ness.com.br', 'niso.ness.workers.dev'];
```

- [ ] **Step 1: teste falhando** — com uma requisição para `https://n-iso.ness.com.br/...`: o `redirect_uri` do início de SSO, o `base_url` do SCIM e o link do e-mail de proposta começam com `https://niso.ness.com.br`; o `security.txt` não contém `nISO`; `CORS_ORIGENS` e `allowedHostnames` do MCP vêm da mesma lista; `localhost`/`127.0.0.1` saem de `allowedHostnames` quando `ENVIRONMENT === 'production'` (o CORS mantém loopback, que é documentado e seguro).
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3:** implementar trocando cada literal por `appUrl(c.env)`; `security.txt` aponta para `https://github.com/resper1965/n.iso/...`; `wrangler.jsonc`: `"vars": { "APP_URL": "https://niso.ness.com.br" }` e em `env.staging.vars` `"APP_URL": "https://niso-staging.ness.workers.dev"` (conferir a estrutura de `vars` existente antes de editar); acrescentar `APP_URL?: string` ao tipo `Bindings`.
- [ ] **Step 4:** rodar o teste novo + `test/cors-allowlist.test.ts` + `test/sso*.test.ts` + `test/scim*.test.ts` + `test/propostas*.test.ts` + `test/pedidos-publico.test.ts` + `test/oauth*.test.ts` ⇒ PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `refactor(url): endereço canônico em src/config/url.ts`; PR; merge.

### Task 8: Hosts legados redirecionam (308)

**Files:**
- Modify: `src/index.ts` (no `fetch` do `export default`, antes de `ROTAS_OAUTH`), `wrangler.jsonc` (comentário dos domínios)
- Test: `test/redirecionamento-legado.test.ts` (novo)

```ts
// src/index.ts, dentro do export default, antes do roteamento:
fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => {
  const url = new URL(req.url);
  if (HOSTS_LEGADOS.includes(url.hostname)) {
    // 308 preserva método e corpo: POST de webhook, SCIM e token OAuth chegam inteiros.
    return Response.redirect(`${appUrl(env)}${url.pathname}${url.search}`, 308);
  }
  return ROTAS_OAUTH(url.pathname) ? provider.fetch(req, env as any, ctx) : fetchHono(req, env, ctx);
},
```

- [ ] **Step 1: teste falhando** — `GET https://n-iso.ness.com.br/health?x=1` ⇒ 308 com `Location: https://niso.ness.com.br/health?x=1`; `POST https://niso.ness.workers.dev/scim/v2/Users` ⇒ 308; `GET https://niso.ness.com.br/health` ⇒ 200; host de staging (`niso-staging.ness.workers.dev`) NÃO redireciona.
- [ ] **Step 2:** rodar ⇒ FAIL. **Step 3:** implementar. **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5:** antes do merge, conferir no `deploy.yml` e no `uptime.yml` que nenhuma sonda usa host legado esperando 200 (hoje: staging em workers.dev de staging, uptime em `niso.ness.com.br` — ok).
- [ ] **Step 6:** commit `feat(url): hosts legados redirecionam (308) para niso.ness.com.br`; PR; merge; sonda em produção: `curl -sI https://n-iso.ness.com.br/health` ⇒ `308` e `location: https://niso.ness.com.br/health`.

## Onda 4 — dados de cliente e higiene do repositório

### Task 9: Tirar material de cliente e pessoas do código atual

**Files:**
- Delete: `deliveries/` (inteiro), `seed_<cliente>.sql`, `seed_<cliente>_full.sql`, `scratch/` (inteiro), `specs/2026-07-16-<cliente>-ui-vault-alerts-design.md`, `templates-politicas-ptbr/` (cópia byte a byte de `src/templates/policies/v2022`; conferir com `diff -r` antes), `frontend/README.md` (template React+Vite)
- Modify: `migrations/0011_seed_twyn_governance.sql` (já aplicada: NÃO apagar; trocar o conteúdo por um comentário explicando que o seed foi removido do repositório e um `SELECT 1;`, para banco novo não receber dados do cliente; confirmar que nenhum teste depende desses dados), `frontend/src/views/grc.js:315`, `frontend/src/views/monitor.js:764`, `src/constants.ts:194` (nomes reais fixos ⇒ genéricos ou vindos da matriz de Governança), `docs/plano-2026-10-fechamento.md` (e-mail pessoal), `docs/superpowers/specs/2026-09-30-agente-paridade-consultor-design.md` e o plano correspondente (<cliente> e caminho local), `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md:110` (link privado claude.ai)
- Test: `test/sem-dado-de-cliente.test.ts` (novo): lê os arquivos versionados via `import.meta.glob` (padrão de `test/any-catraca.test.ts`) e reprova `<cliente>`, `@<cliente>.com` e os nomes reais encontrados

- [ ] **Step 1:** teste falhando. **Step 2:** remover/neutralizar. **Step 3:** rodar o teste + `test/migration-*.test.ts` + `test/schema-contract.test.ts` + testes de frontend de `grc`/`monitor` ⇒ PASS.
- [ ] **Step 4:** commit `chore: remove dados de cliente e de pessoas do repositório`; PR; merge.

### Task 10: Higiene do GitHub e do git local

Executar só depois das Tasks 1–9 mergeadas.
- [ ] **Step 1:** apagar branches remotas mortas, conferindo uma a uma que o PR está mergeado ou fechado (`gh pr list --state all --head <branch>`): `feat/agente-mcp-remoto`, `feat/autoridade`, `feat/autoridade-main`, `feat/prova-auditor`, `feat/prova-auditor-main`, `feat/ciencia-link`, `chore/inventario-2026-09-16`, e as branches das tarefas deste plano. **NÃO apagar** `feat/camada-msp` (38 commits MSP vivos) nem `docs/acesso-stakeholders` antes da Task 11.
- [ ] **Step 2:** fechar o PR #189 (TPRM, draft desde 17/09) com comentário; apagar a branch `claude/*` dele.
- [ ] **Step 3:** configuração: `gh repo edit resper1965/n.iso --homepage https://niso.ness.com.br --enable-wiki=false --enable-projects=false`; descrição em PT-BR com `n.iso` e `ness.`.
- [ ] **Step 4:** git local: `git remote set-url origin https://github.com/resper1965/n.iso.git`; remover worktrees já mergeados (`git worktree remove`; não remover os que têm alteração não commitada — listar para o dono); `git branch -D` das locais com remota `gone`.
- [ ] **Step 5 (dono):** mover `CLOUDFLARE_API_TOKEN` de secret de repositório para secret do environment `production` (o AGENTS.md exige isso e hoje não acontece). O agente não lê nem copia o valor: o dono cria o secret no environment e apaga o de repositório; o agente confirma rodando um deploy.

## Onda 5 — documentação

### Task 11: Reescrever e arquivar a documentação

**Files:**
- Create: `docs/arquivo/README.md` (índice: o que foi arquivado, quando e por quê)
- Move para `docs/arquivo/` (com `git mv`): `docs/READINESS.md`, `docs/api-triage-2026-08.md`, `docs/backlog-plan.md`, `docs/journey-questionnaire-spec.md`, `docs/readiness-check-spec.md`, `docs/security-owasp-2026-08.md`, `docs/enterprise-grade-plan.md` (nota no topo: restam 2.2/2.3 e 3.6), `specs/001-codebase-refactor-design.md`, `specs/001-featurename-baseline-speconly/`, `specs/002-ui-ux-homogenization-design.md`, `docs/superpowers/specs/2026-09-22-n360-arquitetura-design.md` (nota: superada), os planos já executados de `docs/superpowers/plans/` (com linha "executado em PR #X"), `docs/design/handoff-ness-v1/COMO-APLICAR.md` e `implementacao/PATCH-ui.md`; parte de runbook de agosto em `migrations/README.md` (L1–264)
- Rewrite: `AGENTS.md` (repo, CodeQL e ruleset `test`+`e2e` reais; números com método: `any` 566, testes backend e frontend contados, leituras de corpo, mock de D1 = 0, `npm audit`; header 64px; rotas e bindings atuais), `README.md` (contagens, `/health` em `niso.ness.com.br`, badges em `resper1965/n.iso`, bindings), `CONTRIBUTING.md` (o que o CI roda de fato), `SECURITY.md` (`n.iso`), `docs/testing.md`, `design.md` (tokens apontando para `frontend/src/style.css :root`), `docs/README.md` (índice), `CONSTITUTION.md` (uma constituição só; apagar `.specify/memory/constitution.md` e corrigir `.specify/feature.json`)
- Fix: domínio em `docs/sso-scim.md`, `docs/portabilidade.md` (e citar as colunas secretas omitidas no export), `docs/mcp-e2e-validation.md`, `docs/runbook-incidente.md:16`, `docs/staging.md`, `docs/agente/arquitetura.md` e `docs/agente/seguranca.md` (rotas bloqueadas e `consultoria_admin`); "nISO" ⇒ `n.iso` no texto visível (inclusive `src/templates/reports/certification-readiness-report.md:2,33`, que vai ao cliente, `llms.txt`, `mcp-server-niso/README.md`, `.github/ISSUE_TEMPLATE/*`); mojibake em `frontend/src/style.css:751`; `public/index.html` ("Hello, World!") se não for servido
- Status: `docs/plano-2026-10-fechamento.md` (tabela com o estado real), plano mestre e plano de stakeholders (marcar o que foi entregue), e levar os docs da branch `docs/acesso-stakeholders` para a `main`

- [ ] **Step 1:** cada número que entrar em doc é medido por comando e o comando fica escrito ao lado (regra número um do AGENTS.md).
- [ ] **Step 2:** `npx vitest run --maxWorkers=2 test/landing-raiz.test.ts test/openapi.test.ts` e `cd frontend && npm run build` (o build não pode depender de arquivo movido).
- [ ] **Step 3:** commits separados por bloco (arquivo, reescrita, correções); PR; revisão independente focada em afirmação sem evidência; merge.

### Task 12: Cortar a versão

**Files:** `CHANGELOG.md`, `package.json` (versão), tag git.
- [ ] **Step 1:** ler o cabeçalho e as últimas versões do `CHANGELOG.md` para extrair a convenção (SemVer? major em mudança de contrato?). Classificar o `[Não publicado]`: multiconsultoria (novo modelo de organização), papel `stakeholder`, mudanças de contrato de API (400 em corpo antes aceito no T3, `status` da DPIA/ROPA) ⇒ se a convenção trata quebra de contrato como major, a versão é 11.0.0; registrar o raciocínio no PR.
- [ ] **Step 2:** consolidar o `[Não publicado]` em seções (Adicionado, Alterado, Corrigido, Segurança, Removido), incluir #254–#284 e o que estiver faltando (ex.: #261), tirar os "estacionados" já resolvidos.
- [ ] **Step 3:** PR; merge; tag anotada `vX.Y.Z` no SHA do merge; `git push origin vX.Y.Z`.

## Onda 6 — histórico, fechamento e verificação

### Task 13: Reescrever o histórico (decisão 2 do dono) — operação destrutiva

Pré-requisitos: Tasks 1–12 mergeadas; nenhum PR aberto além do #277; backup do repositório (`git clone --mirror` para uma pasta fora do OneDrive).
- [ ] **Step 1:** listar exatamente o que sai do histórico: `deliveries/`, `seed_<cliente>*.sql`, `scratch/`, a spec da <cliente>, o conteúdo antigo da `migrations/0011`, e substituição dos nomes/e-mails reais (arquivo de substituição para `git filter-repo --replace-text`). Mostrar a lista ao dono e esperar "sim".
- [ ] **Step 2 (dono):** desativar temporariamente o ruleset "main protegida" (bloqueia force-push; `bypass_actors` é vazio).
- [ ] **Step 3:** em um clone `--mirror` novo, `git filter-repo --invert-paths --path deliveries/ --path scratch/ --path seed_<cliente>.sql --path seed_<cliente>_full.sql --path specs/2026-07-16-<cliente>-ui-vault-alerts-design.md --replace-text <arquivo>`; conferir com `git log --all --oneline -- deliveries | wc -l` = 0 e um `git grep -i <cliente> $(git rev-list --all)` vazio.
- [ ] **Step 4:** `git push --force --mirror` (com o dono acompanhando); reativar o ruleset.
- [ ] **Step 5:** limites a avisar ao dono: forks e clones existentes continuam com o histórico antigo; as referências de PR (`refs/pull/*`) e as visualizações em cache do GitHub só somem pedindo ao GitHub Support ("remove sensitive data", com a lista de SHAs); todos os SHAs citados em docs e no CHANGELOG mudam (o `/health` passa a mostrar SHAs novos).
- [ ] **Step 6:** recriar worktrees locais a partir do novo `origin/main`; descartar os antigos.

### Task 14: Fechamento

- [ ] **Step 1:** sonda final em produção: `/health` (SHA do último merge), login com corpo vazio (400 com campos nomeados), `/api/v1/pedidos` sem sessão (401), `/api/v1/public/pedidos/ver` com token falso (404 uniforme), `/proposta` (200), host legado (308).
- [ ] **Step 2:** avisar o dono: **pode tornar o repositório privado**; lembrar que com o repo privado o Actions depende da cobrança resolvida.
- [ ] **Step 3:** fechar o plano mestre com o estado final e o que ficou para o dono (MFA da conta `platform_admin` do dono, catálogo, teste de ponta a ponta de proposta, F2, environment de staging, #277, D2/F4, F5, T5).
