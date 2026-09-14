# nISO — Agentic GRC System

[![CI](https://github.com/resper1965/nISO/actions/workflows/ci.yml/badge.svg)](https://github.com/resper1965/nISO/actions/workflows/ci.yml)
[![Deploy](https://github.com/resper1965/nISO/actions/workflows/deploy.yml/badge.svg)](https://github.com/resper1965/nISO/actions/workflows/deploy.yml)
[![CodeQL](https://github.com/resper1965/nISO/actions/workflows/codeql.yml/badge.svg)](https://github.com/resper1965/nISO/actions/workflows/codeql.yml)
![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)
![Stack](https://img.shields.io/badge/stack-Cloudflare%20Workers%20%2B%20D1%20%2B%20R2%20%2B%20Vectorize-f38020.svg)

O **nISO** conduz a adequação a ISO 27001 e 27701 de ponta a ponta: Declaração de
Aplicabilidade, matriz de risco, cofre de evidências e trilha de auditoria. É a
evolução do sistema de adequação da **ness.**, reescrito numa arquitetura
agêntica e serverless sobre a stack da Cloudflare.

> **Produção:** [`n-iso.ness.com.br`](https://n-iso.ness.com.br) — também
> respondendo em [`niso.ness.workers.dev`](https://niso.ness.workers.dev).
> `GET /health` devolve o SHA do commit publicado, e é assim que se confere o
> que está no ar.

---

## Começando

Pré-requisitos: **Node 22+** e uma conta Cloudflare com acesso ao projeto.

```bash
npm install                     # backend (Worker)
npm install --prefix frontend   # frontend (Vite)

# Banco local, na ordem: schema primeiro, migrations depois
npx wrangler d1 execute niso-db --local --file=./schema.sql
npx wrangler d1 migrations apply niso-db --local

npm run dev                     # Worker + assets em http://127.0.0.1:8787
```

A tela de entrada fica em `/login`. Em `localhost` e `127.0.0.1` o CORS é sempre
liberado, então o frontend em dev fala com o Worker sem preflight.

## Mapa do repositório

| Caminho | O que vive aqui |
|---|---|
| `src/` | O Worker. `index.ts` monta tudo: cabeçalhos de segurança, CORS, autenticação, rate limit, e os sub-routers. |
| `src/routes/` | 31 sub-routers, um por domínio (controles, riscos, evidências, auditoria, privacidade, SSO, SCIM…). |
| `src/schemas/` | Schemas Zod. Todo corpo de write passa por aqui — é a fonte de verdade do contrato da API. |
| `src/middleware/` | Autenticação, acesso por projeto (isolamento de tenant), rate limit. |
| `src/services/`, `src/agents/` | Regra de negócio (motor da SoA, precificação) e os agentes de IA. |
| `frontend/` | Vite + JavaScript sem framework. `login.html` é a casca; `src/views/` tem uma tela por arquivo. |
| `frontend/public/_headers` | Cabeçalhos de segurança dos **arquivos estáticos** — ver "Duas fontes de cabeçalho", abaixo. |
| `mcp-server-niso/` | Servidor MCP que expõe o nISO a clientes como Claude Desktop, com filtro de ferramenta por papel. |
| `migrations/` | 31 migrations do D1, aplicadas em ordem. Nunca editar uma já aplicada. |
| `test/` | 77 arquivos de teste do backend, no pool `workerd` (D1 e KV de verdade). |
| `frontend/test/` | 18 arquivos de teste da UI, em jsdom. |
| `frontend/e2e/` | 5 specs em Chromium real, sobre o build servido. Pega o que o jsdom não pega. |
| `docs/` | Runbook, specs, planos e decisões — com [índice próprio](docs/README.md). |
| `scripts/` | Geradores. `gerar-openapi.mjs` e `gerar-contrato-mcp.mjs` produzem o contrato a partir dos schemas. |

## Testes

Três suítes, e cada uma existe porque a anterior não alcança o caso:

```bash
npm test                              # backend: 77 arquivos, D1 e KV reais
npm run test:coverage                 # idem, com a catraca de cobertura que gateia o deploy
npm test --prefix frontend            # UI em jsdom
npm run test:e2e --prefix frontend    # Chromium real sobre o build
```

A catraca de cobertura **sobe, nunca desce**: os pisos em `vitest.config.mts`
barram regressão sem inventar meta. O deploy falha se a cobertura cair abaixo
deles.

O e2e não é luxo. Dois defeitos recentes só apareceram lá: o atributo `hidden`
que não escondia (porque folha de autor vence a do agente na cascata) e um
iframe `blob:` bloqueado pelo CSP. O jsdom passava nos dois.

## Publicar

O deploy é automático a cada push na `main`, com um portão deliberado: **recusa
publicar se houver migration D1 pendente**. Publicar código que consulta tabela
inexistente já custou caro aqui.

**Pela aba Actions, sem terminal:**

1. **Apply DB migrations (manual)** → *Run workflow* → digite `APLICAR`.
   Faz backup do D1 como artifact e aplica as migrations pendentes.
2. **Deploy** → *Run workflow* na `main`. Com as migrations aplicadas, publica.

**Pelo terminal:**

```bash
npx wrangler login
npm run db:backup                                   # backup verificado antes de mutar
npx wrangler d1 migrations apply niso-db --remote
npm run deploy                                      # build do frontend + wrangler deploy
```

Depois de publicar, confira o que está no ar:

```bash
curl -s https://n-iso.ness.com.br/health
```

## Automação

| Workflow | Quando roda | O que garante |
|---|---|---|
| **CI** | push e pull request | tsc, as três suítes, build do frontend, `npm audit` |
| **CodeQL** | push, PR e toda segunda | SAST sobre o JS/TS do Worker e do frontend |
| **Deploy** | push na `main` e manual | Recusa com migration pendente; injeta o SHA em `/health` |
| **Apply DB migrations** | só manual, com confirmação | Backup antes de aplicar; ensaia em staging quando ativo |
| **Backup do D1** | diário, 03h40 UTC | Exporta e **verifica o dump** antes de guardar; abre issue se falhar |
| **Sonda externa** | a cada 15 min | `/health` responde e o login recusa corpo vazio com o envelope certo |
| **SLO de produção** | a cada 6h | Latência e taxa de erro dentro do alvo |
| **Drift de schema** | toda segunda | `schema.sql` contra o D1 real, com a diferença conhecida documentada |

> Alarme quebrado é pior que nenhum, porque parece um. A sonda externa passou
> dias reprovando por um erro no próprio script — ver `test/workflows-shell.test.ts`,
> que existe por causa disso.

## Arquitetura

- **Runtime**: Hono no Cloudflare Workers.
- **Banco**: D1 (SQLite). Trilha de auditoria append-only por trigger.
- **Memória**: Vectorize (RAG) para contexto organizacional e normativo.
- **Arquivos**: R2 para evidências e documentos; bucket separado para a trilha arquivada.
- **IA**: Workers AI (Llama 3.1) via AI Gateway.
- **Contrato**: `docs/openapi.json` é **gerado** dos schemas Zod. Editar à mão cria
  uma segunda fonte de verdade, e o teste de contrato reprova a divergência.

### Duas fontes de cabeçalho de segurança

O `secureHeaders` em `src/index.ts` só alcança resposta que o **Worker gera**.
Arquivo estático é servido pelo Workers Assets **antes** de o Worker rodar, então
os mesmos cabeçalhos vivem também em `frontend/public/_headers`.

Nenhum dos dois alcança o lado do outro — não existe fonte única possível, só a
obrigação de não divergirem. `test/cabecalhos-assets.test.ts` compara os dois e
falha nas duas direções. Mudou num lugar, muda no outro.

## Configuração

Bindings e variáveis ficam em `wrangler.jsonc`.

| Binding | Tipo | Finalidade |
|---|---|---|
| `DB` | D1 | Banco relacional |
| `SESSIONS` | KV | Sessões, tokens e contadores de rate limit |
| `STORAGE` | R2 | Evidências e documentos |
| `TRILHA` | R2 | Trilha de auditoria arquivada, em cadeia encadeada |
| `VECTOR_INDEX` | Vectorize | Memória de longo prazo da IA |
| `AI` | Workers AI | Inferência |

**Variáveis** (públicas, versionadas em `wrangler.jsonc`): `ENVIRONMENT`,
`EXPORT_PUBLIC_KEY` (verifica a assinatura dos exports), `TURNSTILE_SITE_KEY`
(vai no HTML do widget).

**Segredos** (`npx wrangler secret put <NOME>`, nunca no git):

| Segredo | Sem ele |
|---|---|
| `RESEND_API_KEY` | E-mail não sai; o OTP do portal público falha em produção. |
| `EXPORT_SIGNING_KEY` | Export de portabilidade não é assinado. |
| `TURNSTILE_SECRET_KEY` | O desafio anti-abuso **não é exigido** — e essa é a falha segura. Ele só liga em par com `TURNSTILE_SITE_KEY`; meia configuração exigiria um desafio que a tela não teria como montar. |
| `TOKEN_ENC_KEY` | Configurar SSO devolve **503**: o `client_secret` do IdP não é gravado em claro. |
| `SETUP_KEY` | A rota de seed do primeiro usuário recusa com 403. |

## Integração com agentes (MCP)

O `mcp-server-niso/` expõe o nISO a clientes MCP com filtro de ferramentas por
papel — o auditor não escreve implementação, o consultor não registra achado de
auditoria. Instalação, variáveis e diagnóstico em
[`mcp-server-niso/README.md`](mcp-server-niso/README.md).

## Documentação

- [`docs/README.md`](docs/README.md) — **índice**, agrupado por quando você vai precisar
- [`docs/runbook-incidente.md`](docs/runbook-incidente.md) — produção quebrou: comece aqui
- [`AGENTS.md`](AGENTS.md) — contexto canônico para quem (ou o que) for mexer no código
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — ambiente, verificação antes do PR, regras de schema e teste
- [`SECURITY.md`](SECURITY.md) — como reportar vulnerabilidade e quais invariantes não podem regredir
- [`CHANGELOG.md`](CHANGELOG.md) — o que mudou, versão a versão

## Licença

Proprietária — © 2026 ness. Cybersecurity. Todos os direitos reservados. Ver
[`LICENSE`](LICENSE). Visualizar o repositório não concede direito de uso, cópia
ou distribuição. Componentes de terceiros (ex.: skills adaptadas sob MIT) mantêm
sua própria licença e atribuição.

---
**ness.** · Cybersecurity Enterprise Grade
