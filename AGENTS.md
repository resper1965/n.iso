# nISO — Manifesto do Agente

Se voce esta lendo isto, voce e o agente responsavel por continuar o
desenvolvimento do **nISO** (Agentic GRC System da ness.).

Este arquivo descreve o que **existe hoje**. Historico de sprint vive no
`CHANGELOG.md` — nao acrescente narrativa de entrega aqui, ela envelhece e
passa a mentir para o proximo agente.

## Stack

Cloudflare Workers (Hono) + D1 + KV + R2 + Vectorize + Workers AI. Frontend SPA
Vanilla JS, sem framework, bundle via Vite. Deploy por `wrangler deploy`.

- **Backend**: `src/index.ts` e o composition root que monta os sub-routers de
  dominio em `src/routes/*.ts` (auth, users, leads, proposals, assessments,
  projects, evidence, vendors, training, ropa, audits, capa, certifications,
  public, ai, governance, auditor, platform, risks, policies, integrations).
- **Middleware**: `src/middleware/auth.ts` (sessao, chave de API, RBAC
  write-guard por metodo+rota) e `src/middleware/project-access.ts` (isolamento
  multi-tenant em `/api/v1/projects/:projectId/*`).
- **Services**: `pricing.ts`, `memory.ts` (RAG Vectorize), `soa-logic.ts`
  (93 regras Annex A 2022), `migration-service.ts` (2013→2022),
  `policy-generator.ts`, `embeddings.ts`, `project-setup.ts`.
- **Agents**: `src/agents/` — PolicyAgent, EvidenceAgent, AssessmentAgent.
- **Frontend**: `frontend/src/` → `frontend/dist`, servido pelo binding ASSETS.
  Entrada `frontend/index.html` + `src/main.js`; `router.js`, `state.js`
  (estado global `S`), `api.js`, `ui.js`, `globals.js`, `src/views/*.js`.
  `politicas.html` e o portal publico de politicas.
- **Schema**: `schema.sql` — **44 tabelas**. Migrations numeradas em
  `migrations/` (ultima aplicada localmente: 0018).
- **Bindings**: DB (D1), SESSIONS (KV), VECTOR_INDEX (Vectorize), STORAGE (R2),
  AI, ASSETS.
- **MCP**: `mcp-server-niso/` expoe o produto a clientes MCP com filtro de
  ferramenta por papel. Ver `mcp-server-niso/README.md`.

## Decisoes de produto ja tomadas — nao reabrir

- **Sem i18n.** O produto e PT-BR. Comentario, mensagem de erro e texto de UI em
  portugues. A camada de traducao foi removida por decisao explicita.
- **Sem alternancia de tema.** Um tema so, o escuro da marca.
- **Sem framework no frontend.** Vanilla e decisao, nao divida.
- **Responsividade fora de escopo** ate segunda ordem.

## Restricoes Tecnicas

- O catch-all estatico (`c.env.ASSETS.fetch`) DEVE ser a ultima rota em
  `src/index.ts`.
- `authMiddleware` roda antes das rotas `/api/v1/*`; `projectAccessMiddleware`
  logo apos, em `/api/v1/projects/:projectId/*`. Rotas realmente publicas (auth,
  public) sao montadas antes do `authMiddleware`.
- Chave de API autoriza escrita pelo campo `permissions` (`write`/`admin`), nao
  pelo allow-list — este existe para papeis **humanos** read-only. Ver o
  comentario em `auth.ts` antes de mexer.
- `SETUP_KEY` e segredo (`wrangler secret put SETUP_KEY`); sem ele `/auth/setup`
  fica desabilitado (falha fechada). Nunca commitar segredo em `wrangler.jsonc`.
- Segredos e tokens usam CSPRNG (`genToken`/`genNumericCode`), nunca
  `Math.random`.
- Embedding do RAG: use SEMPRE a constante `EMBEDDING_MODEL`
  (`src/services/embeddings.ts`). MemoryService e KnowledgeService precisam do
  mesmo modelo — vetores de modelos diferentes nao sao comparaveis. Hoje e
  bge-m3 (multilingue, PT-BR), 1024 dimensoes. Trocar de modelo exige RECRIAR o
  indice Vectorize com a nova dimensao e reingerir (runbook no topo do arquivo).
- Schema muda em **dois** lugares: `schema.sql` e uma migration. Em `schema.sql`,
  indice **depois** da tabela — `CREATE INDEX` antes do `CREATE TABLE` derruba a
  criacao de banco novo e so aparece em banco novo.
- Antes de migration em producao: `npm run db:backup` (ver `backups/README.md`).
- Frontend: sem modulos ES em runtime, tudo no escopo `window`. Estado global `S`.

## Divida conhecida — nao finja que nao existe

Ao mexer nestas areas, voce esta em terreno que ja falhou antes:

- **~300 `any` em `src/`.** `tsc --noEmit` limpo diz pouco. Tipar o que voce
  tocar e melhoria barata; nao precisa de permissao.
- **4 de 14 arquivos de teste ainda mockam o D1.** Teste mockado nao pega deriva
  de schema — foi exatamente assim que o codebase acumulou consulta a tabela
  inexistente. Caminho novo de banco: teste de integracao real, no estilo de
  `test/schema-contract.test.ts`.
- **Frontend sem nenhum teste** (~12k linhas).
- **31 arquivos markdown na raiz**, a maioria plano morto. Nao adicione mais um;
  prefira editar o que ja existe.
- **Sem pipeline de deploy automatizado ate 2026-07.** `.github/workflows/deploy.yml`
  existe mas exige `CLOUDFLARE_API_TOKEN` configurado e disparo manual.

## Regras da ness.

- Marca: ness. (sempre minusculo, com ponto).
- Layout: Enterprise Grade, header 56px com backdrop-filter.
- Cores: #070b14 (fundo), #00ade8 (accent), #f5f5f7 (texto),
  rgba(229,235,255,0.6) (muted).
- Tipografia: Inter 300/400 para body, Montserrat 500/700 apenas headings.
- Proibido: italicos, emojis/icones, peso 600 Montserrat, accent como background
  de area.
- Inputs: border-radius 10px, glassmorphism com backdrop-filter blur(24px).
- Login: split-screen (branding esquerda, form direita).

## Documentos que valem a leitura

- `CONTRIBUTING.md` — verificacao antes do PR, regras de schema e de teste
- `SECURITY.md` — invariantes de seguranca que nao podem regredir
- `backups/README.md` — runbook de backup e restauracao
- `CONSTITUTION.md`, `design.md`, `specs/` — Spec Kit

<!-- SPECKIT START -->
## Contexto Spec Kit
Este projeto utiliza o GitHub Spec Kit para desenvolvimento orientado a
especificacoes.
- Constituicao: CONSTITUTION.md
- Design: design.md
- Especificacoes: Localizadas em specs/
<!-- SPECKIT END -->

## Skills instaladas

`.agents/skills/`, simlinkadas em `.claude/skills/`. O texto completo vive em
cada skill — nao duplicar as regras aqui, senao as duas copias divergem (foi o
que aconteceu com a copia inline do ponytail).

| Skill | Quando atua |
|---|---|
| `ponytail` | Toda tarefa de codigo. Escada YAGNI, menor diff que funciona, reusar antes de escrever. Nunca simplifica: entendimento do problema, validacao em trust boundary, tratamento de erro, seguranca, acessibilidade. |
| `security-threat-model` | Modelagem de ameaca de uma area do codigo, sob pedido explicito |
| `security-audit` | Caca a vulnerabilidade exploravel |
| `code-review` | Review de diff contra padrao do repo e contra a spec |
| `requesting-code-review` | Entre tarefas; achado critico bloqueia |
| `test-driven-development` | RED-GREEN-REFACTOR durante implementacao |
| `finishing-a-development-branch` | Fechamento de branch |
| `webapp-testing` | Teste de UI via navegador |
| `iso27001` / `iso27701` | Referencia normativa: Annex A, clausulas, SoA, DPIA, ROPA |
| `find-skills` | Descobrir e instalar skill nova |

**Aviso sobre `iso27001` / `iso27701`:** sao material de terceiro (Socket e Snyk
limpos, so markdown, sem script). Os scanners verificam malware, **nao** a
exatidao do texto normativo. Nao emita documento de conformidade para cliente com
base so nessas skills sem conferir contra a norma publicada.

## Portões de revisão — o que existe e o que não existe

O repositório ficou **privado** em 2026-08-03. Consequências que não são óbvias
e que já custaram uma execução de CI falhando em silêncio:

- **CodeQL foi removido.** `.github/workflows/codeql.yml` passou a falhar com
  `Code scanning is not enabled for this repository` — em repositório privado,
  code scanning exige GitHub Advanced Security (pago). O job continuava rodando
  ~4 min por execução e falhava no upload. Se o repo voltar a ser público, ou se
  houver GHAS, o arquivo está no histórico do git.
- **CodeRabbit caiu para o plano Free**, que só gera resumo — sem revisão linha
  a linha. Não existe plano gratuito para repositório privado.
- **Codex continua funcionando**, atrelado à assinatura e não à visibilidade do
  repo. Hoje é o único revisor automático que lê o diff de verdade.

Ao configurar proteção de branch, **exija apenas o check `test`**. Exigir
`CodeQL` ou `Analyze JavaScript/TypeScript` travaria todo merge para sempre.
