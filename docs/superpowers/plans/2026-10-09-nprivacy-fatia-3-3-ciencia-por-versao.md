# Núcleo do n.privacy, fatia 3.3 — ciência por versão e portal de documentos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 4.6 ("A ciência aponta para a versão", migração e `policy_acknowledgments` congelado). Decomposição: `docs/superpowers/plans/2026-10-09-nprivacy-fatia-3-documentos.md`.

**Goal:** a ciência passa a apontar para a **versão do documento**: o pedido congela o texto vigente, publicar versão nova substitui o pedido aberto e a ciência antiga continua válida como "versão anterior"; o portal público `/politicas` lista os documentos vigentes e registra a ciência como prova (hash, IP, user-agent), e nada novo entra em `policy_acknowledgments` pelo portal.

## O que existe hoje (lido do código)

- `pedidos.tipo` aceita `'dpia' | 'politica'` (CHECK em `schema.sql`, migrations 0041/0042). `DOCUMENTOS` em `src/services/pedidos.ts` liga cada tipo a uma tabela e a colunas de conteúdo; `politica` aponta para `compliance_controls` (`title`, `description`). O hash do pedido é do conteúdo congelado; `conferirVigencia` marca o pedido `substituido` quando o hash do documento muda e cria outro, com os mesmos destinatários, todos pendentes; `registrarDecisao` confere o conteúdo **dentro do batch** (`intacto`).
- A prova é imutável por trigger (`pedido_prova_imutavel`, `pedido_dest_prova_imutavel`). `INSERT` de destinatário já decidido é permitido (os triggers são `BEFORE UPDATE`).
- O portal OTP (`src/routes/public.ts`, `frontend/public/politicas.js`) lista **todos** os controles e grava a ciência em `policy_acknowledgments` (sem versão, sem hash, e-mail e nome podem ser sobrescritos pelo corpo). Não passa por pedido nenhum. O `verify-otp` não limita tentativas de código.
- Não existe pedido de ciência "em pé" sem destinatário nem ciência aberta ligada a pedido.
- Em produção (medido em 09/10/2026): 0 pedidos de política, 0 ciências em `policy_acknowledgments`. Nada a migrar de prova; o risco é só de reconstruir a tabela `pedidos`.

## Decisões de desenho (rulings)

1. **`ref_id` do pedido de documento = `documentos.id`, não o id da versão.** O conteúdo congelado é `{ titulo, texto, numero }` da versão **vigente**. Assim publicar versão nova muda o hash e toda a máquina existente (substituição, aviso, conferência no batch) funciona sem mudar. Com `ref_id` = versão o hash nunca mudaria e o pedido nunca seria substituído.
2. **Só ciência (`ciente`) para `documento` nesta fatia.** A aprovação CISO/CEO continua nas colunas do controle e no pedido `tipo='politica'` (decisão adiada: a assinatura mora onde? ver "Gaps"). `pedidoCriarSchema` não ganha `documento`; só o lote de ciência.
3. **Contêiner do portal.** A ciência aberta (quem entra pelo portal com OTP, sem pedido prévio) é gravada como linha **já decidida** de `pedido_destinatarios` num pedido `ciente` "em pé" do documento (`criado_por = 'sistema:portal'`), achado ou criado na hora. É a mesma tabela e a mesma prova (`hash_lido`, IP, user-agent, `decidido_em`) dos demais canais, com `canal = 'portal'` (o CHECK é ampliado na migration). Ciência repetida do mesmo e-mail na mesma versão devolve a existente.
4. **Substituição não reenvia para quem veio do portal.** `conferirVigencia` copia para o pedido novo os destinatários de canal `conta`/`link`/pendentes e **não** os de canal `portal` (quem leu pelo portal revê a versão nova quando voltar; mandar link a toda pessoa que já passou pelo portal seria spam). O pedido novo sem destinatários continua sendo o contêiner.
5. **"Versão anterior".** O portal mostra, por documento, a ciência mais recente do e-mail: `atual` se o `numero` congelado é o da vigente, senão "versão anterior (n)". Nada de reescrever prova.
6. **`policy_acknowledgments` fica de leitura no portal.** `POST /public/policies/ack` deixa de gravar nela. O registro manual interno (`POST /projects/:id/policy-acknowledgments`, usado pela tela de Ciências) **continua** até a 3.4 trocar essa tela: é um gap declarado, não um esquecimento. Linhas antigas seguem legíveis ("ciência sem prova de versão") e anonimizáveis pelo direito do titular.
7. **Endurecimento junto:** o `verify-otp` passa a limitar tentativas (5 por código, mesmo molde de `rateLimitD1` do fluxo de link), e o `ack` deixa de aceitar nome/e-mail do corpo (valem os da sessão).
8. **Pedido `tipo='politica'` continua funcionando** (aprovação de política e ciência antiga). A tela de "Nova ciência por link" passa a oferecer documentos vigentes e a enviar `tipo='documento'`.
9. **Gatilhos de substituição:** depois de publicar (`POST .../publicar`) e depois de `gravarPolitica` espelhar uma versão, chama-se `conferirPedidosDoDocumento(c, 'documento', documentoId, projectId)`.
10. **Rollout em ordem:** 0050 → `importar` (cria os documentos das políticas existentes) → 0051 → deploy. Sem o `importar`, o portal lista vazio.

## Global Constraints

- Migration 0051 reconstrói `pedidos` e `pedido_destinatarios` no molde da 0042 (filha primeiro, RENAME, recriar **os dois** triggers e os cinco índices). **Parar e conferir antes se a produção divergir de `PRAGMA table_info(pedidos)`/`(pedido_destinatarios)` do `schema.sql`.**
- `schema.sql` e a migration mudam juntos; `test/schema-contract.test.ts`, `migration-0042.test.ts` e `migration-0043.test.ts` precisam continuar verdes.
- Banco real nos testes. Nada de dado real de cliente.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria; PR sem merge; migration em produção só com o "sim" do dono e `npm run db:backup` antes.

## Review Focus

1. A tabela `pedidos` reconstruída preserva todas as linhas, os destinatários (cascata não dispara), os índices e **os dois triggers** (a prova continua imutável).
2. Publicar versão nova substitui o pedido aberto do documento; a ciência da versão anterior continua gravada e aparece como "versão anterior".
3. Quem leu pelo portal não recebe e-mail na substituição.
4. Ciência do portal é prova completa (hash da versão lida, IP, user-agent, canal `portal`) e não é duplicada para o mesmo e-mail e versão.
5. O portal não lista controle sem documento, nem documento sem versão vigente, nem documento de outro projeto.
6. Nome e e-mail do corpo não sobrescrevem a sessão; sem sessão, 401.
7. `verify-otp` bloqueia depois de 5 códigos errados.
8. Registro manual interno em `policy_acknowledgments` segue funcionando (gap declarado).

## File Structure

| Arquivo | Papel |
|---|---|
| `migrations/0051_pedidos_documento.sql`, `schema.sql` | `tipo` ganha `documento`; `canal` ganha `portal` |
| `src/services/pedidos.ts` | `TipoPedido`, `Canal`, `DOCUMENTOS.documento`, `conferirVigencia` sem destinatários do portal, `registrarCienciaPortal` |
| `src/routes/pedidos.ts`, `src/schemas/domain.ts` | lote de ciência aceita `documento`; enums |
| `src/routes/documentos.ts`, `src/services/politica-escrita.ts` | gatilhos de substituição |
| `src/routes/public.ts` | `list` e `ack` do portal sobre documentos; limite de tentativas no `verify-otp` |
| `frontend/public/politicas.js` | portal: documentos, versão anterior, ack por `documento_id`; link: renderiza `documento` |
| `frontend/src/views/meus-pedidos.js` | "Nova ciência por link" oferece documentos vigentes |
| `test/migration-0051.test.ts`, `test/pedidos-documento.test.ts`, `test/portal-documentos.test.ts`, `frontend/test/…` | provas |

---

### Task 1: Migration 0051 e schema (TDD)

**Files:** Create `migrations/0051_pedidos_documento.sql`, `test/migration-0051.test.ts`; Modify `schema.sql`.

- [ ] **Step 1: Teste (vermelho).** No estilo de `test/migration-0042.test.ts`, sobre um banco com `pedidos` e `pedido_destinatarios` no formato da 0043 e linhas de exemplo (um `dpia`, uma `politica`, destinatários decididos e pendentes): depois da migration (a) todas as linhas e os valores de coluna continuam; (b) `INSERT` de `tipo='documento'` e de destinatário `canal='portal'` passam, e `tipo='outro'`/`canal='fax'` são recusados; (c) os dois triggers existem e abortam UPDATE de hash e de destinatário decidido; (d) os cinco índices existem (o do token continua único parcial); (e) apagar o pedido leva os destinatários (cascata); (f) a FK de `pedido_destinatarios` aponta para `pedidos` (e não para `pedidos_new`).
- [ ] **Step 2: Migration.** Copie o molde da 0042 trocando só os dois CHECKs (`tipo IN ('dpia','politica','documento')`, `canal IS NULL OR canal IN ('conta','link','portal')`), com as listas de colunas **completas** da tabela atual (inclui `token_expira_em` e `aberto_em`) e recriando `pedido_prova_imutavel` (a 0042 não precisava dele) e `pedido_dest_prova_imutavel` depois do `RENAME`.
- [ ] **Step 3: `schema.sql`.** Os mesmos dois CHECKs nos blocos de `pedidos` e `pedido_destinatarios`.
- [ ] **Step 4:** `npx vitest run test/migration-0051.test.ts test/migration-0042.test.ts test/migration-0043.test.ts test/schema-contract.test.ts` — Expected: PASS. Mutação: tire o `CREATE TRIGGER pedido_prova_imutavel` da migration e confirme que o teste (c) falha; restaure.
- [ ] **Step 5: Commit** `feat(pedidos): migration 0051 — tipo documento e canal portal`.

### Task 2: Pedido de documento no serviço (TDD)

**Files:** Modify `src/services/pedidos.ts`, `src/routes/pedidos.ts`, `src/routes/documentos.ts`, `src/services/politica-escrita.ts`, `src/schemas/domain.ts`; Create `test/pedidos-documento.test.ts`.

**Produz:** `TipoPedido` com `'documento'`; `Canal` com `'portal'`; `registrarCienciaPortal(db, a: { projectId, documentoId, nome, email, ip, ua }): Promise<{ ok: true; numero: number; hash: string; decididoEm: string; jaExistia: boolean } | { ok: false; status: 404 | 409; error: string }>`.

- [ ] **Step 1: Testes (vermelho)** em `test/pedidos-documento.test.ts` (platform_admin/consultor designado, `proj-a`, documento vigente criado por `POST /documentos` + `publicar`): (a) `POST /projects/:p/pedidos/ciencia` com `{ tipo: 'documento', ref_id, destinatarios }` cria o pedido com `conteudo_json = { titulo, texto, numero }` da vigente e links (com `RESEND_API_KEY` dublado como nos testes existentes); documento sem versão vigente ou de outro projeto: 404; (b) publicar a versão 2 troca o pedido aberto para `substituido`, nasce outro com `numero: 2` e os mesmos destinatários pendentes; (c) um destinatário que deu ciente por link na versão 1 continua `ciente` no pedido antigo (prova intacta) e fica `pendente` no novo; (d) `registrarDecisao` por link em pedido de documento cujo texto mudou antes de decidir não grava (conteúdo conferido no batch); (e) `registrarCienciaPortal` cria o pedido contêiner (`criado_por = 'sistema:portal'`) na primeira vez, grava destinatário `ciente` com `canal = 'portal'`, `hash_lido` igual ao hash do pedido, IP e user-agent; segunda chamada do mesmo e-mail e versão devolve `jaExistia: true` sem duplicar; (f) ao publicar a versão seguinte, o destinatário `portal` **não** é copiado para o pedido novo e nenhum e-mail sai para ele; o contêiner novo recebe a próxima ciência do portal; (g) `gravarPolitica` (edição humana do controle) que cria versão nova também substitui o pedido do documento; (h) o portal sempre registra a versão VIGENTE no momento do ack e devolve o `numero` registrado: se a vigente mudou entre listar e assinar, a ciência fica na versão nova (e o texto lido não é o que foi congelado, por isso a resposta traz o `numero` para a tela avisar).
- [ ] **Step 2: Implementar.**
  - `DOCUMENTOS.documento`: `tabela: "(SELECT d.id AS id, d.project_id AS project_id, d.titulo AS titulo, v.texto AS texto, v.numero AS numero FROM documentos d JOIN documento_versoes v ON v.documento_id = d.id AND v.estado = 'vigente')"`, `colunas: ['titulo','texto','numero']`, `titulo: (r) => 'Documento: ' + r.titulo`. `documentoAtual` e o `EXISTS` de `registrarDecisao` já funcionam com subselect (conferir que `documentoAtual` não usa alias que quebre).
  - `conferirVigencia`: a consulta dos destinatários a copiar passa a `WHERE pedido_id = ? AND COALESCE(canal, '') <> 'portal'`.
  - `registrarCienciaPortal`: lê o documento vigente (`documentoAtual`); acha o pedido `aberto` `ciente` do documento com `criado_por = 'sistema:portal'` (confere `conferirVigencia` antes; se substituiu, usa o novo) ou cria um sem destinatários; se já há destinatário com o mesmo e-mail (minúsculo) **decidido** nele, devolve `jaExistia`; senão insere a linha já decidida (`status='ciente'`, `canal='portal'`, `decidido_em`, `hash_lido`, `ip`, `user_agent`, `mfa_usado = 0`, `user_id` se houver conta ativa com o e-mail) no mesmo `batch` da criação do pedido, quando for o caso.
  - Gatilhos (decisão 9): no handler de publicar, depois de `publicarVersao` ok, `await conferirPedidosDoDocumento(c, 'documento', documentoId, projectId)`; em `gravarPolitica`, depois de `espelharTexto` com `criada: true`, o mesmo.
  - Zod: `pedidoCienciaLoteSchema.tipo` ganha `'documento'` (comentário da migration 0051 ao lado); `pedidoCriarSchema` não muda. Na rota `/ciencia`, `documento` não passa por `politicaVazia`.
- [ ] **Step 3:** `npx vitest run test/pedidos-documento.test.ts test/pedidos.test.ts test/pedidos-prova.test.ts test/pedidos-corrida.test.ts test/pedidos-autoridade.test.ts test/pedido-destinatario-autoridade.test.ts test/pedido-politica.test.ts test/pedidos-publico.test.ts test/politica-escritores.test.ts test/politica-agente.test.ts` — Expected: PASS. Mutações: (1) sem o filtro `canal <> 'portal'` o teste (f) falha; (2) sem o gatilho no publicar o teste (b) falha.
- [ ] **Step 4: Commit** `feat(pedidos): ciência por versão de documento e canal portal`.

### Task 3: Portal público sobre documentos (TDD)

**Files:** Modify `src/routes/public.ts`; Create `test/portal-documentos.test.ts`; Modify `test/public-otp.test.ts` e o que mais cobrir `list`/`ack` antigos.

- [ ] **Step 1: Testes (vermelho)** com sessão OTP real (fluxo `request-otp` → `verify-otp` como em `test/public-otp.test.ts`): (a) `GET /policies/list` devolve `documents: [{ id, tipo, titulo, numero, texto, ciencia }]` só dos documentos **com versão vigente** do projeto da sessão (controle sem documento, documento só com rascunho e documento de outro projeto não aparecem); `ciencia` é `null` sem ciência, `{ numero, em, atual: true }` depois do ack, `{ numero: 1, em, atual: false }` depois que a versão 2 é publicada; a resposta continua trazendo `legacy` com as linhas antigas de `policy_acknowledgments` do e-mail (somente leitura); (b) `POST /policies/ack` com `{ documento_id }` grava a ciência por `registrarCienciaPortal` e devolve `{ ok, numero, hash, acknowledged_at }`; repetir devolve a mesma, sem duplicar; (c) nome e e-mail no corpo são **ignorados**: `strict` no schema recusa campo extra com 400, e a ciência sai com os da sessão; (d) sem token ou com sessão vencida: 401; documento de outro projeto ou sem vigente: 404; (e) nada é inserido em `policy_acknowledgments` (contagem igual antes e depois); (f) `verify-otp`: o 6º código errado seguido responde 429 e o código certo depois disso também é recusado até pedir outro (o código é descartado após o limite); (g) trilha: `policy.acknowledged_public` agora cita o documento e a versão.
- [ ] **Step 2: Implementar** `list` e `ack` conforme as decisões 3, 5 e 7; novo schema `aceiteDeDocumentoSchema = z.object({ documento_id: z.string().min(1).max(100) }).strict()` em `src/schemas`; limite de tentativas com o mesmo `rateLimitD1` do fluxo de link (`pedido-otp:tentativa:`), chave própria `pol-otp:tentativa:<projeto>:<email>`, apagando o código da KV ao estourar.
- [ ] **Step 3:** Atualize os testes antigos do portal (`test/public-otp.test.ts` e quem mais chamar `/policies/list` ou `/policies/ack`) para o contrato novo, sem afrouxar nenhuma asserção de segurança. `npx vitest run test/portal-documentos.test.ts test/public-otp.test.ts test/data-subject.test.ts test/contrato-tela-api.test.ts test/openapi.test.ts` — Expected: PASS. `npm run openapi` se o contrato pedir.
- [ ] **Step 4: Commit** `feat(portal): portal de políticas lista documentos vigentes e registra ciência por versão`.

### Task 4: Telas (portal público e "Nova ciência por link")

**Files:** Modify `frontend/public/politicas.js` (e `politicas.html` se faltar elemento), `frontend/src/views/meus-pedidos.js`; Create `frontend/test/ciencia-documento.test.js`.

- [ ] **Step 1: Teste (vermelho)** para `meus-pedidos.js` no estilo de `frontend/test/pedido-politica.test.js`: `abrirCienciaLink` lista **documentos vigentes** (`GET /api/v1/projects/:p/documentos`, só com `versao_vigente`), e o envio manda `tipo: 'documento'` e `ref_id` = id do documento; `renderCienciaLink` mostra também os pedidos `tipo = 'documento'`; o texto do documento no modal de pedido é escapado.
- [ ] **Step 2: Implementar** em `meus-pedidos.js`. No portal (`politicas.js`): `state.controls` passa a ser montado a partir de `data.documents` (`title = titulo`, `description = texto`, `standard = tipo`), a ciência usa `ciencia` (`atual` → "Assinado"; `atual: false` → selo "Versão anterior (n)" e o botão de ciência fica disponível), o `POST` manda só `{ documento_id }`, e `conteudoLink` ganha o ramo `tipo === 'documento'` (`titulo` e `texto`, com `numero`). Tudo escapado (a página é pública).
- [ ] **Step 3:** como `politicas.js` é script clássico sem teste hoje, extraia a montagem do estado e o `escapeHTML` para o menor trecho testável **ou** cubra o contrato com `test/contrato-tela-api.test.ts` (as chamadas do portal precisam casar com rotas registradas) e registre no PR que o script do portal segue sem teste de unidade. Verificação manual no PR descrita em "Verificação".
- [ ] **Step 4:** `cd frontend && npx vitest run --pool=threads --maxWorkers=2`; `npx vite build`.
- [ ] **Step 5: Commit** `feat(telas): ciência de documento no portal e na tela de pedidos`.

### Task 5: Documentação e verificação final

- [ ] **Step 1:** `AGENTS.md` (pedidos: `tipo` ganha `documento`, `canal` ganha `portal`, contêiner do portal, contagens), `migrations/README.md` (seção 0051: reconstrução de tabela de prova, **pré-checagem de produção**, ordem 0050 → importar → 0051), `docs/retencao.md` (prova de ciência de documento não é purgada), `CHANGELOG.md` (Adicionado/Alterado), `docs/agente/` se o agente enxerga o portal. Contagens com os comandos do `AGENTS.md`.
- [ ] **Step 2:** `npx tsc --noEmit`; backend inteiro (`--maxWorkers=2`, em segundo plano se passar de 10 minutos, lendo resumo e código de saída); frontend e build; `sem-dado-de-cliente`.
- [ ] **Step 3: Commit, push, PR** sem merge. Migration 0051 e merge só com o "sim" do dono, com `npm run db:backup` antes, `PRAGMA table_info` de `pedidos` e `pedido_destinatarios` conferidos contra o `schema.sql`, e contagem de linhas antes e depois.

## Verificação manual (portal público)

Com o Worker local e um projeto com um documento vigente: abrir `/politicas?project=<id>`, pedir o código, entrar, ler, dar ciência (aparece "Assinado"), publicar versão nova pelo app e recarregar o portal (aparece "Versão anterior"); abrir um link pessoal de ciência de documento e conferir o texto escapado.

## Gaps declarados (não são desta fatia)

- **Aprovação CISO/CEO de documento:** continua nas colunas do controle e no pedido `politica`. Onde a assinatura mora quando o documento for a fonte (proposta: apontar para a versão) decide-se com a tela da 3.4.
- **Ciência manual interna** (`POST /projects/:id/policy-acknowledgments`, tela de Ciências): segue escrevendo em `policy_acknowledgments` até a 3.4.
- **`policy_acknowledgments` não vira read-only no banco** (trigger quebraria semeadura de teste e a anonimização do titular): a regra é de API.
- **`origem_control_id`** e o espelho no controle continuam até a aprovação mudar de lugar.
- **Portal sem teste de unidade** do script clássico `politicas.js` (decisão registrada na Task 4).

## Auto-revisão

- **Cobertura da spec 4.6 desta fatia:** ciência aponta para a versão; "versão anterior"; portal lista documentos vigentes; `policy_acknowledgments` sem escrita nova pelo portal. Fora, com dono: aprovação por versão e fim da ciência manual (3.4), exceções (3.5).
- **Risco principal:** reconstruir `pedidos`/`pedido_destinatarios`, que são prova. Mitigado por teste de preservação de linhas e triggers, por mutação, por pré-checagem de produção e porque hoje há 0 pedidos de política.
- **Placeholders:** nenhum; o comportamento está nos testes descritos e o SQL de `DOCUMENTOS.documento` está escrito.
- **Consistência de nomes:** `registrarCienciaPortal`, `criado_por = 'sistema:portal'`, `canal = 'portal'`, `aceiteDeDocumentoSchema` e o formato `documents[]` são os mesmos nas tarefas.
- **Limite honesto:** o código ainda não rodou; o mapa do portal e dos pedidos vem de leitura. O ponto mais incerto é a compatibilidade do subselect em `DOCUMENTOS.documento` com `documentoAtual` e `intacto`: o teste (a)/(d) da Task 2 é a primeira prova.
