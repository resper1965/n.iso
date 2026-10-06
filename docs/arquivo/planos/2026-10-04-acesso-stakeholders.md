# Acesso de stakeholders e ciência — plano de implementação

> **Arquivado em 2026-10-06:** executado em PR #254 a #258 (fatias 1 a 5).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Uma fatia por vez, cada uma com PR, CI verde, backup, migration, merge e sonda em produção antes da próxima.

**Goal:** stakeholders da empresa cliente consultam e aprovam documentos no n.iso, e a empresa colhe ciência de política com prova de versão lida.

**Architecture:** papel `stakeholder` com allow-list de caminhos; tabelas `pedidos` e `pedido_destinatarios` com conteúdo congelado (SHA-256); aprovação reutiliza rotas e `autoridadeDeAssinatura` existentes; ciência em massa estende `/politicas` com token por pessoa.

**Tech Stack:** Cloudflare Workers + Hono, D1, KV, Vite vanilla JS, vitest com D1 real.

**Spec:** `docs/superpowers/specs/2026-10-04-acesso-stakeholders-design.md`

## Global Constraints

- Schema muda em **dois** lugares: `schema.sql` (índice depois da tabela) e migration numerada (próxima: **0041**).
- `npm run db:backup` antes de migration em produção.
- Frontend sem handler inline nem `<script>` inline (CSP `script-src 'self'`); eventos por `data-action`.
- Segredos e tokens com CSPRNG (`genToken`/`genNumericCode`), só o SHA-256 do token no banco.
- Rota pública: `rateLimitD1`, 404 uniforme "Link inválido ou expirado".
- Texto de UI em PT-BR; marca `n.iso`; sem emoji, sem itálico.
- Branch sempre de `origin/main`. Máquina saturada: `npx vitest run --maxWorkers=2`.
- Afirmar "mergeado/aplicado/em produção" só com a evidência da regra número um do AGENTS.md.

## Fatia 1 — Papel `stakeholder`, convite e revogação

**Entrega:** convidar pela matriz, entrar, ver só a tela mínima, ser revogado.

**Files:**
- Modify: `src/middleware/auth.ts` (allow-list de caminhos do papel `stakeholder`, junto de `org_user`/`client`), `src/routes/governance.ts` (`POST /projects/:id/governance/:memberId/convidar`, `.../revogar-acesso`), `src/routes/users.ts` (papel aceito na criação), `src/helpers.ts` (se preciso, `ehAdminDaOrg`).
- Modify: `frontend/src/views/` da matriz de Governança (botões "Convidar para o n.iso" / "Revogar acesso"), `router.js`/menu (papel vê só "Meus pedidos").
- Test: `test/stakeholder-acesso.test.ts`; estender `test/contrato-isolamento-org.test.ts` com usuário `stakeholder`.

- [ ] **1. Teste falhando** — convite cria usuário `role='stakeholder'` com `client_project_id` do projeto e e-mail da linha da matriz; segundo convite à mesma linha não duplica.
- [ ] **2. Teste falhando** — stakeholder recebe 403 em toda rota fora do allow-list (varredura sobre as rotas montadas) e 200 em perfil/senha/MFA.
- [ ] **3. Teste falhando** — revogar desativa (`ativo=0`) e apaga sessões do usuário; login seguinte falha.
- [ ] **4. Teste falhando** — só `org_admin` do projeto, consultor designado, `consultoria_admin` da org e `platform_admin` convidam; stakeholder e papel de outra org recebem 403.
- [ ] **5. Implementar** o mínimo até passar; reutilizar o envio de boas-vindas existente (`grep -n "BoasVindas" src`).
- [ ] **6. Frontend** — botões na linha da matriz; menu reduzido para o papel; teste de view no padrão dos existentes.
- [ ] **7. Verificar** — `npx tsc --noEmit`, suíte (`--maxWorkers=2`), build do frontend.
- [ ] **8. PR, CI verde, merge, deploy, sonda** — `/health` com o SHA esperado; sonda de comportamento (rota sem sessão = 401). Cole a saída.

## Fatia 2 — Pedidos: congelar, consultar, aprovar

**Entrega:** consultoria cria pedido de aprovação sobre um documento; o destinatário com conta o vê em "Meus pedidos" e aprova com senha; documento alterado substitui o pedido.

**Files:**
- Create: `migrations/0041_pedidos.sql` (+ registrar), `src/routes/pedidos.ts`, `src/services/pedidos.ts` (congelar, hash, substituir), `frontend/src/views/meus-pedidos.js`.
- Modify: `schema.sql`, `src/index.ts` (montar router), `src/middleware/auth.ts` (allow-list do stakeholder inclui `/api/v1/pedidos*`).
- Test: `test/pedidos.test.ts`, `test/schema-contract` (tabelas novas).

**Esquema:** `pedidos(id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status[aberto|aprovado|recusado|substituido|cancelado], criado_por, criado_em)`; `pedido_destinatarios(id, pedido_id, nome, email, user_id NULL, token_hash NULL, status[pendente|ciente|aprovado|recusado], decidido_em, canal, ip, user_agent, hash_lido, mfa_usado)`.

- [ ] **1. Teste** — criar pedido congela conteúdo e grava SHA-256 estável (mesmo conteúdo, mesmo hash).
- [ ] **2. Teste** — destinatário só lista os pedidos atribuídos a ele; pedido de outro projeto/org não aparece nem abre (404).
- [ ] **3. Teste** — aprovar exige senha correta, grava prova (ip, ua, hash_lido = hash do pedido) e dispara a rota de aprovação já existente do tipo.
- [ ] **4. Teste** — documento alterado após o pedido: pedido vira `substituido`; aprovar o antigo devolve 409.
- [ ] **5. Implementar** `services/pedidos.ts` e rotas; autoridade provisória: papel exigido checado com `autoridadeDeAssinatura`/`recusaDeAssinatura` (fatia 4 refina).
- [ ] **6. Frontend** `meus-pedidos.js`: lista, leitura do conteúdo congelado, botão Aprovar/Recusar com senha.
- [ ] **7. Backup, migration, PR, CI, merge, sonda** — `PRAGMA table_info(pedidos)` mostra as colunas; `/health` com o SHA.

## Fatia 3 — Ciência em massa por link com código

**Entrega:** administrador envia documento a N e-mails; cada pessoa lê e confirma pelo link com código; painel de acompanhamento.

**Files:**
- Modify: `src/routes/public.ts` (rotas `/pedidos/ver|codigo|ciencia`, token no corpo, `rateLimitD1`), `src/routes/pedidos.ts` (criar em lote, painel, reenviar), `frontend/public/politicas.js` e `.html` (fluxo por link), `schema.sql`/migration `0042` se faltar coluna.
- Test: `test/pedidos-publico.test.ts`.

- [ ] **1. Teste** — criar lote gera um token por e-mail; só o SHA-256 fica no banco; e-mail duplicado na lista é ignorado.
- [ ] **2. Teste** — token falso, expirado ou de pedido substituído: 404 uniforme; rate limit corta a 31ª tentativa.
- [ ] **3. Teste** — código de 6 dígitos vai ao e-mail do destinatário; código errado/expirado não libera; ciência grava `hash_lido`, canal `link`, ip e ua.
- [ ] **4. Teste** — documento alterado: ciência antiga aparece como "versão anterior" no painel; reenviar só atinge pendentes.
- [ ] **5. Implementar e ligar o portal**; manter leitura das linhas antigas de `policy_acknowledgments` (hash nulo = "versão não registrada").
- [ ] **6. PR, CI, merge, sonda** — `POST /api/v1/public/pedidos/ver` com token falso devolve o 404 uniforme.

## Fatia 4 — Quem pede e quem aprova (regras de autoridade)

**Entrega:** regras da parte 4 do desenho, todas por teste.

**Files:** `src/services/pedidos.ts`, `src/routes/pedidos.ts`, `test/pedidos-autoridade.test.ts`.

- [ ] **1. Teste** — stakeholder não cria pedido (403); `org_admin`, consultor designado e `consultoria_admin` criam; consultor de outro projeto não.
- [ ] **2. Teste** — papel exigido `ciso`: só designado com cargo SGSI/DPO/CISO aprova; `ceo`: só Direção e nunca o Líder SGSI; `platform_admin` nunca aprova; `ciente`: basta ser destinatário.
- [ ] **3. Teste** — sem linha na matriz, nenhuma aprovação passa (falha fechado).
- [ ] **4. Implementar**, remover a checagem provisória da fatia 2 em favor da função única.
- [ ] **5. PR, CI, merge, sonda.**

## Fatia 5 — Prova para o auditor e endurecimento

**Entrega:** prova imutável, visível ao auditor, coberta pelo teste de isolamento.

**Files:** `src/routes/auditor.ts` (leitura da prova), `test/contrato-isolamento-org.test.ts`, `src/routes/pedidos.ts`, `CHANGELOG.md`, `AGENTS.md` (tabelas e rotas novas, só o que existe).

- [ ] **1. Teste** — ciência/aprovação concluída não aceita UPDATE nem DELETE por nenhuma rota; correção cria novo registro.
- [ ] **2. Teste** — auditor lê a prova do projeto (somente leitura) e não vê a de outro projeto.
- [ ] **3. Teste** — varredura de isolamento: rotas novas × 10 usuários + `stakeholder`, sem vazamento entre orgs.
- [ ] **4. Implementar**, atualizar `CHANGELOG.md` e a contagem de tabelas no `AGENTS.md` com número conferido por `PRAGMA`, não por `grep`.
- [ ] **5. PR, CI, merge, sonda; fechar com revisão de código da branch inteira.**

## Procedimento comum a cada fatia

1. Worktree novo a partir de `origin/main`; uma branch por fatia.
2. Teste primeiro, ver falhar, implementar, ver passar.
3. `npx tsc --noEmit`, suíte, build do frontend.
4. Revisão de código por subagente antes do merge; achado crítico bloqueia.
5. Backup, migration (fatias 2 e 3), merge só com autorização do dono do produto, sonda em produção com saída colada.

## Revisão (pontos a observar)

- Allow-list de caminhos do `stakeholder`: um prefixo largo demais abre tudo. Teste de varredura é a rede.
- Portal `/politicas` antigo precisa continuar funcionando durante a migração.
- Sessão do usuário promovido/revogado vale até 24h: revogar apaga sessões explicitamente.
- Parte 4 e 5 do desenho ainda são proposta; ajustes dela mudam só as fatias 4 e 5.
