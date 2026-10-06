# Inventário da documentação do n.iso (06/10/2026)

> Nome do cliente trocado por `<cliente>` ao entrar na `main` (2026-10-06). Os itens das seções 1 a 5 foram tratados na arrumação final (Tarefas 9 e 11).

Base: `origin/main` em `c51549e` (#282), lida pelo worktree `niso-refs`, que tem mais 10 commits do PR de isolamento. Esses commits só mexem em código e teste, não em documentação. Levantamento somente leitura.

**Cobertura:** a raiz (README, AGENTS, CONTRIBUTING, SECURITY, CHANGELOG), `migrations/`, `backups/`, `test/e2e/`, `mcp-server-niso/`, `frontend/README`, `.github/`, `templates-politicas-ptbr/`, `deliveries/` e `wrangler.jsonc` foram conferidos contra o código.

**Não conferido contra o código:** `docs/*.md`, `docs/agente/**`, `docs/superpowers/**`, `specs/**`, `CONSTITUTION.md`, `.specify/` e `docs/design/**`. A conferência desses ficou em dois levantamentos paralelos que não terminaram antes da entrega. Desses arquivos, só as referências de URL e de nome entraram (por grep, na seção 5).

## Medidas de referência (medidas agora)

| Item | Valor atual | Como foi medido |
|---|---|---|
| Tabelas em `schema.sql` | **58** | linhas `CREATE TABLE`, igual na main |
| Última migration | **0043_pedidos_imutavel** | 41 arquivos numerados; não existem 0001 nem 0031–0033 (o MSP revertido no #206) |
| Arquivos de rota em `src/routes` | **41** | sem contar os `.test.ts` |
| `any` em `src/` | **566** | igual ao `TETO` de `test/any-catraca.test.ts` |
| Testes do backend | **145** | `test/*.test.ts` na main (146 com o PR) |
| Testes do frontend | **42** em jsdom + **5** e2e Playwright | `frontend/test` e `frontend/e2e`; os e2e rodam no CI |
| Leituras de corpo sem schema | ~6 | `c.req.json` cru em control-adequacao, controls, phase-questionnaire e scim (3); o T3 (#259) fechou o resto |
| `npm audit` | 4 vulnerabilidades (3 moderadas, **1 alta**), todas do undici | |
| Repositório | `resper1965/n.iso`, **público** | homepage do GitHub ainda é `https://n-iso.ness.com.br` |
| Ruleset "main protegida" | exige os checks **`test` e `e2e`** | |
| CodeQL | existe e roda | `codeql.yml` no repo; última execução com sucesso |
| Bindings | DB, SESSIONS, **OAUTH_KV**, STORAGE, **TRILHA**, VECTOR_INDEX, AI, **ANALYTICS**, **CF_VERSION_METADATA**, ASSETS | |
| Papéis | platform_admin, consultoria_admin, consultor (legado consultant), comercial, auditor, client (legado client_admin), org_user, stakeholder | |

## 1) Documentos a reescrever

### AGENTS.md

O documento está atual em quase tudo. Correções:

- **L1 e L4:** o título diz "nISO"; o certo é `n.iso`.
- **L68–72:** a lista de routers está incompleta. Faltam agentes, oauth-autorizacao, organizacao(s), propostas/public-propostas, servicos, funil, scim, mfa, legal, readiness etc. Sugestão: trocar a lista por "41 arquivos em `src/routes`" ou retirá-la.
- **L94–97:** a lista de services e de agents está velha. Faltam pedidos, organizacao, fechar-venda, preco-proposta, transferencia-projeto, totp e outros.
- **L128:** faltam os bindings OAUTH_KV, TRILHA, ANALYTICS e CF_VERSION_METADATA.
- **L147–148:** diz "verificação nos 4 clientes pendente até o deploy". O deploy já aconteceu e o Claude Code foi verificado em 30/09; Cursor, Codex e Antigravity seguem "a confirmar".
- **L187:** diz "569 any". O certo é **566** (o mesmo valor da catraca).
- **L193:** diz "0 de 144". O certo é **0 de 145**.
- **L203:** diz "frontend/test tem 19 arquivos". São **42**. O texto também não menciona os 5 e2e em `frontend/e2e`, que rodam no CI.
- **L206–207:** diz "36 leituras sem schema em 12 arquivos". Depois do T3 (#259) sobram cerca de 6.
- **L217–218:** diz "4 advisories moderados do undici". O certo é 4, sendo 3 moderadas e **1 alta**.
- **L263:** recomenda o `docs/plano-2026-10-fechamento.md`, que já está quase todo executado. Ver a seção 2.
- **L340–353:** está errado e afirma o oposto da realidade. O texto diz que o repo é privado e que o CodeQL foi removido. Hoje o repo é **público** e o CodeQL **existe e roda**. A frase sobre o CodeRabbit (que repo privado não tem plano gratuito) também perdeu a premissa.
- **L357–361:** diz que o ruleset exige "apenas o check `test`". Ele exige **`test` e `e2e`**.

### README.md

- **L1, L9, L50, L170:** "nISO" → `n.iso`.
- **L3–5:** os badges apontam para `resper1965/nISO`. Funcionam por redirect, mas devem ir para `resper1965/n.iso`.
- **L15:** apresenta `n-iso.ness.com.br` e `niso.ness.workers.dev` como produção. São domínios legados. Basta citá-los como alias.
- **L44:** diz "31 sub-routers". São **41**.
- **L51:** diz "31 migrations". São **41** (até a 0043).
- **L52 e L63:** dizem "77 arquivos de teste". São **145**.
- **L53:** diz "18 arquivos" de teste da UI. São **42**.
- **L101:** o comando `curl https://n-iso.ness.com.br/health` deve usar `niso.ness.com.br`.
- **L127:** diz "Workers AI (Llama 3.1)". Hoje são llama-3.1-8b, **llama-3.3-70b** e bge-m3 (embedding).
- **L145–152:** a tabela de bindings não tem OAUTH_KV, ANALYTICS, CF_VERSION_METADATA nem ASSETS.
- **L154–166:** a lista de variáveis não tem `CF_ACCOUNT_ID` e `AI_GATEWAY_ID`. A lista de segredos não traz o que o OAuth/MCP remoto exige, se exigir algo.
- **Falta:** uma seção sobre o MCP remoto (`/mcp` com OAuth). Hoje L168–173 só falam do servidor local por chave de API.

### CONTRIBUTING.md

- **L3:** "nISO" → `n.iso`.
- **L12:** `localhost:8787` está certo para desenvolvimento local.
- **L31:** diz "O CI roda exatamente isso". É falso: o CI também roda coverage, os testes do frontend, o e2e Playwright e `npm audit --audit-level=high` nos três pacotes. Ou listar tudo, ou trocar por "o CI roda isto e mais…".
- **L35:** falta dizer "branch a partir de **origin/main**", que é o motivo do vazamento do #204. Também falta o prefixo `docs/`/`chore/`.

### SECURITY.md

Conferido: os símbolos, os testes e os triggers citados na tabela existem.

- **L3 e L14:** "nISO" → `n.iso`.
- O canal `security@ness.lat` está coerente com o `security.txt`. Confirmar se o domínio de contato desejado ainda é `.lat`.

### CHANGELOG.md

- **[Não publicado] (L13–69):** concentra cerca de 60 PRs, o que pede corte de versão (11.0.0: multiconsultoria, propostas, stakeholders, MCP remoto).
- **Entradas ausentes:** #259 (T3, schema nas leituras de corpo), #261 (contas e pedidos), #262 (zod 4.6.5), #278 a #282 (T1, T2, T4 e vazamento de erro) e o PR de isolamento.
- **L22 ("Estacionado"):** diz que o "convite reativa qualquer conta stakeholder inativa". O #261 mudou isso para "convite só reativa revogado". Revisar o item.
- **L10:** "Retomar é o item 0.3" é referência a plano já cumprido. Pode sair.
- **L118:** diz que "`niso.ness.com.br` não responde; o que responde é `n-iso`". É histórico (10.0.0) e contradiz a L37. Sugestão: manter com nota "revertido em #207/#208".

### migrations/README.md

- **L1–264:** são o runbook do incidente de agosto de 2026, escrito em primeira pessoa ("eu mergeio o PR #31", "me diga") e com fases já cumpridas: 0019/0020/0021 aplicadas, os 4 arquivos fantasma e a rotação da `RESEND_API_KEY`. Mover para `docs/arquivo/reconciliacao-migrations-2026-08.md` e deixar no topo um resumo de 10 linhas: estado atual, que `ops/` existe e por quê, e a regra "registrar sem executar".
- **Falta:**
  - a seção de procedimento genérico para migration nova (backup → apply → list → merge), hoje repetida seis vezes;
  - as notas da 0022 a 0034 e da 0037;
  - a explicação do buraco 0031–0033 (MSP revertido no #206).

### test/e2e/README.md

- **L4:** diz "Não estão no CI". Só vale para o `mfa.py`. Os e2e do frontend (`frontend/e2e`, 5 specs) rodam no CI e são check obrigatório.
- **L6–7:** diz "~12 mil linhas e nenhum teste" no frontend. São ~16 mil linhas de JS, com 42 testes jsdom e 5 e2e.
- **Sugestão:** renomear para "e2e Python legado (MFA)" e apontar `frontend/e2e` como a suíte principal.
- Seed `teste@ness.io` / `password123`: usar um domínio de exemplo (`exemplo.com`).

### mcp-server-niso/README.md

- **L3, L7, L12, L29, L143:** "nISO" → `n.iso`.
- **L45:** diz que o Cursor "documenta MCP remoto com OAuth", enquanto o CHANGELOG (L17 e L47) e a tela dizem "A confirmar". Alinhar.
- **L174–178:** a lista "Escrita do consultor (12)" não traz o `niso_update_risk`. São **13**: 9 + 13 + 2 = 24, que é o número que a L138 já usa.
- **L81 e L93:** `NISO_ROLE: consultant` está certo para o servidor local (`ferramentas.ts` usa `consultant`), mas diverge do papel do produto (`consultor`). Registrar a diferença.

### frontend/README.md

É o README padrão do template "React + TypeScript + Vite", com Oxlint e React Compiler, e não tem nada a ver com o projeto, que não usa React. Reescrever em 10 linhas (login.html, `src/views`, `npm test`, `test:e2e`) ou remover.

### .github

- **`ISSUE_TEMPLATE/config.yml:4`:** a URL `github.com/resper1965/niso/security/advisories/new` deve ser `resper1965/n.iso`.
- **`ISSUE_TEMPLATE/feature.yml:2`:** "nISO" → `n.iso`.
- **`pull_request_template.md`:** está OK. Sugestão de acréscimo: um checkbox de "Sem atribuição de IA" e outro de "e2e do frontend", se tocou UI.

### wrangler.jsonc (comentário)

- **L14–18:** está correto e explica os 3 domínios. Manter.

## 2) Documentos a arquivar ou remover

| Documento | Ação | Motivo |
|---|---|---|
| `templates-politicas-ptbr/` (25 arquivos) | **remover** | Os 24 templates são **idênticos byte a byte** aos de `src/templates/policies/v2022/`: a tradução já foi incorporada e só o `src/` é usado (`policy-generator.ts`). O LEIA-ME:3 ainda cita `resper1965/nISO`. |
| `deliveries/niso-deep-gap-analysis.md` | **remover** | É de 02/07/2026 e descreve outra arquitetura (Neon, `CICDScannerService`, nada disso existe em `src/`). Tem emojis, o que fere a marca. |
| `deliveries/<cliente>/*`, `deliveries/ness-labs/*` | **retirar do repo público, decisão do dono** | São entregáveis de cliente (<cliente>) num repositório que hoje é **público**. Vale o mesmo para `migrations/0011_seed_twyn_governance.sql` e as referências a "<cliente>" em `src/constants.ts` e `src/routes/projects.ts`. Não é erro de documentação, é exposição. |
| `migrations/README.md` L1–264 | **arquivar** | Runbook do incidente de 2026-08, já executado (ver seção 1). |
| `docs/plano-2026-10-fechamento.md` | **provavelmente arquivar** | Os itens T1–T4 aparecem como entregues nos PRs #259 e #278–#281. O H2 cita um e-mail pessoal (a conta `platform_admin` do dono) num repo público. O documento não foi lido por inteiro. |
| `docs/backlog-plan.md`, `docs/enterprise-grade-plan.md`, `docs/api-triage-2026-08.md`, `docs/security-owasp-2026-08.md` | **candidatos a arquivo** | Planos e avaliações datados. As ondas do enterprise-grade já estão no CHANGELOG (8.2 a 10.0). O AGENTS:23 cita o item 0.2, então arquivar exige ajustar a referência. Não foram lidos por inteiro. |
| `docs/superpowers/specs` e `plans` de features entregues | **arquivar** | Landing/login (#207), MCP remoto (#212/#213), paridade do agente (#221) e propostas fatias 3–5 (multiconsultoria, envio/aceite). O `n360-arquitetura-design` (22/09) não teve a entrega verificada. O AGENTS:105 cita a spec da landing; manter esse link ou apontar para o arquivo. |
| `specs/001-*`, `specs/002-*`, `specs/2026-07-16-<cliente>-*`, `.specify/` | **avaliar** | São do Spec Kit inicial (julho). O AGENTS:271–279 ainda as apresenta como contexto vivo. Não foram conferidas. |

## 3) Documentos OK, sem correção material

- **`SECURITY.md`:** a tabela de invariantes confere com o código. Só falta a troca de nome.
- **`backups/README.md`:** o cron 03:40 UTC, a retenção de 30 dias, `db:backup`/`db:backup:local`, os triggers da 0018 e `test/backup-restore.test.ts` conferem. Detalhe: as L22/L29 mostram o nome com timestamp, mas o script grava `backups/niso-backup.sql` e `local-backup.sql`, com nome fixo.
- **`migrations/README.md`, seções da 0035 a 0043:** conferem com os arquivos.
- **`.github/CODEOWNERS`** e **`pull_request_template.md`**.
- **`wrangler.jsonc`:** os comentários de domínio.

## 4) Contradições

1. **Repositório privado e CodeQL:** o AGENTS (L342–361) diz que o repo é privado, que o CodeQL foi removido e que o ruleset exige só `test`. O README (L5 e L109) diz que o CodeQL roda, e a realidade é repo público, CodeQL ativo e ruleset exigindo `test` + `e2e`. O AGENTS está errado.
2. **Domínio de produção:**
   - o CHANGELOG:118 diz que `niso.ness.com.br` não responde, contra o CHANGELOG:37 e o README:14;
   - o README:101 manda conferir o `/health` em `n-iso`, contra o AGENTS:27, que usa `niso`;
   - a homepage do repo no GitHub é `n-iso.ness.com.br`.
3. **Contagens:** o README diz 31 rotas, 31 migrations, 77 + 18 testes; o AGENTS diz 0043, 144, 19 testes e 569 any; a catraca diz 566. Valores certos no topo.
4. **Testes do frontend:** o `test/e2e/README:6` diz "nenhum teste", o AGENTS:203 diz 19 e o README:53 diz 18. São 42 + 5 e2e.
5. **Suporte do Cursor no MCP remoto:** o `mcp-server-niso/README:45` contra o CHANGELOG:17/47.
6. **"Estacionado" no CHANGELOG:22** (o convite reativa qualquer conta inativa) contra o #261 (só reativa conta revogada).
7. **`npm audit`:** o AGENTS diz 4 moderadas. Hoje são 3 moderadas e 1 alta. O CI usa `--audit-level=high`, então essa alta pode estar reprovando o job.
8. **Templates de política:** o `templates-politicas-ptbr/LEIA-ME` diz que os originais estão em inglês. Os de `src/` já estão em português e são idênticos.

## 5) URLs, nomes e marca a corrigir

### Domínio (o oficial é `niso.ness.com.br`)

- `README.md:15`: `n-iso.ness.com.br` e `niso.ness.workers.dev` aparecem como produção. Manter só como alias.
- `README.md:101`: `curl https://n-iso.ness.com.br/health`.
- `CHANGELOG.md:118`: `n-iso.ness.com.br` (histórico; anotar a reversão).
- `docs/mcp-e2e-validation.md:29, 39, 86`: `https://niso.ness.workers.dev`.
- `docs/portabilidade.md:50, 63`: `https://niso.ness.workers.dev`.
- `docs/READINESS.md:69`: `https://niso.ness.workers.dev`.
- `docs/sso-scim.md:21, 36, 67, 69`: `https://niso.ness.workers.dev`. Atenção: callback de SSO e endpoint SCIM entregues a cliente devem usar o domínio oficial.
- `specs/002-ui-ux-homogenization-design.md:128`: `https://niso.ness.workers.dev`.
- `docs/superpowers/specs/2026-09-22-n360-arquitetura-design.md:31, 191`: `n-iso.ness.com.br`.
- `docs/superpowers/plans/2026-09-29-receita-agentes-mcp-remoto.md:1043`: `n-iso.ness.com.br` e `niso.ness.workers.dev`.
- `docs/staging.md:4, 24`, `docs/enterprise-grade-plan.md:181` e `.github/workflows/deploy.yml:82`: `niso-staging.ness.workers.dev` está **correto**, porque o staging só existe no workers.dev.
- `docs/readiness-check-spec.md:98`: gateway `n-iso` é nome do AI Gateway. Conferir se ainda é esse.
- Homepage do repositório no GitHub (fora do git): `https://n-iso.ness.com.br`. Trocar com `gh repo edit --homepage https://niso.ness.com.br`.
- `localhost:8787` em `CONTRIBUTING.md:12` e `mcp-server-niso/README.md:91`: correto, é contexto de desenvolvimento.

### Nome do repositório (`resper1965/nISO` → `resper1965/n.iso`)

- `README.md:3, 4, 5`: badges.
- `.github/ISSUE_TEMPLATE/config.yml:4`: `resper1965/niso`.
- `templates-politicas-ptbr/LEIA-ME.md:3`.
- **No código, não em documentação:** `src/index.ts:215`, o `security.txt` publicado (`Contact: https://github.com/resper1965/nISO/security/advisories/new`).

### Marca e produto ("nISO" → `n.iso`)

- `README.md:1, 9, 50, 170`
- `AGENTS.md:1, 4`
- `CONTRIBUTING.md:3`
- `SECURITY.md:3, 14`
- `CONSTITUTION.md:1, 6, 21`
- `design.md:3, 105`
- `mcp-server-niso/README.md:3, 7, 12, 29, 143`
- `.github/ISSUE_TEMPLATE/feature.yml:2`
- Ocorrências adicionais em `docs/*.md`, `docs/superpowers/**`, `specs/**` e `deliveries/**`. Só na raiz e no `.github` (excluídos `docs/superpowers`, `specs`, `deliveries` e templates) são 43 casos de `\bnISO\b`.
- **"NESS" maiúsculo** em `docs/superpowers/plans/2026-10-02-sistema-de-propostas.md` e na spec de propostas: é o **prefixo de numeração de proposta** (`NESS-2026-014`), um identificador. Não é erro de marca.
- **Emojis:** `deliveries/niso-deep-gap-analysis.md` (a remover).
