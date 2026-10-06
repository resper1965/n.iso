# Testes — como ler o resultado detalhado

O objetivo aqui não é "passou/falhou": é **enxergar o detalhe** — qual teste
caiu, em que linha, e quanto do código está coberto.

## Suites

Contagens de 2026-10-06, com o comando ao lado:

| Suite | Runtime | Config | Arquivos |
|---|---|---|---|
| Worker (backend) | runtime real do Cloudflare Workers (`@cloudflare/vitest-pool-workers`) | `vitest.config.mts` | 153 (`ls test/*.test.ts \| wc -l`) |
| Frontend (unit) | jsdom (DOM simulado) | `frontend/vitest.config.js` | 46 (`ls frontend/test/*.test.js \| wc -l`) |
| Frontend (E2E) | Chromium real (Playwright), API mockada | `frontend/playwright.config.js` | 5 (`ls frontend/e2e/*.spec.js \| wc -l`) |
| E2E legado de MFA | Python + navegador, fora do CI | `test/e2e/` | 1 (`mfa.py`) |
| MCP server | build (tsc) | `mcp-server-niso/` | — |

O CI (`.github/workflows/ci.yml`) roda: `tsc --noEmit`, build do frontend, testes do frontend
com cobertura, build do servidor MCP, testes do worker com cobertura (job `test`), o E2E em
Chromium (job `e2e`) e `npm audit --audit-level=high` nos três pacotes (job `audit`,
informativo: `continue-on-error`). O ruleset da `main` exige `test` e `e2e`.

## Rodar local

```bash
# Worker (raiz)
npm test                        # rapido, sem cobertura
npm run test:coverage           # com cobertura (istanbul) + piso de catraca

# Frontend (unit)
cd frontend
npm test                        # rapido, sem cobertura
npm run test:coverage           # com cobertura (v8) + piso de catraca

# Frontend (E2E, navegador real)
cd frontend
npm run test:e2e                # serve o build + roda o Chromium
```

**Chromium fora do padrão:** se o navegador instalado não for a revisão que o Playwright
espera, aponte o executável com `PW_EXECUTABLE_PATH` (lido em `frontend/playwright.config.js`).

No CI, `npx playwright install chromium` baixa a revisão certa e a env não é
usada. O E2E serve o build na porta 8787 (a mesma origem que `api()` usa em
localhost) e **mocka a API por interceptação** — não precisa de backend/D1. Cobre
o que o jsdom não pega: render real, navegação, modais, o gate de papel e a
jornada da tela de API Keys (criar chave exibida uma vez, revogar).

Abra `coverage/index.html` (worker) ou `frontend/coverage/index.html` (frontend)
no navegador para o relatório navegável — linha a linha, o que cada teste
exercita e o que ninguém toca.

## O que o CI produz (resultado detalhado no PR)

Só em CI (`GITHUB_ACTIONS=true`), sem poluir o rodar local:

- **`github-actions` reporter** — a falha aparece **anotada na linha exata**
  dentro do diff do PR, sem caçar no log.
- **`junit` reporter** — XML que o GitHub resume por teste
  (`test-results/worker-junit.xml`, `frontend/test-results/frontend-junit.xml`).
- **Cobertura** — `html` + `lcov` + `json-summary`, do worker (`coverage/`) e do
  frontend (`frontend/coverage/`).

Todos são publicados como o artefato **`test-reports`** do run (inclusive quando
a suite falha — `if: always()`), retido por 14 dias.

## Cobertura do backend usa istanbul, não v8

O provider **v8** depende de `node:inspector`, que o runtime de Workers
(`workerd`) **não tem** — falha com `No such module node:inspector/promises`, em
qualquer versão do pool. Por isso o worker usa o provider **istanbul**, que
instrumenta o código no transform (Vite), roda dentro do `workerd` e coleta
`__coverage__`. Os `.md` de `src/templates/**` (inlinados via `?raw`) ficam de
fora — o instrumentador não os parseia.

## Piso de cobertura (catraca)

Cada config fixa um piso mínimo (`coverage.thresholds`) logo abaixo da cobertura
atual. Ele **barra regressão**: se um PR derruba a cobertura abaixo do piso, o CI
falha. Não é meta de qualidade — é um trinco. Ao subir a cobertura de verdade,
suba o piso junto.

Os pisos atuais estão em `vitest.config.mts` (worker) e `frontend/vitest.config.js`
(frontend), no bloco `coverage.thresholds`, com o histórico de cada subida no comentário. Não
copie os números para cá: eles mudam e a cópia envelhece.

## Isolamento de storage entre testes (importante ao escrever teste novo)

O worker roda em `vitest` 4 + `@cloudflare/vitest-pool-workers` 0.20.x. A config
usa o plugin `cloudflareTest` (não mais `defineWorkersConfig`/`poolOptions`).

O ponto que pega: **o pool isola storage (D1/KV) apenas POR ARQUIVO, não por
`it()`**. Um teste NÃO começa com o banco limpo — ele vê tudo que os testes
anteriores do mesmo arquivo gravaram. (A stack antiga, 0.4.x, resetava a cada
`it`; isso foi removido e não há config para trazer de volta.)

Se os seus testes semeiam ids fixos ou acumulam mutação na mesma linha, use um
`beforeEach` que restaura o estado, com os helpers de `test/helpers/d1.ts`:

```ts
import { applySchema, resetData, resetSessions } from './helpers/d1';

beforeEach(async () => {
  await applySchema();     // cria as tabelas (idempotente)
  await resetData();       // apaga todas as linhas (menos audit_logs)
  await resetSessions();   // limpa o KV de sessão
  // ...semear o cenário do teste...
});
```

- `resetData()` apaga com `PRAGMA defer_foreign_keys` (as FKs estão ativas) e
  **pula `audit_logs`**, que é append-only por trigger no DB.
- Testes read-only ou que já usam ids únicos por teste não precisam disso.
