# nISO — Análise Profunda de Codebase

> Análise técnica consolidada de **arquitetura, codificação, segurança, dados, UX/UI e completude funcional**.
> Método: reconhecimento manual + 4 trilhas de análise executadas **em paralelo** (backend, segurança/dados, frontend, UX/UI) + sinais objetivos medidos (typecheck, testes, build, `npm audit`).
> Escopo: `src/` (Hono/Cloudflare Workers), `frontend/src/` (SPA vanilla JS), `schema.sql` (D1), configuração e docs.
> Natureza: **read-only** — nenhum arquivo de produto foi alterado.

---

## 0. Status de implementação (atualizado)

Correções já aplicadas nesta branch (PR #9), cada uma validada com `tsc` limpo e testes verdes (46 → **104 testes**, 14/14 suítes):

| Commit | Fase | Item | Status |
|---|---|---|---|
| `f478bfc` | 0 | CI verde: lockfile, `tsc`, `node:fs` nos testes (CR-5) | ✅ |
| `28b765b` | 1 | Auth hardening: `SETUP_KEY` fail-closed + removido do repo; tokens/OTP CSPRNG; rate limiting; constant-time (CR-2, AL-1/2/3) | ✅ |
| `8cdc327` | 1 | Isolamento multi-tenant / IDOR — middleware `/projects/:projectId/*` (CR-1) | ✅ |
| `3b260c7` | 1 | RBAC preciso method+rota (AL-4) | ✅ |
| `3437f80` | — | Docs de contexto atualizados (BX-1) | ✅ |
| `4abf15c` | 2 | Error handler global `app.onError` (MD-1) | ✅ |
| `30fabcf` | 2 | Schema drift evidência/assets/DPIA + migration 0013 (CR-3) | ✅ |

**Ainda aberto** (prioridade decrescente): CR-4 (servir templates de política via ASSETS), CR-6/CR-7/CR-8 (frontend: dots, localStorage, tema), MD-2 (RAG metadata), MD-6 (validação de upload), MD-7/DA-2/DA-3 (índices/FKs), Fases 3–5. Fugas de listagem sem `:projectId` (proposals/assessments) e o rebuild de `dpia_assessments.system_name NOT NULL` em DBs antigos precisam de tratamento dedicado (ver migration 0013).

---

## 1. Sumário executivo

O nISO é um produto GRC (ISO 27001/27701 + LGPD) **funcionalmente amplo e maduro na superfície**: 28 rotinas de menu, ~50 features, ~98 endpoints, 23 tabelas D1, agentes de IA (política/evidência), motores puros bem estruturados (`pricing.ts`, `soa-logic.ts`). Todas as 28 telas renderizam com dados reais — **não há stubs "em breve"**. A decomposição do antigo monólito `index.ts` em ~30 módulos de rota/serviço é um trabalho de arquitetura genuíno e bem-feito.

Porém, sob a superfície há **problemas estruturais graves** que impedem considerá-lo pronto para produção sensível a dados pessoais:

- **A esteira de CI está 100% vermelha** — os três passos (`npm ci`, `tsc --noEmit`, `npm test`) falham hoje.
- **Isolamento multi-tenant quebrado (IDOR)** — qualquer usuário autenticado lê dados de outro cliente (incluindo PII de ROPA/DPIA) trocando o ID na URL.
- **Conta platform-admin criável publicamente** via `SETUP_KEY: "setup-123"` commitado no repositório.
- **Schema drift crítico** — código grava/lê colunas que não existem no `schema.sql` (upload de evidências, DPIA e criação de ativos quebrados contra o schema versionado).
- **Features quebradas em runtime** — geração de política a partir de template (templates não são servidos pelo binding ASSETS) e o toggle de tema (não altera nada).

### Scorecard por dimensão

| Dimensão | Nota | Resumo |
|---|:---:|---|
| Arquitetura backend | 🟢🟢🟢🟢⚪ | Composição limpa, modular, prepared statements. Falta scoping de tenant e error handler global. |
| Segurança | 🔴🔴⚪⚪⚪ | IDOR multi-tenant, setup key pública, tokens `Math.random()`, sem rate limiting. Área mais crítica. |
| Modelo de dados | 🟡🟡⚪⚪⚪ | Schema drift, tabela `assets` duplicada, FKs/índices/cascade ausentes, tenant não é coluna de 1ª classe. |
| Qualidade backend | 🟢🟢🟢⚪⚪ | Boa base; `any` pervasivo, erros inconsistentes, duplicação, validação zod só em 2 rotas. |
| Arquitetura frontend | 🟡🟡⚪⚪⚪ | SPA de namespace global frágil; roteador if/else sem histórico; god-files de ~1.8k linhas. |
| UX / produto | 🟢🟢🟢⚪⚪ | Cobertura funcional completa, fluxos ponta a ponta, primitivas de modal/toast consistentes. |
| Design system | 🟡🟡⚪⚪⚪ | Fundação de cor/tipografia forte, mas viola as 3 proibições da marca (itálico, emoji, Montserrat 600). |
| Acessibilidade | 🔴⚪⚪⚪⚪ | Navegação por `div onclick`, ~zero ARIA nas views, contraste abaixo do AA. |
| Responsividade | 🔴⚪⚪⚪⚪ | Efetivamente desktop-only (1 media query em ~1060 linhas de CSS). |
| Testes / CI | 🔴⚪⚪⚪⚪ | CI vermelho nos 3 passos; testes de API mockam D1 e não pegam o schema drift. |

---

## 2. Sinais objetivos (medidos)

Reproduzindo o pipeline do CI (`.github/workflows/ci.yml`) localmente:

1. **`npm ci` FALHA** — `package-lock.json` dessincronizado com `package.json` (vitest 1.5.3↔1.6.1, rollup, postcss). O 1º passo do CI quebra antes de tudo.
2. **`npx tsc --noEmit` FALHA** — `src/routes/evidence.ts:28` `TS2347: Untyped function calls may not accept type arguments` (`.first<any>()` sobre `c.env.DB` sem tipo).
3. **`npm test -- --run`**: **7 de 14 suítes não carregam**. Causa raiz: imports de `node:fs` executando no pool `workerd`:
   - `src/services/policy-generator.ts:1` — `import { readFile } from 'node:fs/promises'`
   - `test/helpers.test.ts:3` — `import { readFileSync, readdirSync } from 'node:fs'`
   - 46 testes passam nas 7 suítes que carregam.
4. **`npm audit`**: 10 vulnerabilidades (**2 críticas, 6 altas, 2 moderadas**), incluindo `undici` (Set-Cookie SameSite downgrade).
5. **Build do frontend**: passa, mas gera **bundle único de 621 kB** (131 kB gzip), sem code-splitting; asset `/niso_login_hero_*.png` não resolve em build.

**Conclusão:** a documentação afirma "produto completo — 8 sprints", mas o CI não passa e há features quebradas contra o schema versionado. Antes de qualquer feature nova, o pipeline precisa voltar ao verde.

---

## 3. Achados por severidade (consolidado e deduplicado)

Referências no formato `arquivo:linha`. Itens confirmados por mais de uma trilha estão marcados.

### 🔴 CRÍTICO

**CR-1 — Isolamento multi-tenant quebrado (IDOR) em leituras e listagens.** *(confirmado por trilha backend + segurança)*
O limite de tenant depende de dois helpers (`requireResourceAccess`, `requireProjectAccess` em `helpers.ts:45-61`), aplicados **apenas** em mutações `/:id`. A grande maioria dos `GET /projects/:id/...` e listagens **não faz nenhuma checagem de escopo** e usa `projectId` cru da URL. Um usuário `client` de baixo privilégio itera IDs e lê dados de outro tenant, incluindo **PII de `ropa_records` e `dpia_assessments`** (LGPD Art. 37). O middleware só bloqueia *escrita* para `org_user`/`client`; todos os GETs ficam livres, e `consultor`/`platform_admin` ignoram tudo.
Endpoints afetados (amostra): `projects.ts` (`/phases`:173, `/documents`:234, `/risk-matrix`:372, `/traceability`:483, `/dpia`:527, `/audit-pack`:552, `/audit-trail`:581), `governance.ts` (todos os GET/POST scoped), `ropa.ts:47,131` (report HTML com PII), `integrations.ts:37,114,133-178` (webhooks com secret via `SELECT *`, exports CSV), `proposals.ts:59,73` (propostas/preços de todos os tenants), `assessments.ts:203,214`, `ai.ts:271`.
Agrava: `requireProjectAccess` (`helpers.ts:58`) **retorna `undefined` em vez de lançar** no deny — o chamador não detecta a falha.
**Correção:** middleware único em `/projects/:projectId/*` que chame `requireProjectAccess` e retorne 403; corrigir o helper para lançar; adicionar coluna de tenant de 1ª classe (ver DA-1).

**CR-2 — `SETUP_KEY = "setup-123"` cria conta platform-admin publicamente.** *(backend + segurança)*
`wrangler.jsonc:61` commita a chave; `POST /api/v1/auth/setup` (`auth.ts:9`) é público (montado em `index.ts:65`, antes do middleware) e cria usuário `consultant`, que `login` promove a `platform_admin` (`auth.ts:60`, `middleware/auth.ts:28`). `curl -d '{"setupKey":"setup-123",...}'` → controle total da plataforma e de todos os tenants. Pior ainda, `auth.ts:15` **falha aberto** se `SETUP_KEY` for `undefined` (`undefined !== undefined` é falso).
**Correção:** mover para `wrangler secret`, rotacionar, falhar fechado quando ausente, desabilitar `/setup` após o bootstrap inicial.

**CR-3 — Schema drift: colunas usadas pelo código não existem no `schema.sql`.** *(backend + segurança)*
- **Evidência**: código insere/lê `sha256_hash` (`evidence.ts:88,285`, `projects.ts:261`), mas o schema define `file_hash TEXT NOT NULL` e nenhum migration adiciona `sha256_hash`. `risks.ts:71,137` usa `file_hash` corretamente. → upload de evidência/documento quebra (`no such column` / violação de NOT NULL) contra o schema versionado, **ou** o DB de produção foi alterado à mão e divergiu do controle de versão.
- **DPIA**: `dpia_assessments` no schema (`schema.sql:694-709`) tem um conjunto de colunas totalmente diferente do que o código usa (`processing_name`, `technical_measures`, `dpo_approved_by`… em `projects.ts:539`, `platform.ts:57-139`). A feature inteira de DPIA diverge do schema.
- **Ativos**: `assets` é definida **duas vezes** (`schema.sql:285` e `:649`) com colunas divergentes; o `INSERT` de `projects.ts:322` referencia `type`/`criticality`, ausentes em ambas.
**Correção:** reconciliar em uma coluna/definição canônica, adicionar migrations, e um teste que insira por cada caminho contra o `schema.sql`.

**CR-4 — Geração de política por template quebrada em produção.** *(medido + backend)*
`policies.ts:474/485/512` instanciam `new PolicyGeneratorService('.', c.env.ASSETS)`; `generate()` busca `http://assets/templates/policies/${version}/${name}.md` via binding ASSETS. Mas ASSETS serve `frontend/dist/`, e os templates vivem em `src/templates/policies/v2022/` — **não são copiados para `frontend/dist` pelo build**. → 404 "Template not found" em runtime. Além disso, só existe `v2022`; `v2013`/`v2026` dão 404. O regex de replacement usa valores do usuário como replacement string (`$&`/`$1` corrompem a saída).
**Correção:** copiar templates para o diretório de ASSETS no build (ou embuti-los em código), e escapar replacements.

**CR-5 — CI totalmente vermelho.** *(medido — ver §2)* Os três passos falham; nenhum PR passa hoje.

**CR-6 (frontend) — Bug de find-and-replace shipado no dropdown de notificações.** *(frontend)*
`globals.js:368-369`: `style="font-weight:dots${...}"` e `>dots${escapeHTML(n.title)}` — CSS inválido e todo título de notificação renderiza com o prefixo literal `dots`. Quebra visível de uma feature central.

**CR-7 (frontend) — `JSON.parse` de localStorage sem guarda derruba o app no boot.** *(frontend)*
`state.js:4-11` fazem `JSON.parse(localStorage.getItem(...))` no tempo de avaliação do módulo, sem try/catch. Um valor corrompido lança antes de `initApp` → tela branca permanente, sem nem conseguir deslogar.

**CR-8 (UX) — Toggle de tema não faz nada.** *(ux/ui)*
"Mudar Tema" chama `toggleTheme()` que seta `data-theme="light"` e troca o próprio ícone, mas o `style.css` **não tem nenhuma regra `[data-theme]` nem `prefers-color-scheme`**. O ícone vira "claro" mas nada muda — controle ativamente enganoso.

### 🟠 ALTO

**AL-1 — Tokens de segurança gerados com `Math.random()`.** *(backend + segurança)* `helpers.ts:1-3` (`genId`) usa `Date.now()+Math.random()` — não-CSPRNG e previsível — para **tokens de auditor** (`projects.ts:595`), que dão acesso externo ao pacote de evidências. Um gerador CSPRNG (`genToken()`, `helpers.ts:70`) já existe mas só é usado em sessões de login. OTP de reset/política (`auth.ts:108`, `public.ts:40`) idem.

**AL-2 — Sem rate limiting em nenhuma superfície de auth + OTP brute-forceável.** *(segurança)* Login, forgot/reset e setup (`auth.ts`) sem throttle. OTP de reset é 6 dígitos (10⁶), RNG não-cripto, **tentativas ilimitadas**, KV não é apagado no erro, e o código é logado (`auth.ts:111`) e devolvido no corpo em dev/test → takeover de qualquer conta por força bruta.

**AL-3 — Hashes legados SHA-256 sem sal ainda aceitos.** *(segurança)* `helpers.ts:118-124` aceita valor sem `:` como `SHA-256(senha)` puro; migração para PBKDF2 só ocorre no próximo login. Usuários que nunca logam mantêm hash rápido e sem sal (GPU-crackável se o D1 vazar). Comparação também não é constant-time (`===`).

**AL-4 — Guard de escrita RBAC usa `path.includes()`, permissivo demais.** *(backend)* `middleware/auth.ts:35-48` libera escrita de `org_user`/`client` se o path *contém* um fragmento allow-listado. `path.includes('/evidence')` casa com `DELETE /evidence/:id` e `POST /:id/approve` → um `client` read-only pode **deletar ou assinar eletronicamente** evidências.

**AL-5 — Rotas "públicas" por token montadas atrás do middleware de auth (quebradas).** *(backend)* `index.ts:71` aplica auth a `/api/v1/*`; depois monta `assessmentsApp` (79), `auditorApp`/`platformApp` (106-107). Assim, links públicos de assessment (`assessments.ts:157,176`) e endpoints do portal de auditor externo (`auditor.ts`, `platform.ts:360`) **exigem sessão**, contradizendo o design por token. Simetricamente, rotas de `authApp` que precisam de `c.get('user')` rodam **antes** do middleware: `GET /auth/me`, `POST /auth/change-password` (500), `reset-password-first` estão quebradas (`auth.ts:74,172,176`).

**AL-6 — Feature de API keys é não-funcional.** *(segurança)* `key_hash` é escrito (`integrations.ts:92-112`) mas **nunca lido** — nenhum middleware valida chave de entrada. Clientes recebem "chaves com escopo" que não autenticam requisição alguma (falsa garantia).

**AL-7 (frontend) — i18n é fictício; 100% PT-BR hardcoded.** *(frontend + ux)* Não há camada de tradução, dicionário nem `t()`. `setLang()` (`globals.js:112-116`) **ignora o argumento e força `'pt'`**. Toda string é PT-BR inline nas 12 views. A promessa PT/EN/ES não está implementada.

**AL-8 (frontend) — Escaping XSS inconsistente; `e.message` injetado cru em `innerHTML`.** *(frontend)* Free-text de usuário é escapado na maioria dos casos, mas mensagens de erro entram cruas (`monitor.js:138,485` vs `:997` que escapa). `e.message` vem de `data.error`/`details[].message` do servidor, que pode refletir input. ~40 sites de `innerHTML =` por arquivo tornam o "escapar por convenção" inaplicável. Report HTML de ROPA (`ropa.ts:141-180`) interpola campos do DB sem escapar (stored-XSS).

**AL-9 (frontend) — `api.js` sem timeout, sem retry, com heurística frágil de unwrap.** *(frontend)* `api()` (`api.js:5-33`): sem `AbortController` (backend travado → UI trava para sempre); auto-unwrap retorna "o primeiro array encontrado no `for..in`" (quebra silenciosa); 401 chama `window.doLogout()` acoplando a camada de dados ao escopo global. Erros tratados de forma dispersa (`catch(e){}` silencioso ⇒ falha de rede indistinguível de "vazio").

**AL-10 (UX/marca) — Violação das 3 proibições do design system.** *(ux/ui)*
- **Itálico** (proibição absoluta): `style.css:1057`, `privacy.js:349`.
- **Emojis/ícones**: 47 emojis em `project.js` (💡⚠️✅⚙️📋), 8 em `compliance.js`, 8 em `admin.js`, 4 em `privacy.js`; além da sidebar inteira em ícones SVG.
- **Montserrat 600** (proibido): import do Google Fonts carrega `500;600;700`; 9 usos de Montserrat + `font-weight:600`.

**AL-11 (a11y) — Navegação por `div onclick` e ~zero ARIA nas views.** *(ux/ui)* Itens de nav, badges, acordeões e células de matriz são `div` com `onclick`, sem `tabindex`/`role`/handler de teclado → usuários de teclado e leitor de tela não operam a navegação primária. Total de atributos aria/role nas views: **1**.

**AL-12 (responsividade) — Efetivamente desktop-only.** *(ux/ui)* ~1063 linhas de CSS com **1** media query (só o grid de stats da SoA). Shell fixo 260px + conteúdo + 320px sem hambúrguer nem breakpoint; tabelas densas transbordam sem `overflow-x`. Inutilizável abaixo de ~1024px.

**AL-13 (arquitetura frontend) — God-files.** *(frontend)* `compliance.js` (1889), `grc.js` (1775), `monitor.js` (1732) misturam múltiplas views + lógica de negócio + API + modais, com literais HTML de 100+ linhas inline. Principal peso de manutenibilidade.

### 🟡 MÉDIO

- **MD-1 — Sem `app.onError` global; contratos de erro inconsistentes** (`{error,detail}` vs `{error,details}` vs `{ok:false}`), muitos handlers sem try/catch, vazamento de `e.message` ao cliente. *(backend)*
- **MD-2 — RAG não funciona: chaves de metadados divergentes** — `memory.ts` filtra por `organizationId`, `knowledge-service.ts` por `project_id`, no mesmo índice → nenhum recupera os vetores do outro. Ambos usam modelo de embedding **inglês** (`bge-small-en-v1.5`) sobre texto português. *(backend)*
- **MD-3 — CORS `origin:'*'` com `Authorization`; tokens aceitos via query string** (`middleware/auth.ts:8-11`) → vão parar em logs/referrers. *(backend + segurança)*
- **MD-4 — Audit log fraco**: sem `project_id`/`resource_id`/FK, mutável, correlação por `details LIKE '%projectId%'` e `substring(0,8)`; export de audit-log filtra por `actor` e ignora o projeto. Falha A.8.15/A.5.28 para um produto de compliance. *(segurança + backend)*
- **MD-5 — SoD por identidades hardcoded** (`ropa.ts:87,96` `44273656+resper1965@users.noreply.github.com`; `evidence.ts:195` `admin@ness.io`) e por substring de `job_title` — segregação de funções contornável editando a governança. *(segurança)*
- **MD-6 — Upload sem validação de MIME/tamanho/nome**; nome de arquivo usado verbatim na key R2; combinado com CR-1, um `client` grava evidência no projeto de outro tenant. *(segurança)*
- **MD-7 — Índices ausentes em colunas quentes**: `evidence.project_id`, `compliance_controls.project_id`, `users.client_project_id`, `audit_logs.actor/created_at`. *(backend + segurança)*
- **MD-8 — N+1 / escritas não-batched**: 41 fases inseridas em loop sequencial (`proposals.ts:150-157`), controles migrados um a um (`projects.ts:416-467`); `PHASE_TITLES[i]` pode ser `undefined` se o array < 41. *(backend)*
- **MD-9 — Validação zod só em 2 rotas** (`auth`, `users`); todo o resto faz `c.req.json<T>()` com cast e sem validação no trust boundary. *(backend)*
- **MD-10 (frontend) — Perf**: `MutationObserver` sobre `document.body` inteiro re-escaneia `[onclick]` a cada mutação (`globals.js:1235-1250`); polling de 60s nunca é limpo e segue após logout (cada poll 401 → novo `doLogout`) (`globals.js:663`). *(frontend)*
- **MD-11 (UX) — Duas paletas de status coexistem**: `renderStatusBadge` usa os hexes do `design.md` (`#34c759/#ffcc00/#ff3b30`); `:root` do `style.css` define outra (`#22c55e/#f59e0b/#ef4444`) + superfície com tint diferente. Badges/cards não batem. *(ux/ui)*
- **MD-12 (UX) — IA de navegação sobrecarregada**: grupo "Operacional" com **12 itens**; grupo "Visão Geral" ausente; views construídas mas **sem entrada na sidebar** (Portfolio, Metrics, Certification, Controls). *(ux/ui)*
- **MD-13 (UX) — `renderPageHeader` é dead code** (0 chamadas) apesar de mandatado pelo `design.md`; cada view seta o header à mão → headers não padronizados. `renderDataTable`/`renderStatusBadge` convivem com `<table>`/badges hand-rolled. *(frontend + ux)*
- **MD-14 (UX) — Estados de loading/erro irregulares**: ROPA/DPIA/AI sem spinner (flash em branco); `catch(e){}` silencioso torna "vazio" indistinguível de "falhou". *(ux/ui)*

### ⚪ BAIXO

- **BX-1 — Doc drift** *(todas as trilhas)*: `AGENTS.md` descreve `index.ts` como monólito de ~3400 linhas e o frontend como `frontend/dist/index.html` (~2530 linhas, 16 views) que **não existe mais**; realidade é `index.ts` de 137 linhas modularizado e `frontend/src/` (9 módulos, ~11.7k linhas). Referências a `serveStatic`, `auditor.html`, `landing.html` estão desatualizadas.
- **BX-2 — Duplicação**: `dashboard/stats` implementado 2× (`projects.ts:85`, `platform.ts:199`); `seedPhasesLocal` duplicado; pricing-config get/put duplicado; `previewVendorScore` definido 2× no frontend.
- **BX-3 — `Math.random()` para todas as PKs/IDs** (não só tokens) — colisão teórica sob concorrência.
- **BX-4 — 188 ocorrências de `: any`**; `Bindings.AI: any`; account id da Cloudflare hardcoded em 3 agentes.
- **BX-5 — Diacríticos PT-BR inconsistentes** em chrome ("Implementacao", "Inteligencia", "Evidencias" sem acento ao lado de "Configurações", "Governança"); mistura de idioma em `ai.js`.
- **BX-6 — `--accent-dim` indefinido** (bolhas de chat históricas transparentes, `ai.js:102`); `emptyOutDir:false` acumula assets obsoletos em `dist/`; `politicas.html` é um 2º frontend paralelo a manter em sincronia.
- **BX-7 — Portal de auditor com ordem de montagem inconsistente** e `PUT /auditor-notes/:id/respond` sem escopo de projeto (`auditor.ts:50`).

### Modelo de dados — higiene

- **DA-1 — Tenant não é coluna de 1ª classe**: `organizations` órfã (`owner_id` sem FK, **zero** uso de `organization_id` em `src/`); usuários carregam só `client_project_id` → um cliente com vários projetos não é modelável e o isolamento é "um-projeto-por-usuário por acidente".
- **DA-2 — FKs/cascade ausentes**: `evidence.project_id` é `TEXT` sem `REFERENCES`; a maioria das referências a `projects(id)` sem `ON DELETE CASCADE` → deletar projeto orfaniza linhas, **incluindo `ropa_records` (PII) que sobrevive sem dono** (problema de retenção/eliminação LGPD).
- **DA-3 — Sem `CHECK`/enum** em `role`/`status`/`classification`; sem `UNIQUE` em `api_keys.key_hash`. Role é texto livre → typo/injeção de role muda o comportamento de autorização.
- **DA-4 — Sessão**: TTL fixo 24h, sem idle timeout, **sem revogação em troca/reset de senha**.

---

## 4. O que está sólido (preservar)

- **Sem SQL injection**: prepared statements com `.bind()` em toda parte; identificador dinâmico único (`table`) é allow-listado (`ALLOWED_TABLES`).
- **Hashing de senha (caminho atual)**: PBKDF2-HMAC-SHA256, sal aleatório por senha, 100k iterações; token de sessão CSPRNG 256-bit.
- **Motores puros**: `pricing.ts` e `soa-logic.ts` (93 regras) — data-driven, testados, o melhor código do repo.
- **Decomposição modular** do `index.ts`; catch-all estático corretamente por último.
- **Defesas pontuais**: guard anti-fórmula em CSV, denylist SSRF (parcial), `escapeHtml` em e-mails.
- **UX**: cobertura funcional completa sem stubs; `confirm()` em toda ação destrutiva; primitivas `openModal`/`showToast` consistentes; acordeão da SoA, matriz de risco 5×5 e roadmap bem construídos; CTA de onboarding em fases no dashboard.

---

## 5. Plano de remediação — fases e etapas

Priorizado por risco. Trilhas dentro de uma fase podem rodar **em paralelo**; as fases são sequenciais em dependência (não faz sentido endurecer segurança sobre um CI vermelho).

### Fase 0 — Estancar o sangramento: CI verde (0,5–1 dia)
*Pré-requisito de tudo. Bloqueia merges hoje.*
- **0.1** Sincronizar `package-lock.json` (`npm install` e commit) — destrava `npm ci`.
- **0.2** Corrigir `evidence.ts:28` (`.first<any>()` sobre `DB` tipado) — destrava `tsc`.
- **0.3** Remover `node:fs` do caminho de runtime: `policy-generator.ts` deve usar só o branch ASSETS; mover leitura de FS dos testes para fora do pool workerd (ou `readFileSync` em setup Node puro). Destrava as 7 suítes.
- **0.4** `npm audit fix` para as 2 críticas/6 altas (avaliar breaking do `@cloudflare/vitest-pool-workers`).

### Fase 1 — Segurança crítica (2–4 dias) — *trilhas paralelas*
- **Trilha Auth**: CR-2 (mover `SETUP_KEY` para secret, falhar fechado, desabilitar `/setup` pós-bootstrap); AL-2 (rate limiting + contador de tentativas no OTP, parar de logar/retornar código); AL-3 (forçar migração dos hashes legados, comparação constant-time); AL-5 (reposicionar rotas `authApp` autenticadas após o middleware).
- **Trilha Tenant**: CR-1 (middleware `requireProjectAccess` em `/projects/:projectId/*`, corrigir helper para lançar 403; fechar vazamento de propostas/assessments); DA-1 (introduzir `organization_id` como coluna de 1ª classe, indexada, com FK).
- **Trilha Tokens/RBAC**: AL-1 (trocar `genId` por `genToken()` em tokens de auditor/OTP); AL-4 (RBAC por método+rota, não `includes`); AL-6 (implementar ou remover validação de API key).

### Fase 2 — Correção de dados e runtime (2–3 dias)
- **2.1** CR-3: reconciliar `sha256_hash`↔`file_hash`, alinhar `dpia_assessments`, unificar `assets`; migrations + teste de inserção real contra `schema.sql`.
- **2.2** CR-4: copiar `src/templates/**` para o diretório ASSETS no build (ou embutir); escapar replacements; cobrir v2013/v2026 ou remover.
- **2.3** MD-1: `app.onError` global + shape de erro único, parar de vazar `e.message`.
- **2.4** MD-2: unificar chave de metadados do Vectorize; avaliar modelo de embedding multilíngue/PT.
- **2.5** MD-6/MD-4: validar upload (MIME/tamanho/nome) + escopo de tenant; estruturar `audit_logs`.
- **2.6** MD-7/DA-2/DA-3: índices em `project_id`; FKs + `ON DELETE CASCADE`; `CHECK`/`UNIQUE`.

### Fase 3 — Robustez do frontend (2–3 dias)
- **3.1** CR-6 (bug "dots") + CR-7 (guarda try/catch no parse de localStorage).
- **3.2** AL-8: camada única de render que escapa por padrão; nunca interpolar `e.message` em `innerHTML`.
- **3.3** AL-9: `api.js` com timeout (`AbortController`), tratamento de erro unificado (loading/empty/error), remover unwrap mágico e acoplamento `doLogout`.
- **3.4** AL-7: **decisão de produto** — implementar i18n de verdade (extrair strings, `t()`, dicionários) **ou** retirar a promessa PT/EN/ES. Grande esforço; decidir cedo.
- **3.5** MD-10: limpar polling no logout; substituir `MutationObserver` global por delegação de eventos.

### Fase 4 — UX/UI e design system (3–5 dias) — *trilhas paralelas*
- **Trilha Marca**: AL-10 (remover itálicos, emojis, Montserrat 600 + ajustar import de fonte); MD-11 (unificar as duas paletas em um único conjunto de tokens).
- **Trilha A11y**: AL-11 (nav com `<button>`/`role`+teclado, `aria-label`/`aria-current`, focus-visible, trap de foco em modal); MD-14 (loading/erro visíveis).
- **Trilha Responsivo**: AL-12 (breakpoint mobile, sidebar off-canvas, `overflow-x` nas tabelas).
- **Trilha IA/Nav**: MD-12 (dividir "Operacional", restaurar "Visão Geral", expor Portfolio/Metrics/Certification); MD-13 (adotar ou remover `renderPageHeader`); CR-8 (implementar tema claro ou remover o toggle).

### Fase 5 — Qualidade, testes e docs (2–3 dias)
- **5.1** Testes de API contra D1 real (miniflare) que peguem schema drift e IDOR de leitura (hoje mockam `D1` e não pegam nada disso).
- **5.2** AL-13: quebrar god-files por domínio; extrair templates HTML.
- **5.3** BX-1: reescrever `AGENTS.md`/`design.md` para o estado real (index modular, frontend `frontend/src/`).
- **5.4** BX-2..BX-7: deduplicar rotas/handlers, tipar `AI`/reduzir `any`, mover account ids para config, corrigir diacríticos e `--accent-dim`.

### Sequência recomendada
```
Fase 0  ──▶ Fase 1 ─┐
                    ├─▶ Fase 2 ──▶ Fase 5
        Fase 3 ─────┤
        Fase 4 ─────┘   (3 e 4 podem começar em paralelo à 2, times distintos)
```

---

## 6. Top 10 para atacar primeiro

1. **CR-5 / Fase 0** — Deixar o CI verde (lockfile, `tsc`, `node:fs` nos testes).
2. **CR-1** — Isolamento multi-tenant (IDOR) em todas as leituras/listagens.
3. **CR-2** — Remover/rotacionar `SETUP_KEY` público e falhar fechado.
4. **CR-3** — Corrigir schema drift (evidência/DPIA/ativos) + migrations + teste real.
5. **AL-1 / AL-2 / AL-3** — Tokens CSPRNG, rate limiting no OTP, migração de hashes legados.
6. **AL-4 / AL-5** — RBAC por método+rota; reposicionar rotas públicas/autenticadas.
7. **CR-4** — Servir os templates de política (feature quebrada em runtime).
8. **CR-7 / CR-6 / CR-8** — Guarda de localStorage, bug "dots", toggle de tema.
9. **AL-10 / AL-11 / AL-12** — Marca, acessibilidade e responsividade.
10. **MD-1 / MD-2 / AL-9** — Error handler global, RAG funcional, `api.js` resiliente.

---

*Análise gerada por revisão estática read-only. Os itens de "schema drift" (CR-3) podem indicar que o DB de produção foi alterado manualmente e divergiu do `schema.sql` versionado — recomenda-se um `diff` entre o schema deployado e o repositório como primeira verificação da Fase 2.*
