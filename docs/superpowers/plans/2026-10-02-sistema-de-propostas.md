# Sistema de propostas — Plano de implementação (fatias 1 e 2)

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Passos com `- [ ]`.

**Objetivo:** dar ao comercial uma organização configurável (identidade, numeração, preço, textos) e um catálogo de serviços, a base sobre a qual a proposta, o aceite e o funil (fatias 3 a 5) serão construídos.

**Arquitetura:** a tabela `organizations`, que existe e não é usada, passa a guardar a configuração; a ness. é a organização `org_ness`. As tabelas comerciais ganham `org_id`. Um módulo `src/services/organizacao.ts` concentra "qual é a organização do usuário" e a leitura da configuração; o catálogo vive em `servicos`, com rotas próprias. Até a fatia 5 existe uma organização só, e `orgDoUsuario` devolve `org_ness` — o ponto único que a multi-consultoria vai trocar.

**Stack:** Cloudflare Workers + Hono 4.13, D1, zod, Vite vanilla-JS, vitest (pool workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md` (seções 3, 8, 9, 10, 11 e 13 valem para este plano).

**Escopo deste plano:** fatias 1 e 2, com tarefas executáveis. As fatias 3, 4 e 5 dependem das interfaces produzidas aqui e ganham **planos próprios** depois do merge desta parte; a seção final lista o que cada uma precisa decidir antes.

## Restrições globais

- Branch sempre de `origin/main`; um worktree por tarefa em `C:/Users/resper/worktrees/`. Nunca tocar o checkout principal.
- Commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Merge só com CI verde e pedido explícito do usuário. Depois do merge, `curl -s https://niso.ness.com.br/health` e comparar `version` com o SHA; colar a saída.
- Schema muda em dois lugares: `schema.sql` e migration numerada (próxima: `0036`). Índice depois da tabela. Migration com coluna nova roda em produção por `npx wrangler d1 migrations apply niso-db --remote` **antes** do merge (o deploy recusa migration pendente), sempre depois de `npm run db:backup` e com o "sim" do usuário.
- Rota que valida corpo entra em `src/openapi.ts`; depois `npm run openapi` (regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`).
- Rota nova do comercial entra em `FORA_DO_AGENTE` (`src/middleware/agente.ts`): o agente não alcança a área comercial.
- Todo texto de usuário que vira HTML passa por `escapeHtml`. Sem `Math.random` para identificador ou token (`genId`/`genToken`).
- Frontend: sem handler inline nem `<script>` inline (CSP `script-src 'self'`); ações por `data-action`/`data-args`; classes novas com regra em `frontend/src/style.css` (há teste guarda); sem emoji, sem itálico; tokens de `:root`.
- Código em inglês ou português conforme o arquivo vizinho; comentários, mensagens de erro e textos de tela em português.
- TDD: teste falha pelo motivo certo antes da implementação; mutação-check em todo teste novo (quebre o código, o teste tem de cair).
- Verificar a saída, não só o código de saída: procurar `FAIL` e `Unhandled`. A máquina local é lenta; o veredito final é o CI. Timeout maior só por `it(..., 30_000)`.

## Review Focus

1. **Organização inexistente ou sem configuração** (banco recém-criado, `resetData` em teste, migration não aplicada): `lerConfigOrg` deve falhar fechado com erro claro, nunca devolver configuração de outra organização nem `undefined` silencioso. → teste na Tarefa 2.
2. **Corpo de configuração parcial ou malicioso** (cor fora de `#rrggbb`, prefixo com espaço ou `/`, diária zero ou negativa, teto de desconto acima de 50%, texto com `<script>`): 400 com o envelope `{error, details}`; texto é guardado cru e escapado só na saída. → teste na Tarefa 2.
3. **Papel errado chegando na configuração ou no catálogo** (consultor, cliente, `org_admin` de cliente, agente MCP): 403, inclusive para leitura, porque catálogo e configuração carregam preço e custo. → testes nas Tarefas 2 e 5.
4. **Serviço inconsistente com o tipo** (`projeto` sem fases, fases cuja soma de % não dá 100, `recorrente` sem mensalidade, `avulso` fixo sem valor): 400 com a mensagem do campo. → teste na Tarefa 4.
5. **Serviço de outra organização** (id válido de `org_b` via PUT ou arquivar): 404, sem revelar que existe. → teste na Tarefa 5.

---

## Fatia 1 — Organização mínima

### Tarefa 1: schema e migration da organização

**Arquivos:**
- Modificar: `schema.sql` (tabela `organizations`, tabelas `leads`, `assessments`, `proposals`, `contracts`)
- Criar: `migrations/0036_organizacao_comercial.sql`
- Criar: `test/migration-0036.test.ts`
- Modificar: `test/schema-contract.test.ts`
- Modificar: `migrations/README.md`

**Interfaces:**
- Produz: colunas `organizations.cnpj`, `cor_destaque`, `selo_niso`, `prefixo_proposta`, `proximo_numero`, `config_preco`, `textos`, `secoes_desligadas`; colunas `org_id TEXT NOT NULL DEFAULT 'org_ness'` em `leads`, `assessments`, `proposals`, `contracts`; a linha `org_ness`.

Decisão de desenho (registrar no PR): `org_id` **sem** `REFERENCES`. O SQLite proíbe `ALTER TABLE ... ADD COLUMN` com `REFERENCES` e default não nulo quando as FKs estão ativas, e `schema.sql` e migration precisam do mesmo DDL (a divergência é exatamente o problema que o F10 corrigiu). A integridade fica no código (`orgDoUsuario`) e no teste de isolamento da fatia 5.

- [ ] **Passo 1: teste que falha** em `test/schema-contract.test.ts`, no estilo dos casos existentes (banco criado só de `schema.sql`):

```ts
it('organizations e tabelas comerciais trazem as colunas da organização', async () => {
  const colunas = async (t: string) =>
    (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<any>()).results.map((r) => r.name);
  for (const c of ['cnpj', 'cor_destaque', 'selo_niso', 'prefixo_proposta', 'proximo_numero', 'config_preco', 'textos', 'secoes_desligadas']) {
    expect(await colunas('organizations'), c).toContain(c);
  }
  for (const t of ['leads', 'assessments', 'proposals', 'contracts']) {
    expect(await colunas(t), t).toContain('org_id');
  }
  const ness = await env.DB.prepare(`SELECT name, prefixo_proposta, proximo_numero FROM organizations WHERE id = 'org_ness'`).first<any>();
  expect(ness).toEqual({ name: 'ness.', prefixo_proposta: 'NESS', proximo_numero: 1 });
});
```

- [ ] **Passo 2:** `npx vitest run test/schema-contract.test.ts` → FAIL (coluna ausente).

- [ ] **Passo 3: `schema.sql`.** Dentro do `CREATE TABLE organizations`, depois de `status`:

```sql
    cnpj TEXT,
    cor_destaque TEXT DEFAULT '#00ade8',
    selo_niso INTEGER NOT NULL DEFAULT 1,
    prefixo_proposta TEXT,
    proximo_numero INTEGER NOT NULL DEFAULT 1,
    -- JSON validado por configOrgSchema (src/schemas/domain.ts). Texto cru;
    -- escapado só na hora de virar HTML.
    config_preco TEXT,
    textos TEXT,
    secoes_desligadas TEXT,
```

Em `leads`, `assessments`, `proposals` e `contracts`, a última coluna antes do `)`:

```sql
    -- Organização dona do registro (spec do sistema de propostas, seção 8).
    -- Sem REFERENCES: ALTER TABLE não aceita FK com default não nulo; o DDL
    -- precisa ser o mesmo aqui e na migration 0036.
    org_id TEXT NOT NULL DEFAULT 'org_ness',
```

Depois do `CREATE TABLE organizations` (e não antes):

```sql
INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta, proximo_numero)
VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS', 1);
```

Conferir se `leads`, `assessments`, `proposals` e `contracts` vêm **depois** de `organizations` no arquivo não é necessário (não há FK), mas o `INSERT` precisa vir depois do `CREATE TABLE organizations`.

- [ ] **Passo 4: `migrations/0036_organizacao_comercial.sql`**, com o mesmo DDL:

```sql
-- Migration 0036: organização comercial (fatia 1 do sistema de propostas).
-- Aditiva. As colunas NÃO existem em produção: esta migration roda normalmente
-- (`wrangler d1 migrations apply niso-db --remote`), depois de `npm run db:backup`.
ALTER TABLE organizations ADD COLUMN cnpj TEXT;
ALTER TABLE organizations ADD COLUMN cor_destaque TEXT DEFAULT '#00ade8';
ALTER TABLE organizations ADD COLUMN selo_niso INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN prefixo_proposta TEXT;
ALTER TABLE organizations ADD COLUMN proximo_numero INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN config_preco TEXT;
ALTER TABLE organizations ADD COLUMN textos TEXT;
ALTER TABLE organizations ADD COLUMN secoes_desligadas TEXT;
ALTER TABLE leads ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE assessments ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE proposals ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
ALTER TABLE contracts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_ness';
INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta, proximo_numero)
VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS', 1);
```

Antes de escrever, conferir em produção (só leitura) que nenhuma dessas colunas existe e que `organizations` está vazia ou sem `org_ness`:
`npx wrangler d1 execute niso-db --remote --command "SELECT name FROM pragma_table_info('organizations'); SELECT id FROM organizations"`. Colar a saída no PR. Se `org_ness` ou as colunas existirem, parar e reportar.

- [ ] **Passo 5: `test/migration-0036.test.ts`**, no estilo do `migration-0035.test.ts`: cria `organizations` e `leads` como estão hoje em produção (copiar o `CREATE TABLE` de `schema.sql` do `origin/main` anterior a esta tarefa), insere um lead `l1`, roda o arquivo da migration com `execSql`, e confere: `leads.org_id` de `l1` é `org_ness`; existe a linha `org_ness` com prefixo `NESS`. Rodar duas vezes o `INSERT OR IGNORE` não duplica.

- [ ] **Passo 6:** `npx vitest run test/schema-contract.test.ts test/migration-0036.test.ts test/migration-0035.test.ts` → PASS. Mutação: tirar `org_id` de `contracts` no `schema.sql`; o teste do passo 1 cai. Reverter.

- [ ] **Passo 7:** `migrations/README.md` ganha a seção "0036" (o que adiciona, que roda normalmente em produção, e a ordem: backup → apply → conferir `migrations list` → merge). Commit:

```bash
git add schema.sql migrations/0036_organizacao_comercial.sql migrations/README.md test/schema-contract.test.ts test/migration-0036.test.ts
git commit -m "feat(organizacao): schema da organização comercial e org_id nas tabelas do comercial (propostas, fatia 1)"
```

### Tarefa 2: serviço e rotas de configuração da organização

**Arquivos:**
- Criar: `src/services/organizacao.ts`
- Modificar: `src/schemas/domain.ts` (`configOrgSchema`)
- Criar: `src/routes/organizacao.ts`
- Modificar: `src/index.ts` (montar `/api/v1/org`, depois do `authMiddleware` e antes do catch-all)
- Modificar: `src/openapi.ts`, `src/middleware/agente.ts`
- Criar: `test/organizacao.test.ts`

**Interfaces:**
- Consome: colunas da Tarefa 1.
- Produz:
  - `export const ORG_NESS = 'org_ness'`
  - `export function orgDoUsuario(user: { role?: string } | undefined): string` — hoje sempre `ORG_NESS`.
  - `export interface ConfigOrg { id: string; nome: string; cnpj: string | null; corDestaque: string; seloNiso: boolean; prefixoProposta: string; proximoNumero: number; preco: ConfigPreco; textos: TextosOrg; secoesDesligadas: SecaoDesligavel[] }`
  - `export interface ConfigPreco { diaria: Record<'1'|'2'|'3', number>; porte: { maxPessoas: number | null; fator: number }[]; tetoDesconto: number; custoInterno: Record<'1'|'2'|'3', number>; overheadPct: number; tributosPct: number; margemAlvo: number }`
  - `export interface TextosOrg { sobre: string; comoTrabalhamos: string; equipe: string; termos: string; premissas: string; pagamentoPadrao: string }`
  - `export type SecaoDesligavel = 'como_trabalhamos' | 'responsabilidades'`
  - `export async function lerConfigOrg(db: D1Database, orgId: string): Promise<ConfigOrg>` — lança `Error('Organização não configurada: <id>')` se a linha não existe.
  - `export function formatarNumeroProposta(prefixo: string, ano: number, n: number): string` → `NESS-2026-014`.
  - Rotas: `GET /api/v1/org/config` (comercial e plataforma) e `PUT /api/v1/org/config` (só `platform_admin`).

Padrões de preço quando a coluna está vazia (saem de `DEFAULT_FINANCIAL_MODEL` e `SCOPE_MULTIPLIERS` de `src/services/pricing.ts`, para não inventar número): `diaria` = `taxaVendaPD`; `porte` = `SCOPE_MULTIPLIERS` com `Infinity` virando `null`; `tetoDesconto` = 15; `custoInterno` = `custoInternoPD`; `overheadPct` = `overheadPct`; `tributosPct` = soma de `tributos`; `margemAlvo` = `margemAlvo`. Textos padrão: strings vazias (a fatia 3 decide o texto inicial com a revisão jurídica).

- [ ] **Passo 1: teste que falha** — `test/organizacao.test.ts`, com o harness de `test/revogar-aprovacoes.test.ts` (`app`, `workerEnv`, `sessionFor`, `applySchema`):

```ts
describe('configuração da organização', () => {
  let adm: Record<string, string>, comercial: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
    comercial = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
    consultor = await sessionFor({ id: 'u-con', email: 'con@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-a' });
  });

  it('GET devolve a ness. com os padrões de preço do motor atual', async () => {
    const r = await chamar('GET', '/api/v1/org/config', comercial);
    expect(r.status).toBe(200);
    const c = await r.json<any>();
    expect(c.nome).toBe('ness.');
    expect(c.prefixoProposta).toBe('NESS');
    expect(c.preco.diaria).toEqual({ '1': 2200, '2': 2900, '3': 3600 });
    expect(c.preco.tetoDesconto).toBe(15);
    expect(c.sugestaoNumero).toMatch(/^NESS-\d{4}-001$/);
  });

  it('consultor, cliente e agente não leem: a configuração tem custo e margem', async () => {
    expect((await chamar('GET', '/api/v1/org/config', consultor)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/org/config', cliente)).status).toBe(403);
    expect((await comoAgente('GET', '/api/v1/org/config')).status).toBe(403);
  });

  it('PUT: só platform_admin grava; comercial leva 403', async () => {
    const corpo = { corDestaque: '#1f7a5c', prefixoProposta: 'NESS', preco: { diaria: { '1': 2000, '2': 2800, '3': 3500 } } };
    expect((await chamar('PUT', '/api/v1/org/config', comercial, corpo)).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/org/config', adm, corpo)).status).toBe(200);
    const c = await (await chamar('GET', '/api/v1/org/config', comercial)).json<any>();
    expect(c.corDestaque).toBe('#1f7a5c');
    expect(c.preco.diaria['2']).toBe(2800);
    expect(c.preco.tetoDesconto).toBe(15); // o que não veio no corpo continua
  });

  it.each([
    [{ corDestaque: 'azul' }, 'corDestaque'],
    [{ prefixoProposta: 'NE SS' }, 'prefixoProposta'],
    [{ prefixoProposta: 'A/B' }, 'prefixoProposta'],
    [{ preco: { diaria: { '1': 0 } } }, 'preco.diaria.1'],
    [{ preco: { tetoDesconto: 60 } }, 'preco.tetoDesconto'],
    [{ proximoNumero: 0 }, 'proximoNumero'],
  ])('corpo inválido %j → 400 apontando %s', async (corpo, campo) => {
    const r = await chamar('PUT', '/api/v1/org/config', adm, corpo);
    expect(r.status).toBe(400);
    const b = await r.json<any>();
    expect(b.details.map((d: any) => d.path)).toContain(campo);
  });

  it('texto com <script> é guardado como veio (escape é na saída)', async () => {
    await chamar('PUT', '/api/v1/org/config', adm, { textos: { sobre: '<script>x</script>' } });
    const c = await (await chamar('GET', '/api/v1/org/config', comercial)).json<any>();
    expect(c.textos.sobre).toBe('<script>x</script>');
  });

  it('a gravação vai para a trilha', async () => {
    const t = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'org.config_atualizada' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(t?.actor).toBe('adm@ness.lat');
  });

  it('organização ausente: lerConfigOrg falha fechado', async () => {
    await expect(lerConfigOrg(env.DB, 'org_inexistente')).rejects.toThrow(/não configurada/);
  });
});

describe('formatarNumeroProposta', () => {
  it('zera à esquerda até três dígitos e não corta números maiores', () => {
    expect(formatarNumeroProposta('NESS', 2026, 14)).toBe('NESS-2026-014');
    expect(formatarNumeroProposta('PONTE', 2026, 1234)).toBe('PONTE-2026-1234');
  });
});
```

(`chamar` e `comoAgente` como no topo de `test/revogar-aprovacoes.test.ts`; `AGENTE` com `projectId: 'p-a'`; semear `projects` `p-a` e a linha de governança do consultor do agente, como lá.)

- [ ] **Passo 2:** rodar → FAIL (rota 404 / módulo inexistente).

- [ ] **Passo 3: `configOrgSchema`** em `src/schemas/domain.ts` (todos os campos opcionais: PUT é parcial):

```ts
const valorDiaria = z.number().positive().max(100_000);
export const configOrgSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  cnpj: z.string().trim().regex(/^\d{14}$/, 'CNPJ com 14 dígitos, só números').nullable().optional(),
  corDestaque: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #rrggbb').optional(),
  seloNiso: z.boolean().optional(),
  prefixoProposta: z.string().regex(/^[A-Z0-9]{2,10}$/, 'Prefixo com 2 a 10 letras maiúsculas ou números').optional(),
  proximoNumero: z.number().int().min(1).optional(),
  preco: z.object({
    diaria: z.object({ '1': valorDiaria, '2': valorDiaria, '3': valorDiaria }).partial().optional(),
    porte: z.array(z.object({ maxPessoas: z.number().int().positive().nullable(), fator: z.number().min(0.5).max(5) })).min(1).max(8).optional(),
    tetoDesconto: z.number().min(0).max(50).optional(),
    custoInterno: z.object({ '1': valorDiaria, '2': valorDiaria, '3': valorDiaria }).partial().optional(),
    overheadPct: z.number().min(0).max(1).optional(),
    tributosPct: z.number().min(0).max(0.6).optional(),
    margemAlvo: z.number().min(0).max(1).optional(),
  }).optional(),
  textos: z.object({
    sobre: z.string().max(4000), comoTrabalhamos: z.string().max(6000), equipe: z.string().max(4000),
    termos: z.string().max(30000), premissas: z.string().max(6000), pagamentoPadrao: z.string().max(500),
  }).partial().optional(),
  secoesDesligadas: z.array(z.enum(['como_trabalhamos', 'responsabilidades'])).max(2).optional(),
}).strict();
```

- [ ] **Passo 4: `src/services/organizacao.ts`.** `lerConfigOrg` lê a linha, faz `JSON.parse` de `config_preco`/`textos`/`secoes_desligadas` (string vazia ou nula → objeto/array vazio) e mescla **campo a campo** com os padrões acima (o mesmo jeito do `mergeConfig` de `pricing.ts`). `orgDoUsuario` leva o comentário `// ponytail: uma organização só até a fatia 5 (multi-consultoria); aqui entra users.org_id`. `formatarNumeroProposta(p, ano, n)` = `` `${p}-${ano}-${String(n).padStart(3, '0')}` ``.

- [ ] **Passo 5: `src/routes/organizacao.ts`.**
  - `GET /config`: `ehComercial(user)` ou 403 (`platform_admin` já está em `PAPEIS_COMERCIAL`); devolve `lerConfigOrg(db, orgDoUsuario(user))` mais `sugestaoNumero = formatarNumeroProposta(prefixo, anoAtual, proximoNumero)`.
  - `PUT /config`: `user.role === 'platform_admin'` ou 403 (comentário: o administrador de cada consultoria entra na fatia 5); `validateBody(c, configOrgSchema)`; mescla o corpo sobre a configuração atual (`preco` e `textos` campo a campo); grava as colunas; `logAudit(db, 'org.config_atualizada', user.email, 'Configuração comercial da organização <id> atualizada: <campos>')`; devolve a configuração nova.
  - Erros por `erro500`. Montar em `src/index.ts`: `app.route('/api/v1/org', organizacaoApp);` junto dos outros routers protegidos.

- [ ] **Passo 6:** `src/openapi.ts`: `{ metodo: 'PUT', caminho: '/api/v1/org/config', schema: configOrgSchema, nome: 'configOrgSchema' }`; `npm run openapi`. `src/middleware/agente.ts`, em `FORA_DO_AGENTE`: `[/^\/api\/v1\/org(\/|$)/, 'área comercial']`.

- [ ] **Passo 7:** `npx vitest run test/organizacao.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/agente-paridade.test.ts` → PASS. `npx tsc --noEmit` limpo. Mutações: (a) no GET, trocar `ehComercial` por `true` — o teste do consultor cai; (b) no merge do PUT, sobrescrever `preco` inteiro — o teste do `tetoDesconto` cai. Reverter.

- [ ] **Passo 8:** commit `feat(organizacao): configuração comercial da organização (identidade, numeração, preço, textos)`.

### Tarefa 3: consultor deixa de receber preço no levantamento

**Arquivos:** `src/routes/assessments.ts` (GET de listagem e de detalhe), `test/assessments.test.ts` (ou arquivo novo `test/assessments-preco.test.ts`).

Spec, seção 10: o consultor recebe `pricing_override` e `pricing_notas` porque `GET /assessments` faz `SELECT *` (`assessments.ts:204`).

- [ ] **Passo 1: teste que falha:** semear um assessment com `pricing_override = 50000`, `pricing_desconto = 10`, `pricing_notas = 'margem baixa'`; `GET /api/v1/assessments` e `GET /api/v1/assessments/:id` como `consultor` não trazem nenhuma chave `pricing_*`; como `comercial`, trazem.
- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** função local `semPreco(row)` que remove as chaves que começam com `pricing_` quando `!ehComercial(user)`; aplicar no GET de lista e no de detalhe (procurar com `grep -n "SELECT \* FROM assessments" src/routes/assessments.ts` todos os pontos que devolvem a linha inteira ao cliente da API e cobrir cada um).
- [ ] **Passo 4:** rodar → PASS; mutação (devolver a linha sem filtro) → cai. Commit `fix(assessments): consultor não recebe preço do levantamento`.

### Fechamento da fatia 1

- [ ] CHANGELOG (`[Não publicado]`: Added "organização comercial", Segurança "consultor sem preço no levantamento").
- [ ] PR único da fatia 1 (Tarefas 1–3), CI verde.
- [ ] Antes do merge, com o "sim" do usuário: `npm run db:backup`; `npx wrangler d1 migrations apply niso-db --remote`; `npx wrangler d1 migrations list niso-db --remote` → "No migrations to apply"; `SELECT id, prefixo_proposta FROM organizations` → `org_ness | NESS`. Colar as saídas no PR.
- [ ] Merge, `/health` com o SHA, e a sonda `GET /api/v1/org/config` sem sessão → 401.

---

## Fatia 2 — Catálogo de serviços

### Tarefa 4: tabela `servicos` e validação por tipo

**Arquivos:**
- Modificar: `schema.sql`; criar `migrations/0037_servicos.sql`, `test/migration-0037.test.ts`
- Modificar: `src/schemas/domain.ts` (`servicoSchema`)
- Criar: `test/servicos-schema.test.ts`

**Interfaces:**
- Produz:
  - Tabela `servicos` (DDL abaixo).
  - `servicoSchema` (zod, união discriminada por `tipo`).
  - `export type ServicoEntrada = z.input<typeof servicoSchema>` (o que o cliente da API envia).
  - `export type Servico = z.infer<typeof servicoSchema> & { id: string; orgId: string; ativo: boolean }` (o que a API devolve).

DDL (igual em `schema.sql` e na `0037`):

```sql
-- Catálogo de serviços da organização (spec do sistema de propostas, seção 3).
-- Campos de lista/estrutura são JSON validado por servicoSchema; a proposta
-- (fatia 3) guarda CÓPIA do serviço, então editar aqui não muda proposta gerada.
CREATE TABLE IF NOT EXISTS servicos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    norma TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL CHECK (tipo IN ('projeto', 'avulso', 'recorrente')),
    forma_preco TEXT CHECK (forma_preco IS NULL OR forma_preco IN ('fixo', 'esforco')),
    valor_fixo REAL,
    mensalidade REAL,
    prazo_minimo_meses INTEGER,
    dias_por_faixa TEXT,
    fases TEXT,
    entregaveis TEXT,
    criterio_aceite TEXT NOT NULL DEFAULT '',
    incluso_mes TEXT,
    premissas TEXT,
    exclusoes TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_servicos_org ON servicos(org_id, ativo);
```

`servicoSchema`:

```ts
const listaCurta = z.array(z.string().trim().min(1).max(500)).max(40);
const fase = z.object({
  nome: z.string().trim().min(1).max(120),
  objetivo: z.string().trim().max(1000).default(''),
  atividades: z.string().trim().max(3000).default(''),
  entregaveis: z.string().trim().max(3000).default(''),
  criterioAceite: z.string().trim().max(1000).default(''),
  pct: z.number().positive().max(100),
  semanas: z.number().int().positive().max(104),
});
const diasPorFaixa = z.object({ '1': z.number().positive(), '2': z.number().positive(), '3': z.number().positive() });
const base = {
  nome: z.string().trim().min(1).max(160),
  norma: z.string().trim().max(80).default(''),
  descricao: z.string().trim().max(3000).default(''),
  premissas: listaCurta.default([]),
  exclusoes: listaCurta.default([]),
};
export const servicoSchema = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('projeto'), diasPorFaixa,
    fases: z.array(fase).min(1).max(15)
      .refine((fs) => Math.abs(fs.reduce((s, f) => s + f.pct, 0) - 100) < 0.01, 'A soma do % das fases precisa ser 100') }),
  z.object({ ...base, tipo: z.literal('avulso'), formaPreco: z.literal('fixo'), valorFixo: z.number().positive(),
    entregaveis: listaCurta.min(1), criterioAceite: z.string().trim().min(1).max(1000) }),
  z.object({ ...base, tipo: z.literal('avulso'), formaPreco: z.literal('esforco'), diasPorFaixa,
    entregaveis: listaCurta.min(1), criterioAceite: z.string().trim().min(1).max(1000) }),
  z.object({ ...base, tipo: z.literal('recorrente'), mensalidade: z.number().positive(),
    prazoMinimoMeses: z.number().int().min(1).max(60), inclusoMes: listaCurta.min(1) }),
]);
```

Se o zod do repo recusar duas variantes com o mesmo literal `avulso` na união discriminada, trocar por `z.union` nas duas de `avulso` e manter `discriminatedUnion` para o resto; registrar no PR.

- [ ] **Passo 1: testes que falham** — `test/servicos-schema.test.ts` (função pura, sem D1):
  - aceita um `projeto` com 2 fases somando 100;
  - recusa `projeto` sem fases e com fases somando 90 (mensagem "precisa ser 100");
  - recusa `recorrente` sem `mensalidade`;
  - recusa `avulso` `fixo` sem `valorFixo` e `avulso` `esforco` sem `diasPorFaixa`;
  - recusa `tipo: 'pacote'`.
  E em `test/schema-contract.test.ts`: a tabela `servicos` existe e o `CHECK` recusa `tipo = 'pacote'` (INSERT direto lança).
- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** DDL em `schema.sql` e `migrations/0037_servicos.sql` (tabela nova: roda normalmente em produção); `servicoSchema` em `domain.ts`.
- [ ] **Passo 4:** `test/migration-0037.test.ts`: aplicar a 0037 num banco sem `servicos` cria a tabela e o índice. Rodar tudo → PASS. Mutação: tirar o `refine` da soma → o teste dos 90% cai.
- [ ] **Passo 5:** commit `feat(servicos): tabela e validação do catálogo de serviços`.

### Tarefa 5: rotas do catálogo e catálogo inicial da ness.

**Arquivos:**
- Criar: `src/routes/servicos.ts`, `src/services/catalogo-inicial.ts`
- Modificar: `src/index.ts`, `src/openapi.ts`, `src/middleware/agente.ts`
- Criar: `test/servicos.test.ts`

**Interfaces:**
- Consome: `orgDoUsuario`, `ehComercial` (Tarefa 2), `servicoSchema` (Tarefa 4).
- Produz:
  - `GET /api/v1/servicos?ativos=1` → `Servico[]` da organização do usuário.
  - `GET /api/v1/servicos/:id` → `Servico` ou 404.
  - `POST /api/v1/servicos` (cria), `PUT /api/v1/servicos/:id` (substitui), `POST /api/v1/servicos/:id/arquivar`, `POST /api/v1/servicos/:id/reativar`.
  - `POST /api/v1/servicos/semear-padrao` (só `platform_admin`; recusa com 409 se a organização já tem serviço).
  - `export function catalogoInicialNess(): ServicoEntrada[]` em `catalogo-inicial.ts`.
  - Função interna `deLinha(row): Servico` e `paraColunas(s): Record<string, unknown>` (camelCase ↔ colunas + JSON), usada por todas as rotas.

Quem pode: leitura e escrita para `ehComercial` (o catálogo tem preço); `semear-padrao` só `platform_admin`. Sem exclusão: só arquivar (spec, seção 3). Toda consulta leva `WHERE org_id = ?` com `orgDoUsuario(user)`; id de outra organização → 404.

`catalogoInicialNess()` sai do código existente, para não inventar número:
- **"Implementação ISO 27001 + 27701"**, `tipo: 'projeto'`, `norma: 'ISO/IEC 27001:2022 + 27701:2025'`, `diasPorFaixa` = `{ '1': TIERS[0].pdNess, '2': TIERS[1].pdNess, '3': TIERS[2].pdNess }` (45/90/160), `fases` = `PHASE_BREAKDOWN[2]` mapeado (`nome`, `pct`, `semanas`; `objetivo`, `atividades`, `entregaveis`, `criterioAceite` com o texto das fases F1–F7 da prévia aprovada, copiado para o arquivo).
  *Decisão a registrar no PR:* as fases do catálogo são as da faixa Standard (7 fases); as faixas passam a mudar só os **dias**. Era o que o spec já pedia ("as faixas viram dias sugeridos"); a variação de fases por faixa do `PHASE_BREAKDOWN` sai do preço. Custo se estiver errado: a consultoria edita as fases do serviço.
- **"Auditoria interna"**, `avulso`, `esforco`, `diasPorFaixa` = `{ '1': 6, '2': 11, '3': 16 }` (os `pdNess` da fase "Auditoria Interna" em `PHASE_BREAKDOWN[2]` e `[3]`, e o Foundation proporcional), entregáveis: programa de auditoria, relatório (9.2), plano de ação corretiva (10.2).
- **"Manutenção do SGSI"**, `recorrente`, `mensalidade` e `prazoMinimoMeses` **zerados não passam no schema**: usar `mensalidade: 1` e marcar `ativo = 0` (arquivado) até o comercial definir o valor; descrição diz "defina a mensalidade antes de ativar". Comentário `// ponytail:` explicando.

- [ ] **Passo 1: testes que falham** (`test/servicos.test.ts`, mesmo harness):
  - `comercial` cria um `avulso` válido → 201; `GET` lista; `GET /:id` devolve igual ao enviado;
  - `consultor`, cliente e agente → 403 em `GET` e `POST`;
  - corpo inválido (fases somando 90) → 400 com `details`;
  - `PUT` substitui; `arquivar` tira da lista `?ativos=1` mas `GET /:id` ainda devolve com `ativo: false`; `reativar` volta;
  - serviço com `org_id = 'org_b'` semeado direto no banco: `GET /:id`, `PUT` e `arquivar` → **404**;
  - `semear-padrao` por `platform_admin` cria 3 serviços, dois ativos; a segunda chamada → 409; por `comercial` → 403;
  - o serviço "Implementação…" semeado tem 7 fases somando 100 e `diasPorFaixa` 45/90/160;
  - cada escrita gera linha na trilha (`servico.criado`, `servico.atualizado`, `servico.arquivado`).
- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** implementar `catalogo-inicial.ts` e `servicos.ts`; montar `app.route('/api/v1/servicos', servicosApp)`; `openapi.ts` (POST e PUT com `servicoSchema`); `npm run openapi`; `FORA_DO_AGENTE` ganha `[/^\/api\/v1\/servicos(\/|$)/, 'área comercial']`.
- [ ] **Passo 4:** rodar o arquivo + `openapi`, `contrato-mcp`, `agente-paridade`, `trilha-exclusao` → PASS; `tsc` limpo. Mutações: (a) tirar o `WHERE org_id` do `GET /:id` → o teste de `org_b` cai; (b) permitir `semear-padrao` duas vezes → o teste do 409 cai.
- [ ] **Passo 5:** commit `feat(servicos): rotas do catálogo e catálogo inicial da ness.`.

### Tarefa 6: telas de configuração e de catálogo

**Arquivos:**
- Criar: `frontend/src/views/catalogo.js` (catálogo) e `frontend/src/views/config-comercial.js` (configuração)
- Modificar: `frontend/src/router.js` (duas views), `frontend/login.html` (dois itens na barra lateral, visíveis só para `comercial` e `platform_admin`, como os itens comerciais existentes), `frontend/src/main.js` (importar), `frontend/src/style.css`
- Criar: `frontend/test/catalogo.test.js`, `frontend/test/config-comercial.test.js`, e o guarda de CSS das classes novas no estilo de `frontend/test/conectar-agente-css.test.js` (usa `import.meta.glob` com `?raw`)

**Comportamento:**
- **Configuração comercial** (`config-comercial`): quatro blocos — Identidade (nome, CNPJ, cor com `<input type="color">`, selo), Numeração (prefixo, próximo número, e a prévia ao vivo `NESS-2026-014`), Preço (três diárias, tabela de porte editável em linhas, teto de desconto, e, recolhido, custo interno, overhead, tributos e margem-alvo), Textos (seis `<textarea>` com `<label>`), mais as duas seções desligáveis. Um botão "Salvar". Para `comercial` a tela é só leitura (o PUT é de `platform_admin`); os campos ficam `readonly` e o botão some. Erro 400 mostra a mensagem junto do campo pelo `path` do `details`.
- **Catálogo** (`catalogo`): lista com nome, norma, tipo, preço resumido ("90 dias na faixa Standard", "R$ 4.000/mês × 12") e situação; filtro "mostrar arquivados"; "Novo serviço" e "Editar" abrem um formulário em modal cujo bloco muda com o tipo (projeto: dias por faixa e linhas de fase com o total de % ao vivo, e o botão Salvar desabilitado enquanto não der 100; avulso: forma de preço; recorrente: mensalidade, prazo e itens inclusos). "Arquivar" pede confirmação na própria tela. Catálogo vazio mostra a ação "Carregar catálogo inicial" só para `platform_admin`.

- [ ] **Passo 1: testes que falham** (jsdom, scaffold de modal `#modal-overlay > #modal > #modal-content` como em `frontend/test/revogar-aprovacoes.test.js`; `fetch` mockado com `vi.spyOn(globalThis, 'fetch')`):
  - catálogo renderiza 3 serviços com o resumo de preço certo para cada tipo;
  - trocar o tipo no formulário troca os campos;
  - fases somando 90 → "Salvar" desabilitado e o total em destaque; somando 100 → habilitado;
  - salvar envia o corpo no formato do `servicoSchema` (conferir chaves e tipos numéricos);
  - 400 do servidor mostra a mensagem junto do campo apontado por `details[].path`;
  - configuração: `comercial` vê os campos `readonly` e sem botão Salvar; `platform_admin` vê o botão; a prévia do número muda ao digitar o prefixo;
  - nenhuma das duas telas tem `on*=` inline nem `<script>`.
- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** implementar com `escapeHTML` em todo valor interpolado; `<label for>` em todo campo; foco visível; sem cor literal fora dos tokens.
- [ ] **Passo 4:** `cd frontend && npx vitest run` (suíte toda) → PASS. Captura de tela com `playwright-core` e harness Vite (como no #236), esperar 1800 ms pelo `fade-in`, olhar a imagem, apagar o harness. Mutação: remover a trava de 100% → o teste cai.
- [ ] **Passo 5:** commit `feat(frontend): telas de configuração comercial e catálogo de serviços`.

### Fechamento da fatia 2

- [ ] CHANGELOG; PR da fatia 2; CI verde.
- [ ] Antes do merge, com o "sim" do usuário: backup, `migrations apply` (0037), `migrations list` limpo.
- [ ] Merge, `/health` com o SHA. Depois, com o usuário logado como `platform_admin`, "Carregar catálogo inicial" pela tela (ou `POST /api/v1/servicos/semear-padrao`), e conferir a lista.
- [ ] Lembrete ao usuário (spec, seção 12): diária e dias por faixa da ness. precisam ser revistos pelo comercial antes da fatia 3 usá-los em proposta real.

---

## Fatias 3, 4 e 5 — planos próprios

Cada uma ganha um plano depois do merge da anterior. O que cada plano precisa decidir antes de começar:

**Fatia 3 — Proposta** (spec, seções 4 e 5). Depende de: `lerConfigOrg`, `formatarNumeroProposta`, `Servico`. Decidir: tabelas `propostas`/`proposta_itens`/`proposta_versoes` (substituem `proposals`, que tem esboço e `content_html` de uma linha) ou evolução de `proposals`; reserva atômica do número (`UPDATE organizations SET proximo_numero = proximo_numero + 1 ... RETURNING`) com `UNIQUE (org_id, numero, revisao)`; montagem do HTML no servidor em `src/services/documento-proposta.ts` com as seções condicionais; hash SHA-256; aprovação de desconto acima do teto. Bloqueios: revisão jurídica dos termos e conferência das referências da ISO 27701:2025 (spec, seção 12).

**Fatia 4 — Link, aceite e fechamento** (spec, seção 6). Depende de: proposta congelada com hash. Decidir: rota pública `/api/v1/public/propostas/:token` com limite de taxa; `fecharVenda` idempotente em `db.batch` usando `designacaoDoCriador`; remoção do botão "Aprovar", de `POST /proposals/:id/sign` e da criação de projeto em `/assessments/:id/convert`; e-mail pelo `sendEmail` existente. Bloqueio: domínio de envio (`ness.com.br` × `ness.lat`).

**Fatia 5 — Funil e abertura a outras consultorias** (spec, seções 7 e 9). Depende de tudo acima. Decidir: `users.org_id` e o papel de administrador da organização; troca de `orgDoUsuario`; upload de logo para o R2; teste que percorre `app.routes` exigindo recusa entre organizações; transferência de projeto para o cliente; termo de uso. É a mesma frente da multi-consultoria e deve ter spec próprio para a parte que não é comercial.
