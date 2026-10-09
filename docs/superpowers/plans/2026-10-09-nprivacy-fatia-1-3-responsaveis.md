# n.privacy, fatia 1.3 — responsáveis viram partes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o responsável em texto livre (riscos, controles, RoPA, CAPA, checklist, ativos) a uma parte, e trazer as pessoas que o projeto já tem (governança, fornecedores, partes interessadas) para `partes`, sem apagar texto nenhum.

**Architecture:** Migration 0049 só acrescenta cinco colunas `*_parte_id`, vazias. A importação das pessoas e a conciliação do texto são **operações sob demanda, por projeto, repetíveis e com relatório** (`POST /partes/importar` e `POST /partes/conciliar`), num serviço próprio. O texto original fica; o vínculo se soma a ele. Vínculo com `item` passa a existir.

**Tech Stack:** Hono, D1, Vitest com `cloudflare:test`.

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.2 ("Migração das pessoas"). Depende das fatias 1.1 (`partes`) e 1.2 (`itens`).

## Cortes e decisões deste plano

A spec fixa o destino, não o caminho. O plano decide e o dono pode trocar:

1. **Nada é gravado na migration**: a 0049 só acrescenta colunas nulas. A carga de dados é por rota, projeto a projeto, com relatório. Evita carga em massa em produção e a deriva de uma carga única (um fornecedor criado amanhã entra na próxima importação).
2. **Governança → parte**: `project_governance` vira parte (pessoa) com vínculo `responsavel` no projeto; a categoria `dpo` vira `encarregado`. **Os `consultor` ficam de fora**: são da ness., não do cliente (8 das 25 linhas em produção).
3. **Fornecedor → parte organização** com vínculo `terceiro`; **parte interessada → parte organização** com vínculo `parte_interessada` (a tabela `stakeholders` não distingue pessoa de organização, e a cláusula 4.2 fala de grupos: clientes, reguladores).
4. **Reaproveita antes de criar**: parte do mesmo projeto, mesmo tipo e mesmo nome (sem diferenciar caixa nem espaços repetidos) é reaproveitada.
5. **Conciliação por nome exato** (sem tirar acento), comparado **no código**: o `lower()` do SQLite só minusculiza ASCII e "JOSÉ" não casaria com "José". Nome que bate com **duas** partes é "ambíguo" e não é ligado.
6. **O texto não é apagado nem alterado**; só `*_parte_id` é preenchido. Ativo (`itens`) não ganha coluna: o dono é um vínculo `responsavel` do item.
7. **Escrita de `*_parte_id` pelas rotas de risco, controle, RoPA, CAPA e checklist fica para a 1.4** (quando a tela precisar). Aqui só existe a coluna e a conciliação.
8. **Fora: separar DPO de CISO em `autoridadeDeAssinatura`.** Mexe em quem pode assinar RoPA e DPIA; a spec o amarra ao RoPA aprovado por pedido (4.8). Entra na fatia do RoPA.

## Global Constraints

- Schema muda em **dois** lugares: `schema.sql` e migration; a coluna nova no **fim** de cada tabela (é onde o `ALTER` a põe), antes de qualquer restrição de tabela.
- Migration em produção só com o "sim" do dono, depois de `npm run db:backup`. O ambiente `production` só aceita a `main`.
- Nome de tabela e de coluna que entra em SQL vem só da constante `FONTES`, nunca da requisição.
- **Sem `any` novo** (`TETO` 539).
- Dado pessoal: nome e e-mail já estão no projeto; nada de CPF; a importação não cria parte para `consultor`.
- Commits com autor `44273656+resper1965@users.noreply.github.com`, sem `Co-Authored-By`; rodar `test/sem-dado-de-cliente.test.ts` antes do PR; nunca citar cliente ou pessoa real.
- Todo write passa por `validateBody`; as duas rotas novas não leem corpo.

## Review Focus

1. **Rodar duas vezes não duplica** parte nem vínculo (Tarefa 2).
2. **Nome ambíguo não é ligado** e aparece no relatório (Tarefa 2).
3. **Um projeto não toca o outro**: importar e conciliar no A não mexe em linha do B (Tarefa 2).
4. **Consultor da ness. não vira parte** do cliente (Tarefa 2).
5. **Acento e caixa**: "José" casa com "JOSÉ  " e não com "Jose" (Tarefa 2).

---

### Task 1: Migration 0049 e vínculo com item

**Files:**
- Create: `migrations/0049_responsavel_parte.sql`
- Modify: `schema.sql`, `migrations/README.md`, `src/routes/nucleo.ts` (`conferirAlvo`), `test/nucleo-partes.test.ts`
- Test: `test/migration-0049.test.ts`

**Interfaces:**
- Produces: colunas `risks.owner_parte_id`, `compliance_controls.owner_parte_id`, `ropa_records.owner_parte_id`, `corrective_actions.assigned_to_parte_id`, `checklist_progress.assigned_to_parte_id` (todas `TEXT REFERENCES partes(id) ON DELETE SET NULL`); vínculo com `alvo_tipo = 'item'` aceito.

- [ ] **Step 1: Escrever o teste que falha**

`test/migration-0049.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0049 from '../migrations/0049_responsavel_parte.sql?raw';

const COLUNAS: [string, string][] = [
  ['risks', 'owner_parte_id'], ['compliance_controls', 'owner_parte_id'], ['ropa_records', 'owner_parte_id'],
  ['corrective_actions', 'assigned_to_parte_id'], ['checklist_progress', 'assigned_to_parte_id'],
];
const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0049 — responsável aponta para a parte', () => {
  it('o schema canônico tem as cinco colunas, no fim de cada tabela, ligadas a partes', async () => {
    await applySchema();
    for (const [tabela, coluna] of COLUNAS) {
      expect((await colunas(tabela)).at(-1), tabela).toBe(coluna);
      const fk = await env.DB.prepare(`SELECT "table" AS t, on_delete AS d FROM pragma_foreign_key_list('${tabela}') WHERE "from" = ?`).bind(coluna).first();
      expect(fk, tabela).toEqual({ t: 'partes', d: 'SET NULL' });
    }
  });

  it('apagar a parte solta o vínculo e deixa o texto do responsável', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p49','C','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa49','p49','Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, owner, owner_parte_id) VALUES ('r49','p49','A','T','Ana Exemplo','pa49')`),
    ]);
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'pa49'`).run();
    expect(await env.DB.prepare(`SELECT owner, owner_parte_id FROM risks WHERE id = 'r49'`).first()).toEqual({ owner: 'Ana Exemplo', owner_parte_id: null });
  });

  it('a migration, sobre tabelas no formato anterior, acrescenta as cinco colunas e nada mais', async () => {
    // Cópias sufixadas do formato anterior: os nomes mudam, a lógica não.
    const sufixar = (sql: string) => sql.replace(/\b(risks|compliance_controls|ropa_records|corrective_actions|checklist_progress)\b/g, '$1_t');
    await execSql(`
      CREATE TABLE risks_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE compliance_controls_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE ropa_records_t (id TEXT PRIMARY KEY, owner TEXT);
      CREATE TABLE corrective_actions_t (id TEXT PRIMARY KEY, assigned_to TEXT);
      CREATE TABLE checklist_progress_t (id TEXT PRIMARY KEY, assigned_to TEXT, UNIQUE (id, assigned_to));
    `);
    await env.DB.prepare(`INSERT INTO risks_t (id, owner) VALUES ('x', 'Fulano')`).run();
    await execSql(sufixar(migration0049));
    // As cinco, uma a uma: conferir só algumas deixou passar uma migration sem a coluna de `ropa_records`.
    expect(await colunas('risks_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('compliance_controls_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('ropa_records_t')).toEqual(['id', 'owner', 'owner_parte_id']);
    expect(await colunas('corrective_actions_t')).toEqual(['id', 'assigned_to', 'assigned_to_parte_id']);
    expect(await colunas('checklist_progress_t')).toEqual(['id', 'assigned_to', 'assigned_to_parte_id']);
    expect(await env.DB.prepare(`SELECT owner, owner_parte_id FROM risks_t`).first()).toEqual({ owner: 'Fulano', owner_parte_id: null });
    await execSql('DROP TABLE risks_t; DROP TABLE compliance_controls_t; DROP TABLE ropa_records_t; DROP TABLE corrective_actions_t; DROP TABLE checklist_progress_t;');
  }, 30_000);
});
```

Run: `npx vitest run --maxWorkers=1 test/migration-0049.test.ts` — Expected: FAIL (o arquivo da migration não existe).

- [ ] **Step 2: Migration**

`migrations/0049_responsavel_parte.sql`:

```sql
-- 0049 — núcleo do n.privacy, fatia 1.3: o responsável em texto ganha uma parte ao lado (spec 4.2).
--
-- Só COLUNAS NOVAS, nulas: nenhuma linha muda. O texto (`owner`, `assigned_to`) fica como está; a parte é
-- ligada depois, por projeto, pela rota de conciliação (`POST /api/v1/projects/:id/partes/conciliar`), que
-- devolve o relatório do que não casou. O dono do ativo não ganha coluna: é um vínculo `responsavel` do item.
-- ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE risks ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE compliance_controls ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE ropa_records ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE corrective_actions ADD COLUMN assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE checklist_progress ADD COLUMN assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
```

- [ ] **Step 3: schema.sql**

Em `schema.sql`, acrescente a coluna **depois da última coluna e antes de qualquer `UNIQUE` ou `FOREIGN KEY` de tabela**, com vírgula na linha anterior:

- `risks`: depois de `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP` acrescente `,\n    owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL`
- `compliance_controls`: idem depois de `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP` (a última coluna da tabela, antes do `);`)
- `ropa_records`: idem
- `corrective_actions`: depois de `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` acrescente `,\n    assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL`
- `checklist_progress`: depois de `due_date TEXT,` acrescente a linha `    assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,` (antes do `UNIQUE(project_id, phase_number, item_id)`)

`partes` é criada no fim do `schema.sql`; a referência adiantada é válida em SQLite.

- [ ] **Step 4: Vínculo com item**

Em `src/routes/nucleo.ts`, na função `conferirAlvo`, troque a escolha da tabela por:

```ts
  const tabela = tipo === 'departamento' ? 'departamentos' : tipo === 'parte' ? 'partes' : tipo === 'item' ? 'itens' : null;
```

e o comentário acima dela por: `/** \`tratamento\` entra na fatia do RoPA: até lá o alvo não existe. */`.

Em `test/nucleo-partes.test.ts`, no teste `papel que não serve ao alvo: 400; alvo item ainda não existe: 400`, troque a parte do `item` por `tratamento`:

```ts
    const i = await vincular(parte, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: 'qualquer' });
    expect(i.status).toBe(400);
    expect((await json<{ error: string }>(i)).error).toMatch(/ainda não existe/);
```

E acrescente, no `describe('vínculos')`:

```ts
  it('responsável por um item do projeto: ok; item de outro projeto: 400', async () => {
    const { inserirAtivo } = await import('./helpers/d1');
    await inserirAtivo({ id: 'it-a', project_id: 'proj-a', name: 'ERP' });
    await inserirAtivo({ id: 'it-b', project_id: 'proj-b', name: 'CRM' });
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it-a' })).status).toBe(201);
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it-b' })).status).toBe(400);
  });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run --maxWorkers=1 test/migration-0049.test.ts test/nucleo-partes.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts` — Expected: PASS.

- [ ] **Step 6: Documentar a migration**

Em `migrations/README.md`: no "Estado" troque `**0048**` por `**0049**` e o número de arquivos `.sql`. No fim do arquivo acrescente:

```markdown
---

## 0049 — responsável aponta para a parte (fatia 1.3, 2026-10)

Acrescenta `owner_parte_id` a `risks`, `compliance_controls` e `ropa_records`, e `assigned_to_parte_id` a
`corrective_actions` e `checklist_progress`: nulas, ligadas a `partes`, `ON DELETE SET NULL`. **Nenhuma linha
muda.** Depende da 0047 (`partes`). `ADD COLUMN` não é idempotente: aplicar duas vezes falha.

Conferência depois de aplicar: `PRAGMA table_info(risks)` termina em `owner_parte_id` (e as outras quatro, na
coluna que lhes cabe); `SELECT count(*) FROM risks WHERE owner_parte_id IS NOT NULL` dá 0.

**Esta RODA em produção**, é aditiva e sem janela: o código antigo ignora a coluna nova. Ordem: `npm run
db:backup` → aplicar → conferir → merge. Os dados só mudam quando um consultor chama as rotas `partes/importar`
e `partes/conciliar` de um projeto.
```

- [ ] **Step 7: Commit**

```bash
git add migrations schema.sql src test
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): migration 0049 — responsável aponta para a parte; vínculo com item"
```

---

### Task 2: Importar as pessoas e conciliar os responsáveis

**Files:**
- Create: `src/services/partes.ts`, `test/nucleo-conciliacao.test.ts`
- Modify: `src/routes/nucleo.ts`

**Interfaces:**
- Consumes: `partes`, `parte_vinculos`, `itens` e as colunas da Tarefa 1; `logAudit`, `erro500`.
- Produces: `importarPartes(db, projectId, ator): Promise<{ criadas: number; reaproveitadas: number; vinculos: number }>`, `conciliarResponsaveis(db, projectId, ator): Promise<RelatorioConciliacao>`, rotas `POST /api/v1/projects/:projectId/partes/importar` e `POST /api/v1/projects/:projectId/partes/conciliar`.

- [ ] **Step 1: Escrever o teste que falha**

`test/nucleo-conciliacao.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, inserirAtivo } from './helpers/d1';

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

const partes = async (base: string) => json<{ id: string; nome: string; tipo: string }[]>(await chamar(plat, 'GET', `${base}/partes`));
const vinculosDe = async (parteId: string) =>
  (await env.DB.prepare('SELECT papel, alvo_tipo, alvo_id FROM parte_vinculos WHERE parte_id = ? ORDER BY papel, alvo_tipo').bind(parteId).all()).results;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      ('proj-a', 'Ana Exemplo', 'Ana@Exemplo.com.br', 'dpo', 'Encarregada'),
      ('proj-a', 'Beto Exemplo', NULL, 'tech', 'Líder de TI'),
      ('proj-a', 'Consultor da Ness', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('proj-b', 'ana exemplo', NULL, 'dpo', 'Encarregada')`),
    env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES ('v1', 'proj-a', 'Fornecedora Exemplo')`),
    env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name) VALUES ('s1', 'proj-a', 'Regulador Exemplo')`),
  ]);
});

describe('importar as pessoas do projeto', () => {
  it('traz governança, fornecedores e partes interessadas; o consultor da ness. fica de fora', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/importar`);
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ok: true, criadas: 4, reaproveitadas: 0, vinculos: 4 });

    const todas = await partes(A);
    expect(todas.map((p) => p.nome).sort()).toEqual(['Ana Exemplo', 'Beto Exemplo', 'Fornecedora Exemplo', 'Regulador Exemplo']);
    const por = (nome: string) => todas.find((p) => p.nome === nome)!;
    expect(por('Ana Exemplo')).toMatchObject({ tipo: 'pessoa' });
    expect(por('Fornecedora Exemplo')).toMatchObject({ tipo: 'organizacao' });
    expect(await vinculosDe(por('Ana Exemplo').id)).toEqual([{ papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Beto Exemplo').id)).toEqual([{ papel: 'responsavel', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Fornecedora Exemplo').id)).toEqual([{ papel: 'terceiro', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Regulador Exemplo').id)).toEqual([{ papel: 'parte_interessada', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await env.DB.prepare(`SELECT email FROM partes WHERE nome = 'Ana Exemplo' AND project_id = 'proj-a'`).first()).toEqual({ email: 'ana@exemplo.com.br' });
  });

  it('rodar de novo não duplica parte nem vínculo', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/importar`);
    expect(await json(r)).toEqual({ ok: true, criadas: 0, reaproveitadas: 4, vinculos: 0 });
    expect(await partes(A)).toHaveLength(4);
  });

  it('o outro projeto não foi tocado, e uma parte que já existia (outra caixa) é reaproveitada', async () => {
    expect(await partes(B)).toEqual([]);
    await chamar(plat, 'POST', `${B}/partes`, { nome: 'ANA  EXEMPLO' });
    const r = await chamar(plat, 'POST', `${B}/partes/importar`);
    expect(await json(r)).toEqual({ ok: true, criadas: 0, reaproveitadas: 1, vinculos: 1 });
    expect(await partes(B)).toHaveLength(1);
  });
});

describe('conciliar o responsável em texto com a parte', () => {
  let ana: string;
  beforeAll(async () => {
    ana = (await partes(A)).find((p) => p.nome === 'Ana Exemplo')!.id;
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'Duplicada Exemplo' });
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'duplicada exemplo' });
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'José Exemplo' });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, owner) VALUES
        ('r1', 'proj-a', 'A', 'T', ' ana   exemplo '), ('r2', 'proj-a', 'A', 'T', 'TI'), ('r3', 'proj-a', 'A', 'T', 'Duplicada Exemplo'),
        ('r4', 'proj-a', 'A', 'T', 'Jose Exemplo'), ('r5', 'proj-a', 'A', 'T', 'JOSÉ EXEMPLO'), ('rB', 'proj-b', 'A', 'T', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES
        ('c1', 'proj-a', 'ISO 27001', 'A.5.1', 'TI'), ('c2', 'proj-a', 'ISO 27001', 'A.5.2', 'TI'), ('c3', 'proj-a', 'ISO 27001', 'A.5.3', 'TI')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, owner) VALUES ('ro1', 'proj-a', 'Folha', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to) VALUES ('ca1', 'proj-a', 'CAPA', 'Beto Exemplo')`),
      env.DB.prepare(`INSERT INTO checklist_progress (project_id, phase_number, item_id, assigned_to) VALUES ('proj-a', 1, 'i1', 'Ana Exemplo')`),
    ]);
    await inserirAtivo({ id: 'it1', project_id: 'proj-a', name: 'ERP', owner: 'Ana Exemplo' });
    await inserirAtivo({ id: 'it2', project_id: 'proj-a', name: 'CRM', owner: 'Quem?' });
  });

  it('liga o que casa, relata o que não casou e o que é ambíguo, e não apaga o texto', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/conciliar`);
    expect(r.status).toBe(200);
    const rel = await json<{ casados: Record<string, number>; sem_correspondencia: unknown[]; ambiguos: unknown[] }>(r);
    expect(rel.casados).toEqual({ risks: 2, compliance_controls: 0, ropa_records: 1, corrective_actions: 1, checklist_progress: 1, itens: 1 });
    expect(rel.sem_correspondencia).toEqual([
      { tabela: 'compliance_controls', coluna: 'owner', texto: 'TI', n: 3 },
      { tabela: 'itens', coluna: 'responsavel_texto', texto: 'Quem?', n: 1 },
      { tabela: 'risks', coluna: 'owner', texto: 'Jose Exemplo', n: 1 },
      { tabela: 'risks', coluna: 'owner', texto: 'TI', n: 1 },
    ]);
    expect(rel.ambiguos).toEqual([{ tabela: 'risks', coluna: 'owner', texto: 'Duplicada Exemplo', n: 1 }]);

    const linha = (id: string) => env.DB.prepare('SELECT owner, owner_parte_id FROM risks WHERE id = ?').bind(id).first();
    expect(await linha('r1')).toEqual({ owner: ' ana   exemplo ', owner_parte_id: ana });
    expect(await linha('r5')).toMatchObject({ owner_parte_id: (await partes(A)).find((p) => p.nome === 'José Exemplo')!.id }); // com acento casa
    expect(await linha('r4')).toEqual({ owner: 'Jose Exemplo', owner_parte_id: null }); // sem acento, não
    expect(await linha('r3')).toEqual({ owner: 'Duplicada Exemplo', owner_parte_id: null });
    expect(await linha('rB')).toEqual({ owner: 'Ana Exemplo', owner_parte_id: null }); // outro projeto
    expect(await vinculosDe(ana)).toContainEqual({ papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it1' });
  });

  it('rodar de novo não liga nada a mais, e repete o relatório do que falta', async () => {
    const rel = await json<{ casados: Record<string, number>; sem_correspondencia: unknown[] }>(await chamar(plat, 'POST', `${A}/partes/conciliar`));
    expect(Object.values(rel.casados).every((n) => n === 0)).toBe(true);
    expect(rel.sem_correspondencia).toHaveLength(4);
    expect((await vinculosDe(ana)).filter((v) => v.alvo_tipo === 'item')).toHaveLength(1);
  });

  it('deixa trilha com o projeto', async () => {
    const t = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = 'partes.conciliadas' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(t?.project_id).toBe('proj-a');
  });
});
```

Run: `npx vitest run --maxWorkers=1 test/nucleo-conciliacao.test.ts` — Expected: FAIL (rotas 404).

- [ ] **Step 2: Serviço**

`src/services/partes.ts`:

```ts
import { logAudit } from '../helpers';

/** Nome comparável: sem caixa e sem espaço repetido. Não tira acento (a spec pede nome exato). */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Lotes de 50: ponytail, teto de statements por batch do D1; sobe se um projeto passar de milhares de linhas. */
async function emLotes(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const saida: D1Result[] = [];
  for (let i = 0; i < stmts.length; i += 50) saida.push(...(await db.batch(stmts.slice(i, i + 50))));
  return saida;
}

const mudancas = (rs: D1Result[]) => rs.reduce((s, r) => s + (r.meta.changes ?? 0), 0);

export type ResumoImportacao = { criadas: number; reaproveitadas: number; vinculos: number };

/**
 * Traz as pessoas que o projeto já tem para `partes`: governança (menos os `consultor`, que são da ness.),
 * fornecedores e partes interessadas. Repetível: reaproveita a parte do mesmo tipo e nome, e o vínculo é
 * `INSERT OR IGNORE` sobre a UNIQUE.
 */
export async function importarPartes(db: D1Database, projectId: string, ator: string): Promise<ResumoImportacao> {
  const [gov, ven, stk, existentes] = await Promise.all([
    db.prepare(`SELECT name, email, role_category FROM project_governance WHERE project_id = ? AND role_category != 'consultor' ORDER BY rowid`)
      .bind(projectId).all<{ name: string; email: string | null; role_category: string }>(),
    db.prepare('SELECT name FROM vendors WHERE project_id = ? ORDER BY rowid').bind(projectId).all<{ name: string }>(),
    db.prepare('SELECT name FROM stakeholders WHERE project_id = ? ORDER BY rowid').bind(projectId).all<{ name: string }>(),
    db.prepare('SELECT id, nome, tipo FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string; tipo: string }>(),
  ]);

  const ids = new Map<string, string>();
  for (const p of existentes.results) if (!ids.has(`${p.tipo}|${norm(p.nome)}`)) ids.set(`${p.tipo}|${norm(p.nome)}`, p.id);

  const partes: D1PreparedStatement[] = [];
  const vinculos: D1PreparedStatement[] = [];
  let criadas = 0;
  let reaproveitadas = 0;

  const garantir = (tipo: 'pessoa' | 'organizacao', nome: string, email: string | null): string => {
    const chave = `${tipo}|${norm(nome)}`;
    const achou = ids.get(chave);
    if (achou) { reaproveitadas++; return achou; }
    const id = crypto.randomUUID();
    ids.set(chave, id);
    criadas++;
    partes.push(db.prepare('INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, projectId, tipo, nome.trim(), email ? email.trim().toLowerCase() : null));
    return id;
  };
  const vincular = (parteId: string, papel: string) => vinculos.push(
    db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, 'projeto', ?)`)
      .bind(crypto.randomUUID(), projectId, parteId, papel, projectId));

  for (const g of gov.results) vincular(garantir('pessoa', g.name, g.email), g.role_category === 'dpo' ? 'encarregado' : 'responsavel');
  for (const v of ven.results) vincular(garantir('organizacao', v.name, null), 'terceiro');
  for (const s of stk.results) vincular(garantir('organizacao', s.name, null), 'parte_interessada');

  await emLotes(db, partes); // as partes primeiro: o vínculo tem FK para elas
  const novos = mudancas(await emLotes(db, vinculos));
  await logAudit(db, 'partes.importadas', ator, `Importação de partes: ${criadas} criadas, ${reaproveitadas} reaproveitadas, ${novos} vínculos`, '', '', projectId);
  return { criadas, reaproveitadas, vinculos: novos };
}

/** Tabela e colunas que entram em SQL vêm só daqui, nunca da requisição. */
const FONTES = [
  { tabela: 'risks', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'compliance_controls', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'ropa_records', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'corrective_actions', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
  { tabela: 'checklist_progress', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
] as const;

export type Pendencia = { tabela: string; coluna: string; texto: string; n: number };
export type RelatorioConciliacao = { casados: Record<string, number>; sem_correspondencia: Pendencia[]; ambiguos: Pendencia[] };

/**
 * Liga o responsável em texto à parte de mesmo nome (exato, sem caixa e sem espaço repetido), por projeto.
 * Nome que bate com mais de uma parte é ambíguo e não é ligado. Só considera linha ainda sem parte; o texto
 * nunca é alterado. O dono do ativo vira vínculo `responsavel` do item. Repetível.
 */
export async function conciliarResponsaveis(db: D1Database, projectId: string, ator: string): Promise<RelatorioConciliacao> {
  const partes = await db.prepare('SELECT id, nome FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string }>();
  const porNome = new Map<string, string[]>();
  for (const p of partes.results) porNome.set(norm(p.nome), [...(porNome.get(norm(p.nome)) ?? []), p.id]);

  const casados: Record<string, number> = {};
  const sem = new Map<string, Pendencia>();
  const amb = new Map<string, Pendencia>();
  const anotar = (mapa: Map<string, Pendencia>, tabela: string, coluna: string, texto: string) => {
    const k = `${tabela}|${norm(texto)}`;
    const atual = mapa.get(k);
    if (atual) atual.n++; else mapa.set(k, { tabela, coluna, texto: texto.trim(), n: 1 });
  };
  /** A parte única de um nome, ou null (e anota por quê). */
  const resolver = (tabela: string, coluna: string, texto: string): string | null => {
    const achadas = porNome.get(norm(texto));
    if (!achadas) { anotar(sem, tabela, coluna, texto); return null; }
    if (achadas.length > 1) { anotar(amb, tabela, coluna, texto); return null; }
    return achadas[0];
  };

  for (const f of FONTES) {
    const linhas = await db.prepare(
      `SELECT id, ${f.coluna} AS texto FROM ${f.tabela} WHERE project_id = ? AND ${f.parte} IS NULL AND trim(COALESCE(${f.coluna}, '')) != ''`
    ).bind(projectId).all<{ id: string; texto: string }>();
    const stmts: D1PreparedStatement[] = [];
    for (const l of linhas.results) {
      const parte = resolver(f.tabela, f.coluna, l.texto);
      if (parte) stmts.push(db.prepare(`UPDATE ${f.tabela} SET ${f.parte} = ? WHERE id = ? AND project_id = ? AND ${f.parte} IS NULL`).bind(parte, l.id, projectId));
    }
    casados[f.tabela] = mudancas(await emLotes(db, stmts));
  }

  const itens = await db.prepare(
    `SELECT id, responsavel_texto AS texto FROM itens WHERE project_id = ? AND tipo = 'ativo' AND status = 'ativo' AND trim(COALESCE(responsavel_texto, '')) != ''`
  ).bind(projectId).all<{ id: string; texto: string }>();
  const vinculos: D1PreparedStatement[] = [];
  for (const i of itens.results) {
    const parte = resolver('itens', 'responsavel_texto', i.texto);
    if (parte) vinculos.push(db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'responsavel', 'item', ?)`)
      .bind(crypto.randomUUID(), projectId, parte, i.id));
  }
  casados.itens = mudancas(await emLotes(db, vinculos));

  const ordenar = (m: Map<string, Pendencia>) => [...m.values()].sort((a, b) => a.tabela.localeCompare(b.tabela) || a.texto.localeCompare(b.texto));
  const relatorio = { casados, sem_correspondencia: ordenar(sem), ambiguos: ordenar(amb) };
  await logAudit(db, 'partes.conciliadas', ator,
    `Conciliação de responsáveis: ${Object.values(casados).reduce((a, b) => a + b, 0)} ligados, ${relatorio.sem_correspondencia.length} sem correspondência, ${relatorio.ambiguos.length} ambíguos`, '', '', projectId);
  return relatorio;
}
```

- [ ] **Step 3: Rotas**

Em `src/routes/nucleo.ts`, junto dos outros imports acrescente `import { importarPartes, conciliarResponsaveis } from '../services/partes';` e, **antes** da rota `nucleoApp.get('/partes/:id'`, acrescente:

```ts
// ─── importar e conciliar (sob demanda, por projeto, repetíveis) ───────────
nucleoApp.post('/partes/importar', async (c) => {
  try {
    return c.json({ ok: true, ...(await importarPartes(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao importar as partes', e); }
});

nucleoApp.post('/partes/conciliar', async (c) => {
  try {
    return c.json({ ok: true, ...(await conciliarResponsaveis(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao conciliar os responsáveis', e); }
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=1 test/nucleo-conciliacao.test.ts test/nucleo-partes.test.ts` — Expected: PASS.
Run: `npx vitest run --maxWorkers=1 --testTimeout=120000 test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/trilha-exclusao.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-writes-validados.test.ts test/any-catraca.test.ts` — Expected: PASS. Se a varredura de isolamento reportar `POST /api/v1/projects/:projectId/partes/importar` ou `/conciliar` por falta de corpo, acrescente a ambas, no `CORPOS` do `-org`, `() => ({})`.

- [ ] **Step 5: Commit**

```bash
git add src test
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "feat(nucleo): importar as pessoas do projeto e conciliar o responsável com a parte"
```

---

### Task 3: Documentação, contagens e verificação final

**Files:**
- Modify: `docs/retencao.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Contagens e CHANGELOG**

Meça com os comandos do `AGENTS.md` e atualize os números dele e do `README.md`: migrations (`ls migrations/*.sql | wc -l`, última 0049), serviços (`ls src/services/*.ts | wc -l`, 22), arquivos de teste (`ls test/*.test.ts | wc -l`). Em `CHANGELOG.md`, em `## [Não publicado]` / `### Adicionado`:

```markdown
- Responsáveis viram partes (fatia 1.3, migration 0049): `risks`, `compliance_controls`, `ropa_records`, `corrective_actions` e `checklist_progress` ganham uma coluna `*_parte_id` ao lado do texto. `POST /api/v1/projects/:projectId/partes/importar` traz governança (sem os consultores da ness.), fornecedores e partes interessadas para `partes`; `POST .../partes/conciliar` liga o responsável em texto à parte de mesmo nome e devolve o relatório do que não casou e do que é ambíguo. Repetíveis, sem apagar texto. Vínculo com `item` passa a existir.
```

- [ ] **Step 2: Verificação final**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run --maxWorkers=2 > "$SCRATCH/n13.log" 2>&1; echo "VITEST_EXIT=$?"` — Expected: `VITEST_EXIT=0`, sem `Failed to start`.
Run: `npx vitest run test/sem-dado-de-cliente.test.ts` — Expected: PASS.

- [ ] **Step 3: Commit, PR e migration**

```bash
git add docs AGENTS.md README.md CHANGELOG.md
git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit -m "docs(nucleo): responsáveis viram partes — contagens e CHANGELOG"
git push -u origin <branch>
gh pr create --base <branch-da-1.2>
```

PR **sem merge**, empilhado sobre o da 1.2. A migration 0049 em produção (aditiva, sem janela) e o merge dependem do "sim" do dono. Depois do deploy, o consultor roda `partes/importar` e `partes/conciliar` em cada projeto e lê o relatório.

---

## Auto-revisão

- **Cobertura da spec 4.2:** governança → parte (+ vínculo; DPO como `encarregado`); fornecedor → parte organização + `terceiro`; stakeholder → parte + `parte_interessada`; `owner`/`assigned_to` ganham `*_parte_id` ao lado, com texto preservado; conciliação por nome exato com relatório do que não casou. Fora, por desenho: separar DPO de CISO (RoPA por pedido, 4.8), avaliação de TPRM do fornecedor (fatia 6), escrita do `*_parte_id` pelas rotas (1.4) e contato público do encarregado (1.4).
- **Placeholders:** nenhum; os trechos do `schema.sql` dizem a linha de referência de cada tabela.
- **Consistência de nomes:** `importarPartes`, `conciliarResponsaveis`, `FONTES`, `RelatorioConciliacao`, `Pendencia` e as colunas `owner_parte_id`/`assigned_to_parte_id` são os mesmos nas tarefas que os definem e usam.
- **Limite honesto:** o código do plano ainda não rodou; será provado pelos testes na execução. A produção foi medida só em agregados (25 linhas de governança, 8 consultores; 10 fornecedores; 20 partes interessadas; 13 riscos, 198 controles, 6 RoPAs, 2 CAPAs, 197 itens de checklist e 27 ativos com responsável em texto): a conciliação real mostrará quantos casam.
