# Núcleo do n.privacy, fatia 6 — terceiros (TPRM) tipificados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 5 ("TPRM tipificado"), 4.9 (efeito de evidência vencida) e 9 (fatia 6). Depende das fatias 1 (partes) e 4 (tratamento ligado). Plano mestre: `2026-10-09-nprivacy-plano-mestre-fatias-2-a-8.md`.

**Goal:** o terceiro é uma parte (organização) com um tipo; o tipo define o método de avaliação; a avaliação tem validade; quando vence, o terceiro e os tratamentos que o usam aparecem sinalizados e o dono é avisado; o DPA é um documento ligado ao terceiro.

## Decisões de desenho (rulings)

1. **Terceiro = `partes` do tipo `organizacao`** (já criada a partir do cadastro de fornecedores pelo importador da fatia 1). `vendors` continua existindo para o que ele já faz (certificações, score); a fatia não migra nem apaga `vendors`. Custo se errado: unificar depois, mecânico.
2. **Tipo do terceiro** em `partes.terceiro_tipo` (anulável): `grande_provedor`, `medio`, `pequeno`, `critico`. **O tipo define o método** (o servidor decide, não o corpo): `grande_provedor` → `trust_center`; `medio` → `questionario`; `pequeno` → `questionario`; `critico` → `auditoria`. Sem tipo, registrar avaliação é 400 ("defina o tipo do terceiro").
3. **`avaliacoes_terceiro`** (`project_id`, `parte_id` com `ON DELETE CASCADE`, `metodo`, `resultado` `aprovado|com_ressalvas|reprovado`, `valido_ate`, `evidencia_url`, `observacao`, quem e quando): o histórico fica; a situação é **derivada** (`vigente` se a última avaliação concluída tem `valido_ate` ≥ hoje, `vencida` se passou, `pendente` se nunca houve). `valido_ate` é obrigatório e não pode estar no passado ao registrar. Trust center é link (`evidencia_url`) mais validade, preenchido à mão (spec 5 e 7.5: automatizar fica fora).
4. **Pedido de aprovação da avaliação não entra nesta fatia.** A migration 0055 já deixou `avaliacao_terceiro` no CHECK de `pedidos.tipo`; ligar o pedido exige uma regra de quem aprova que a spec não fixa. Fica o gap declarado e nenhuma coluna `pedido_id` (YAGNI).
5. **DPA = documento ligado à parte** por `documento_partes (documento_id, parte_id, papel)` com `papel` `dpa|contrato|outro`. A spec diz `documentos.tipo = 'contrato'`; isso exigiria reconstruir `documentos` e as quatro tabelas que apontam para ela (versões, exceções, requisitos, ciências) para mudar um CHECK, com risco para dado vivo e sem ganho de uso. O documento ligado mantém o tipo `politica|norma|procedimento`. Custo se errado: a migração futura do tipo, isolada.
6. **Efeito do vencimento (spec 4.9):** a rotina diária de avisos ganha a fonte `avaliacao_terceiro` (marco = `valido_ate`, mesmo calendário D-7/D0/atraso das outras fontes), responsável = a parte responsável do vínculo `responsavel` do projeto, se houver; a mensagem diz quantos tratamentos usam o terceiro. A tela e a API sinalizam "avaliação vencida" no terceiro e nos tratamentos que o ligam (`GET .../ligacoes` ganha `terceiros_com_avaliacao_vencida`).
7. **Suboperador** já é vínculo parte→parte (`MATRIZ_PAPEL_ALVO.parte = ['suboperador']`); a fatia só o mostra na ficha do terceiro.

## Global Constraints

- Migration aditiva: `ALTER ADD COLUMN` anulável com CHECK, `CREATE TABLE IF NOT EXISTS`. Backup antes; aplicar pelo terminal antes do merge.
- Tabela nova com `project_id`; banco real nos testes; sem dado real de cliente.
- O agente lê e registra rascunho de avaliação; nada decide. Sem trailer de coautoria; e-mail noreply.

## Review Focus

- Terceiro de outro projeto nunca é avaliado nem ligado a documento (404/400).
- Avaliação vencida não conta como vigente; avaliação nova substitui a leitura sem apagar o histórico.
- O tipo define o método mesmo que o corpo mande outro (campo extra é 400).
- Aviso de vencimento sai uma vez por marco (idempotência de `avisos_prazo`) e traz o número de tratamentos afetados.
- Apagar a parte apaga as avaliações e as ligações de DPA, não os documentos.

## Tasks

### 6.1 Migration 0057 e serviço

- [ ] Teste da migration (colunas, CHECKs da própria migration, FKs, cascata).
- [ ] `migrations/0057_terceiros.sql` + `schema.sql`.
- [ ] `src/services/terceiros.ts`: `listarTerceiros`, `definirTipo`, `registrarAvaliacao`, `historico`, `ligarDocumento`/`desligarDocumento`; situação derivada; tratamentos afetados.
- [ ] Rotas `/projects/:id/terceiros*`; `FORA_DO_AGENTE` não muda (o agente registra, não decide).

### 6.2 Avisos e sinalização

- [ ] Fonte `avaliacao_terceiro` em `avisos-prazo.ts` (marco, texto, idempotência) e `terceiros_com_avaliacao_vencida` nas ligações do tratamento.

### 6.3 Tela e fechamento

- [ ] Tela Terceiros (lista com tipo, situação, vencimento, tratamentos afetados; janela com tipo, histórico, nova avaliação, DPA, suboperadores).
- [ ] Docs (AGENTS, README, CHANGELOG, migrations/README, seguranca), `npm run openapi`, suítes, build.

## Rollout

Backup → pré-checagem (contagem de `partes` e `documentos`) → `wrangler d1 migrations apply niso-db --remote` → `PRAGMA` das duas tabelas e da coluna → merge → `/health`.

## Gaps declarados

- Sem pedido de aprovação da avaliação (ruling 4) e sem `documentos.tipo = 'contrato'` (ruling 5).
- Sem questionário estruturado: `questionario` é o método registrado, a evidência é o link/anexo do dono. Automatizar trust center fica fora da spec.
