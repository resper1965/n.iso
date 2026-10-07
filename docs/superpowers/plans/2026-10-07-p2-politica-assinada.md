# P2 — Política assinada de verdade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A assinatura de política grava CISO/CEO pela matriz de governança (como ROPA, DPIA e evidência), o modal e o relatório da política acham o controle em qualquer formato de id, e restaurar versão zera as aprovações.

**Architecture:** `handleControlApprove` (src/routes/controls.ts) passa a usar `autoridadeDeAssinatura`/`recusaDeAssinatura` e grava as quatro colunas do papel; o `status` do controle deixa de ser tocado. Duas rotas GET novas em src/routes/policies.ts (`/controls/:controlId/policy` e `/policy/report`), resolvidas por `idDoControle` e presas ao projeto pelo `projectAccessMiddleware`. O modal de política (frontend/src/views/compliance.js) passa a ler só a rota nova e a salvar pela rota de edição que já existe.

**Tech Stack:** Cloudflare Workers + Hono + D1; frontend Vanilla JS; testes Vitest (pool de Workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (P2 na seção 2; decisões da seção 3; critério 3 da seção 5).

## Global Constraints

- **Depende do P1.** Este plano assume que o `api()` de `frontend/src/api.js` já devolve o objeto inteiro quando a resposta tem `ok` e outros campos além de uma lista (entrega do P1). A rota `GET .../policy` responde `{ ok, control, content, hash, versions }`; com o `api()` antigo a tela receberia só `versions`. Os testes de frontend mockam o `api()` e NÃO pegam isso: a Task 4 começa conferindo que o P1 está na base.
- Testes de backend: `npx vitest run <arq>` na raiz (pool de Workers, D1 real via `cloudflare:test`; helpers em `test/helpers/d1.ts`: `applySchema`, `resetData`, `resetSessions`, `sessionFor`). `sessionFor({ id, email, role: 'platform_admin' })` dá platform_admin.
- INSERT em `projects` nos testes precisa de `standards` e `org_role`.
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads` (jsdom; o pool padrão estoura timeout nesta máquina). Padrão de mock do `api()` em `frontend/test/soa-sem-gerar.test.js`.
- `test/any-catraca.test.ts` (TETO 557): código novo sem `any`; em catch use `catch (e) { return erro500(c, '...', e); }`. A catraca também reprova se o número DESCER sem baixar o `TETO`: se a contagem cair, baixe o `TETO` para o valor medido no mesmo commit.
- Sem migration: as colunas `ciso_approved_*`/`ceo_approved_*` já existem em `compliance_controls` (`schema.sql:359-366`).
- Rotas novas deste plano são GET sem corpo: não entram em `src/openapi.ts`, não precisam de entrada no allow-list de escrita (`src/middleware/auth.ts:334-347`) nem em `src/trilha-exclusao.ts`. O agente MCP pode lê-las (leitura do próprio projeto); não entram em `FORA_DO_AGENTE`. A assinatura continua barrada para o agente pela própria regra: o e-mail do agente (`agente de …`) não está na matriz e não casa senha.
- Toda consulta presa ao projeto (`idDoControle` + `AND project_id = ?`).
- Frontend: CSP `script-src 'self'`, sem handler inline, eventos por `data-action`, `escapeHTML` em todo dado interpolado. Sem emoji nem ícone (inclusive no relatório HTML: nada de "✓").
- Arquivos em UTF-8 sem BOM.
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Suíte de backend completa leva ~20 min: tarefas rodam testes focados; a suíte completa só na Task 5.

## Decisões para o dono revisar

1. **Assinar política não muda mais `compliance_controls.status`.** Hoje a primeira assinatura grava `status='Approved'` (`src/routes/controls.ts:287-289`), sobrescrevendo o status da SoA (Missing/Partial/Compliant/N/A — `frontend/src/views/compliance.js:119-121`), inclusive o N/A justificado, e a tela conta `Approved` como sucesso (`compliance.js:779`, `:861`, `:1190`). "Vigente" passa a ser as duas assinaturas, que é o que o painel (`compliance.js:1611-1613`, `:1627`) e o readiness (`src/routes/readiness.ts:47-53`) já leem; é também o que a evidência faz (`src/routes/evidence.ts:276-286`). Os padrões vizinhos divergem: ROPA grava `Approved` já na primeira assinatura (`src/routes/ropa.ts:150-160`), DPIA só com as duas (`src/services/pedidos.ts:245-247`). Custo se errado: uma linha `status = CASE WHEN ceo_approved_by IS NOT NULL ... END`, como no DPIA. Linhas antigas com `status='Approved'` ficam como estão.
2. **Sem `role` no corpo, o papel sai do cargo na matriz** (Líder SGSI → `ciso`; só Direção → `ceo`), como em evidência (`evidence.ts:259-264`). A tela sempre manda `role`; o padrão só vale para quem chama a API sem ele. Custo se errado: tornar `role` obrigatório e ajustar o corpo em `test/contrato-isolamento-org.test.ts:68-69` e `test/contrato-isolamento-topo.test.ts:211-212`.
3. **Reassinar o mesmo papel sobrescreve o carimbo**, como ROPA e evidência; cada assinatura fica em `audit_logs` (`control.approved`). Custo: o carimbo anterior só existe na trilha.
4. **Aprovação de política por pedido fica fora.** `pedidoCriarSchema.tipo` segue só `'dpia'` (`src/schemas/domain.ts:654`) e `registrarDecisao` só sabe assinar DPIA (`src/services/pedidos.ts:284-289`). Consequência: quem assina política pela tela é `org_admin` ou equipe designada na matriz; `org_user`/`client` tomam 403 do allow-list (`src/middleware/auth.ts:329-351`, que bloqueia aprovação para papéis read-only de propósito). Custo: se a direção do cliente só tiver conta `org_user`, o critério 3 da spec ("a direção assina") não fecha sem um plano de "pedido de aprovação de política".
5. **Botão "Revogar aprovação" do controle fica fora.** A rota `POST /api/v1/controls/:id/revoke-approval` (`controls.ts:373-397`) continua sem tela. Corrigir assinatura errada = editar o texto (zera as duas, `controls.ts:110-118` e `policies.ts:493-495`) ou a rota via API/agente (com confirmação). Custo: o dono não tem como desfazer só uma assinatura pela tela.
6. **"Imprimir PDF" vira relatório HTML** no padrão de ROPA/DPIA (`ropa.ts:168-256`, `platform.ts:188-253`), impresso pelo navegador; o rótulo do botão passa a "Imprimir". Custo: nenhum PDF gerado no servidor.
7. **Salvar e restaurar pedem confirmação quando há assinatura** ("Mudar o texto anula as assinaturas já registradas"). Custo: um clique a mais.
8. **O prompt "Digite seu nome completo" sai da assinatura.** O servidor ignora `approved_by` do corpo; o carimbo é o nome da matriz. Pedir o nome sugeria o contrário.

## Achados conferidos

- Confirmado: `handleControlApprove` só grava `status='Approved'` (`controls.ts:287-289`), sem CISO/CEO e sem matriz.
- Confirmado: o modal chama `GET /api/v1/projects/:p/controls/:c/policy` (`compliance.js:1701`), que não existe (só o POST, `policies.ts:465`), e cai no fallback `ctrl-<código>` na lista global `/api/v1/controls` (`compliance.js:1694`, `:1712-1720`). O mesmo fallback está em `doGeneratePolicy` (`compliance.js:2098-2105`).
- Confirmado: "Imprimir PDF" abre `/policy/report` (`compliance.js:2435-2437`), que não existe.
- Confirmado: restaurar versão não zera as aprovações (`policies.ts:439-442`), ao contrário da edição (`policies.ts:493-495`), da geração (`policies.ts:58-60`, `:571-573`) e do PUT do controle (`controls.ts:110-118`).
- Confirmado e pior que o relatado: "Não há evidência vinculada" (`compliance.js:1979-1982`) é resquício. `evidenceId` só viria da rota GET que não existe, então **salvar edição pelo modal sempre falha**; a rota certa é `POST .../controls/:c/policy {text}` (`policies.ts:465-514`).
- Achado novo: o selo mostra "Calculando..." para sempre — `policyRes` é `const` dentro do `try` (`compliance.js:1701`) e o `typeof policyRes` da linha 1843 é sempre `undefined`.
- Achado novo: `signPolicy` usa o global `event` (`compliance.js:2163`) e mostra na tela o nome digitado, não o carimbado.
- Achado novo: o painel passa ao modal um código remontado do id (`compliance.js:1643-1659`), que erra para ids fora do padrão `ctrl-aNN` (ex.: `ctrl-a5` vira `A.5.0`). Passa a mandar o `ctrl.id`.
- Não precisa de migration (a spec fala da 0045): as colunas já existem.

## Review Focus

As cinco entradas mais prováveis de morder o usuário que um teste "caminho feliz" não cobre — cada uma tem teste na tarefa dona:

1. **Mesma pessoa com duas linhas na matriz (DPO e Diretora) tenta assinar como Direção** → 403 por segregação (Task 1, teste "duas linhas na matriz").
2. **Assinar não mexe no status da SoA** (Task 1: o primeiro teste confere que `status` continua `'Missing'` depois da assinatura).
3. **Id de controle de outro projeto na URL da política** (o genId de `p-d` pedido em `p-a`) → 404, e o código `A.5.1` resolve o controle do próprio projeto (Task 2).
4. **Título/texto com `<script>` no relatório HTML** sai escapado (Task 2).
5. **Controle inexistente no projeto abre o modal**: mostra o erro e não cai na lista global `/api/v1/controls` nem no formulário de geração (Task 4).

---

### Task 1: Assinatura de política pela matriz de governança

**Files:**
- Modify: `src/routes/controls.ts:1-3` (import), `src/routes/controls.ts:252-303` (`handleControlApprove`)
- Test: `test/signatures.test.ts` (describe "Aprovação de controle"), `test/api.test.ts:174-195`

**Interfaces:**
- Consumes: `autoridadeDeAssinatura(db, projectId, user): Promise<AutoridadeAssinatura>`, `recusaDeAssinatura(a, papel): string | null`, `type PapelAssinatura = 'ciso' | 'ceo'` (src/helpers.ts:404-480).
- Produces: `POST|PUT /api/v1/controls/:id/approve` com corpo `{ password, role? }` responde `{ ok: true, role, approved_by, approved_at }`; grava `<role>_approved_by/at/ip/ua`; não toca `status`. Recusa: 401 senha, 403 com a mensagem de `recusaDeAssinatura`.

- [ ] **Step 1: Write the failing tests**

Em `test/signatures.test.ts`, substitua o teste `'aprova com a senha correta e grava o status no banco'` (linhas 108-131) por estes, dentro do mesmo `describe('Aprovação de controle')`:

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
      expect(ctrl.ciso_approved_at).toBeTruthy();
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

Em `test/api.test.ts`, no teste `'mas o controle do próprio projeto continua editável e assinável'` (linhas 175-195): antes da chamada de assinatura, designe o `org_admin` na matriz, e troque a asserção de status pela da assinatura:

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
Expected: FAIL — `ciso_approved_by` é `null` (hoje só o status muda), `data.role` é `undefined`, e os testes de recusa (Segregação, Direção como ciso, fora da matriz, plataforma) recebem 200 em vez de 403.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/controls.ts`, linha 3, acrescente os helpers de assinatura ao import:

```ts
import { logAudit, requireResourceAccess, verifyPassword, erro500, projetosVisiveis, autoridadeDeAssinatura, recusaDeAssinatura, type PapelAssinatura } from '../helpers';
```

Substitua o trecho de `handleControlApprove` das linhas 287-299 (do `await c.env.DB.prepare(\`UPDATE compliance_controls SET status = 'Approved'` até o `return c.json({ ok: true, approved_by: approvedBy, approved_at: now });`) por:

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

    // `role` é o enum do schema ('ciso' | 'ceo'): só ele entra interpolado. O `status` não muda: ele é
    // o da SoA (Missing/Partial/Compliant/N/A); política vigente = as duas assinaturas, que é o que o
    // painel de políticas e o readiness leem.
    await c.env.DB.prepare(
      `UPDATE compliance_controls SET ${role}_approved_by = ?, ${role}_approved_at = ?, ${role}_approved_ip = ?, ${role}_approved_ua = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
    ).bind(approvedBy, now, ip, ua, controlId, targetProjectId).run();

    const quem = role === 'ciso' ? 'pelo Líder SGSI' : 'pela Direção Executiva';
    await logAudit(c.env.DB, 'control.approved', user.email, `Política do controle ${controlId} assinada ${quem} (${approvedBy}; IP: ${ip})`, '', '', targetProjectId);
    return c.json({ ok: true, role, approved_by: approvedBy, approved_at: now });
```

(O resto do handler — validação, 404, `requireResourceAccess` antes da senha, conferência da senha — fica como está. A ordem importa para os testes de isolamento: controle alheio continua 403 antes da senha.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/signatures.test.ts test/api.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/idor-tenant.test.ts test/any-catraca.test.ts`
Expected: PASS. Se a catraca acusar contagem MENOR que o `TETO`, baixe o `TETO` em `test/any-catraca.test.ts:19` para o número que ela mediu e rode de novo.

- [ ] **Step 5: Commit**

```bash
git add src/routes/controls.ts test/signatures.test.ts test/api.test.ts test/any-catraca.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
fix(politicas): assinatura de política grava CISO/CEO pela matriz de governança

A aprovação de controle só gravava status='Approved', sem quem assinou e sem
consultar a matriz. Agora segue ROPA, DPIA e evidência: autoridade e segregação
por autoridadeDeAssinatura/recusaDeAssinatura, carimbo com nome, data, IP e UA
do papel, e o status da SoA não é mais reescrito.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Rotas GET da política e do relatório

**Files:**
- Modify: `src/routes/policies.ts:5` (import), acrescentar as rotas depois de `policies.get('/api/v1/projects/:projectId/controls/:controlId/versions/:versionId', …)` (termina na linha 422)
- Test: `test/policies.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consumes: `idDoControle(db, projectId, ref): Promise<string | null>`, `sha256Hex(input: string): Promise<string>`, `escapeHtml(s: string): string`, `registraErro(c, e): string`, `erro500(c, msg, e)` (src/helpers.ts).
- Produces:
  - `GET /api/v1/projects/:projectId/controls/:controlId/policy` → `200 { ok: true, control: <linha de compliance_controls>, content: string, hash: string (SHA-256 hex de description), versions: { id, version, created_by, created_at }[] }` (versões em ordem decrescente); `404 { error: 'Controle não encontrado' }`.
  - `GET /api/v1/projects/:projectId/controls/:controlId/policy/report` → HTML (200) ou `404` HTML.
  - Função local `politicaDoControle(db, projectId, ref): Promise<{ control: ControleComPolitica; hash: string } | null>`, usada só pelas duas rotas desta task.

- [ ] **Step 1: Write the failing test**

No fim de `test/policies.test.ts`, acrescente (o `describe` fica no topo do arquivo, fora do `describe` existente, para não herdar o `beforeEach` dele). Acrescente `sha256Hex` ao import: `import { sha256Hex } from '../src/helpers';`.

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
    const r = await ler(`/api/v1/projects/p-a/controls/${GEN}/policy`);
    expect(r.status).toBe(404);
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/policies.test.ts`
Expected: FAIL — as rotas GET não existem: o catch-all de estáticos responde (status diferente de 200/404 JSON, `r.json()` falha ou `body.ok` indefinido).

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/policies.ts`, linha 5, acrescente `sha256Hex` ao import:

```ts
import { genId, idDoControle, logAudit, escapeHtml, erro500, registraErro, sha256Hex } from '../helpers';
```

Depois da rota `GET .../versions/:versionId` (linha 422), acrescente:

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

Se o teste de contrato tela↔API do P1 tiver exceção registrada para `GET /api/v1/projects/:p/controls/:p/policy` ou `.../policy/report` (rota que o front chama e o back não tinha), remova a exceção agora.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/policies.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/any-catraca.test.ts`
Expected: PASS. Os dois testes de isolamento varrem `app.routes` e passam a cobrir as rotas novas: conta de outra organização tem de tomar 403/404 nelas.

- [ ] **Step 5: Commit**

```bash
git add src/routes/policies.ts test/policies.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
feat(politicas): GET da política e relatório imprimível, com o controle em qualquer formato de id

O modal chamava GET .../controls/:c/policy e .../policy/report, que não
existiam. As duas rotas resolvem o controle por idDoControle, presas ao
projeto, e devolvem texto, SHA-256, estado das assinaturas e versões.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Restaurar versão zera as aprovações

**Files:**
- Modify: `src/routes/policies.ts` (import de `./controls`; o UPDATE de `restore-version`, linhas 439-442)
- Test: `test/policies.test.ts` (dentro do `describe('Edição manual de política (D1 real)')` existente)

**Interfaces:**
- Consumes: `COLUNAS_REVOGACAO: Record<'ciso' | 'ceo', string>` exportado por `src/routes/controls.ts:362-365`.
- Produces: `POST /api/v1/projects/:projectId/controls/:controlId/restore-version` grava o texto da versão e zera as oito colunas de aprovação; resposta inalterada (`{ ok, version, policy_markdown }`).

- [ ] **Step 1: Write the failing test**

Dentro do `describe('Edição manual de política (D1 real)')` de `test/policies.test.ts` (usa `PROJ`, `CONTROL_ID` e `headers` dele):

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
Expected: FAIL — `ciso_approved_by` continua `'Ana'`.

- [ ] **Step 3: Write minimal implementation**

Em `src/routes/policies.ts`, acrescente o import (perto das linhas 5-8):

```ts
import { COLUNAS_REVOGACAO } from './controls';
```

Troque o UPDATE de `restore-version` (linhas 439-442):

```ts
  // Texto restaurado é texto diferente do assinado: zera as duas aprovações, como a edição e a geração.
  await c.env.DB.prepare(
    `UPDATE compliance_controls SET description = ?, ${COLUNAS_REVOGACAO.ciso}, ${COLUNAS_REVOGACAO.ceo}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
  ).bind(row.policy_text, controlId, projectId).run();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/policies.test.ts test/pedidos-publico.test.ts`
Expected: PASS (o `pedidos-publico` exercita `conferirPedidosDoDocumento` na mesma família de rotas).

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
- Modify: `frontend/src/views/compliance.js` — painel (linha 1671), `openGeneratePolicyModal` (1686-2057), `doGeneratePolicy` (2097-2131), `signPolicy` (2144-2169), `openPolicyReport` (2435-2437)
- Test: Create `frontend/test/politica-modal.test.js`

**Interfaces:**
- Consumes: `GET /api/v1/projects/:p/controls/:c/policy` → `{ ok, control, content, hash, versions }` (Task 2); `POST /api/v1/controls/:id/approve {role, password}` → `{ ok, role, approved_by, approved_at }` (Task 1); `POST /api/v1/projects/:p/controls/:c/policy {text}` (já existe, `policies.ts:465`); `codigoDoControle(ctrl)` (`compliance.js:7-10`).
- Produces: `window.signPolicy(projectId, controlId, role)` (assinatura nova, três argumentos); `window.openGeneratePolicyModal(projectId, controlRef)` aceita id da linha ou código.

- [ ] **Step 0: Confira que o P1 está na base**

Run: `git log --oneline -5 -- frontend/src/api.js` e leia o bloco `if (data && data.ok === true)` de `frontend/src/api.js`.
Expected: o commit do P1 aparece e o `api()` devolve o objeto inteiro quando há mais de uma chave além de `ok`. Se não aparecer, PARE: sem o P1 o modal recebe só `versions` e quebra em produção, embora este teste passe (ele mocka o `api()`).

- [ ] **Step 1: Write the failing test**

Crie `frontend/test/politica-modal.test.js`:

```js
// O modal de política chamava GET .../policy (inexistente), caía na lista GLOBAL de controles
// procurando 'ctrl-<código>' e salvava edição por uma "evidência vinculada" que nunca existia.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';

const TEXTO = 'Texto da política de segurança da informação. '.repeat(5);
const controle = (extra = {}) => ({
  id: 'ctrl_b_a51', project_id: 'p1', title: 'A.5.1 Políticas de segurança da informação', description: TEXTO,
  ciso_approved_by: null, ciso_approved_at: null, ceo_approved_by: null, ceo_approved_at: null, ...extra,
});
const respostaPolitica = (ctrl) => ({ ok: true, control: ctrl, content: ctrl.description, hash: 'ab'.repeat(32), versions: [{ id: 'v1', version: 1, created_by: 'x@y.com', created_at: '2026-10-07' }] });
const espera = () => new Promise((r) => setTimeout(r, 0));
const modal = () => document.getElementById('modal-content');

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  apiMock.mockReset();
});

describe('modal de política', () => {
  it('lê só a rota do projeto, com o id como veio, e nunca a lista global', async () => {
    // Com uma assinatura: o selo (que mostra o hash) só aparece quando há assinatura.
    const ctrl = controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' });
    apiMock.mockImplementation(async (m, p) => (p.endsWith('/policy') ? respostaPolitica(ctrl) : { ok: true, templates: [] }));
    await window.openGeneratePolicyModal('p1', 'ctrl_b_a51');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/controls/ctrl_b_a51/policy');
    expect(apiMock.mock.calls.some(([, p]) => p === '/api/v1/controls')).toBe(false);
    expect(apiMock.mock.calls.some(([, p]) => p.endsWith('/versions'))).toBe(false);
    expect(modal().textContent).toContain('A.5.1');
    expect(modal().textContent).toContain('ab'.repeat(32));
    const assinar = modal().querySelector('[data-action="signPolicy"]');
    // o Líder SGSI já assinou: o único botão "Assinar" é o da Direção
    expect(JSON.parse(assinar.getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51', 'ceo']);
    expect(JSON.parse(modal().querySelector('[data-action="openPolicyReport"]').getAttribute('data-args'))).toEqual(['p1', 'ctrl_b_a51']);
  });

  it('controle que não existe no projeto mostra o erro, sem fallback nem formulário de geração', async () => {
    apiMock.mockImplementation(async (m, p) => {
      if (p.endsWith('/policy')) throw new Error('Controle não encontrado');
      return [];
    });
    await window.openGeneratePolicyModal('p1', 'A.9.9');
    expect(modal().textContent).toContain('Controle não encontrado');
    expect(modal().querySelector('#btn-gen-policy')).toBeNull();
    expect(apiMock.mock.calls.some(([, p]) => p === '/api/v1/controls')).toBe(false);
  });

  it('salvar edição grava pela rota de política do controle, sem depender de evidência', async () => {
    apiMock.mockImplementation(async (m, p) => (m === 'GET' && p.endsWith('/policy') ? respostaPolitica(controle()) : { ok: true, templates: [] }));
    await window.openGeneratePolicyModal('p1', 'A.5.1');
    const editar = document.getElementById('btn-edit-policy');
    editar.onclick();
    document.getElementById('policy-editor-textarea').value = 'Texto novo';
    editar.onclick();
    await espera();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/controls/ctrl_b_a51/policy', { text: 'Texto novo' });
    expect(modal().textContent).not.toContain('evidência vinculada');
  });

  it('salvar texto já assinado pede confirmação; sem ela, não grava', async () => {
    apiMock.mockImplementation(async (m, p) => (m === 'GET' && p.endsWith('/policy') ? respostaPolitica(controle({ ciso_approved_by: 'Ana', ciso_approved_at: '2026-10-07' })) : { ok: true, templates: [] }));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await window.openGeneratePolicyModal('p1', 'A.5.1');
    const editar = document.getElementById('btn-edit-policy');
    editar.onclick();
    editar.onclick();
    await espera();
    expect(confirmar).toHaveBeenCalled();
    expect(apiMock.mock.calls.some(([m]) => m === 'POST')).toBe(false);
    confirmar.mockRestore();
  });

  it('assinar pede só a senha e manda o papel para o id real do controle', async () => {
    apiMock.mockImplementation(async (m, p) => {
      if (m === 'POST') return { ok: true, role: 'ceo', approved_by: 'Direção', approved_at: '2026-10-07' };
      return p.endsWith('/policy') ? respostaPolitica(controle()) : { ok: true, templates: [] };
    });
    const pedir = vi.spyOn(window, 'prompt').mockReturnValue('senha');
    await window.signPolicy('p1', 'ctrl_b_a51', 'ceo');
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/controls/ctrl_b_a51/approve', { role: 'ceo', password: 'senha' });
    // reabre o modal com o estado gravado pelo servidor
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/controls/ctrl_b_a51/policy');
    pedir.mockRestore();
  });

  it('o relatório abre a rota de relatório da política', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    window.openPolicyReport('p1', 'ctrl_b_a51');
    expect(abrir.mock.calls[0][0]).toContain('/api/v1/projects/p1/controls/ctrl_b_a51/policy/report?token=');
    abrir.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/politica-modal.test.js --pool=threads`
Expected: FAIL — o modal chama `/versions` e `/api/v1/controls`, o `data-args` do botão é `["ctrl_b_a51","ciso"]`, a edição mostra "Não há evidência vinculada", e `signPolicy` pede o nome antes da senha.

- [ ] **Step 3: Write minimal implementation**

Todas as edições em `frontend/src/views/compliance.js`.

**3a.** Painel (linha 1671): o modal recebe o id da linha, não o código remontado (que erra fora do padrão `ctrl-aNN`):

```js
                        `<button data-action="openGeneratePolicyModal" data-args='["${proj.id}","${escapeHTML(ctrl.id)}"]' class="btn btn-ghost btn-sm">Visualizar / Gerar</button>`
```

**3b.** Logo antes de `async function openGeneratePolicyModal` (linha 1686), acrescente:

```js
    // Mudar o texto zera as duas assinaturas no servidor (policies.ts): quem clica precisa saber antes.
    function avisarQueAnulaAssinaturas(ctrl) {
        if (!ctrl.ciso_approved_by && !ctrl.ceo_approved_by) return true;
        return window.confirm('Mudar o texto anula as assinaturas já registradas desta política. Continuar?');
    }
```

**3c.** Em `openGeneratePolicyModal`, troque as linhas 1694-1720 (de `const normId = ...` até o fim do bloco `// 2. Fallback ...`) por:

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

**3d.** Troque a linha 1737 (`const hasPolicy = ...`) por:

```js
        const hasPolicy = policyText.length > 100 && !isDefaultDescription;
```

**3e.** Em `showGenerationFormHtml`, troque `${escapeHTML(controlId)}` por `${escapeHTML(codigo)}` nas duas ocorrências (título do modal, linha 1741, e `value` do input `policy-control-id`, linha 1744). O gerador usa o valor no prompt da IA e o resolve por `idDoControle`; o código é o que faz sentido nos dois.

**3f.** Troque as linhas 1772-1775 (o `let versions = []; try { versions = await api('GET', .../versions) ... } catch(e) {}`) por:

```js
            const versions = policyRes.versions || [];
```

**3g.** Nos dois botões "Assinar" (linhas 1798 e 1823), o `data-args` passa a levar projeto, id real e papel:

```js
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="signPolicy" data-args='["${projectId}","${escapeHTML(ctrl.id)}","ciso"]'>Assinar</button>
```

```js
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="signPolicy" data-args='["${projectId}","${escapeHTML(ctrl.id)}","ceo"]'>Assinar</button>
```

**3h.** Nos `data-args` do seletor de versão (linha 1834), do botão restaurar (1837), do "Visualizar" de versão (1884) e do relatório (1933), troque `"${controlId}"` por `"${escapeHTML(ctrl.id)}"`. Troque o rótulo do botão da linha 1933 de `Imprimir PDF` para `Imprimir`.

**3i.** Selo (linha 1843): troque

```js
            const evidenceHash = (typeof policyRes !== 'undefined' && policyRes) ? policyRes.evidence_hash : null;
```

por

```js
            const evidenceHash = policyRes.hash;
```

e, na linha 1855, troque `${evidenceHash || 'Calculando...'}` por `${escapeHTML(evidenceHash)}`.

**3j.** Título do modal (linha 1898): `Política Ativa — ${escapeHTML(controlId)}` vira `Política Ativa — ${escapeHTML(codigo)}`.

**3k.** Salvar edição: troque as linhas 1978-1999 (de `const newContent = ...` até o fim do `.catch(...)`) por:

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

**3l.** Em `window.doRestorePolicyVersion` (linha 2038), logo depois de `if (!verId) return;`, acrescente:

```js
                if (!avisarQueAnulaAssinaturas(ctrl)) return;
```

**3m.** Em `doGeneratePolicy`, troque o corpo do `if (res.ok) { ... }` (linhas 2097-2133, do `let ctrl = {};` até `btn.disabled = false;` antes do `} else {`) por:

```js
            if (res.ok) {
                // O modal da política mostra o texto gerado com as assinaturas, lidas do servidor.
                showToast('Política gerada. Revise o texto antes de pedir as assinaturas.');
                await openGeneratePolicyModal(projectId, controlId);
```

(O `} else { throw ... }` e o `catch` ficam como estão.)

**3n.** Troque `window.signPolicy` inteiro (linhas 2144-2169) por:

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

**3o.** `openPolicyReport` (linhas 2435-2437): codifique o id:

```js
window.openPolicyReport = function(projectId, controlId) {
    window.open(`/api/v1/projects/${projectId}/controls/${encodeURIComponent(controlId)}/policy/report?token=${S.token}`, '_blank');
};
```

Depois das edições, confira que não sobrou referência morta: `grep -n "normId\|evidenceId\|evidence_hash\|ctrl-' +" frontend/src/views/compliance.js` deve voltar vazio nas funções de política (o `codigoDoControle` e outras telas podem ter `ctrl-` próprio; confira cada linha).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/politica-modal.test.js test/soa-sem-gerar.test.js --pool=threads`
Expected: PASS.

Se o P1 entregou o teste de contrato tela↔API, rode-o também na raiz (`npx vitest run test/<arquivo do P1>`): as chamadas novas (`GET .../policy`, `POST .../policy`, `.../policy/report`) têm de casar com rota do backend.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/compliance.js frontend/test/politica-modal.test.js
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

### Task 5: Verificação final e changelog

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
```

- [ ] **Step 2: Typecheck e catraca**

Run: `npx tsc --noEmit && npx vitest run test/any-catraca.test.ts`
Expected: sem erro; catraca passa (se a contagem caiu, o `TETO` já foi baixado na Task 1).

- [ ] **Step 3: Suíte completa (backend ~20 min, frontend)**

Run: `npx vitest run` (raiz) e `cd frontend && npx vitest run --pool=threads`
Expected: tudo verde, exit 0. Cole o resumo final (`Test Files … passed`) e o exit code; "N/N passed" com exit 1 (rejeição não tratada) não conta.

- [ ] **Step 4: Build do frontend**

Run: `cd frontend && npm run build`
Expected: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -F - <<'EOF'
docs(changelog): política assinada pela matriz, rotas de leitura e relatório

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Fora deste plano

- Aprovação de política por pedido (stakeholder/conta read-only): exige `'politica'` em `pedidoCriarSchema.tipo` e assinatura de controle em `registrarDecisao` (decisão 4).
- Tela para revogar uma assinatura de política (decisão 5).
- O selo "ISO 27001 CONFORME" do modal (`compliance.js:1852`) aparece com uma assinatura só; não foi mexido.
- A senha da assinatura continua num `prompt()` nativo (texto visível), como antes.
