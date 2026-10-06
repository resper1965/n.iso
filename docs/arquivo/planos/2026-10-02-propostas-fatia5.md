# Sistema de propostas, fatia 5 (outras consultorias) — Plano de implementação

> **Arquivado em 2026-10-06:** executado em PR #253.

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`. Passos com `- [ ]`.

**Objetivo:** uma consultoria (ou um consultor avulso, que é "uma consultoria de um membro") contrata o n.iso, entra com o próprio administrador e trabalha nos próprios projetos, leads, propostas e catálogo, **sem enxergar nada de outra consultoria**. A ness. é a organização `org_ness` e fica como está. O `platform_admin` continua com acesso total (decisão do dono, 02/10/2026).

**Arquitetura:** `org_id` em `users` e `projects`; `orgDoUsuario` passa a ler a organização do usuário (na sessão, gravada no login); todo acesso de equipe (consultor, comercial, administrador da consultoria) é cortado por organização **antes** de qualquer outra regra; um papel novo, `consultoria_admin`, administra a organização; o `platform_admin` cria organizações e transfere projetos; um teste que percorre `app.routes` com duas organizações semeadas é a rede de proteção contra rota esquecida.

**Spec:** `docs/superpowers/specs/2026-10-02-sistema-de-propostas-design.md` §7, §8, §9. **Base:** fatias 1–4 em produção.

## Restrições globais

As do plano da fatia 4 (`docs/superpowers/plans/2026-10-02-propostas-fatia4.md`), mais: próxima migration **0040**; **todo implementador roda as duas suítes inteiras** (backend `npx vitest run --maxWorkers=2`, frontend `cd frontend && npx vitest run`) antes de entregar; qualquer rota nova entra em `src/openapi.ts` (se tem corpo) e é classificada nos testes que percorrem `app.routes` (`trilha-exclusao`, `contrato-isolamento-topo`, o novo de organização); **falha fechada**: em dúvida sobre a organização, nega.

## Decisões (rulings)

| Decisão | Por quê | Custo se errado |
|---|---|---|
| `users.org_id` e `projects.org_id`, `NOT NULL DEFAULT 'org_ness'`, sem `REFERENCES` (como nas tabelas comerciais) | `ALTER TABLE` não aceita FK com default; backfill automático: tudo o que existe hoje é da ness. | integridade só no código e no teste |
| Usuário de cliente (`org_admin`/`org_user`/`client`) segue preso ao projeto por `client_project_id`; a organização dele é a do projeto, não a do campo `users.org_id` | o cliente final não é "da consultoria"; o isolamento dele já é por projeto | — |
| Papel novo `consultoria_admin` (não reaproveitar `org_admin`, que é do CLIENTE) | `org_admin` já significa "administrador da empresa-cliente"; reusar causaria escalada | um papel a mais na lista |
| `orgDoUsuario(user)` = `user.org_id`; **sessão sem `org_id` (anterior ao deploy) = `org_ness`** só para papéis de equipe; clientes e papéis desconhecidos sem `org_id` → nega | todo usuário existente é da ness.; novos usuários só existem depois do deploy e já entram com `org_id` | sessão antiga de usuário que mudou de organização (não existe hoje) |
| `platform_admin` age em outra organização com o cabeçalho `X-Org-Id` (validado: a organização existe); sem o cabeçalho, age na `org_ness` | simples, explícito, auditável | esquecer o cabeçalho opera na ness. (o front do admin sempre o envia) |
| O consultor só alcança projeto se **(a)** `projects.org_id = users.org_id` **e** **(b)** está designado (D5). `consultoria_admin` alcança todos os projetos da organização, sem precisar de designação | designação continua valendo dentro da organização; o administrador precisa ver tudo da consultoria | administrador vê projeto que não atende |
| Logo: só PNG ou JPEG até 200 KB, conferido por bytes mágicos, guardado no R2 (`logos/<org>/<sha256>.<ext>`), embutido como `data:` URI no documento **na geração** (congela) | SVG aceito seria vetor de XSS; documento congelado não pode depender de URL que muda | consultoria só com SVG converte antes |
| Transferência de projeto: só `platform_admin`; muda `projects.org_id`, remove as designações da organização antiga, revoga concessões de agente do projeto, registra na trilha; não mexe nos usuários do cliente | spec §9 | consultor antigo perde acesso na hora (é o desejado) |
| Limites do plano (`organizations.max_projects`, `max_users`) valem ao criar projeto e usuário; estouro → 409 com mensagem | colunas já existem | org criada com limite baixo demais |
| Termo de uso da consultoria (declara o acesso administrativo da ness.) **fora do código**; o `platform_admin` registra a data de aceite ao criar a organização (`organizations.termo_aceito_em`, texto livre da versão) | pendência jurídica do spec §12 | campo sem o texto do termo |

## Review Focus

1. **Rota esquecida**: qualquer rota autenticada que devolva ou altere dado de outra organização (lista, por id, aninhada, agregada: dashboard, portfólio, notificações, busca, exportações, auditoria, MCP) → o teste de varredura de rotas precisa pegar.
2. **Escalada**: `consultoria_admin` criando usuário com papel `platform_admin` ou de outra organização; consultor mudando o próprio `org_id`; `X-Org-Id` enviado por quem não é `platform_admin` (deve ser ignorado ou 403, nunca obedecido).
3. **Sessões e papéis legados**: sessão sem `org_id`, papel desconhecido, `admin` legado (vira `platform_admin`), chave de API (`role: 'client'` + projeto), agente MCP.
4. **Designação cruzada**: e-mail da consultoria B na governança de projeto da A não dá acesso; `consultorDesignado` e `concessaoValida` do agente exigem a organização.
5. **Provisionamento**: criar organização duas vezes com o mesmo `slug`/prefixo; convite do administrador com e-mail já existente em outra organização.

---

### Tarefa 1: migration 0040 e contexto de organização

**Arquivos:** `schema.sql`, `migrations/0040_multiconsultoria.sql`, `test/migration-0040.test.ts`, `test/schema-contract.test.ts`, `migrations/README.md`, `src/services/organizacao.ts`, `src/routes/auth.ts` (login), `src/middleware/auth.ts`, `test/org-contexto.test.ts`.

- Colunas: `users.org_id TEXT NOT NULL DEFAULT 'org_ness'`, `projects.org_id TEXT NOT NULL DEFAULT 'org_ness'`, `organizations.termo_aceito_em DATETIME`, `organizations.termo_versao TEXT`, `organizations.logo_chave TEXT`; índices `idx_projects_org(org_id)` e `idx_users_org(org_id)`. Mesmo DDL em `schema.sql` e migration (sem `;` em comentário).
- `orgDoUsuario(user, cabecalhoOrg?)` conforme a tabela de decisões (retorna `string | null`; `null` = nega). `platform_admin` com `X-Org-Id` válido (a organização existe) usa a pedida. Login grava `org_id` no objeto de sessão; `/auth/me` e a sessão carregam o campo; clientes não precisam dele.
- [ ] Testes (RED antes): colunas e backfill (`org_ness`); `orgDoUsuario` por papel (consultor com `org_id`, sem `org_id` → `org_ness`, cliente sem `org_id` → `null`, `platform_admin` com e sem cabeçalho, cabeçalho de quem não é `platform_admin` ignorado); login de um usuário de outra organização devolve `org_id` na sessão. Mutação: ignorar o `org_id` da sessão → cai.
- [ ] Confirmar por leitura em produção que as colunas não existem. Suíte inteira. Commit.

### Tarefa 2: cortar tudo por organização

**Arquivos:** `src/helpers.ts` (`PROJETOS_DO_CONSULTOR_SQL`, `consultorDesignado`, `consultorAlcanca`, `requireProjectAccess`, `requireResourceAccess`, `projetosVisiveis`), `src/middleware/agente.ts` (`concessaoValida`), `src/routes/{projects,users,leads,assessments,propostas,servicos,organizacao,platform,controls,governance,ai}.ts` e qualquer outra rota que o mapeamento achar; testes.

- [ ] **Mapear primeiro** (relatório): `grep -rn "FROM projects\|FROM leads\|FROM assessments\|FROM users\|FROM propostas\|FROM contracts" src` e cada ponto onde equipe lê dado de mais de um projeto/lead; tabela ponto → decisão.
- [ ] Projeto: `consultorDesignado` e a SQL de projetos visíveis ganham `JOIN projects p ... AND p.org_id = ?`; `consultoria_admin` alcança qualquer projeto com `org_id` igual ao dele; `platform_admin` todos. `requireResourceAccess` confere o `org_id` do projeto do recurso. `concessaoValida` do agente exige `projects.org_id = users.org_id` da concessão.
- [ ] Listas e agregados (`GET /projects`, `/portfolio`, `/controls`, `/dashboard`, `/dashboard/stats`, notificações de equipe, busca) escopados pela organização.
- [ ] Usuários: `GET/POST/PUT/DELETE /users` da equipe só enxerga e cria usuários da própria organização; criar usuário grava `org_id` do criador; `consultoria_admin` não cria `platform_admin`, `consultoria_admin` de outra organização nem usuário em outra organização; consultor comum não gerencia usuários (como hoje).
- [ ] Leads, assessments, propostas, serviços, contratos: TODAS as rotas (inclusive PUT/DELETE/enrich/answers/pricing/generate/convert) filtram por `org_id` e gravam `org_id` nos INSERT; as rotas públicas por token do levantamento resolvem a organização do próprio assessment.
- [ ] Testes (RED antes): para cada grupo, semear a organização `org_b` com projeto, lead, assessment, proposta, serviço e usuário; consultor de `org_ness` recebe 404/403 em todos e não os vê nas listas; `consultoria_admin` de `org_b` vê todos os projetos de `org_b` e nenhum da ness.; `platform_admin` vê os dois; `X-Org-Id` de quem não é `platform_admin` é ignorado; designação cruzada não dá acesso; o agente de uma concessão de `org_b` em projeto de `org_ness` é recusado (401). Mutação: tirar o filtro de organização de `GET /projects` → cai.
- [ ] Suítes inteiras. Commit (pode ser mais de um, por área).

### Tarefa 3: a rede de proteção (teste que percorre as rotas)

**Arquivo:** `test/contrato-isolamento-org.test.ts` (modelo: `test/contrato-isolamento-topo.test.ts`, que já percorre `app.routes`).

- [ ] Semear duas organizações completas (como acima, com os registros de TODAS as tabelas com `org_id` e as de projeto, usando o semeador genérico do teste existente quando servir). Para cada rota autenticada (GET/PUT/POST/DELETE) cujo caminho tem parâmetro de id, forjar o caminho com o id **da outra organização** e exigir resposta ≥ 400 e < 500 (nunca 2xx, nunca 5xx), como um consultor e como um `consultoria_admin` da organização errada. Lista de exceções explícita e justificada (rotas globais sem recurso por id: login, saúde, públicas por token).
- [ ] Rotas que devolvem listas: o teste verifica que o corpo não contém nenhum id da organização alheia (varrer o JSON). Rota nova sem classificação **falha o teste** (como `trilha-exclusao`).
- [ ] Mutação: remover o filtro de uma rota de `servicos` → o teste aponta a rota. Suítes inteiras. Commit.

### Tarefa 4: papel `consultoria_admin` e provisionamento de organizações

**Arquivos:** `src/routes/platform.ts` (ou `src/routes/organizacoes.ts` montado em `/api/v1/platform/orgs`), `src/routes/organizacao.ts`, `src/helpers.ts` (guardas), `src/schemas/domain.ts`, `src/openapi.ts`, `src/middleware/agente.ts`, testes.

- [ ] `POST /api/v1/platform/orgs` (só `platform_admin`): `{nome, slug, prefixoProposta, cnpj?, adminEmail, adminNome, maxProjetos, maxUsuarios, termoVersao}`; cria a organização com a configuração padrão (a mesma de uma organização nova da fatia 1, sem termos: o administrador escreve os dele) e **um usuário `consultoria_admin`** com `org_id` novo e `requires_password_change`, enviando o convite pelo fluxo de primeiro acesso existente (leia `users.ts`: o e-mail de boas-vindas e a senha provisória; reaproveite, não reinvente); `slug` e prefixo únicos (409); e-mail do administrador já existente → 409; grava `termo_aceito_em` e `termo_versao`; trilha `org.criada`. `GET /platform/orgs` (lista com contagens: projetos, usuários, propostas, nunca conteúdo) e `PUT /platform/orgs/:id` (limites, status `Active`/`Suspended`). Organização `Suspended` não autentica equipe nova e devolve 403 nas rotas de equipe.
- [ ] `consultoria_admin` ganha: `PUT /api/v1/org/config` e `POST /api/v1/servicos/semear-padrao` e aprovar desconto (hoje só `platform_admin`), gestão de usuários da própria organização, designar consultores nos projetos da organização; nada de `/platform/*`. Atualize as guardas (`ehAdminDaOrg(user, orgId)`): uma função única, testada.
- [ ] Limites: criar projeto ou usuário além de `max_projects`/`max_users` → 409 com mensagem.
- [ ] Testes: criação completa (organização + admin + convite enviado, mock do e-mail); duplicidade; `consultoria_admin` não acessa `/platform/*` (403) nem outra organização; `Suspended` bloqueia; limites; `consultoria_admin` não eleva papel nem muda `org_id` de ninguém. `FORA_DO_AGENTE` cobre `/api/v1/platform`. Mutação: aceitar `platform_admin` no corpo de criação de usuário por `consultoria_admin` → cai. Suítes inteiras. Commit.

### Tarefa 5: transferência de projeto para o cliente

**Arquivos:** `src/routes/platform.ts`, `src/services/transferencia-projeto.ts`, testes.

- [ ] `POST /api/v1/platform/projects/:id/transferir` `{orgDestinoId, motivo}` (só `platform_admin`; motivo 5–500): em **um `db.batch`**: `projects.org_id = destino`; remove de `project_governance` as linhas `role_category='consultor'` cujo e-mail pertence a usuário da organização de origem; revoga `agente_concessoes` do projeto (`revogado_em`, `revogado_por`); a trilha (`projeto.transferido` com origem, destino e motivo, projeto no `project_id`) vai no mesmo batch; propostas e contratos ligados ao projeto **não** se movem (ficam com a consultoria que vendeu). Destino inexistente/`Suspended` ou igual à origem → 404/409.
- [ ] Testes: o consultor da origem perde o acesso na requisição seguinte (404/403); o `consultoria_admin` do destino ganha; agente da origem → 401; usuários do cliente seguem entrando; trilha com os três campos; atomicidade (trigger `RAISE(ABORT)` → nada muda); idempotência (segunda chamada igual origem → 409). Mutação: esquecer a revogação dos agentes → cai. Suítes inteiras. Commit.

### Tarefa 6: logo da organização

**Arquivos:** `src/routes/organizacao.ts`, `src/services/documento-proposta.ts` (e `documento-docx.ts`), `src/index.ts` (binding R2: confirmar o nome do binding de `wrangler.jsonc`), testes.

- [ ] `POST /api/v1/org/logo` (corpo binário, `Content-Type: image/png|image/jpeg`; ≤ 200 KB; conferir bytes mágicos `89 50 4E 47` / `FF D8 FF`; recusa o resto com 400; só `consultoria_admin` e `platform_admin`), guarda no R2 `logos/<org>/<sha256>.<ext>`, atualiza `organizations.logo_chave`; `DELETE` não: só substituir. `GET /api/v1/org/logo` (equipe da organização) devolve a imagem com `Content-Type` fixo e `Cache-Control: private`.
- [ ] Na GERAÇÃO da proposta (rota `gerar`), lê o logo e o embute como `data:` URI em `ConteudoDocumento.org.logo` (somente PNG/JPEG, já validados); `renderizarHtml` e `renderizarDocx` usam o logo quando houver (no HTML: `<img alt="Nome da organização">` com `src` `data:image/(png|jpeg);base64,` validado por regex; sem logo, o nome em texto). O documento continua congelado: trocar o logo depois não muda proposta gerada.
- [ ] Testes: SVG disfarçado de PNG (extensão/tipo certo, bytes errados) → 400; 201 KB → 400; PNG válido → grava e o documento gerado contém o `data:` URI e não referencia URL externa; trocar o logo não muda o HTML nem o hash de proposta já gerada; consultor comum → 403; outra organização não lê o logo. Mutação: aceitar `image/svg+xml` → cai. Suítes inteiras. Commit.

### Tarefa 7: funil e métricas

**Arquivos:** `src/routes/leads.ts`, `src/routes/propostas.ts` (ou `src/routes/funil.ts`), `frontend/src/views/commercial.js`, testes.

- [ ] Status de lead validados no servidor: `PUT /leads/:id/status` só aceita as transições `New → Assessment → Proposal → Won|Lost` e `Assessment|Proposal → Lost`, e `Lost → New` (reabrir); qualquer outra → 409; trilha `lead.status` com origem e destino; `fecharVenda` e a recusa continuam passando (já gravam `Won`/`Lost`).
- [ ] `GET /api/v1/funil?de=&ate=` (comercial e `consultoria_admin`; da organização): contagem de leads por status, **conversão** por etapa (lead→proposta gerada→enviada→aceita), valor em pipeline (projeto e mensalidade separados), tempo médio de ciclo (lead criado → aceita), motivos de perda (agrupados), propostas por status. Datas em Brasília. Consultor não vê (preço).
- [ ] Frontend: o cartão de leads do `commercial.js` usava status que não casavam com o banco (contagem sempre 0): corrigir para os valores reais e mostrar o funil (cartões + tabela simples), sem gráfico novo.
- [ ] Testes: transições válidas e inválidas; métricas com dados semeados (valores exatos); outra organização não entra na conta; consultor 403; front: cartões com contagem certa. Mutação: aceitar `Won → New` → cai. Suítes inteiras. Commit.

### Tarefa 8: telas de administração

**Arquivos:** `frontend/src/views/organizacoes.js` (nova, só `platform_admin`), ajustes em `config-comercial.js`, `catalogo.js`, `frontend/src/router.js`, `frontend/login.html` (menu), `frontend/src/api.js` (cabeçalho `X-Org-Id`), `frontend/src/style.css`, testes.

- [ ] Tela **Organizações** (`platform_admin`): lista (nome, plano, projetos/usuários usados de quanto, status), "Nova organização" (formulário do `POST /platform/orgs`, termo de uso com a versão), editar limites e suspender; "Transferir projeto" (escolher projeto e organização de destino, motivo obrigatório, confirmação na tela mostrando o que acontece).
- [ ] Seletor de organização no cabeçalho do `platform_admin` (guarda a escolhida e envia `X-Org-Id`; padrão `org_ness`; aviso visível quando atuando em outra); `consultoria_admin` vê Configuração comercial, Catálogo, Usuários e Funil da própria organização, com os botões de gravação habilitados; logo: envio com pré-visualização e as regras (PNG/JPEG, 200 KB).
- [ ] Testes (jsdom, `fetch` mockado): telas por papel (quem vê o quê), o cabeçalho `X-Org-Id` só quando `platform_admin` escolheu outra organização, erros do servidor por campo, nada inline. Guarda de CSS. Captura com `playwright-core` das telas novas, olhada e descrita. Suítes inteiras. Commit.

### Fechamento da fatia 5

- [ ] CHANGELOG, `SECURITY.md` e `docs/agente/seguranca.md` (invariante: equipe só alcança a própria organização), `AGENTS.md` (modelo de organização). PR; CI verde; **revisão final independente** (modelo mais capaz) com atenção ao Review Focus; uma rodada de correção.
- [ ] Antes do merge, com a autorização do usuário já dada no `/goal`: backup, `migrations apply` (0040), `migrations list` limpo, merge, `/health` estável.
- [ ] Verificação em produção **sem dado real e sem criar organização de verdade**: sondas sem sessão (401); leitura de que `users.org_id` e `projects.org_id` ficaram `org_ness` para todos os registros existentes (`SELECT COUNT(*) ... WHERE org_id <> 'org_ness'` = 0); os consultores existentes continuam alcançando os mesmos projetos (comparar a contagem de designações de antes com `SELECT` por organização).
- [ ] Entregar ao usuário: como criar a primeira consultoria (tela Organizações), o que ainda é dele (termo de uso, revisão do texto jurídico, convite real do primeiro administrador).
