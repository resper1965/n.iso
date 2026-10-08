# P5 — Portal mínimo do auditor externo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a consultoria gera, lista e revoga pela tela do projeto um link com prazo, e o auditor do organismo certificador abre esse link e vê a SoA com a evidência de cada controle, baixa os arquivos e a prova dos pedidos, sem conta no produto.

**Architecture:** o token passa a ser guardado só em SHA-256 (migration 0045, com revogação e prazo comparado por `datetime()`), e o portal sai do caminho `/api/v1/auditor/:token/*` (token em log de requisição) para `POST /api/v1/public/auditor/*` com o token no corpo, montado antes do `authMiddleware`, no mesmo desenho de `public-pedidos.ts`. A tela da consultoria é um cartão na tela de Auditorias; a página do auditor é `frontend/public/auditor.html` + `auditor.js` + `auditor.css`, servida como `proposta.html`, com o token no fragmento.

**Tech Stack:** Cloudflare Workers (Hono) + D1 + R2; frontend Vanilla JS (Vite para `src/`, `public/` copiado como está); Vitest (pool de Workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (P5 na seção 2; decisões da seção 3; item 5 do critério de pronto na seção 5).

## Global Constraints

- Ponytail: o menor diff que resolve, reusando `refForaDoProjeto`, `logAudit`, `erro500`, `sha256Hex`, `genToken`, `rateLimitD1`, `ehEquipeNess`, `appUrl`.
- Multi-tenant: toda consulta presa ao projeto do token ou da URL; toda FK que chega no corpo é validada no projeto (`refForaDoProjeto`).
- Código novo sem `any`: `test/any-catraca.test.ts` (TETO 557 na base) reprova se o número subir **e também se descer sem baixar o `TETO`**. As tarefas 1 e 2 removem `any` dos handlers antigos: em cada uma, meça com `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l` e baixe `TETO` para o número medido. Em `catch` use `catch (e) { return erro500(c, '...', e); }`.
- Frontend: CSP `script-src 'self'`, sem handler nem script inline, eventos por `data-action` (app) ou `addEventListener` (página pública), `escapeHTML`/`esc` em todo dado interpolado. Marca: sem itálico, sem emoji/ícone, accent não é fundo de área.
- Arquivos em UTF-8 sem BOM (iconv não existe; confira com `python -c "print(open('<arq>','rb').read(3))"`, que não pode começar com `b'\xef\xbb\xbf'`). `*.sql` em LF.
- Schema muda em `schema.sql` **e** numa migration (`migrations/README.md`). A spec diz que a próxima é a 0045; se P1–P4 já criaram a 0045, use o próximo número livre (`ls migrations/*.sql | tail -1`) e troque o número no nome do arquivo, no teste, no README e no comentário do `schema.sql`. Migration remota é ação do dono, com `npm run db:backup` antes.
- Escrita em produção só com "sim" explícito do dono.
- Rota com corpo nova entra em `src/openapi.ts` e `npm run openapi` regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (os dois vão no commit). Rota DELETE nova seria classificada em `src/trilha-exclusao.ts` (este plano não cria nenhuma).
- Rota nova de escrita: pensar no allow-list de `src/middleware/auth.ts` e em `FORA_DO_AGENTE` (`src/middleware/agente.ts`). A regex `/^\/api\/v1\/projects\/[^/]+\/auditor-token(\/|$)/` já tira do agente MCP tudo o que este plano cria sob `/auditor-token`.
- Testes de backend: `npx vitest run <arq>` na raiz (pool de Workers, D1 real via `cloudflare:test`; helpers em `test/helpers/d1.ts`: `applySchema`, `resetData`, `resetSessions`, `sessionFor`, `designarConsultor`, `workerEnv`). `sessionFor({ id, email, role: 'admin', iat: Date.now() })` dá platform_admin.
- INSERT em `projects` nos testes leva `standards` e `org_role`: `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001:2022','Controller','Active')`.
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads` (jsdom; mock de `api` como em `frontend/test/soa-sem-gerar.test.js`).
- A suíte completa de backend leva ~20 min: cada tarefa roda os testes focados; a suíte inteira só no Fechamento.
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Coordenação: P1 (contrato tela↔API; muda `api()` em `frontend/src/api.js`) e P4 (evidência ligada ao controle, entra `pending`) rodam antes. Este plano assume: evidências novas trazem `control_id` quando há controle, e o teste de contrato de P1 reprova chamada de front sem rota. As respostas novas deste plano não têm `ok: true` (o `api()` atual as devolve inteiras, e o de P1 também), e as chamadas do front usam o caminho literal em template string, que é o que um leitor de fonte acha.

## Decisões para o dono revisar

1. **Token em hash; a 0045 apaga os tokens existentes.** SQLite não calcula SHA-256, então token em claro não migra. Produção tinha 0 linhas em `auditor_tokens` em 2026-10-07 (spec, seção 1). Custo se errado: link emitido antes do deploy deixa de abrir e o consultor gera outro.
2. **Rotas `/api/v1/auditor/:token/*` removidas**, substituídas por `POST /api/v1/public/auditor/{ver,evidencia,pedidos,notas,notas/criar}` com o token no corpo. Custo se errado: integração externa que chamasse as rotas antigas quebra (0 tokens em produção; a ferramenta MCP `niso_create_auditor_note` é atualizada na Task 2).
3. **Gerar, listar e revogar só pela equipe da consultoria** (`consultor`, `consultoria_admin`, `platform_admin`, via `ehEquipeNess`). Hoje o `org_admin` do cliente consegue gerar (a rota não tem guarda de papel). Custo se errado: o cliente que quiser dar o acesso sozinho precisa pedir à consultoria.
4. **Revogar marca `revoked_at`/`revoked_by`**, não apaga: a linha fica para a trilha e sai pela purga de 90 dias depois do vencimento (`src/manutencao.ts`). Custo se errado: nenhum funcional.
5. **Token desconhecido, vencido ou revogado: o mesmo 404 "Link inválido ou expirado"** (antes 401), como `public-pedidos.ts`. Custo se errado: cliente de API que tratava 401 passa a ver 404.
6. **Download pelo portal entra na trilha** (`auditor.evidence_downloaded`, ator `auditor:<id do token>`, com IP). Custo: uma linha em `audit_logs` por download.
7. **Notas do auditor ficam fora da página nesta fatia.** A API continua (movida para o corpo, usada pela ferramenta MCP), mas a consultoria não tem tela para ler e responder notas (`grep -rn "auditor-notes" frontend/src` vazio); um campo na página do auditor criaria pergunta sem resposta. Custo se errado: o auditor pergunta por e-mail até a tela existir.
8. **O portal mostra a descrição do controle só como justificativa da exclusão** (é onde a SoA a guarda, `src/services/soa-logic.ts:52-58`); a descrição de controle aplicável (texto de implementação) não vai ao auditor. Custo se errado: o auditor pede o texto à consultoria.
9. **A página do auditor não é responsiva**: uso esperado em computador; a tabela rola na horizontal. Custo se errado: leitura ruim no celular.

## Achados da spec conferidos

Confirmados no código (base `b8c9ff1` + spec):
- O auditor não tem tela: `grep -rn "auditor" frontend/src` só acha texto de auditoria interna; nenhum consumidor de `/auditor/` ou `auditor-token`.
- A API do auditor vem sem vínculo evidência→controle e sem SoA: `src/routes/platform.ts:593-612` devolve `evidence` sem `control_id` e `compliance_controls` cru.
- `POST /projects/:id/auditor-token` existe (`src/routes/projects.ts:1122-1143`); não existe rota de listar nem de revogar.

Não confirmados ou diferentes do relatado:
- "Download de evidência pelo token em `platform.ts` ~593": não está lá. `platform.ts:593` é `GET /auditor/:token/project`; o download é `src/routes/auditor.ts:147-170`.
- "Notas do auditor" como consumidor do `api()` lendo o campo errado: não existe consumidor de notas do auditor no frontend (`grep -rn "auditor-notes\|auditor/" frontend/src` vazio). Não é campo errado, é tela que não existe (decisão 7). Nenhuma tarefa aqui.

Achados novos (corrigidos neste plano):
- O token é guardado em claro (`auditor_tokens.token`, `schema.sql:406-415`) e copiado em claro para `auditor_notes.auditor_token` (`auditor.ts:43-47`), que `GET /projects/:id/auditor-notes` devolve com `n.*` a qualquer membro do projeto (`auditor.ts:81-95`) e que o export de portabilidade leva (`auditor_notes` não está em `NAO_EXPORTAR`, `src/portabilidade.ts:27-34`).
- O token viaja no caminho da URL (`/api/v1/auditor/:token/*`), que vai para o log de requisição; `public-pedidos.ts:1-5` documenta por que o token tem de ir no corpo.
- O prazo é gravado em ISO 8601 (`projects.ts:1131`, `toISOString()`, ex. `2026-11-06T12:00:00.000Z`) e comparado como texto com `datetime("now")` (`2026-11-06 12:00:00`): no dia do vencimento `'T' > ' '`, então o link vale até o fim do dia UTC.
- `GET /auditor/:token/project` faz `SELECT * FROM projects` (`platform.ts:598`): leva `repository_token` (cifrado), `cnpj` e o resto da linha ao auditor.
- O download monta `Content-Disposition` com o nome cru (`auditor.ts:164`): aspas cortam o nome e caractere fora do Latin-1 (ex. `—`, `“`) derruba a resposta (cabeçalho só aceita ByteString). `evidence.ts:39` já codifica com `encodeURIComponent`.
- A ferramenta MCP `niso_create_auditor_note` chama `POST /api/v1/auditor/{token}/notes` pelo contrato tipado (`mcp-server-niso/src/ferramentas.ts:721-737`): sumir com a rota sem atualizar a ferramenta quebra o build do MCP.

## Review Focus

As cinco condições com mais chance de morder o usuário e que os testes óbvios não cobririam; cada uma ganhou teste na tarefa dona:
1. Link vencido há minutos ainda abre (prazo em ISO comparado como texto). Teste "vencido há um minuto, gravado em ISO 8601" na Task 1.
2. Nome de arquivo com travessão ou aspas tipográficas derruba o download. Teste com `relatório “final” — v2.txt` na Task 2.
3. Token de um projeto baixa evidência de outro pelo id no corpo, ou evidência do próprio projeto ligada (por dado legado) a controle de outro projeto vaza o id desse controle. Testes "evidência de outro projeto…" e "nada do outro projeto…" (com `pa-e3`) na Task 2.
4. Link revogado continua abrindo. Teste de revogação ponta a ponta (rota → portal 404) na Task 3, e o aviso de link expirado no download da página na Task 5.
5. Token vazando para log ou URL (query, caminho antigo, console, `fetch` com token na URL). Teste "token fora do corpo não vale" na Task 2 e o `afterEach` da Task 5 que reprova token em URL, console ou barra de endereço.

## Mapa de arquivos

- Create `migrations/0045_auditor_token_hash.sql`, `test/migration-0045.test.ts`, `test/auditor-token.test.ts` (Task 1).
- Create `src/routes/public-auditor.ts`, `test/portal-auditor.test.ts` (Task 2).
- Create `test/auditor-acesso.test.ts` (Task 3).
- Create `frontend/src/views/auditor-acesso.js`, `frontend/test/auditor-acesso.test.js` (Task 4).
- Create `frontend/public/auditor.html`, `frontend/public/auditor.js`, `frontend/public/auditor.css`, `frontend/test/auditor-publico.test.js` (Task 5).
- Modify `schema.sql`, `src/routes/auditor.ts`, `src/routes/platform.ts`, `src/routes/projects.ts`, `src/index.ts`, `src/middleware/auth.ts`, `src/schemas/domain.ts`, `src/openapi.ts`, `mcp-server-niso/src/ferramentas.ts`, `frontend/src/views/grc.js`, testes existentes listados em cada tarefa, `migrations/README.md`, `AGENTS.md`, `CHANGELOG.md`.

---

### Task 1: Token do auditor em hash, com prazo exato e revogação no banco

**Files:**
- Create: `migrations/0045_auditor_token_hash.sql`
- Create: `test/migration-0045.test.ts`
- Create: `test/auditor-token.test.ts`
- Modify: `schema.sql:406-415` (tabela `auditor_tokens`) e `schema.sql:441` (índice)
- Modify: `src/routes/auditor.ts:1-53` (helper `tokenDoAuditor` e as quatro buscas por token: linhas 10, 30, 113-114, 153)
- Modify: `src/routes/platform.ts:593-596`
- Modify: `src/routes/projects.ts:1122-1143` (`POST /:id/auditor-token`)
- Modify (fixtures, coluna `token` → `token_hash`): `test/api.test.ts:85-86`, `test/contrato-isolamento-org.test.ts:329-330`, `test/input-validation.test.ts:4,119`, `test/manutencao.test.ts:74,76,87,177`, `test/pedidos-prova.test.ts:175-177,336`, `test/platform-portfolio.test.ts:4,74-77`, `test/portabilidade.test.ts:51-52`, `test/refs-entre-projetos.test.ts:4,35`, `test/schema-contract.test.ts:169-170`
- Modify: `test/any-catraca.test.ts:19` (`TETO`), `migrations/README.md`, `AGENTS.md:128`

**Interfaces:**
- Consumes: `sha256Hex(input: string): Promise<string>`, `genToken(): string`, `genId(): string` (`src/helpers.ts`); `appUrl(env)` (`src/config/url.ts`).
- Produces: `export async function tokenDoAuditor(db: D1Database, token: string): Promise<{ id: string; project_id: string; expires_at: string } | null>` em `src/routes/auditor.ts`. Tabela `auditor_tokens(id, project_id, token_hash UNIQUE NOT NULL, expires_at, created_by, created_at, revoked_at, revoked_by)`. `POST /api/v1/projects/:id/auditor-token` responde 201 `{ id: string, url: string /* <APP_URL>/auditor#<64 hex> */, expires_at: string /* 'AAAA-MM-DD HH:MM:SS' UTC */ }`.

- [ ] **Step 1: Write the failing tests**

`test/migration-0045.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql } from './helpers/d1';
import migration0045 from '../migrations/0045_auditor_token_hash.sql?raw';

/** A 0045 tira o token em claro do banco: coluna vira token_hash, ganha revogação e as notas passam a guardar o id do token. */
describe('migration 0045 — token do auditor em hash e revogável', () => {
  it('troca token por token_hash, acrescenta a revogação, passa as notas para o id e apaga os tokens em claro', async () => {
    await execSql(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE auditor_tokens (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token);
      CREATE TABLE auditor_notes (id TEXT PRIMARY KEY, project_id TEXT, auditor_token TEXT NOT NULL, content TEXT NOT NULL);
      INSERT INTO projects (id) VALUES ('p1');
      INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at1', 'p1', 'segredo-em-claro', '2099-01-01T00:00:00Z');
      INSERT INTO auditor_notes (id, project_id, auditor_token, content) VALUES ('n1', 'p1', 'segredo-em-claro', 'Pergunta');
    `);
    await execSql(migration0045);
    const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('auditor_tokens')`).all<{ name: string }>();
    const cols = results.map((r) => r.name);
    expect(cols).toEqual(expect.arrayContaining(['token_hash', 'revoked_at', 'revoked_by']));
    expect(cols).not.toContain('token');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auditor_tokens').first('n')).toBe(0);
    expect(await env.DB.prepare(`SELECT auditor_token FROM auditor_notes WHERE id = 'n1'`).first('auditor_token')).toBe('at1');
  }, 30_000);
});
```

`test/auditor-token.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { tokenDoAuditor } from '../src/routes/auditor';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/** O link do auditor só vale pelo hash, até o minuto do prazo, e não depois de revogado. */
const P = 'at-proj';

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P).run();
  const ins = (id: string, hash: string, expira: string, revogado: string | null = null) =>
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ${expira}, ?)`).bind(id, P, hash, revogado);
  await env.DB.batch([
    ins('t-valido', await sha256Hex('tok-valido'), `datetime('now', '+1 day')`),
    ins('t-iso', await sha256Hex('tok-iso'), `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`),
    ins('t-revogado', await sha256Hex('tok-revogado'), `datetime('now', '+1 day')`, '2026-10-01 00:00:00'),
    ins('t-claro', 'tok-claro', `datetime('now', '+1 day')`),
  ]);
});

describe('tokenDoAuditor', () => {
  it('acha o token pelo SHA-256', async () => {
    expect(await tokenDoAuditor(env.DB, 'tok-valido')).toMatchObject({ id: 't-valido', project_id: P });
  });

  it('vencido há um minuto, gravado em ISO 8601, não vale (comparado como texto, valia até o fim do dia)', async () => {
    expect(await tokenDoAuditor(env.DB, 'tok-iso')).toBeNull();
  });

  it('revogado, guardado em claro ou desconhecido não vale', async () => {
    for (const t of ['tok-revogado', 'tok-claro', 'nao-existe']) expect(await tokenDoAuditor(env.DB, t), t).toBeNull();
  });
});

describe('POST /projects/:id/auditor-token', () => {
  it('devolve o link uma vez e guarda só o hash, com prazo no formato do SQLite', async () => {
    const h = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() });
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/auditor-token`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ days_valid: 7 }),
    }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(201);
    const corpo = await r.json<{ id: string; url: string; expires_at: string }>();
    const token = corpo.url.match(/\/auditor#([0-9a-f]{64})$/)?.[1] ?? '';
    expect(token).toHaveLength(64);
    expect(corpo.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(Object.keys(corpo).sort()).toEqual(['expires_at', 'id', 'url']);
    const linha = await env.DB.prepare('SELECT id, created_by FROM auditor_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).first();
    expect(linha).toEqual({ id: corpo.id, created_by: 'adm@ness.lat' });
    const { results } = await env.DB.prepare('SELECT * FROM auditor_tokens').all();
    expect(JSON.stringify(results)).not.toContain(token);
    expect(await tokenDoAuditor(env.DB, token)).toMatchObject({ id: corpo.id, project_id: P });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/migration-0045.test.ts test/auditor-token.test.ts`
Expected: FAIL — `migrations/0045_auditor_token_hash.sql` não existe; `tokenDoAuditor` não é exportado; `table auditor_tokens has no column named token_hash`.

- [ ] **Step 3: Write the migration and the schema**

`migrations/0045_auditor_token_hash.sql` (LF, UTF-8 sem BOM):

```sql
-- 0045 — token do auditor externo guardado só em hash, e revogável (fatia de jornada, P5).
--
-- O link do auditor dá leitura de toda a evidência do projeto. Até aqui o token ficava em claro em
-- auditor_tokens.token e era copiado em claro para auditor_notes.auditor_token, que a tela do
-- projeto e o export de portabilidade levam. Agora o banco guarda só o SHA-256 (mesma disciplina de
-- api_keys.key_hash e pedido_destinatarios.token_hash) e as notas guardam o id do token.
--
-- Tokens existentes NÃO migram: SQLite não calcula SHA-256. Em produção a tabela tinha 0 linhas em
-- 2026-10-07; quem tiver link anterior pede outro à consultoria.
UPDATE auditor_notes
   SET auditor_token = COALESCE((SELECT t.id FROM auditor_tokens t WHERE t.token = auditor_notes.auditor_token), auditor_token);

DELETE FROM auditor_tokens;

-- O índice idx_auditor_tokens acompanha a coluna renomeada.
ALTER TABLE auditor_tokens RENAME COLUMN token TO token_hash;
ALTER TABLE auditor_tokens ADD COLUMN revoked_at DATETIME;
ALTER TABLE auditor_tokens ADD COLUMN revoked_by TEXT;
```

Em `schema.sql`, troque a tabela (linhas 406-415) por:

```sql
CREATE TABLE IF NOT EXISTS auditor_tokens (
    id TEXT PRIMARY KEY,
    -- NOT NULL (migration 0021): o token é o único fator de um caminho público
    -- (`/api/v1/public/auditor/*`, isento do authMiddleware). Sem projeto ele é
    -- concessão de acesso sem escopo — não é dado válido. Ver o cabeçalho da
    -- 0021 para o critério de quais tabelas foram endurecidas e quais não.
    project_id TEXT NOT NULL REFERENCES projects(id),
    -- SHA-256 do token do link (migration 0045). O token em si sai uma vez, na URL.
    token_hash TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    revoked_by TEXT
);
```

e a linha 441 por:

```sql
CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token_hash);
```

- [ ] **Step 4: Write the resolver and switch every lookup to it**

Em `src/routes/auditor.ts`, troque a linha 3 por:

```ts
import { logAudit, requireResourceAccess, erro500, refForaDoProjeto, sha256Hex } from '../helpers';
```

e acrescente, logo depois de `export const auditorApp = ...` (linha 6):

```ts
export type TokenAuditor = { id: string; project_id: string; expires_at: string };

/**
 * O token do link do auditor externo, procurado pelo SHA-256 (o banco não guarda o token, migration
 * 0045). Vencido ou revogado não vale. `datetime(expires_at)` normaliza o formato: linha gravada em
 * ISO 8601 ('2026-11-06T12:00:00.000Z') comparada como texto com `datetime('now')`
 * ('2026-11-06 12:00:00') valia até o fim do dia, porque 'T' > ' '.
 */
export async function tokenDoAuditor(db: D1Database, token: string): Promise<TokenAuditor | null> {
  return db.prepare(
    `SELECT id, project_id, expires_at FROM auditor_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`
  ).bind(await sha256Hex(token)).first<TokenAuditor>();
}
```

Nas linhas 10, 30 e 153 (as buscas `SELECT project_id FROM auditor_tokens WHERE token = ? ... as any`, nas rotas que já têm `const token = c.req.param('token');` logo acima), troque a linha inteira por:

```ts
    const t = await tokenDoAuditor(c.env.DB, token);
```

Na rota de pedidos, as linhas 113-114 (o `prepare(...)` e o `.bind(c.req.param('token')).first<{ project_id: string }>();`) viram uma só:

```ts
    const t = await tokenDoAuditor(c.env.DB, c.req.param('token'));
```

Em todas, a linha seguinte `if (!t) return c.json({ error: 'Invalid or expired token' }, 401);` fica como está (o 404 vem na Task 2). Na `POST /auditor/:token/notes`, troque o `bind` do INSERT (linhas 46-48) para gravar o id do token, nunca o token:

```ts
    ).bind(
      id, t.project_id, t.id, control_id || null, note_type || 'question', content
    ).run();
```

Em `src/routes/platform.ts`, acrescente o import `import { tokenDoAuditor } from './auditor';` e troque as linhas 594-595 por:

```ts
  const t = await tokenDoAuditor(c.env.DB, c.req.param('token'));
```

Em `src/routes/projects.ts`, substitua o handler das linhas 1122-1143 por:

```ts
// Acesso do auditor externo. O token sai UMA vez, dentro da URL (fragmento, que o navegador não
// manda ao servidor); o banco guarda só o SHA-256, como o scim-token acima. Prazo calculado pelo
// SQLite, no formato que `tokenDoAuditor` compara.
projectsApp.post('/:id/auditor-token', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, auditorTokenSchema);
    if (!v.success) return v.response;
    const days = v.data.days_valid ?? 30;
    const token = genToken();
    const ator = c.get('user')?.email ?? 'system';
    const row = await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, token_hash, project_id, expires_at, created_by)
       VALUES (?, ?, ?, datetime('now', ?), ?) RETURNING id, expires_at`
    ).bind(genId(), await sha256Hex(token), projectId, `+${days} days`, ator).first<{ id: string; expires_at: string }>();
    if (!row) return c.json({ error: 'Falha ao gerar o acesso do auditor' }, 500);
    await logAudit(c.env.DB, 'auditor_token.created', ator, `Acesso de auditor externo ${row.id} criado, válido por ${days} dias`, '', '', projectId);
    return c.json({ id: row.id, url: `${appUrl(c.env)}/auditor#${token}`, expires_at: row.expires_at }, 201);
  } catch (e) {
    return erro500(c, 'Falha ao gerar token de auditor', e);
  }
});
```

(`genId`, `genToken`, `sha256Hex`, `logAudit`, `erro500` e `appUrl` já são importados em `projects.ts`.)

- [ ] **Step 5: Update the fixtures that write `auditor_tokens.token`**

Cada fixture passa a gravar `token_hash` com o SHA-256 do token que o teste usa (as rotas agora procuram pelo hash). Edições exatas:

`test/api.test.ts:85-86`:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?,?)`)
        .bind('at-1', PROJ, await sha256Hex('tok123'), '2099-01-01T00:00:00Z'),
```

`test/contrato-isolamento-org.test.ts:329-330`:
```ts
    await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?, ?, ?, '2099-01-01T00:00:00Z')`)
      .bind(`${m}-aud`, de.proj, await sha256Hex(`tok-aud-${m}`)).run();
```

`test/input-validation.test.ts`: linha 4 vira `import { hashPassword, sha256Hex } from '../src/helpers';` e a linha 119:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('at1','p1',?,'2099-01-01T00:00:00Z')`).bind(await sha256Hex('tok-valido')),
```

`test/manutencao.test.ts:74,76,87,177`: só o nome da coluna, `(id, project_id, token, expires_at)` → `(id, project_id, token_hash, expires_at)` nos quatro INSERTs (o valor não é usado como credencial ali).

`test/pedidos-prova.test.ts:175-177`:
```ts
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES
      ('pv-at', ?, ?, '2099-01-01T00:00:00Z'), ('pv-at-venc', ?, ?, '2020-01-01T00:00:00Z'), ('pv-at-q', ?, ?, '2099-01-01T00:00:00Z')`)
      .bind(P, await sha256Hex('tok-aud-p'), P, await sha256Hex('tok-aud-venc'), Q, await sha256Hex('tok-aud-q')),
```
e a linha 336:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('pv-at-m', 'pv-muitos', ?, '2099-01-01T00:00:00Z')`).bind(await sha256Hex('tok-aud-m')),
```

`test/platform-portfolio.test.ts`: linha 4 vira `import { hashPassword, sha256Hex } from '../src/helpers';` e as linhas 74-77:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?,?)`)
        .bind('at-1', A, await sha256Hex('tok-auditor-valido'), '2099-01-01T00:00:00Z'),
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?,?)`)
        .bind('at-2', A, await sha256Hex('tok-auditor-vencido'), '2020-01-01T00:00:00Z'),
```

`test/portabilidade.test.ts:51-52`:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?,?)`)
        .bind('at-a', A, 'token-secreto-do-auditor', '2099-01-01T00:00:00Z'),
```

`test/refs-entre-projetos.test.ts`: linha 4 ganha `import { sha256Hex } from '../src/helpers';` (linha nova) e a linha 35:
```ts
    db.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('at-a', 'proj-a', ?, '2099-01-01T00:00:00Z')`).bind(await sha256Hex('tok-a')),
```

`test/schema-contract.test.ts:169-170`:
```ts
      env.DB.prepare(`INSERT INTO auditor_tokens (id, token_hash, expires_at) VALUES (?, ?, ?)`)
        .bind('at-sem-projeto', 'tok-orfao', '2099-01-01T00:00:00Z').run()
```

- [ ] **Step 6: Lower the `any` ceiling to what was measured**

Run: `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`
Troque `const TETO = 557;` em `test/any-catraca.test.ts:19` pelo número medido (as buscas trocadas tiravam `as any` e o `catch (e: any)` do POST).

- [ ] **Step 7: Run the focused tests**

Run: `npx vitest run test/migration-0045.test.ts test/auditor-token.test.ts test/api.test.ts test/input-validation.test.ts test/manutencao.test.ts test/pedidos-prova.test.ts test/platform-portfolio.test.ts test/portabilidade.test.ts test/refs-entre-projetos.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts test/any-catraca.test.ts`
Expected: PASS. Depois: `npx vitest run test/contrato-isolamento-org.test.ts` (lento, ~10 min) — PASS. E `npx tsc --noEmit` — sem erro.

- [ ] **Step 8: Document the migration**

Em `migrations/README.md`, na seção "Estado", troque "**0044**" por "**0045**" e "São 42 arquivos" por "São 43 arquivos". No fim do arquivo, acrescente:

```markdown
## 0045 — token do auditor em hash e revogável (fatia de jornada, P5, 2026-10)

`auditor_tokens.token` vira `token_hash` (SHA-256 do token do link; o índice `idx_auditor_tokens`
acompanha o RENAME) e ganha `revoked_at` e `revoked_by`. As notas (`auditor_notes.auditor_token`)
passam a guardar o id do token, não o token. Os tokens existentes são apagados: SQLite não calcula
SHA-256, então token em claro não migra. Em 2026-10-07 a tabela tinha 0 linhas em produção.

Conferência antes de aplicar: `SELECT COUNT(*) FROM auditor_tokens` (se não for 0, avise a
consultoria: esses links deixam de abrir). Depois: `PRAGMA table_info(auditor_tokens)` mostra
`token_hash`, `revoked_at` e `revoked_by`, e não mostra `token`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply")
→ merge, porque `deploy.yml` recusa migration pendente.
```

Em `AGENTS.md:128`, troque "ultima a **0044**" por "ultima a **0045**".

- [ ] **Step 9: Commit**

```bash
git add migrations/0045_auditor_token_hash.sql migrations/README.md schema.sql src/routes/auditor.ts src/routes/platform.ts src/routes/projects.ts test/migration-0045.test.ts test/auditor-token.test.ts test/api.test.ts test/contrato-isolamento-org.test.ts test/input-validation.test.ts test/manutencao.test.ts test/pedidos-prova.test.ts test/platform-portfolio.test.ts test/portabilidade.test.ts test/refs-entre-projetos.test.ts test/schema-contract.test.ts test/any-catraca.test.ts AGENTS.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(auditor): token do auditor guardado em hash, com prazo exato e revogação no banco (0045)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API do portal com o token no corpo (`/api/v1/public/auditor/*`)

**Files:**
- Create: `src/routes/public-auditor.ts`
- Create: `test/portal-auditor.test.ts`
- Modify: `src/routes/auditor.ts` (remove as rotas com token no caminho: linhas 8-53 e 97-170 da base; ficam `tokenDoAuditor`, `PUT /auditor-notes/:id/respond` e `GET /projects/:id/auditor-notes`)
- Modify: `src/routes/platform.ts:593-612` (remove `GET /auditor/:token/project` e o import de `tokenDoAuditor`)
- Modify: `src/index.ts:34` (import) e `src/index.ts:318` (montagem)
- Modify: `src/middleware/auth.ts:118-122` (`PUBLIC_TOKEN_PREFIXES`)
- Modify: `src/schemas/domain.ts` (schemas do portal, junto de `auditorNoteSchema`, linha 243)
- Modify: `src/openapi.ts:12,167` e a lista perto da linha 260
- Modify: `mcp-server-niso/src/ferramentas.ts:721-737`
- Modify (chamadas às rotas antigas): `test/api.test.ts:529-533`, `test/contrato-isolamento-org.test.ts:120,145-147,357`, `test/input-validation.test.ts:262-273`, `test/pedidos-prova.test.ts:229-235,297-354`, `test/platform-portfolio.test.ts:74-77,244-261`, `test/refs-entre-projetos.test.ts:147-155`, `test/stakeholder-acesso.test.ts:137`
- Regenerate: `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts`
- Modify: `test/any-catraca.test.ts:19` (`TETO`), `AGENTS.md:79`

**Interfaces:**
- Consumes: `tokenDoAuditor` e `TokenAuditor` (Task 1, `src/routes/auditor.ts`); `rateLimitD1(db, key, max, windowSec): Promise<boolean>`, `refForaDoProjeto`, `logAudit`, `genId`, `erro500` (`src/helpers.ts`); `NA_STATUS` (`src/services/soa-logic.ts`).
- Produces (todas `POST`, corpo JSON, token só no corpo; token desconhecido/vencido/revogado → 404 `{"error":"Link inválido ou expirado"}`; acima de 600 req/10 min por IP → 429):
  - `/api/v1/public/auditor/ver` `{ token }` → 200 `{ projeto: { client_name, project_name, scope, standards, org_role }, expira_em: string, controles: { id, standard, title, status, maturity, aplicavel: boolean, justificativa_exclusao: string | null, evidencias: EvidenciaPortal[] }[], evidencias_sem_controle: EvidenciaPortal[] }`, com `EvidenciaPortal = { id, file_name, file_type, file_size, file_hash, evaluation_status, created_at }`.
  - `/api/v1/public/auditor/evidencia` `{ token, evidence_id }` → 200 com o arquivo (`Content-Disposition: attachment; filename="<encodeURIComponent(nome)>"`, `Cache-Control: no-store`) ou 404 `{"error":"Evidência não encontrada"}`.
  - `/api/v1/public/auditor/pedidos` `{ token, pagina?: number }` → 200 `{ total, pagina, por_pagina: 500, truncado, pedidos }` (mesmo corpo da rota antiga).
  - `/api/v1/public/auditor/notas` `{ token }` → 200 `{ notas: { id, control_id, control_title, note_type, content, response, responded_at, created_at }[] }`.
  - `/api/v1/public/auditor/notas/criar` `{ token, control_id?, note_type?, content }` → 200 `{ ok: true, id }`.
  - Schemas: `auditorPortalSchema`, `auditorEvidenciaSchema`, `auditorPedidosSchema`, `auditorNotaPortalSchema` (`src/schemas/domain.ts`).

- [ ] **Step 1: Write the failing test**

`test/portal-auditor.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, workerEnv } from './helpers/d1';

/**
 * Portal do auditor externo (P5): o token do link vai no CORPO, é procurado pelo hash e prende tudo
 * ao projeto dele. Vencido, revogado ou desconhecido: o mesmo 404, sem dizer qual.
 */
const A = 'pa-a';
const B = 'pa-b';
const INVALIDO = JSON.stringify({ error: 'Link inválido ou expirado' });
// Travessão e aspas tipográficas ficam fora do Latin-1: cabeçalho cru com eles derruba a resposta.
const NOME_DIFICIL = 'relatório “final” — v2.txt';

let ipSeq = 0;
const portal = (acao: string, corpo: unknown, ip = `10.55.0.${++ipSeq % 250}`) =>
  app.fetch(new Request(`http://localhost/api/v1/public/auditor/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo),
  }), workerEnv());

type EvidenciaPortal = { id: string; file_name: string; file_hash: string; evaluation_status: string };
type ControlePortal = { id: string; status: string; maturity: number; aplicavel: boolean; justificativa_exclusao: string | null; evidencias: EvidenciaPortal[] };
type Ver = { projeto: Record<string, unknown>; expira_em: string; controles: ControlePortal[]; evidencias_sem_controle: EvidenciaPortal[] };

beforeAll(async () => {
  await applySchema();
  const db = env.DB;
  const tok = (id: string, projeto: string, hash: string, expira: string, revogado: string | null = null) =>
    db.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ${expira}, ?)`).bind(id, projeto, hash, revogado);
  const ctl = (id: string, projeto: string, norma: string, titulo: string, status: string, maturidade: number, descricao: string) =>
    db.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity, description) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projeto, norma, titulo, status, maturidade, descricao);
  const ev = (id: string, controle: string | null, projeto: string, nome: string, chave: string, hash: string, avaliacao: string) =>
    db.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
                VALUES (?, ?, ?, ?, ?, ?, 'text/plain', 11, 'cons@ness.lat', ?)`).bind(id, controle, projeto, nome, chave, hash, avaliacao);
  await db.batch([
    db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, scope, repository_token) VALUES (?, 'Cliente A', 'ISO 27001:2022', 'Controller', 'Active', 'Sede e nuvem', 'segredo-repo')`).bind(A),
    db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente B', 'ISO 27001:2022', 'Controller', 'Active')`).bind(B),
    ctl('pa-c1', A, 'ISO 27001:2022', 'A.5.1 — Políticas', 'Implemented', 3, 'como implementamos'),
    ctl('pa-c2', A, 'ISO 27001:2022', 'A.7.4 — Monitoramento físico', 'Not Applicable', 0, 'Sem instalação física própria'),
    ctl('pa-c3', A, 'ISO 27701:2025', 'A.1.2.2 — Finalidade', 'Missing', 0, ''),
    ctl('pa-cb', B, 'ISO 27001:2022', 'A.5.1 — Políticas do B', 'Implemented', 2, ''),
    ev('pa-e1', 'pa-c1', A, NOME_DIFICIL, 'pa/e1.txt', 'hash-e1', 'conforming'),
    ev('pa-e2', null, A, 'ata.pdf', 'pa/e2.pdf', 'hash-e2', 'pending'),
    // Dado legado: evidência de A ligada a controle de B. Vai para "sem controle" e o id de B não sai.
    ev('pa-e3', 'pa-cb', A, 'legado.pdf', 'pa/e3.pdf', 'hash-e3', 'pending'),
    ev('pa-eb', 'pa-cb', B, 'segredo-b.pdf', 'pa/eb.pdf', 'hash-eb', 'conforming'),
    tok('pa-t-a', A, await sha256Hex('tok-a'), `datetime('now', '+1 day')`),
    tok('pa-t-venc', A, await sha256Hex('tok-venc'), `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`),
    tok('pa-t-rev', A, await sha256Hex('tok-rev'), `datetime('now', '+1 day')`, '2026-10-01 00:00:00'),
    tok('pa-t-b', B, await sha256Hex('tok-b'), `datetime('now', '+1 day')`),
  ]);
  await env.STORAGE.put('pa/e1.txt', 'conteudo-e1');
  await env.STORAGE.put('pa/eb.pdf', 'conteudo-b');
});

describe('POST /ver', () => {
  it('projeto, SoA e evidências por controle, só do projeto do token', async () => {
    const r = await portal('ver', { token: 'tok-a' });
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await r.json<Ver>();
    expect(d.projeto).toEqual({ client_name: 'Cliente A', project_name: null, scope: 'Sede e nuvem', standards: 'ISO 27001:2022', org_role: 'Controller' });
    expect(d.controles.map((c) => c.id).sort()).toEqual(['pa-c1', 'pa-c2', 'pa-c3']);
    const c1 = d.controles.find((c) => c.id === 'pa-c1');
    expect(c1).toMatchObject({ aplicavel: true, justificativa_exclusao: null, status: 'Implemented', maturity: 3 });
    expect(c1?.evidencias.map((e) => [e.id, e.file_hash, e.evaluation_status])).toEqual([['pa-e1', 'hash-e1', 'conforming']]);
    expect(d.controles.find((c) => c.id === 'pa-c2')).toMatchObject({ aplicavel: false, justificativa_exclusao: 'Sem instalação física própria' });
    expect(d.evidencias_sem_controle.map((e) => e.id).sort()).toEqual(['pa-e2', 'pa-e3']);
    expect(d.expira_em).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('nada do outro projeto, nem chave do R2, token, hash do token ou segredo do projeto', async () => {
    const texto = await (await portal('ver', { token: 'tok-a' })).text();
    for (const proibido of ['pa-b', 'pa-cb', 'pa-eb', 'segredo-b', 'pa/e1.txt', 'tok-a', await sha256Hex('tok-a'), 'segredo-repo', 'como implementamos', 'token']) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it('vencido (gravado em ISO há um minuto), revogado e desconhecido: o mesmo 404; vazio é 400', async () => {
    for (const token of ['tok-venc', 'tok-rev', 'nao-existe']) {
      const r = await portal('ver', { token });
      expect([r.status, await r.text()], token).toEqual([404, INVALIDO]);
    }
    expect((await portal('ver', { token: '' })).status).toBe(400);
  });

  it('token fora do corpo não vale: nem na query, nem no caminho antigo', async () => {
    const r = await app.fetch(new Request('http://localhost/api/v1/public/auditor/ver?token=tok-a'), workerEnv());
    expect(r.status).not.toBe(200);
    expect(app.routes.some((rt) => rt.path.startsWith('/api/v1/auditor/'))).toBe(false);
  });
});

describe('POST /evidencia', () => {
  it('baixa o arquivo do projeto do token, com o nome codificado, e registra na trilha', async () => {
    const r = await portal('evidencia', { token: 'tok-a', evidence_id: 'pa-e1' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.text()).toBe('conteudo-e1');
    expect(r.headers.get('Content-Disposition')).toBe(`attachment; filename="${encodeURIComponent(NOME_DIFICIL)}"`);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const log = await env.DB.prepare(`SELECT actor, project_id FROM audit_logs WHERE action = 'auditor.evidence_downloaded' AND details LIKE '%pa-e1%'`)
      .first<{ actor: string; project_id: string }>();
    expect(log).toEqual({ actor: 'auditor:pa-t-a', project_id: A });
  });

  it('evidência de outro projeto, inexistente ou sem arquivo, e token alheio ou revogado: 404', async () => {
    for (const evidence_id of ['pa-eb', 'nao-existe', 'pa-e2']) {
      expect((await portal('evidencia', { token: 'tok-a', evidence_id })).status, evidence_id).toBe(404);
    }
    expect((await portal('evidencia', { token: 'tok-b', evidence_id: 'pa-e1' })).status).toBe(404);
    expect((await portal('evidencia', { token: 'tok-rev', evidence_id: 'pa-e1' })).status).toBe(404);
  });
});

describe('notas', () => {
  it('a nota grava o id do token, nunca o token, e a lista é só do projeto', async () => {
    const r = await portal('notas/criar', { token: 'tok-a', control_id: 'pa-c1', content: 'Onde está a ata da análise crítica?' });
    expect(r.status, await r.clone().text()).toBe(200);
    const { id } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT auditor_token FROM auditor_notes WHERE id = ?').bind(id).first('auditor_token')).toBe('pa-t-a');
    await portal('notas/criar', { token: 'tok-b', content: 'Pergunta do B' });
    const lista = await (await portal('notas', { token: 'tok-a' })).json<{ notas: { id: string; control_title: string | null }[] }>();
    expect(lista.notas.map((n) => [n.id, n.control_title])).toEqual([[id, 'A.5.1 — Políticas']]);
  });
});

describe('limite por IP', () => {
  it('acima de 600 em 10 minutos: 429 antes de olhar o token', async () => {
    await env.DB.prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES ('auditor-publico:ip:10.99.0.1', 600, ?)`)
      .bind(Math.floor(Date.now() / 1000)).run();
    expect((await portal('ver', { token: 'tok-a' }, '10.99.0.1')).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/portal-auditor.test.ts`
Expected: FAIL — as rotas `/api/v1/public/auditor/*` não existem (status 401 do `authMiddleware`).

- [ ] **Step 3: Add the schemas**

Em `src/schemas/domain.ts`, logo depois de `auditorResponseSchema` (linha 251):

```ts
// Portal do auditor externo (src/routes/public-auditor.ts): o token do link vai no corpo, nunca na URL.
const tokenAuditor = z.string().min(1).max(200);
export const auditorPortalSchema = z.object({ token: tokenAuditor }).strict();
export const auditorEvidenciaSchema = z.object({ token: tokenAuditor, evidence_id: z.string().min(1).max(200) }).strict();
export const auditorPedidosSchema = z.object({ token: tokenAuditor, pagina: z.number().int().min(1).max(100_000).optional() }).strict();
export const auditorNotaPortalSchema = auditorNoteSchema.extend({ token: tokenAuditor });
```

- [ ] **Step 4: Write the portal router**

`src/routes/public-auditor.ts`:

```ts
// Portal do auditor externo (P5 da fatia de jornada). Sem sessão, na internet: a credencial é o
// token do link, que chega no CORPO (nunca no caminho nem na query, que vão para o log de
// requisição) e é procurado pelo SHA-256 em auditor_tokens.token_hash (tokenDoAuditor). Token
// desconhecido, vencido ou revogado: o MESMO 404. Tudo preso ao projeto do token. Só leitura,
// exceto a nota do auditor. Montado antes do authMiddleware (index.ts).
import { Hono } from 'hono';
import type { Bindings } from '../index';
import { rateLimitD1, erro500, logAudit, refForaDoProjeto, genId } from '../helpers';
import { validateBody, auditorPortalSchema, auditorEvidenciaSchema, auditorPedidosSchema, auditorNotaPortalSchema } from '../schemas';
import { NA_STATUS } from '../services/soa-logic';
import { tokenDoAuditor } from './auditor';

export const publicAuditorApp = new Hono<{ Bindings: Bindings }>();

const INVALIDO = { error: 'Link inválido ou expirado' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
// Teto largo: o auditor abre a SoA e baixa dezenas de evidências seguidas. Contra adivinhar token
// quem segura é o espaço de 256 bits; o limite só corta abuso em volume. Antes de ler o corpo.
const MAX_POR_IP = 600;

publicAuditorApp.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'sem-ip';
  if (!(await rateLimitD1(c.env.DB, `auditor-publico:ip:${ip}`, MAX_POR_IP, JANELA_SEG))) {
    return c.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
  }
  await next();
});

type Controle = { id: string; standard: string; title: string; status: string | null; maturity: number | null; description: string | null };
type Evidencia = { id: string; control_id: string | null; file_name: string; file_type: string | null; file_size: number | null; file_hash: string; evaluation_status: string | null; created_at: string };
type EvidenciaPortal = Omit<Evidencia, 'control_id'>;

/**
 * Projeto, SoA (27001 e 27701, uma linha por controle) e, por controle, as evidências ligadas.
 * Evidência sem controle do projeto (inclusive a ligada por dado legado a controle de outro projeto)
 * vai à parte, sem o `control_id`.
 */
publicAuditorApp.post('/ver', async (c) => {
  try {
    const v = await validateBody(c, auditorPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const db = c.env.DB;
    const [projeto, controles, evidencias] = await Promise.all([
      db.prepare('SELECT client_name, project_name, scope, standards, org_role FROM projects WHERE id = ?').bind(t.project_id).first(),
      db.prepare('SELECT id, standard, title, status, maturity, description FROM compliance_controls WHERE project_id = ?').bind(t.project_id).all<Controle>(),
      db.prepare(
        `SELECT id, control_id, file_name, file_type, file_size, file_hash, evaluation_status, created_at
           FROM evidence WHERE project_id = ? ORDER BY created_at, id`
      ).bind(t.project_id).all<Evidencia>(),
    ]);
    const porControle = new Map<string, EvidenciaPortal[]>(controles.results.map((ct) => [ct.id, []]));
    const semControle: EvidenciaPortal[] = [];
    for (const { control_id, ...e } of evidencias.results) {
      const lista = control_id ? porControle.get(control_id) : undefined;
      (lista ?? semControle).push(e);
    }
    return c.json({
      projeto,
      expira_em: t.expires_at,
      controles: controles.results.map(({ description, ...ct }) => ({
        ...ct,
        aplicavel: ct.status !== NA_STATUS,
        // A descrição só sai como justificativa da exclusão: é onde a SoA a guarda (soa-logic.ts).
        justificativa_exclusao: ct.status === NA_STATUS ? description : null,
        evidencias: porControle.get(ct.id) ?? [],
      })),
      evidencias_sem_controle: semControle,
    });
  } catch (e) {
    return erro500(c, 'Falha ao abrir o portal do auditor', e);
  }
});

/** Arquivo de uma evidência do projeto do token. Cada download entra na trilha do projeto. */
publicAuditorApp.post('/evidencia', async (c) => {
  try {
    const v = await validateBody(c, auditorEvidenciaSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const ev = await c.env.DB.prepare('SELECT id, file_name, file_type, r2_key FROM evidence WHERE id = ? AND project_id = ?')
      .bind(v.data.evidence_id, t.project_id).first<{ id: string; file_name: string; file_type: string | null; r2_key: string }>();
    const obj = ev ? await c.env.STORAGE.get(ev.r2_key) : null;
    if (!ev || !obj) return c.json({ error: 'Evidência não encontrada' }, 404);
    await logAudit(c.env.DB, 'auditor.evidence_downloaded', `auditor:${t.id}`, `Evidência ${ev.id} baixada pelo portal do auditor`, '', c.req.header('CF-Connecting-IP') ?? '', t.project_id);
    return new Response(obj.body, {
      headers: {
        'Content-Type': ev.file_type || 'application/octet-stream',
        // Nome codificado, como em evidence.ts: aspas cortavam o nome e caractere fora do Latin-1
        // derrubava a resposta (cabeçalho só aceita ByteString).
        'Content-Disposition': `attachment; filename="${encodeURIComponent(ev.file_name || 'evidencia')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return erro500(c, 'Falha no download da evidência', e);
  }
});

const PEDIDOS_POR_PAGINA = 500;

/** Uma linha com conteúdo ilegível não derruba a prova inteira: vai o texto cru. */
function lerConteudo(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}

type PedidoProva = {
  id: string; tipo: string; ref_id: string; titulo: string; papel_exigido: string; conteudo_json: string;
  hash: string; status: string; substituido_por: string | null; criado_por: string; criado_em: string;
};
type DestProva = {
  pedido_id: string; nome: string | null; email: string; status: string; decidido_em: string | null; aberto_em: string | null;
  canal: string | null; ip: string | null; user_agent: string | null; hash_lido: string | null; mfa_usado: number | null; motivo: string | null;
};

/**
 * Prova dos pedidos de aprovação/ciência do projeto do token (acesso de stakeholders, fatia 5): por
 * pedido, a versão congelada (conteúdo + SHA-256), o status e o substituto; por destinatário, quem,
 * quando, IP, user-agent, hash lido, canal, MFA e motivo. Só lê. Nunca o hash do token do link nem
 * o prazo dele: autenticam a ciência por link e não são prova. Paginado (`pagina`, 500 por página,
 * do mais novo ao mais velho), com `total` e `truncado` para o corte nunca passar calado.
 */
publicAuditorApp.post('/pedidos', async (c) => {
  try {
    const v = await validateBody(c, auditorPedidosSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const pagina = v.data.pagina ?? 1;
    const db = c.env.DB;
    const offset = (pagina - 1) * PEDIDOS_POR_PAGINA;
    // Os destinatários saem só dos pedidos desta página (mesma subconsulta).
    const daPagina = `SELECT id FROM pedidos WHERE project_id = ?1 ORDER BY criado_em DESC, id DESC LIMIT ${PEDIDOS_POR_PAGINA} OFFSET ?2`;
    const [total, pedidos, dests] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE project_id = ?').bind(t.project_id).first<number>('n'),
      db.prepare(
        `SELECT id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em
           FROM pedidos WHERE id IN (${daPagina}) ORDER BY criado_em DESC, id DESC`
      ).bind(t.project_id, offset).all<PedidoProva>(),
      db.prepare(
        `SELECT pedido_id, nome, email, status, decidido_em, aberto_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo
           FROM pedido_destinatarios WHERE pedido_id IN (${daPagina}) ORDER BY email`
      ).bind(t.project_id, offset).all<DestProva>(),
    ]);
    const porPedido = new Map<string, Omit<DestProva, 'pedido_id'>[]>();
    for (const { pedido_id, ...d } of dests.results) porPedido.set(pedido_id, [...(porPedido.get(pedido_id) ?? []), d]);
    return c.json({
      total: total ?? 0, pagina, por_pagina: PEDIDOS_POR_PAGINA,
      truncado: offset + pedidos.results.length < (total ?? 0),
      pedidos: pedidos.results.map(({ conteudo_json, ...p }) => ({
        ...p, conteudo: lerConteudo(conteudo_json), destinatarios: porPedido.get(p.id) ?? [],
      })),
    });
  } catch (e) {
    return erro500(c, 'Falha ao buscar a prova dos pedidos', e);
  }
});

type NotaPortal = {
  id: string; control_id: string | null; control_title: string | null; note_type: string; content: string;
  response: string | null; responded_at: string | null; created_at: string;
};

/** Notas do auditor no projeto do token, com a resposta da consultoria quando houver. */
publicAuditorApp.post('/notas', async (c) => {
  try {
    const v = await validateBody(c, auditorPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT n.id, n.control_id, cc.title AS control_title, n.note_type, n.content, n.response, n.responded_at, n.created_at
         FROM auditor_notes n
         LEFT JOIN compliance_controls cc ON cc.id = n.control_id AND cc.project_id = n.project_id
        WHERE n.project_id = ? ORDER BY n.created_at DESC`
    ).bind(t.project_id).all<NotaPortal>();
    return c.json({ notas: results });
  } catch (e) {
    return erro500(c, 'Falha ao buscar notas', e);
  }
});

/** Pergunta do auditor. Grava o id do token, nunca o token; o controle tem de ser do projeto. */
publicAuditorApp.post('/notas/criar', async (c) => {
  try {
    const v = await validateBody(c, auditorNotaPortalSchema);
    if (!v.success) return v.response;
    const t = await tokenDoAuditor(c.env.DB, v.data.token);
    if (!t) return c.json(INVALIDO, 404);
    const { control_id, note_type, content } = v.data;
    const fora = await refForaDoProjeto(c.env.DB, t.project_id, { control_id }, ['control_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, t.project_id, t.id, control_id || null, note_type || 'question', content).run();
    await logAudit(c.env.DB, 'auditor_note.created', `auditor:${t.id}`, `Nota de auditor ${id} criada`, '', '', t.project_id);
    return c.json({ ok: true, id });
  } catch (e) {
    return erro500(c, 'Falha ao criar nota de auditor', e);
  }
});
```

- [ ] **Step 5: Mount it before the auth middleware and drop the path-token routes**

`src/index.ts`: depois da linha 34 (`import { publicPedidosApp } ...`), acrescente `import { publicAuditorApp } from './routes/public-auditor';`; depois da linha 318 (`app.route('/api/v1/public/pedidos', publicPedidosApp);`), acrescente:

```ts
// Portal do auditor externo, sem sessão: token do link no corpo, só o hash no banco, limite por IP.
app.route('/api/v1/public/auditor', publicAuditorApp);
```

`src/middleware/auth.ts:118-122` vira:

```ts
// Rotas públicas validadas por token NO PRÓPRIO handler (não exigem sessão nISO):
// - links públicos de assessment (/api/v1/assessments/public/:token...) validam access_token.
// O portal do auditor externo (/api/v1/public/auditor/*) é montado antes deste middleware, com o
// token no corpo. '/api/v1/auditor-notes/...' é rota interna autenticada.
const PUBLIC_TOKEN_PREFIXES = ['/api/v1/assessments/public/'];
```

`src/routes/auditor.ts`: apague `auditorApp.get('/auditor/:token/notes'...)`, `auditorApp.post('/auditor/:token/notes'...)`, `lerConteudo`, `PEDIDOS_POR_PAGINA`, o comentário e a rota `/auditor/:token/pedidos` e a rota `/auditor/:token/evidence/:evidenceId/download`. Ficam `tokenDoAuditor`, `PUT /auditor-notes/:id/respond` e `GET /projects/:id/auditor-notes`. Ajuste os imports para o que sobrou:

```ts
import { logAudit, requireResourceAccess, erro500, sha256Hex } from '../helpers';
import { validateBody, auditorResponseSchema } from '../schemas';
```

`src/routes/platform.ts`: apague a rota `platformApp.get('/auditor/:token/project', ...)` (linhas 593-612 da base) e o import de `tokenDoAuditor` acrescentado na Task 1. Troque o comentário `// Phase config & Auditor token` (linha 557) por `// Phase config`.

- [ ] **Step 6: OpenAPI, MCP tool and generated contract**

`src/openapi.ts`: na lista de imports (linha 12), troque `auditorNoteSchema,` por

```ts
  auditorPortalSchema,
  auditorEvidenciaSchema,
  auditorPedidosSchema,
  auditorNotaPortalSchema,
```

apague a entrada `'/api/v1/auditor/:token/notes'` (linha 167) e acrescente, antes de `'/api/v1/public/pedidos/ciencia'`:

```ts
  { metodo: 'POST', caminho: '/api/v1/public/auditor/evidencia', schema: auditorEvidenciaSchema, nome: 'auditorEvidenciaSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/auditor/notas/criar', schema: auditorNotaPortalSchema, nome: 'auditorNotaPortalSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/auditor/notas', schema: auditorPortalSchema, nome: 'auditorPortalSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/auditor/pedidos', schema: auditorPedidosSchema, nome: 'auditorPedidosSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/auditor/ver', schema: auditorPortalSchema, nome: 'auditorPortalSchema' },
```

`mcp-server-niso/src/ferramentas.ts:728-736`: a chamada vira

```ts
        return await t.contrato(
          "POST /api/v1/public/auditor/notas/criar",
          {},
          {
            token: validated.token,
            control_id: validated.controlId,
            note_type: validated.noteType || "question",
            content: validated.content,
          }
        );
```

Run: `npm run openapi` (regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`).
Run: `cd mcp-server-niso && npx tsc --noEmit` — sem erro.

- [ ] **Step 7: Port the tests that called the old routes**

`test/api.test.ts:529-533` (o teste "rotas públicas por token dispensam sessão"):

```ts
    it('rotas públicas por token dispensam sessão', async () => {
      // O token é a credencial; não há header de autenticação. O do auditor vai no corpo.
      const portal = await req('/api/v1/public/auditor/ver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'tok123' }) });
      expect(portal.status).toBe(200);
      expect((await req('/api/v1/assessments/public/tok456')).status).toBe(200);
    });
```

`test/input-validation.test.ts:262-273`:

```ts
  it('nota de auditor externo vazia é recusada', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/public/auditor/notas/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'tok-valido', content: '   ' }),
      }),
      env as any
    );
    expect(res.status).toBe(400);
  });
```

`test/refs-entre-projetos.test.ts:147-155`:

```ts
describe('nota do auditor externo (token no corpo): control_id do corpo', () => {
  it('recusa controle de outro projeto, sem gravar', async () => {
    await recusa('/api/v1/public/auditor/notas/criar', 'POST', { token: 'tok-a', content: 'Pergunta' }, 'control_id', 'ctl-b');
    expect(await conta(`SELECT COUNT(*) n FROM auditor_notes`)).toBe(0);
  });

  it('legítimo: controle do próprio projeto', async () => {
    expect((await req('/api/v1/public/auditor/notas/criar', 'POST', { token: 'tok-a', content: 'Pergunta', control_id: 'ctl-a' }, {})).status).toBe(200);
  });
});
```

`test/pedidos-prova.test.ts`:
- No `DE_PEDIDO` (linhas 229-235), acrescente `'POST /api/v1/public/auditor/pedidos': { corpo: { token: 'tok-aud-p' }, esperado: () => 200 }, // só lê`.
- Linha 298: `const ler = (token: string) => chamar({}, 'POST', '/api/v1/public/auditor/pedidos', { token });`
- No teste "token inexistente ou vencido" (linhas 327-330), troque o título por `'token inexistente ou vencido: 404'` e os dois `toBe(401)` por `toBe(404)`.
- Linhas 346-348:
```ts
    const p2 = await (await chamar({}, 'POST', '/api/v1/public/auditor/pedidos', { token: 'tok-aud-m', pagina: 2 })).json<any>();
    expect([p2.total, p2.pagina, p2.truncado, p2.pedidos.map((p: any) => p.id)]).toEqual([502, 2, false, ['pm-002', 'pm-001']]);
    expect((await chamar({}, 'POST', '/api/v1/public/auditor/pedidos', { token: 'tok-aud-m', pagina: 0 })).status).toBe(400);
```
- Linhas 351-354:
```ts
  it('a prova sai só por POST com o token no corpo; a rota com token no caminho não existe mais', () => {
    expect([...new Set(app.routes.filter((r) => r.path === '/api/v1/public/auditor/pedidos').map((r) => r.method))]).toEqual(['POST']);
    expect(app.routes.some((r) => r.path.startsWith('/api/v1/auditor/'))).toBe(false);
  });
```

`test/platform-portfolio.test.ts`: apague o `describe('GET /auditor/:token/project', ...)` (linhas 244-261; coberto agora por `test/portal-auditor.test.ts`) e os dois INSERTs em `auditor_tokens` das linhas 74-77, e volte a linha 4 para `import { hashPassword } from '../src/helpers';`.

`test/contrato-isolamento-org.test.ts`:
- Linha 120 (`VINCULO_ALHEIO`):
```ts
  ['POST', () => '/api/v1/public/auditor/notas/criar', (p) => ({ token: p.token ?? 'token-forjado-inexistente', content: 'n', control_id: p.alheio.rec })],
```
- Em `SEM_RECURSO_ALHEIO`, depois da linha 147:
```ts
  'POST /api/v1/public/auditor/ver': 'portal do auditor: o token do link (no corpo) é a autorização, preso a um projeto; isolamento em test/portal-auditor.test.ts',
  'POST /api/v1/public/auditor/evidencia': 'portal do auditor: token no corpo; evidência alheia por id é 404 (test/portal-auditor.test.ts)',
  'POST /api/v1/public/auditor/pedidos': 'portal do auditor: token no corpo, prova só do projeto do token',
  'POST /api/v1/public/auditor/notas': 'portal do auditor: token no corpo, notas só do projeto do token',
  'POST /api/v1/public/auditor/notas/criar': 'portal do auditor: token no corpo; control_id alheio coberto em VINCULO_ALHEIO',
```
- Linha 357: `auditor: [],` e, logo depois do `for (const p of PRINCIPAIS) { ... }` desse mesmo teste ("cada principal está autenticado…"), acrescente:
```ts
    // Auditor externo: o token vai no CORPO das rotas do portal (src/routes/public-auditor.ts), e a
    // resposta não traz nada da organização alheia.
    for (const p of PRINCIPAIS.filter((x) => x.token)) {
      for (const acao of ['ver', 'pedidos', 'notas']) {
        const res = await chamar(p, 'POST', `/api/v1/public/auditor/${acao}`, { token: p.token });
        const texto = await res.text();
        expect(res.status, `${p.nome} ${acao}: ${texto}`).toBe(200);
        expect(texto.toLowerCase(), `${p.nome} ${acao}`).not.toContain(p.alheio.m);
      }
    }
```

`test/stakeholder-acesso.test.ts:137`: apague `|| r.path.startsWith('/api/v1/auditor/')` (o prefixo não existe mais).

- [ ] **Step 8: Lower the `any` ceiling and update AGENTS.md**

Run: `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l` e baixe `TETO` em `test/any-catraca.test.ts:19` para o número medido.

`AGENTS.md:79`: troque "e `GET /api/v1/auditor/:token/pedidos` (a prova, para o auditor externo, paginada)" por "e `POST /api/v1/public/auditor/pedidos` (a prova, para o auditor externo, token no corpo, paginada; o portal inteiro está em `src/routes/public-auditor.ts`)".

- [ ] **Step 9: Run the focused tests**

Run: `npx vitest run test/portal-auditor.test.ts test/auditor-token.test.ts test/api.test.ts test/input-validation.test.ts test/refs-entre-projetos.test.ts test/platform-portfolio.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-writes-validados.test.ts test/validacao-corpo.test.ts test/any-catraca.test.ts test/colunas-catraca.test.ts test/mcp-remoto.test.ts`
Expected: PASS.
Run: `npx vitest run test/pedidos-prova.test.ts test/stakeholder-acesso.test.ts test/contrato-isolamento-org.test.ts` (lentos) — PASS.
Run: `npx tsc --noEmit` — sem erro.

- [ ] **Step 10: Commit**

```bash
git add src/routes/public-auditor.ts src/routes/auditor.ts src/routes/platform.ts src/index.ts src/middleware/auth.ts src/schemas/domain.ts src/openapi.ts docs/openapi.json mcp-server-niso/src/ferramentas.ts mcp-server-niso/src/contrato-gerado.ts test/portal-auditor.test.ts test/api.test.ts test/input-validation.test.ts test/refs-entre-projetos.test.ts test/pedidos-prova.test.ts test/platform-portfolio.test.ts test/contrato-isolamento-org.test.ts test/stakeholder-acesso.test.ts test/any-catraca.test.ts AGENTS.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(auditor): portal do auditor com token no corpo, SoA e evidência por controle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gestão do link pela consultoria e teste do critério de pronto

**Files:**
- Modify: `src/routes/projects.ts:4` (import de `ehEquipeNess`) e o bloco `POST /:id/auditor-token` da Task 1
- Create: `test/auditor-acesso.test.ts`
- Modify: `test/agente-paridade.test.ts:87`

**Interfaces:**
- Consumes: `POST /api/v1/projects/:id/auditor-token` (Task 1), `POST /api/v1/public/auditor/ver|evidencia` (Task 2), `ehEquipeNess(user): boolean` (`src/helpers.ts:507`).
- Produces (só `platform_admin`, `consultor`/`consultant`, `consultoria_admin`; demais papéis 403 `{"error":"Somente a consultoria gere o acesso do auditor externo"}`):
  - `GET /api/v1/projects/:id/auditor-token` → 200 `{ tokens: { id: string, created_by: string | null, created_at: string, expires_at: string }[] }` (só os válidos: não revogados e no prazo; nunca token nem hash).
  - `POST /api/v1/projects/:id/auditor-token` → como na Task 1, agora com a guarda de papel.
  - `POST /api/v1/projects/:id/auditor-token/:tokenId/revogar` (sem corpo) → 200 `{ revogado: true }`, ou 404 `{"error":"Acesso não encontrado"}` se o token não é do projeto ou já foi revogado.

- [ ] **Step 1: Write the failing test**

`test/auditor-acesso.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

/**
 * A consultoria gera, lista e revoga o link do auditor externo; o cliente não. E o critério da
 * fatia: o auditor recebe um link e vê a SoA com a evidência de cada controle, e baixa o arquivo.
 */
const P = 'ac-proj';
const OUTRO = 'ac-outro';
const CONS = 'cons@ness.lat';
let consultor: Record<string, string>;
let cliente: Record<string, string>;

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.8.0.1', ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const portal = (acao: string, corpo: Record<string, unknown>) => chamar({}, 'POST', `/api/v1/public/auditor/${acao}`, corpo);
const tokenDoLink = (url: string) => url.match(/\/auditor#([0-9a-f]{64})$/)?.[1] ?? '';

type Gerado = { id: string; url: string; expires_at: string };
type Lista = { tokens: { id: string; created_by: string | null; created_at: string; expires_at: string }[] };
type Ver = { controles: { id: string; evidencias: { id: string; file_name: string }[] }[] };

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('ac-c1', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação', 'Implemented', 3)`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
                    VALUES ('ac-e1', 'ac-c1', ?, 'politica.pdf', 'ac/politica.pdf', 'h1', 'application/pdf', 9, ?, 'conforming')`).bind(P, CONS),
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('ac-t-outro', ?, ?, datetime('now', '+1 day'))`).bind(OUTRO, await sha256Hex('tok-outro')),
  ]);
  await env.STORAGE.put('ac/politica.pdf', 'PDF-falso');
  await designarConsultor(CONS, P);
  consultor = await sessionFor({ id: `cons:${CONS}`, email: CONS, role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.lat', role: 'org_admin', client_project_id: P });
});

describe('critério: o auditor recebe um link e vê a SoA com a evidência de cada controle', () => {
  it('consultor gera o link; o auditor abre, vê o controle com a evidência e baixa o arquivo', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 7 });
    expect(r.status, await r.clone().text()).toBe(201);
    const token = tokenDoLink((await r.json<Gerado>()).url);
    const ver = await portal('ver', { token });
    expect(ver.status, await ver.clone().text()).toBe(200);
    const d = await ver.json<Ver>();
    expect(d.controles.find((c) => c.id === 'ac-c1')?.evidencias.map((e) => e.file_name)).toEqual(['politica.pdf']);
    const arq = await portal('evidencia', { token, evidence_id: 'ac-e1' });
    expect(arq.status).toBe(200);
    expect(await arq.text()).toBe('PDF-falso');
  });
});

describe('gestão do link pela consultoria', () => {
  it('lista os links válidos sem token nem hash; revogar derruba o acesso na hora e fica na trilha', async () => {
    const gerado = await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 30 })).json<Gerado>();
    const token = tokenDoLink(gerado.url);
    const lista = await chamar(consultor, 'GET', `/api/v1/projects/${P}/auditor-token`);
    const texto = await lista.clone().text();
    expect(lista.status, texto).toBe(200);
    expect(texto).not.toContain(token);
    expect(texto).not.toContain(await sha256Hex(token));
    const { tokens } = await lista.json<Lista>();
    expect(tokens.find((t) => t.id === gerado.id)).toMatchObject({ created_by: CONS, expires_at: gerado.expires_at });
    expect(tokens.some((t) => t.id === 'ac-t-outro')).toBe(false);

    const rev = await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/${gerado.id}/revogar`);
    expect(rev.status, await rev.clone().text()).toBe(200);
    expect((await portal('ver', { token })).status).toBe(404);
    const depois = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/auditor-token`)).json<Lista>();
    expect(depois.tokens.some((t) => t.id === gerado.id)).toBe(false);
    expect(await env.DB.prepare('SELECT revoked_by FROM auditor_tokens WHERE id = ?').bind(gerado.id).first('revoked_by')).toBe(CONS);
    const { results } = await env.DB.prepare(`SELECT action FROM audit_logs WHERE project_id = ? AND details LIKE ?`)
      .bind(P, `%${gerado.id}%`).all<{ action: string }>();
    expect(results.map((l) => l.action).sort()).toEqual(['auditor_token.created', 'auditor_token.revoked']);
    // Revogar de novo: 404, nada muda.
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/${gerado.id}/revogar`)).status).toBe(404);
  });

  it('link de outro projeto pela rota do próprio: 404, e o link alheio continua valendo', async () => {
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/ac-t-outro/revogar`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT revoked_at FROM auditor_tokens WHERE id = 'ac-t-outro'`).first('revoked_at')).toBeNull();
    expect((await portal('ver', { token: 'tok-outro' })).status).toBe(200);
  });

  it('o cliente (org_admin) não gera, não lista e não revoga', async () => {
    const tentativas: [string, string, unknown?][] = [
      ['POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 7 }],
      ['GET', `/api/v1/projects/${P}/auditor-token`],
      ['POST', `/api/v1/projects/${P}/auditor-token/qualquer/revogar`],
    ];
    for (const [metodo, caminho, corpo] of tentativas) {
      const r = await chamar(cliente, metodo, caminho, corpo);
      expect([r.status, (await r.json<{ error: string }>()).error], `${metodo} ${caminho}`)
        .toEqual([403, 'Somente a consultoria gere o acesso do auditor externo']);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auditor-acesso.test.ts`
Expected: FAIL — `GET .../auditor-token` e `.../revogar` não existem (404 do catch-all ou 405), e o `org_admin` recebe 201 no POST.

- [ ] **Step 3: Implement the role gate, list and revoke**

Em `src/routes/projects.ts:4`, acrescente `ehEquipeNess` ao import de `'../helpers'`. Logo antes do `projectsApp.post('/:id/auditor-token', ...)` da Task 1, acrescente:

```ts
// O link do auditor é credencial de leitura de toda a evidência do projeto: só a equipe da
// consultoria (consultor designado, consultoria_admin, platform_admin) o gera, lista e revoga.
// O agente MCP também não (FORA_DO_AGENTE, src/middleware/agente.ts).
const SO_CONSULTORIA = { error: 'Somente a consultoria gere o acesso do auditor externo' };
```

No início do `try` do `POST /:id/auditor-token`, antes do `validateBody`:

```ts
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
```

E, logo depois desse handler:

```ts
/** Links válidos do projeto (não revogados, no prazo). Nunca o token nem o hash: o link saiu uma vez. */
projectsApp.get('/:id/auditor-token', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const { results } = await c.env.DB.prepare(
      `SELECT id, created_by, created_at, expires_at FROM auditor_tokens
        WHERE project_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC`
    ).bind(c.req.param('id')).all<{ id: string; created_by: string | null; created_at: string; expires_at: string }>();
    return c.json({ tokens: results });
  } catch (e) {
    return erro500(c, 'Falha ao listar os acessos do auditor', e);
  }
});

/** Revoga na hora. A linha fica (revoked_at/revoked_by) para a trilha; a purga de 90 dias a leva depois. */
projectsApp.post('/:id/auditor-token/:tokenId/revogar', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const projectId = c.req.param('id');
    const tokenId = c.req.param('tokenId');
    const ator = c.get('user')?.email ?? 'system';
    const r = await c.env.DB.prepare(
      `UPDATE auditor_tokens SET revoked_at = datetime('now'), revoked_by = ?
        WHERE id = ? AND project_id = ? AND revoked_at IS NULL`
    ).bind(ator, tokenId, projectId).run();
    if (!r.meta.changes) return c.json({ error: 'Acesso não encontrado' }, 404);
    await logAudit(c.env.DB, 'auditor_token.revoked', ator, `Acesso de auditor externo ${tokenId} revogado`, '', '', projectId);
    return c.json({ revogado: true });
  } catch (e) {
    return erro500(c, 'Falha ao revogar o acesso do auditor', e);
  }
});
```

Em `test/agente-paridade.test.ts`, depois da linha 87 (`['POST', '/api/v1/projects/p-a/auditor-token'],`), acrescente:

```ts
      ['GET', '/api/v1/projects/p-a/auditor-token'],
      ['POST', '/api/v1/projects/p-a/auditor-token/x/revogar'],
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run test/auditor-acesso.test.ts test/auditor-token.test.ts test/input-validation.test.ts test/agente-paridade.test.ts test/colunas-catraca.test.ts test/any-catraca.test.ts test/stakeholder-acesso.test.ts`
Expected: PASS. Depois `npx vitest run test/contrato-isolamento-org.test.ts` (a rota nova com `:tokenId` entra na varredura por id) — PASS. `npx tsc --noEmit` — sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projects.ts test/auditor-acesso.test.ts test/agente-paridade.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(auditor): consultoria lista e revoga o link do auditor; cliente não gera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cartão "Acesso do auditor externo" na tela de Auditorias

**Files:**
- Create: `frontend/src/views/auditor-acesso.js`
- Create: `frontend/test/auditor-acesso.test.js`
- Modify: `frontend/src/views/grc.js:1-4` (import) e `frontend/src/views/grc.js:1453-1456` (fim de `renderAudits`)

**Interfaces:**
- Consumes: `GET|POST /api/v1/projects/:id/auditor-token`, `POST /api/v1/projects/:id/auditor-token/:tokenId/revogar` (Task 3); `api(method, url, body)` (`frontend/src/api.js`); `showToast`, `escapeHTML` (`frontend/src/ui.js`).
- Produces: `export async function renderAcessoAuditor(el: HTMLElement, projectId: string, role: string): Promise<void>`; ações de delegação `window.gerarAcessoAuditor(projectId)`, `window.revogarAcessoAuditor(projectId, tokenId)`, `window.copiarLinkAuditor()`. Ids no DOM: `#aud-ext-titulo`, `#aud-ext-dias`, `#aud-ext-erro`, `#aud-ext-novo`, `#aud-ext-link`, `#aud-ext-lista`.

- [ ] **Step 1: Write the failing test**

`frontend/test/auditor-acesso.test.js`:

```js
// Acesso do auditor externo na tela de Auditorias: só a equipe da consultoria vê; o link aparece
// uma vez depois de gerado; revogar chama a rota do próprio projeto; dado do servidor é escapado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { renderAcessoAuditor } from '../src/views/auditor-acesso.js';

const LISTA = { tokens: [{ id: 't1', created_by: '<img src=x>', created_at: '2026-10-01 12:00:00', expires_at: '2026-10-31 12:00:00' }] };
const LINK = 'https://niso.ness.com.br/auditor#' + 'a'.repeat(64);

let el;
beforeEach(() => {
    apiMock.mockReset();
    document.body.innerHTML = '<div id="alvo"></div>';
    el = document.getElementById('alvo');
});

describe('acesso do auditor externo', () => {
    it('papel de cliente não vê o cartão e nada é pedido à API', async () => {
        await renderAcessoAuditor(el, 'p1', 'org_admin');
        expect(el.innerHTML).toBe('');
        expect(apiMock).not.toHaveBeenCalled();
    });

    it('consultor vê os links válidos, com o dado do servidor escapado', async () => {
        apiMock.mockResolvedValue(LISTA);
        await renderAcessoAuditor(el, 'p1', 'consultor');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/auditor-token');
        expect(el.querySelector('#aud-ext-titulo').textContent).toBe('Acesso do auditor externo');
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toContain('<img src=x>');
        const revogar = el.querySelector('[data-action="revogarAcessoAuditor"]');
        expect(JSON.parse(revogar.getAttribute('data-args'))).toEqual(['p1', 't1']);
    });

    it('sem link válido: diz que não há', async () => {
        apiMock.mockResolvedValue({ tokens: [] });
        await renderAcessoAuditor(el, 'p1', 'consultor');
        expect(el.querySelector('#aud-ext-lista').textContent).toContain('Nenhum link válido agora');
    });

    it('gerar mostra o link uma vez, com o aviso, e recarrega a lista', async () => {
        apiMock.mockImplementation(async (metodo) => (metodo === 'POST' ? { id: 't2', url: LINK, expires_at: '2026-10-14 12:00:00' } : LISTA));
        await renderAcessoAuditor(el, 'p1', 'consultoria_admin');
        document.getElementById('aud-ext-dias').value = '7';
        await window.gerarAcessoAuditor('p1');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/auditor-token', { days_valid: 7 });
        expect(document.getElementById('aud-ext-link').value).toBe(LINK);
        expect(document.getElementById('aud-ext-novo').textContent).toContain('não aparece de novo');
        expect(apiMock.mock.calls.filter(([m]) => m === 'GET')).toHaveLength(2);
    });

    it('validade fora de 1 a 365 dias não chama a API e diz o porquê', async () => {
        apiMock.mockResolvedValue(LISTA);
        await renderAcessoAuditor(el, 'p1', 'consultor');
        apiMock.mockClear();
        for (const v of ['0', '366', '', '2.5']) {
            document.getElementById('aud-ext-dias').value = v;
            await window.gerarAcessoAuditor('p1');
        }
        expect(apiMock).not.toHaveBeenCalled();
        expect(document.getElementById('aud-ext-erro').textContent).toContain('1 a 365');
    });

    it('revogar pede confirmação e chama a rota do próprio projeto', async () => {
        apiMock.mockResolvedValue(LISTA);
        await renderAcessoAuditor(el, 'p1', 'consultor');
        const confirma = vi.spyOn(window, 'confirm').mockReturnValue(true);
        await window.revogarAcessoAuditor('p1', 't1');
        expect(confirma).toHaveBeenCalled();
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/auditor-token/t1/revogar');
        confirma.mockReturnValue(false);
        apiMock.mockClear();
        await window.revogarAcessoAuditor('p1', 't1');
        expect(apiMock).not.toHaveBeenCalled();
    });

    it('a tela de Auditorias monta o cartão', async () => {
        await import('../src/views/grc.js');
        const { S } = await import('../src/state.js');
        S.activeProject = { id: 'p1', project_name: 'P' };
        S.user = { role: 'consultor' };
        apiMock.mockImplementation(async (_m, url) => (url.endsWith('/auditor-token') ? LISTA : []));
        const c = document.createElement('div');
        const h = document.createElement('div');
        const a = document.createElement('div');
        await window.renderAudits(c, h, a);
        expect(c.querySelector('#aud-ext-titulo')?.textContent).toBe('Acesso do auditor externo');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/auditor-acesso.test.js --pool=threads`
Expected: FAIL — `../src/views/auditor-acesso.js` não existe.

- [ ] **Step 3: Write the view**

`frontend/src/views/auditor-acesso.js`:

```js
// Acesso do auditor externo (P5), dentro de Auditorias. A consultoria gera um link com prazo, vê os
// que estão valendo e revoga. O link (token no fragmento) aparece UMA vez, logo depois de gerado: o
// servidor guarda só o SHA-256 e não consegue mostrá-lo de novo. Rotas: src/routes/projects.ts.
import { api } from '../api.js';
import { showToast, escapeHTML } from '../ui.js';

// Mesmo conjunto de ehEquipeNess (src/helpers.ts): o servidor recusa os demais com 403.
const EQUIPE = new Set(['platform_admin', 'consultor', 'consultant', 'consultoria_admin']);
const args = (...a) => escapeHTML(JSON.stringify(a));

/** 'AAAA-MM-DD HH:MM:SS' (UTC, do SQLite) -> DD/MM/AAAA em Brasília. */
function dataBR(s) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + (/[zZ]$/.test(s) ? '' : 'Z'));
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function listar(el, projectId) {
    if (!el) return;
    let tokens;
    try {
        const r = await api('GET', `/api/v1/projects/${projectId}/auditor-token`);
        tokens = Array.isArray(r?.tokens) ? r.tokens : [];
    } catch (e) {
        el.innerHTML = `<p class="text-muted">Não foi possível carregar os links: ${escapeHTML(e.message)}</p>`;
        return;
    }
    if (!tokens.length) {
        el.innerHTML = '<p class="text-muted">Nenhum link válido agora.</p>';
        return;
    }
    el.innerHTML = window.renderDataTable(
        ['Criado por', 'Criado em', 'Válido até', ''],
        tokens.map((t) => [
            escapeHTML(t.created_by || '—'),
            escapeHTML(dataBR(t.created_at)),
            escapeHTML(dataBR(t.expires_at)),
            `<button class="btn btn-ghost btn-sm" data-action="revogarAcessoAuditor" data-args='${args(projectId, t.id)}'>Revogar</button>`,
        ]),
    );
}

export async function renderAcessoAuditor(el, projectId, role) {
    if (!el) return;
    if (!EQUIPE.has(role)) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <section class="card" aria-labelledby="aud-ext-titulo" style="margin-top:1.5rem;padding:1.25rem">
            <h3 id="aud-ext-titulo" style="margin:0 0 .25rem">Acesso do auditor externo</h3>
            <p class="text-muted" style="margin:0 0 1rem">O link dá ao auditor do organismo certificador leitura da SoA e das evidências deste projeto até o prazo. Revogue quando a auditoria terminar.</p>
            <div style="display:flex;gap:.75rem;align-items:flex-end">
                <div class="form-group" style="margin:0">
                    <label class="form-label" for="aud-ext-dias">Validade em dias (1 a 365)</label>
                    <input class="form-input" id="aud-ext-dias" type="number" min="1" max="365" step="1" value="30" style="width:8rem">
                </div>
                <button class="btn btn-primary" data-action="gerarAcessoAuditor" data-args='${args(projectId)}'>Gerar link</button>
            </div>
            <p id="aud-ext-erro" role="alert" style="color:var(--danger);margin:.5rem 0 0"></p>
            <div id="aud-ext-novo" role="status" aria-live="polite"></div>
            <h4 style="margin:1.25rem 0 .5rem">Links válidos</h4>
            <div id="aud-ext-lista"></div>
        </section>`;
    await listar(el.querySelector('#aud-ext-lista'), projectId);
}

window.gerarAcessoAuditor = async function (projectId) {
    const erro = document.getElementById('aud-ext-erro');
    const dias = Number(document.getElementById('aud-ext-dias')?.value);
    erro.textContent = '';
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        erro.textContent = 'Informe a validade em dias, de 1 a 365.';
        return;
    }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/auditor-token`, { days_valid: dias });
        document.getElementById('aud-ext-novo').innerHTML = `
            <div style="margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:10px">
                <label class="form-label" for="aud-ext-link">Link do auditor, válido até ${escapeHTML(dataBR(r.expires_at))}</label>
                <div style="display:flex;gap:.5rem">
                    <input class="form-input" id="aud-ext-link" readonly value="${escapeHTML(r.url)}">
                    <button class="btn btn-ghost" data-action="copiarLinkAuditor">Copiar</button>
                </div>
                <p class="text-muted" style="margin:.5rem 0 0">Copie agora: o link não aparece de novo. Envie-o só ao auditor, por canal seguro.</p>
            </div>`;
        await listar(document.getElementById('aud-ext-lista'), projectId);
    } catch (e) {
        erro.textContent = e.message || 'Não foi possível gerar o link.';
    }
};

window.revogarAcessoAuditor = async function (projectId, tokenId) {
    if (!confirm('Revogar este link? O auditor perde o acesso na hora.')) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/auditor-token/${tokenId}/revogar`);
        showToast('Link revogado');
        await listar(document.getElementById('aud-ext-lista'), projectId);
    } catch (e) {
        showToast(e.message || 'Não foi possível revogar o link', 'error');
    }
};

window.copiarLinkAuditor = async function () {
    const campo = document.getElementById('aud-ext-link');
    if (!campo) return;
    try {
        await navigator.clipboard.writeText(campo.value);
        showToast('Link copiado');
    } catch {
        campo.select();
        showToast('Selecione o link e copie com Ctrl+C');
    }
};
```

Em `frontend/src/views/grc.js`, acrescente depois da linha 4: `import { renderAcessoAuditor } from './auditor-acesso.js';` e troque o fim de `renderAudits` (linhas 1453-1456) por:

```js
        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
            <div id="acesso-auditor"></div>
        `;
        await renderAcessoAuditor(c.querySelector('#acesso-auditor'), proj.id, S.user?.role);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/auditor-acesso.test.js test/delegation.test.js test/recursos-existem.test.js --pool=threads`
Expected: PASS. Se P1 trouxe o teste de contrato tela↔API, rode-o também (ele deve achar as três rotas da Task 3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/auditor-acesso.js frontend/src/views/grc.js frontend/test/auditor-acesso.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(auditor): cartão de acesso do auditor externo na tela de Auditorias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Página pública do auditor (`/auditor`)

**Files:**
- Create: `frontend/public/auditor.html`
- Create: `frontend/public/auditor.js`
- Create: `frontend/public/auditor.css`
- Create: `frontend/test/auditor-publico.test.js`
- Modify: `AGENTS.md` (lista de páginas do Frontend, depois do item de `politicas.html`), `CHANGELOG.md` (seção "Não publicado")

**Interfaces:**
- Consumes: `POST /api/v1/public/auditor/ver`, `/evidencia`, `/pedidos` (Task 2), com os corpos e respostas descritos lá; link `<APP_URL>/auditor#<token>` (Task 1).
- Produces: `window.auditorPublico = { iniciar }`. Página servida em `/auditor` pelo Workers Assets (`html_handling` padrão, como `/proposta`).

- [ ] **Step 1: Write the failing test**

`frontend/test/auditor-publico.test.js`:

```js
// Página pública do auditor externo (public/auditor.html + auditor.js + auditor.css). O que importa:
// (1) o token sai do fragmento, some da barra e só viaja no CORPO; nunca em URL nem no console;
// (2) a SoA sai na ordem do Anexo A, com a exclusão justificada e a evidência de cada controle;
// (3) baixar manda o id no corpo e salva com o nome do arquivo; a prova junta as páginas;
// (4) nada inline no HTML (CSP script-src 'self'); toda classe pa-* tem regra; tokens do app.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const HTML = lido(import.meta.glob('../public/auditor.html', { query: '?raw', import: 'default', eager: true }));
const JS = lido(import.meta.glob('../public/auditor.js', { query: '?raw', import: 'default', eager: true }));
const CSS = lido(import.meta.glob('../public/auditor.css', { query: '?raw', import: 'default', eager: true }));
const APP_CSS = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));

const TOKEN = 'b'.repeat(64);
const EV = (id, nome, avaliacao) => ({ id, file_name: nome, file_type: 'x', file_size: 10, file_hash: id.repeat(32).slice(0, 64), evaluation_status: avaliacao, created_at: '2026-10-01 10:00:00' });
const VER = {
    projeto: { client_name: 'Cliente Alfa', project_name: 'SGSI Alfa', scope: 'Operação de TI da sede', standards: 'ISO 27001:2022', org_role: 'Controller' },
    expira_em: '2026-11-06 12:00:00',
    controles: [
        { id: 'c10', standard: 'ISO 27001:2022', title: 'A.5.10 — Uso aceitável', status: 'Implemented', maturity: 3, aplicavel: true, justificativa_exclusao: null, evidencias: [] },
        { id: 'c2', standard: 'ISO 27001:2022', title: 'A.5.2 — Papéis', status: 'Partial', maturity: 2, aplicavel: true, justificativa_exclusao: null, evidencias: [EV('e1', 'matriz <b>RACI</b>.xlsx', 'conforming')] },
        { id: 'c7', standard: 'ISO 27001:2022', title: 'A.7.4 — Monitoramento físico', status: 'Not Applicable', maturity: 0, aplicavel: false, justificativa_exclusao: 'Sem instalação física própria: escritório em cowork.', evidencias: [] },
    ],
    evidencias_sem_controle: [EV('e9', 'ata.pdf', 'pending')],
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 20));
const $ = (id) => document.getElementById(id);

let fetchMock;
let consoles;
function servidor(rotas) {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
        const r = rotas[String(url).replace(/^https?:\/\/[^/]+/, '')];
        if (r === undefined) return json({ error: 'sem rota' }, 500);
        return typeof r === 'function' ? r(o) : r;
    });
}
const corpos = (fim) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(fim)).map(([, o]) => JSON.parse(o.body));

async function abre(hash = '#' + TOKEN) {
    document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
    history.replaceState(null, '', '/auditor' + hash);
    window.auditorPublico.iniciar();
    await espera();
}

beforeEach(async () => {
    try { sessionStorage.clear(); } catch { /* sem storage */ }
    await import('../public/auditor.js');
    consoles = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
    // o token nunca vai para o console, para a URL de alguma chamada nem fica na barra
    for (const c of consoles) expect(JSON.stringify(c.mock.calls)).not.toContain(TOKEN);
    for (const [u] of fetchMock?.mock.calls || []) expect(String(u)).not.toContain(TOKEN);
    expect(location.href).not.toContain(TOKEN);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('HTML da página', () => {
    it('sem script, handler nem estilo inline; script e CSS próprios; fora de busca e sem Referer', () => {
        expect(HTML).not.toMatch(/\son[a-z]+\s*=/i);
        const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
        expect(scripts).toHaveLength(1);
        expect(scripts[0][1]).toContain('src="/auditor.js"');
        expect(scripts[0][2].trim()).toBe('');
        expect(HTML).not.toMatch(/<style\b/i);
        expect(HTML).not.toMatch(/\sstyle=/i);
        expect(HTML).toContain('href="/auditor.css"');
        expect(HTML).toContain('<meta name="robots" content="noindex, nofollow">');
        expect(HTML).toContain('<meta name="referrer" content="no-referrer">');
    });
});

describe('abrir o link', () => {
    it('o token sai do fragmento, some da barra e só vai no corpo', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        expect(corpos('/ver')).toEqual([{ token: TOKEN }]);
        expect($('pa-conteudo').hidden).toBe(false);
        expect($('pa-org').textContent).toBe('SGSI Alfa');
        expect($('pa-cliente').textContent).toBe('Cliente Alfa');
        expect($('pa-escopo').textContent).toBe('Operação de TI da sede');
        expect($('pa-meta').textContent).toContain('06/11/2026');
    });

    it('F5: o token fica na sessão da aba', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        await abre('');
        expect(corpos('/ver')).toEqual([{ token: TOKEN }, { token: TOKEN }]);
    });

    it('sem token no endereço: pede o link completo e não chama a API', async () => {
        servidor({});
        await abre('');
        expect($('pa-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('404: link inválido ou expirado, sem mostrar conteúdo', async () => {
        servidor({ '/api/v1/public/auditor/ver': json({ error: 'Link inválido ou expirado' }, 404) });
        await abre();
        expect($('pa-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect($('pa-conteudo').hidden).toBe(true);
    });
});

describe('SoA', () => {
    it('ordem do Anexo A, exclusão justificada, evidência por controle e as sem controle à parte', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        expect([...document.querySelectorAll('.pa-cod')].map((t) => t.textContent)).toEqual(['A.5.2', 'A.5.10', 'A.7.4']);
        const linhas = [...document.querySelectorAll('.pa-tabela tbody tr')];
        expect(linhas[2].textContent).toContain('Não aplicável');
        expect(linhas[2].textContent).toContain('Sem instalação física própria: escritório em cowork.');
        expect(linhas[0].textContent).toContain('matriz <b>RACI</b>.xlsx');
        expect(document.querySelector('.pa-tabela b')).toBeNull();
        expect(linhas[0].textContent).toContain('Conforme');
        expect(linhas[0].textContent).toContain(VER.controles[1].evidencias[0].file_hash);
        expect(linhas[1].textContent).toContain('Nenhuma evidência ligada');
        expect($('pa-sem-controle').hidden).toBe(false);
        expect($('pa-sem-controle-lista').textContent).toContain('ata.pdf');
        expect($('pa-sem-controle-lista').textContent).toContain('Pendente de revisão');
    });
});

describe('baixar', () => {
    it('evidência: id no corpo, arquivo salvo com o nome original', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/evidencia': () => new Response('conteudo', { status: 200 }) });
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
        const nomes = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { nomes.push(this.download); });
        await abre();
        document.querySelector('button[data-baixar="e1"]').click();
        await espera();
        expect(corpos('/evidencia')).toEqual([{ token: TOKEN, evidence_id: 'e1' }]);
        expect(nomes).toEqual(['matriz <b>RACI</b>.xlsx']);
    });

    it('evidência que não abre mais (link revogado ou arquivo sumiu): aviso na página', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/evidencia': json({ error: 'Link inválido ou expirado' }, 404) });
        await abre();
        document.querySelector('button[data-baixar="e9"]').click();
        await espera();
        expect($('pa-aviso').textContent).toContain('não encontrado ou o link expirou');
    });

    it('prova dos pedidos: junta as páginas num arquivo JSON', async () => {
        servidor({
            '/api/v1/public/auditor/ver': json(VER),
            '/api/v1/public/auditor/pedidos': (o) => {
                const { pagina } = JSON.parse(o.body);
                return json(pagina === 1 ? { total: 2, pagina: 1, truncado: true, pedidos: [{ id: 'p1' }] } : { total: 2, pagina: 2, truncado: false, pedidos: [{ id: 'p2' }] });
            },
        });
        let partes;
        const BlobOriginal = Blob;
        vi.stubGlobal('Blob', class extends BlobOriginal { constructor(p, o) { super(p, o); partes = p; } });
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
        const nomes = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { nomes.push(this.download); });
        await abre();
        $('pa-prova').click();
        await espera();
        expect(corpos('/pedidos')).toEqual([{ token: TOKEN, pagina: 1 }, { token: TOKEN, pagina: 2 }]);
        expect(JSON.parse(partes[0]).pedidos.map((p) => p.id)).toEqual(['p1', 'p2']);
        expect(nomes).toEqual(['prova-dos-pedidos.json']);
    });
});

describe('auditor.css', () => {
    const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = (bruto, texto = semComentario(bruto)) => Object.fromEntries([...texto.slice(texto.indexOf(':root'), texto.indexOf('}', texto.indexOf(':root'))).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

    it('toda classe pa-* do HTML e do script tem regra', () => {
        const usadas = new Set([...HTML.matchAll(/class="([^"]*)"/g), ...JS.matchAll(/class="([^"]*)"/g)]
            .flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('pa-')));
        expect(usadas.size).toBeGreaterThan(20);
        const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(CSS));
        expect(sem, 'classes sem regra no CSS').toEqual([]);
    });

    it('os tokens são os do :root de style.css', () => {
        const daqui = tokens(CSS);
        const dele = tokens(APP_CSS);
        expect(Object.keys(daqui).length).toBeGreaterThan(8);
        expect(Object.entries(daqui).filter(([k, v]) => dele[k] !== v)).toEqual([]);
    });

    it('sem itálico e sem accent como fundo', () => {
        expect(CSS).not.toMatch(/font-style:\s*italic/);
        expect(CSS).not.toMatch(/background(-color)?:\s*var\(--accent\)/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/auditor-publico.test.js --pool=threads`
Expected: FAIL — `../public/auditor.html` não existe (`lido` devolve `undefined`).

- [ ] **Step 3: Write the page**

`frontend/public/auditor.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>Portal do auditor</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/auditor.css">
  <!-- Portal do auditor externo, só leitura. Sem script inline (CSP script-src 'self'): tudo está em
       /auditor.js. O token vem no fragmento (#...), que o navegador não envia ao servidor. -->
  <script src="/auditor.js" defer></script>
</head>
<body>
  <header class="pa-topo">
    <div class="pa-topo-int">
      <span class="pa-org" id="pa-org">Portal do auditor</span>
      <span class="pa-meta" id="pa-meta"></span>
    </div>
  </header>

  <main class="pa-main" id="pa-main">
    <section class="pa-estado" id="pa-estado" role="status" aria-live="polite">
      <h1 class="pa-estado-titulo" id="pa-estado-titulo">Carregando...</h1>
      <p class="pa-estado-texto" id="pa-estado-texto"></p>
    </section>

    <div id="pa-conteudo" hidden>
      <h1 class="pa-titulo">Declaração de Aplicabilidade e evidências</h1>
      <dl class="pa-projeto">
        <dt>Cliente</dt><dd id="pa-cliente"></dd>
        <dt>Normas</dt><dd id="pa-normas"></dd>
        <dt>Escopo</dt><dd id="pa-escopo"></dd>
      </dl>
      <p class="pa-aviso" id="pa-aviso" role="alert"></p>
      <div class="pa-acoes">
        <button type="button" class="pa-btn" id="pa-prova">Baixar a prova dos pedidos de aprovação e ciência (JSON)</button>
      </div>
      <h2 class="pa-secao">SoA</h2>
      <div id="pa-soa"></div>
      <section id="pa-sem-controle" aria-labelledby="pa-sem-controle-titulo" hidden>
        <h2 class="pa-secao" id="pa-sem-controle-titulo">Evidências sem controle ligado</h2>
        <ul class="pa-evs" id="pa-sem-controle-lista"></ul>
      </section>
    </div>
  </main>

  <footer class="pa-rodape-pagina">
    <p>Acesso somente leitura e com prazo. Não encaminhe este link.</p>
  </footer>
</body>
</html>
```

`frontend/public/auditor.js`:

```js
// Portal do auditor externo (auditor.html). Sem sessão: a credencial é o token do link, que chega
// no FRAGMENTO (#token) — o navegador não o manda ao servidor nem o põe no Referer. Ele sai da barra
// na hora (history.replaceState), fica nesta variável (e na sessão da aba, para o F5) e vai só no
// CORPO das rotas de src/routes/public-auditor.ts. Nunca em URL nem no console.
//
// Script clássico servido como está (public/): nada de import, nenhum handler inline (CSP
// script-src 'self'). Todo dado do servidor entra por textContent ou por esc().
(function () {
    const API = '/api/v1/public/auditor/';
    const INVALIDO = 'Link inválido ou expirado';
    const GUARDA = 'auditor-token';
    let token = '';
    const guardar = (t) => { try { sessionStorage.setItem(GUARDA, t); } catch { /* sem storage: F5 pede o link de novo */ } };
    const guardado = () => { try { return sessionStorage.getItem(GUARDA) || ''; } catch { return ''; } };

    const $ = (id) => document.getElementById(id);
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);

    const STATUS = { missing: 'Pendente', partial: 'Parcial', implemented: 'Implementado', approved: 'Aprovado', 'not applicable': 'Não aplicável', 'in progress': 'Em andamento' };
    const AVALIACAO = { pending: 'Pendente de revisão', conforming: 'Conforme', partial: 'Parcial', non_conforming: 'Não conforme' };
    const rotulo = (mapa, v) => mapa[String(v ?? '').toLowerCase()] || String(v ?? '');

    /** Instante do SQLite ('AAAA-MM-DD HH:MM:SS', UTC) ou ISO -> DD/MM/AAAA em Brasília. */
    function data(s) {
        if (!s) return '';
        const t = String(s);
        const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') + 'Z' : t);
        return isNaN(d) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    }

    // O código ("A.5.10") é o primeiro token do título (ver idDoControle em src/helpers.ts).
    const codigo = (titulo) => String(titulo || '').split(' ')[0];
    const tituloSemCodigo = (titulo) => String(titulo || '').slice(codigo(titulo).length).replace(/^\s*[—-]\s*/, '');
    // Ordem de leitura do auditor: A.5.2 antes de A.5.10 (texto inverteria). Mesma regra de
    // compareControlCode em frontend/src/views/compliance.js.
    function compara(x, y) {
        const seg = (s) => String(s || '').split(/[.\-_\s]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
        const A = seg(x);
        const B = seg(y);
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
            const p = A[i];
            const q = B[i];
            if (p === undefined) return -1;
            if (q === undefined) return 1;
            if (typeof p === 'number' && typeof q === 'number') { if (p !== q) return p - q; }
            else if (String(p) !== String(q)) return String(p) < String(q) ? -1 : 1;
        }
        return 0;
    }

    /** POST com o token no corpo. Falha de rede vira null. */
    async function chamar(acao, extra) {
        try {
            return await fetch(API + acao, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...extra }),
                credentials: 'omit',
                cache: 'no-store',
            });
        } catch {
            return null;
        }
    }
    async function lerJson(r) { try { return (await r.json()) || {}; } catch { return {}; } }

    function estado(titulo, texto) {
        $('pa-conteudo').hidden = true;
        $('pa-estado').hidden = false;
        $('pa-estado-titulo').textContent = titulo;
        $('pa-estado-texto').textContent = texto || '';
    }
    function falhou(r) {
        if (!r) return estado('Sem conexão', 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
        if (r.status === 404) return estado(INVALIDO, 'Peça um novo link à consultoria que conduz o projeto.');
        if (r.status === 429) return estado('Muitas tentativas', 'Tente novamente em alguns minutos.');
        return estado('Não foi possível abrir', 'Tente de novo em instantes.');
    }

    function evidencia(e) {
        return `<li class="pa-ev">
            <span class="pa-ev-nome">${esc(e.file_name)}</span>
            <span class="pa-ev-meta">${esc(data(e.created_at))} · ${esc(rotulo(AVALIACAO, e.evaluation_status))}</span>
            <code class="pa-hash" title="SHA-256 do arquivo">${esc(e.file_hash)}</code>
            <button type="button" class="pa-btn" data-baixar="${esc(e.id)}" data-nome="${esc(e.file_name)}">Baixar</button>
        </li>`;
    }

    function linha(c) {
        const evs = c.evidencias && c.evidencias.length
            ? `<ul class="pa-evs">${c.evidencias.map(evidencia).join('')}</ul>`
            : '<p class="pa-vazio">Nenhuma evidência ligada.</p>';
        const aplicabilidade = c.aplicavel
            ? 'Aplicável'
            : `Não aplicável<p class="pa-just">${esc(c.justificativa_exclusao || 'Sem justificativa registrada.')}</p>`;
        return `<tr>
            <th scope="row" class="pa-cod">${esc(codigo(c.title))}</th>
            <td>${esc(tituloSemCodigo(c.title))}</td>
            <td>${aplicabilidade}</td>
            <td>${esc(rotulo(STATUS, c.status))}</td>
            <td class="pa-num">${c.aplicavel ? esc(c.maturity ?? 0) : '—'}</td>
            <td>${evs}</td>
        </tr>`;
    }

    function mostrar(d) {
        const p = d.projeto || {};
        $('pa-org').textContent = p.project_name || p.client_name || 'Projeto';
        $('pa-meta').textContent = d.expira_em ? `Acesso válido até ${data(d.expira_em)}` : '';
        $('pa-cliente').textContent = p.client_name || '';
        $('pa-normas').textContent = p.standards || '';
        $('pa-escopo').textContent = p.scope || 'Escopo não registrado.';
        const porNorma = new Map();
        for (const c of d.controles || []) porNorma.set(c.standard, [...(porNorma.get(c.standard) || []), c]);
        $('pa-soa').innerHTML = [...porNorma.keys()].sort().map((norma) => {
            const lista = porNorma.get(norma).sort((a, b) => compara(codigo(a.title), codigo(b.title)));
            return `<section class="pa-norma" aria-label="${esc(norma)}">
                <h3 class="pa-norma-titulo">${esc(norma)} <span class="pa-conta">${lista.length} controles</span></h3>
                <div class="pa-tabela-wrap"><table class="pa-tabela">
                    <thead><tr><th scope="col">Controle</th><th scope="col">Título</th><th scope="col">Aplicabilidade</th><th scope="col">Status</th><th scope="col">Maturidade</th><th scope="col">Evidências</th></tr></thead>
                    <tbody>${lista.map(linha).join('')}</tbody>
                </table></div>
            </section>`;
        }).join('') || '<p class="pa-vazio">Nenhum controle registrado.</p>';
        const sem = d.evidencias_sem_controle || [];
        $('pa-sem-controle').hidden = !sem.length;
        $('pa-sem-controle-lista').innerHTML = sem.map(evidencia).join('');
        $('pa-estado').hidden = true;
        $('pa-conteudo').hidden = false;
    }

    async function carregar() {
        const r = await chamar('ver');
        if (!r || r.status !== 200) return falhou(r);
        mostrar(await lerJson(r));
    }

    function salvar(blob, nome) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function baixar(botao) {
        $('pa-aviso').textContent = '';
        botao.disabled = true;
        try {
            const r = await chamar('evidencia', { evidence_id: botao.dataset.baixar });
            if (!r || r.status !== 200) {
                $('pa-aviso').textContent = r && r.status === 404
                    ? 'Arquivo não encontrado ou o link expirou. Peça um novo link à consultoria.'
                    : 'Não foi possível baixar. Tente de novo.';
                return;
            }
            salvar(await r.blob(), botao.dataset.nome || 'evidencia');
        } finally {
            botao.disabled = false;
        }
    }

    // A prova é paginada no servidor (500 pedidos por página): junta tudo num arquivo só.
    async function prova(botao) {
        $('pa-aviso').textContent = '';
        botao.disabled = true;
        try {
            const pedidos = [];
            let total = 0;
            for (let pagina = 1; ; pagina++) {
                const r = await chamar('pedidos', { pagina });
                if (!r || r.status !== 200) {
                    $('pa-aviso').textContent = 'Não foi possível baixar a prova dos pedidos. Tente de novo.';
                    return;
                }
                const d = await lerJson(r);
                pedidos.push(...(d.pedidos || []));
                total = d.total || 0;
                if (!d.truncado) break;
            }
            salvar(new Blob([JSON.stringify({ total, pedidos }, null, 2)], { type: 'application/json' }), 'prova-dos-pedidos.json');
        } finally {
            botao.disabled = false;
        }
    }

    function iniciar() {
        if (!$('pa-main')) return;
        token = location.hash.slice(1);
        if (token) guardar(token); else token = guardado();
        // some da barra, do histórico e de qualquer cópia do endereço
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('pa-main').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-baixar]');
            if (b) baixar(b);
        });
        $('pa-prova').addEventListener('click', () => prova($('pa-prova')));
        if (!token) return estado(INVALIDO, 'Abra o endereço completo que recebeu, incluindo a parte depois do #.');
        carregar();
    }

    window.auditorPublico = { iniciar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
```

`frontend/public/auditor.css`:

```css
/* Portal do auditor externo (auditor.html).
 *
 * Folha própria, sem o style.css do app: os tokens abaixo são cópia do :root de src/style.css (a
 * fonte única), e frontend/test/auditor-publico.test.js compara os valores. Mudou lá, muda aqui.
 *
 * Uso esperado em computador: a tabela rola na horizontal em tela estreita, sem layout próprio de
 * celular (responsividade fora de escopo, AGENTS.md).
 */
:root {
    --accent: #00ade8;
    --bg: #0b1326;
    --surface: #162244;
    --surface-2: #1e2d52;
    --border: rgba(255, 255, 255, 0.10);
    --text: #f1f5f9;
    --text-2: #cbd5e1;
    --text-dim: #94a3b8;
    --danger: #ef4444;
    --font-head: 'Montserrat', system-ui, sans-serif;
    --font-body: 'Inter', system-ui, sans-serif;
    color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); font: 400 14px/1.55 var(--font-body); }
[hidden] { display: none !important; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.pa-topo { border-bottom: 1px solid var(--border); }
.pa-topo-int { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; max-width: 1200px; margin: 0 auto; padding: 16px 24px; }
.pa-org { font: 500 17px/1.3 var(--font-head); }
.pa-meta { font-size: 13px; color: var(--text-dim); font-variant-numeric: tabular-nums; }

.pa-main { flex: 1; width: 100%; max-width: 1200px; margin: 0 auto; padding: 24px; }
.pa-estado { max-width: 560px; margin: 48px auto; padding: 32px; background: var(--surface); border: 1px solid var(--border); }
.pa-estado-titulo { margin: 0 0 8px; font: 600 20px/1.35 var(--font-head); }
.pa-estado-texto { margin: 0; color: var(--text-2); }

.pa-titulo { margin: 0 0 16px; font: 600 22px/1.3 var(--font-head); }
.pa-projeto { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0 0 24px; }
.pa-projeto dt { color: var(--text-dim); }
.pa-projeto dd { margin: 0; white-space: pre-line; }
.pa-secao { margin: 32px 0 12px; font: 600 17px/1.3 var(--font-head); }
.pa-acoes { margin: 0 0 8px; }
.pa-aviso { min-height: 1.5em; margin: 0 0 8px; color: var(--danger); }

.pa-norma { margin: 0 0 24px; }
.pa-norma-titulo { margin: 0 0 8px; font: 600 15px/1.3 var(--font-head); }
.pa-conta { font: 400 13px var(--font-body); color: var(--text-dim); }
.pa-tabela-wrap { overflow-x: auto; border: 1px solid var(--border); }
.pa-tabela { width: 100%; border-collapse: collapse; }
.pa-tabela th, .pa-tabela td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.pa-tabela thead th { background: var(--surface); color: var(--text-2); font-weight: 500; font-size: 13px; }
.pa-cod { white-space: nowrap; font-weight: 500; }
.pa-num { font-variant-numeric: tabular-nums; }
.pa-just { margin: 4px 0 0; color: var(--text-2); font-size: 13px; }
.pa-vazio { margin: 0; color: var(--text-dim); }

.pa-evs { list-style: none; margin: 0; padding: 0; }
.pa-ev { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 6px 0; }
.pa-ev + .pa-ev { border-top: 1px solid var(--border); }
.pa-ev-nome { overflow-wrap: anywhere; }
.pa-ev-meta { grid-column: 1; font-size: 13px; color: var(--text-dim); }
.pa-hash { grid-column: 1; font-size: 12px; color: var(--text-dim); overflow-wrap: anywhere; }
.pa-ev .pa-btn { grid-column: 2; grid-row: 1 / span 3; align-self: center; }

.pa-btn { min-height: 36px; padding: 6px 14px; border: 1px solid var(--accent); border-radius: 10px; background: transparent; color: var(--accent); font: 500 13px var(--font-body); cursor: pointer; }
.pa-btn:hover { background: var(--surface-2); }
.pa-btn:disabled { opacity: .6; cursor: wait; }

.pa-rodape-pagina { border-top: 1px solid var(--border); padding: 16px 24px; color: var(--text-dim); font-size: 13px; text-align: center; }
.pa-rodape-pagina p { margin: 0; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/auditor-publico.test.js test/recursos-existem.test.js test/proposta-publica.test.js --pool=threads`
Expected: PASS. Se o teste de tokens acusar diferença, o valor certo é o de `frontend/src/style.css` (`:root`): copie de lá, não do plano.

- [ ] **Step 5: Docs**

`AGENTS.md`, na lista do Frontend, logo depois do item de `frontend/public/politicas.html` (antes de "Arquivo novo em `frontend/public/`…"):

```markdown
  - `frontend/public/auditor.html` (+ `auditor.js`, `auditor.css`) — portal do auditor externo,
    somente leitura. Serve `/auditor`; o link sai de `POST /api/v1/projects/:id/auditor-token` (cartão
    em Auditorias) com o token no fragmento, e a página fala só com `/api/v1/public/auditor/*`
    (`src/routes/public-auditor.ts`), token no corpo, só o hash no banco.
```

`CHANGELOG.md`, em `## [Não publicado]`, acrescente na seção `### Adicionado`:

```markdown
- Portal do auditor externo: a consultoria gera, lista e revoga pela tela de Auditorias um link com prazo (`GET|POST /api/v1/projects/:id/auditor-token`, `.../:tokenId/revogar`; o cliente não gera); o auditor abre `/auditor#<token>` e vê o projeto, a SoA (27001 e 27701) com a evidência de cada controle, baixa os arquivos e a prova dos pedidos. Cada download entra na trilha.
```

e crie (se ainda não houver) a seção `### Segurança` com:

```markdown
- Token do auditor guardado só em SHA-256, com revogação (migration 0045; os tokens anteriores deixam de valer) e prazo comparado até o minuto (antes valia até o fim do dia do vencimento). As rotas `/api/v1/auditor/:token/*`, que punham o token no log de requisição, saem: o portal usa `POST /api/v1/public/auditor/{ver,evidencia,pedidos,notas,notas/criar}` com o token no corpo e limite por IP. O portal não leva mais a linha inteira do projeto (`repository_token`, CNPJ) e o nome do arquivo baixado é codificado no cabeçalho.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/public/auditor.html frontend/public/auditor.js frontend/public/auditor.css frontend/test/auditor-publico.test.js AGENTS.md CHANGELOG.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(auditor): página pública do auditor com SoA, evidência por controle e download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Fechamento (depois da Task 5)

- [ ] `npx tsc --noEmit` na raiz e `cd mcp-server-niso && npx tsc --noEmit` — sem erro.
- [ ] Suíte completa do backend (~20 min): `npx vitest run` — cole a contagem de arquivos e testes e o exit code.
- [ ] Suíte do frontend: `cd frontend && npx vitest run --pool=threads` — cole a saída.
- [ ] Build do frontend: `cd frontend && npm run build`, e confira que `frontend/dist/auditor.html`, `auditor.js` e `auditor.css` existem.
- [ ] Sonda local (opcional, sem escrita em produção): `npx wrangler dev`, gere um link como platform_admin num projeto local e abra `http://localhost:8787/auditor#<token>`; confira a SoA, um download e, no DevTools, que nenhuma requisição leva o token na URL.
- [ ] Antes do merge (ação do dono): procedimento da 0045 em `migrations/README.md` (backup → apply → list → `PRAGMA table_info(auditor_tokens)`).
