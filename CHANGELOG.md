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

### Added
- **Handoff ness. (`niso-handoff-v1`)**: tokens do design system, shell (sidebar 232/72, bandas de 64px, menu de conta), primitivas de `ui.js` (cabeçalho sem subtítulo, badge por `color-mix`, tabela com cabeçalho fixo, toast com Desfazer e região `aria-live` permanente).
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

- Dependências npm atualizadas num lote só, em vez de doze PRs do Dependabot: `hono` 4.13.5 → 4.13.7, `zod` 4.4.3 → 4.5.4 (raiz e `mcp-server-niso`), `@types/node` 26.1 → 26.5, `vite` 8.2.0 → 8.2.2, `vitest` e `@vitest/coverage-v8` 4.1.10 → 4.1.11. O salto do `zod` muda a REPRESENTAÇÃO de campo nulável no JSON Schema gerado — de `anyOf: [string, null]` para `type: [string, null]`, equivalente e mais compacto no mesmo draft —, então `docs/openapi.json` foi regenerado. Era isto que deixava o PR do `zod` vermelho: o Dependabot não tem como rodar `npm run openapi`.

- GitHub Actions atualizadas: `upload-artifact` v4 → v7, `github-script` v7 → v9, `codeql-action` v3 → v4. São saltos de versão MAIOR em ações que sustentam backup do banco, migração, deploy, detecção de desvio de schema, SLO e a sonda de produção — e nenhum desses workflows roda em pull request, então o verde do CI não os cobre. As duas primeiras ficam provadas assim mesmo: `upload-artifact` roda com `if: always()` em todo PR, e `github-script` é exercitado pelo próprio deploy que segue o merge, no passo que fecha issue de falha. O `codeql-action` roda no PR.

### Segurança
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
