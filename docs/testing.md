# Testes — como ler o resultado detalhado

O objetivo aqui não é "passou/falhou": é **enxergar o detalhe** — qual teste
caiu, em que linha, e quanto do código está coberto.

## Suites

| Suite | Runtime | Config | Nº de arquivos |
|---|---|---|---|
| Worker (backend) | runtime real do Cloudflare Workers (`@cloudflare/vitest-pool-workers`) | `vitest.config.mts` | ~34 |
| Frontend | jsdom (DOM simulado) | `frontend/vitest.config.js` | 7 |
| MCP server | build (tsc) | `mcp-server-niso/` | — |

## Rodar local

```bash
# Worker (raiz)
npm test                        # rapido, sem cobertura
npm run test:coverage           # com cobertura (istanbul) + piso de catraca

# Frontend
cd frontend
npm test                        # rapido, sem cobertura
npm run test:coverage           # com cobertura (v8) + piso de catraca
```

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

Base 2026-08 (com `all: true`, contando todo o `src/`):

| Suite | Statements | Observação |
|---|---|---|
| Worker (backend) | ~49% | suíte de integração ampla (341 testes) |
| Frontend | ~6,9% | baixo: as views grandes (dashboard, admin, project) não têm teste **unitário** — são exercitadas pela integração do worker; cobertura real delas viria de **E2E de navegador (Playwright)**, ainda não montado |

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
