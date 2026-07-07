# nISO - Manifesto do Agente

Se voce esta lendo isto, voce e o agente responsavel por continuar o desenvolvimento do **nISO** (Agentic GRC System da ness.).

## Contexto Atual
Stack Cloudflare: Workers (Hono) + D1 + R2 + Vectorize + AI. Vanilla SPA frontend (sem framework). Deploy via wrangler deploy.

## Stack Tecnica
- **Backend**: src/index.ts - Hono API, ~3400 linhas. Todos endpoints incluindo risk, vendor, training, ROPA, audit calendar, CAPA, portfolio, webhooks, API keys, CSV exports, certification tracker, AI chat, onboarding, marketplace, public pricing/stats.
- **Services**: src/services/pricing.ts (~17KB), memory.ts (Vectorize RAG), soa-logic.ts (93 regras), migration-service.ts (2013→2022).
- **Agents**: src/agents/ - PolicyAgent (Llama 3 + RAG), EvidenceAgent (Llama 3).
- **Frontend**: frontend/dist/index.html - Vanilla JS SPA, ~2530 linhas. 16 views. frontend/dist/auditor.html - portal auditor. frontend/dist/landing.html - landing page publica.
- **Schema**: schema.sql - D1 tables (23): assessments, assessment_answers, projects, project_phases, leads, proposals, contracts, users, compliance_controls, evidence, audit_logs, auditor_tokens, notifications, risks, vendors, training_records, ropa_records, audit_schedule, corrective_actions, api_keys, webhooks, organizations, certification_tracking, ai_chat_history.
- **Bindings**: DB (D1), SESSIONS (KV), VECTOR_INDEX (Vectorize), STORAGE (R2), AI.

## O que ja esta feito (Sprint 1 + Sprint 2 + Sprint 3 completas):

### Sprint 1:
1. Assessment Pre-Sales: 10 blocos, 92 perguntas com tipos (text, select, multi, yesno).
2. Pricing Engine: 4 tiers (Foundation R, Standard R, Enterprise R, Critical R).
3. Auto-Proposta: POST /api/v1/assessments/:id/generate-proposal gera HTML branded.
4. Auto-Projeto: Assinar proposta cria projeto + 41 fases automaticamente.
5. Phase Checklists: 41 fases com 204 itens (task/document/evidence).
6. Smart Dashboard: CTA context-aware, stats, activity feed.
7. UI/UX Redesign: Inter body, Montserrat headings, glassmorphism, sem icones.
8. Auth: Login com email/senha, sessoes via KV, 3 roles.
9. i18n: PT/EN/ES no frontend.

### Sprint 2:
10. PolicyAgent: POST /api/v1/projects/:id/generate-policy - gera politicas ISO via Cloudflare AI (Llama 3).
11. EvidenceAgent: POST /api/v1/evidence/:id/evaluate - avalia evidencias com AI (CONFORME/PARCIAL/NAO CONFORME).
12. Auditor Portal: frontend/dist/auditor.html - pagina publica read-only com token temporario.
13. Notifications: tabela + endpoints GET/PUT + triggers automaticos + badge/dropdown + polling 60s.
14. Bindings Fix: AI, STORAGE, VECTOR_INDEX adicionados ao type Bindings.
15. Frontend: Botao "Gerar Politica" no project-detail com modal de resultado AI.

### Sprint 3:
16. Evidence Upload: POST /api/v1/projects/:id/evidence/upload - multipart R2 + SHA-256 real via crypto.subtle.digest.
17. MemoryService RAG: PolicyAgent agora busca contexto anterior via Vectorize (retrieveContext) e armazena politicas geradas (storeFact).
18. SoA Logic Engine: soa-logic.ts expandido de 3 para 93 regras (todos os controles ISO 27001:2022 Annex A). Data-driven com RULES array.
19. SoA Generator: POST /api/v1/projects/:id/generate-soa - gera SoA, cria compliance_controls automaticamente.
20. Client Portal: GET /api/v1/client/dashboard + renderClientDashboard expandido com journeys, progress %, next milestone, notificacoes.
21. Audit Readiness Pack: GET /api/v1/projects/:id/audit-pack - download JSON com projeto, fases, controles, evidencias, audit trail.
22. Evidence List: GET /api/v1/projects/:id/evidence - listar evidencias do projeto.

### Sprint 4:
23. Risk Assessment Module: CRUD completo (risks table, GET/POST/PUT/DELETE, risk matrix com scoring 5x5).
24. KYV (Know Your Vendor): CRUD completo (vendors table, trust score, diligence level auto-calc, DPA tracking, certificacoes).
25. Security Awareness Tracker: CRUD (training_records table) + summary endpoint (cobertura %, compliance status).
26. Bulk Policy Generation: POST /api/v1/projects/:id/generate-policies-bulk - gera multiplas politicas sequencialmente via AI.
27. ISO 27701 Migration: POST /api/v1/projects/:id/migrate-27701 - migra SoA 2013→2022, identifica gaps, cria controles novos.
28. Frontend: 3 novas views sidebar (Riscos, Fornecedores, Treinamento) + modais CRUD + botoes Bulk Politicas e Migrar 27701.
### Sprint 5:
29. Policy Templates: 10 templates ISO (ISP, AUP, ACP, IRP, BCP, DPP, CMP, SDP, VMP, SAP) in-code.
30. Traceability: GET /api/v1/projects/:id/traceability - vincula riscos → controles → evidencias.
31. ROPA Module: CRUD completo (ropa_records table) para ISO 27701.
32. Gap Analysis: GET /api/v1/projects/:id/gap-analysis - cobertura %, by_status, gaps.
33. Control Maturity: PUT /api/v1/controls/:id/maturity - scoring CMM 0-5.
34. Frontend: nova view ROPA + modal CRUD + botao Gap Analysis no project-detail.

### Sprint 6:
35. Executive Report: GET /api/v1/projects/:id/executive-report - JSON agregado completo.
36. Portfolio: GET /api/v1/portfolio - visao multi-projeto com progress bars.
37. Audit Calendar: CRUD (audit_schedule table) + frontend view Auditorias.
38. CAPA: CRUD (corrective_actions table) + frontend view Acoes Corretivas.
39. Frontend: views Portfolio, Auditorias, CAPA + botao Report Executivo.

### Sprint 7:
40. Webhooks: CRUD + test trigger (webhooks table).
41. API Keys: generate/list/revoke com SHA-256 hash (api_keys table).
42. CSV Exports: riscos, vendors, training, audit-log como CSV download.
43. Frontend: botoes Export CSV no Portfolio.

### Sprint 8:
44. Certification Tracker: CRUD (certification_tracking table, 7 estagios de Gap Assessment ate Certified).
45. AI Compliance Assistant: POST /api/v1/projects/:id/chat - chatbot contextual via Llama 3.1 com historico.
46. Onboarding Status: GET /api/v1/onboarding-status - verificacao de completude do setup.
47. Template Marketplace: GET /api/v1/marketplace/templates - templates com categorias, dificuldade, tempo estimado.
48. Public Endpoints: GET /api/v1/public/pricing + /api/v1/public/stats - dados publicos sem auth.
49. Landing Page: frontend/dist/landing.html - pagina publica com features, pricing, how-it-works.
50. Frontend: views Certificacao + AI Assistant no sidebar.

## Produto Completo — 8 Sprints, 50 Features, 98+ Endpoints, 23 Tabelas D1

## Regras da ness.
- Marca: ness. (sempre minusculo, com ponto).
- Layout: Enterprise Grade, header 56px com backdrop-filter.
- Cores: #070b14 (fundo), #00ade8 (accent), #f5f5f7 (texto), rgba(229,235,255,0.6) (muted).
- Tipografia: Inter 300/400 para body, Montserrat 500/700 apenas headings.
- Proibido: italicos, emojis/icones, peso 600 Montserrat, accent como background de area.
- Inputs: border-radius 10px, glassmorphism surfaces com backdrop-filter blur(24px).
- Login: split-screen (branding esquerda, form direita).

## Restricoes Tecnicas
- serveStatic DEVE ser o ultimo catch-all route em src/index.ts.
- Frontend: sem modulos ES, tudo no escopo window. State global S.
- Schema: alinhar com schema.sql antes de adicionar colunas.
- Ponytail mode: YAGNI, reusar patterns, menor diff possivel, boring over clever.

<!-- SPECKIT START -->
## Contexto Spec Kit
Este projeto utiliza o GitHub Spec Kit para desenvolvimento orientado a especificacoes.
- Constituicao: CONSTITUTION.md
- Design: design.md
- Especificacoes: Localizadas em specs/
<!-- SPECKIT END -->

# Ponytail lazy senior dev mode

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

Rules:
- No abstractions that were not explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins.
- Mark intentional simplifications with a ponytail: comment.

Not lazy about: understanding the problem, input validation at trust boundaries, error handling, security, accessibility.
