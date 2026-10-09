# n.privacy, fatia 1.2 — itens e migração dos ativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os ativos passam a viver em `itens` (núcleo fino) mais `item_seguranca` (bloco do n.iso), sem perder um dado e **sem mudar uma vírgula da API de ativos**.

**Architecture:** Migration 0048 que **renomeia** `assets` para `itens` (ids e linhas ficam onde estão), move as colunas de segurança para `item_seguranca` e solta as que sobram. Um serviço (`src/services/itens.ts`) traduz o formato antigo da API para as tabelas novas, de modo que tela, MCP e CSV não percebem a troca.

**Tech Stack:** Hono, D1, Vitest com `cloudflare:test`.

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.4 e a fatia 1 da seção 9. Depende da fatia 1.1 (`departamentos`, migration 0047).

## Cortes e decisões deste plano

A spec fixa o destino, não o caminho. O plano decide e o dono pode trocar:

1. **Renomear em vez de copiar.** A spec manda copiar `assets` para `itens` com o mesmo id. Mas `risks.asset_id` tem `FOREIGN KEY ... REFERENCES assets(id)` no `schema.sql`; depois da cópia, um risco ligado a item **novo** violaria a FK, e consertar isso exigiria reconstruir `risks` em produção. `ALTER TABLE assets RENAME TO itens` faz o SQLite reescrever a FK sozinho, não copia linha nenhuma e preserva todos os ids.
2. **Produção não tem essa FK** (`risks` lá só aponta para `projects`): é deriva que já existia. Medido em 2026-10-09, só leitura: 27 ativos em 3 projetos, todos `Active`, 20 riscos com `asset_id`, **0 órfãos, 0 de outro projeto**, `category` e `owner` preenchidos nos 27, `type` vazio nos 27. A migration funciona nos dois mundos.
3. **`item_seguranca.project_id`**: a spec não o lista, mas a portabilidade (LGPD art. 18, V) exporta só tabela com `project_id`; sem ele, classificação e notas CID sairiam do export.
4. **`item_seguranca.subtipo`** guarda o antigo `assets.type` (livre), para não perder campo. Vazio em produção hoje.
5. **`itens.responsavel_texto`** guarda o antigo `assets.owner` enquanto o dono não vira vínculo (fatia 1.3). Preenchido nos 27 de produção.
6. **`item_privacidade` fica de fora**: ninguém o consome antes do RoPA; criar a tabela depois é aditivo e barato.
7. **Sem view `assets`**: a API de ativos devolve o mesmo JSON de antes, montado pelo serviço; os 22 pontos de teste que mexiam direto em `assets` passam a usar dois auxiliares.
8. **`assets` não sai "no PR seguinte"**: com o rename ela já não existe.

## Global Constraints

- Schema muda em **dois** lugares: `schema.sql` e migration; índice depois da tabela; as colunas de `itens` no `schema.sql` na **mesma ordem** que a migration produz (o teste compara).
- Migration em produção só com o "sim" do dono, depois de `npm run db:backup`. O ambiente `production` só aceita a `main`.
- **A API de ativos não muda**: mesmas rotas, mesmos campos, `status` continua `Active`/`Removido`. Frontend, MCP e `docs/openapi.json` ficam como estão.
- **Sem `any` novo** (`test/any-catraca.test.ts`, `TETO` 543).
- Todo nome de coluna que entra em SQL vem da tabela fixa `CAMPOS` do serviço, nunca da requisição.
- Commits com autor `44273656+resper1965@users.noreply.github.com`, sem `Co-Authored-By`; rodar `test/sem-dado-de-cliente.test.ts` antes do PR; nunca citar cliente ou pessoa real.
- **Janela de produção:** entre aplicar a 0048 e o deploy do código novo (cerca de 10 minutos), as rotas de ativos e a criação de risco com `asset_id` respondem 500 no código antigo. Com 27 ativos em 3 projetos o efeito é pequeno; aplicar e publicar em seguida, em horário calmo.

## Review Focus

1. **Risco ligado a um item NOVO** (criado depois da migration) em banco novo, com a FK: 201 (Tarefa 2).
2. **Ativo removido não aparece** na listagem nem no CSV, e remover duas vezes é 404 (Tarefa 2, já coberto por teste existente, que passa a usar os auxiliares).
3. **Migração sem perda:** mesma contagem, mesmos ids, todo `risks.asset_id` resolvido, nenhum campo vazio que antes tinha valor, `Removido` vira `removido` e o resto vira `ativo` (Tarefa 1).
4. **Item de outro tipo não aparece em `/assets`** (`sistema`, `base`, `processo`): o serviço filtra `tipo = 'ativo'` (Tarefa 2).
5. **A FK de `risks` aponta para `itens`** no `schema.sql` e na migration sobre banco com a FK (Tarefa 1).

---

### Task 1: Migration 0048 e schema.sql

**Files:**
- Create: `migrations/0048_itens_ativos.sql`
- Modify: `schema.sql` (tabela `assets` vira `itens` + `item_seguranca`; FK de `risks`; índice)
- Modify: `migrations/README.md`
- Test: `test/migration-0048.test.ts`

**Interfaces:**
- Produces: `itens(id, project_id, nome, descricao, responsavel_texto, created_at, updated_at, status, tipo, departamento_id)` e `item_seguranca(item_id, project_id, categoria, subtipo, classificacao, criticidade, localizacao, nota_c, nota_i, nota_d)`. A Tarefa 2 depende destes nomes.

- [ ] **Step 1: Escrever o teste que falha**

`test/migration-0048.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0048 from '../migrations/0048_itens_ativos.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);
const um = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

describe('migration 0048 — assets viram itens', () => {
  it('o schema canônico tem itens e item_seguranca; assets não existe mais; risks aponta para itens', async () => {
    await applySchema();
    expect(await colunas('itens')).toEqual(['id', 'project_id', 'nome', 'descricao', 'responsavel_texto', 'created_at', 'updated_at', 'status', 'tipo', 'departamento_id']);
    expect(await colunas('item_seguranca')).toEqual(['item_id', 'project_id', 'categoria', 'subtipo', 'classificacao', 'criticidade', 'localizacao', 'nota_c', 'nota_i', 'nota_d']);
    expect(await colunas('assets')).toEqual([]);
    expect(await um<{ t: string }>(`SELECT "table" AS t FROM pragma_foreign_key_list('risks') WHERE "from" = 'asset_id'`)).toEqual({ t: 'itens' });
  });

  it('item novo nasce ativo, recusa status e tipo fora da lista, e risco pode apontar para ele', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p48a','C','ISO 27001','controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO itens (id, project_id, nome) VALUES ('i-novo','p48a','Servidor')`).run();
    expect(await um(`SELECT status, tipo FROM itens WHERE id = 'i-novo'`)).toEqual({ status: 'ativo', tipo: 'ativo' });
    const recusa = (sql: string) => env.DB.prepare(sql).run().then(() => 'aceitou', (e: unknown) => String((e as Error).message));
    expect(await recusa(`INSERT INTO itens (id, project_id, nome, status) VALUES ('x1','p48a','N','Active')`)).toMatch(/CHECK/i);
    expect(await recusa(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('x2','p48a','N','robo')`)).toMatch(/CHECK/i);
    expect(await recusa(`INSERT INTO risks (id, project_id, asset_id, asset, threat) VALUES ('r-novo','p48a','i-novo','A','T')`)).toBe('aceitou');
    await env.DB.prepare(`DELETE FROM itens WHERE id = 'i-novo'`).run();
    expect(await um(`SELECT asset_id FROM risks WHERE id = 'r-novo'`)).toEqual({ asset_id: null });
  });

  it('aplicada sobre o formato antigo, não perde id, campo, risco nem estado', async () => {
    // O banco de teste já está no formato novo. Roda a migration sobre CÓPIAS sufixadas do formato antigo
    // (assets_t, risks_t): os nomes mudam, a lógica não.
    const sufixar = (sql: string) => sql
      .replace(/\bassets\b/g, 'assets_t').replace(/\bitens\b/g, 'itens_t').replace(/\bitem_seguranca\b/g, 'item_seguranca_t');
    await execSql(`
      CREATE TABLE assets_t (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT, category TEXT,
        classification TEXT DEFAULT 'Confidential', criticality TEXT DEFAULT 'Medium', description TEXT, owner TEXT, location TEXT,
        status TEXT DEFAULT 'Active', confidentiality_rating INTEGER DEFAULT 3, integrity_rating INTEGER DEFAULT 3,
        availability_rating INTEGER DEFAULT 3, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE risks_t (id TEXT PRIMARY KEY, project_id TEXT, asset_id TEXT REFERENCES assets_t(id) ON DELETE SET NULL);
      CREATE INDEX idx_assets_project ON assets_t(project_id);
    `);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p48b','C','ISO 27001','controller','Active')`).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, category, owner, criticality, classification, location, description, confidentiality_rating, integrity_rating, availability_rating, status)
        VALUES ('a1','p48b','ERP','Software','TI','High','Restricted','AWS','desc',1,2,5,'Active')`),
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, status, type) VALUES ('a2','p48b','Velho','Removido','Hardware')`),
      env.DB.prepare(`INSERT INTO assets_t (id, project_id, name, status) VALUES ('a3','p48b','Sem status',NULL)`),
      env.DB.prepare(`INSERT INTO risks_t (id, project_id, asset_id) VALUES ('rt1','p48b','a1'), ('rt2','p48b','a2')`),
    ]);

    await execSql(sufixar(migration0048));

    expect(await um(`SELECT count(*) AS n FROM itens_t`)).toEqual({ n: 3 });
    expect(await um(`SELECT count(*) AS n FROM item_seguranca_t`)).toEqual({ n: 3 });
    expect(await um(`SELECT count(*) AS n FROM risks_t r JOIN itens_t i ON i.id = r.asset_id`)).toEqual({ n: 2 });
    expect(await um(`SELECT "table" AS t FROM pragma_foreign_key_list('risks_t') WHERE "from" = 'asset_id'`)).toEqual({ t: 'itens_t' });
    expect(await um(`SELECT i.nome, i.responsavel_texto, i.descricao, s.categoria, s.criticidade, s.classificacao, s.localizacao, s.nota_c, s.nota_i, s.nota_d
      FROM itens_t i JOIN item_seguranca_t s ON s.item_id = i.id WHERE i.id = 'a1'`))
      .toEqual({ nome: 'ERP', responsavel_texto: 'TI', descricao: 'desc', categoria: 'Software', criticidade: 'High', classificacao: 'Restricted', localizacao: 'AWS', nota_c: 1, nota_i: 2, nota_d: 5 });
    expect((await env.DB.prepare(`SELECT id, status FROM itens_t ORDER BY id`).all()).results).toEqual([
      { id: 'a1', status: 'ativo' }, { id: 'a2', status: 'removido' }, { id: 'a3', status: 'ativo' },
    ]);
    expect(await um(`SELECT subtipo FROM item_seguranca_t WHERE item_id = 'a2'`)).toEqual({ subtipo: 'Hardware' });
    expect(await colunas('itens_t')).toEqual(await colunas('itens'));
    expect(await colunas('item_seguranca_t')).toEqual(await colunas('item_seguranca'));

    await execSql('DROP TABLE risks_t; DROP TABLE item_seguranca_t; DROP TABLE itens_t;');
  }, 30_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --maxWorkers=1 test/migration-0048.test.ts`
Expected: FAIL (o arquivo `0048_itens_ativos.sql` não existe).

- [ ] **Step 3: Escrever a migration**

`migrations/0048_itens_ativos.sql`:

```sql
-- 0048 — núcleo do n.privacy, fatia 1.2: os ativos viram itens (spec 2026-10-06, seção 4.4).
--
-- `assets` é RENOMEADA para `itens`, não copiada: os ids e as linhas ficam onde estão, e o SQLite reescreve
-- sozinho a FK de `risks.asset_id` (que em banco novo aponta para `assets`). As colunas de segurança vão
-- para `item_seguranca` (1:1, mesmo id); as que sobram no núcleo ganham o nome em português e as antigas
-- são soltas. `Removido` vira 'removido'; qualquer outro valor (inclusive NULL) vira 'ativo'.
-- Em produção (2026-10-09): 27 ativos, 3 projetos, todos 'Active', 20 riscos ligados, 0 órfãos.
--
-- RENAME COLUMN, ADD COLUMN e DROP COLUMN não são idempotentes: aplicar duas vezes falha.
ALTER TABLE assets RENAME TO itens;

CREATE TABLE IF NOT EXISTS item_seguranca (
    item_id TEXT PRIMARY KEY REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT,
    subtipo TEXT,
    classificacao TEXT DEFAULT 'Confidential',
    criticidade TEXT DEFAULT 'Medium',
    localizacao TEXT,
    nota_c INTEGER DEFAULT 3,
    nota_i INTEGER DEFAULT 3,
    nota_d INTEGER DEFAULT 3
);
INSERT INTO item_seguranca (item_id, project_id, categoria, subtipo, classificacao, criticidade, localizacao, nota_c, nota_i, nota_d)
    SELECT id, project_id, category, type, classification, criticality, location, confidentiality_rating, integrity_rating, availability_rating FROM itens;

ALTER TABLE itens RENAME COLUMN name TO nome;
ALTER TABLE itens RENAME COLUMN description TO descricao;
ALTER TABLE itens RENAME COLUMN owner TO responsavel_texto;
ALTER TABLE itens RENAME COLUMN status TO status_legado;
ALTER TABLE itens ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido'));
UPDATE itens SET status = CASE WHEN status_legado = 'Removido' THEN 'removido' ELSE 'ativo' END;
ALTER TABLE itens ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ativo' CHECK (tipo IN ('sistema', 'ativo', 'base', 'processo'));
ALTER TABLE itens ADD COLUMN departamento_id TEXT REFERENCES departamentos(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_assets_project;
ALTER TABLE itens DROP COLUMN status_legado;
ALTER TABLE itens DROP COLUMN type;
ALTER TABLE itens DROP COLUMN category;
ALTER TABLE itens DROP COLUMN classification;
ALTER TABLE itens DROP COLUMN criticality;
ALTER TABLE itens DROP COLUMN location;
ALTER TABLE itens DROP COLUMN confidentiality_rating;
ALTER TABLE itens DROP COLUMN integrity_rating;
ALTER TABLE itens DROP COLUMN availability_rating;
CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(project_id, tipo, status);
```

- [ ] **Step 4: Espelhar no schema.sql**

Em `schema.sql`:

1. Troque o `CREATE TABLE IF NOT EXISTS assets (...)` inteiro por:

```sql
-- Itens do inventário (migration 0048; eram `assets`). Núcleo fino: o que os dois produtos usam.
-- `responsavel_texto` é transitório: o dono vira vínculo em `parte_vinculos` (fatia 1.3).
CREATE TABLE IF NOT EXISTS itens (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    responsavel_texto TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    tipo TEXT NOT NULL DEFAULT 'ativo' CHECK (tipo IN ('sistema', 'ativo', 'base', 'processo')),
    departamento_id TEXT REFERENCES departamentos(id) ON DELETE SET NULL
);

-- Bloco do n.iso (1:1). `project_id` repete o do item porque a portabilidade exporta por essa coluna.
CREATE TABLE IF NOT EXISTS item_seguranca (
    item_id TEXT PRIMARY KEY REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT,
    subtipo TEXT,
    classificacao TEXT DEFAULT 'Confidential',
    criticidade TEXT DEFAULT 'Medium',
    localizacao TEXT,
    nota_c INTEGER DEFAULT 3,
    nota_i INTEGER DEFAULT 3,
    nota_d INTEGER DEFAULT 3
);
```

2. Em `risks`, troque `asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,` por `asset_id TEXT REFERENCES itens(id) ON DELETE SET NULL,`.
3. Troque a linha `CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);` (se estiver em outro ponto do arquivo, ela vem logo depois da tabela) por `CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(project_id, tipo, status);`, depois de `item_seguranca`.

Confira: `git grep -n "assets" schema.sql` não pode listar mais nada além de comentários.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run --maxWorkers=1 test/migration-0048.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts`
Expected: `migration-0048` PASS. `schema-contract` e `colunas-catraca` **vão falhar** até a Tarefa 2 (eles ainda inserem em `assets`); é esperado e a Tarefa 2 os corrige. Não commite a Tarefa 1 isolada se algum teste de aplicação falhar: as Tarefas 1 e 2 vão no mesmo commit de verificação final.

- [ ] **Step 6: Documentar a migration**

Em `migrations/README.md`: no bloco "Estado" troque `**0047**` por `**0048**` e o número de arquivos `.sql` (`ls migrations/*.sql | wc -l`). No fim do arquivo acrescente:

```markdown
---

## 0048 — itens e ativos (fatia 1.2, 2026-10)

Renomeia `assets` para `itens`, cria `item_seguranca` (1:1) e solta as colunas que mudaram de lugar. Em
produção (conferido em 2026-10-09, só leitura): 27 ativos em 3 projetos, todos `Active`, 20 riscos com
`asset_id`, 0 órfãos; `risks` lá **não tem** FK para `assets`. **RENAME e DROP COLUMN não são
idempotentes: aplicar duas vezes falha.** Depende da 0047 (`departamentos`).

Conferência depois de aplicar: `SELECT count(*) FROM itens` e `SELECT count(*) FROM item_seguranca` (27 e
27 em produção); `SELECT count(*) FROM risks r JOIN itens i ON i.id = r.asset_id` (20);
`PRAGMA table_info(itens)` lista `id, project_id, nome, descricao, responsavel_texto, created_at,
updated_at, status, tipo, departamento_id`; `SELECT status, count(*) FROM itens GROUP BY status`.

**Esta RODA em produção e tem janela:** entre aplicar e o deploy do código novo (cerca de 10 minutos), o
código antigo responde 500 nas rotas de ativos. Ordem: `npm run db:backup` → aplicar (a 0047, se ainda
pendente, entra junto) → conferir → merge → `/health`. Em horário calmo.
```

- [ ] **Step 7: Sem commit ainda** (a Tarefa 2 fecha o estado verde).

---

### Task 2: Serviço de itens e as rotas

**Files:**
- Create: `src/services/itens.ts`
- Modify: `src/routes/project-assets.ts`, `src/routes/platform.ts` (PUT e DELETE de ativo), `src/routes/integrations.ts` (CSV), `src/helpers.ts` (`ALLOWED_TABLES`, `TABELA_DA_REF`, `valoresParciais`), `src/trilha-exclusao.ts`
- Modify (testes): `test/helpers/d1.ts` (auxiliares), `test/api.test.ts`, `test/ativos-campos.test.ts`, `test/idor-tenant.test.ts`, `test/refs-entre-projetos.test.ts`, `test/schema-contract.test.ts`, `test/reconcile-prod.test.ts`
- Test: `test/itens-ativos.test.ts`

**Interfaces:**
- Consumes: `itens` e `item_seguranca` da Tarefa 1.
- Produces: em `src/services/itens.ts`: `ATIVO_SELECT: string`; `CAMPOS_ATIVO: readonly string[]`; `type CamposAtivo`; `criarAtivo(db, projectId, b, id?): Promise<string>`; `atualizarAtivo(db, id, projectId: string | null, campos): Promise<number>`; `removerAtivo(db, id, projectId): Promise<number>`; `listarAtivos(db, projectId): Promise<Record<string, unknown>[]>`; `lerAtivo(db, id): Promise<Record<string, unknown> | null>`. Em `test/helpers/d1.ts`: `inserirAtivo(a)` e `lerAtivo(id)`.

- [ ] **Step 1: Serviço**

`src/services/itens.ts`:

```ts
import { genId } from '../helpers';

/**
 * Ativos sobre `itens` + `item_seguranca` (migration 0048). A API de ativos devolve a MESMA forma de
 * quando a tabela se chamava `assets` (nomes em inglês, `status` Active/Removido), então tela, MCP e CSV
 * não mudam. Todo nome de coluna que entra em SQL vem de `CAMPOS`, nunca da requisição.
 */
const CAMPOS = {
  name: { tabela: 'itens', coluna: 'nome' },
  description: { tabela: 'itens', coluna: 'descricao' },
  owner: { tabela: 'itens', coluna: 'responsavel_texto' },
  type: { tabela: 'item_seguranca', coluna: 'subtipo' },
  category: { tabela: 'item_seguranca', coluna: 'categoria' },
  classification: { tabela: 'item_seguranca', coluna: 'classificacao' },
  criticality: { tabela: 'item_seguranca', coluna: 'criticidade' },
  location: { tabela: 'item_seguranca', coluna: 'localizacao' },
  confidentiality_rating: { tabela: 'item_seguranca', coluna: 'nota_c' },
  integrity_rating: { tabela: 'item_seguranca', coluna: 'nota_i' },
  availability_rating: { tabela: 'item_seguranca', coluna: 'nota_d' },
} as const;

export type CampoAtivo = keyof typeof CAMPOS;
export const CAMPOS_ATIVO = Object.keys(CAMPOS) as CampoAtivo[];
export type CamposAtivo = Partial<Record<CampoAtivo, string | number | null>>;

export const ATIVO_SELECT = `SELECT i.id, i.project_id, i.nome AS name, s.subtipo AS type, s.categoria AS category,
    s.classificacao AS classification, s.criticidade AS criticality, i.descricao AS description,
    i.responsavel_texto AS owner, s.localizacao AS location,
    CASE i.status WHEN 'removido' THEN 'Removido' ELSE 'Active' END AS status,
    s.nota_c AS confidentiality_rating, s.nota_i AS integrity_rating, s.nota_d AS availability_rating,
    i.created_at, i.updated_at
  FROM itens i LEFT JOIN item_seguranca s ON s.item_id = i.id`;

export async function listarAtivos(db: D1Database, projectId: string): Promise<Record<string, unknown>[]> {
  const r = await db.prepare(`${ATIVO_SELECT} WHERE i.project_id = ? AND i.tipo = 'ativo' AND i.status != 'removido' ORDER BY i.created_at DESC`).bind(projectId).all();
  return r.results as Record<string, unknown>[];
}

export async function lerAtivo(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare(`${ATIVO_SELECT} WHERE i.id = ? AND i.tipo = 'ativo'`).bind(id).first<Record<string, unknown>>();
}

/** Cria o item e o bloco de segurança juntos (um batch é uma transação no D1). Mesmos padrões de antes. */
export async function criarAtivo(db: D1Database, projectId: string, b: CamposAtivo & { name: string }, id: string = genId()): Promise<string> {
  await db.batch([
    db.prepare(`INSERT INTO itens (id, project_id, nome, descricao, responsavel_texto, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
      .bind(id, projectId, b.name, b.description || '', b.owner || ''),
    db.prepare(`INSERT INTO item_seguranca (item_id, project_id, categoria, subtipo, classificacao, criticidade, localizacao, nota_c, nota_i, nota_d)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, b.category || 'Hardware', b.type ?? null, b.classification || 'Confidential', b.criticality || 'Medium',
        b.location ?? null, b.confidentiality_rating ?? 3, b.integrity_rating ?? 3, b.availability_rating ?? 3),
  ]);
  return id;
}

/**
 * Atualização parcial: só os campos presentes. Devolve quantas linhas de `itens` casaram (0 = não achou).
 * `projectId` nulo = sem corte de projeto (rota de topo, que já passou por `requireResourceAccess`).
 */
export async function atualizarAtivo(db: D1Database, id: string, projectId: string | null, campos: CamposAtivo): Promise<number> {
  const sets: Record<'itens' | 'item_seguranca', { sql: string[]; binds: unknown[] }> = {
    itens: { sql: [], binds: [] },
    item_seguranca: { sql: [], binds: [] },
  };
  for (const k of CAMPOS_ATIVO) {
    if (campos[k] === undefined) continue;
    sets[CAMPOS[k].tabela].sql.push(`${CAMPOS[k].coluna} = ?`);
    sets[CAMPOS[k].tabela].binds.push(campos[k]);
  }
  if (!sets.itens.sql.length && !sets.item_seguranca.sql.length) return 0;
  const corte = projectId === null ? '' : ' AND project_id = ?';
  const alvo = projectId === null ? [id] : [id, projectId];
  const lote = [
    db.prepare(`UPDATE itens SET ${[...sets.itens.sql, "updated_at = datetime('now')"].join(', ')} WHERE id = ? AND tipo = 'ativo'${corte}`)
      .bind(...sets.itens.binds, ...alvo),
  ];
  if (sets.item_seguranca.sql.length) {
    lote.push(db.prepare(`UPDATE item_seguranca SET ${sets.item_seguranca.sql.join(', ')} WHERE item_id = ?${corte}`).bind(...sets.item_seguranca.binds, ...alvo));
  }
  const r = await db.batch(lote);
  return r[0].meta.changes ?? 0;
}

/** Remoção lógica (o histórico do ativo fica). Já removido responde 0, como antes. */
export async function removerAtivo(db: D1Database, id: string, projectId: string): Promise<number> {
  const r = await db.prepare(
    `UPDATE itens SET status = 'removido', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND tipo = 'ativo' AND status != 'removido'`
  ).bind(id, projectId).run();
  return r.meta.changes ?? 0;
}
```

- [ ] **Step 2: Escrever o teste novo (falha)**

`test/itens-ativos.test.ts`:

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

describe('ativos sobre itens: a API fica como estava', () => {
  it('cria, lista na forma antiga, atualiza parcial e remove (404 na segunda vez)', async () => {
    const r = await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', {
      name: 'ERP', type: 'Software', category: 'Software', owner: 'TI', location: 'AWS', classification: 'Restricted',
      criticality: 'High', description: 'Folha', confidentiality_rating: 4, integrity_rating: 2, availability_rating: 1,
    });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };

    const lista = (await (await chamar(plat, 'GET', '/api/v1/projects/proj-a/assets')).json()) as { ok: boolean; assets: Record<string, unknown>[] };
    expect(lista.ok).toBe(true);
    expect(lista.assets).toHaveLength(1);
    expect(lista.assets[0]).toMatchObject({
      id, project_id: 'proj-a', name: 'ERP', type: 'Software', category: 'Software', owner: 'TI', location: 'AWS', classification: 'Restricted',
      criticality: 'High', description: 'Folha', status: 'Active', confidentiality_rating: 4, integrity_rating: 2, availability_rating: 1,
    });
    expect(Object.keys(lista.assets[0]).sort()).toEqual(['availability_rating', 'category', 'classification', 'confidentiality_rating', 'created_at',
      'criticality', 'description', 'id', 'integrity_rating', 'location', 'name', 'owner', 'project_id', 'status', 'type', 'updated_at']);

    const put = await chamar(plat, 'PUT', `/api/v1/projects/proj-a/assets/${id}`, { criticality: 'Critical' });
    expect(put.status).toBe(200);
    expect((await put.json() as { asset: Record<string, unknown> }).asset).toMatchObject({ name: 'ERP', owner: 'TI', criticality: 'Critical' });
    expect((await chamar(plat, 'PUT', `/api/v1/projects/proj-b/assets/${id}`, { criticality: 'Low' })).status).toBe(404); // outro projeto

    expect((await chamar(plat, 'DELETE', `/api/v1/projects/proj-a/assets/${id}`)).status).toBe(200);
    expect((await chamar(plat, 'DELETE', `/api/v1/projects/proj-a/assets/${id}`)).status).toBe(404);
    expect(((await (await chamar(plat, 'GET', '/api/v1/projects/proj-a/assets')).json()) as { assets: unknown[] }).assets).toHaveLength(0);
    expect(await env.DB.prepare(`SELECT status FROM itens WHERE id = ?`).bind(id).first()).toEqual({ status: 'removido' });
  });

  it('um risco pode apontar para um item criado depois da migration (a FK vale em banco novo)', async () => {
    const { id } = await (await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', { name: 'Servidor' })).json() as { id: string };
    const risco = await chamar(plat, 'POST', '/api/v1/projects/proj-a/risks', { asset: 'Servidor', threat: 'Falha', asset_id: id });
    expect(risco.status, await risco.clone().text()).toBe(201);
  });

  it('item de outro tipo não aparece em /assets', async () => {
    await env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('sis1', 'proj-b', 'Sistema de folha', 'sistema')`).run();
    const lista = (await (await chamar(plat, 'GET', '/api/v1/projects/proj-b/assets')).json()) as { assets: { id: string }[] };
    expect(lista.assets.map((a) => a.id)).not.toContain('sis1');
  });

  it('o CSV exporta o ativo vivo e não o removido', async () => {
    const vivo = (await (await chamar(plat, 'POST', '/api/v1/projects/proj-b/assets', { name: 'Vivo' })).json() as { id: string }).id;
    const morto = (await (await chamar(plat, 'POST', '/api/v1/projects/proj-b/assets', { name: 'Morto' })).json() as { id: string }).id;
    await chamar(plat, 'DELETE', `/api/v1/projects/proj-b/assets/${morto}`);
    const csv = await (await chamar(plat, 'GET', '/api/v1/projects/proj-b/export/assets')).text();
    expect(csv).toContain('Vivo');
    expect(csv).not.toContain('Morto');
    expect(vivo).toBeTruthy();
  });

  it('a rota de topo atualiza parcial e apaga de verdade, levando o bloco de segurança', async () => {
    const { id } = await (await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', { name: 'Topo', owner: 'TI', location: 'DC' })).json() as { id: string };
    expect((await chamar(plat, 'PUT', `/api/v1/assets/${id}`, { name: 'Topo novo' })).status).toBe(200);
    const [item] = (await env.DB.prepare(`SELECT i.nome, i.responsavel_texto AS owner, s.localizacao AS location FROM itens i JOIN item_seguranca s ON s.item_id = i.id WHERE i.id = ?`).bind(id).all()).results;
    expect(item).toEqual({ nome: 'Topo novo', owner: 'TI', location: 'DC' });
    expect((await chamar(plat, 'DELETE', `/api/v1/assets/${id}`)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM item_seguranca WHERE item_id = ?`).bind(id).first()).toEqual({ n: 0 });
  });
});
```

Run: `npx vitest run --maxWorkers=1 test/itens-ativos.test.ts`
Expected: FAIL (as rotas ainda leem e escrevem em `assets`, que não existe mais).

- [ ] **Step 3: Trocar as rotas**

`src/helpers.ts`:
1. Em `ALLOWED_TABLES`, troque `'assets'` por `'itens'`.
2. Em `TABELA_DA_REF`, troque `asset_id: 'assets',` por `asset_id: 'itens',`.
3. Acrescente, antes de `setParcial`, e faça `setParcial` usá-la:

```ts
/** Valores de uma atualização PARCIAL: só as chaves presentes no corpo; `null` ou `''` viram o "vazio" da coluna. */
export function valoresParciais(corpo: Record<string, unknown>, vazios: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const k of Object.keys(vazios)) {
    if (Object.hasOwn(corpo, k)) saida[k] = corpo[k] === null || corpo[k] === '' ? vazios[k] : corpo[k];
  }
  return saida;
}
```

e o corpo de `setParcial` passa a ser:

```ts
  const valores = valoresParciais(corpo, colunas);
  const presentes = Object.keys(valores);
  return { sql: presentes.map((k) => `${k} = ?`).join(', '), binds: presentes.map((k) => valores[k]) };
```

`src/trilha-exclusao.ts`: em `TABELA_DO_RECURSO`, troque `assets: 'assets',` por `assets: 'itens',` (a rota continua `/api/v1/assets/:id`).

`src/routes/project-assets.ts`: no import de `'../helpers'` tire `genId` se ficar sem uso; acrescente `import { listarAtivos, lerAtivo, criarAtivo, atualizarAtivo, removerAtivo, CAMPOS_ATIVO, type CamposAtivo } from '../services/itens';`. Apague a constante `ASSET_UPDATABLE_FIELDS`. Troque:
- o `GET`: `return c.json({ ok: true, assets: await listarAtivos(c.env.DB, projectId) });` (e apague o `SELECT` e o comentário do `COALESCE`, que não vale mais: `status` agora é `NOT NULL`);
- o `POST`: depois do `validateBody`, `const id = await criarAtivo(c.env.DB, projectId, valid.data as CamposAtivo & { name: string });` (apague `genId` e o `INSERT`);
- o `PUT`: monte `const campos: CamposAtivo = {}; for (const f of CAMPOS_ATIVO) if (body[f] !== undefined) campos[f] = body[f];`, `if (!Object.keys(campos).length) return c.json({ error: 'Nenhum campo para atualizar' }, 400);`, `const changes = await atualizarAtivo(c.env.DB, assetId, projectId, campos); if (!changes) return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);` e, no fim, `return c.json({ ok: true, asset: await lerAtivo(c.env.DB, assetId) });`;
- o `DELETE`: `if (!(await removerAtivo(c.env.DB, assetId, projectId))) return c.json({ error: 'Ativo não encontrado neste projeto' }, 404);`.

`src/routes/platform.ts`: no import de `'../helpers'` acrescente `valoresParciais` (e tire `setParcial` se ficar sem uso nesse arquivo); importe `atualizarAtivo` de `'../services/itens'`. No `PUT /assets/:id`, troque o `setParcial` e o `UPDATE` por:

```ts
    const campos = valoresParciais(body, {
      name: null, type: null, category: 'Hardware', owner: '', criticality: 'Medium', description: '',
      location: null, classification: 'Confidential',
      confidentiality_rating: 3, integrity_rating: 3, availability_rating: 3,
    });
    await atualizarAtivo(c.env.DB, id, null, campos);
```

No `DELETE /assets/:id`: `await c.env.DB.prepare('DELETE FROM itens WHERE id = ?').bind(id).run();`.

Nas **duas** rotas (`PUT` e `DELETE` de `/assets/:id`), troque também `requireResourceAccess(c.env.DB, 'assets', id, ...)` por `'itens'`: o nome da tabela é uma string, o `tsc` não pega, e a allowlist nova só tem `'itens'` (o erro aparece como `Invalid table` em runtime). Confira: `git grep -n "'assets'" -- src` só pode listar `assets: 'itens'` em `trilha-exclusao.ts`.

`src/routes/integrations.ts`, no CSV: `import { listarAtivos } from '../services/itens';` e `const rows = (await listarAtivos(c.env.DB, projectId)) as Record<string, string>[];` no lugar do `SELECT * FROM assets` (apague a linha do `result`).

- [ ] **Step 4: Auxiliares de teste e as fixtures**

Em `test/helpers/d1.ts`, acrescente (e o import no topo, junto dos outros):

```ts
import { criarAtivo, lerAtivo as lerAtivoDoBanco, type CamposAtivo } from '../../src/services/itens';

/** Ativo de fixture, no formato antigo da API (os testes escrevem `name`, `type`, `status: 'Removido'`...). */
export async function inserirAtivo(a: { id: string; project_id: string; name: string; status?: 'Active' | 'Removido' } & CamposAtivo): Promise<void> {
  const { id, project_id, status, ...campos } = a;
  await criarAtivo(env.DB, project_id, campos as CamposAtivo & { name: string }, id);
  if (status === 'Removido') await env.DB.prepare(`UPDATE itens SET status = 'removido' WHERE id = ?`).bind(id).run();
}

/** O ativo como a API o devolve (inclui removido), ou null. */
export const lerAtivo = (id: string) => lerAtivoDoBanco(env.DB, id);
```

Troque os 22 pontos que mexiam em `assets`, pela regra (o nome de campo é o da API antiga, então as asserções ficam iguais):

| Forma antiga | Forma nova |
|---|---|
| `INSERT INTO assets (id, project_id, name, ...) VALUES (...)` | `await inserirAtivo({ id, project_id, name, ... })`, com os mesmos valores e os nomes de campo da API (`type`, `category`, `owner`, `criticality`, `description`, `location`, `status`) |
| `SELECT <campos> FROM assets WHERE id = ?` | `const a = await lerAtivo(id)`; as asserções leem `a.criticality`, `a.owner`, `a.name`, `a.status`, `a.confidentiality_rating`... |
| `SELECT confidentiality_rating c, integrity_rating i, availability_rating a FROM assets ...` | `const a = (await lerAtivo(id))!; { c: a.confidentiality_rating, i: a.integrity_rating, a: a.availability_rating }` |
| `INSERT INTO assets` dentro de `env.DB.batch([...])` | tire do `batch` e faça `await inserirAtivo(...)` logo antes ou depois dele |

Pontos (arquivo:linhas de hoje): `test/api.test.ts` 309, 318, 326, 348, 359, 363; `test/ativos-campos.test.ts` 23, 30, 33, 40, 45, 47, 54; `test/idor-tenant.test.ts` 422, 423, 486, 544; `test/refs-entre-projetos.test.ts` 29 (aqui basta `INSERT INTO itens (id, project_id, nome) VALUES (?, ?, ?)` dentro do próprio `batch`: só o id importa); `test/schema-contract.test.ts` 67 e 70 (o teste "accepts the assets INSERT the handler uses" passa a chamar `criarAtivo(env.DB, 'p1', { name: 'DB', type: 'Software', category: 'Hardware', owner: 'ops', criticality: 'Medium', description: 'desc' }, 'a1')` e ler `lerAtivo('a1')`); `test/reconcile-prod.test.ts` 177 e 180 (se esse teste monta o próprio `assets` legado, ele não muda; se usa o do schema canônico, aplique a mesma regra).

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=1 test/itens-ativos.test.ts test/migration-0048.test.ts test/api.test.ts test/ativos-campos.test.ts test/idor-tenant.test.ts test/refs-entre-projetos.test.ts test/schema-contract.test.ts test/reconcile-prod.test.ts test/colunas-catraca.test.ts`
Expected: PASS.

- [ ] **Step 6: Contratos transversais**

Se a varredura de isolamento reclamar de `itens`/`item_seguranca` (coluna `NOT NULL` sem padrão que o semeador não conhece), acrescente a coluna ao `VALOR_FIXO` dos dois: `test/contrato-isolamento-org.test.ts` e `test/contrato-isolamento-topo.test.ts`.
Run: `npx vitest run --maxWorkers=1 --testTimeout=120000 test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/trilha-exclusao.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-tela-api.test.ts test/validacao-writes-crus.test.ts test/any-catraca.test.ts`
Expected: PASS. `docs/openapi.json` **não pode mudar** (`git diff --stat docs/openapi.json` vazio): se mudar, a API mudou e há um erro.

- [ ] **Step 7: Commit (Tarefas 1 e 2 juntas)**

```bash
git add migrations schema.sql src test
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): ativos viram itens (migration 0048), com a API de ativos intacta"
```

---

### Task 3: Documentação, contagens e verificação final

**Files:**
- Modify: `docs/retencao.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Retenção**

Em `docs/retencao.md`, no parágrafo de `partes` (fatia 1.1), troque a lista de tabelas por `partes`, `parte_vinculos`, `departamentos`, `projeto_modulos`, **`itens` e `item_seguranca`**.

- [ ] **Step 2: Contagens e CHANGELOG**

Meça com os comandos do `AGENTS.md` e atualize os números dele e do `README.md`: tabelas (`grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`: 63 hoje, deve dar 64, porque `assets` saiu e `itens` e `item_seguranca` entraram), última migration (0048), arquivos de teste (`ls test/*.test.ts | wc -l`) e de rota. Em `CHANGELOG.md`, em `## [Não publicado]` / `### Alterado`:

```markdown
- Ativos viram itens (fatia 1.2, migration 0048): `assets` é renomeada para `itens` (ids e linhas intactos), os campos de segurança vão para `item_seguranca`, e `risks.asset_id` passa a apontar para `itens`. A API de ativos (`/api/v1/projects/:id/assets`, `/api/v1/assets/:id`, CSV, MCP) devolve exatamente o mesmo JSON de antes. `item_seguranca` leva `project_id` para continuar no export de portabilidade.
```

- [ ] **Step 2b: AGENTS.md**

Onde o `AGENTS.md` descreve o schema, acrescente uma frase: o inventário vive em `itens` + `item_seguranca` (antes `assets`), e `src/services/itens.ts` mantém o formato antigo da API.

- [ ] **Step 3: Verificação final**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=2 > "$SCRATCH/n12.log" 2>&1; echo "VITEST_EXIT=$?"` — Expected: `VITEST_EXIT=0`, sem `Failed to start`.
Run: `git diff --stat origin/feat/nucleo-1-1 -- docs/openapi.json mcp-server-niso frontend` — Expected: vazio (a API e a tela não mudaram).
Run: `npx vitest run test/sem-dado-de-cliente.test.ts` — Expected: PASS.

- [ ] **Step 4: Commit, PR e migration**

```bash
git add docs AGENTS.md README.md CHANGELOG.md
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "docs(nucleo): itens e ativos — retenção, contagens e CHANGELOG"
git push -u origin <branch>
gh pr create --base <branch-da-1.1>
```

Abrir o PR **sem merge**, empilhado sobre o da 1.1. A migration em produção e o merge dependem do "sim" do dono, na ordem de `migrations/README.md` (0047 e 0048 juntas, se a 0047 ainda estiver pendente): backup, aplicar, conferir com as consultas da seção 0048, merge, `/health`.

---

## Auto-revisão

- **Cobertura da spec 4.4:** `itens` com tipo e status; `item_seguranca` 1:1; id preservado; `risks.asset_id` sem reescrita; consultas, telas e MCP sem quebra (a API não muda, então tela e MCP nem foram tocados); `assets` sai (pelo rename); teste de migração com dado no formato de produção. Fora, por desenho: `item_privacidade` (sem consumidor até o RoPA), o dono como vínculo (1.3) e `departamento_id` preenchido (1.4, tela).
- **Placeholders:** nenhum. A única regra em tabela é a de troca dos 22 pontos de teste, com a forma antiga, a nova e o arquivo:linha de cada um.
- **Consistência de nomes:** `criarAtivo`, `atualizarAtivo`, `removerAtivo`, `listarAtivos`, `lerAtivo`, `ATIVO_SELECT`, `CAMPOS_ATIVO`, `CamposAtivo`, `valoresParciais` e `inserirAtivo` são os mesmos nas tarefas que os definem e usam.
- **Limite honesto:** o SQL da migration foi provado num SQLite em memória com dados no formato de produção (28 → 28, FK reescrita, amostra idêntica campo a campo, `foreign_key_check` vazio). O código do serviço e das rotas só será provado pelos testes na execução.
