# P3 — Projeto nasce completo da venda: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o projeto criado pelo aceite de uma proposta nasce com os controles da norma vendida, com o escopo vendido e o contato do aceite na governança (sem autoridade de assinatura), e a consultoria é avisada quando ele nasce sem consultor.

**Architecture:** tudo entra no `db.batch` único de `fecharVenda` (`src/services/fechar-venda.ts:146-152`). Cada passo novo fica preso à guarda que já existe ali: ou `WHERE ${G}`, que confere se a proposta tem o contrato desta chamada, ou `WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)` sobre o `projetoId` novo de cada chamada. Assim o re-aceite e a corrida não gravam nada a mais. `semearControles` sai de `src/routes/projects.ts:887-902` e vai para `src/services/project-setup.ts`, ao lado de `stmtsFases`, como um INSERT só (`json_each`) que entra em batch. O botão "Carregar catálogo" e o fechamento passam a usar a mesma definição.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), vitest com `@cloudflare/vitest-pool-workers` (D1 real).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (seção 2, linha P3; seções 3, 4 e 5)

## Global Constraints

- Testes de backend: `npx vitest run <arq>` na raiz. O pool é de Workers, com D1 real via `cloudflare:test`. Os helpers ficam em `test/helpers/d1.ts`: `applySchema`, `resetData`, `resetSessions`, `sessionFor`, `workerEnv`. `sessionFor({ id, email, role: 'admin', iat: Date.now() })` dá `platform_admin`.
- INSERT em `projects` nos testes precisa de `standards` e `org_role`.
- `test/any-catraca.test.ts` (TETO 557): código novo sem `any`. Em catch de rota, use `catch (e) { return erro500(c, '...', e); }`.
- Este plano não cria rota. Por isso não mexe em `src/trilha-exclusao.ts`, `src/openapi.ts`, no allow-list de `src/middleware/auth.ts` nem em `FORA_DO_AGENTE`.
- Schema não muda: as colunas usadas já existem (`propostas.escopo`, `propostas.secoes_editadas`, `projects.scope`, `project_governance.*`, `notifications.*`). Nenhuma migration.
- Ponytail: o menor diff. Reusar `stmtsFases`, a guarda `G` e o padrão de notificação em batch que já existe em `fecharVenda` (`fechar-venda.ts:140-144`). `createNotification` (`src/helpers.ts:118-132`) faz `.run()` e não entra em batch, então não serve aqui.
- Código em português nos comentários e mensagens. Arquivos em UTF-8 sem BOM, conferidos com Python (`iconv` não existe nesta máquina).
- Fora de escopo (spec, seção 4): criar a conta do cliente. P3 só registra o contato. O convite continua sendo ato do consultor pelo botão "Convidar para o n.iso" da governança (`frontend/src/views/monitor.js:512`).
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A suíte de backend completa leva ~20 min nesta máquina. Cada tarefa roda os testes focados, e a suíte completa só roda na Task 6.

## Decisões para o dono revisar

Em cada item, o custo indicado é o de a decisão estar errada.

1. **O contato do aceite entra com `role_category = 'executivo'` e `job_title` fixo `Contato do cliente (aceite da proposta)`.** O cargo digitado pelo cliente não vai para a matriz: fica em `propostas.aceite_cargo`. Custo: para o contato assinar, o consultor edita o cargo na tela de governança, uma vez por projeto.
2. **O que dispara os controles é o texto `projects.standards` mais a norma e o nome dos serviços de projeto.** `standards` vem do `target_standard` do levantamento ou, sem levantamento, das normas vendidas. O 27701 traz o 27001 junto. Texto sem "27001" nem "27701" (por exemplo, "Adequação LGPD") não gera controle nenhum. Custo: se o levantamento pediu 27701 e só 27001 foi vendido, entram 31 controles de privacidade que o consultor marca como não aplicáveis. Na outra ponta, um projeto sem norma reconhecida nasce vazio e usa o botão "Carregar catálogo".
3. **O papel 27701 "Ainda não mapeado" vira Controlador (A.1).** Hoje `controlsForRole` devolve lista vazia para ele (`src/data/iso27701-2025.ts:83-91`), e o papel vazio já vira Controlador. Custo: se o cliente for operador, o consultor acrescenta a A.2 pelo seed 27701 depois de corrigir o papel, e marca a A.1 como não aplicável.
4. **O escopo copiado segue esta ordem: a seção "Objeto e escopo" reescrita no documento (`secoes_editadas.objeto`, que é o texto que o cliente aceitou: `documento-proposta.ts:215,221`), depois o campo `propostas.escopo`, depois `scope_type` do levantamento.** O `contexto` da proposta não é copiado. Custo: o consultor reescreve o escopo pela tela de mudança de escopo.
5. **O aviso de "projeto sem consultor" vai para os `consultoria_admin` ativos da organização. Se ela não tiver nenhum, vai para os `platform_admin`/`admin` ativos.** Não entra linha extra na trilha. Custo: a plataforma recebe aviso de consultorias que não têm administrador.
6. **`project_name` passa a ser `<cliente> — <normas vendidas>`; sem norma, `<cliente> — <nome do primeiro serviço>`.** Os projetos que já existem não mudam. Custo: nenhum dado se perde; o nome é editável.
7. **Os ids dos controles semeados passam a ser hex aleatório (`lower(hex(randomblob(16)))`) em vez de `genId()`, também no botão "Carregar catálogo".** Custo: nenhum conhecido, porque os ids já variam por projeto e `idDoControle` acha qualquer formato.

## Achados da spec conferidos no código

- **"O projeto nascido da venda não ganha controles":** confirmado. `fecharVenda` só insere projeto e fases (`fechar-venda.ts:100-107`).
- **"Nem governança além do consultor":** confirmado. Só a linha do consultor (`fechar-venda.ts:122-130`).
- **"Nem o escopo vendido":** confirmado. `scope` vem de `respostas.scope_type` (`fechar-venda.ts:173`), que guarda "Empresa inteira" e afins. A tela de escopo lê `projects.scope` (`frontend/src/globals.js:1637`, `frontend/src/views/project.js:1043`). `context_analysis` é a SWOT (`src/routes/governance.ts:320-331`) e não é o lugar do escopo.
- **"O aceite sem consultor deixa o projeto invisível": só em parte.** O projeto nasce com `org_id = p.org_id` (`fechar-venda.ts:101-104`). O `consultoria_admin` da organização já o alcança por `PROJETOS_DA_ORG_SQL` (`src/helpers.ts:208-209`, `245-257`, `269-273`), e o `platform_admin` vê tudo. Ele é invisível só para os consultores, e o problema real é que ninguém é avisado. Por isso não há tarefa de visibilidade, só a de aviso (Task 5), com um teste que fixa o alcance do `consultoria_admin`.
- **Autoridade de assinatura:** `autoridadeDeAssinatura` (`src/helpers.ts:422-448`) decide só pelo `job_title`, com os trechos `sgsi`, `dpo`, `ciso`, `ceo`, `diret` e `execut`. Gravar `aceite_cargo` ("Diretora", "CEO") como `job_title` daria assinatura automática. Por isso o cargo é fixo (decisão 1). `role_category` não pesa na autoridade, e a tela só exibe as categorias `consultor`, `executivo`, `tech` e `operacoes` (`frontend/src/views/monitor.js:675-680`).

## Review Focus

São as cinco entradas mais prováveis de morder o usuário. Cada uma tem teste na tarefa dona:

1. **Cargo digitado "CEO" / "Diretora Executiva" / "DPO" dando assinatura ao contato.** Task 4, teste "contato do aceite … sem autoridade de assinatura".
2. **Papel "Ainda não mapeado" gerando zero controles 27701.** Task 2, teste "papel do levantamento decide a tabela 27701".
3. **Seção "Objeto e escopo" reescrita no documento, com o projeto copiando o campo antigo, que o cliente não aceitou.** Task 3, teste "escopo vendido vai para o projeto".
4. **Organização sem `consultoria_admin`: ninguém avisado. Admin de outra organização ou inativo avisado por engano.** Task 5, teste "sem consultor: avisa".
5. **Cliente digita no aceite o e-mail do próprio consultor, gerando linha duplicada que mistura consultor e contato.** Task 4, teste "e-mail do aceite igual ao do consultor".

---

### Task 1: `semearControles` vira service batchável

**Files:**
- Modify: `src/services/project-setup.ts` (acrescentar `stmtControles` e `semearControles` ao fim)
- Modify: `src/routes/projects.ts:8` (import) e `src/routes/projects.ts:884-902` (remover a função local)
- Test: `test/seed-27001.test.ts`

**Interfaces:**
- Produces:
  - `stmtControles(db: D1Database, projectId: string, standard: string, lista: readonly { code: string; title: string }[]): D1PreparedStatement`. É um INSERT só. Age apenas se o projeto existe e pula os códigos que o projeto já tem naquela norma, em qualquer formato de id.
  - `semearControles(db: D1Database, projectId: string, standard: string, lista: readonly { code: string; title: string }[]): Promise<{ created: number; total: number }>`.

- [ ] **Step 1: Write the failing test**

Em `test/seed-27001.test.ts`, acrescente os imports no topo:

```ts
import { stmtControles } from '../src/services/project-setup';
import { ISO_27001_2022 } from '../src/data/iso27001-2022';
```

e, dentro do `describe`, depois do último `it`:

```ts
  it('stmtControles num batch: projeto inexistente não ganha controle nem estoura a FK', async () => {
    await env.DB.batch([stmtControles(env.DB, 'nao-existe', 'ISO 27001:2022', ISO_27001_2022)]);
    expect(await conta('nao-existe')).toBe(0);
  });

  it('stmtControles num batch com o projeto: os 93, e de novo não duplica', async () => {
    await projeto('p5');
    await env.DB.batch([stmtControles(env.DB, 'p5', 'ISO 27001:2022', ISO_27001_2022)]);
    await env.DB.batch([stmtControles(env.DB, 'p5', 'ISO 27001:2022', ISO_27001_2022)]);
    expect(await conta('p5')).toBe(93);
    expect(await idDoControle(env.DB, 'p5', 'A.5.1')).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/seed-27001.test.ts`
Expected: FAIL. `stmtControles` não é exportado: "stmtControles is not a function" ou erro de import.

- [ ] **Step 3: Write minimal implementation**

Ao fim de `src/services/project-setup.ts`:

```ts
type ItemDeCatalogo = { code: string; title: string };

/**
 * INSERT único dos controles de um catálogo ("A.5.1 — título") que o projeto ainda não tem, para
 * entrar num batch. Só age se o projeto existe: no batch com guarda de fecharVenda, o projeto que não
 * foi criado por esta chamada não ganha controle nem estoura a FK. Idempotente: o código vive como
 * primeiro token do título, e o que já existe naquela norma é pulado em qualquer formato de id
 * (ctrl-a51, A.5.1, gerado).
 */
export function stmtControles(db: D1Database, projectId: string, standard: string, lista: readonly ItemDeCatalogo[]): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, maturity, updated_at)
     SELECT lower(hex(randomblob(16))), ?1, ?2, j.value, '', 'Missing', 0, datetime('now') FROM json_each(?3) j
      WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?1)
        AND NOT EXISTS (SELECT 1 FROM compliance_controls c WHERE c.project_id = ?1 AND c.standard = ?2
          AND substr(c.title, 1, instr(c.title || ' ', ' ') - 1) = substr(j.value, 1, instr(j.value || ' ', ' ') - 1))`
  ).bind(projectId, standard, JSON.stringify(lista.map((c) => `${c.code} — ${c.title}`)));
}

/** Semeia, como 'Missing', os controles da lista que o projeto ainda não tem. */
export async function semearControles(
  db: D1Database, projectId: string, standard: string, lista: readonly ItemDeCatalogo[],
): Promise<{ created: number; total: number }> {
  const r = await stmtControles(db, projectId, standard, lista).run();
  return { created: r.meta.changes ?? 0, total: lista.length };
}
```

Em `src/routes/projects.ts`:
- linha 8: `import { seedPhases } from '../services/project-setup';` passa a ser `import { seedPhases, semearControles } from '../services/project-setup';`
- apague as linhas 884-902: o comentário "Cria, como 'Missing', …" e a `async function semearControles(...) { ... }` inteira. As chamadas nas linhas 920 e 948 continuam iguais.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/seed-27001.test.ts test/seed-27701.test.ts`
Expected: PASS, incluindo os casos que já existiam (`seeded` 93 / 92 / 0 e os 31/18 do 27701), que provam que `meta.changes` conta certo. Depois rode `npx tsc --noEmit`. Expected: sem erro; se `genId` ficar sem uso em `projects.ts`, ele ainda é usado nas linhas 314 e 610.

- [ ] **Step 5: Commit**

```bash
git add src/services/project-setup.ts src/routes/projects.ts test/seed-27001.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "refactor(controles): semearControles vira service batchável (stmtControles)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: o fechamento semeia os controles da norma vendida

**Files:**
- Modify: `src/services/fechar-venda.ts:11-15` (imports), `:98-113` (bloco do projeto) e o fim do arquivo (função `catalogosDoProjeto`)
- Test: `test/fechar-venda.test.ts` (helper `proposta` em `:22-38` e testes novos ao fim do `describe`)

**Interfaces:**
- Consumes: `stmtControles(db, projectId, standard, lista)` da Task 1.
- Produces: `fecharVenda` continua com a mesma assinatura. O helper de teste `proposta()` ganha as opções `assessment?: string | null`, `escopo?: string` e `secoes?: string | null`, que as Tasks 3-5 usam.

- [ ] **Step 1: Write the failing test**

Em `test/fechar-venda.test.ts`, troque o helper `proposta` (linhas 23-38) por:

```ts
async function proposta(o: { status?: string; org?: string; itens?: { servico: any; valor: number; meses?: number }[]; consultor?: string | null; total?: number; mensal?: number;
  assessment?: string | null; escopo?: string; secoes?: string | null } = {}) {
  const id = `prop-${String(++seq).padStart(3, '0')}`;
  const leadId = `lead-${seq}`;
  const itens = o.itens ?? [{ servico: PROJETO, valor: 180000 }, { servico: MSSP, valor: 60000, meses: 12 }];
  await db().batch([
    db().prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES (?, 'Cliente', ?, 'Proposal', ?)`).bind(leadId, `1122233300${String(1000 + seq)}`, o.org ?? 'org_ness'),
    db().prepare(`INSERT INTO propostas (id, org_id, lead_id, assessment_id, numero, status, cliente, consultor_email, total_projeto, mensalidade,
      documento_html, documento_hash, criada_por, escopo, secoes_editadas) VALUES (?, ?, ?, ?, ?, ?, 'Cliente Ltda.', ?, ?, ?, '<p>doc</p>', 'hash-abc', 'com@ness.lat', ?, ?)`)
      .bind(id, o.org ?? 'org_ness', leadId, o.assessment === undefined ? 'as-1' : o.assessment, `NESS-2026-${seq}`, o.status ?? 'enviada',
        o.consultor === undefined ? 'cons@ness.lat' : o.consultor, o.total ?? 180000, o.mensal ?? 5000, o.escopo ?? '', o.secoes ?? null),
    ...itens.map((i, k) => db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico_id, servico, meses, valor) VALUES (?, ?, ?, NULL, ?, ?, ?)`)
      .bind(`${id}-i${k}`, id, k, JSON.stringify(i.servico), i.meses ?? null, i.valor)),
  ]);
  return { id, leadId };
}
```

Acrescente o import `import { idDoControle } from '../src/helpers';` no topo. Junto de `conta` (linha 46), acrescente:

```ts
/** Controles do projeto por norma: { 'ISO 27001:2022': 93, ... }. */
const porNorma = async (projeto: string | null) => Object.fromEntries((await db().prepare(
  'SELECT standard, COUNT(*) n FROM compliance_controls WHERE project_id = ? GROUP BY standard').bind(projeto).all<{ standard: string; n: number }>())
  .results.map((r) => [r.standard, r.n]));
```

Ao fim do `describe`:

```ts
  // ——— P3: projeto nasce completo ———
  it('controles: 27001 quando vendido; 27701 pelo rótulo ou pelo serviço; re-aceite não duplica', async () => {
    // as-1: target_standard 'ISO 27001 + 27701', papel Controlador
    const a = await proposta();
    const ra = await fecharVenda(db(), entrada(a.id));
    if (!ra.ok) throw new Error('fechamento falhou');
    expect(await porNorma(ra.projetoId)).toEqual({ 'ISO 27001:2022': 93, 'ISO 27701:2025': 31 });
    expect(await idDoControle(db(), ra.projetoId!, 'A.8.34')).not.toBeNull();
    expect(await fecharVenda(db(), entrada(a.id))).toMatchObject({ ok: false, motivo: 'ja_fechada' });
    expect(await porNorma(ra.projetoId)).toEqual({ 'ISO 27001:2022': 93, 'ISO 27701:2025': 31 });

    // sem levantamento: o serviço decide
    const casos: [any, Record<string, number>][] = [
      [PROJETO, { 'ISO 27001:2022': 93 }],
      [{ ...PROJETO, nome: 'Implementação integrada', norma: 'ISO/IEC 27001:2022 + 27701:2025' }, { 'ISO 27001:2022': 93, 'ISO 27701:2025': 31 }],
      [{ ...PROJETO, nome: 'Adequação LGPD', norma: 'LGPD' }, {}],
    ];
    for (const [servico, esperado] of casos) {
      const { id } = await proposta({ assessment: null, itens: [{ servico, valor: 1 }] });
      const r = await fecharVenda(db(), entrada(id));
      if (!r.ok) throw new Error('fechamento falhou');
      expect(await porNorma(r.projetoId), servico.nome).toEqual(esperado);
    }
  });

  it('papel do levantamento decide a tabela 27701; "Ainda não mapeado" cai no Controlador', async () => {
    const papeis: [string, number][] = [['Controlador + Operador', 49], ['Operador', 18], ['Ainda não mapeado', 31]];
    for (const [k, [papel, n]] of papeis.entries()) {
      const as = `as-papel-${k}`;
      await db().batch([
        db().prepare(`INSERT INTO assessments (id, client_name) VALUES (?, 'Cliente')`).bind(as),
        db().prepare(`INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES (?, ?, 1, 'data_role', 'data_role', ?)`).bind(`${as}-r`, as, papel),
        db().prepare(`INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES (?, ?, 1, 'target_standard', 'target_standard', 'ISO 27001 + ISO 27701 (integrada)')`).bind(`${as}-t`, as),
      ]);
      const { id } = await proposta({ assessment: as });
      const r = await fecharVenda(db(), entrada(id));
      if (!r.ok) throw new Error('fechamento falhou');
      expect((await porNorma(r.projetoId))['ISO 27701:2025'], papel).toBe(n);
      expect((await porNorma(r.projetoId))['ISO 27001:2022'], papel).toBe(93);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fechar-venda.test.ts`
Expected: os dois testes novos FALHAM (`porNorma` devolve `{}` no lugar de `{ 'ISO 27001:2022': 93, ... }`). Os antigos passam, porque o helper só ganhou opções com o mesmo default.

- [ ] **Step 3: Write minimal implementation**

Em `src/services/fechar-venda.ts`, imports (linhas 14-15):

```ts
import { stmtsFases, stmtControles } from './project-setup';
import { diagnosticoDe } from './diagnostico';
import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../data/iso27001-2022';
import { ISO_27701_2025_STANDARD, controlsForRole } from '../data/iso27701-2025';
```

No bloco `if (projetoId)`, troque as linhas 105-113 (do comentário `// cada fase só entra…` até o `trilha.push(['project.created', …])`) por:

```ts
      // cada fase só entra se o projeto acima existe, isto é, se foi criado por esta chamada
      ...stmtsFases(db, projetoId),
    );
    // controles da norma vendida, com a mesma guarda das fases (o projeto desta chamada)
    const catalogos = catalogosDoProjeto(
      `${dados.standards} ${deProjeto.map((i) => `${i.servico.norma ?? ''} ${i.servico.nome}`).join(' ')}`, dados.orgRole);
    stmts.push(...catalogos.map((k) => stmtControles(db, projetoId, k.standard, k.lista)));
    if (p.assessment_id) {
      // levantamento já convertido pelo fluxo antigo mantém o vínculo que tinha
      stmts.push(db.prepare(`UPDATE assessments SET status = 'converted', converted_project_id = COALESCE(converted_project_id, ?),
        completed_at = COALESCE(completed_at, datetime('now')) WHERE id = ? AND ${G}`).bind(projetoId, p.assessment_id, ...g));
    }
    const resumo = catalogos.map((k) => `${k.lista.length} ${k.standard}`).join(', ');
    trilha.push(['project.created', `Projeto ${projetoId} criado com a trilha de fases${resumo ? ` e os controles (${resumo})` : ''} pelo aceite da proposta ${p.id}`, projetoId]);
```

Atenção: o `stmts.push(` aberto na linha 100 fecha logo depois de `...stmtsFases(db, projetoId),`, como hoje. Confira os parênteses.

Ao fim do arquivo:

```ts
type Catalogo = { standard: string; lista: readonly { code: string; title: string }[] };

/**
 * Catálogos que o projeto vendido ganha, pelo rótulo de normas do projeto e pela norma e nome dos
 * serviços de projeto. O 27701 estende o SGSI e traz o 27001 junto. Texto sem nenhuma das duas
 * ("Adequação LGPD") não semeia nada. Papel 27701 não mapeado cai no Controlador, como o papel vazio.
 */
function catalogosDoProjeto(texto: string, orgRole: string): Catalogo[] {
  const com27701 = /27701/.test(texto);
  const out: Catalogo[] = [];
  if (com27701 || /27001/.test(texto)) out.push({ standard: ISO_27001_2022_STANDARD, lista: ISO_27001_2022 });
  if (com27701) {
    const porPapel = controlsForRole(orgRole);
    out.push({ standard: ISO_27701_2025_STANDARD, lista: porPapel.length ? porPapel : controlsForRole('') });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/fechar-venda.test.ts test/propostas-envio.test.ts test/propostas-publicas.test.ts test/propostas.test.ts`
Expected: PASS. O teste "falha no meio do batch (trigger em project_phases): nada gravado" continua passando e prova que os controles também voltam atrás. Confira com `SELECT COUNT(*) FROM compliance_controls` se quiser, mas o projeto nem existe.

- [ ] **Step 5: Commit**

```bash
git add src/services/fechar-venda.ts test/fechar-venda.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(venda): o projeto nasce com os controles da norma vendida (27001 e 27701 por papel)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: escopo vendido e nome do projeto

**Files:**
- Modify: `src/services/fechar-venda.ts:101-104` (bind do INSERT de `projects`) e `:163-179` (`dadosDoProjeto`, mais `escopoVendido` novo)
- Test: `test/fechar-venda.test.ts` (o teste da linha 82 muda; testes novos ao fim)

**Interfaces:**
- Consumes: o helper `proposta({ escopo, secoes, itens })` da Task 2.
- Produces: `dadosDoProjeto(...)` passa a devolver também `normas: string`, com as normas dos serviços de projeto unidas por " + ".

- [ ] **Step 1: Write the failing test**

Em `test/fechar-venda.test.ts`, no primeiro `it` (linha 82), troque `project_name: 'Implementação ISO 27001'` por `project_name: 'Cliente Ltda. — ISO/IEC 27001'`. A linha 83 (`scope: 'Toda a empresa'`) fica: sem escopo na proposta, vale o do levantamento.

Ao fim do `describe`:

```ts
  it('escopo vendido vai para o projeto: a seção reescrita vence o campo; sem os dois, o do levantamento', async () => {
    const casos: [{ escopo?: string; secoes?: string | null }, string][] = [
      [{ escopo: '  Sede em São Paulo e o sistema de pagamentos  ' }, 'Sede em São Paulo e o sistema de pagamentos'],
      [{ escopo: 'campo antigo', secoes: JSON.stringify({ objeto: 'Escopo reescrito no documento aceito' }) }, 'Escopo reescrito no documento aceito'],
      [{ escopo: 'campo', secoes: JSON.stringify({ objeto: null, plano: 'x' }) }, 'campo'],
      [{ escopo: 'campo', secoes: 'nao-e-json' }, 'campo'],
      [{ secoes: JSON.stringify({ objeto: '   ' }) }, 'Toda a empresa'],
    ];
    for (const [o, esperado] of casos) {
      const { id } = await proposta(o);
      const r = await fecharVenda(db(), entrada(id));
      if (!r.ok) throw new Error('fechamento falhou');
      expect((await db().prepare('SELECT scope FROM projects WHERE id = ?').bind(r.projetoId).first<any>()).scope, JSON.stringify(o)).toBe(esperado);
    }
  });

  it('nome do projeto: cliente e normas vendidas; sem norma, o nome do serviço', async () => {
    const a = await fecharVenda(db(), entrada((await proposta({ itens: [{ servico: { ...PROJETO, norma: 'ISO/IEC 27001:2022 + 27701:2025' }, valor: 1 }] })).id));
    const b = await fecharVenda(db(), entrada((await proposta({ itens: [{ servico: { ...PROJETO, norma: '' }, valor: 1 }] })).id));
    if (!a.ok || !b.ok) throw new Error('fechamento falhou');
    const nome = async (pid: string | null) => (await db().prepare('SELECT project_name FROM projects WHERE id = ?').bind(pid).first<any>()).project_name;
    expect(await nome(a.projetoId)).toBe('Cliente Ltda. — ISO/IEC 27001:2022 + 27701:2025');
    expect(await nome(b.projetoId)).toBe('Cliente Ltda. — Implementação ISO 27001');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fechar-venda.test.ts`
Expected: FAIL no primeiro `it` (`project_name` ainda é 'Implementação ISO 27001') e nos dois novos (`scope` ainda é 'Toda a empresa').

- [ ] **Step 3: Write minimal implementation**

Em `src/services/fechar-venda.ts`, no bind do INSERT de `projects` (linha 103), troque `deProjeto[0].servico.nome` por `` `${p.cliente} — ${dados.normas || deProjeto[0].servico.nome}` ``.

Em `dadosDoProjeto`, troque o `return` (linhas 171-178) por:

```ts
  return {
    sector: respostas.sector ?? '',
    scope: escopoVendido(p) || respostas.scope_type || '',
    orgRole: respostas.data_role ?? '',
    standards: respostas.target_standard || normas || 'ISO 27001',
    normas,
    cnpj: lead?.cnpj ?? null,
    pessoas: Object.keys(respostas).length ? diagnosticoDe(respostas).pessoas : null,
  };
```

e acrescente, logo depois de `dadosDoProjeto`:

```ts
/**
 * O escopo que o cliente aceitou: a seção "Objeto e escopo" reescrita no documento, se houve
 * (documento-proposta.ts usa ela no lugar do campo), senão o campo escopo da proposta.
 */
function escopoVendido(p: { escopo?: string | null; secoes_editadas?: string | null }): string {
  let editado: unknown;
  try { editado = (JSON.parse(p.secoes_editadas || '{}') as Record<string, unknown>)?.objeto; } catch { editado = undefined; }
  return (typeof editado === 'string' && editado.trim() ? editado : p.escopo ?? '').trim();
}
```

Repare no último caso do teste: com `objeto` só de espaços e sem campo, a função devolve `''`, e o `||` cai no `scope_type`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/fechar-venda.test.ts test/propostas-envio.test.ts test/propostas-publicas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/fechar-venda.ts test/fechar-venda.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(venda): o projeto recebe o escopo aceito e o nome cliente — norma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: contato do aceite na governança, sem autoridade de assinatura

**Files:**
- Modify: `src/services/fechar-venda.ts:28` (constante nova) e `:120-130` (a linha do contato depois da do consultor)
- Test: `test/fechar-venda.test.ts`. Os testes das linhas 96, 218, 219 e 280 mudam, e há testes novos ao fim.

**Interfaces:**
- Produces: `export const CARGO_CONTATO_ACEITE = 'Contato do cliente (aceite da proposta)'` em `src/services/fechar-venda.ts`, usado pelo teste da Task 6.

- [ ] **Step 1: Write the failing test**

Em `test/fechar-venda.test.ts`, troque o import da linha 6 por `import { fecharVenda, CARGO_CONTATO_ACEITE, type EntradaFechamento } from '../src/services/fechar-venda';` e acrescente `autoridadeDeAssinatura, recusaDeAssinatura` ao import de `../src/helpers` (criado na Task 2).

Ajuste os testes que contavam a governança inteira, porque agora o contato também entra:
- linha 96: `toEqual(['contrato.criado', 'governance.created', 'project.created', 'proposta.aceita'])` passa a `toEqual(['contrato.criado', 'governance.created', 'governance.created', 'project.created', 'proposta.aceita'])`;
- linha 218: `` `SELECT email FROM project_governance WHERE project_id = ?` `` passa a `` `SELECT email FROM project_governance WHERE project_id = ? AND role_category = 'consultor'` ``;
- linha 219: `` `SELECT COUNT(*) n FROM project_governance WHERE project_id = ?` `` passa a `` `SELECT COUNT(*) n FROM project_governance WHERE project_id = ? AND role_category = 'consultor'` ``;
- linha 280: a mesma troca da linha 219.

Ao fim do `describe`:

```ts
  it('contato do aceite entra na governança como executivo, sem autoridade de assinatura (cargo digitado não conta)', async () => {
    for (const cargo of ['CEO', 'Diretora Executiva', 'CISO', 'DPO e Líder SGSI']) {
      const { id } = await proposta();
      const r = await fecharVenda(db(), entrada(id, { aceite: { nome: 'Maria\nCliente', cargo, email: 'Maria@Cliente.com', ip: '1.1.1.1' } }));
      if (!r.ok) throw new Error('fechamento falhou');
      const gov = await db().prepare(`SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ? AND role_category <> 'consultor'`)
        .bind(r.projetoId).all<any>();
      expect(gov.results, cargo).toEqual([{ name: 'Maria Cliente', email: 'Maria@Cliente.com', role_category: 'executivo', job_title: CARGO_CONTATO_ACEITE }]);
      const a = await autoridadeDeAssinatura(db(), r.projetoId!, { email: 'maria@cliente.com', role: 'org_admin' });
      expect(a.designado).toBe(true);
      expect(recusaDeAssinatura(a, 'ceo'), cargo).not.toBeNull();
      expect(recusaDeAssinatura(a, 'ciso'), cargo).not.toBeNull();
    }
  });

  it('e-mail do aceite igual ao do consultor: só a linha do consultor', async () => {
    const { id } = await proposta();
    const r = await fecharVenda(db(), entrada(id, { aceite: { nome: 'Ana', cargo: 'CEO', email: 'CONS@ness.lat', ip: '' } }));
    if (!r.ok) throw new Error('fechamento falhou');
    const gov = await db().prepare('SELECT email, role_category FROM project_governance WHERE project_id = ?').bind(r.projetoId).all<any>();
    expect(gov.results).toEqual([{ email: 'cons@ness.lat', role_category: 'consultor' }]);
  });

  it('re-aceite não duplica o contato', async () => {
    const { id } = await proposta();
    const r = await fecharVenda(db(), entrada(id));
    if (!r.ok) throw new Error('fechamento falhou');
    await fecharVenda(db(), entrada(id, { origem: 'manual', atorEmail: 'com@ness.lat' }));
    expect(await conta(`SELECT COUNT(*) n FROM project_governance WHERE project_id = ? AND role_category = 'executivo'`, r.projetoId)).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fechar-venda.test.ts`
Expected: FAIL. `CARGO_CONTATO_ACEITE` é `undefined` (o import não existe) e não há linha `executivo`.

- [ ] **Step 3: Write minimal implementation**

Em `src/services/fechar-venda.ts`, depois de `ATOR_LINK` (linha 28):

```ts
/**
 * Cargo do contato do aceite na matriz de governança. Fixo de propósito: autoridadeDeAssinatura
 * decide pelo job_title ('ceo', 'diret', 'execut', 'sgsi', 'dpo', 'ciso'), e o cargo DIGITADO pelo
 * cliente ("Diretora") daria assinatura sem ninguém decidir. Promover a Direção ou Líder SGSI é ato
 * do consultor na tela de governança. O cargo digitado fica em propostas.aceite_cargo.
 */
export const CARGO_CONTATO_ACEITE = 'Contato do cliente (aceite da proposta)';
```

No bloco `if (projetoId)`, logo depois do `if (consultorEmail) { ... }` (que fecha na linha 130), ainda dentro do `if (projetoId)`:

```ts
    // Contato de quem aceitou, depois do consultor: e-mail já presente no projeto (o do consultor) não ganha 2ª linha.
    stmts.push(db.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title)
      SELECT ?, ?, ?, 'executivo', ? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = lower(?))`)
      .bind(projetoId, linha(e.aceite.nome, 120), e.aceite.email, CARGO_CONTATO_ACEITE, projetoId, projetoId, e.aceite.email));
    trilha.push(['governance.created', `Contato do aceite ${linha(e.aceite.nome)} registrado sem autoridade de assinatura no projeto ${projetoId} pelo aceite da proposta ${p.id}`, projetoId]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/fechar-venda.test.ts test/propostas-envio.test.ts test/propostas-publicas.test.ts test/propostas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/fechar-venda.ts test/fechar-venda.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(venda): contato do aceite entra na governança sem autoridade de assinatura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: aviso à consultoria quando o projeto nasce sem consultor

**Files:**
- Modify: `src/services/fechar-venda.ts:120-130` (consulta dos administradores) e `:137-144` (notificações)
- Test: `test/fechar-venda.test.ts` (teste novo ao fim)

**Interfaces:**
- Consumes: o helper `proposta({ consultor: null, org })` da Task 2.
- Produces: notificações com `type = 'projeto_sem_consultor'`, `action_type = 'projeto_sem_consultor'`, `target_id = <proposta>` e `link = /projects/<id>`.

- [ ] **Step 1: Write the failing test**

Acrescente `requireProjectAccess` ao import de `../src/helpers`. Ao fim do `describe`:

```ts
  it('sem consultor: avisa os consultoria_admin ativos da organização; sem nenhum, o platform_admin; o admin alcança o projeto', async () => {
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cadm','cadm@ness.lat','x','Adm','consultoria_admin','org_ness')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-cadm-off','off-adm@ness.lat','x','Adm off','consultoria_admin','org_ness',0)`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-badm','badm@b.lat','x','Adm B','consultoria_admin','org_b')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-plat','plat@ness.lat','x','Plataforma','platform_admin')`),
    ]);
    const avisados = async (propostaId: string) => (await db().prepare(
      `SELECT user_id, link FROM notifications WHERE target_id = ? AND type = 'projeto_sem_consultor' ORDER BY user_id`).bind(propostaId).all<any>()).results;

    const a = await proposta({ consultor: null });
    const ra = await fecharVenda(db(), entrada(a.id));
    if (!ra.ok) throw new Error('fechamento falhou');
    expect(await avisados(a.id)).toEqual([{ user_id: 'u-cadm', link: `/projects/${ra.projetoId}` }]);
    await expect(requireProjectAccess(db(), { role: 'consultoria_admin', org_id: 'org_ness', email: 'cadm@ness.lat' }, ra.projetoId!)).resolves.toBe(true);
    await expect(requireProjectAccess(db(), { role: 'consultoria_admin', org_id: 'org_b', email: 'badm@b.lat' }, ra.projetoId!)).rejects.toThrow();

    // organização sem consultoria_admin: o platform_admin
    const c = await proposta({ consultor: null, org: 'org_c' });
    const rc = await fecharVenda(db(), entrada(c.id, { orgId: 'org_c' }));
    if (!rc.ok) throw new Error('fechamento falhou');
    expect((await avisados(c.id)).map((n: any) => n.user_id)).toEqual(['u-plat']);

    // com consultor: ninguém recebe o aviso; re-aceite não repete
    const b = await proposta();
    expect((await fecharVenda(db(), entrada(b.id))).ok).toBe(true);
    expect(await avisados(b.id)).toEqual([]);
    await fecharVenda(db(), entrada(a.id));
    expect(await avisados(a.id)).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fechar-venda.test.ts`
Expected: FAIL. `avisados(a.id)` devolve `[]`.

- [ ] **Step 3: Write minimal implementation**

Em `src/services/fechar-venda.ts`, declare antes do `if (projetoId)` (junto do `let consultorEmail`, linha 97):

```ts
  let semConsultorAvisar: { id: string }[] = [];
```

Dentro do `if (projetoId)`, logo depois de `if (!consultorEmail && e.origem === 'manual') consultorEmail = ...` (linha 121):

```ts
    // Sem consultor, o projeto só aparece para a administração: avisa os consultoria_admin ativos da
    // organização; sem nenhum, a plataforma (ponytail: sem trilha própria, a notificação basta).
    if (!consultorEmail) {
      semConsultorAvisar = (await db.prepare(`SELECT id FROM users WHERE COALESCE(ativo, 1) <> 0 AND (
          (role = 'consultoria_admin' AND org_id = ?1)
          OR (role IN ('platform_admin', 'admin') AND NOT EXISTS (
            SELECT 1 FROM users WHERE role = 'consultoria_admin' AND org_id = ?1 AND COALESCE(ativo, 1) <> 0)))`)
        .bind(e.orgId).all<{ id: string }>()).results;
    }
```

Depois do laço de notificações (linha 144):

```ts
  for (const u of semConsultorAvisar) {
    stmts.push(db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, action_type, target_id, created_at)
      SELECT ?, ?, 'projeto_sem_consultor', ?, ?, 0, ?, 'projeto_sem_consultor', ?, datetime('now') WHERE ${G}`)
      .bind(genId(), u.id, `Projeto sem consultor: ${p.cliente}`,
        `O projeto da proposta ${p.numero} nasceu sem consultor. Designe um na Governança do projeto.`, link, p.id, ...g));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/fechar-venda.test.ts test/propostas-publicas.test.ts test/propostas-envio.test.ts`
Expected: PASS. Em `propostas-publicas` não há `consultoria_admin` nem `platform_admin` cadastrados, então as contagens de notificação de lá não mudam.

- [ ] **Step 5: Commit**

```bash
git add src/services/fechar-venda.ts test/fechar-venda.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(venda): avisa a administração da consultoria quando o projeto nasce sem consultor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: teste de integração do critério de pronto parcial, changelog e suíte

**Files:**
- Create: `test/projeto-nasce-completo.test.ts`
- Modify: `CHANGELOG.md` (seção `## [Não publicado]`, subseção `### Corrigido`)

**Interfaces:**
- Consumes: `CARGO_CONTATO_ACEITE` (Task 4), a rota pública `POST /api/v1/public/propostas/aceitar` (`src/routes/public-propostas.ts:99-119`), `autoridadeDeAssinatura`, `recusaDeAssinatura` e `requireProjectAccess` (`src/helpers.ts`).

- [ ] **Step 1: Write the test**

`test/projeto-nasce-completo.test.ts`:

```ts
// P3 (fatia de jornada): critério de pronto parcial. O aceite pelo link cria um projeto que já tem
// os controles, o escopo vendido e o contato na governança (sem assinatura), e avisa a consultoria
// quando não há consultor. D1 real, pela rota pública.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { sha256Hex, genToken, autoridadeDeAssinatura, recusaDeAssinatura, requireProjectAccess } from '../src/helpers';
import { CARGO_CONTATO_ACEITE } from '../src/services/fechar-venda';

const db = () => env.DB as D1Database;
let ip = 0;
const aceitar = (corpo: unknown) => app.fetch(new Request('http://localhost/api/v1/public/propostas/aceitar', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.77.0.${++ip}` }, body: JSON.stringify(corpo),
}), workerEnv() as any);
const conta = async (sql: string, ...b: unknown[]) => (await db().prepare(sql).bind(...b).first<{ n: number }>())!.n;

const SERVICO = { nome: 'Implementação ISO 27001 + 27701', norma: 'ISO/IEC 27001:2022 + 27701:2025', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [],
  formaPreco: 'fixo', valorFixo: 90000, entregaveis: ['x'], criterioAceite: 'ok', fases: [{ nome: 'Diagnóstico', percentual: 100 }] };

describe('projeto nasce completo do aceite da proposta', () => {
  beforeAll(async () => {
    await applySchema();
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-com','com@ness.lat','x','Com','comercial')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cadm','cadm@ness.lat','x','Adm','consultoria_admin','org_ness')`),
    ]);
  }, 60_000);

  it('aceite pelo link: controles, escopo, contato sem assinatura, aviso sem consultor; re-aceite idempotente', async () => {
    const token = genToken();
    await db().batch([
      db().prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-1', 'Cliente', 'Proposal', 'org_ness')`),
      db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, consultor_email, total_projeto, escopo, documento_html, documento_hash,
        valida_ate, criada_por, token_hash) VALUES ('pp-1', 'org_ness', 'l-1', 'NESS-2026-77', 'enviada', 'Cliente Ltda.', NULL, 90000,
        'Sede em São Paulo e a plataforma de pagamentos', '<p>doc</p>', 'hash-doc', '2099-12-31', 'com@ness.lat', ?)`).bind(await sha256Hex(token)),
      db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico, valor) VALUES ('pp-1-i', 'pp-1', 0, ?, 90000)`).bind(JSON.stringify(SERVICO)),
    ]);
    const corpo = { token, nome: 'Maria Cliente', cargo: 'Diretora Executiva', email: 'maria@cliente.com', poderes: true };

    expect((await aceitar(corpo)).status).toBe(200);
    const projetoId = (await db().prepare(`SELECT projeto_id FROM propostas WHERE id = 'pp-1'`).first<any>()).projeto_id as string;
    expect(projetoId).toBeTruthy();

    // 1. controles
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'`, projetoId)).toBe(93);
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'`, projetoId)).toBe(31);
    // escopo e nome
    expect(await db().prepare('SELECT scope, project_name FROM projects WHERE id = ?').bind(projetoId).first<any>())
      .toEqual({ scope: 'Sede em São Paulo e a plataforma de pagamentos', project_name: 'Cliente Ltda. — ISO/IEC 27001:2022 + 27701:2025' });
    // contato na governança, sem assinatura
    expect((await db().prepare('SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projetoId).all<any>()).results)
      .toEqual([{ name: 'Maria Cliente', email: 'maria@cliente.com', role_category: 'executivo', job_title: CARGO_CONTATO_ACEITE }]);
    const a = await autoridadeDeAssinatura(db(), projetoId, { email: 'maria@cliente.com', role: 'org_admin' });
    expect(recusaDeAssinatura(a, 'ceo')).not.toBeNull();
    // sem consultor: a administração é avisada e alcança o projeto
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE user_id = 'u-cadm' AND type = 'projeto_sem_consultor' AND target_id = 'pp-1'`)).toBe(1);
    await expect(requireProjectAccess(db(), { role: 'consultoria_admin', org_id: 'org_ness', email: 'cadm@ness.lat' }, projetoId)).resolves.toBe(true);

    // re-aceite: 409, nada novo
    expect((await aceitar(corpo)).status).toBe(409);
    expect(await conta(`SELECT COUNT(*) n FROM projects WHERE proposta_id = 'pp-1'`)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ?`, projetoId)).toBe(124);
    expect(await conta(`SELECT COUNT(*) n FROM project_governance WHERE project_id = ?`, projetoId)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE type = 'projeto_sem_consultor' AND target_id = 'pp-1'`)).toBe(1);
  }, 60_000);
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/projeto-nasce-completo.test.ts`
Expected: PASS, porque as Tasks 1-5 já entregaram o comportamento. Se falhar no `status` 200, imprima `await (await aceitar(corpo)).text()` para conferir o corpo contra `propostaAceiteLinkSchema` (`src/schemas/domain.ts:640-647`). Não afrouxe a asserção.

- [ ] **Step 3: Changelog**

Em `CHANGELOG.md`, no fim da lista de `## [Não publicado]` → `### Corrigido`, acrescente:

```markdown
- Projeto criado pelo aceite da proposta já nasce com os controles da norma vendida (93 da ISO 27001:2022 e os da ISO 27701:2025 pelo papel, quando vendida), com o escopo aceito no lugar do tipo de escopo do levantamento e com o nome "cliente — norma". O contato de quem aceitou entra na governança sem autoridade de assinatura (a promoção é do consultor). Sem consultor, a administração da consultoria é avisada.
```

Confira a codificação: `python -c "b=open('CHANGELOG.md','rb').read(); assert not b.startswith(b'\xef\xbb\xbf'); b.decode('utf-8'); print('ok')"`. Faça o mesmo para `test/projeto-nasce-completo.test.ts`, `src/services/fechar-venda.ts` e `src/services/project-setup.ts`.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit`
Expected: sem saída.

Run: `npx vitest run test/any-catraca.test.ts`
Expected: PASS. O número de `any` não subiu: o código novo não usa `any`.

Run: `npx vitest run` (suíte completa, ~20 min)
Expected: todos os arquivos passando e exit 0. Cole o resumo final (`Test Files … passed`). Confira o exit code: "N/N passed" com exit 1 é unhandled rejection.

- [ ] **Step 5: Commit**

```bash
git add test/projeto-nasce-completo.test.ts CHANGELOG.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "test(venda): critério de pronto parcial do projeto que nasce do aceite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
