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

## Trabalho à parte: upgrade da stack para vitest 4

O worker roda hoje em `vitest` 1.5.x + `@cloudflare/vitest-pool-workers` 0.4.x.
O upgrade para `vitest` 4 + pool 0.20.x é viável (a config migra de
`defineWorkersConfig`/`poolOptions` para o plugin `cloudflareTest`), **mas não é
pré-requisito da cobertura** — istanbul já funciona na stack atual. O upgrade fica
para um PR próprio porque o pool novo muda o **isolamento de storage entre testes**
(deixa de resetar a cada `it`), o que quebra ~10 testes em ~6 arquivos que contam
com esse reset (mfa, signatures, policies, session-revocation, data-subject,
input-validation) — cada um precisa ser migrado para semear/limpar por conta.
