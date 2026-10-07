# Fatia 0 — chão firme: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** corrigir os defeitos que o levantamento do n.privacy achou no n.iso e fazer um projeto novo nascer com o catálogo de controles, antes de qualquer trabalho no núcleo.

**Arquitetura:** só correções e uma carga de catálogo. Nenhuma tabela nova. Uma migration que só registra colunas que produção já tem. Cada tarefa é um PR pequeno ou um commit isolado no mesmo PR.

**Stack:** Cloudflare Workers + Hono + D1; testes de backend com `@cloudflare/vitest-pool-workers` (D1 real); frontend Vanilla JS com testes em jsdom.

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seções 3.4 e 9 (fatia 0).

## Restrições globais

- **Ponytail em todas as tarefas.** Reuse o que já existe (`setParcial`, `refForaDoProjeto`, `requireResourceAccess`, `logAudit`, o seed da 27701) e escreva o menor diff que resolve.
- **Texto em português.** Comentário, mensagem de erro e texto de UI.
- **Sem handler inline e sem `<script>` inline no frontend.** O CSP tem `script-src 'self'`; evento é por `data-action`.
- **`any`.** O `test/any-catraca.test.ts` reprova se o número subir. Tipe o que tocar.
- **Schema muda em dois lugares:** `schema.sql` e migration. Leia `migrations/README.md` antes da Tarefa 7.
- **Rota `DELETE` nova** precisa ser classificada em `src/trilha-exclusao.ts`; `test/trilha-exclusao.test.ts` reprova se não estiver.
- **ISO 27701 vale na edição 2025** (decisão do dono, 06/10). O catálogo que fica é `src/data/iso27701-2025.ts`.
- **Escrita em produção só com "sim" explícito do dono.** As migrations remotas e o registro em `d1_migrations` são do dono.
- **Identidade git:** e-mail `44273656+resper1965@users.noreply.github.com`.

## Pontos de revisão

Condições que nenhum teste de tarefa cobre sozinho e que mais podem pegar quem usa:

1. **Projetos antigos com três formatos de id de controle** (`ctrl-a51`, `A.5.1`, `ctrl_b_a51`), conferido em produção em 06/10. Toda busca de controle por código precisa achar os três e o formato novo. A Tarefa 4 cobre os quatro.
2. **Semear duas vezes não duplica**, nem num projeto que já tem os 93 com id antigo. Coberto na Tarefa 5.
3. **Excluir DPIA aprovado apagaria a prova da aprovação.** A rota recusa com 409. Coberto na Tarefa 1.
4. **PUT de ativo sem um campo não pode apagar esse campo.** Hoje apaga (`type`, `category` e `owner` viram NULL). Coberto na Tarefa 2.
5. **O agente MCP excluindo DPIA** passa pela confirmação de ação destrutiva, que já cobre todo `DELETE` (`src/middleware/agente.ts:91`). Nenhum código novo; o teste da Tarefa 1 não precisa repetir isso.

---

## Arquivos tocados

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `src/routes/platform.ts` | 1, 2 | DELETE de DPIA; PUT parcial de ativo |
| `src/trilha-exclusao.ts` | 1 | classificar `/api/v1/dpia/:id` |
| `src/routes/project-assets.ts` | 2 | INSERT grava todos os campos do schema |
| `src/routes/integrations.ts` | 2 | CSV sem ativos removidos |
| `frontend/src/views/grc.js` | 2 | modal de risco lê `{ok, assets}` |
| `src/routes/vendors.ts` | 3 | trilha com projeto no create e no PUT |
| `src/helpers.ts` | 4 | `idDoControle(db, projectId, ref)` |
| `src/routes/policies.ts` | 4 | as 6 buscas de controle passam pelo helper |
| `src/data/iso27001-2022.ts` (novo) | 5 | os 93 códigos com título de trabalho |
| `src/routes/projects.ts` | 5 | `seed-27001-2022`, com o seed da 27701 numa função comum |
| `frontend/src/views/compliance.js` | 5 | estado vazio com "Carregar catálogo"; lista mostra o código |
| `src/services/soa-logic.ts` | 6 | remover o motor morto (`SoALogicEngine`, `OLD_RULES`, `PIMS_RULES`) |
| `migrations/0044_aprovacao_ip_ua.sql` (novo) | 7 | as 12 colunas `*_approved_ip/ua` para banco novo |
| `migrations/README.md`, `CHANGELOG.md` | 7, 8 | registro |

---

### Tarefa 1: excluir DPIA pela tela deixa de dar 404

A tela chama `DELETE /api/v1/dpia/:id` (`frontend/src/views/privacy.js:475`) e a rota não existe. Ela passa a existir, mas recusa DPIA aprovado: a aprovação é prova, e quem quer apagar precisa revogar antes (com motivo, que fica na trilha).

**Arquivos:**
- Modificar: `src/routes/platform.ts` (depois do `platformApp.put('/dpia/:id', ...)`)
- Modificar: `src/trilha-exclusao.ts` (`TABELA_DO_RECURSO`)
- Criar: `test/dpia-excluir.test.ts`

**Interfaces:**
- Consome: `requireResourceAccess`, `logAudit`, `erro500` (já importados em `platform.ts`).
- Produz: `DELETE /api/v1/dpia/:id` → 200 `{ok:true}` | 409 se `status='Approved'` | 403 sem acesso.

- [ ] **Passo 1: teste que falha**

```ts
// test/dpia-excluir.test.ts
// A tela de DPIA chamava DELETE /api/v1/dpia/:id, que não existia (404 em silêncio).
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('DELETE /api/v1/dpia/:id', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p1','C','Active')`).run();
  });
  const del = (id: string) => app.fetch(new Request(`http://localhost/api/v1/dpia/${id}`, { method: 'DELETE', headers }), env as any);

  it('apaga DPIA em rascunho e grava a trilha com o projeto', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d1','p1','Sistema','Draft')`).run();
    const res = await del('d1');
    expect(res.status).toBe(200);
    expect(await env.DB.prepare(`SELECT id FROM dpia_assessments WHERE id='d1'`).first()).toBeNull();
    const log = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action='registro.excluido' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(log?.project_id).toBe('p1');
  });

  it('recusa DPIA aprovado com 409 e não apaga', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d2','p1','Sistema','Approved')`).run();
    const res = await del('d2');
    expect(res.status).toBe(409);
    expect(await env.DB.prepare(`SELECT id FROM dpia_assessments WHERE id='d2'`).first()).not.toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run test/dpia-excluir.test.ts`
Esperado: FAIL, status 404 em vez de 200 e de 409.

- [ ] **Passo 3: implementar**

Em `src/routes/platform.ts`, logo depois do handler `platformApp.put('/dpia/:id', ...)`:

```ts
// A tela de DPIA tinha o botão Excluir chamando esta rota, que não existia. DPIA aprovado
// não sai por aqui: a aprovação é prova; quem quer apagar revoga antes (motivo na trilha).
platformApp.delete('/dpia/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'dpia_assessments', id, c.get('user'));
    const atual = await c.env.DB.prepare('SELECT status FROM dpia_assessments WHERE id = ?').bind(id).first<{ status: string | null }>();
    if (!atual) return c.json({ error: 'DPIA não encontrado' }, 404);
    if (atual.status === 'Approved') {
      return c.json({ error: 'DPIA aprovado não pode ser excluído. Revogue a aprovação antes (motivo obrigatório).' }, 409);
    }
    await c.env.DB.prepare("DELETE FROM dpia_assessments WHERE id = ? AND status != 'Approved'").bind(id).run();
    await logAudit(c.env.DB, 'dpia_deleted', c.get('user')?.email || 'system', `DPIA ${id} excluído`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao excluir DPIA', e);
  }
});
```

Em `src/trilha-exclusao.ts`, em `TABELA_DO_RECURSO`, em ordem alfabética:

```ts
  capa: 'corrective_actions',
  certification: 'certification_tracking',
  dpia: 'dpia_assessments',
  evidence: 'evidence',
```

Confira se `dpia_assessments` está em `ALLOWED_TABLES` (`src/helpers.ts`). O PUT já usa `requireResourceAccess` com essa tabela, então deve estar.

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run test/dpia-excluir.test.ts test/trilha-exclusao.test.ts`
Esperado: PASS nos dois.

- [ ] **Passo 5: OpenAPI e commit**

Run: `npm run openapi`. Se `src/openapi.ts` lista as rotas à mão (`grep -n "dpia/:id" src/openapi.ts`), acrescente `{ metodo: 'DELETE', caminho: '/api/v1/dpia/:id' }` no mesmo formato da linha do PUT, antes de rodar.

```bash
git add src/routes/platform.ts src/trilha-exclusao.ts test/dpia-excluir.test.ts src/openapi.ts openapi.json
git commit -m "fix(dpia): rota de exclusão que a tela já chamava; DPIA aprovado recusa (409)"
```

---

### Tarefa 2: ativos gravam o que recebem e aparecem no modal de risco

Quatro defeitos na mesma entidade:
- O INSERT perde `location`, `classification` e as notas CID.
- O PUT de plataforma reescreve tudo e zera o campo ausente.
- O CSV exporta os removidos.
- O modal de risco espera um array e recebe `{ok, assets}`.

**Arquivos:**
- Modificar: `src/routes/project-assets.ts:44-47` (INSERT)
- Modificar: `src/routes/platform.ts:36-38` (PUT `/assets/:id`)
- Modificar: `src/routes/integrations.ts:387` (CSV)
- Modificar: `frontend/src/views/grc.js:267-270` (modal)
- Criar: `test/ativos-campos.test.ts`
- Criar: `frontend/test/risco-modal-ativos.test.js`

**Interfaces:**
- Consome: `setParcial(corpo, colunas)` de `src/helpers.ts:343`. Campo ausente preserva; `null` ou `''` grava o default da coluna.
- Produz: nada novo.

- [ ] **Passo 1: teste de backend que falha**

```ts
// test/ativos-campos.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('ativos: campos gravados, PUT parcial, CSV', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p1','C','Active')`).run();
  });
  const req = (m: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method: m, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('POST grava location, classification e notas CID', async () => {
    const res = await req('POST', '/api/v1/projects/p1/assets', {
      name: 'ERP', type: 'Software', location: 'AWS sa-east-1', classification: 'Restricted',
      confidentiality_rating: 3, integrity_rating: 2, availability_rating: 1,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as any;
    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first<any>();
    expect(row.location).toBe('AWS sa-east-1');
    expect(row.classification).toBe('Restricted');
    expect([row.confidentiality_rating, row.integrity_rating, row.availability_rating]).toEqual([3, 2, 1]);
  });

  it('PUT sem um campo não apaga esse campo', async () => {
    await env.DB.prepare(`INSERT INTO assets (id, project_id, name, type, owner, location) VALUES ('a1','p1','ERP','Software','TI','AWS')`).run();
    const res = await req('PUT', '/api/v1/assets/a1', { name: 'ERP novo' });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT name, type, owner, location FROM assets WHERE id='a1'`).first<any>();
    expect(row).toEqual({ name: 'ERP novo', type: 'Software', owner: 'TI', location: 'AWS' });
  });

  it('CSV não exporta ativo removido', async () => {
    await env.DB.prepare(`INSERT INTO assets (id, project_id, name, status) VALUES ('a1','p1','Vivo','Active'), ('a2','p1','Morto','Removido')`).run();
    const csv = await (await req('GET', '/api/v1/projects/p1/export/assets')).text();
    expect(csv).toContain('Vivo');
    expect(csv).not.toContain('Morto');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run test/ativos-campos.test.ts`
Esperado: 3 FAIL. `location` é null; `type` e `owner` viram null; o CSV contém "Morto".

- [ ] **Passo 3: implementar o backend**

`src/routes/project-assets.ts`, troque o INSERT:

```ts
      await c.env.DB.prepare(
        `INSERT INTO assets (id, project_id, name, type, category, owner, criticality, description,
           location, classification, confidentiality_rating, integrity_rating, availability_rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        id, projectId, body.name, body.type, body.category || 'Hardware', body.owner || '', body.criticality || 'Medium', body.description || '',
        body.location ?? null, body.classification || 'Confidential',
        body.confidentiality_rating ?? null, body.integrity_rating ?? null, body.availability_rating ?? null,
      ).run();
```

`src/routes/platform.ts`, no PUT `/assets/:id`, troque o `UPDATE` de colunas fixas por:

```ts
    // Parcial: campo ausente preserva (antes o UPDATE fixo gravava NULL em type/category/owner
    // e ignorava location, classification e as notas CID).
    const p = setParcial(body, {
      name: null, type: null, category: 'Hardware', owner: '', criticality: 'Medium', description: '',
      location: null, classification: 'Confidential',
      confidentiality_rating: null, integrity_rating: null, availability_rating: null,
    });
    if (p.sql) await c.env.DB.prepare(`UPDATE assets SET ${p.sql}, updated_at = datetime('now') WHERE id = ?`).bind(...p.binds, id).run();
```

`setParcial` já é importado em `platform.ts` (o PUT de DPIA usa). Confirme no topo do arquivo.

`src/routes/integrations.ts:387`:

```ts
  const result = await c.env.DB.prepare("SELECT * FROM assets WHERE project_id = ? AND status != 'Removido'").bind(projectId).all();
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run test/ativos-campos.test.ts test/api.test.ts test/idor-tenant.test.ts`
Esperado: PASS. `api.test.ts` e `idor-tenant` são os que mais usam `assets` hoje. Se algum esperava o PUT zerar campo, o teste é que estava errado: ajuste para "preserva", como foi feito com `validacao-corpo` no T1.

- [ ] **Passo 5: teste de frontend que falha**

```js
// frontend/test/risco-modal-ativos.test.js
// GET /projects/:id/assets devolve {ok, assets}; o modal esperava array e zerava a lista.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/grc.js';

describe('modal de novo risco', () => {
  it('lista os ativos do inventário', async () => {
    apiMock.mockImplementation((m, url) => Promise.resolve(
      url.endsWith('/assets') ? { ok: true, assets: [{ id: 'a1', name: 'ERP', category: 'Software' }] } : []
    ));
    document.body.innerHTML = '<div id="modal-root"></div>';
    await window.openNewRiskModal('p1');
    const opcoes = [...document.querySelectorAll('#risk-asset-select option')].map(o => o.value);
    expect(opcoes).toContain('a1');
  });
});
```

`openModal` vem de `ui.js`. Se ele precisa de um contêiner com outro id, veja `frontend/test/revogar-aprovacoes.test.js`, que abre modal, e use o mesmo preparo de DOM.

- [ ] **Passo 6: rodar e ver falhar**

Run: `cd frontend && npx vitest run test/risco-modal-ativos.test.js`
Esperado: FAIL, a lista não contém `a1`.

- [ ] **Passo 7: implementar o frontend**

`frontend/src/views/grc.js`, no `openNewRiskModal`:

```js
        try { 
            const r = await api('GET', `/api/v1/projects/${projectId}/assets`);
            assets = Array.isArray(r) ? r : (r?.assets || []);
            controls = await api('GET', `/api/v1/projects/${projectId}/controls`);
        } catch(e) {}
        if (!Array.isArray(controls)) controls = [];
```

(Sai a linha `if (!Array.isArray(assets)) assets = [];`.)

- [ ] **Passo 8: rodar e ver passar; commit**

Run: `cd frontend && npx vitest run test/risco-modal-ativos.test.js`
Esperado: PASS.

```bash
git add src/routes/project-assets.ts src/routes/platform.ts src/routes/integrations.ts frontend/src/views/grc.js test/ativos-campos.test.ts frontend/test/risco-modal-ativos.test.js
git commit -m "fix(ativos): grava todos os campos, PUT parcial, CSV sem removidos e modal de risco com a lista"
```

---

### Tarefa 3: fornecedor na trilha com o projeto

`vendor.created` vai para a trilha sem `project_id`, e o PUT não grava trilha. O DELETE já é coberto pela trilha central (`src/trilha-exclusao.ts`).

**Arquivos:**
- Modificar: `src/routes/vendors.ts` (PUT `/:id` e o `logAudit` do POST, linha ~100)
- Criar: `test/fornecedor-trilha.test.ts`

**Interfaces:**
- Consome: `logAudit(db, action, actor, details, justification = '', ip = '', projectId?)`, a mesma assinatura usada em `project-assets.ts:49`.

- [ ] **Passo 1: teste que falha**

```ts
// test/fornecedor-trilha.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

describe('fornecedor na trilha', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p1','C','Active')`).run();
  });
  const req = (m: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method: m, headers, body: body ? JSON.stringify(body) : undefined }), env as any);
  const ultima = (acao: string) =>
    env.DB.prepare('SELECT project_id FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1').bind(acao).first<{ project_id: string | null }>();

  it('criar e editar gravam trilha com o projeto', async () => {
    const res = await req('POST', '/api/v1/projects/p1/vendors', { name: 'Nuvem SA' });
    const { id } = (await res.json()) as any;
    expect((await ultima('vendor.created'))?.project_id).toBe('p1');
    await req('PUT', `/api/v1/vendors/${id}`, { name: 'Nuvem SA', dpa_signed: 1 });
    expect((await ultima('vendor.updated'))?.project_id).toBe('p1');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run test/fornecedor-trilha.test.ts`
Esperado: FAIL, `project_id` null em `vendor.created` e nenhuma linha `vendor.updated`.

- [ ] **Passo 3: implementar**

No POST, acrescente os três argumentos finais:

```ts
    await logAudit(c.env.DB, 'vendor.created', c.get('user')?.email ?? 'system', `Vendor ${body.name} created for project ${projectId}`, '', '', projectId);
```

No PUT, antes do `return c.json({ ok: true, ... })`:

```ts
    const proj = await c.env.DB.prepare('SELECT project_id FROM vendors WHERE id = ?').bind(id).first<{ project_id: string | null }>();
    await logAudit(c.env.DB, 'vendor.updated', c.get('user')?.email ?? 'system', `Vendor ${id} atualizado`, '', '', proj?.project_id ?? undefined);
```

Fora de escopo, anotado: o PUT de fornecedor também é uma reescrita completa (campo ausente vira 0 ou NULL). Fica para a fatia de TPRM, que reescreve a entidade inteira.

- [ ] **Passo 4: rodar e ver passar; commit**

Run: `npx vitest run test/fornecedor-trilha.test.ts`
Esperado: PASS.

```bash
git add src/routes/vendors.ts test/fornecedor-trilha.test.ts
git commit -m "fix(fornecedores): trilha com o projeto no create e registro da edição"
```

---

### Tarefa 4: achar o controle pelo código, em qualquer formato de id

Produção tem três formatos de id para o mesmo controle (`ctrl-a51`, `A.5.1`, `ctrl_b_a51`), e o id é único no banco inteiro. As rotas de política montam `'ctrl-' + código` e caem no formato errado: no projeto com `ctrl_b_a51`, gerar, versionar e restaurar política já não acham o controle hoje. Um projeto semeado na Tarefa 5 também não poderia reusar `ctrl-a51`. O código estável é o primeiro token do título (`"A.5.1 Políticas..."`, `"A.1.2.2 — ..."`), como o seed da 27701 já assume (`projects.ts:899`).

**Arquivos:**
- Modificar: `src/helpers.ts` (função nova perto de `refForaDoProjeto`)
- Modificar: `src/routes/policies.ts` (as 6 ocorrências de `const normId = 'ctrl-' + ...`: linhas ~54, ~342, ~390, ~403, ~419, ~470)
- Criar: `test/controle-por-codigo.test.ts`

**Interfaces:**
- Produz: `idDoControle(db: D1Database, projectId: string, ref: string): Promise<string | null>`. A Tarefa 5 não usa, mas depende dela para os projetos semeados funcionarem.

- [ ] **Passo 1: teste que falha**

```ts
// test/controle-por-codigo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { idDoControle } from '../src/helpers';

describe('idDoControle', () => {
  beforeEach(async () => {
    await applySchema(); await resetData();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p1','C','Active'), ('p2','C','Active'), ('p3','C','Active'), ('p4','C','Active')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES
      ('ctrl-a51','p1','ISO 27001:2022','A.5.1 Políticas'),
      ('A.5.1','p2','ISO 27001:2022','A.5.1 Políticas'),
      ('ctrl_b_a51','p3','ISO 27001:2022','A.5.1 Políticas'),
      ('x9f2k1','p4','ISO 27001:2022','A.5.1 — Políticas'),
      ('y7','p4','ISO 27001:2022','A.5.10 — Uso aceitável')`).run();
  });

  it('acha o controle pelos quatro formatos de id', async () => {
    expect(await idDoControle(env.DB, 'p1', 'A.5.1')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p2', 'A.5.1')).toBe('A.5.1');
    expect(await idDoControle(env.DB, 'p3', 'A.5.1')).toBe('ctrl_b_a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.1')).toBe('x9f2k1');
  });
  it('aceita o próprio id e não confunde A.5.1 com A.5.10', async () => {
    expect(await idDoControle(env.DB, 'p1', 'ctrl-a51')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.10')).toBe('y7');
  });
  it('não atravessa projeto', async () => {
    expect(await idDoControle(env.DB, 'p4', 'ctrl-a51')).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run test/controle-por-codigo.test.ts`
Esperado: FAIL, `idDoControle` não é exportado.

- [ ] **Passo 3: implementar o helper**

Em `src/helpers.ts`:

```ts
/**
 * Acha o controle do projeto pelo que o cliente mandou: o id da linha ou o código ("A.5.1").
 * Os ids variam por projeto ('ctrl-a51', 'A.5.1', 'ctrl_b_a51', genId) e são únicos no banco
 * inteiro, então o código, que vive como primeiro token do título, é o único identificador
 * estável. Sempre preso ao projeto.
 */
export async function idDoControle(db: D1Database, projectId: string, ref: string): Promise<string | null> {
  const norm = 'ctrl-' + ref.toLowerCase().replace(/[^a-z0-9]/g, '');
  const row = await db.prepare(
    `SELECT id FROM compliance_controls
      WHERE project_id = ?1 AND (id = ?2 OR id = ?3 OR title = ?2 OR title LIKE ?2 || ' %')
      ORDER BY (id = ?2) DESC, (id = ?3) DESC LIMIT 1`
  ).bind(projectId, ref, norm).first<{ id: string }>();
  return row?.id ?? null;
}
```

`LIKE 'A.5.1 %'` não casa `A.5.10 ...`, porque exige o espaço logo depois do código. `.` não é curinga no LIKE; `_` e `%` são, e nenhum código os tem.

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run test/controle-por-codigo.test.ts`
Esperado: PASS.

- [ ] **Passo 5: as rotas de política usam o helper**

Em cada uma das 6 ocorrências de `policies.ts`, troque a montagem do `normId` e o `(id = ? OR id = ?)` / `(control_id = ? OR control_id = ?)` pelo id resolvido:

```ts
  const controlId = await idDoControle(c.env.DB, projectId, controlIdRaw);
  if (!controlId) return c.json({ error: 'Controle não encontrado' }, 404);
```

e nas consultas `... WHERE id = ? AND project_id = ?` com `.bind(..., controlId, projectId)`; em `policy_versions`, `control_id = ?` com `controlId`. Nas versões antigas gravadas com o código cru (`control_id = 'A.5.1'`), mantenha a leitura dupla só nas consultas de `policy_versions`: `(control_id = ? OR control_id = ?)` com `controlId, controlIdRaw`.

Nos dois fluxos de geração (linhas ~54 e ~342), onde a variável do código se chama `controlId`, use `const idLinha = await idDoControle(...)` e, se for nulo, pule o controle (lote) ou devolva 404 (unitário). Isso evita gravar versão órfã. `conferirPedidosDoDocumento(c, 'politica', idLinha, projectId)` recebe o id resolvido.

O endpoint de edição manual (~470) já resolve `control.id` canônico: troque só a busca pelo helper.

- [ ] **Passo 6: rodar a suíte de políticas**

Run: `npx vitest run test/controle-por-codigo.test.ts $(ls test/*polic*.test.ts test/*versao*.test.ts 2>/dev/null)`
Esperado: PASS. Se um teste usava o id `ctrl-...` direto, ele continua passando, porque o helper aceita o próprio id.

- [ ] **Passo 7: commit**

```bash
git add src/helpers.ts src/routes/policies.ts test/controle-por-codigo.test.ts
git commit -m "fix(politicas): acha o controle pelo código em qualquer formato de id, preso ao projeto"
```

---

### Tarefa 5: carregar o catálogo num projeto novo

Hoje nada cria os 93 controles do Anexo A da ISO 27001:2022. Os projetos de produção os têm por scripts avulsos, e a tela diz "Os controles serão populados pelo backend", o que não acontece. O seed da 27701:2025 existe (`POST /:id/seed-27701-2025`), mas não tem botão.

**Arquivos:**
- Criar: `src/data/iso27001-2022.ts`
- Modificar: `src/routes/projects.ts` (extrair `semearControles` do handler `seed-27701-2025`; rota nova `seed-27001-2022`)
- Modificar: `frontend/src/views/compliance.js` (estado vazio; coluna do código)
- Criar: `test/seed-27001.test.ts`
- Criar: `frontend/test/controles-vazio.test.js`

**Interfaces:**
- Consome: `ISO_27701_2025_STANDARD`, `controlsForRole` (já usados no handler da 27701).
- Produz:
  - `ISO_27001_2022: readonly { code: string; title: string }[]` (93 itens) e `ISO_27001_2022_STANDARD = 'ISO 27001:2022'`;
  - `semearControles(c, projectId, standard, lista) → Promise<{ created: number; total: number }>`;
  - `POST /api/v1/projects/:id/seed-27001-2022` → `{ ok, standard, seeded, catalog_total }`.

- [ ] **Passo 1: gerar o arquivo do catálogo a partir do mapa que a tela já usa**

Os títulos são os mesmos que o produto já mostra (`CONTROL_TITLES_PT`, `frontend/src/views/compliance.js:288`); nada de texto novo entra. Gere com:

```bash
node -e "
const s=require('fs').readFileSync('frontend/src/views/compliance.js','utf8');
const bloco=s.slice(s.indexOf('const CONTROL_TITLES_PT = {'), s.indexOf('};', s.indexOf('const CONTROL_TITLES_PT = {')));
const itens=[...bloco.matchAll(/'(A\.[5-8]\.\d+)':\s*'([^']+)'/g)].map(m=>({code:m[1],title:m[2]}));
if(itens.length!==93) throw new Error('esperado 93, veio '+itens.length);
const linhas=itens.map(i=>\`  { code: '\${i.code}', title: '\${i.title.replace(/'/g,\"\\\\'\")}' },\`).join('\n');
require('fs').writeFileSync('src/data/iso27001-2022.ts',
\`// Anexo A da ISO/IEC 27001:2022: os 93 códigos, com o título de trabalho que a tela já mostra
// (frontend/src/views/compliance.js, CONTROL_TITLES_PT). Rótulo, não texto normativo: o texto
// oficial está na norma adquirida. Fonte única do seed (POST /projects/:id/seed-27001-2022).
export const ISO_27001_2022_STANDARD = 'ISO 27001:2022';

export const ISO_27001_2022: readonly { code: string; title: string }[] = [
\${linhas}
];
\`);
console.log('ok', itens.length);"
```

Esperado: `ok 93`. Confira com `git diff --stat`: um arquivo novo com cerca de 100 linhas.

Para o dono: os títulos são rótulos curtos que o produto já exibe hoje. Se o jurídico pedir paráfrase própria, como o catálogo da 27701 já tem, troca-se só este arquivo.

- [ ] **Passo 2: teste que falha**

```ts
// test/seed-27001.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';
import { idDoControle } from '../src/helpers';

describe('Seed 27001:2022 (Anexo A)', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
  });
  const seed = (p: string) => app.fetch(new Request(`http://localhost/api/v1/projects/${p}/seed-27001-2022`, { method: 'POST', headers }), env as any);
  const conta = async (p: string) => (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'").bind(p).first<{ n: number }>())!.n;

  it('semeia os 93, e a política acha o controle pelo código', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p1','C','Active')`).run();
    const res = await seed('p1');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).seeded).toBe(93);
    expect(await conta('p1')).toBe(93);
    expect(await idDoControle(env.DB, 'p1', 'A.8.34')).not.toBeNull();
  });

  it('idempotente, inclusive sobre projeto antigo com ids ctrl-a51', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p2','C','Active')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-a51','p2','ISO 27001:2022','A.5.1 Políticas')`).run();
    const b = (await (await seed('p2')).json()) as any;
    expect(b.seeded).toBe(92);
    expect(((await (await seed('p2')).json()) as any).seeded).toBe(0);
    expect(await conta('p2')).toBe(93);
  });

  it('dois projetos semeados não colidem no id', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, status) VALUES ('p3','C','Active'), ('p4','C','Active')`).run();
    await seed('p3'); await seed('p4');
    expect(await conta('p3')).toBe(93);
    expect(await conta('p4')).toBe(93);
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `npx vitest run test/seed-27001.test.ts`
Esperado: FAIL, 404 na rota.

- [ ] **Passo 4: implementar**

Em `src/routes/projects.ts`, acima do handler `seed-27701-2025`, extraia o laço que já existe:

```ts
// Cria, como 'Missing', os controles da lista que o projeto ainda não tem. Idempotente: o código
// vive como primeiro token do título ("A.5.1 — ..."), e o que já existe é pulado em qualquer
// formato de id (ctrl-a51, A.5.1, genId).
async function semearControles(
  db: D1Database, projectId: string, standard: string, lista: readonly { code: string; title: string }[],
): Promise<{ created: number; total: number }> {
  const { results: existing } = await db.prepare(
    'SELECT title FROM compliance_controls WHERE project_id = ? AND standard = ?'
  ).bind(projectId, standard).all<{ title: string }>();
  const existentes = new Set((existing || []).map((r) => (r.title || '').split(' ')[0]));
  const novos = lista.filter((ctrl) => !existentes.has(ctrl.code));
  if (novos.length) {
    await db.batch(novos.map((ctrl) => db.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, maturity, updated_at)
       VALUES (?, ?, ?, ?, '', 'Missing', 0, datetime('now'))`
    ).bind(genId(), projectId, standard, `${ctrl.code} — ${ctrl.title}`)));
  }
  return { created: novos.length, total: lista.length };
}
```

No handler `seed-27701-2025`, troque o bloco "Idempotência" e o `for` por:

```ts
    const { created } = await semearControles(c.env.DB, projectId, ISO_27701_2025_STANDARD, wanted);
```

O resto do handler (rótulo, `logAudit`, resposta) fica igual. Rode `npx vitest run test/seed-27701.test.ts`: deve continuar PASS.

Rota nova, logo abaixo:

```ts
projectsApp.post('/:id/seed-27001-2022', async (c) => {
  try {
    const projectId = c.req.param('id');
    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);
    const { created, total } = await semearControles(c.env.DB, projectId, ISO_27001_2022_STANDARD, ISO_27001_2022);
    await logAudit(
      c.env.DB, 'seed.27001.2022', c.get('user')?.email ?? 'system',
      `Seed 27001:2022: ${created} controles criados, ${total - created} já existiam, projeto ${projectId}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId,
    );
    return c.json({ ok: true, standard: ISO_27001_2022_STANDARD, seeded: created, catalog_total: total });
  } catch (e: any) {
    return erro500(c, 'Falha ao semear controles 27001:2022', e);
  }
});
```

Import no topo: `import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../data/iso27001-2022';`.

A rota fica sob `/api/v1/projects/:id/*`, então o `projectAccessMiddleware` já isola o tenant, e o write-guard do `authMiddleware` já barra papel só-leitura. Confira se `seed-27701-2025` está em alguma lista de permissão de `src/middleware/auth.ts` (`grep -n "seed-27701" src/middleware/*.ts`). Se estiver, a 27001 entra na mesma lista.

- [ ] **Passo 5: rodar e ver passar**

Run: `npx vitest run test/seed-27001.test.ts test/seed-27701.test.ts`
Esperado: PASS nos dois.

- [ ] **Passo 6: teste de frontend que falha**

```js
// frontend/test/controles-vazio.test.js
// A tela vazia dizia "serão populados pelo backend", o que nunca acontecia.
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';
import { S } from '../src/state.js';

const tela = () => ({ c: document.createElement('div'), h: document.createElement('div'), a: document.createElement('div') });

describe('lista de controles', () => {
  it('vazia: oferece carregar o catálogo do projeto', () => {
    S.controls = []; S.currentProject = { id: 'p1' };
    const { c, h, a } = tela();
    window.renderControls(c, h, a);
    expect(c.querySelector('[data-action="carregarCatalogo"]')).not.toBeNull();
    expect(c.textContent).not.toContain('populados pelo backend');
  });

  it('mostra o código do título quando o id é gerado', () => {
    S.controls = [{ id: 'x9f2k1', title: 'A.5.1 — Políticas', status: 'Missing' }];
    const { c, h, a } = tela();
    window.renderControls(c, h, a);
    expect(c.querySelector('.phase-num').textContent).toBe('A.5.1');
  });

  it('carregarCatalogo chama os dois seeds e recarrega', async () => {
    apiMock.mockResolvedValue({ ok: true, seeded: 1 });
    window.loadControls = vi.fn().mockResolvedValue();
    await window.carregarCatalogo('p1');
    const urls = apiMock.mock.calls.map(([, u]) => u);
    expect(urls).toContain('/api/v1/projects/p1/seed-27001-2022');
    expect(urls).toContain('/api/v1/projects/p1/seed-27701-2025');
    expect(window.loadControls).toHaveBeenCalled();
  });
});
```

- [ ] **Passo 7: rodar e ver falhar**

Run: `cd frontend && npx vitest run test/controles-vazio.test.js`
Esperado: 3 FAIL.

- [ ] **Passo 8: implementar o frontend**

Em `frontend/src/views/compliance.js`, no `renderControls`:

```js
        if (!S.controls.length) {
            c.innerHTML = S.currentProject
                ? `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Carregue o Anexo A da ISO 27001:2022 e os controles de privacidade da ISO 27701:2025 deste projeto.</p><button class="btn btn-primary" data-action="carregarCatalogo" data-args='["${escapeHTML(S.currentProject.id)}"]'>Carregar catálogo</button></div>`
                : `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Escolha um projeto para carregar o catálogo.</p></div>`;
            return;
        }
```

E na linha do código, troque `${ctrl.id}` por `${escapeHTML(codigoDoControle(ctrl))}`, com a função no mesmo escopo, acima de `renderControls`:

```js
    // O id varia por projeto (ctrl-a51, A.5.1, gerado); o código estável é o primeiro token do título.
    function codigoDoControle(ctrl) {
        const m = (ctrl.title || '').match(/^(A\.\d+(?:\.\d+)*)\b/);
        return m ? m[1] : ctrl.id;
    }
```

E a ação, junto aos outros `window.*` do arquivo:

```js
    window.carregarCatalogo = async function (projectId) {
        try {
            const r1 = await api('POST', `/api/v1/projects/${projectId}/seed-27001-2022`);
            const r2 = await api('POST', `/api/v1/projects/${projectId}/seed-27701-2025`);
            await loadControls();
            showToast(`Catálogo carregado: ${(r1?.seeded || 0) + (r2?.seeded || 0)} controles novos.`, 'success');
            navigate('controls');
        } catch (e) {
            showToast('Falha ao carregar o catálogo: ' + (e.message || e), 'error');
        }
    };
```

Antes, confira o nome da rota da tela de controles no router (`grep -n "renderControls" frontend/src/router.js`) e use esse nome no `navigate`. `loadControls` é global (`frontend/src/globals.js:1119`); chame como `window.loadControls()` se o lint reclamar.

- [ ] **Passo 9: rodar e ver passar; commit**

Run: `cd frontend && npx vitest run test/controles-vazio.test.js`
Esperado: PASS.

```bash
git add src/data/iso27001-2022.ts src/routes/projects.ts frontend/src/views/compliance.js test/seed-27001.test.ts frontend/test/controles-vazio.test.js
git commit -m "feat(controles): carregar o catálogo (27001:2022 e 27701:2025) num projeto novo"
```

---

### Tarefa 6: um catálogo 27701 só — remover o motor de SoA morto

`SoALogicEngine.generateDraftSoA` não é chamado por nenhum caminho de `src/`, só por testes. Ele carrega `OLD_RULES` (93) e `PIMS_RULES` (78 regras 27701 com numeração A.1.1–A.3.43, que não é a da edição 2025). É o segundo catálogo divergente. Fica `src/data/iso27701-2025.ts`, decisão do dono.

**Arquivos:**
- Modificar: `src/services/soa-logic.ts` (remover das linhas ~86 a ~342: `DiscoveryAnswers`, `SoADecision`, os predicados, `OLD_RULES`, `PIMS_RULES`, `RULES`, `SoALogicEngine`; manter `NA_STATUS`, `SoAApplicabilityRecord`, `SoAValidationError`, `hasValidApplicability`, `exclusionsMissingJustification`, `assertSoAExportable`, `recordFromControlRow`)
- Remover: `test/soa-logic.test.ts` (só testa o motor)
- Modificar: `test/soa-applicability-gate.test.ts` (tirar os casos do motor, linhas ~85-105, e o import de `SoALogicEngine`)
- Modificar: `frontend/src/views/compliance.js:574` (o comentário cita o motor)

- [ ] **Passo 1: conferir que nada de produção usa o que sai**

Run: `git grep -nE "SoALogicEngine|generateDraftSoA|DiscoveryAnswers|SoADecision|OLD_RULES|PIMS_RULES" -- src mcp-server-niso/src frontend/src`
Esperado: só `src/services/soa-logic.ts` e o comentário de `compliance.js:574`. Se aparecer outro arquivo, pare e reporte: a premissa da tarefa caiu.

- [ ] **Passo 2: remover**

Apague os blocos listados. Apague `test/soa-logic.test.ts`. Em `test/soa-applicability-gate.test.ts`, apague os `it` que chamam `generateDraftSoA` e o nome do import. No comentário de `compliance.js:574`, troque "geradas pelo SoALogicEngine" por "de exclusão".

- [ ] **Passo 3: rodar**

Run: `npx tsc --noEmit && npx vitest run test/soa-applicability-gate.test.ts test/any-catraca.test.ts`
Esperado: tsc limpo e PASS. Se o `any-catraca` reclamar que o número desceu, baixe o `TETO` lá para o número novo que ele imprime.

- [ ] **Passo 4: commit**

```bash
git add -A src/services/soa-logic.ts test/soa-logic.test.ts test/soa-applicability-gate.test.ts test/any-catraca.test.ts frontend/src/views/compliance.js
git commit -m "refactor(soa): remove o motor de SoA sem uso e o segundo catálogo 27701 (fica o da edição 2025)"
```

---

### Tarefa 7: colunas de IP e user agent das aprovações também em banco novo

`ciso_approved_ip/ua` e `ceo_approved_ip/ua` estão em `schema.sql` para `compliance_controls`, `evidence` e `ropa_records`, mas nenhuma migration as cria. Produção as tem (conferido em `ropa_records` em 06/10). Um banco montado só por migrations (staging refeito, restauração) quebra ao aprovar. Mesmo caso da 0035: migration para banco novo, **só registrada** em produção.

**Arquivos:**
- Criar: `migrations/0044_aprovacao_ip_ua.sql`
- Modificar: `migrations/README.md` (seção da 0044)

- [ ] **Passo 1: conferir produção, só leitura**

```bash
npx wrangler d1 execute niso-db --remote --command "SELECT m.name AS tabela, p.name AS coluna FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.name IN ('compliance_controls','evidence','ropa_records') AND (p.name LIKE '%approved_ip' OR p.name LIKE '%approved_ua');"
```

Esperado: 12 linhas (3 tabelas × 4 colunas). Se faltar alguma, pare: a migration não pode ser só registrada, e o caso volta ao dono.

Repita com `--env staging` (base `niso-db-staging`, conferir o nome em `wrangler.jsonc`). Se o staging não tiver as colunas, ele é o banco onde a migration **roda** de verdade.

- [ ] **Passo 2: a migration**

```sql
-- 0044 — IP e user agent das aprovações CISO/CEO (controles, evidências, ROPA).
-- Produção já tem as 12 colunas (criadas fora de migration). Lá esta migration NÃO roda:
-- só é registrada em d1_migrations (ver migrations/README.md, 0044). Serve a banco novo.
ALTER TABLE compliance_controls ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE compliance_controls ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE compliance_controls ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE compliance_controls ADD COLUMN ceo_approved_ua TEXT;
ALTER TABLE evidence ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE evidence ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE evidence ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE evidence ADD COLUMN ceo_approved_ua TEXT;
ALTER TABLE ropa_records ADD COLUMN ciso_approved_ip TEXT;
ALTER TABLE ropa_records ADD COLUMN ciso_approved_ua TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_ip TEXT;
ALTER TABLE ropa_records ADD COLUMN ceo_approved_ua TEXT;
```

Confira os nomes exatos das colunas em `schema.sql:361-366, 392-397, 566-571` antes de salvar.

- [ ] **Passo 3: README**

Em `migrations/README.md`, depois da seção da 0043, no formato da 0035:

```markdown
## 0044 — IP e user agent das aprovações (fatia 0, 2026-10)

As 12 colunas `*_approved_ip/ua` de `compliance_controls`, `evidence` e `ropa_records` existem
em produção e no `schema.sql`, mas nenhuma migration as criava. A 0044 leva o DDL a banco novo.

**Em produção a 0044 NÃO é executada** (abortaria com "duplicate column"). Só se registra, antes
do merge:

    npx wrangler d1 execute niso-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0044_aprovacao_ip_ua.sql');"
    npx wrangler d1 migrations list niso-db --remote   # esperado: "No migrations to apply"
```

- [ ] **Passo 4: rodar a suíte de schema**

Run: `npx vitest run test/schema-contract.test.ts test/reconcile-prod.test.ts`
Esperado: PASS. Se algum teste monta o banco aplicando as migrations em sequência e já sobe o `schema.sql` antes, a 0044 dá "duplicate column" ali. Nesse caso, siga o que o teste fez para a 0035 (`grep -n "0035" test/*.ts`).

- [ ] **Passo 5: commit**

```bash
git add migrations/0044_aprovacao_ip_ua.sql migrations/README.md
git commit -m "fix(schema): migration das colunas de IP/UA das aprovações para banco novo (só registrada em produção)"
```

**Ação do dono, antes do merge:** rodar o `INSERT OR IGNORE` do README em produção (escrita em produção: só com o seu "sim").

---

### Tarefa 8: fechamento

- [ ] **Passo 1: suíte inteira e tipos**

Run: `npx tsc --noEmit && npx vitest run && cd frontend && npx vitest run --maxWorkers=2 && npm run build`
Esperado: tudo verde. Cole as linhas `Test Files` e `Tests` de cada suíte no PR. "N/N passed" com `Errors` ou exit 1 não é verde: é unhandled rejection. Rode de novo isolado e investigue antes de seguir.

- [ ] **Passo 2: CHANGELOG**

Em `CHANGELOG.md`, sob `## [Não publicado]`:

```markdown
### Corrigido
- Excluir DPIA pela tela (a rota não existia); DPIA aprovado recusa a exclusão.
- Ativos: criação grava localização, classificação e notas CID; edição parcial não apaga campo ausente; CSV sem removidos; modal de risco volta a listar os ativos.
- Fornecedores: trilha com o projeto na criação e registro da edição.
- Políticas acham o controle pelo código em qualquer formato de id, preso ao projeto.
- Banco novo ganha as colunas de IP/UA das aprovações (migration 0044, só registrada em produção).

### Adicionado
- "Carregar catálogo": projeto novo recebe o Anexo A da ISO 27001:2022 e os controles da ISO 27701:2025.

### Removido
- Motor de SoA sem uso e o segundo catálogo 27701 (fica o da edição 2025).
```

- [ ] **Passo 3: spec**

Em `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 3.4, marque cada defeito como corrigido, com o PR.

- [ ] **Passo 4: commit e PR**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md
git commit -m "docs: fatia 0 no CHANGELOG e na spec"
```

PR para `main` com a lista das tarefas e a saída da suíte. **O merge espera:** (1) o dono registrar a 0044 em produção; (2) os checks `test` e `e2e` (o CI novo, ou o procedimento local combinado com o dono).
