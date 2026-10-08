# Finalização do n.iso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as frentes abertas do n.iso: pôr #294 e #295 em `main` com CI verde e migrations aplicadas, remover o staging que já foi apagado, corrigir as falhas de CI que bloqueiam os merges, triar os alertas de dependência e deixar a documentação igual ao que existe.

**Architecture:** Nada novo de produto. Frentes pequenas de código, cada uma em branch a partir de `origin/main` (ou da base empilhada correta), com teste vermelho antes do verde. Merges e migrations de produção são travas do dono, na ordem da Tarefa 6.

**Tech Stack:** Cloudflare Workers (Hono), D1, Vitest com `cloudflare:test`, GitHub Actions, `gh`, `wrangler`.

**Spec:** Não existe spec para "finalizar o projeto". Este plano é o escopo, assumido pelo agente em 2026-10-08. Specs que ele executa: a spec da fatia de jornada (#294; localizar com `ls docs/superpowers/specs/`) e `docs/superpowers/specs/2026-10-07-avisos-de-prazo-design.md` (#295). Se o dono quiser outro escopo, o plano é reescrito antes de qualquer execução.

**Estado medido em 2026-10-08** (comando ao lado de cada item):
- `origin/main` = `b8c9ff1`. Última migration: `0044` (`ls migrations/*.sql | tail -1`).
- #294 `feat/fatia-jornada` → `main`, head `2169c013`. `CodeQL` em FAILURE; os demais checks foram reportados verdes (`gh pr checks 294`). Migration 0045 ainda não aplicada em produção.
- #295 `feat/avisos-prazo` → `feat/fatia-jornada`, head `349a07cc`. Check `test` em FAILURE; a causa provável está em `test/propostas-envio.test.ts` (caso de `sendEmail` sem chave, que confere o destinatário no log). Ainda não reproduzido. Migration 0046 ainda não existe em produção.
- Alertas Dependabot abertos: 13 (`gh api repos/resper1965/n.iso/dependabot/alerts?state=open --jq length`).
- Staging: `origin/main` ainda tem `env.staging` no `wrangler.jsonc`, o job de staging em `.github/workflows/deploy.yml`, o passo de ensaio em `.github/workflows/db-migrate.yml` e `docs/staging.md`. Os recursos (D1, KV, R2, Worker) já foram apagados em 2026-10-08 (sondados com 404). Nenhum deles aponta para recurso vivo.
- Hipótese a verificar, não fato: "staging herda `routes` de produção". O comentário atual do `wrangler.jsonc` diz que `routes` não é herdado. A Tarefa 3 confirma com dry-run antes de afirmar qualquer coisa.

## Global Constraints

- Branches sempre a partir de `origin/main` (ou da base empilhada correta). Nunca do `main` local.
- Nenhum `git stash` (regra compartilhada do projeto).
- Nenhum force-push a `main`. Force-push em branch própria só com "sim" do dono; se o classificador negar, parar e avisar.
- Migration remota, merge e deploy: só com "sim" explícito do dono no turno. Não contornar negação do classificador.
- Antes de migration em produção: `npm run db:backup`.
- Nenhum "pronto" ou "mergeado" sem a saída do comando colada. `/health` devolve o SHA publicado: conferir contra o SHA do merge.
- Código em inglês; comentário, docs e mensagem de commit em português; conventional commits.
- Trailer de autoria em commits novos: decisão do dono pendente (ver checklist). Este plano não a decide.
- Testes: rodar um arquivo ou uma suíte por vez, com `--maxWorkers=2 --testTimeout=120000` (máquina lenta). Conferir código de saída e ausência de "Unhandled", não só "N passed".

## Review Focus

Entradas e falhas que o spec implica e que as tarefas precisam cobrir:

1. E-mail sem `RESEND_API_KEY` (dev): loga destinatário e assunto, nunca o HTML.
2. Rotina de avisos com zero prazos, com prazo sem responsável resolvido, e com responsável de outra organização com o mesmo nome.
3. Remover `env.staging` deixa `wrangler.jsonc` válido e o dry-run do ambiente padrão intacto.
4. Deploy automático recusa migration pendente: merge do #294 antes da 0045 aplicada tem de falhar, não passar.
5. Escrita de governança por papel sem permissão recebe 403 e não grava.

---

### Task 1: Destravar o `test` do #295

**Files:**
- Investigate: `src/helpers.ts` (`sendEmail`; `enviarEmail` no branch)
- Modify: `src/helpers.ts` (só se a regressão estiver no envio)
- Test: `test/propostas-envio.test.ts` (caso de `sendEmail` sem chave, perto das linhas 236-238)

**Interfaces:**
- Consumes: `sendEmail(ctx, to, subject, html)` em `origin/main`.
- Produces: `enviarEmail(env, to, subject, html)` no #295, usado por `src/services/avisos-prazo.ts`. `sendEmail` continua com o mesmo log de destinatário.

- [ ] **Step 1: Reproduzir a falha no branch**

Em worktree do `feat/avisos-prazo`:
Run: `npx vitest run test/propostas-envio.test.ts --maxWorkers=2 --testTimeout=120000`
Expected: FAIL no caso que confere `x@y.com` no log. Copiar a mensagem exata para o relatório.

- [ ] **Step 2: Comparar com o `main`**

Run: `git diff origin/main..origin/feat/avisos-prazo -- src/helpers.ts`
Run: `git show origin/main:src/helpers.ts | grep -n "EMAIL SIMULATION" -A3`
Decidir: se o `main` loga o destinatário e o #295 deixou de logar (ou logou outra coisa), a regressão é do #295 e o código volta ao comportamento do `main`. O teste pina o comportamento antigo; não alterá-lo para passar.

- [ ] **Step 3: Corrigir**

Restaurar a linha de log de `sendEmail` como estava no `main`. `enviarEmail` continua sendo a única implementação; `sendEmail` é o invólucro dela (spec de avisos, seção 6). Não copiar lógica.

- [ ] **Step 4: Verde**

Run: `npx vitest run test/propostas-envio.test.ts test/avisos-prazo.test.ts --maxWorkers=2 --testTimeout=120000`
Expected: os dois arquivos passam, código de saída 0.

- [ ] **Step 5: Commit e push**

```bash
git add src/helpers.ts
git commit -m "fix(email): sendEmail volta a logar o destinatário, como no main"
git push origin feat/avisos-prazo
```

Expected: `gh pr checks 295` com `test` SUCCESS no SHA novo.

---

### Task 2: Alertas do CodeQL no #294

**Files:**
- Modify: os arquivos de teste que o passo 1 listar (a análise anterior apontou testes de frontend com regex de `</script>` e `replace` que troca só a primeira ocorrência; número e caminhos exatos vêm do passo 1)
- Test: os próprios arquivos

- [ ] **Step 1: Listar os alertas abertos do branch**

Run: `gh api "repos/resper1965/n.iso/code-scanning/alerts?ref=refs/heads/feat/fatia-jornada&state=open" --jq '.[] | "\(.number) \(.rule.id) \(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'`
Expected: uma linha por alerta. Anotar caminhos e linhas; eles definem o escopo.

- [ ] **Step 2: Corrigir cada um, com teste que falhe antes**

Para `replace` que só troca a primeira ocorrência: `replaceAll` quando o teste quer todas; se a intenção é só a primeira, mantê-lo e deixar isso explícito numa linha no teste. Para regex de `</script>`: aceitar `</script\s*>`.

- [ ] **Step 3: Rodar os testes de frontend alterados**

Run: a forma de rodar testes do `frontend/` que o `package.json` dele define (`cd frontend && npm test -- <arquivos>`).
Expected: passam, código de saída 0.

- [ ] **Step 4: Commit e push no `feat/fatia-jornada`**

```bash
git add <arquivos do passo 1>
git commit -m "fix(testes): corrige os alertas do CodeQL nos testes de frontend"
git push origin feat/fatia-jornada
```

Expected: check `CodeQL` do #294 SUCCESS (`gh pr checks 294`), depois da análise do SHA novo.

---

### Task 3: Remover o staging

Branch nova `chore/remover-staging` a partir de `origin/main`. Os recursos já foram apagados; a configuração ainda aponta para eles.

**Files:**
- Modify: `wrangler.jsonc` (remover o bloco `env.staging`, que começa perto da linha 100 com a docstring "Ambiente de STAGING"; remover também a frase do comentário do topo que fala de `env.staging`)
- Modify: `.github/workflows/deploy.yml` (remover o job `staging`, que começa perto da linha 44 com `if: vars.STAGING_ATIVO == 'true'`, e os comentários de staging no topo; no job `production`, remover `needs: [staging]` e a condição que depende dele)
- Modify: `.github/workflows/db-migrate.yml` (remover o passo de ensaio em staging, perto das linhas 68-87, incluindo o aviso "Staging não está ativo"; a migration de produção segue direto)
- Read, decide: `.github/workflows/schema-drift.yml` (cita staging; se o job constrói banco de staging, remover o job; se só cita, reescrever o comentário)
- Delete: `docs/staging.md`; remover links para ele em `docs/README.md`, se houver

- [ ] **Step 1: Medir o que cita staging, antes de editar**

Run: `git grep -n "niso-staging\|niso-db-staging\|STAGING_ATIVO\|env.staging\|--env staging" origin/main -- src test scripts package.json wrangler.jsonc .github docs AGENTS.md`
Decidir por hit: host de staging em `src/config/url.ts` (lista de origens) sai junto; teste que depende desse host é ajustado; citação em `CHANGELOG.md` fica (histórico); instrução viva em `AGENTS.md` é corrigida.

- [ ] **Step 2: Verificar a hipótese de `routes` herdado, com o wrangler**

Run: `npx wrangler deploy --env staging --dry-run --outdir "$TEMP/dry-stg"`
Expected: o dry-run mostra o ambiente staging. Se aparecer rota de produção (`niso.ness.com.br`) nele, a hipótese está confirmada e o PR registra isso. Se não aparecer, a hipótese é descartada. Colar as linhas de rota no PR.

- [ ] **Step 3: Remover e validar**

Aplicar as edições da seção Files. Depois:
Run: `node -e "JSON.parse(require('fs').readFileSync('wrangler.jsonc','utf8').replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''))" && echo OK`
Run: `npx tsc --noEmit`
Run: `npx wrangler deploy --dry-run --outdir "$TEMP/dry-prod"` — confirmar que o ambiente padrão mantém as rotas de produção e os crons existentes.

- [ ] **Step 4: Suíte inteira**

Run: `npx vitest run --maxWorkers=2 --testTimeout=120000`
Expected: verde, código de saída 0, sem "Unhandled".

- [ ] **Step 5: Commit e PR**

```bash
git add wrangler.jsonc .github/workflows/deploy.yml .github/workflows/db-migrate.yml .github/workflows/schema-drift.yml docs/staging.md
git commit -m "chore: remove o ambiente de staging, apagado em 2026-10-08"
git push -u origin chore/remover-staging
gh pr create --base main --title "chore: remove o ambiente de staging" --body "..."
```

Corpo do PR: o que saiu, por que (recursos apagados e sondados com 404), saídas dos dry-runs dos Steps 2 e 3. **Não fazer merge**: merge é trava do dono (Tarefa 6).

---

### Task 4: Gate de papel nas escritas de governança

Investigar antes de codificar. A nota de memória sobre o gate é uma hipótese.

**Files:**
- Read: `src/routes/governance.ts` (todas as rotas de escrita; checagens de papel observadas nas linhas 153, 195, 229, 273 e 508)
- Read: `src/middleware/auth.ts` (write-guard por método + rota)
- Read: `test/contrato-isolamento-org.test.ts` (contrato que varre rotas por papel)
- Test: `test/contrato-isolamento-org.test.ts`, ou arquivo novo ao lado se o contrato não cobrir

- [ ] **Step 1: Mapear**

Para cada rota de escrita em `governance.ts`, anotar: há checagem de papel no handler? o write-guard do `auth.ts` cobre a rota? o contrato de teste já a exercita com papel sem permissão?
Run: `git grep -n "role\|papel" origin/main -- src/routes/governance.ts`

- [ ] **Step 2: Teste vermelho para cada escrita sem gate**

Para cada rota sem gate, um caso: papel sem permissão recebe 403 e a linha não muda. Usar o helper de papéis que o arquivo de contrato já tiver.
Run: `npx vitest run test/contrato-isolamento-org.test.ts --maxWorkers=2 --testTimeout=120000`
Expected: os casos novos falham antes do gate.

- [ ] **Step 3: Gate**

Usar as checagens já existentes em `governance.ts`. Se uma rota não tiver regra clara de quais papéis escrevem, a decisão é do dono: a rota fica fora deste PR e o checklist recebe a pergunta, com a tabela do Step 1.

- [ ] **Step 4: Verde e PR**

Run: `npx vitest run test/contrato-isolamento-org.test.ts --maxWorkers=2 --testTimeout=120000`
Se alguma rota mudou de contrato, rodar o script de OpenAPI se o `package.json` tiver um (`grep openapi package.json`) e commitar o arquivo gerado.
Branch `fix/governanca-gate-papel` a partir de `origin/main`. PR para `main`, sem merge.

---

### Task 5: Triagem dos alertas do Dependabot

**Files:**
- Modify: `package.json` / `package-lock.json` (raiz), `frontend/`, `mcp-server-niso/`, conforme o alerta
- Modify: `.github/dependabot.yml` só se o dono decidir segurar algo (se o arquivo existir)

- [ ] **Step 1: Listar**

Run: `gh api "repos/resper1965/n.iso/dependabot/alerts?state=open&per_page=100" --jq '.[] | "\(.security_vulnerability.severity) \(.dependency.package.name) \(.dependency.manifest_path) fix=\(.security_vulnerability.first_patched_version.identifier // "-")"'`
Expected: 13 linhas. Colar na descrição do PR.

- [ ] **Step 2: Classificar**

Três grupos: (a) tem `fix=` e a atualização é patch ou minor sem quebra de teste: bump direto; (b) tem `fix=` mas é major ou quebra a suíte (medir no Step 3): segurar com motivo; (c) sem `fix=`: registrar e aguardar.

- [ ] **Step 3: Bump do grupo (a), em um PR**

Um PR com os bumps seguros. `npm ci` e `npm audit` por pacote (raiz, `frontend`, `mcp-server-niso`): a saída de `npm audit` vai para o corpo do PR. Suíte inteira antes do PR.

- [ ] **Step 4: Decisão do TypeScript 7 (#277)**

Não mexer sem o dono. Está no checklist.

---

### Task 6: Ordem de merge e migrations (travas do dono)

Nenhum passo desta tarefa roda sem "sim" explícito do dono no turno. Se o classificador negar, parar e avisar.

- [ ] **Step 1: Ordem de merges, um por vez**

1. Tarefas 1 e 2 verdes no #295 e no #294. Tarefa 3 (staging) mergeada antes do #294, para o deploy de `main` já sair sem staging. Atualizar cada branch antes do merge (`behind_by == 0`).
2. Migration **0045** em produção: o dono roda `npm run db:backup`; depois `npx wrangler d1 migrations apply niso-db --remote`, a partir da pasta do worktree do `feat/fatia-jornada` onde está o arquivo, e confirma. Conferir: `npx wrangler d1 execute niso-db --remote --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 2"`.
3. Merge do #294: `gh pr merge 294 --squash`. Esperar o deploy: `gh run list --workflow=deploy.yml --limit 1` com `conclusion=success`. O deploy recusa se faltar migration; se recusar, a 0045 não foi aplicada.
4. Retargetar o #295 para `main`: `gh pr edit 295 --base main`. Rebase: `git fetch origin && git rebase --onto origin/main origin/feat/fatia-jornada feat/avisos-prazo`. Publicar; se exigir force, pedir "sim" ou usar nome de branch novo.
5. Migration **0046** (`avisos_prazo`): criada na branch do #295, com índice depois da tabela, aplicada pelo dono como no item 2.
6. Merge do #295. O cron `0 11 * * *` entra com ele. A primeira execução é silenciosa (tabela vazia): confirmar no dia seguinte, pelo sino e pelo e-mail, que não houve enxurrada.

- [ ] **Step 2: Sondas**

`curl -s https://niso.ness.com.br/health` com `version` = SHA do merge, a cada deploy. Para cada fatia, a sonda que a seção de verificação do spec define (ler o spec antes de rodar; não inventar rota).

---

### Task 7: Documentação igual ao que existe

**Files:**
- Modify: `AGENTS.md` (contagens com o comando ao lado; remover instrução viva sobre staging)
- Modify: `CHANGELOG.md` (entrada da versão; ler a convenção no topo do arquivo antes de escolher o número; o último registro é `v11.0.0`)
- Modify: `docs/plano-2026-10-fechamento.md` (atualizar as linhas de estado que mudaram)
- Modify: `docs/superpowers/plans/2026-10-05-plano-mestre-execucao.md` (acrescentar apontamento para este plano)

- [ ] **Step 1: Contagens com o comando**

Cada número novo no `AGENTS.md` leva o comando que o mede, como o próprio arquivo exige:
- tabelas: `grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`
- rotas: `ls src/routes/*.ts | grep -vc '\.test\.ts$'`
- migrations: `ls migrations/*.sql | tail -1`
- `any`: `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`

- [ ] **Step 2: Commit de docs, PR separado**

Branch `docs/fechamento-2026-10-08`, a partir de `origin/main` depois dos merges da Tarefa 6. Mensagem: `docs: atualiza AGENTS.md e CHANGELOG após as fatias de jornada e avisos`.

---

## Checklist do dono (não é tarefa de agente)

| Item | O que decidir ou fazer | Origem |
|---|---|---|
| Migrations 0045 e 0046 | "sim" para cada uma, depois de `npm run db:backup` | Tarefa 6 |
| Merges #294, #295, PR de staging, PR de governança, PR de dependências | "sim" para cada merge | Tarefa 6 |
| Policy_version órfã em produção | Confirmar se apaga (remoção em produção exige "sim") | notas da sessão anterior |
| Alertas Dependabot segurados | Aceitar o grupo segurado e o motivo | Tarefa 5 |
| TypeScript 7 (#277) | Migrar ou segurar | `docs/superpowers/plans/2026-10-05-plano-mestre-execucao.md` |
| Governança: papéis que escrevem | Confirmar a tabela da Tarefa 4 para rotas sem regra clara | Tarefa 4 |
| Repositório público ou privado | Decidir. Privado exige Advanced Security para o CodeQL | `AGENTS.md`, seção de portões |
| Cobrança do Actions | Conferir que o limite de gasto não bloqueia `test`, `e2e` e `deploy` | plano mestre |
| Trailer de autoria nos commits | Decidir se mantém; reescrever histórico público é destrutivo, só com "sim" | notas da sessão anterior |
| MFA da conta `platform_admin` | Ativar pelo cartão de perfil; guardar códigos de recuperação | `docs/plano-2026-10-fechamento.md` |
| Checkout principal | Voltar para `main` e decidir sobre `.vscode/settings.json`, `.impeccable/`, `debug.log` | `git status` inicial |
| Stashes antigos | Descartar ou pedir comparação (o agente não apaga stash) | notas da sessão anterior |
| Catálogo inicial e proposta ponta a ponta | Executar no navegador | plano mestre |
| F2: login OAuth em Codex, Cursor, Antigravity | Executar e confirmar | `docs/plano-2026-10-fechamento.md` |
| D2/F4 (PDF) e T5 (PII em texto livre) | Decisões de produto | `docs/plano-2026-10-fechamento.md` |

## Fora deste plano

- F3 (último uso ao vivo), F4 (leitura de PDF), F5 (verificação normativa) e T1–T6 (dívida estrutural): continuam em `docs/plano-2026-10-fechamento.md`.
- Frente nova de produto fica fora. Este plano só fecha o que já está aberto.

---

**Arquivo:** este plano ainda não está commitado. Commit só quando o dono pedir.
