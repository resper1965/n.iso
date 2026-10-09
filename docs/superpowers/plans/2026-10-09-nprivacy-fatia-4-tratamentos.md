# Núcleo do n.privacy, fatia 4 — RoPA vira tratamento ligado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 5 ("Tratamento (RoPA)") e 4.9. Plano mestre: `2026-10-09-nprivacy-plano-mestre-fatias-2-a-8.md`. Depende da fatia 2 (catálogo de requisitos) e da 1 (partes, itens, departamentos).

**Goal:** cada registro do RoPA passa a apontar para os sistemas, bases e processos que usa, os departamentos, as partes (operador, cocontrolador, suboperador) e as transferências internacionais, com a base legal ligada ao catálogo; o diagrama sai das ligações e a aprovação passa a ter prova por pedido.

## Decisões de desenho (rulings)

1. **`ropa_records` continua sendo a tabela do tratamento. Não há rename nem migração de dados.** A spec chama a entidade de `tratamentos`; renomear tocaria `ropa_records` em 30+ arquivos (exportação, direitos do titular, portabilidade, prontidão, MCP) e em dados vivos, por ganho só de nome. As tabelas novas se chamam `tratamento_*` e apontam para `ropa_records(id)`; no texto e na tela, "tratamento" e "registro do RoPA" são a mesma coisa. Custo se errado: um rename futuro, mecânico e isolado.
2. **Partes não ganham tabela: usam `parte_vinculos`** com `alvo_tipo = 'tratamento'` (o CHECK da 0047 já aceita) e papéis `operador`, `cocontrolador`, `suboperador`, `terceiro` (destinatário). `conferirAlvo` de `nucleo.ts` passa a aceitar `tratamento` (→ `ropa_records`) e `MATRIZ_PAPEL_ALVO` ganha a linha. Excluir o registro apaga os vínculos dele (não há FK).
3. **Base legal = requisito do catálogo.** `ropa_records.base_legal_id` aponta para `requisitos(id)` (`ON DELETE SET NULL`); as bases são os filhos de `lgpd:art7` e `lgpd:art11`. O texto livre `legal_basis` continua gravado e é o que o relatório mostra se `base_legal_id` for nulo. **Sem o material jurídico da fatia 2 a lista fica vazia e a tela segue com o select atual**; nada quebra e nenhuma lista de bases é escrita por mim.
4. **Ligações em tabelas próprias, com `project_id`:** `tratamento_itens`, `tratamento_departamentos`, `tratamento_transferencias` (país, destinatário = parte, mecanismo, observação). Item e departamento têm de ser do mesmo projeto do registro (conferido no servidor; id de outro projeto é 400).
5. **Mermaid derivado, nunca guardado:** `diagramaDoTratamento(db, projectId, ropaId)` devolve texto Mermaid (`flowchart LR`) com titulares → tratamento → sistemas/bases/processos, partes por papel e transferências. Rótulos escapados para Mermaid (sem aspas nem colchetes soltos). A tela mostra o texto e oferece copiar; renderizar exigiria biblioteca de terceiros e o CSP não permite.
6. **Aprovação por pedido (tipo `tratamento`)** convive com a aprovação direta atual (`POST .../approve`, CISO/CEO com senha). O pedido congela o conteúdo do registro **e o diagrama** (hash SHA-256); mudar o registro ou qualquer ligação invalida a aprovação derivada, como no documento (`aprovacoesDoProjeto`). CHECK de `pedidos.tipo` reconstruído no molde da 0051 (produção tem 0 pedidos na hora de planejar; conferir de novo antes de aplicar).
7. **Importação de planilha** (CSV, modelo próprio) cria registros em `Draft` e devolve o relatório de linhas recusadas com o motivo; nada é criado se o arquivo inteiro for inválido. O agente continua criando só `Draft` (`ropa.ts:69`) e não aprova (aprovar exige senha).
8. **Sem tela de edição das ligações em lote** nesta fatia: a ficha do registro ganha uma seção "Ligações" com adicionar e remover por linha.

## Global Constraints

- Migrations só aditivas (CREATE ... IF NOT EXISTS, ALTER ADD COLUMN anulável) e, na 4.3, a reconstrução de `pedidos` no molde da 0051. Backup antes de cada uma; aplicar pelo terminal antes do merge.
- Banco real nos testes; sem dado real de cliente (a guarda `sem-dado-de-cliente` varre docs e testes: nome de projeto real nunca aparece). Tabela nova leva `project_id`.
- O agente lê as ligações e cria rascunho; qualquer ato que decida (aprovar, revogar) segue humano (`FORA_DO_AGENTE`).
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria.

## Review Focus

- Apagar o registro apaga as ligações e os vínculos de parte (sem órfão que reapareça em outro registro com o mesmo id).
- Item, departamento ou parte de outro projeto nunca é ligado (400), nem por id repetido no corpo.
- O diagrama não quebra com nome que tenha aspas, colchetes, quebra de linha ou HTML, e não vaza nome de outro projeto.
- Aprovação por pedido: mudar uma ligação invalida a aprovação; a aprovação direta antiga segue funcionando.
- Importação: linha inválida não derruba as válidas; reimportar o mesmo arquivo não duplica (chave: finalidade + projeto).

## Sub-fatias

### 4.1 Estrutura (migration 0054)

**Files:** `migrations/0054_tratamento_ligacoes.sql`, `schema.sql`, `migrations/README.md`, `src/services/tratamentos.ts`, `src/routes/ropa.ts` (ligações e exclusão), `src/routes/nucleo.ts` (`conferirAlvo`, matriz), `src/schemas/resources.ts`, `src/openapi.ts`, testes `test/migration-0054.test.ts`, `test/tratamento-ligacoes.test.ts`.

- [ ] Teste da migration (colunas, CHECKs da própria migration, FKs, `ON DELETE`).
- [ ] Migration: `ALTER TABLE ropa_records ADD COLUMN base_legal_id`, `tratamento_itens`, `tratamento_departamentos`, `tratamento_transferencias`; espelhar no `schema.sql`.
- [ ] Serviço: ligar/desligar item e departamento (mesmo projeto), CRUD de transferência, leitura consolidada das ligações (`GET /projects/:id/ropa/:rid/ligacoes`: itens, departamentos, partes por papel, transferências, base legal).
- [ ] `nucleo.ts`: `tratamento` vira alvo válido de vínculo; papéis permitidos conforme a matriz.
- [ ] Exclusão do registro apaga ligações e vínculos; teste do Review Focus.

### 4.2 Diagrama

**Files:** `src/services/tratamentos.ts` (`diagramaDoTratamento`), `src/routes/ropa.ts` (`GET .../diagrama`), `frontend/src/views/privacy.js` (ficha com Ligações e diagrama), testes de serviço e de tela.

- [ ] Teste: nome com aspas, colchetes, `<b>` e quebra de linha vira rótulo seguro; ligações de outro projeto não aparecem.
- [ ] Função pura que monta o Mermaid a partir das linhas lidas; rota devolve `{ mermaid }`.
- [ ] Ficha: seção "Ligações" (adicionar/remover) e bloco do diagrama com copiar.

### 4.3 Aprovação por pedido (migration 0055)

**Files:** `migrations/0055_pedidos_tratamento.sql` (reconstrói `pedidos` no molde da 0051), `src/services/pedidos.ts` (`DOCUMENTOS.tratamento`), `src/routes/ropa.ts`, `src/routes/pedidos.ts`, `frontend/src/views/privacy.js`, `meus-pedidos.js`, testes.

- [ ] Pré-checagem em produção: `pedidos` e `pedido_destinatarios` com 0 linhas, triggers presentes (ou portar os dados na reconstrução).
- [ ] Pedido `tipo = 'tratamento'` congela registro + ligações + diagrama; aprovação derivada; mudar ligação invalida.
- [ ] Tela: "Pedir aprovação" no registro, selo de aprovação derivada.

### 4.4 Importação e fechamento

**Files:** `src/services/tratamentos-importar.ts`, `src/routes/ropa.ts` (`POST .../ropa/importar`), `frontend/src/views/privacy.js`, modelo CSV, testes, docs (CHANGELOG, AGENTS, README, `docs/agente/seguranca.md`), `npm run openapi`.

- [ ] Parser de CSV com cabeçalho fixo; relatório `{ criados, ja_existiam, recusadas: [{ linha, motivo }] }`.
- [ ] Teste: arquivo com linhas boas e ruins; reimportar não duplica; arquivo vazio ou sem cabeçalho é 400 sem criar nada.
- [ ] Tela: botão "Importar planilha" e download do modelo; relatório na tela.
- [ ] Verificação final: `tsc`, suítes do backend e do frontend, build, catraca de `any`.

## Rollout

Por sub-fatia que tem migration (4.1 e 4.3): `npm run db:backup` (mover para `C:\Users\resper\backups-niso\`) → pré-checagem → `wrangler d1 migrations apply niso-db --remote` → `PRAGMA table_info` → CI verde → merge → `/health` com o SHA. A 4.2 e a 4.4 só têm deploy.

## Gaps declarados

- Sem rename de `ropa_records`; sem listas controladas de categorias de titular e de dado (continuam texto), porque a spec as chama "listas controladas" sem fixar o conteúdo e isso é decisão jurídica; entram quando o material chegar.
- Diagrama só como texto Mermaid; sem renderização na tela.
