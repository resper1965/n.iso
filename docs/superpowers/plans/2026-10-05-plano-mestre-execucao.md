# Plano mestre de execução — n.iso (retomada após reboot)

Escrito em 2026-10-05. Serve para retomar o trabalho do ponto exato, sem depender da memória de nenhuma sessão.
Quem lê (humano ou agente): leia esta página inteira antes de agir. Regra do repo (AGENTS.md): **não afirme sem evidência**
(mergeado = `git cat-file`; aplicado = `PRAGMA`; em produção = sonda na API viva e `/health`).

## 0. Objetivo do dono do produto

Terminar o n.iso inteiro, não só o acesso de stakeholders. Ordem acordada: (1) fechar a cadeia de stakeholders em produção;
(2) onda de higiene (dependabot, itens estacionados); (3) F3; (4) dívida estrutural T1–T6 em fatias; (5) F4 e F5.
Uma onda por vez, porque a máquina local é lenta (suítes de horas). Meta de sessão: `/goal termine todas as fatias`.

## 1. Estado verificado em 2026-10-05

Produção: `https://niso.ness.com.br`, `/health` devolve o SHA publicado.

| Fatia de stakeholders | Estado | Evidência |
|---|---|---|
| 1 papel `stakeholder`, convite, revogação | **em produção** | PR #254, `90e5d28` |
| 2 pedidos de aprovação (migration 0041) | **em produção** | PR #255, `b0b11f0`; `/health` = `b0b11f0`; `GET /api/v1/pedidos` sem sessão = 401 |
| 3 ciência em massa por link (migration 0042) | **mergeada** (PR #256, `4c95f2b`); migration 0042 **aplicada** em produção (colunas `aberto_em`, `token_expira_em` e trigger `pedido_dest_prova_imutavel` conferidos) | deploy e sonda ainda por conferir |
| 4 regras de autoridade | código pronto, revisada; branch `feat/autoridade-main` (base antiga) | sem PR |
| 5 prova imutável e auditor (migration 0043) | código pronto, revisada, corrigida; branch `feat/prova-auditor-main` (base antiga) | sem PR |

Antes disso, concluído e em produção: multiconsultoria, sistema de propostas (5 fatias), agente consultor, Conectar agente.
O administrador do primeiro cliente real foi cadastrado como `org_admin` (feito e verificado).

## 2. Próximos passos, em ordem (cadeia de stakeholders)

1. **Confirmar fatia 3 em produção:** `gh run list --workflow=deploy.yml --limit 1` com `conclusion=success` e `headSha=4c95f2b`;
   `curl -s https://niso.ness.com.br/health` com `version` = `4c95f2b…`; sonda: `POST /api/v1/public/pedidos/ver` com token falso
   deve dar 404 "Link inválido ou expirado".
2. **Rebasear a fatia 4** sobre `origin/main` (o #256 foi squash, os commits antigos conflitariam):
   no worktree `C:/Users/resper/worktrees/niso-sh4`:
   `git fetch origin && git checkout -b feat/autoridade-main2 && git rebase --onto origin/main feat/ciencia-link-main`
   (3 commits: e-mail da matriz sem caixa, regra única de quem pede/aprova, teste de segregação). Rodar `tsc` e
   `npx vitest run --maxWorkers=2 --testTimeout=120000`, publicar, abrir PR para `main`, esperar CI verde, mergear. Sem migration.
3. **Rebasear a fatia 5** sobre o `main` já com a fatia 4: worktree `.../niso-sh5`,
   `git rebase --onto origin/main feat/autoridade-main` (8 commits). Contém a **migration 0043** (trigger de `pedidos` imutável).
4. **Migration 0043:** `npm run db:backup` antes; aplicar da pasta que TEM o arquivo
   (`cd C:/Users/resper/worktrees/niso-sh5` e `npx wrangler d1 migrations apply niso-db --remote`, confirmar `y`);
   conferir `PRAGMA`/`sqlite_master` pelo trigger `pedido_prova_imutavel`. O deploy automático **recusa migration pendente**,
   então a ordem é: migration, depois merge.
5. **Mergear a fatia 5**, esperar o deploy, sonda: `GET /api/v1/auditor/<token falso>/pedidos` = 401.
6. Fechar: atualizar `AGENTS.md` e `CHANGELOG.md` com o que existe (a fatia 5 já editou; conferir contagem de tabelas: 58 em 05/10 por `sqlite_master` ao aplicar `schema.sql`), e registrar o estado final aqui.

## 3. Pegadinhas operacionais (já custaram horas)

- **Permissões:** o classificador do Claude Code negou `gh pr merge` e `wrangler d1 migrations apply` remotos várias vezes
  (motivos "Merge Without Review" / "Production Deploy"). Não contornar. Quem aplica migration é o dono, no terminal dele,
  **a partir da pasta com o arquivo** (no checkout principal, branch antigo, o `wrangler` diz "No migrations to apply" porque a pasta
  `migrations/` não tem o arquivo). Alternativa: regra de permissão no settings para `wrangler d1 migrations apply` e `gh pr merge`.
  Em 05/10 o merge de #255 e #256 passou depois que o dono aplicou a migration; tentar o merge e, se negado, parar e avisar.
- **Máquina saturada:** `npx vitest run --maxWorkers=2 --testTimeout=120000`; "Hook timed out" isolado = rodar o arquivo de novo.
  Comando longo vai para segundo plano; use Monitor com loop `until`, não `sleep` encadeado. Antes de um reboot nada precisa ser salvo
  além do que está no Git (ver §5).
- **Squash merge:** branches empilhadas precisam de `git rebase --onto origin/main <base-antiga>`; publicar com nome novo (sem force).
- **`schema.sql` no Windows:** nunca regravar por script em CRLF (quebra `test/migration-0040`); manter LF.
- **Node:** local 24, CI 22. `NODE_ENV=production` exige `npm ci --include=dev`. Frontend: `npm install --no-package-lock --include=dev`.
- **Trailer de commit:** `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (em alguns commits ficou `Opus 5.5`, pois foi o modelo
  que escreveu; não é bug). Branch sempre a partir de `origin/main`. Não repetir "feito"/"mergeado" sem a evidência.
- **Worktrees** (podem ser apagados depois do merge; Windows pode travar a pasta): `niso-sh1`, `niso-sh3`, `niso-sh4`, `niso-sh5`,
  `niso-stakeholders` (esta pasta de docs, branch `docs/acesso-stakeholders`), mais antigos `niso-fatia4`, `niso-conectar2`, `niso-ui`.
  O checkout principal está no branch antigo `docs/receita-agentes-mcp-remoto` com 3 arquivos soltos do dono
  (`.vscode/settings.json`, `.impeccable/`, `debug.log`): não tocar.

## 4. O que é do dono (nenhum agente pode fazer)

- **H2:** ligar o MFA na conta `platform_admin` do dono (cartão de perfil no rodapé da barra lateral; guardar códigos de recuperação fora do PC).
- Clicar em Catálogo > "Carregar catálogo inicial" e revisar diária e dias por faixa.
- **Teste de ponta a ponta de proposta:** Propostas > Nova proposta com um lead de teste > gerar > enviar ao próprio e-mail >
  abrir o link e aceitar. O agente só verifica por leitura (contrato, projeto, consultor, lead) e só remove os registros de teste com "sim".
- **F2:** confirmar o login OAuth do agente em Codex, Cursor e Antigravity.
- **H3/H4:** decidir o checkout principal (voltar para `main`, destino dos 3 arquivos soltos) e os 2 stashes antigos.
- **Decisão de produto:** a prova imutável (pedidos) conflita com o direito de eliminação do titular (`pedido_destinatarios` está fora de
  `FONTES_PII`, e o trigger impediria anonimizar a linha decidida). Registrada no CHANGELOG.
- **Jurídico:** termo de uso com advogado só quando uma consultoria de fora for contratar; conferência final do texto da ISO 27701 contra a norma comprada.

## 5. Onda 2 em diante (depois da cadeia) — itens do `docs/plano-2026-10-fechamento.md`

Dono agente, uma onda por vez, cada item com teste vermelho primeiro, PR, CI verde, revisão independente, sonda:

1. **Higiene:** ~13 PRs do dependabot (#190–#225; cuidado com #192 vitest 4→5 e #190/#196 zod); revisar um a um, mergear os seguros.
2. **Estacionados de stakeholders:** (a) e-mail em maiúsculas: criar conta com `CEO@x.com` casa com a linha da matriz `ceo@x.com`
   (seis pontos de criação em `auth.ts:131`, `governance.ts:231`, `organizacoes.ts:55`, `scim.ts:231`, `users.ts:176`, `sso.ts:358`;
   login compara com `email = ?` sensível a caixa; correção certa = normalizar criação e buscas, ou índice único `lower(email)` com migration);
   (b) convite reativa stakeholder desativado por SCIM/platform_admin; (c) corrida estreita login × revogação; (d) substituição de pedido
   de política só percebida ao abrir (ligar `substituirPedidosDoDocumento` aos 6 pontos de escrita de `policies.ts`/`controls.ts`);
   (e) pedido substituído nasce sem token para quem recebeu link (reenviar automático ou aviso); (f) envio de lote sem fila
   (200 e-mails em grupos de 5 dentro da requisição; fila se o provedor limitar).
3. **F3:** "último uso" do cartão de agentes atualiza sozinho.
4. **Dívida estrutural T1–T6:** `any` em `src/` (510, catraca), 4 testes que mockam o D1, 36 leituras de corpo sem schema, testes de frontend nas telas novas,
   PII em texto livre nos direitos do titular, testes que só falham na máquina local.
5. **F4:** o agente ler PDF e planilha (grande; depende da decisão D2 do dono). **F5:** regras de verificação normativa no `coherence_check`.
6. **Antigos do dono (§4)** continuam abertos até ele fechar.

## 6. Contexto que não se pode perder (conversa paralela e decisões)

- **Pergunta paralela do dono ("me conte um overview do projeto, onde estamos, o que falta, temos plano, próximos passos"):** respondida em 05/10;
  o conteúdo está nas seções 1, 2, 4 e 5 deste documento. Resumo: n.iso = plataforma de adequação ISO 27001/27701 da ness., Cloudflare Workers
  + D1; multiconsultoria, propostas e agente consultor em produção; stakeholders em fechamento; dívida e itens do dono listados acima.
- **Pedido do dono em 05/10:** "quero terminar o sistema, não seguir só com a implementação de clientes" e "faça um plano para executarmos
  tudo, persista para que eu possa liberar a máquina com um boot, mas não posso perder nenhum contexto, nem do side question". Este documento é a resposta.
- **Decisões de produto já tomadas (não reabrir):** sem i18n; um tema (escuro); sem framework no frontend; responsividade fora de escopo;
  stakeholder só vê o que foi atribuído a ele; prova registra a versão lida (hash SHA-256); MFA opcional, registrado na prova; acesso por conta
  (poucos, aprovam) e por link com código (muitos, só ciência); papel `stakeholder` com allow-list de caminhos; DELETE de prova não ganhou trigger
  (cascata de projeto precisa funcionar).
- **Modelo multi-org:** `orgDoUsuario`/`exigirOrg`; `X-Org-Id` só para `platform_admin`; consultor só alcança projeto da própria org e designado na matriz de Governança;
  `consultoria_admin` alcança todos os projetos da própria org. Teste de contrato: `test/contrato-isolamento-org.test.ts` (varre as rotas × todos os papéis).
- **Dados de produção:** só escrever com "sim" explícito do dono. Backup (`npm run db:backup` → `backups/niso-backup.sql`, local, não versionado) antes de migration.
- **Documentos:** spec `docs/superpowers/specs/2026-10-04-acesso-stakeholders-design.md`; plano das 5 fatias
  `docs/superpowers/plans/2026-10-04-acesso-stakeholders.md`; plano de fechamento `docs/plano-2026-10-fechamento.md`; este plano mestre.

## 7. Como retomar numa sessão nova (cole isto)

> Leia `docs/superpowers/plans/2026-10-05-plano-mestre-execucao.md` (branch `docs/acesso-stakeholders`) e continue do §2. Confirme cada fato com
> evidência (git, /health, wrangler) antes de afirmar. Use o `/goal termine todas as fatias` se quiser o hook de continuidade.

## 8. ESTADO FINAL da cadeia de stakeholders (2026-10-05) — CONCLUÍDA

Todas as 5 fatias estão em produção, cada uma conferida por `/health` e sonda na API viva:

| Fatia | PR | Commit em produção | Migration | Sonda |
|---|---|---|---|---|
| 1 papel, convite, revogação | #254 | `90e5d28` | — | rotas sem sessão = 401 |
| 2 pedidos de aprovação | #255 | `b0b11f0` | 0041 aplicada | `GET /api/v1/pedidos` sem sessão = 401 |
| 3 ciência por link | #256 | `4c95f2b` | 0042 aplicada | `POST /api/v1/public/pedidos/ver` token falso = 404 "Link inválido ou expirado" |
| 4 regras de autoridade | #257 | `419ef25` | — | `GET /api/v1/pedidos` sem sessão = 401 |
| 5 prova imutável + auditor | #258 | `68416ee` | 0043 aplicada (triggers `pedido_prova_imutavel` e `pedido_dest_prova_imutavel` conferidos em `sqlite_master`) | `GET /api/v1/auditor/<token falso>/pedidos` = 401; `/health` = `68416ee` |

Última migration em produção: 0043. Não restam migrations pendentes.

**Próximo:** §5 (Onda 2 em diante): dependabot, itens estacionados, F3, T1–T6, F4/F5; mais as pendências do dono (§4).
Os worktrees `niso-sh1..sh5` e as branches antigas podem ser apagados (`git worktree remove`, Windows pode travar a pasta).

## 9. ESTADO DA ONDA 2 (2026-10-06) — dependências e código

**Em produção (`/health` = `ed03ca7`), cada um conferido no SHA exato do CI e por sonda:**
T3 (#259, schemas de corpo: 36 leituras sem validação caíram para 7); estacionados de stakeholders (#261: e-mail sem caixa, convite só reativa revogado, política editada substitui pedido, link novo ao substituir); zod 4.5.4→4.6.5 (#262, com `docs/openapi.json` regenerado); T6 (#278, testes locais robustos); T1 (#279, catraca de `any` com TETO 569 em `test/any-catraca.test.ts`, mais correção de bytes de controle crus em `src/services/fechar-venda.ts`); dependabot: hono 4.13.11, fast-uri, undici, `@types/node`, `ip-address`, `@modelcontextprotocol/sdk` 1.32, `proxy-addr`, `source-map-js` (raiz e frontend), grupos de minor/patch (#265, #275 com `wrangler` e `@cloudflare/vitest-pool-workers` 0.22, `agents`, `hono`); `.github/dependabot.yml` agrupa patch/minor por diretório (#260) e ignora o que quebra (#273).

**Segurado de propósito (não mergear sem versão compatível ou decisão do dono):**
- vitest e `@vitest/*` major 5: `@cloudflare/vitest-pool-workers@0.22` não suporta (ERESOLVE no `npm ci`). Ignorado no `dependabot.yml`.
- `@modelcontextprotocol/server` 2.3: o pacote `agents` não aceita (ERESOLVE). Ignorado.
- **#277 TypeScript 5.9.3→7.0.2:** troca de compilador (major); CI estava verde mas sobre base antiga. Aguarda decisão do dono; se for segurar, acrescentar `typescript` major ao `ignore` do `dependabot.yml`.

**Lições operacionais desta onda:**
- CI do GitHub às vezes cancela job sem passo (`conclusion: cancelled`, 0 passos, ~15 min) por falta de runner: não é falha de código; repetir só o job (`gh run rerun <id> --failed`) quando a fila aliviar. Não reenviar em massa.
- Antes de mergear: ler os checks do SHA ATUAL do PR e `behind_by == 0`; cada merge desatualiza os demais (regra "branch atualizado"), então atualizar e mergear UM por vez.
- Não confiar em aviso de monitor antigo: ele pode ser de antes de um `update-branch`.
- Barra invertida some em heredoc/script: bytes de controle crus ficaram em `fechar-venda.ts` (corrigido no #279). Ao gerar código por script, montar escapes com `bytes([92])` ou conferir o resultado.
- `src/services/fechar-venda.ts` era tratado como binário pelo `git grep`; contagem de `any` agora 569 (comando em AGENTS.md).

**Falta de código:** T2 (4 testes que mockam o D1: `api`, `integration`, `mcp-integration`, `services-rag`; um arquivo por PR), T4 (testes de frontend das telas novas), T5 (PII em texto livre: pede desenho antes), F4 (ler PDF/planilha: decisão D2 do dono), F5 (espera uso real).

## 10. BLOQUEIO ATIVO (2026-10-06 ~07:30 UTC): GitHub Actions parado por cobrança

**Sintoma:** jobs `test`, `e2e`, `audit` e `deploy` falham em 3-4 s com 0 passos (`failure`, não `cancelled`).
**Causa (anotação do check-run):** "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings."
**Ação do dono:** GitHub > Settings > Billing & plans (corrigir pagamento ou aumentar o limite de gasto). Sem isso não há CI nem deploy. O agente NÃO pode resolver.
**Nota:** os cancelamentos de ~15 min vistos ao longo do dia (`cancelled`, 0 passos) provavelmente eram sintoma anterior do mesmo limite.

**Estado congelado nesse momento**
- Produção estável em `f80aa05` (`/health`). A `main` está em `221343d` (T4, #281): o deploy dele NÃO saiu; as correções de frontend do T4 (escape em `ai.js`, rótulos de papel em `admin.js`) ainda não chegaram aos usuários.
- #282 (`fix/vazamento-detail-erro`, SHA `e68bbcc`): vazamentos de erro (evidence, ropa, ai, integrations, lote de políticas), upload com `control_id` de outro projeto (era aceito com 201), DELETE de evidência com ordem banco->R2, catraca com TETO de any 566. Pronto; sem CI.
- Branch `fix/refs-entre-projetos` (HEAD `2ff1867`, worktree `niso-refs`): helper `refForaDoProjeto` em `src/helpers.ts` (risks, capa, governance, auditor, dpia/ropa_id), `setParcial` (PUT parcial não apaga campos), conserto de `updated_at` inexistente em `governance.ts` (criar não conformidade dava 500) e de opcionais ausentes (500 por `undefined`), JOIN de risks exige mesmo projeto. Revisado; sem PR ainda (abrir DEPOIS do #282 entrar, atualizando sobre a main).
- #277 (TypeScript 7.0.2): aguarda decisão do dono.

**Retomada (quando o dono disser "cobrança ok"):**
1. Reexecutar o deploy da `main` (`gh run rerun <id>`) para publicar o T4; sonda `/health` = `221343d`.
2. #282: `gh pr update-branch 282` se atrasado; esperar CI no SHA atual; mergear; esperar deploy; sondar.
3. Atualizar `fix/refs-entre-projetos` sobre a main, abrir PR, CI no SHA atual, mergear, deploy, sonda.
4. Item novo (segurança): `PUT` da DPIA aceita `status` no corpo => quem edita pode gravar `Approved` sem o fluxo de aprovação (senha + autoridade na matriz + segregação). Fechar: status só via rotas de aprovação (editar só `Draft`/`Under Review`). Mexe em `platform.ts` (mesmo arquivo do refs), então vem DEPOIS dele.
5. Varrer INSERT/UPDATE que citam colunas inexistentes no `schema.sql` (o `updated_at` de `governance.ts` só apareceu por acaso).

## 11. Estado em 2026-10-06 (fim do dia)

Conferido com `git log --oneline origin/main`, `gh run list --workflow=deploy.yml --limit 1` e
`curl -s https://niso.ness.com.br/health`.

- **Bloqueio da seção 10 resolvido.** O Actions voltou a rodar: o último deploy
  (`headSha 0ead858`, #290) terminou com `success`, e `/health` devolve
  `"version":"0ead8585a90943afd509bf3c6939f1862214a107"`.
- **Na `main` desde a seção 10:** #282 (vazamento de erro), #283 (referências entre projetos e
  PUT parcial), #284 (DPIA: status e catraca de colunas), #285 (ROPA: status), #286 (sai
  "Gerar SoA (IA)"), #287 (entrevista e código morto), #288 (DPIA: texto da tela e XSS de
  relatório), #289 (sai a vetorização e a tela Knowledge Base; `TETO` de `any` 558) e #290 (URL
  canônica `niso.ness.com.br`; hosts legados redirecionam com 308).
- **Arrumação final** (`docs/superpowers/plans/2026-10-06-arrumacao-final.md`): tarefas 1 a 8
  entregues pelos PRs acima (a 6 foi decidida como remoção, #289). As tarefas 9 (dados de
  cliente), 11 (documentação) e 12 (versão) estão na branch `chore/arrumacao-final`, num PR só.
  Faltam a 10 (higiene do GitHub), a 13 (reescrita do histórico, com o dono) e a 14 (fechamento:
  sonda final e aviso para tornar o repositório privado).
- **Do dono, ainda abertos:** H2 (MFA da conta `platform_admin`), catálogo inicial, teste de ponta
  a ponta de proposta, F2 (login OAuth em Codex, Cursor e Antigravity), environment `staging` e a
  variável `STAGING_ATIVO` (`docs/staging.md`), #277 (TypeScript 7), a tag da versão depois do
  merge deste PR.
