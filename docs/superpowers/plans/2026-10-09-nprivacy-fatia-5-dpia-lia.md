# Núcleo do n.privacy, fatia 5 — DPIA e LIA nascem do tratamento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 5 ("DPIA e LIA nascem do tratamento") e 9 (fatia 5). Depende da fatia 4 (o tratamento ligado). Plano mestre: `2026-10-09-nprivacy-plano-mestre-fatias-2-a-8.md`.

**Goal:** a DPIA aponta para o tratamento com integridade garantida pelo banco, nasce pré-preenchida a partir dele, e a LIA (teste de legítimo interesse) existe como registro próprio, exigida quando a base legal do tratamento é o legítimo interesse.

## Decisões de desenho (rulings)

1. **Integridade de `dpia_assessments.ropa_id` por TRIGGER, não por rebuild.** A spec pede FK real; SQLite só adiciona FK reconstruindo a tabela, e `dpia_assessments` tem histórico de deriva em produção (migration 0013, colunas acrescentadas por `ALTER` em ordem própria). Reconstruir uma tabela com assinatura e deriva só para trocar `TEXT` por `TEXT REFERENCES` é risco sem ganho. Três triggers dão o mesmo efeito **e mais** (a FK não confere o projeto, o trigger confere): `BEFORE INSERT` e `BEFORE UPDATE OF ropa_id` recusam `ropa_id` que não exista **no mesmo projeto**; `AFTER DELETE` em `ropa_records` zera o `ropa_id` das DPIAs que apontavam (equivalente a `ON DELETE SET NULL`). Custo se errado: trocar os triggers por FK numa futura reconstrução.
2. **Linhas órfãs existentes:** a migration zera `ropa_id` que aponta para registro inexistente (só esse caso; apontar para registro de outro projeto é conferido na conferência de produção e tratado à mão, sem apagar nada). Conferir a contagem antes de aplicar.
3. **Não unifico as duas famílias de colunas da DPIA nesta fatia.** O conteúdo congelado do pedido de DPIA (`COLUNAS_DPIA`) e as assinaturas já gravadas dependem dos nomes atuais; mexer nelas invalidaria hash de aprovações existentes. O relatório e a tela já leem as duas famílias. Entra como gap declarado, com a regra para fazer depois: renomear só junto de novo hash para as DPIAs ainda abertas.
4. **LIA = tabela irmã `lia_assessments`, uma por tratamento** (`ropa_id` único, `ON DELETE CASCADE`): `finalidade_legitima`, `necessidade`, `balanceamento`, `salvaguardas`, `conclusao` (`prevalece` | `nao_prevalece`), `status` (`rascunho` | `concluida`), autor e datas. Sem assinatura nem pedido nesta fatia (a spec não pede); concluir é ato de quem edita, com trilha.
5. **LIA exigida** quando o tratamento usa legítimo interesse: pela base do catálogo (`base_legal_id` cujo requisito tenha "legítimo interesse" no título, sem acento nem caixa) **ou** pelo texto livre `legal_basis` com a mesma expressão. Enquanto o catálogo da LGPD não tem as bases carregadas, vale o texto. A exigência aparece em `GET .../ligacoes` (`lia: { exigida, existe, status }`), sem bloquear nada.
6. **DPIA a partir do tratamento:** `POST /projects/:id/ropa/:rid/dpia` cria uma DPIA `Draft` já ligada (`ropa_id`), com `processing_name` = finalidade, `data_subjects_types` = titulares, `personal_data_categories` = categorias e `data_flow_description` montada das ligações (itens, partes, transferências, em texto). Não duplica: se já existe DPIA ligada a esse tratamento, devolve 409 com o id dela. `GET .../ligacoes` lista as DPIAs do tratamento e diz se `dpia_required` está sem DPIA.
7. **Tela:** na janela de Ligações, seção "Avaliações": estado da DPIA (criar a partir do tratamento / abrir) e da LIA (formulário curto, salvar, concluir).

## Global Constraints

- Migration só aditiva: `CREATE TABLE IF NOT EXISTS`, `CREATE TRIGGER IF NOT EXISTS` e um `UPDATE` que só zera referência morta. Backup antes; aplicar pelo terminal antes do merge.
- Banco real nos testes; tabela nova com `project_id`; sem dado real de cliente.
- O agente cria rascunho de DPIA e de LIA; concluir LIA e aprovar DPIA seguem humanos.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria.

## Review Focus

- `ropa_id` de outro projeto é recusado **pelo banco**, também por `UPDATE` direto (não só pela rota).
- Apagar o tratamento não apaga a DPIA nem a assinatura: zera a ligação. Apagar o tratamento apaga a LIA.
- Criar DPIA a partir do tratamento duas vezes não duplica.
- LIA exigida: "Legítimo Interesse", "legitimo interesse" e a base do catálogo contam; "consentimento" não.
- DPIA e LIA de um projeto nunca aparecem nas ligações de outro.

## Tasks

### 5.1 Migration 0056 e LIA

- [ ] Teste da migration: triggers (insert/update de `ropa_id` inexistente e de outro projeto recusados; `AFTER DELETE` zera), limpeza de órfãs, `lia_assessments` (CHECKs, unicidade, cascata).
- [ ] `migrations/0056_dpia_lia.sql` e espelho no `schema.sql` (triggers e tabela depois das tabelas que referenciam).
- [ ] `src/services/lia.ts`: `lerLia`, `salvarLia` (upsert, recusa conclusão sem os campos), `liaExigida`.
- [ ] Rotas `GET/PUT/DELETE /projects/:id/ropa/:rid/lia`; `lerLigacoes` ganha `lia` e `dpias`.

### 5.2 DPIA a partir do tratamento e tela

- [ ] `criarDpiaDoTratamento` no serviço e `POST /projects/:id/ropa/:rid/dpia` (409 se já existe).
- [ ] Seção "Avaliações" na janela de Ligações.
- [ ] Testes de rota, de serviço e de tela; documentação (AGENTS, README, CHANGELOG, migrations/README); `npm run openapi`; suítes e build.

## Rollout

`npm run db:backup` → contar `dpia_assessments` e as com `ropa_id` morto → `wrangler d1 migrations apply niso-db --remote` → `PRAGMA` das tabelas e `sqlite_master` dos 3 triggers → merge → `/health` com o SHA.

## Gaps declarados

- Sem unificação das famílias de colunas da DPIA (ruling 3).
- LIA sem assinatura nem pedido; entra se o jurídico pedir prova.
