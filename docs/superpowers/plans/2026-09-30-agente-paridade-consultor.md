# Agente com paridade de consultor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente do MCP remoto lê e grava tudo o que o consultor humano faz, preso ao projeto da conexão, com confirmação para apagar e gerar em lote.

**Architecture:** O principal do agente continua `role: 'client'` + `client_project_id` (é isso que todo o isolamento de tenant da app usa). `resolverAgente` troca as recusas fixas de DELETE/lote por exigência de confirmação e ganha uma lista de rotas fora do alcance. O servidor MCP remoto ganha `niso_ler` e `niso_executar`, genéricas, que passam pelo mesmo `app.fetch` interno.

**Tech Stack:** Cloudflare Workers, Hono 4.13, D1, `@modelcontextprotocol/server` 2.0, vitest + `cloudflare:test` (D1 real).

**Spec:** `docs/superpowers/specs/2026-09-30-agente-paridade-consultor-design.md`

## Global Constraints

- Comentário, mensagem de erro e texto ao modelo em PT-BR; código em inglês ou português como o arquivo vizinho.
- `INSTRUCOES` (src/mcp/contexto.ts) ≤ 2048 caracteres (teste existente em `test/mcp-remoto.test.ts`).
- Caminho de agente é avaliado DECODIFICADO (`c.req.path`) — nunca o cru (achado de revisão anterior).
- Cabeçalho de confirmação: `X-Agente-Confirmado: 1`, lido só dentro de `resolverAgente` (só roda com `env.AGENTE`).
- Teste de banco: D1 real do `cloudflare:test`, nunca mock.
- Verificação: rodar vitest e conferir **exit code** e ausência de "Unhandled", não só "N passed".
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Recurso de outro projeto por id direto (`/api/v1/evidence/<id de B>`, `/api/v1/risks/<id de B>`) — deve dar 403/404, nunca 200. Coberto na Task 1.
2. Listagens globais (`/api/v1/portfolio`, `/api/v1/projects`, `/api/v1/controls`) — só o projeto A aparece. Coberto na Task 1.
3. `X-Agente-Confirmado` vindo de fora (sessão humana, chave de API) não pode destravar nada — é inerte. Coberto na Task 1.
4. Resposta enorme em `niso_ler` (trilha, dossiê) — cortar em 100.000 caracteres com aviso, não estourar o contexto do modelo. Coberto na Task 2.
5. `confirmado_pelo_usuario` como string `"true"` — não conta como confirmação (só booleano `true`). Coberto na Task 2.

---

### Task 1: Principal do agente — confirmação, recusas, marca de agente

**Files:**
- Modify: `src/middleware/agente.ts` (resolverAgente, concessaoValida)
- Modify: `src/index.ts:114-125` (tipo `Variables['user']`: campo `agente?: boolean`)
- Modify: `src/routes/data-subject.ts:20-25` (aceita agente)
- Modify: `src/routes/evidence.ts:105-118` (trilha da exclusão com project_id)
- Modify: `test/agente-principal.test.ts` (testes "não apaga nada" e "não gera em lote" passam a exigir confirmação)
- Create: `test/agente-paridade.test.ts`

**Interfaces:**
- Produces: `export const CABECALHO_CONFIRMADO = 'X-Agente-Confirmado'` em `src/middleware/agente.ts` (Task 2 importa).
- Produces: principal do agente `{ id, email: 'agente de <email> (<cliente> / <projeto>)', role: 'client', client_project_id, agente: true }`.

- [ ] **Step 1: Escrever o teste que falha** — `test/agente-paridade.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/** Spec 2026-09-30-agente-paridade-consultor: paridade de consultor, preso a UM projeto. */
const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: P } as any);
const confirmado = { 'X-Agente-Confirmado': '1' };
const json = { 'Content-Type': 'application/json' };

describe('Agente com paridade de consultor, preso ao projeto', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-a','Cliente A','SGSI A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, project_name, standards, org_role, status) VALUES ('p-b','Cliente B','SGSI B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a','p-a','Servidor','Queda'), ('r-a2','p-a','Banco','Vazamento'), ('r-b','p-b','Segredo de B','Vazamento')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-b','p-b','b.md','evidence/p-b/b.md','h','x')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctl-a','p-a','ISO 27001','Controle A','Missing'), ('ctl-b','p-b','ISO 27001','Controle B','Missing')`),
    ]);
  });

  it('apagar sem confirmação é recusado e explica o que fazer', async () => {
    const r = await comoAgente('/api/v1/risks/r-a', { method: 'DELETE' });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('confirmado_pelo_usuario');
  });

  it('apagar com confirmação apaga, e a trilha leva o projeto e o agente', async () => {
    const r = await comoAgente('/api/v1/risks/r-a2', { method: 'DELETE', headers: confirmado });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a2'`).first()).toBeNull();
  });

  it('gerar em lote sem confirmação é recusado', async () => {
    const r = await comoAgente('/api/v1/projects/p-a/generate-policies-bulk', { method: 'POST', headers: json, body: '{}' });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('confirmado_pelo_usuario');
  });

  it('recurso de outro projeto por id direto: nem lendo, nem apagando com confirmação', async () => {
    expect((await comoAgente('/api/v1/evidence/ev-b/content')).status).toBe(403);
    expect((await comoAgente('/api/v1/risks/r-b', { method: 'DELETE', headers: confirmado })).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-b'`).first()).not.toBeNull();
    expect((await comoAgente('/api/v1/projects/p-b/risks')).status).toBe(403);
  });

  it('listagens globais só mostram o projeto da conexão', async () => {
    for (const caminho of ['/api/v1/portfolio', '/api/v1/projects', '/api/v1/controls']) {
      const r = await comoAgente(caminho);
      const texto = await r.text();
      expect(r.status, caminho).toBe(200);
      expect(texto, caminho).not.toContain('p-b');
      expect(texto, caminho).not.toContain('Cliente B');
    }
  });

  it('rotas fora do alcance são recusadas mesmo com confirmação', async () => {
    for (const [metodo, caminho] of [
      ['GET', '/api/v1/users'],
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/dashboard'],
      ['GET', '/api/v1/assessments'],
      ['GET', '/api/v1/leads'],
      ['GET', '/api/v1/proposals'],
      ['GET', '/api/v1/projects/p-a/sso'],
      ['PUT', '/api/v1/projects/p-a/security-policy'],
      ['POST', '/api/v1/projects/p-a/scim-token'],
      ['GET', '/api/v1/projects/p-a/api-keys'],
      ['GET', '/api/v1/projects/p-a/webhooks'],
      ['GET', '/api/v1/projects/p-a/agentes'],
    ] as const) {
      const r = await comoAgente(caminho, { method: metodo, headers: { ...confirmado, ...json }, body: metodo === 'GET' ? undefined : '{}' });
      expect(r.status, `${metodo} ${caminho}`).toBe(403);
    }
  });

  it('escrita de auditor continua recusada', async () => {
    const r = await comoAgente('/api/v1/audits/x/findings', { method: 'POST', headers: { ...confirmado, ...json }, body: '{}' });
    expect(r.status).toBe(403);
  });

  it('o cabeçalho de confirmação é inerte fora do agente', async () => {
    const sid = await sessionFor({ id: 'u-cli', email: 'cli@a.lat', role: 'org_user', client_project_id: 'p-a' });
    const r = await worker.fetch(new Request('http://localhost/api/v1/risks/r-a', { method: 'DELETE', headers: { 'X-Session-ID': sid, ...confirmado } }), workerEnv() as any);
    expect(r.status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).not.toBeNull();
  });

  it('direitos do titular: agente alcança o próprio projeto, não o outro', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/data-subject?email=x@y.lat')).status).not.toBe(403);
    expect((await comoAgente('/api/v1/projects/p-b/data-subject?email=x@y.lat')).status).toBe(403);
  });

  it('a trilha nomeia agente, cliente e projeto', async () => {
    await comoAgente('/api/v1/projects/p-a/risks', { method: 'POST', headers: json, body: JSON.stringify({ asset: 'Rede', threat: 'Intrusão' }) });
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE actor LIKE 'agente de%' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(log?.actor).toBe('agente de cons@ness.lat (Cliente A / SGSI A)');
  });
});
```

Antes de rodar, confira em `test/helpers/d1.ts` a assinatura de `sessionFor` e em `src/routes/data-subject.ts` o parâmetro que a rota GET espera (email na query ou outro); ajuste só a URL do teste de titular se o nome do parâmetro for outro — o que o teste afirma é "não 403 em A, 403 em B".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/agente-paridade.test.ts`
Expected: FAIL — "apagar com confirmação" dá 403 (DELETE sempre recusado hoje), rotas de configuração dão 200, titular dá 403 em A, actor sem "/ SGSI A".

- [ ] **Step 3: Implementar em `src/middleware/agente.ts`**

Em `concessaoValida`, trazer o nome do projeto:

```ts
export async function concessaoValida(
  db: D1Database,
  p: PropsAgente
): Promise<{ email: string; client_name: string; project_name: string } | null> {
  const row = await db.prepare(
    `SELECT u.email, u.role, u.ativo, ${NOME_CLIENTE_SQL} AS client_name,
            COALESCE(NULLIF(trim(p.project_name), ''), p.id) AS project_name
       FROM agente_concessoes ac
       JOIN users u ON u.id = ac.user_id
       JOIN projects p ON p.id = ac.project_id
      WHERE ac.id = ? AND ac.user_id = ? AND ac.project_id = ?
        AND ac.revogado_em IS NULL AND ac.expira_em > datetime('now')`
  ).bind(p.concessaoId, p.userId, p.projectId).first<{ email: string; role: string; ativo: number | null; client_name: string; project_name: string }>();
  if (!row || row.ativo === 0 || (row.role !== 'consultor' && row.role !== 'consultant')) return null;

  const designado = await db.prepare(
    `SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = lower(?) AND role_category = 'consultor'`
  ).bind(p.projectId, row.email).first();
  return designado ? { email: row.email, client_name: row.client_name, project_name: row.project_name } : null;
}
```

Acima de `resolverAgente`, as constantes:

```ts
/** Só `resolverAgente` lê; ele só roda com `env.AGENTE`, então de fora o cabeçalho é inerte. */
export const CABECALHO_CONFIRMADO = 'X-Agente-Confirmado';

/**
 * O consultor humano alcança estas rotas; o agente não. Não são documento nem
 * achado do SGSI: são controle de acesso, configuração de segurança do cliente,
 * visão de todos os clientes ou a área comercial. O agente não amplia o próprio
 * acesso nem enxerga fora do projeto.
 */
const FORA_DO_AGENTE: Array<[RegExp, string]> = [
  [/^\/api\/v1\/(users|admin\/users)(\/|$)/, 'gestão de usuários'],
  [/^\/api\/v1\/dashboard(\/|$)/, 'o painel global agrega todos os clientes'],
  [/^\/api\/v1\/(assessments|leads|proposals)(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/projects\/[^/]+\/(sso|security-policy|scim-token|api-keys|webhooks)(\/|$)/, 'configuração de segurança do cliente'],
  [/\/agentes(\/|$)/, 'o agente não gere o próprio acesso'],
];
```

Em `resolverAgente`, substituir as três linhas de recusa (DELETE, `generate-policies-bulk`, `/agentes`) por:

```ts
  for (const [re, motivo] of FORA_DO_AGENTE) {
    if (re.test(path)) return c.json({ error: `Forbidden: fora do alcance do agente (${motivo}) — use a interface` }, 403);
  }
  // Paridade com o consultor, com a mesma confirmação que a interface pede.
  const destrutiva = method === 'DELETE' || path.endsWith('/generate-policies-bulk');
  if (destrutiva && c.req.header(CABECALHO_CONFIRMADO) !== '1') {
    return c.json({ error: 'Forbidden: apagar e gerar em lote exigem confirmação — mostre ao usuário o que será feito, espere o "sim" e reenvie com confirmado_pelo_usuario: true' }, 403);
  }
```

E o retorno:

```ts
  return {
    id: p.userId,
    email: `agente de ${row.email} (${row.client_name} / ${row.project_name})`,
    role: 'client',
    client_project_id: p.projectId,
    agente: true,
  };
```

Atualizar o comentário do topo do bloco ("Proporcionalidade: o agente escreve adequação, não destrói...") para: "Paridade com o consultor, preso ao projeto: `role: 'client'` + `client_project_id` herda o isolamento de tenant; o que é destrutivo exige confirmação."

- [ ] **Step 4: `src/index.ts`** — no tipo `user` de `Variables`, depois de `client_project_id`:

```ts
    /** Principal do agente MCP (middleware/agente.ts): paridade de consultor, preso ao projeto. */
    agente?: boolean;
```

- [ ] **Step 5: `src/routes/data-subject.ts`**

```ts
/** Requisição de titular expõe PII: papel read-only não pode executar. O agente
 *  tem paridade de consultor, preso ao projeto pelo projectAccessMiddleware. */
function autorizado(c: any): boolean {
  const u = c.get('user');
  return PAPEIS_AUTORIZADOS.includes(u?.role) || u?.agente === true;
}
```

- [ ] **Step 6: `src/routes/evidence.ts`** — na exclusão, trilha com projeto:

```ts
    const ev = await c.env.DB.prepare('SELECT file_name, r2_key, project_id FROM evidence WHERE id = ?').bind(id).first<any>();
    ...
    await logAudit(c.env.DB, 'evidence.deleted', c.get('user')?.email ?? 'system', `Evidência ${ev.file_name} excluída permanentemente.`, '', '', ev.project_id);
```

- [ ] **Step 7: Atualizar `test/agente-principal.test.ts`** — renomear e ajustar os dois testes antigos:

```ts
  it('não apaga sem confirmação', async () => {
    expect((await comoAgente('/api/v1/projects/p-a/risks/qualquer', { method: 'DELETE' })).status).toBe(403);
  });

  it('não gera políticas em lote sem confirmação', async () => {
    const res = await comoAgente('/api/v1/projects/p-a/generate-policies-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });
```

Os testes de caminho percent-encoded (`%67enerate-policies-bulk`, `%61gentes`) ficam como estão: sem confirmação continuam 403.

- [ ] **Step 8: Rodar**

Run: `npx vitest run test/agente-paridade.test.ts test/agente-principal.test.ts test/agentes-acesso.test.ts test/mcp-remoto.test.ts test/data-subject*.test.ts`
Expected: exit 0, nenhum "Unhandled". Se `mcp-remoto.test.ts` afirmar o texto antigo do actor (`agente de x (Cliente)`), atualize para o formato novo `(cliente / projeto)`.

- [ ] **Step 9: Commit**

```bash
git add src/middleware/agente.ts src/index.ts src/routes/data-subject.ts src/routes/evidence.ts test/agente-paridade.test.ts test/agente-principal.test.ts test/mcp-remoto.test.ts
git commit -m "feat(agente): paridade de consultor preso ao projeto; apagar e lote com confirmação

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Ferramentas genéricas `niso_ler` e `niso_executar`

**Files:**
- Modify: `src/mcp/servidor.ts`
- Create: `test/helpers/mcp-agente.ts`
- Create: `test/agente-ferramentas-genericas.test.ts`

**Interfaces:**
- Consumes: `CABECALHO_CONFIRMADO` de `src/middleware/agente.ts` (Task 1).
- Produces: ferramentas `niso_ler({ caminho })` e `niso_executar({ metodo, caminho, corpo?, confirmado_pelo_usuario? })` na lista do `/mcp` remoto.

- [ ] **Step 1: Helper de teste** — `test/helpers/mcp-agente.ts`, com o fluxo OAuth e o `rpc` copiados de `test/mcp-remoto.test.ts` (linhas 8-58) e parametrizados:

```ts
import { createExecutionContext } from 'cloudflare:test';
import worker from '../../src/index';
import { workerEnv } from './d1';

export const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
export const f = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request(BASE + caminho, init), workerEnv() as any, createExecutionContext());
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

/** Faz o OAuth completo como o consultor e escolhe `projeto`. Senha: senha-forte-123. */
export async function tokenDoAgente(email: string, projeto: string): Promise<string> {
  const reg = await (await f('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: `${BASE}/mcp` });
  const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
  await f('/oauth/authorize/entrar', form({ pedido, email, senha: 'senha-forte-123', codigo: '' }));
  const destino = (await (await f('/oauth/authorize/confirmar', form({ pedido, projeto }))).text()).match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
  const code = new URL(destino).searchParams.get('code')!;
  const tok = await (await f('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }).toString() })).json<any>();
  return tok.access_token;
}

/** tools/call e devolve o `result` (lida com resposta JSON ou SSE). */
export async function chamarFerramenta(token: string, name: string, args: unknown): Promise<{ isError?: boolean; content: { type: string; text: string }[] }> {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const texto = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${texto}`);
  const corpo = r.headers.get('Content-Type')?.includes('text/event-stream')
    ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6)
    : texto;
  return JSON.parse(corpo).result;
}
```

- [ ] **Step 2: Escrever o teste que falha** — `test/agente-ferramentas-genericas.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';

describe('niso_ler / niso_executar', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Cliente B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i-1','p-a','governanca','Existe PSI?','Sim, v2')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a','p-a','Servidor','Queda'), ('r-b','p-b','Segredo de B','Vazamento')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-txt','p-a','nota.md','evidence/p-a/nota.md','h','x'), ('ev-pdf','p-a','laudo.pdf','evidence/p-a/laudo.pdf','h','x')`),
    ]);
    await env.STORAGE.put('evidence/p-a/nota.md', 'Texto da evidência');
    await env.STORAGE.put('evidence/p-a/laudo.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), { httpMetadata: { contentType: 'application/pdf' } });
    token = await tokenDoAgente('cons@ness.lat', 'p-a');
  });

  it('lê trilha de entrevista e conteúdo de evidência de texto', async () => {
    const trilha = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-a/interviews/governanca' });
    expect(trilha.isError).toBeFalsy();
    expect(trilha.content[0].text).toContain('Existe PSI?');
    const ev = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/evidence/ev-txt/content' });
    expect(ev.content[0].text).toContain('Texto da evidência');
  });

  it('binário volta como metadados, não bytes', async () => {
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/evidence/ev-pdf/download' });
    expect(r.content[0].text).toContain('binário');
    expect(r.content[0].text).not.toContain('%PDF');
  });

  it('não lê outro projeto', async () => {
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-b/risks' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).not.toContain('Segredo de B');
  });

  it('apagar exige confirmado_pelo_usuario booleano', async () => {
    const semConfirmar = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a' });
    expect(semConfirmar.isError).toBe(true);
    const string = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a', confirmado_pelo_usuario: 'true' });
    expect(string.isError).toBe(true);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).not.toBeNull();
    const ok = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a', confirmado_pelo_usuario: true });
    expect(ok.isError, ok.content[0].text).toBeFalsy();
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).toBeNull();
  });

  it('grava com POST', async () => {
    const r = await chamarFerramenta(token, 'niso_executar', { metodo: 'POST', caminho: '/api/v1/projects/p-a/risks', corpo: { asset: 'Rede', threat: 'Intrusão' } });
    expect(r.isError, r.content[0].text).toBeFalsy();
  });

  it('método inválido é recusado sem chamar a API', async () => {
    const r = await chamarFerramenta(token, 'niso_executar', { metodo: 'GET', caminho: '/api/v1/projects/p-a/risks' });
    expect(r.isError).toBe(true);
  });

  it('resposta enorme é cortada com aviso', async () => {
    const grande = 'x'.repeat(150_000);
    await env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i-g','p-a','grande','Q',?)`).bind(grande).run();
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-a/interviews/grande' });
    expect(r.content[0].text.length).toBeLessThan(101_000);
    expect(r.content[0].text).toContain('cortada');
  });
});
```

Antes de rodar, confira em `schema.sql` as colunas NOT NULL de `project_interviews` e ajuste o INSERT se faltar alguma.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/agente-ferramentas-genericas.test.ts`
Expected: FAIL — "Ferramenta niso_ler indisponível para o agente consultor".

- [ ] **Step 4: Implementar em `src/mcp/servidor.ts`**

Import: `import { concessaoValida, CABECALHO_CONFIRMADO, type PropsAgente } from '../middleware/agente';`

Depois de `CONTEXTO`, as definições:

```ts
const GENERICAS: Ferramenta[] = [
  {
    name: 'niso_ler',
    description:
      'Lê qualquer área do projeto desta conexão, como o consultor vê na interface. caminho começa com /api/v1/ — o mapa das áreas está em niso_contexto. Arquivo binário (PDF, planilha, imagem) volta só como metadados.',
    inputSchema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'] },
  },
  {
    name: 'niso_executar',
    description:
      'Grava no projeto desta conexão, como o consultor faria na interface: POST, PUT, PATCH ou DELETE em /api/v1/... Apagar e gerar em lote exigem confirmado_pelo_usuario: true — antes, mostre ao usuário o que será feito (nome e id) e espere o "sim".',
    inputSchema: {
      type: 'object',
      properties: {
        metodo: { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
        caminho: { type: 'string' },
        corpo: { type: 'object' },
        confirmado_pelo_usuario: { type: 'boolean' },
      },
      required: ['metodo', 'caminho'],
    },
  },
];
/** Teto do texto devolvido ao modelo: trilha e dossiê podem ter megabytes. */
const LIMITE_TEXTO = 100_000;
```

Incluir em `DISPONIVEIS`: `[CONTEXTO, ...GENERICAS, ...TOOLS.filter(...)]`.

Extrair a requisição crua de `transporteInterno` para uma função própria, e fazer `transporteInterno` usá-la (comportamento das ferramentas tipadas inalterado):

```ts
type Bruto = (path: string, init: RequestInit) => Promise<Response>;

function requisicaoInterna(origem: Request, env: any, ctx: any, props: PropsAgente, fetchHono: FetchHono): Bruto {
  const base = new URL(origem.url).origin;
  // Espalhar o env preserva os bindings (DB, SESSIONS, STORAGE...): são
  // propriedades próprias e enumeráveis do objeto env no workerd.
  const envAgente = { ...env, AGENTE: props };
  // Allowlist de IP do tenant avalia o IP real do cliente MCP.
  const ip = origem.headers.get('CF-Connecting-IP');
  return async (path, init) => {
    if (!caminhoSeguro(base, path)) throw new Error('caminho de API recusado (id com caractere inválido)');
    const headers = new Headers(init.headers);
    if (ip) headers.set('CF-Connecting-IP', ip);
    return fetchHono(new Request(base + path, { ...init, headers }), envAgente, ctx);
  };
}

function transporteInterno(bruto: Bruto): Transporte {
  const chamar = async (path: string, init: RequestInit) => {
    const r = await bruto(path, init);
    const texto = await r.text();
    // ... (resto do `chamar` atual, sem mudança)
  };
  // ... (return atual, sem mudança)
}
```

A função das genéricas:

```ts
async function genericas(nome: string, args: any, bruto: Bruto): Promise<CallToolResult> {
  const falha = (texto: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: texto }] });
  const caminho = typeof args?.caminho === 'string' ? args.caminho : '';
  const metodo = nome === 'niso_ler' ? 'GET' : String(args?.metodo ?? '').toUpperCase();
  if (nome === 'niso_executar' && !['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
    return falha('metodo deve ser POST, PUT, PATCH ou DELETE (para ler, use niso_ler)');
  }
  const headers = new Headers();
  const temCorpo = nome === 'niso_executar' && args?.corpo !== undefined;
  if (temCorpo) headers.set('Content-Type', 'application/json');
  // Só o booleano true confirma: "true" em texto é engano do modelo, não o "sim" do usuário.
  if (args?.confirmado_pelo_usuario === true) headers.set(CABECALHO_CONFIRMADO, '1');
  const r = await bruto(caminho, { method: metodo, headers, body: temCorpo ? JSON.stringify(args.corpo) : undefined });
  const tipo = r.headers.get('Content-Type') ?? '';
  if (/json|^text\//i.test(tipo)) {
    let texto = await r.text();
    if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO) + `\n[resposta cortada em ${LIMITE_TEXTO} caracteres: filtre ou peça por item]`;
    return { isError: !r.ok, content: [{ type: 'text', text: `HTTP ${r.status}\n${texto}` }] };
  }
  const tamanho = (await r.arrayBuffer()).byteLength;
  return { isError: !r.ok, content: [{ type: 'text', text: JSON.stringify({ status: r.status, tipo, tamanho, observacao: 'binário: abra na interface' }) }] };
}
```

No `handlerMcp`: `const bruto = requisicaoInterna(req, env, ctx, props, fetchHono); const t = transporteInterno(bruto);` e, no `tools/call`, depois do bloco de `niso_contexto`:

```ts
        if (name === 'niso_ler' || name === 'niso_executar') return await genericas(name, args, bruto);
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run test/agente-ferramentas-genericas.test.ts test/mcp-remoto.test.ts test/agente-gap-traceability.test.ts test/contrato-mcp.test.ts`
Expected: exit 0, nenhum "Unhandled". Se `mcp-remoto.test.ts` contar as ferramentas listadas, some 2.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/servidor.ts test/helpers/mcp-agente.ts test/agente-ferramentas-genericas.test.ts test/mcp-remoto.test.ts
git commit -m "feat(agente): niso_ler e niso_executar no MCP remoto

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mapa da app no contexto, instruções novas e rota de resumo de entrevistas

**Files:**
- Modify: `src/mcp/contexto.ts`
- Modify: `src/routes/projects.ts:558-592` (ordem das rotas de entrevistas)
- Modify: `test/mcp-remoto.test.ts` (se afirmar o texto antigo de "Não pode")
- Create: `test/entrevistas-resumo.test.ts`

**Interfaces:**
- Consumes: nomes `niso_ler`, `niso_executar` (Task 2).
- Produces: `export const MAPA_DA_APP: string` em `src/mcp/contexto.ts`.

- [ ] **Step 1: Teste que falha para o resumo** — `test/entrevistas-resumo.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { MAPA_DA_APP, INSTRUCOES } from '../src/mcp/contexto';

const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (caminho: string) =>
  worker.fetch(new Request('http://localhost' + caminho), { ...workerEnv(), AGENTE: P } as any);

describe('Resumo das entrevistas e mapa da app', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer, gap_detected) VALUES ('i-1','p-a','governanca','Q1','R1',1), ('i-2','p-a','governanca','Q2','R2',0)`),
    ]);
  });

  // `/interviews/:track` era declarada antes e capturava "summary" como trilha.
  it('GET /interviews/summary devolve o resumo por trilha', async () => {
    const r = await comoAgente('/api/v1/projects/p-a/interviews/summary');
    const corpo = await r.json<any>();
    expect(corpo.summary).toEqual([{ track: 'governanca', total: 2, gaps: 1 }]);
  });

  it('o mapa cobre as áreas do consultor e não a comercial', () => {
    for (const area of ['interviews', 'phase-answers', 'journey-dossier', 'versions', '/content', 'ropa', 'dpia', 'assets', 'vendors', 'training', 'audits', 'capa', 'stakeholders', 'management-reviews', 'certification', 'scope-changes', 'data-subject']) {
      expect(MAPA_DA_APP, area).toContain(area);
    }
    expect(MAPA_DA_APP).not.toMatch(/leads|proposals|assessments/);
  });

  it('instruções refletem a paridade e cabem no limite', () => {
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
    expect(INSTRUCOES).toContain('confirmado_pelo_usuario');
    expect(INSTRUCOES).not.toContain('Não apaga registros');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/entrevistas-resumo.test.ts`
Expected: FAIL — `summary` indefinido (a rota devolve `{ interviews: [] }`) e `MAPA_DA_APP` não exportado.

- [ ] **Step 3: `src/routes/projects.ts`** — mover o bloco `projectsApp.get('/:id/interviews/summary', ...)` inteiro para ANTES de `projectsApp.get('/:id/interviews/:track', ...)`, com o comentário:

```ts
// Antes de `/interviews/:track`: o Hono casa na ordem de registro, e a rota com
// parâmetro capturava "summary" como nome de trilha.
```

- [ ] **Step 4: `src/mcp/contexto.ts`** — trocar `INSTRUCOES`, acrescentar `MAPA_DA_APP` e ajustar `montarContexto`:

```ts
/** Texto do handshake: curto (≤ 2048, limite do Claude Code), aponta para niso_contexto. */
export const INSTRUCOES =
  'Você é o agente CONSULTOR do n.iso (adequação ISO 27001/27701), preso a UM projeto escolhido no login. ' +
  'Comece SEMPRE chamando niso_contexto: ela diz o cliente, o projectId, o mapa da app e os roteiros de trabalho. ' +
  'Você tem o mesmo alcance do consultor humano neste projeto: lê tudo com niso_ler e grava com niso_executar ou com as ferramentas específicas. ' +
  'Apagar e gerar em lote: mostre ao usuário o que será feito e só envie com confirmado_pelo_usuario: true depois do "sim". ' +
  'Não registra achado de auditoria (ISO 27001, 9.2: quem implementa não audita). ' +
  'Rascunho de IA é rascunho até revisão humana: peça aprovação antes de gravar.';

/** Onde está cada coisa. {p} = projectId. Leitura com niso_ler; escrita com niso_executar. */
export const MAPA_DA_APP = `Mapa da app ({p} = projectId):
- Projeto e fases: /api/v1/projects/{p} · /api/v1/projects/{p}/phases · /api/v1/projects/{p}/checklist-progress
- Trilhas de entrevista: /api/v1/projects/{p}/interviews/summary · /api/v1/projects/{p}/interviews/{trilha} (POST /api/v1/projects/{p}/interviews grava)
- Respostas das fases: /api/v1/projects/{p}/phase-answers · dossiê da jornada: /api/v1/projects/{p}/journey-dossier
- Controles e SoA: /api/v1/projects/{p}/controls · versões de política do controle: /api/v1/projects/{p}/controls/{controle}/versions
- Evidências: /api/v1/projects/{p}/evidence · texto: /api/v1/evidence/{id}/content (PUT regrava o texto)
- Riscos: /api/v1/projects/{p}/risks · /api/v1/projects/{p}/risk-matrix · /api/v1/projects/{p}/risks/history
- Ativos: /api/v1/projects/{p}/assets · Fornecedores: /api/v1/projects/{p}/vendors · Treinamento: /api/v1/projects/{p}/training
- Privacidade: /api/v1/projects/{p}/ropa · /api/v1/projects/{p}/dpia · direitos do titular: /api/v1/projects/{p}/data-subject
- Auditorias: /api/v1/projects/{p}/audits · achados: /api/v1/audits/{id}/findings (só leitura) · CAPA: /api/v1/projects/{p}/capa
- Governança: /api/v1/projects/{p}/governance · /api/v1/projects/{p}/stakeholders · /api/v1/projects/{p}/context · /api/v1/projects/{p}/management-reviews · /api/v1/projects/{p}/metrics · /api/v1/projects/{p}/policy-acknowledgments
- Certificação: /api/v1/projects/{p}/certification · mudanças de escopo: /api/v1/projects/{p}/scope-changes
- Diagnóstico: /api/v1/projects/{p}/gap-analysis · /api/v1/projects/{p}/traceability · /api/v1/projects/{p}/coherence · /api/v1/projects/{p}/audit-pack
Fora do seu alcance (use a interface): usuários, SSO, chaves de API, webhooks, painel global e área comercial.`;
```

Em `montarContexto`, trocar as linhas "Pode:"/"Não pode:" e incluir o mapa:

```ts
    'Pode: tudo o que o consultor humano faz neste projeto — ler e gravar política, SoA, evidência (texto), controle, ativo, risco, entrevista, ROPA, DPIA, governança; responder nota de auditoria.',
    'Com confirmação do usuário (confirmado_pelo_usuario: true): apagar; gerar políticas em lote.',
    'Não pode: registrar achado de auditoria; sair deste projeto.',
    'O administrador do cliente vê este acesso e pode revogá-lo a qualquer momento.',
    '',
    MAPA_DA_APP.replaceAll('{p}', projeto.id),
    '',
    ROTEIROS,
```

Antes de gravar o mapa, confira cada caminho com `grep -rn "get('/:id/<área>\|get('/projects/:id/<área>" src/routes` (as rotas de governança estão em `src/routes/governance.ts` montado em `/api/v1`, as de entrevista em `src/routes/projects.ts`). Caminho que não existir sai do mapa — o teste do Step 1 afirma só as áreas que existem hoje; se uma delas não existir, remova-a do teste e do mapa e registre no relatório.

- [ ] **Step 5: Rodar**

Run: `npx vitest run test/entrevistas-resumo.test.ts test/mcp-remoto.test.ts`
Expected: exit 0. Se `mcp-remoto.test.ts` afirmar o texto antigo ("Não apaga registros" ou "Não pode: apagar"), atualize para o novo.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/contexto.ts src/routes/projects.ts test/entrevistas-resumo.test.ts test/mcp-remoto.test.ts
git commit -m "feat(agente): mapa da app no contexto; resumo de entrevistas volta a responder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Documentação e verificação final

**Files:**
- Modify: `mcp-server-niso/README.md` (seção do MCP remoto)
- Modify: `AGENTS.md` (Schema: última migration; seção MCP)

- [ ] **Step 1: `mcp-server-niso/README.md`** — na seção do servidor remoto, substituir a descrição de alcance por: "O agente remoto tem o alcance do consultor humano no projeto escolhido no login: lê qualquer área com `niso_ler` e grava com `niso_executar` ou com as ferramentas específicas. Apagar e gerar em lote exigem `confirmado_pelo_usuario: true`, que o agente só envia depois de mostrar o que será feito e receber o 'sim'. Fora do alcance: usuários, SSO, chaves de API, webhooks, painel global, área comercial e registro de achado de auditoria. Para outro projeto, refaça o login." Se não houver seção do remoto, crie-a com esse texto sob o título `## Servidor remoto (/mcp)`.

- [ ] **Step 2: `AGENTS.md`** — na linha do Schema, trocar "ultima a **0020**" por "ultima a **0034**"; no item **MCP** da Stack, acrescentar: "Remoto em `/mcp` (OAuth, `src/mcp/servidor.ts`): agente com alcance de consultor preso a um projeto; principal em `src/middleware/agente.ts`."

- [ ] **Step 3: Verificação**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npm test` → Expected: sem falha nova. Falhas locais conhecidas e fora do escopo: `migration-0021` e `reconcile-prod` (CRLF), e testes de lockout/MFA por timeout sob carga — confirme que falham igual em `origin/main` antes de ignorar.

- [ ] **Step 4: Commit**

```bash
git add mcp-server-niso/README.md AGENTS.md
git commit -m "docs(agente): alcance de consultor no MCP remoto; AGENTS.md na migration 0034

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Fora do repositório, depois do merge (controlador faz, não o implementador): em no `CLAUDE.md` da pasta de trabalho do cliente, trocar "Você não apaga, não gera em lote e não registra achado de auditoria" por "Apagar e gerar em lote: mostre o que será feito e espere meu 'sim' antes. Achado de auditoria você não registra."
