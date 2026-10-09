# Núcleo do n.privacy, fatia 3 (Documentos) — decomposição e plano da 3.1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.6 e risco 3 da seção 7. Valor visível da fatia: "política com versão e revisão; ciência 'versão anterior'".

## O que existe hoje (medido, não suposto)

Não há entidade "política". A política é o **texto em `compliance_controls.description`**, as versões ficam em `policy_versions` (numeradas por `COUNT(*)+1`, sem UNIQUE) e a **aprovação mora na mesma linha do controle** (`ciso_*`/`ceo_*`). O pedido de aprovação/ciência congela `title + description` do controle e guarda `ref_id = id do controle`. O portal público `/politicas` lista **todos** os controles; a ciência antiga (`policy_acknowledgments`) casa por título ou id, sem versão nem hash. Todo caminho de escrita (gerar, gerar em lote, gerar de modelo, editar, restaurar versão, `PUT` de controle, `niso_update_policy`) zera as aprovações e chama `conferirPedidosDoDocumento`. `description` tem **dois significados**: texto da política e justificativa de N/A na SoA.

**Medido em produção em 2026-10-09 (agregados, `wrangler d1 execute --remote`):** os 229 controles têm `description` preenchida, mas a média é de **316 caracteres** (texto de catálogo), contra **3.931** nas versões de `policy_versions`. Só **4 controles** têm versão de política (9 versões no total); **0** têm aprovação CISO/CEO, **0** têm pedido de política e `policy_acknowledgments` tem **0** linhas. Ou seja: `description` preenchida **não** quer dizer "é uma política", e a regra de importação não pode usá-la como sinal.

Consequência: trocar a fonte da verdade de uma vez toca políticas, pedidos, portal, MCP e SoA ao mesmo tempo (risco 3). Por isso a fatia se divide e **cada sub-fatia deixa o sistema funcionando**.

## Decomposição

| Sub-fatia | Entrega | Mexe no fluxo atual? | Migration |
|---|---|---|---|
| **3.1 Núcleo de documentos** (este plano) | Tabelas `documentos` e `documento_versoes`, importação das políticas existentes (sob demanda, repetível), API de leitura e de versões (criar, rascunho, publicar) | **Não.** Só acrescenta; as políticas seguem nos controles | 0050 (aditiva) |
| 3.2 Escritores | Gerar, editar, restaurar e `niso_update_policy` passam a gravar versão em `documentos` (o MCP cria `rascunho`, não sobrescreve); `compliance_controls.justificativa_exclusao` separa o N/A | Sim | 0051 (ALTER + backfill) |
| 3.3 Ciência por versão | Pedido `tipo='documento'` congela a versão; o portal `/politicas` lista documentos vigentes; `policy_acknowledgments` vira só leitura ("ciência sem prova de versão"); ciências antigas aparecem como "versão anterior" | Sim | 0052 |
| 3.4 Telas | Tela Documentos (hierarquia política → norma → procedimento, dono, revisão), aviso de revisão vencida no sino, substitui `policies-dashboard` | Sim | – |
| 3.5 Exceções | `documento_excecoes` com aprovação por pedido | – | 0053 |

`documento_requisitos` espera a fatia 2 (Requisitos). A aprovação CISO/CEO continua nos controles até a 3.3 decidir onde ela passa a morar; ver "Perguntas abertas".

## Perguntas abertas (não travam a 3.1)

1. **Onde mora a aprovação** (`ciso_*`/`ceo_*`) depois que o documento for a fonte do texto? Hoje ela invalida quando o texto muda. A opção que não reescreve prova: a assinatura passa a apontar para a **versão** (`documento_versoes`), e a linha do controle fica como espelho até a 3.3. Decidir na 3.2.
2. **Política em controle "Não aplicável":** `description` é a justificativa da SoA, não política. A importação **ignora** esses controles (regra abaixo) e os conta no resumo; a 3.2 move a justificativa para coluna própria.

---

# Plano da 3.1 — Núcleo de documentos

**Goal:** `documentos` e `documento_versoes` existem, as políticas atuais podem ser importadas para eles, e a API permite ler e versionar. O fluxo atual de políticas não muda.

**Architecture:** migration aditiva (duas tabelas, sem carga: SHA-256 não se calcula em SQLite, então a carga é uma rota por projeto, repetível, no padrão de `partes/importar` da 1.3). Serviço `src/services/documentos.ts` com `importarDocumentos`, `criarDocumento`, `salvarRascunho` e `publicarVersao`; rotas em `src/routes/documentos.ts`, montadas em `/api/v1/projects/:projectId` ao lado de `nucleoApp`.

**Tech Stack:** Cloudflare Workers (Hono), D1, Zod, Vitest com `cloudflare:test`.

## Global Constraints

- Schema muda em dois lugares: `schema.sql` e `migrations/0050_documentos.sql`; índice **depois** da tabela. `ALTER ... ADD COLUMN` não é idempotente (aqui não há).
- Toda tabela nova leva `project_id` (entra na portabilidade). `documento_versoes` repete `project_id` por isso.
- Hash da versão: `hashConteudo({ texto })` de `src/services/pedidos.ts:89` (o mesmo SHA-256 canônico dos pedidos).
- Banco real nos testes (`cloudflare:test`), nunca mock do D1.
- Nada de dado real de cliente em fixture; nomes fictícios ("Política Exemplo").
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge.
- Migration em produção só com "sim" do dono (`npm run db:backup` antes).

## Review Focus

1. Importar duas vezes não duplica documento nem versão.
2. Controle só com texto de catálogo (sem versão, aprovação nem pedido) **não** vira documento, e controle "Não aplicável" também não.
3. Texto atual do controle igual à última versão não cria versão repetida; texto diferente cria a vigente.
4. Publicar versão que não é rascunho, ou de outro documento: 404/409, sem tocar nada.
5. Documento de outro projeto não aparece nem se publica por id (tenant).
6. Duas requisições de publicar ao mesmo tempo nunca deixam duas versões `vigente` (índice parcial único).

## Decisões de desenho (rulings)

- **Um rascunho por documento.** `POST .../versoes` com rascunho existente **substitui o texto dele** (mesmo `numero`); sem rascunho, cria o próximo número. Índice único parcial `WHERE estado='rascunho'`.
- **Uma vigente por documento.** Índice único parcial `WHERE estado='vigente'`. Publicar faz `substituida` na vigente atual e `vigente` no rascunho, no mesmo `db.batch` (transação).
- **`origem_control_id`** (coluna transitória, UNIQUE parcial) liga o documento ao controle de onde veio: torna a importação idempotente e deixa a 3.2 gravar nos dois lados. Sai quando a 3.3 fechar.
- **Importação** usa só controles com `status != 'Not Applicable'` que tenham **algum sinal de política**: ao menos uma linha em `policy_versions`, ou aprovação `ciso_*`/`ceo_*`, ou pedido `tipo='politica'` com `ref_id` igual ao controle. Texto de catálogo sozinho não conta (em produção seria ~213 falsos documentos; os reais são 4). Versões vêm de `policy_versions` por `version ASC`, renumeradas 1..n. Se `trim(description) != ''` e difere da última versão (ou não há versões), entra mais uma versão com o texto atual. A última é `vigente`, as anteriores `substituida`. Controle com sinal mas sem nenhum texto (nem versão, nem `description`) é ignorado e contado. `origem='humano'` para todas (a origem real não está registrada) e `criado_por` do registro de origem, ou o ator.
- **`status` do documento** na importação: `vigente`. Em `POST /documentos`: `rascunho` até publicar.
- **`revisar_ate`** = data da publicação + `revisar_a_cada_meses` (se informado). A rotina que sinaliza vencimento é da 3.4.
- **Papéis:** leitura para quem alcança o projeto; escrita segue o RBAC por método e rota que já vale para `/projects/:projectId/*`.

## File Structure

| Arquivo | Papel |
|---|---|
| `migrations/0050_documentos.sql` | tabelas `documentos`, `documento_versoes` e índices |
| `schema.sql` | as mesmas, no fim |
| `src/schemas/documentos.ts` (+ export em `src/schemas/index.ts`) | corpos Zod |
| `src/services/documentos.ts` | regras e SQL |
| `src/routes/documentos.ts` (+ montagem em `src/index.ts`) | HTTP |
| `src/services/partes.ts` | exporta `emLotes` e `mudancas` (hoje locais) para reuso |
| `test/migration-0050.test.ts`, `test/documentos.test.ts`, `test/documentos-importar.test.ts` | provas |
| `test/contrato-isolamento-org.test.ts`, `-topo.test.ts` | entradas das rotas novas |

---

### Task 1: Migration 0050 e schema

**Files:** Create `migrations/0050_documentos.sql`, `test/migration-0050.test.ts`; Modify `schema.sql`.

- [ ] **Step 1: Teste (vermelho).** `test/migration-0050.test.ts`, no estilo de `test/migration-0049.test.ts`: aplica a migration sobre um banco que já tem `projects`, `partes` e `compliance_controls`, e confere (a) `PRAGMA table_info(documentos)` e `(documento_versoes)` listam as colunas abaixo; (b) o índice parcial recusa duas versões `vigente` do mesmo documento e duas `rascunho`; (c) `UNIQUE(documento_id, numero)` recusa número repetido; (d) apagar o projeto apaga documentos e versões (cascata); (e) apagar a parte dona deixa `dono_parte_id` nulo.

- [ ] **Step 2: Migration.**

```sql
-- 0050 — núcleo do n.privacy, fatia 3.1: documentos e versões. Só CREATE ... IF NOT EXISTS, sem carga:
-- a importação das políticas existentes é POST /api/v1/projects/:projectId/documentos/importar.
CREATE TABLE IF NOT EXISTS documentos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'politica' CHECK (tipo IN ('politica', 'norma', 'procedimento')),
  titulo TEXT NOT NULL,
  pai_id TEXT REFERENCES documentos(id) ON DELETE SET NULL,
  dono_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
  revisar_a_cada_meses INTEGER CHECK (revisar_a_cada_meses IS NULL OR revisar_a_cada_meses BETWEEN 1 AND 120),
  revisar_ate TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'vigente', 'obsoleto')),
  origem_control_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL, -- transitório: sai na 3.3
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documentos_projeto ON documentos(project_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_controle ON documentos(origem_control_id) WHERE origem_control_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS documento_versoes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  texto TEXT NOT NULL,
  hash TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'vigente', 'substituida')),
  origem TEXT NOT NULL DEFAULT 'humano' CHECK (origem IN ('humano', 'agente', 'gerador')),
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_vigente ON documento_versoes(documento_id) WHERE estado = 'vigente';
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_rascunho ON documento_versoes(documento_id) WHERE estado = 'rascunho';
```

- [ ] **Step 3: `schema.sql`.** Acrescente o mesmo bloco no fim, depois de `partes`/`compliance_controls` (as FKs apontam para elas).
- [ ] **Step 4:** `npx vitest run test/migration-0050.test.ts test/schema-contract.test.ts` — Expected: PASS. Rode também a mutação: tire o índice `idx_doc_versao_vigente` da migration e confirme que o teste (b) falha; restaure.
- [ ] **Step 5: Commit** `feat(documentos): migration 0050 — documentos e versões`.

### Task 2: Serviço e rotas de leitura/versão (TDD)

**Files:** Create `src/schemas/documentos.ts`, `src/services/documentos.ts`, `src/routes/documentos.ts`, `test/documentos.test.ts`; Modify `src/schemas/index.ts`, `src/index.ts`, `src/services/partes.ts` (exportar `emLotes` e `mudancas`).

**Interfaces — produz:** `criarDocumento(db, projectId, ator, dados)`, `salvarRascunho(db, projectId, documentoId, ator, texto, origem)`, `publicarVersao(db, projectId, documentoId, numero, ator)`, `listarDocumentos(db, projectId)`, `lerDocumento(db, projectId, id)`.

- [ ] **Step 1: Schemas** (`src/schemas/documentos.ts`):

```ts
import { z } from 'zod';

const titulo = z.string().trim().min(1).max(300);
const texto = z.string().min(1).max(2_000_000); // 2 MB, o mesmo teto da edição de política atual

export const TIPOS_DOCUMENTO = ['politica', 'norma', 'procedimento'] as const;
export const documentoCriarSchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO).default('politica'),
  titulo,
  texto,
  pai_id: z.string().trim().min(1).max(100).nullish(),
  dono_parte_id: z.string().trim().min(1).max(100).nullish(),
  revisar_a_cada_meses: z.number().int().min(1).max(120).nullish(),
});
export const versaoSalvarSchema = z.object({ texto, origem: z.enum(['humano', 'agente', 'gerador']).default('humano') });
```

- [ ] **Step 2: Testes (vermelho)** em `test/documentos.test.ts` (platform_admin em `proj-a`, `seedTwoProjects`): (a) `POST /documentos` cria documento `rascunho` com versão 1 `rascunho` e `hash` de 64 hex; (b) `GET /documentos` lista só o do projeto e `GET /documentos/:id` devolve as versões; (c) `POST /documentos/:id/versoes` com rascunho existente **substitui** o texto e o hash sem criar versão nova; (d) `POST /documentos/:id/versoes/1/publicar` deixa a versão `vigente`, o documento `vigente` e `revisar_ate` preenchido quando há `revisar_a_cada_meses`; (e) nova versão + publicar: a antiga vira `substituida`, a nova `vigente`, `numero` 2; (f) publicar versão já `vigente` ou inexistente: 409/404 e nada muda; (g) `pai_id`/`dono_parte_id` de outro projeto: 400; (h) documento de `proj-a` lido ou publicado pelo caminho de `proj-b`: 404; (i) duas publicações em paralelo (`Promise.all`) deixam **exatamente uma** `vigente`.

- [ ] **Step 3: Serviço.** Regras que o código deve cumprir (o teste manda):
  - `hash = await hashConteudo({ texto })`; `id = crypto.randomUUID()`; datas em `CURRENT_TIMESTAMP`.
  - `criarDocumento`: valida `pai_id` e `dono_parte_id` com `SELECT 1 ... WHERE id = ? AND project_id = ?` (400 com a mensagem "<campo> inexistente ou de outro projeto"); insere documento e versão 1 no mesmo `db.batch`.
  - `salvarRascunho`: se há rascunho, `UPDATE documento_versoes SET texto, hash, origem, criado_por WHERE id = ? AND estado = 'rascunho'`; senão `INSERT` com `numero = COALESCE(MAX(numero), 0) + 1` calculado na própria instrução.
  - `publicarVersao`: `db.batch([UPDATE ... SET estado='substituida' WHERE documento_id=? AND estado='vigente' AND numero != ?, UPDATE ... SET estado='vigente' WHERE documento_id=? AND numero=? AND estado='rascunho', UPDATE documentos SET status='vigente', revisar_ate=CASE WHEN revisar_a_cada_meses IS NOT NULL THEN date('now', '+' || revisar_a_cada_meses || ' months') END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?])`; se a segunda instrução mudou 0 linhas, devolva 409 (versão não é rascunho). O índice parcial único é a trava contra a corrida.
  - Auditoria com `logAudit(db, 'documento.criado' | 'documento.versao' | 'documento.publicado', ator, detalhe, '', '', projectId)`.

- [ ] **Step 4: Rotas** em `src/routes/documentos.ts` (`documentosApp`, mesmo molde de `nucleoApp`): `GET /documentos`, `GET /documentos/:id`, `POST /documentos`, `POST /documentos/:id/versoes`, `POST /documentos/:id/versoes/:numero/publicar`. Mensagens de erro em português; `erro500` no `catch`. Monte em `src/index.ts` ao lado de `app.route('/api/v1/projects/:projectId', nucleoApp)` e exporte os schemas em `src/schemas/index.ts`.
- [ ] **Step 5:** `npx vitest run test/documentos.test.ts` — Expected: PASS.
- [ ] **Step 6: Contratos.** `npx vitest run test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/openapi.test.ts test/trilha-exclusao.test.ts`. Replique o que a 1.1 fez para `partes`: uma entrada em `CORPOS` por rota com corpo (`'POST /api/v1/projects/:projectId/documentos': () => ({ titulo: 'Varredura', texto: 'x' })`, `'POST .../documentos/:id/versoes': () => ({ texto: 'x' })`), e `VALOR_FIXO` para `documentos`/`documento_versoes` se o teste pedir; depois `npm run openapi` para regenerar `docs/openapi.json`. Ajuste só o que o teste apontar.
- [ ] **Step 7: Commit** `feat(documentos): API de documentos e versões`.

### Task 3: Importação das políticas existentes (TDD)

**Files:** Modify `src/services/documentos.ts`, `src/routes/documentos.ts`; Create `test/documentos-importar.test.ts`.

- [ ] **Step 1: Testes (vermelho).** Semente: em `proj-a`, controle `c1` (`description` "Texto A2", com `policy_versions` v1 "Texto A1", v2 "Texto A2"), `c2` (`description` "Texto B", sem versões, com `ciso_approved_by` preenchido), `c3` (`status='Not Applicable'`, com versões, `description` "Justificativa da SoA"), `c4` (só `description` de catálogo, sem versão, aprovação nem pedido), `c5` (pedido `tipo='politica'` com `ref_id='c5'` e `description` "Texto E"); em `proj-b`, um controle com versão. Esperado em `POST /documentos/importar` de `proj-a`: `{ ok: true, criados: 4, ja_existiam: 0, versoes: 6, ignorados_nao_aplicavel: 1, ignorados_sem_texto: 1 }`; `c1` vira documento com versões 1 `substituida` ("Texto A1") e 2 `vigente` ("Texto A2"); `c2` e `c5` viram documento com 1 versão `vigente` cada; `c3` e `c4` não viram nada; documento tem `status='vigente'`, `tipo='politica'`, `titulo` = título do controle e `origem_control_id` preenchido; `proj-b` não foi tocado. Segunda chamada: `{ criados: 0, ja_existiam: 4, versoes: 0, ignorados_nao_aplicavel: 1, ignorados_sem_texto: 1 }`. Controle cuja `description` difere da última `policy_versions` ganha uma versão extra `vigente` com o texto atual. Trilha: `audit_logs.action = 'documentos.importados'` com o `project_id`.
- [ ] **Step 2: Implementar `importarDocumentos(db, projectId, ator)`** conforme as decisões de desenho acima, em lotes com `emLotes` (documentos primeiro, depois versões: a FK exige a ordem).
- [ ] **Step 3: Rota** `POST /documentos/importar`, declarada **antes** de `POST /documentos/:id/versoes` e de qualquer `/:id`; resposta `{ ok: true, ...resumo }`.
- [ ] **Step 4:** `npx vitest run test/documentos-importar.test.ts test/documentos.test.ts` — Expected: PASS. Mutações: troque o filtro `status != 'Not Applicable'` e confirme que o teste do `c3` falha; troque o critério de sinal por `trim(description) != ''` e confirme que o teste do `c4` falha.
- [ ] **Step 5: Commit** `feat(documentos): importar políticas existentes`.

### Task 4: Documentação, contagens e verificação final

**Files:** Modify `AGENTS.md`, `README.md`, `migrations/README.md`, `CHANGELOG.md`, `docs/retencao.md`.

- [ ] **Step 1:** Meça com os comandos do `AGENTS.md` e atualize (migrations: última 0050; serviços; rotas em `src/routes`; tabelas em `schema.sql`; arquivos de teste). `migrations/README.md`: seção "0050" (aditiva, sem carga, conferência por `PRAGMA table_info(documentos)`, ordem `db:backup` → `migrations apply` → `migrations list` → merge). `docs/retencao.md`: `documentos` e `documento_versoes` não são purgados (texto de política é registro do sistema de gestão). `CHANGELOG.md`, em `### Adicionado`: "Documentos (fatia 3.1, migration 0050): ...".
- [ ] **Step 2:** `npx tsc --noEmit` (exit 0); `npx vitest run --maxWorkers=2` até o fim, lendo o resumo e o código de saída (use `run_in_background` se passar de 10 minutos); `npx vitest run test/sem-dado-de-cliente.test.ts`. Se a guarda reclamar de `backups/`, mova o dump para fora do repositório.
- [ ] **Step 3: Commit, push, PR** sem merge. A migration 0050 em produção e o merge dependem do "sim" do dono. Depois do deploy, o consultor roda `POST /documentos/importar` por projeto.

## Auto-revisão

- **Cobertura da spec 4.6 (só o que a 3.1 promete):** `documentos` e `documento_versoes` com os campos da spec; hash SHA-256 canônico; estado de versão; origem; revisão (`revisar_a_cada_meses`/`revisar_ate`). Fora, por desenho e com sub-fatia dona: `documento_requisitos` (fatia 2), `documento_excecoes` (3.5), ciência por versão (3.3), migração do portal (3.3), justificativa de exclusão (3.2), rascunho imposto no MCP (3.2), telas (3.4).
- **Placeholders:** nenhum; os trechos que o teste "manda" (Task 2 Step 3) estão como regras verificáveis, e o SQL e os schemas estão completos.
- **Consistência de nomes:** `criarDocumento`, `salvarRascunho`, `publicarVersao`, `listarDocumentos`, `lerDocumento`, `importarDocumentos`, `origem_control_id` e as rotas são os mesmos nas tarefas.
- **Limite honesto:** o código ainda não rodou; os testes é que vão provar. A importação foi desenhada sobre o mapeamento do código e sobre os agregados de produção acima (4 controles com versão, 0 aprovações, 0 pedidos, 0 ciências); o resultado esperado em produção é **4 documentos**, e é isso que se confere depois do `importar` (`SELECT count(*) FROM documentos`), antes de dar a fatia por feita.
