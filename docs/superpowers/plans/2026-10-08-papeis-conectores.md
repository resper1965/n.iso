# Papéis na auditoria, receita dos conectores e fechamento dos PRs — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a separação de papéis da cláusula 9.2 em todos os papéis da consultoria, deixar a tela Conectar agente com receitas conferidas para Cursor, Codex e Antigravity (e decidir o OpenClaw), e levar as correções pendentes de #294 e #295 ao GitHub.

**Architecture:** Regra de papel no `authMiddleware` (um conjunto `PAPEIS_IMPLEMENTACAO`, ao lado de `isAuditWrite` em `src/auth-policy.ts`), espelhada no frontend para esconder o que o servidor recusa. A receita dos conectores é dado estático em `frontend/src/views/conectar-agente.js`; o selo "Verificado" só muda com login real feito pelo dono.

**Tech Stack:** Cloudflare Workers (Hono), D1, Vitest com `cloudflare:test`, frontend vanilla JS com testes em jsdom.

**Spec:** sem spec nova. Decisões do dono em 2026-10-08: "papéis, sim" (consultoria não registra achado), "remoção gerar SoA", "termine a receita para os outros conectores, analise, é possível OpenClaw?", "defina", "faça". Base: `docs/superpowers/specs/2026-09-29-receita-agentes-mcp-remoto-design.md` e `docs/agente/README.md`.

## Decisões definidas (pedido "defina")

| Tema | Decisão | Por quê |
|---|---|---|
| Achado de auditoria (criar, alterar, apagar) | Recusado a `consultor`, `consultant` e `consultoria_admin` em sessão humana | 9.2: quem implementa não audita. O `consultoria_admin` alcança todos os projetos da organização, logo implementa |
| `comercial` | Já não alcança projeto (`requireResourceAccess` e `projetosVisiveis` negam). Só fixar por teste | Não há o que mudar; teste impede regressão |
| Outras escritas de governança (revisão pela direção, métricas, agenda de auditoria) | Continuam liberadas para a consultoria | Preparar ata e agenda é trabalho de consultor; a 9.2 só fala de quem audita |
| Quem registra achado | `platform_admin` e os papéis do cliente que já escrevem hoje | Sem mudança |
| Agente MCP | Já recusado por `apiKeyRoleViolation` (permissão `consultant`) | Sem mudança |
| "Gerar SoA (IA)" | **Já removido** no #286 (botão, `generateSoA`, `niso_generate_soa`); `frontend/test/soa-sem-gerar.test.js` impede a volta | Só conferir que não sobrou nada |
| Selo "Verificado" de cada conector | Só depois de o dono fazer o login real e colar a saída | Regra número um do AGENTS.md |

## Global Constraints

- Tudo em PT-BR: comentário, mensagem de erro, texto de UI.
- Sem trailer `Co-Authored-By`, sem "Generated with", sem emoji em commit, PR ou comentário.
- Merge, migration, deploy e push em branch compartilhada só com "sim" explícito do dono.
- Texto de erro do gate: `Forbidden: consultoria não registra achado de auditoria` (substitui o atual `Forbidden: consultor não registra achado de auditoria`).
- Frontend sem `onclick=` inline e sem `<script>` inline (CSP).
- Branch da Task 1–2: `fix/governanca-gate-papel` (já no origin, `44c8ee3`), worktree `C:\Users\resper\worktrees\governanca-gate-papel`.

## Review Focus

- `consultoria_admin` de OUTRA organização: já recebe 403 por `requireResourceAccess`; o teste da Task 1 não deve confundir os dois 403 — por isso confere a mensagem.
- Sessão legada com `role = 'consultant'` (normalizada para `consultor` em `auth.ts:267`): coberta porque o gate roda depois da normalização.
- Chave de API `write`/`admin` de um `consultoria_admin`: não é sessão humana, fica fora do gate (o controle dela é `permissions`). Comportamento mantido de propósito.
- Consultor que abre a tela de execução de auditoria: não pode ver botão que leva a 403 — Task 2.
- `platform_admin` continua registrando achado — teste já existe em `test/papel-consultor-achado.test.ts`.

---

### Task 1: Gate da 9.2 para todos os papéis da consultoria

**Files:**
- Modify: `src/auth-policy.ts` (acrescentar `PAPEIS_IMPLEMENTACAO` logo após `isAuditWrite`)
- Modify: `src/middleware/auth.ts:5` (import) e `:325-328` (o gate)
- Modify: `test/papel-consultor-achado.test.ts` (mensagem e casos novos)

**Interfaces:**
- Produces: `export const PAPEIS_IMPLEMENTACAO: ReadonlySet<string>` em `src/auth-policy.ts`, com `consultor`, `consultant`, `consultoria_admin`. A Task 2 espelha a mesma lista no frontend.

- [ ] **Step 1: Ajustar o teste para a nova mensagem e os papéis novos**

Em `test/papel-consultor-achado.test.ts`, trocar a constante e acrescentar as sessões e casos:

```ts
const MENSAGEM = 'consultoria não registra achado de auditoria';

let consultor: Record<string, string>;
let admConsultoria: Record<string, string>;
let comercial: Record<string, string>;
let admin: Record<string, string>;

// no beforeAll, depois de applySchema():
admConsultoria = json(await sessionFor({ id: 'u-cadm', email: 'cadm@ness.lat', role: 'consultoria_admin' }));
comercial = json(await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' }));
```

Casos novos, dentro do mesmo `describe`:

```ts
it('consultoria_admin NÃO cria achado e nada é gravado', async () => {
  const antes = await contarAchados();
  const res = await req('/api/v1/audits/aud-1/findings', { method: 'POST', headers: admConsultoria, body: ACHADO });
  expect(res.status).toBe(403);
  expect(await res.text()).toContain(MENSAGEM);
  expect(await contarAchados()).toBe(antes);
});

it('consultoria_admin NÃO altera nem apaga achado', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const res = await req('/api/v1/audit-findings/af-1', { method, headers: admConsultoria, body: method === 'PUT' ? ACHADO : undefined });
    expect(res.status, method).toBe(403);
    expect(await res.text(), method).toContain(MENSAGEM);
  }
});

it('comercial não alcança achado nem governança do projeto (403 pelo acesso, não pelo gate)', async () => {
  const achado = await req('/api/v1/audits/aud-1/findings', { method: 'POST', headers: comercial, body: ACHADO });
  expect(achado.status).toBe(403);
  const revisao = await req('/api/v1/projects/p-1/management-reviews', { method: 'POST', headers: comercial, body: JSON.stringify({ review_date: '2026-10-08' }) });
  expect(revisao.status).toBe(403);
});
```

Atualizar o título do `describe` para `'a consultoria não registra achado de auditoria (sessão humana)'`.

- [ ] **Step 2: Rodar e ver falhar pelo motivo certo**

Run: `npx vitest run test/papel-consultor-achado.test.ts`
Expected: FAIL — os três testes do consultor falham por mensagem (`consultor não…` ≠ `consultoria não…`) e os do `consultoria_admin` falham porque o POST não devolve a mensagem do gate. O do `comercial` deve PASSAR já (só fixa comportamento); se falhar, parar e investigar antes de seguir.

- [ ] **Step 3: Implementar**

Em `src/auth-policy.ts`, logo após `isAuditWrite`:

```ts
/**
 * Papéis da consultoria em sessão humana: implementam o SGSI, então não auditam (ISO 27001, 9.2).
 * `consultant` é o nome legado de `consultor`; `consultoria_admin` alcança todos os projetos da org.
 */
export const PAPEIS_IMPLEMENTACAO: ReadonlySet<string> = new Set(['consultor', 'consultant', 'consultoria_admin']);
```

Em `src/middleware/auth.ts`, o import da linha 5 passa a:

```ts
import { apiKeyRoleViolation, expirouPorInatividade, isAuditWrite, PAPEIS_IMPLEMENTACAO } from '../auth-policy';
```

e o gate (linhas 325-328) passa a:

```ts
  // Independência 9.2 na sessão humana: a chave 'consultant' já é barrada em apiKeyRoleViolation.
  if (!apiKey && !agente && PAPEIS_IMPLEMENTACAO.has(user.role) && isAuditWrite(method, path)) {
    return c.json({ error: 'Forbidden: consultoria não registra achado de auditoria' }, 403);
  }
```

- [ ] **Step 4: Rodar o teste e os vizinhos**

Run: `npx vitest run test/papel-consultor-achado.test.ts test/auth-policy.test.ts`
Expected: PASS. Depois `npx tsc --noEmit` (exit 0).

Run: `git grep -n "consultor não registra achado" -- src test frontend mcp-server-niso`
Expected: só ocorrências de `apiKeyRoleViolation` (mensagem da chave de API, que não muda) e seus testes. Se aparecer teste esperando a mensagem antiga do gate humano, atualizá-lo.

- [ ] **Step 5: Suíte completa e commit**

Run: `npx vitest run > "$SCRATCH/vitest-papeis.log" 2>&1; echo exit=$?` e conferir `exit=0` e ausência de "Unhandled".

```bash
git add src/auth-policy.ts src/middleware/auth.ts test/papel-consultor-achado.test.ts
git commit -m "fix(auth): consultoria_admin também não registra achado de auditoria (9.2)"
```

---

### Task 2: Tela de execução da auditoria sem botão que leva a 403

**Files:**
- Modify: `frontend/src/views/grc.js:1599-1700` (`renderAuditExecution`: botões `openAddFindingModal` na linha 1655 e `deleteFinding` na 1690)
- Create: `frontend/test/auditoria-papel.test.js`

**Interfaces:**
- Consumes: a lista da Task 1 (`consultor`, `consultant`, `consultoria_admin`), repetida no frontend porque ele não importa módulo do Worker.

- [ ] **Step 1: Teste que falha**

`frontend/test/auditoria-papel.test.js`:

```js
// 9.2: a consultoria implementa, não audita. O servidor recusa o achado (auth.ts); a tela não pode
// oferecer o botão que leva ao 403.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/grc.js';
import { S } from '../src/state.js';

const CONTROLE = { id: 'c1', standard: 'A.5.1', title: 'Políticas', status: 'Implemented' };
const ACHADO = { id: 'f1', control_id: 'c1', finding_type: 'observation', description: 'Obs', created_at: '2026-10-08T00:00:00Z' };

async function abrir(role) {
  S.user = { id: 'u1', role };
  S.activeProject = { id: 'p1' };
  S.activeAuditId = 'aud-1';
  apiMock.mockImplementation((m, url) => Promise.resolve(
    url.endsWith('/controls') ? [CONTROLE] : url.endsWith('/findings') ? [ACHADO] : [{ id: 'aud-1', title: 'Interna' }]
  ));
  const c = document.createElement('div'), h = document.createElement('div'), a = document.createElement('div');
  await window.renderAuditExecution(c, h, a);
  return c;
}

describe('execução de auditoria por papel', () => {
  beforeEach(() => apiMock.mockReset());

  for (const role of ['consultor', 'consultant', 'consultoria_admin']) {
    it(`${role} vê os achados, sem botão de registrar nem de apagar`, async () => {
      const c = await abrir(role);
      expect(c.textContent).toContain('Obs');
      expect(c.querySelector('[data-action="openAddFindingModal"]')).toBeNull();
      expect(c.querySelector('[data-action="deleteFinding"]')).toBeNull();
    });
  }

  it('platform_admin continua registrando e apagando', async () => {
    const c = await abrir('platform_admin');
    expect(c.querySelector('[data-action="openAddFindingModal"]')).not.toBeNull();
    expect(c.querySelector('[data-action="deleteFinding"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `npm test --prefix frontend -- auditoria-papel`
Expected: FAIL nos três papéis da consultoria (os botões existem). O de `platform_admin` passa. Se o teste quebrar antes por estrutura de dado do mock (`currentAudit`, `audit.audits`), ajustar o mock ao que `renderAuditExecution` lê (linhas 1609-1640), não o código.

- [ ] **Step 3: Implementar**

Em `renderAuditExecution`, logo depois de `const currentAudit = …` (linha 1615):

```js
            // 9.2: a consultoria implementa, não audita — o servidor recusa o achado (auth.ts).
            const podeRegistrarAchado = !['consultor', 'consultant', 'consultoria_admin'].includes(S.user?.role);
```

Na linha 1655, envolver o botão:

```js
                            ${podeRegistrarAchado ? `<button data-action="openAddFindingModal" data-args="${escapeHTML(JSON.stringify([ctrl.id, ctrl.standard]))}" class="btn" style="padding:4px 10px;font-size:0.75rem;border-color:var(--accent);color:var(--accent)">
                                ${ctrlFindings.length > 0 ? 'Registrar Achado (' + ctrlFindings.length + ')' : '+ Novo Achado'}
                            </button>` : `<span style="font-size:0.75rem;color:var(--muted)">${ctrlFindings.length}</span>`}
```

Na linha 1690:

```js
                                ${podeRegistrarAchado ? `<button data-action="deleteFinding" data-args='["${f.id}"]' class="btn" style="padding:2px 6px;font-size:0.7rem;color:red;border-color:rgba(255,0,0,0.15)">Deletar</button>` : ''}
```

- [ ] **Step 4: Ver passar e rodar a suíte do frontend**

Run: `npm test --prefix frontend` → todos verdes. `npm run build --prefix frontend` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/grc.js frontend/test/auditoria-papel.test.js
git commit -m "fix(ui): consultoria não vê botão de registrar ou apagar achado de auditoria"
```

---

### Task 3: Conferir que o "Gerar SoA (IA)" não deixou resto

Sem código: o #286 removeu botão, função e ferramenta MCP.

- [ ] **Step 1:** `git grep -nE "generate[_-]soa|generateSoA|Gerar SoA" origin/main -- . ':!docs/arquivo' ':!CHANGELOG.md' ':!docs/superpowers'`
Expected: só `frontend/test/soa-sem-gerar.test.js` (o teste que impede a volta).
- [ ] **Step 2:** Se o servidor MCP **local** instalado na máquina do consultor ainda listar `niso_generate_soa`, é build antigo do `mcp-server-niso`: reinstalar a partir da `main` (`mcp-server-niso/README.md`). Não é mudança de código.
- [ ] **Step 3:** No CHANGELOG, a remoção já está registrada (#286). Nada a commitar.

---

### Análise dos conectores (pesquisa de 2026-10-08)

Fontes: docs oficiais do Cursor (`cursor.com/docs/context/mcp`), do Codex (`developers.openai.com/codex/mcp`), codelab do Antigravity (`codelabs.developers.google.com/google-workspace-mcp-antigravity`) e do OpenClaw (`docs.openclaw.ai/cli/mcp`).

| Cliente | Trecho que já publicamos | Login | Confiança | O que falta |
|---|---|---|---|---|
| Cursor | `url` em `.cursor/mcp.json` — **certo**; também vale `~/.cursor/mcp.json` (todos os projetos) | Cursor Settings > MCP, o servidor pede login e abre o navegador. Callback `http://localhost:8787/callback` (loopback, aceito) | Config: doc oficial. Login por registro dinâmico: só comunidade; há relatos de o navegador não abrir em algumas versões | Dizer onde clicar e como conferir |
| Codex | `codex mcp add niso --url …` + `codex mcp login niso` — **certo**, sem flag experimental | `codex mcp login` abre o navegador; callback em porta loopback efêmera (aceito) | Doc oficial | Dizer como conferir (`codex mcp list`, `/mcp` no TUI) |
| Antigravity | `serverUrl` em `~/.gemini/config/mcp_config.json` — **certo** para a 2.0; versões antigas usam `~/.gemini/antigravity/mcp_config.json` | Painel MCP, botão "Authenticate" que vira "Sign out". IDE e CLI guardam login separado | Config: doc oficial. Registro dinâmico com servidor de terceiro: **não confirmado** (os exemplos usam cliente pré-registrado) | Dizer onde clicar, o caminho antigo e o risco |
| OpenClaw | — | `openclaw mcp add` / `openclaw mcp login niso`, config em `mcp.servers` com `transport: "streamable-http"` e `auth: "oauth"` | Doc oficial (média: callback e registro dinâmico não descritos) | Decisão abaixo |

**Do lado do n.iso nada bloqueia:** `/oauth/register` aceita registro dinâmico, e redirect `https` ou `http` em loopback. Fora de loopback a tela de consentimento mostra o aviso "o acesso será entregue a …" (`src/routes/oauth-autorizacao.ts:157`), o que é esperado para o Antigravity (`antigravity.google`). Só recusa callback de esquema próprio (`myapp:/cb`).

**Decisão sobre o OpenClaw (pedido "defina"): é possível, mas não entra na tela Conectar agente.** O OpenClaw é um agente de longa duração ligado a canais de mensagem (WhatsApp, Telegram, Slack…). Qualquer mensagem que chegue nesses canais vira instrução possível para um agente que, conectado ao n.iso, grava e apaga dado de cliente com o alcance do consultor. É injeção de prompt com caminho direto ao dado do cliente, e a 27001 que o produto vende pede exatamente o controle disso (A.8.2, A.5.15). Fica documentado em `docs/agente/README.md` como "possível, não suportado", com as condições mínimas para quem insistir. Reabrir só se a ness. quiser oferecê-lo, com spec própria.

Gemini CLI (`httpUrl`, `/mcp auth niso`) também funciona pela doc, mas ninguém pediu: fica fora (YAGNI).

### Task 4: Receita completa de Cursor, Codex e Antigravity na tela e no README

**Branch:** `docs/receita-conectores`, nova, a partir de `origin/main`, em `C:\Users\resper\worktrees\receita-conectores`.

**Files:**
- Modify: `frontend/src/views/conectar-agente.js:14-19` (campos `onde` e `depois` dos três clientes)
- Modify: `frontend/test/conectar-agente.test.js` (caso novo depois da linha 133)
- Modify: `docs/agente/README.md:22-42` (tabela "Conectar" e nota de estado)

**Interfaces:**
- Consumes: o campo `depois` já existente (renderizado em `conectar-agente.js:105`). Nada novo.

- [ ] **Step 1: Teste que falha**

Acrescentar em `frontend/test/conectar-agente.test.js`, no `describe` principal, depois do teste da linha 130:

```js
  it('cada cliente "A confirmar" diz onde entrar e como conferir a conexão', () => {
    const { c } = monta();
    const esperado = {
      Cursor: /Settings.*MCP[\s\S]*ferramentas/i,
      Codex: /codex mcp list/,
      Antigravity: /Authenticate[\s\S]*Sign out/,
    };
    for (const [nome, re] of Object.entries(esperado)) {
      window.__selecionarCliente(nome.toLowerCase());
      expect(painel(c).textContent, nome).toMatch(re);
    }
  });

  it('o Antigravity cita o caminho das versões anteriores à 2.0', () => {
    const { c } = monta();
    window.__selecionarCliente('antigravity');
    expect(painel(c).textContent).toContain('~/.gemini/antigravity/mcp_config.json');
  });
```

- [ ] **Step 2: Ver falhar**

Run: `npm test --prefix frontend -- conectar-agente`
Expected: os dois testes novos FALHAM (os três clientes não têm `depois`). Os antigos passam.

- [ ] **Step 3: Implementar** — em `frontend/src/views/conectar-agente.js`, substituir as linhas 14-19 por:

```js
    { id: 'cursor', nome: 'Cursor', onde: 'Arquivo .cursor/mcp.json (este projeto) ou ~/.cursor/mcp.json (todos)', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "url": "${URL_MCP}" } } }`,
      depois: 'Salve o arquivo e abra Cursor Settings > MCP: o niso aparece pedindo login. Clique, entre no n.iso pelo navegador e volte. Conectado, ele lista as ferramentas do niso. Se o navegador não abrir, atualize o Cursor: algumas versões têm esse defeito.' },
    { id: 'codex', nome: 'Codex', onde: 'Terminal', aConfirmar: true,
      trecho: `codex mcp add niso --url ${URL_MCP}\ncodex mcp login niso`,
      depois: 'O segundo comando abre o navegador para você entrar no n.iso. Confira com: codex mcp list (deve mostrar o niso), ou /mcp dentro do Codex.' },
    { id: 'antigravity', nome: 'Antigravity', onde: 'Arquivo ~/.gemini/config/mcp_config.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "serverUrl": "${URL_MCP}" } } }`,
      depois: 'No painel MCP do Antigravity, o niso aparece com o botão Authenticate: clique e entre no n.iso pelo navegador. Conectado, o botão vira Sign out. O editor e a linha de comando guardam o login separado: entre em cada um. Antes da versão 2.0 o arquivo ficava em ~/.gemini/antigravity/mcp_config.json. A tela de login do n.iso avisa que o acesso vai para outro endereço: confira que é do Google antes de autorizar.' },
```

- [ ] **Step 4: Ver passar** — `npm test --prefix frontend` (todos verdes) e `npm run build --prefix frontend` (exit 0).

- [ ] **Step 5: README** — em `docs/agente/README.md`, substituir as linhas 26-28 da tabela por:

```markdown
| **Codex** | `codex mcp add niso --url https://niso.ness.com.br/mcp`, depois `codex mcp login niso`. Confira com `codex mcp list`. |
| **Cursor** | em `.cursor/mcp.json` (ou `~/.cursor/mcp.json`, para todos os projetos): `{ "mcpServers": { "niso": { "url": "https://niso.ness.com.br/mcp" } } }`. Entre por Cursor Settings > MCP. |
| **Antigravity** | em `~/.gemini/config/mcp_config.json` (antes da 2.0: `~/.gemini/antigravity/mcp_config.json`): `{ "mcpServers": { "niso": { "serverUrl": "https://niso.ness.com.br/mcp" } } }`. Entre pelo botão Authenticate do painel MCP; editor e linha de comando têm login separado. |
```

E, depois do parágrafo "**Não é você?**…", acrescentar:

```markdown
### Outros clientes MCP (possíveis, não suportados)

Qualquer cliente que fale MCP por HTTP com OAuth (registro dinâmico, PKCE, callback `https` ou
`http` em loopback) conecta. A ness. só dá suporte aos quatro acima.

**OpenClaw: não use com dado de cliente.** Ele conecta (`openclaw mcp add`, depois
`openclaw mcp login niso`), mas é um agente de longa duração que recebe mensagem por WhatsApp,
Telegram, Slack e outros canais. Qualquer mensagem nesses canais pode virar instrução para um
agente que grava e apaga no projeto do cliente com o seu alcance. Se mesmo assim for usar: nenhum
canal aberto a terceiros, um projeto por conexão (já é a regra) e revogue a concessão em
Governança quando terminar.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/conectar-agente.js frontend/test/conectar-agente.test.js docs/agente/README.md
git commit -m "docs(agente): receita completa de Cursor, Codex e Antigravity; OpenClaw possível, não suportado"
```

Push e PR (`gh pr create --base main`), sem merge, sem rodapé de atribuição.

### Task 5: Confirmar cada cliente com login real (dono) e trocar o selo

Login OAuth precisa da conta e do segundo fator do consultor: **é do dono**, não do agente.

- [ ] **Step 1 (dono), por cliente:** seguir a receita da tela, entrar, escolher um projeto de teste e pedir ao agente `niso_contexto`. Colar: o comando de conferência (`codex mcp list`, print do painel MCP do Cursor ou do Antigravity) e a resposta de `niso_contexto` com o nome do cliente.
- [ ] **Step 2 (agente), só para os clientes com saída colada:** em `conectar-agente.js`, `aConfirmar: false` no cliente; o texto de `estado` (linha 74) passa a depender do cliente:

```js
// no objeto do cliente confirmado, ex.:
{ id: 'codex', nome: 'Codex', onde: 'Terminal', aConfirmar: false, verificadoEm: '<dd/mm/aaaa>', ... }

// linha 72-74:
    const estado = atual.aConfirmar
        ? 'A configuração está pronta, mas o login deste cliente ainda não foi confirmado. Se falhar, avise a ness. dizendo em que etapa.'
        : `Exercitado em produção em ${atual.verificadoEm}: conexão, leitura e escrita.`;
```

e `verificadoEm: '30/09/2026'` no Claude Code. Em `frontend/test/conectar-agente.test.js:120-128`, a lista de "A confirmar" perde o cliente confirmado e ganha a asserção `toContain('Verificado')` para ele. Em `docs/agente/README.md:36-42`, a nota de estado passa a listar os confirmados com a data.
- [ ] **Step 3:** testes do frontend verdes, commit `docs(agente): <cliente> confirmado em produção em <data>`, PR sem merge.

### Task 6: Levar as correções de #294 e #295 ao GitHub e abrir o PR da governança

Autorizado pelo dono em 2026-10-08 ("faça"). Sem merge.

- [ ] **Step 1: #294** — em `C:\Users\resper\worktrees\fatia-jornada`: `git status -sb` deve mostrar `ahead 1` com `7529c07`. `git push origin feat/fatia-jornada`. Esperar o CodeQL: `gh pr checks 294 --watch`. Expected: CodeQL SUCCESS.
- [ ] **Step 2: #295** — em `C:\Users\resper\worktrees\avisos-prazo`: `ahead` com `6893fd3`. `git push origin feat/avisos-prazo`. `gh pr checks 295 --watch`. Expected: `test` SUCCESS.
- [ ] **Step 3: PR da governança** — depois das Tasks 1 e 2: `git push origin fix/governanca-gate-papel` e `gh pr create --base main --title "fix(auth): a consultoria não registra achado de auditoria (9.2)"` com o corpo no modelo de `.github/pull_request_template.md`, sem rodapé de atribuição. `gh pr checks <n> --watch` até `test` e `e2e` verdes.
- [ ] **Step 4:** Colar a saída dos três `gh pr checks` no relatório ao dono. Merge fica para o "sim" de cada um, na ordem do plano `2026-10-08-finalizacao-niso.md` (Task 6 de lá).
