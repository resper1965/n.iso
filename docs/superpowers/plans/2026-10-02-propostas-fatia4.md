# Sistema de propostas, fatia 4 (link, aceite e fechamento) — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`. Passos com `- [ ]`.

**Objetivo:** o comercial envia a proposta gerada ao cliente por e-mail ou por link; o cliente, sem conta, lê a versão congelada e aceita, recusa ou pede ajuste; o aceite dispara **uma única rotina de fechamento** que cria o contrato, o projeto (com o consultor já designado), registra a mensalidade e marca o lead como ganho. O "Aprovar" e o "Converter" antigos, que criavam projeto por conta própria, saem.

**Arquitetura:** colunas de envio e aceite em `propostas` (migration 0039); `contracts` ganha as colunas do contrato novo; `fecharVenda` é um serviço único, idempotente, em um `db.batch`; as rotas autenticadas (`/propostas/:id/enviar`, `/link`, `/aceite-manual`) ficam no router da fatia 3; o cliente usa rotas **públicas** `POST /api/v1/public/propostas/{ver,aceitar,recusar,ajuste}` com o token **no corpo** (nunca no caminho, para não ir para o log de requisição) e uma página estática `frontend/public/proposta.html` + `proposta.js`.

**Spec:** `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md`, seções 6 e 10. **Base:** fatias 1–3 em produção (`propostas`, `proposta_itens`, `lerConfigOrg`, `designacaoDoCriador`, `seedPhases`, `sendEmail`, `rateLimitD1`).

## Restrições globais

As do plano da fatia 3 (`docs/superpowers/plans/2026-10-02-propostas-fatia3.md`), mais: próxima migration **0039**; rotas públicas ficam no `publicApp` (montado antes do `authMiddleware`) e **precisam** de limite de taxa próprio (`rateLimitD1`, por token e por IP); token com `genToken` (CSPRNG), guardado só como **SHA-256** (`token_hash`), nunca em claro, comparado por consulta ao hash; **cada implementador roda `npm test` inteiro e `cd frontend && npx vitest run` inteiro antes de entregar**; commits com rodapé `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nenhuma credencial em log nem em mensagem de erro; página pública sem handler/`<script>` inline (CSP `script-src 'self'`); tabela nova com `CHECK` de enum entra em `VALOR_FIXO` de `test/contrato-isolamento-topo.test.ts`.

## Decisões (rulings)

| Decisão | Por quê | Custo se errado |
|---|---|---|
| Token no CORPO das rotas públicas (`POST .../ver {token}`), link `https://niso.ness.com.br/proposta#<token>` (fragmento, que o navegador não envia ao servidor) | o log de requisição grava o caminho; o token é a credencial | cliente que cola o link sem o `#` vê "link inválido" |
| Um projeto por proposta, mesmo com vários serviços de projeto/avulso; recorrente só vira registro no contrato | o spec admitia juntar a projeto existente do mesmo cliente; sem chave confiável de "mesmo cliente" isso fica para depois | dois projetos manuais para unir |
| O projeto nasce com a trilha de 41 fases do app (`seedPhases`); as fases comerciais do catálogo ficam no contrato | `project_phases` é a trilha de adequação que a aplicação usa; as fases do catálogo são comerciais | consultor mapeia na mão |
| Consultor responsável: `propostas.consultor_email`; se vazio, o consultor que marcou o aceite manual, senão nenhum; designação = linha em `project_governance` com `role_category='consultor'` (mesma regra da D5) | spec §6.3 | projeto sem consultor até o `platform_admin` designar |
| `/convert` do levantamento passa a responder **410** com mensagem apontando para Propostas; `/proposals/:id/sign` é removido; `PUT /proposals/:id` com `status: 'Signed'` responde 410; o botão "Converter para Projeto" sai | spec §6.3: acaba o projeto em dobro | levantamento sem proposta não vira projeto pela tela |
| Aceite pelo link exige nome, cargo, e-mail e a confirmação de poderes; registra IP, data/hora e o `documento_hash` | spec §6.2 | prova mais fraca que assinatura qualificada (Clicksign/DocuSign fica para depois) |
| E-mail sai por `sendEmail` com remetente "Nome da organização via n.iso" e `Reply-To` do comercial; domínio permanece `noreply@ness.com.br` | o domínio próprio por consultoria depende de DNS | consultoria vê "ness.com.br" no remetente |

## Review Focus

1. **Token**: inválido, de outra proposta, revogado, rotacionado (o antigo morre), expirado (`valida_ate` passou) e de proposta `substituida`/`recusada`/`aceita` → resposta uniforme "link inválido ou expirado" (sem revelar qual); nunca o token em log, e-mail de erro ou resposta.
2. **Aceite duplo**: dois cliques ou duas abas → um único contrato, um único projeto, um único registro de aceite; a segunda chamada é 409 sem efeito colateral. Falha no meio do batch → nada gravado (sem projeto órfão, sem contrato sem projeto).
3. **Limite de taxa**: 429 depois de N tentativas por IP e por token nas rotas públicas; o limite não pode ser contornado variando o corpo.
4. **Aceite manual** e **link/enviar** são só do comercial/plataforma (consultor, cliente e agente → 403); outra organização → 404.
5. **O que o cliente vê**: só o `documento_html` congelado, com o CSP restritivo; nunca memória de cálculo, margem, custo, desconto, nem dados de outras propostas.

---

### Tarefa 1: migration 0039 e `contracts`

**Arquivos:** `schema.sql`, `migrations/0039_propostas_envio_aceite.sql`, `test/migration-0039.test.ts`, `test/schema-contract.test.ts`, `migrations/README.md`.

Colunas novas em `propostas` (ALTER TABLE ... ADD COLUMN, mesmo DDL no `schema.sql`): `token_hash TEXT`, `link_gerado_em DATETIME`, `enviada_em DATETIME`, `enviada_para TEXT`, `visualizada_em DATETIME`, `aceite_nome TEXT`, `aceite_cargo TEXT`, `aceite_email TEXT`, `aceite_ip TEXT`, `aceite_em DATETIME`, `aceite_origem TEXT CHECK (aceite_origem IS NULL OR aceite_origem IN ('link', 'manual'))`, `aceite_comprovante TEXT`, `recusa_motivo TEXT`, `ajuste_mensagem TEXT`, `contrato_id TEXT`, `projeto_id TEXT`. Índice `CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_token ON propostas(token_hash) WHERE token_hash IS NOT NULL`.

Colunas novas em `contracts` (a tabela legada é mantida; `proposal_id` aponta para a tabela antiga, então o vínculo novo é `proposta_id` sem FK): `proposta_id TEXT`, `documento_hash TEXT`, `valor_projeto REAL`, `mensalidade REAL`, `prazo_minimo_meses INTEGER`, `servicos TEXT` (JSON com nome, tipo e fases comerciais copiados), `projeto_id TEXT`, e `CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_proposta ON contracts(proposta_id) WHERE proposta_id IS NOT NULL` — é a **última linha de defesa** da idempotência. `projects` ganha `proposta_id TEXT`.

- [ ] Teste de contrato que falha (colunas, `CHECK` de `aceite_origem` recusa `'x'`, índices únicos recusam token repetido e dois contratos da mesma proposta).
- [ ] DDL em `schema.sql` (sem `;` em comentário) e migration (ADD COLUMN: roda normalmente em produção, as colunas não existem lá — conferir por leitura antes).
- [ ] `test/migration-0039.test.ts` no estilo da 0038. `VALOR_FIXO` em `contrato-isolamento-topo` para a coluna nova com CHECK.
- [ ] Mutação (tirar o índice único de `contracts`) → cai. `npm test` inteiro. Commit.

### Tarefa 2: `fecharVenda` (`src/services/fechar-venda.ts`)

**Interface:**

```ts
export interface EntradaFechamento { propostaId: string; orgId: string; origem: 'link' | 'manual'; aceite: { nome: string; cargo: string; email: string; ip: string; comprovante?: string }; atorEmail: string }
export type ResultadoFechamento = { ok: true; contratoId: string; projetoId: string | null } | { ok: false; motivo: 'nao_encontrada' | 'estado_invalido' | 'ja_fechada' };
export async function fecharVenda(db: D1Database, e: EntradaFechamento): Promise<ResultadoFechamento>;
```

Regras: só de `enviada`/`visualizada` (link) ou `gerada`/`enviada`/`visualizada` (manual). Tudo num `db.batch` com guarda: `UPDATE propostas SET status='aceita', aceite_*... WHERE id=? AND status IN (...)` primeiro; os demais comandos guardados por `EXISTS (SELECT 1 FROM propostas WHERE id=? AND contrato_id IS NULL AND aceite_em = <esta chamada>)` ou por `changes() > 0` (padrão da fatia 3); o `UNIQUE` de `contracts.proposta_id` barra a corrida (violação → `ja_fechada`, sem 500). Passos: contrato (valores e serviços copiados dos itens congelados; `documento_hash`), projeto (se houver item `projeto`/`avulso`: cliente, CNPJ e porte do lead, setor/papel/norma das respostas do diagnóstico, `assessment_id`, `proposta_id`, status `active`) com `seedPhases`, designação do consultor (`propostas.consultor_email` ou o ator se consultor), lead → `Won`, `assessments.converted_project_id`, notificação ao comercial e ao consultor, trilha `proposta.aceita`, `contrato.criado`, `project.created`, `governance.created`. Reuse `designacaoDoCriador`-style INSERT; sem projeto para proposta só recorrente (contrato registra a mensalidade, `projeto_id` nulo).

- [ ] Testes (D1 real): projeto+recorrente → 1 contrato, 1 projeto com 41 fases, consultor designado, lead `Won`, valores batem; só recorrente → contrato sem projeto; **duas chamadas** (sequenciais e `Promise.all`) → um contrato e um projeto, segunda `ja_fechada`; trigger `RAISE(ABORT)` em `project_phases` → nada gravado (sem contrato, sem projeto, proposta ainda `enviada`); proposta `rascunho`/`gerada` pelo link → `estado_invalido`; outra organização → `nao_encontrada`.
- [ ] Mutação: tirar a guarda do contrato → dois contratos (o índice único segura, mas o teste de atomicidade cai). `npm test` inteiro. Commit.

### Tarefa 3: envio e link (rotas autenticadas)

Em `src/routes/propostas.ts`:

| Rota | Faz |
|---|---|
| `POST /:id/enviar` | `{email, mensagem?}` — de `gerada`/`enviada`/`visualizada`; gera token novo (`genToken`, 32 bytes), grava `token_hash` (o anterior morre), `enviada_em`, `enviada_para`, status `enviada`; envia e-mail com o link `…/proposta#<token>` (remetente "Org via n.iso", `Reply-To` do comercial); se `sendEmail` falhar, 502 e o status NÃO muda |
| `POST /:id/link` | gera/rotaciona o link para o comercial copiar (não envia e-mail); devolve a URL **uma única vez** (o token não é recuperável depois: só o hash fica) |
| `POST /:id/revogar-link` | zera `token_hash` |
| `POST /:id/aceite-manual` | `{nome, cargo, email, comprovante}` — `fecharVenda(origem: 'manual')` |

`sendEmail` ganha parâmetro opcional `{ from?, replyTo? }` (compatível com os chamadores atuais). Corpo do e-mail em HTML com o nome da organização, número, validade e botão com o link, tudo com `escapeHtml`. Schemas `.strict()` em `domain.ts`; `openapi.ts`; `FORA_DO_AGENTE` já cobre `/propostas`. Trilha `proposta.enviada` (sem o token), `proposta.link_gerado`, `proposta.link_revogado`, `proposta.aceita`.

- [ ] Testes: papéis (consultor/cliente/agente 403; outra org 404); `enviar` de `rascunho` → 409; segundo `enviar` invalida o link anterior (a rota pública do anterior responde "inválido"); falha do `sendEmail` (mock) → 502 e proposta continua `gerada`; o token não aparece em `audit_logs`, resposta de `enviar` nem log; `link` devolve a URL uma vez e o banco só tem o hash (comparar `token_hash` = SHA-256 do token); aceite manual fecha a venda. Mutação: gravar o token em claro → o teste do hash cai. `npm test` inteiro. Commit.

### Tarefa 4: rotas públicas do cliente

Em `src/routes/public.ts` (ou arquivo novo montado no `publicApp`): `POST /api/v1/public/propostas/ver|aceitar|recusar|ajuste`, corpo `{token, ...}` validado com zod `.strict()`.

- `ver`: resolve por `token_hash`; resposta `{ html, numero, revisao, validaAte, estado }`; só `documento_html`; 1ª abertura de `enviada` → `visualizada` (+ `visualizada_em`, notificação, trilha `proposta.visualizada`); depois de `valida_ate` → marca `expirada` e responde estado `expirada`; `aceita`/`recusada`/`substituida` respondem o estado (sem HTML novo se substituída).
- `aceitar`: `{token, nome, cargo, email, poderes: true}` (`poderes` literal `true`; e-mail válido; nome/cargo 2–120 caracteres); IP de `CF-Connecting-IP`; `fecharVenda(origem: 'link')`; `ja_fechada` → 409.
- `recusar`: `{token, motivo?}` → `recusada`, lead `Lost` com o motivo, notificação; só de `enviada`/`visualizada`.
- `ajuste`: `{token, mensagem}` (1–2000) → grava `ajuste_mensagem` (acumula com data), notifica o comercial; a proposta continua `visualizada`.
- Todas: `rateLimitD1` por IP (30/10 min) e por token-hash (20/10 min); resposta uniforme `404 {error: 'Link inválido ou expirado'}` para token desconhecido/revogado, e a mesma mensagem para os demais estados inválidos nas ações; CSP restritivo só no HTML do documento (já definido na fatia 3).

- [ ] Testes (Review Focus 1, 2, 3, 5): token inválido/revogado/rotacionado/expirado/outra proposta → mesma resposta; `ver` não devolve `memoria`, `margem`, `descontoPct` nem `consultor_email`; aceite duplo concorrente; 429 após o limite; `poderes: false` → 400; recusar vira `Lost`; `ajuste` notifica; expirada marca o estado. Mutação: remover o limite de taxa → o teste do 429 cai. `npm test` inteiro. Commit.

### Tarefa 5: remover o fluxo antigo

- [ ] `src/routes/proposals.ts`: remover `POST /:id/sign`; `PUT /:id` com `status` `Signed` → 410 `{error: 'Aprovação pelo painel foi substituída pelo aceite da proposta'}`. `src/routes/assessments.ts`: `POST /:id/convert` → 410 apontando para Propostas (a consulta e o corpo antigos saem; o helper `designacaoDoCriador` continua em `POST /projects`). `docs/openapi.json` e `contrato-gerado.ts` por `npm run openapi`.
- [ ] Frontend: tirar o botão "Converter para Projeto" (`frontend/src/views/project.js` ~75) e o código morto "Aprovar"/"Gerar proposta" antigo de `commercial.js` (renderProposals e helpers que só ele usava; conferir com grep antes de apagar cada função); o link "Gerar proposta" do levantamento aponta para a tela de Propostas.
- [ ] Testes que dependiam de `/sign`/`/convert` (`test/consultor-escopo.test.ts` casos de conversão, `test/assessments.test.ts`, `test/assessments-preco.test.ts` se usar convert, `test/comercial-acesso.test.ts`, etc.): reescrever para o novo comportamento — o caso "consultor que converte fica designado" passa a ser coberto por `fecharVenda`; **não** apagar teste sem substituto; listar no relatório cada teste alterado e por quê. Teste novo: `/convert` e `/sign` → 410/404 e nenhum projeto criado.
- [ ] `npm test` e frontend inteiros. Commit.

### Tarefa 6: página do cliente e telas do comercial

**Arquivos:** `frontend/public/proposta.html`, `frontend/public/proposta.js` (arquivos novos em `frontend/public/` são copiados como estão; não precisam de entrada no Vite), `frontend/src/views/propostas.js` (ações), `frontend/src/style.css`, testes.

Página do cliente (`/proposta#<token>`): lê o token de `location.hash`, apaga o hash da barra (`history.replaceState`), chama `ver`; mostra o documento num `<iframe sandbox srcdoc>`; abaixo, três ações — **Aceitar** (formulário: nome, cargo, e-mail, caixa "tenho poderes para contratar em nome da empresa"), **Recusar** (motivo opcional, confirmação na própria tela) e **Pedir ajuste** (mensagem); estados: carregando, link inválido/expirado, já aceita ("Proposta aceita em DD/MM/AAAA por Nome"), recusada, substituída ("Existe uma versão mais nova; peça o novo link ao comercial"). Sem framework, sem handler inline, marca neutra com o nome da organização do documento, tokens de cor do app, foco visível, rótulos `<label for>`, mensagens de erro junto do campo, funciona em telefone (a regra "responsividade fora de escopo" é do app interno; a página do cliente precisa abrir no celular — um parágrafo de justificativa no CSS).

Telas do comercial (`propostas.js`): na lista e na ficha, por estado: **Enviar ao cliente** (modal: e-mail, mensagem opcional), **Copiar link** (gera e copia, avisa que o link anterior deixa de valer), **Revogar link**, **Marcar como aceita (papel)** (modal: nome, cargo, e-mail, comprovante em texto — ex. "contrato assinado em 02/10, arquivo X"), pílulas `enviada`/`visualizada`/`aceita`/`recusada`/`expirada`, aviso do pedido de ajuste, e, depois de aceita, links para o contrato e o projeto.

- [ ] Testes (jsdom, `fetch` mockado): página do cliente — hash lido e apagado; cada estado; aceitar envia o corpo certo e bloqueia sem a caixa; erros por campo; sem inline; telas do comercial — botões por estado, cópia do link só depois do `POST /link`, modal do aceite manual envia o corpo do schema.
- [ ] Captura com `playwright-core` (harness Vite com `fetch` falso) da página do cliente em 1280 px e 390 px (celular) e do modal de envio; olhar e descrever. Mutação: remover a caixa de poderes → o teste cai. Suítes inteiras. Commit.

### Fechamento da fatia 4

- [ ] CHANGELOG; PR; CI verde; revisão final independente (modelo mais capaz) com uma rodada de correção; backup; `migrations apply` (0039); `migrations list` limpo; merge; `/health` estável; sonda: `POST /api/v1/public/propostas/ver` com token inventado → 404 "Link inválido ou expirado".
- [ ] Teste de ponta a ponta em produção **sem dado real**: o usuário cria uma proposta de teste no lead de demonstração, envia o link para o próprio e-mail e aceita; o controlador confere por leitura o contrato, o projeto e o lead; o projeto de teste é identificado pelo nome "[TESTE] …" e removido só com o "sim" do usuário.
