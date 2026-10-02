# Sistema de propostas, fatia 3 (a proposta) — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`. Passos com `- [ ]`.

**Objetivo:** o comercial monta uma proposta a partir de um lead (com ou sem diagnóstico), escolhendo serviços do catálogo; o sistema calcula o preço com memória, gera o documento completo congelado (HTML + hash) e controla revisões e a aprovação de desconto acima do teto.

**Arquitetura:** tabelas novas `propostas` e `proposta_itens` (as 2 linhas antigas de `proposals` ficam só para leitura até a fatia 4 remover o fluxo antigo). Três módulos puros e testáveis sem banco — `preco-proposta.ts` (cálculo), `diagnostico.ts` (faixa, porte, maturidade, lacunas), `documento-proposta.ts` (HTML) — e um router `propostas.ts` que só orquestra. O documento é montado no servidor, com escape de todo texto, e guardado inteiro.

**Stack:** Workers + Hono 4.13 + D1, zod 4.5, `crypto.subtle` (SHA-256), Vite vanilla-JS, vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md`, seções 4, 5 e 10. **Base:** fatias 1 e 2 em produção (`lerConfigOrg`, `orgDoUsuario`, `formatarNumeroProposta`, `servicos`, `servicoSchema`, `Servico`).

## Restrições globais

As mesmas do plano das fatias 1–2 (`docs/superpowers/plans/2026-10-02-sistema-de-propostas.md`): worktree de `origin/main`; rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; schema em dois lugares (próxima migration: **0038**); backup + `migrations apply` antes do merge; OpenAPI + `npm run openapi`; rotas comerciais em `FORA_DO_AGENTE`; `escapeHtml` em todo texto que vira HTML; sem handler/`<script>` inline; TDD com mutação; **cada implementador roda a suíte inteira do backend (`npm test`) antes de entregar** — na fatia 2 o teste genérico de isolamento quebrou porque só os arquivos tocados foram rodados. Tabela nova com `CHECK` de enum entra em `VALOR_FIXO` de `test/contrato-isolamento-topo.test.ts`.

## Decisões (rulings) deste plano

| Decisão | Por quê | Custo se errado |
|---|---|---|
| Tabelas novas `propostas`/`proposta_itens`; `proposals` fica como legado | só 2 propostas antigas em produção, ambas esboço de uma linha, nenhuma assinada | migrar 2 linhas depois |
| Estado `gerada` entre `rascunho` e `enviada` (o spec não tinha) | o comercial precisa do documento congelado para imprimir e mandar por conta própria antes de a fatia 4 existir | um estado a mais no funil |
| Gerar exige `textos.termos` preenchido na organização | os termos padrão dependem de revisão jurídica (spec §12); proposta sem termos não sai | o comercial precisa configurar antes de gerar |
| Lacunas citam só ISO 27001 e LGPD; referências da 27701 ficam fora até a conferência contra a norma (spec §12) | `GAPS` usa a numeração da edição antiga | a seção perde precisão na 27701 até a conferência |
| Maturidade por domínio: 6 domínios, mapeamento das 31 perguntas abaixo | a prévia aprovada mostra as barras | ajuste de mapeamento |
| Fluxo antigo ("Gerar proposta" do levantamento, "Aprovar", `/sign`, `/convert`) continua até a fatia 4; a fatia 3 troca só a tela de Propostas | não quebrar o que funciona antes do aceite existir | duas portas de entrada por uma fatia |

Mapeamento das perguntas (`SCORE_MAP` em `src/services/pricing.ts`) para domínios:

| Domínio | Chaves |
|---|---|
| Identidade e acesso | `iam`, `mfa`, `prod_access`, `offboarding` |
| Operação e continuidade | `backup`, `logging`, `vuln_mgmt`, `pentest` |
| Desenvolvimento seguro | `sdlc`, `code_review`, `cicd`, `sast_sca`, `branch_protection` |
| Privacidade (LGPD) | `ropa`, `dsr_channel`, `dpia`, `legal_bases`, `retention`, `dpa_contracts` |
| Governança e documentação | `commitment`, `si_policy`, `risk_assessment`, `documented_info`, `doc_repo`, `doc_version`, `doc_approval`, `classification` |
| Pessoas e fornecedores | `competence_records`, `internal_comm`, `supplier_eval`, `awareness_docs` |

Maturidade do domínio = `100 × (1 − Σ pontos / Σ máximo)` sobre as perguntas **respondidas**; domínio sem resposta não aparece.

## Review Focus

1. **Desconto acima do teto** enviado direto pela API (sem passar pela tela): a proposta não pode chegar a `gerada` sem aprovação; `gerar` responde 409 com a mensagem do teto.
2. **Número manual repetido ou com formato estranho** (espaço, minúscula, outro prefixo): 400/409 claros; nunca duas propostas com o mesmo `(org_id, numero, revisao)`; reserva automática não pula nem repete número sob duas gerações seguidas.
3. **Texto do comercial com HTML** (`<script>`, `<img onerror>`, `"` em atributo) nos quatro campos livres, no nome do cliente e no texto do catálogo: sai escapado no documento; o documento não contém `<script>`.
4. **Editar proposta já gerada** (PUT, trocar itens) ou gerar duas vezes: 409; o documento e o hash não mudam; mudança só por revisão.
5. **Catálogo alterado depois da geração**: o documento e o hash da proposta gerada continuam idênticos (o item guarda cópia do serviço).

---

### Tarefa 1: tabelas `propostas` e `proposta_itens`

**Arquivos:** `schema.sql`, `migrations/0038_propostas.sql`, `test/migration-0038.test.ts`, `test/schema-contract.test.ts`, `test/contrato-isolamento-topo.test.ts` (`VALOR_FIXO`), `migrations/README.md`.

DDL (igual nos dois lugares; sem `;` dentro de comentário):

```sql
-- Proposta comercial (spec do sistema de propostas, seções 4 e 5). Cada revisão
-- é uma linha: mesmo numero, revisao + 1. O documento gerado é congelado.
CREATE TABLE IF NOT EXISTS propostas (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    lead_id TEXT REFERENCES leads(id),
    assessment_id TEXT REFERENCES assessments(id),
    numero TEXT,
    revisao INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'gerada', 'enviada', 'visualizada', 'aceita', 'recusada', 'expirada', 'substituida')),
    cliente TEXT NOT NULL,
    validade_dias INTEGER NOT NULL DEFAULT 30,
    pagamento TEXT NOT NULL DEFAULT '40/30/30',
    contexto TEXT NOT NULL DEFAULT '',
    escopo TEXT NOT NULL DEFAULT '',
    observacoes TEXT NOT NULL DEFAULT '',
    consultor_email TEXT,
    total_projeto REAL NOT NULL DEFAULT 0,
    mensalidade REAL NOT NULL DEFAULT 0,
    memoria TEXT,
    margem TEXT,
    desconto_aprovado_por TEXT,
    desconto_aprovado_em DATETIME,
    documento_html TEXT,
    documento_hash TEXT,
    gerada_em DATETIME,
    valida_ate DATE,
    criada_por TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_numero ON propostas(org_id, numero, revisao);
CREATE INDEX IF NOT EXISTS idx_propostas_org ON propostas(org_id, status);

CREATE TABLE IF NOT EXISTS proposta_itens (
    id TEXT PRIMARY KEY,
    proposta_id TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    servico_id TEXT,
    servico TEXT NOT NULL,
    dias REAL,
    meses INTEGER,
    valor_base REAL NOT NULL DEFAULT 0,
    desconto_pct REAL NOT NULL DEFAULT 0,
    valor REAL NOT NULL DEFAULT 0,
    texto_cliente TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_proposta_itens ON proposta_itens(proposta_id, ordem);
```

`proposta_itens.servico` é a **cópia JSON** do serviço no momento em que foi adicionado (spec §3, regra 1). `numero` é nulo no rascunho e preenchido na geração; o índice único tolera vários `NULL`.

- [ ] Teste de contrato que falha (tabelas, colunas, `CHECK` de `status` recusa `'outra'`, índice único recusa número repetido na mesma organização e aceita em outra).
- [ ] DDL em `schema.sql` (depois de `leads`, `assessments`, `servicos`) e `0038` (tabela nova: roda normalmente).
- [ ] `test/migration-0038.test.ts` no estilo da `0037`.
- [ ] `VALOR_FIXO` ganha `propostas: { status: 'rascunho' }`; rodar `test/contrato-isolamento-topo.test.ts`.
- [ ] Mutação (tirar o índice único) → teste cai. `npm test` inteiro. Commit `feat(propostas): tabelas da proposta e dos itens`.

### Tarefa 2: cálculo de preço (`src/services/preco-proposta.ts`, puro)

**Interfaces produzidas:**

```ts
export type Faixa = '1' | '2' | '3';
export interface AjusteItem { dias?: number; meses?: number; descontoPct?: number }
export interface ItemCalculado {
  valorBase: number; descontoPct: number; valor: number; dias: number | null; meses: number | null;
  natureza: 'projeto' | 'mensal';
  memoria: string; // linha legível, ex. "Implementação, Standard: 90 dias × 1,3 (120 pessoas) = 117 dias × R$ 2.900 = R$ 339.300 → desconto 10% → R$ 305.370"
}
export function fatorDePorte(porte: ConfigPreco['porte'], pessoas: number | null): { fator: number; rotulo: string };
export function calcularItem(s: Servico, a: AjusteItem, preco: ConfigPreco, faixa: Faixa, pessoas: number | null): ItemCalculado;
export function totais(itens: ItemCalculado[]): { totalProjeto: number; mensalidade: number };
export function descontoAcimaDoTeto(itens: ItemCalculado[], teto: number): boolean;
export function margem(itens: ItemCalculado[], preco: ConfigPreco, faixa: Faixa): { custoTotal: number; receitaLiquida: number; margemPct: number; viavel: boolean };
```

Regras (spec §4.2): `projeto` e `avulso`+`esforco`: `dias = a.dias ?? s.diasPorFaixa[faixa]`; `diasAjustados = dias × fator`; `valorBase = diasAjustados × preco.diaria[faixa]`. `avulso`+`fixo`: `valorBase = s.valorFixo` (porte não se aplica). `recorrente`: `valorBase = s.mensalidade × (a.meses ?? s.prazoMinimoMeses)`, `natureza: 'mensal'`, `meses ≥ prazoMinimoMeses` (senão erro). `valor = ceil(valorBase × (1 − desconto/100) / 1000) × 1000`. `pessoas` nulo → fator da primeira faixa. Margem: `custo = Σ diasAjustados × custoInterno[faixa] × (1 + overheadPct)`; `receitaLiquida = Σ valor (natureza projeto) × (1 − tributosPct)`; `viavel = margemPct ≥ margemAlvo`.

- [ ] Testes puros: os três tipos; porte (inclusive pessoas acima da maior faixa limitada cai na faixa ilimitada); `meses` abaixo do mínimo → erro; arredondamento; totais separados (mensal nunca soma no projeto); `descontoAcimaDoTeto`; o texto da memória do exemplo do spec bate exatamente; formatação em pt-BR (`R$ 339.300`, `1,3`).
- [ ] Implementar. Mutação: somar mensal no total do projeto → cai. Commit.

### Tarefa 3: diagnóstico para a proposta (`src/services/diagnostico.ts`, puro)

**Interfaces produzidas:**

```ts
export interface Diagnostico {
  faixa: Faixa; faixaNome: string; nota: number;
  pessoas: number | null;
  maturidade: { dominio: string; pct: number }[];
  lacunas: { titulo: string; requisito: string; impacto: string; acao: string }[];
}
export function diagnosticoDe(respostas: Record<string, string>): Diagnostico;
```

Usa `calcScore`, `getTier`, `getScopeInfo` (só para o número de pessoas) e `GAPS` de `pricing.ts`; o mapeamento de domínios da seção "Decisões". `requisito` da lacuna: os controles da 27001 do `GAPS` sem os trechos que citam 27701, mais o artigo da LGPD quando a lacuna é de privacidade (`ropa` → "LGPD art. 37", `dsr_channel` → "LGPD art. 18"); se sobrar vazio, só o artigo.

- [ ] Testes: respostas de exemplo → faixa, pessoas, 6 domínios com pct certo; domínio sem resposta some; nenhuma lacuna contém "27701"; a de ROPA contém "LGPD art. 37". Mutação: incluir a 27701 → cai. Commit.

### Tarefa 4: documento (`src/services/documento-proposta.ts`, puro)

**Interfaces produzidas:**

```ts
export interface DadosDocumento {
  org: ConfigOrg; numero: string; revisao: number; emitidaEm: string; validaAte: string;
  cliente: { nome: string; cnpj: string | null; pessoas: number | null };
  textos: { contexto: string; escopo: string; observacoes: string };
  itens: { servico: Servico; calc: ItemCalculado; textoCliente: string }[];
  totais: { totalProjeto: number; mensalidade: number };
  pagamento: string; diagnostico: Diagnostico | null;
}
export function montarDocumento(d: DadosDocumento): string;      // HTML completo, A4, CSS inline em <style>
export async function hashDocumento(html: string): Promise<string>; // SHA-256 hex
```

Seções e condições: tabela da spec §5.1. Visual: o da prévia aprovada (papel branco, A4, Montserrat títulos, Inter texto, cor da organização só em linhas e títulos; marca: para `org_ness` o wordmark `ness` + `.` na cor; para outras, o nome em texto). Sem `<script>`, sem recurso externo além de Google Fonts. Cronograma: barras em CSS a partir de `semanas` das fases. Sem diagnóstico, somem "O que o diagnóstico mostrou" e "Lacunas". `secoesDesligadas` respeitada.

- [ ] Testes: avulso sozinho não tem "Como trabalhamos", "Cronograma", "Responsabilidades"; projeto tem; recorrente mostra "por mês"; projeto + recorrente mostra os dois totais separados; sem diagnóstico some a seção; `secoesDesligadas` respeitada; **injeção** (`<script>`, `<img onerror=x>`, `" onclick="`) em contexto, escopo, observações, cliente, texto do catálogo e textos da organização → nenhum `<script` e nenhum `onerror=`/`onclick=` no HTML; `hashDocumento` estável para o mesmo HTML e diferente para HTML diferente.
- [ ] Implementar. Mutação: tirar o escape de um campo → teste de injeção cai. Commit.

### Tarefa 5: rotas `/api/v1/propostas`

**Rotas** (todas `ehComercial`; agente fora; tudo filtrado por `orgDoUsuario`; outra organização → 404):

| Rota | Faz |
|---|---|
| `GET /` | lista da organização (id, numero, revisao, status, cliente, totais, datas) |
| `GET /:id` | proposta + itens + memória + margem |
| `POST /` | cria rascunho a partir de `lead_id` (cliente, CNPJ e porte do lead; `assessment_id` do lead, se houver), com itens `{servicoId, dias?, meses?, descontoPct?, textoCliente?}` |
| `PUT /:id` | edita rascunho (textos, validade, pagamento, consultor, itens); 409 fora de `rascunho`/`aguardando_aprovacao` |
| `POST /:id/gerar` | `{numero?}`; recalcula; desconto acima do teto sem aprovação → status `aguardando_aprovacao` e 409; organização sem `termos` → 409; reserva número (manual validado contra `^PREFIXO-\d{4}-\d{3,}$` e unicidade, ou automático por `UPDATE organizations SET proximo_numero = proximo_numero + 1 WHERE id = ? RETURNING proximo_numero - 1 AS n`); monta, faz hash, grava tudo e `status = 'gerada'`, num `db.batch` |
| `POST /:id/aprovar-desconto` | só `platform_admin`; grava quem e quando; volta a `rascunho` |
| `POST /:id/revisao` | de `gerada`/`enviada`: cria nova linha com o mesmo número e `revisao + 1`, copiando itens (com as cópias do catálogo), status `rascunho`; a anterior vira `substituida` ao gerar a nova |
| `GET /:id/documento` | o HTML congelado, com `Content-Type: text/html` e cabeçalho CSP restritivo (`default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`) |

Zod em `src/schemas/domain.ts` (`propostaCriarSchema`, `propostaEditarSchema`, `propostaGerarSchema`), `.strict()`; `src/openapi.ts`; `npm run openapi`; `FORA_DO_AGENTE` com `/api/v1/propostas`. Trilha: `proposta.criada`, `proposta.editada`, `proposta.gerada` (com número e hash), `proposta.desconto_aprovado`, `proposta.revisao`.

- [ ] Testes cobrindo os 5 itens do Review Focus, mais: papéis (consultor, cliente, agente → 403 com o texto de `FORA_DO_AGENTE` para o agente), outra organização → 404, geração automática dá números consecutivos, revisão mantém número, catálogo editado depois não muda o hash, `GET /:id/documento` devolve o CSP.
- [ ] Implementar; `npm test` inteiro. Mutações: (a) sem a checagem do teto em `gerar` → cai; (b) PUT aceito em `gerada` → cai. Commit.

### Tarefa 6: tela de propostas

**Arquivos:** `frontend/src/views/propostas.js` (nova), `router.js` (a view `proposals` passa a renderizar a nova tela), `style.css`, testes em `frontend/test/` com guarda de CSS (`?raw`).

- Lista: número e revisão, cliente, status (pílula), total do projeto e mensalidade, ações (abrir, nova revisão, ver documento).
- Assistente em 4 passos (spec §4.1): **Cliente** (escolher lead; mostra CNPJ, porte e se há diagnóstico), **Serviços** (catálogo ativo; com diagnóstico, os de projeto vêm marcados com os dias da faixa), **Ajustes** (por item: dias/meses/desconto/texto; memória de cálculo e margem visíveis; aviso quando o desconto passa do teto), **Número e condições** (número sugerido de `sugestaoNumero` e editável, validade, pagamento, contexto, escopo, observações, consultor responsável) → **Gerar**.
- Documento: `<iframe srcdoc>` com o HTML congelado e o botão "Imprimir / PDF" (o padrão já existe em `commercial.js`; `srcdoc` é permitido pelo CSP, `blob:` não).
- `aguardando_aprovacao`: para `platform_admin`, botão "Aprovar desconto"; para o comercial, o aviso.

- [ ] Testes (jsdom, `fetch` mockado): assistente percorre os 4 passos e envia os corpos no formato dos schemas; aviso de teto; erro 409 mostrado na tela; lista com pílulas; nada inline. Captura de tela com `playwright-core` (harness Vite), olhar e descrever. `cd frontend && npx vitest run` inteiro. Commit.

### Fechamento da fatia 3

- [ ] CHANGELOG; PR; CI verde; revisão final independente (modelo mais capaz) com uma rodada de correção.
- [ ] Backup, `migrations apply` (0038), `migrations list` limpo, merge, `/health`, sonda `GET /api/v1/propostas` sem sessão → 401.
- [ ] Avisar o usuário: para gerar a primeira proposta real, a organização precisa de `termos` (revisados por advogado) e o catálogo precisa estar carregado, com diária e dias revistos.
