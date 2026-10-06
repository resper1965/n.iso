# Triagem da API v1 — defeitos reportados (2026-08)

Comportamentos reportados no uso da API v1 (probing de um engajamento consultor),
triados contra o código. Legenda: ✅ corrigido neste lote · ⏳ backlog · ℹ️ por design.

| # | Item | Veredito | Status |
|---|------|----------|--------|
| 1 | `repository_token` em claro no `GET /projects[/:id]` | **BUG (segurança, alto)** | ✅ redigido na resposta |
| 2 | `maturity` no-op silencioso no `PUT /controls/:id` | **BUG** | ✅ 400 explícito → usar `/maturity` |
| 3 | Sem endpoint para RETIRAR aprovação de controle | Gap (parte por design) | ⏳ backlog |
| 4 | `standards` → 400 "Nothing to update" enganoso | **BUG (mensagem)** | ✅ 400 explícito |
| 5 | Sem re-vínculo de evidência (`PUT /evidence/:id` → 404) | Gap | ✅ novo endpoint |
| 6 | `evaluation_status` aceita caixa inconsistente | Gap de validação | ⏳ precisa repro |
| 7 | `PATCH`/`OPTIONS` vazio / sem `openapi.json` | Descoberta | ℹ️ não-implementado |
| 8 | `/control-adequacao` base → 404 | Divergência de rota | ℹ️ documentar sub-paths |
| 9 | `GET /assessments` → 403 para chave `consultant` | A confirmar | ⏳ precisa repro |

## Corrigidos neste lote (PR fix/api-hardening-batch)

- **1 — Exposição de credencial.** `GET /api/v1/projects` e `/:id` faziam `SELECT *`,
  devolvendo `repository_token` em texto claro. Agora um helper `redactProject`
  remove o campo e expõe apenas `repository_token_set: boolean`.
  **Follow-up:** cifrar o token em repouso (hoje ainda é texto claro no D1).
- **2 — `maturity` no PUT base.** O `controlUpdateSchema` descartava o campo em
  silêncio (200 sem gravar). Agora retorna **400** apontando `PUT /controls/:id/maturity`.
- **4 — `standards` não editável.** Mensagem explícita em vez do genérico
  "Nothing to update" (o campo é derivado do control-set; usar `seed-27701-2025`/migração).
- **5 — Re-vínculo de evidência.** Novo `PUT /api/v1/evidence/:id` aceita
  `{ control_id }` (ou `null`), com aterramento de tenant (só controle do mesmo
  projeto) e reset da avaliação anterior para `pending`.

## Backlog (não corrigidos aqui)

- **3 — Revogar aprovação.** Hoje aprovações só caem como efeito colateral de mudança
  de texto do controle (invalidação automática, por integridade de trilha). Não há
  ação explícita de "revogar aprovação". Avaliar endpoint dedicado se retratar for
  requisito de processo.
- **6 — Enum de `evaluation_status`.** O caminho canônico `/evaluate` normaliza para
  `conforming|partial|non_conforming|pending`; o upload usa `pending`. Não foi
  localizado um caminho de API que aceite valor livre ("Conforme"/"conforme") — pode
  ter vindo de escrita direta no banco. **Ação:** obter a requisição exata; se houver
  path sem validação, aplicar enforcement de enum (validação/CHECK).
- **7 — Descoberta de API.** Só `PUT` é registrado (PATCH 404 por design); `OPTIONS`
  devolve `Allow` vazio (default do Hono); não há OpenAPI publicado. Considerar
  documentar verbo por rota e/ou publicar um `openapi.json`.
- **8 — `control-adequacao`.** A feature existe em `GET /control-adequacao/:phase/suggestions`
  e `POST /control-adequacao/apply`; a rota base não tem handler. Documentar os sub-paths.
- **9 — `GET /assessments` 403.** O handler não tem gate de papel e a policy de API key
  libera `write`/`consultant`. O 403 é inesperado pelo código — provável guard de
  isolamento sobre chave escopada em projeto acessando dado comercial. **Ação:**
  reproduzir com a chave/headers exatos para cravar se é isolamento intencional ou gap.
