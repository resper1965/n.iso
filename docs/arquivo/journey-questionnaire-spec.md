# Spec — Questionário da Jornada + interpretação coesa

> **Status:** proposta para aprovação (spec-only, sem código).
> **Objetivo:** restaurar na jornada do projeto o **questionário rico** que já
> existe (mas ficou órfão) e trocar a interpretação **genérica** por um módulo
> **coeso** que liga respostas → diagnóstico específico → adequação de controles.

## O que se perdeu (diagnóstico)

Hoje existem dois questionários no nISO e a jornada ficou com o fraco:

- **Fraco (atual na jornada):** `JORNADA_QUESTIONS` — poucos `select`s por
  jornada — + `renderJourneyDiagnosticPanel`, cuja interpretação é `if/else`
  hardcoded ("se sponsor ≠ sim → sugira X"). É a saída genérica que o usuário vê.
- **Rico (órfão no fluxo de Assessment):** `BLOCK_QUESTIONS` — **10 blocos,
  ~93 perguntas** preenchíveis (select / múltipla / **texto**) — persistido em
  `assessment_answers` — **+ `AssessmentAgent`** (IA), que interpreta essas
  respostas num diagnóstico real.

A refatoração cortou o fio entre a jornada e esse motor. **Esta spec religa.**
Nada de conteúdo novo de perguntas nem de motor novo — reuso do que existia.

## Fonte das perguntas (reuso, sem reescrever)

`BLOCK_QUESTIONS` (src/constants.ts), 10 blocos temáticos:

| Bloco | Tema | Perguntas |
|---|---|---|
| 1 | Perfil da empresa / setor | 15 |
| 2 | Escopo da certificação | 8 |
| 3 | Cloud / infraestrutura | 10 |
| 4 | Maturidade do SDLC | 8 |
| 5 | Dados pessoais (privacidade) | 10 |
| 6 | Comprometimento da alta direção | 8 |
| 7 | Fornecedores de TI/cloud | 8 |
| 8 | Repositório de documentos de SI | 8 |
| 9 | Cronograma para certificação | 8 |
| 10 | APIs / superfície exposta | 10 |

## Mapa bloco → jornada (proposto)

A jornada tem 6 trilhas (J1 fases 0–6 … J6 fases 34–40). Os blocos são
**temáticos de jornada** (não de fase), então o mapa natural é por jornada:

| Jornada | Blocos |
|---|---|
| J1 — Mobilização e Diagnóstico | 1 (perfil), 2 (escopo), 6 (alta direção), 9 (cronograma) |
| J2 — Mapeamento e Riscos | 3 (cloud), 7 (fornecedores), 8 (repositório), 10 (APIs) |
| J3 — Implementação SGSI (27001) | 4 (SDLC) |
| J4 — Implementação SGPI (27701) | 5 (dados pessoais) |
| J5 — Operação e Auditoria | (revisão das respostas; sem bloco novo) |
| J6 — Certificação | (revisão das respostas; sem bloco novo) |

**Granularidade — ponto a confirmar:** o conteúdo existente é **por jornada**
(blocos temáticos). Surgir **por fase** as ~93 perguntas exigiria reautorar o
conteúdo em 41 baldes (trabalho de conteúdo, não de código). Proposta pragmática:
**questionário por jornada**, acessível a partir de qualquer fase daquela jornada
(botão no cabeçalho da jornada e atalho na fase). Se o objetivo for realmente
perguntas distintas fase-a-fase, isso vira uma segunda etapa de conteúdo.

## Persistência

Nova tabela ligada ao **projeto** (o `assessment_answers` pertence ao discovery
comercial, via `assessment_id` — não confundir):

```sql
CREATE TABLE IF NOT EXISTS project_journey_answers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  journey_idx INTEGER NOT NULL,   -- 0..5
  question_key TEXT NOT NULL,
  answer TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, journey_idx, question_key)
);
```

Endpoints:
- `GET /api/v1/projects/:id/journey-answers` → respostas salvas (para repopular).
- `PUT /api/v1/projects/:id/journey-answers` → salva/atualiza (upsert por chave).

## Interpretação coesa (o coração do pedido)

Substitui o `if/else` de `renderJourneyDiagnosticPanel` pelo **`AssessmentAgent`**
(o motor que já interpreta as ~93 respostas):

- `POST /api/v1/projects/:id/journey-diagnosis?journey=<idx>` → consolida as
  respostas da jornada + contexto do projeto e chama o `AssessmentAgent`.
- A saída é um **diagnóstico específico**: pontos de atenção citando a resposta
  que os gerou, e **recomendações de adequação de controles** (quais controles
  do Anexo A tocar, com que prioridade/maturidade sugerida).
- **Guarda-rail:** a adequação de controle é **sugestão até aprovação humana** —
  não altera `compliance_controls` sozinha; o consultor revisa e aplica. Nada de
  fabricar; sem parecer de certificação.

## UI

- Em cada **jornada**, botão **"Questionário da Jornada"** → modal com os campos
  dos blocos mapeados (reusa o render preenchível do Assessment: select / múltipla
  / **texto**), com salvar e progresso (respostas persistem).
- O painel de diagnóstico da jornada passa a exibir a **saída do `AssessmentAgent`**
  (específica), não o `if/else`. Cada recomendação aponta a resposta de origem.
- **Aposentar** `JORNADA_QUESTIONS` e o `renderJourneyDiagnosticPanel` hardcoded.

## Fases de entrega

1. **F1** — religa o questionário rico à jornada: UI preenchível + persistência
   (`project_journey_answers`) + endpoints. Sem IA nova; troca só o conteúdo/stub.
2. **F2** — diagnóstico via `AssessmentAgent` (interpretação coesa), substituindo
   o `if/else`.
3. **F3** — adequação sugerida de controles a partir das respostas (aplicação
   sob aprovação humana).

## Testes

- Worker: persistência (upsert, escopo de projeto), consolidação das respostas,
  e o endpoint de diagnóstico com `AssessmentAgent` dublado.
- E2E Playwright: abrir o questionário da jornada, responder, salvar, reabrir
  (respostas mantidas), ver o diagnóstico específico.

## Não-objetivos

- Não reescrever o banco de perguntas (reuso do `BLOCK_QUESTIONS`).
- Não trocar o motor de IA (reuso do `AssessmentAgent`).
- Não aplicar mudança em controle sem aprovação humana.
