# P1 — Contrato tela↔API: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nenhuma chamada do frontend fica sem rota no backend, `api()` para de descartar campos da resposta, e cada tela que lia o campo errado passa a ler o que o handler devolve de verdade.

**Architecture:** um teste de backend (`test/contrato-tela-api.test.ts`) lê o fonte do frontend com `import.meta.glob(..., '?raw')`, extrai cada literal `/api/v1/...` (de `api()`, `fetch`, `window.open`, `lerOu`, `buscar`), normaliza o trecho dinâmico para `:p` e casa o resultado com `app.routes` do Hono, o mesmo recurso que `test/trilha-exclusao.test.ts:17` já usa. O que não casa só passa se estiver numa lista de tolerâncias com motivo e com a expansão dos valores reais, também verificada. No frontend, `api()` passa a desembrulhar só o envelope de lista pura (`{ ok: true, <uma lista> }`). Os testes dos consumidores dublam `fetch` com o corpo que o handler devolve e deixam o `api()` real no meio, porque dublar `api()` com o formato que a tela espera foi o que escondeu estes defeitos.

**Tech Stack:** Cloudflare Workers + Hono (backend, vitest no pool de Workers), frontend Vanilla JS com Vite (vitest + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-07-fatia-jornada-design.md` (seção 2, linha P1; seções 1, 3, 4 e 5)

## Global Constraints

- Testes de backend: `npx vitest run <arq>` na raiz. O pool é de Workers, com D1 real via `cloudflare:test` e helpers em `test/helpers/d1.ts`. Ler arquivo no teste só com `import.meta.glob(..., { query: '?raw', import: 'default', eager: true })`, porque o workerd não tem `node:fs` (padrão de `test/any-catraca.test.ts:14` e `test/sem-dado-de-cliente.test.ts:22`).
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads`. O pool padrão estoura o timeout nesta máquina.
- `test/any-catraca.test.ts` (TETO 557): código novo sem `any`. Este plano não cria handler de backend.
- Este plano **não cria rota**. Por isso não mexe em `src/trilha-exclusao.ts`, `src/openapi.ts`, no allow-list de `src/middleware/auth.ts` nem em `FORA_DO_AGENTE`.
- Frontend: CSP `script-src 'self'`, sem handler nem `<script>` inline, eventos por `data-action`, `escapeHTML` em todo dado interpolado.
- Sem i18n e sem framework: textos em PT-BR, Vanilla.
- Arquivos em UTF-8 sem BOM. `iconv` não existe nesta máquina: confira com `python -c "import sys;b=open(sys.argv[1],'rb').read();print(b[:3]==b'\xef\xbb\xbf')" <arq>`, que deve imprimir `False`.
- Nada de dado real de cliente em fixture: use `Acme`, `p1`, `tok123`.
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A suíte de backend completa leva ~20 min nesta máquina. Cada tarefa roda os testes focados, e a suíte completa só roda na Task 8.
- Fora deste plano: o modal de política (`GET /projects/:p/controls/:c/policy` e `/policy/report`) é do P2. As duas chamadas entram como tolerância temporária com o motivo "removida no P2".

## Decisões para o dono revisar

Em cada item, o custo indicado é o de a decisão estar errada.

1. **Nova regra do `api()`: desembrulha só quando o envelope é `{ ok: true, <uma lista> }`, sem outro campo.** Com qualquer outro campo, ou com duas listas, devolve o objeto inteiro. Custo: um consumidor que ficou fora da enumeração da Task 2 passa a receber objeto em vez de lista e mostra tela vazia. A enumeração vem com o comando que a reproduz.
2. **Histórico do chat de IA: a tela perde o recurso; não se cria rota.** Nada grava `ai_chat_history`: `git grep -n ai_chat_history -- src` só acha `src/manutencao.ts:76`, que é a retenção. Hoje o GET dá 404, cai no `catch` e mostra a lista vazia, e o "Limpar Histórico" dá erro. Custo: se o dono quiser o histórico, é recurso novo (gravar a conversa, retenção LGPD, duas rotas), não correção.
3. **O questionário de autoatendimento fica só no link público `?assessment=<token>`.** Saem o atalho "Responder Questionário" do dashboard do cliente e o ramo `self-service` do roteador. O atalho mandava o **id** do assessment (`S.clientAssessmentId`) numa chave que o roteador não lia (`assessmentId` × `currentAssessmentId`), e a rota pública exige o **token** (`access_token`). Ela também devolve 410 quando o assessment já virou projeto (`src/services/fechar-venda.ts:110`). O botão aparecia e nunca funcionava. Custo: se o cliente deve responder logado, falta uma rota que entregue o token a ele, e o assessment não pode estar convertido.
4. **Falha ao salvar um bloco do questionário passa a impedir o avanço.** Antes, `ssNext` engolia o erro (`catch(e) {}`) e terminava em "Assessment Concluido!" sem ter salvo nada. Custo: quem tem rede instável vê erro e repete o bloco, em vez de um sucesso falso.
5. **O logout não espera o servidor.** É um `fetch` sem `await`, com `keepalive`, e a falha é ignorada. Custo: se a rede cair nesse instante, a chave da sessão fica no KV até expirar, que é o comportamento de hoje.
6. **"Alteração de escopo" passa a gravar** (os nomes de campo do POST não casavam com `scopeChangeSchema`, então a gravação sempre dava 400). A tela continua pondo o escopo novo só em `S.activeProject.scope` (`frontend/src/globals.js:1688-1689`), mas o servidor grava uma solicitação `Pending` e não muda `projects.scope`, então depois de recarregar o escopo volta. Isso fica como está: a decisão de produto é do dono. Custo: o usuário pode achar que o escopo mudou.

## Achados da spec conferidos

Todos os achados da spec que tocam este plano se confirmaram no código (main `b8c9ff1`). Três têm nuance:

- **Certificação (`monitor.js:208`)**: o defeito não vem do desembrulho. `{ ok, certification }` não tem lista, então `api()` devolve o envelope inteiro, e a tela lê `cert.id`, que vale `undefined`. Por isso ela mostra sempre "Nenhum tracker".
- **Fases/config "em globals.js"**: `globals.js:1485` só consome `S.checklistsConfig`, que `project.js:119` preenche errado. A correção fica em um lugar só: a regra do `api()`.
- **Rotas que faltam**: além do autoatendimento e do histórico do chat, o teste de contrato acha só as chamadas com ação dinâmica no caminho (tolerâncias com expansão verificada) e as duas do P2. A lista completa está na Task 1.

Achados novos, que nenhum levantamento da spec registrou:

- **`ASSESSMENT_BLOCKS` não existe no bundle de produção.** `frontend/src/data/assessment.js` só exporta a constante, ninguém a importa, e o Vite descarta o módulo. `globals.js:1718` e `commercial.js:285` a leem como global, sem import. Conferido no ar: `/health` devolve `"version":"b8c9ff13148c46a71b5a7d77e7924a788e8b3745"`, e `grep -c "Qualificacao e Perfil"` no `login-gjjKrBcT.js` servido dá `0`. O autoatendimento cairia em "Assessment blocks not loaded" mesmo com o caminho certo, e o levantamento do consultor (`renderAssessmentDetail`) lança `ReferenceError`. A correção (uma linha) está na Task 4.
- **"Alteração de escopo" nunca gravou.** `submitScopeChange` (`globals.js:1673-1686`) manda `new_scope`, `change_reason`, `security_impact` e `approved_by`, mas `scopeChangeSchema` (`src/schemas/domain.ts:294-301`) exige `change_description`, o que dá 400. O histórico (`globals.js:1627`) lê `res.changes` de uma rota que devolve a lista crua (`src/routes/projects.ts:746-750`) e mostra colunas que a tabela não tem. Isso bate com as 0 linhas de `scope_changes` em produção. A correção está na Task 3.
- **`monitor.js:146` (carteira) quebraria com a regra nova**: ela espera lista de `{ ok, portfolio, projects }`. A correção está na Task 2.

---

### Task 1: Teste de contrato tela↔API

**Files:**
- Create: `test/contrato-tela-api.test.ts`

**Interfaces:**
- Consumes: `app.routes` (Hono; `import app from '../src/index'`, como `test/trilha-exclusao.test.ts:3,17`).
- Produces: a lista `TOLERADAS` em `test/contrato-tela-api.test.ts`. As Tasks 4 e 5 **apagam** as entradas marcadas `corrigida na Task N`. O teste reprova tolerância sem chamada correspondente, então a tarefa que corrige a chamada é obrigada a apagar a entrada.

Medição de partida (protótipo rodado em 2026-10-07 sobre `b8c9ff1`): **301 chamadas extraídas, 14 sem rota**:

| Chamada (método `*` = `fetch`/`window.open`, método desconhecido) | Onde | Destino |
|---|---|---|
| `* /api/v1/public/assessment/:p` (×2) | `globals.js:1705`, `commercial.js:514` | corrigida na Task 4 |
| `* /api/v1/public/assessment/:p/answers` (×2) | `globals.js:1805`, `commercial.js:614` | corrigida na Task 4 |
| `GET /api/v1/projects/:p/chat/history` | `views/ai.js:12` | corrigida na Task 5 |
| `DELETE /api/v1/projects/:p/chat/history` | `views/ai.js:52` | corrigida na Task 5 |
| `GET /api/v1/projects/:p/controls/:p/policy` | `compliance.js:1701` | tolerância temporária, removida no P2 |
| `* /api/v1/projects/:p/controls/:p/policy/report` | `compliance.js:2436` | tolerância temporária, removida no P2 |
| `POST /api/v1/servicos/:p/:p` | `catalogo.js:318` (`arquivar`/`reativar`, linhas 326-327) | tolerância permanente com expansão |
| `POST /api/v1/pedidos/:p/:p` | `meus-pedidos.js:127` (`aprovar`/`recusar`, linhas 142-143) | tolerância permanente com expansão |
| `* /api/v1/public/pedidos/:p` | `public/politicas.js:60` (`ver`/`codigo`/`ciencia`, linhas 104, 122, 142) | tolerância permanente com expansão |
| `* /api/v1/public/propostas/:p` | `public/proposta.js:10` (`ver`/`aceitar`/`ajuste`/`recusar`, linhas 95, 168, 180, 199) | tolerância permanente com expansão |
| `* /api/v1/projects/:p/export/:p` | `monitor.js:176` (`risks`/`vendors`/`training`/`assets`, linhas 121, 144, 1662) | tolerância permanente com expansão |
| `* /api/v1/auth/mfa/:p` | `api.js:42` | prefixo de `startsWith`, não é chamada |

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import app from '../src/index';

/**
 * Contrato tela↔API (fatia de jornada, P1). Toda chamada do frontend a /api/v1 precisa casar
 * com uma rota registrada no app. Os testes de frontend dublam `api()`/`fetch` com o formato
 * que a TELA espera, então rota inexistente ou caminho errado passava neles e só aparecia como
 * 404 em produção (o questionário de autoatendimento chamava /public/assessment, a rota é
 * /assessments/public). Lado da tela: o fonte, via `?raw` (o workerd não tem node:fs). Lado do
 * servidor: `app.routes`, como em test/trilha-exclusao.test.ts.
 */
const FONTES = import.meta.glob(
  ['../frontend/src/**/*.js', '../frontend/public/*.{js,html}', '../frontend/login.html', '!../frontend/public/marked.min.js'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

type Chamada = { onde: string; metodo: string | null; caminho: string };

// Literal que começa em /api/v1: template (com `${...}` dentro, inclusive `${API_BASE}` na
// frente) ou string entre aspas simples/duplas.
const LITERAL = /`(?:\$\{API_BASE\})?(\/api\/v1(?:[^`$]|\$(?!\{)|\$\{[^}]*\})*)`|(['"])(\/api\/v1[^'"\n]*)\2/g;

/** Extrai as chamadas de um fonte: `${x}` e `'.../' + x` viram `:p`; query string sai. */
export function chamadasDoFonte(arquivo: string, src: string): Chamada[] {
  const out: Chamada[] = [];
  for (const m of src.matchAll(LITERAL)) {
    const inicio = m.index ?? 0;
    const metodo = /api\(\s*'([A-Z]+)'\s*,\s*$/.exec(src.slice(Math.max(0, inicio - 40), inicio))?.[1] ?? null;
    let caminho: string;
    if (m[1] !== undefined) {
      const cru = m[1];
      // `${x}` logo depois de `/` é segmento; em outro lugar (`readiness-check${q}`) é sufixo/query.
      caminho = cru.replace(/\$\{[^}]*\}/g, (_x: string, pos: number) => (cru[pos - 1] === '/' ? ':p' : ''));
    } else {
      caminho = m[3];
    }
    // Concatenação: '/a/' + id + '/b' → /a/:p/b. Expressão depois de literal sem `/` final é
    // sufixo (ex.: '/api/v1/funil' + consulta) e não vira segmento.
    let resto = src.slice(inicio + m[0].length, inicio + m[0].length + 120);
    for (;;) {
      const expr = /^\s*\+\s*(?![`'"])[\w$.]+(?:\([^)]*\))?/.exec(resto);
      if (!expr) break;
      if (caminho.endsWith('/')) caminho += ':p';
      resto = resto.slice(expr[0].length);
      const lit = /^\s*\+\s*(['"])([^'"]*)\1/.exec(resto);
      if (!lit) break;
      caminho += lit[2];
      resto = resto.slice(lit[0].length);
    }
    caminho = caminho.split('?')[0];
    if (caminho.endsWith('/')) caminho += ':p';
    out.push({ onde: `${arquivo}:${src.slice(0, inicio).split('\n').length}`, metodo, caminho });
  }
  return out;
}

// `ALL` é middleware (`app.use`), não rota; `/*` é o catch-all de assets, que casaria tudo.
const ROTAS = app.routes
  .filter((r) => r.method !== 'ALL' && r.path !== '/*')
  .map((r) => ({ metodo: r.method, segmentos: r.path.replace(/(.)\/$/, '$1').split('/') }));

/** `:p` do frontend só casa com parâmetro da rota, nunca com segmento literal (ação dinâmica vai para TOLERADAS). */
function casa(metodo: string | null, caminho: string): boolean {
  const seg = caminho.split('/');
  return ROTAS.some((r) =>
    (metodo === null || r.metodo === metodo)
    && r.segmentos.length === seg.length
    && r.segmentos.every((s, i) => s.startsWith(':') || s === seg[i]));
}

const chave = (c: { metodo: string | null; caminho: string }) => `${c.metodo ?? '*'} ${c.caminho}`;

/**
 * Chamadas que não casam sozinhas, cada uma com o motivo. `expande` lista os caminhos reais que
 * o trecho dinâmico produz no fonte (cada um tem de casar uma rota). Entrada sem chamada
 * correspondente reprova: tolerância velha não fica para trás.
 */
const TOLERADAS: { chave: string; motivo: string; expande: string[] }[] = [
  { chave: 'POST /api/v1/servicos/:p/:p', motivo: 'catalogo.js mudarSituacao(id, acao)', expande: ['POST /api/v1/servicos/:p/arquivar', 'POST /api/v1/servicos/:p/reativar'] },
  { chave: 'POST /api/v1/pedidos/:p/:p', motivo: 'meus-pedidos.js enviarDecisao(id, acao)', expande: ['POST /api/v1/pedidos/:p/aprovar', 'POST /api/v1/pedidos/:p/recusar'] },
  { chave: '* /api/v1/public/pedidos/:p', motivo: 'public/politicas.js postLink(acao)', expande: ['POST /api/v1/public/pedidos/ver', 'POST /api/v1/public/pedidos/codigo', 'POST /api/v1/public/pedidos/ciencia'] },
  { chave: '* /api/v1/public/propostas/:p', motivo: "public/proposta.js: const API = '/api/v1/public/propostas/'; chamar(acao)", expande: ['POST /api/v1/public/propostas/ver', 'POST /api/v1/public/propostas/aceitar', 'POST /api/v1/public/propostas/ajuste', 'POST /api/v1/public/propostas/recusar'] },
  { chave: '* /api/v1/projects/:p/export/:p', motivo: 'monitor.js exportCSV(type)', expande: ['GET /api/v1/projects/:p/export/risks', 'GET /api/v1/projects/:p/export/vendors', 'GET /api/v1/projects/:p/export/training', 'GET /api/v1/projects/:p/export/assets'] },
  { chave: '* /api/v1/auth/mfa/:p', motivo: 'api.js: prefixo de startsWith que isenta o 401 do MFA; não é chamada', expande: ['POST /api/v1/auth/mfa/verify'] },
  // Temporárias: rota inexistente, chamada que sai no P2 (modal de política).
  { chave: 'GET /api/v1/projects/:p/controls/:p/policy', motivo: 'modal de política; removida no P2', expande: [] },
  { chave: '* /api/v1/projects/:p/controls/:p/policy/report', motivo: 'Imprimir PDF da política; removida no P2', expande: [] },
  // Temporárias deste plano: cada tarefa que corrige a chamada apaga a entrada.
  { chave: '* /api/v1/public/assessment/:p', motivo: 'caminho errado do autoatendimento; corrigida na Task 4', expande: [] },
  { chave: '* /api/v1/public/assessment/:p/answers', motivo: 'caminho errado do autoatendimento; corrigida na Task 4', expande: [] },
  { chave: 'GET /api/v1/projects/:p/chat/history', motivo: 'histórico do chat sem rota; corrigida na Task 5', expande: [] },
  { chave: 'DELETE /api/v1/projects/:p/chat/history', motivo: 'limpar histórico sem rota; corrigida na Task 5', expande: [] },
];

const CHAMADAS = Object.entries(FONTES).flatMap(([arq, src]) => chamadasDoFonte(arq.replace(/^\.\.\//, ''), src));

describe('contrato tela↔API', () => {
  it('o teste não olha o vazio: há chamadas e rotas, e caminho inventado não casa', () => {
    expect(CHAMADAS.length).toBeGreaterThan(250);
    expect(ROTAS.length).toBeGreaterThan(100);
    expect(casa('GET', '/api/v1/nao-existe')).toBe(false);
    expect(casa('GET', '/api/v1/projects/:p/risks')).toBe(true);
    expect(casa('POST', '/api/v1/servicos/:p/:p')).toBe(false);
  });

  it('normaliza as formas de caminho que o frontend usa', () => {
    const src = [
      "api('GET', `/api/v1/projects/${p.id}/readiness-check${comIA ? '?ai=1' : ''}`)",
      "api('POST', '/api/v1/leads/' + lead.id + '/enrich-cnpj', { cnpj })",
      "fetch(API_BASE + '/api/v1/public/x/' + encodeURIComponent(t))",
      'fetch(`${API_BASE}/api/v1/projects/${id}/evidence/${e}/download`)',
      "api('GET', '/api/v1/funil' + consulta)",
      'window.open(`/api/v1/projects/${p}/ropa/report?token=${S.token}`)',
    ].join('\n');
    expect(chamadasDoFonte('f.js', src).map(chave)).toEqual([
      'GET /api/v1/projects/:p/readiness-check',
      'POST /api/v1/leads/:p/enrich-cnpj',
      '* /api/v1/public/x/:p',
      '* /api/v1/projects/:p/evidence/:p/download',
      'GET /api/v1/funil',
      '* /api/v1/projects/:p/ropa/report',
    ]);
  });

  it('nenhuma chamada monta o caminho fora de um literal /api/v1 (senão escaparia deste teste)', () => {
    // Cada uma destas recebe literais /api/v1 que o extrator já pega na origem.
    const PERMITIDAS = [
      'frontend/public/proposta.js: fetch(API + acao',
      'frontend/src/api.js: fetch(API_BASE + p',
      'frontend/src/views/propostas.js: api(\'GET\', caminho',
      'frontend/src/views/propostas.js: fetch(API_BASE + caminho',
    ];
    const DINAMICA = /\b(?:api\(\s*'[A-Z]+'\s*,|fetch\()\s*(?!(?:API_BASE\s*\+\s*)?['"`](?:\$\{API_BASE\})?\/api\/v1)[^,)\n]*/g;
    const achadas = Object.entries(FONTES)
      .flatMap(([arq, src]) => [...src.matchAll(DINAMICA)].map((m) => `${arq.replace(/^\.\.\//, '')}: ${m[0].trim()}`))
      .sort();
    expect(achadas).toEqual(PERMITIDAS);
  });

  it('toda chamada do frontend tem rota (ou tolerância com motivo)', () => {
    const toleradas = new Set(TOLERADAS.map((t) => t.chave));
    const orfas = CHAMADAS.filter((c) => !casa(c.metodo, c.caminho) && !toleradas.has(chave(c)));
    expect(orfas.map((c) => `${chave(c)} @ ${c.onde}`), 'chamada sem rota no backend').toEqual([]);
  });

  it('toda tolerância ainda tem chamada, e cada expansão casa uma rota', () => {
    for (const t of TOLERADAS) {
      expect(CHAMADAS.some((c) => chave(c) === t.chave && !casa(c.metodo, c.caminho)), `tolerância velha: ${t.chave}`).toBe(true);
      for (const e of t.expande) {
        const [metodo, caminho] = e.split(' ');
        expect(casa(metodo, caminho), `expansão sem rota: ${e}`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Rodar o teste**

Run: `npx vitest run test/contrato-tela-api.test.ts`
Expected: PASS, 5 testes. O teste nasce verde porque as 14 chamadas órfãs estão em `TOLERADAS`. A prova de que ele morde vem no Step 3.

- [ ] **Step 3: Provar que o teste reprova**

Comente temporariamente a entrada `'GET /api/v1/projects/:p/chat/history'` de `TOLERADAS` e rode de novo.
Run: `npx vitest run test/contrato-tela-api.test.ts -t "toda chamada"`
Expected: FAIL, com `GET /api/v1/projects/:p/chat/history @ frontend/src/views/ai.js:12` na lista. Descomente a entrada e rode outra vez: PASS.

- [ ] **Step 4: Commit**

```bash
git add test/contrato-tela-api.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "test: contrato tela↔API reprova chamada do frontend sem rota no backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `api()` desembrulha só lista pura; consumidores que a regra corrige ou quebra

**Files:**
- Modify: `frontend/src/api.js:78-86`
- Modify: `frontend/src/views/monitor.js:146-147` (carteira)
- Modify: `frontend/src/views/security.js:136-140` (comentário que deixa de ser verdade)
- Modify: `src/routes/pedidos.ts:326` e `src/routes/pedidos.ts:444` (comentários que deixam de ser verdade)
- Modify: `frontend/test/api.test.js:81-124`
- Create: `frontend/test/servir-api.js` (dublê de `fetch` compartilhado pelas Tasks 2, 3 e 6)
- Create: `frontend/test/contrato-consumidores.test.js`

**Interfaces:**
- Produces: `api()` agora segue esta regra: `{ ok: true, X: [...] }` (só `ok` e uma lista) devolve a lista; qualquer outro envelope com `ok: true` devolve o objeto inteiro.
- Produces: `frontend/test/servir-api.js` exporta `resposta(corpo, status = 200)` e `servir(rotas)`. `rotas` é `{ 'MÉTODO /caminho': corpo }`; caminho sem dublê responde 404 JSON, como o Worker.

Enumeração dos envelopes `ok: true` com lista e outro campo (antes perdiam tudo menos a primeira lista). Comando: `git grep -nE "ok: ?true" -- 'src/routes/*.ts'`, conferindo cada objeto à mão. As linhas multilinha foram lidas uma a uma.

| Rota (handler) | Envelope | Consumidor no frontend | Efeito da regra nova |
|---|---|---|---|
| `GET /projects/:id/interviews/:track` (`projects.ts:596`) | `interviews`, `questions` | `project.js:726` lê `res.questions` | **corrige** ("Sem perguntas" sempre) |
| `GET /phases/config` (`platform.ts:554`) | `titles` (lista), `checklists` | `project.js:103,119` lê `config.checklists` | **corrige** (recebia `titles`) |
| `GET /projects/:id/gap-analysis` (`projects.ts:1042`) | `total`…`gaps` | `monitor.js:187` lê `coverage_pct`, `by_status` | **corrige** (mostrava 0%) |
| `POST /projects/:id/generate-policies-bulk` (`policies.ts:390`) | `total`, `successful`, `failed`, `policies` | `compliance.js:2397` lê `res.ok`, `res.total` | **corrige** (o alerta nunca aparecia) |
| `POST /projects/:id/migrate-27701` (`projects.ts:831`) | `gaps`, `transformation_ratio`, `new_controls_created` | `compliance.js:2407` lê `res.ok` | **corrige** (o alerta nunca aparecia) |
| `POST /auth/mfa/activate` (`mfa.ts:90`) | `recovery_codes`, `aviso` | `security.js:141` aceita as duas formas | sem efeito (só o comentário muda) |
| `GET /portfolio` (`platform.ts:547`) | `portfolio`, `projects` | `monitor.js:12` aceita as duas formas; **`monitor.js:146` espera lista** | **quebraria**: corrigir |
| `POST /legal/accept` (`legal.ts:97`) | `...situacaoLegal` (`pendentes` + flags) | `globals.js:1276` não lê o retorno | sem efeito |
| `GET /projects/:id/data-subject`, `/retencao`, `GET /client/dashboard`, `GET /auditor/:token/project`, `GET /marketplace/templates`, `POST /migrate-27701-2025`, `POST /checklist/:item/audit` | várias | sem consumidor no frontend (`git grep` pelo caminho) | sem efeito |

Os envelopes de duas chaves (`{ ok, notes }`, `{ ok, templates }`, `{ ok, controls }` da rastreabilidade) continuam desembrulhados. Os consumidores que liam `.notes`/`.templates`/`.controls` deles são da Task 3.

- [ ] **Step 1: Escrever o dublê compartilhado**

`frontend/test/servir-api.js`:

```js
// Dublê de `fetch` para testes que deixam o `api()` REAL no meio. Cada rota devolve o corpo que o
// handler devolve (copie do src/routes, com arquivo:linha no teste). Dublar `api()` com o formato
// que a tela espera foi o que escondeu os defeitos do contrato tela↔API.
import { vi } from 'vitest';

export function resposta(corpo, status = 200) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => corpo,
        text: async () => JSON.stringify(corpo),
    };
}

/** `rotas`: { 'GET /api/v1/...': corpo }. Sem dublê: 404 JSON, como o Worker. */
export function servir(rotas) {
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return f;
}
```

- [ ] **Step 2: Escrever os testes que falham**

Em `frontend/test/api.test.js`, substitua o teste `'perde as chaves irmas quando o envelope tem array E outros dados'` (linhas 101-112, com o comentário "ARESTA AFIADA" acima) por:

```js
        // Antes a lista era devolvida e o resto sumia sem erro: a tela de entrevistas lia
        // `questions` e recebia `interviews`; a análise de lacunas recebia `gaps` e mostrava 0%.
        it('devolve o envelope inteiro quando ha lista E outros campos (mfa.ts:90)', async () => {
            fetchMock.mockResolvedValue(
                resposta({ ok: true, recovery_codes: ['a', 'b'], aviso: 'Guarde agora' })
            );
            const r = await api('POST', '/api/v1/auth/mfa/activate', { codigo: '123456' });
            expect(r).toEqual({ ok: true, recovery_codes: ['a', 'b'], aviso: 'Guarde agora' });
        });

        it('devolve o envelope inteiro quando ha duas listas (platform.ts:547)', async () => {
            const p = { id: 'p1' };
            fetchMock.mockResolvedValue(resposta({ ok: true, portfolio: [p], projects: [p] }));
            const r = await api('GET', '/api/v1/portfolio');
            expect(r.portfolio).toEqual([p]);
            expect(r.projects).toEqual([p]);
        });
```

Crie `frontend/test/contrato-consumidores.test.js`:

```js
// Contrato tela↔API do lado da tela (P1): o `api()` aqui é o DE VERDADE e só o `fetch` é dublado,
// com o corpo que cada handler devolve (arquivo:linha ao lado). Cada caso é uma tela que lia o
// campo errado e mostrava vazio sem erro.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/compliance.js';

const $ = (id) => document.getElementById(id);
const tela = () => [$('content'), $('header-title'), $('header-actions')];

beforeEach(() => {
    document.body.innerHTML = `
        <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
        <div id="content"></div><h1 id="header-title"></h1><div id="header-actions"></div>`;
    S.token = 'tok123';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('consumidores que o desembrulho antigo quebrava', () => {
    it('entrevistas: lê `questions` (projects.ts:596)', async () => {
        servir({ 'GET /api/v1/projects/p1/interviews/executiva': {
            ok: true, interviews: [],
            questions: [{ key: 'exec_vision', question: 'Qual a visão estratégica para segurança?' }],
        } });
        document.body.insertAdjacentHTML('beforeend', '<div id="interview-questions-container"></div><div id="interview-buttons-right"></div>');
        await window.changeInterviewTrack('p1', 'executiva');
        expect($('interview-questions-container').textContent).toContain('Qual a visão estratégica para segurança?');
    });

    it('jornada: S.checklistsConfig recebe `checklists`, não `titles` (platform.ts:554)', async () => {
        S.currentProject = { id: 'p1' };
        S.checklistsConfig = null;
        S.phaseQuestions = null;
        servir({
            'GET /api/v1/projects/p1/phases': { ok: true, phases: [{ phase_number: 0, status: 'in_progress' }] },
            'GET /api/v1/phases/config': { ok: true, titles: ['Fase 0'], checklists: { 0: [{ id: 'p0_1', text: 'Definir sponsor', category: 'Governança' }] } },
        });
        await window.renderProjectDetail(...tela());
        expect(S.checklistsConfig[0][0].id).toBe('p0_1');
    });

    it('análise de lacunas: lê coverage_pct e by_status (projects.ts:1042)', async () => {
        servir({ 'GET /api/v1/projects/p1/gap-analysis': {
            ok: true, total: 2, applicable: 2, by_status: { Implemented: 1, Missing: 1 }, coverage_pct: 50,
            controls_with_evidence: 1, controls_with_risks: 0,
            gaps: [{ control_id: 'c2', title: 'A.5.2', status: 'Missing', evidence_count: 0, risk_count: 0 }],
        } });
        await window.showGapAnalysis('p1');
        const t = $('modal-content').textContent;
        expect(t).toContain('50%');
        expect(t).toContain('Controles com evidencia: 1');
    });

    it('migrar 27701: mostra o resultado (projects.ts:831)', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        const alerta = vi.fn();
        vi.stubGlobal('alert', alerta);
        servir({ 'POST /api/v1/projects/p1/migrate-27701': { ok: true, gaps: [{ control_id: 'A.5.34' }], transformation_ratio: 0.5, new_controls_created: 3 } });
        await window.migrate27701('p1');
        expect(alerta.mock.calls[0][0]).toContain('Novos controles: 3');
    });

    it('políticas em lote: mostra total, sucesso e falhas (policies.ts:390)', async () => {
        vi.stubGlobal('prompt', vi.fn(() => 'A.5.1,A.5.2'));
        vi.stubGlobal('confirm', vi.fn(() => true));
        const alerta = vi.fn();
        vi.stubGlobal('alert', alerta);
        servir({ 'POST /api/v1/projects/p1/generate-policies-bulk': {
            ok: true, total: 2, successful: 1, failed: 1,
            policies: [{ control_id: 'A.5.1', success: true, content_preview: 'Política...' }, { control_id: 'A.5.2', success: false, content_preview: '' }],
        } });
        await window.bulkGeneratePolicies('p1');
        expect(alerta.mock.calls[0][0]).toContain('Sucesso: 1');
        expect(alerta.mock.calls[0][0]).toContain('Falhas: 1');
    });

    it('carteira: lê `portfolio` do envelope de duas listas (platform.ts:547)', async () => {
        const p = { id: 'p1', client_name: 'Acme', project_name: null, overall_progress_pct: 80, completed_phases: 3, phase_count: 41, risk_count: 0, evidence_count: 2 };
        servir({ 'GET /api/v1/portfolio': { ok: true, portfolio: [p], projects: [p] } });
        const [c, h, a] = tela();
        await window.renderPortfolio(c, h, a);
        expect(c.textContent).toContain('Acme');
    });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/api.test.js test/contrato-consumidores.test.js --pool=threads`
Expected: FAIL nos dois testes novos de `api.test.js` e em entrevistas, jornada, análise de lacunas, migrar 27701 e políticas em lote. A carteira PASSA agora: ela é a guarda contra a regressão do Step 5.

- [ ] **Step 4: Mudar a regra do `api()`**

Em `frontend/src/api.js`, troque as linhas 78-86 por:

```js
    // Desembrulha só o envelope de lista pura: `{ ok: true, <uma lista> }` e mais nada.
    // Com qualquer outro campo (ou duas listas) devolve o objeto inteiro: antes a primeira
    // lista vinha e o resto sumia sem erro (entrevistas sem `questions`, lacunas sem
    // `coverage_pct`, jornada recebendo `titles` no lugar de `checklists`).
    if (data && data.ok === true) {
        const chaves = Object.keys(data).filter((k) => k !== 'ok');
        if (chaves.length === 1 && Array.isArray(data[chaves[0]])) return data[chaves[0]];
    }
    return data;
}
```

- [ ] **Step 5: Rodar e ver a carteira quebrar**

Run: `cd frontend && npx vitest run test/contrato-consumidores.test.js --pool=threads`
Expected: só "carteira" FALHA (`monitor.js:147` zera o que não é lista).

- [ ] **Step 6: Corrigir a carteira e os comentários**

`frontend/src/views/monitor.js:146-147`, de:

```js
        try { portfolio = await api('GET', '/api/v1/portfolio'); } catch(e) {}
        if (!Array.isArray(portfolio)) portfolio = [];
```

para:

```js
        try { portfolio = (await api('GET', '/api/v1/portfolio'))?.portfolio || []; } catch(e) {}
```

`frontend/src/views/security.js:136-140`: troque o comentário por:

```js
    // `{ ok, recovery_codes, aviso }` vem inteiro do `api()` (envelope com mais de um campo).
    // Aceitar também a lista crua é defesa barata: exibir uma lista vazia aqui perderia os
    // códigos para sempre, porque o servidor guarda só o SHA-256 e nunca os mostra de novo.
```

`src/routes/pedidos.ts:326`: troque o comentário por `// Sem \`ok: true\` por histórico: o api.js desembrulhava a primeira lista. Hoje desembrulha só \`{ ok, <uma lista> }\`.`
`src/routes/pedidos.ts:444`: troque o comentário do fim da linha por `// sem \`ok: true\`: ver POST /ciencia`, que fica como está.

- [ ] **Step 7: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/api.test.js test/contrato-consumidores.test.js test/security-mfa.test.js --pool=threads`
Expected: PASS.

Run: `cd frontend && npx vitest run --pool=threads`
Expected: PASS. Se um teste existente quebrar porque dublava `fetch` com um envelope de lista e outro campo e esperava a lista, ele está fixando o comportamento antigo. Corrija o consumidor (não o teste) quando o consumidor espera lista, e acrescente a linha na tabela acima.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api.js frontend/src/views/monitor.js frontend/src/views/security.js src/routes/pedidos.ts frontend/test/api.test.js frontend/test/servir-api.js frontend/test/contrato-consumidores.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(api): desembrulha só envelope de lista pura; entrevistas, jornada, lacunas e lotes voltam a ler o que o servidor manda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Consumidores que liam campo que não vem (certificação, notas do auditor, rastreabilidade, templates, escopo)

**Files:**
- Modify: `frontend/src/views/monitor.js:208` (certificação)
- Modify: `frontend/src/views/monitor.js:1596-1597` (notas do auditor)
- Modify: `frontend/src/views/compliance.js:669` (rastreabilidade da SoA)
- Modify: `frontend/src/views/compliance.js:1725-1729` (templates de política)
- Modify: `frontend/src/globals.js:1624-1630`, `1661-1667`, `1673-1690` (alteração de escopo)
- Modify: `frontend/test/contrato-consumidores.test.js`
- Create: `frontend/test/globals-contrato.test.js`

**Interfaces:**
- Consumes: `servir`, `resposta` de `frontend/test/servir-api.js` (Task 2) e a regra nova do `api()`.
- Produces: `frontend/test/globals-contrato.test.js` com o preâmbulo de import do `globals.js`; a Task 6 acrescenta um `describe` nele.

| Tela | Resposta real | Lia | Passa a ler |
|---|---|---|---|
| Certificação (`monitor.js:208`) | `{ ok, certification }` (`certifications.ts:60-61`), sem lista, volta inteiro | `cert.id` do envelope | `.certification` |
| Notas do auditor (`monitor.js:1596`) | `{ ok, notes }` (`auditor.ts:91`), desembrulhado em lista | `res.notes` | a lista |
| Rastreabilidade da SoA (`compliance.js:669`) | `{ ok, controls }` (`projects.ts:972,1003`), desembrulhado | `r.controls` | a lista |
| Templates de política (`compliance.js:1725`) | `{ ok, templates }` (`policies.ts:521`), desembrulhado | `res.templates` | a lista |
| Histórico de escopo (`globals.js:1627`) | lista crua de `scope_changes` (`projects.ts:746-750`) | `res.ok && res.changes`, e colunas `approved_by`/`change_reason`/`security_impact`/`new_scope` | a lista; colunas `change_description`/`reason`/`impact_analysis`/`requested_by` (`schema.sql:992-1001`) |
| Registrar escopo (`globals.js:1674-1686`) | `scopeChangeSchema` exige `change_description` (`src/schemas/domain.ts:294-301`) | mandava `new_scope`… (400) | manda `change_description`, `reason`, `impact_analysis`, `requested_by` |

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `frontend/test/contrato-consumidores.test.js`:

```js
describe('consumidores que liam campo que a resposta não tem', () => {
    it('certificação: lê `certification` do envelope (certifications.ts:61)', async () => {
        S.activeProject = { id: 'p1' };
        servir({ 'GET /api/v1/projects/p1/certification': { ok: true, certification: {
            id: 'cert1', project_id: 'p1', standard: 'ISO 27001:2022', stage: 'Remediation',
            stage1_date: null, stage1_status: null, stage2_date: null, stage2_status: null, registrar: null, target_date: null,
        } } });
        const [c, h, a] = tela();
        await window.renderCertification(c, h, a);
        expect(c.textContent).toContain('Remediação & Implementação');
        expect(c.querySelector('[data-action="updateCertStage"]').dataset.args).toBe('["cert1"]');
    });

    it('certificação ausente: oferece iniciar (certifications.ts:60)', async () => {
        S.activeProject = { id: 'p1' };
        servir({ 'GET /api/v1/projects/p1/certification': { ok: true, certification: null } });
        const [c, h, a] = tela();
        await window.renderCertification(c, h, a);
        expect(a.querySelector('[data-action="initCertification"]')).not.toBeNull();
    });

    it('notas do auditor: a lista vem desembrulhada (auditor.ts:91)', async () => {
        servir({ 'GET /api/v1/projects/p1/auditor-notes': { ok: true, notes: [{
            id: 'n1', project_id: 'p1', control_id: null, note_type: 'evidence_request',
            content: 'Enviar a política assinada', response: null, control_standard: null, control_title: null,
        }] } });
        await window.openAuditorNotesModal('p1');
        expect($('auditor-notes-modal-content').textContent).toContain('Enviar a política assinada');
    });

    it('SoA: o mapa de rastreabilidade recebe a evidência de cada controle (projects.ts:1003)', async () => {
        S.activeProject = { id: 'p1', project_name: 'Projeto' };
        servir({
            'GET /api/v1/projects/p1/controls': { ok: true, controls: [{ id: 'c1', project_id: 'p1', title: 'A.5.1 — Políticas', status: 'Implemented' }] },
            'GET /api/v1/projects/p1/traceability': { ok: true, controls: [{
                id: 'c1', title: 'A.5.1 — Políticas', status: 'Implemented', risks: [],
                evidence: [{ id: 'e1', file_name: 'politica.pdf', created_at: '2026-10-01' }],
            }] },
        });
        await window.renderSoA(...tela());
        expect(window.currentSoATraceMap.c1.evidence).toHaveLength(1);
    });

    it('templates de política: viram opções do seletor (policies.ts:521)', async () => {
        servir({
            'GET /api/v1/controls': [],
            'GET /api/v1/policies/templates': { ok: true, templates: ['isms-policy', 'access-control-policy'] },
        });
        await window.openGeneratePolicyModal('p1', 'A.5.1');
        const opcoes = [...$('policy-template-select').options].map((o) => o.value);
        expect(opcoes).toEqual(['isms-policy', 'access-control-policy']);
    });
});
```

Crie `frontend/test/globals-contrato.test.js`:

```js
// Contrato tela↔API das funções de `src/globals.js`, com o `api()` real e só o `fetch` dublado.
// Mesmo preâmbulo de globals-ui.test.js: o módulo roda `initApp()` no import (sem token ele só
// mostra o overlay), então o overlay tem de existir antes.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
});

beforeEach(() => {
    document.body.innerHTML = `
        <div id="login-overlay" class="hidden"></div>
        <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
        <div id="content"></div>`;
    S.token = 'tok123';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('alteração de escopo (projects.ts:745-767)', () => {
    it('histórico: lê a lista crua e as colunas reais da tabela', async () => {
        servir({ 'GET /api/v1/projects/p1/scope-changes': [{
            id: 's1', project_id: 'p1', change_description: 'Incluir a API de pagamentos', reason: 'Produto novo',
            impact_analysis: 'Novos ativos de cartão', requested_by: 'ciso@acme.com.br', status: 'Pending', created_at: '2026-10-01 10:00:00',
        }] });
        await window.openScopeChangeModal('p1', { scope: 'Escopo atual' });
        const t = document.getElementById('modal-content').textContent;
        expect(t).toContain('Incluir a API de pagamentos');
        expect(t).toContain('Produto novo');
        expect(t).toContain('Novos ativos de cartão');
        expect(t).toContain('ciso@acme.com.br');
    });

    it('registrar: manda os campos que scopeChangeSchema exige', async () => {
        const f = servir({ 'POST /api/v1/projects/p1/scope-changes': { ok: true, id: 's2' } });
        document.body.insertAdjacentHTML('beforeend', `
            <textarea id="scope-new">Novo escopo</textarea><input id="scope-reason" value="Motivo">
            <textarea id="scope-impact">Impacto</textarea><input id="scope-approved-by" value="CISO">`);
        await window.submitScopeChange('p1', 'Escopo atual');
        const [, opts] = f.mock.calls.find(([u]) => String(u).endsWith('/scope-changes'));
        expect(JSON.parse(opts.body)).toEqual({ change_description: 'Novo escopo', reason: 'Motivo', impact_analysis: 'Impacto', requested_by: 'CISO' });
    });

    it('registrar recusado pelo servidor: avisa e não finge que gravou', async () => {
        servir({});
        document.body.insertAdjacentHTML('beforeend', `
            <textarea id="scope-new">Novo escopo</textarea><input id="scope-reason" value="Motivo">
            <textarea id="scope-impact"></textarea><input id="scope-approved-by" value="CISO">`);
        S.activeProject = { id: 'p1', scope: 'Escopo atual' };
        await window.submitScopeChange('p1', 'Escopo atual');
        expect(document.querySelector('.toast-error')?.textContent).toContain('alteração de escopo');
        expect(S.activeProject.scope).toBe('Escopo atual');
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/contrato-consumidores.test.js test/globals-contrato.test.js --pool=threads`
Expected: FAIL em certificação (os 2), notas do auditor, SoA, templates e nos 3 de escopo. O de "registrar recusado" falha porque o `api()` lança fora de `try` e o teste vê rejeição não tratada.

- [ ] **Step 3: Corrigir os consumidores**

`frontend/src/views/monitor.js:208`:

```js
        try { cert = (await api('GET', `/api/v1/projects/${proj.id}/certification`))?.certification ?? null; } catch(e) {}
```

`frontend/src/views/monitor.js:1596-1597`:

```js
            const res = await api('GET', `/api/v1/projects/${projectId}/auditor-notes`);
            const notes = Array.isArray(res) ? res : [];
```

`frontend/src/views/compliance.js:669`:

```js
                api('GET', `/api/v1/projects/${proj.id}/traceability`).then(r => (Array.isArray(r) ? r : [])).catch(() => [])
```

`frontend/src/views/compliance.js:1725-1729`:

```js
            const res = await api('GET', '/api/v1/policies/templates');
            templates = Array.isArray(res) ? res : [];
            options = templates.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
```

O `if (res && res.templates) { ... }` sai inteiro. As chaves de abertura e fechamento ficam conferidas com o `try {` / `} catch(e) {` que já cercam o bloco.

`frontend/src/globals.js:1624-1630` (dentro de `openScopeChangeModal`):

```js
        let history = [];
        try {
            // A rota devolve a lista crua de scope_changes (projects.ts:746-750).
            const res = await api('GET', `/api/v1/projects/${projectId}/scope-changes`);
            if (Array.isArray(res)) history = res;
        } catch(e) {}
```

`frontend/src/globals.js:1661-1667` (o item do histórico), com as colunas reais:

```js
                        <div style="padding:0.3rem 0; border-bottom:1px dashed rgba(255,255,255,0.03)">
                            <strong>Versão ${history.length - i}</strong> (${new Date(c.created_at).toLocaleDateString()}) - Por: ${escapeHTML(c.requested_by)}<br>
                            <strong>Motivo:</strong> ${escapeHTML(c.reason)}<br>
                            <strong>Impacto de Seg.:</strong> ${escapeHTML(c.impact_analysis)}<br>
                            <strong>Novo Escopo:</strong> ${escapeHTML(c.change_description)}
                        </div>
```

`frontend/src/globals.js:1686` (em `submitScopeChange`): troque `await api('POST', ...)` por:

```js
        // Nomes do scopeChangeSchema (src/schemas/domain.ts:294-301). Os da tela davam 400 sempre.
        try {
            await api('POST', `/api/v1/projects/${projectId}/scope-changes`, {
                change_description: body.new_scope,
                reason: body.change_reason,
                impact_analysis: body.security_impact,
                requested_by: body.approved_by,
            });
        } catch (e) {
            showToast('Erro ao registrar a alteração de escopo: ' + e.message, 'error');
            return;
        }
```

O resto da função fica como está (decisão 6).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/contrato-consumidores.test.js test/globals-contrato.test.js test/soa-sem-gerar.test.js test/soa-gate.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/monitor.js frontend/src/views/compliance.js frontend/src/globals.js frontend/test/contrato-consumidores.test.js frontend/test/globals-contrato.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(ui): certificação, notas do auditor, rastreabilidade, templates e escopo leem o que a API devolve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Questionário de autoatendimento chega na rota certa e com as perguntas

**Files:**
- Modify: `frontend/src/globals.js:1705-1707` e `1803-1810` (caminho, mensagem do servidor, falha ao salvar)
- Modify: `frontend/src/data/assessment.js` (pendurar `ASSESSMENT_BLOCKS` em `window`)
- Modify: `frontend/src/views/commercial.js:503-630` e `650-651` (apagar a duplicata)
- Modify: `frontend/src/router.js:66` (sai o ramo `self-service`)
- Modify: `frontend/src/views/dashboard.js:26-27` (sai o atalho)
- Modify: `frontend/test/globals-ui.test.js:156-175`, `frontend/test/dashboard-view.test.js:47-58`, `frontend/test/assessment-data.test.js`
- Modify: `test/contrato-tela-api.test.ts` (apagar as 2 tolerâncias `public/assessment`)

**Interfaces:**
- Consumes: `GET /api/v1/assessments/public/:token` → `{ id, client_name, status, answers }`, 404 `{ error: 'Token invalido' }`, 410 `{ error: 'Assessment ja foi convertido' }` (`src/routes/assessments.ts:185-202`). `POST /api/v1/assessments/public/:token/answers` com `{ block, answers }` → `{ ok, saved }` (`assessments.ts:204-226`). O `authMiddleware` libera esse prefixo (`src/middleware/auth.ts:122`).
- Produces: `window.ASSESSMENT_BLOCKS`, lido como global por `globals.js` e `commercial.js`.

Por que a duplicata de `commercial.js` sai: `main.js:10` importa `commercial.js` antes de `globals.js` (`main.js:33`), e os dois atribuem `window.renderSelfServiceAssessment`, `renderSelfServiceBlock`, `ssPrev` e `ssNext`. A de `globals.js` vence, então a de `commercial.js` é código morto, com o mesmo caminho errado e `API_BASE` sem import.

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/test/assessment-data.test.js`, acrescente:

```js
describe('ASSESSMENT_BLOCKS no bundle', () => {
  // globals.js e commercial.js leem `ASSESSMENT_BLOCKS` como global, sem import. Só com o export,
  // o Vite descartava o módulo: em produção (b8c9ff1) o autoatendimento caía em "Assessment
  // blocks not loaded" e o levantamento do consultor lançava ReferenceError.
  it('fica em window', () => {
    expect(window.ASSESSMENT_BLOCKS).toBe(ASSESSMENT_BLOCKS);
  });
});
```

Em `frontend/test/globals-ui.test.js`, no teste `'ssNext coleta as respostas do DOM...'` (linha 170), troque a expectativa do caminho por:

```js
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/assessments/public/tok123/answers');
```

e acrescente, dentro do mesmo `describe('renderSelfServiceBlock / ssPrev / ssNext')`:

```js
  it('ssNext com falha ao salvar: não avança, não conclui e mostra o motivo do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 410, json: async () => ({ error: 'Assessment ja foi convertido' }) })));
    window.ASSESSMENT_BLOCKS = BLOCKS;
    document.body.innerHTML = '<div id="content"><input class="ss-answer" data-key="q2" value="ok"></div>';
    window._ssBlock = BLOCKS.length - 1;
    window._ssAnswers = {};
    await window.ssNext();
    expect(window._ssBlock).toBe(BLOCKS.length - 1);
    expect(document.getElementById('content').textContent).not.toContain('Assessment Concluido');
    expect(document.querySelector('.toast-error')?.textContent).toContain('Assessment ja foi convertido');
    delete window.ASSESSMENT_BLOCKS;
    vi.unstubAllGlobals();
  });
```

e um `describe` novo no fim do arquivo:

```js
describe('renderSelfServiceAssessment', () => {
  const BLOCOS = [{ block: 1, title: 'Bloco Um', questions: [{ key: 'q1', type: 'text', text: 'Setor?' }] }];

  beforeEach(() => {
    document.body.innerHTML = '<div class="main"></div><div id="content"></div>';
    window.ASSESSMENT_BLOCKS = BLOCOS;
  });

  it('lê o questionário da rota real /api/v1/assessments/public/:token (assessments.ts:185)', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'as1', client_name: 'Acme', status: 'in_progress', answers: [] }) }));
    vi.stubGlobal('fetch', f);
    await window.renderSelfServiceAssessment('tok 1');
    expect(f.mock.calls[0][0]).toBe('http://api.test/api/v1/assessments/public/tok%201');
    expect(document.getElementById('content').textContent).toContain('Acme');
    delete window.ASSESSMENT_BLOCKS;
    vi.unstubAllGlobals();
  });

  it('410 (já virou projeto): mostra a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 410, json: async () => ({ error: 'Assessment ja foi convertido' }) })));
    await window.renderSelfServiceAssessment('tok123');
    expect(document.getElementById('content').textContent).toContain('Assessment ja foi convertido');
    delete window.ASSESSMENT_BLOCKS;
    vi.unstubAllGlobals();
  });
});
```

Em `frontend/test/dashboard-view.test.js`, substitua o teste `'mostra o CTA "Responder Questionário" quando há assessment liberado'` (linhas 47-58) por:

```js
  // O atalho mandava o id do assessment numa chave que o roteador não lia, e a rota pública exige
  // o token (e devolve 410 depois da venda). O questionário fica só no link público ?assessment=.
  it('assessment liberado: mostra "Em andamento", sem atalho para a tela self-service', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_admin' };
    S.clientAssessmentId = 'as-1';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Em andamento');
    expect(c.innerHTML).not.toContain('self-service');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/assessment-data.test.js test/globals-ui.test.js test/dashboard-view.test.js --pool=threads`
Expected: FAIL em "fica em window", no caminho do `ssNext`, em "falha ao salvar", nos 2 de `renderSelfServiceAssessment` e em "Em andamento".

- [ ] **Step 3: Implementar**

`frontend/src/data/assessment.js`, última linha nova depois do `];`:

```js

// globals.js (autoatendimento) e commercial.js (levantamento do consultor) leem como global.
// Sem isto o Vite descarta o módulo, que só exporta, e a constante some do bundle.
window.ASSESSMENT_BLOCKS = ASSESSMENT_BLOCKS;
```

`frontend/src/globals.js:1705-1707`:

```js
            const r = await fetch(API_BASE + '/api/v1/assessments/public/' + encodeURIComponent(token));
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Link invalido ou expirado');
```

A linha seguinte (`if (data.error) throw new Error(data.error);`) sai, porque fica coberta.

`frontend/src/globals.js:1803-1810` (o `// Save to API` dentro de `ssNext`):

```js
        // Save to API. Falhou: fica no bloco e diz o motivo (antes concluía sem ter salvo).
        try {
            const r = await fetch(API_BASE + '/api/v1/assessments/public/' + encodeURIComponent(window._ssToken) + '/answers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block: block.block, answers })
            });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        } catch (e) {
            showToast('Não foi possível salvar as respostas: ' + e.message, 'error');
            return;
        }
```

`frontend/src/views/commercial.js`: apague as linhas 503-630 (de `async function renderSelfServiceAssessment(token) {` até o `};` que fecha `window.ssNext`) e as linhas 650-651 (`window.renderSelfServiceAssessment = ...` e `window.renderSelfServiceBlock = ...`). Confira com `git grep -n "API_BASE\|_ssToken\|renderSelfService" -- frontend/src/views/commercial.js`, que não deve devolver nada.

`frontend/src/router.js:66`: apague a linha `else if (S.view === 'self-service') renderSelfServiceAssessment(S.currentAssessmentId);`.

`frontend/src/views/dashboard.js:26-27`:

```js
            } else if (S.clientAssessmentId) {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Em andamento</span>';
```

`test/contrato-tela-api.test.ts`: apague as entradas `'* /api/v1/public/assessment/:p'` e `'* /api/v1/public/assessment/:p/answers'` de `TOLERADAS`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/assessment-data.test.js test/globals-ui.test.js test/dashboard-view.test.js test/router.test.js --pool=threads`
Expected: PASS.

Run: `npx vitest run test/contrato-tela-api.test.ts test/assessments.test.ts`
Expected: PASS. A chamada nova `* /api/v1/assessments/public/:p/answers` casa com `POST /api/v1/assessments/public/:token/answers`.

- [ ] **Step 5: Conferir o bundle**

Run: `cd frontend && npx vite build && grep -c "Qualificacao e Perfil" $(ls -t dist/assets/login-*.js | head -1)`
Expected: `1` ou mais (era `0` em produção). `dist/` está no `.gitignore` e não entra no commit.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/globals.js frontend/src/data/assessment.js frontend/src/views/commercial.js frontend/src/router.js frontend/src/views/dashboard.js frontend/test/assessment-data.test.js frontend/test/globals-ui.test.js frontend/test/dashboard-view.test.js test/contrato-tela-api.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(assessment): autoatendimento chama /assessments/public, carrega os blocos no bundle e não conclui sem salvar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chat de IA sem histórico que não existe

**Files:**
- Modify: `frontend/src/views/ai.js:1-24` e `50-59`
- Modify: `frontend/test/ai-views.test.js:34-60`, `62-68` e `108-124`
- Modify: `test/contrato-tela-api.test.ts` (apagar as 2 tolerâncias `chat/history`)

**Interfaces:**
- Consumes: só `POST /api/v1/projects/:id/chat` → `{ ok, reply }` (`src/routes/ai.ts:11-45`), que fica como está.
- Produces: `window.clearChatHistory` deixa de existir.

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/test/ai-views.test.js`, substitua os testes `'histórico vazio ou resposta não-array...'` e `'histórico: alinha por papel e escapa o conteúdo'` por:

```js
  // Não há histórico no servidor: nada grava ai_chat_history e GET/DELETE /chat/history nunca
  // existiram (404 engolido pelo catch; "Limpar" dava erro).
  it('abre sem chamar a API e sem "Limpar Histórico"', async () => {
    S.activeProject = { id: 'p1' };
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(c.textContent).toMatch(/Faca uma pergunta/);
    expect(a.innerHTML).toBe('');
    expect(window.clearChatHistory).toBeUndefined();
  });
```

Em `comChat()`, apague a linha `apiMock.mockResolvedValueOnce([]);`. Apague o `describe('clearChatHistory', ...)` inteiro.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/ai-views.test.js --pool=threads`
Expected: FAIL em "abre sem chamar a API" (a tela chama `GET .../chat/history` e desenha o botão).

- [ ] **Step 3: Implementar**

`frontend/src/views/ai.js`: apague `import { render } from '../router.js';` (linha 4). Em `renderAIChat`, troque as linhas 10-13 (o `a.innerHTML` com o botão, o `let history`, o `try { history = await api(...) }` e o `if (!Array.isArray(history))`) por:

```js
        // ponytail: a conversa vive só nesta tela. O servidor não guarda histórico (nada grava
        // ai_chat_history; GET/DELETE /chat/history nunca existiram). Guardar conversa é decisão
        // de produto, com retenção LGPD, não correção.
        a.innerHTML = '';
```

Dentro do `c.innerHTML`, troque o bloco `${history.length ? history.map(...).join('') : '<div ...>Faca uma pergunta...</div>'}` só pelo `<div style="text-align:center;color:var(--muted);padding:3rem 0;font-size:0.8rem">Faca uma pergunta sobre ISO 27001, controles, audit preparation ou compliance.</div>`. Apague a função `clearChatHistory` (linhas 50-54) e a linha `window.clearChatHistory = clearChatHistory;`.

`test/contrato-tela-api.test.ts`: apague as entradas `'GET /api/v1/projects/:p/chat/history'` e `'DELETE /api/v1/projects/:p/chat/history'` de `TOLERADAS`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/ai-views.test.js test/delegation.test.js --pool=threads`
Expected: PASS.

Run: `npx vitest run test/contrato-tela-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ai.js frontend/test/ai-views.test.js test/contrato-tela-api.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(ia): chat deixa de pedir histórico a rotas que nunca existiram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Logout encerra a sessão no servidor

**Files:**
- Modify: `frontend/src/globals.js:464-474` (`doLogout`)
- Modify: `frontend/test/globals-contrato.test.js`

**Interfaces:**
- Consumes: `POST /api/v1/auth/logout` (`src/routes/auth.ts:418-425`). Ele lê o Bearer, apaga `session_<token>` e `<token>` do KV e devolve `{ ok: true }`. Não exige sessão válida (`auth.ts:104-106`) e passa pela barreira legal (`test/legal-aceite.test.ts:110-112`).
- Consumes: `API_BASE` (já importado em `globals.js:2`).

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `frontend/test/globals-contrato.test.js`:

```js
describe('doLogout encerra a sessão no servidor (auth.ts:418)', () => {
    it('com token: POST /api/v1/auth/logout com o Bearer, e esquece o token', () => {
        const f = servir({ 'POST /api/v1/auth/logout': { ok: true } });
        S.token = 'tok-1';
        window.doLogout();
        expect(f).toHaveBeenCalledTimes(1);
        const [url, opts] = f.mock.calls[0];
        expect(url).toMatch(/\/api\/v1\/auth\/logout$/);
        expect(opts).toMatchObject({ method: 'POST', keepalive: true, headers: { Authorization: 'Bearer tok-1' } });
        expect(S.token).toBeNull();
        expect(document.getElementById('login-overlay').classList.contains('hidden')).toBe(false);
    });

    it('sem token: não chama o servidor', () => {
        const f = servir({});
        S.token = null;
        window.doLogout();
        expect(f).not.toHaveBeenCalled();
    });

    it('rede caída no logout não impede sair nem vira erro solto', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
        S.token = 'tok-2';
        expect(() => window.doLogout()).not.toThrow();
        await new Promise((r) => setTimeout(r, 0));
        expect(S.token).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/globals-contrato.test.js --pool=threads`
Expected: FAIL em "com token" (o `fetch` nunca é chamado).

- [ ] **Step 3: Implementar**

Em `frontend/src/globals.js`, no começo de `window.doLogout` (linha 464), antes do `clearInterval`:

```js
        // Encerra a sessão no servidor: POST /auth/logout apaga a chave no KV. Antes só o
        // navegador esquecia o token, e quem o tivesse copiado seguia usando até expirar.
        // `fetch` direto, não `api()`: um 401 ali chamaria doLogout de novo. Sem `await`: sair
        // não espera a rede; `keepalive` deixa a requisição terminar se a página fechar.
        if (S.token) {
            fetch(API_BASE + '/api/v1/auth/logout', {
                method: 'POST', headers: { Authorization: `Bearer ${S.token}` }, keepalive: true,
            }).catch(() => {});
        }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/globals-contrato.test.js test/globals-shell.test.js test/api.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/globals.js frontend/test/globals-contrato.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(auth): sair encerra a sessão no servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Variáveis globais usadas sem import no frontend

**Files:**
- Create: `frontend/test/globais-sem-import.test.js`
- Modify: `frontend/src/views/monitor.js:2` (import de `API_BASE`)

**Interfaces:**
- Consumes: Task 4, que apaga a duplicata do questionário em `commercial.js`. Ali estavam os dois únicos usos de `API_BASE` do arquivo (`commercial.js:514,614`), então `commercial.js` sai sem edição própria.
- Produces: `frontend/test/globais-sem-import.test.js` com a lista `TOLERADOS`. O P4 corrige project.js, grc.js e compliance.js e apaga as três entradas dela.

Como cada nome chega a cada módulo (conferido em `b8c9ff1`):
- Pendurados também em `window`, e por isso globais legítimos sem import, fora do teste: `S`, `api`, `navigate`, `render`, `showToast`, `escapeHTML`, `openModal`, `closeModal`, `forceCloseModal`, `traduzStatus` e os demais exports de `ui.js` (`state.js:44`, `api.js:90`, `router.js:77-78`, `ui.js:283-287`…).
- Sem `window`: só `API_BASE` e `cabecalhosAuth` (`api.js:3,9`) e `TOAST_MS` (`ui.js`).
- Uma simulação em Python do teste abaixo acha exatamente 5 usos sem import, todos de `API_BASE`: `commercial.js`, `compliance.js`, `grc.js`, `monitor.js` e `project.js`. Cada um lança `ReferenceError` antes de o `fetch` sair. Em produção isso só não acontece porque o bundle do Vite põe tudo num escopo, o mesmo acaso que escondia `ASSESSMENT_BLOCKS`.

- [ ] **Step 1: Escrever o teste**

`frontend/test/globais-sem-import.test.js`:

```js
// Nome exportado por api.js/state.js/ui.js/router.js que NÃO vai para `window` só existe no
// módulo que o importa; usado sem import, vira ReferenceError (o fetch de upload/exportação nem
// sai). O bundle do Vite mascara isso ao juntar tudo num escopo. Os nomes que também vão para
// `window` (S, api, showToast, escapeHTML, render…) são globais legítimos e ficam de fora.
import { describe, it, expect } from 'vitest';

const FONTES = Object.fromEntries(Object.entries(
    import.meta.glob('../src/**/*.js', { query: '?raw', import: 'default', eager: true }),
).map(([k, v]) => [k.replace('../', ''), v]));

const DEFINIDORES = ['src/api.js', 'src/state.js', 'src/ui.js', 'src/router.js'];

/** Temporários: o P4 corrige estes arquivos no fluxo dele e apaga a linha. */
const TOLERADOS = [
    { arquivo: 'src/views/project.js', nome: 'API_BASE', motivo: 'corrigido no P4' },
    { arquivo: 'src/views/grc.js', nome: 'API_BASE', motivo: 'corrigido no P4' },
    { arquivo: 'src/views/compliance.js', nome: 'API_BASE', motivo: 'corrigido no P4' },
];

const tudo = Object.values(FONTES).join('\n');
const origem = {};
for (const d of DEFINIDORES) {
    for (const [, n] of FONTES[d].matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)) origem[n] = d;
    for (const [, g] of FONTES[d].matchAll(/export\s*\{([^}]*)\}/g)) for (const n of g.split(',')) origem[n.trim().split(/\s+as\s+/).pop()] = d;
}
const SEM_WINDOW = Object.keys(origem).filter((n) => !new RegExp(`window\\.${n.replace('$', '\\$')}\\s*=`).test(tudo));
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function usosSemImport() {
    const achados = [];
    for (const [arq, src] of Object.entries(FONTES)) {
        const importados = [...src.matchAll(/^import\s*\{([^}]*)\}/gm)].map((m) => m[1]).join(',');
        const codigo = semComentario(src);
        for (const n of SEM_WINDOW) {
            if (origem[n] === arq) continue;
            if (new RegExp(`(?<![.\\w$'"])${n}\\b`).test(codigo) && !new RegExp(`\\b${n}\\b`).test(importados)) achados.push(`${arq} ${n}`);
        }
    }
    return achados.sort();
}

describe('globais sem import no frontend', () => {
    it('acha os nomes sem window (o teste não olha o vazio)', () => {
        expect(SEM_WINDOW).toContain('API_BASE');
        expect(SEM_WINDOW).not.toContain('showToast');
    });

    it('nenhum arquivo usa nome sem window sem importá-lo', () => {
        const tolerados = TOLERADOS.map((t) => `${t.arquivo} ${t.nome}`);
        expect(usosSemImport().filter((a) => !tolerados.includes(a))).toEqual([]);
    });

    it('toda tolerância ainda corresponde a um uso sem import', () => {
        const achados = usosSemImport();
        for (const t of TOLERADOS) expect(achados, `tolerância velha: ${t.arquivo}`).toContain(`${t.arquivo} ${t.nome}`);
    });
});
```

Se o P4 rodar antes deste plano, os três arquivos já chegam corrigidos e `TOLERADOS` nasce vazia; o terceiro teste é o que avisa.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/globais-sem-import.test.js --pool=threads`
Expected: FAIL no segundo teste, com `['src/views/monitor.js API_BASE']` (`commercial.js` já saiu na Task 4).

- [ ] **Step 3: Corrigir monitor.js**

`frontend/src/views/monitor.js:2`: `import { api } from '../api.js';` → `import { api, API_BASE } from '../api.js';`

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/globais-sem-import.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/test/globais-sem-import.test.js frontend/src/views/monitor.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(ui): exportar CSV importa API_BASE; teste reprova global sem import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação final

**Files:** nenhum arquivo novo. Esta tarefa só mede e cola a saída.

- [ ] **Step 1: Contrato sem órfã fora das tolerâncias documentadas**

Run: `npx vitest run test/contrato-tela-api.test.ts`
Expected: PASS. `TOLERADAS` fica com **8 entradas**: 6 permanentes com expansão verificada e 2 marcadas "removida no P2". Confira com `grep -c "chave: '" test/contrato-tela-api.test.ts`, que deve dar `8`.

- [ ] **Step 2: Suíte do frontend**

Run: `cd frontend && npx vitest run --pool=threads`
Expected: PASS, sem "Unhandled Rejection" na saída. A memória do projeto registra que "N/N passed" pode vir com exit 1 por rejeição solta: confira o código de saída com `echo $?`, que deve dar `0`.

- [ ] **Step 3: Tipos e catraca**

Run: `npx tsc --noEmit && npx vitest run test/any-catraca.test.ts test/sem-dado-de-cliente.test.ts`
Expected: tsc sem saída; os dois testes passam.

- [ ] **Step 4: UTF-8 sem BOM nos arquivos tocados**

Run: `for f in $(git diff --name-only origin/main...HEAD); do python -c "import sys;b=open(sys.argv[1],'rb').read();print(sys.argv[1], b[:3]==b'\xef\xbb\xbf')" "$f"; done`
Expected: todas as linhas terminam em `False`.

- [ ] **Step 5: Suíte completa do backend (~20 min)**

Run: `npx vitest run`
Expected: PASS. Cole o resumo (`Test Files … passed`).

- [ ] **Step 6: Bundle**

Run: `cd frontend && npx vite build && grep -c "Qualificacao e Perfil" $(ls -t dist/assets/login-*.js | head -1) && grep -c "public/assessment/" $(ls -t dist/assets/login-*.js | head -1)`
Expected: o primeiro `≥ 1`; o segundo `0` (o `grep -c` sai com 1 nesse caso, o que é esperado).

## Review Focus

As cinco condições com mais chance de morder o usuário que um teste de tarefa não pegaria sozinho, e o teste que cada uma ganhou:

1. **Envelope que ficou fora da enumeração da Task 2.** Um consumidor que esperava lista de `{ ok, X: [...], outro }` passa a receber objeto e mostra vazio. Teste: o Step 7 da Task 2 roda a suíte inteira do frontend, e os dois casos de borda da regra (lista + campo, duas listas) estão em `api.test.js`. Resíduo: telas sem teste. Por isso a tabela da Task 2 traz o comando que refaz a enumeração.
2. **Teste de contrato que passa olhando o vazio.** Um extrator que não pega uma forma nova de montar caminho, ou uma rota `GET /api/v1/*` que case tudo. Testes (Task 1): o sanity com caminho inventado que não pode casar, o piso de 250 chamadas e 100 rotas, os fixtures do normalizador e o guarda de chamada com caminho dinâmico (`PERMITIDAS` exata).
3. **Logout que entra em laço ou trava a saída.** `api()` chama `doLogout` no 401; se `doLogout` usasse `api()`, o 401 do logout chamaria `doLogout` de novo. Testes (Task 6): `fetch` chamado uma vez só, sem token nenhuma chamada, e rede caída sem exceção nem rejeição solta.
4. **Autoatendimento que conclui sem salvar** (rede, 410 depois da venda). Teste (Task 4): "ssNext com falha ao salvar" não avança nem mostra "Concluido", e exibe a mensagem do servidor.
5. **Dado do questionário fora do bundle**, que o jsdom não vê porque importa o módulo direto. Teste (Task 4): `window.ASSESSMENT_BLOCKS` definido, mais o `grep` no bundle construído (Task 4 Step 5 e Task 8 Step 6).

Fora do alcance deste plano, e de propósito: o teste de contrato confere **caminho e método**, não **corpo**. A alteração de escopo (Task 3) mostrou que o corpo também diverge. Um contrato de corpo exigiria casar cada `api(m, p, corpo)` com o schema zod da rota (`src/openapi.ts` já enumera os corpos). Fica como candidato a fatia própria.
