# Núcleo do n.privacy, fatia 2 — catálogo de requisitos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.5 (`requisito_fontes`, `requisitos`, `requisito_mapeamentos`, `compliance_controls.requisito_id`), 4.6 (`documento_requisitos`), 4.9 (lacuna de artigo da LGPD) e 9 (fatia 2: "visão por artigo da LGPD (lacunas)").

**Goal:** um catálogo global de requisitos (ISO 27001:2022, ISO 27701:2025, LGPD, GDPR) com mapeamento entre eles, cada controle do projeto apontando para o seu requisito e uma visão por artigo da LGPD que mostra o que está coberto e o que é lacuna.

## Decisões do dono que moldam esta fatia (09/10/2026)

- **Pergunta 7 (jurídico):** o conteúdo jurídico (títulos curtos dos artigos, mapeamentos) **já foi revisado** e deve ser **editável**, não constante no código. Prazos do titular/incidente e lista de bases legais seguem o mesmo princípio, mas pertencem às fatias que os usam (RoPA e Titular); a tabela de parâmetros nasce lá, não aqui.
- **Pergunta 5:** `stakeholders` viram parte com vínculo `parte_interessada` (fora desta fatia; fica para a que mexer em partes).
- **Pergunta 6:** processo é item; tratamento é entidade separada (fatia 4).

## Decisões de desenho (rulings)

1. **Catálogo global, sem `project_id`.** As três tabelas novas são dado de referência, como o catálogo 27701 de hoje. `test/contrato-isolamento-org.test.ts` classifica tabela sem `project_id` como global: conferir ali que elas entram na lista de globais esperadas e não quebram o contrato de isolamento.
2. **Ids legíveis:** `iso27001:2022:A.5.1`, `iso27701:2025:A.1.2.6`, `lgpd:art37`, `lgpd:art37:i`. Fontes: `iso27001:2022`, `iso27701:2025`, `lgpd`, `gdpr`.
3. **A fonte da verdade passa a ser o banco, depois do seed.** O seed é `INSERT OR IGNORE`: roda de novo sem sobrescrever o que um administrador editou. Título editado fica; título novo no código só entra se a linha não existe.
4. **ISO nasce do código que já existe** (`src/data/iso27001-2022.ts`, 93; `src/data/iso27701-2025.ts`, 31 controlador + 18 operador). Os títulos já são rótulos próprios, nunca o texto normativo.
5. **LGPD e GDPR nascem de um arquivo de dados fornecido pelo dono** (`src/data/requisitos-lgpd.ts`, `requisitos-gdpr.ts`), já revisado pelo jurídico. **Entrada bloqueante da Task 3**: sem o material, as Tasks 1, 2 e 4 andam e a 3 espera. Eu não redijo título nem mapeamento jurídico.
6. **Mapeamento importado como `validado_juridico`** quando o material trouxer quem validou e quando (`validado_por`, `validado_em` obrigatórios nesse estado, por CHECK). O que não vier com validação entra `proposto`. **Só `validado_juridico` aparece para papéis de cliente**; consultor e `platform_admin` veem os dois, com selo.
7. **Edição só por `platform_admin`**, com `logAudit` em toda mudança de título e de mapeamento. Cliente e consultor leem. Apagar requisito que tem controle ou documento apontando para ele é 409.
8. **`compliance_controls.requisito_id`** é coluna anulável (`ALTER ... ADD COLUMN`, `REFERENCES requisitos(id) ON DELETE SET NULL`). O backfill casa por norma + primeiro token do título (o código), o mesmo critério do `stmtControles`. `semearControles` passa a gravar o `requisito_id` dos controles novos.
9. **`documento_requisitos`** (N:N, `PRIMARY KEY (documento_id, requisito_id)`, com `project_id`) entra aqui porque a fatia 3 deixou a ligação esperando. O documento continua existindo sem nenhuma linha.
10. **Lacuna da LGPD (escopo desta fatia):** um artigo é **coberto** se há um documento vigente ligado a ele, ou um controle do projeto ligado por mapeamento validado cujo status não seja `Missing`/`Not Applicable`. Se só há mapeamento `parcial`, é **parcial**; caso contrário é **lacuna**. Mapeamento `relacionado` e `proposto` nunca cobrem (decidido na execução). `evidencia_requisitos` (spec 4.7) fica para a fatia que mexer em evidência; a lacuna de hoje não conta evidência e a tela diz isso.

## Global Constraints

- Migration só `CREATE ... IF NOT EXISTS` e um `ALTER ... ADD COLUMN` anulável; sem carga. Rollout: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → semear → merge.
- Schema muda em `schema.sql` e na migration; índice depois da tabela.
- Banco real nos testes (`cloudflare:test`). Sem dado real de cliente. Tabela de projeto leva `project_id`.
- O agente (MCP) só lê o catálogo; qualquer escrita de catálogo entra em `FORA_DO_AGENTE`.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge.

## Review Focus

- Semear duas vezes não duplica nem sobrescreve título editado.
- Cliente nunca recebe mapeamento `proposto`, nem pelo endpoint do artigo, nem pela lacuna.
- Requisito apagado ou renomeado não deixa controle ou documento órfão com id quebrado (`ON DELETE SET NULL` / 409).
- Backfill não liga controle de outro projeto nem de outra norma ao requisito errado (27001 `A.5.1` não casa com 27701).
- Lacuna não conta controle `Not Applicable` como cobertura.

## Tasks

### Task 1 — Migration 0053 e schema

**Files:** `migrations/0053_requisitos.sql`, `schema.sql`, `migrations/README.md`, teste `test/migration-0053.test.ts`.

- [ ] Teste primeiro: aplica a migration sobre o banco do teste e confere `requisito_fontes`, `requisitos`, `requisito_mapeamentos`, `documento_requisitos`, a coluna `compliance_controls.requisito_id`, os CHECKs (`estado` só `proposto|validado_juridico`; `validado_juridico` exige `validado_por` e `validado_em`; `tipo` só `equivalente|parcial|relacionado`; `de_id <> para_id`) e a chave única do mapeamento `(de_id, para_id)`. O teste exercita o CHECK **da própria migration**, não do schema.
- [ ] Escrever a migration e espelhar em `schema.sql` (tabelas antes dos índices).
- [ ] Atualizar `test/contrato-isolamento-org.test.ts` se a lista de globais for explícita; rodar `schema-contract`.
- [ ] Nota da 0053 em `migrations/README.md` (aditiva, roda em produção, sem janela).

### Task 2 — Seed ISO e backfill

**Files:** `src/services/requisitos.ts` (novo), `src/services/project-setup.ts`, teste `test/requisitos-seed.test.ts`.

**Interfaces:** `semearCatalogo(db): Promise<{ fontes: number; requisitos: number }>`; `ligarControles(db, projectId?): Promise<number>`.

- [ ] Teste: o seed cria as 4 fontes e os 93 + 31 + 18 requisitos ISO; rodar duas vezes devolve 0 novos; título editado à mão sobrevive ao segundo seed.
- [ ] Teste: `ligarControles` liga `A.5.1` de 27001 e não liga o de 27701; controle de projeto sem catálogo fica com `requisito_id` nulo.
- [ ] Implementar com `INSERT OR IGNORE` em lote e o `UPDATE ... SET requisito_id` por norma + primeiro token do título.
- [ ] `stmtControles` passa a preencher `requisito_id` nos controles novos (mesmo teste de idempotência do `project-setup` continua verde).

### Task 3 — LGPD e GDPR (depende do material revisado)

**Files:** `src/data/requisitos-lgpd.ts`, `src/data/requisitos-gdpr.ts`, `src/schemas/requisitos.ts`, `src/services/requisitos.ts`, teste `test/requisitos-juridico.test.ts`.

**Entrada que falta:** artigos e incisos com título curto, e a lista de mapeamentos (de, para, tipo, quem validou, quando). Formato aceito: um `.ts`/`.json` com `{ id, fonte, referencia, titulo, pai, papel }` e `{ de, para, tipo, validado_por, validado_em, nota }`.

- [ ] Validar o arquivo com zod no seed: id de mapeamento que não existe no catálogo derruba o seed com mensagem clara, e nada entra pela metade (um `db.batch`).
- [ ] Teste: mapeamento sem `validado_*` entra `proposto`; com `validado_*` entra `validado_juridico`.
- [ ] Teste: hierarquia artigo → inciso por `pai_id`, sem ciclo possível por construção (o pai tem de existir antes).

### Task 4 — Rotas, visibilidade e lacunas

**Files:** `src/routes/requisitos.ts` (novo, montado em `src/index.ts`), `src/schemas/requisitos.ts`, `src/middleware/agente.ts` (`FORA_DO_AGENTE`), `src/openapi.ts` + `npm run openapi` (imports dos schemas à mão), testes `test/requisitos-rotas.test.ts`, `test/requisitos-lacunas.test.ts`.

- [ ] `GET /api/v1/requisitos/fontes`, `GET /api/v1/requisitos?fonte=` (árvore), `GET /api/v1/requisitos/:id` (com mapeamentos). Cliente só vê mapeamento `validado_juridico`.
- [ ] `PUT /api/v1/requisitos/:id` (título), `POST/PUT/DELETE /api/v1/requisitos/mapeamentos…` e `POST /api/v1/requisitos/semear`: só `platform_admin`, com `logAudit`; agente recebe 403.
- [ ] `GET/PUT /api/v1/projects/:projectId/documentos/:id/requisitos` (lista de ids; documento de outro projeto é 404).
- [ ] `GET /api/v1/projects/:projectId/requisitos/lacunas?fonte=lgpd`: por artigo, `coberto` com a origem (documento ou controle) ou `lacuna`. Testes cobrem os itens do Review Focus (cliente sem `proposto`; `Not Applicable` não cobre; projeto sem documento nem controle: tudo lacuna).
- [ ] `any-catraca`: tipar o que tocar; se a contagem descer, baixar o `TETO`.

### Task 5 — Tela e fechamento

**Files:** `frontend/src/views/requisitos.js` (novo), `frontend/login.html` (item de menu), `frontend/src/views/documentos.js` (escolher requisitos do documento), testes `frontend/test/requisitos-view.test.js`, `CHANGELOG.md`, `AGENTS.md`, `README.md`, `docs/agente/seguranca.md`.

- [ ] Tela Requisitos: seletor de fonte, árvore, painel do requisito com equivalências (selo `proposto` só para consultor) e, na LGPD, a coluna Coberto/Lacuna com a origem.
- [ ] Teste jsdom no estilo de `documentos-view.test.js`: texto escapado, selo `proposto` ausente para papel de cliente, lacuna destacada.
- [ ] Documentos: campo de requisitos no detalhe do documento.
- [ ] Atualizar contagens do `AGENTS.md`/`README.md` com o comando que as mede, `CHANGELOG.md` e `docs/agente/seguranca.md`.
- [ ] Verificação final: `npx tsc --noEmit`, suíte do backend, suíte do frontend, build, `any-catraca`. PR sem merge.

## Rollout (cada passo pede "sim" do dono)

1. `npm run db:backup` (mover o dump para `C:\Users\resper\backups-niso\`, fora do repositório).
2. `npx wrangler d1 migrations apply niso-db --remote`, depois `PRAGMA table_info` das 4 tabelas e da coluna nova.
3. Merge; conferir `/health` com o SHA.
4. `POST /api/v1/requisitos/semear` como `platform_admin`: conferir `count(*)` por fonte e quantos `compliance_controls` ficaram com `requisito_id` (Twyn: 229 controles).

## Gaps declarados desta fatia

- `evidencia_requisitos` (spec 4.7) não entra; a lacuna ignora evidência e a tela avisa.
- Parâmetros editáveis (prazos legais, bases legais) nascem nas fatias 4 e 7, onde são usados.
- Sem tela para o `platform_admin` editar título e mapeamento: a edição é por API nesta fatia.
