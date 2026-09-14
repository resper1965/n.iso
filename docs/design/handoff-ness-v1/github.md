repo: resper1965/nISO
branch: main

## Last sync

date: 2026-09-11T23:41:00Z

### Updated in this project

- Kit de wireframes (8 turnos, ~35 telas) com registro de decisões vigentes
- Protótipos clicáveis: SoA (lista/detalhe/lote/trilha) e autenticação (login → MFA/SSO → aceite)
- Shell reutilizável da família ness. em Shell.dc.html, com props
- Tokens ness. isolados em ds/industry-ness.css

## Stack observada

- Backend: Cloudflare Workers + Hono (`src/`), D1, Zod; rotas por domínio em `src/routes/`
- Frontend: Vite + JavaScript sem framework — `frontend/src/style.css`, `globals.js`, `ui.js`, `router.js`, `views/`
- Já existem no código: `src/trilha.ts` (trilha de auditoria), `src/sso.ts`, `src/routes/scim.ts`, `src/routes/mfa.ts` + `src/services/totp.ts`, `src/services/soa-logic.ts`

## Screen map

| Tela (projeto) | Arquivos do repo |
| --- | --- |
| Shell.dc.html (sidebar, header, conta) | frontend/src/ui.js, frontend/src/style.css, frontend/public/index.html |
| Prototipo SoA (lista, detalhe, lote, trilha) | src/routes/controls.ts, src/services/soa-logic.ts, src/trilha.ts |
| Prototipo Autenticacao (login, MFA, SSO, aceite) | frontend/login.html, src/routes/auth.ts, src/routes/mfa.ts, src/services/totp.ts, src/sso.ts |
| Wireframes 7d SSO/SCIM | src/sso.ts, src/routes/scim.ts, src/politica-tenant.ts |
| Wireframes 4c ROPA · 4d DPIA | src/routes/ropa.ts, src/routes/data-subject.ts, src/data/iso27701-2025.ts |
| Wireframes 4b Políticas | src/routes/policies.ts, src/services/policy-generator.ts, src/templates/policies/ |
| Wireframes 2h Usuários e papéis | src/routes/users.ts, src/middleware/auth.ts, src/auth-policy.ts |
| Wireframes 8a-8c Legal e aceites | frontend/public/politicas.html, src/routes/public.ts |
