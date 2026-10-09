# Núcleo do n.privacy, fatia 3.5 — exceções a documentos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.6 (`documento_excecoes`: "capacidade decidida; entra numa segunda etapa da fatia de documentos"; `escopo`, `motivo`, `vence_em`, aprovação por pedido, "a aprovação da exceção tem prova"). Anteriores: 3.1 a 3.4.

**Goal:** o consultor registra uma exceção a um documento (a quem ou ao quê ela vale, por quê e até quando), pede a aprovação dela com prova, é avisado quando ela vence e pode revogá-la.

## Decisões de desenho (rulings)

1. **Tabela `documento_excecoes`** (migration 0052, só `CREATE`): `id`, `project_id`, `documento_id`, `escopo`, `motivo`, `vence_em` (AAAA-MM-DD), `status` (`ativa` ou `revogada`), `criado_por`, `revogada_em`/`revogada_por`, datas. **Sem `pedido_id`** (a spec lista a coluna): o vínculo se deriva de `pedidos.ref_id = documento_excecoes.id`, como a aprovação de documento da 3.4, e uma coluna só duplicaria o dado e criaria FK circular.
2. **Aprovação por pedido, derivada:** o pedido `tipo = 'excecao'` (o CHECK já aceita desde a 0051) tem `ref_id = documento_excecoes.id` e congela `escopo`, `motivo` e `vence_em`; papel `ciso` ou `ceo`. A exceção está **aprovada** se existe pedido aprovado cujo hash é o do conteúdo atual; mudar escopo, motivo ou data invalida a aprovação sozinho (e substitui o pedido aberto). A prova é a linha do destinatário; `registrarDecisao` não assina nada para `excecao`.
3. **Situação derivada** (não gravada): `revogada`, `vencida` (`vence_em` < hoje), `aprovada`, `aguardando` (há pedido aberto) ou `sem_pedido`. Revogar **cancela** o pedido aberto (a exceção sai do conteúdo conferível: `status = 'ativa'` na consulta do pedido).
4. **Prazo obrigatório e futuro:** `vence_em` é obrigatório e não pode estar no passado. Limite máximo não é inventado aqui (a spec não fixa).
5. **Avisos:** nova fonte `excecao` (D-7, D0, atraso semanal) para exceções `ativa`, responsável = dono do documento. Revogar tira o aviso.
6. **Atos humanos:** revogar é 403 para o agente (`FORA_DO_AGENTE`); criar e editar ficam abertos ao agente porque nada vale sem a aprovação por pedido.
7. **Tela:** seção "Exceções" no detalhe do documento (lista com situação, nova exceção, pedir aprovação, revogar). Editar é por API; na tela, corrigir é revogar e criar outra.

## Global Constraints

- Migration 0052 só `CREATE ... IF NOT EXISTS`; rollout depois da 0051. Sem carga.
- Tabela nova leva `project_id` (portabilidade). Banco real nos testes. Sem dado real de cliente.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge.

## Review Focus

1. Exceção com data no passado ou sem motivo nunca grava; documento de outro projeto é 404.
2. Mudar escopo, motivo ou data substitui o pedido aberto e invalida a aprovação anterior sem apagar a prova.
3. Revogar cancela o pedido aberto e tira o aviso; o agente não revoga.
4. Aprovar exceção não escreve em controle, DPIA nem documento.
5. O aviso só vale para exceção ativa; a tela escapa tudo.

## Tarefas

- **T1 Migration 0052 e schema** (`migrations/0052_documento_excecoes.sql`, `schema.sql`, `test/migration-0052.test.ts`): colunas, CHECKs de `status`, índices, cascata com o documento e com o projeto.
- **T2 Serviço e rotas** (`src/services/excecoes.ts`, rotas em `src/routes/documentos.ts`, schemas em `src/schemas/documentos.ts`, `test/excecoes.test.ts`): `GET/POST /documentos/:id/excecoes`, `PUT …/:exId`, `POST …/:exId/revogar`; situação derivada; validação de data.
- **T3 Pedido de exceção** (`src/services/pedidos.ts`, `src/routes/pedidos.ts`, `src/schemas/domain.ts`): `TipoPedido` e `DOCUMENTOS.excecao`; `pedidoCriarSchema` aceita `excecao`; `ciente` é 400; `registrarDecisao` sem assinatura; gatilho de substituição ao editar e de cancelamento ao revogar. Provas em `test/excecoes.test.ts` (CISO aprova, edição invalida, revogação cancela, nada é assinado em controle).
- **T4 Avisos** (`src/services/avisos-prazo.ts`, `frontend/src/globals.js`): fonte `excecao`; `test/avisos-excecao.test.ts`.
- **T5 Tela** (`frontend/src/views/documentos.js`, `meus-pedidos.js`): seção Exceções, `CAMPOS_EXCECAO`, "Pedir aprovação" sem a opção de ciência; `frontend/test/documentos-view.test.js` e `meus-pedidos.test.js`.
- **T6 Documentação e verificação final** (`AGENTS.md`, `migrations/README.md`, `CHANGELOG.md`, contagens): `tsc`, backend e frontend inteiros, build, PR sem merge.

## Gaps declarados

- **Editar exceção pela tela** não existe (corrige-se revogando e criando outra); a API existe.
- **Sem teto de prazo** para a exceção: a spec não define.
- **Exceção não altera o documento nem a ciência:** é um registro com prova e aviso, não uma regra que o produto aplica sozinho.
