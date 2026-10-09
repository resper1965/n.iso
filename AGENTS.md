# n.iso — Manifesto do Agente

Se voce esta lendo isto, voce e o agente responsavel por continuar o
desenvolvimento do **n.iso** (Agentic GRC System da ness.).

Este arquivo descreve o que **existe hoje**. Historico de sprint vive no
`CHANGELOG.md` — nao acrescente narrativa de entrega aqui, ela envelhece e
passa a mentir para o proximo agente.

## Regra numero um: nao afirme sem evidencia

Em 2026-08-03, tres resumos diferentes afirmaram que PRs estavam mergeados e
que migrations 0013–0018 tinham sido aplicadas. Nenhuma das duas coisas era
verdade. O custo foi real: cinco funcionalidades quebradas em producao
(criar ativo, criar webhook, criar e revogar API key, criar DPIA, mudanca de
escopo) e ninguem percebeu, porque os relatorios diziam que estava tudo bem.

Entao:

- **Mergeado** so depois de `git cat-file -e origin/main:<arquivo>` responder.
- **Aplicado** so depois de `PRAGMA table_info(...)` mostrar a coluna.
- **Em producao** so depois de uma sonda contra a API viva. Desde o item 0.2 do
  `enterprise-grade-plan.md` (hoje em `docs/arquivo/`), `/health` distingue versao — ele devolve o SHA do
  commit publicado, injetado no deploy:

  ```
  curl -s https://niso.ness.com.br/health
  # {"status":"ok","version":"<sha>","deployment_id":"...","deployed_at":"..."}
  ```

  Compare o `version` com o SHA que voce espera. `"dev"` significa que a var nao
  foi injetada — deploy feito fora do workflow.

  A sonda antiga continua util como segunda evidencia, porque prova COMPORTAMENTO
  e nao so um rotulo:

  ```
  curl -s -X POST -H "Content-Type: application/json" -d "{}" \
    https://niso.ness.com.br/api/v1/auth/login
  ```

  Codigo atual devolve o envelope completo:

  ```json
  {"error":"Payload invalido","details":[
    {"path":"email","message":"Invalid input: expected string, received undefined"},
    {"path":"password","message":"Invalid input: expected string, received undefined"}]}
  ```

  Formato anterior ao #34 devolvia os `issues` crus do zod dentro de `details`,
  com `"code"`, `"expected"`, `"received":"undefined"` e `"message":"Required"`.
  O que distingue e a forma de cada item, nao o envelope — `error` e `details`
  existem nos dois. `test/validation-contract.test.ts` fixa esse contrato.

Cole a saida. Sem saida colada, a afirmacao nao conta.

E vale para contagem tambem: o PR que introduziu esta regra afirmou "46 tabelas"
porque `grep -c 'CREATE TABLE'` contou duas linhas de COMENTARIO, e "7 de 23
testes mockam o D1" porque `grep vi.fn()` casa mock de qualquer coisa. Os
numeros certos eram 44 e 2 de 22. `grep` conveniente nao e evidencia — confira o
que o padrao realmente casou antes de escrever o numero. **Todo numero neste arquivo
traz ao lado o comando que o mede**; numero sem comando nao entra.

## Stack

Cloudflare Workers (Hono) + D1 + KV + R2 + Workers AI. Frontend SPA
Vanilla JS, sem framework, bundle via Vite. Deploy por `wrangler deploy`.

- **Backend**: `src/index.ts` e o composition root que monta os sub-routers de
  dominio: **48 arquivos em `src/routes/`** (`ls src/routes/*.ts | grep -vc '\.test\.ts$'`,
  2026-10-09). A lista nominal envelhecia a cada PR; leia o diretorio.
- **Pedidos de aprovacao/ciencia (acesso de stakeholders)**: tabelas `pedidos`
  (conteudo congelado + SHA-256) e `pedido_destinatarios` (a prova por pessoa).
  Regras em `src/services/pedidos.ts` (`podePedir`, `autoridadeNoPedido`,
  `conferirVigencia`, `registrarDecisao`). Rotas: `/api/v1/pedidos*` (o
  destinatario; unico prefixo de dado do papel `stakeholder`),
  `/api/v1/projects/:projectId/pedidos*` (quem pede: criar, ciencia em lote,
  painel, reenvio), `/api/v1/public/pedidos/ver|codigo|ciencia` (link com codigo,
  token so no corpo) e `POST /api/v1/public/auditor/pedidos` (a prova, para o
  auditor externo, token no corpo, paginada; o portal inteiro esta em
  `src/routes/public-auditor.ts`). **A prova e imutavel**: o trigger
  `pedido_dest_prova_imutavel` recusa UPDATE em linha decidida, e
  `pedido_prova_imutavel` (0043) recusa mudar hash, conteudo e documento de
  qualquer pedido e status/substituto de pedido fechado (`org_id` fica livre:
  a transferencia de projeto o atualiza). DELETE fica livre no banco so para o
  projeto cascatear. No fonte, todo `UPDATE pedidos` leva `status = 'aberto'` e
  todo `UPDATE pedido_destinatarios` leva `status = 'pendente'` na WHERE do
  proprio statement (a unica excecao e `UPDATE pedidos SET org_id = ?`), sem
  DELETE nem REPLACE; `test/pedidos-prova.test.ts` le o fonte e reprova o que
  fugir disso. Correcao e pedido novo.
- **URL canonica**: `src/config/url.ts` (`appUrl(env)`, var `APP_URL`). Link de e-mail, callback
  de SSO, base do SCIM, CORS e recurso do MCP saem dali, nunca do host da requisicao. Os hosts
  legados (`n-iso.ness.com.br`, `niso.ness.workers.dev`) respondem 308 para ele (#290).
- **Middleware**: `src/middleware/auth.ts` (sessao, chave de API, RBAC
  write-guard por metodo+rota) e `src/middleware/project-access.ts` (isolamento
  multi-tenant em `/api/v1/projects/:projectId/*`).
- **Services** (`src/services/`, 36 arquivos: `ls src/services/*.ts | wc -l`): entre eles
  `soa-logic.ts` (93 regras Annex A 2022), `migration-service.ts` (2013→2022),
  `policy-generator.ts`, `pedidos.ts`, `organizacao.ts`, `fechar-venda.ts`,
  `preco-proposta.ts`, `transferencia-projeto.ts`, `totp.ts`, `data-subject.ts`.
- **Agents** (`src/agents/`): policy, evidence, assessment, control-adequacao,
  phase-interpretation, readiness (`ls src/agents`).
- **Frontend**: `frontend/src/` → `frontend/dist`, servido pelo binding ASSETS.
  - `frontend/login.html` — o app de verdade (login + SPA), entrada do Vite
    (`vite.config.js: rollupOptions.input`), com `src/main.js`, `router.js`,
    `state.js` (estado global `S`), `api.js`, `ui.js`, `globals.js`,
    `src/views/*.js`. Serve `/`, `/login` e toda rota desconhecida. Desde
    2026-09-29 a tela de entrada É a landing: login na primeira dobra, seções
    institucionais abaixo, tudo dentro de `#login-overlay`
    (`docs/superpowers/specs/2026-09-29-landing-login-design.md`). **Não
    recrie `frontend/public/index.html`**: ele voltaria a tomar `/` com CSS
    próprio — foi assim que a landing antiga saiu da marca. Sem `index.html`,
    `/` cai no catch-all de `src/index.ts`, que entrega `/login`
    (`test/landing-raiz.test.ts`). Atenção: `vite.config.js` tem
    `emptyOutDir: false`, então um `dist/index.html` de build antigo sobrevive
    localmente — apague antes de testar a raiz com `wrangler dev`.
  - `frontend/public/politicas.html` — portal público de confirmação de
    leitura de política (LGPD art. 18 / ISO A.6.3). Serve `/politicas`
    (`/politicas.html` redireciona, 307, via `html_handling` do Workers
    Assets). Ficou fora de `dist/` por meses até 2026-08 — não estava na
    lista de entradas do Vite, então nunca era copiado; qualquer link externo
    para ele caía silenciosamente na tela de login. Confira antes de mexer:
    `curl -sL <domínio>/politicas.html` deve devolver o título "Portal de
    Ciência de Políticas", não o do app.
  - `frontend/public/auditor.html` (+ `auditor.js`, `auditor.css`) — portal do auditor externo,
    somente leitura. Serve `/auditor`; o link sai de `POST /api/v1/projects/:id/auditor-token` (cartão
    em Auditorias) com o token no fragmento, e a página fala só com `/api/v1/public/auditor/*`
    (`src/routes/public-auditor.ts`), token no corpo, só o hash no banco.
  - Arquivo novo em `frontend/public/` é copiado como está — mesmo padrão de
    `marked.min.js`, `favicon.svg`. Não precisa de entrada no Vite.
- **Schema**: `schema.sql` — **82 tabelas** (2026-10-09: `grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`;
  em 2026-10-05 o mesmo 58 (antes da 0046) saiu do `schema.sql` aplicado num SQLite em memoria). Migrations
  numeradas em `migrations/`, ultima a **0059** (`ls migrations/*.sql | tail -1`). Procedimento
  de migration nova e o que ha de particular (0011 neutralizada, buraco 0031–0033) em
  `migrations/README.md` — leia antes de tocar em migration.
- **Inventario (ativos)**: vive em `itens` (nucleo fino) + `item_seguranca` (bloco do n.iso, 1:1), antes `assets`
  (migration 0048). `src/services/itens.ts` traduz as duas tabelas para o formato antigo da API de ativos
  (`name`, `owner`, `status` Active/Removido...), entao tela, MCP e CSV nao mudaram. Coluna nova no inventario:
  acrescente em `CAMPOS` la, nunca interpole nome vindo da requisicao.
- **Documentos (politicas)**: `documentos` + `documento_versoes` (migration 0050, fatia 3.1), em `src/services/documentos.ts`
  e `src/routes/documentos.ts`. Uma versao vigente e um rascunho por documento (indices parciais unicos); hash e o SHA-256
  canonico dos pedidos. **O controle ainda e a fonte das politicas** (`compliance_controls.description` e `policy_versions`)
  ate a 3.3. Desde a 3.2 todo escritor de politica passa por `src/services/politica-escrita.ts` e espelha o texto no
  documento, e o **agente (MCP) so grava rascunho**: a rota decide por `c.get('user')?.agente === true`; publicar
  (`POST .../versoes/:n/publicar`, que aplica o texto no controle) e descartar o rascunho sao atos humanos e estao em
  `FORA_DO_AGENTE`; `PUT /controls/:id` recusa ao agente mudar `description` fora da justificativa de N/A. `POST .../documentos/importar` copia para ca so o que tem sinal de politica (versao, aprovacao
  ou pedido); `description` preenchida nao basta (em producao e texto de catalogo em quase todo controle).
  **Ciencia por versao (3.3, migration 0051)**: `pedidos.tipo = 'documento'` tem `ref_id = documentos.id` e congela a versao
  VIGENTE (`titulo`, `texto`, `numero`; `DOCUMENTOS.documento` em `src/services/pedidos.ts` e um subselect). Publicar versao
  (rota ou escritor de politica) chama `conferirPedidosDoDocumento(c, 'documento', ...)` e substitui o pedido aberto; a ciencia
  da versao antiga fica no pedido antigo. O portal publico `/politicas` lista so documentos com versao vigente e grava a ciencia
  por `registrarCienciaPortal`: linha de `pedido_destinatarios` JA DECIDIDA (`canal = 'portal'`, hash, IP, user-agent) num pedido
  `ciente` "em pe" (`criado_por = 'sistema:portal'`, um aberto por documento, indice unico parcial). Quem leu pelo portal nao e
  copiado para o pedido novo. Nada novo entra em `policy_acknowledgments` pelo portal; o registro manual interno
  (`POST /projects/:id/policy-acknowledgments`) ainda escreve nela ate a 3.4. A aprovacao CISO/CEO de documento NAO existe
  ainda (so `ciente`): segue nas colunas do controle e no pedido `politica`.
  **Tela, hierarquia e aprovacao por versao (3.4)**: `frontend/src/views/documentos.js` (`#nav-documentos`). A hierarquia e regra do
  servidor (`validarHierarquia`: politica sem pai; norma sob politica; procedimento sob norma ou politica; ciclo e impossivel por
  construcao). `PUT /documentos/:id` edita metadados (nunca o texto), `POST .../revisar` renova `revisar_ate` sem versao, e a
  fonte `documento` de `src/services/avisos-prazo.ts` avisa a revisao vencida. A aprovacao CISO/CEO de documento e **derivada
  dos pedidos** (`tipo = 'documento'`, papel `ciso`/`ceo`): vale o pedido aprovado cujo hash e o do conteudo vigente agora, entao
  versao nova invalida sozinha sem apagar prova; `registrarDecisao` nao assina nada em controle/DPIA para documento (a prova e a
  linha do destinatario). `GET /documentos/:id/ciencias` lista quem deu ciencia de qual versao e por qual canal. A tela de
  politicas por controle (`policies-dashboard`) continua: ainda tem geracao por IA, assinatura por controle e relatorio impresso.
  **Excecoes (3.5, migration 0052)**: `documento_excecoes` (escopo, motivo, `vence_em`, `status` ativa|revogada) em
  `src/services/excecoes.ts`, rotas `/documentos/:id/excecoes` (listar, criar, editar, `POST .../revogar`). A aprovacao e um pedido
  `tipo = 'excecao'` (`ref_id` = a excecao, congela escopo/motivo/prazo, papel `ciso`/`ceo`); a situacao e DERIVADA (revogada,
  vencida, aprovada, aguardando, sem_pedido) e mudar escopo/motivo/prazo invalida a aprovacao sozinho. Revogar cancela o pedido
  aberto e o agente nao revoga. A fonte `excecao` dos avisos de prazo avisa o vencimento.
- **Catalogo de requisitos (fatia 2, migration 0053)**: `requisito_fontes`, `requisitos` e `requisito_mapeamentos` sao GLOBAIS (sem
  `project_id`); `documento_requisitos` liga documento a requisito (por projeto) e `compliance_controls.requisito_id` liga o controle.
  Servico em `src/services/requisitos.ts` (`semearCatalogo`, `ligarControles`, `lacunasDaFonte`), rotas em `src/routes/requisitos.ts`
  (`/api/v1/requisitos*`, e `/projects/:id/requisitos/lacunas` e `/documentos/:id/requisitos`). Depois do seed o BANCO e a fonte da
  verdade: titulo e mapeamento sao dado editavel so pelo `platform_admin`, com `logAudit`; o seed e `INSERT OR IGNORE` e nunca
  sobrescreve edicao. Mapeamento `proposto` so aparece para consultor e administrador; `validado_juridico` exige `validado_por` e
  `validado_em` (CHECK). A cobertura de um artigo (`lacunasDaFonte`) conta documento VIGENTE ligado ou controle implementado ligado por
  mapeamento validado `equivalente` (`parcial` e parcial; `relacionado`, `proposto` e controle N/A nao cobrem). LGPD e GDPR entram por
  material juridico revisado, nao por codigo. O agente so le (`FORA_DO_AGENTE`).
- **RoPA como tratamento ligado (fatia 4, migrations 0054 e 0055)**: `ropa_records` CONTINUA sendo a tabela do tratamento (sem rename:
  a spec diz `tratamentos`, mas renomear tocaria 30+ arquivos por so um nome). `src/services/tratamentos.ts` e as rotas
  `/projects/:id/ropa/:rid/{ligacoes,itens,departamentos,transferencias,diagrama}` ligam o registro a itens, departamentos e
  transferencias (`tratamento_itens`, `tratamento_departamentos`, `tratamento_transferencias`, todas com `project_id`); as PARTES do
  tratamento sao `parte_vinculos` com `alvo_tipo = 'tratamento'` (sem tabela propria) e a base legal e `ropa_records.base_legal_id` →
  `requisitos`. Excluir o registro apaga as ligacoes e os vinculos. O diagrama Mermaid e DERIVADO (`diagramaDoTratamento`), nunca
  guardado, com rotulos sanitizados. A aprovacao por pedido (`tipo = 'tratamento'`, 0055 reconstroi `pedidos` no molde da 0051 e ja
  aceita `avaliacao_terceiro` da fatia 6) congela o registro e tudo o que ele liga (o diagrama sai dessas colunas); e DERIVADA
  (`aprovacoesDoProjeto(..., 'tratamento')`), mudar registro, item, departamento, parte ou transferencia invalida e substitui o pedido
  aberto, status nao. Convive com a aprovacao direta antiga (`POST .../approve`). `POST /projects/:id/ropa/importar` (CSV) cria
  `Draft`, devolve as linhas recusadas e nao duplica (chave: finalidade).
- **DPIA e LIA do tratamento (fatia 5, migration 0056)**: `dpia_assessments.ropa_id` tem integridade no BANCO por tres triggers
  (`dpia_ropa_do_projeto_ins/_upd` recusam registro inexistente OU de outro projeto; `dpia_ropa_apagada` zera a referencia ao apagar o
  tratamento), sem reconstruir a tabela (assinatura e deriva historica). `lia_assessments` e a LIA (uma por tratamento, `ropa_id`
  unico, some com ele; concluir exige finalidade, necessidade, balanceamento e conclusao; concluida so reabre). `src/services/lia.ts`:
  `liaExigida` vale quando a base do catalogo OU o texto livre diz "legitimo interesse" (sem acento nem caixa) e so aparece em
  `GET .../ropa/:rid/ligacoes` (`lia`, `dpias`, `dpia_pendente`), nao bloqueia. `POST .../ropa/:rid/dpia` cria a DPIA `Draft` ligada e
  pre-preenchida (409 com o id se ja existe). As duas familias de colunas da DPIA NAO foram unificadas (hash de aprovacoes existentes).
- **Terceiros tipificados (fatia 6, migration 0057)**: o terceiro e uma `partes` do tipo `organizacao` com `terceiro_tipo`
  (`grande_provedor|medio|pequeno|critico`) e `src/services/terceiros.ts` (rotas `/projects/:id/terceiros*`). **O tipo define o
  metodo** (`METODO_DO_TIPO`: trust_center, questionario, questionario, auditoria) e o SERVIDOR decide, nao o corpo. `avaliacoes_terceiro`
  guarda o HISTORICO (resultado, `valido_ate` obrigatorio e futuro, link http(s) de evidencia) e a situacao e DERIVADA da mais recente
  (`situacaoDe`: pendente, vigente, vencida, reprovada). `documento_partes` liga documento a terceiro como DPA/contrato/outro (a spec pede
  `documentos.tipo = 'contrato'`; mudar esse CHECK reconstruiria `documentos` e quatro tabelas filhas). Efeitos do vencimento: fonte
  `avaliacao_terceiro` nos avisos de prazo (titulo com o numero de tratamentos que usam o terceiro) e
  `terceiros_com_avaliacao_vencida` em `GET .../ropa/:rid/ligacoes`. Sem pedido de aprovacao da avaliacao ainda (o CHECK da 0055 ja aceita).
- **Titular, incidente e consentimento (fatia 7, migration 0058, SO registro interno)**: `titular_pedidos` (protocolo `PT-AAAA-NNNN` por projeto),
  `incidentes` (`IN-AAAA-NNNN`; encerrar exige risco avaliado e, se `relevante`, a comunicacao a ANPD registrada: CHECK do banco, vale para SQL
  direto) e `consentimentos` (prova ligada ao tratamento; revogar nao apaga). **Nenhum prazo legal mora no codigo nem na migration:**
  `parametros_legais` (global) guarda cada prazo com FONTE e REVISAO, editavel so pelo `platform_admin` com trilha; sem o valor o prazo e
  nulo ("nao calculado") e nada quebra. O prazo e CONGELADO no registro na criacao (`somarPrazo`: horas, dias corridos ou dias uteis, sem
  feriado). Avisos de prazo ganharam as fontes `titular_pedido` e `incidente` (um item por comunicacao pendente). Rotas:
  `/api/v1/parametros-legais`, `/projects/:id/{titular-pedidos,incidentes,consentimentos}`; o agente registra e avalia, mas nao encerra
  incidente, nao revoga consentimento e nao edita prazo. Portal publico e conector externo: fora (decisao de 09/10).
- **Visoes, evidencia com validade e casca (fatia 8, migration 0059)**: `evidence.valido_ate` (opcional) e `evidencia_requisitos` ligam a
  evidencia a requisito (`/projects/:id/evidence/:eid/{requisitos,validade}`, no router de requisitos, SEM tocar `evidence.ts`). A rotina
  diaria de avisos chama `vencerEvidencias` ANTES de avisar: evidencia vencida volta a `pending` (a assinatura gravada NAO e apagada, ela
  atesta o conteudo), uma linha de trilha por evidencia, idempotente; fonte `evidencia` nos avisos. A cobertura da LGPD (`lacunasDaFonte`) conta
  evidencia `conforming` em dia (cobre) ou `partial` (parcial). `GET /projects/:id/encarregado` (`src/services/encarregado.ts`) e SO consulta:
  pedidos do titular, incidentes, tratamentos sem base/DPIA/LIA, terceiros, documentos, evidencias, LGPD e prazos legais nao cadastrados, com a
  lista "o que fazer" priorizada; funciona com tudo vazio. Menu: grupo `n.privacy` (marca com o ponto em destaque) com Encarregado, ROPA, DPIA /
  RIPD, Requisitos, Terceiros e Titular e incidentes. A casca visual propria (identidade, pagina de entrada) e o bloqueio por modulo no
  frontend NAO foram feitos: dependem de decisao de design do dono.
- **Bindings** (`grep '"binding"' wrangler.jsonc`): DB (D1), SESSIONS e OAUTH_KV (KV),
  STORAGE e TRILHA (R2), AI, ANALYTICS (Analytics Engine), CF_VERSION_METADATA, ASSETS.
- **Rotinas agendadas** (`grep -A2 '"triggers"' wrangler.jsonc`): `10 4 * * *` roda a manutencao
  (`src/manutencao.ts`, purga e retencao) e `0 11 * * *` (08:00 em Brasilia) os avisos de prazo
  (`src/services/avisos-prazo.ts`: sino em D-7 e D0, aviso agregado por pessoa e projeto no atraso,
  e-mail-resumo; idempotencia em `avisos_prazo`). O
  `scheduled` de `src/index.ts` despacha por `event.cron`.
- **MCP**: `mcp-server-niso/` expoe o produto a clientes MCP com filtro de
  ferramenta por papel. Ver `mcp-server-niso/README.md`.
- **Skills do consultor**: `agent-skills/<nome>/` (SKILL.md + references + scripts) e a fonte; o
  Worker nao le disco, entao `npm run skills:gerar` escreve `src/mcp/skills-gerado.ts` (commitado; o
  `test/agente-skills.test.ts` falha se ficar velho). O agente as le pelo MCP com `niso_skill`,
  atras do login. Skill nova = pasta nova + gerar + roteiro em `src/mcp/contexto.ts`.
- **Documentacao do agente**: `docs/agente/` (uso, arquitetura com diagramas, seguranca e o
  checklist de PR). Leia `docs/agente/seguranca.md` antes de criar rota nova: o principal do
  agente carrega o `users.id` real do consultor, e rota de "minha conta" entra em
  `FORA_DO_AGENTE`.
- **MCP remoto** (consultor): agente com alcance de consultor preso a um projeto (`src/mcp/servidor.ts`); `/mcp` em `src/mcp/`; login OAuth em `/oauth/*`
  (`src/routes/oauth-autorizacao.ts`); principal agente em
  `src/middleware/agente.ts`; gestao das concessoes em `src/routes/agentes.ts`;
  tabela `agente_concessoes`; KV `OAUTH_KV`. Regra: **so `ROTAS_OAUTH` passam
  pelo `OAuthProvider`** (`src/index.ts`) — o resto continua no Hono. KV
  `OAUTH_KV` (id `fc8dfff4…`) criado em 2026-09-29 e declarado no `wrangler.jsonc`. Recurso fixo em
  `niso.ness.com.br`. Clientes: Claude Code verificado em producao (30/09/2026); Cursor,
  Codex e Antigravity seguem "A confirmar" na tela Conectar agente (ver CHANGELOG).

## Decisoes de produto ja tomadas — nao reabrir

- **Sem i18n.** O produto e PT-BR. Comentario, mensagem de erro e texto de UI em
  portugues. A camada de traducao foi removida por decisao explicita.
- **Sem alternancia de tema.** Um tema so, o escuro da marca.
- **Sem framework no frontend.** Vanilla e decisao, nao divida.
- **Responsividade fora de escopo** ate segunda ordem.

## Restricoes Tecnicas

- O catch-all estatico (`c.env.ASSETS.fetch`) DEVE ser a ultima rota em
  `src/index.ts`.
- `authMiddleware` roda antes das rotas `/api/v1/*`; `projectAccessMiddleware`
  logo apos, em `/api/v1/projects/:projectId/*`. Rotas realmente publicas (auth,
  public) sao montadas antes do `authMiddleware`.
- Chave de API autoriza escrita pelo campo `permissions` (`write`/`admin`), nao
  pelo allow-list — este existe para papeis **humanos** read-only. Ver o
  comentario em `auth.ts` antes de mexer.
- `SETUP_KEY` e segredo (`wrangler secret put SETUP_KEY`); sem ele `/auth/setup`
  fica desabilitado (falha fechada). Nunca commitar segredo em `wrangler.jsonc`.
- Segredos e tokens usam CSPRNG (`genToken`/`genNumericCode`), nunca
  `Math.random`.
- **Vetorizacao (Vectorize/RAG) removida em 2026-10-06**: o indice de producao
  tinha 1 vetor e nenhum indice de metadados (toda consulta filtrada por
  `project_id` voltava vazia), a tela "Knowledge Base" chamava rotas que nao
  existiam, chat/agentes/MCP nao usavam vetor, e vetores nunca eram apagados na
  exclusao de projeto nem no pedido do titular. Busca futura comeca por texto no
  D1, nao por embedding. A tabela `project_knowledge` ficou orfa (ver CHANGELOG).
- Schema muda em **dois** lugares: `schema.sql` e uma migration. Em `schema.sql`,
  indice **depois** da tabela — `CREATE INDEX` antes do `CREATE TABLE` derruba a
  criacao de banco novo e so aparece em banco novo.
- Antes de migration em producao: `npm run db:backup` (ver `backups/README.md`).
- Frontend: sem modulos ES em runtime, tudo no escopo `window`. Estado global `S`.

## Divida conhecida — nao finja que nao existe

Ao mexer nestas areas, voce esta em terreno que ja falhou antes:

- **539 `any` em `src/`** (medido em 2026-10-09, fora `*.test.ts`:
  `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`).
  `tsc --noEmit` limpo diz pouco. Tipar o que voce tocar e melhoria barata; nao
  precisa de permissao (o `-a` importa: `fechar-venda.ts` tem byte NUL e o
  `git grep` sem ele conta menos). `test/any-catraca.test.ts` reprova se o numero subir — e
  tambem se descer sem baixar o `TETO` la.
- **Nenhum dos 225 arquivos de teste do backend mocka o D1 inteiro** (2026-10-09;
  `ls test/*.test.ts | wc -l`). Todos os que tocam banco usam o D1 real do
  `cloudflare:test`. Sobram dubles PONTUAIS de proposito: falha injetada
  (`helpers.test.ts`, `evidencia-upload-controle.test.ts`), linha legada que o schema atual
  nao aceita (`api.test.ts`) e Proxy sobre o D1 real para simular erro ou corrida
  (`erro-sem-vazamento`, `pedidos-corrida`, `revisao-final-decididos`). Medicao:
  `git grep -nE "prepare\s*[:(]\s*(vi\.fn|\(|async)|\bDB\s*:" -- test` e conferir
  cada ocorrencia. Teste mockado nao pega deriva de schema — foi exatamente
  assim que o codebase acumulou consulta a tabela inexistente. Caminho novo de
  banco: teste de integracao real, no estilo de `test/schema-contract.test.ts`.
- **Frontend com pouco teste por linha.** ~15,1 mil linhas de JS (2026-10-09)
  (`cat frontend/src/*.js frontend/src/views/*.js | wc -l`), 67 arquivos de teste em jsdom
  (`ls frontend/test/*.test.js | wc -l`) e 5 specs E2E em Chromium (`ls frontend/e2e/*.spec.js`),
  que rodam no CI. `test/e2e/mfa.py` e legado, fora do CI. A maior parte das telas ainda nao
  tem teste proprio.
- **6 leituras de corpo cruas em 4 arquivos** (2026-10-06: `git grep -n "c\.req\.json" -- 'src/routes/*.ts'`
  da 7 linhas; `policies.ts` passa o corpo por `safeParse` e nao conta): `control-adequacao`,
  `controls` (le so para recusar `maturity`, depois `validateBody`), `phase-questionnaire` e
  `scim` (3, formato SCIM). Elas validam campo a campo no handler; o `bodyGuard` global cobre
  teto de tamanho e poluicao de prototipo. O T3 (#259) fechou as demais.
- ~~**324 handlers `onclick=` inline**~~ **RESOLVIDO.** A migracao para delegacao
  de eventos terminou (PRs #121–#134) e `'unsafe-inline'` saiu de `script-src`
  em `src/index.ts`. Sobra 1 ocorrencia de `onclick=` no frontend. NAO
  reintroduzir handler inline nem `<script>` inline: quebram sob o CSP atual e
  reabrem o buraco.
- **Direitos do titular nao cobrem PII em texto livre.** A busca e por igualdade
  em colunas conhecidas (`FONTES_PII` em `src/services/data-subject.ts`).
- **`npm audit` esta em zero nos tres pacotes** (2026-10-08, `npm audit` em cada um: raiz, `frontend` e
  `mcp-server-niso`). Em 06/10 a raiz tinha 4 (o `undici` puxado por `miniflare`/`wrangler`); o #297
  fixou `undici`, `sharp` e os pacotes MCP por `overrides` no `package.json`, sem rebaixar o pool de
  testes. O job `audit` do CI segue informativo (`continue-on-error`). Rode `npm audit` antes de repetir
  qualquer afirmacao sobre ele.

## Segundo fator (MFA) — e como destravar alguem

O MFA e opcional e nasce desligado (`totp_enabled = 0`). Ativar e acao do
proprio usuario, pelo cartao de perfil no rodape da barra lateral — nao pela
pagina de Configuracoes, que e escondida para papeis de cliente.

Quem perde o autenticador cai numa sessao `mfa_pending`, que so alcanca
`/auth/mfa/verify` e `/status`. Sem os codigos de recuperacao, o unico caminho
e o banco:

```
npx wrangler d1 execute niso-db --remote --command \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_recovery_hashes=NULL, \
   totp_last_window=NULL WHERE email='alguem@exemplo.com';"
```

Acesso ao D1 sempre vence o segundo fator — em qualquer sistema. E por isso que
esse acesso e o que precisa ser protegido, nao o MFA.

Ao mexer nas rotas de MFA, lembre: **401 ali e resposta esperada a erro do
usuario**, nao sessao expirada. `frontend/src/api.js` isenta
`/api/v1/auth/mfa/*` do logout automatico justamente por isso — sem a isencao,
errar um digito destruia a sessao.

## Regras da ness.

- Marca: ness. (sempre minusculo, com ponto).
- Layout: Enterprise Grade, header de 64px (`--hdr-h` em `frontend/src/style.css`), sem blur.
- **Fonte única dos tokens: `frontend/src/style.css` (`:root`).** Não repita
  valores aqui — a cópia anterior (#070b14, "proibido peso 600") envelheceu e
  a landing antiga seguiu a cópia, não o app. Hoje: `--bg #0b1326`,
  `--surface #162244`, `--accent #00ade8`, `--text #f1f5f9`.
- Tipografia: Inter no corpo; Montserrat 500 na marca, 600 em títulos.
- Produto: `n.iso`, com o ponto em accent, como a marca `ness.`.
- Proibido: italicos, emojis/icones, accent como background de area.
- Inputs: border-radius 10px (`.form-input`).
- Login: tela dividida — marca à esquerda, cartão à direita; empilha abaixo
  de 900px.

## Documentos que valem a leitura

- `docs/README.md` — indice da documentacao; `docs/arquivo/` guarda o que ja foi executado
- `docs/plano-2026-10-fechamento.md` — estado de cada item do plano de outubro (quase todo entregue)
- `docs/superpowers/plans/2026-10-05-plano-mestre-execucao.md` — o plano mestre e o estado de hoje
- `CONTRIBUTING.md` — verificacao antes do PR, regras de schema e de teste
- `SECURITY.md` — invariantes de seguranca que nao podem regredir
- `backups/README.md` — runbook de backup e restauracao
- `migrations/README.md` — estado real das migrations em producao e como
  reconciliar quando a `d1_migrations` divergir do banco
- `test/e2e/README.md` — o E2E legado de MFA (o E2E principal e `frontend/e2e/`)
- `CONSTITUTION.md`, `design.md` — principios e identidade visual

<!-- SPECKIT START -->
## Contexto Spec Kit
Este projeto utiliza o GitHub Spec Kit para desenvolvimento orientado a
especificacoes.
- Constituicao: CONSTITUTION.md (a unica; `.specify/memory/constitution.md` foi removida)
- Design: design.md
- Especificacoes e planos: `docs/superpowers/specs/` e `docs/superpowers/plans/`; os ja
  executados e as specs iniciais do Spec Kit estao em `docs/arquivo/`
<!-- SPECKIT END -->

## Skills instaladas

`.agents/skills/`, simlinkadas em `.claude/skills/`. O texto completo vive em
cada skill — nao duplicar as regras aqui, senao as duas copias divergem (foi o
que aconteceu com a copia inline do ponytail).

| Skill | Quando atua |
|---|---|
| `using-superpowers` | Abertura de qualquer conversa. Injetada automaticamente pelo hook de SessionStart: consultar skill antes de responder ou agir. |
| `ponytail` | Toda tarefa de codigo. Escada YAGNI, menor diff que funciona, reusar antes de escrever. Nunca simplifica: entendimento do problema, validacao em trust boundary, tratamento de erro, seguranca, acessibilidade. |
| `brainstorming` | Antes de construir feature ou mudar comportamento: extrair intencao e requisito antes de codigo |
| `writing-plans` | Virar spec em plano de implementacao executavel |
| `executing-plans` | Executar plano escrito em sessao separada, com checkpoint de revisao |
| `subagent-driven-development` | Executar plano com tarefas independentes na sessao atual |
| `dispatching-parallel-agents` | 2+ tarefas independentes, sem estado compartilhado |
| `using-git-worktrees` | Isolar workspace antes de executar plano |
| `test-driven-development` | RED-GREEN-REFACTOR durante implementacao |
| `systematic-debugging` | Bug, teste falhando ou comportamento inesperado — antes de propor correcao |
| `verification-before-completion` | Antes de dizer "pronto"/"passou": rodar o comando e conferir a saida |
| `requesting-code-review` | Entre tarefas; achado critico bloqueia |
| `receiving-code-review` | Ao receber feedback de review: verificar tecnicamente antes de implementar |
| `code-review` | Review de diff contra padrao do repo e contra a spec |
| `finishing-a-development-branch` | Fechamento de branch |
| `writing-skills` | Criar ou editar skill |
| `security-threat-model` | Modelagem de ameaca de uma area do codigo, sob pedido explicito |
| `security-audit` | Caca a vulnerabilidade exploravel |
| `webapp-testing` | Teste de UI via navegador |
| `iso27001` / `iso27701` | Referencia normativa: Annex A, clausulas, SoA, DPIA, ROPA |
| `find-skills` | Descobrir e instalar skill nova |

### Superpowers

As 14 skills de processo acima (de `using-superpowers` a `writing-skills`) sao o
[Superpowers](https://github.com/obra/superpowers) (MIT, `LICENSE.txt` em cada
pasta), vendorizado em vez de instalado como plugin — assim a versao fica travada
em `skills-lock.json` e vale para todo mundo que clona o repo, sem cada um instalar
marketplace na mao.

O bootstrap e `.claude/hooks/superpowers-session-start.sh`, registrado como
SessionStart em `.claude/settings.json`: ele injeta o texto de `using-superpowers`
no inicio da sessao. Sem esse hook as skills ficam no disco e o agente nao sabe que
precisa consultar uma antes de agir — que e o ponto do Superpowers.

Atualizar: `npx skills update` (reescreve `skills-lock.json`). O CLI copia para
`.claude/skills/`; devolva ao padrao do repo movendo a pasta para `.agents/skills/`
e refazendo o symlink.

**Telemetria:** o companion visual do `brainstorming` carrega um logo do site do
autor, o que revela versao e uso. `.claude/settings.json` define
`SUPERPOWERS_DISABLE_TELEMETRY=1` — nao remova. Os scripts em
`brainstorming/scripts/` sobem servidor HTTP **local** (localhost, com token) e so
rodam sob pedido explicito.

**Aviso sobre `iso27001` / `iso27701`:** sao material de terceiro (Socket e Snyk
limpos, so markdown, sem script). Os scanners verificam malware, **nao** a
exatidao do texto normativo. Nao emita documento de conformidade para cliente com
base so nessas skills sem conferir contra a norma publicada.

## Portões de revisão — o que existe e o que não existe

O repositório está **público** (`gh api repos/resper1965/n.iso --jq .visibility`, 2026-10-06).
O dono pretende torná-lo privado ao fim da arrumação final; quando isso acontecer, reveja esta
seção: em repositório privado o code scanning exige GitHub Advanced Security, e o CodeQL
passaria a falhar no upload (já aconteceu em 2026-08, quando o repo foi privado pela primeira vez).

- **CodeQL roda** (`.github/workflows/codeql.yml`; última execução com sucesso em 2026-10-06:
  `gh api "repos/resper1965/n.iso/actions/workflows/codeql.yml/runs?per_page=1"`).
- **Codex** revisa o diff, atrelado à assinatura e não à visibilidade do repo.

### Protecao da `main` e deploy — ja configurados

- **Ruleset "main protegida"**: exige PR, exige os checks **`test` e `e2e`**
  (`gh api repos/resper1965/n.iso/rulesets/20312002`), exige branch atualizado com a base,
  bloqueia delecao e force-push. `bypass_actors` vazio — em rulesets, admin do repo **nao**
  tem bypass automatico.
- Nao exija check que pode deixar de existir (o `CodeQL`, se o repo ficar privado): um check
  obrigatorio inexistente trava todo merge para sempre.
- **Deploy e automatico** desde 2026-08-03: merge na `main` dispara
  `.github/workflows/deploy.yml`, que roda `npm ci`, `tsc --noEmit`, a suite,
  o build do frontend, **recusa se houver migration pendente**, e so entao
  publica. O secret `CLOUDFLARE_API_TOKEN` e **environment secret** de
  `production`, nao repository secret — assim so jobs que declaram
  `environment: production` o enxergam (conferido em 2026-10-06:
  `gh api repos/resper1965/n.iso/environments/production/secrets` lista o token e
  `gh api repos/resper1965/n.iso/actions/secrets` volta vazio).
- **O ambiente `production` aceita deploy só da `main`** (2026-10-08,
  `gh api repos/resper1965/n.iso/environments/production/deployment-branch-policies`): uma branch
  qualquer não consegue rodar job com o token de deploy. Consequência para migration: o workflow
  `db-migrate.yml` só roda na `main`, onde a migration nova ainda não existe antes do merge. Ordem
  possível: (a) aplicar pelo terminal (`npx wrangler d1 migrations apply niso-db --remote`, depois do
  `npm run db:backup`) e só então mergear; ou (b) mergear (o deploy recusa, de propósito, e abre
  issue), rodar *Apply DB migrations* e depois *Deploy*.
- **Actions presas por SHA** (`test/workflows-actions-sha.test.ts` reprova action solta); o
  Dependabot `github-actions` abre o PR de atualização com o SHA novo.
- `wrangler secret put` grava no **Worker**, nao no Actions. Sao lugares
  diferentes; o Worker nao precisa do token de deploy e nao deve carrega-lo.
