# Núcleo do n.privacy, fatia 1.5 — responsável do cadastro em RoPA e CAPA

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md` (fatia 1: "responsável clicável").

**Goal:** RoPA e CAPA passam a apontar para uma parte do cadastro, como o risco já faz (1.4).

## Corte (ponytail)

Entram RoPA (`ropa_records.owner_parte_id`) e CAPA (`corrective_actions.assigned_to_parte_id`): têm coluna (0049), rota e modal.

Ficam fora, por medida e não por pressa:

- **Checklist:** `checklist_progress.assigned_to` guarda o **id do usuário** (`S.user.id` em `project.js`), não um nome. Responsável por parte exige decidir o que o campo significa antes de mexer.
- **Controles:** a coluna existe, mas nenhuma tela edita `owner`. Sem consumidor, sem seletor.
- **Chave de módulo e contato público do encarregado:** seguem esperando o segundo módulo e a fatia do aviso.

## Regra (a mesma do risco)

Parte do próprio projeto (`refForaDoProjeto` com `owner_parte_id` e `assigned_to_parte_id` em `TABELA_DA_REF`), senão 400. No PUT, campo ausente mantém e `null` desliga. A listagem junta `partes` e devolve `<coluna sem _id>_nome`.

## Provas

| Mudança | Prova |
|---|---|
| `src/routes/ropa.ts`, `capa.ts`, schemas, `helpers.ts` | `test/ropa-capa-responsavel.test.ts` (vermelho antes: 6 falhas) |
| Modais em `privacy.js` e `grc.js`, `partes-opcoes.js` | `frontend/test/capa-ropa-responsavel.test.js` |
| `docs/openapi.json` | `test/openapi.test.ts` |

Sem migration (a 0049 já criou as colunas).
