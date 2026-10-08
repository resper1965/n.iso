# P2 — Política assinada de verdade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A assinatura de política grava CISO/CEO pela matriz de governança, direto ou por pedido de aprovação (para a direção que só tem conta `org_user`). O modal e o relatório da política acham o controle em qualquer formato de id, e restaurar versão zera as aprovações.

**Architecture:** Uma função só grava a assinatura de política: `assinaturaPolitica` (src/services/pedidos.ts, irmã de `assinaturaDpia`). Quem a usa: `handleControlApprove` (src/routes/controls.ts), com autoridade por `autoridadeDeAssinatura`/`recusaDeAssinatura`, e `registrarDecisao`, quando o pedido é do tipo `politica`. O `status` do controle deixa de ser tocado. Duas rotas GET novas em src/routes/policies.ts (`/controls/:controlId/policy` e `/policy/report`), resolvidas por `idDoControle` e presas ao projeto. O modal de política (frontend/src/views/compliance.js) lê só a rota nova e salva pela rota de edição que já existe. O modal "Pedir aprovação" (frontend/src/views/meus-pedidos.js) passa a servir à política.

**Tech Stack:** Cloudflare Workers + Hono + D1; frontend Vanilla JS; testes Vitest (pool de Workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (P2 na seção 2; decisões da seção 3; critério 3 da seção 5).

## Global Constraints

- **O P1 já está no branch** (HEAD `a5d4326`). O `api()` de `frontend/src/api.js` desembrulha só o envelope `{ ok: true, <uma lista> }`; com qualquer outro campo devolve o objeto inteiro. A rota `GET .../policy` responde `{ ok, control, content, hash, versions }` e chega inteira à tela.
- Testes de frontend do P2 usam o `api()` REAL com o dublê de `fetch` de `frontend/test/servir-api.js`: `servir({ 'MÉTODO /caminho': corpo })` devolve 200 com o corpo, e o que não estiver mapeado devolve 404. Para outro status, use `resposta(corpo, status)` num `vi.stubGlobal('fetch', ...)`. Não mocke o `api()`. Ao lado de cada corpo dublado vai o arquivo:linha do handler que o devolve.
- Testes de backend: `npx vitest run <arq>` na raiz (pool de Workers, D1 real via `cloudflare:test`; helpers em `test/helpers/d1.ts`). INSERT em `projects` precisa de `standards` e `org_role`.
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads`.
- `test/any-catraca.test.ts` (TETO 557): código novo sem `any`; em catch use `catch (e) { return erro500(c, '...', e); }`. Se a contagem DESCER, baixe o `TETO` para o valor medido no mesmo commit.
- `test/colunas-catraca.test.ts` lê o fonte e confere cada coluna de `INSERT`/`UPDATE` contra o schema. Ele descarta o trecho `${...}`, então **nome de coluna montado por interpolação (`${role}_approved_by`) reprova**. Use um mapa de SETs literais, como `COLUNAS_REVOGACAO` (`src/routes/controls.ts:362-365`).
- `test/pedidos-prova.test.ts` lê o fonte: nada de `UPDATE pedidos`/`UPDATE pedido_destinatarios` novo, nem `DELETE` ou `REPLACE` neles. Este plano não cria nenhum.
- Sem migration: as colunas `ciso_approved_*`/`ceo_approved_*` existem em `compliance_controls` (`schema.sql:359-366`). O CHECK de `pedidos` já aceita `tipo = 'politica'` e `papel_exigido IN ('ciso','ceo','ciente')` (`schema.sql:1158-1161`).
- As rotas novas são GET, sem corpo: ficam fora de `src/openapi.ts`, do allow-list de escrita e de `src/trilha-exclusao.ts`. O agente MCP pode lê-las. Mudar o enum de `pedidoCriarSchema` muda o OpenAPI: rode `npm run openapi` e commite o que ele regenerar.
- **Números de linha são da base `b8c9ff1`.** O P1 removeu 2 linhas de `compliance.js` perto da 1726 e mexeu em `routes/pedidos.ts`. Ancore cada edição pelo TRECHO citado, não pelo número.
- Toda consulta fica presa ao projeto (`idDoControle` e `AND project_id = ?`).
- Frontend: CSP `script-src 'self'`, sem handler inline, eventos por `data-action`, `escapeHTML` em todo dado interpolado. Sem emoji nem ícone, inclusive no relatório HTML.
- Arquivos em UTF-8 sem BOM.
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, com mensagem em português (conventional) terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A suíte de backend completa leva ~20 min: as tarefas rodam testes focados, e a suíte completa roda só na Task 6.

## Decisões para o dono revisar

1. **Assinar política não muda mais `compliance_controls.status`.**
   - **Hoje:** a primeira assinatura grava `status='Approved'` (`src/routes/controls.ts:287-289`). Isso sobrescreve o status da SoA (Missing/Partial/Compliant/N/A, `compliance.js:119-121`), inclusive um N/A justificado.
   - **Passa a ser:** "vigente" são as duas assinaturas. É o que o painel de políticas (`compliance.js:1611-1613`) e o readiness (`src/routes/readiness.ts:47-53`) já leem, e o que a evidência faz.
   - **Padrões vizinhos divergem:** o ROPA grava `Approved` já na primeira assinatura; o DPIA só com as duas.
   - **Custo se errado:** uma linha `CASE`, como no DPIA.
2. **Sem `role` no corpo da aprovação direta, o papel sai do cargo na matriz**, como na evidência (`evidence.ts:259-264`). A tela sempre manda `role`.
3. **Reassinar o mesmo papel sobrescreve o carimbo**, como ROPA e evidência. Cada assinatura fica em `audit_logs`.
4. **Pedido de política é só de aprovação (`ciso`/`ceo`).**
   - `POST /projects/:p/pedidos` com `tipo: 'politica'` e `papel_exigido: 'ciente'` responde 400. A ciência de política continua pelo lote por link (`/pedidos/ciencia`), que já existe.
   - **Custo:** quem tem conta não dá ciência de política por este endpoint.
5. **Criar o pedido não confere a autoridade de cada destinatário.**
   - Como no DPIA: o destinatário sem cargo na matriz recebe o pedido e toma 403 ao aprovar.
   - O modal só oferece pessoas da matriz de Governança.
   - **Custo:** o consultor descobre o erro só quando a pessoa tenta aprovar.
6. **O botão "Revogar aprovação" do controle fica fora.**
   - Para corrigir uma assinatura, edita-se o texto (o que zera as duas) ou usa-se a rota `POST /api/v1/controls/:id/revoke-approval` pela API ou pelo agente.
   - **Custo:** não há tela para desfazer só uma assinatura.
7. **"Imprimir PDF" vira "Imprimir"**, um relatório HTML no padrão de ROPA/DPIA, impresso pelo navegador.
8. **Salvar e restaurar texto já assinado pedem confirmação** na tela.
9. **O prompt "Digite seu nome completo" sai da assinatura direta.** O servidor nunca usou o nome digitado; o carimbo é o nome da matriz.
10. **"Ciência de Políticas" passa a listar também os pedidos de APROVAÇÃO de política**, com a situação de cada destinatário e o motivo da recusa. É onde quem pediu acompanha o pedido.

## Achados conferidos

- **Confirmado:** `handleControlApprove` só grava `status='Approved'`, sem CISO/CEO e sem matriz.
- **Confirmado:** o modal chama `GET .../controls/:c/policy`, que não existe (só o POST). Ele cai no fallback `ctrl-<código>` na lista global `/api/v1/controls`. O mesmo fallback está em `doGeneratePolicy`.
- **Confirmado:** "Imprimir PDF" abre `/policy/report`, que não existe. O P1 deixou as duas chamadas como tolerâncias temporárias em `test/contrato-tela-api.test.ts`.
- **Confirmado:** restaurar versão não zera as aprovações. A edição, a geração e o PUT do controle zeram.
- **Confirmado e pior que o relatado:** salvar edição pelo modal sempre falhava. `evidenceId` só viria da rota GET inexistente.
- **Confirmado:** pedido de aprovação aceitava só `'dpia'` (`src/schemas/domain.ts:654`). O documento `politica` já existia em `DOCUMENTOS` (`src/services/pedidos.ts:88-91`, congelando `title` e `description`), e `registrarDecisao` só sabia assinar DPIA (`pedidos.ts:284-289`).
- **Confirmado:** o painel de pedidos de quem pede filtra só `papel_exigido === 'ciente'` (`meus-pedidos.js:215`). O acompanhamento não mostra o motivo da recusa: o SELECT de `routes/pedidos.ts` não traz `motivo`.
- **Novo:** o selo mostra "Calculando..." para sempre. `policyRes` é declarado dentro do `try`.
- **Novo:** `signPolicy` usa o global `event` e mostra o nome digitado, não o carimbado.
- **Novo:** o painel remonta o código a partir do id e erra fora do padrão `ctrl-aNN`.
- **Não precisa de migration.**

## Review Focus

As cinco entradas mais prováveis de morder o usuário que um teste de caminho feliz não cobre, cada uma com teste na tarefa dona:

1. **Mesma pessoa com duas linhas na matriz (DPO e Diretora) tenta assinar como Direção:** 403 por segregação (Task 1).
2. **Texto da política alterado por fora entre o pedido e a decisão:** 409 e nada assinado. É a guarda do `batch` (Task 5).
3. **Id de controle de outro projeto na URL da política:** 404. O código `A.5.1` resolve o controle do próprio projeto (Task 2).
4. **Título ou texto com `<script>` no relatório HTML:** sai escapado (Task 2).
5. **Controle inexistente no projeto abre o modal:** mostra o erro e não cai na lista global nem no formulário de geração (Task 4).

---

### Task 1: Assinatura de política pela matriz de governança

**Files:**
- Modify: `src/services/pedidos.ts` (nova `assinaturaPolitica`, logo depois de `assinaturaDpia`)
- Modify: `src/routes/controls.ts` (import e `handleControlApprove`)
- Test: `test/signatures.test.ts` (describe "Aprovação de controle"), `test/api.test.ts` (teste "mas o controle do próprio projeto continua editável e assinável")

**Interfaces:**
- Consumes: `autoridadeDeAssinatura(db, projectId, user): Promise<AutoridadeAssinatura>`, `recusaDeAssinatura(a, papel): string | null`, `type PapelAssinatura = 'ciso' | 'ceo'` (src/helpers.ts); `type GuardaAssinatura` e `intacto(...)`, já existentes em src/services/pedidos.ts.
- Produces:
  - `assinaturaPolitica(db: D1Database, projectId: string, controlId: string, role: PapelAssinatura, carimbo: { por: string; em: string; ip: string | null; ua: string | null }, guarda?: GuardaAssinatura): Promise<D1PreparedStatement | null>`: devolve o UPDATE (para `run()` ou `batch`), ou `null` se o controle não existe no projeto. A Task 5 a usa em `registrarDecisao`.
  - `POST|PUT /api/v1/controls/:id/approve` com corpo `{ password, role? }` responde `{ ok: true, role, approved_by, approved_at }`, grava as quatro colunas do papel e não toca `status`. Senha errada dá 401; falta de autoridade dá 403 com a mensagem de `recusaDeAssinatura`.

- [ ] **Step 1: Write the failing tests**

Em `test/signatures.test.ts`, substitua o teste `'aprova com a senha correta e grava o status no banco'` por estes, dentro do mesmo `describe('Aprovação de controle')`. Eles usam o fixture do arquivo: Ana é consultora com cargo "DPO / Líder do SGSI"; `headersDirecao` é o `org_admin` com cargo "Diretora Executiva".

```ts
    it('o Líder SGSI designado assina como ciso: grava quem, quando, IP e UA, e não muda o status', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123', project_id: 'proj-1' });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(200);
      expect(data).toMatchObject({ ok: true, role: 'ciso', approved_by: 'Ana Souza' });

      const ctrl = await env.DB.prepare(
        "SELECT status, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'"
      ).first<any>();
      expect(ctrl.ciso_approved_by).toBe('Ana Souza');
      expect(ctrl.ciso_approved_at).toBe(data.approved_at);
      expect(ctrl.ciso_approved_ip).toBeTruthy();
      expect(ctrl.ciso_approved_ua).toBeTruthy();
      expect(ctrl.ceo_approved_by).toBeNull();
      // O status é o da SoA (Missing/Partial/Compliant/N/A): assinar a política não o reescreve.
      expect(ctrl.status).toBe('Missing');

      const log = await env.DB.prepare(
        "SELECT actor, details, project_id FROM audit_logs WHERE action = 'control.approved' ORDER BY rowid DESC LIMIT 1"
      ).first<any>();
      expect(log.actor).toBe('ana@exemplo.com.br');
      expect(log.details).toContain('ctrl-a51');
      expect(log.project_id).toBe('proj-1');
    });

    it('as duas assinaturas vêm de duas pessoas designadas', async () => {
      expect((await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' }, headersDirecao);
      expect(r.status, await r.clone().text()).toBe(200);
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by, ceo_approved_at FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBe('Ana Souza');
      expect(ctrl.ceo_approved_by).toBe('Direcao Executiva');
      expect(ctrl.ceo_approved_at).toBeTruthy();
    });

    it('sem role no corpo, o papel sai do cargo na matriz', async () => {
      const r = await post('/api/v1/controls/ctrl-a51/approve', { password: 'password123' }, headersDirecao);
      expect(r.status, await r.clone().text()).toBe(200);
      expect((await r.json() as any).role).toBe('ceo');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ceo_approved_by).toBe('Direcao Executiva');
      expect(ctrl.ciso_approved_by).toBeNull();
    });

    it('o Líder SGSI não assina como Direção', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Segregação de Funções');
      const ctrl = await env.DB.prepare("SELECT ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ceo_approved_by).toBeNull();
    });

    it('duas linhas na matriz (DPO e Diretora) não dão os dois papéis à mesma pessoa', async () => {
      await env.DB.prepare(
        `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
         VALUES ('gov-sgsi-2','proj-1','Ana Souza','ANA@exemplo.com.br ','exec','Diretora de Operações')`
      ).run();
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Segregação de Funções');
    });

    it('a Direção não assina como Líder SGSI', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, headersDirecao);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Líder SGSI');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBeNull();
    });

    it('quem alcança o projeto mas não está na matriz não assina', async () => {
      await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-fora','fora@cliente.com',?,'Fora','org_admin','proj-1')`)
        .bind(await hashPassword('password123')).run();
      const fora = { ...(await sessionFor({ id: 'usr-fora', email: 'fora@cliente.com', role: 'org_admin', client_project_id: 'proj-1' })), 'Content-Type': 'application/json' };
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, fora);
      expect(r.status).toBe(403);
      expect(await r.text()).toContain('não está designado na matriz');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBeNull();
      expect(ctrl.ceo_approved_by).toBeNull();
    });

    it('conta de administração da plataforma não assina política, mesmo designada', async () => {
      const admin = { ...(await sessionFor({ id: 'usr-1', email: 'ana@exemplo.com.br', name: 'Ana Souza', role: 'platform_admin' })), 'Content-Type': 'application/json' };
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, admin);
      expect(r.status).toBe(403);
      expect(await r.text()).toContain('administração da plataforma');
    });
```

Em `test/api.test.ts`, no teste `'mas o controle do próprio projeto continua editável e assinável'`, designe o `org_admin` na matriz antes da assinatura e troque a asserção de status pela da assinatura. Substitua o trecho do `const assinatura = await req('/api/v1/controls/ctrl-proprio/approve', {` até `expect(l.status).toBe('Approved');` por:

```ts
        // Assinar exige designação na matriz de Governança do projeto (como ROPA, DPIA e evidência).
        await env.DB.prepare(
          `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
           VALUES ('gov-orgadmin', ?, 'Org Admin', 'orgadmin@cliente.com', 'cliente', 'CISO')`
        ).bind(PROJ).run();

        const assinatura = await req('/api/v1/controls/ctrl-proprio/approve', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'password123' }),
        });
        expect(assinatura.status, await assinatura.clone().text()).toBe(200);

        const l = await env.DB.prepare('SELECT title, status, ciso_approved_by FROM compliance_controls WHERE id = ?').bind('ctrl-proprio').first<any>();
        expect(l.title).toBe('Título novo');
        expect(l.ciso_approved_by).toBe('Org Admin');
        expect(l.status).toBe('Missing');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/signatures.test.ts test/api.test.ts`
Expected: FAIL. `ciso_approved_by` vem `null` (hoje só o status muda), `data.role` vem `undefined`, e os testes de recusa recebem 200 em vez de 403.

- [ ] **Step 3: Write minimal implementation**

Em `src/services/pedidos.ts`, logo depois da função `assinaturaDpia` (que termina com `return db.prepare(\`UPDATE dpia_assessments SET ${set.sql} WHERE ${onde}\`)...`), acrescente:

```ts
// SET literal por papel: a catraca de colunas (test/colunas-catraca.test.ts) não enxerga nome de
// coluna montado por interpolação. Mesmo formato de COLUNAS_REVOGACAO (routes/controls.ts).
const SET_ASSINATURA_POLITICA: Record<PapelAssinatura, string> = {
  ciso: 'ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?',
  ceo: 'ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ?',
};

/**
 * Assinatura da política (o texto vive em `compliance_controls.description`) por papel. É a MESMA
 * usada por `POST /api/v1/controls/:id/approve` e pelo pedido de aprovação de política. Devolve o
 * UPDATE (para `run()` ou `batch`), ou `null` se o controle não existe no projeto. Não toca `status`:
 * ele é o da SoA. Com `guarda`, só pega se a prova do destinatário foi gravada no mesmo `batch` e o
 * título/texto são os congelados no pedido.
 */
export async function assinaturaPolitica(
  db: D1Database, projectId: string, controlId: string, role: PapelAssinatura,
  carimbo: { por: string; em: string; ip: string | null; ua: string | null }, guarda?: GuardaAssinatura,
): Promise<D1PreparedStatement | null> {
  const existe = await db.prepare('SELECT 1 FROM compliance_controls WHERE id = ? AND project_id = ?').bind(controlId, projectId).first();
  if (!existe) return null;
  let onde = 'id = ? AND project_id = ?';
  const bindsOnde: unknown[] = [controlId, projectId];
  if (guarda) {
    const ok = intacto('politica', '', guarda.conteudoJson);
    onde += ` AND EXISTS (SELECT 1 FROM pedido_destinatarios WHERE id = ? AND status = ? AND decidido_em = ?) AND ${ok.sql}`;
    bindsOnde.push(guarda.destId, guarda.status, guarda.decididoEm, ...ok.binds);
  }
  return db.prepare(`UPDATE compliance_controls SET ${SET_ASSINATURA_POLITICA[role]}, updated_at = CURRENT_TIMESTAMP WHERE ${onde}`)
    .bind(carimbo.por, carimbo.em, carimbo.ip, carimbo.ua, ...bindsOnde);
}
```

Em `src/routes/controls.ts`, troque a linha de import de `'../helpers'` por esta e acrescente o import do serviço:

```ts
import { logAudit, requireResourceAccess, verifyPassword, erro500, projetosVisiveis, autoridadeDeAssinatura, recusaDeAssinatura, type PapelAssinatura } from '../helpers';
import { assinaturaPolitica } from '../services/pedidos';
```

Em `handleControlApprove`, substitua o trecho que vai de

```ts
    await c.env.DB.prepare(
      `UPDATE compliance_controls SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(controlId).run();
```

até `return c.json({ ok: true, approved_by: approvedBy, approved_at: now });` (inclusive) por:

```ts
    // A autoridade sai da matriz de governança DESTE projeto, como em ROPA, DPIA e evidência. Antes
    // esta rota só gravava status='Approved': qualquer editor do projeto "aprovava" a política, sem
    // CISO/CEO registrado e sem segregação. Sem `role` no corpo, o papel sai do cargo (como evidência).
    const autoridade = await autoridadeDeAssinatura(c.env.DB, targetProjectId, user);
    const role: PapelAssinatura = v.data.role ?? (autoridade.ehDirecao && !autoridade.ehLiderSgsi ? 'ceo' : 'ciso');
    const recusa = recusaDeAssinatura(autoridade, role);
    if (recusa) return c.json({ error: recusa }, 403);

    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';
    // O nome da matriz vem primeiro: é sob aquela designação que a pessoa assina.
    const approvedBy = autoridade.nome || dbUser.name || user.email;

    // A mesma assinatura que o pedido de aprovação de política aciona (services/pedidos.ts).
    const assinatura = await assinaturaPolitica(c.env.DB, targetProjectId, controlId, role, { por: approvedBy, em: now, ip, ua });
    if (!assinatura) return c.json({ error: 'Controle não encontrado' }, 404);
    await assinatura.run();

    const quem = role === 'ciso' ? 'pelo Líder SGSI' : 'pela Direção Executiva';
    await logAudit(c.env.DB, 'control.approved', user.email, `Política do controle ${controlId} assinada ${quem} (${approvedBy}; IP: ${ip})`, '', '', targetProjectId);
    return c.json({ ok: true, role, approved_by: approvedBy, approved_at: now });
```

O resto do handler fica como está: validação, 404, `requireResourceAccess` antes da senha e conferência da senha. A ordem importa: controle alheio continua dando 403 antes de a senha ser conferida.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/signatures.test.ts test/api.test.ts test/colunas-catraca.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/idor-tenant.test.ts test/pedidos.test.ts test/any-catraca.test.ts`
Expected: PASS. Se a catraca de `any` acusar contagem MENOR que o `TETO`, baixe o `TETO` para o valor medido e rode de novo.

- [ ] **Step 5: Commit**

```bash
git add src/services/pedidos.ts src/routes/controls.ts test/signatures.test.ts test/api.test.ts test/any-catraca.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
fix(politicas): assinatura de política grava CISO/CEO pela matriz de governança

A aprovação de controle só gravava status='Approved', sem quem assinou e sem
consultar a matriz. Agora segue ROPA, DPIA e evidência: autoridade e segregação
por autoridadeDeAssinatura/recusaDeAssinatura, carimbo com nome, data, IP e UA
do papel por assinaturaPolitica (a mesma que o pedido de aprovação vai usar), e
o status da SoA não é mais reescrito.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Rotas GET da política e do relatório

**Files:**
- Modify: `src/routes/policies.ts` (import de helpers; rotas novas depois de `policies.get('/api/v1/projects/:projectId/controls/:controlId/versions/:versionId', …)`)
- Modify: `test/contrato-tela-api.test.ts` (remover as 2 tolerâncias do modal)
- Test: `test/policies.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consumes: `idDoControle`, `sha256Hex`, `escapeHtml`, `registraErro`, `erro500` (src/helpers.ts).
- Produces:
  - `GET /api/v1/projects/:projectId/controls/:controlId/policy` responde `200 { ok: true, control: <linha de compliance_controls>, content: string, hash: string (SHA-256 hex de description), versions: { id, version, created_by, created_at }[] }`, com as versões em ordem decrescente, ou `404 { error: 'Controle não encontrado' }`.
  - `GET /api/v1/projects/:projectId/controls/:controlId/policy/report` responde HTML (200) ou HTML 404.
  - Função local `politicaDoControle(db, projectId, ref)`, usada só por estas duas rotas.

- [ ] **Step 1: Write the failing test**

No fim de `test/policies.test.ts`, acrescente o `describe` abaixo no topo do arquivo, fora do `describe` existente, para não herdar o `beforeEach` dele. Acrescente também o import `import { sha256Hex } from '../src/helpers';`.

```ts
describe('GET da política e do relatório: o controle em qualquer formato de id (D1 real)', () => {
  let admin: Record<string, string>;
  const GEN = 'k3f9a1b2c4d5e6f7'; // formato do genId: id sem relação com o código

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const projeto = (id: string) => env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, ?, 'ISO 27001:2022', 'Controller', 'Active')`
    ).bind(id, `Cliente ${id}`);
    const controle = (id: string, proj: string, texto: string) => env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?, ?, 'ISO 27001:2022', 'A.5.1 Políticas de segurança da informação', ?)`
    ).bind(id, proj, texto);
    await env.DB.batch([
      projeto('p-a'), projeto('p-b'), projeto('p-c'), projeto('p-d'),
      controle('ctrl-a51', 'p-a', 'Texto da política A'),
      controle('A.5.1', 'p-b', 'Texto da política B'),
      controle('ctrl_b_a51', 'p-c', 'Texto da política C'),
      controle(GEN, 'p-d', 'Texto da política D'),
      env.DB.prepare(`UPDATE compliance_controls SET ciso_approved_by = 'Ana Souza', ciso_approved_at = '2026-10-07T10:00:00Z' WHERE id = 'ctrl-a51'`),
      env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('v1','p-a','ctrl-a51',1,'Texto antigo','x@y.com')`),
      env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('v2','p-a','ctrl-a51',2,'Texto da política A','x@y.com')`),
    ]);
    admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  });

  const ler = (caminho: string) => worker.fetch(new Request(`http://localhost${caminho}`, { headers: admin }), testEnv());

  it.each([
    ['p-a', 'ctrl-a51'], ['p-b', 'A.5.1'], ['p-c', 'ctrl_b_a51'], ['p-d', GEN],
  ])('projeto %s: acha o controle %s pelo id e pelo código', async (proj, id) => {
    for (const ref of [id, 'A.5.1']) {
      const r = await ler(`/api/v1/projects/${proj}/controls/${encodeURIComponent(ref)}/policy`);
      const body = await r.json() as any;
      expect(r.status, JSON.stringify(body)).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.control.id).toBe(id);
      expect(body.control.project_id).toBe(proj);
      expect(body.content).toBe(body.control.description);
      expect(body.hash).toBe(await sha256Hex(body.control.description));
    }
  });

  it('devolve o estado das assinaturas e as versões, a mais nova primeiro', async () => {
    const body = await (await ler('/api/v1/projects/p-a/controls/ctrl-a51/policy')).json() as any;
    expect(body.control.ciso_approved_by).toBe('Ana Souza');
    expect(body.control.ceo_approved_by).toBeNull();
    expect(body.versions.map((v: any) => v.version)).toEqual([2, 1]);
    expect(body.versions[0]).not.toHaveProperty('policy_text');
  });

  it('id de controle de outro projeto dá 404, nunca o controle alheio', async () => {
    expect((await ler(`/api/v1/projects/p-a/controls/${GEN}/policy`)).status).toBe(404);
    expect((await ler(`/api/v1/projects/p-a/controls/${GEN}/policy/report`)).status).toBe(404);
  });

  it('o hash acompanha o texto depois de uma edição', async () => {
    await env.DB.prepare(`UPDATE compliance_controls SET description = 'Texto novo' WHERE id = 'ctrl_b_a51'`).run();
    const body = await (await ler('/api/v1/projects/p-c/controls/A.5.1/policy')).json() as any;
    expect(body.hash).toBe(await sha256Hex('Texto novo'));
  });

  it('o relatório traz cliente, título, texto, hash e assinaturas, tudo escapado', async () => {
    await env.DB.prepare(
      `UPDATE compliance_controls SET title = 'A.5.1 <script>alert(1)</script>', description = '<img src=x onerror=alert(2)>', ceo_approved_by = 'Dir <b>', ceo_approved_at = '2026-10-07T11:00:00Z' WHERE id = 'ctrl-a51'`
    ).run();
    const r = await ler('/api/v1/projects/p-a/controls/ctrl-a51/policy/report');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('Cliente p-a');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Ana Souza');
    expect(html).toContain('Dir &lt;b&gt;');
    expect(html).toContain(await sha256Hex('<img src=x onerror=alert(2)>'));
  });

  it('relatório de controle sem assinatura diz que aguarda', async () => {
    const html = await (await ler('/api/v1/projects/p-b/controls/A.5.1/policy/report')).text();
    expect(html).toContain('Aguardando assinatura');
  });
});
```

Em `test/contrato-tela-api.test.ts`, apague as duas entradas temporárias de `TOLERADAS`:

```ts
  // Temporárias: rota inexistente, chamada que sai no P2 (modal de política).
  { chave: 'GET /api/v1/projects/:p/controls/:p/policy', motivo: 'modal de política; removida no P2', expande: [] },
  { chave: '* /api/v1/projects/:p/controls/:p/policy/report', motivo: 'Imprimir PDF da política; removida no P2', expande: [] },
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/policies.test.ts test/contrato-tela-api.test.ts`
Expected: FAIL. As rotas GET não existem: o catch-all de estáticos responde, e `body.ok` vem indefinido. O contrato tela↔API reprova as duas chamadas sem rota.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/policies.ts`, acrescente `sha256Hex` ao import de `'../helpers'`:

```ts
import { genId, idDoControle, logAudit, escapeHtml, erro500, registraErro, sha256Hex } from '../helpers';
```

Depois da rota `GET .../versions/:versionId` (o bloco que termina em `return c.json(row);\n});`), acrescente:

```ts
// ═══════════════════════════════════════════════════════════════════════════════
//  LEITURA DA POLÍTICA — o modal e o relatório. O id do controle chega em qualquer formato
//  ('ctrl-a51', 'A.5.1', 'ctrl_b_a51', genId) ou como código; idDoControle resolve preso ao projeto.
// ═══════════════════════════════════════════════════════════════════════════════

type ControleComPolitica = {
  id: string; project_id: string; title: string; description: string | null; status: string | null;
  ciso_approved_by: string | null; ciso_approved_at: string | null; ciso_approved_ip: string | null; ciso_approved_ua: string | null;
  ceo_approved_by: string | null; ceo_approved_at: string | null; ceo_approved_ip: string | null; ceo_approved_ua: string | null;
};

/** O controle do projeto com o texto da política e o SHA-256 desse texto (o que as assinaturas cobrem). */
async function politicaDoControle(db: D1Database, projectId: string, ref: string): Promise<{ control: ControleComPolitica; hash: string } | null> {
  const id = await idDoControle(db, projectId, ref);
  const control = id ? await db.prepare('SELECT * FROM compliance_controls WHERE id = ? AND project_id = ?')
    .bind(id, projectId).first<ControleComPolitica>() : null;
  if (!control) return null;
  return { control, hash: await sha256Hex(control.description ?? '') };
}

policies.get('/api/v1/projects/:projectId/controls/:controlId/policy', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const ref = c.req.param('controlId');
    const p = await politicaDoControle(c.env.DB, projectId, ref);
    if (!p) return c.json({ error: 'Controle não encontrado' }, 404);
    // `control_id = ref` cobre versões antigas gravadas com o código em vez do id (como em /versions).
    const { results: versions } = await c.env.DB.prepare(
      'SELECT id, version, created_by, created_at FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
    ).bind(projectId, p.control.id, ref).all();
    return c.json({ ok: true, control: p.control, content: p.control.description ?? '', hash: p.hash, versions });
  } catch (e) {
    return erro500(c, 'Falha ao ler a política', e);
  }
});

// Relatório para imprimir pelo navegador, no padrão dos de ROPA e DPIA. Tudo que vem do banco passa
// por escapeHtml: título e texto da política são digitados ou gerados por IA.
policies.get('/api/v1/projects/:projectId/controls/:controlId/policy/report', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const project = await c.env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<{ client_name: string | null }>();
    const p = project ? await politicaDoControle(c.env.DB, projectId, c.req.param('controlId')) : null;
    if (!project || !p) return c.html('<h3>Política não encontrada</h3>', 404);
    const k = p.control;
    const assinatura = (rotulo: string, por: string | null, em: string | null) =>
      `<div class="label">${rotulo}</div><div class="value">${por ? `Assinado por ${escapeHtml(por)} em ${escapeHtml(em ?? '')}` : 'Aguardando assinatura'}</div>`;
    return c.html(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Política — ${escapeHtml(k.title)}</title>
  <style>
    body { background: #ffffff; color: #0f172a; font-family: Inter, system-ui, sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-family: Montserrat, Inter, sans-serif; font-weight: 600; font-size: 1.4rem; margin: 0 0 0.25rem; }
    .label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 1rem; }
    .value { font-size: 0.95rem; margin-top: 4px; word-break: break-all; }
    .texto { white-space: pre-wrap; border-top: 1px solid #e2e8f0; margin-top: 1.5rem; padding-top: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(k.title)}</h1>
    <div class="value">${escapeHtml(project.client_name ?? '')}</div>
    ${assinatura('Líder SGSI', k.ciso_approved_by, k.ciso_approved_at)}
    ${assinatura('Direção Executiva', k.ceo_approved_by, k.ceo_approved_at)}
    <div class="label">Integridade do texto (SHA-256)</div><div class="value">${p.hash}</div>
    <div class="texto">${escapeHtml(k.description ?? '')}</div>
  </div>
</body>
</html>`);
  } catch (e) {
    return c.html(`<h3>Erro ao gerar o relatório da política</h3><p>Informe o identificador ao suporte: ${escapeHtml(registraErro(c, e))}</p>`, 500);
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/policies.test.ts test/contrato-tela-api.test.ts test/colunas-catraca.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/any-catraca.test.ts`
Expected: PASS. Os dois testes de isolamento varrem `app.routes` e passam a cobrir as rotas novas.

- [ ] **Step 5: Commit**

```bash
git add src/routes/policies.ts test/policies.test.ts test/contrato-tela-api.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
feat(politicas): GET da política e relatório imprimível, com o controle em qualquer formato de id

O modal chamava GET .../controls/:c/policy e .../policy/report, que não
existiam. As duas rotas resolvem o controle por idDoControle, presas ao
projeto, e devolvem texto, SHA-256, estado das assinaturas e versões. Saem as
duas tolerâncias temporárias do contrato tela↔API.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Restaurar versão zera as aprovações

**Files:**
- Modify: `src/routes/policies.ts` (import de `./controls`; o UPDATE dentro de `policies.post('/api/v1/projects/:projectId/controls/:controlId/restore-version', …)`)
- Test: `test/policies.test.ts` (dentro do `describe('Edição manual de política (D1 real)')` existente)

**Interfaces:**
- Consumes: `COLUNAS_REVOGACAO: Record<'ciso' | 'ceo', string>` (exportado por `src/routes/controls.ts`).
- Produces: `POST .../restore-version` grava o texto da versão e zera as oito colunas de aprovação. A resposta não muda (`{ ok, version, policy_markdown }`).

- [ ] **Step 1: Write the failing test**

Dentro do `describe('Edição manual de política (D1 real)')` de `test/policies.test.ts`. Ele usa `PROJ`, `CONTROL_ID`, `headers` e `req` do arquivo.

```ts
  it('restaurar versão grava o texto antigo e zera as duas aprovações', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE compliance_controls SET ciso_approved_by = 'Ana', ciso_approved_at = '2026-10-07', ciso_approved_ip = '1.1.1.1', ciso_approved_ua = 'ua',
           ceo_approved_by = 'Dir', ceo_approved_at = '2026-10-07', ceo_approved_ip = '2.2.2.2', ceo_approved_ua = 'ua' WHERE id = ?`
      ).bind(CONTROL_ID),
      env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('ver-1', ?, ?, 1, 'Texto da versão 1', 'x@y.com')`)
        .bind(PROJ, CONTROL_ID),
    ]);

    const res = await req(`/api/v1/projects/${PROJ}/controls/${CONTROL_ID}/restore-version`, { method: 'POST', body: JSON.stringify({ version_id: 'ver-1' }) }, headers);
    expect(res.status, await res.clone().text()).toBe(200);

    const ctrl = await env.DB.prepare('SELECT * FROM compliance_controls WHERE id = ?').bind(CONTROL_ID).first<any>();
    expect(ctrl.description).toBe('Texto da versão 1');
    for (const col of ['ciso_approved_by', 'ciso_approved_at', 'ciso_approved_ip', 'ciso_approved_ua', 'ceo_approved_by', 'ceo_approved_at', 'ceo_approved_ip', 'ceo_approved_ua']) {
      expect(ctrl[col], col).toBeNull();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/policies.test.ts -t "restaurar versão"`
Expected: FAIL. `ciso_approved_by` continua `'Ana'`.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/policies.ts`, acrescente o import junto dos outros imports do topo:

```ts
import { COLUNAS_REVOGACAO } from './controls';
```

Dentro da rota `restore-version`, troque este trecho (é o único UPDATE de `description` sem zerar aprovação no arquivo):

```ts
  // Update compliance_controls description
  await c.env.DB.prepare(
    'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
  ).bind(row.policy_text, controlId, projectId).run();
```

por:

```ts
  // Texto restaurado é texto diferente do assinado: zera as duas aprovações, como a edição e a geração.
  await c.env.DB.prepare(
    `UPDATE compliance_controls SET description = ?, ${COLUNAS_REVOGACAO.ciso}, ${COLUNAS_REVOGACAO.ceo}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
  ).bind(row.policy_text, controlId, projectId).run();
```

O `conferirPedidosDoDocumento` logo abaixo continua: um pedido de aprovação aberto sobre o texto anterior é substituído.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/policies.test.ts test/pedidos-publico.test.ts test/colunas-catraca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/policies.ts test/policies.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
fix(politicas): restaurar versão zera as aprovações do CISO e da Direção

A edição e a geração já zeravam; restaurar uma versão trocava o texto e
mantinha o carimbo de quem assinou outro texto.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Modal de política usa a rota nova

**Files:**
- Modify: `frontend/src/views/compliance.js`: o botão do painel de políticas, `openGeneratePolicyModal`, `doGeneratePolicy`, `window.signPolicy` e `window.openPolicyReport`
- Modify: `frontend/test/contrato-consumidores.test.js` (o teste de templates)
- Test: Create `frontend/test/politica-modal.test.js`

**Interfaces:**
- Consumes:
  - `GET /api/v1/projects/:p/controls/:c/policy` → `{ ok, control, content, hash, versions }` (Task 2).
  - `POST /api/v1/controls/:id/approve {role, password}` → `{ ok, role, approved_by, approved_at }` (Task 1).
  - `POST /api/v1/projects/:p/controls/:c/policy {text}` → `{ ok, control_id, version }` (`policies.ts:465-514`).
  - `codigoDoControle(ctrl)` (topo de `compliance.js`).
- Produces: `window.signPolicy(projectId, controlId, role)`, com três argumentos; `window.openGeneratePolicyModal(projectId, controlRef)`, que aceita o id da linha ou o código. A variável `ctrl` dentro do modal é o controle devolvido pelo servidor (a Task 5 usa `ctrl.id`).

- [ ] **Step 1: Write the failing test**

Crie `frontend/test/politica-modal.test.js`:

```js
// O modal de política chamava GET .../policy (inexistente), caía na lista GLOBAL de controles
// procurando 'ctrl-<código>' e salvava edição por uma "evidência vinculada" que nunca existia.
// api() REAL; só o fetch é dublado, com o corpo de cada handler (arquivo:linha ao lado).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/compliance.js';

const TEXTO = 'Texto da política de segurança da informação. '.repeat(5);
const controle = (extra = {}) => ({
    id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas de segurança da informação', description: TEXTO,
    ciso_approved_by: null, ciso_approved_at: null, ceo_approved_by: null, ceo_approved_at: null, ...extra,
});
// policies.ts, GET .../controls/:controlId/policy (Task 2)
const corpoPolitica = (ctrl) => ({ ok: true, control: ctrl, content: ctrl.description, hash: 'ab'.repeat(32), versions: [{ id: 'v1', version: 1, created_by: 'x@y.com', created_at: '2026-10-07' }] });
const rotasDoModal = (ctrl, extra = {}) => ({
    'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy': corpoPolitica(ctrl),
    'GET /api/v1/projects/p1/controls/A.5.1/policy': corpoPolitica(ctrl),
    'GET /api/v1/policies/templates': { ok: true, templates: [] }, // policies.ts:521
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const espera = () => new Promise((r) => setTimeout(r, 0));
const modal = () => document.getElementById('modal-content');

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok123';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('modal de política', () => {
    it('lê só a rota do projeto, com o id como veio, e nunca a lista global', async () => {
        // Com uma assinatura: o selo (que mostra o hash) só aparece quando há assinatura.
        const f = servir(rotasDoModal(controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' })));
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        expect(chamadas(f)).toContain('GET /api/v1/projects/p1/controls/ctrl_b_a51/policy');
        expect(chamadas(f).some((k) => k === 'GET /api/v1/controls' || k.endsWith('/versions'))).toBe(false);
        expect(modal().textContent).toContain('A.5.1');
        expect(modal().textContent).toContain('ab'.repeat(32));
        // o Líder SGSI já assinou: o único botão "Assinar" é o da Direção
        const assinar = modal().querySelector('[data-action="signPolicy"]');
        expect(JSON.parse(assinar.getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51', 'ceo']);
        expect(JSON.parse(modal().querySelector('[data-action="openPolicyReport"]').getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51']);
    });

    it('controle que não existe no projeto mostra o erro, sem fallback nem formulário de geração', async () => {
        const f = vi.fn(async () => resposta({ error: 'Controle não encontrado' }, 404)); // policies.ts, 404 da Task 2
        vi.stubGlobal('fetch', f);
        await window.openGeneratePolicyModal('p1', 'A.9.9');
        expect(modal().textContent).toContain('Controle não encontrado');
        expect(modal().querySelector('#btn-gen-policy')).toBeNull();
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p1/controls/A.9.9/policy']);
    });

    it('salvar edição grava pela rota de política do controle, sem depender de evidência', async () => {
        const f = servir(rotasDoModal(controle(), {
            'POST /api/v1/projects/p1/controls/ctrl_b_a51/policy': { ok: true, control_id: 'ctrl_b_a51', version: 2 }, // policies.ts:510
        }));
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const editar = document.getElementById('btn-edit-policy');
        editar.onclick();
        document.getElementById('policy-editor-textarea').value = 'Texto novo';
        editar.onclick();
        await espera();
        expect(corpoDe(f, 'POST /api/v1/projects/p1/controls/ctrl_b_a51/policy')).toEqual({ text: 'Texto novo' });
        expect(modal().textContent).not.toContain('evidência vinculada');
    });

    it('salvar texto já assinado pede confirmação; sem ela, não grava', async () => {
        const f = servir(rotasDoModal(controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' })));
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const editar = document.getElementById('btn-edit-policy');
        editar.onclick();
        editar.onclick();
        await espera();
        expect(confirmar).toHaveBeenCalled();
        expect(chamadas(f).some((k) => k.startsWith('POST'))).toBe(false);
    });

    it('assinar pede só a senha, manda o papel para o id real e reabre com o estado do servidor', async () => {
        const f = servir(rotasDoModal(controle(), {
            'POST /api/v1/controls/ctrl_b_a51/approve': { ok: true, role: 'ceo', approved_by: 'Direção', approved_at: '2026-10-07' }, // controls.ts, Task 1
        }));
        const pedir = vi.spyOn(window, 'prompt').mockReturnValue('senha');
        await window.signPolicy('p1', 'ctrl_b_a51', 'ceo');
        expect(pedir).toHaveBeenCalledTimes(1);
        expect(corpoDe(f, 'POST /api/v1/controls/ctrl_b_a51/approve')).toEqual({ role: 'ceo', password: 'senha' });
        expect(chamadas(f)).toContain('GET /api/v1/projects/p1/controls/ctrl_b_a51/policy');
    });

    it('o relatório abre a rota de relatório da política', () => {
        const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
        window.openPolicyReport('p1', 'ctrl_b_a51');
        expect(abrir.mock.calls[0][0]).toContain('/api/v1/projects/p1/controls/ctrl_b_a51/policy/report?token=tok123');
    });
});
```

Em `frontend/test/contrato-consumidores.test.js`, o teste `'templates de política: viram opções do seletor (policies.ts:521)'` precisa da rota nova, porque o modal deixa de cair na lista global. Troque o `servir({...})` dele por:

```js
        servir({
            // policies.ts, GET .../controls/:controlId/policy (P2): sem texto de política, o modal abre o formulário de geração.
            'GET /api/v1/projects/p1/controls/A.5.1/policy': {
                ok: true, control: { id: 'ctrl-a51', project_id: 'p1', title: 'A.5.1 Políticas', description: '' },
                content: '', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', versions: [],
            },
            'GET /api/v1/policies/templates': { ok: true, templates: ['isms-policy', 'access-control-policy'] },
        });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run test/politica-modal.test.js --pool=threads`
Expected: FAIL. O modal chama `/versions` e `/api/v1/controls`, o `data-args` do botão é `["ctrl_b_a51","ceo"]` com dois itens, a edição mostra "Não há evidência vinculada", e `signPolicy` pede o nome antes da senha.

- [ ] **Step 3: Write minimal implementation**

Todas as edições são em `frontend/src/views/compliance.js`. Ancore cada uma pelo trecho citado.

**3a.** No painel de políticas, o modal recebe o id da linha, não o código remontado. Troque

```js
                        `<button data-action="openGeneratePolicyModal" data-args='["${proj.id}","${escapeHTML(displayId)}"]' class="btn btn-ghost btn-sm">Visualizar / Gerar</button>`
```

por

```js
                        `<button data-action="openGeneratePolicyModal" data-args='["${proj.id}","${escapeHTML(ctrl.id)}"]' class="btn btn-ghost btn-sm">Visualizar / Gerar</button>`
```

**3b.** Logo antes de `async function openGeneratePolicyModal(projectId, controlIdArg) {`, acrescente:

```js
    // Mudar o texto zera as duas assinaturas no servidor (policies.ts): quem clica precisa saber antes.
    function avisarQueAnulaAssinaturas(ctrl) {
        if (!ctrl.ciso_approved_by && !ctrl.ceo_approved_by) return true;
        return window.confirm('Mudar o texto anula as assinaturas já registradas desta política. Continuar?');
    }
```

**3c.** Em `openGeneratePolicyModal`, troque o trecho de `const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');` até o fim do bloco `// 2. Fallback caso a requisição falhe ou retorne vazio` (o `}` que fecha o `if (!ctrl.id) { ... }`) por:

```js
        // Uma rota só, presa ao projeto: o servidor acha o controle pelo id em qualquer formato ou
        // pelo código. Sem fallback para a lista global de controles, que mistura projetos.
        let policyRes;
        try {
            policyRes = await api('GET', `/api/v1/projects/${projectId}/controls/${encodeURIComponent(controlId)}/policy`);
        } catch (e) {
            openModal(`
                <div class="modal-header"><span class="modal-title">Gestão de Política</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
                <div style="padding: 2rem; text-align: center; color: var(--danger);">${escapeHTML(e.message || 'Controle não encontrado neste projeto')}</div>
            `);
            return;
        }
        const ctrl = policyRes.control;
        const policyText = policyRes.content || '';
        const codigo = codigoDoControle(ctrl);
```

**3d.** Troque

```js
        const hasPolicy = (policyText && policyText.length > 100 && !isDefaultDescription) || (evidenceId !== null);
```

por

```js
        const hasPolicy = policyText.length > 100 && !isDefaultDescription;
```

**3e.** Em `showGenerationFormHtml`, troque `Gerar Política ISO — ${escapeHTML(controlId)}` por `Gerar Política ISO — ${escapeHTML(codigo)}` e `<input class="form-input" id="policy-control-id" value="${escapeHTML(controlId)}">` por `<input class="form-input" id="policy-control-id" value="${escapeHTML(codigo)}">`. O gerador usa esse valor no prompt da IA e o resolve por `idDoControle`.

**3f.** Troque

```js
            let versions = [];
            try {
                versions = await api('GET', `/api/v1/projects/${projectId}/controls/${controlId}/versions`) || [];
            } catch(e) {}
```

por

```js
            const versions = policyRes.versions || [];
```

**3g.** Nos dois botões "Assinar" do modal (`data-action="signPolicy" data-args='["${ctrl.id || ''}","ciso"]'` e o de `"ceo"`), troque o `data-args` para levar projeto, id real e papel:

```js
data-args='["${projectId}","${escapeHTML(ctrl.id)}","ciso"]'
```

```js
data-args='["${projectId}","${escapeHTML(ctrl.id)}","ceo"]'
```

**3h.** Dentro de `openGeneratePolicyModal`, nos `data-args` de `onPolicyVersionChange`, `doRestorePolicyVersion`, `__cmpViewPolicyVersion` e `openPolicyReport`, troque `"${controlId}"` por `"${escapeHTML(ctrl.id)}"`. No botão do relatório, troque o rótulo `Imprimir PDF` por `Imprimir`.

**3i.** Selo: troque

```js
            const evidenceHash = (typeof policyRes !== 'undefined' && policyRes) ? policyRes.evidence_hash : null;
```

por

```js
            const evidenceHash = policyRes.hash;
```

e troque `${evidenceHash || 'Calculando...'}` por `${escapeHTML(evidenceHash)}`.

**3j.** Título do modal: `Política Ativa — ${escapeHTML(controlId)}` vira `Política Ativa — ${escapeHTML(codigo)}`.

**3k.** Salvar edição: troque o trecho de `const newContent = document.getElementById('policy-editor-textarea').value;` até o fim do `.catch(err => { ... });` que o segue por:

```js
                    const newContent = document.getElementById('policy-editor-textarea').value;
                    if (!avisarQueAnulaAssinaturas(ctrl)) return;
                    editBtn.disabled = true;
                    editBtn.textContent = 'Salvando...';
                    api('POST', `/api/v1/projects/${projectId}/controls/${encodeURIComponent(ctrl.id)}/policy`, { text: newContent })
                        .then(() => {
                            showToast('Política atualizada. Uma nova versão foi registrada.');
                            return window.openGeneratePolicyModal(projectId, ctrl.id);
                        })
                        .catch(err => {
                            showToast('Erro ao salvar política: ' + err.message, 'error');
                            editBtn.disabled = false;
                            editBtn.textContent = 'Salvar Alterações';
                        });
```

**3l.** Em `window.doRestorePolicyVersion`, logo depois de `if (!verId) return;`, acrescente:

```js
                if (!avisarQueAnulaAssinaturas(ctrl)) return;
```

**3m.** Em `doGeneratePolicy`, troque o corpo do `if (res.ok) {`, do `let ctrl = {};` até `btn.disabled = false;` (logo antes de `} else {`), por:

```js
                // O modal da política mostra o texto gerado com as assinaturas, lidas do servidor.
                showToast('Política gerada. Revise o texto antes de pedir as assinaturas.');
                await openGeneratePolicyModal(projectId, controlId);
```

O `} else { throw ... }` e o `catch` ficam como estão.

**3n.** Troque `window.signPolicy = async function(controlId, role) { ... };` inteiro por:

```js
    // O carimbo é o nome que consta na matriz de Governança (o servidor decide quem pode assinar o quê);
    // por isso a tela pede só a senha.
    window.signPolicy = async function(projectId, controlId, role) {
        const roleLabel = role === 'ciso' ? 'Líder SGSI' : 'Direção Executiva';
        const password = prompt(`Digite sua senha de login para assinar eletronicamente como ${roleLabel}:`);
        if (!password) return;
        try {
            const res = await api('POST', `/api/v1/controls/${encodeURIComponent(controlId)}/approve`, { role, password });
            showToast(`Assinatura registrada como ${roleLabel}: ${res.approved_by}.`);
            await openGeneratePolicyModal(projectId, controlId);
        } catch (e) {
            showToast('Assinatura não registrada: ' + e.message, 'error');
        }
    };
```

**3o.** `window.openPolicyReport`: codifique o id:

```js
window.openPolicyReport = function(projectId, controlId) {
    window.open(`/api/v1/projects/${projectId}/controls/${encodeURIComponent(controlId)}/policy/report?token=${S.token}`, '_blank');
};
```

Por fim, confira que não sobrou referência morta. Rode `grep -n "normId\|evidenceId\|evidence_hash" frontend/src/views/compliance.js`: o resultado tem de vir vazio.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/politica-modal.test.js test/contrato-consumidores.test.js test/soa-sem-gerar.test.js --pool=threads` e, na raiz, `npx vitest run test/contrato-tela-api.test.ts`
Expected: PASS. As chamadas novas casam com rota do backend.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/compliance.js frontend/test/politica-modal.test.js frontend/test/contrato-consumidores.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
fix(politicas): modal de política lê a rota do projeto e salva sem "evidência vinculada"

O modal procurava o controle por 'ctrl-<código>' na lista global, e salvar
sempre falhava por uma evidência que nunca era carregada. Agora lê
GET .../controls/:c/policy, salva por POST .../policy, assina pedindo só a
senha e avisa que mudar texto assinado anula as assinaturas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Aprovação de política por pedido

**Files:**
- Modify: `src/schemas/domain.ts` (`pedidoCriarSchema.tipo`)
- Modify: `src/services/pedidos.ts` (`registrarDecisao`: assinar política)
- Modify: `src/routes/pedidos.ts` (`POST /`: resolver o controle e recusar ciência de política; `GET /:id`: devolver `motivo`)
- Modify: `frontend/src/views/meus-pedidos.js` (modal "Pedir aprovação", rótulos da política, lista e acompanhamento de quem pediu)
- Modify: `frontend/src/views/compliance.js` (botão "Pedir aprovação" no modal da política)
- Test: Create `test/pedido-politica.test.ts`, `frontend/test/pedido-politica.test.js`
- Regenerar: `npm run openapi` (o enum mudou)

**Interfaces:**
- Consumes:
  - `assinaturaPolitica(db, projectId, controlId, role, carimbo, guarda?)` (Task 1).
  - `conferirPedidosDoDocumento(c, 'politica', id, projectId)`, que já substitui o pedido aberto quando o texto muda (chamado pela edição, pela geração e pela restauração, `policies.ts`).
  - `window.abrirPedidoAprovacao(projectId, tipo, refId)` (`meus-pedidos.js:150`).
  - `ctrl.id` dentro do modal (Task 4).
- Produces:
  - `POST /api/v1/projects/:p/pedidos` aceita `{ tipo: 'politica', ref_id: <id ou código>, papel_exigido: 'ciso'|'ceo', destinatarios }` e responde 201 `{ ok, id, hash, links }`. Com `papel_exigido: 'ciente'` responde 400; controle fora do projeto, 404.
  - `POST /api/v1/pedidos/:id/aprovar` em pedido de política grava a assinatura no controle no mesmo `batch` da prova.
  - `GET /api/v1/projects/:p/pedidos/:id` passa a trazer `motivo` em cada destinatário.

- [ ] **Step 1: Write the failing backend test**

Crie `test/pedido-politica.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { hashConteudo } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Aprovação de política por pedido: a direção do cliente que só tem conta `org_user` (read-only, o
 * write-guard barra POST /controls/:id/approve) aprova pelo pedido. A assinatura cai no controle
 * pela mesma assinaturaPolitica da aprovação direta, com a autoridade da matriz de governança.
 */
const SENHA = 'Senha-forte-123!';
const P = 'pp-proj';
const CTRL = 'ctrl_b_a51';
const TITULO = 'A.5.1 Políticas de segurança da informação';
const TEXTO = 'Política de segurança da informação: texto para aprovação da direção.';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const controle = () => env.DB.prepare('SELECT * FROM compliance_controls WHERE id = ?').bind(CTRL).first<any>();
const pedido = (id: string) => env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<any>();
const dest = (id: string) => env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first<any>();

let consultor: Record<string, string>, ciso: Record<string, string>, dir: Record<string, string>, analista: Record<string, string>;

const criar = (papel: string, emails: string[], ref = 'A.5.1', h = consultor) =>
  chamar(h, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'politica', ref_id: ref, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) });
const criado = async (papel: string, emails: string[]) => {
  const r = await criar(papel, emails);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json() as any).id as string;
};
const decidir = (h: Record<string, string>, id: string, acao: 'aprovar' | 'recusar', corpo: Record<string, unknown> = { senha: SENHA }) =>
  chamar(h, 'POST', `/api/v1/pedidos/${id}/${acao}`, corpo);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES (?, ?, 'ISO 27001:2022', ?, ?, 'Partial')`).bind(CTRL, P, TITULO, TEXTO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness'),
      ('u-dir', 'dir@cliente.com', ?, 'Davi', 'org_user', ?, 'org_ness'),
      ('u-ana', 'analista@cliente.com', ?, 'Ana', 'org_user', ?, 'org_ness')`).bind(senha, senha, P, senha, P, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ciso', ?, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO'),
      ('g-dir', ?, 'Davi Matriz', 'dir@cliente.com', 'executivo', 'Diretor Executivo'),
      ('g-ana', ?, 'Ana', 'analista@cliente.com', 'executivo', 'Analista de TI')`).bind(P, P, P, P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
  dir = await sessionFor({ id: 'u-dir', email: 'dir@cliente.com', role: 'org_user', client_project_id: P });
  analista = await sessionFor({ id: 'u-ana', email: 'analista@cliente.com', role: 'org_user', client_project_id: P });
});

// O controle volta ao texto original e sem assinatura antes de cada teste. Pedidos de testes
// anteriores ficam no banco (prova imutável) e são substituídos se o texto mudar: não interferem.
beforeEach(async () => {
  await env.DB.prepare(
    `UPDATE compliance_controls SET title = ?, description = ?, status = 'Partial',
       ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
       ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL WHERE id = ?`
  ).bind(TITULO, TEXTO, CTRL).run();
});

describe('aprovação de política por pedido', () => {
  it('o consultor pede pelo código; o pedido guarda o id da linha e congela título e texto', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    const p = await pedido(id);
    expect(p).toMatchObject({ tipo: 'politica', ref_id: CTRL, papel_exigido: 'ciso', status: 'aberto' });
    expect(JSON.parse(p.conteudo_json)).toEqual({ title: TITULO, description: TEXTO });
    expect(p.hash).toBe(await hashConteudo({ title: TITULO, description: TEXTO }));
  });

  it('ciência de política por conta é recusada (é pelo lote por link); controle fora do projeto: 404', async () => {
    expect((await criar('ciente', ['ciso@cliente.com'])).status).toBe(400);
    expect((await criar('ciso', ['ciso@cliente.com'], 'A.99.9')).status).toBe(404);
  });

  it('org_user não cria pedido de política', async () => {
    expect((await criar('ciso', ['ciso@cliente.com'], 'A.5.1', ciso)).status).toBe(403);
  });

  it('org_user CISO aprova pelo pedido: assinatura no controle com o nome da matriz, prova gravada, status da SoA intacto', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    const r = await decidir(ciso, id, 'aprovar');
    expect(r.status, await r.clone().text()).toBe(200);
    const k = await controle();
    expect(k.ciso_approved_by).toBe('Cida Matriz');
    expect(k.ciso_approved_at).toBeTruthy();
    expect(k.ceo_approved_by).toBeNull();
    expect(k.status).toBe('Partial');
    const p = await pedido(id);
    expect(p.status).toBe('aprovado');
    const d = await dest(id);
    expect(d.status).toBe('aprovado');
    expect(d.hash_lido).toBe(p.hash);
  });

  it('a Direção aprova o pedido de papel ceo', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    expect((await decidir(dir, id, 'aprovar')).status).toBe(200);
    expect((await controle()).ceo_approved_by).toBe('Davi Matriz');
  });

  it('quem não tem o cargo na matriz não aprova: 403 e nada gravado', async () => {
    const id = await criado('ciso', ['analista@cliente.com']);
    const r = await decidir(analista, id, 'aprovar');
    expect(r.status).toBe(403);
    expect((await controle()).ciso_approved_by).toBeNull();
    expect((await dest(id)).status).toBe('pendente');
  });

  it('o CISO não aprova pedido de papel ceo (segregação de funções)', async () => {
    const id = await criado('ceo', ['ciso@cliente.com']);
    const r = await decidir(ciso, id, 'aprovar');
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('Segregação de Funções');
    expect((await controle()).ceo_approved_by).toBeNull();
  });

  it('mudar o texto substitui o pedido; o antigo dá 409 e o novo assina', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    const ed = await chamar(consultor, 'POST', `/api/v1/projects/${P}/controls/${CTRL}/policy`, { text: 'Texto revisto da política.' });
    expect(ed.status, await ed.clone().text()).toBe(200);
    const antigo = await pedido(id);
    expect(antigo.status).toBe('substituido');
    expect((await decidir(dir, id, 'aprovar')).status).toBe(409);
    const novo = await pedido(antigo.substituido_por);
    expect(JSON.parse(novo.conteudo_json).description).toBe('Texto revisto da política.');
    expect((await decidir(dir, novo.id, 'aprovar')).status).toBe(200);
    expect((await controle()).ceo_approved_by).toBe('Davi Matriz');
  });

  it('texto alterado por fora entre o pedido e a decisão: 409 e nada assinado', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    await env.DB.prepare('UPDATE compliance_controls SET description = ? WHERE id = ?').bind('Mudado direto no banco', CTRL).run();
    expect((await decidir(ciso, id, 'aprovar')).status).toBe(409);
    expect((await controle()).ciso_approved_by).toBeNull();
  });

  it('a recusa aparece para quem pediu, com o motivo, e não assina', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    const r = await decidir(dir, id, 'recusar', { senha: SENHA, motivo: 'Falta a seção de backup' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await controle()).ceo_approved_by).toBeNull();

    const painel = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${id}`)).json() as any;
    expect(painel.pedido.status).toBe('recusado');
    expect(painel.destinatarios[0]).toMatchObject({ email: 'dir@cliente.com', situacao: 'recusado', motivo: 'Falta a seção de backup' });

    const lista = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos`)).json() as any;
    expect(lista.pedidos.find((p: any) => p.id === id)).toMatchObject({ tipo: 'politica', papel_exigido: 'ceo', status: 'recusado' });
  });
});
```

- [ ] **Step 2: Run backend test to verify it fails**

Run: `npx vitest run test/pedido-politica.test.ts`
Expected: FAIL. `tipo: 'politica'` dá 400 no schema; depois de liberado, a aprovação não assina o controle (`registrarDecisao` só assina DPIA, e o `assinaturaDpia` devolve `null` para o id do controle, então a decisão volta 409); e `motivo` não vem no painel.

- [ ] **Step 3: Backend implementation**

Em `src/schemas/domain.ts`, em `pedidoCriarSchema`, troque `tipo: z.enum(['dpia']),` por:

```ts
  // `politica` só para aprovação (ciso/ceo): a ciência de política é pelo lote por link (pedidoCienciaLoteSchema).
  // A rota recusa `politica` + `ciente` com 400.
  tipo: z.enum(['dpia', 'politica']),
```

Em `src/services/pedidos.ts`, dentro de `registrarDecisao`, troque o bloco

```ts
  if (a.assinar) {
    const st = await assinaturaDpia(db, p.project_id, p.ref_id, a.assinar.papel, a.nome,
      { destId: a.destId, status: a.status, decididoEm, conteudoJson: p.conteudo_json });
    if (!st) return false;
    stmts.push(st);
  }
```

por

```ts
  if (a.assinar) {
    const guarda = { destId: a.destId, status: a.status, decididoEm, conteudoJson: p.conteudo_json };
    // Cada tipo assina pela MESMA função da aprovação direta: DPIA (platform.ts) e política (controls.ts).
    const st = p.tipo === 'politica'
      ? await assinaturaPolitica(db, p.project_id, p.ref_id, a.assinar.papel, { por: a.nome, em: decididoEm, ip: a.ip, ua: a.ua }, guarda)
      : await assinaturaDpia(db, p.project_id, p.ref_id, a.assinar.papel, a.nome, guarda);
    if (!st) return false;
    stmts.push(st);
  }
```

Atualize também o comentário de topo do arquivo: em "Tipos: `dpia` e `politica` ...", acrescente "ambos assinam (`assinaturaDpia`, `assinaturaPolitica`)".

Em `src/routes/pedidos.ts`:

1. Acrescente `idDoControle` ao import de `'../helpers'`.
2. Em `projectPedidosApp.post('/', ...)`, logo depois de `const b = valid.data;`, acrescente:

```ts
    // Política: só aprovação. A ciência de política é pelo lote por link (POST /ciencia).
    if (b.tipo === 'politica' && b.papel_exigido === 'ciente') {
      return c.json({ error: 'Ciência de política é pelo envio por link ("Nova ciência por link"). Este pedido é de aprovação: escolha Líder SGSI ou Direção.' }, 400);
    }
    // O id do controle chega em qualquer formato ou como código; o pedido guarda o id da linha.
    const refId = b.tipo === 'politica' ? await idDoControle(c.env.DB, projectId, b.ref_id) : b.ref_id;
    if (!refId) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
```

   No mesmo handler, troque `refId: b.ref_id` por `refId` na chamada de `criarPedido`, e `${b.ref_id}` por `${refId}` no `logAudit`.

3. Em `projectPedidosApp.get('/:id', ...)`, acrescente `motivo` ao SELECT dos destinatários:

```ts
      `SELECT email, nome, status, decidido_em, aberto_em, canal, hash_lido, motivo FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email`
```

Regenere o OpenAPI: `npm run openapi`.

- [ ] **Step 4: Run backend tests**

Run: `npx vitest run test/pedido-politica.test.ts test/pedidos.test.ts test/pedidos-prova.test.ts test/pedidos-corrida.test.ts test/pedidos-autoridade.test.ts test/pedidos-publico.test.ts test/colunas-catraca.test.ts test/openapi.test.ts test/contrato-writes-validados.test.ts test/any-catraca.test.ts`
Expected: PASS. Os testes de DPIA seguem verdes porque o ramo `dpia` não mudou.

- [ ] **Step 5: Write the failing frontend test**

Crie `frontend/test/pedido-politica.test.js`:

```js
// Pedido de aprovação de política: quem pede escolhe só Líder SGSI ou Direção, e acompanha a
// aprovação ou a recusa (com o motivo). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/meus-pedidos.js';
import '../src/views/compliance.js';

const $ = (id) => document.getElementById(id);
const espera = () => new Promise((r) => setTimeout(r, 0));
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="alvo"></div>';
    S.token = 'tok123';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('pedido de aprovação de política', () => {
    it('o modal oferece só Líder SGSI e Direção e envia tipo politica com o id do controle', async () => {
        const f = servir({
            // governance.ts:66-70 devolve a lista crua
            'GET /api/v1/projects/p1/governance': [{ email: 'dir@cliente.com', name: 'Davi', job_title: 'Diretor Executivo', role_category: 'executivo' }],
            // routes/pedidos.ts, POST / (201)
            'POST /api/v1/projects/p1/pedidos': { ok: true, id: 'pd1', hash: 'h', links: [] },
        });
        await window.abrirPedidoAprovacao('p1', 'politica', 'ctrl_b_a51');
        expect([...$('pn-papel').options].map((o) => o.value)).toEqual(['ciso', 'ceo']);
        $('pn-papel').value = 'ceo';
        document.querySelector('input[name="pn-dest"]').checked = true;
        await window.enviarPedidoAprovacao(null, 'p1', 'politica', 'ctrl_b_a51');
        expect(corpoDe(f, 'POST /api/v1/projects/p1/pedidos')).toEqual({
            tipo: 'politica', ref_id: 'ctrl_b_a51', papel_exigido: 'ceo', destinatarios: [{ email: 'dir@cliente.com', nome: 'Davi' }],
        });
    });

    it('para DPIA, a ciência continua entre as opções', async () => {
        servir({ 'GET /api/v1/projects/p1/governance': [] });
        await window.abrirPedidoAprovacao('p1', 'dpia', 'dp1');
        expect([...$('pn-papel').options].map((o) => o.value)).toEqual(['ciso', 'ceo', 'ciente']);
    });

    it('quem pediu vê o pedido de aprovação de política e a recusa com o motivo', async () => {
        servir({
            // routes/pedidos.ts, GET / do projeto (sem `ok`: o api() devolve o objeto)
            'GET /api/v1/projects/p1/pedidos': { pedidos: [
                { id: 'pd1', tipo: 'politica', titulo: 'Política: A.5.1 Políticas', papel_exigido: 'ceo', status: 'recusado', total: 1, cientes: 0, pendentes: 0, nao_abriram: 0, criado_em: '2026-10-07' },
                { id: 'pd2', tipo: 'dpia', titulo: 'DPIA: Folha', papel_exigido: 'ciso', status: 'aberto', total: 1, cientes: 0, pendentes: 1, nao_abriram: 1, criado_em: '2026-10-07' },
            ] },
            // routes/pedidos.ts, GET /:id do projeto
            'GET /api/v1/projects/p1/pedidos/pd1': {
                pedido: { id: 'pd1', tipo: 'politica', titulo: 'Política: A.5.1 Políticas', papel_exigido: 'ceo', status: 'recusado', hash: 'h' },
                sem_link: 0,
                destinatarios: [{ email: 'dir@cliente.com', nome: 'Davi', status: 'recusado', situacao: 'recusado', decidido_em: '2026-10-07', motivo: 'Falta a seção de backup', versao_anterior: null, portal_antigo: null }],
            },
        });
        await window.renderCienciaLink($('alvo'), 'p1');
        expect($('alvo').textContent).toContain('Política: A.5.1 Políticas');
        expect($('alvo').textContent).toContain('Aprovação da Direção Executiva');
        expect($('alvo').textContent).not.toContain('DPIA: Folha');
        await window.abrirAcompanhamento('p1', 'pd1');
        expect($('modal-content').textContent).toContain('Recusado');
        expect($('modal-content').textContent).toContain('Falta a seção de backup');
    });

    it('o modal da política mostra "Pedir aprovação" para quem pede, com o id do controle', async () => {
        const texto = 'Texto da política. '.repeat(10);
        servir({
            'GET /api/v1/projects/p1/controls/ctrl_b_a51/policy': { ok: true, control: { id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas', description: texto }, content: texto, hash: 'h', versions: [] },
            'GET /api/v1/policies/templates': { ok: true, templates: [] },
        });
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        const b = $('modal-content').querySelector('[data-action="abrirPedidoAprovacao"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p1', 'politica', 'ctrl_b_a51']);

        S.user = { role: 'org_user' };
        await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
        await espera();
        expect($('modal-content').querySelector('[data-action="abrirPedidoAprovacao"]')).toBeNull();
    });
});
```

- [ ] **Step 6: Run frontend test to verify it fails**

Run: `cd frontend && npx vitest run test/pedido-politica.test.js --pool=threads`
Expected: FAIL. O seletor oferece `ciente` para política, a lista filtra só ciência, o acompanhamento não mostra o motivo, e o modal da política não tem o botão.

- [ ] **Step 7: Frontend implementation**

Em `frontend/src/views/meus-pedidos.js`:

1. Ajuste o comentário do topo: "o modal com que a consultoria pede a aprovação de um documento (DPIA e política)".
2. Depois de `CAMPOS_DPIA`, acrescente os rótulos da política e use-os em `conteudoHtml`:

```js
const CAMPOS_POLITICA = [['title', 'Título'], ['description', 'Texto da política']];
```

```js
    const campos = tipo === 'dpia' ? CAMPOS_DPIA : tipo === 'politica' ? CAMPOS_POLITICA : Object.keys(conteudo).map((k) => [k, k]);
```

3. Em `abrirPedidoAprovacao`, troque a linha do `<select id="pn-papel">`

```js
                    ${Object.entries(PAPEIS).map(([v, r]) => `<option value="${v}">${escapeHTML(r)}</option>`).join('')}
```

por

```js
                    ${Object.entries(PAPEIS).filter(([v]) => tipo !== 'politica' || v !== 'ciente').map(([v, r]) => `<option value="${v}">${escapeHTML(r)}</option>`).join('')}
```

4. Em `SITUACAO`, troque `aprovado: 'Concluído'` por `aprovado: 'Aprovou'`.
5. Em `renderCienciaLink`, troque o filtro

```js
            .filter((p) => p.papel_exigido === 'ciente');
```

por

```js
            // Ciência por link e, desde o P2, aprovação de política: é aqui que quem pediu acompanha.
            .filter((p) => p.papel_exigido === 'ciente' || p.tipo === 'politica');
```

   Na tabela, acrescente a coluna "Pedido": no cabeçalho, troque `<th>Documento</th><th>Situação</th><th>Cientes</th>` por `<th>Documento</th><th>Pedido</th><th>Situação</th><th>Concluídos</th>`, e logo depois da célula do título acrescente:

```js
                <td>${escapeHTML(PAPEIS[p.papel_exigido] || p.papel_exigido)}</td>
```

   Troque o rótulo do cartão `Ciência por link (quem não tem conta)` por `Pedidos de ciência e de aprovação de políticas`, e a frase de lista vazia por `Nenhum pedido de ciência ou de aprovação de política neste projeto.`.
6. Em `abrirAcompanhamento`, acrescente o motivo da recusa à observação. Troque o início do array de `nota` por:

```js
    const nota = (d) => [
        d.motivo ? `motivo: ${d.motivo}` : '',
```

   O texto passa por `escapeHTML(nota(d))`, que já está na linha da tabela.

Em `frontend/src/views/compliance.js`, no rodapé do modal de política (o `<div style="display:flex; gap:8px">` que tem "Fechar", "Editar Documento" e "Imprimir"), acrescente depois do botão "Imprimir":

```js
                            ${window.podePedirAprovacao?.(S.user) ? `<button class="btn btn-secondary" data-action="abrirPedidoAprovacao" data-args='${escapeHTML(JSON.stringify([projectId, 'politica', ctrl.id]))}'>Pedir aprovação</button>` : ''}
```

O padrão é o do DPIA (`privacy.js:377`). Quem só tem conta `org_user` aprova pelo pedido, em "Meus pedidos".

- [ ] **Step 8: Run frontend tests**

Run: `cd frontend && npx vitest run test/pedido-politica.test.js test/politica-modal.test.js test/contrato-consumidores.test.js --pool=threads` e, na raiz, `npx vitest run test/contrato-tela-api.test.ts`
Expected: PASS. Se existir teste de frontend de "Meus pedidos" ou de ciência por link (`ls frontend/test | grep -i "pedido\|ciencia"`), rode-o também: a coluna nova e o rótulo `Aprovou` podem mudar texto que ele conferia.

- [ ] **Step 9: Commit**

```bash
git add src/schemas/domain.ts src/services/pedidos.ts src/routes/pedidos.ts frontend/src/views/meus-pedidos.js frontend/src/views/compliance.js test/pedido-politica.test.ts frontend/test/pedido-politica.test.js
git add -u   # o OpenAPI regenerado por `npm run openapi`
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
feat(politicas): aprovação de política por pedido, para a direção com conta só de leitura

O pedido de aprovação aceitava só DPIA. Agora aceita política (Líder SGSI ou
Direção): congela título e texto, é substituído quando o texto muda e, ao ser
aprovado, grava a assinatura no controle pela mesma assinaturaPolitica da
aprovação direta, com a autoridade da matriz de Governança. Quem pediu
acompanha a aprovação e a recusa, com o motivo, em Ciência de Políticas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verificação final e changelog

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Não publicado]`)

- [ ] **Step 1: Changelog**

Em `CHANGELOG.md`, em `## [Não publicado]` → `### Corrigido`, acrescente:

```markdown
- Políticas: a assinatura grava o Líder SGSI e a Direção (nome da matriz, data, IP e user-agent) com autoridade e segregação pela matriz de Governança, como ROPA, DPIA e evidência; assinar não reescreve mais o status do controle na SoA. Restaurar versão zera as assinaturas. O modal acha o controle em qualquer formato de id, salva a edição (antes sempre falhava) e o "Imprimir" abre o relatório da política.
```

e em `### Adicionado`:

```markdown
- `GET /api/v1/projects/:id/controls/:controlId/policy` (texto, SHA-256, assinaturas e versões) e `GET .../policy/report` (relatório para imprimir).
- Pedido de aprovação de política (Líder SGSI ou Direção): a direção com conta só de leitura aprova em "Meus pedidos", e a assinatura vai para o controle; quem pediu acompanha a aprovação e a recusa em "Ciência de Políticas".
```

- [ ] **Step 2: Typecheck e catracas**

Run: `npx tsc --noEmit && npx vitest run test/any-catraca.test.ts test/colunas-catraca.test.ts test/contrato-tela-api.test.ts`
Expected: sem erro; as catracas passam.

- [ ] **Step 3: Suíte completa (backend ~20 min, frontend)**

Run: `npx vitest run` (raiz) e `cd frontend && npx vitest run --pool=threads`
Expected: tudo verde, com exit 0. Cole o resumo final (`Test Files … passed`) e o exit code. "N/N passed" com exit 1 (rejeição não tratada) não conta.

- [ ] **Step 4: Build do frontend**

Run: `cd frontend && npm run build`
Expected: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
docs(changelog): política assinada pela matriz, por pedido, rotas de leitura e relatório

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Fora deste plano

- Conferir a autoridade de cada destinatário já na criação do pedido (decisão 5).
- Tela para revogar uma assinatura de política (decisão 6).
- O selo "ISO 27001 CONFORME" do modal aparece com uma assinatura só; não foi mexido.
- A senha da assinatura direta continua num `prompt()` nativo, com o texto visível, como antes.
