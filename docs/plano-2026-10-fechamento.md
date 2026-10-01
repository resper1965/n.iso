# Plano — fechamento das pendências (2026-10)

Consolida o que ficou aberto depois do ciclo do agente consultor (#204 a #227): o
que é seu, o que é de um agente, em que ordem, e quando cada item está pronto.
Segue o formato do [`backlog-plan.md`](backlog-plan.md), que continua valendo para o
débito de agosto.

Esforço: **S** ≤2h · **M** meio dia · **L** ≥1 dia. Prioridade: **P1** (fazer já) → **P4**.
Dono: **você** (decisão, credencial ou ação em conta) · **agente** (executa com teste e PR).

Todo número deste documento foi **medido** contra a `origin/main` em 01/10/2026 (método
ao lado de cada um). Onde o `AGENTS.md` dizia outra coisa, o `AGENTS.md` estava velho (item H5).

---

## Resumo

| ID | Item | Dono | Esforço | Prio | Depende de |
|----|------|------|---------|------|------------|
| **Onda 0 — higiene** | | | | | |
| H1 | Apagar o script de senha da pasta temporária | agente | — | feito | — |
| H2 | Ligar o MFA em `resper@ness.com.br` | **você** | S | **P1** | — |
| H3 | Checkout principal: sair do branch antigo e decidir três arquivos soltos | **você** | S | P2 | — |
| H4 | Decidir os dois stashes antigos (era do PR #32) | **você** | S | P4 | — |
| H5 | Números velhos do `AGENTS.md` | agente | S | P2 | — |
| **Onda 1 — correções pequenas, cada uma com teste** | | | | | |
| C1 | `reset-password-first` só com troca pendente | agente | S–M | feito (#229) | — |
| C2 | ~~OAuth: `redirect_uri` com esquema próprio dá 500 depois do login~~ | — | — | descartado | premissa errada |
| C3 | ~~`Forbidden` vira 500 em três rotas~~ | — | — | descartado | premissa errada |
| C4 | Trilha de exclusão: 10 rotas sem trilha, 6 sem o projeto | agente | M | feito | D3 (decidido) |
| C5 | Tela de consentimento sem projeto pré-marcado | agente | S | feito | — |
| C6 | Rótulo `agente.exclusao` também nomeia lote, eliminação e revogação | agente | S | feito | — |
| C7 | Fragilidades de teste do agente | agente | S | feito | — |
| **Onda 2 — produto** | | | | | |
| F1 | Tela "Conectar agente" | agente | S–M | feito | — |
| F2 | Confirmar o login OAuth em Codex, Cursor e Antigravity | **você** + agente | S | P2 | — |
| F3 | "Último uso" do cartão de agentes atualizar sozinho | agente | S | P3 | — |
| F4 | O agente ler PDF e planilha | agente | L | P3 | D2 (em aberto) |
| F5 | Regras de verificação normativa no `coherence_check` | agente | M–L | P3 | uso real |
| F6 | O humano revogar aprovação de ROPA/DPIA e apagar análise crítica pela interface | agente | M | **feito** | D1 (decidido) |
| F9 | DPIA: a tela decide "Assinar" por `dpo_signature`/`ceo_signature`, mas a rota de aprovação grava só `dpo_approved_by/at` e ignora o `role`. Achado ao fazer o F6 | agente | S | **feito** | — |
| F10 | `management_reviews` em produção tem `ciso_signed_*`/`ceo_signed_*` que `schema.sql` e as migrations não têm (banco novo diverge). Reconciliar com migration idempotente | agente | S | **feito** (PR aberto; falta registrar a 0035 em `d1_migrations` antes do merge) | confirmado em produção |
| **Onda 3 — dívida estrutural (contínua)** | | | | | |
| T1 | `any` em `src/`: 510, com catraca | agente | L | P3 | D4 (decidido) |
| T2 | 4 arquivos de teste que mockam o D1 | agente | M cada | P3 | — |
| T3 | 36 leituras de corpo sem schema | agente | M | P3 | — |
| T4 | Teste de frontend nas telas novas | agente | M | P3 | — |
| T5 | Direitos do titular não cobrem PII em texto livre | agente | L | P4 | — |
| T6 | Testes que só falham na máquina local (CRLF, timeout) | agente | S–M | P4 | — |

**Ordem:** H2 e C1 primeiro (são os dois riscos de conta). Depois a Onda 1 inteira, um PR
por item. A Onda 2 intercala com a 1. A Onda 3 corre em paralelo, em fatias pequenas.

---

## Onda 0 — higiene

### H1 · Script de senha na pasta temporária · feito
`definir-senha-admin.mjs` definia a senha de uma conta administrativa e ficou na pasta
temporária da sessão. Foi apagado em 01/10/2026 (confirmado: 0 restantes).

### H2 · MFA em `resper@ness.com.br` · você · P1
**Por quê.** É a conta `platform_admin`: designa consultor em qualquer projeto, vê todos os
clientes e mexe em SSO. Está sem segundo fator, então uma senha vazada basta para tomar tudo.
**Como.** Entre, abra o cartão de perfil no rodapé da barra lateral, ative o segundo fator
e **guarde os códigos de recuperação** fora do computador. (Não está na página de
Configurações: ela é escondida para papéis de cliente.)
**Pronto quando** a conta pedir o código no login. Se perder o autenticador, o caminho é o
comando do `AGENTS.md` ("Segundo fator (MFA) — e como destravar alguém").

### H3 · Checkout principal · você · P2
O checkout principal está no branch antigo `docs/receita-agentes-mcp-remoto` (já mergeado)
e tem três arquivos soltos que **não são deste trabalho**: `.vscode/settings.json`
modificado, `.impeccable/` e `debug.log` sem rastrear.
**Decida:** voltar para `main` (`git switch main`), e se os três arquivos ficam, vão para o
`.gitignore` ou são descartados. Eu não os toquei.

### H4 · Stashes antigos · você · P4
`stash@{1}` e `stash@{2}` são da época do PR #32 (merge de `observabilidade` e uma mudança de
reautenticação de assinatura). Provavelmente obsoletos. O `stash@{0}` é o F1: **não apague**.
**Decida:** descartar os dois, ou me pedir para comparar com a `main` antes.

### H5 · Números velhos do `AGENTS.md` · agente · P2
O `AGENTS.md` é o contexto que todo agente lê primeiro, e vários números dele envelheceram:

| Afirmação | Medido em 01/10 | Método |
|---|---|---|
| 44 tabelas | **53** | linhas que começam com `CREATE TABLE` em `schema.sql` |
| ~300 `any` em `src/` | **510** | `git grep` de `: any`, `as any` e `<any>` em `src/*.ts` |
| 1 de 58 arquivos de teste mocka o D1 | **4 de 94** (`api`, `integration`, `mcp-integration`, `services-rag`) | `git grep` de `prepare:` com `vi.fn` em `test/` |
| ~46 leituras de corpo sem schema | **36** em 12 arquivos | `git grep -c` de `c.req.json` em `src/routes/` |
| Frontend com quase nenhum teste | **19** arquivos em `frontend/test/` (mais o e2e de MFA) | `git ls-tree` |

**Pronto quando** o `AGENTS.md` tiver os números novos **e o método**, para o próximo agente
não repetir o erro de afirmar contagem sem conferir. (Feito junto com este plano.)

---

## Onda 1 — correções pequenas

Regra de todas: branch a partir de `origin/main`, **teste primeiro** (vermelho, depois verde),
rodar a **suíte inteira** e o `npm run openapi` se a rota mudar, conferir o código de saída e a
ausência de "Unhandled", um PR por item.

### C1 · `reset-password-first` só com troca pendente · feito (#229)
**Causa.** `src/routes/auth.ts:259` troca a senha da sessão **sem pedir a senha atual e sem
conferir** que a conta está em troca forçada (`requires_password_change = 1`). Quem tiver uma
sessão aberta, por exemplo uma sessão roubada, define uma senha nova e passa a ser dono da
conta. O agente já está barrado dessa rota (#221); para o humano a fraqueza continua.
**Correção.** Ler a linha do usuário e recusar com 403 quando `requires_password_change` não
for 1. A troca de senha comum continua em `change-password`, que exige a senha atual.
**Risco.** Quebrar o primeiro acesso. Por isso o teste cobre os dois fluxos: conta com troca
forçada passa; conta normal é recusada; e a sessão é renovada como hoje (#204).
**Pronto quando** `test/` provar os três casos e o fluxo de primeiro acesso funcionar na tela.

### C2 · `redirect_uri` com esquema próprio · descartado
**A hipótese.** Um callback como `myapp:/cb` tem `host` vazio, e a tela de escolha do cliente lançaria ao
montar `new URL('http://')`, dando 500 depois do login.
**Por que caiu.** Ao reproduzir, o provider **recusa** o callback já no registro (`400 invalid_client_metadata`:
"Redirect URI must use https, or http on a loopback host"). O cliente nunca chega ao login; o caminho não existe.
**O que ficou.** Um teste que registra o comportamento (e avisa se uma versão futura da biblioteca passar a aceitar
esquema próprio) e uma observação no F2: cliente de desktop com callback de esquema próprio não consegue conectar.
Eu tinha dado este item como defeito lendo o código, sem reproduzir; o erro foi meu.

### C3 · `Forbidden` vira 500 · descartado
**A hipótese** (da revisão final do #221): os `DELETE` de auditoria, parte interessada e métrica transformariam o
acesso negado em 500.
**Por que caiu.** `erro500` (`src/helpers.ts`) já trata `ForbiddenError` como 403. O teste novo, com um
administrador de outro projeto apagando os três recursos, dá 403 e o registro permanece. Eu li o uso de `erro500`
nos handlers, mas não o corpo dele.
**O que ficou.** O teste, como proteção de regressão.

### C4 · Trilha de exclusão · feito
**Medido.** Dos 20 handlers `DELETE` de `src/routes/`, **10 não gravam trilha**
(`governance` ×3, `integrations` ×2, `leads`, `risks`, `scim`, `training`, `vendors`) e **6 gravam
sem o projeto** (`audits`, `capa`, `platform`, `proposals`, `ropa`, `users`). Exclusão que não
aparece na trilha do projeto é exatamente o que o auditor pergunta. (A contagem vem de uma
varredura de 30 linhas por handler; o primeiro passo do item é confirmar cada caso.)
**Decidido (D3, 01/10/2026): gancho central** que registra todo `DELETE` bem-sucedido (como já existe
para o agente), mais o texto específico onde o handler já grava. O gancho garante que nada fica de fora.
**Feito:** gancho central no `authMiddleware` (`registro.excluido`, com o projeto resolvido antes do handler apagar) e `test/trilha-exclusao.test.ts`, que enumera as 20 rotas `DELETE` do roteador e reprova a que não estiver classificada em `src/trilha-exclusao.ts`. SCIM fica de fora (token próprio; "excluir" ali é desativar).

### C5 · Consentimento sem projeto pré-marcado · feito
O primeiro projeto da lista vem marcado. Um tenant que se nomeie para ordenar primeiro faz um
consultor apressado conectar o agente ao projeto errado. Não cruza fronteira de tenant (por isso
é endurecimento, não vulnerabilidade), mas custa uma linha: nenhum projeto marcado e `required`.
**Pronto quando** o formulário exigir a escolha e o teste confirmar.

### C6 · Rótulo `agente.exclusao` · feito
O mesmo rótulo marca lote, eliminação de titular e revogação, que não são exclusões. Renomear
para `agente.acao_destrutiva` (linhas antigas continuam como estão) e atualizar `seguranca.md`.

### C7 · Fragilidades de teste do agente · feito
Cinco pontos, todos pequenos: a prova de que o cabeçalho de confirmação é inerte usa um papel que
já é só de leitura (trocar por uma chave de API `read`); a consulta da trilha no teste não tem
`ORDER BY`; um agente revogado recebe 403, e não 401, nas rotas da lista de proibidas; a mensagem
"id com caractere inválido" aparece também para caminho fora de `/api/v1/`; o teste do mapa da app
confere texto, não a existência da rota.

---

## Onda 2 — produto

### F1 · Tela "Conectar agente" · feito
A reescrita está no `stash@{0}` (branch `fix/tela-conectar-agente`): cópia que não promete o que
não verificou, cartões por cliente com selo "Verificado" ou "A confirmar", e blocos copiáveis.
**Falta:** (1) dizer que o **login** define o usuário e o cliente (a dúvida do consultor sobre como
o agente "sabe" quem é); (2) atualizar o texto ao alcance atual (paridade, confirmação, `niso_skill`);
(3) o selo de cada cliente conforme o F2; (4) captura de tela e PR.
**Pronto quando** a tela refletir o que o agente faz e o que ele pede, com teste de recurso.

### F2 · Login OAuth em Codex, Cursor e Antigravity · você + agente · P2
A configuração está escrita, mas o **login nunca foi confirmado**. Só o Claude Code foi exercitado
em produção. Por ser credencial, o login é seu.
**Roteiro.** Codex: `codex mcp login niso`. Cursor e Antigravity: recarregar e autenticar pelo
painel de MCP. Em cada um, chamar `niso_contexto`.
**Pronto quando** cada cliente estiver marcado "Verificado" ou "Não suportado" no `README` e na tela.

### F3 · "Último uso" ao vivo · P3
O cartão de agentes mostra o momento em que a página foi carregada, o que gerou dúvida de que o
agente tivesse parado. Recarregar a lista a cada 60 s, só enquanto a Governança estiver aberta.

### F4 · O agente ler PDF e planilha · P3 · decisão D2
Hoje binário volta só como tamanho e tipo, e foi a queixa do primeiro uso real (PDFs e políticas
nunca lidos). **Primeiro uma investigação** (S–M): comparar converter dentro do Worker e usar um
serviço de IA da Cloudflare; medir qualidade em PDFs reais do cliente, tamanho e custo.
**Decisão D2 (em aberto):** veja "D2 — o que está em jogo", abaixo.
**Pronto quando** `niso_ler` devolver texto de PDF dentro do limite de 100.000 caracteres, com
teste e sem enfraquecer a fronteira de projeto.

### F5 · Verificação normativa · P3
O `coherence_check` aponta referências órfãs; a skill de prontidão compara com a norma. A
aproximação entre os dois (regras ISO 27001/27701 no servidor) só vale **depois** de o agente da
Twyn exercitar o roteiro 4 em escala. Registrar os achados que a skill repete e promover os mais
frequentes a regra.

### F6 · O humano revoga aprovação e apaga análise crítica · P2 · decisão D1
A limpeza da Twyn precisou de SQL porque **nem a interface** tem: exclusão de análise crítica, e
revogação de aprovação de ROPA e DPIA (só existe para controles). É o D3 do `backlog-plan.md`.
**Decidido (D1, 01/10/2026): sim.** Isto é **para o humano, pela interface**. O agente continua sem essas ações, como
você decidiu.
**Pronto quando** `platform_admin` e o administrador do cliente fizerem as duas coisas na tela, com
senha/confirmação e trilha com o projeto, e o teste provar que o agente **não** alcança.

---

## Onda 3 — dívida estrutural

| ID | O quê | Como medir progresso |
|---|---|---|
| T1 | 510 `any` em `src/`. Tipar o que se toca é barato; falta uma **catraca**: um teste ou regra que reprove o aumento. **Decidido (D4): catraca agora, sem meta de calendário.** | contagem do H5 só desce |
| T2 | `api`, `integration`, `mcp-integration`, `services-rag` mockam o D1 e não pegam deriva de schema. Trocar por D1 real, um arquivo por PR. | lista do H5 esvazia |
| T3 | 36 leituras de `c.req.json` em 12 arquivos sem schema semântico (`policies` 7, `assessments` 6, `governance` 6, `projects` 4). | contagem por arquivo |
| T4 | Teste de frontend para as telas novas (`conectar-agente`, cartão de agentes, checklist): hoje 19 arquivos em `frontend/test/`. | arquivos novos por tela |
| T5 | Direito do titular busca por igualdade em colunas conhecidas (`FONTES_PII`); PII em texto livre não é achada. Requer desenho próprio. | spec antes de código |
| T6 | `migration-0021` e `reconcile-prod` falham só no Windows (CRLF) e os testes de bloqueio de login estouram o tempo sob carga local. O CI passa, mas a suíte local mente. | suíte local verde |

---

## Decisões

| # | Decisão | Resposta (01/10/2026) |
|---|---|---|
| **D1** | A interface humana ganha revogar aprovação de ROPA/DPIA e apagar análise crítica (F6)? | **Sim.** Só o humano, com confirmação e trilha. O agente segue sem. |
| **D2** | O conteúdo de PDF do cliente pode passar por um serviço de conversão (F4)? | **Em aberto.** Veja abaixo. |
| **D3** | Trilha de exclusão por gancho central ou por handler (C4)? | **Gancho central**, mais o texto específico onde já existe. |
| **D4** | Meta para o `any` (T1)? | **Catraca agora**, que não deixa o número subir, sem meta de calendário. |

E as ações que só você faz: **H2** (MFA), **H3/H4** (arquivos soltos e stashes), **F2** (login nos três clientes).

### D2 — o que está em jogo

**A pergunta.** Hoje o agente só lê **texto** de evidência; PDF, planilha e imagem voltam como tamanho e
tipo. Foi a queixa do primeiro uso real. Para o agente ler um PDF, o arquivo precisa ser convertido em texto.

**O caminho que a Cloudflare oferece.** `env.AI.toMarkdown()` (Workers AI) converte documentos em
Markdown, inclusive PDF e imagem; na imagem, um modelo de IA descreve o conteúdo. Usa o binding `AI`
que o projeto **já tem**. Fonte: documentação da Cloudflare, "Markdown Conversion".

**O que o n.iso já manda para o Workers AI** (medido em `src/`): geração de política (`policies.ts`), avaliação
de evidência (`EvidenceAgent`), embeddings do RAG (`knowledge-service`, `memory`), questionário de fases,
prontidão e adequação de controle. Ou seja, **o conteúdo do cliente já passa pelo Workers AI**. O que mudaria é
o formato: hoje vai texto já extraído; passaria a ir o arquivo original (PDF, imagem). Não entra um
terceiro novo: é o mesmo fornecedor e a mesma conta.

**O que eu não consegui confirmar** (a busca na documentação não trouxe resposta autoritativa):
(1) o preço da conversão, e (2) a política de retenção e de uso de dados (treino) do Workers AI. Isso
precisa ser lido por você nos termos e no DPA da Cloudflare, e conferido contra o que os contratos de
vocês com os clientes dizem sobre suboperadores.

**As três saídas**

| Saída | Prós | Contras |
|---|---|---|
| **A. `toMarkdown` da Cloudflare** | Nenhuma infraestrutura nova; lê PDF e imagem; mesmo fornecedor de hoje | Custo a medir; descrição de imagem é gerada por modelo (pode errar); PDF escaneado depende de OCR |
| **B. Biblioteca dentro do Worker** | Nada sai do Worker | Só PDF com texto (escaneado fica ilegível); pesa no tamanho do bundle e no tempo de CPU |
| **C. Não fazer** | Zero risco novo | O consultor continua extraindo o texto à mão e subindo como evidência de texto |

**Limites que valem em qualquer saída:** o upload já é limitado a 25 MB por arquivo, a leitura do agente
é cortada em 100.000 caracteres, e a conversão rodaria **depois** da checagem de projeto
(`requireResourceAccess`), então não abre acesso a arquivo de outro cliente.

**Como decidir sem apostar:** uma investigação curta (S–M) antes de qualquer código: rodar a saída A em 5 a
10 documentos **não sensíveis** (públicos ou da própria ness.), medir qualidade, tempo e custo, e trazer o
resultado. Só com isso você responde sim ou não com número na mão.

---

## Como cada item é executado

1. Branch a partir de `origin/main`, nunca do `main` local (já vazou 38 commits uma vez).
2. Teste primeiro; ver vermelho pelo motivo certo; depois verde.
3. **Suíte inteira** antes do PR. Em 01/10, um PR falhou no CI porque só rodei os testes
   diretamente afetados e a rota nova precisava constar no OpenAPI.
4. Conferir o **código de saída** e "Unhandled", não só "N passaram".
5. Um PR por item; o merge é decisão sua.
6. Mudou o alcance do agente? Atualizar, no mesmo PR, o texto do consentimento, `niso_contexto` e
   [`agente/seguranca.md`](agente/seguranca.md).
