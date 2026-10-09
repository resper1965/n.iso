# Núcleo do n.privacy, fatia 3.2 — escritores de política e rascunho do agente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seções 4.6 e 4.8 ("`niso_update_policy` deixa de sobrescrever o vigente: cria versão `rascunho`"). Decomposição e a 3.1: `docs/superpowers/plans/2026-10-09-nprivacy-fatia-3-documentos.md`.

**Goal:** todo caminho que grava texto de política passa a deixar também uma versão em `documentos`, e o agente (MCP) deixa de sobrescrever a política vigente: o que ele grava entra como **rascunho**, que só um humano publica.

## O que existe hoje (lido do código)

Cinco rotas de `src/routes/policies.ts` gravam texto de política, cada uma com a mesma sequência copiada: `UPDATE compliance_controls SET description = ?` + zera as 8 colunas de aprovação (só `restore-version` usa `COLUNAS_REVOGACAO`, as outras repetem o literal) + `conferirPedidosDoDocumento(c, 'politica', id, projectId)` (`src/routes/pedidos.ts:35`) + `INSERT INTO policy_versions` (número por `COUNT(*)+1`). São `generate-policy` (58-78), `generate-policies-bulk` (278-297), `generate-from-template` (572-591), `restore-version` (441-456) e a edição manual `POST /controls/:cid/policy` (494-509). `PUT /controls/:id` (`controls.ts`) também grava `description`, mas ali o campo é, ao mesmo tempo, a **justificativa de N/A da SoA**.

O agente chama as mesmas rotas por fetch interno e a identidade viaja em `env.AGENTE`: dentro da rota, `c.get('user')?.agente === true` (`src/middleware/agente.ts:135-141`, `src/index.ts:134`). `niso_update_policy` e `niso_generate_policy` não exigem confirmação no servidor; o `generate-policies-bulk` já é bloqueado ao agente (`BLOQUEADAS`, `servidor.ts:12`).

**Nenhum teste existente chama uma rota de política como agente.** Os que tocam os escritores como humano e precisam continuar verdes: `policies.test.ts`, `pedido-politica.test.ts`, `pedidos-publico.test.ts`, `fatia-jornada-ponta-a-ponta.test.ts`, `controle-por-codigo.test.ts`, `vetorizacao-removida.test.ts`, `mcp-remoto.test.ts`.

## Decisões de desenho (rulings)

1. **Dupla escrita, controle como fonte.** Até a 3.3 a política vigente continua sendo `compliance_controls.description` (a ciência, o portal e os pedidos ainda leem dali). Os escritores humanos fazem tudo o que fazem hoje **e** deixam a versão em `documentos`. Nada que lê o controle muda.
2. **O agente grava rascunho no servidor.** Em `POST /controls/:cid/policy` e `POST /generate-policy`, se `c.get('user')?.agente === true`: salva uma versão `rascunho` (`origem='agente'`) e **não** toca `description`, aprovações, pedidos nem `policy_versions`. Resposta `200 { ok: true, rascunho: true, documento_id, numero }`. É imposição de servidor, não texto de prompt.
3. **Publicar é ato humano.** `POST /documentos/:id/versoes/:n/publicar` responde 403 se `agente === true` (vale também por `niso_executar`). Ao publicar um documento que tem `origem_control_id`, a rota **aplica no controle** a mesma sequência dos escritores (texto, aprovações a zero, pedidos conferidos, `policy_versions`): publicar rascunho do agente tem o mesmo efeito de uma edição manual de hoje.
4. **Sem documento ainda?** `garantirDocumentoDoControle` roda **antes** de qualquer escrita: se o controle tem sinal de política (versão, aprovação ou pedido) e não é "Não aplicável", importa o histórico no padrão da 3.1; senão cria o documento vazio em `rascunho`. Assim a primeira escrita nunca perde histórico (o `importar` pula controle que já tem documento).
5. **Texto igual ao vigente não cria versão** (compara o hash).
6. **Falha do espelho não derruba o escritor.** O espelho em `documentos` é registrado com `registraErro` e o escritor segue, como já faz o `INSERT INTO policy_versions` hoje. Custo conhecido: possível deriva entre o controle e `documentos` até a 3.3; `importar` não corrige (pula o que existe). Medido e aceito, porque o controle segue sendo a fonte.
7. **Um rascunho do agente pendente não é apagado por edição humana.** A interface mostra o aviso e deixa publicar ou descartar. Descartar é rota nova mínima (`DELETE .../documentos/:id/rascunho`).
8. **Fora desta fatia:** a justificativa de N/A (`compliance_controls.justificativa_exclusao`) e `PUT /controls/:id`. A coluna `description` segue com dois sentidos no controle; separar toca cerca de 5 arquivos de backend, 2 de frontend e exige backfill, e fica numa **3.2b** própria. A aprovação CISO/CEO continua nas colunas do controle (a 3.3 decide apontar para a versão).

## Global Constraints

- Sem migration nova nesta fatia (usa as tabelas da 0050).
- Comportamento HTTP dos escritores humanos **idêntico** ao de hoje: mesmos corpos de resposta, mesmos efeitos no banco, mesmos eventos de auditoria. Os testes listados acima são a prova.
- Banco real nos testes (`cloudflare:test`); sem dado real de cliente.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge; deploy e merge só com o "sim" do dono.

## Review Focus

1. Agente grava: `description`, aprovações, pedidos e `policy_versions` ficam **intactos**; só nasce o rascunho.
2. Agente não publica, nem por `niso_executar`.
3. Publicar o rascunho do agente zera as aprovações e substitui o pedido aberto, igual a uma edição manual.
4. Primeira escrita num controle com histórico não perde as versões antigas em `documentos`.
5. Mesmo texto gravado duas vezes não cria versão repetida.
6. Edição humana com rascunho do agente pendente não apaga o rascunho; publicar um rascunho velho depois é decisão visível (aviso na tela).
7. Falha ao espelhar não faz o escritor devolver erro.

## File Structure

| Arquivo | Papel |
|---|---|
| `src/services/documentos.ts` | `importarControle` (extraído de `importarDocumentos`), `garantirDocumentoDoControle`, `espelharTexto`, `descartarRascunho` |
| `src/services/politica-escrita.ts` (novo) | `aplicarTextoNoControle(c, projectId, controlId, texto, ator)`: a sequência comum dos escritores |
| `src/routes/policies.ts` | os cinco escritores passam a chamar o serviço; agente vira rascunho nas duas rotas |
| `src/routes/documentos.ts` | publicar aplica no controle e recusa agente; `DELETE /documentos/:id/rascunho` |
| `src/routes/policies.ts` (`GET .../controls/:cid/policy`) | passa a devolver `rascunho` pendente |
| `frontend/src/views/compliance.js` | aviso do rascunho no modal da política, com Publicar e Descartar |
| `mcp-server-niso/src/ferramentas.ts`, `src/mcp/contexto.ts` | descrições dizem "grava rascunho; humano publica" |
| `test/politica-espelho.test.ts`, `test/politica-agente.test.ts`, `frontend/test/politica-rascunho.test.js` | provas |

---

### Task 1: Espelho em `documentos` (serviço, TDD)

**Files:** Modify `src/services/documentos.ts`; Create `test/politica-espelho.test.ts`.

**Produz:** `importarControle(db, projectId, controle, historico, ator)`; `garantirDocumentoDoControle(db, projectId, controlId, ator): Promise<string>` (devolve o id do documento); `espelharTexto(db, projectId, documentoId, texto, ator, origem): Promise<{ criada: boolean }>`; `descartarRascunho(db, projectId, documentoId, ator): Promise<Falha | { ok: true }>`.

- [ ] **Step 1: Testes (vermelho).** Em `test/politica-espelho.test.ts`, chamando o serviço direto sobre D1 real: (a) `garantirDocumentoDoControle` num controle com `policy_versions` v1, v2 cria o documento com as 2 versões (a última vigente), no padrão da importação da 3.1; (b) num controle só com texto de catálogo cria documento **vazio** em `rascunho`; (c) chamado duas vezes devolve o mesmo id e não duplica; (d) `espelharTexto` com texto novo cria a versão seguinte e a deixa vigente (a anterior `substituida`); (e) com o **mesmo** texto da vigente não cria nada (`criada: false`); (f) num documento vazio cria a versão 1 vigente; (g) `descartarRascunho` apaga só o rascunho, mantém a vigente, e devolve 404 se não há rascunho.
- [ ] **Step 2: Implementar.** Extraia de `importarDocumentos` o corpo do laço para `importarControle` (mesmo SQL e mesmas regras da 3.1; a função de importação passa a chamá-la). `garantirDocumentoDoControle`: procura por `origem_control_id`; se não existe, lê o controle e o histórico e decide como na decisão 4. `espelharTexto`: compara `hashDoTexto(texto)` com a versão vigente; se igual, `{ criada: false }`; senão `salvarRascunho` seguido de `publicarVersao`. `descartarRascunho`: `DELETE FROM documento_versoes WHERE documento_id = ? AND project_id = ? AND estado = 'rascunho'`, 404 se `meta.changes` for 0, com `logAudit('documento.rascunho_descartado')`.
- [ ] **Step 3:** `npx vitest run test/politica-espelho.test.ts test/documentos-importar.test.ts test/documentos.test.ts` — Expected: PASS (a importação da 3.1 não pode mudar de resultado).
- [ ] **Step 4: Commit** `feat(documentos): espelho de política e documento do controle`.

### Task 2: Sequência comum dos escritores e espelho nos cinco (refator com rede de testes)

**Files:** Create `src/services/politica-escrita.ts`; Modify `src/routes/policies.ts`; Test: `test/politica-espelho.test.ts` (acrescenta casos de rota).

- [ ] **Step 1: Testes de rota (vermelho).** Para cada escritor humano (`generate-policy`, `generate-from-template`, edição manual, `restore-version`), um caso que chama a rota e confere, **além** do que `policies.test.ts` já confere, que `documentos` ganhou o documento do controle e que a versão vigente tem o texto novo; e um caso em que a primeira escrita num controle **com histórico** deixa as versões antigas no documento (Review Focus 4). Um caso força a falha do espelho (Proxy sobre o D1 que rejeita `INSERT INTO documento_versoes`, no estilo de `test/erro-sem-vazamento.test.ts`) e confere que o escritor ainda responde 200 e grava `description` (Review Focus 7).
- [ ] **Step 2: `aplicarTextoNoControle`.** Uma função com a sequência comum, exatamente a de hoje: `UPDATE compliance_controls SET description = ?, ${COLUNAS_REVOGACAO.ciso}, ${COLUNAS_REVOGACAO.ceo}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`; `await conferirPedidosDoDocumento(c, 'politica', idCanonico, projectId)`; `INSERT INTO policy_versions` com número `COUNT(*)+1` por `control_id = idCanonico` (a variante `OR control_id = <id cru>` era redundante, porque o INSERT sempre usa o id canônico). Auditoria e tratamento de erro continuam em cada rota.
- [ ] **Step 3: Rotas.** Em cada um dos cinco escritores, troque o bloco copiado por: `await garantirDocumentoDoControle(...)` → `await aplicarTextoNoControle(...)` → espelho em `try { await espelharTexto(...) } catch (e) { registraErro(...) }`. `generate-policies-bulk` segue sem acesso do agente.
- [ ] **Step 4:** `npx vitest run test/politica-espelho.test.ts test/policies.test.ts test/pedido-politica.test.ts test/pedidos-publico.test.ts test/fatia-jornada-ponta-a-ponta.test.ts test/controle-por-codigo.test.ts test/vetorizacao-removida.test.ts test/mcp-remoto.test.ts` — Expected: PASS. Qualquer falha nos arquivos já existentes é regressão do refator: corrija a função, não o teste.
- [ ] **Step 5: Commit** `refactor(politicas): sequência comum dos escritores e espelho em documentos`.

### Task 3: Agente grava rascunho; publicar é humano (TDD)

**Files:** Modify `src/routes/policies.ts`, `src/routes/documentos.ts`; Create `test/politica-agente.test.ts`.

- [ ] **Step 1: Testes (vermelho).** Sessão de agente montada como em `test/agente-principal.test.ts`/`mcp-remoto.test.ts` (`env.AGENTE` preenchido). (a) `POST /controls/:cid/policy` como agente devolve `{ ok: true, rascunho: true, documento_id, numero }` e deixa `description`, as aprovações, os pedidos abertos e `policy_versions` **intactos**, com uma versão `rascunho` de `origem='agente'`; (b) `POST /generate-policy` como agente idem; (c) como **humano** as duas rotas seguem gravando direto; (d) agente em `POST /documentos/:id/versoes/:n/publicar` recebe 403 e nada muda, e o mesmo pelo caminho genérico do `niso_executar`; (e) humano publica o rascunho do agente: `description` vira o texto, as aprovações vão a `NULL`, o pedido aberto de política vira `substituido` com novo pedido, e nasce uma linha em `policy_versions`; (f) `DELETE /documentos/:id/rascunho` humano descarta; agente recebe 403; (g) edição humana com rascunho do agente pendente mantém o rascunho (Review Focus 6).
- [ ] **Step 2: Implementar.** No começo das duas rotas de escrita de política: `if (c.get('user')?.agente === true)` → `garantirDocumentoDoControle` + `salvarRascunho(..., 'agente')` e retorna. Em `publicar`: 403 se agente; depois de `publicarVersao` ok, se o documento tem `origem_control_id`, carrega o texto da versão e chama `aplicarTextoNoControle`. Rota `DELETE /documentos/:id/rascunho` (humano) chamando `descartarRascunho`.
- [ ] **Step 3:** `npx vitest run test/politica-agente.test.ts test/politica-espelho.test.ts test/policies.test.ts test/mcp-remoto.test.ts test/agente-paridade.test.ts test/agente-principal.test.ts`. Depois `test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/openapi.test.ts` (a rota `DELETE` nova; `npm run openapi` regenera o contrato).
- [ ] **Step 4:** Atualize as descrições do agente: `niso_update_policy` e `niso_generate_policy` em `mcp-server-niso/src/ferramentas.ts` ("grava um **rascunho**; um humano publica na tela da política"), a nota desatualizada de `niso_update_control` (ele zera as aprovações quando o texto muda) e `src/mcp/contexto.ts` (linhas 8, 29 e 44). Rode `npx vitest run test/contrato-mcp.test.ts test/agente-skills.test.ts` e `npm run skills:gerar` se o teste de skills pedir.
- [ ] **Step 5: Commit** `feat(politicas): rascunho do agente imposto no servidor; publicar é ato humano`.

### Task 4: Aviso do rascunho na tela da política (TDD, jsdom)

**Files:** Modify `src/routes/policies.ts` (`GET .../controls/:cid/policy`), `frontend/src/views/compliance.js`; Create `frontend/test/politica-rascunho.test.js`.

- [ ] **Step 1:** `GET .../controls/:cid/policy` passa a devolver `rascunho: { documento_id, numero, texto, origem, criado_por, criado_em } | null` (o rascunho pendente do documento do controle). Teste de backend em `test/politica-agente.test.ts`: sem rascunho `null`; com rascunho do agente, o objeto.
- [ ] **Step 2: Teste de UI (vermelho)** no estilo de `frontend/test/politica-modal.test.js`: com `rascunho` na resposta, `openGeneratePolicyModal` mostra "Rascunho do agente pendente" com o autor e dois botões (`data-action="publicarRascunhoPolitica"` e `"descartarRascunhoPolitica"`); sem `rascunho`, nada aparece; o texto vindo do servidor é escapado; Publicar chama `POST /api/v1/projects/:p/documentos/:id/versoes/:n/publicar` e recarrega o modal; Descartar chama `DELETE .../documentos/:id/rascunho`. CSP: sem `onclick` inline, só delegação por `data-action`.
- [ ] **Step 3: Implementar** o bloco no modal de `compliance.js` (classes já existentes, sem CSS novo) e as duas funções em `window`.
- [ ] **Step 4:** `cd frontend && npx vitest run --pool=threads --maxWorkers=2` até o fim, lendo o resumo e o código de saída; `npx vite build`.
- [ ] **Step 5: Commit** `feat(politicas): aviso e publicação do rascunho do agente na tela da política`.

### Task 5: Documentação e verificação final

**Files:** `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/agente/` (o que descreve o comportamento do agente em política), `docs/openapi.json` (regenerado).

- [ ] **Step 1:** Contagens com os comandos do `AGENTS.md`; no `AGENTS.md`, o trecho de "Documentos" passa a dizer que os escritores espelham em `documentos` e que o agente só grava rascunho; `docs/agente/seguranca.md` ganha a regra "o agente não publica política". `CHANGELOG.md`, em `### Alterado`: "O agente (MCP) deixa de sobrescrever a política: `niso_update_policy` e `niso_generate_policy` gravam um rascunho que um humano publica na tela da política (fatia 3.2)".
- [ ] **Step 2:** `npx tsc --noEmit`; suíte inteira do backend (`--maxWorkers=2`, em segundo plano se passar de 10 minutos, lendo o resumo e o código de saída); suíte e build do frontend; `test/sem-dado-de-cliente.test.ts`.
- [ ] **Step 3: Commit, push, PR** sem merge. Sem migration: o deploy não depende de nada além do merge. Depois do deploy, quem usa o agente para política passa a ver os rascunhos no modal.

## Auto-revisão

- **Cobertura da spec (4.6 e 4.8):** escritores gravam versão em `documentos`; `niso_update_policy` cria rascunho e não sobrescreve; o rascunho imposto no servidor (risco 4 da seção 7: "sem ele, o diferencial é só texto") fica coberto. Fora, com dona: justificativa de N/A (3.2b), ciência por versão e portal (3.3), tela Documentos completa (3.4).
- **Risco de comportamento:** a mudança que o usuário percebe é o agente deixar de gravar direto. Por isso a Task 4 faz parte desta fatia: sem a tela, o rascunho ficaria sem caminho de publicação pela interface.
- **Placeholders:** nenhum; os trechos que o teste "manda" têm o comportamento descrito como regra verificável.
- **Consistência de nomes:** `garantirDocumentoDoControle`, `espelharTexto`, `importarControle`, `descartarRascunho`, `aplicarTextoNoControle` e as rotas são os mesmos nas tarefas.
- **Limite honesto:** o mapa dos escritores veio de leitura de código (linhas citadas), não de execução; a Task 2 foi desenhada para falhar alto se uma das cinco cópias tinha diferença que o mapa não viu (a suíte existente é a rede). O fetch interno do agente foi lido, não exercitado: o teste (a)-(d) da Task 3 é a primeira prova de que `agente === true` chega às rotas de política.
