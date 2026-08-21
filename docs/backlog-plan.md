# Plano — gaps e débitos técnicos (2026-08)

Consolida a triagem da API v1 (`api-triage-2026-08.md`) e o débito de UI num plano
executável: causa, correção, arquivos, esforço, risco e ordem.

Esforço: **S** ≤2h · **M** meio dia · **L** ≥1 dia. Prioridade: P1 (fazer já) → P4.

| ID | Débito | Sev | Esforço | Prio |
|----|--------|-----|---------|------|
| D1 | `repository_token` em texto claro no D1 | 🔴→✅ | M | feito (#110) |
| D2 | `evaluation_status` sem enum/CHECK (#6) | 🟠 | M | P2 |
| D3 | Sem endpoint de revogar aprovação (#3) | 🟡 | S | P3 |
| D4 | `GET /assessments` 403 p/ chave consultor (#9) | ℹ️ | — | por design |
| D5 | Sem OpenAPI + `control-adequacao` base sem handler (#7/#8) | 🟢 | M | P4 |
| D6 | Tela de governança (UI) | 🟢 | M | paralelo |

Ordem: **D1 → D2 → D3/D4 → D5**. D6 corre em paralelo (branch própria).

---

## D1 — cifrar `repository_token` em repouso · P1

**Causa.** O token do repositório do cliente é gravado em texto claro em
`projects.repository_token`. O #107 removeu o campo das respostas (`redactProject`),
mas quem tem acesso ao D1 ainda lê o segredo.

**✅ Implementado no #110** — abordagem IN-PLACE (não a de coluna nova abaixo):
o token é cifrado na **mesma coluna** `repository_token` com ciphertext versionado
(`v1:<iv>:<ct>`, AES-GCM). Vantagem: **sem mudança de schema** → `schema.sql` e
migrações intactos, sem drift entre criação por schema e banco migrado. Segredo
`TOKEN_ENC_KEY`; migração do legado por `POST /projects/admin/encrypt-tokens`.

Alternativa considerada (coluna nova, NÃO adotada): `repository_token_enc` +
transição de duas colunas exigiria atualizar `schema.sql` junto da migração
(criação por schema retém a definição antiga e diverge do banco migrado). A
abordagem in-place evita isso.

---

## D2 — enum de `evaluation_status` · P2

**Causa.** `/evaluate` normaliza para `conforming|partial|non_conforming|pending`, mas
não há garantia no banco; algum caminho aceitou caixa livre ("Conforme"/"conforme").

**Atenção — o domínio real é MAIOR que quatro valores.** Antes de qualquer CHECK,
inventariar TODOS os produtores e consumidores; um CHECK estreito quebra caminhos
vivos:
- **Produtores** que gravam fora dos quatro: `policies.ts` (~L219-220, L284-295) e
  `projects.ts` (~L247-249) inserem `evaluation_status = 'conforme'`.
- **Consumidores** de outros valores: `readiness.ts` (~L90-94) usa `rejected` — se
  normalizado embora, some um achado de prontidão.

**Correção.**
1. **Repro** + inventário completo (produtores/consumidores) → definir o **enum
   canônico amplo** (inclui `conforme`/`rejected` ou os migra deliberadamente).
2. Validação `zod` (enum) em **todos** os writes.
3. Migração: normalizar linhas existentes → `CHECK (evaluation_status IN (...))`.
   Atualizar o **`schema.sql` canônico** junto (senão criação por schema diverge do
   banco migrado).

**Arquivos.** `src/routes/evidence.ts`, `policies.ts`, `projects.ts`, `readiness.ts`,
`src/schemas.ts`, migração D1 **e `schema.sql`**.

**Risco.** Médio — o CHECK falha se restar linha fora do enum; e um enum estreito
quebra produtores/consumidores vivos. Inventariar **antes** de aplicar.

---

## D3 — revogar aprovação de controle · P3

**Causa.** Hoje a aprovação só cai como efeito colateral da mudança de texto do
controle. Não há ação explícita de retratar.

**Decisão antes de codar.** Retratar aprovação é requisito de processo? Se não, fica
como está (backlog fechado).

**Correção (se sim).** `POST /controls/:id/revoke-approval` com assinatura (senha),
aterramento de tenant, volta status para `Draft`/`Review`, limpa carimbos
`ciso_*`/`ceo_*`, grava `control.approval_revoked` no audit.

**Arquivos.** `src/routes/controls.ts`.

**Risco.** Baixo.

---

## D4 — `GET /assessments` 403 p/ chave consultor · **por design**

**Veredito (revisão de código, não é gap).** O 403 é determinístico e intencional:
`resolveApiKeyUser` mapeia TODA chave de API para o papel `client`, e a rota de
`assessments` passa requisições não-públicas por `somenteNess`, que protege
registros comerciais **cross-tenant não escopados** (assessments não têm filtro por
`project_id`). Relaxar o gate exporia a carteira inteira de assessments a uma chave
escopada em projeto.

**Ação.** Documentar como **por design** (não é ajuste de gate). Se um consultor
precisa de dado comercial, é por sessão de staff, não por chave escopada.

**Risco de "corrigir".** Alto — afrouxar aqui é vazamento cross-tenant.

---

## D5 — descoberta de API (OpenAPI) + `control-adequacao` · P4

**Causa.** Sem `openapi.json`; `OPTIONS` devolve `Allow` vazio (default Hono);
rota base `/control-adequacao` sem handler (só `:phase/suggestions` e `apply`).

**Correção.**
1. Publicar `openapi.json` (gerar do Hono ou spec mínima curada).
2. Handler base para `/control-adequacao` (índice dos sub-paths) ou 404 documentado.

**Arquivos.** `src/index.ts`, `docs/`.

**Risco.** Baixo — DX, não bloqueia runtime.

---

## D6 — tela de governança · paralelo

Reconstrução (branch `feat/governance-redesign`): organograma com âncora do líder/DPO
no topo, áreas abaixo, superfície única, tiles de "adicionar" no lugar de caixas
vazias. Remove card aninhado e título triplicado. Guiado pelo `impeccable detect`.
