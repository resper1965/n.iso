# Avisos de prazo (sino + e-mail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prazo que vence deixa de passar em silêncio: uma rotina diária às 08:00 de Brasília avisa no sino e num e-mail-resumo, 7 dias antes, no dia e uma vez por semana enquanto estiver vencido, quem precisa agir (o responsável e o consultor do projeto).

**Architecture:** um serviço só, `src/services/avisos-prazo.ts`: seis consultas (uma por fonte) devolvem os itens não resolvidos com vencimento até hoje+7; uma função pura decide o marco do dia; os destinatários saem de uma consulta que repete, em SQL, a regra de alcance de `requireProjectAccess`; a idempotência é a UNIQUE de `avisos_prazo` (migration 0046), e a notificação entra no MESMO `db.batch` do registro, só se o registro entrou. O `scheduled` de `src/index.ts` despacha por `event.cron`. `sendEmail(c, ...)` vira invólucro de `enviarEmail(env, ...)`, que o cron usa.

**Tech Stack:** Cloudflare Workers (Hono) + D1 + Cron Triggers; Resend por `fetch`; frontend Vanilla JS; Vitest (pool de Workers no backend, jsdom no frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-avisos-de-prazo-design.md` (desenho aprovado pelo dono em 2026-10-07; este plano não reabre decisões dela).

## Global Constraints

- Repositório: worktree `C:/Users/resper/worktrees/avisos-prazo`, branch `feat/avisos-prazo` (HEAD de partida `37dbdfb`, que contém toda a fatia de jornada).
- Dia contado no fuso America/Sao_Paulo (UTC-3 fixo, sem horário de verão). Cron novo: `"0 11 * * *"` (08:00 em Brasília). Cron existente: `"10 4 * * *"` (manutenção), intacto.
- Marcos: `D-7`, `D0`, `atraso-<AAAA-Www>` (semana ISO). Item resolvido não gera aviso. `D-7` só vale no dia exato.
- Notificação: `type` = `prazo_<fonte>`; título curto ("CAPA vence em 7 dias", "Política A.5.1 precisa de revisão", "Auditoria hoje"); `link` leva à tela do item.
- E-mail: assunto `n.iso: N prazos para acompanhar` (singular quando N = 1), HTML simples, todo dado escapado com `escapeHtml`, lista agrupada por projeto, remetente padrão do produto (`n.iso <noreply@ness.com.br>`). Sem `RESEND_API_KEY`, só o sino.
- Isolamento: aviso nunca vai a usuário de outra organização; `platform_admin` nunca é destinatário (ver Decisões).
- Fora da v1 (spec seção 8): validade de evidência, antecedência configurável, opt-out pessoal, WhatsApp/Slack, tela de "próximos prazos". Não implemente.
- Schema muda em `schema.sql` (tabela no fim do arquivo, índice DEPOIS da tabela) **e** em `migrations/0046_avisos_prazo.sql` (`ls migrations/*.sql | tail -1` deve mostrar `0045_auditor_token_hash.sql` antes de criar). `*.sql` em LF. Migration remota é ação do dono: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` ("No migrations to apply") → `PRAGMA table_info(avisos_prazo)` → só então o merge (o `deploy.yml` recusa migration pendente).
- Código novo sem `any`. `test/any-catraca.test.ts` está com `TETO = 544` (medido em 2026-10-07: `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l` → 544) e reprova se subir **ou descer sem baixar o TETO**. A Task 1 tira um `any` (`sendEmail(c: any`): meça e baixe o TETO para o número medido. Em `catch`, use `catch (e)` e `e instanceof Error ? e.message : String(e)`.
- Testes de backend: `npx vitest run <arq>` na raiz (pool de Workers, D1 real via `cloudflare:test`; helpers em `test/helpers/d1.ts`: `applySchema`, `resetData`, `execSql`, `workerEnv`). Nada de mock do D1. Resend é `vi.spyOn(globalThis, 'fetch')`, como em `test/propostas-envio.test.ts:52`.
- INSERT em `projects` nos testes leva `standards` e `org_role`: `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001:2022','Controller','Active')`.
- Testes de frontend: `cd frontend && npx vitest run <arq> --pool=threads` (jsdom; o pool padrão estoura timeout nesta máquina).
- Arquivos em UTF-8 sem BOM (iconv não existe; confira com `python -c "print(open('<arq>','rb').read(3))"`, que não pode começar com `b'\xef\xbb\xbf'`).
- Comentários, mensagens e textos em português; nomes no padrão do repo (português nas funções de domínio, como `manutencaoDiaria`).
- Nenhuma rota nova: nada em `src/openapi.ts`, `src/trilha-exclusao.ts`, allow-list de `auth.ts` nem `FORA_DO_AGENTE`.
- A suíte completa de backend leva ~20 min: cada tarefa roda os testes focados; a suíte inteira só na Task 6.
- Commits: `git -c user.email=44273656+resper1965@users.noreply.github.com commit`, mensagem em português (conventional), terminando com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões para o dono revisar

1. **A UNIQUE inclui `vence_em`**: `UNIQUE(fonte, item_id, marco, user_id, vence_em)`, e não só as quatro colunas da spec. Custo se errado (ficar com a da spec): a revisão anual de política nunca avisaria de novo (a linha `D-7` do ano anterior tem ~365 dias e a retenção é 400), e CAPA ou auditoria com prazo adiado não teria `D-7`/`D0` do prazo novo.
2. **Coluna `titulo` em `avisos_prazo`** (o nome do item no dia do aviso). O e-mail reenviado no dia seguinte precisa do texto, e o item `D-7` de ontem já não está na lista de hoje. Custo se errado: nenhum funcional.
3. **Sem `RESEND_API_KEY` a rotina não chama o envio** (o `sendEmail` atual simula e devolve `true`, o que marcaria e-mail que não saiu) e deixa `email_enviado_em` nulo; o resumo só junta linhas criadas nos últimos 7 dias. Custo se errado: aviso com mais de 7 dias sem e-mail fica só no sino; sem o corte, configurar a chave mandaria um resumo com meses de prazos.
4. **O link do e-mail é o endereço do app (`appUrl(env)`)**, um só, no fim do e-mail. O SPA não roteia por URL (`frontend/src/router.js` não lê `location`; toda rota desconhecida cai em `/login`), então link profundo por item não abriria o item. O link de cada item fica na notificação do sino. Custo: um clique a mais.
5. **Nome de responsável que casa com duas ou mais pessoas do projeto não resolve** (o aviso vai ao consultor). E-mail sempre resolve. Custo: o responsável certo não recebe até o campo trazer o e-mail.
6. **`platform_admin` nunca recebe**, nem como responsável nem como último recurso. A regra do P3 (`src/services/fechar-venda.ts:140-144`) cai na plataforma quando a organização não tem `consultoria_admin`, mas isso contraria o isolamento da seção 4. Projeto sem responsável resolvido, sem consultor e sem `consultoria_admin` ativo não avisa ninguém e conta em `sem_destinatario` no log. Custo: esse projeto fica sem aviso.
7. **Resolvido = `corrective_actions.status = 'Closed'` e `audit_schedule.status = 'Completed'`** (os valores que `src/routes/capa.ts:24` e `src/routes/audits.ts:19` tratam como fechamento). Auditoria de qualquer `audit_type` (Internal, External, Surveillance, Certification) entra, não só a interna; por isso o título é "Auditoria hoje", sem "interna". Custo: aviso de auditoria externa que a consultoria talvez não quisesse.
8. **Não filtra por `projects.status`**: projeto parado continua avisando até o item ser resolvido. Custo: ruído em projeto encerrado sem fechar CAPA.
9. **Link do auditor vencido gera atraso semanal** (spec literal) até a purga de 90 dias da manutenção apagar o token. Custo: até ~13 avisos para um link que só precisava ser renovado ou revogado.
10. **Clicar no aviso troca o projeto ativo só em memória** (`S.activeProject`), sem gravar em `localStorage`. As telas de CAPA, Auditorias, Certificação e Políticas leem `S.activeProject`; sem a troca, o aviso do projeto B abria a lista do A. Custo: recarregar a página volta ao projeto salvo.

## Achados da spec conferidos

Confirmados no código (HEAD `37dbdfb`):
- Um único cron: `wrangler.jsonc:44-46` (`"10 4 * * *"`); staging desliga com `"crons": []` (`wrangler.jsonc:129-131`) e continua assim: staging não manda aviso.
- `scheduled` em `src/index.ts:561-563` chama só `manutencaoDiaria(env)` e ignora o evento.
- `sendEmail(c: any, ...)` em `src/helpers.ts:663` lê `c.env.RESEND_API_KEY`; 6 chamadores, todos com `c` (`git grep -n "sendEmail(" -- src`), e um teste chama `sendEmail({ env: {} }, ...)` (`test/propostas-envio.test.ts:236`).
- `createNotification` em `src/helpers.ts:118`. As datas existem: `corrective_actions.due_date`, `checklist_progress.due_date`, `audit_schedule.scheduled_date`, `certification_tracking.certificate_expiry` (todas TEXT), `auditor_tokens.expires_at` (DATETIME em UTC, gravado por `datetime('now', '+N days')`, `src/routes/projects.ts:1131-1133`) com `revoked_at`.
- Não há data de revisão de política: o texto vive em `compliance_controls.description` e as assinaturas em `ciso_approved_at`/`ceo_approved_at` (ISO, `new Date().toISOString()`), zeradas a cada edição do texto (`src/routes/policies.ts:60`).
- Regra de alcance: `requireProjectAccess` (`src/helpers.ts:374`) com `PROJETOS_DO_CONSULTOR_SQL` (`src/helpers.ts:203`) e `equipeAlcanca` (`src/helpers.ts:236`).
- `notifications` é lida só por `user_id` (`src/routes/platform.ts:510`), e o sino escapa título e mensagem (`frontend/src/globals.js:936-937`).

Não confirmados ou diferentes do relatado:
- "`createNotification` quase não é usada": **não é usada por ninguém** (`git grep -n "createNotification(" -- src` só acha a definição). Os avisos de proposta e venda inserem direto (`src/routes/public-propostas.ts:63`, `src/services/fechar-venda.ts:176,181`). Este plano também insere direto, para a notificação entrar no mesmo `batch` do registro.
- "O link leva à tela do item": o clique da notificação (`frontend/src/globals.js:1001-1023`) só sabe abrir `evidence`, `controls` e `soa` de `/projects/:id/...`; o resto cai em `project-detail`. CAPA, Auditorias, Certificação e Políticas precisam de mapeamento novo (Task 5).
- "Mesma regra do aviso de projeto sem consultor no P3": a do P3 inclui o `platform_admin` como último recurso, o que contradiz o isolamento da mesma seção. Ver Decisão 6.
- Os status reais são em inglês e livres (`z.string()` em `src/schemas/resources.ts:110-121`): CAPA `Open`/`In Progress`/`Closed`, auditoria `Planned`/`Scheduled`/`In Progress`/`Completed`. Ver Decisão 7.
- A UNIQUE da spec impede o segundo ciclo de qualquer prazo recorrente. Ver Decisão 1.

## Review Focus

As cinco entradas mais prováveis de morder o usuário que os testes da spec não cobrem; cada uma ganhou teste na tarefa dona:

1. **Prazo gravado com hora ou em formato inválido** (`'2026-10-07T00:00:00.000Z'`, `'07/10/2026'`): o primeiro tem de valer como o dia, o segundo tem de ser ignorado sem derrubar a fonte. Task 2.
2. **Link do auditor que vence de madrugada em UTC**: `2026-10-08 02:00:00` UTC é 23:00 de 07/10 em Brasília; o `D0` é no dia 07. Task 2.
3. **Assinatura de política em formato legado** (`'2025-10-07 15:00:00'`) misturada com ISO: o `max` tem de comparar datas, não texto. Task 2.
4. **Responsável com nome ambíguo** (duas pessoas "Ana Souza" no projeto): não pode avisar a pessoa errada. Task 3.
5. **Pessoa desativada com e-mail pendente**: o resumo do dia seguinte não pode sair para conta desativada. Task 4.

## Mapa de arquivos

- Create `migrations/0046_avisos_prazo.sql`; Modify `schema.sql` (fim do arquivo).
- Modify `src/helpers.ts:659-691` (`enviarEmail` + `sendEmail` invólucro).
- Modify `src/manutencao.ts:68-81` (linha nova em `RETENCAO`); Modify `docs/retencao.md` (linha nova na tabela).
- Create `src/services/avisos-prazo.ts` (fontes, marcos, destinatários, rotina, e-mail).
- Modify `src/index.ts:491-563` (import, `CRON_AVISOS`, `scheduled`); Modify `wrangler.jsonc:44-46`.
- Modify `frontend/src/globals.js:1001-1023` (mapa de telas do aviso).
- Tests: Create `test/enviar-email.test.ts`, `test/migration-0046.test.ts`, `test/avisos-prazo.test.ts`; Modify `test/manutencao.test.ts`, `test/any-catraca.test.ts`, `frontend/test/globals-shell.test.js`.
- Docs (Task 6): `CHANGELOG.md`, `AGENTS.md`, `migrations/README.md`.

---

### Task 1: Tabela `avisos_prazo` (migration 0046), retenção e `enviarEmail(env)`

**Files:**
- Create: `migrations/0046_avisos_prazo.sql`
- Modify: `schema.sql` (anexar no fim)
- Modify: `src/helpers.ts:659-691`
- Modify: `src/manutencao.ts:68-81`
- Modify: `docs/retencao.md` (tabela "O que é apagado automaticamente")
- Modify: `test/any-catraca.test.ts:19`
- Test: `test/migration-0046.test.ts`, `test/enviar-email.test.ts`, `test/manutencao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - tabela `avisos_prazo(id, project_id, fonte, item_id, marco, user_id, vence_em, titulo, criado_em, email_enviado_em)`, `UNIQUE(fonte, item_id, marco, user_id, vence_em)`.
  - `export async function enviarEmail(env: { RESEND_API_KEY?: string }, to: string, subject: string, html: string, opcoes?: { from?: string; replyTo?: string }): Promise<boolean>` em `src/helpers.ts`.
  - `sendEmail(c: { env: { RESEND_API_KEY?: string } }, ...)` com a mesma assinatura de antes nos demais parâmetros.

- [ ] **Step 1: Escrever os testes que falham**

`test/migration-0046.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0046 from '../migrations/0046_avisos_prazo.sql?raw';

const colunas = async (t: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('migration 0046 — avisos_prazo', () => {
  it('cria a tabela num banco sem ela, com a UNIQUE que inclui o vencimento, e convive com o schema canônico', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS avisos_prazo;');
    expect(await colunas('avisos_prazo')).toEqual([]);

    await execSql(migration0046);

    expect(await colunas('avisos_prazo')).toEqual(['id', 'project_id', 'fonte', 'item_id', 'marco', 'user_id', 'vence_em', 'titulo', 'criado_em', 'email_enviado_em']);
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_avisos_prazo_email'").first()).toBeTruthy();

    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p46','C','ISO 27001:2022','Controller','Active')`),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES ('u46','u46@x.com','x','U','consultor')`),
    ]);
    const inserir = (id: string, vence: string) => env.DB.prepare(
      `INSERT OR IGNORE INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo) VALUES (?, 'p46', 'capa', 'c1', 'D0', 'u46', ?, 'CAPA')`
    ).bind(id, vence).run();
    expect((await inserir('a1', '2026-10-07')).meta.changes).toBe(1);
    expect((await inserir('a2', '2026-10-07')).meta.changes, 'mesmo marco do mesmo prazo não entra duas vezes').toBe(0);
    expect((await inserir('a3', '2026-11-07')).meta.changes, 'prazo adiado é outro aviso').toBe(1);
    const linha = await env.DB.prepare(`SELECT criado_em, email_enviado_em FROM avisos_prazo WHERE id = 'a1'`).first<{ criado_em: string; email_enviado_em: string | null }>();
    expect(linha?.criado_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(linha?.email_enviado_em).toBeNull();

    await execSql(migration0046); // reaplicar não quebra (IF NOT EXISTS)
    await applySchema();
  }, 30_000);
});
```

`test/enviar-email.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { enviarEmail, sendEmail } from '../src/helpers';

/** `enviarEmail` só precisa do env: é o que o cron tem. `sendEmail(c)` é o invólucro das rotas. */
describe('enviarEmail', () => {
  const pedidos: { auth: string; corpo: Record<string, unknown> }[] = [];
  const resend = (status: number) => vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({ auth: String((init?.headers as Record<string, string>).Authorization), corpo: JSON.parse(String(init?.body)) });
    return new Response(status === 200 ? '{}' : 'erro', { status });
  }) as typeof fetch);
  afterEach(() => { vi.restoreAllMocks(); pedidos.length = 0; });

  it('posta no Resend com a chave do env e o remetente padrão; devolve o ok do provedor', async () => {
    resend(200);
    expect(await enviarEmail({ RESEND_API_KEY: 'k1' }, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(true);
    expect(pedidos[0]).toEqual({ auth: 'Bearer k1', corpo: { from: 'n.iso <noreply@ness.com.br>', to: ['a@b.com'], subject: 'Assunto', html: '<p>x</p>' } });
  });

  it('recusa do provedor devolve false', async () => {
    resend(500);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enviarEmail({ RESEND_API_KEY: 'k1' }, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(false);
  });

  it('sendEmail(c) delega com c.env', async () => {
    resend(200);
    expect(await sendEmail({ env: { RESEND_API_KEY: 'k2' } }, 'c@d.com', 'S', '<p>y</p>', { replyTo: 'r@x.com' })).toBe(true);
    expect(pedidos[0].auth).toBe('Bearer k2');
    expect(pedidos[0].corpo).toMatchObject({ to: ['c@d.com'], reply_to: 'r@x.com' });
  });
});
```

Em `test/manutencao.test.ts`, dentro de `describe('política de retenção', ...)`, acrescentar:

```ts
    it('apaga registro de aviso de prazo com mais de 400 dias, e NÃO o recente', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-av','C','ISO 27001:2022','Controller','Active')`),
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-av','av@x.com','x','Av','consultor')`),
        env.DB.prepare(`INSERT INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo, criado_em) VALUES ('av-velho','proj-av','capa','c1','D0','u-av','2025-08-01','CAPA', datetime('now','-401 days'))`),
        env.DB.prepare(`INSERT INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo, criado_em) VALUES ('av-ano','proj-av','capa','c2','D0','u-av','2025-10-01','CAPA', datetime('now','-370 days'))`),
      ]);
      const r = await manutencaoDiaria(env as any);
      expect(r.retencao.avisos_prazo).toBe(1);
      const { results } = await env.DB.prepare('SELECT id FROM avisos_prazo').all<{ id: string }>();
      expect(results.map((x) => x.id)).toEqual(['av-ano']);
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/migration-0046.test.ts test/enviar-email.test.ts test/manutencao.test.ts`
Expected: FAIL — `migrations/0046_avisos_prazo.sql` não existe; `enviarEmail` não é exportado; `no such table: avisos_prazo`.

- [ ] **Step 3: Migration e schema**

`migrations/0046_avisos_prazo.sql` (LF):

```sql
-- 0046 — avisos de prazo (sino + e-mail), spec 2026-10-07-avisos-de-prazo-design.
--
-- Registro de idempotência da rotina diária das 08:00 (src/services/avisos-prazo.ts): uma linha por
-- (fonte, item, marco, pessoa, vencimento). A notificação do sino só nasce quando a linha entra, e o
-- e-mail-resumo marca email_enviado_em depois do envio confirmado.
--
-- A UNIQUE inclui vence_em: prazo adiado, certificado renovado e a revisão anual de política voltam a
-- avisar. Tabela nova, só CREATE ... IF NOT EXISTS; nenhuma tabela existente muda.
CREATE TABLE IF NOT EXISTS avisos_prazo (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fonte TEXT NOT NULL,
    item_id TEXT NOT NULL,
    marco TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vence_em TEXT NOT NULL,
    titulo TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_enviado_em DATETIME,
    UNIQUE(fonte, item_id, marco, user_id, vence_em)
);
CREATE INDEX IF NOT EXISTS idx_avisos_prazo_email ON avisos_prazo(email_enviado_em, user_id);
```

Anexar o mesmo `CREATE TABLE` e `CREATE INDEX` ao fim de `schema.sql`, precedidos de:

```sql

-- Avisos de prazo (0046): registro de idempotência da rotina diária (src/services/avisos-prazo.ts).
```

- [ ] **Step 4: `enviarEmail(env)` e o invólucro**

Em `src/helpers.ts`, substituir o bloco de `sendEmail` (comentário em 659-662 e função em 663-691) por:

```ts
/**
 * Envia e-mail pelo Resend com a chave do `env`: o cron não tem contexto de requisição, só `env`.
 * Sem RESEND_API_KEY, simula em log (dev) só com destinatário e assunto: o corpo leva link de convite,
 * código e token de proposta. A simulação devolve `true`; quem precisa saber se o e-mail saiu de
 * verdade confere a chave antes (propostas, avisos de prazo).
 */
export async function enviarEmail(env: { RESEND_API_KEY?: string }, to: string, subject: string, html: string, opcoes?: { from?: string; replyTo?: string }): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL SIMULATION] Envio para: ${to}\nAssunto: ${subject}`);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: opcoes?.from ?? 'n.iso <noreply@ness.com.br>',
        to: [to],
        subject: subject,
        html: html,
        ...(opcoes?.replyTo ? { reply_to: opcoes.replyTo } : {}),
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[EMAIL ERROR] Falha no Resend API: ${res.status} - ${errText}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[EMAIL ERROR] Erro no envio de e-mail: ${e}`);
    return false;
  }
}

/** O mesmo envio a partir do contexto da requisição (as rotas). */
export function sendEmail(c: { env: { RESEND_API_KEY?: string } }, to: string, subject: string, html: string, opcoes?: { from?: string; replyTo?: string }): Promise<boolean> {
  return enviarEmail(c.env, to, subject, html, opcoes);
}
```

- [ ] **Step 5: Retenção**

Em `src/manutencao.ts`, acrescentar ao array `RETENCAO` (depois de `ai_chat_history`):

```ts
  {
    tabela: 'avisos_prazo',
    dias: 400,
    coluna: 'criado_em',
    motivo: 'registro de idempotência dos avisos de prazo; 400 dias cobrem o ciclo anual de revisão de política com folga',
  },
```

Em `docs/retencao.md`, na tabela "O que é apagado automaticamente", depois da linha de `ai_chat_history`:

```markdown
| `avisos_prazo` | 400 dias | Registro de idempotência dos avisos de prazo (quem já foi avisado de quê). Depois de um ciclo anual não evita mais nada: o atraso é por semana e o vencimento faz parte da chave. |
```

- [ ] **Step 6: Baixar o TETO**

Run: `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`
Expected: `543`. Trocar `const TETO = 544;` por `const TETO = 543;` em `test/any-catraca.test.ts:19` (use o número medido, seja ele qual for).

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run test/migration-0046.test.ts test/enviar-email.test.ts test/manutencao.test.ts test/propostas-envio.test.ts test/any-catraca.test.ts test/colunas-catraca.test.ts test/contrato-isolamento-topo.test.ts test/contrato-isolamento-org.test.ts test/backup-restore.test.ts`
Expected: PASS. Os dois `contrato-isolamento-*` semeiam uma linha em toda tabela com `project_id` (FK `user_id` NOT NULL recebe o id semeado de `users`): se reclamarem de `avisos_prazo`, a tabela não está no FIM do `schema.sql`.

Run: `npx tsc --noEmit`
Expected: sem erro (os 6 chamadores de `sendEmail` passam o `Context` do Hono, cujo `env` tem `RESEND_API_KEY?: string`).

- [ ] **Step 8: Commit**

```bash
git add migrations/0046_avisos_prazo.sql schema.sql src/helpers.ts src/manutencao.ts docs/retencao.md test/migration-0046.test.ts test/enviar-email.test.ts test/manutencao.test.ts test/any-catraca.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(avisos): tabela avisos_prazo (0046), retenção de 400 dias e enviarEmail(env)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fontes e marcos do dia

**Files:**
- Create: `src/services/avisos-prazo.ts`
- Test: `test/avisos-prazo.test.ts` (criado aqui; as Tasks 3 e 4 acrescentam)

**Interfaces:**
- Consumes: tabela `avisos_prazo` não é usada aqui.
- Produces (em `src/services/avisos-prazo.ts`):
  - `export type Fonte = 'capa' | 'checklist' | 'auditoria' | 'certificado' | 'link_auditor' | 'politica'`
  - `export type ItemPrazo = { fonte: Fonte; item_id: string; project_id: string; vence_em: string; titulo: string; responsavel: string | null }`
  - `export type ItemDoDia = ItemPrazo & { marco: string }`
  - `export function hojeEmSaoPaulo(agora?: Date): string` (AAAA-MM-DD)
  - `export function somarDias(dia: string, n: number): string`
  - `export function semanaIso(dia: string): string` (`AAAA-Www`)
  - `export function marcoDoDia(vence: string, hoje: string): string | null`
  - `export async function itensDoDia(db: D1Database, hoje: string): Promise<{ itens: ItemDoDia[]; falhas: string[] }>`

- [ ] **Step 1: Escrever os testes que falham**

`test/avisos-prazo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { hojeEmSaoPaulo, semanaIso, marcoDoDia, itensDoDia } from '../src/services/avisos-prazo';

/**
 * Avisos de prazo (spec 2026-10-07-avisos-de-prazo-design). D1 real; a data é simulada pelo
 * parâmetro `hoje`. HOJE é uma quarta-feira, semana ISO 2026-W41.
 */
const HOJE = '2026-10-07';
const db = () => env.DB;

async function projeto(id = 'p1', org = 'org_ness') {
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, ?, 'ISO 27001:2022', 'Controller', 'Active', ?)`)
    .bind(id, `Cliente ${id}`, org).run();
}

const umAnoAntes = (dia: string) => `${Number(dia.slice(0, 4)) - 1}${dia.slice(4)}`;

/** Uma linha da fonte, no projeto p1, vencendo em `vence`; `resolvido` grava o estado que a tira do aviso. */
const SEMEAR: Record<string, (id: string, vence: string, resolvido: boolean) => D1PreparedStatement> = {
  capa: (id, vence, r) => db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES (?, 'p1', ?, ?, ?)`)
    .bind(id, `CAPA ${id}`, vence, r ? 'Closed' : 'Open'),
  checklist: (id, vence, r) => db().prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, due_date) VALUES (?, 'p1', 1, ?, ?, ?)`)
    .bind(id, id, r ? 1 : 0, vence),
  auditoria: (id, vence, r) => db().prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date, status) VALUES (?, 'p1', 'Internal', ?, ?, ?)`)
    .bind(id, `Auditoria ${id}`, vence, r ? 'Completed' : 'Planned'),
  // Renovado = a validade nova está longe.
  certificado: (id, vence, r) => db().prepare(`INSERT INTO certification_tracking (id, project_id, certificate_expiry) VALUES (?, 'p1', ?)`)
    .bind(id, r ? '2029-01-01' : vence),
  // 12:00 UTC = 09:00 em Brasília, mesmo dia.
  link_auditor: (id, vence, r) => db().prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, 'p1', ?, ?, ?)`)
    .bind(id, `hash-${id}`, `${vence} 12:00:00`, r ? '2026-09-01 10:00:00' : null),
  // Vence 12 meses depois da assinatura mais recente; revisada = as duas assinaturas novas.
  politica: (id, vence, r) => db().prepare(
    `INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at, ceo_approved_at) VALUES (?, 'p1', 'ISO 27001:2022', ?, 'Texto da política', ?, ?)`
  ).bind(id, `A.5.${id.length} Políticas`, r ? `${vence}T15:00:00.000Z` : `${umAnoAntes(vence).slice(0, 8)}01T15:00:00.000Z`, r ? `${vence}T15:00:00.000Z` : `${umAnoAntes(vence)}T15:00:00.000Z`),
};

describe('marcos (funções puras)', () => {
  it('semana ISO, inclusive na virada de ano', () => {
    expect(semanaIso('2026-10-07')).toBe('2026-W41');
    expect(semanaIso('2026-10-11')).toBe('2026-W41'); // domingo fecha a semana
    expect(semanaIso('2026-10-12')).toBe('2026-W42');
    expect(semanaIso('2026-01-01')).toBe('2026-W01');
    expect(semanaIso('2027-01-01')).toBe('2026-W53');
    expect(semanaIso('2024-12-30')).toBe('2025-W01');
  });

  it('o dia é o de São Paulo, não o de UTC', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-07T02:30:00Z'))).toBe('2026-10-06');
    expect(hojeEmSaoPaulo(new Date('2026-10-07T11:00:00Z'))).toBe('2026-10-07');
  });

  it('D-7 só no dia exato, D0 no dia, atraso com a semana de hoje', () => {
    expect(marcoDoDia('2026-10-14', HOJE)).toBe('D-7');
    expect(marcoDoDia('2026-10-07', HOJE)).toBe('D0');
    expect(marcoDoDia('2026-10-06', HOJE)).toBe('atraso-2026-W41');
    expect(marcoDoDia('2026-09-01', HOJE)).toBe('atraso-2026-W41');
    expect(marcoDoDia('2026-10-10', HOJE)).toBeNull();
    expect(marcoDoDia('2026-10-15', HOJE)).toBeNull();
  });
});

describe('fontes do dia', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto();
  });

  for (const fonte of Object.keys(SEMEAR)) {
    it(`${fonte}: D-7, D0 e atraso nos dias certos; fora da janela e resolvido não entram`, async () => {
      await db().batch([
        SEMEAR[fonte](`${fonte}-d7`, '2026-10-14', false),
        SEMEAR[fonte](`${fonte}-d0`, '2026-10-07', false),
        SEMEAR[fonte](`${fonte}-atr`, '2026-10-01', false),
        SEMEAR[fonte](`${fonte}-longe`, '2026-10-10', false),
        SEMEAR[fonte](`${fonte}-ok`, '2026-10-07', true),
      ]);
      const { itens, falhas } = await itensDoDia(db(), HOJE);
      expect(falhas).toEqual([]);
      const marcos = Object.fromEntries(itens.filter((i) => i.fonte === fonte).map((i) => [i.item_id, i.marco]));
      expect(marcos).toEqual({ [`${fonte}-d7`]: 'D-7', [`${fonte}-d0`]: 'D0', [`${fonte}-atr`]: 'atraso-2026-W41' });
    });
  }

  it('CAPA traz título, responsável e projeto; prazo com hora vale pelo dia, prazo ilegível é ignorado', async () => {
    await db().batch([
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to, due_date, status) VALUES ('c-hora', 'p1', 'Trocar senha', 'Ana', '2026-10-07T00:00:00.000Z', 'In Progress')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES ('c-br', 'p1', 'Data brasileira', '07/10/2026', 'Open')`),
    ]);
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    expect(itens).toEqual([{ fonte: 'capa', item_id: 'c-hora', project_id: 'p1', vence_em: '2026-10-07', titulo: 'Trocar senha', responsavel: 'Ana', marco: 'D0' }]);
  });

  it('link do auditor que vence às 02:00 UTC vence no dia anterior em Brasília', async () => {
    await db().prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('t-madrugada', 'p1', 'h', '2026-10-08 02:00:00')`).run();
    const { itens } = await itensDoDia(db(), HOJE);
    expect(itens.map((i) => [i.item_id, i.vence_em, i.marco])).toEqual([['t-madrugada', '2026-10-07', 'D0']]);
  });

  it('política: só com texto e as DUAS assinaturas; vence 12 meses após a mais recente, em qualquer formato', async () => {
    await db().batch([
      // Mais recente em formato legado: 2025-10-07 15:00 UTC → vence 2026-10-07.
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, owner, ciso_approved_at, ceo_approved_at) VALUES ('pol-ok', 'p1', 'ISO 27001:2022', 'A.5.1 Políticas', 'Texto', 'Ana', '2025-09-30T10:00:00.000Z', '2025-10-07 15:00:00')`),
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at) VALUES ('pol-uma', 'p1', 'ISO 27001:2022', 'A.5.2 Papéis', 'Texto', '2025-10-07T15:00:00.000Z')`),
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at, ceo_approved_at) VALUES ('pol-vazia', 'p1', 'ISO 27001:2022', 'A.5.3 Segregação', '  ', '2025-10-07T15:00:00.000Z', '2025-10-07T15:00:00.000Z')`),
    ]);
    const { itens } = await itensDoDia(db(), HOJE);
    expect(itens).toEqual([{ fonte: 'politica', item_id: 'pol-ok', project_id: 'p1', vence_em: '2026-10-07', titulo: 'A.5.1 Políticas', responsavel: 'Ana', marco: 'D0' }]);
  });

  it('um erro numa fonte não impede as outras', async () => {
    await SEMEAR.capa('c-ok', HOJE, false).run();
    await db().prepare('DROP TABLE certification_tracking').run(); // nenhuma FK aponta para ela; o beforeEach a recria
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(itens.map((i) => i.item_id)).toEqual(['c-ok']);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatch(/^certificado: /);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/avisos-prazo.test.ts`
Expected: FAIL — `Cannot find module '../src/services/avisos-prazo'`.

- [ ] **Step 3: Implementar**

`src/services/avisos-prazo.ts`:

```ts
/**
 * Avisos de prazo (spec docs/superpowers/specs/2026-10-07-avisos-de-prazo-design.md).
 *
 * Uma rotina diária (cron "0 11 * * *", 08:00 em Brasília) olha seis datas que o produto já guarda e
 * avisa, no sino e num e-mail-resumo, 7 dias antes, no dia e uma vez por semana enquanto o prazo
 * estiver vencido. O dia é o de São Paulo; item resolvido não gera aviso.
 */

export type Fonte = 'capa' | 'checklist' | 'auditoria' | 'certificado' | 'link_auditor' | 'politica';

export type ItemPrazo = {
  fonte: Fonte;
  item_id: string;
  project_id: string;
  /** AAAA-MM-DD, no dia de São Paulo. */
  vence_em: string;
  titulo: string;
  /** Texto livre do campo de responsável (e-mail ou nome), quando a fonte tem um. */
  responsavel: string | null;
};
export type ItemDoDia = ItemPrazo & { marco: string };

const DIA_MS = 86_400_000;
const diaUtc = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const somarDias = (dia: string, n: number) => new Date(diaUtc(dia) + n * DIA_MS).toISOString().slice(0, 10);

/** O dia de hoje em São Paulo (AAAA-MM-DD). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Semana ISO 8601 (`AAAA-Www`): a quinta-feira da semana decide o ano. */
export function semanaIso(dia: string): string {
  const d = new Date(diaUtc(dia));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const ano = d.getUTCFullYear();
  const semana = Math.ceil(((d.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

/** O marco de hoje para um vencimento, ou null. `D-7` só no dia exato; vencido, um por semana ISO. */
export function marcoDoDia(vence: string, hoje: string): string | null {
  const faltam = Math.round((diaUtc(vence) - diaUtc(hoje)) / DIA_MS);
  if (faltam === 7) return 'D-7';
  if (faltam === 0) return 'D0';
  if (faltam < 0) return `atraso-${semanaIso(hoje)}`;
  return null;
}

/*
 * Uma consulta por fonte, cada uma devolvendo as colunas de ItemPrazo (menos `fonte`) só dos itens NÃO
 * resolvidos. `date(...)` normaliza o prazo para AAAA-MM-DD e devolve NULL para texto ilegível
 * ('07/10/2026'), que o filtro de fora descarta. O JOIN com projects deixa de fora linha sem projeto.
 * Resolvido: CAPA 'Closed' (routes/capa.ts), auditoria 'Completed' (routes/audits.ts), item marcado,
 * link revogado; certificado renovado e política revisada saem sozinhos, porque a data anda.
 * ponytail: '-3 hours' é o fuso de São Paulo fixo (sem horário de verão desde 2019); se voltar, troca
 * por conversão no TypeScript.
 */
const FONTES: Record<Fonte, string> = {
  capa: `SELECT c.id AS item_id, c.project_id, date(substr(c.due_date, 1, 10)) AS vence_em, c.title AS titulo, c.assigned_to AS responsavel
    FROM corrective_actions c JOIN projects p ON p.id = c.project_id WHERE COALESCE(c.status, 'Open') <> 'Closed'`,
  checklist: `SELECT k.id AS item_id, k.project_id, date(substr(k.due_date, 1, 10)) AS vence_em,
      'Item ' || k.item_id || ' da fase ' || k.phase_number AS titulo, k.assigned_to AS responsavel
    FROM checklist_progress k JOIN projects p ON p.id = k.project_id WHERE COALESCE(k.is_checked, 0) = 0`,
  auditoria: `SELECT a.id AS item_id, a.project_id, date(substr(a.scheduled_date, 1, 10)) AS vence_em, a.title AS titulo, NULL AS responsavel
    FROM audit_schedule a JOIN projects p ON p.id = a.project_id WHERE COALESCE(a.status, 'Planned') <> 'Completed'`,
  certificado: `SELECT t.id AS item_id, t.project_id, date(substr(t.certificate_expiry, 1, 10)) AS vence_em,
      'Certificado ' || t.standard AS titulo, NULL AS responsavel
    FROM certification_tracking t JOIN projects p ON p.id = t.project_id`,
  link_auditor: `SELECT t.id AS item_id, t.project_id, date(t.expires_at, '-3 hours') AS vence_em, 'Link do auditor externo' AS titulo, NULL AS responsavel
    FROM auditor_tokens t JOIN projects p ON p.id = t.project_id WHERE t.revoked_at IS NULL`,
  politica: `SELECT c.id AS item_id, c.project_id,
      date(max(datetime(c.ciso_approved_at), datetime(c.ceo_approved_at)), '-3 hours', '+12 months') AS vence_em,
      c.title AS titulo, c.owner AS responsavel
    FROM compliance_controls c JOIN projects p ON p.id = c.project_id
    WHERE trim(COALESCE(c.description, '')) <> '' AND c.ciso_approved_at IS NOT NULL AND c.ceo_approved_at IS NOT NULL`,
};

/** Os itens que têm marco hoje. Uma fonte que falha vai para `falhas` e as outras seguem. */
export async function itensDoDia(db: D1Database, hoje: string): Promise<{ itens: ItemDoDia[]; falhas: string[] }> {
  const itens: ItemDoDia[] = [];
  const falhas: string[] = [];
  for (const fonte of Object.keys(FONTES) as Fonte[]) {
    try {
      const { results } = await db
        .prepare(`SELECT * FROM (${FONTES[fonte]}) WHERE vence_em IS NOT NULL AND vence_em <= ? ORDER BY vence_em, item_id`)
        .bind(somarDias(hoje, 7))
        .all<Omit<ItemPrazo, 'fonte'>>();
      for (const r of results) {
        const marco = marcoDoDia(r.vence_em, hoje);
        if (marco) itens.push({ fonte, ...r, marco });
      }
    } catch (e) {
      falhas.push(`${fonte}: ${mensagem(e)}`);
    }
  }
  return { itens, falhas };
}
```

Nota para o teste de igualdade: os objetos do `toEqual` comparam chaves, não ordem; o `{ fonte, ...r, marco }` basta.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/avisos-prazo.test.ts test/colunas-catraca.test.ts test/any-catraca.test.ts`
Expected: PASS. Se `semanaIso` ou `hojeEmSaoPaulo` falharem, confira os valores esperados com `python -c "import datetime as d; print(d.date(2027,1,1).isocalendar())"` antes de mexer na função.

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/services/avisos-prazo.ts test/avisos-prazo.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(avisos): fontes de prazo e marcos D-7, D0 e atraso semanal no dia de São Paulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Destinatários (responsável, consultor, `consultoria_admin`)

**Files:**
- Modify: `src/services/avisos-prazo.ts` (acrescentar no fim)
- Test: `test/avisos-prazo.test.ts` (acrescentar)

**Interfaces:**
- Consumes: nada das tarefas anteriores além do arquivo.
- Produces:
  - `export type Pessoa = { id: string; email: string; name: string | null; role: string }`
  - `export async function pessoasDoProjeto(db: D1Database, projectId: string): Promise<Pessoa[]>` — usuários ativos que alcançam o projeto, sem `platform_admin`.
  - `export function escolherDestinatarios(pessoas: Pessoa[], responsavel: string | null): Pessoa[]` — responsável resolvido + consultores; vazio dos dois → `consultoria_admin`; sem repetição.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/avisos-prazo.test.ts`, trocar a linha de import do serviço por:

```ts
import { hojeEmSaoPaulo, semanaIso, marcoDoDia, itensDoDia, pessoasDoProjeto, escolherDestinatarios } from '../src/services/avisos-prazo';
import { requireProjectAccess } from '../src/helpers';
```

e acrescentar no fim do arquivo:

```ts
describe('destinatários', () => {
  const usuario = (id: string, email: string, name: string, role: string, extra: { proj?: string; org?: string; ativo?: number } = {}) =>
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`)
      .bind(id, email, name, role, extra.proj ?? null, extra.org ?? 'org_ness', extra.ativo ?? 1);
  const consultorNoP1 = (email: string) =>
    db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Consultor', ?, 'consultor', 'Consultor')`).bind(email);

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto('p1', 'org_ness');
    await projeto('pB', 'org_b');
    await db().batch([
      usuario('u-cons', 'cons@ness.lat', 'Carla Consultora', 'consultor'),
      usuario('u-ana', 'ana@cliente.com', 'Ana Souza', 'org_user', { proj: 'p1' }),
      usuario('u-adm', 'adm@ness.lat', 'Admin Ness', 'consultoria_admin'),
      usuario('u-bia', 'bia@cliente.com', 'Bia', 'org_user', { proj: 'p1', ativo: 0 }),
      usuario('u-anab', 'ana@outra.com', 'Ana Souza', 'org_user', { proj: 'pB', org: 'org_b' }),
      usuario('u-plat', 'plat@ness.lat', 'Ana Souza', 'platform_admin'),
      usuario('u-consb', 'cons@b.com', 'Consultor B', 'consultor', { org: 'org_b' }),
      usuario('u-admb', 'adm@b.com', 'Admin B', 'consultoria_admin', { org: 'org_b' }),
      consultorNoP1('cons@ness.lat'),
      consultorNoP1('cons@b.com'), // e-mail de outra consultoria digitado na governança: não alcança
    ]);
  });

  const destinos = async (resp: string | null) =>
    escolherDestinatarios(await pessoasDoProjeto(db(), 'p1'), resp).map((p) => p.id).sort();

  it('responsável por e-mail, sem caixa nem espaço, mais o consultor', async () => {
    expect(await destinos('  ANA@Cliente.com ')).toEqual(['u-ana', 'u-cons']);
  });

  it('responsável por nome ignorando caixa e espaços; homônimo de outra organização e da plataforma não recebe', async () => {
    expect(await destinos('ana   SOUZA')).toEqual(['u-ana', 'u-cons']);
  });

  it('responsável inativo ou desconhecido: só o consultor', async () => {
    expect(await destinos('Bia')).toEqual(['u-cons']);
    expect(await destinos('Fulano')).toEqual(['u-cons']);
    expect(await destinos(null)).toEqual(['u-cons']);
  });

  it('nome que casa com duas pessoas do projeto não resolve', async () => {
    await usuario('u-ana2', 'ana2@cliente.com', 'Ana Souza', 'org_admin', { proj: 'p1' }).run();
    expect(await destinos('Ana Souza')).toEqual(['u-cons']);
  });

  it('sem responsável resolvido e sem consultor: os consultoria_admin ativos da organização do projeto', async () => {
    await db().prepare(`DELETE FROM project_governance`).run();
    expect(await destinos('Fulano')).toEqual(['u-adm']);
    expect(await destinos('ana@cliente.com')).toEqual(['u-ana']);
  });

  it('paridade com requireProjectAccess: quem entra é exatamente quem alcança o projeto (fora a plataforma)', async () => {
    const pessoas = (await pessoasDoProjeto(db(), 'p1')).map((p) => p.id).sort();
    const { results: todos } = await db().prepare(`SELECT id, email, role, client_project_id, org_id, ativo FROM users WHERE role <> 'platform_admin'`)
      .all<{ id: string; email: string; role: string; client_project_id: string | null; org_id: string; ativo: number }>();
    const alcancam: string[] = [];
    for (const u of todos) {
      const ok = await requireProjectAccess(db(), { role: u.role, email: u.email, client_project_id: u.client_project_id, org_id: u.org_id }, 'p1').then(() => true, () => false);
      if (ok && u.ativo) alcancam.push(u.id);
    }
    expect(pessoas).toEqual(alcancam.sort());
    expect(pessoas).toEqual(['u-adm', 'u-ana', 'u-cons']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/avisos-prazo.test.ts`
Expected: FAIL — `pessoasDoProjeto is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `src/services/avisos-prazo.ts`:

```ts
export type Pessoa = { id: string; email: string; name: string | null; role: string };

/*
 * Quem alcança o projeto, pela MESMA regra de requireProjectAccess (src/helpers.ts), escrita em SQL para
 * um projeto só: cliente pelo client_project_id; consultor designado na governança, com a conta na
 * organização do projeto (PROJETOS_DO_CONSULTOR_SQL); consultoria_admin da organização do projeto.
 * Fora de propósito: platform_admin (alcança todas as organizações; aviso nunca atravessa organização) e
 * comercial (não trabalha em projeto). Conta desativada não recebe. O teste de paridade em
 * test/avisos-prazo.test.ts reprova se as duas regras divergirem.
 */
const PESSOAS_DO_PROJETO = `SELECT u.id, u.email, u.name, u.role FROM users u JOIN projects p ON p.id = ?1
  WHERE COALESCE(u.ativo, 1) <> 0 AND (
    (u.role IN ('org_admin', 'org_user', 'client') AND u.client_project_id = p.id)
    OR (u.role = 'consultoria_admin' AND u.org_id = p.org_id)
    OR (u.role IN ('consultor', 'consultant') AND u.org_id = p.org_id AND EXISTS (
      SELECT 1 FROM project_governance g
       WHERE g.project_id = p.id AND g.role_category = 'consultor' AND lower(g.email) = lower(u.email))))
  ORDER BY u.id`;

export async function pessoasDoProjeto(db: D1Database, projectId: string): Promise<Pessoa[]> {
  return (await db.prepare(PESSOAS_DO_PROJETO).bind(projectId).all<Pessoa>()).results;
}

const normalizar = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const ehConsultorDoProjeto = (p: Pessoa) => p.role === 'consultor' || p.role === 'consultant';

/**
 * Responsável (quando o texto bate com o e-mail, ou com o nome de UMA só pessoa do projeto) mais os
 * consultores designados. Sem nenhum dos dois, os consultoria_admin da organização. `pessoas` já vem
 * de pessoasDoProjeto: ninguém de fora do projeto chega aqui.
 */
export function escolherDestinatarios(pessoas: Pessoa[], responsavel: string | null): Pessoa[] {
  const alvo = normalizar(responsavel);
  const porEmail = alvo ? pessoas.filter((p) => normalizar(p.email) === alvo) : [];
  const porNome = alvo && !porEmail.length ? pessoas.filter((p) => normalizar(p.name) === alvo) : [];
  const resp = porEmail.length ? porEmail : porNome.length === 1 ? porNome : [];
  const escolhidos = [...resp, ...pessoas.filter(ehConsultorDoProjeto)];
  const lista = escolhidos.length ? escolhidos : pessoas.filter((p) => p.role === 'consultoria_admin');
  return [...new Map(lista.map((p) => [p.id, p])).values()];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/avisos-prazo.test.ts`
Expected: PASS (todos os describes, inclusive os da Task 2).

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/services/avisos-prazo.ts test/avisos-prazo.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(avisos): destinatários pela regra de alcance do projeto, sem atravessar organização

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rotina `avisosDePrazo` (sino, e-mail-resumo, idempotência) e o cron das 08:00

**Files:**
- Modify: `src/services/avisos-prazo.ts` (imports no topo; rotina no fim)
- Modify: `src/index.ts:55` (import), `src/index.ts:491-502` (comentário), `src/index.ts:561-563` (`scheduled`)
- Modify: `wrangler.jsonc:44-46`
- Test: `test/avisos-prazo.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `itensDoDia`, `semanaIso`, `hojeEmSaoPaulo` (Task 2); `pessoasDoProjeto`, `escolherDestinatarios` (Task 3); `enviarEmail` (Task 1); `escapeHtml`, `genId` (`src/helpers.ts`); `appUrl` (`src/config/url.ts`); `log` (`src/observability.ts`).
- Produces:
  - `export type ResultadoAvisos = { avisos_criados: number; emails_enviados: number; sem_destinatario: number; falhas: string[] }`
  - `export async function avisosDePrazo(env: Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>, hoje: string): Promise<ResultadoAvisos>`
  - `export function tituloDoAviso(item: Pick<ItemDoDia, 'fonte' | 'marco' | 'titulo'>): string`
  - `export const CRON_AVISOS = '0 11 * * *'` em `src/index.ts`.
  - Links de notificação: `/projects/<id>/capa`, `/projects/<id>` (checklist), `/projects/<id>/audits` (auditoria e link do auditor), `/projects/<id>/certification`, `/projects/<id>/policies`. A Task 5 os abre no front.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/avisos-prazo.test.ts`, trocar a primeira linha de import por `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`, a de helpers por `import { applySchema, resetData, workerEnv } from './helpers/d1';`, a do serviço por:

```ts
import { hojeEmSaoPaulo, semanaIso, marcoDoDia, itensDoDia, pessoasDoProjeto, escolherDestinatarios, avisosDePrazo } from '../src/services/avisos-prazo';
import worker, { CRON_AVISOS } from '../src/index';
import wrangler from '../wrangler.jsonc?raw';
```

e acrescentar no fim do arquivo:

```ts
describe('rotina avisosDePrazo', () => {
  type Email = { to: string[]; subject: string; html: string };
  let emails: Email[] = [];
  let resendOk = true;
  const COM_CHAVE = () => ({ ...workerEnv(), RESEND_API_KEY: 'chave-de-teste' });
  const SEM_CHAVE = () => ({ ...workerEnv(), RESEND_API_KEY: undefined });
  const notificacoes = async () => (await db().prepare(`SELECT user_id, type, title, message, link FROM notifications ORDER BY user_id, type`).all<Record<string, string>>()).results;
  const avisos = async () => (await db().prepare(`SELECT fonte, item_id, marco, user_id, vence_em, email_enviado_em FROM avisos_prazo ORDER BY item_id, user_id, marco`).all<Record<string, string | null>>()).results;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto('p1');
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Carla', 'consultor')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-ana', 'ana@cliente.com', 'x', 'Ana Souza', 'org_user', 'p1')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Carla', 'cons@ness.lat', 'consultor', 'Consultor')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to, due_date, status) VALUES ('cap-1', 'p1', 'Trocar <b>senhas</b>', 'Ana Souza', '2026-10-07', 'Open')`),
      db().prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES ('au-1', 'p1', 'Internal', 'Auditoria interna anual', '2026-10-14')`),
    ]);
    emails = []; resendOk = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: RequestInfo | URL, init?: RequestInit) => {
      emails.push(JSON.parse(String(init?.body)));
      return new Response(resendOk ? '{}' : 'falhou', { status: resendOk ? 200 : 500 });
    }) as typeof fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('cria o sino com título curto e link da tela; um e-mail-resumo por pessoa; rodar de novo no mesmo dia não duplica nada', async () => {
    const r1 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r1).toMatchObject({ avisos_criados: 3, emails_enviados: 2, falhas: [] });
    expect(await notificacoes()).toEqual([
      { user_id: 'u-ana', type: 'prazo_capa', title: 'CAPA vence hoje', message: 'Trocar <b>senhas</b> (prazo 07/10/2026)', link: '/projects/p1/capa' },
      { user_id: 'u-cons', type: 'prazo_auditoria', title: 'Auditoria em 7 dias', message: 'Auditoria interna anual (prazo 14/10/2026)', link: '/projects/p1/audits' },
      { user_id: 'u-cons', type: 'prazo_capa', title: 'CAPA vence hoje', message: 'Trocar <b>senhas</b> (prazo 07/10/2026)', link: '/projects/p1/capa' },
    ]);
    const paraCons = emails.find((e) => e.to[0] === 'cons@ness.lat')!;
    expect(paraCons.subject).toBe('n.iso: 2 prazos para acompanhar');
    expect(paraCons.html).toContain('Trocar &lt;b&gt;senhas&lt;/b&gt;');
    expect(paraCons.html).not.toContain('<b>senhas');
    expect(paraCons.html).toContain('Cliente p1');
    expect(paraCons.html).toContain('14/10/2026');
    expect(emails.find((e) => e.to[0] === 'ana@cliente.com')!.subject).toBe('n.iso: 1 prazo para acompanhar');
    expect((await avisos()).every((a) => a.email_enviado_em)).toBe(true);

    const r2 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r2).toMatchObject({ avisos_criados: 0, emails_enviados: 0 });
    expect(await notificacoes()).toHaveLength(3);
    expect(emails).toHaveLength(2);
  });

  it('e-mail recusado: o sino vale, email_enviado_em fica nulo; o dia seguinte reenvia sem notificação nova', async () => {
    resendOk = false;
    const r1 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r1.emails_enviados).toBe(0);
    expect(r1.falhas.some((f) => f.startsWith('email '))).toBe(true);
    expect(await notificacoes()).toHaveLength(3);
    expect((await avisos()).every((a) => a.email_enviado_em === null)).toBe(true);

    resendOk = true;
    emails = [];
    // Quinta: a CAPA vencida ontem já teve D0 nesta semana, e a auditoria está a 6 dias. Nada novo.
    const r2 = await avisosDePrazo(COM_CHAVE(), '2026-10-08');
    expect(r2).toMatchObject({ avisos_criados: 0, emails_enviados: 2 });
    expect(await notificacoes()).toHaveLength(3);
    expect(emails.find((e) => e.to[0] === 'cons@ness.lat')!.subject).toBe('n.iso: 2 prazos para acompanhar');
    expect((await avisos()).every((a) => a.email_enviado_em)).toBe(true);
  });

  it('sem RESEND_API_KEY: só o sino, nenhum envio e nada marcado como enviado', async () => {
    const r = await avisosDePrazo(SEM_CHAVE(), HOJE);
    expect(r).toMatchObject({ avisos_criados: 3, emails_enviados: 0, falhas: [] });
    expect(emails).toHaveLength(0);
    expect(await notificacoes()).toHaveLength(3);
    expect((await avisos()).every((a) => a.email_enviado_em === null)).toBe(true);
  });

  it('conta desativada não recebe o resumo pendente', async () => {
    await avisosDePrazo(SEM_CHAVE(), HOJE);
    await db().prepare(`UPDATE users SET ativo = 0 WHERE id = 'u-ana'`).run();
    await avisosDePrazo(COM_CHAVE(), '2026-10-08');
    expect(emails.map((e) => e.to[0])).toEqual(['cons@ness.lat']);
  });

  it('atraso: o primeiro sai na semana do vencimento se não houve D0; com D0, só na semana seguinte', async () => {
    await db().batch([
      db().prepare(`DELETE FROM corrective_actions`),
      db().prepare(`DELETE FROM audit_schedule`),
      // Venceu na segunda e a rotina não rodou: o atraso sai já nesta semana.
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-seg', 'p1', 'Segunda', '2026-10-05')`),
      // Vence na terça: D0 na terça; na quarta nada; na segunda seguinte, o atraso da semana 42.
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-ter', 'p1', 'Terça', '2026-10-06')`),
    ]);
    await avisosDePrazo(SEM_CHAVE(), '2026-10-06');
    await avisosDePrazo(SEM_CHAVE(), HOJE);
    await avisosDePrazo(SEM_CHAVE(), '2026-10-08');
    await avisosDePrazo(SEM_CHAVE(), '2026-10-12');
    const marcos = (await avisos()).filter((a) => a.user_id === 'u-cons').map((a) => `${a.item_id} ${a.marco}`);
    expect(marcos).toEqual([
      'cap-seg atraso-2026-W41', 'cap-seg atraso-2026-W42',
      'cap-ter D0', 'cap-ter atraso-2026-W42',
    ]);
  });

  it('um erro numa fonte vai para falhas e as outras avisam', async () => {
    await db().prepare('DROP TABLE certification_tracking').run();
    const r = await avisosDePrazo(SEM_CHAVE(), HOJE);
    expect(r.avisos_criados).toBe(3);
    expect(r.falhas).toEqual([expect.stringMatching(/^certificado: /)]);
  });
});

describe('scheduled despacha pelo cron', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
  });

  const disparar = async (cron: string) => {
    const pendentes: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { pendentes.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
    worker.scheduled({ cron, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, workerEnv(), ctx);
    await Promise.all(pendentes);
  };

  it('o das 11:00 UTC roda os avisos com o dia de São Paulo; o das 04:10 roda a manutenção e não avisa', async () => {
    await projeto('p1');
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Carla', 'consultor')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Carla', 'cons@ness.lat', 'consultor', 'Consultor')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-hoje', 'p1', 'Hoje', ?)`).bind(hojeEmSaoPaulo()),
      db().prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES ('velho', 1, ?)`).bind(Math.floor(Date.now() / 1000) - 30 * 86400),
    ]);

    await disparar('10 4 * * *');
    expect(await db().prepare('SELECT count(*) AS n FROM avisos_prazo').first<{ n: number }>()).toEqual({ n: 0 });
    expect(await db().prepare(`SELECT key FROM rate_limits WHERE key = 'velho'`).first()).toBeNull();

    await disparar(CRON_AVISOS);
    expect(await db().prepare(`SELECT item_id, marco FROM avisos_prazo`).all()).toMatchObject({ results: [{ item_id: 'cap-hoje', marco: 'D0' }] });
  });

  it('wrangler.jsonc agenda os dois crons', () => {
    expect(CRON_AVISOS).toBe('0 11 * * *');
    expect(wrangler).toContain('"crons": ["10 4 * * *", "0 11 * * *"]');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/avisos-prazo.test.ts`
Expected: FAIL — `avisosDePrazo` não exportado e `CRON_AVISOS` indefinido.

- [ ] **Step 3: Implementar a rotina**

No topo de `src/services/avisos-prazo.ts`, depois do comentário de abertura:

```ts
import { genId, escapeHtml, enviarEmail } from '../helpers';
import { appUrl } from '../config/url';
import { log } from '../observability';
import type { Bindings } from '../index';
```

No fim do arquivo:

```ts
type EnvAvisos = Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>;

export type ResultadoAvisos = { avisos_criados: number; emails_enviados: number; sem_destinatario: number; falhas: string[] };

const ROTULO: Record<Fonte, string> = {
  capa: 'CAPA', checklist: 'Item do checklist', auditoria: 'Auditoria', certificado: 'Certificado',
  link_auditor: 'Link do auditor', politica: 'Política',
};

/** Tela de cada fonte no clique do sino (frontend/src/globals.js, handleNotificationClick). */
const TELA: Record<Fonte, string> = {
  capa: '/capa', checklist: '', auditoria: '/audits', certificado: '/certification', link_auditor: '/audits', politica: '/policies',
};

const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const quando = (marco: string) => (marco === 'D-7' ? 'vence em 7 dias' : marco === 'D0' ? 'vence hoje' : 'com prazo vencido');

/** Título curto do sino: "CAPA vence em 7 dias", "Política A.5.1 precisa de revisão", "Auditoria hoje". */
export function tituloDoAviso(item: Pick<ItemDoDia, 'fonte' | 'marco' | 'titulo'>): string {
  const d7 = item.marco === 'D-7';
  if (item.fonte === 'politica') return `Política ${item.titulo.split(' ')[0]} precisa de revisão${d7 ? ' em 7 dias' : ''}`;
  if (item.fonte === 'auditoria') return `Auditoria ${d7 ? 'em 7 dias' : item.marco === 'D0' ? 'hoje' : 'atrasada'}`;
  return `${ROTULO[item.fonte]} ${quando(item.marco)}`;
}

/**
 * A rotina do cron das 08:00. Ordem da spec (seção 5): pares (item, marco, pessoa) do dia → INSERT OR
 * IGNORE em avisos_prazo → notificação só para a linha que entrou agora (no MESMO batch, então não há
 * registro sem sino nem sino repetido) → um e-mail-resumo por pessoa com o que está pendente → marca
 * email_enviado_em só depois do envio confirmado. Falha de fonte, de item ou de e-mail vai para
 * `falhas` e a rotina segue.
 */
export async function avisosDePrazo(env: EnvAvisos, hoje: string): Promise<ResultadoAvisos> {
  const db = env.DB;
  const { itens, falhas } = await itensDoDia(db, hoje);
  const r: ResultadoAvisos = { avisos_criados: 0, emails_enviados: 0, sem_destinatario: 0, falhas };
  const pessoasPorProjeto = new Map<string, Pessoa[]>();

  for (const item of itens) {
    try {
      let pessoas = pessoasPorProjeto.get(item.project_id);
      if (!pessoas) pessoasPorProjeto.set(item.project_id, (pessoas = await pessoasDoProjeto(db, item.project_id)));
      const destinos = escolherDestinatarios(pessoas, item.responsavel);
      if (!destinos.length) { r.sem_destinatario++; continue; }
      // Atraso na mesma semana do vencimento só sai se o D0 não saiu (a rotina não rodou no dia).
      const guardaD0 = item.marco.startsWith('atraso-') && semanaIso(item.vence_em) === semanaIso(hoje) ? 1 : 0;
      for (const p of destinos) {
        const id = genId();
        const [aviso] = await db.batch([
          db.prepare(`INSERT OR IGNORE INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
             WHERE NOT (?9 AND EXISTS (SELECT 1 FROM avisos_prazo
               WHERE fonte = ?3 AND item_id = ?4 AND user_id = ?6 AND vence_em = ?7 AND marco = 'D0'))`)
            .bind(id, item.project_id, item.fonte, item.item_id, item.marco, p.id, item.vence_em, item.titulo, guardaD0),
          db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, created_at)
            SELECT ?, ?, ?, ?, ?, 0, ?, datetime('now') WHERE EXISTS (SELECT 1 FROM avisos_prazo WHERE id = ?)`)
            .bind(genId(), p.id, `prazo_${item.fonte}`, tituloDoAviso(item), `${item.titulo} (prazo ${dataBr(item.vence_em)})`,
              `/projects/${item.project_id}${TELA[item.fonte]}`, id),
        ]);
        r.avisos_criados += aviso.meta.changes ?? 0;
      }
    } catch (e) {
      r.falhas.push(`${item.fonte} ${item.item_id}: ${mensagem(e)}`);
    }
  }

  // Sem a chave, enviarEmail só simula e devolve true: marcar enviado seria mentir (Decisão 3 do plano).
  if (env.RESEND_API_KEY) {
    try {
      await enviarResumos(env, r);
    } catch (e) {
      r.falhas.push(`email: ${mensagem(e)}`);
    }
  }

  log(r.falhas.length ? 'error' : 'info', { msg: 'avisos_prazo', hoje, ...r });
  return r;
}

type LinhaEmail = { id: string; user_id: string; email: string; projeto: string; fonte: Fonte; marco: string; vence_em: string; titulo: string };

/** Um e-mail por pessoa com tudo o que está pendente dos últimos 7 dias; marca só o que saiu. */
async function enviarResumos(env: EnvAvisos, r: ResultadoAvisos): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.user_id, u.email, COALESCE(p.project_name, p.client_name) AS projeto, a.fonte, a.marco, a.vence_em, a.titulo
       FROM avisos_prazo a JOIN users u ON u.id = a.user_id JOIN projects p ON p.id = a.project_id
      WHERE a.email_enviado_em IS NULL AND a.criado_em >= datetime('now', '-7 days') AND COALESCE(u.ativo, 1) <> 0
      ORDER BY a.user_id, projeto, a.vence_em, a.titulo`
  ).all<LinhaEmail>();
  const porPessoa = new Map<string, LinhaEmail[]>();
  for (const l of results) porPessoa.set(l.user_id, [...(porPessoa.get(l.user_id) ?? []), l]);

  for (const [userId, linhas] of porPessoa) {
    const n = linhas.length;
    const ok = await enviarEmail(env, linhas[0].email, `n.iso: ${n} ${n === 1 ? 'prazo' : 'prazos'} para acompanhar`, emailResumo(linhas, appUrl(env)));
    // Recusado: fica nulo e o dia seguinte tenta de novo, sem notificação nova. O log leva o id, não o e-mail.
    if (!ok) { r.falhas.push(`email ${userId}: envio recusado`); continue; }
    await env.DB.prepare(`UPDATE avisos_prazo SET email_enviado_em = datetime('now') WHERE email_enviado_em IS NULL AND id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(linhas.map((l) => l.id))).run();
    r.emails_enviados++;
  }
}

/** HTML simples, todo dado escapado, agrupado por projeto. Link único para o app: o SPA não roteia por URL. */
function emailResumo(linhas: LinhaEmail[], base: string): string {
  const e = escapeHtml;
  const porProjeto = new Map<string, LinhaEmail[]>();
  for (const l of linhas) porProjeto.set(l.projeto, [...(porProjeto.get(l.projeto) ?? []), l]);
  const blocos = [...porProjeto].map(([projeto, ls]) =>
    `<h3 style="font-size: 15px; margin: 20px 0 8px;">${e(projeto)}</h3><ul>${ls.map((l) =>
      `<li>${e(ROTULO[l.fonte])}: ${e(l.titulo)} (${e(quando(l.marco))}, ${dataBr(l.vence_em)})</li>`).join('')}</ul>`).join('');
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; color: #1e293b;">
    <p>Estes prazos precisam da sua atenção:</p>${blocos}
    <p><a href="${e(base)}" style="background-color: #00ade8; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Abrir o n.iso</a></p>
    <p style="font-size: 12px; color: #64748b;">Os mesmos avisos estão no sino do n.iso, com o link de cada item.</p>
  </div>`;
}
```

- [ ] **Step 4: Despacho no `scheduled` e o cron**

Em `src/index.ts`, junto do import de `manutencaoDiaria` (linha 55):

```ts
import { avisosDePrazo, hojeEmSaoPaulo } from './services/avisos-prazo';
```

No comentário das linhas 499-502, trocar "`scheduled` é o cron de manutenção (ver `src/manutencao.ts` e o bloco `triggers` do `wrangler.jsonc`)." por "`scheduled` atende os dois crons do bloco `triggers` do `wrangler.jsonc`: 04:10 UTC, a manutenção (`src/manutencao.ts`); 11:00 UTC, os avisos de prazo (`src/services/avisos-prazo.ts`)." e, logo antes de `const fetchHono`, acrescentar:

```ts
/** 11:00 UTC = 08:00 em Brasília (UTC-3, sem horário de verão). O mesmo texto vai em `triggers.crons`. */
export const CRON_AVISOS = '0 11 * * *';
```

Trocar o `scheduled` (linhas 561-563) por:

```ts
  scheduled: (evento: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    // ponytail: cron que não é o dos avisos cai na manutenção, o comportamento de antes desta rotina.
    ctx.waitUntil(evento.cron === CRON_AVISOS ? avisosDePrazo(env, hojeEmSaoPaulo()) : manutencaoDiaria(env));
  },
```

Em `wrangler.jsonc:45`, trocar `"crons": ["10 4 * * *"]` por `"crons": ["10 4 * * *", "0 11 * * *"]`. O `"crons": []` do ambiente de staging (linha 130) fica como está.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/avisos-prazo.test.ts test/manutencao.test.ts test/colunas-catraca.test.ts test/any-catraca.test.ts`
Expected: PASS. Se o `any-catraca` reclamar que subiu, há `any` no código novo: tipe em vez de subir o TETO.

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/services/avisos-prazo.ts src/index.ts wrangler.jsonc test/avisos-prazo.test.ts
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(avisos): rotina diária das 08:00 com sino e e-mail-resumo idempotentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: O clique no aviso abre a tela do item no projeto do aviso

**Files:**
- Modify: `frontend/src/globals.js:1001-1023` (`handleNotificationClick`)
- Test: `frontend/test/globals-shell.test.js` (acrescentar)

**Interfaces:**
- Consumes: os links da Task 4 (`/projects/<id>/capa|audits|certification|policies`).
- Produces: nada para outras tarefas.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `frontend/test/globals-shell.test.js`:

```js
describe('notificação de prazo (avisos de prazo)', () => {
  it.each([
    ['/projects/p9/capa', 'capa', 'renderCAPA'],
    ['/projects/p9/audits', 'audits', 'renderAudits'],
    ['/projects/p9/certification', 'certification', 'renderCertification'],
    ['/projects/p9/policies', 'policies-dashboard', 'renderPoliciesDashboard'],
  ])('%s abre %s no projeto do aviso, não no projeto ativo', async (link, view, tela) => {
    const { api } = await import('../src/api.js');
    api.mockImplementation(async () => []);
    document.body.innerHTML += '<div id="notif-dropdown"></div><h1 id="header-title"></h1><div id="header-actions"></div><div id="content"></div>';
    const desenhar = vi.fn();
    globalThis[tela] = desenhar;
    S.projects = [{ id: 'p1', client_name: 'Outro' }, { id: 'p9', client_name: 'Acme' }];
    S.activeProject = S.projects[0];
    S.currentProject = S.projects[0];
    S.notifications = [{ id: 'n9', read: 0, type: 'prazo_capa', title: 'CAPA vence hoje', link }];
    try {
      await window.handleNotificationClick('n9');
      expect(S.view).toBe(view);
      expect(S.activeProject.id).toBe('p9');
      expect(S.currentProject.id).toBe('p9');
      expect(desenhar).toHaveBeenCalled();
    } finally {
      delete globalThis[tela];
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/globals-shell.test.js --pool=threads`
Expected: FAIL — `S.view` é `project-detail` (o link cai no `else` de hoje).

- [ ] **Step 3: Implementar**

Em `frontend/src/globals.js`, logo antes de `window.handleNotificationClick = async function handleNotificationClick(id) {`:

```js
// Telas abertas pelos avisos de prazo (src/services/avisos-prazo.ts, TELA). Elas leem S.activeProject:
// sem trocá-lo, o aviso do projeto B abria a lista do A.
// ponytail: troca só em memória; recarregar volta ao projeto salvo em localStorage.
const TELA_DO_AVISO = { capa: 'capa', audits: 'audits', certification: 'certification', policies: 'policies-dashboard' };
```

E no encadeamento de `subview` (hoje em 1015-1023), entre o ramo `soa` e o `else`:

```js
                } else if (subview === 'soa') {
                    navigate('soa', { currentProject: proj });
                } else if (Object.hasOwn(TELA_DO_AVISO, subview || '')) {
                    navigate(TELA_DO_AVISO[subview], { currentProject: proj, activeProject: proj });
                } else {
                    navigate('project-detail', { currentProject: proj });
                }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/globals-shell.test.js test/globais-sem-import.test.js test/router.test.js --pool=threads`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/globals.js frontend/test/globals-shell.test.js
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(avisos): clique no aviso abre CAPA, auditorias, certificação ou políticas do projeto certo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentação e verificação completa

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Não publicado]` → `### Adicionado`)
- Modify: `AGENTS.md` (números com comando; bullet de rotinas agendadas)
- Modify: `migrations/README.md` (Estado + seção 0046)

**Interfaces:**
- Consumes: tudo das Tasks 1-5.
- Produces: nada.

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não publicado]`, no topo de `### Adicionado`:

```markdown
- Avisos de prazo: todo dia às 08:00 (Brasília) o n.iso avisa no sino e num e-mail-resumo por pessoa, 7 dias antes, no dia e uma vez por semana enquanto vencido, os prazos de CAPA, item do checklist, auditoria, certificado, link do auditor externo e revisão anual de política (12 meses após a assinatura mais recente das duas). Recebem o responsável (quando o campo bate com e-mail ou nome de quem alcança o projeto) e o consultor designado; sem nenhum dos dois, o `consultoria_admin` da organização. Nunca sai da organização do projeto. Sem `RESEND_API_KEY`, só o sino. Registro em `avisos_prazo` (migration 0046), apagado após 400 dias.
```

- [ ] **Step 2: AGENTS.md (cada número com o comando que o mede)**

Rodar e anotar a saída de cada um:

```bash
grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l
ls migrations/*.sql | tail -1
ls src/services/*.ts | wc -l
git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l
ls test/*.test.ts | wc -l
ls frontend/test/*.test.js | wc -l
```

Expected (conferir, não copiar): 59 tabelas, `migrations/0046_avisos_prazo.sql`, 20 services, 543 `any`, contagem de testes de backend = a de antes + 3.

Atualizar em `AGENTS.md`: a linha do **Schema** (número de tabelas, data `2026-10-07` e última migration **0046**); a dos **Services** (contagem e data); a do **`any`** em "Divida conhecida" (número e data); a dos **arquivos de teste do backend** (número e data); a de testes de frontend em jsdom, se mudou. Acrescentar depois do bullet **Bindings**:

```markdown
- **Rotinas agendadas** (`grep -A2 '"triggers"' wrangler.jsonc`): `10 4 * * *` roda a manutenção
  (`src/manutencao.ts`, purga e retenção) e `0 11 * * *` (08:00 em Brasília) os avisos de prazo
  (`src/services/avisos-prazo.ts`: sino + e-mail-resumo, idempotência em `avisos_prazo`). O
  `scheduled` de `src/index.ts` despacha por `event.cron`; staging tem `crons: []`.
```

- [ ] **Step 3: migrations/README.md**

Em "## Estado", trocar a última migration para **0046** e a contagem de arquivos pelo resultado de `ls migrations/*.sql | wc -l`. No fim do arquivo:

```markdown
---

## 0046 — avisos de prazo (2026-10)

Cria `avisos_prazo` (uma linha por fonte, item, marco, pessoa e vencimento; `UNIQUE(fonte, item_id,
marco, user_id, vence_em)`) e o índice `idx_avisos_prazo_email`. Só `CREATE ... IF NOT EXISTS`,
nenhuma tabela existente muda.

Conferência depois de aplicar: `PRAGMA table_info(avisos_prazo)` mostra `id, project_id, fonte,
item_id, marco, user_id, vence_em, titulo, criado_em, email_enviado_em`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply")
→ merge, porque `deploy.yml` recusa migration pendente. O cron novo (`0 11 * * *`) entra com o deploy;
sem a tabela, a rotina registraria falha em todo item.
```

- [ ] **Step 4: Verificação completa (cole as saídas no PR)**

Run: `npx tsc --noEmit`
Expected: sem saída.

Run: `npx vitest run` (raiz; ~20 min)
Expected: todos os arquivos passam, exit 0. Confira o exit code, não só o "N passed" (rejeição não tratada dá exit 1 com tudo verde).

Run: `cd frontend && npx vitest run --pool=threads`
Expected: todos passam.

Run: `cd frontend && npm run build`
Expected: build sem erro.

Run: `python -c "import sys; [print(f, open(f,'rb').read(3)) for f in sys.argv[1:]]" src/services/avisos-prazo.ts migrations/0046_avisos_prazo.sql test/avisos-prazo.test.ts test/enviar-email.test.ts test/migration-0046.test.ts`
Expected: nenhum começa com `b'\xef\xbb\xbf'`.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md AGENTS.md migrations/README.md
git -c user.email=44273656+resper1965@users.noreply.github.com commit -m "docs(avisos): changelog, AGENTS e procedimento da migration 0046

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Auto-revisão (contra a spec)

- Seção 1 (situação): coberta pelos "Achados conferidos".
- Seção 2 (fontes e regras): Task 2, uma consulta por fonte; política com texto e as duas assinaturas, 12 meses após a mais recente.
- Seção 3 (marcos): `marcoDoDia` (Task 2) e a guarda de `D0` na mesma semana (Task 4).
- Seção 4 (destinatários e isolamento): Task 3, com paridade contra `requireProjectAccess`; link do auditor, auditoria e certificado não têm responsável, então vão só à equipe.
- Seção 5 (registro, ordem, retentativa, sem chave, limpeza): Tasks 1 e 4.
- Seção 6 (sino, e-mail, `enviarEmail`): Tasks 1, 4 e 5.
- Seção 7 (cron, despacho, `hoje`, falha isolada): Task 4 (e Task 2 para a falha por fonte).
- Seção 8 (fora da v1): nada implementado.
- Seção 9 (testes 1-7): 1 → Task 2 (`fontes do dia`); 2 → Task 4 (primeiro teste); 3 → Task 3; 4 → Task 2 (política); 5 → Task 4 (primeiro e segundo testes); 6 → Tasks 2 e 4; 7 → Task 4 (`scheduled despacha pelo cron`).
