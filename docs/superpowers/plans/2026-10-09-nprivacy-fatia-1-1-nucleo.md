# n.privacy, fatia 1.1 — módulos, partes, vínculos e departamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao projeto módulos habilitáveis (com teto na organização), partes com papel por vínculo e departamentos: só banco e API, sem tela e sem tocar em dado existente.

**Architecture:** Migration 0047 aditiva (4 tabelas, 1 coluna, 1 gatilho). Um router só, `src/routes/nucleo.ts`, montado em `/api/v1/projects/:projectId`, que herda o `projectAccessMiddleware`. Constantes e schemas em `src/schemas/nucleo.ts`. `partes` entra na busca do titular (LGPD art. 18).

**Tech Stack:** Hono, D1, Zod 4, Vitest com `cloudflare:test`.

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seções 4.1, 4.2, 4.3 e a fatia 1 da seção 9. Aprovada pelo dono em 2026-10-08.

## Cortes e decisões deste plano

A spec não fixa estes pontos; o plano decide e o dono pode trocar:

1. **Matriz papel × alvo** (`MATRIZ_PAPEL_ALVO`, Tarefa 2): sem ela qualquer combinação entraria, como `encarregado` num departamento.
2. **`item` e `tratamento` ainda não têm tabela**: vínculo para eles é recusado com 400 até a fatia 1.2 (itens) e a do RoPA (tratamentos).
3. **Sem `DELETE` de parte nem de departamento**, só `status` inativo (a pessoa que sai continua na trilha). Vínculo tem `DELETE`.
4. **Gatilho** dá o módulo `iso` a todo projeto, qualquer que seja o caminho que o crie (3 rotas e SQL direto).
5. **Reduzir o contrato da organização abaixo do que um projeto dela já habilitou**: 409.
6. **`partes.user_id` fica fora da API**: ligar conta exige regra de organização e entra na 1.3 (conciliação).
7. **Sem vigência por vínculo, sem hierarquia de departamento** (cortes ponytail da própria spec).

## Global Constraints

- Schema muda em **dois** lugares: `schema.sql` e migration; em `schema.sql`, índice **depois** da tabela (`AGENTS.md`).
- Migration em produção só com o "sim" do dono, depois de `npm run db:backup`. O ambiente `production` só aceita a `main`: aplicar pelo terminal antes do merge, ou mergear, rodar *Apply DB migrations* e *Deploy* (`migrations/README.md`).
- Todo write passa por `validateBody`; toda rota com corpo entra em `src/openapi.ts`; depois `npm run openapi` (regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`).
- **Sem `any` novo**: `test/any-catraca.test.ts` reprova se a contagem subir (`TETO` 543).
- CPF nunca entra (spec 4.2).
- Todo `project_id` vindo de URL; todo id de alvo no corpo é conferido contra o projeto.
- Commits com autor `44273656+resper1965@users.noreply.github.com` (`git -c user.name="Ricardo Esper" -c user.email=... commit`), sem `Co-Authored-By`. Antes de abrir PR, rodar `test/sem-dado-de-cliente.test.ts`; nunca citar cliente ou pessoa real em código, teste ou documento.
- Frontend não é tocado nesta fatia.

## Review Focus

Os cinco modos de falha que a spec implica e nenhum teste óbvio cobriria, do mais provável ao menos:

1. **Vínculo para departamento ou parte de OUTRO projeto**: 400 e nada gravado (Tarefa 3, teste "alvo de outro projeto").
2. **Habilitar módulo não contratado, ou desabilitar o último**: 409 nos dois (Tarefa 2).
3. **Baixar o contrato abaixo do que está habilitado**: 409 (Tarefa 2).
4. **Papel que não serve ao alvo** (`encarregado` num departamento) e **alvo `item`**: 400 (Tarefa 3).
5. **Busca e eliminação do titular alcançam `partes`**: e-mail e nome ali são dado pessoal (Tarefa 4).

---

### Task 1: Migration 0047 e schema.sql

**Files:**
- Create: `migrations/0047_nucleo_partes_modulos.sql`
- Modify: `schema.sql` (coluna em `organizations`; bloco novo no fim do arquivo)
- Modify: `migrations/README.md` (estado e seção da 0047)
- Modify: `test/contrato-isolamento-org.test.ts` (`VALOR_FIXO`)
- Test: `test/migration-0047.test.ts`

**Interfaces:**
- Produces: tabelas `projeto_modulos(project_id, modulo, habilitado_em, habilitado_por)`, `departamentos(id, project_id, nome, status, created_at, updated_at)`, `partes(id, project_id, tipo, nome, email, user_id, status, created_at, updated_at)`, `parte_vinculos(id, project_id, parte_id, papel, alvo_tipo, alvo_id, created_at)`; coluna `organizations.modulos_contratados` (JSON, padrão `["iso"]`); gatilho `projeto_modulo_iso_padrao`. As Tarefas 2 a 4 dependem destes nomes.

- [ ] **Step 1: Escrever o teste que falha**

`test/migration-0047.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0047 from '../migrations/0047_nucleo_partes_modulos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const tenta = (sql: string, ...b: unknown[]) =>
  env.DB.prepare(sql).bind(...b).run().then(() => 'aceitou', (e: unknown) => String((e as Error).message));
const projeto = (id: string) => env.DB.prepare(
  `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001', 'controller', 'Active')`
).bind(id).run();
const modulos = async (id: string) =>
  (await env.DB.prepare('SELECT modulo, habilitado_por FROM projeto_modulos WHERE project_id = ?').bind(id).all()).results;

describe('migration 0047 — módulos, partes, vínculos e departamentos', () => {
  it('o schema canônico tem as tabelas, a coluna e o gatilho', async () => {
    await applySchema();
    expect(await colunas('partes')).toEqual(['id', 'project_id', 'tipo', 'nome', 'email', 'user_id', 'status', 'created_at', 'updated_at']);
    expect(await colunas('parte_vinculos')).toEqual(['id', 'project_id', 'parte_id', 'papel', 'alvo_tipo', 'alvo_id', 'created_at']);
    expect(await colunas('departamentos')).toEqual(['id', 'project_id', 'nome', 'status', 'created_at', 'updated_at']);
    expect(await colunas('projeto_modulos')).toEqual(['project_id', 'modulo', 'habilitado_em', 'habilitado_por']);
    expect(await colunas('organizations')).toContain('modulos_contratados');
    expect(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='projeto_modulo_iso_padrao'").first()).toBeTruthy();
    expect(await env.DB.prepare("SELECT modulos_contratados m FROM organizations WHERE id = 'org_ness'").first()).toEqual({ m: '["iso"]' });
  });

  it('projeto criado por SQL direto nasce com o módulo iso', async () => {
    await projeto('p47-novo');
    expect(await modulos('p47-novo')).toEqual([{ modulo: 'iso', habilitado_por: 'sistema' }]);
  });

  it('recusa módulo, tipo, papel e alvo fora da lista, e duplicata de vínculo e de departamento', async () => {
    await projeto('p47-chk');
    expect(await tenta(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p47-chk', 'xpto')`)).toMatch(/CHECK/i);
    expect(await tenta(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('x1', 'p47-chk', 'robo', 'N')`)).toMatch(/CHECK/i);
    await env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa47', 'p47-chk', 'Ana')`).run();
    const v = (id: string, papel: string, alvo: string) => tenta(
      `INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, 'p47-chk', 'pa47', ?, ?, 'p47-chk')`, id, papel, alvo);
    expect(await v('v0', 'rei', 'projeto')).toMatch(/CHECK/i);
    expect(await v('v1', 'encarregado', 'galaxia')).toMatch(/CHECK/i);
    expect(await v('v2', 'encarregado', 'projeto')).toBe('aceitou');
    expect(await v('v3', 'encarregado', 'projeto')).toMatch(/UNIQUE/i);
    await env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d1', 'p47-chk', 'TI')`).run();
    expect(await tenta(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d2', 'p47-chk', 'TI')`)).toMatch(/UNIQUE/i);
  });

  it('apagar o projeto leva módulos, partes, vínculos e departamentos', async () => {
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p47-chk'`).run();
    for (const t of ['projeto_modulos', 'partes', 'parte_vinculos', 'departamentos']) {
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE project_id = 'p47-chk'`).first(), t).toEqual({ n: 0 });
    }
  });

  it('aplicada sobre o banco ANTERIOR, a migration dá iso aos projetos que já existiam', async () => {
    await applySchema();
    await execSql(`DROP TRIGGER IF EXISTS projeto_modulo_iso_padrao;
      DROP TABLE IF EXISTS parte_vinculos; DROP TABLE IF EXISTS partes; DROP TABLE IF EXISTS departamentos; DROP TABLE IF EXISTS projeto_modulos;
      ALTER TABLE organizations DROP COLUMN modulos_contratados;`);
    expect(await colunas('partes')).toEqual([]);
    await projeto('p47-antigo');
    await execSql(migration0047);
    expect(await modulos('p47-antigo')).toEqual([{ modulo: 'iso', habilitado_por: 'migration-0047' }]);
    expect(await colunas('organizations')).toContain('modulos_contratados');
    expect(await colunas('partes')).toContain('nome');
  }, 30_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --maxWorkers=1 test/migration-0047.test.ts`
Expected: FAIL (o arquivo `0047_nucleo_partes_modulos.sql` não existe, o import quebra).

- [ ] **Step 3: Escrever a migration**

`migrations/0047_nucleo_partes_modulos.sql`:

```sql
-- 0047 — núcleo do n.privacy, fatia 1.1: módulos, partes, vínculos e departamentos
-- (spec 2026-10-06-nucleo-comum-nprivacy-design, seções 4.1 a 4.3).
--
-- Aditiva: 4 tabelas novas, 1 coluna nova com padrão e 1 gatilho. Nenhuma tabela existente perde dado.
-- `organizations.modulos_contratados` é o teto do que cada projeto da consultoria pode habilitar
-- (JSON; padrão '["iso"]'). `projeto_modulos` guarda o que cada projeto habilitou; todo projeto
-- existente recebe 'iso' aqui, e o gatilho dá 'iso' a todo projeto novo, qualquer que seja o caminho.
-- ALTER ... ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE organizations ADD COLUMN modulos_contratados TEXT NOT NULL DEFAULT '["iso"]';

CREATE TABLE IF NOT EXISTS projeto_modulos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    habilitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    habilitado_por TEXT NOT NULL DEFAULT 'sistema',
    PRIMARY KEY (project_id, modulo)
);
INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
    SELECT id, 'iso', 'migration-0047' FROM projects;
CREATE TRIGGER IF NOT EXISTS projeto_modulo_iso_padrao AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (NEW.id, 'iso', 'sistema');
END;

CREATE TABLE IF NOT EXISTS departamentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, nome)
);

-- Pessoa ou organização do projeto. O papel é do vínculo, não da parte. Sem CPF (spec 4.2).
-- user_id liga a pessoa à conta quando existe; a API da 1.1 não o escreve (entra na conciliação, 1.3).
CREATE TABLE IF NOT EXISTS partes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'pessoa' CHECK (tipo IN ('pessoa', 'organizacao')),
    nome TEXT NOT NULL,
    email TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partes_projeto ON partes(project_id, status);

-- alvo_id não tem FK: aponta para tabelas diferentes conforme alvo_tipo. A API confere que o alvo
-- existe NO projeto antes de gravar.
CREATE TABLE IF NOT EXISTS parte_vinculos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada')),
    alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('projeto', 'item', 'departamento', 'tratamento', 'parte')),
    alvo_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parte_id, papel, alvo_tipo, alvo_id)
);
CREATE INDEX IF NOT EXISTS idx_parte_vinculos_alvo ON parte_vinculos(project_id, alvo_tipo, alvo_id);
```

- [ ] **Step 4: Espelhar no schema.sql**

Em `schema.sql`, na tabela `organizations`, troque a última coluna por (ganha vírgula e a coluna nova):

```sql
    logo_chave TEXT,
    -- Módulos que a consultoria contratou: o teto do que cada projeto pode habilitar (migration 0047).
    modulos_contratados TEXT NOT NULL DEFAULT '["iso"]'
);
```

E acrescente **no fim do arquivo** o mesmo bloco da migration, sem o `ALTER`, sem o `INSERT OR IGNORE ... SELECT` e sem o comentário de cabeçalho: `CREATE TABLE IF NOT EXISTS projeto_modulos`, o `CREATE TRIGGER IF NOT EXISTS projeto_modulo_iso_padrao`, `departamentos`, `partes` com `idx_partes_projeto` e `parte_vinculos` com `idx_parte_vinculos_alvo`, nessa ordem (o gatilho depois de `projeto_modulos`, cada índice depois da sua tabela).

- [ ] **Step 5: Teste de contrato de isolamento — valores de coluna com CHECK**

Em `test/contrato-isolamento-org.test.ts`, no objeto `VALOR_FIXO`, acrescente (o semeador genérico não conhece o `CHECK`):

```ts
  parte_vinculos: { papel: 'responsavel', alvo_tipo: 'projeto' },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run --maxWorkers=1 test/migration-0047.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts`
Expected: PASS.
Run: `npx vitest run --maxWorkers=1 test/contrato-isolamento-org.test.ts`
Expected: PASS (a semeadura genérica insere uma linha em cada tabela nova).

- [ ] **Step 7: Documentar a migration**

Em `migrations/README.md`: no bloco "Estado", troque `**0046**` por `**0047**` e `44` por `45` arquivos `.sql`. No fim do arquivo, acrescente:

```markdown
## 0047 — núcleo do n.privacy, fatia 1.1 (2026-10)

Cria `projeto_modulos`, `departamentos`, `partes` e `parte_vinculos`, acrescenta
`organizations.modulos_contratados` (padrão `["iso"]`) e o gatilho `projeto_modulo_iso_padrao`. Os
projetos que já existem recebem o módulo `iso`. Só `CREATE ... IF NOT EXISTS` e um `ALTER ... ADD COLUMN`
(não idempotente: aplicar duas vezes falha com "duplicate column"). Nenhuma tabela existente perde dado.

Conferência depois de aplicar: `PRAGMA table_info(partes)` mostra `id, project_id, tipo, nome, email,
user_id, status, created_at, updated_at`; `SELECT modulo, count(*) FROM projeto_modulos GROUP BY modulo`
mostra `iso` com a contagem de `projects`; `PRAGMA table_info(organizations)` lista `modulos_contratados`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply") →
merge, porque `deploy.yml` recusa migration pendente.
```

- [ ] **Step 8: Commit**

```bash
git add migrations/0047_nucleo_partes_modulos.sql schema.sql migrations/README.md test/migration-0047.test.ts test/contrato-isolamento-org.test.ts
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): migration 0047 — módulos, partes, vínculos e departamentos"
```

---

### Task 2: Módulos por projeto e contrato da organização

**Files:**
- Create: `src/schemas/nucleo.ts`, `src/routes/nucleo.ts`
- Modify: `src/schemas/index.ts` (`export * from './nucleo';`), `src/index.ts` (import e mount), `src/routes/organizacoes.ts` (rota nova), `src/openapi.ts` (2 entradas)
- Test: `test/nucleo-modulos.test.ts`

**Interfaces:**
- Consumes: tabelas e coluna da Tarefa 1; `podeAdministrarOrg(user, orgId)`, `erro500`, `logAudit` de `src/helpers.ts`.
- Produces: `MODULOS`, `type Modulo`, `parseModulos(bruto): Modulo[]`, `moduloHabilitarSchema`, `orgModulosSchema` (em `src/schemas/nucleo.ts`); `nucleoApp` (em `src/routes/nucleo.ts`, onde a Tarefa 3 acrescenta rotas); rotas `GET /api/v1/projects/:projectId/modulos`, `PUT /api/v1/projects/:projectId/modulos/:modulo`, `PUT /api/v1/platform/orgs/:id/modulos`.

- [ ] **Step 1: Escrever o teste que falha**

`test/nucleo-modulos.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());

const P = '/api/v1/projects/pm1';
let plat: Record<string, string>, cadm: Record<string, string>, cadmB: Record<string, string>, consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b', 'B', 'b')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pm1', 'C', 'ISO 27001', 'controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES
      ('u-pa', 'pa@ness.lat', 'x', 'P', 'platform_admin', 'org_ness'),
      ('u-ca', 'ca@ness.lat', 'x', 'C', 'consultoria_admin', 'org_ness'),
      ('u-cb', 'cb@b.lat', 'x', 'C', 'consultoria_admin', 'org_b')`),
  ]);
  await designarConsultor('co@ness.lat', 'pm1');
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cadm = await sessionFor({ id: 'u-ca', email: 'ca@ness.lat', role: 'consultoria_admin' });
  cadmB = await sessionFor({ id: 'u-cb', email: 'cb@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
  consultor = await sessionFor({ id: 'cons:co@ness.lat', email: 'co@ness.lat', role: 'consultor' });
});

describe('módulos por projeto, com teto na organização', () => {
  it('projeto novo tem iso e a organização contratou só iso', async () => {
    const r = await chamar(plat, 'GET', `${P}/modulos`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ habilitados: ['iso'], contratados: ['iso'] });
  });

  it('habilitar módulo não contratado: 409 (o teto vale até para o platform_admin)', async () => {
    expect((await chamar(plat, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(409);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(409);
  });

  it('só o platform_admin contrata; a consultoria não muda o próprio teto', async () => {
    expect((await chamar(cadm, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso', 'privacy'] })).status).toBe(403);
    const r = await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso', 'privacy'] });
    expect(r.status).toBe(200);
    expect(await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_inexistente/modulos', { modulos: ['iso'] }).then((x) => x.status)).toBe(404);
  });

  it('o administrador da consultoria habilita; consultor, outra consultoria e corpo ruim são recusados', async () => {
    expect((await chamar(consultor, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(403);
    expect([403, 404]).toContain((await chamar(cadmB, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/xpto`, { habilitado: true })).status).toBe(400);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: 'sim' })).status).toBe(400);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: true })).status).toBe(200);
    expect(await (await chamar(plat, 'GET', `${P}/modulos`)).json()).toEqual({ habilitados: ['iso', 'privacy'], contratados: ['iso', 'privacy'] });
    const trilha = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = 'projeto.modulo' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(trilha?.project_id).toBe('pm1');
  });

  it('o projeto não fica sem módulo: desabilitar o último é 409', async () => {
    expect((await chamar(cadm, 'PUT', `${P}/modulos/iso`, { habilitado: false })).status).toBe(200);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: false })).status).toBe(409);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/iso`, { habilitado: true })).status).toBe(200);
  });

  it('baixar o contrato abaixo do que há habilitado: 409; depois de desligar, passa', async () => {
    const r = await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso'] });
    expect(r.status).toBe(409);
    expect((await r.json() as { error: string }).error).toMatch(/privacy.*1 projeto/);
    expect((await chamar(cadm, 'PUT', `${P}/modulos/privacy`, { habilitado: false })).status).toBe(200);
    expect((await chamar(plat, 'PUT', '/api/v1/platform/orgs/org_ness/modulos', { modulos: ['iso'] })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --maxWorkers=1 test/nucleo-modulos.test.ts`
Expected: FAIL (as rotas respondem 404).

- [ ] **Step 3: Schemas**

`src/schemas/nucleo.ts`:

```ts
import { z } from 'zod';

export const MODULOS = ['iso', 'privacy'] as const;
export type Modulo = (typeof MODULOS)[number];

/** `organizations.modulos_contratados` é JSON gravado pela rota validada; JSON ruim cai no padrão. */
export function parseModulos(bruto: string | null | undefined): Modulo[] {
  try {
    const v: unknown = JSON.parse(bruto ?? '[]');
    const ok = Array.isArray(v) ? MODULOS.filter((m) => v.includes(m)) : [];
    return ok.length ? ok : ['iso'];
  } catch {
    return ['iso'];
  }
}

export const moduloHabilitarSchema = z.object({ habilitado: z.boolean() });
export const orgModulosSchema = z.object({ modulos: z.array(z.enum(MODULOS)).min(1).max(MODULOS.length) });
```

Em `src/schemas/index.ts`, junto dos outros `export *`: `export * from './nucleo';`

- [ ] **Step 4: Router de módulos**

`src/routes/nucleo.ts`:

```ts
import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit, podeAdministrarOrg } from '../helpers';
import { validateBody, moduloHabilitarSchema, MODULOS, parseModulos, type Modulo } from '../schemas';

/**
 * Núcleo do n.privacy, fatia 1.1: módulos, departamentos, partes e vínculos. Montado em
 * `/api/v1/projects/:projectId`, então o `projectAccessMiddleware` já cortou o projeto antes daqui.
 */
export const nucleoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function estadoDosModulos(db: D1Database, projectId: string) {
  const [hab, proj] = await Promise.all([
    db.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind(projectId).all<{ modulo: string }>(),
    db.prepare('SELECT p.org_id, o.modulos_contratados AS contratados FROM projects p LEFT JOIN organizations o ON o.id = p.org_id WHERE p.id = ?')
      .bind(projectId).first<{ org_id: string | null; contratados: string | null }>(),
  ]);
  return { habilitados: hab.results.map((r) => r.modulo), contratados: parseModulos(proj?.contratados), orgId: proj?.org_id ?? null };
}

nucleoApp.get('/modulos', async (c) => {
  const { habilitados, contratados } = await estadoDosModulos(c.env.DB, c.req.param('projectId')!);
  return c.json({ habilitados, contratados });
});

nucleoApp.put('/modulos/:modulo', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const modulo = c.req.param('modulo');
    if (!(MODULOS as readonly string[]).includes(modulo)) return c.json({ error: 'Módulo desconhecido' }, 400);
    const v = await validateBody(c, moduloHabilitarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    const user = c.get('user');
    const est = await estadoDosModulos(db, projectId);
    if (!podeAdministrarOrg(user, est.orgId)) return c.json({ error: 'Forbidden: só o administrador da consultoria habilita módulo' }, 403);
    const ligado = est.habilitados.includes(modulo);
    if (v.data.habilitado) {
      if (!est.contratados.includes(modulo as Modulo)) return c.json({ error: 'Módulo não contratado pela organização' }, 409);
      if (!ligado) {
        await db.prepare('INSERT INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (?, ?, ?)').bind(projectId, modulo, user.email).run();
      }
    } else if (ligado) {
      if (est.habilitados.length === 1) return c.json({ error: 'O projeto precisa de ao menos um módulo' }, 409);
      await db.prepare('DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = ?').bind(projectId, modulo).run();
    }
    await logAudit(db, 'projeto.modulo', user.email, `Módulo ${modulo} ${v.data.habilitado ? 'habilitado' : 'desabilitado'}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao alterar o módulo', e); }
});
```

Em `src/index.ts`: ao lado de `import { governanceApp } from './routes/governance';` acrescente `import { nucleoApp } from './routes/nucleo';`, e depois da linha `app.route('/api/v1/projects/:projectId/certification', projectCertificationsApp);` acrescente:

```ts
app.route('/api/v1/projects/:projectId', nucleoApp);
```

- [ ] **Step 5: Contrato da organização**

Em `src/routes/organizacoes.ts`, no import de `'../schemas'` acrescente `orgModulosSchema, MODULOS`, e depois da rota `organizacoesApp.put('/:id', ...)` acrescente:

```ts
/** Módulos que a consultoria contratou: o teto do que cada projeto dela pode habilitar. */
organizacoesApp.put('/:id/modulos', async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, orgModulosSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    if (!(await db.prepare('SELECT 1 FROM organizations WHERE id = ?').bind(id).first())) return c.json({ error: 'Organização não encontrada' }, 404);
    const modulos = MODULOS.filter((m) => v.data.modulos.includes(m));
    for (const m of MODULOS.filter((x) => !modulos.includes(x))) {
      const em = await db.prepare(
        `SELECT count(*) AS n FROM projeto_modulos pm JOIN projects p ON p.id = pm.project_id WHERE p.org_id = ? AND pm.modulo = ?`
      ).bind(id, m).first<{ n: number }>();
      if (em && em.n > 0) return c.json({ error: `O módulo ${m} está habilitado em ${em.n} projeto(s) da organização` }, 409);
    }
    await db.prepare('UPDATE organizations SET modulos_contratados = ? WHERE id = ?').bind(JSON.stringify(modulos), id).run();
    await logAudit(db, 'org.modulos', c.get('user').email, `Organização ${id}: módulos contratados ${JSON.stringify(modulos)}`);
    return c.json({ ok: true, modulos });
  } catch (e) { return erro500(c, 'Erro ao atualizar os módulos', e); }
});
```

- [ ] **Step 6: OpenAPI**

Em `src/openapi.ts`, no import de `'./schemas'` (termina na linha `} from './schemas';`) acrescente `moduloHabilitarSchema, orgModulosSchema`, e no array de rotas com corpo acrescente:

```ts
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/modulos/:modulo', schema: moduloHabilitarSchema, nome: 'moduloHabilitarSchema' },
  { metodo: 'PUT', caminho: '/api/v1/platform/orgs/:id/modulos', schema: orgModulosSchema, nome: 'orgModulosSchema' },
```

Run: `npm run openapi` (regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`).

- [ ] **Step 7: Rodar e ver passar**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=1 test/nucleo-modulos.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-writes-validados.test.ts test/any-catraca.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src test/nucleo-modulos.test.ts docs/openapi.json mcp-server-niso/src/contrato-gerado.ts
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): módulos por projeto com teto na organização"
```

---

### Task 3: Departamentos, partes e vínculos

**Files:**
- Modify: `src/schemas/nucleo.ts` (schemas e matriz), `src/routes/nucleo.ts` (rotas), `src/openapi.ts` (5 entradas), `test/contrato-isolamento-org.test.ts` (`CORPOS`)
- Test: `test/nucleo-partes.test.ts`

**Interfaces:**
- Consumes: `nucleoApp` e `estadoDosModulos` (não usada aqui) da Tarefa 2.
- Produces: `MATRIZ_PAPEL_ALVO`, `PAPEIS_VINCULO`, `ALVOS_VINCULO`, `departamentoCriarSchema`, `departamentoAtualizarSchema`, `parteCriarSchema`, `parteAtualizarSchema`, `vinculoCriarSchema`; rotas `GET|POST /departamentos`, `PUT /departamentos/:id`, `GET|POST /partes`, `GET|PUT /partes/:id`, `POST /partes/:id/vinculos`, `DELETE /partes/:id/vinculos/:vinculoId`.

- [ ] **Step 1: Escrever o teste que falha**

`test/nucleo-partes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;

const criar = async (base: string, recurso: string, corpo: unknown) => {
  const r = await chamar(plat, 'POST', `${base}/${recurso}`, corpo);
  expect(r.status, JSON.stringify(corpo)).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const nVinculos = async (parte: string) =>
  (await env.DB.prepare('SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = ?').bind(parte).first<{ n: number }>())!.n;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('departamentos', () => {
  it('cria, lista, recusa nome repetido e inativa', async () => {
    const id = await criar(A, 'departamentos', { nome: 'Tecnologia' });
    expect(await json<{ nome: string }[]>(await chamar(plat, 'GET', `${A}/departamentos`))).toMatchObject([{ id, nome: 'Tecnologia', status: 'ativo' }]);
    expect((await chamar(plat, 'POST', `${A}/departamentos`, { nome: 'Tecnologia' })).status).toBe(409);
    expect((await chamar(plat, 'POST', `${B}/departamentos`, { nome: 'Tecnologia' })).status).toBe(201); // outro projeto, outro nome livre
    expect((await chamar(plat, 'POST', `${A}/departamentos`, { nome: '  ' })).status).toBe(400);
    expect((await chamar(plat, 'PUT', `${A}/departamentos/${id}`, { status: 'inativo' })).status).toBe(200);
    expect((await json<{ status: string }[]>(await chamar(plat, 'GET', `${A}/departamentos`)))[0].status).toBe('inativo');
  });

  it('departamento de outro projeto é 404 pela rota do projeto', async () => {
    const dB = (await json<{ id: string }[]>(await chamar(plat, 'GET', `${B}/departamentos`)))[0].id;
    expect((await chamar(plat, 'PUT', `${A}/departamentos/${dB}`, { nome: 'Invasor' })).status).toBe(404);
  });
});

describe('partes', () => {
  it('cria pessoa e organização, filtra, atualiza e inativa', async () => {
    const ana = await criar(A, 'partes', { nome: 'Ana Exemplo', email: 'Ana@Exemplo.COM.br' });
    const org = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo' });
    const um = await json<{ nome: string; email: string; tipo: string; vinculos: unknown[] }>(await chamar(plat, 'GET', `${A}/partes/${ana}`));
    expect(um).toMatchObject({ nome: 'Ana Exemplo', email: 'ana@exemplo.com.br', tipo: 'pessoa', vinculos: [] });
    expect((await json<unknown[]>(await chamar(plat, 'GET', `${A}/partes?tipo=organizacao`)))).toMatchObject([{ id: org }]);
    expect((await chamar(plat, 'PUT', `${A}/partes/${ana}`, { email: null, status: 'inativa' })).status).toBe(200);
    expect(await json(await chamar(plat, 'GET', `${A}/partes/${ana}`))).toMatchObject({ email: null, status: 'inativa' });
    expect((await json<unknown[]>(await chamar(plat, 'GET', `${A}/partes?status=ativa`)))).toMatchObject([{ id: org }]);
  });

  it('recusa e-mail inválido, tipo inválido e nome vazio; parte de outro projeto é 404', async () => {
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: 'X', email: 'nao-e-email' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: 'X', tipo: 'robo' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: '' })).status).toBe(400);
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B' });
    expect((await chamar(plat, 'GET', `${A}/partes/${deB}`)).status).toBe(404);
    expect((await chamar(plat, 'PUT', `${A}/partes/${deB}`, { nome: 'Invasor' })).status).toBe(404);
  });
});

describe('vínculos', () => {
  let parte: string, dep: string;
  beforeAll(async () => {
    parte = await criar(A, 'partes', { nome: 'Beto Exemplo' });
    dep = await criar(A, 'departamentos', { nome: 'Jurídico' });
  });
  const vincular = (id: string, corpo: unknown, base = A) => chamar(plat, 'POST', `${base}/partes/${id}/vinculos`, corpo);

  it('encarregado do projeto: grava, repetir é 409, remover tira', async () => {
    const r = await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' });
    expect(r.status).toBe(201);
    const vid = (await json<{ id: string }>(r)).id;
    expect((await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(409);
    expect((await json<{ vinculos: unknown[] }>(await chamar(plat, 'GET', `${A}/partes/${parte}`))).vinculos).toHaveLength(1);
    expect((await chamar(plat, 'DELETE', `${A}/partes/${parte}/vinculos/${vid}`)).status).toBe(200);
    expect(await nVinculos(parte)).toBe(0);
    expect((await chamar(plat, 'DELETE', `${A}/partes/${parte}/vinculos/${vid}`)).status).toBe(404);
  });

  it('responsável de um departamento do projeto: ok', async () => {
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: dep })).status).toBe(201);
  });

  it('alvo de OUTRO projeto: 400 e nada gravado', async () => {
    const depB = (await json<{ id: string }[]>(await chamar(plat, 'GET', `${B}/departamentos`)))[0].id;
    const antes = await nVinculos(parte);
    const r = await vincular(parte, { papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: depB });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toMatch(/inexistente ou de outro projeto/);
    expect((await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-b' })).status).toBe(400);
    expect(await nVinculos(parte)).toBe(antes);
  });

  it('papel que não serve ao alvo: 400; alvo item ainda não existe: 400', async () => {
    const r = await vincular(parte, { papel: 'encarregado', alvo_tipo: 'departamento', alvo_id: dep });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toMatch(/não se aplica/);
    const i = await vincular(parte, { papel: 'dono_sistema', alvo_tipo: 'item', alvo_id: 'qualquer' });
    expect(i.status).toBe(400);
    expect((await json<{ error: string }>(i)).error).toMatch(/ainda não existe/);
    expect((await vincular(parte, { papel: 'rei', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(400);
  });

  it('suboperador aponta para outra parte do projeto; parte de outro projeto é recusada', async () => {
    const operador = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Operadora Exemplo' });
    const sub = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Suboperadora Exemplo' });
    expect((await vincular(sub, { papel: 'suboperador', alvo_tipo: 'parte', alvo_id: operador })).status).toBe(201);
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B 2' });
    expect((await vincular(sub, { papel: 'suboperador', alvo_tipo: 'parte', alvo_id: deB })).status).toBe(400);
  });

  it('vínculo de parte que não é do projeto da URL: 404', async () => {
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B 3' });
    expect((await vincular(deB, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --maxWorkers=1 test/nucleo-partes.test.ts`
Expected: FAIL (rotas 404).

- [ ] **Step 3: Schemas e matriz**

Acrescente a `src/schemas/nucleo.ts`:

```ts
export const PAPEIS_VINCULO = ['encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada'] as const;
export const ALVOS_VINCULO = ['projeto', 'item', 'departamento', 'tratamento', 'parte'] as const;
export type PapelVinculo = (typeof PAPEIS_VINCULO)[number];
export type AlvoVinculo = (typeof ALVOS_VINCULO)[number];

/** Que papel faz sentido em que alvo. Decisão do plano da fatia 1.1: a spec fixa os dois conjuntos, não o cruzamento. */
export const MATRIZ_PAPEL_ALVO: Record<AlvoVinculo, readonly PapelVinculo[]> = {
  projeto: ['encarregado', 'terceiro', 'operador', 'cocontrolador', 'parte_interessada', 'responsavel'],
  departamento: ['responsavel'],
  parte: ['suboperador'],
  item: ['dono_sistema', 'dono_processo', 'responsavel', 'operador'],
  tratamento: ['operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel'],
};

const nome = z.string().trim().min(1).max(200);
const email = z.string().trim().email().max(320);

export const departamentoCriarSchema = z.object({ nome });
export const departamentoAtualizarSchema = z.object({ nome: nome.optional(), status: z.enum(['ativo', 'inativo']).optional() });
export const parteCriarSchema = z.object({ tipo: z.enum(['pessoa', 'organizacao']).default('pessoa'), nome, email: email.optional().nullable() });
export const parteAtualizarSchema = z.object({ nome: nome.optional(), email: email.optional().nullable(), status: z.enum(['ativa', 'inativa']).optional() });
export const vinculoCriarSchema = z.object({ papel: z.enum(PAPEIS_VINCULO), alvo_tipo: z.enum(ALVOS_VINCULO), alvo_id: z.string().trim().min(1).max(100) });
```

- [ ] **Step 4: Rotas**

No topo de `src/routes/nucleo.ts`, ajuste o import de `'../schemas'` para incluir `departamentoCriarSchema, departamentoAtualizarSchema, parteCriarSchema, parteAtualizarSchema, vinculoCriarSchema, MATRIZ_PAPEL_ALVO, type AlvoVinculo`. Acrescente ao fim do arquivo:

```ts
const unico = (e: unknown) => String((e as { message?: string })?.message ?? e).includes('UNIQUE');

// ─── departamentos ─────────────────────────────────────────────────────────
nucleoApp.get('/departamentos', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM departamentos WHERE project_id = ? ORDER BY nome').bind(c.req.param('projectId')!).all();
  return c.json(r.results);
});

nucleoApp.post('/departamentos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare('INSERT INTO departamentos (id, project_id, nome) VALUES (?, ?, ?)').bind(id, projectId, v.data.nome).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.criado', c.get('user').email, `Departamento ${v.data.nome} criado`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o departamento', e); }
});

nucleoApp.put('/departamentos/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoAtualizarSchema);
    if (!v.success) return v.response;
    try {
      const r = await c.env.DB.prepare(
        `UPDATE departamentos SET nome = COALESCE(?, nome), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
      ).bind(v.data.nome ?? null, v.data.status ?? null, c.req.param('id'), projectId).run();
      if (!r.meta.changes) return c.json({ error: 'Departamento não encontrado' }, 404);
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.atualizado', c.get('user').email, `Departamento ${c.req.param('id')} atualizado`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o departamento', e); }
});

// ─── partes ────────────────────────────────────────────────────────────────
nucleoApp.get('/partes', async (c) => {
  const { tipo, status } = c.req.query();
  const where = ['project_id = ?'];
  const binds: string[] = [c.req.param('projectId')!];
  if (tipo === 'pessoa' || tipo === 'organizacao') { where.push('tipo = ?'); binds.push(tipo); }
  if (status === 'ativa' || status === 'inativa') { where.push('status = ?'); binds.push(status); }
  const r = await c.env.DB.prepare(`SELECT * FROM partes WHERE ${where.join(' AND ')} ORDER BY nome`).bind(...binds).all();
  return c.json(r.results);
});

nucleoApp.get('/partes/:id', async (c) => {
  const projectId = c.req.param('projectId')!;
  const parte = await c.env.DB.prepare('SELECT * FROM partes WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  if (!parte) return c.json({ error: 'Parte não encontrada' }, 404);
  const vinculos = await c.env.DB.prepare('SELECT id, papel, alvo_tipo, alvo_id, created_at FROM parte_vinculos WHERE parte_id = ? AND project_id = ? ORDER BY created_at')
    .bind(c.req.param('id'), projectId).all();
  return c.json({ ...parte, vinculos: vinculos.results });
});

nucleoApp.post('/partes', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, parteCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, projectId, v.data.tipo, v.data.nome, v.data.email?.toLowerCase() ?? null).run();
    await logAudit(c.env.DB, 'parte.criada', c.get('user').email, `Parte ${v.data.tipo} criada`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a parte', e); }
});

nucleoApp.put('/partes/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const id = c.req.param('id');
    const v = await validateBody(c, parteAtualizarSchema);
    if (!v.success) return v.response;
    const atual = await c.env.DB.prepare('SELECT nome, email, status FROM partes WHERE id = ? AND project_id = ?')
      .bind(id, projectId).first<{ nome: string; email: string | null; status: string }>();
    if (!atual) return c.json({ error: 'Parte não encontrada' }, 404);
    const email = v.data.email === undefined ? atual.email : (v.data.email?.toLowerCase() ?? null);
    await c.env.DB.prepare('UPDATE partes SET nome = ?, email = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?')
      .bind(v.data.nome ?? atual.nome, email, v.data.status ?? atual.status, id, projectId).run();
    await logAudit(c.env.DB, 'parte.atualizada', c.get('user').email, `Parte ${id} atualizada`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a parte', e); }
});

// ─── vínculos ──────────────────────────────────────────────────────────────
/** `item` entra na fatia 1.2 e `tratamento` na do RoPA: até lá o alvo não existe. */
async function conferirAlvo(db: D1Database, projectId: string, tipo: AlvoVinculo, id: string): Promise<'ok' | 'inexistente' | 'indisponivel'> {
  if (tipo === 'projeto') return id === projectId ? 'ok' : 'inexistente';
  const tabela = tipo === 'departamento' ? 'departamentos' : tipo === 'parte' ? 'partes' : null;
  if (!tabela) return 'indisponivel';
  // `tabela` sai das constantes acima, nunca da requisição; o id vai por bind.
  return (await db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND project_id = ?`).bind(id, projectId).first()) ? 'ok' : 'inexistente';
}

nucleoApp.post('/partes/:id/vinculos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const parteId = c.req.param('id');
    const v = await validateBody(c, vinculoCriarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    if (!(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(parteId, projectId).first())) return c.json({ error: 'Parte não encontrada' }, 404);
    const { papel, alvo_tipo, alvo_id } = v.data;
    if (!MATRIZ_PAPEL_ALVO[alvo_tipo].includes(papel)) return c.json({ error: `O papel ${papel} não se aplica a ${alvo_tipo}` }, 400);
    const alvo = await conferirAlvo(db, projectId, alvo_tipo, alvo_id);
    if (alvo === 'indisponivel') return c.json({ error: `O alvo ${alvo_tipo} ainda não existe nesta versão` }, 400);
    if (alvo === 'inexistente') return c.json({ error: 'Alvo inexistente ou de outro projeto' }, 400);
    const id = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, projectId, parteId, papel, alvo_tipo, alvo_id).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Esse vínculo já existe' }, 409);
      throw e;
    }
    await logAudit(db, 'parte.vinculada', c.get('user').email, `Parte ${parteId}: ${papel} em ${alvo_tipo}`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao vincular a parte', e); }
});

nucleoApp.delete('/partes/:id/vinculos/:vinculoId', async (c) => {
  try {
    const r = await c.env.DB.prepare('DELETE FROM parte_vinculos WHERE id = ? AND parte_id = ? AND project_id = ?')
      .bind(c.req.param('vinculoId'), c.req.param('id'), c.req.param('projectId')!).run();
    if (!r.meta.changes) return c.json({ error: 'Vínculo não encontrado' }, 404);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o vínculo', e); }
});
```

A exclusão de vínculo é `DELETE` sob `/projects/:projectId/...`, que `src/trilha-exclusao.ts` já classifica como "de projeto" e registra sozinha (`registro.excluido`).

- [ ] **Step 5: OpenAPI e contrato de isolamento**

Em `src/openapi.ts`, acrescente ao import de `'./schemas'`: `departamentoCriarSchema, departamentoAtualizarSchema, parteCriarSchema, parteAtualizarSchema, vinculoCriarSchema`, e ao array:

```ts
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/departamentos', schema: departamentoCriarSchema, nome: 'departamentoCriarSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/departamentos/:id', schema: departamentoAtualizarSchema, nome: 'departamentoAtualizarSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/partes', schema: parteCriarSchema, nome: 'parteCriarSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/partes/:id', schema: parteAtualizarSchema, nome: 'parteAtualizarSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/partes/:id/vinculos', schema: vinculoCriarSchema, nome: 'vinculoCriarSchema' },
```

Em `test/contrato-isolamento-org.test.ts`, no objeto `CORPOS`, acrescente (corpos válidos, para a recusa vir da guarda de organização e não de um 400):

```ts
  'PUT /api/v1/projects/:projectId/modulos/:modulo': () => ({ habilitado: true }),
  'POST /api/v1/projects/:projectId/departamentos': () => ({ nome: 'Varredura' }),
  'PUT /api/v1/projects/:projectId/departamentos/:id': () => ({ nome: 'Varredura' }),
  'POST /api/v1/projects/:projectId/partes': () => ({ nome: 'Varredura' }),
  'PUT /api/v1/projects/:projectId/partes/:id': () => ({ nome: 'Varredura' }),
  'POST /api/v1/projects/:projectId/partes/:id/vinculos': (alvo) => ({ papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: alvo.rec }),
```

Run: `npm run openapi`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=1 test/nucleo-partes.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-writes-validados.test.ts test/trilha-exclusao.test.ts test/any-catraca.test.ts`
Expected: PASS.
Run: `npx vitest run --maxWorkers=1 test/contrato-isolamento-org.test.ts`
Expected: PASS. Se a varredura apontar uma rota nossa em 400, o corpo da entrada de `CORPOS` dela está errado: corrija o corpo, não a rota.

- [ ] **Step 7: Commit**

```bash
git add src test docs/openapi.json mcp-server-niso/src/contrato-gerado.ts
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): departamentos, partes e vínculos por projeto"
```

---

### Task 4: Titular, retenção, contagens e verificação final

**Files:**
- Modify: `src/services/data-subject.ts` (`FONTES_PII`), `docs/retencao.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`
- Test: `test/nucleo-titular.test.ts`

**Interfaces:**
- Consumes: rota `POST /partes` da Tarefa 3.

- [ ] **Step 1: Escrever o teste que falha**

`test/nucleo-titular.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());

let plat: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('direitos do titular alcançam as partes', () => {
  it('acha por e-mail, anonimiza nome e e-mail, e não toca no outro projeto', async () => {
    const email = 'titular.exemplo@exemplo.com.br';
    await chamar(plat, 'POST', '/api/v1/projects/proj-a/partes', { nome: 'Titular Exemplo', email });
    await chamar(plat, 'POST', '/api/v1/projects/proj-b/partes', { nome: 'Titular Exemplo', email });

    const busca = await (await chamar(plat, 'GET', `/api/v1/projects/proj-a/data-subject?identificador=${encodeURIComponent(email)}`)).json() as
      { encontrado: boolean; ocorrencias: { tabela: string; registros: unknown[] }[] };
    expect(busca.encontrado).toBe(true);
    expect(busca.ocorrencias.find((o) => o.tabela === 'partes')?.registros).toHaveLength(1);

    const er = await chamar(plat, 'POST', '/api/v1/projects/proj-a/data-subject/erase', { identificador: email, justificativa: 'Pedido do titular, art. 18, VI' });
    expect(er.status).toBe(200);
    const a = await env.DB.prepare(`SELECT nome, email FROM partes WHERE project_id = 'proj-a'`).first<{ nome: string; email: string }>();
    expect(a).toEqual({ nome: '[ANONIMIZADO]', email: '' });
    const b = await env.DB.prepare(`SELECT nome, email FROM partes WHERE project_id = 'proj-b'`).first<{ nome: string; email: string }>();
    expect(b).toEqual({ nome: 'Titular Exemplo', email });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --maxWorkers=1 test/nucleo-titular.test.ts`
Expected: FAIL (`encontrado` é `false`: `partes` não está em `FONTES_PII`).

- [ ] **Step 3: Implementar**

Em `src/services/data-subject.ts`, acrescente ao array `FONTES_PII`, depois da entrada de `stakeholders`:

```ts
  {
    tabela: 'partes',
    colunaProjeto: 'project_id',
    identificadores: ['nome', 'email'],
    anonimizar: { nome: '[ANONIMIZADO]', email: '' },
    descricao: 'Parte cadastrada no núcleo (pessoa ou organização, com papel por vínculo)',
  },
```

Em `docs/retencao.md`, na seção "O que NÃO é apagado, e por quê", acrescente um parágrafo:

```markdown
**`partes`, `parte_vinculos`, `departamentos` e `projeto_modulos` também não.** São o cadastro que o
cliente mantém: quem é o encarregado, quem responde por quê. O prazo é decisão dele. Nome e e-mail em
`partes` são dado pessoal, e por isso a busca e a eliminação do titular (`FONTES_PII`) as alcançam: a
pessoa é anonimizada, o vínculo e o fato ficam.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run --maxWorkers=1 test/nucleo-titular.test.ts test/data-subject.test.ts`
Expected: PASS.

- [ ] **Step 5: Contagens e CHANGELOG**

Meça com os comandos do `AGENTS.md` e atualize os números dele e do `README.md`: tabelas (`grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`, hoje 59, deve dar 63), última migration (0047), arquivos de rota (`ls src/routes/*.ts | grep -vc '\.test\.ts$'`, hoje 42, deve dar 43), arquivos de teste (`ls test/*.test.ts | wc -l`). Em `CHANGELOG.md`, em `## [Não publicado]`, acrescente em `### Adicionado`:

```markdown
- Núcleo do n.privacy, fatia 1.1 (migration 0047): módulos por projeto com teto na organização (`GET|PUT /api/v1/projects/:projectId/modulos`, `PUT /api/v1/platform/orgs/:id/modulos`), departamentos, partes (pessoa ou organização) e vínculos com papel (`/api/v1/projects/:projectId/departamentos|partes`). Só banco e API; sem tela. Nome e e-mail das partes entram na busca e na eliminação do titular.
```

- [ ] **Step 6: Verificação final**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=2 > "$SCRATCH/n11.log" 2>&1; echo "VITEST_EXIT=$?"` — Expected: `VITEST_EXIT=0`; conferir no log `Test Files ... passed` sem `failed` e sem `Failed to start`.
Run: `npx vitest run test/sem-dado-de-cliente.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit, PR e migration**

```bash
git add src docs AGENTS.md README.md CHANGELOG.md test
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): partes entram na busca do titular; contagens e CHANGELOG"
git push -u origin <branch>
gh pr create --base main
```

Abrir o PR **sem merge**. A migration em produção e o merge dependem do "sim" do dono, na ordem de `migrations/README.md` (seção 0047): backup, aplicar, conferir com `PRAGMA`, merge, `/health`.

---

## Auto-revisão

- **Cobertura da spec (4.1, 4.2, 4.3):** `projeto_modulos` e teto (T1, T2); `partes` e `parte_vinculos` com papel por vínculo (T1, T3); `departamentos` (T1, T3); encarregado como vínculo ao projeto (T3, teste "encarregado do projeto"); CPF fora (sem coluna). Fora desta fatia, por desenho: `itens` e migração dos ativos (1.2), `owner`/`assigned_to` virando parte e migração de `project_governance`, `vendors` e `stakeholders` (1.3), contato público do encarregado e separar DPO de CISO em `autoridadeDeAssinatura` (1.3, por tocar assinatura).
- **Placeholders:** nenhum. Os passos que dizem "acrescente" trazem o texto exato; o único trecho descrito em prosa é o espelho do DDL no `schema.sql` (T1 Step 4), que é o mesmo SQL da migration listado no Step 3, sem `ALTER` nem `INSERT ... SELECT`.
- **Consistência de nomes:** `nucleoApp`, `estadoDosModulos`, `MODULOS`, `parseModulos`, `MATRIZ_PAPEL_ALVO`, `conferirAlvo` e os nomes dos schemas são os mesmos nas tarefas que os definem, usam e registram no OpenAPI. As colunas dos testes (`project_id`, `alvo_tipo`, `alvo_id`, `habilitado_por`) são as do DDL.
- **Limite honesto:** o plano foi escrito sem rodar o código novo. O DDL foi provado num SQLite em memória (gatilho, `CHECK`, `UNIQUE`, cascata); o resto será provado pelos próprios testes na execução. Se a varredura de isolamento reportar algo que o plano não previu, a correção entra na tarefa que o causou.
