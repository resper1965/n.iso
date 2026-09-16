# Camada MSP — Estrutura e Isolamento (Plano 1 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas consultorias coexistem na mesma base sem enxergar a carteira uma da outra.

**Architecture:** Hierarquia `contas → clientes → projetos`, com os dados morando no cliente e a conta pagante como ponteiro. A autorização deixa de ser uma comparação em memória e passa a subir a cadeia `projeto → cliente → conta` numa consulta indexada, dentro do middleware que já é o funil único das rotas de projeto.

**Tech Stack:** TypeScript · Hono · Cloudflare Workers · D1 (SQLite) · vitest (`@cloudflare/vitest-pool-workers`)

**Spec:** `docs/superpowers/specs/2026-09-16-camada-msp-design.md`

## Global Constraints

- **Migration e `schema.sql` andam juntos.** `test/helpers/d1.ts` monta o banco de teste a partir de `schema.sql`, não das migrations. Tabela que entrar só na migration é invisível para a suíte inteira.
- **Direção de falha: papel desconhecido cai no ramo escopado.** Nunca no global. `src/helpers.ts:274` registra o incidente que criou essa regra.
- **Nada de remover coluna legada nesta entrega.** `users.client_project_id` e `projects.client_name` ficam preenchidas — é o que mantém o rollback barato.
- **O papel de admin do cliente é `org_admin`.** `src/middleware/auth.ts:244` normaliza `client_admin` → `client` antes da autorização; usar `client_admin` como critério não funciona.
- **Migration aditiva e sem efeito por si só**, no padrão de `migrations/0026_politica_seguranca_tenant.sql`: cabeçalho explicando o porquê e o que conferir antes de aplicar em produção.
- **O repositório é bilíngue, com português no código de domínio.** `exportarProjeto`, `autoridadeDeAssinatura`, `expirouPorInatividade`, `anonimizarTitular` e `ehEquipeNess` convivem com `genId`, `escapeHtml` e `encryptSecret`. Nome novo de domínio segue o português; utilitário genérico pode seguir o inglês. Comentários, docs e commits em português. Conventional commits.

---

### Task 1: Tabelas da hierarquia

**Files:**
- Create: `migrations/0031_camada_msp.sql`
- Modify: `schema.sql` (acrescentar as mesmas definições)
- Test: `test/camada-msp-schema.test.ts`

**Interfaces:**
- Produces: tabelas `contas`, `clientes`, `acesso_projeto`; colunas `projects.cliente_id`, `users.conta_id`, `users.cliente_id`, `leads.conta_id`, `assessments.conta_id`, `proposals.conta_id`

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-schema.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';

describe('schema da camada MSP', () => {
  beforeAll(async () => { await applySchema(); });

  it('cria conta, cliente e projeto encadeados', async () => {
    await env.DB.prepare(
      `INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-a', 'msp', 'Consultoria A', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a1', 'conta-a', 'Acme', 'Active')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id)
       VALUES ('proj-a1', 'Acme', 'ISO 27001', 'controller', 'Active', 'cli-a1')`
    ).run();

    const row = await env.DB.prepare(
      `SELECT c.conta_id FROM projects p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = 'proj-a1'`
    ).first<{ conta_id: string }>();

    expect(row?.conta_id).toBe('conta-a');
  });

  it('recusa tipo de conta fora do domínio', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-x', 'revenda', 'X', 'Active')`
      ).run()
    ).rejects.toThrow();
  });

  it('acesso_projeto não aceita par duplicado', async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1', 'u1@x.com', 'h', 'U1', 'org_user')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u1', 'proj-a1')`
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u1', 'proj-a1')`
      ).run()
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-schema.test.ts`
Expected: FAIL — `no such table: contas`

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0031_camada_msp.sql
-- Migration 0031: camada MSP — contas, clientes e concessão de projeto.
--
-- A plataforma foi construída para UMA consultoria: `PAPEIS_NESS` trata staff e
-- ness como a mesma coisa, e `requireProjectAccess` libera qualquer projeto para
-- qualquer staff. Para vender o SaaS a outras consultorias, o isolamento precisa
-- existir entre elas — hoje não existe.
--
-- Três níveis: conta (quem tem contrato) → cliente (quem certifica, DONO DOS
-- DADOS) → projeto (um escopo). A conta é PONTEIRO para o cliente, nunca
-- container dele: é o que faz o cliente sair da consultoria trocando uma coluna
-- em vez de migrar registro.
--
-- ADITIVA e SEM efeito por si só. As tabelas nascem vazias, as colunas nascem
-- NULL, e nenhum caminho de código muda de comportamento enquanto estiverem
-- assim. O backfill é a migration 0032; a autorização só passa a usar isto
-- depois dela.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: nada além do de sempre (backup).

CREATE TABLE IF NOT EXISTS contas (
    id TEXT PRIMARY KEY,

    -- 'msp' atende clientes de terceiros e enxerga o funil comercial.
    -- 'direto' é o cliente final que assina sozinho e NÃO tem pré-venda.
    tipo TEXT NOT NULL CHECK (tipo IN ('msp', 'direto')),

    nome TEXT NOT NULL,
    plano TEXT NOT NULL DEFAULT 'trial',

    -- NULL = sem teto. Ausência de limite é ausência de restrição, nunca
    -- restrição padrão: um default apertado aqui trancaria contas no deploy
    -- seguinte. Os tetos só passam a ser lidos no Plano 2.
    max_clientes INTEGER,
    max_projetos INTEGER,
    max_usuarios INTEGER,

    -- 'Active' | 'Suspensa'. A suspensão é lida no Plano 2.
    status TEXT NOT NULL DEFAULT 'Active',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,

    -- Quem paga e gerencia este cliente HOJE. É a única coluna que muda quando
    -- o cliente troca de consultoria — por isso os dados não moram aqui embaixo.
    conta_id TEXT NOT NULL REFERENCES contas(id),

    nome TEXT NOT NULL,
    cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A consulta de autorização sobe projeto → cliente → conta a cada requisição de
-- rota escopada. Sem estes índices ela vira varredura.
CREATE INDEX IF NOT EXISTS idx_clientes_conta ON clientes(conta_id);

CREATE TABLE IF NOT EXISTS acesso_projeto (
    user_id TEXT NOT NULL REFERENCES users(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_id)
);

ALTER TABLE projects ADD COLUMN cliente_id TEXT REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_projects_cliente ON projects(cliente_id);

-- Staff de MSP usa `conta_id`; usuário de cliente usa `cliente_id`. Uma pessoa
-- preenche exatamente uma das duas, e `platform_admin` não preenche nenhuma.
ALTER TABLE users ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE users ADD COLUMN cliente_id TEXT REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_users_conta ON users(conta_id);
CREATE INDEX IF NOT EXISTS idx_users_cliente ON users(cliente_id);

-- O funil comercial não tinha dono: a proteção era só por papel. Com dois MSPs
-- na base, isso vaza pipeline entre concorrentes.
ALTER TABLE leads ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE assessments ADD COLUMN conta_id TEXT REFERENCES contas(id);
ALTER TABLE proposals ADD COLUMN conta_id TEXT REFERENCES contas(id);
CREATE INDEX IF NOT EXISTS idx_leads_conta ON leads(conta_id);
CREATE INDEX IF NOT EXISTS idx_assessments_conta ON assessments(conta_id);
CREATE INDEX IF NOT EXISTS idx_proposals_conta ON proposals(conta_id);
```

- [ ] **Step 4: Mirror the same definitions into `schema.sql`**

Acrescente ao final de `schema.sql` os três `CREATE TABLE`, os índices, e as colunas novas **já dentro** dos `CREATE TABLE` de `projects`, `users`, `leads`, `assessments` e `proposals` (em `schema.sql` são colunas da definição, não `ALTER`).

Em `projects`, acrescente à lista de colunas:

```sql
    cliente_id TEXT REFERENCES clientes(id),
```

Em `users`:

```sql
    conta_id TEXT REFERENCES contas(id),
    cliente_id TEXT REFERENCES clientes(id),
```

Em `leads`, `assessments` e `proposals`:

```sql
    conta_id TEXT REFERENCES contas(id),
```

`contas` e `clientes` precisam ser declaradas **antes** de `projects` e `users` no arquivo, senão a FK referencia tabela inexistente na ordem de execução de `execSql`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-schema.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Run the full suite to catch schema regressions**

Run: `npx vitest run`
Expected: mesma contagem de falhas de antes da tarefa (nenhuma NOVA falha). Tabela nova não muda comportamento.

- [ ] **Step 7: Commit**

```bash
git add migrations/0031_camada_msp.sql schema.sql test/camada-msp-schema.test.ts
git commit -m "feat(msp): tabelas de conta, cliente e concessao de projeto"
```

---

### Task 2: Backfill dos dados existentes

**Files:**
- Create: `migrations/0032_camada_msp_backfill.sql`
- Test: `test/camada-msp-backfill.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 1
- Produces: conta `conta-ness`; todo projeto com `cliente_id`; todo usuário com `conta_id` **ou** `cliente_id`; concessão em `acesso_projeto` para cada usuário que tinha `client_project_id`

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-backfill.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import backfillSql from '../migrations/0032_camada_msp_backfill.sql?raw';

describe('backfill da camada MSP', () => {
  beforeAll(async () => {
    await applySchema();
    // Estado ANTERIOR à camada MSP: projetos com client_name, usuários com client_project_id.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1', 'Acme', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2', 'Acme', 'ISO 27701', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p3', 'Beta', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'c@acme.com', 'h', 'Cliente', 'org_user', 'p1')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-staff', 's@ness.com', 'h', 'Staff', 'consultor')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-adm', 'a@ness.com', 'h', 'Admin', 'platform_admin')`),
    ]);
    await execSql(backfillSql);
  });

  it('agrupa projetos da mesma empresa sob um cliente só', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT cliente_id) n FROM projects WHERE id IN ('p1','p2')`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('cria um cliente por client_name distinto', async () => {
    const row = await env.DB.prepare(`SELECT COUNT(*) n FROM clientes`).first<{ n: number }>();
    expect(row?.n).toBe(2); // Acme e Beta
  });

  it('PRESERVA o isolamento: usuário segue alcançando só o projeto que já era dele', async () => {
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM acesso_projeto WHERE user_id = 'u-cli'`
    ).all<{ project_id: string }>();
    expect(results.map(r => r.project_id)).toEqual(['p1']);
  });

  it('liga o usuário do cliente à empresa dele', async () => {
    const row = await env.DB.prepare(
      `SELECT c.nome FROM users u JOIN clientes c ON c.id = u.cliente_id WHERE u.id = 'u-cli'`
    ).first<{ nome: string }>();
    expect(row?.nome).toBe('Acme');
  });

  it('põe staff na conta ness e deixa platform_admin sem conta', async () => {
    const staff = await env.DB.prepare(`SELECT conta_id FROM users WHERE id = 'u-staff'`).first<{ conta_id: string | null }>();
    const adm = await env.DB.prepare(`SELECT conta_id FROM users WHERE id = 'u-adm'`).first<{ conta_id: string | null }>();
    expect(staff?.conta_id).toBe('conta-ness');
    expect(adm?.conta_id).toBeNull();
  });

  it('não deixa projeto órfão', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE cliente_id IS NULL`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-backfill.test.ts`
Expected: FAIL — o arquivo `migrations/0032_camada_msp_backfill.sql` não existe

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0032_camada_msp_backfill.sql
-- Migration 0032: povoa a camada MSP com o que já existe.
--
-- Toda a base atual pertence a uma consultoria só, a ness. Este backfill a
-- declara como conta MSP e pendura o que existe nela, SEM ampliar o acesso de
-- ninguém.
--
-- O PASSO QUE NÃO PODE ERRAR é a concessão em `acesso_projeto`: emitir uma linha
-- por usuário que já tinha `client_project_id` mantém o alcance dele EXATAMENTE
-- como era — um projeto, o dele. Ninguém acorda enxergando projeto novo. Visão
-- ampliada só aparece para quem for promovido a `org_admin` depois, de propósito.
--
-- A criação de clientes é 1:1 com `client_name` distinto. Sondagem da produção em
-- 2026-09-16 não encontrou nenhuma colisão de grafia, então não há heurística de
-- dedup aqui. Se colisão aparecer no futuro, a regra é deduplicar por CNPJ —
-- nunca por nome: fundir duas empresas mistura evidência e política, e é
-- irreversível depois que alguém escreve por cima.
--
-- `client_project_id` e `client_name` continuam preenchidas de propósito: são o
-- que torna o rollback uma migration reversa em vez de restauração de backup.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO:
--   SELECT COUNT(*) FROM projects WHERE cliente_id IS NULL;   -- deve ser 0 depois
--   SELECT COUNT(*) FROM users WHERE client_project_id IS NOT NULL;
--   -- o segundo tem de bater com: SELECT COUNT(*) FROM acesso_projeto;

INSERT OR IGNORE INTO contas (id, tipo, nome, plano, status)
VALUES ('conta-ness', 'msp', 'ness', 'interno', 'Active');

-- Um cliente por client_name distinto. O id é derivado do nome para ser
-- determinístico: rodar a migration duas vezes não duplica.
INSERT OR IGNORE INTO clientes (id, conta_id, nome, cnpj, status)
SELECT
    'cli-' || LOWER(HEX(client_name)),
    'conta-ness',
    client_name,
    MAX(cnpj),
    'Active'
FROM projects
WHERE client_name IS NOT NULL
GROUP BY client_name;

UPDATE projects
SET cliente_id = 'cli-' || LOWER(HEX(client_name))
WHERE cliente_id IS NULL AND client_name IS NOT NULL;

-- Usuário de cliente: herda a empresa do projeto a que estava preso.
UPDATE users
SET cliente_id = (SELECT p.cliente_id FROM projects p WHERE p.id = users.client_project_id)
WHERE client_project_id IS NOT NULL AND cliente_id IS NULL;

-- A CONCESSÃO. Sem esta linha, o usuário comum perde acesso a tudo (fail-closed)
-- ou ganha acesso a mais do que tinha — as duas saídas erradas.
INSERT OR IGNORE INTO acesso_projeto (user_id, project_id)
SELECT id, client_project_id FROM users WHERE client_project_id IS NOT NULL;

-- Staff da ness entra na conta dela. `platform_admin` fica de fora: ele opera o
-- SaaS e é o único papel global que sobra.
UPDATE users
SET conta_id = 'conta-ness'
WHERE conta_id IS NULL
  AND client_project_id IS NULL
  AND role IN ('consultor', 'consultant', 'auditor');

-- O funil comercial acumulado é da ness.
UPDATE leads       SET conta_id = 'conta-ness' WHERE conta_id IS NULL;
UPDATE assessments SET conta_id = 'conta-ness' WHERE conta_id IS NULL;
UPDATE proposals   SET conta_id = 'conta-ness' WHERE conta_id IS NULL;

DROP TABLE IF EXISTS organizations;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-backfill.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add migrations/0032_camada_msp_backfill.sql test/camada-msp-backfill.test.ts
git commit -m "feat(msp): backfill preservando o isolamento usuario a usuario"
```

---

### Task 3: Fixture da matriz de tenants

**Files:**
- Modify: `test/helpers/d1.ts`
- Test: `test/camada-msp-fixture.test.ts`

**Interfaces:**
- Produces: `seedMatrizMsp(): Promise<void>` — duas contas MSP, uma conta direta, quatro clientes, cinco projetos e os usuários de cada papel

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-fixture.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';

describe('fixture da matriz MSP', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('monta duas contas MSP e uma direta', async () => {
    const { results } = await env.DB.prepare(`SELECT id, tipo FROM contas ORDER BY id`).all<{ id: string; tipo: string }>();
    expect(results).toEqual([
      { id: 'conta-a', tipo: 'msp' },
      { id: 'conta-b', tipo: 'msp' },
      { id: 'conta-c', tipo: 'direto' },
    ]);
  });

  it('dá ao cliente A1 dois projetos', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE cliente_id = 'cli-a1'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(2);
  });

  it('concede ao usuário comum apenas um dos dois projetos do cliente dele', async () => {
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM acesso_projeto WHERE user_id = 'u-a1-user'`
    ).all<{ project_id: string }>();
    expect(results.map(r => r.project_id)).toEqual(['proj-a1-27001']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-fixture.test.ts`
Expected: FAIL — `seedMatrizMsp is not exported`

- [ ] **Step 3: Add the fixture to `test/helpers/d1.ts`**

```typescript
/**
 * Matriz de tenants da camada MSP. `seedTwoProjects` prova isolamento entre dois
 * projetos; esta prova isolamento entre duas CONSULTORIAS, que é o vazamento que
 * a camada MSP existe para fechar e que nenhuma fixture de dois projetos alcança.
 *
 *   conta-a (msp)   ├─ cli-a1 ─┬─ proj-a1-27001   (concedido a u-a1-user)
 *                   │          └─ proj-a1-27701   (NÃO concedido)
 *                   └─ cli-a2 ─── proj-a2-27001
 *   conta-b (msp)   └─ cli-b1 ─── proj-b1-27001
 *   conta-c (direto)└─ cli-c  ─── proj-c-27001
 */
export async function seedMatrizMsp(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-a', 'msp', 'Consultoria A', 'Active')`),
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-b', 'msp', 'Consultoria B', 'Active')`),
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-c', 'direto', 'Gama', 'Active')`),
  ]);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a1', 'conta-a', 'Acme', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a2', 'conta-a', 'Beta', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-b1', 'conta-b', 'Delta', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-c', 'conta-c', 'Gama', 'Active')`),
  ]);
  const projeto = (id: string, cliente: string, nome: string, norma: string) =>
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES (?, ?, ?, 'controller', 'Active', ?)`
    ).bind(id, nome, norma, cliente);
  await env.DB.batch([
    projeto('proj-a1-27001', 'cli-a1', 'Acme', 'ISO 27001'),
    projeto('proj-a1-27701', 'cli-a1', 'Acme', 'ISO 27701'),
    projeto('proj-a2-27001', 'cli-a2', 'Beta', 'ISO 27001'),
    projeto('proj-b1-27001', 'cli-b1', 'Delta', 'ISO 27001'),
    projeto('proj-c-27001', 'cli-c', 'Gama', 'ISO 27001'),
  ]);
  const usuario = (id: string, email: string, role: string, conta: string | null, cliente: string | null) =>
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, conta_id, cliente_id) VALUES (?, ?, 'h', ?, ?, ?, ?)`
    ).bind(id, email, id, role, conta, cliente);
  await env.DB.batch([
    usuario('u-a-consultor', 'consultor@a.com', 'consultor', 'conta-a', null),
    usuario('u-b-consultor', 'consultor@b.com', 'consultor', 'conta-b', null),
    usuario('u-c-staff', 'staff@c.com', 'consultor', 'conta-c', null),
    usuario('u-a1-admin', 'admin@acme.com', 'org_admin', null, 'cli-a1'),
    usuario('u-a1-user', 'user@acme.com', 'org_user', null, 'cli-a1'),
    usuario('u-plataforma', 'adm@ness.com', 'platform_admin', null, null),
  ]);
  // O usuário comum recebe UM dos dois projetos do cliente dele. É esse par —
  // concedido e não concedido dentro da MESMA empresa — que distingue "vê o
  // cliente" de "vê o que lhe deram".
  await env.DB.prepare(
    `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u-a1-user', 'proj-a1-27001')`
  ).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-fixture.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add test/helpers/d1.ts test/camada-msp-fixture.test.ts
git commit -m "test(msp): fixture com duas consultorias e uma conta direta"
```

---

### Task 4: Escopo do usuário na autorização

**Files:**
- Modify: `src/helpers.ts` (interface `AtorAutorizado`, nova função `hidrataEscopo`)
- Test: `test/camada-msp-escopo.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 1, fixture da Task 3
- Produces:
  - `AtorAutorizado` com `id?: string`, `conta_id?: string | null`, `cliente_id?: string | null`
  - `hidrataEscopo(db: D1Database, user: AtorAutorizado): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-escopo.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { hidrataEscopo } from '../src/helpers';

describe('hidrataEscopo', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('preenche a conta de sessão antiga que não a carrega', async () => {
    const user: any = { id: 'u-a-consultor', role: 'consultor' };
    await hidrataEscopo(env.DB, user);
    expect(user.conta_id).toBe('conta-a');
  });

  it('preenche o cliente de usuário de cliente', async () => {
    const user: any = { id: 'u-a1-user', role: 'org_user' };
    await hidrataEscopo(env.DB, user);
    expect(user.cliente_id).toBe('cli-a1');
  });

  it('não consulta o banco quando a sessão já traz o escopo', async () => {
    const user: any = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };
    await hidrataEscopo(env.DB, user);
    // Mantém o que veio da sessão — a função não sobrescreve o que já existe.
    expect(user.conta_id).toBe('conta-b');
  });

  it('não explode com usuário inexistente', async () => {
    const user: any = { id: 'nao-existe', role: 'consultor' };
    await expect(hidrataEscopo(env.DB, user)).resolves.toBeUndefined();
    expect(user.conta_id).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-escopo.test.ts`
Expected: FAIL — `hidrataEscopo is not exported`

- [ ] **Step 3: Implement in `src/helpers.ts`**

Substitua a interface existente:

```typescript
export interface AtorAutorizado {
  id?: string;
  role?: string;
  client_project_id?: string | null;
  /** Conta a que o staff pertence. Vazio para usuário de cliente e platform_admin. */
  conta_id?: string | null;
  /** Empresa a que o usuário de cliente pertence. Vazio para staff. */
  cliente_id?: string | null;
}
```

E acrescente, logo abaixo dela:

```typescript
/**
 * Completa `conta_id`/`cliente_id` a partir do banco quando a sessão não os traz.
 *
 * A sessão é escrita no login com `{...user}` de um `SELECT *`, então normalmente
 * já vem completa. Duas situações fogem disso e as duas são reais: sessão emitida
 * ANTES desta mudança (vive até 24 h pelo teto de `SESSION_TTL_SEC`), e sessão
 * criada por caminho que não é o login — SSO e SCIM montam usuário por conta
 * própria.
 *
 * Sem isto, escopo ausente cairia no ramo escopado e a pessoa tomaria 403 em
 * tudo. Fail-closed é a direção certa para papel DESCONHECIDO, mas trancar quem
 * tem direito por causa do formato da sessão é o outro erro — e é o caro.
 */
export async function hidrataEscopo(db: D1Database, user: AtorAutorizado): Promise<void> {
  if (user.conta_id !== undefined || user.cliente_id !== undefined) return;
  if (!user.id) return;
  const row = await db
    .prepare('SELECT conta_id, cliente_id FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ conta_id: string | null; cliente_id: string | null }>();
  if (!row) return;
  user.conta_id = row.conta_id;
  user.cliente_id = row.cliente_id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-escopo.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/helpers.ts test/camada-msp-escopo.test.ts
git commit -m "feat(msp): resolve escopo de conta e cliente do usuario"
```

---

### Task 5: `requireProjectAccess` escopada por conta

**Files:**
- Modify: `src/helpers.ts:171-175`
- Modify: `src/middleware/project-access.ts:25`
- Modify: `src/routes/ai.ts:288`
- Test: `test/camada-msp-isolamento.test.ts`

**Interfaces:**
- Consumes: `hidrataEscopo` (Task 4), fixture (Task 3)
- Produces: `requireProjectAccess(db: D1Database, user: AtorAutorizado, projectId: string): Promise<true>` — **assinatura nova, assíncrona, com `db` como primeiro argumento**

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-isolamento.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { requireProjectAccess, ForbiddenError } from '../src/helpers';

const consultorA = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const consultorB = { id: 'u-b-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };
const adminA1 = { id: 'u-a1-admin', role: 'org_admin', conta_id: null, cliente_id: 'cli-a1' };
const userA1 = { id: 'u-a1-user', role: 'org_user', conta_id: null, cliente_id: 'cli-a1' };
const plataforma = { id: 'u-plataforma', role: 'platform_admin', conta_id: null, cliente_id: null };

describe('isolamento entre consultorias', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('consultor alcança projeto de cliente da própria conta', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-a2-27001')).resolves.toBe(true);
  });

  it('CONSULTOR NÃO ALCANÇA PROJETO DE OUTRA CONSULTORIA', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-b1-27001')).rejects.toThrow(ForbiddenError);
    await expect(requireProjectAccess(env.DB, consultorB, 'proj-a1-27001')).rejects.toThrow(ForbiddenError);
  });

  it('consultor não alcança projeto de conta direta', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'proj-c-27001')).rejects.toThrow(ForbiddenError);
  });

  it('admin do cliente vê todos os projetos da empresa dele', async () => {
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a1-27701')).resolves.toBe(true);
  });

  it('admin do cliente não vê outra empresa da mesma consultoria', async () => {
    await expect(requireProjectAccess(env.DB, adminA1, 'proj-a2-27001')).rejects.toThrow(ForbiddenError);
  });

  it('usuário comum vê só o projeto concedido, mesmo sendo da mesma empresa', async () => {
    await expect(requireProjectAccess(env.DB, userA1, 'proj-a1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, userA1, 'proj-a1-27701')).rejects.toThrow(ForbiddenError);
  });

  it('platform_admin alcança tudo', async () => {
    await expect(requireProjectAccess(env.DB, plataforma, 'proj-b1-27001')).resolves.toBe(true);
    await expect(requireProjectAccess(env.DB, plataforma, 'proj-c-27001')).resolves.toBe(true);
  });

  it('papel desconhecido cai no ramo escopado', async () => {
    const ciso = { id: 'u-ciso', role: 'ciso', conta_id: null, cliente_id: null };
    await expect(requireProjectAccess(env.DB, ciso, 'proj-a1-27001')).rejects.toThrow(ForbiddenError);
  });

  it('projeto inexistente é recusa, não vazamento de existência', async () => {
    await expect(requireProjectAccess(env.DB, consultorA, 'nao-existe')).rejects.toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-isolamento.test.ts`
Expected: FAIL — a função é síncrona e aceita dois argumentos; `resolves` falha

- [ ] **Step 3: Replace `requireProjectAccess` in `src/helpers.ts`**

```typescript
/** Papéis do lado do cliente que enxergam a empresa INTEIRA, não só o concedido. */
const PAPEIS_ADMIN_CLIENTE = new Set(['org_admin']);

/**
 * Garante que o usuário alcança o projeto.
 *
 * Deixou de ser comparação em memória porque a resposta agora depende da cadeia
 * `projeto → cliente → conta`, que só o banco conhece. Desnormalizar `conta_id`
 * em `projects` manteria isto síncrono e foi descartado: na saída do cliente
 * `clientes.conta_id` muda, e cópia que não acompanhe em transação deixa a
 * consultoria antiga enxergando os projetos. Divergência aqui é vazamento.
 *
 * `platform_admin` é o ÚNICO papel global: ele opera o SaaS. Consultor é staff de
 * UMA conta e não enxerga a carteira das outras — foi essa distinção que faltava
 * para a plataforma poder ser vendida a mais de uma consultoria.
 *
 * Projeto inexistente recusa com a mesma mensagem de projeto alheio: responder
 * diferente diria a quem sonda quais ids existem.
 */
export async function requireProjectAccess(
  db: D1Database,
  user: AtorAutorizado,
  projectId: string
): Promise<true> {
  if (user.role === 'platform_admin') return true;

  const alvo = await db
    .prepare('SELECT p.cliente_id, c.conta_id FROM projects p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?')
    .bind(projectId)
    .first<{ cliente_id: string | null; conta_id: string | null }>();

  if (!alvo) throw new ForbiddenError('Forbidden: No access to this project');

  if (user.conta_id && alvo.conta_id && alvo.conta_id === user.conta_id) return true;

  if (user.cliente_id && alvo.cliente_id && alvo.cliente_id === user.cliente_id) {
    if (PAPEIS_ADMIN_CLIENTE.has(user.role ?? '')) return true;
    const concedido = await db
      .prepare('SELECT 1 FROM acesso_projeto WHERE user_id = ? AND project_id = ?')
      .bind(user.id ?? '', projectId)
      .first();
    if (concedido) return true;
  }

  throw new ForbiddenError('Forbidden: No access to this project');
}
```

- [ ] **Step 4: Update `src/middleware/project-access.ts`**

Troque o corpo do `if` por:

```typescript
  if (user && projectId && !RESERVED_SEGMENTS.has(projectId)) {
    try {
      await hidrataEscopo(c.env.DB, user);
      await requireProjectAccess(c.env.DB, user, projectId);
    } catch {
      return c.json({ error: 'Forbidden: No access to this project' }, 403);
    }
  }
```

E o import passa a ser:

```typescript
import { requireProjectAccess, hidrataEscopo } from '../helpers';
```

- [ ] **Step 5: Update `src/routes/ai.ts:288`**

```typescript
    await hidrataEscopo(c.env.DB, c.get('user'));
    await requireProjectAccess(c.env.DB, c.get('user'), projectId);
```

E acrescente `hidrataEscopo` ao import de `../helpers` no topo do arquivo.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-isolamento.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 7: Verify no call site was missed**

Run: `npx tsc --noEmit`
Expected: sem erro. Um `requireProjectAccess` que ainda receba dois argumentos aparece aqui.

- [ ] **Step 8: Commit**

```bash
git add src/helpers.ts src/middleware/project-access.ts src/routes/ai.ts test/camada-msp-isolamento.test.ts
git commit -m "feat(msp): escopa acesso a projeto pela conta da consultoria"
```

---

### Task 6: Criação de projeto resolve o cliente

**Files:**
- Modify: `src/helpers.ts` (nova função `resolveCliente`)
- Modify: `src/routes/projects.ts:317` (POST /projects)
- Modify: `src/routes/assessments.ts:454` (assessment convertido em projeto)
- Modify: `src/routes/proposals.ts:162` (proposta aprovada vira projeto)
- Test: `test/camada-msp-criacao-projeto.test.ts`

**Interfaces:**
- Consumes: `hidrataEscopo` (Task 4), `requireProjectAccess` (Task 5)
- Produces: `resolveCliente(db: D1Database, contaId: string, nome: string, cnpj?: string | null): Promise<string>` — devolve o id do cliente, criando-o se não existir

**Por que esta tarefa existe.** A Task 5 fez a autorização depender de `projects.cliente_id`. Mas os três caminhos que criam projeto continuam inserindo sem essa coluna, então **todo projeto criado depois da migration nasce órfão e é inalcançável por qualquer um exceto `platform_admin`**. Isso não é defeito de teste: é o produto parando de funcionar no primeiro projeto novo. A suíte completa em `ed5bf1a` acusou isso com ~100 testes vermelhos, que são o alarme funcionando.

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-criacao-projeto.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetData, resetSessions } from './helpers/d1';

describe('criação de projeto pendura o cliente', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await seedMatrizMsp();
  });

  it('projeto criado por staff nasce no cliente, e o criador o alcança', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Empresa Nova', standards: 'ISO 27001' }),
    });
    expect(res.status).toBeLessThan(300);

    const proj = await env.DB.prepare(
      `SELECT p.id, p.cliente_id, c.conta_id FROM projects p
         JOIN clientes c ON c.id = p.cliente_id
        WHERE p.client_name = 'Empresa Nova'`
    ).first<{ id: string; cliente_id: string; conta_id: string }>();

    expect(proj?.cliente_id).toBeTruthy();
    expect(proj?.conta_id).toBe('conta-a');

    // O ponto que importa: o projeto novo é ALCANÇÁVEL. Órfão daria 403.
    const leitura = await pedir(worker, `/api/v1/projects/${proj!.id}/risks`, { headers });
    expect(leitura.status).toBe(200);
  });

  it('segundo projeto do mesmo cliente reusa o cliente, não cria outro', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const corpo = (escopo: string) => ({
      method: 'POST' as const,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Repetida', standards: escopo }),
    });
    await pedir(worker, '/api/v1/projects', corpo('ISO 27001'));
    await pedir(worker, '/api/v1/projects', corpo('ISO 27701'));

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM clientes WHERE nome = 'Repetida' AND conta_id = 'conta-a'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('MESMO NOME EM CONSULTORIAS DIFERENTES SÃO CLIENTES DIFERENTES', async () => {
    const criar = async (userId: string, contaId: string) => {
      const headers = await sessionFor({
        id: userId, email: `${userId}@x.com`, role: 'consultor',
        conta_id: contaId, cliente_id: null,
      });
      return pedir(worker, '/api/v1/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Homônima', standards: 'ISO 27001' }),
      });
    };
    await criar('u-a-consultor', 'conta-a');
    await criar('u-b-consultor', 'conta-b');

    const { results } = await env.DB.prepare(
      `SELECT conta_id FROM clientes WHERE nome = 'Homônima' ORDER BY conta_id`
    ).all<{ conta_id: string }>();
    expect(results.map(r => r.conta_id)).toEqual(['conta-a', 'conta-b']);
  });

  it('deduplica por CNPJ mesmo com o nome escrito diferente', async () => {
    const headers = await sessionFor({
      id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor',
      conta_id: 'conta-a', cliente_id: null,
    });
    const criar = (nome: string) => pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: nome, standards: 'ISO 27001', cnpj: '11222333000181' }),
    });
    await criar('Acme S.A.');
    await criar('Acme SA');

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM clientes WHERE cnpj = '11222333000181'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('criador sem conta e sem conta_id no corpo é recusado, não cria órfão', async () => {
    const headers = await sessionFor({
      id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin',
      conta_id: null, cliente_id: null,
    });
    const res = await pedir(worker, '/api/v1/projects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Sem Dono', standards: 'ISO 27001' }),
    });
    expect(res.status).toBe(400);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE client_name = 'Sem Dono'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --no-file-parallelism test/camada-msp-criacao-projeto.test.ts`
Expected: FAIL — o projeto nasce com `cliente_id` nulo, o JOIN não devolve linha e a leitura dá 403

- [ ] **Step 3: Add `resolveCliente` to `src/helpers.ts`**

```typescript
/**
 * Devolve o id do cliente daquele nome dentro daquela conta, criando-o se ainda
 * não existir.
 *
 * A ordem de busca não é estética. CNPJ é a chave REAL de uma empresa, então
 * quando ele vem, decide sozinho — é o que faz "Acme S.A." e "Acme SA" caírem no
 * mesmo cliente em vez de virarem duas empresas com evidência partida ao meio.
 * Sem CNPJ, resta o nome, que é o que o produto sempre teve.
 *
 * A busca é SEMPRE dentro de `conta_id`. Duas consultorias podem atender
 * empresas homônimas — e mesmo quando é a mesma empresa do mundo real, são
 * clientes distintos aqui: cada consultoria enxerga só o seu, e fundi-los
 * misturaria a evidência de duas carteiras.
 */
export async function resolveCliente(
  db: D1Database,
  contaId: string,
  nome: string,
  cnpj?: string | null
): Promise<string> {
  const limpo = (cnpj ?? '').replace(/\D/g, '');
  if (limpo) {
    const porCnpj = await db
      .prepare('SELECT id FROM clientes WHERE conta_id = ? AND cnpj = ?')
      .bind(contaId, limpo)
      .first<{ id: string }>();
    if (porCnpj) return porCnpj.id;
  }
  const porNome = await db
    .prepare('SELECT id FROM clientes WHERE conta_id = ? AND nome = ?')
    .bind(contaId, nome)
    .first<{ id: string }>();
  if (porNome) return porNome.id;

  const id = genId();
  await db
    .prepare('INSERT INTO clientes (id, conta_id, nome, cnpj, status) VALUES (?, ?, ?, ?, ?)')
    .bind(id, contaId, nome, limpo || null, 'Active')
    .run();
  return id;
}

/**
 * A conta que vai responder pelo projeto que está sendo criado.
 *
 * Staff carrega a própria conta. `platform_admin` não tem conta nenhuma — ele
 * opera o SaaS — então precisa DIZER para qual conta está criando. Devolver
 * `null` aqui é recusa: criar projeto sem conta produziria um órfão que ninguém
 * alcança, e um 400 explícito é melhor que uma linha invisível no banco.
 */
export function contaCriadora(
  user: AtorAutorizado | undefined,
  contaDoCorpo?: string | null
): string | null {
  return user?.conta_id ?? contaDoCorpo ?? null;
}
```

- [ ] **Step 4: Wire it into the three creation paths**

Em `src/routes/projects.ts`, no handler `POST /`, antes do `INSERT INTO projects`:

```typescript
    await hidrataEscopo(c.env.DB, c.get('user') ?? {});
    const contaId = contaCriadora(c.get('user'), body.conta_id);
    if (!contaId) {
      return c.json({ error: 'conta_id é obrigatório para quem não é staff de uma conta' }, 400);
    }
    const clienteId = await resolveCliente(c.env.DB, contaId, body.client_name, body.cnpj);
```

E acrescente `cliente_id` ao INSERT, mantendo `client_name` preenchido como está (coluna legada preservada de propósito):

```typescript
      `INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, cliente_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
```

Acrescente `conta_id?: string` e `cnpj?: string` ao tipo do `body`.

Faça o equivalente em `src/routes/assessments.ts:454` e `src/routes/proposals.ts:162`. Nesses dois a conta sai do registro de origem (`assessments.conta_id` / `proposals.conta_id`, que a Task 2 preencheu) com o usuário como segunda opção — o projeto nasce na conta que conduziu a venda.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --no-file-parallelism test/camada-msp-criacao-projeto.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Confirm the blast radius shrank**

Run: `npx vitest run --no-file-parallelism test/modulos-crud.test.ts test/api.test.ts`
Expected: menos falhas que em `ed5bf1a`. Anote a contagem — ela alimenta a Task 10. O que sobrar são testes que criam projeto por `INSERT` direto, e esses são adaptação de fixture.

- [ ] **Step 7: Commit**

```bash
git add src/helpers.ts src/routes/projects.ts src/routes/assessments.ts src/routes/proposals.ts test/camada-msp-criacao-projeto.test.ts
git commit -m "feat(msp): projeto novo nasce pendurado no cliente"
```

---

### Task 7: `requireResourceAccess` escopada

**Files:**
- Modify: `src/helpers.ts:153-164`
- Test: `test/camada-msp-recurso.test.ts`

**Interfaces:**
- Consumes: `requireProjectAccess` (Task 5)
- Produces: `requireResourceAccess` com a mesma assinatura de hoje (`db, table, resourceId, user`) e critério novo

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-recurso.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { requireResourceAccess, ForbiddenError } from '../src/helpers';

const consultorA = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-a', cliente_id: null };
const consultorB = { id: 'u-b-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };

describe('requireResourceAccess entre consultorias', () => {
  beforeAll(async () => {
    await applySchema();
    await seedMatrizMsp();
    // `risks` não tem `title`/`status`: as colunas obrigatórias são `asset` e
    // `threat`, e `risk_score` é GENERATED — não se insere nela.
    await env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset, threat) VALUES ('risco-a', 'proj-a1-27001', 'Servidor de aplicação', 'Acesso indevido')`
    ).run();
  });

  it('consultor da conta dona alcança o recurso', async () => {
    await expect(requireResourceAccess(env.DB, 'risks', 'risco-a', consultorA)).resolves.toBe(true);
  });

  it('CONSULTOR DE OUTRA CONSULTORIA NÃO ALCANÇA', async () => {
    await expect(requireResourceAccess(env.DB, 'risks', 'risco-a', consultorB)).rejects.toThrow(ForbiddenError);
  });

  it('tabela fora da allowlist continua sendo erro, não recusa', async () => {
    await expect(requireResourceAccess(env.DB, 'users', 'u-a1-user', consultorA)).rejects.toThrow('Invalid table');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-recurso.test.ts`
Expected: FAIL no segundo teste — hoje `consultor` retorna `true` antes de qualquer checagem

- [ ] **Step 3: Replace `requireResourceAccess` in `src/helpers.ts`**

```typescript
/**
 * Mesma pergunta de `requireProjectAccess`, feita a partir de um RECURSO: a
 * linha pertence a um projeto, e o projeto responde pelo resto.
 *
 * Antes, staff passava direto e cliente era comparado com `client_project_id`.
 * As duas pontas mudaram: staff agora é staff DE UMA CONTA, e o usuário de
 * cliente pode ter mais de um projeto. Delegar a `requireProjectAccess` mantém
 * UMA definição de alcance — duas definições divergem, e a que diverge para o
 * lado permissivo é a que vaza.
 */
export async function requireResourceAccess(db: D1Database, table: string, resourceId: string, user: AtorAutorizado) {
  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error('Invalid table');
  }
  if (user.role === 'platform_admin') return true;

  const row = await db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).bind(resourceId).first<{ project_id: string | null }>();
  if (!row || !row.project_id) {
    throw new ForbiddenError('Forbidden: No access to this resource');
  }
  try {
    await requireProjectAccess(db, user, row.project_id);
  } catch {
    throw new ForbiddenError('Forbidden: No access to this resource');
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-recurso.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/helpers.ts test/camada-msp-recurso.test.ts
git commit -m "feat(msp): escopa acesso a recurso pela conta da consultoria"
```

---

### Task 8: `ehStaffDaConta` e `somenteMsp`

**Files:**
- Modify: `src/helpers.ts:267-310` (`PAPEIS_NESS`, `ehEquipeNess`, `somenteNess`)
- Modify: `src/routes/leads.ts`, `src/routes/assessments.ts`, `src/routes/proposals.ts`, `src/routes/platform.ts`, `src/routes/projects.ts` (trocar o nome importado)
- Test: `test/camada-msp-funil.test.ts`

**Interfaces:**
- Consumes: `hidrataEscopo` (Task 4)
- Produces:
  - `ehStaffDeConta(user: AtorAutorizado): boolean` — substitui `ehEquipeNess`
  - `somenteMsp(c, next)` — substitui `somenteNess`

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-funil.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetSessions } from './helpers/d1';

describe('funil comercial por conta', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); await resetSessions(); });

  it('staff de conta MSP alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(200);
  });

  it('STAFF DE CONTA DIRETA NÃO ALCANÇA O FUNIL', async () => {
    const headers = await sessionFor({ id: 'u-c-staff', email: 'staff@c.com', role: 'consultor', conta_id: 'conta-c', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(403);
  });

  it('usuário de cliente não alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-a1-admin', email: 'admin@acme.com', role: 'org_admin', conta_id: null, cliente_id: 'cli-a1' });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(403);
  });

  it('platform_admin alcança o funil', async () => {
    const headers = await sessionFor({ id: 'u-plataforma', email: 'adm@ness.com', role: 'platform_admin', conta_id: null, cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-funil.test.ts`
Expected: FAIL no segundo teste — hoje qualquer `consultor` passa, inclusive o de conta direta

- [ ] **Step 3: Replace the guards in `src/helpers.ts`**

```typescript
/** Papéis que OPERAM a plataforma ou prestam serviço — nunca papéis de cliente. */
const PAPEIS_STAFF = new Set(['consultor', 'consultant', 'platform_admin']);

/**
 * O usuário é staff (e não gente do lado do cliente)?
 *
 * Continua sendo ALLOWLIST DE STAFF, nunca allowlist de papel-cliente, e a razão
 * está registrada em `src/helpers.ts` desde o incidente do `ciso`: `users.role` é
 * TEXT livre, então a lista de papéis-cliente nunca é exaustiva, e um papel fora
 * dela caía no ramo de plataforma e enxergava a carteira de todos os tenants.
 * Invertida, o papel desconhecido cai no ramo escopado — o lado seguro de errar.
 *
 * Perdeu o nome da ness porque a plataforma deixou de ser de uma consultoria só.
 */
export function ehStaffDeConta(user: { role?: string } | undefined | null): boolean {
  return !!user && PAPEIS_STAFF.has(user.role ?? '');
}

/**
 * Guarda do funil comercial (lead → assessment → proposta).
 *
 * Duas condições, e a segunda é nova: ser staff NÃO basta, a conta precisa ser
 * do tipo `msp`. Conta `direto` é o cliente final que assina sozinho — ele não
 * vende para ninguém, então pré-venda não existe para ele.
 *
 * O escopo por `conta_id` é o que falta para dois MSPs conviverem: estas tabelas
 * não têm `project_id`, então `requireResourceAccess` nunca as alcançou e o
 * isolamento era só por papel. Com duas consultorias na base, isso é pipeline
 * comercial de uma visível para a outra.
 */
export async function somenteMsp(
  c: {
    get: (k: 'user') => AtorAutorizado | undefined;
    env: { DB: D1Database };
    json: (b: unknown, s: 403) => Response;
  },
  next: () => Promise<void>
) {
  const user = c.get('user');
  if (!ehStaffDeConta(user)) {
    return c.json({ error: 'Forbidden: rota restrita à equipe' }, 403);
  }
  if (user!.role === 'platform_admin') return next();

  await hidrataEscopo(c.env.DB, user!);
  if (!user!.conta_id) {
    return c.json({ error: 'Forbidden: rota restrita à equipe' }, 403);
  }
  const conta = await c.env.DB
    .prepare('SELECT tipo FROM contas WHERE id = ?')
    .bind(user!.conta_id)
    .first<{ tipo: string }>();
  if (conta?.tipo !== 'msp') {
    return c.json({ error: 'Forbidden: rota restrita à equipe' }, 403);
  }
  return next();
}
```

- [ ] **Step 4: Rename at every call site**

```bash
# confere o alcance antes de trocar
grep -rn "somenteNess\|ehEquipeNess" src/
```

Troque `somenteNess` → `somenteMsp` e `ehEquipeNess` → `ehStaffDeConta` em `src/routes/leads.ts`, `src/routes/assessments.ts`, `src/routes/proposals.ts`, `src/routes/platform.ts` e `src/routes/projects.ts`, incluindo os imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-funil.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Verify nothing still references the old names**

Run: `grep -rn "somenteNess\|ehEquipeNess" src/ && echo "AINDA HÁ REFERÊNCIA" || echo "limpo"`
Expected: `limpo`

- [ ] **Step 7: Commit**

```bash
git add src/helpers.ts src/routes/leads.ts src/routes/assessments.ts src/routes/proposals.ts src/routes/platform.ts src/routes/projects.ts test/camada-msp-funil.test.ts
git commit -m "feat(msp): restringe pre-venda a conta do tipo msp"
```

---

### Task 9: Escopo das consultas do funil

**Files:**
- Modify: `src/routes/leads.ts`, `src/routes/assessments.ts`, `src/routes/proposals.ts` (cláusula `WHERE conta_id` nas listagens e `conta_id` nos INSERTs)
- Test: `test/camada-msp-funil-dados.test.ts`

**Interfaces:**
- Consumes: `somenteMsp` (Task 7)
- Produces: nenhuma função nova — as rotas passam a filtrar por `conta_id`

- [ ] **Step 1: Write the failing test**

```typescript
// test/camada-msp-funil-dados.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, seedMatrizMsp, sessionFor, pedir, resetSessions } from './helpers/d1';

describe('dados do funil isolados por conta', () => {
  beforeAll(async () => {
    await applySchema();
    await seedMatrizMsp();
    await resetSessions();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads (id, company_name, contact_email, status, conta_id) VALUES ('lead-a', 'Prospect da A', 'a@x.com', 'New', 'conta-a')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, contact_email, status, conta_id) VALUES ('lead-b', 'Prospect da B', 'b@x.com', 'New', 'conta-b')`),
    ]);
  });

  it('a listagem devolve só os leads da própria conta', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', { headers });
    const body = await res.json<any>();
    const ids = (body.leads ?? body.results ?? body).map((l: any) => l.id);
    expect(ids).toContain('lead-a');
    expect(ids).not.toContain('lead-b');
  });

  it('LEAD DA OUTRA CONSULTORIA NÃO É ALCANÇÁVEL POR ID', async () => {
    const headers = await sessionFor({ id: 'u-a-consultor', email: 'consultor@a.com', role: 'consultor', conta_id: 'conta-a', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads/lead-b', { headers });
    expect([403, 404]).toContain(res.status);
  });

  it('lead criado nasce carimbado com a conta de quem criou', async () => {
    const headers = await sessionFor({ id: 'u-b-consultor', email: 'consultor@b.com', role: 'consultor', conta_id: 'conta-b', cliente_id: null });
    const res = await pedir(worker, '/api/v1/leads', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: 'Novo', contact_email: 'novo@x.com' }),
    });
    expect(res.status).toBeLessThan(300);
    const row = await env.DB.prepare(`SELECT conta_id FROM leads WHERE company_name = 'Novo'`).first<{ conta_id: string }>();
    expect(row?.conta_id).toBe('conta-b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/camada-msp-funil-dados.test.ts`
Expected: FAIL — a listagem devolve os dois leads e o INSERT não grava `conta_id`

- [ ] **Step 3: Scope the queries**

Em cada rota de `src/routes/leads.ts`, `src/routes/assessments.ts` e `src/routes/proposals.ts`:

Nas **listagens**, acrescente o filtro. `platform_admin` não filtra; os demais filtram pela própria conta:

```typescript
const user = c.get('user');
const contaId = user?.role === 'platform_admin' ? null : (user?.conta_id ?? null);

const { results } = contaId
  ? await c.env.DB.prepare('SELECT * FROM leads WHERE conta_id = ? ORDER BY created_at DESC').bind(contaId).all()
  : await c.env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
```

Nas **leituras por id**, confira o dono depois de carregar:

```typescript
const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<any>();
if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);
const user = c.get('user');
if (user?.role !== 'platform_admin' && lead.conta_id !== user?.conta_id) {
  // Mesma resposta de inexistente: dizer 403 aqui confirmaria a existência do
  // registro da outra consultoria, que é metade do que um concorrente quer saber.
  return c.json({ error: 'Lead não encontrado' }, 404);
}
```

Nos **INSERTs**, carimbe a conta de quem cria:

```typescript
await c.env.DB.prepare(
  `INSERT INTO leads (id, company_name, contact_email, status, conta_id) VALUES (?, ?, ?, 'New', ?)`
).bind(id, body.company_name, body.contact_email, c.get('user')?.conta_id ?? null).run();
```

Nos **UPDATEs e DELETEs**, acrescente `AND conta_id = ?` à cláusula quando o usuário não for `platform_admin`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/camada-msp-funil-dados.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/routes/leads.ts src/routes/assessments.ts src/routes/proposals.ts test/camada-msp-funil-dados.test.ts
git commit -m "feat(msp): isola dados do funil comercial por conta"
```

---

### Task 10: Adaptar a suíte existente

**Files:**
- Modify: `test/idor-tenant.test.ts`, `test/idor-tenant-project-scoped.test.ts`, `test/contrato-isolamento-topo.test.ts`, `test/helpers.test.ts` e todo arquivo que a suíte apontar
- Modify: `test/helpers/d1.ts` (`seedTwoProjects`)

**Interfaces:**
- Consumes: tudo das Tasks 1-8
- Produces: suíte inteira verde

**Inventário medido em `ed5bf1a`** (logo após a Task 5, ANTES da Task 6). Não presuma que ainda vale: a Task 6 fez projeto novo nascer com `cliente_id`, então tudo que criava projeto pela API deve ter se resolvido sozinho. Este inventário é o teto, não a lista.

```
api.test.ts                       12    phase-questionnaire.test.ts   10
modulos-crud.test.ts              27    phase-interpretation.test.ts   7
control-adequacao.test.ts          7    idor-tenant-project-scoped.ts  7
integration.test.ts                5    journey-dossier.test.ts        4
mcp-integration.test.ts            4    assinatura-governanca.test.ts  3
project-scope-phase-notes.test.ts  3    idor-tenant.test.ts            2
control-owner-update.test.ts       2    politica-tenant.test.ts        1
portabilidade.test.ts              1    revoke-approval.test.ts        1
forbidden-error.test.ts            1    migration-0021.test.ts      erro no beforeAll
```

`contrato-isolamento-topo.test.ts` passou inteiro — a varredura dinâmica dele já cobre a estrutura nova.

**A causa é uma só, e vale para quase todos:** o teste faz `INSERT INTO projects (id, client_name, standards, org_role, status)` sem `cliente_id` (veja `test/modulos-crud.test.ts:94`), então o projeto nasce órfão e a autorização nega — inclusive para o dono. Não é bug da autorização; é fixture escrita quando projeto não tinha cliente.

- [ ] **Step 1: Re-measure, because the Task 6 changed the picture**

Run: `npx vitest run --no-file-parallelism 2>&1 | grep -E "❯ test/|Test Files|Tests "`

Compare com o inventário acima e trabalhe sobre o que SOBROU. Cada arquivo que ainda falha cai em um de dois casos, e eles têm correções diferentes:
- **cria projeto por `INSERT` direto** → precisa da cadeia conta→cliente na fixture
- **monta sessão com `client_project_id`** → precisa de `cliente_id` mais linha em `acesso_projeto`

`migration-0021.test.ts` é caso próprio: o `beforeAll` dele estoura no `execSql`. Diagnostique antes de tratar como fixture — pode ser o mesmo defeito de statement vazio que já deixa `reconcile-prod` vermelho no baseline, e nesse caso não é seu.

- [ ] **Step 2: Make `seedTwoProjects` produce a valid hierarchy**

A fixture antiga cria projeto sem `cliente_id`, e projeto sem cliente agora é inalcançável para todo mundo menos `platform_admin`. Dê a ela a cadeia mínima, mantendo os ids `proj-a`/`proj-b` que dezenas de testes já usam:

```typescript
export async function seedTwoProjects(): Promise<void> {
  // A camada MSP tornou `cliente_id` o caminho de TODA autorização de projeto.
  // Esta fixture ganhou uma conta e dois clientes para continuar significando o
  // que sempre significou: dois tenants distintos, um sendo o "outro" do outro.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO contas (id, tipo, nome, status) VALUES ('conta-legada', 'msp', 'Legada', 'Active')`
  ).run();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO clientes (id, conta_id, nome, status) VALUES ('cli-a', 'conta-legada', 'Cliente A', 'Active')`),
    env.DB.prepare(`INSERT OR IGNORE INTO clientes (id, conta_id, nome, status) VALUES ('cli-b', 'conta-legada', 'Cliente B', 'Active')`),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active', 'cli-a'),
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active', 'cli-b'),
  ]);
}
```

- [ ] **Step 3: Fix the sessions in the existing isolation tests**

Testes que montam sessão de cliente com `client_project_id: 'proj-a'` precisam passar a montar `cliente_id: 'cli-a'`, e o usuário precisa existir em `users` com a concessão correspondente quando o papel for `org_user`. Padrão a aplicar:

```typescript
// antes
const headers = await sessionFor({ id: 'u1', role: 'org_user', client_project_id: 'proj-a' });

// depois
await env.DB.prepare(
  `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, cliente_id) VALUES ('u1', 'u1@a.com', 'h', 'U1', 'org_user', 'cli-a')`
).run();
await env.DB.prepare(
  `INSERT OR IGNORE INTO acesso_projeto (user_id, project_id) VALUES ('u1', 'proj-a')`
).run();
const headers = await sessionFor({ id: 'u1', role: 'org_user', conta_id: null, cliente_id: 'cli-a' });
```

Sessão de staff passa a carregar a conta:

```typescript
const headers = await sessionFor({ id: 'u-staff', role: 'consultor', conta_id: 'conta-legada', cliente_id: null });
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS em tudo. Nenhum teste pode ser *deletado* para chegar aqui — se um teste não faz mais sentido, ele é reescrito para a regra nova e o commit explica a mudança.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro

- [ ] **Step 6: Commit**

```bash
git add test/
git commit -m "test(msp): adapta suite de isolamento a hierarquia de contas"
```

---

## Verificação final

- [ ] `npx vitest run` — suíte inteira verde
- [ ] `npx tsc --noEmit` — sem erro de tipo
- [ ] `grep -rn "somenteNess\|ehEquipeNess" src/` — sem resultado
- [ ] `grep -rn "organizations" src/` — só as ocorrências em texto inglês de `soa-logic.ts`
- [ ] Migration aplicada em staging antes de produção, conferindo as duas contagens do cabeçalho de `0032`

## O que NÃO entra neste plano

Fica para os planos 2 e 3, e nenhum deles é pré-requisito para este entregar valor:

- **Plano 2 — Limites e suspensão.** Leitura de `max_clientes`/`max_projetos`/`max_usuarios` e o estado `Suspensa`. As colunas nascem aqui mas ninguém as consulta.
- **Plano 3 — Solicitação de escopo.** A fila com destinatário derivado de `clientes.conta_id`.
- **Remoção das colunas legadas.** `users.client_project_id` e `projects.client_name` saem numa migration posterior, depois que a estrutura nova rodar em produção sem incidente.
- **Telas.** Este plano é de API e dados. A interface de gerenciar contas e clientes vem depois de os três planos fecharem.
