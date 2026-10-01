# Receita dos agentes: MCP remoto com login — Plano de implementação

> **Estado (2026-10-01): implementada e, em parte, superada.** O OAuth, a concessão, a
> revalidação a cada chamada e a revogação seguem como descritos aqui. A regra "o agente
> não apaga e não gera em lote" foi **substituída** em 30/09/2026: o agente passou a ter o
> alcance do consultor, preso a um projeto, com confirmação para as ações destrutivas
> ([spec](../specs/2026-09-30-agente-paridade-consultor-design.md)). O estado atual está em [`docs/agente/`](../../agente/README.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O consultor conecta Claude Code, Codex, Cursor ou Antigravity a `https://niso.ness.com.br/mcp`, entra com a conta do nISO, escolhe um cliente em que é consultor designado, e o agente trabalha nesse cliente com direitos de adequação — sem chave e sem compilar nada.

**Architecture:** O mesmo Worker passa a ter três portas novas: `/oauth/*` (autorização OAuth 2.1 via `@cloudflare/workers-oauth-provider`), `/.well-known/oauth-*` (metadados) e `/mcp` (servidor MCP sem estado via `createMcpHandler`). As ferramentas MCP chamam as rotas `/api/v1/*` existentes pelo próprio `app.fetch`, com um principal **agente** injetado no `env` (inalcançável de fora); o `authMiddleware` o resolve, revalida a designação na governança a cada chamada e aplica os limites (sem `DELETE`, sem lote, sem escrita de auditoria). As 23 ferramentas saem do `mcp-server-niso` para um módulo sem efeito colateral, compartilhado pelo servidor local e pelo remoto.

**Tech Stack:** Cloudflare Workers + Hono 4.13, D1, KV, `@cloudflare/workers-oauth-provider`, `agents` (`agents/mcp/server`), `@modelcontextprotocol/server` (SDK v2), zod 4, vitest 4 + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-09-29-receita-agentes-mcp-remoto-design.md`

## Global Constraints

- Endereço oficial: `https://niso.ness.com.br/mcp`.
- Access token: **3600 s**. Refresh token: **30 dias** (2 592 000 s). Concessão expira em 30 dias.
- Só `consultor` / `consultant` obtém concessão, e só para projetos onde consta em `project_governance` com `role_category = 'consultor'` (comparação de e-mail sem caixa).
- Agente: recusado em todo `DELETE`, em `POST .../generate-policies-bulk`, em escrita de auditoria (`apiKeyRoleViolation('consultant', …)`) e em `/agentes` (não gere o próprio acesso).
- Ator na trilha: `agente de <email> (<client_name>)`.
- `instructions` do servidor MCP: **≤ 2048 caracteres** (limite do Claude Code).
- Texto de interface, erro e comentário em PT-BR; marca `ness.` e `n.iso` em minúscula.
- Sem `<script>` inline nem `onclick=` (CSP `script-src 'self'`); a página de autorização é HTML puro com formulário.
- Migration nova é a **0034** (0031–0033 reservadas pela camada MSP). Schema muda em `schema.sql` **e** na migration; índice depois da tabela.
- Branch sempre a partir de `origin/main`. Commits sem trailer de atribuição quando a regra do repositório pedir (não é o caso do nISO, que usa `Co-Authored-By`).

## Review Focus

1. **Designação removida no meio do uso** — o consultor sai da governança do projeto; a próxima chamada do agente tem de ser 401 com instrução de refazer o login (teste na Task 1).
2. **Agente pedindo outro projeto nos argumentos** — `projectId` diferente do da concessão: recusado antes de sair do servidor MCP e, se chegar, 403 no `projectAccessMiddleware` (testes nas Tasks 1 e 4).
3. **Pedido OAuth expirado ou reaproveitado** — voltar ao formulário depois de 10 min, ou confirmar duas vezes: página de erro, nenhuma concessão criada, nenhum código emitido (teste na Task 3).
4. **Segundo fator** — usuário com TOTP ativo sem código, com código errado ou com código já usado: recusado, sem concessão (teste na Task 3).
5. **Consultor sem nenhum projeto designado** — mensagem clara na tela de autorização e nenhuma concessão (teste na Task 3).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `migrations/0034_agente_concessoes.sql`, `schema.sql` | Tabela `agente_concessoes` |
| `src/middleware/agente.ts` (novo) | `PropsAgente`, `resolverAgente` |
| `src/middleware/auth.ts` | Ramo do agente no `authMiddleware` |
| `src/index.ts` | `Bindings` (`OAUTH_KV`, `OAUTH_PROVIDER`, `AGENTE`), roteamento para o `OAuthProvider`, montagem de `/oauth` |
| `src/routes/oauth-autorizacao.ts` (novo) | `/oauth/authorize` em três passos (pedido → credenciais → projeto) |
| `src/mcp/servidor.ts` (novo) | Handler `/mcp`: fábrica do servidor, transporte interno, filtro de ferramentas |
| `src/mcp/contexto.ts` (novo) | `INSTRUCOES`, `ROTEIROS`, `montarContexto` |
| `mcp-server-niso/src/ferramentas.ts` (novo) | `TOOLS`, conjuntos por papel, `executarFerramenta(nome, args, transporte, opts)` |
| `mcp-server-niso/src/index.ts` | Passa a usar `ferramentas.ts` (só transporte stdio + env) |
| `src/routes/agentes.ts` (novo) | Listar e revogar concessões de um projeto |
| `frontend/src/views/monitor.js` (`renderGovernance`) | Cartão "Agentes com acesso" |
| `frontend/src/views/conectar-agente.js` (novo), `router.js`, `login.html`, `globals.js` | Tela "Conectar agente" para o consultor |
| `wrangler.jsonc`, `wrangler.test.jsonc` | KV `OAUTH_KV` |
| `test/agente-principal.test.ts`, `test/oauth-autorizacao.test.ts`, `test/mcp-remoto.test.ts`, `test/agentes-acesso.test.ts` (novos) | Testes de integração |

---

### Task 1: Principal "agente" no servidor

**Files:**
- Create: `migrations/0034_agente_concessoes.sql`, `src/middleware/agente.ts`, `test/agente-principal.test.ts`
- Modify: `schema.sql` (após `project_governance`, ~l.866), `src/index.ts:47-97` (`Bindings`), `src/middleware/auth.ts:141-280`

**Interfaces:**
- Produces:
  - `interface PropsAgente { userId: string; email: string; projectId: string; concessaoId: string }`
  - `resolverAgente(c: Context<{Bindings; Variables}>, p: PropsAgente): Promise<Variables['user'] | Response>`
  - `Bindings.AGENTE?: PropsAgente` — presente só em requisição interna criada pelo `/mcp`.
  - Tabela `agente_concessoes(id, user_id, project_id, cliente_mcp, criado_em, ultimo_uso_em, expira_em, revogado_em, revogado_por)`.

- [ ] **Step 1: Migration e schema**

`migrations/0034_agente_concessoes.sql` (e o mesmo bloco em `schema.sql`, depois do índice de `project_governance`):

```sql
-- Concessão de acesso de um agente de IA (MCP remoto) a UM projeto, em nome
-- de um consultor. O token OAuth carrega `concessaoId`; esta linha é o que
-- revalida o acesso a cada chamada e o que o cliente vê e revoga.
CREATE TABLE IF NOT EXISTS agente_concessoes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cliente_mcp TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em DATETIME,
    expira_em DATETIME NOT NULL,
    revogado_em DATETIME,
    revogado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_agente_concessoes_projeto ON agente_concessoes(project_id);
```

Rodar `npx vitest run test/schema-contract.test.ts` — Expected: PASS (confirma que `schema.sql` segue criando banco novo).

- [ ] **Step 2: Escrever o teste que falha**

`test/agente-principal.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';

/**
 * Principal "agente": requisição interna criada pelo /mcp com `env.AGENTE`.
 * De fora ninguém injeta `env`, então não há cabeçalho a forjar.
 */
const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

function comoAgente(caminho: string, init: RequestInit = {}, props = P) {
  return worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: props } as any);
}

describe('Principal agente', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Cliente B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','CONS@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
  });

  it('lê o próprio projeto', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/risks')).status).toBe(200);
  });

  it('não alcança outro projeto', async () => {
    expect((await comoAgente('/api/v1/projects/p-b/risks')).status).toBe(403);
  });

  it('não apaga nada', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/risks/qualquer', { method: 'DELETE' })).status).toBe(403);
  });

  it('não gera políticas em lote', async () => {
    const res = await comoAgente('/api/v1/projects/p-a/generate-policies-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('não registra achado de auditoria', async () => {
    const res = await comoAgente('/api/v1/audits/x/findings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('não gere o próprio acesso', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/agentes')).status).toBe(403);
  });

  it('grava como "agente de <email> (<cliente>)" na trilha', async () => {
    await comoAgente('/api/v1/projects/p-a/risks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Risco do agente', impact: 3, probability: 3 }),
    });
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ actor: string }>();
    expect(log!.actor).toBe('agente de cons@ness.lat (Cliente A)');
  });

  it('concessão revogada derruba o agente', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, revogado_em) VALUES ('c-rev','u-cons','p-a', datetime('now','+30 days'), datetime('now'))`).run();
    const res = await comoAgente('/api/v1/projects/p-a/risks', {}, { ...P, concessaoId: 'c-rev' });
    expect(res.status).toBe(401);
  });

  it('concessão expirada derruba o agente', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-exp','u-cons','p-a', datetime('now','-1 minute'))`).run();
    expect((await comoAgente('/api/v1/projects/p-a/risks', {}, { ...P, concessaoId: 'c-exp' })).status).toBe(401);
  });

  // Review Focus 1
  it('consultor removido da governança perde o agente na chamada seguinte', async () => {
    await env.DB.prepare(`DELETE FROM project_governance WHERE project_id = 'p-a'`).run();
    const res = await comoAgente('/api/v1/projects/p-a/risks');
    expect(res.status).toBe(401);
    expect((await res.json<any>()).error).toContain('refaça');
  });
});
```

Antes de rodar, confira os campos obrigatórios de `POST /projects/:id/risks` em `src/schemas` (`riskSchema`) e ajuste o corpo do teste da trilha se o nome dos campos diferir.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/agente-principal.test.ts`
Expected: FAIL — sem `env.AGENTE` tratado, o middleware responde 401 "Missing session token" em todos, inclusive "lê o próprio projeto".

- [ ] **Step 4: Implementar `src/middleware/agente.ts`**

```ts
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { apiKeyRoleViolation } from '../auth-policy';

/**
 * Identidade de um agente de IA conectado pelo MCP remoto (spec
 * 2026-09-29-receita-agentes-mcp-remoto). Chega em `env.AGENTE`, que só o
 * handler /mcp preenche — requisição externa não escolhe o `env`.
 */
export interface PropsAgente {
  userId: string;
  email: string;
  projectId: string;
  concessaoId: string;
}

const REFACA = 'Acesso do agente revogado, expirado ou sem designação no projeto: refaça o login no cliente MCP.';

export async function resolverAgente(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  p: PropsAgente
): Promise<Variables['user'] | Response> {
  const method = c.req.method.toUpperCase();
  const path = new URL(c.req.url).pathname;

  // Proporcionalidade: o agente escreve adequação, não destrói nem opera em lote.
  if (method === 'DELETE') return c.json({ error: 'Forbidden: o agente não apaga registros — faça pela interface' }, 403);
  if (path.endsWith('/generate-policies-bulk')) return c.json({ error: 'Forbidden: geração em lote exige a interface e aprovação humana' }, 403);
  if (/\/agentes(\/|$)/.test(path)) return c.json({ error: 'Forbidden: o agente não gere o próprio acesso' }, 403);
  const violacao = apiKeyRoleViolation('consultant', method, path);
  if (violacao) return c.json({ error: violacao }, 403);

  const row = await c.env.DB.prepare(
    `SELECT u.email, u.role, u.ativo, p.client_name
       FROM agente_concessoes ac
       JOIN users u ON u.id = ac.user_id
       JOIN projects p ON p.id = ac.project_id
      WHERE ac.id = ? AND ac.user_id = ? AND ac.project_id = ?
        AND ac.revogado_em IS NULL AND ac.expira_em > datetime('now')`
  ).bind(p.concessaoId, p.userId, p.projectId).first<{ email: string; role: string; ativo: number | null; client_name: string }>();

  if (!row || row.ativo === 0 || (row.role !== 'consultor' && row.role !== 'consultant')) {
    return c.json({ error: REFACA }, 401);
  }

  // Revalida a designação a CADA chamada: tirar o consultor da governança
  // derruba o agente na próxima requisição, sem esperar o token expirar.
  const designado = await c.env.DB.prepare(
    `SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = lower(?) AND role_category = 'consultor'`
  ).bind(p.projectId, row.email).first();
  if (!designado) return c.json({ error: REFACA }, 401);

  await c.env.DB.prepare(`UPDATE agente_concessoes SET ultimo_uso_em = datetime('now') WHERE id = ?`)
    .bind(p.concessaoId).run().catch(() => {});

  // `role: 'client'` + `client_project_id` herda o isolamento de tenant do
  // projectAccessMiddleware; a escrita é liberada pelo chamador (writeCapable).
  return {
    id: p.userId,
    email: `agente de ${row.email} (${row.client_name})`,
    role: 'client',
    client_project_id: p.projectId,
  };
}
```

- [ ] **Step 5: Ligar no `authMiddleware` e no `Bindings`**

Em `src/index.ts`, no tipo `Bindings` (l.47-97), acrescente:

```ts
  /** Só em requisição interna do /mcp (src/mcp/servidor.ts). Ver src/middleware/agente.ts. */
  AGENTE?: import('./middleware/agente').PropsAgente;
```

Em `src/middleware/auth.ts`, logo depois do bloco `PUBLIC_TOKEN_PREFIXES` (l.143-145) e antes de `const apiKey = c.req.header('X-API-Key')`, declare `let user` / `let apiKeyWriteCapable` como já existem e insira o ramo do agente de modo que ele tenha precedência sobre chave e sessão:

```ts
  const agente = c.env.AGENTE;
  if (agente) {
    const resolvido = await resolverAgente(c, agente);
    if (resolvido instanceof Response) return resolvido;
    user = resolvido;
    apiKeyWriteCapable = true;
  } else if (apiKey) {
```

(transformando o `if (apiKey)` existente em `else if (apiKey)` e o `else` da sessão em `else`). No bloqueio de documento legal (l.255), troque `if (!apiKey && !rotaLiberadaComBloqueio(path))` por `if (!apiKey && !agente && !rotaLiberadaComBloqueio(path))`. Importe `resolverAgente` de `./agente`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run test/agente-principal.test.ts && npx tsc --noEmit`
Expected: PASS (10 testes); tsc sem erro.

- [ ] **Step 7: Suíte de autenticação sem regressão**

Run: `npx vitest run test/api.test.ts test/session-revocation.test.ts test/mfa.test.ts test/validacao-corpo.test.ts test/schema-contract.test.ts`
Expected: PASS (falhas só por timeout de 5 s, que já ocorrem na `main`).

- [ ] **Step 8: Commit**

```bash
git add migrations/0034_agente_concessoes.sql schema.sql src/middleware/agente.ts src/middleware/auth.ts src/index.ts test/agente-principal.test.ts
git commit -m "feat(agente): principal agente no servidor, com revalidacao por chamada"
```

---

### Task 2: Ferramentas MCP num módulo compartilhado

**Files:**
- Create: `mcp-server-niso/src/ferramentas.ts`
- Modify: `mcp-server-niso/src/index.ts` (l.164-191 conjuntos de papel, l.210-520 `TOOLS`, l.533-630 helpers de fetch, l.637-700 handlers), `test/contrato-mcp.test.ts`

**Interfaces:**
- Produces (em `mcp-server-niso/src/ferramentas.ts`, sem efeito colateral e sem importar `@modelcontextprotocol/sdk`):
  ```ts
  export interface Transporte {
    get(path: string): Promise<unknown>;
    enviar(path: string, corpo?: unknown, method?: 'POST' | 'PUT' | 'PATCH'): Promise<unknown>;
    contrato<R extends Rota>(rota: R, params: Record<string, string>, corpo: unknown): Promise<unknown>;
    uploadTexto(path: string, campos: Record<string, string>, conteudo: string, nomeArquivo: string): Promise<unknown>;
  }
  export type Papel = 'consultant' | 'auditor' | 'readonly' | '';
  export interface Ferramenta { name: string; description: string; inputSchema: Record<string, unknown> }
  export const TOOLS: Ferramenta[];
  export const READ_TOOLS: Set<string>;
  export const AUDITOR_WRITE_TOOLS: Set<string>;
  export function ferramentaPermitida(nome: string, papel: Papel): boolean;
  export interface Resultado { content: { type: 'text'; text: string }[]; isError?: boolean }
  export async function executarFerramenta(nome: string, args: unknown, t: Transporte, opts: { projetoFixo?: string; papel: Papel }): Promise<Resultado>;
  ```

- [ ] **Step 1: Teste de paridade que falha**

Em `test/contrato-mcp.test.ts`, acrescente:

```ts
import { TOOLS, ferramentaPermitida } from '../mcp-server-niso/src/ferramentas';

describe('ferramentas.ts é a fonte única das ferramentas MCP', () => {
  it('exporta as 23 ferramentas, todas com prefixo niso_', () => {
    expect(TOOLS).toHaveLength(23);
    expect(TOOLS.every((t) => t.name.startsWith('niso_'))).toBe(true);
  });
  it('auditor não vê escrita de implementação; consultor não vê achado', () => {
    expect(ferramentaPermitida('niso_generate_policy', 'auditor')).toBe(false);
    expect(ferramentaPermitida('niso_create_audit_finding', 'consultant')).toBe(false);
    expect(ferramentaPermitida('niso_get_project', 'readonly')).toBe(true);
  });
});
```

Troque o `import mcpSrc from '../mcp-server-niso/src/index.ts?raw'` por `ferramentas.ts?raw` onde o teste inspeciona chamadas a rotas (o `switch` muda de arquivo).

Run: `npx vitest run test/contrato-mcp.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Mover o código**

Crie `mcp-server-niso/src/ferramentas.ts` e mova para ele, **sem alterar o texto das descrições nem os esquemas**:
1. `READ_TOOLS`, `AUDITOR_WRITE_TOOLS`, `isConsultantWrite` (l.164-185).
2. `TOOLS` (l.210-520), tipado como `Ferramenta[]`.
3. O corpo do `switch (name)` do handler de `CallTool` (l.653 em diante) para `executarFerramenta`, trocando: `nisoGet(p)` → `t.get(p)`; `nisoPost(p, b, m)` → `t.enviar(p, b, m)`; `nisoContrato(r, ps, b)` → `t.contrato(r, ps, b)`; `nisoUploadText(...)` → `t.uploadTexto(...)`; `assertProject(id)` → comparação com `opts.projetoFixo` que devolve `{ isError: true, content: [{ type: 'text', text: 'Error: projeto fora do escopo desta sessão' }] }`.
4. `ferramentaPermitida(nome, papel)` com a mesma regra de `toolAllowed` (l.186-191), recebendo o papel por parâmetro em vez de ler o `env`.

Imports internos com extensão `.js` (`./contrato-gerado.js`), exigida pelo `NodeNext` do pacote; o Worker (`moduleResolution: Bundler`) resolve `.js` para `.ts`.

- [ ] **Step 3: `index.ts` do servidor local vira só transporte**

Em `mcp-server-niso/src/index.ts`, mantenha env, `contextoDoPapel()` e o `Server` stdio. Construa um `Transporte` com os quatro helpers existentes (`nisoGet`, `nisoPost`, `nisoContrato`, `nisoUploadText`) e troque os handlers:

```ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.filter((t) => ferramentaPermitida(t.name, PAPEL)),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (!ferramentaPermitida(name, PAPEL)) {
    return { isError: true, content: [{ type: 'text', text: `Ferramenta ${name} indisponível para o papel configurado` }] };
  }
  return executarFerramenta(name, args, transporteHttp, { projetoFixo: NISO_PROJECT_ID || undefined, papel: PAPEL });
});
```

onde `const PAPEL: Papel = NISO_READONLY ? 'readonly' : (NISO_ROLE as Papel)`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run test/contrato-mcp.test.ts && (cd mcp-server-niso && npm ci --include=dev && npx tsc --noEmit && npm run build)`
Expected: PASS; tsc limpo; `build/index.js` gerado.

Smoke do servidor local: `cd mcp-server-niso && NISO_API_KEY=x timeout 3 node build/index.js </dev/null; echo $?` — Expected: `124` (ficou de pé).

- [ ] **Step 5: Commit**

```bash
git add mcp-server-niso/src/ferramentas.ts mcp-server-niso/src/index.ts test/contrato-mcp.test.ts
git commit -m "refactor(mcp): ferramentas num modulo compartilhado, sem efeito colateral"
```

---

### Task 3: OAuth e a tela de autorização

**Files:**
- Create: `src/routes/oauth-autorizacao.ts`, `test/oauth-autorizacao.test.ts`
- Modify: `package.json`, `wrangler.jsonc` (`kv_namespaces`, raiz e `env.staging`), `wrangler.test.jsonc`, `src/index.ts` (Bindings, montagem de `/oauth`, export default)

**Interfaces:**
- Consumes: `agente_concessoes` (Task 1); `verifyPassword`, `rateLimit`, `rateLimitD1`, `genId`, `genToken`, `logAudit`, `escapeHtml` de `src/helpers.ts`; `verificarCodigoTotp(segredo, codigo): Promise<number | null>` de `src/services/totp.ts`.
- Produces:
  - Grant OAuth com `props: PropsAgente` (Task 1) e `userId = users.id`.
  - `export const ROTAS_OAUTH: (p: string) => boolean` em `src/index.ts` — caminhos que passam pelo `OAuthProvider`.
  - `provider` (instância de `OAuthProvider`) exportado de `src/index.ts` para a Task 4.

- [ ] **Step 1: Dependências e bindings**

```bash
npm install @cloudflare/workers-oauth-provider agents @modelcontextprotocol/server
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create OAUTH_KV --env staging
```

Registre os ids devolvidos em `wrangler.jsonc` (`kv_namespaces`, binding `OAUTH_KV`, na raiz e em `env.staging`). Em `wrangler.test.jsonc`, acrescente `{ "binding": "OAUTH_KV" }` em `kv_namespaces`. Em `Bindings` (`src/index.ts`):

```ts
  OAUTH_KV: KVNamespace;
  /** Injetado pelo OAuthProvider nas rotas /oauth/*. */
  OAUTH_PROVIDER?: import('@cloudflare/workers-oauth-provider').OAuthHelpers;
```

Se `npm install` avisar que `agents` exige `compatibility_date` mais nova, suba `compatibility_date` do `wrangler.jsonc` para `2025-09-01` e rode a suíte completa antes de seguir.

- [ ] **Step 2: Escrever o teste do fluxo completo (falha)**

`test/oauth-autorizacao.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { gerarCodigoTotp } from '../src/services/totp';

const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
const f = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request(BASE + caminho, init), workerEnv() as any);

async function pkce() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

async function registrarCliente(): Promise<string> {
  const r = await f('/oauth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude Code', token_endpoint_auth_method: 'none' }),
  });
  expect(r.status).toBe(201);
  return (await r.json<any>()).client_id;
}

const campo = (html: string, nome: string) => html.match(new RegExp(`name="${nome}" value="([^"]+)"`))![1];
const form = (o: Record<string, string>) => ({
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString(),
});

async function iniciar(clientId: string, challenge: string) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'st', resource: `${BASE}/mcp`,
  });
  const r = await f(`/oauth/authorize?${q}`);
  expect(r.status).toBe(200);
  return campo(await r.text(), 'pedido');
}

describe('Autorização OAuth do agente', () => {
  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Twyn','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-sem','sem@ness.lat',?,'Sem','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli','cli@twyn.com',?,'Cli','org_admin','p-a')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, totp_enabled, totp_secret) VALUES ('u-mfa','mfa@ness.lat',?,'Mfa','consultor',1,'JBSWY3DPEHPK3PXP')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Mfa','mfa@ness.lat','consultor','Consultor')`),
    ]);
  });

  it('fluxo completo: login, escolha do cliente, código, token', async () => {
    const clientId = await registrarCliente();
    const { verifier, challenge } = await pkce();
    const pedido = await iniciar(clientId, challenge);

    const passo2 = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    const html2 = await passo2.text();
    expect(html2).toContain('Twyn');
    expect(html2).not.toContain('Outro'); // só projetos onde é consultor designado

    const fim = await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }));
    const html3 = await fim.text();
    const destino = html3.match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
    const code = new URL(destino).searchParams.get('code')!;
    expect(code).toBeTruthy();

    const tok = await f('/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${BASE}/mcp` }).toString(),
    });
    expect(tok.status, await tok.clone().text()).toBe(200);
    const corpo = await tok.json<any>();
    expect(corpo.access_token).toBeTruthy();
    expect(corpo.expires_in).toBe(3600);

    const conc = await env.DB.prepare(`SELECT project_id, expira_em FROM agente_concessoes WHERE user_id = 'u-c'`).first<any>();
    expect(conc.project_id).toBe('p-a');
  });

  it('não confirma projeto fora da designação, mesmo forjando o formulário', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    const r = await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-b' }));
    expect(r.status).toBe(403);
  });

  it('senha errada não avança', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'errada-errada', codigo: '' }));
    expect(r.status).toBe(401);
  });

  it('só consultor conecta agente nesta versão', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'cli@twyn.com', senha: 'senha-forte-123', codigo: '' }));
    expect(r.status).toBe(403);
  });

  // Review Focus 5
  it('consultor sem projeto designado recebe mensagem clara e nada é concedido', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const r = await f('/oauth/authorize/entrar', form({ pedido, email: 'sem@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    expect(await r.text()).toContain('não é consultor designado em nenhum cliente');
    expect(await env.DB.prepare(`SELECT 1 FROM agente_concessoes WHERE user_id = 'u-sem'`).first()).toBeNull();
  });

  // Review Focus 4
  it('MFA: sem código, código errado e código repetido são recusados', async () => {
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    const base = { pedido, email: 'mfa@ness.lat', senha: 'senha-forte-123' };
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: '' }))).status).toBe(401);
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: '000000' }))).status).toBe(401);
    const bom = await gerarCodigoTotp('JBSWY3DPEHPK3PXP', Math.floor(Date.now() / 30000));
    expect((await f('/oauth/authorize/entrar', form({ ...base, codigo: bom }))).status).toBe(200);
    const pedido2 = await iniciar(await registrarCliente(), (await pkce()).challenge);
    expect((await f('/oauth/authorize/entrar', form({ ...base, pedido: pedido2, codigo: bom }))).status).toBe(401);
  });

  // Review Focus 3
  it('pedido desconhecido ou já usado não emite código', async () => {
    const r1 = await f('/oauth/authorize/confirmar', form({ pedido: 'inventado', projeto: 'p-a' }));
    expect(r1.status).toBe(400);
    const pedido = await iniciar(await registrarCliente(), (await pkce()).challenge);
    await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
    expect((await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).status).toBe(200);
    expect((await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).status).toBe(400);
  });

  it('rotas antigas seguem fora do OAuthProvider', async () => {
    expect((await f('/health')).status).toBe(200);
  });
});
```

Run: `npx vitest run test/oauth-autorizacao.test.ts` — Expected: FAIL (`/oauth/register` 404).

- [ ] **Step 3: Roteador `/oauth/authorize`**

`src/routes/oauth-autorizacao.ts`:

```ts
import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { verifyPassword, rateLimit, rateLimitD1, genId, genToken, logAudit, escapeHtml } from '../helpers';
import { verificarCodigoTotp } from '../services/totp';
import type { PropsAgente } from '../middleware/agente';

/*
 * Tela de autorização do MCP remoto (spec 2026-09-29-receita-agentes-mcp-remoto).
 * Três passos, sem JavaScript (CSP script-src 'self'): pedido OAuth → credenciais
 * (senha + TOTP) → escolha de UM cliente onde a pessoa é consultora designada.
 * O estado entre passos fica no KV por 10 min, sob um token aleatório de uso único.
 */
export const oauthAutorizacao = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const TTL_PEDIDO = 600;
const TTL_CONCESSAO_DIAS = 30;
const chave = (t: string) => `oauth_pedido:${t}`;

interface Pedido { oauth: unknown; clientName: string; userId?: string; email?: string }

function pagina(titulo: string, corpo: string, status = 200): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titulo)} · n.iso</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1326;color:#f1f5f9;font:16px/1.6 Inter,system-ui,sans-serif}
main{width:min(440px,100% - 32px);background:#162244;border:1px solid rgba(255,255,255,.1);padding:32px}
h1{font:600 22px Montserrat,system-ui,sans-serif;margin:0 0 8px}.marca{font:500 24px Montserrat,system-ui,sans-serif;margin-bottom:24px}
.marca span{color:#00ade8}label{display:block;font-size:13px;color:#cbd5e1;margin:16px 0 6px}
input[type=email],input[type=password],input[type=text]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#f1f5f9;font:inherit}
button{margin-top:24px;width:100%;padding:12px;border:0;border-radius:10px;background:#00ade8;color:#04121c;font:500 15px Inter,system-ui,sans-serif;cursor:pointer}
.op{display:flex;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)}
.erro{color:#fca5a5}.nota{font-size:13px;color:#94a3b8}
</style></head><body><main><div class="marca">n<span>.</span>iso</div>${corpo}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function lerPedido(c: any, token: string): Promise<Pedido | null> {
  if (!token) return null;
  const bruto = await c.env.SESSIONS.get(chave(token));
  return bruto ? (JSON.parse(bruto) as Pedido) : null;
}

oauthAutorizacao.get('/authorize', async (c) => {
  const oauth = await c.env.OAUTH_PROVIDER!.parseAuthRequest(c.req.raw);
  const cliente = await c.env.OAUTH_PROVIDER!.lookupClient(oauth.clientId);
  if (!cliente) return pagina('Cliente desconhecido', '<h1>Cliente MCP desconhecido</h1>', 400);
  const token = genToken();
  const pedido: Pedido = { oauth, clientName: cliente.clientName || 'Cliente MCP' };
  await c.env.SESSIONS.put(chave(token), JSON.stringify(pedido), { expirationTtl: TTL_PEDIDO });
  return pagina('Conectar agente', `
<h1>Conectar agente</h1>
<p class="nota">${escapeHtml(pedido.clientName)} pede acesso ao n.iso em seu nome.</p>
<form method="post" action="/oauth/authorize/entrar">
<input type="hidden" name="pedido" value="${token}">
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
<label for="codigo">Código do autenticador (se ativo)</label><input id="codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code">
<button type="submit">Entrar</button></form>`);
});

oauthAutorizacao.post('/authorize/entrar', async (c) => {
  const f = await c.req.parseBody();
  const token = String(f.pedido || '');
  const pedido = await lerPedido(c, token);
  if (!pedido) return pagina('Pedido expirado', '<h1>Pedido expirado</h1><p>Volte ao seu cliente MCP e conecte de novo.</p>', 400);

  const ip = c.req.header('CF-Connecting-IP') || '';
  const email = String(f.email || '').trim().toLowerCase();
  if (!(await rateLimit(c.env.SESSIONS, `oauth-login:${ip}`, 20, 300))
    || !(await rateLimitD1(c.env.DB, `login:acct:${email}`, 10, 300))) {
    return pagina('Muitas tentativas', '<h1>Muitas tentativas</h1><p>Tente de novo em alguns minutos.</p>', 429);
  }

  const u = await c.env.DB.prepare(
    'SELECT id, email, role, password_hash, ativo, totp_enabled, totp_secret, totp_last_window FROM users WHERE lower(email) = ?'
  ).bind(email).first<any>();
  if (!u || u.ativo === 0 || !(await verifyPassword(String(f.senha || ''), u.password_hash))) {
    return pagina('Entrar', '<h1>Não foi possível entrar</h1><p class="erro">E-mail ou senha incorretos.</p>', 401);
  }
  if (u.role !== 'consultor' && u.role !== 'consultant') {
    return pagina('Entrar', '<h1>Acesso não disponível</h1><p>Nesta versão, só consultores da ness. conectam agentes.</p>', 403);
  }
  if (u.totp_enabled === 1) {
    const janela = await verificarCodigoTotp(u.totp_secret, String(f.codigo || ''));
    const avanco = janela === null ? null : await c.env.DB.prepare(
      `UPDATE users SET totp_last_window = ? WHERE id = ? AND (totp_last_window IS NULL OR totp_last_window < ?)`
    ).bind(janela, u.id, janela).run();
    if (!avanco || avanco.meta?.changes !== 1) {
      return pagina('Entrar', '<h1>Código inválido</h1><p class="erro">Informe o código atual do autenticador.</p>', 401);
    }
  }

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.client_name FROM projects p JOIN project_governance g ON g.project_id = p.id
      WHERE lower(g.email) = ? AND g.role_category = 'consultor' ORDER BY p.client_name`
  ).bind(email).all<{ id: string; client_name: string }>();
  if (!results.length) {
    await c.env.SESSIONS.delete(chave(token));
    return pagina('Sem clientes', '<h1>Nenhum cliente</h1><p>Você não é consultor designado em nenhum cliente. Peça ao administrador do cliente ou ao platform_admin para designá-lo na governança do projeto.</p>');
  }

  await c.env.SESSIONS.put(chave(token), JSON.stringify({ ...pedido, userId: u.id, email: u.email }), { expirationTtl: TTL_PEDIDO });
  const opcoes = results.map((p, i) =>
    `<label class="op"><input type="radio" name="projeto" value="${escapeHtml(p.id)}" ${i === 0 ? 'checked' : ''}> ${escapeHtml(p.client_name)}</label>`
  ).join('');
  return pagina('Escolha o cliente', `
<h1>Em qual cliente o agente vai atuar?</h1>
<p class="nota">Um cliente por conexão. Para outro cliente, conecte de novo.</p>
<form method="post" action="/oauth/authorize/confirmar">
<input type="hidden" name="pedido" value="${token}">${opcoes}
<p class="nota">O agente grava adequação (políticas, SoA, evidências, controles, riscos). Não apaga registros, não gera em lote e não registra achado de auditoria. O administrador do cliente vê e pode revogar este acesso.</p>
<button type="submit">Autorizar</button></form>`);
});

oauthAutorizacao.post('/authorize/confirmar', async (c) => {
  const f = await c.req.parseBody();
  const token = String(f.pedido || '');
  const pedido = await lerPedido(c, token);
  if (!pedido?.userId || !pedido.email) return pagina('Pedido expirado', '<h1>Pedido expirado</h1><p>Volte ao seu cliente MCP e conecte de novo.</p>', 400);
  await c.env.SESSIONS.delete(chave(token)); // uso único, antes de qualquer efeito

  const projectId = String(f.projeto || '');
  const alvo = await c.env.DB.prepare(
    `SELECT p.client_name FROM projects p JOIN project_governance g ON g.project_id = p.id
      WHERE p.id = ? AND lower(g.email) = lower(?) AND g.role_category = 'consultor'`
  ).bind(projectId, pedido.email).first<{ client_name: string }>();
  if (!alvo) return pagina('Não autorizado', '<h1>Cliente fora da sua designação</h1>', 403);

  const concessaoId = genId();
  await c.env.DB.prepare(
    `INSERT INTO agente_concessoes (id, user_id, project_id, cliente_mcp, expira_em) VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).bind(concessaoId, pedido.userId, projectId, pedido.clientName, `+${TTL_CONCESSAO_DIAS} days`).run();
  await logAudit(c.env.DB, 'agente.autorizado', pedido.email, `Agente ${pedido.clientName} conectado ao cliente ${alvo.client_name}`, '', c.req.header('CF-Connecting-IP') || '', projectId);

  const props: PropsAgente = { userId: pedido.userId, email: pedido.email, projectId, concessaoId };
  const { redirectTo } = await c.env.OAUTH_PROVIDER!.completeAuthorization({
    request: pedido.oauth as any, userId: pedido.userId,
    metadata: { clientName: pedido.clientName, projectId }, scope: (pedido.oauth as any).scope ?? [],
    props, revokeExistingGrants: false,
  });

  // Página com meta refresh, e não 302: o CSP `form-action 'self'` barra o
  // redirecionamento pós-formulário para o callback local do cliente MCP.
  const url = escapeHtml(redirectTo);
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>Conectado · n.iso</title></head><body style="background:#0b1326;color:#f1f5f9;font:16px Inter,system-ui,sans-serif;padding:32px">Agente conectado a ${escapeHtml(alvo.client_name)}. <a style="color:#00ade8" href="${url}">Voltar ao cliente MCP</a>.</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
});
```

- [ ] **Step 4: Ligar o `OAuthProvider` no `src/index.ts`**

Monte `app.route('/oauth', oauthAutorizacao)` antes do catch-all. Substitua o `export default` (l.451) por:

```ts
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { handlerMcp } from './mcp/servidor';

const fetchHono = app.fetch.bind(app);

export const provider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: { fetch: (req: Request, env: any, ctx: any) => handlerMcp(req, env, ctx, fetchHono) },
  defaultHandler: { fetch: fetchHono as any },
  authorizeEndpoint: '/oauth/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['niso:consultor'],
  tokenExchangeCallback: async () => ({ accessTokenTTL: 3600, refreshTokenTTL: 30 * 86400 }),
});

/** Só estes caminhos passam pelo OAuthProvider; o resto segue direto para o Hono. */
export const ROTAS_OAUTH = (p: string) =>
  p === '/mcp' || p.startsWith('/mcp/') || p.startsWith('/oauth/') || p.startsWith('/.well-known/oauth-');

export default Object.assign(app, {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
    ROTAS_OAUTH(new URL(req.url).pathname) ? provider.fetch(req, env as any, ctx) : fetchHono(req, env, ctx),
  scheduled: (_evento: ScheduledController, env: Bindings, ctx: ExecutionContext) => ctx.waitUntil(manutencaoDiaria(env)),
});
```

Para esta task, crie `src/mcp/servidor.ts` só com `export async function handlerMcp(req: Request, env: any, ctx: any, fetchHono: (r: Request, e: any, c?: any) => Promise<Response>): Promise<Response> { return new Response('MCP em construção', { status: 501 }); }` — a Task 4 o completa.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/oauth-autorizacao.test.ts && npx tsc --noEmit`
Expected: PASS (8 testes).

Se `/oauth/token` devolver `invalid_target` por causa do `resource`, confira o nome do parâmetro de audiência na versão instalada (`node -e "console.log(require('@cloudflare/workers-oauth-provider/package.json').version)"`) e ajuste o teste para o que a biblioteca exige — não o código de produção.

- [ ] **Step 6: Sem regressão**

Run: `npx vitest run test/landing-raiz.test.ts src/index.test.ts test/api.test.ts test/cabecalhos-assets.test.ts`
Expected: PASS — `app.request` segue funcionando, CSP inalterado.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc wrangler.test.jsonc src/index.ts src/routes/oauth-autorizacao.ts src/mcp/servidor.ts test/oauth-autorizacao.test.ts
git commit -m "feat(oauth): autorizacao do agente com login n.iso, MFA e escolha do cliente"
```

---

### Task 4: Servidor `/mcp` com `niso_contexto`

**Files:**
- Create: `src/mcp/contexto.ts`, `test/mcp-remoto.test.ts`
- Modify: `src/mcp/servidor.ts`

**Interfaces:**
- Consumes: `TOOLS`, `ferramentaPermitida`, `executarFerramenta`, `Transporte` (Task 2); `PropsAgente` (Task 1); `ctx.props` do `OAuthProvider` (Task 3).
- Produces: `INSTRUCOES: string` (≤ 2048), `ROTEIROS: string`, `montarContexto(projeto: { client_name: string; standards?: string | null; status?: string | null }, email: string): string`.

- [ ] **Step 1: Confirmar a API do SDK v2**

Run: `node -e "import('@modelcontextprotocol/server').then(m=>console.log(Object.keys(m).filter(k=>/Server|Schema/.test(k)).join(' ')))"`
Expected: a lista inclui `Server`, `ListToolsRequestSchema`, `CallToolRequestSchema`. Se os esquemas não estiverem nesse pacote, importe-os de onde a lista indicar; o resto do código não muda.

- [ ] **Step 2: Teste que falha**

`test/mcp-remoto.test.ts` — reaproveita o fluxo da Task 3 para obter um token e chama o `/mcp`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { INSTRUCOES } from '../src/mcp/contexto';

const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
const f = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request(BASE + caminho, init), workerEnv() as any);
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

async function tokenDoAgente(): Promise<string> {
  const reg = await (await f('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: `${BASE}/mcp` });
  const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
  await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }));
  const destino = (await (await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).text()).match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
  const code = new URL(destino).searchParams.get('code')!;
  const tok = await (await f('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }).toString() })).json<any>();
  return tok.access_token;
}

async function rpc(token: string, method: string, params: unknown = {}) {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await r.json<any>()).result;
}

describe('/mcp remoto', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Twyn','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
    ]);
    token = await tokenDoAgente();
  });

  it('sem token é 401 com o desafio OAuth', async () => {
    const r = await f('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('WWW-Authenticate')).toContain('Bearer');
  });

  it('instructions cabem no limite do Claude Code e mandam começar por niso_contexto', () => {
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
    expect(INSTRUCOES).toContain('niso_contexto');
  });

  it('lista ferramentas do consultor, sem lote, sem auditoria, com niso_contexto', async () => {
    const nomes: string[] = (await rpc(token, 'tools/list')).tools.map((t: any) => t.name);
    expect(nomes).toContain('niso_contexto');
    expect(nomes).toContain('niso_create_risk');
    expect(nomes).not.toContain('niso_generate_policies_bulk');
    expect(nomes).not.toContain('niso_create_audit_finding');
    expect(nomes).not.toContain('niso_create_auditor_note');
  });

  it('niso_contexto diz o cliente, o papel e os roteiros', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_contexto', arguments: {} });
    const texto = res.content[0].text;
    expect(texto).toContain('Twyn');
    expect(texto).toContain('p-a');
    expect(texto).toContain('Diagnóstico');
  });

  it('ferramenta de leitura funciona no próprio cliente', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_list_risks', arguments: { projectId: 'p-a' } });
    expect(res.isError).toBeFalsy();
  });

  // Review Focus 2
  it('projectId de outro cliente é recusado', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_list_risks', arguments: { projectId: 'p-b' } });
    expect(res.isError).toBe(true);
  });

  it('ferramenta fora do papel é recusada mesmo chamada direto', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_create_audit_finding', arguments: { projectId: 'p-a', auditId: 'x' } });
    expect(res.isError).toBe(true);
  });

  it('escrita pelo agente sai com a autoria do humano', async () => {
    await rpc(token, 'tools/call', { name: 'niso_create_risk', arguments: { projectId: 'p-a', title: 'Risco via MCP', impact: 3, probability: 2 } });
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ actor: string }>();
    expect(log!.actor).toBe('agente de cons@ness.lat (Twyn)');
  });
});
```

Confira os argumentos obrigatórios de `niso_create_risk` no `TOOLS` (Task 2) e ajuste o teste da autoria se diferirem.

Run: `npx vitest run test/mcp-remoto.test.ts` — Expected: FAIL (`/mcp` responde 501).

- [ ] **Step 3: `src/mcp/contexto.ts`**

```ts
/** Texto do handshake: curto (≤ 2048, limite do Claude Code), aponta para niso_contexto. */
export const INSTRUCOES =
  'Você é o agente CONSULTOR do n.iso (adequação ISO 27001/27701), atuando em UM cliente escolhido no login. ' +
  'Comece SEMPRE chamando niso_contexto: ela diz o cliente, o projectId a usar, o que você pode e não pode fazer e os roteiros de trabalho. ' +
  'Você escreve adequação (política, SoA, evidência, controle, ativo, risco) e responde nota de auditoria. ' +
  'Não apaga registros, não gera em lote e não registra achado de auditoria (ISO 27001, 9.2: quem implementa não audita). ' +
  'Rascunho de IA é rascunho até revisão humana: peça aprovação antes de gravar.';

export const ROTEIROS = `Roteiros de trabalho:

1. Diagnóstico — niso_get_project → niso_gap_analysis → niso_traceability. Pare numa lista de lacunas priorizada. Não escreva nada.
2. Fechar lacuna — escolha um controle → niso_list_evidence → rascunhe evidência ou política → PEÇA APROVAÇÃO HUMANA → niso_create_evidence / niso_update_control / niso_generate_policy. Pare quando o controle tiver evidência vinculada.
3. Responder auditoria — leia as notas em niso_audit_pack → rascunhe a resposta → PEÇA APROVAÇÃO HUMANA → niso_respond_auditor_note.`;

export function montarContexto(
  projeto: { id: string; client_name: string; standards?: string | null; status?: string | null },
  email: string
): string {
  return [
    `Cliente: ${projeto.client_name}`,
    `projectId (use em toda ferramenta): ${projeto.id}`,
    `Normas: ${projeto.standards ?? '—'} · Situação: ${projeto.status ?? '—'}`,
    `Você age em nome de: ${email}. Tudo que gravar sai na trilha como "agente de ${email}".`,
    '',
    'Pode: ler o SGSI do cliente; gravar política, SoA, evidência (só texto), controle, ativo, risco; responder nota de auditoria.',
    'Não pode: apagar; gerar políticas em lote; registrar achado ou nota de auditoria; atuar em outro cliente.',
    'O administrador do cliente vê este acesso e pode revogá-lo a qualquer momento.',
    '',
    ROTEIROS,
  ].join('\n');
}
```

- [ ] **Step 4: `src/mcp/servidor.ts`**

```ts
import { createMcpHandler } from 'agents/mcp/server';
import { Server, ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/server';
import { TOOLS, ferramentaPermitida, executarFerramenta, type Transporte, type Ferramenta } from '../../mcp-server-niso/src/ferramentas';
import type { PropsAgente } from '../middleware/agente';
import { INSTRUCOES, montarContexto } from './contexto';

type FetchHono = (r: Request, e: any, c?: any) => Promise<Response>;

/** Fora do alcance do agente mesmo sendo do consultor: o servidor recusa de novo. */
const BLOQUEADAS = new Set(['niso_generate_policies_bulk', 'niso_create_audit_finding', 'niso_create_auditor_note']);

const CONTEXTO: Ferramenta = {
  name: 'niso_contexto',
  description: 'Comece por aqui. Diz o cliente desta conexão, o projectId a usar, o que você pode e não pode fazer, e os roteiros de trabalho.',
  inputSchema: { type: 'object', properties: {} },
};

function disponiveis(): Ferramenta[] {
  return [CONTEXTO, ...TOOLS.filter((t) => ferramentaPermitida(t.name, 'consultant') && !BLOQUEADAS.has(t.name))];
}

/** Chama as rotas /api/v1 do próprio Worker como o agente — sem rede, sem cabeçalho forjável. */
function transporteInterno(origem: Request, env: any, ctx: any, props: PropsAgente, fetchHono: FetchHono): Transporte {
  const base = new URL(origem.url).origin;
  const envAgente = { ...env, AGENTE: props };
  const ip = origem.headers.get('CF-Connecting-IP');
  const chamar = async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    if (ip) headers.set('CF-Connecting-IP', ip);
    const r = await fetchHono(new Request(base + path, { ...init, headers }), envAgente, ctx);
    const texto = await r.text();
    const corpo = texto ? JSON.parse(texto) : null;
    if (!r.ok) throw new Error(`${r.status}: ${corpo?.error ?? texto}`);
    return corpo;
  };
  return {
    get: (path) => chamar(path, { method: 'GET' }),
    enviar: (path, corpo, method = 'POST') =>
      chamar(path, { method, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    contrato: (rota, params, corpo) => {
      const [method, modelo] = rota.split(' ') as [string, string];
      const path = modelo.replace(/\{(\w+)\}/g, (_, k) => {
        // Mesma guarda do nisoContrato local: placeholder vazio viraria `{x}` literal e um 404 silencioso.
        if (!params[k]) throw new Error(`Parâmetro de caminho ausente: ${k} (rota ${rota})`);
        return encodeURIComponent(params[k]);
      });
      return chamar(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    },
    uploadTexto: (path, campos, conteudo, nomeArquivo) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos)) fd.append(k, v);
      fd.append('file', new File([conteudo], nomeArquivo, { type: 'text/plain' }));
      return chamar(path, { method: 'POST', body: fd });
    },
  };
}

export async function handlerMcp(req: Request, env: any, ctx: any, fetchHono: FetchHono): Promise<Response> {
  const props = ctx.props as PropsAgente;
  const t = transporteInterno(req, env, ctx, props, fetchHono);

  const criar = () => {
    const server = new Server({ name: 'niso', version: '2.0.0' }, { capabilities: { tools: {} }, instructions: INSTRUCOES });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: disponiveis() }));
    server.setRequestHandler(CallToolRequestSchema, async (r: any) => {
      const { name, arguments: args } = r.params;
      try {
        if (name === 'niso_contexto') {
          const projeto = await t.get(`/api/v1/projects/${encodeURIComponent(props.projectId)}`) as any;
          return { content: [{ type: 'text', text: montarContexto({ ...(projeto.project ?? projeto), id: props.projectId }, props.email) }] };
        }
        if (!disponiveis().some((f) => f.name === name)) {
          return { isError: true, content: [{ type: 'text', text: `Ferramenta ${name} indisponível para o agente consultor` }] };
        }
        return await executarFerramenta(name, args, t, { projetoFixo: props.projectId, papel: 'consultant' });
      } catch (e: any) {
        return { isError: true, content: [{ type: 'text', text: `Erro: ${e.message}` }] };
      }
    });
    return server;
  };

  return createMcpHandler(criar, {
    route: '/mcp',
    responseMode: 'json',
    allowedHostnames: ['niso.ness.com.br', 'n-iso.ness.com.br', 'niso.ness.workers.dev', 'localhost', '127.0.0.1'],
  })(req, env, ctx);
}
```

A forma da resposta de `GET /api/v1/projects/:id` define `projeto.project ?? projeto`: confira em `src/routes/projects.ts` e deixe só o ramo correto.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/mcp-remoto.test.ts test/oauth-autorizacao.test.ts test/agente-principal.test.ts && npx tsc --noEmit`
Expected: PASS. Se `tools/list` exigir `initialize` antes, faça o teste enviar `initialize` (com `protocolVersion`, `capabilities: {}`, `clientInfo`) primeiro — o handler é sem estado, então é só a ordem das mensagens.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/servidor.ts src/mcp/contexto.ts test/mcp-remoto.test.ts
git commit -m "feat(mcp): servidor remoto /mcp com niso_contexto e ferramentas do consultor"
```

---

### Task 5: "Agentes com acesso" para o cliente

**Files:**
- Create: `src/routes/agentes.ts`, `test/agentes-acesso.test.ts`
- Modify: `src/index.ts` (montar depois do `projectAccessMiddleware`), `frontend/src/views/monitor.js` (`renderGovernance`, l.465)

**Interfaces:**
- Consumes: `agente_concessoes` (Task 1).
- Produces:
  - `GET /api/v1/projects/:projectId/agentes` → `[{ id, consultor, cliente_mcp, criado_em, ultimo_uso_em, expira_em, revogado_em }]`
  - `POST /api/v1/projects/:projectId/agentes/:id/revogar` → `{ ok: true }`

- [ ] **Step 1: Teste que falha**

`test/agentes-acesso.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, pedir, workerEnv } from './helpers/d1';

const req = (c: string, i: RequestInit = {}) => pedir(worker, c, i);
const P = { userId: 'u-c', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

describe('Agentes com acesso ao projeto', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Twyn','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, cliente_mcp, expira_em) VALUES ('c-1','u-c','p-a','Claude Code', datetime('now','+30 days'))`),
    ]);
  });

  it('org_admin do cliente vê o agente', async () => {
    const s = await sessionFor({ id: 'u-o', email: 'dono@twyn.com', role: 'org_admin', client_project_id: 'p-a' });
    const lista = await (await req('/api/v1/projects/p-a/agentes', { headers: s })).json<any[]>();
    expect(lista).toHaveLength(1);
    expect(lista[0].consultor).toBe('cons@ness.lat');
    expect(lista[0].cliente_mcp).toBe('Claude Code');
  });

  it('org_admin de outro cliente não vê', async () => {
    const s = await sessionFor({ id: 'u-x', email: 'x@outro.com', role: 'org_admin', client_project_id: 'p-b' });
    expect((await req('/api/v1/projects/p-a/agentes', { headers: s })).status).toBe(403);
  });

  it('org_user (read-only) não revoga', async () => {
    const s = await sessionFor({ id: 'u-u', email: 'u@twyn.com', role: 'org_user', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-1/revogar', { method: 'POST', headers: s })).status).toBe(403);
  });

  it('org_admin revoga, fica na trilha, e o agente cai na chamada seguinte', async () => {
    const s = await sessionFor({ id: 'u-o', email: 'dono@twyn.com', role: 'org_admin', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-1/revogar', { method: 'POST', headers: s })).status).toBe(200);
    const log = await env.DB.prepare(`SELECT action FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ action: string }>();
    expect(log!.action).toBe('agente.revogado');
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-a/risks'), { ...workerEnv(), AGENTE: P } as any);
    expect(r.status).toBe(401);
  });

  it('revogar concessão de outro projeto pelo caminho deste é 404', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-b','u-c','p-b', datetime('now','+30 days'))`).run();
    const s = await sessionFor({ id: 'u-o', email: 'dono@twyn.com', role: 'org_admin', client_project_id: 'p-a' });
    expect((await req('/api/v1/projects/p-a/agentes/c-b/revogar', { method: 'POST', headers: s })).status).toBe(404);
  });
});
```

Run: `npx vitest run test/agentes-acesso.test.ts` — Expected: FAIL (rota 404).

- [ ] **Step 2: Implementar `src/routes/agentes.ts`**

```ts
import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { logAudit, erro500 } from '../helpers';

/**
 * Agentes de IA com acesso a um projeto (MCP remoto). O cliente vê e revoga;
 * o platform_admin também; o consultor revoga os próprios. O isolamento entre
 * projetos vem do projectAccessMiddleware (montado antes).
 */
export const agentesApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const podeVer = (role: string) => ['platform_admin', 'org_admin', 'consultor', 'consultant'].includes(role);

agentesApp.get('/projects/:projectId/agentes', async (c) => {
  const user = c.get('user');
  if (!podeVer(user.role)) return c.json({ error: 'Forbidden' }, 403);
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT ac.id, u.email AS consultor, ac.cliente_mcp, ac.criado_em, ac.ultimo_uso_em, ac.expira_em, ac.revogado_em
         FROM agente_concessoes ac JOIN users u ON u.id = ac.user_id
        WHERE ac.project_id = ? ORDER BY ac.criado_em DESC`
    ).bind(c.req.param('projectId')).all();
    return c.json(results || []);
  } catch (e: any) {
    return erro500(c, 'Falha ao listar agentes', e);
  }
});

agentesApp.post('/projects/:projectId/agentes/:id/revogar', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  try {
    const conc = await c.env.DB.prepare(`SELECT user_id FROM agente_concessoes WHERE id = ? AND project_id = ?`)
      .bind(id, projectId).first<{ user_id: string }>();
    if (!conc) return c.json({ error: 'Acesso de agente não encontrado' }, 404);
    const dono = conc.user_id === user.id && (user.role === 'consultor' || user.role === 'consultant');
    if (!(user.role === 'platform_admin' || user.role === 'org_admin' || dono)) return c.json({ error: 'Forbidden' }, 403);
    await c.env.DB.prepare(`UPDATE agente_concessoes SET revogado_em = datetime('now'), revogado_por = ? WHERE id = ? AND revogado_em IS NULL`)
      .bind(user.email, id).run();
    await logAudit(c.env.DB, 'agente.revogado', user.email, `Acesso de agente ${id} revogado`, '', c.req.header('CF-Connecting-IP') || '', projectId);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao revogar agente', e);
  }
});
```

Monte em `src/index.ts` com os demais roteadores de `/api/v1` (depois do `projectAccessMiddleware`): `app.route('/api/v1', agentesApp);`. Confira que `org_user` cai no bloqueio de escrita do `authMiddleware` (l.288) para o `POST .../revogar` — o teste "org_user não revoga" cobre.

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run test/agentes-acesso.test.ts && npx tsc --noEmit` — Expected: PASS (5 testes).

- [ ] **Step 4: Cartão na governança**

Em `frontend/src/views/monitor.js`, no fim de `renderGovernance` (l.465), acrescente um cartão "Agentes com acesso" que chama `GET /api/v1/projects/${S.currentProject}/agentes` e lista consultor, cliente MCP, desde, último uso, validade e situação, com botão "Revogar" (`data-action="revogarAgente" data-args='["<id>"]'` — delegação de eventos, sem `onclick`). Registre a ação:

```js
window.revogarAgente = async function revogarAgente(id) {
    if (!confirm('Revogar o acesso deste agente? Ele perde o acesso na próxima chamada.')) return;
    try {
        await api('POST', `/api/v1/projects/${S.currentProject}/agentes/${id}/revogar`);
        showToast('Acesso revogado');
        render();
    } catch (e) { showToast(e.message || 'Falha ao revogar', 'error'); }
};
```

Use o nome real da variável de projeto corrente que `renderGovernance` já usa (confira no próprio arquivo) em vez de `S.currentProject` se diferir. Lista vazia: "Nenhum agente conectado a este cliente."

- [ ] **Step 5: Verificar no navegador**

`cd frontend && npx vite build && rm -f dist/index.html`, `npx wrangler dev --port 8799`, entrar como `org_admin` de um projeto com concessão semeada, abrir Governança, revogar. Print antes e depois (ver memória `navegador-para-verificar-ui`: `playwright-core` na raiz, `channel: 'msedge'`).

- [ ] **Step 6: Commit**

```bash
git add src/routes/agentes.ts src/index.ts frontend/src/views/monitor.js test/agentes-acesso.test.ts
git commit -m "feat(agentes): cliente ve e revoga os agentes com acesso ao projeto"
```

---

### Task 6: "Conectar agente", documentação e verificação nos quatro clientes

**Files:**
- Create: `frontend/src/views/conectar-agente.js`
- Modify: `frontend/src/router.js`, `frontend/login.html` (item de menu no grupo de sistema), `frontend/src/globals.js` (visibilidade só para consultor), `frontend/src/main.js` (import da view), `mcp-server-niso/README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: `/mcp` (Task 4).

- [ ] **Step 1: A view**

`frontend/src/views/conectar-agente.js` renderiza, para consultor, o endereço e um bloco por cliente MCP com botão "Copiar" (`data-action="copiarTexto"`, reutilizando o padrão de cópia já existente em `admin.js`):

| Cliente | Trecho |
|---|---|
| Claude Code | `claude mcp add --transport http niso https://niso.ness.com.br/mcp` |
| Cursor (`.cursor/mcp.json`) | `{ "mcpServers": { "niso": { "url": "https://niso.ness.com.br/mcp" } } }` |
| Codex (`~/.codex/config.toml`) | `[mcp_servers.niso]` + `url = "https://niso.ness.com.br/mcp"` |
| Antigravity (`~/.gemini/config/mcp_config.json`) | `{ "mcpServers": { "niso": { "serverUrl": "https://niso.ness.com.br/mcp" } } }` |

Texto de apoio: "Na primeira chamada o cliente abre o navegador para você entrar no n.iso e escolher o cliente. Um cliente por conexão." Rota `conectar-agente` no `router.js`; item "Conectar agente" (`id="nav-conectar-agente"`) no grupo de sistema, visível só para `consultor`/`consultant` em `globals.js`.

- [ ] **Step 2: Verificação real nos quatro clientes (manual, com produção ou staging)**

Para cada cliente: adicionar o trecho, disparar uma conversa que peça "chame niso_contexto", concluir o login no navegador, confirmar que a resposta traz o cliente escolhido. Registrar, por cliente, **funcionou / não funcionou + a mensagem**. O Codex e o Antigravity não têm OAuth documentado: se falharem, a view marca o bloco como "ainda não suportado" e o README explica o motivo — não prometer o que não foi visto funcionar.

- [ ] **Step 3: Documentação**

- `mcp-server-niso/README.md`: seção "Servidor remoto (recomendado para consultor)" com o endereço e os trechos validados no Step 2; o servidor local fica para integrações e auditor.
- `AGENTS.md`, em "Stack": `/mcp` (MCP remoto, `src/mcp/`), `/oauth/*` (`src/routes/oauth-autorizacao.ts`), principal agente (`src/middleware/agente.ts`), tabela `agente_concessoes`, KV `OAUTH_KV`; e a regra: só `ROTAS_OAUTH` passam pelo `OAuthProvider`.

- [ ] **Step 4: Suíte completa**

Run: `npx vitest run` e `cd frontend && npx vitest run`
Expected: só as falhas de base conhecidas (`public-otp`, `reconcile-prod`, `migration-0021` no backend; `recursos-existem` só localmente).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/conectar-agente.js frontend/src/router.js frontend/login.html frontend/src/globals.js frontend/src/main.js mcp-server-niso/README.md AGENTS.md
git commit -m "feat(agentes): tela Conectar agente e documentacao do MCP remoto"
```

---

## Antes do deploy

1. `npm run db:backup`.
2. Aplicar a migration **0034** em produção pelo workflow `db-migrate.yml` (o `deploy.yml` recusa com migration pendente).
3. Criar o KV `OAUTH_KV` de produção (Task 3, Step 1) — o id precisa estar no `wrangler.jsonc` do merge.
4. Depois do deploy: `curl -s https://niso.ness.com.br/.well-known/oauth-authorization-server` devolve os metadados; `curl -s -X POST https://niso.ness.com.br/mcp` devolve 401 com `WWW-Authenticate: Bearer`.
