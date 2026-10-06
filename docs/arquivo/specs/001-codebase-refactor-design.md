# Spec 001: Architecture & Codebase Refactoring Design

## 1. Goal & Context
The **nISO** backend currently contains over 3,400 lines in a single monolithic file (`src/index.ts`) hosting 100+ endpoints across 50 features.
This document defines the architectural redesign to decompose `src/index.ts` into modular, domain-driven Hono routers, standardizing service boundaries, frontend integration patterns, and project context documentation.

---

## 2. Alternatives Explored

| Option | Architecture Pattern | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Selected)** | **Modular Domain Routers (`src/routes/*.ts`)** | Standard Hono idiom, minimal overhead, zero new abstractions, 100% backward compatible. | Requires careful binding pass-through. | **PREFERRED** (Follows Ponytail / YAGNI) |
| **Option B** | **Feature Slices (`src/features/*/index.ts`)** | Co-locates routes, services, and tests by feature. | Deep folder nesting, duplicate boilerplate across 16 features. | Rejected (over-engineered for current scope) |
| **Option C** | **Class-Based Controllers** | Enterprise OOP style. | Heavy boilerplate, un-idiomatic for Cloudflare Workers / Hono. | Rejected (violates Ponytail rule: boring over clever) |

---

## 3. Detailed Design Sections

### Section 3.1: Backend Router Taxonomy (`src/routes/`)
Each domain will be isolated in a dedicated Hono router exporting a sub-app mounted via `app.route('/api/v1/...', router)`.

| Router File | Prefix / Path Scope | Key Responsibilities |
| :--- | :--- | :--- |
| `src/routes/auth.ts` | `/api/v1/auth` | Login, Logout, Session check (`/me`), Password resets, Setup. |
| `src/routes/users.ts` | `/api/v1/users` | User CRUD, Role management (RBAC). |
| `src/routes/leads.ts` | `/api/v1/leads` | Lead management, CNPJ enrichment. |
| `src/routes/proposals.ts` | `/api/v1/proposals` | Proposal generation, Pricing config, Digital signature. |
| `src/routes/assessments.ts`| `/api/v1/assessments` | Pre-sales questionnaires, 10 blocks, auto-proposal trigger. |
| `src/routes/projects.ts` | `/api/v1/projects` | Project lifecycle, 41 phases, controls maturity, dashboard stats. |
| `src/routes/evidence.ts` | `/api/v1/evidence` | Multipart R2 upload, SHA-256 integrity, AI evidence evaluation. |
| `src/routes/risks.ts` | `/api/v1/risks` | Risk matrix (5x5 scoring), Risk register CRUD (already extracted, verify). |
| `src/routes/vendors.ts` | `/api/v1/vendors` | KYV vendor trust scores, diligence tracking. |
| `src/routes/training.ts` | `/api/v1/training` | Security awareness records, coverage percentage. |
| `src/routes/ropa.ts` | `/api/v1/ropa` | Record of Processing Activities (ISO 27701). |
| `src/routes/audits.ts` | `/api/v1/audits` | Audit calendar schedule, Auditor portal tokens. |
| `src/routes/capa.ts` | `/api/v1/capa` | Corrective and Preventive Actions. |
| `src/routes/certification.ts`| `/api/v1/certification` | Certification tracker (7 stages). |
| `src/routes/ai.ts` | `/api/v1/ai` | PolicyAgent, Bulk policy generator, Compliance AI Assistant. |
| `src/routes/public.ts` | `/api/v1/public` | Public stats, Public pricing, Auditor public portal. |
| `src/routes/exports.ts` | `/api/v1/exports` | CSV downloads, Audit Readiness Pack JSON download. |

### Section 3.2: Composition Root (`src/index.ts`)
`src/index.ts` will strictly perform:
1. Instantiating `const app = new Hono<{ Bindings: Bindings }>()`.
2. Applying global middlewares (CORS, Error Handler).
3. Mounting all 17 domain sub-routers via `app.route(...)`.
4. Serving static SPA assets (`serveStatic`) as the **absolute last** catch-all route.

Target file size: **~120 lines** (down from 3,400+ lines).

### Section 3.3: Context Rewrite & Documentation Hierarchy
- **`AGENTS.md`**: Updated to serve as the master entrypoint for AI agents. Documents the new router layout, service boundaries, DB schema alignment, and ness. design system rules.
- **`ARCHITECTURE.md`**: Technical architecture reference including Cloudflare Workers bindings (D1, KV, Vectorize, R2, AI), data flow diagrams, and error handling contracts.

---

## 4. Validation & Safety Strategy
- Every sub-router extraction step will be followed by running `npx vitest run`.
- Zero change to database schemas, binding names, or external route paths.
- Catch-all static route remains last to prevent shadowing API routes.
