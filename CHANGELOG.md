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

- Assinatura do export de portabilidade passa de HMAC para **Ed25519**. Uma
  assinatura prova origem a QUEM RECEBE, e com chave simétrica quem verifica
  também forja — o recipiente de um export é o cliente, às vezes o sucessor
  dele. A pública é publicada; a privada nunca sai do Worker.

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
