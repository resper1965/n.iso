# n.privacy — plano mestre das fatias 2 a 8

> **For agentic workers:** cada fatia tem o seu plano detalhado em `docs/superpowers/plans/` (escrito no começo da fatia, com a spec e o código daquele momento). Este arquivo fixa a ordem, as dependências, os portões e o que só o dono pode fazer.

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md` (seções 4.5 a 4.9, 5, 6 e 9). **Estado de partida (09/10/2026):** fatias 0, 1, 1.5 e 3 em produção (`/health` 2ef6069); migrations aplicadas até 0052.

## Autorização de execução (09/10/2026)

O dono autorizou a execução de ponta a ponta das fatias 2 a 8: código, PRs, merge com CI verde, backup, migration em produção, deploy e conferência, **sem pedir "sim" a cada passo**. Fica de pé o que sempre vale:

- **Paro em:** falha de CI que não seja flake provado, anomalia na conferência de produção, qualquer risco de perda de dado, divergência entre o que a produção mostra e o que o plano esperava.
- **Nunca faço:** conteúdo jurídico (títulos de artigo, prazos, mapeamentos), revogar ou gravar token, guardar chave, apagar dump. São do dono.
- **Evidência obrigatória** (AGENTS.md): "mergeado" só com `git cat-file`/`gh pr view`; "aplicado" só com `PRAGMA table_info`; "em produção" só com `/health` mostrando o SHA do merge. Saída colada no relatório.
- Cada fatia: backup (`npm run db:backup`, dump movido para `C:\Users\resper\backups-niso\`) → pré-checagem → `wrangler d1 migrations apply` → conferência → merge → deploy → `/health`.
- Sem atribuição de IA em commit, PR, issue ou documento; e-mail noreply; `sem-dado-de-cliente` antes do PR.

## Ordem de execução

A spec permite trocar a ordem das fatias que não dependem uma da outra. Para não parar à espera do material jurídico, a ordem real é:

| # | Fatia | Depende de | Migrations previstas |
|---|---|---|---|
| A | **2. Requisitos**, tasks 1, 2, 4 e 5 (ISO, rotas, lacunas, tela) | nada | 0053 |
| B | **3.2b** justificativa de N/A em coluna própria | nada | 0054 |
| C | **4. RoPA → tratamentos** | A (base legal e requisitos); parâmetro de bases legais | 0055–0056 |
| D | **5. DPIA e LIA** | C | 0057 |
| E | **6. TPRM** | C (ligação ao tratamento) | 0058 |
| F | **7. Titular, incidente, consentimento** | C; prazos como parâmetro | 0059–0060 |
| G | **8. Visões e casca** | todas | nenhuma ou 1 |
| H | **2, task 3**: seed de LGPD e GDPR | **material jurídico do dono** | nenhuma (dado) |

Os números de migration são previsão: vale o próximo livre no momento (`ls migrations/*.sql | tail -1`).

## Fatia 2 — Requisitos (plano pronto: `2026-10-09-nprivacy-fatia-2-requisitos.md`)

Catálogo global (`requisito_fontes`, `requisitos`, `requisito_mapeamentos`), `compliance_controls.requisito_id`, `documento_requisitos`, rotas, visão de lacunas, tela. **Task 3 (LGPD e GDPR) espera o material revisado do dono**; sem ele a tela de lacunas mostra só a ISO e diz que a LGPD ainda não foi carregada.

## Fatia 3.2b — justificativa de N/A em coluna própria

Hoje `compliance_controls.description` guarda o texto da política e também a justificativa de exclusão da SoA. Adicionar `justificativa_exclusao`, migrar o que for justificativa de N/A (controle com status `Not Applicable`), mudar `soa-logic.ts` e a tela de SoA para a coluna nova, e deixar `description` só com a política. Portão: `test/soa-*` verdes, nenhuma SoA exportável perde justificativa (teste de contagem antes/depois sobre o banco do teste). Migração de dados com conferência de contagem em produção.

## Fatia 4 — RoPA vira tratamentos (spec seção 5)

- **Modelo:** `tratamentos` (finalidade, base legal, categorias de titular e de dado, retenção, estado, versão), `tratamento_itens`, `tratamento_partes` (com papel), `tratamento_departamentos`, `tratamento_transferencias` (país, destinatário = parte, mecanismo do art. 33).
- **Base legal editável:** tabela `bases_legais` (art. 7 completo e art. 11), com fonte e data de revisão; semeada de arquivo de dados e editável só pelo `platform_admin`. Lista de incisos é texto de lei público; os títulos curtos seguem a regra da decisão 7 (revisados, editáveis).
- **Mermaid derivado** das ligações, nunca guardado; o pedido de aprovação congela o diagrama.
- **Migração `ropa_records` → `tratamentos`** sem perda: id preservado, backup, conferência de contagem, `ropa_records` sai só num PR seguinte com a catraca provando que nada a lê.
- **Aprovação por pedido** (`tipo='tratamento'`), como documento: CHECK de `pedidos.tipo` reconstruído no molde da 0042/0051.
- **Importação de planilha** com relatório de linhas recusadas; **rascunho do agente** imposto no servidor (4.8).
- Portão: contagem de `ropa_records` = contagem de `tratamentos` migrados; aprovações existentes preservadas.

## Fatia 5 — DPIA e LIA

`dpia_assessments.tratamento_id` com FK real; unificar as duas famílias de colunas; LIA como tabela irmã, obrigatória quando a base legal é legítimo interesse. Migração dos DPIAs existentes sem perder a prova de aprovação (`pedido_prova_imutavel` continua valendo).

## Fatia 6 — TPRM

O terceiro é parte; tipo define o método; `avaliacoes_terceiro (parte_id, metodo, estado, valido_ate, pedido_id)`; DPA vira documento `tipo='contrato'` ligado à parte; suboperador é vínculo parte→parte; rotina diária de validade (nova fonte nos avisos de prazo) que volta a avaliação a pendente e sinaliza os tratamentos com aquele operador. Trust center manual na v1. `vendors` migra para partes.

## Fatia 7 — Titular, incidente, consentimento

- **Só interno** (decisão 3 de 09/10): registro do pedido do titular com protocolo, data de entrada, prazo e resposta; incidente com ciência, comunicação à ANPD e ao titular; consentimento como evidência ligada ao tratamento. O conector externo fica para depois, fora deste plano.
- **Prazos como parâmetro editável** (`parametros_legais`: chave, valor, unidade, fonte, revisado_em, revisado_por), editável só pelo `platform_admin` com trilha. **Nenhum número é fixado por mim.** Sem o valor carregado pelo dono, o prazo do pedido fica "não calculado" e a tela diz isso; o motor de aviso já funciona assim que o valor existir.
- Rotina diária: pedido e incidente vencendo entram em `avisos-prazo`.
- Busca por texto sobre colunas livres conhecidas (lacuna T5), no D1.

## Fatia 8 — Visões e casca

Visão do encarregado (lacunas de 4.9, pedidos do titular, incidentes), visão por lei, trilha artigo → requisito → controle → evidência → responsável, e a casca do n.privacy sobre o mesmo núcleo. `evidencia_requisitos` e `evidence.valido_ate` (spec 4.7) entram aqui se ainda não tiverem entrado antes. Exige spec visual própria (a casca); se a spec não existir quando chegar a vez, escrevo antes de construir.

## O que só o dono faz (a execução não depende, exceto o item 1)

1. **Material jurídico revisado** (títulos de LGPD e GDPR, mapeamentos, prazos do titular e do incidente, lista de bases legais): destrava a task 3 da fatia 2 e os valores da fatia 7.
2. Revogar o token do projeto real e gravar o novo (issue #317); guardar a `TOKEN_ENC_KEY`; apagar dumps de `C:\Users\resper\backups-niso\`.
3. Escolher, quando chegar a fatia 8, a identidade visual da casca.

## Riscos e como a execução os trata

- **Escopo:** cada fatia é um PR (ou poucos) com valor visível; nada fica meio-feito entre fatias.
- **Migração de dado vivo (4, 5, 6):** backup, id preservado, conferência de contagem antes e depois, tabela antiga só sai depois.
- **Prova imutável:** nenhuma migration toca `pedidos` fechados; reconstrução de tabela só no molde já testado (0042/0051).
- **Catraca de `any`:** tipar o que tocar e ajustar o `TETO` quando a contagem descer.
- **CI de ~10 min por PR:** fatias independentes rodam em branches paralelas; a mesma migration nunca é aplicada duas vezes.
