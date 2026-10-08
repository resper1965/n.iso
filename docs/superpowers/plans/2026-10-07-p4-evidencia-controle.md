# P4 — Evidência ligada ao controle: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** evidência de documento entra pendente de revisão e ligada ao controle quando o item tem controle; o checklist tem uma lista só; o upload pelo checklist marca o item; a assinatura do Líder SGSI é a revisão que leva a evidência a conforme.

**Architecture:** um serviço pequeno (`src/services/checklist-evidencia.ts`) passa a ser a única ponte item de checklist → fase → controle → `checklist_progress`, lendo a lista que a tela já mostra (`PHASE_CHECKLISTS` de `src/constants.ts`); `src/checklists.ts` é apagado. Os três caminhos de documento (upload, assistente, geração por IA) passam por ele e gravam `evaluation_status = 'pending'` com `control_id`. A revisão é a assinatura existente do Líder SGSI (`handleApprove`), que passa a mover `pending` para `conforming`; editar o conteúdo devolve a `pending` e apaga as assinaturas.

**Tech Stack:** Cloudflare Workers (Hono) + D1 + R2; frontend Vanilla JS (Vite); testes Vitest (pool de Workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (seções 1, 3, 4 e 5; este plano é o P4 da tabela da seção 2).

## Decisões para o dono revisar

Uma linha cada, com o custo se a decisão estiver errada.

1. **A revisão humana é a assinatura do Líder SGSI** (`role: 'ciso'` em `/evidence/:id/approve`): ela leva `pending` → `conforming`. A assinatura da Direção não muda o status. Custo se errado: a Direção não consegue concluir a revisão sozinha; basta incluir `ceo` no `CASE` da Task 3.
2. **A assinatura não passa por cima de `partial`/`non_conforming`**: evidência reprovada precisa ser corrigida (o que a devolve a `pending`) e então assinada. Custo se errado: o Líder SGSI não consegue discordar da IA sem editar o documento.
3. **Editar o conteúdo (`PUT /evidence/:id/content`) devolve a evidência a `pending` e apaga as duas assinaturas** — a rota é liberada a `org_user`, e sem isso o cliente reescrevia documento já revisado e ele continuava conforme. Custo se errado: corrigir um erro de digitação exige assinar de novo.
4. **Análise de lacunas e rastreabilidade continuam contando toda evidência ligada, revisada ou não**; a rastreabilidade passa a expor `evaluation_status` de cada evidência para quem lê distinguir. Custo se errado: `controls_with_evidence` conta evidência ainda não revisada.
5. **O controle do item sai da referência `(A.x.y)` no texto do item da tela** (o mesmo padrão que `frontend/src/globals.js:1529` já usa). Item sem essa referência (cláusulas `Cl x.y`, treinamento `p29_*`, etc.) fica sem controle e a Central de Evidências permite escolher. Custo se errado: itens que o dono considera ligados a controle ficam sem vínculo até alguém escolher na tela.
6. **O documento gerado usa o texto do item da tela** (a lista única). Os formulários do assistente (`frontend/src/data/wizards.js`, `DOC_WIZARDS`) foram escritos para a lista antiga e continuam como estão. Custo se errado: em alguns itens o título do formulário não bate com o texto do item; o documento passa a bater com o que o usuário vê, o que hoje não acontece.
7. **Upload pelo checklist marca o item mesmo com a evidência pendente** (é o que a spec pede) e **não sobrescreve a anotação do item** (`notes`). Custo se errado: item marcado antes da revisão; desfazer é desmarcar.
8. **Treinamento sugere A.6.3 de forma leniente** (`control_ref`): projeto sem esse controle recebe o upload sem vínculo, em vez de recusar. Custo se errado: certificado de treinamento sem controle num projeto sem A.6.3 (raro: o catálogo 27001 tem A.6.3).
9. **Nada é apagado nem reclassificado em produção.** As evidências falsas de "Mitigar risco" (`r2_key = 'pending_upload'`) e as evidências antigas gravadas `conforming` pelos três caminhos ficam como estão; limpar é escrita em produção e exige "sim" do dono. Consulta para o dono avaliar: `SELECT COUNT(*) FROM evidence WHERE r2_key = 'pending_upload';`. Custo se errado: o painel continua contando essas linhas em "evidências pendentes".
10. **O veredito da avaliação por IA passa a ser lido da linha `Veredito:`** — hoje `includes('CONFORME')` casa também "NÃO CONFORME" e grava `conforming` para evidência reprovada. Custo se errado: nenhum conhecido; é correção de leitura.

## Achados da spec conferidos no código

- **Confirmado:** os três caminhos gravam `conforming` sem `control_id`: `src/routes/projects.ts:651-654` (upload, liberado a `org_user` em `src/middleware/auth.ts:338`), `src/routes/policies.ts:201-203` (assistente) e `src/routes/policies.ts:260-273` (geração por IA, que também marca o item em `:277-287`).
- **Não se confirmou como relatado: "a revisão humana existente leva a conforme".** A assinatura (`src/routes/evidence.ts:274-284`) só grava `ciso_/ceo_approved_*` e não toca `evaluation_status`. O único outro escritor de `conforming` é a avaliação por IA (`src/routes/evidence.ts:196-199`), que além disso lê o veredito errado (achado 10). Este plano cria a ligação (Task 3).
- **Não existe mapeamento item → controle** em `src/checklists.ts` nem em `TEMPLATE_DEPENDENCIES` (`src/services/policy-generator.ts:12-20`, que mapeia template → controle). A referência vive no texto do item da tela: 33 dos 132 itens trazem `(A.x.y)` ou `(Cl x.y)`.
- **As duas listas divergem mais do que o relatado:** além dos 6 ids que só a tela tem (`p15_5`, `p15_6`, `p15_7`, `p15_8`, `p18_6`, `p34_0` → 404 em `policies.ts:93-99`), dos 126 ids comuns só 10 têm o mesmo texto. Gerar o documento de `p0_5` ("Definir Canais de Comunicação Interna" na tela) produzia "Carta de mandato assinada". As fases dos ids comuns coincidem, então a marcação caía na linha certa. (Medido com um script que extrai `id`/`text` dos dois arquivos; reproduzível com `node` lendo `src/constants.ts` e `src/checklists.ts`.)
- **Confirmado, e pior:** o upload pelo checklist (`frontend/src/views/project.js:1312-1334`) manda o item como `document_type`, que o servidor ignora. Além disso `API_BASE` não é importado em `project.js`, `grc.js` e `compliance.js` (`grep -n API_BASE frontend/src/views/{project,grc,compliance}.js` mostra uso sem import; só `api.js` o exporta), então o `fetch` lança `ReferenceError` antes de sair. O mesmo vale para `monitor.js` e `commercial.js`, fora do P4.
- **Confirmado:** o treinamento (`frontend/src/views/grc.js:930-958`) cria evidência sem `control_id`, e ainda lê `data.file_name`, que a resposta do upload não traz (`src/routes/evidence.ts:356`), gravando `"<id>|undefined"`.
- **Confirmado:** "Mitigar" cria evidência falsa (`src/routes/risks.ts:67-80` e `:138-152`). Nada lê `[TASK]`, `pending_upload` nem `file_hash = 'none'` (`grep -rn "\[TASK\]\|pending_upload" src frontend/src test mcp-server-niso/src`), então a remoção não quebra consumidor.
- **Achado novo, no mesmo fluxo:** o modal "Upload de Evidência" pede "Controle ISO (opcional) Ex: A.5.1" (`frontend/src/views/compliance.js:1547-1548`), mas o servidor só aceita o id da linha (`src/routes/evidence.ts:322-325`): digitar `A.5.1` dá 400.
- **Achado novo:** o selo do checklist compara com a grafia antiga (`'conforme'`, `'parcial'`, `'nao conforme'`, `frontend/src/views/project.js:349-358`) que o banco não usa desde a normalização (`src/constants.ts:1-8`): todo item aparece "Pendente [AI]" com borda vermelha. A Central de Evidências lê `e.ai_status`, coluna que não existe (`compliance.js:1482` e `:1508`).
- **Nada quebra com `pending`:** nenhuma tela, relatório ou prontidão filtra por `conforming` (`grep -rn "evaluation_status" src --include=*.ts`); o painel (`src/routes/platform.ts:345`) passa a contar essas evidências como pendentes, que é o desejado.

## Global Constraints

- Testes de backend: `npx vitest run <arq>` na raiz (pool de Workers, D1 real via `cloudflare:test`; helpers em `test/helpers/d1.ts`: `applySchema`, `resetData`, `resetSessions`, `sessionFor`, `workerEnv`). `sessionFor({ id, email, role: 'admin', iat: Date.now() })` dá platform_admin.
- INSERT em `projects` nos testes precisa de `standards` e `org_role` (ex.: `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001:2022','Controller','Active')`).
- `checklist_progress.checked_by` tem FK para `users(id)`: teste que marca item insere o usuário em `users`.
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads` (jsdom; mock de api no padrão de `frontend/test/soa-sem-gerar.test.js`; o pool padrão estoura timeout nesta máquina).
- `test/any-catraca.test.ts`: código novo sem `any`; em `catch` use `catch (e) { return erro500(c, '...', e); }`. A catraca reprova se o número subir **e também se descer sem baixar o `TETO`**: rode-a ao fim de cada tarefa de backend e, se o total descer, baixe o `TETO` para o número novo no mesmo commit.
- Nenhuma rota nova, nenhum DELETE novo, nenhum corpo JSON novo: `src/trilha-exclusao.ts`, `src/openapi.ts` e o allow-list de `src/middleware/auth.ts` não mudam. Os campos novos (`item_id`, `control_ref`) são de formulário multipart.
- Sem mudança de schema e sem migration (a próxima continua sendo a 0045).
- **P1 roda antes** e muda `frontend/src/api.js`: `api()` deixa de descartar campos quando a resposta tem mais de uma chave. Código de frontend deste plano lê resposta de lista dos dois jeitos: `Array.isArray(r) ? r : (r?.<campo> || [])`.
- P2 mexe em `frontend/src/views/compliance.js` (modal da política) e P3 em `src/routes/projects.ts` (fechar venda): ao rebasear, conflito nesses arquivos é esperado e não é deste plano resolver por eles.
- Frontend: CSP `script-src 'self'`, sem handler nem script inline, eventos por `data-action`/`data-action-change`, `escapeHTML` em todo dado interpolado. Sem ícone, sem emoji.
- Arquivos em UTF-8 sem BOM (conferir com Python: `python -c "print(open('<arq>','rb').read(3))"` não pode começar com `b'\xef\xbb\xbf'`).
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A suíte de backend completa leva ~20 min: cada tarefa roda os testes focados; a suíte completa só na Task 6.

## Review Focus

As cinco entradas que mais provavelmente mordem o usuário e que o teste do caminho feliz não pega. Cada uma tem teste na tarefa dona.

1. **Anotação do item apagada pelo upload/geração** — o UPSERT antigo gravava `notes = 'Gerado automaticamente…'` por cima do que o consultor escreveu no item. Teste: Task 2, "não apaga a anotação do item".
2. **Gerar o mesmo item duas vezes corrompe a evidência anterior** — a chave do R2 era por item, então a segunda geração sobrescrevia o arquivo da primeira e o hash gravado deixava de bater. Teste: Task 2, "gerar de novo não sobrescreve o arquivo da evidência anterior".
3. **Cliente edita documento já revisado e ele continua conforme e assinado.** Teste: Task 3, "editar o conteúdo devolve a pendente e apaga as assinaturas".
4. **Veredito "NÃO CONFORME" da IA gravado como `conforming`.** Teste: Task 3, "avaliação por IA lê o veredito".
5. **Código do controle digitado no modal de upload ("A.5.1") recusado com 400.** Teste: Task 4, "aceita o código do controle".

---

### Task 1: Uma lista de checklist só, com o controle de cada item

**Files:**
- Create: `src/services/checklist-evidencia.ts`
- Modify: `src/routes/policies.ts:3` (import), `:91-99` (apagar `findChecklistItem`), `:117-119`, `:182-184`, `:233-236` (usos)
- Delete: `src/checklists.ts`
- Modify: `AGENTS.md` (contagem de services: 18 → 19)
- Test: `test/checklist-fonte-unica.test.ts`

**Interfaces:**
- Consumes: `PHASE_CHECKLISTS` (`src/constants.ts:192`), `idDoControle(db, projectId, ref): Promise<string | null>` (`src/helpers.ts:343`), `ISO_27001_2022` (`src/data/iso27001-2022.ts:6`).
- Produces (usados nas Tasks 2 e 3):
  - `type ItemDoChecklist = { id: string; text: string; category: string; phaseNumber: number }`
  - `itemDoChecklist(itemId: string): ItemDoChecklist | null`
  - `refDoControle(texto: string): string | null` — devolve `'A.5.1'` de `'... (A.5.1)'`, `null` para `(Cl 4.3)` ou sem referência.
  - `controleDoItem(db: D1Database, projectId: string, item: ItemDoChecklist): Promise<string | null>` — id da linha em `compliance_controls` do projeto, ou `null`.
  - `marcarItemComEvidencia(db: D1Database, projectId: string, item: ItemDoChecklist, evidenceId: string, user: { id?: string } | null | undefined): Promise<void>` (escrito aqui, usado a partir da Task 2).

- [ ] **Step 1: Write the failing test**

`test/checklist-fonte-unica.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { PHASE_CHECKLISTS } from '../src/constants';
import { ISO_27001_2022 } from '../src/data/iso27001-2022';
import { itemDoChecklist, refDoControle, controleDoItem } from '../src/services/checklist-evidencia';

/**
 * A tela mostra PHASE_CHECKLISTS (src/constants.ts); a geração de documento lia outra lista
 * (src/checklists.ts). Seis itens da tela davam 404 e, dos ids comuns, só 10 tinham o mesmo texto:
 * gerar "Definir Canais de Comunicação Interna" (p0_5) produzia "Carta de mandato assinada".
 */
const P = 'p-lista';
let admin: Record<string, string>;
const todos = Object.entries(PHASE_CHECKLISTS).flatMap(([fase, itens]) => itens.map((i) => ({ ...i, fase: Number(fase) })));

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-a510', ?, 'ISO 27001:2022', 'A.5.10 — Uso aceitável')`).bind(P),
  ]);
  admin = { ...(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
});

describe('lista única de checklist', () => {
  it('todo item da tela é achado, na fase em que a tela o mostra', () => {
    for (const i of todos) {
      const achado = itemDoChecklist(i.id);
      expect(achado, i.id).not.toBeNull();
      expect(achado!.phaseNumber, i.id).toBe(i.fase);
      expect(achado!.text, i.id).toBe(i.text);
    }
    expect(itemDoChecklist('nao-existe')).toBeNull();
  });

  it('toda referência de controle no texto existe no catálogo 27001:2022', () => {
    const codigos = new Set(ISO_27001_2022.map((c) => c.code));
    const refs = todos.map((i) => refDoControle(i.text)).filter((r): r is string => !!r);
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) expect(codigos.has(r), r).toBe(true);
  });

  it('referência a cláusula não vira controle', () => {
    expect(refDoControle('Documentar Escopo do SGSI e SGPI (Cl 4.3)')).toBeNull();
    expect(refDoControle('Redigir Política Geral de SI (A.5.1)')).toBe('A.5.1');
    expect(refDoControle('Executar Treinamento Geral de SI e LGPD')).toBeNull();
  });

  it('controleDoItem resolve no projeto e devolve null quando o projeto não tem o controle', async () => {
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p15_5')!)).toBe('ctl-a510');
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p15_1')!)).toBeNull();
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p3_1')!)).toBeNull();
  });

  it('a geração aceita TODO item que a tela mostra', async () => {
    for (const i of todos) {
      const res = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/generate-document`, {
        method: 'POST', headers: admin, body: JSON.stringify({ itemId: i.id, fields: {} }),
      }), workerEnv());
      expect(res.status, `${i.id}: ${await res.clone().text()}`).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/checklist-fonte-unica.test.ts`
Expected: FAIL na importação de `../src/services/checklist-evidencia` (módulo inexistente).

- [ ] **Step 3: Write minimal implementation**

`src/services/checklist-evidencia.ts`:

```ts
import { PHASE_CHECKLISTS } from '../constants';
import { idDoControle } from '../helpers';

/** Item do checklist que a tela mostra (PHASE_CHECKLISTS), com a fase em que aparece. */
export type ItemDoChecklist = { id: string; text: string; category: string; phaseNumber: number };

export function itemDoChecklist(itemId: string): ItemDoChecklist | null {
  for (const [fase, itens] of Object.entries(PHASE_CHECKLISTS)) {
    const item = itens.find((i) => i.id === itemId);
    if (item) return { ...item, phaseNumber: Number(fase) };
  }
  return null;
}

// ponytail: a referência do controle vive no próprio texto do item ("... (A.5.1)"), o mesmo
// padrão que a lista de pendências já lê (frontend/src/globals.js). Cláusula ("Cl 4.3") não é
// controle do Anexo A. Se um dia o item precisar de mais de um controle, vira campo na lista.
export function refDoControle(texto: string): string | null {
  return /\((A\.\d+\.\d+)\)/.exec(texto)?.[1] ?? null;
}

/** Id da linha do controle do item NESTE projeto, ou null (item sem controle ou projeto sem ele). */
export async function controleDoItem(db: D1Database, projectId: string, item: ItemDoChecklist): Promise<string | null> {
  const ref = refDoControle(item.text);
  return ref ? idDoControle(db, projectId, ref) : null;
}

/**
 * Marca o item com a evidência. Não toca `notes`: é a anotação que o consultor escreveu no item
 * (antes a geração gravava um texto fixo por cima dela).
 */
export async function marcarItemComEvidencia(
  db: D1Database, projectId: string, item: ItemDoChecklist, evidenceId: string, user: { id?: string } | null | undefined,
): Promise<void> {
  // `checked_by` referencia users(id): chave de API não tem linha lá (id `apikey:…`).
  const quem = user?.id && !user.id.startsWith('apikey:') ? user.id : null;
  await db.prepare(
    `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
       is_checked = 1, checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP, evidence_id = excluded.evidence_id`
  ).bind(projectId, item.phaseNumber, item.id, quem, evidenceId).run();
}
```

Em `src/routes/policies.ts`:
- Troque a linha 3 (`import { PHASE_POLICY_DOCS, ChecklistItem } from '../checklists';`) por:
  ```ts
  import { itemDoChecklist } from '../services/checklist-evidencia';
  ```
- Apague o bloco das linhas 91-99 (`// Helper para encontrar item de checklist` e a função `findChecklistItem`).
- Em `generate-document` (linhas 117-119), troque
  ```ts
      const found = findChecklistItem(itemId);
      if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);
      const { item } = found;
  ```
  por
  ```ts
      const item = itemDoChecklist(itemId);
      if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);
  ```
- Em `approve-document` (linhas 182-184), troque
  ```ts
      const found = findChecklistItem(itemId);
      if (!found) return c.json({ error: 'Item não encontrado' }, 404);
      const { item, phaseNumber } = found;
  ```
  por
  ```ts
      const item = itemDoChecklist(itemId);
      if (!item) return c.json({ error: 'Item não encontrado' }, 404);
      const phaseNumber = item.phaseNumber;
  ```
- Em `checklist/:itemId/generate` (linhas 233-236), troque
  ```ts
      const found = findChecklistItem(itemId);
      if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);

      const { item, phaseNumber } = found;
  ```
  por
  ```ts
      const item = itemDoChecklist(itemId);
      if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);
      const phaseNumber = item.phaseNumber;
  ```
  (`phaseNumber` continua sendo usado pelos UPSERTs até a Task 2 trocá-los.)

Apague `src/checklists.ts` (`git rm src/checklists.ts`). Atualize o comentário de `src/constants.ts:187-191` para não citar mais o arquivo apagado:

```ts
// ═══════════════════════════════════════════════════════════════
// PHASE_CHECKLISTS — o checklist por fase, ÚNICA lista: servida à UI (/api/v1/phases/config,
// platform.ts) e usada pela geração de documento (services/checklist-evidencia.ts). O controle
// de um item é a referência "(A.x.y)" no texto dele.
// ═══════════════════════════════════════════════════════════════
```

Em `AGENTS.md`, na linha de **Services**, troque `18 arquivos` por `19 arquivos` (o comando ao lado, `ls src/services/*.ts | wc -l`, continua o mesmo; confira que ele dá 19).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/checklist-fonte-unica.test.ts test/document-flow.test.ts test/policies.test.ts test/any-catraca.test.ts`
Expected: PASS. `npx tsc --noEmit` limpo (nenhum outro import de `../checklists`: `git grep -n "checklists'" -- src test` vazio).

- [ ] **Step 5: Commit**

```bash
git add src/services/checklist-evidencia.ts src/routes/policies.ts src/constants.ts AGENTS.md test/checklist-fonte-unica.test.ts
git rm src/checklists.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(checklist): uma lista só para a tela e a geração de documento

A geração lia src/checklists.ts, com seis itens a menos e textos
diferentes dos que a tela mostra: p15_5..p15_8, p18_6 e p34_0 davam 404
e p0_5 gerava a carta de mandato. Agora tudo lê PHASE_CHECKLISTS, e o
controle do item sai da referência (A.x.y) no texto.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Evidência de documento entra pendente e ligada ao controle

**Files:**
- Modify: `src/routes/policies.ts` (handlers `approve-document`, linhas ~166-217, e `checklist/:itemId/generate`, linhas ~220-296, já com os nomes da Task 1)
- Modify: `src/routes/projects.ts:626-661` (`POST /:id/documents/upload`) e o import da linha 5
- Modify: `test/document-flow.test.ts:63` (a chave do R2 passa a ter o id da evidência)
- Test: `test/evidencia-documento-controle.test.ts`

**Interfaces:**
- Consumes: `itemDoChecklist`, `controleDoItem`, `marcarItemComEvidencia`, `ItemDoChecklist` (Task 1).
- Produces: `POST /api/v1/projects/:id/documents/upload` aceita o campo multipart opcional `item_id` (id de `PHASE_CHECKLISTS`); item desconhecido → 400 `{ error: 'Item de checklist não encontrado' }` sem gravar no R2. Os três caminhos gravam `evaluation_status = 'pending'` e `control_id` (ou `NULL`). Chave do R2 dos documentos gerados: `projects/<projeto>/evidence/<itemId>-<evidenceId>.md`.

- [ ] **Step 1: Write the failing test**

`test/evidencia-documento-controle.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Os três caminhos de documento (upload, assistente, geração por IA) gravavam a evidência como
 * `conforming`, sem revisão e sem controle. Agora entram `pending`, ligadas ao controle do item
 * quando ele tem um, e o upload pelo checklist marca o item.
 */
const P = 'p-doc';
let consultor: Record<string, string>;
let cliente: Record<string, string>;

const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });
const chamar = (caminho: string, init: RequestInit) =>
  worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());
const evidencia = (id: string) => env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<Record<string, unknown>>();
const progresso = (item: string) =>
  env.DB.prepare('SELECT * FROM checklist_progress WHERE project_id = ? AND item_id = ?').bind(P, item).first<Record<string, unknown>>();

function enviar(h: Record<string, string>, itemId?: string) {
  const form = new FormData();
  form.append('file', new File(['conteudo'], 'politica.pdf', { type: 'application/pdf' }));
  if (itemId) form.append('item_id', itemId);
  return chamar(`/api/v1/projects/${P}/documents/upload`, { method: 'POST', headers: h, body: form });
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-a51', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', name: 'Cons', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

describe('geração por IA a partir do checklist', () => {
  it('grava pendente, ligada ao controle do item, e marca o item', async () => {
    const res = await chamar(`/api/v1/projects/${P}/checklist/p15_1/generate`, { method: 'POST', headers: json(consultor) });
    const body = await res.json<{ evidence_id: string }>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    const ev = await evidencia(body.evidence_id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');
    const prog = await progresso('p15_1');
    expect(prog!.is_checked).toBe(1);
    expect(prog!.evidence_id).toBe(body.evidence_id);
  });

  it('item sem controle no texto grava sem controle', async () => {
    const res = await chamar(`/api/v1/projects/${P}/checklist/p3_1/generate`, { method: 'POST', headers: json(consultor) });
    const { evidence_id } = await res.json<{ evidence_id: string }>();
    expect((await evidencia(evidence_id))!.control_id).toBeNull();
  });

  // Review Focus 2
  it('gerar de novo não sobrescreve o arquivo da evidência anterior', async () => {
    const gerar = async () => (await (await chamar(`/api/v1/projects/${P}/checklist/p3_2/generate`, { method: 'POST', headers: json(consultor) })).json<{ evidence_id: string }>()).evidence_id;
    const primeira = await gerar();
    const segunda = await gerar();
    const a = await evidencia(primeira);
    const b = await evidencia(segunda);
    expect(a!.r2_key).not.toBe(b!.r2_key);
    expect(await env.STORAGE.get(String(a!.r2_key))).not.toBeNull();
  });
});

describe('documento do assistente aprovado', () => {
  it('grava pendente e ligado ao controle; item que dava 404 (p15_5) é aceito', async () => {
    const ok = await chamar(`/api/v1/projects/${P}/approve-document`, { method: 'POST', headers: json(consultor), body: JSON.stringify({ itemId: 'p15_1', content: '# Política' }) });
    const body = await ok.json<{ evidence_id: string }>();
    expect(ok.status, JSON.stringify(body)).toBe(200);
    const ev = await evidencia(body.evidence_id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');

    const antes404 = await chamar(`/api/v1/projects/${P}/approve-document`, { method: 'POST', headers: json(consultor), body: JSON.stringify({ itemId: 'p15_5', content: '# Uso aceitável' }) });
    expect(antes404.status).toBe(200);
    // O projeto não tem A.5.10: fica sem controle.
    expect((await evidencia((await antes404.json<{ evidence_id: string }>()).evidence_id))!.control_id).toBeNull();
  });
});

describe('upload de documento', () => {
  it('pelo checklist (cliente): pendente, ligado ao controle, e o item fica marcado', async () => {
    const res = await enviar(cliente, 'p15_1');
    const body = await res.json<{ id: string }>();
    expect(res.status, JSON.stringify(body)).toBe(201);
    const ev = await evidencia(body.id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBe('ctl-a51');
    expect((await progresso('p15_1'))!.evidence_id).toBe(body.id);
  });

  it('sem item: pendente, sem controle e sem marcar nada', async () => {
    const res = await enviar(cliente);
    const { id } = await res.json<{ id: string }>();
    expect(res.status).toBe(201);
    const ev = await evidencia(id);
    expect(ev!.evaluation_status).toBe('pending');
    expect(ev!.control_id).toBeNull();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM checklist_progress WHERE evidence_id = ?').bind(id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('item inexistente: 400 e nada no R2', async () => {
    const antes = (await env.STORAGE.list({ prefix: `docs/${P}/` })).objects.length;
    const res = await enviar(cliente, 'p99_9');
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('Item de checklist não encontrado');
    expect((await env.STORAGE.list({ prefix: `docs/${P}/` })).objects.length).toBe(antes);
  });

  // Review Focus 1
  it('não apaga a anotação do item', async () => {
    await env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes) VALUES ('cp-nota', ?, 15, 'p15_2', 0, 'minha anotação')`
    ).bind(P).run();
    expect((await enviar(cliente, 'p15_2')).status).toBe(201);
    const prog = await progresso('p15_2');
    expect(prog!.notes).toBe('minha anotação');
    expect(prog!.is_checked).toBe(1);
  });
});
```

Em `test/document-flow.test.ts:63`, troque
```ts
    expect(ev.r2_key).toBe('projects/proj-123/evidence/p3_1.md');
```
por
```ts
    // Chave por evidência: gerar de novo não sobrescreve o arquivo da evidência anterior.
    expect(ev.r2_key).toBe(`projects/proj-123/evidence/p3_1-${body.evidence_id}.md`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evidencia-documento-controle.test.ts test/document-flow.test.ts`
Expected: FAIL — `evaluation_status` vem `'conforming'`, `control_id` vem `null`, o upload com `item_id` não marca o item, a chave do R2 não tem o id.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/policies.ts`, troque o import da Task 1 por:
```ts
import { itemDoChecklist, controleDoItem, marcarItemComEvidencia } from '../services/checklist-evidencia';
```

Substitua o corpo de `approve-document` a partir de `const item = itemDoChecklist(itemId);` até o `logAudit` (exclusive) por:

```ts
    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item não encontrado' }, 404);
    const userEmail = c.get('user')?.email ?? 'system';

    // Chave por evidência: com a chave por item, aprovar de novo sobrescrevia o arquivo da
    // evidência anterior e o hash gravado nela deixava de bater com o conteúdo.
    const evidenceId = crypto.randomUUID();
    const r2Key = `projects/${projectId}/evidence/${itemId}-${evidenceId}.md`;
    await c.env.STORAGE.put(r2Key, content, { httpMetadata: { contentType: 'text/markdown' } });

    // Hash
    const data = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Entra pendente: quem gerou não revisa. A revisão é a assinatura do Líder SGSI.
    const controlId = await controleDoItem(c.env.DB, projectId, item);
    const fileName = `${item.text}.md`;
    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evidenceId, projectId, controlId, fileName, r2Key, hashHex, 'text/markdown', data.byteLength, userEmail, 'pending', 'Documento do assistente guiado; aguarda revisão.').run();

    await marcarItemComEvidencia(c.env.DB, projectId, item, evidenceId, c.get('user'));
```

(Some com isso a variável `userId` e o UPSERT inline de `checklist_progress` deste handler.)

Substitua o corpo de `checklist/:itemId/generate` a partir de `// Salvar no R2` até o `logAudit` (exclusive) por:

```ts
    // Chave por evidência (ver approve-document).
    const evidenceId = crypto.randomUUID();
    const r2Key = `projects/${projectId}/evidence/${itemId}-${evidenceId}.md`;
    await c.env.STORAGE.put(r2Key, docContent, { httpMetadata: { contentType: 'text/markdown' } });

    // Calcular hash SHA-256
    const data = new TextEncoder().encode(docContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Rascunho de IA entra pendente de revisão, ligado ao controle do item quando ele tem um.
    const controlId = await controleDoItem(c.env.DB, projectId, item);
    const fileName = `${item.text}.md`;
    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evidenceId, projectId, controlId, fileName, r2Key, hashHex, 'text/markdown', data.byteLength, userEmail, 'pending', 'Rascunho gerado pelo assistente de IA; aguarda revisão.').run();

    await marcarItemComEvidencia(c.env.DB, projectId, item, evidenceId, c.get('user'));
```

e, nesse handler, apague a linha `const phaseNumber = item.phaseNumber;` que a Task 1 deixou e troque `let docContent` por `const docContent`. O `return c.json({ ok: true, evidence_id: evidenceId, file_name: fileName, r2_key: r2Key })` continua igual.

Em `src/routes/projects.ts`, acrescente o import (depois da linha 5):
```ts
import { itemDoChecklist, controleDoItem, marcarItemComEvidencia } from '../services/checklist-evidencia';
```

e substitua o handler `projectsApp.post('/:id/documents/upload', …)` (linhas 626-661) por:

```ts
projectsApp.post('/:id/documents/upload', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    if (!file) return c.json({ error: 'No file provided' }, 400);

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

    // Upload pelo checklist: o item vem no formulário e é conferido ANTES do R2,
    // para item desconhecido não deixar objeto órfão.
    const itemId = typeof body['item_id'] === 'string' ? body['item_id'] : '';
    const item = itemId ? itemDoChecklist(itemId) : null;
    if (itemId && !item) return c.json({ error: 'Item de checklist não encontrado' }, 400);
    const controlId = item ? await controleDoItem(c.env.DB, projectId, item) : null;

    const docId = genId();
    const r2Key = `docs/${projectId}/${docId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    // Entra pendente: quem envia não revisa (a rota é liberada ao cliente, org_user).
    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, evaluation_notes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'Documento enviado; aguarda revisão.', ?, datetime('now'))`
    ).bind(docId, projectId, controlId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();

    if (item) await marcarItemComEvidencia(c.env.DB, projectId, item, docId, user);

    await logAudit(c.env.DB, 'document.uploaded', user?.email || 'system', `Documento ${file.name} carregado para projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id: docId, sha256: realSha256 }, 201);
  } catch (e) {
    return erro500(c, 'Falha no upload de documento', e);
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/evidencia-documento-controle.test.ts test/document-flow.test.ts test/checklist-fonte-unica.test.ts test/checklist-progress.test.ts test/policies.test.ts test/any-catraca.test.ts`
Expected: PASS. Se a catraca acusar total abaixo do `TETO` (o `catch (e: any)` virou `catch (e)`), baixe o `TETO` em `test/any-catraca.test.ts` para o número que ela mostrar e rode de novo.

- [ ] **Step 5: Commit**

```bash
git add src/routes/policies.ts src/routes/projects.ts test/evidencia-documento-controle.test.ts test/document-flow.test.ts test/any-catraca.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(evidencia): documento entra pendente e ligado ao controle do item

Upload, assistente e geração por IA gravavam a evidência como conforme,
sem revisão e sem controle. Agora entram pendentes, com o controle do
item quando ele tem um; o upload pelo checklist marca o item, a anotação
do item não é mais sobrescrita e cada evidência tem o próprio arquivo
no R2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A revisão leva a conforme e aparece na rastreabilidade

**Files:**
- Modify: `src/routes/evidence.ts:67-99` (`PUT /:id/content`), `:196-199` (`/evaluate`), `:274-284` (`handleApprove`)
- Modify: `src/routes/projects.ts:981-994` (`GET /:id/traceability`: evidência com `evaluation_status`)
- Test: `test/signatures.test.ts` (acrescentar), `test/jornada-evidencia.test.ts` (critério de pronto)

**Interfaces:**
- Consumes: Tasks 1 e 2 (upload pelo checklist com `item_id`).
- Produces: assinatura `role: 'ciso'` leva `pending` (ou `NULL`) → `conforming`; `PUT /evidence/:id/content` grava `evaluation_status = 'pending'`, `evaluation_score`/`evaluation_notes` `NULL` e zera `ciso_approved_*`/`ceo_approved_*`; `/evaluate` grava `conforming | partial | non_conforming | pending` a partir da linha `Veredito:`; `GET /projects/:id/traceability` devolve `evidence: [{ id, file_name, created_at, evaluation_status }]`.

- [ ] **Step 1: Write the failing tests**

Acrescente ao fim do `describe('Assinatura eletrônica (D1 real)')` em `test/signatures.test.ts` (o `beforeEach` dali já cria `ev-1` pendente, a Ana como Líder SGSI e a Direção):

```ts
  describe('a assinatura do Líder SGSI é a revisão', () => {
    const statusDe = async (id: string) =>
      (await env.DB.prepare('SELECT evaluation_status FROM evidence WHERE id = ?').bind(id).first<{ evaluation_status: string }>())!.evaluation_status;

    it('pendente assinada pelo Líder SGSI vira conforme', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await statusDe('ev-1')).toBe('conforming');
    });

    it('a assinatura da Direção sozinha não conclui a revisão', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ceo', password: 'password123' }, headersDirecao);
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('não passa por cima de evidência reprovada', async () => {
      await env.DB.prepare("UPDATE evidence SET evaluation_status = 'non_conforming' WHERE id = 'ev-1'").run();
      expect((await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      expect(await statusDe('ev-1')).toBe('non_conforming');
    });

    // Review Focus 3
    it('editar o conteúdo devolve a pendente e apaga as assinaturas', async () => {
      await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      const res = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/content', {
        method: 'PUT', headers, body: JSON.stringify({ content: '# Texto alterado' }),
      }), env as any);
      expect(res.status, await res.clone().text()).toBe(200);
      const ev = await env.DB.prepare('SELECT evaluation_status, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind('ev-1').first<any>();
      expect(ev.evaluation_status).toBe('pending');
      expect(ev.ciso_approved_by).toBeNull();
      expect(ev.ceo_approved_by).toBeNull();
    });

    // Review Focus 4
    it('avaliação por IA lê o veredito ("NÃO CONFORME" não vira conforme)', async () => {
      const avaliar = (saida: string) => worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/evaluate', {
        method: 'POST', headers, body: JSON.stringify({ text: 'conteúdo' }),
      }), { ...env, AI: { run: async () => ({ response: saida }) } } as any);
      expect((await avaliar('# Veredito: NÃO CONFORME\n- **Score de Confiança**: 30')).status).toBe(200);
      expect(await statusDe('ev-1')).toBe('non_conforming');
      await avaliar('# Veredito: **PARCIAL**');
      expect(await statusDe('ev-1')).toBe('partial');
      await avaliar('# Veredito: CONFORME');
      expect(await statusDe('ev-1')).toBe('conforming');
      await avaliar('Sem veredito nenhum');
      expect(await statusDe('ev-1')).toBe('pending');
    });
  });
```

`test/jornada-evidencia.test.ts` (critério de pronto, item 4 da seção 5 da spec):

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Critério de pronto da fatia (spec, seção 5, item 4): a evidência é enviada pelo checklist,
 * fica ligada ao controle, pendente; depois da revisão (assinatura do Líder SGSI) aparece
 * conforme na rastreabilidade e conta na análise de lacunas.
 */
const P = 'p-jornada';
let lider: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());

beforeAll(async () => {
  await applySchema();
  const hash = await hashPassword('password123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctl-j51', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação', 'Missing')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-lider', 'lider@ness.lat', ?, 'Lia Lider', 'consultor')`).bind(hash),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-l', ?, 'Lia Lider', 'lider@ness.lat', 'consultor', 'Líder do SGSI')`).bind(P),
  ]);
  lider = { ...(await sessionFor({ id: 'u-lider', email: 'lider@ness.lat', name: 'Lia Lider', role: 'consultor' })), 'Content-Type': 'application/json' };
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

describe('evidência pelo checklist até a rastreabilidade', () => {
  it('enviada pendente e ligada; revisada, aparece conforme e conta nas lacunas', async () => {
    const form = new FormData();
    form.append('file', new File(['politica assinada'], 'politica.pdf', { type: 'application/pdf' }));
    form.append('item_id', 'p15_1');
    const up = await chamar(`/api/v1/projects/${P}/documents/upload`, { method: 'POST', headers: cliente, body: form });
    const { id } = await up.json<{ id: string }>();
    expect(up.status).toBe(201);

    const antes = await (await chamar(`/api/v1/projects/${P}/traceability`, { headers: lider })).json<any>();
    const ctl = antes.controls.find((c: any) => c.id === 'ctl-j51');
    expect(ctl.evidence).toEqual([expect.objectContaining({ id, evaluation_status: 'pending' })]);

    const gap = await (await chamar(`/api/v1/projects/${P}/gap-analysis`, { headers: lider })).json<any>();
    expect(gap.controls_with_evidence).toBe(1);
    expect(gap.gaps.find((g: any) => g.control_id === 'ctl-j51').evidence_count).toBe(1);

    const rev = await chamar(`/api/v1/evidence/${id}/approve`, { method: 'POST', headers: lider, body: JSON.stringify({ role: 'ciso', password: 'password123' }) });
    expect(rev.status, await rev.clone().text()).toBe(200);

    const depois = await (await chamar(`/api/v1/projects/${P}/traceability`, { headers: lider })).json<any>();
    expect(depois.controls.find((c: any) => c.id === 'ctl-j51').evidence[0].evaluation_status).toBe('conforming');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/signatures.test.ts test/jornada-evidencia.test.ts`
Expected: FAIL — status continua `pending` depois da assinatura, a edição não zera as assinaturas, "NÃO CONFORME" vira `conforming` e a rastreabilidade não traz `evaluation_status`.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/evidence.ts`, no `PUT /:id/content`, troque o UPDATE (linhas ~88-90):

```ts
    // Conteúdo novo é documento novo: a revisão e as assinaturas eram do texto anterior.
    // Sem isto o cliente (org_user pode editar) reescrevia documento já revisado e ele seguia conforme.
    await c.env.DB.prepare(
      `UPDATE evidence SET file_size = ?, file_hash = ?, evaluation_status = 'pending', evaluation_score = NULL, evaluation_notes = NULL,
         ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
         ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(arrayBuffer.byteLength, realSha256, id).run();
```

No `/evaluate`, troque as linhas 196-199:

```ts
    // O veredito vem na linha "Veredito:" (prompt do EvidenceAgent). Antes, includes('CONFORME')
    // casava também "NÃO CONFORME" e gravava conforming para evidência reprovada.
    const veredito = /Veredito:\W*(N[ÃA]O CONFORME|PARCIAL|CONFORME)/i.exec(result.content)?.[1]?.toUpperCase();
    const evalStatus = !veredito ? 'pending' : veredito === 'CONFORME' ? 'conforming' : veredito === 'PARCIAL' ? 'partial' : 'non_conforming';
```

Em `handleApprove`, troque o UPDATE do ramo `ciso` (linhas ~276-278):

```ts
      // A assinatura do Líder SGSI é a revisão humana: leva a evidência pendente a conforme.
      // Não passa por cima de parcial/não conforme: essas voltam a pendente ao serem corrigidas.
      await c.env.DB.prepare(
        `UPDATE evidence SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?,
           evaluation_status = CASE WHEN COALESCE(evaluation_status, 'pending') = 'pending' THEN 'conforming' ELSE evaluation_status END
         WHERE id = ?`
      ).bind(approvedBy, now, ip, ua, id).run();
```

Em `src/routes/projects.ts`, no `GET /:id/traceability`, troque a consulta de evidência e o mapa (linhas ~981-994):

```ts
  const evidenceResult = await db.prepare(
    `SELECT id, file_name, created_at, control_id, evaluation_status FROM evidence
      WHERE control_id IN (SELECT id FROM compliance_controls WHERE project_id = ?)`
  ).bind(projectId).all();
```

```ts
  for (const e of (evidenceResult.results || []) as any[]) {
    (evidenceMap[e.control_id] ||= []).push({ id: e.id, file_name: e.file_name, created_at: e.created_at, evaluation_status: e.evaluation_status });
  }
```

(O `as any[]` já existia na linha; a contagem de `any` não muda.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/signatures.test.ts test/jornada-evidencia.test.ts test/agente-gap-traceability.test.ts test/idor-tenant.test.ts test/assinatura-governanca.test.ts test/document-flow.test.ts test/any-catraca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/evidence.ts src/routes/projects.ts test/signatures.test.ts test/jornada-evidencia.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(evidencia): assinatura do Líder SGSI é a revisão que leva a conforme

A assinatura não mudava o status, e a avaliação por IA gravava conforme
para veredito NÃO CONFORME. Agora a assinatura do Líder SGSI leva a
evidência pendente a conforme, editar o conteúdo devolve a pendente e
apaga as assinaturas, e a rastreabilidade mostra o status de cada
evidência.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Upload de evidência pelo código do controle e mitigação sem evidência falsa

**Files:**
- Modify: `src/routes/evidence.ts:308-326` (`POST /projects/:projectId/evidence/upload`) e o import da linha 3
- Modify: `src/routes/risks.ts:67-80` e `:138-152` (apagar o "Trigger de Mitigação")
- Test: `test/evidencia-upload-controle.test.ts` (acrescentar), `test/risco-sem-evidencia-falsa.test.ts`

**Interfaces:**
- Consumes: `idDoControle` (`src/helpers.ts:343`).
- Produces: `POST /api/v1/projects/:projectId/evidence/upload` aceita em `control_id` o id da linha **ou** o código (`A.5.1`), estrito (400 `'Controle não encontrado neste projeto'`); e o campo opcional `control_ref`, leniente (código não achado → evidência sem controle, 201). A Task 5 usa `control_ref = 'A.6.3'` no treinamento.

- [ ] **Step 1: Write the failing tests**

Acrescente a `test/evidencia-upload-controle.test.ts`, dentro do `describe('upload de evidência com control_id')`, depois de `'controle do projeto: 201 e o objeto existe no R2'`:

```ts
  // Review Focus 5: o modal pede "Ex: A.5.1"; o servidor só aceitava o id da linha.
  it('aceita o código do controle e liga à linha deste projeto', async () => {
    const res = await upload('A.5.1');
    expect(res.status, await res.clone().text()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const ev = await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(id).first<{ control_id: string }>();
    expect(ev!.control_id).toBe('ctrl-meu');
  });

  it('control_ref é leniente: código ausente sobe sem controle; presente, liga', async () => {
    const enviar = (ref: string) => {
      const form = new FormData();
      form.append('file', new File(['certificado'], 'certificado.pdf', { type: 'application/pdf' }));
      form.append('control_ref', ref);
      return worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: admin, body: form }), workerEnv());
    };
    const sem = await enviar('A.6.3');
    expect(sem.status).toBe(201);
    const idSem = ((await sem.json()) as { id: string }).id;
    expect((await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(idSem).first<{ control_id: string | null }>())!.control_id).toBeNull();

    const com = await enviar('A.5.1');
    const idCom = ((await com.json()) as { id: string }).id;
    expect((await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(idCom).first<{ control_id: string }>())!.control_id).toBe('ctrl-meu');
  });
```

`test/risco-sem-evidencia-falsa.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Tratar risco como "Mitigar" criava uma linha em `evidence` sem arquivo
 * (r2_key 'pending_upload', hash 'none'), contada como evidência pendente.
 * Tarefa não é evidência: o efeito colateral saiu.
 */
const P = 'p-risco';
let admin: Record<string, string>;
const evidencias = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM evidence WHERE project_id = ?').bind(P).first<{ n: number }>())!.n;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P).run();
  admin = { ...(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
});

describe('risco com tratamento Mitigar', () => {
  it('criar e atualizar não criam evidência', async () => {
    const criado = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/risks`, {
      method: 'POST', headers: admin, body: JSON.stringify({ asset: 'Servidor', threat: 'Ransomware', treatment: 'Mitigate' }),
    }), workerEnv());
    expect(criado.status, await criado.clone().text()).toBe(201);
    const { id } = await criado.json<{ id: string }>();
    expect(await evidencias()).toBe(0);

    const editado = await worker.fetch(new Request(`http://localhost/api/v1/risks/${id}`, {
      method: 'PUT', headers: admin, body: JSON.stringify({ asset: 'Servidor', threat: 'Vazamento', treatment: 'Mitigate' }),
    }), workerEnv());
    expect(editado.status, await editado.clone().text()).toBe(200);
    expect(await evidencias()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/evidencia-upload-controle.test.ts test/risco-sem-evidencia-falsa.test.ts`
Expected: FAIL — `upload('A.5.1')` dá 400; `control_ref` é ignorado; criar risco grava 1 evidência.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/evidence.ts`, acrescente `idDoControle` ao import da linha 3:
```ts
import { genId, logAudit, requireResourceAccess, verifyPassword, validateUpload, autoridadeDeAssinatura, recusaDeAssinatura, erro500, registraErro, idDoControle } from '../helpers';
```

No upload, troque a leitura de `controlId` (linha ~312) e o bloco de conferência (linhas ~322-325). Fica:

```ts
    const pedido = typeof body['control_id'] === 'string' ? body['control_id'] : '';
    const ref = typeof body['control_ref'] === 'string' ? body['control_ref'] : '';
```

(no lugar de `const controlId = (body['control_id'] as string) || null;`) e, depois do `validateUpload`:

```ts
    // O controle precisa existir E ser deste projeto, conferido ANTES de tocar
    // no R2: sem isto a FK derrubava o INSERT depois do put (objeto órfão + 500)
    // e controle de outro projeto era aceito. Mesma resposta nos dois casos para
    // não revelar a existência de controle alheio. Aceita o id da linha ou o
    // código ("A.5.1", o que o modal pede).
    let controlId: string | null = null;
    if (pedido) {
      controlId = await idDoControle(c.env.DB, projectId, pedido);
      if (!controlId) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    } else if (ref) {
      // ponytail: leniente de propósito — quem manda control_ref (o treinamento, A.6.3) é uma
      // sugestão; projeto sem esse controle recebe o arquivo sem vínculo em vez de recusar.
      controlId = await idDoControle(c.env.DB, projectId, ref);
    }
```

O INSERT continua usando `controlId`.

Em `src/routes/risks.ts`, apague o bloco do POST (linhas 67-80):
```ts
    // Trigger de Mitigação (PDCA)
    const treatment = body.treatment ?? 'Mitigate';
    if (treatment === 'Mitigate') {
      ...
    }
```
e o bloco equivalente do PUT (linhas 138-152, de `// Trigger de Mitigação (PDCA)` até o `}` que fecha o `if (treatment === 'Mitigate')`), mantendo o INSERT em `risk_history` e o `if (projectId) { … }` que o envolve.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/evidencia-upload-controle.test.ts test/risco-sem-evidencia-falsa.test.ts test/agente-gap-traceability.test.ts test/idor-tenant.test.ts test/any-catraca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/evidence.ts src/routes/risks.ts test/evidencia-upload-controle.test.ts test/risco-sem-evidencia-falsa.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(evidencia): upload aceita o código do controle; mitigar não cria evidência falsa

O modal pede o código (A.5.1) e o servidor só aceitava o id da linha.
O upload ganha control_ref, leniente, para o treinamento sugerir A.6.3.
Tratar risco como Mitigar deixava uma evidência sem arquivo (pending_upload).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Checklist e treinamento enviam o item e o controle

**Files:**
- Modify: `frontend/src/views/project.js:1-4` (import de `API_BASE`), `:346-368` (selo e borda), `:409` (caixa de lacunas), `:1312-1334` (`doDocUpload`)
- Modify: `frontend/src/views/grc.js:1-4` (import de `API_BASE`), `:930-958` (`uploadTrainingEvidence`)
- Test: `frontend/test/evidencia-checklist.test.js`

**Interfaces:**
- Consumes: `POST /documents/upload` com `item_id` (Task 2); `POST /evidence/upload` com `control_ref` (Task 4).
- Produces: `window.seloDaAvaliacao(status: string): { rotulo: string; cor: string; problema: boolean }` — `conforming` → `Conforme`, `partial` → `Parcial` (problema), `non_conforming` → `Não conforme` (problema), qualquer outro → `Aguarda revisão`.

- [ ] **Step 1: Write the failing test**

`frontend/test/evidencia-checklist.test.js`:

```js
// O upload pelo checklist mandava o item como `document_type` (ignorado pelo servidor) e,
// sem importar API_BASE, nem chegava a sair. O treinamento subia certificado sem controle e
// gravava "<id>|undefined". O selo do checklist comparava com a grafia antiga do status.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/grc.js';
import { S } from '../src/state.js';

function comArquivo(input, nome) {
    Object.defineProperty(input, 'files', { value: [new File(['x'], nome, { type: 'application/pdf' })] });
}

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 't';
    S.activeProject = { id: 'p1' };
    window.render = vi.fn();
});

describe('upload pelo checklist', () => {
    it('envia o item no campo item_id', async () => {
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'ev-1' }), { status: 201 }));
        await window.wsUploadEvidence('p15_1');
        comArquivo(document.getElementById('doc-file'), 'politica.pdf');
        await window.doDocUpload('p15_1');
        expect(f).toHaveBeenCalledTimes(1);
        expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p1\/documents\/upload$/);
        expect(f.mock.calls[0][1].body.get('item_id')).toBe('p15_1');
        f.mockRestore();
    });
});

describe('selo da avaliação no checklist', () => {
    it('usa o domínio canônico do status', () => {
        expect(window.seloDaAvaliacao('conforming')).toMatchObject({ rotulo: 'Conforme', problema: false });
        expect(window.seloDaAvaliacao('partial')).toMatchObject({ rotulo: 'Parcial', problema: true });
        expect(window.seloDaAvaliacao('non_conforming')).toMatchObject({ rotulo: 'Não conforme', problema: true });
        expect(window.seloDaAvaliacao('pending')).toMatchObject({ rotulo: 'Aguarda revisão', problema: false });
        expect(window.seloDaAvaliacao('')).toMatchObject({ rotulo: 'Aguarda revisão', problema: false });
    });
});

describe('certificado de treinamento', () => {
    it('sugere o controle A.6.3 e guarda id e nome do arquivo', async () => {
        document.body.innerHTML += '<div id="tr-upload-status"></div><input id="tr-evidence"><input type="file" id="tr-file">';
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'ev-9', sha256: 'abc' }), { status: 201 }));
        const input = document.getElementById('tr-file');
        comArquivo(input, 'certificado.pdf');
        await window.uploadTrainingEvidence(input, 'p1');
        expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p1\/evidence\/upload$/);
        expect(f.mock.calls[0][1].body.get('control_ref')).toBe('A.6.3');
        expect(document.getElementById('tr-evidence').value).toBe('ev-9|certificado.pdf');
        f.mockRestore();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/evidencia-checklist.test.js --pool=threads`
Expected: FAIL — `fetch` não é chamado (`API_BASE is not defined` cai no `catch`), `seloDaAvaliacao` não existe, o treinamento não manda `control_ref`.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/views/project.js`, linha 2:
```js
import { api, API_BASE } from '../api.js';
```

Logo depois dos imports (antes do primeiro bloco de código do arquivo), acrescente:

```js
// Domínio canônico de evidence.evaluation_status (src/constants.ts, EVALUATION_STATUSES).
// O selo comparava com a grafia antiga ('conforme', 'parcial', 'nao conforme'), que o banco
// não usa mais: todo item aparecia pendente com borda vermelha.
const SELO_AVALIACAO = {
    conforming: { rotulo: 'Conforme', cor: '#00ade8', problema: false },
    partial: { rotulo: 'Parcial', cor: '#ffc107', problema: true },
    non_conforming: { rotulo: 'Não conforme', cor: '#ff4d4d', problema: true },
};
window.seloDaAvaliacao = (status) => SELO_AVALIACAO[status] || { rotulo: 'Aguarda revisão', cor: 'var(--text-dim)', problema: false };
```

Troque o bloco das linhas 346-368 (de `let badgeHtml = '';` até o fim do `if (isChecked) { … }` da borda) por:

```js
                                                        let badgeHtml = '';
                                                        const selo = window.seloDaAvaliacao(itemStatus);
                                                        if (isChecked && itemEvidenceId) {
                                                            badgeHtml = `<span style="font-size:0.72rem; padding:2px 6px; border-radius:4px; border:1px solid ${selo.cor}; color:${selo.cor}; margin-left:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${selo.rotulo}</span>`;
                                                        }

                                                        let borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                                                        if (isChecked) {
                                                            borderLeftColor = selo.problema ? 'var(--danger)' : 'var(--success)';
                                                        }
```

Na linha 409, troque a condição da caixa de lacunas
```js
                                                                ${(isChecked && itemStatus && itemStatus !== 'conforme' && itemEvalNotes) ? `
```
por
```js
                                                                ${(isChecked && selo.problema && itemEvalNotes) ? `
```
e, duas linhas abaixo, o título `Gaps Identificados [AI]` por `Lacunas apontadas na avaliação`.

Em `doDocUpload` (linha ~1319), troque
```js
            fd.append('document_type', docType);
```
por
```js
            // O servidor liga a evidência ao controle do item e marca o item no checklist.
            fd.append('item_id', docType);
```

`frontend/src/views/grc.js`, linha 2:
```js
import { api, API_BASE } from '../api.js';
```

Em `uploadTrainingEvidence`, depois de `formData.append('file', file);`:
```js
        // Certificado de treinamento é evidência de conscientização (A.6.3). Leniente no servidor:
        // projeto sem esse controle recebe o arquivo sem vínculo.
        formData.append('control_ref', 'A.6.3');
```
e troque as duas leituras de `data.file_name` (a resposta do upload não traz o nome):
```js
            evidenceInput.value = `${data.id}|${file.name}`;
            statusDiv.style.color = 'var(--success)';
            statusDiv.textContent = `Upload concluído: ${file.name}`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/evidencia-checklist.test.js test/wizard-flow.test.js test/journey-flows.test.js test/delegation.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/project.js frontend/src/views/grc.js frontend/test/evidencia-checklist.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(checklist): upload envia o item, treinamento sugere A.6.3, selo lê o status real

O upload pelo checklist nem saía (API_BASE sem import) e mandava o item
num campo ignorado. O treinamento subia sem controle e gravava o nome
como undefined. O selo comparava com a grafia antiga do status.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Central de Evidências escolhe o controle e mostra a avaliação

**Files:**
- Modify: `frontend/src/views/compliance.js:2` (import de `API_BASE`), `:1464-1541` (`renderEvidence`), fim do arquivo (`window.vincularEvidenciaControle`)
- Modify: `frontend/src/ui.js:134-166` (`STATUS_DICT`: `conforming`, `non_conforming`)
- Modify: `CHANGELOG.md` (seção `[Não publicado]`)
- Test: `frontend/test/evidencia-controle.test.js`

**Interfaces:**
- Consumes: `PUT /api/v1/evidence/:id` com `{ control_id: string | null }` (já existe, `src/routes/evidence.ts:125`; volta a avaliação a `pending` quando o vínculo muda); `GET /api/v1/projects/:id/controls` (`{ ok, controls }`).
- Produces: `window.vincularEvidenciaControle(evidenceId: string, controlId: string): Promise<void>`; colunas "Controle" e "Avaliação" na Central de Evidências.

- [ ] **Step 1: Write the failing test**

`frontend/test/evidencia-controle.test.js`:

```js
// A Central de Evidências não tinha como trocar o controle de uma evidência (o PUT existia sem
// tela) e lia `ai_status`, coluna que não existe: toda evidência aparecia "Não avaliado".
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/ui.js';
import '../src/views/compliance.js';
import { S } from '../src/state.js';

const EVIDENCIAS = [
    { id: 'ev-1', file_name: 'politica.pdf', control_id: null, evaluation_status: 'pending' },
    { id: 'ev-2', file_name: 'log.txt', control_id: 'ctl-1', evaluation_status: 'conforming' },
];
const CONTROLES = [{ id: 'ctl-1', title: 'A.5.1 — Políticas <img src=x onerror=alert(1)>' }];

function tela() {
    const c = document.createElement('div');
    const h = document.createElement('div');
    const a = document.createElement('div');
    return { c, h, a };
}

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((metodo, url) => {
        if (metodo === 'GET' && url.endsWith('/evidence')) return Promise.resolve({ ok: true, evidence: EVIDENCIAS });
        if (metodo === 'GET' && url.endsWith('/controls')) return Promise.resolve({ ok: true, controls: CONTROLES });
        return Promise.resolve({ ok: true });
    });
    S.currentProject = { id: 'p1' };
    S.user = { role: 'consultor' };
});

describe('Central de Evidências', () => {
    it('mostra o seletor de controle com o vínculo atual e o status traduzido', async () => {
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        const seletores = c.querySelectorAll('select[data-action-change="vincularEvidenciaControle"]');
        expect(seletores).toHaveLength(2);
        expect(seletores[1].value).toBe('ctl-1');
        expect(seletores[0].value).toBe('');
        expect(c.querySelector('img')).toBeNull();
        expect(c.textContent).toContain('Conforme');
        expect(c.textContent).toContain('Pendente');
    });

    it('cliente vê o controle, sem seletor', async () => {
        S.user = { role: 'org_user' };
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        expect(c.querySelector('select[data-action-change="vincularEvidenciaControle"]')).toBeNull();
        expect(c.textContent).toContain('A.5.1');
    });

    it('trocar o controle chama o PUT da evidência; vazio desassocia', async () => {
        await window.vincularEvidenciaControle('ev-1', 'ctl-1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/evidence/ev-1', { control_id: 'ctl-1' });
        await window.vincularEvidenciaControle('ev-2', '');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/evidence/ev-2', { control_id: null });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/evidencia-controle.test.js --pool=threads`
Expected: FAIL — nenhum `select[data-action-change="vincularEvidenciaControle"]`; `window.vincularEvidenciaControle` não existe.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/ui.js`, em `STATUS_DICT`, ao lado de `'partial': 'Parcial',`:
```js
    'conforming': 'Conforme',
    'non_conforming': 'Não Conforme',
```

`frontend/src/views/compliance.js`, linha 2:
```js
import { api, API_BASE } from '../api.js';
```
(o upload e o download de evidência deste arquivo usam `API_BASE` sem importá-lo).

Em `renderEvidence`, troque a carga (linhas ~1475-1477)
```js
        let evidence = [];
        try { evidence = await api('GET', `/api/v1/projects/${proj.id}/evidence`); } catch(e) {}
        if (!Array.isArray(evidence)) evidence = [];
```
por
```js
        // Lista nos dois formatos: o api() pode devolver a lista ou o objeto inteiro (P1).
        const lista = (r, campo) => (Array.isArray(r) ? r : (r && r[campo]) || []);
        const [rEv, rCtl] = await Promise.all([
            api('GET', `/api/v1/projects/${proj.id}/evidence`).catch(() => []),
            api('GET', `/api/v1/projects/${proj.id}/controls`).catch(() => []),
        ]);
        const evidence = lista(rEv, 'evidence');
        const controles = lista(rCtl, 'controls');
        const tituloDoControle = Object.fromEntries(controles.map(ctl => [ctl.id, ctl.title || ctl.id]));
```

Troque a linha do contador `aiEvaluatedCount` e o card dele:
```js
        const aiEvaluatedCount = evidence.filter(e => e.evaluation_status && e.evaluation_status !== 'pending').length;
```
```js
            { label: 'Avaliadas', value: aiEvaluatedCount, color: '#ffcc00', subtext: 'Revisão ou avaliação concluída' }
```

Troque o cabeçalho da tabela:
```js
            ['Arquivo Evidência', 'Controle', 'Tamanho', 'Hash (SHA-256)', 'Assinatura DPO', 'Assinatura CEO', 'Avaliação', 'Ações'],
```

Dentro do `evidence.map(e => { … })`, troque o bloco de `aiBadgeType`/`aiBadge` por:
```js
                const st = e.evaluation_status || 'pending';
                const avaliacaoBadge = window.renderStatusBadge(traduzStatus(st), st === 'conforming' ? 'success' : st === 'partial' ? 'warning' : st === 'non_conforming' ? 'danger' : 'neutral');

                // Cliente não troca o vínculo (PUT /evidence/:id é escrita fora do allow-list dele).
                const controleCell = isOrgUser
                    ? escapeHTML(e.control_id ? (tituloDoControle[e.control_id] || e.control_id) : '—')
                    : `<select class="form-input" data-action-change="vincularEvidenciaControle" data-args='${JSON.stringify([e.id])}' data-arg-val>
                           <option value="">Sem controle</option>
                           ${controles.map(ctl => `<option value="${escapeHTML(ctl.id)}" ${ctl.id === e.control_id ? 'selected' : ''}>${escapeHTML(ctl.title || ctl.id)}</option>`).join('')}
                       </select>`;
```
e o array devolvido por linha passa a ser:
```js
                return [
                    `<strong>${escapeHTML(fileName)}</strong>`,
                    controleCell,
                    sizeKB,
                    `<code style="font-size:0.75rem;color:var(--text-dim)">${hashShort}</code>`,
                    dpoBadge,
                    ceoBadge,
                    avaliacaoBadge,
                    `<button data-action="downloadEvidenceFile" data-args='["${e.id}"]' class="btn btn-ghost btn-sm">Download</button> ${dpoBtn} ${ceoBtn} ${evalBtn}`
                ];
```

No fim do arquivo, ao lado de `window.evaluateEvidenceAI`:
```js
// Troca (ou desfaz) o controle de uma evidência. O servidor confere que o controle é do projeto
// e volta a avaliação a pendente quando o vínculo muda.
window.vincularEvidenciaControle = async function(evidenceId, controlId) {
    try {
        await api('PUT', `/api/v1/evidence/${evidenceId}`, { control_id: controlId || null });
        showToast(controlId ? 'Evidência ligada ao controle.' : 'Evidência desligada do controle.');
    } catch (e) {
        showToast('Erro ao trocar o controle: ' + e.message, 'error');
    }
};
```

Em `CHANGELOG.md`, na seção `## [Não publicado]` → `### Corrigido`, acrescente:
```markdown
- Evidência de documento (upload, assistente e geração por IA) entra pendente de revisão e ligada ao controle do item quando ele tem um; a assinatura do Líder SGSI é a revisão que a leva a conforme; editar o conteúdo devolve a pendente e apaga as assinaturas; a avaliação por IA não grava mais "conforme" para veredito "NÃO CONFORME".
- Checklist: uma lista só para a tela e a geração de documento (seis itens davam 404 e quase todos geravam documento de outro item); o upload pelo checklist volta a funcionar e marca o item; o selo lê o status real.
- Upload de evidência aceita o código do controle (A.5.1); o certificado de treinamento é ligado a A.6.3 quando o projeto o tem; tratar risco como "Mitigar" não cria mais evidência sem arquivo.
- Central de Evidências: escolher o controle de cada evidência e ver a avaliação.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/evidencia-controle.test.js test/evidencia-avaliar.test.js test/ui.test.js test/soa-sem-gerar.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Verificação final da fatia P4**

Run (na raiz):
```
npx tsc --noEmit
npx vitest run
cd frontend && npx vitest run --pool=threads && npm run build
```
Expected: tudo verde; `git grep -n "checklists'" -- src test` vazio; `git grep -n "'conforming'" -- src/routes/projects.ts src/routes/policies.ts` vazio (nenhum caminho de documento grava conforme). Cole a saída no PR.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/compliance.js frontend/src/ui.js frontend/test/evidencia-controle.test.js CHANGELOG.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(evidencia): Central de Evidências escolhe o controle e mostra a avaliação

O PUT /evidence/:id existia sem tela, e a coluna de avaliação lia um
campo inexistente. Também importa API_BASE, que o upload e o download
de evidência usavam sem importar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
