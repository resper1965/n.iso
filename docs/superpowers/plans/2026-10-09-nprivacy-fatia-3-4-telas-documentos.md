# Núcleo do n.privacy, fatia 3.4 — tela Documentos, hierarquia, revisão e aprovação por versão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.6 ("Revisão: `revisar_ate` vencido sinaliza o documento e o dono"; hierarquia política → norma → procedimento). Decomposição: `docs/superpowers/plans/2026-10-09-nprivacy-fatia-3-documentos.md`. Anterior: 3.3 (`…-3-3-ciencia-por-versao.md`).

**Goal:** o consultor trabalha com documentos numa tela própria (árvore, dono, revisão, versões, rascunho, ciências), a hierarquia e a revisão passam a ser regras do servidor, a revisão vencida avisa no sino e a **aprovação CISO/CEO de documento** existe, apontando para a versão.

## O que existe hoje (3.1 a 3.3)

Documento e versão (3.1), escritores de política e rascunho do agente (3.2), pedido de ciência por versão e portal (3.3). Faltam: o documento só tem `POST` e leitura (não se edita título, tipo, pai, dono, periodicidade, nem se marca obsoleto); `pai_id` só é conferido quanto a existir no projeto (sem regra de tipo nem de ciclo); `revisar_ate` é gravado ao publicar mas **ninguém avisa** quando vence; a aprovação de documento não existe (só `ciente`); e não há tela: o consultor só enxerga documento pela API.

## Decisões de desenho (rulings)

1. **Hierarquia por tipo:** `politica` não tem pai; `norma` tem como pai uma `politica`; `procedimento` tem como pai uma `norma` ou uma `politica`. Pai opcional. Sem ciclo (o pai não pode ser o próprio documento nem descendente dele). Trocar o `tipo` de um documento com filhos só vale se os filhos continuarem válidos. Regra no serviço, usada pela criação e pela edição.
2. **Edição de metadados** (`PUT /documentos/:id`): `titulo`, `tipo`, `pai_id`, `dono_parte_id`, `revisar_a_cada_meses` e `status` (`obsoleto` ou de volta a `vigente`, este só se houver versão vigente). Texto nunca muda aqui (é versão). Mudar `titulo` de documento vigente muda o hash do pedido de ciência aberto (o título faz parte do conteúdo congelado): chama `conferirPedidosDoDocumento`, como a publicação.
3. **"Marcar como revisado"** (`POST /documentos/:id/revisar`): documento vigente revisado sem mudança de texto renova `revisar_ate` (hoje + periodicidade) sem criar versão. Com trilha.
4. **Aviso de revisão vencida:** nova fonte `documento` em `src/services/avisos-prazo.ts` (documento `vigente` com `revisar_ate`; resolvido quando a data anda ou o documento sai de vigente). Responsável = e-mail (senão nome) da parte dona; no sino, o clique leva à tela Documentos.
5. **Aprovação por versão, sem coluna nova:** `POST /projects/:id/pedidos` aceita `tipo = 'documento'` com `papel_exigido` `ciso` ou `ceo` (a ciência `ciente` segue só pelo lote). A prova é a linha de `pedido_destinatarios` decidida `aprovado` (hash, IP, user-agent, MFA), como em qualquer pedido; `registrarDecisao` **não assina** nada em `compliance_controls` quando o pedido é de documento (hoje cairia em `assinaturaDpia`). O estado "aprovado" é **derivado**: existe pedido `ciso`/`ceo` `aprovado` cujo `hash` é o do conteúdo vigente agora. Versão nova invalida sozinha (hash muda), sem apagar prova.
6. **Ciências do documento** (`GET /documentos/:id/ciencias`): quem deu ciência de qual versão e por qual canal (`conta`, `link`, `portal`), lido dos pedidos. Substitui, para documentos, a leitura da tela antiga de Ciências. O registro manual interno em `policy_acknowledgments` **segue existindo** e a tela antiga continua (gap declarado).
7. **Tela Documentos** é nova (`#nav-documentos`); a tela de políticas por controle (`policies-dashboard`) **não é removida** nesta fatia: ela ainda carrega geração por IA, assinatura por controle e relatório impresso. Os dois convivem até a assinatura de documento substituir a de controle.
8. **Rascunho do agente** aparece também aqui (o mesmo aviso do modal de política, agora no detalhe do documento).

## Global Constraints

- Sem migration nova (a 0050 tem as colunas; a 0051 já aceita `documento` e o canal `portal`).
- Comportamento HTTP dos escritores e do portal da 3.2/3.3 não muda (suítes existentes verdes).
- Frontend sem handler inline (CSP); delegação por `data-action`; texto vindo do servidor sempre escapado; sem CSS novo além de classes existentes.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge.

## Review Focus

1. Ciclo e tipo inválido na hierarquia nunca gravam (criação e edição), inclusive trocar o tipo de quem tem filhos.
2. Pedido de aprovação de documento: o aprovador sem autoridade na governança é recusado; aprovar **não** escreve em `compliance_controls` nem em `dpia_assessments`.
3. Versão nova torna a aprovação anterior "não vigente" sem apagar nada.
4. Revisão: só documento `vigente` com data entra no aviso; "marcar como revisado" tira o aviso; o sino abre a tela certa.
5. Tela: título, texto e nomes vindos do servidor nunca viram HTML; documento de outro projeto nunca aparece.
6. `agente` não aprova, não publica, não marca revisado (atos humanos).

## File Structure

| Arquivo | Papel |
|---|---|
| `src/services/documentos.ts` | `validarHierarquia`, `atualizarDocumento`, `marcarRevisado`, `aprovacaoDoDocumento`, `cienciasDoDocumento`; `criarDocumento` passa a validar a hierarquia |
| `src/routes/documentos.ts`, `src/schemas/documentos.ts` | `PUT /documentos/:id`, `POST /documentos/:id/revisar`, `GET /documentos/:id/ciencias`; listas ganham `aprovacao` |
| `src/services/pedidos.ts`, `src/routes/pedidos.ts`, `src/schemas/domain.ts` | pedido de aprovação de documento; `registrarDecisao` sem assinatura para documento |
| `src/middleware/agente.ts` | `revisar` entra em `FORA_DO_AGENTE` |
| `src/services/avisos-prazo.ts`, `frontend/src/globals.js` | fonte `documento` e a tela do clique |
| `frontend/src/views/documentos.js`, `router.js`, `main.js`, `login.html` | tela Documentos |
| `test/documentos-hierarquia.test.ts`, `test/documentos-aprovacao.test.ts`, `test/avisos-documento.test.ts`, `frontend/test/documentos-view.test.js` | provas |

---

### Task 1: Hierarquia, metadados e revisão (TDD)

**Files:** Modify `src/services/documentos.ts`, `src/routes/documentos.ts`, `src/schemas/documentos.ts`, `src/middleware/agente.ts`; Create `test/documentos-hierarquia.test.ts`.

- [ ] **Step 1: Testes (vermelho).** (a) criar `norma` com pai `politica` e `procedimento` com pai `norma` ou `politica`: 201; `politica` com pai, `norma` com pai `norma` ou `procedimento`, `procedimento` com pai `procedimento`: 400; (b) `PUT` com `pai_id` de um descendente ou do próprio documento: 400; (c) trocar `politica` com filhos `norma` para `procedimento`: 400, e para `norma` sem pai ainda é válido só se não tiver filhos `norma`; (d) `PUT` troca `titulo`, `dono_parte_id` (da parte do projeto; de outra, 400), `revisar_a_cada_meses` (1 a 120; fora, 400) e atualiza `updated_at`; sem nenhum campo: 400; (e) `status: 'obsoleto'` em documento vigente passa e some do portal; `status: 'vigente'` sem versão vigente: 409; (f) `PUT` do título de documento vigente com pedido de ciência aberto substitui o pedido (o título é conteúdo congelado); (g) `POST /documentos/:id/revisar` num vigente com periodicidade renova `revisar_ate` para hoje + N meses sem criar versão; sem periodicidade ou fora de vigente: 409; (h) o agente recebe 403 em `revisar` e em `PUT` com `status` (atos humanos); `PUT` dos demais metadados passa (organizar não é publicar); (i) documento de outro projeto: 404.
- [ ] **Step 2: Implementar** `validarHierarquia(db, projectId, { id?, tipo, paiId })` (busca o pai, confere tipo permitido e percorre os ancestrais com limite de 20 para barrar ciclo; na edição de `tipo`, confere os filhos) e `atualizarDocumento`/`marcarRevisado` no serviço; rotas finas. `criarDocumento` chama `validarHierarquia`. `FORA_DO_AGENTE` ganha `…/documentos/:id/revisar` (POST).
- [ ] **Step 3:** `npx vitest run test/documentos-hierarquia.test.ts test/documentos.test.ts test/documentos-importar.test.ts test/politica-agente.test.ts test/contrato-isolamento-org.test.ts test/openapi.test.ts`; `npm run openapi` se pedir. Mutações: sem a checagem de ciclo o (b) falha; sem a de filhos o (c) falha.
- [ ] **Step 4: Commit** `feat(documentos): hierarquia, edição de metadados e revisão`.

### Task 2: Aprovação por versão e ciências (TDD)

**Files:** Modify `src/services/pedidos.ts`, `src/routes/pedidos.ts`, `src/schemas/domain.ts`, `src/services/documentos.ts`, `src/routes/documentos.ts`; Create `test/documentos-aprovacao.test.ts`.

- [ ] **Step 1: Testes (vermelho)** com governança de CISO e CEO (como em `test/pedido-politica.test.ts`): (a) `POST /pedidos` `{ tipo: 'documento', ref_id, papel_exigido: 'ciso', destinatarios }` cria o pedido; `ciente` nessa rota: 400 ("ciência é pelo lote"); documento sem versão vigente: 404; (b) o CISO aprova (senha) e `GET /documentos/:id` devolve `aprovacao.ciso = { por, em }` e `aprovacao.ceo = null`; depois o CEO aprova e vêm os dois; (c) aprovar **não** altera nenhuma coluna `ciso_*`/`ceo_*` de `compliance_controls` nem `dpia_assessments`; (d) versão nova publicada: `aprovacao.ciso/ceo` voltam a `null` e o pedido aprovado continua gravado com `status = 'aprovado'`; (e) destinatário sem autoridade na matriz de Governança: 403; recusa grava `recusado` com motivo; (f) a lista `GET /documentos` traz `aprovacao` resumida (`ciso`, `ceo` booleanos) sem N+1 visível nos testes (até 50 documentos); (g) `GET /documentos/:id/ciencias` devolve, por pessoa, `{ nome, email, numero, canal, em, atual }` das ciências por conta, link e portal, mais recentes primeiro; documento de outro projeto: 404.
- [ ] **Step 2: Implementar.** `pedidoCriarSchema.tipo` ganha `'documento'` (comentário sobre a migration 0051); a rota recusa `documento` + `ciente`; em `registrarDecisao`, `if (a.assinar && p.tipo !== 'documento')` (a prova é a linha do destinatário). `aprovacaoDoDocumento(db, projectId, documentoId)`: calcula `hashConteudo` do conteúdo vigente (`documentoAtual`) e busca os destinatários `aprovado` de pedidos `documento` `ciso`/`ceo` com esse `hash`. `cienciasDoDocumento` lê `pedido_destinatarios` decididos `ciente` dos pedidos `documento` do documento, com o `numero` do `conteudo_json`.
- [ ] **Step 3:** `npx vitest run test/documentos-aprovacao.test.ts test/pedido-politica.test.ts test/pedidos.test.ts test/pedidos-autoridade.test.ts test/pedido-destinatario-autoridade.test.ts test/pedidos-documento.test.ts test/openapi.test.ts`. Mutação: sem o `p.tipo !== 'documento'` o (c) falha (assinaria DPIA).
- [ ] **Step 4: Commit** `feat(documentos): aprovação CISO/CEO por versão e ciências do documento`.

### Task 3: Aviso de revisão vencida (TDD)

**Files:** Modify `src/services/avisos-prazo.ts`, `frontend/src/globals.js`; Create `test/avisos-documento.test.ts`.

- [ ] **Step 1: Testes (vermelho)** no estilo de `test/avisos-prazo.test.ts`: documento `vigente` com `revisar_ate` daqui a 7 dias gera `D-7`, hoje gera `D0`, vencido gera o atraso semanal; documento `rascunho`/`obsoleto` ou sem data não gera; "marcar como revisado" (data anda) tira o item; o responsável é a parte dona (e-mail, senão nome) e o aviso vai para as pessoas do projeto pela mesma regra das outras fontes; o título do sino é "Documento <título> precisa de revisão"; a rotulagem e a tela do clique existem (`documento` → `/documentos`).
- [ ] **Step 2: Implementar** `Fonte` com `'documento'`, entrada em `FONTES`, `ROTULO`, `TELA`, `tituloDoAviso`; `TELA_DO_AVISO.documentos = 'documentos'` em `globals.js`.
- [ ] **Step 3:** `npx vitest run test/avisos-documento.test.ts test/avisos-prazo.test.ts` (o teste de paridade de fontes pode precisar da nova fonte; ajuste só o que ele apontar) e `cd frontend && npx vitest run --pool=threads test/globals-shell.test.js`.
- [ ] **Step 4: Commit** `feat(avisos): revisão vencida de documento`.

### Task 4: Tela Documentos (TDD, jsdom)

**Files:** Create `frontend/src/views/documentos.js`, `frontend/test/documentos-view.test.js`; Modify `frontend/src/main.js`, `frontend/src/router.js`, `frontend/login.html`, `frontend/test/router.test.js`.

- [ ] **Step 1: Testes (vermelho)**: (a) a lista monta a árvore (raízes e filhos indentados), com tipo, status, versão vigente, revisão (marca "vencida" quando `revisar_ate` < hoje), dono e selo de aprovação ("Aprovado pelo Líder SGSI e pela Direção", parcial, ou nada); títulos escapados; (b) o detalhe mostra versões com texto escapado, o rascunho do agente (Publicar/Descartar, mesmas ações da 3.2), as ciências e os botões que o servidor permite; (c) criar documento (tipo, título, texto, pai, dono, periodicidade) manda `POST /documentos` com o corpo certo e recarrega; (d) editar metadados manda `PUT`; nova versão manda `POST …/versoes`; publicar e "marcar como revisado" mandam as rotas; (e) "Pedir aprovação" chama `abrirPedidoAprovacao(projeto, 'documento', id)` e "Pedir ciência" abre o modal do lote já com o documento; (f) papel só de leitura não vê botões de escrita; (g) sem projeto ativo: estado vazio; (h) `router.test.js` ganha `nav-documentos` e `renderDocumentos`.
- [ ] **Step 2: Implementar** a view (padrão de `partes.js`: `window.renderDocumentos`, `data-action`, `escapeHTML`, `window.renderDataTable`/`renderStatusBadge` existentes), a entrada na barra lateral (depois de Partes) e o `else if (S.view === 'documentos')` no roteador. A tela antiga de políticas segue.
- [ ] **Step 3:** `cd frontend && npx vitest run --pool=threads --maxWorkers=2` até o fim; `npx vite build`.
- [ ] **Step 4: Commit** `feat(telas): tela Documentos`.

### Task 5: Documentação e verificação final

- [ ] **Step 1:** `AGENTS.md` (documentos: hierarquia e revisão são regra do servidor; aprovação derivada por versão; `registrarDecisao` não assina documento; fonte `documento` nos avisos; contagens), `docs/agente/seguranca.md` (agente não marca revisado), `CHANGELOG.md`, contagens do `README.md`.
- [ ] **Step 2:** `npx tsc --noEmit`; backend inteiro (`--maxWorkers=2`, em segundo plano, lendo resumo e código de saída; se a catraca de `any` pedir, baixe o `TETO`, não suba); frontend inteiro e build; `sem-dado-de-cliente`.
- [ ] **Step 3: Commit, push, PR** sem merge (sem migration nesta fatia).

## Gaps declarados

- **A assinatura por controle** (`signPolicy`, relatório impresso, geração por IA no modal) continua na tela de políticas; documento tem aprovação por pedido, não relatório impresso.
- **Ciência manual interna** (`policy_acknowledgments`) e a tela de Ciências seguem até um dia substituí-las pela leitura dos pedidos.
- **`origem_control_id` e o espelho no controle** continuam: a ciência e o portal já leem o documento, mas a aprovação "oficial" do SGSI ainda é a do controle.
- **Exceções** (`documento_excecoes`) ficam para a 3.5.

## Auto-revisão

- **Cobertura da spec 4.6:** hierarquia (tipo e ciclo), dono, revisão com aviso, aprovação ligada à versão, ciências por versão. Fora, com dono: exceções (3.5).
- **Risco principal:** `registrarDecisao` é o caminho de toda aprovação; a mudança é de uma condição e tem teste de mutação (aprovar documento não pode assinar DPIA nem política).
- **Placeholders:** nenhum; comportamento dos testes descrito por caso.
- **Consistência de nomes:** `validarHierarquia`, `atualizarDocumento`, `marcarRevisado`, `aprovacaoDoDocumento`, `cienciasDoDocumento` e a fonte `documento` são os mesmos nas tarefas.
- **Limite honesto:** o código ainda não rodou. O ponto mais incerto é o desempenho de `aprovacaoDoDocumento` na lista (um hash e uma consulta por documento vigente): serve para dezenas de documentos por projeto; se passar disso, pagina ou guarda o hash do vigente.
