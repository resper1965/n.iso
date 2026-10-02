# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento [SemVer](https://semver.org/lang/pt-BR/).

> **Sobre a lacuna entre 8.0.0 e 8.1.0.** Este arquivo parou em 2026-07-03 e
> ficou dois meses sem entrada, enquanto ~60 PRs entravam na `main` — inclusive
> correções de segurança. As versões abaixo foram reconstruídas do histórico do
> git, agrupadas por tema, e as datas são as dos commits. Retomar o changelog é
> o item 0.3 do `enterprise-grade-plan.md`; a lacuna fica registrada em vez de
> apagada.

## [Não publicado]

### Changed
- **Aprovar proposta e Converter levantamento deixaram de criar projeto: o projeto nasce do aceite da proposta.** `POST /assessments/:id/convert` e `PUT /proposals/:id` com `status: Signed` respondem 410, `POST /proposals/:id/sign` saiu, e os botões "Converter para Projeto", "Aprovar" e o antigo "Gerar proposta" da tela de levantamentos foram removidos (a tela Propostas cobre o caminho).
- **"Conectar agente" passa a instruir o que travou um consultor de verdade (01/10/2026).** O comando do Claude Code leva `--scope user` (o padrão `local` prende o servidor à pasta e ele some em sessão sem pasta); a aba diz como instalar o `claude` quando o terminal não o reconhece (comum com o app desktop); explica que "Needs authentication" é o estado esperado e que o login é pelo `/mcp`, feito pelo consultor e não pelo agente da sessão; e traz `claude mcp list` e `claude mcp remove niso -s user` para conferir e refazer. Só o Claude Code ganha essas linhas: os outros clientes seguem "A confirmar".
- **Tela "Conectar agente" em duas colunas.** À esquerda, o cliente em abas com o comando e os três passos em lista compacta; à direita, "O que o agente faz", fixo ao rolar. O endereço do servidor aparece uma vez só, dentro do comando (antes repetia numa faixa própria), e a tela usa a largura disponível em vez de ficar encostada à esquerda. Abaixo de 1100px empilha.

### Added
- **Proposta comercial (02/10/2026).** O comercial monta a proposta a partir de um lead, com ou sem diagnóstico, escolhendo serviços do catálogo: preço por dias × diária × porte (projeto e avulso) ou mensalidade × meses (recorrente), memória de cálculo e margem visíveis só ao comercial, desconto acima do teto aguardando aprovação do `platform_admin`. As seções de texto podem ser reescritas por proposta; tabelas e lista de serviços seguem automáticas. Ao gerar, o número é reservado (sequência da organização ou manual sem repetir), o documento completo é congelado com hash e sai para impressão/PDF e como cópia de trabalho em Word. Revisões mantêm o número (`rev. 2`). Os termos revisados pelo dono são os termos iniciais da ness.
- **Referências da ISO 27701 nas lacunas corrigidas.** A lacuna de RoPA citava controles de consentimento (A.1.2.4, A.1.3.5) e a de direitos do titular citava o A.8.8 da 27001; agora citam A.1.2.9/A.1.2.2/A.1.2.3 e A.1.3.2/A.1.3.7/A.1.3.10, com o artigo da LGPD. Um teste confere todo código citado contra o catálogo da 27701:2025.
- **Catálogo de serviços (02/10/2026).** Cada organização cadastra o que vende em `/api/v1/servicos`: projeto (fases que somam 100% e dias por faixa), avulso (valor fixo ou dias) e recorrente (mensalidade e prazo mínimo). Serviço é arquivado, nunca apagado. O catálogo inicial da ness. sai do motor de preço atual (`POST /api/v1/servicos/semear-padrao`). Telas novas: Configuração comercial (o comercial lê, o `platform_admin` grava) e Catálogo.
- **Organização comercial (02/10/2026).** Configuração de identidade, numeração, preço e textos por organização (`GET/PUT /api/v1/org/config`); a ness. é a organização `org_ness`.
- **Trocar a própria senha pelo cartão de perfil (F7).** O menu da conta ganha "Trocar senha": modal com senha atual, nova e confirmação, erro junto do campo, e a política de senha nova vem do servidor (a mesma do primeiro acesso). "Senha atual incorreta" volta como 401 e não derruba a sessão: `/auth/change-password` entrou na isenção de logout automático do `api.js`, ao lado de `/auth/mfa/*`. Correção no servidor achada no caminho: `POST /auth/change-password` não invalidava as outras sessões do usuário (só revogava agentes); agora invalida todas as emitidas antes e mantém a atual, como o primeiro acesso já fazia.
- **O humano desaprova pela interface; o agente não (F6, decisão D1).** `platform_admin` e o administrador do cliente revogam a aprovação de ROPA (por papel) e de DPIA, com motivo obrigatório (mínimo de 5 caracteres) que vai para a trilha com o projeto (`ropa.approval_revoked`, `dpia.approval_revoked`), e excluem análise crítica (`management_review.deleted`, além do `registro.excluido` central). Consultor e usuário comum levam 403. O agente também: as três rotas entram na lista de fora do alcance, mesmo com confirmação. A limpeza da Twyn precisou de SQL justamente por essa lacuna.
- **Agente consultor por MCP remoto (`/mcp`, #212 e #213).** O consultor conecta o Claude Code, o Codex, o Cursor ou o Antigravity ao n.iso, entra com a própria conta (senha e segundo fator) e escolhe um cliente — sem chave de API e sem instalar nada. OAuth 2.1 pela `@cloudflare/workers-oauth-provider`, tela de autorização própria, concessão por projeto (`agente_concessoes`, migration 0034) revalidada a cada chamada, e o cartão "Agentes com acesso" na Governança para o cliente ver e revogar. O agente não tem API própria: chama as rotas de sempre, com um principal que herda o isolamento de tenant. Guia completo em `docs/agente/`.
- **O agente ganha o alcance do consultor humano, preso a um projeto (#221).** `niso_ler` (qualquer leitura) e `niso_executar` (escrita) alcançam o que o consultor alcança naquele projeto; `niso_contexto` traz o mapa da app e quatro roteiros. Apagar, gerar políticas em lote, eliminar dados de titular e revogar aprovações exigem confirmação **imposta no servidor** e deixam trilha com o projeto (`agente.exclusao`). São 25 ferramentas visíveis ao agente. Antes ele só lia uma fração da app e não apagava nada, o que fez o consultor depender do administrador para limpar registros que o próprio agente criou.
- **`niso_update_risk` (#220).** Edição parcial de risco: lê o atual, troca só o pedido e reenvia o registro inteiro, porque o `PUT` da API substitui tudo. O aceite de risco (`accepted_by`, `accepted_at`) é decisão da direção e o agente não o altera.
- **Skill de prontidão para certificação servida pelo MCP (#223).** A pré-avaliação de Stage 1 e Stage 2 (ISO 27001:2022 e 27701:2025) vira o roteiro 4, entregue por `niso_skill` atrás do login: sem instalação e sem arquivo público. A fonte é `agent-skills/`; `npm run skills:gerar` escreve o módulo embutido e `test/agente-skills.test.ts` falha se ele ficar velho. Só lê: nenhum achado vai para a n.iso, e não substitui a auditoria interna (9.2).
- **Papel `comercial` (#211)** e a área comercial restrita a `platform_admin` e `comercial` (#209).
- **Governança (#217).** Organograma restaurado (o #168 tinha apagado as regras `org-*` do CSS), líder do SGSI único por projeto e cartão de agentes com acesso.
- **Tela de entrada com o login na primeira dobra e domínio `niso.ness.com.br` (#207, #208).**
- **E-mails saem de `n.iso <noreply@ness.com.br>` (#218).** Nenhum e-mail saía: o Resend recusava o remetente do domínio não verificado e a tela respondia "enviado" mesmo assim.

### Fixed
- **`management_reviews` igual em produção e em banco novo (F10).** Produção tinha `ciso_signed_by/at/ip` e `ceo_signed_by/at/ip` que `schema.sql` e as migrations não declaravam. Agora o `schema.sql` as traz e a migration 0035 as adiciona a bancos antigos; em produção ela só é registrada em `d1_migrations`, nunca executada (as colunas já existem). Teste de contrato em `test/schema-contract.test.ts` e `test/migration-0035.test.ts`.
- **A aprovação de DPIA grava o papel que assinou (F9).** A rota `POST /projects/:id/dpia/:assessmentId/approve` ignorava o `role` e gravava só `dpo_approved_by/at`: o botão "Assinar" nunca sumia e a Direção não conseguia assinar. Agora o corpo exige `role` (`ciso` ou `ceo`, 400 se faltar), a autoridade sai da matriz de governança do projeto como na ROPA (403 sem ela), `ciso` grava `dpo_signature` e `dpo_approved_by/at`, `ceo` grava `ceo_signature`, e o status só vira `Approved` com as duas assinaturas. A trilha `dpia.approved` registra o papel e o projeto. Contrato em `docs/openapi.json`.
- **`gap-analysis` respondia 404 (#220).** A rota se perdeu na decomposição do `index.ts` (72f1b59) e a ferramenta do agente e o modal da interface ficaram sem resposta. Volta em snake_case, sem contar controle "não aplicável" como lacuna nem no denominador da cobertura.
- **`traceability` e `coherence` davam 500 com mais de 100 controles (#220).** Um `?` por controle passa do teto de 100 parâmetros do D1; trocado por subconsulta por projeto.
- **O cartão "Agentes com acesso" atualiza sozinho e mostra o horário local (F3).** O "último uso" é o único sinal de leitura do agente e só mudava se a página fosse recarregada, o que fez parecer que o agente tinha parado. Agora o cartão se atualiza a cada 60 s enquanto a Governança estiver aberta: para sozinho ao sair da tela, não consulta com a aba em segundo plano, atualiza na hora ao voltar a ela, não empilha temporizadores ao re-renderizar, e uma falha de rede num ciclo não apaga o cartão. As datas vinham do banco em UTC e eram mostradas cruas (apareciam como 20:49 quando eram 17:49 no relógio de quem olhava): passam para o horário local, com "há N min" no último uso e "nunca" quando o agente não foi usado. `frontend/test/agentes-ao-vivo.test.js` (9 casos, com duas mutações conferidas; uma delas pegou um teste que era decorativo).
- **Tela "Conectar agente" rediagramada.** Uma ideia por faixa: o endereço do servidor com o aviso de que o login define quem é o agente, três passos, **um cliente por vez em abas** (acessíveis: `tablist`, tabindex móvel, setas, Home e End dão a volta e o foco acompanha) e o alcance do agente em quatro blocos, com o "sim" em destaque. No lugar dos quatro cartões repetidos, cada cliente tem o seu painel, com o estado dele ("Exercitado em produção em 30/09/2026" ou "o login ainda não foi confirmado"). CSS próprio (`ca-*`) sobre os tokens do produto; `frontend/test/conectar-agente-css.test.js` reprova classe sem regra, o que o jsdom não pega. Conferida em navegador (Edge, 1440 px): sem estouro horizontal, foco por Tab com contorno de 2 px, copiar põe o trecho do cliente da aba na área de transferência.
- **Tela "Conectar agente" refeita.** Diz que o **login** define quem é o agente e em qual cliente ele atua (ele age em nome de você, e a trilha registra o seu e-mail), mostra o que o agente lê, grava, o que pede o seu "sim" (apagar, lote, eliminar titular, revogar aprovações) e o que não faz, e marca "Verificado" **só** o Claude Code, o único exercitado em produção; Cursor, Codex e Antigravity ficam "A confirmar". O Codex mostra os dois comandos, o de adicionar e o de login. "Copiado" só aparece depois que a área de transferência aceitou; se recusar, a tela diz que falhou. `frontend/test/conectar-agente.test.js` (8 casos, com mutação conferida).
- **Toda exclusão deixa trilha, com autor e projeto (`registro.excluido`).** De 20 rotas `DELETE`, 10 não gravavam trilha nenhuma (parte interessada, achado de auditoria, métrica, webhook, chave de API, lead, risco, SCIM, treinamento, fornecedor) e 6 gravavam sem o projeto, de modo que a exclusão não aparecia na trilha filtrada pelo cliente. Em vez de corrigir handler por handler, o `authMiddleware` registra todo `DELETE` bem-sucedido, resolvendo o projeto **antes** de o handler apagar a linha (`src/trilha-exclusao.ts`). Os handlers que já gravavam seu texto continuam gravando; a linha central é a uniforme. O agente segue com `agente.acao_destrutiva`, sem linha duplicada. `test/trilha-exclusao.test.ts` enumera as rotas do roteador e reprova um `DELETE` novo que não esteja classificado.
- **Agente revogado ouvia 403, e não 401, nas rotas proibidas.** A lista de proibidas vinha antes da revalidação da concessão, então o agente revogado não sabia que precisava reconectar. A concessão agora é a primeira checagem (`resolverAgente`).
- **Tela de consentimento do agente sem projeto pré-marcado.** O primeiro da lista vinha marcado: um tenant que se nomeasse para ordenar primeiro faria um consultor apressado conectar o agente ao projeto errado. Agora a escolha é explícita e obrigatória.
- **A mensagem do caminho recusado deixa de falar em "id com caractere inválido"** quando o problema é o prefixo: agora diz que o caminho deve começar com `/api/v1/`.
- **`agente.exclusao` → `agente.acao_destrutiva`.** O rótulo também marcava lote, eliminação de titular e revogação de aprovação, que não são exclusões. Linhas gravadas antes de 01/10/2026 mantêm o rótulo antigo.
- **O progresso do checklist não persistia (`PUT /projects/:id/checklist-progress`).** A rota se perdeu na mesma decomposição do `index.ts` (72f1b59) que levou o `gap-analysis`. A tela (`saveChecklistItemMetadata`) seguia chamando e engolia o 404 num `console.error`: marcação, nota, responsável e prazo de cada item não eram gravados, sem nenhum aviso. A rota volta com validação (até 500 itens, fases 0 a 40), evidência vinculada só do próprio projeto, autoria que não quebra com chave de API (`checked_by` referencia `users`) e trilha com o projeto. O mapa da app do agente passa a dizer como editar governança, partes interessadas e checklist.
- **`GET /interviews/summary` nunca respondia (#221).** A rota com parâmetro (`/interviews/:track`) vinha antes e capturava "summary" como nome de trilha.
- **Salvar o perfil da empresa apagava o nome do cliente (#219).** O `PUT .../company-profile` gravava `client_name || ''`; três projetos de produção ficaram sem nome. Campo ausente ou em branco agora mantém o atual, e a exibição cai para o nome do projeto.
- **Redefinir a senha no primeiro acesso não renovava o carimbo da sessão (#204).**

### Segurança
- **O consultor deixa de receber o preço do levantamento (02/10/2026).** `GET /assessments` e `GET /assessments/:id` devolviam a linha inteira, com `pricing_override`, `pricing_desconto` e `pricing_notas`. Agora essas colunas só saem para `platform_admin` e `comercial`.
- **O consultor humano fica preso às suas designações (D5).** Até aqui `consultor` alcançava todos os projetos: rota de projeto, recurso por id (`DELETE /risks/:id`, `PUT /management-reviews/:id`...) e as listagens entre clientes (`/projects`, `/portfolio`, `/controls`, `/dashboard`, `/dashboard/stats`, `/users`). Agora só alcança os projetos em que consta como `consultor` na governança, com a conta ativa, pela mesma regra que o agente já seguia (`consultorDesignado`, fonte única com `concessaoValida`). Tirar a linha da governança derruba o acesso na requisição seguinte; erro na consulta nega. O consultor também deixa de criar, editar ou excluir conta de cliente de projeto em que não está designado: sem isso, trocava a senha de um usuário de outro cliente e entrava como ele. Quem cria um projeto (`POST /projects` ou `POST /assessments/:id/convert`) sendo consultor fica designado nele automaticamente, numa linha só (`role_category='consultor'`, com nome e e-mail do criador) e no mesmo batch da criação: se a designação falhar, o projeto não nasce órfão. `platform_admin` que cria não ganha linha. `platform_admin` segue vendo todos. **Rollout:** consultor sem designação perde acesso a tudo; as designações precisam estar feitas antes do deploy.
- **Revisão de segurança do agente (30/09/2026).** A revisão final do #221 provou por sonda dois defeitos críticos antes de chegarem à produção: o agente alcançava `POST /auth/reset-password-first` (definiria a senha do consultor, cuja conta vale em todos os projetos) e `POST /projects/:id/auditor-token` (credencial externa de 365 dias, com a qual se forjaria nota de auditor). Ambos, mais conta pessoal, notificações, criação de projeto e revogação de aprovações, foram fechados e reverificados com 15 tentativas de contorno. Uma segunda revisão, independente, não achou vulnerabilidade de alta confiança. Os invariantes, o checklist de PR e os limites conhecidos estão em `docs/agente/seguranca.md`.
- **`reset-password-first` só vale no primeiro acesso.** A rota troca a senha sem pedir a atual e não conferia que a conta estava em troca forçada (`requires_password_change = 1`): quem tivesse uma sessão aberta, por exemplo roubada, definia uma senha nova e tomava a conta. Fora do primeiro acesso agora responde 403 e grava `auth.reset_primeiro_recusado` na trilha; a troca comum segue em `change-password`, que exige a senha atual. O agente já estava barrado dessa rota desde o #221.
- **Segredo de webhook fora da listagem e do export (#222).** `GET /projects/:id/webhooks` devolvia `secret` a todo membro do projeto, contra o comentário do próprio código ("devolvido UMA vez"); o export de portabilidade o levava em texto puro. Webhook, SSO, SCIM e `repository_token` saem sem o segredo.
- **A tela de consentimento do agente dizia o contrário do que concedia (#222).** Afirmava "não apaga registros, não gera em lote" depois do #221. Agora descreve o alcance real e a confirmação exigida.
- **Escalonamento de privilégio em `/users` (#211)** e **vazamento de `pricing-config` para fora do comercial (#209)** fechados; **designar consultor** passa a ser do `platform_admin` ou do administrador do cliente (#210), porque a linha de governança decide quem conecta um agente ao projeto.
- **O código de recuperação de senha ia em texto puro para o log (#218).** Com a observabilidade ligada, quem lia o log trocava a senha de qualquer conta. Removido.
- **Vinte e dois alertas de dependência fechados.** Ativar as atualizações de segurança do Dependabot revelou o acúmulo: dezenove no `mcp-server-niso`, cujo lockfile tinha ficado para trás, e três na raiz. Os de maior peso eram `fast-uri` (alta, duas advisories), `ip-address` (alta) e `hono` no MCP, parado na 4.12.27 com travessia de diretório em `toSSG()` e problemas em `Suspense`/`ErrorBoundary`. Corrigidos só pelo lockfile — nenhum manifesto do MCP mudou, porque `hono` é transitivo do SDK e o código de lá não o importa; declará-lo como dependência direta seria afirmar algo falso.
- `sharp` (alta) chega por `@cloudflare/vitest-pool-workers` → `miniflare`. A correção que o npm propunha era rebaixar o pool de teste em versão MAIOR, o que quebraria a suíte inteira; entrou como `overrides` para `^0.35.4`, que é o caminho certo para corrigir dependência transitiva sem mexer no pai. É dependência de desenvolvimento e nunca chega ao bundle de produção.
- `vitest` e `@vitest/mocker` (média) na raiz: 4.1.10 → 4.1.11. A 10.0.0 subiu o vitest do frontend e esqueceu o da raiz.

## [10.0.0] - 2026-09-14

Interface refeita no padrão ness., autenticação com desafio anti-abuso,
documentos legais com aceite bloqueante e trilha de auditoria por campo. No
caminho, os cabeçalhos de segurança passaram a alcançar o HTML — descobriu-se
que nunca alcançavam — e a sonda externa de produção passou a funcionar pela
primeira vez.

**Mudança de comportamento visível**: doze writes que aceitavam corpo malformado
e gravavam lixo passam a responder 400; um documento legal publicado como
`material` barra o acesso de todos até o aceite.

### Added
- **Handoff ness. (`docs/design/handoff-ness-v1/`)**: tokens do design system, shell (sidebar 232/72, bandas de 64px, menu de conta), primitivas de `ui.js` (cabeçalho sem subtítulo, badge por `color-mix`, tabela com cabeçalho fixo, toast com Desfazer e região `aria-live` permanente).
- **Gate de aplicabilidade N/A da SoA**: justificativa obrigatória na tela e no servidor (`recusaAplicabilidade` em `routes/controls.ts`, `assertSoAExportable` em `services/soa-logic.ts`); marcar N/A zera CMMI e dono; a SoA não é produzida com exclusão sem justificativa.
- **SoA**: ordenação natural do código do Anexo A, seleção em lote com Desfazer, cursor de teclado (`j`/`k`/`Enter`/`x`/`a`), skeleton, estados de erro com código de requisição e paginação explícita de 25.
- **Autenticação (conta local)**: erro de credencial genérico com tentativas restantes, desafio anti-abuso a partir da 2ª falha, bloqueio de 15 min com `auth.lockout`, expiração por inatividade (30 min Cliente / 8 h consultor), segundo fator de 6 dígitos que valida ao completar, reautenticação preservando rascunho e trilha da própria sessão.
- **Documentos legais versionados** (migration 0029): classificação `comum | material`; material barra o acesso até o aceite, registrado com data, IP e user-agent.
- **Trilha por campo** (migration 0030): `campo: antes → depois` com autor e `operation_id` que agrupa o lote; histórico exibido no detalhe do controle.
- **Desafio anti-abuso do login (Turnstile), ponta a ponta.** A tela passa a carregar o widget sob demanda — só quando o servidor diz que o desafio é exigido, não em toda visita — e a montá-lo com a site key que vem na própria resposta, sem acoplar chave ao build. O widget é REINICIADO a cada falha: o token do Turnstile é de uso único e o desafio é conferido antes da senha, então uma tentativa com senha errada já o gastou; sem o reset, a seguinte seria recusada por "token já usado" e a pessoa ficaria presa. Se o script não carregar, o botão `Entrar` não fica travado — sem meio de resolver o desafio, travá-lo seria trancar o usuário para fora.
- **O desafio agora só liga com as DUAS chaves.** Antes o interruptor era só `TURNSTILE_SECRET_KEY`, e defini-la sozinha fazia o servidor exigir um desafio que a tela não tinha como montar. Aconteceu em produção em 14/09/2026: quem errasse a senha uma vez não entrava mais até a janela de 15 min expirar. A falha segura é não exigir desafio — perder uma camada extra é menos grave que trancar quem sabe a própria senha, e o bloqueio de 15 min na 5ª falha e o teto atômico por conta seguram a força bruta sem o Turnstile. `test/turnstile-interruptor.test.ts` reprova o retorno da armadilha.

### Changed
- Assinatura do export de portabilidade passa de HMAC para **Ed25519**. Uma
  assinatura prova origem a QUEM RECEBE, e com chave simétrica quem verifica
  também forja — o recipiente de um export é o cliente, às vezes o sucessor
  dele. A pública é publicada; a privada nunca sai do Worker.
- Paleta iOS (`#34c759`/`#ffcc00`/`#ff3b30`) → paleta ness. (`#10b981`/`#f59e0b`/`#ef4444`); `--text-dim` deixa de ser alpha (estava em ≈3,4:1 sobre o card) e passa a `#94a3b8`.
- `--glass-blur: none` remove todos os `backdrop-filter` herdados.
- Migrations do handoff renumeradas para 0029 e 0030: 0024–0028 já existiam na `main` (rate limit, enum de avaliação, política por tenant, SSO, SCIM).
- Handlers inline (`onclick`, `onchange`…) das telas do handoff convertidos para a delegação de eventos (`data-action`), exigida pelo CSP sem `unsafe-inline`.
- `src/trilha.ts` (arquivamento encadeado no R2) e a trilha por campo (`src/trilha-campo.ts`) passam a ser módulos distintos; o arquivamento inclui as colunas por campo.
- Dependências npm atualizadas num lote só, em vez de doze PRs do Dependabot: `hono` 4.13.5 → 4.13.7, `zod` 4.4.3 → 4.5.4 (raiz e `mcp-server-niso`), `@types/node` 26.1 → 26.5, `vite` 8.2.0 → 8.2.2, `vitest` e `@vitest/coverage-v8` 4.1.10 → 4.1.11. O salto do `zod` muda a REPRESENTAÇÃO de campo nulável no JSON Schema gerado — de `anyOf: [string, null]` para `type: [string, null]`, equivalente e mais compacto no mesmo draft —, então `docs/openapi.json` foi regenerado. Era isto que deixava o PR do `zod` vermelho: o Dependabot não tem como rodar `npm run openapi`.
- GitHub Actions atualizadas: `upload-artifact` v4 → v7, `github-script` v7 → v9, `codeql-action` v3 → v4. São saltos de versão MAIOR em ações que sustentam backup do banco, migração, deploy, detecção de desvio de schema, SLO e a sonda de produção — e nenhum desses workflows roda em pull request, então o verde do CI não os cobre. As duas primeiras ficam provadas assim mesmo: `upload-artifact` roda com `if: always()` em todo PR, e `github-script` é exercitado pelo próprio deploy que segue o merge, no passo que fecha issue de falha. O `codeql-action` roda no PR.
- **Higienização do repositório e documentação.** README ganha mapa do repositório, tabela de workflows (o que cada um garante), seção de testes e a lista real de segredos com o que acontece sem cada um. `docs/` ganha índice agrupado por quando se precisa de cada documento. O pacote de handoff visual sai da raiz para `docs/design/handoff-ness-v1/`. O repositório passa a ter descrição, homepage e tópicos no GitHub, e a apagar branch no merge. Cinquenta e um branches remotos de PRs já mergeados foram removidos.

### Fixed
- `PUT /api/v1/controls/:id/status` aceitava marcar N/A sem justificativa nenhuma, contornando o gate da tela.
- `forceCloseModal()` lançava quando os elementos de modal não existiam, matando a cascata de Esc.
- `scripts/gerar-openapi.mjs` montava caminhos com `URL.pathname`, que em Windows sai como `/C:/...` com acentos percent-encoded; passa a usar `fileURLToPath`.
- `POST /controls/:id/trilha/desfazer` lia o corpo cru; passa por `trilhaDesfazerSchema` e entra no contrato OpenAPI, junto das rotas de documentos legais.
- **Preview de CNPJ voltou a funcionar sob o CSP.** A tela de novo lead chamava a brasilapi direto do navegador; com os cabeçalhos de segurança alcançando o HTML, `connect-src 'self'` passou a bloquear a chamada e o preview morria com "Failed to fetch". A consulta foi para o servidor (`GET /api/v1/leads/consulta-cnpj/:cnpj`), onde a mesma fonte já era usada pelo enrich — o CSP segue fechado para terceiros e o IP de quem digita deixa de ir para fora. A rota devolve só os cinco campos que o preview mostra, herda o `somenteNess` do roteador de leads e recusa formato inválido antes de sair para a rede.
- **Pré-visualização de PDF de evidência voltou a abrir.** Outra consequência de os cabeçalhos passarem a valer no HTML: o preview monta um `iframe` com Object URL (`blob:`), e sem `frame-src` a diretiva caía para `default-src 'self'` — `blob:` não é `'self'`, então o navegador bloqueava. Conferido no ar com um navegador de verdade, pelo evento `securitypolicyviolation`: `frame-src` / `blob`. O CSP passa a declarar `frame-src 'self' blob:`. O `srcdoc` do preview de proposta foi conferido do mesmo jeito e nunca esteve afetado (herda a política do pai); baixar arquivo também não, porque `<a download href="blob:">` é navegação, não busca de recurso.
- **A sonda externa de produção nunca funcionou.** `uptime.yml` declarava `código=$(...)`, e bash não aceita acento em nome de variável: a linha vira comando, o shell responde `command not found` e o passo morre com 127 — antes de verificar coisa alguma. A cada 15 minutos a sonda reabria a mesma issue dizendo "produção não está respondendo", com produção no ar. O alarme falso é a metade menos grave; a grave é que, enquanto ele tocava por engano, não havia sonda nenhuma vigiando de verdade. Mesmo defeito no teste de fumaça de staging do `deploy.yml`, que ainda não tinha rodado porque `STAGING_ATIVO` não está ligado. `test/workflows-shell.test.ts` passa a reprovar nome de variável com acento em qualquer workflow.
- **`hidden` não escondia o bloco de verificação da tela de entrada.** A regra do agente (`[hidden] { display: none }`) perde para qualquer regra de autor que declare `display`, e `.login-challenge` declara `display: flex` — então o atributo virava decoração. Na prática, quem apenas abria a tela de entrada via a faixa "Conclua a verificação de segurança para continuar", sem ter tentado nada. Corrigido com uma regra global `[hidden] { display: none !important }`, que fecha a classe inteira do problema: `.account-menu` já tinha precisado de um remendo próprio pelo mesmo motivo. O teste vive no e2e (`frontend/e2e/login-desafio.spec.js`) e não no jsdom de propósito — o jsdom devolve `display: none` para `[hidden]` de qualquer jeito, então um teste lá passaria com e sem a correção.
- **`favicon.png` devolvia 404 em toda visita à tela de entrada.** O HTML pedia um PNG que o projeto nunca teve — o ícone sempre foi `.svg`, e é o que a landing já usava. A aba ficava sem ícone e o console acusava o erro. A página pública de políticas também não declarava ícone nenhum; agora declara. `frontend/test/recursos-existem.test.js` confere que todo arquivo local pedido pelo HTML existe em `public/`.
- Corrigido o comentário de `TOKEN_ENC_KEY` em `src/index.ts`, que descrevia um fallback de texto claro removido há tempos — hoje o caminho falha fechado com 503. Documentação que descreve risco inexistente manda procurar no lugar errado.
- README anunciava `niso.ness.com.br` como produção; esse domínio não responde. O que responde é `n-iso.ness.com.br`.

### Segurança
- **Isolamento de tenant travado por teste onde não havia nenhum.** As rotas de projeto de `risks`, `policies` e `integrations` se declaravam `/projects/:id/...` enquanto o middleware de acesso lê `:projectId`. Funcionava por acidente — o Hono resolve o parâmetro por handler —, mas nada travava isso: uma rota nova com o nome errado abriria o buraco em silêncio. As rotas passam a declarar `:projectId`, e o par ataque/ator-legítimo virou teste.
- **Negação de acesso virou tipo, não prefixo de string.** Trinta e nove handlers decidiam entre 403 e 500 comparando `e.message.startsWith('Forbidden')`. Quem negasse com outra mensagem recebia 500 — a recusa virava falha de servidor, e tanto a resposta quanto o log passavam a mentir. Existe `ForbiddenError`, e a guarda mora em `erro500`.
- **Schema Zod nos 12 writes que gravavam o corpo cru.** A assimetria mais clara estava em `vendors`: o POST validava, o PUT aceitava qualquer coisa e gravava 18 colunas. Campo desconhecido continua aceito; o buraco era campo ERRADO. Um teste de invariante impede o gap de voltar, e ele foi verificado sabendo falhar.
- **Nota de risco fora da matriz 5x5 deixa de entrar pelo PUT.** O schema de update exigia só ativo e ameaça como texto e deixava `impact`/`probability` passarem crus — `impact: 99` corrompia a matriz que depois vira nível de risco em relatório e na SoA.
- **Os cabeçalhos de segurança não alcançavam o HTML.** O `secureHeaders` do Worker só vale para resposta que o Worker gera; sem `assets.run_worker_first`, o Workers Assets serve o arquivo estático antes disso. Na prática o documento que carrega e executa os scripts saía sem CSP, sem HSTS, sem `nosniff` e sem anti-framing — o CSP endurecido do S2 (treze PRs para tirar `unsafe-inline` de `script-src`) cobria apenas as respostas JSON da API, onde script injetado não executa de qualquer forma, e a console de GRC ficava enquadrável em iframe. Os mesmos cabeçalhos passam a ser declarados em `frontend/public/_headers`, que é o mecanismo do Workers Assets para isso (sem custo de invocação de Worker); `test/cabecalhos-assets.test.ts` compara os dois lados e falha se divergirem.

## [9.0.0] - 2026-09-06

Ondas 3 e 4 do plano enterprise. **Major** por causa de duas mudanças de
comportamento em rotas existentes (ver *Alterado*), não por tamanho.

### Adicionado
- **SSO por OIDC, por tenant** (4.1): PKCE S256, `state` de uso único, `nonce`
  conferido, allow-list de algoritmo, `email_verified` exigido. Provisionamento
  no primeiro acesso com o papel do tenant — nunca o do IdP.
- **SCIM 2.0** (4.2): `/scim/v2/Users` com o ciclo completo. O desligamento no
  IdP derruba as sessões vivas na hora e bloqueia o login.
- **Política de segurança por tenant** (4.3): MFA obrigatório, TTL de sessão e
  allowlist de IP (IPv4/CIDR) configuráveis por cliente.
- **Trilha de auditoria arquivada fora do D1** (4.4): JSONL diário no R2,
  encadeado por SHA-256, com rota de verificação que recalcula os digests.
- **Política de retenção** (4.5) declarada em `docs/retencao.md` e executada
  pelo cron. Registro de GRC nunca entra em purga automática.
- **Portabilidade do tenant** (4.6): `GET /api/v1/projects/:projectId/export`,
  com as tabelas descobertas do banco e não de uma lista.
- **Contrato OpenAPI** (3.1) gerado dos schemas Zod, servido autenticado e
  versionado em `docs/openapi.json`.
- **SLO sobre o Analytics Engine** (3.5): taxa de 5xx e p95, a cada 6 h.
- **Sonda externa de disponibilidade** (3.6), a cada 15 min.
- **Ambiente de staging** (2.1–2.3) e **detecção de drift de schema** (2.6).
- **Template de Declaração de Aplicabilidade (SoA)** com os 93 controles do
  Anexo A:2022.
- `/health` passa a devolver `version`, `deployment_id` e `deployed_at` (0.2).

### Corrigido
- **`PUT` dos módulos devolvia 500 com corpo parcial**, não 400 — o handler
  passava `body.campo` direto ao `.bind()`.
- `niso_respond_auditor_note` (MCP) mandava POST para uma rota que só aceita
  PUT: a ferramenta de responder nota de auditor devolvia 404.
- **20 objetos em produção que o `schema.sql` não declara** (12 tabelas órfãs, 3
  com dado que ninguém lê). Registrados e vigiados, não apagados — descarte de
  dado de cliente é decisão de retenção, com backup na mão.

### Segurança
- Zero `any` nos caminhos de autorização, com catraca verificada por mutação.
- Validação de corpo fechada nas rotas de maior custo: senha, escopo de acesso
  (`PUT /admin/users/:id`) e as três rotas **sem autenticação** do portal
  público, que estouravam 500 com `{"email": 123}`.

## [8.3.0] - 2026-09-06

### Adicionado
- Contrato de isolamento das 77 rotas de topo passa a detectar guarda
  **ausente**, não só mal colocada (semeando recurso real do outro tenant).
- Ambiente de staging escrito, e sonda externa de disponibilidade.
- Política de senha: 8 caracteres em senha nova.

### Corrigido
- **Três rotas de `/api/v1/auth` estavam mortas** por ordem de montagem:
  `/auth/me` respondia `200 {}` sem credencial nenhuma,
  `/auth/reset-password-first` respondia 403 sempre — quebrando o fluxo
  obrigatório de primeiro acesso — e `/auth/change-password` estourava 500.
- **Portal do cliente inalcançável**: `/client/assessment` e `/client/proposal`
  liam uma coluna que nunca existiu e respondiam 404 para todo mundo.
- Template inexistente devolvia 500 em vez de 404; o catálogo anunciava um
  template que não existia e escondia dois que existiam.

## [8.2.0] - 2026-09-03

### Adicionado
- Plano `enterprise-grade-plan.md` e as ondas 0 e 1: isolamento multi-tenant
  provado por teste, não presumido.
- Primeira execução periódica do sistema (cron de manutenção) e
  `docs/runbook-incidente.md`.
- Backup diário do D1 com verificação do dump.

### Corrigido
- Portfólio e dashboard vazavam a carteira inteira para papel de cliente fora da
  lista conhecida (`ciso` escopado a um projeto recebia todos).
- Recusa de acesso virava 500 em vez de 403 em `assets` e `webhooks`.
- Interface mostrava `undefined` e status em inglês na tela de riscos.

## [8.1.0] - 2026-08-27

Endurecimento de segurança sobre o OWASP Top 10, e a infraestrutura de entrega.

### Adicionado
- CSP sem `unsafe-inline` em `script-src` (S2), por delegação de eventos.
- CORS por allowlist (S3), `npm audit` no CI (S5), rate limit de login atômico
  em D1 (S6), pinning de DNS contra SSRF rebinding (S8).
- Cifragem de `repository_token` em repouso (AES-GCM).
- MFA por TOTP, com carência e limite de tentativas.
- CodeQL (SAST), workflow manual de migrations, avaliação OWASP e `security.txt`.
- Revogação de sign-off de controle; `owner` gravável; `scope` gravável.

### Corrigido
- XSS armazenado no modal de precificação (S7).
- IDOR em `/mcp/execute`; OTP do portal público endurecido.
- Aprovação de DPIA passa a exigir autoridade de assinatura.
- Conteúdo de titular deixa de ir para o `audit_log` (S-log).

## [8.0.0] - 2026-07-03
### Added
- **Sprint 8**: Certification Tracker, AI Compliance Assistant (Llama 3.1), Onboarding Status, Template Marketplace, Public Endpoints (Pricing/Stats), and Landing Page.
- **Sprint 7**: Webhooks, API Keys (SHA-256), and CSV Exports.
- **Sprint 6**: Executive Report, Portfolio view, Audit Calendar, and CAPA (Corrective Actions).
- **Sprint 5**: Policy Templates (10 ISO templates), Traceability (Risk -> Control -> Evidence), ROPA Module, Gap Analysis, and Control Maturity (CMM).
- **Sprint 4**: Risk Assessment Module, KYV (Know Your Vendor), Security Awareness Tracker, Bulk Policy Generation, and ISO 27701 Migration.
- **Sprint 3**: Evidence Upload (R2 + SHA-256), MemoryService (Vectorize RAG), SoA Logic Engine (93 rules), and Audit Readiness Pack.
- **Sprint 2**: PolicyAgent (AI Policy Gen), EvidenceAgent (AI Evidence Eval), Auditor Portal, and Notification System.
- **Sprint 1**: Assessment Pre-Sales, Pricing Engine, Auto-Proposal, Auto-Project, Phase Checklists, and UI/UX Redesign (Glassmorphism).

## [1.0.0] - 2026-07-02
### Added
- Initial project structure and constitution.
- Basic Hono API setup on Cloudflare Workers.
- Database schema and D1 integration.
