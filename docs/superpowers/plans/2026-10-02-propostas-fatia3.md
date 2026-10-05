# Sistema de propostas, fatia 3 (a proposta) — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`. Passos com `- [ ]`.

**Objetivo:** o comercial monta uma proposta a partir de um lead (com ou sem diagnóstico), escolhendo serviços do catálogo; o sistema calcula o preço com memória, deixa a consultoria reescrever as seções de texto do documento, gera o documento completo congelado (HTML + hash), oferece o download em Word (.docx) como cópia de trabalho e controla revisões e a aprovação de desconto acima do teto.

**Arquitetura:** tabelas novas `propostas` e `proposta_itens` (as 2 linhas antigas de `proposals` ficam só para leitura até a fatia 4 remover o fluxo antigo). Três módulos puros e testáveis sem banco — `preco-proposta.ts` (cálculo), `diagnostico.ts` (faixa, porte, maturidade, lacunas), `documento-proposta.ts` (um modelo de conteúdo por seções, renderizado em HTML e em Word) — e um router `propostas.ts` que só orquestra. O documento é montado no servidor, com escape de todo texto, e guardado inteiro.

**Stack:** Workers + Hono 4.13 + D1 (`nodejs_compat` ligado), zod 4.5, `crypto.subtle` (SHA-256), biblioteca `docx` (nova dependência, verificada na Tarefa 4b), Vite vanilla-JS, vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md`, seções 4, 5 e 10. **Base:** fatias 1 e 2 em produção (`lerConfigOrg`, `orgDoUsuario`, `formatarNumeroProposta`, `servicos`, `servicoSchema`, `Servico`).

## Restrições globais

As mesmas do plano das fatias 1–2 (`docs/superpowers/plans/2026-10-02-sistema-de-propostas.md`): worktree de `origin/main`; rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; schema em dois lugares (próxima migration: **0038**); backup + `migrations apply` antes do merge; OpenAPI + `npm run openapi`; rotas comerciais em `FORA_DO_AGENTE`; `escapeHtml` em todo texto que vira HTML; sem handler/`<script>` inline; TDD com mutação; **cada implementador roda a suíte inteira do backend (`npm test`) antes de entregar** — na fatia 2 o teste genérico de isolamento quebrou porque só os arquivos tocados foram rodados. Tabela nova com `CHECK` de enum entra em `VALOR_FIXO` de `test/contrato-isolamento-topo.test.ts`.

## Decisões (rulings) deste plano

| Decisão | Por quê | Custo se errado |
|---|---|---|
| Tabelas novas `propostas`/`proposta_itens`; `proposals` fica como legado | só 2 propostas antigas em produção, ambas esboço de uma linha, nenhuma assinada | migrar 2 linhas depois |
| Estado `gerada` entre `rascunho` e `enviada` (o spec não tinha) | o comercial precisa do documento congelado para imprimir e mandar por conta própria antes de a fatia 4 existir | um estado a mais no funil |
| Os termos revisados pelo dono (prévia aprovada em 02/10/2026, seções 22 a 29) são os termos iniciais da ness.; gerar exige `textos.termos` preenchido | o dono revisou os termos; consultoria nova escreve os dela antes da primeira proposta | o comercial configura antes de gerar |
| As referências da 27701 em `GAPS` são corrigidas: RoPA → A.1.2.9, A.1.2.2, A.1.2.3; direitos do titular → A.1.3.2, A.1.3.7, A.1.3.10 (o A.8.8 citado é da 27001 e sai); desenvolvimento seguro ganha A.8.28 | os códigos estavam na numeração 2025 mas apontavam para os controles errados (análise de 02/10/2026 contra `src/data/iso27701-2025.ts`) | conferir uma última vez contra a norma comprada (ABNT 2026) |
| Edição por seção: as seções de TEXTO podem ser reescritas na proposta (texto simples: parágrafo por linha em branco, linha iniciada por `- ` vira item); as seções de DADOS (capa, diagnóstico, lacunas, investimento, cronograma, aceite) não | decisão do dono: a consultoria adequa o que achar que deve; dados calculados não podem divergir do cálculo | uma seção a mais virar editável |
| Word (.docx) é cópia de trabalho do documento congelado; o que vale para o aceite é a versão do n.iso com o hash, e o Word diz isso no rodapé | decisão do dono (editar no n.iso e baixar Word) | — |
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
    -- Seções de texto reescritas nesta proposta: JSON {secaoId: texto}. Ver documento-proposta.ts.
    secoes_editadas TEXT,
    consultor_email TEXT,
    total_projeto REAL NOT NULL DEFAULT 0,
    mensalidade REAL NOT NULL DEFAULT 0,
    memoria TEXT,
    margem TEXT,
    desconto_aprovado_por TEXT,
    desconto_aprovado_em DATETIME,
    documento_conteudo TEXT,
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

`documento_conteudo` é o modelo de seções (JSON) congelado na geração: o Word sai dele, então reflete exatamente o documento gerado. `proposta_itens.servico` é a **cópia JSON** do serviço no momento em que foi adicionado (spec §3, regra 1). `numero` é nulo no rascunho e preenchido na geração; o índice único tolera vários `NULL`.

- [ ] Teste de contrato que falha (tabelas, colunas, `CHECK` de `status` recusa `'outra'`, índice único recusa número repetido na mesma organização e aceita em outra).
- [ ] DDL em `schema.sql` (depois de `leads`, `assessments`, `servicos`) e `0038` (tabela nova: roda normalmente).
- [ ] `test/migration-0038.test.ts` no estilo da `0037`.
- [ ] `VALOR_FIXO` ganha `propostas: { status: 'rascunho' }`; rodar `test/contrato-isolamento-topo.test.ts`.
- [ ] **Termos iniciais da ness.** A mesma migration faz `UPDATE organizations SET textos = ? WHERE id = 'org_ness' AND (textos IS NULL OR textos = '' OR json_extract(textos, '$.termos') IS NULL OR json_extract(textos, '$.termos') = '')` com o JSON dos textos abaixo, e o `INSERT OR IGNORE` da `org_ness` em `schema.sql` passa a trazer a mesma coluna `textos`. Teste: banco novo tem `termos` não vazio na ness.; uma organização com termos já preenchidos não é sobrescrita.
  Conteúdo (copiar literalmente; `{org}` é trocado pelo nome da organização na montagem do documento):
  - `termos`: as seções "Obrigações de {org}", "Obrigações da contratante", "Propriedade das entregas", "Confidencialidade", "Proteção de dados pessoais", "Vigência", "Rescisão", "Foro" da prévia aprovada, com o texto exato dela (está no arquivo `C:/Users/resper/AppData/Local/Temp/claude/c--Users-resper-OneDrive--rea-de-Trabalho-DESENVOLVIMENTO-niso/9b1971a3-2650-4aaf-8d42-9b90f1da4e2e/scratchpad/proposta-niso.html`, folhas 12 a 14), no formato de texto simples da edição por seção (título de subseção em linha própria iniciada por `## `, parágrafos separados por linha em branco, itens com `- `).
  - `sobre`: o texto "Sobre a ness." da prévia.
  - `comoTrabalhamos`: princípios e ritmo da folha 5 da prévia.
  - `premissas`: as cinco premissas da folha 11.
  - `pagamentoPadrao`: `40/30/30`.
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

Usa `calcScore`, `getTier`, `getScopeInfo` (só para o número de pessoas) e `GAPS` de `pricing.ts`; o mapeamento de domínios da seção "Decisões". **Corrige os `controles` de `GAPS` em `pricing.ts`** conforme a decisão da 27701 (RoPA: `A.1.2.9, A.1.2.2, A.1.2.3 (ISO 27701) · LGPD art. 37`; direitos do titular: `A.1.3.2, A.1.3.7, A.1.3.10 (ISO 27701) · LGPD art. 18`; desenvolvimento seguro: `A.8.25, A.8.26, A.8.27, A.8.28`). `requisito` da lacuna = esse texto.

- [ ] Testes: respostas de exemplo → faixa, pessoas, 6 domínios com pct certo; domínio sem resposta some; toda referência `A.1.x.y`/`A.2.x.y` citada em `GAPS` existe em `src/data/iso27701-2025.ts` (teste que percorre `GAPS` e o catálogo — pega o erro que existia); nenhuma lacuna cita `A.8.8`. Mutação: voltar o RoPA para `A.1.2.4` (consentimento) → o teste de catálogo passa (o código existe), então acrescente a asserção de que a lacuna de RoPA cita `A.1.2.9` → cai. Commit.

### Tarefa 4: documento — modelo de seções e HTML (`src/services/documento-proposta.ts`, puro)

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
export type SecaoId = 'capa' | 'sumario' | 'diagnostico' | 'lacunas' | 'objeto' | 'como_trabalhamos' | 'plano' | 'cronograma' | 'responsabilidades' | 'sobre' | 'investimento' | 'premissas' | 'termos' | 'observacoes' | 'aceite';
export const SECOES_EDITAVEIS: SecaoId[] = ['sumario', 'objeto', 'como_trabalhamos', 'responsabilidades', 'sobre', 'premissas', 'termos', 'observacoes'];
export type Bloco = { t: 'p'; texto: string } | { t: 'lista'; itens: string[] } | { t: 'sub'; texto: string } | { t: 'tabela'; cab: string[]; linhas: string[][]; total?: string[] } | { t: 'barras'; itens: { rotulo: string; pct: number }[] } | { t: 'gantt'; fases: { rotulo: string; ini: number; fim: number }[]; semanas: number } | { t: 'kpis'; itens: { valor: string; rotulo: string }[] };
export interface Secao { id: SecaoId; numero: string | null; titulo: string; blocos: Bloco[]; editada: boolean }
export interface ConteudoDocumento { org: { nome: string; cor: string; marcaNess: boolean; selo: boolean }; numero: string; revisao: number; emitidaEm: string; validaAte: string; capa: { titulo: string; cliente: string; cnpj: string | null; pessoas: number | null; duracao: string | null; investimento: string }; secoes: Secao[] }

export function textoParaBlocos(texto: string): Bloco[];          // parágrafo por linha em branco, "- " lista, "## " subtítulo
export function blocosParaTexto(blocos: Bloco[]): string;          // o inverso, para pré-preencher a edição
export function montarConteudo(d: DadosDocumento, editadas: Partial<Record<SecaoId, string>>): ConteudoDocumento;
export function renderizarHtml(c: ConteudoDocumento): string;      // HTML completo, A4, CSS em <style>
export async function hashDocumento(html: string): Promise<string>; // SHA-256 hex
```

`montarConteudo` gera as seções (com as condições abaixo); para cada `SecaoId` em `SECOES_EDITAVEIS` presente em `editadas`, troca os blocos pelos de `textoParaBlocos(editadas[id])` e marca `editada: true`. Id fora de `SECOES_EDITAVEIS` é ignorado (a rota já recusa). `{org}` nos textos da organização vira o nome dela. `renderizarHtml` escapa todo texto de bloco.

Seções e condições: tabela da spec §5.1. Visual: o da prévia aprovada (papel branco, A4, Montserrat títulos, Inter texto, cor da organização só em linhas e títulos; marca: para `org_ness` o wordmark `ness` + `.` na cor; para outras, o nome em texto). Sem `<script>`, sem recurso externo além de Google Fonts. Cronograma: barras em CSS a partir de `semanas` das fases. Sem diagnóstico, somem "O que o diagnóstico mostrou" e "Lacunas". `secoesDesligadas` respeitada.

- [ ] Testes: `textoParaBlocos`/`blocosParaTexto` ida e volta; seção editada substitui o texto gerado e marca `editada`; seção de dados (`investimento`) não é afetada por `editadas`; avulso sozinho não tem "Como trabalhamos", "Cronograma", "Responsabilidades"; projeto tem; recorrente mostra "por mês"; projeto + recorrente mostra os dois totais separados; sem diagnóstico some a seção; `secoesDesligadas` respeitada; **injeção** (`<script>`, `<img onerror=x>`, `" onclick="`) em contexto, escopo, observações, cliente, texto do catálogo e textos da organização → nenhum `<script` e nenhum `onerror=`/`onclick=` no HTML; `hashDocumento` estável para o mesmo HTML e diferente para HTML diferente.
- [ ] Implementar. Mutação: tirar o escape de um campo → teste de injeção cai. Commit.

### Tarefa 4b: Word (`src/services/documento-docx.ts`)

**Interface:** `export async function renderizarDocx(c: ConteudoDocumento, rodape: string): Promise<Uint8Array>`.

- [ ] **Verificação antes de tudo:** instalar `docx` (versão estável mais recente; conferir a documentação atual da API de empacotamento que devolve `ArrayBuffer`/`Uint8Array` sem depender de `fs`), gerar um documento mínimo dentro do pool de testes do Workers (`cloudflare:test`) e medir o aumento do bundle com `npx wrangler deploy --dry-run --outdir dist-check` (antes e depois). Se não rodar no Workers ou o bundle passar de 3 MB comprimido, PARE e reporte (alternativa: gerar o .docx no navegador a partir de `documento_conteudo`).
- [ ] Testes: o arquivo é um zip válido (começa com `PK`) e o `word/document.xml` contém o título de cada seção, o texto de uma seção editada, a tabela de investimento com o total e o rodapé "Cópia de trabalho. Vale a versão {numero} rev. {revisao} do n.iso, hash {8 primeiros}."; texto com `<`/`&` sai como texto (escapado no XML).
- [ ] Implementar a partir do mesmo `ConteudoDocumento` (sem reler o banco): títulos, parágrafos, listas, tabelas; barras e gantt viram tabela simples (rótulo e %, rótulo e semanas). Fontes: Montserrat nos títulos, Inter no corpo (o Word cai na fonte padrão se não tiver). Commit `feat(propostas): cópia de trabalho em Word`.

### Tarefa 5: rotas `/api/v1/propostas`

**Rotas** (todas `ehComercial`; agente fora; tudo filtrado por `orgDoUsuario`; outra organização → 404):

| Rota | Faz |
|---|---|
| `GET /` | lista da organização (id, numero, revisao, status, cliente, totais, datas) |
| `GET /:id` | proposta + itens + memória + margem |
| `POST /` | cria rascunho a partir de `lead_id` (cliente, CNPJ e porte do lead; `assessment_id` do lead, se houver), com itens `{servicoId, dias?, meses?, descontoPct?, textoCliente?}` |
| `PUT /:id` | edita rascunho (textos, validade, pagamento, consultor, itens, `secoesEditadas` — só ids de `SECOES_EDITAVEIS`, até 30 mil caracteres cada; `null` restaura o padrão); 409 fora de `rascunho`/`aguardando_aprovacao` |
| `GET /:id/previa` | o `ConteudoDocumento` e o HTML montados AGORA, sem congelar (para a tela de revisão pré-preencher as seções com `blocosParaTexto`) |
| `POST /:id/gerar` | `{numero?}`; recalcula; desconto acima do teto sem aprovação → status `aguardando_aprovacao` e 409; organização sem `termos` → 409; monta o conteúdo com as `secoesEditadas`; reserva número (manual validado contra `^PREFIXO-\d{4}-\d{3,}$` e unicidade, ou automático por `UPDATE organizations SET proximo_numero = proximo_numero + 1 WHERE id = ? RETURNING proximo_numero - 1 AS n`); renderiza o HTML, faz hash, grava `documento_conteudo`, `documento_html`, `documento_hash` e `status = 'gerada'`, num `db.batch` |
| `POST /:id/aprovar-desconto` | só `platform_admin`; grava quem e quando; volta a `rascunho` |
| `POST /:id/revisao` | de `gerada`/`enviada`: cria nova linha com o mesmo número e `revisao + 1`, copiando itens (com as cópias do catálogo), status `rascunho`; a anterior vira `substituida` ao gerar a nova |
| `GET /:id/docx` | só de proposta gerada; `renderizarDocx(documento_conteudo)` com `Content-Disposition: attachment; filename="{numero}-rev{revisao}.docx"` |
| `GET /:id/documento` | o HTML congelado, com `Content-Type: text/html` e cabeçalho CSP restritivo (`default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`) |

Zod em `src/schemas/domain.ts` (`propostaCriarSchema`, `propostaEditarSchema`, `propostaGerarSchema`), `.strict()`; `src/openapi.ts`; `npm run openapi`; `FORA_DO_AGENTE` com `/api/v1/propostas`. Trilha: `proposta.criada`, `proposta.editada`, `proposta.gerada` (com número e hash), `proposta.desconto_aprovado`, `proposta.revisao`.

- [ ] Testes cobrindo os 5 itens do Review Focus, mais: `secoesEditadas` com id de seção de dados → 400; seção editada aparece no HTML congelado e no Word; `docx` de rascunho → 409; `docx` de proposta gerada devolve zip com o nome do arquivo certo; papéis (consultor, cliente, agente → 403 com o texto de `FORA_DO_AGENTE` para o agente), outra organização → 404, geração automática dá números consecutivos, revisão mantém número, catálogo editado depois não muda o hash, `GET /:id/documento` devolve o CSP.
- [ ] Implementar; `npm test` inteiro. Mutações: (a) sem a checagem do teto em `gerar` → cai; (b) PUT aceito em `gerada` → cai. Commit.

### Tarefa 6: tela de propostas

**Arquivos:** `frontend/src/views/propostas.js` (nova), `router.js` (a view `proposals` passa a renderizar a nova tela), `style.css`, testes em `frontend/test/` com guarda de CSS (`?raw`).

- Lista: número e revisão, cliente, status (pílula), total do projeto e mensalidade, ações (abrir, nova revisão, ver documento).
- Assistente em 4 passos (spec §4.1): **Cliente** (escolher lead; mostra CNPJ, porte e se há diagnóstico), **Serviços** (catálogo ativo; com diagnóstico, os de projeto vêm marcados com os dias da faixa), **Ajustes** (por item: dias/meses/desconto/texto; memória de cálculo e margem visíveis; aviso quando o desconto passa do teto), **Número e condições** (número sugerido de `sugestaoNumero` e editável, validade, pagamento, contexto, escopo, observações, consultor responsável), **Revisar documento** (a prévia ao lado; cada seção editável com o texto atual pré-preenchido, "Restaurar padrão" por seção, ajuda curta do formato: linha em branco separa parágrafos, `- ` faz item, `## ` faz subtítulo) → **Gerar**.
- Documento: `<iframe srcdoc>` com o HTML congelado, o botão "Imprimir / PDF" e o botão "Baixar Word (cópia de trabalho)" (o padrão já existe em `commercial.js`; `srcdoc` é permitido pelo CSP, `blob:` não).
- `aguardando_aprovacao`: para `platform_admin`, botão "Aprovar desconto"; para o comercial, o aviso.

- [ ] Testes (jsdom, `fetch` mockado): assistente percorre os 4 passos e envia os corpos no formato dos schemas; aviso de teto; erro 409 mostrado na tela; lista com pílulas; nada inline. Captura de tela com `playwright-core` (harness Vite), olhar e descrever. `cd frontend && npx vitest run` inteiro. Commit.

### Fechamento da fatia 3

- [ ] CHANGELOG; PR; CI verde; revisão final independente (modelo mais capaz) com uma rodada de correção.
- [ ] Backup, `migrations apply` (0038), `migrations list` limpo, merge, `/health`, sonda `GET /api/v1/propostas` sem sessão → 401.
- [ ] Avisar o usuário: para gerar a primeira proposta real, a organização precisa de `termos` (revisados por advogado) e o catálogo precisa estar carregado, com diária e dias revistos.
