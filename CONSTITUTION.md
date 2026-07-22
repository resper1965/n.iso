# nISO Constitution

## Core Principles

### I. Cloudflare-Native Edge Stack
nISO is built exclusively on the Cloudflare ecosystem to ensure global low-latency and scalability. The tech stack includes Hono on Workers, D1 for relational data, R2 for storage, and Vectorize for agentic memory.

### II. ISO 27001:2022 & ISO 27701 GRC Focus
Every feature, policy, assessment, and control generated must strictly adhere to ISO 27001:2022 and ISO 27701 controls. The system automates compliance through agentic workflows (PolicyAgent, EvidenceAgent), ensuring all actions are auditable, traceable, and compliant by design.

### III. Premium "ness." Aesthetics & Homogeneous UI
The UI delivers an "Enterprise Grade" experience adhering strictly to the `ness.` identity (lowercase, with a dot). Layouts prioritize a dark mode aesthetic (`#070b14` background, `#00ade8` accent) with standard 56px top navigation and glassmorphism. All 28 menu rotinas use standard UI helper functions (`renderPageHeader`, `renderStatCards`, `renderStatusBadge`, `renderDataTable`).

### IV. Modular Architecture & Strict Validation
The backend is decomposed into 18 domain-driven sub-routers (`src/routes/`) under a clean composition root (`src/index.ts`). All HTTP request payloads are strictly validated using Zod schemas (`src/schemas/`) with centralized RBAC and session security (`src/middleware/auth.ts`).

### V. Agentic Memory & Evidence
The system utilizes Vectorize for long-term agent memory RAG retrieval (`MemoryService`). All compliance evidence is SHA-256 hashed via Web Crypto API, indexed, and stored in R2 with electronic signature audit trails.

### VI. Security by Design
As a GRC tool, nISO leads by example. Input validation via Zod, parameter binding on D1 SQLite queries, role-based authorization, KV session isolation, and audit trail logging are non-negotiable.

## Technology Stack

- **Backend**: Hono (TypeScript) on Cloudflare Workers (~18 domain sub-routers).
- **Validation**: Zod strict payload schemas.
- **Database**: Cloudflare D1 (SQLite-compatible).
- **Storage**: Cloudflare R2 (Evidence files).
- **Vector Search**: Cloudflare Vectorize (Agentic Memory).
- **AI Engine**: Cloudflare Workers AI (Llama 3 / 3.1).
- **Frontend**: Vanilla SPA + Vite (`frontend/src/` -> `frontend/dist/`).

## Specification & Development Workflow (GitHub Spec Kit)

1. **Spec-Driven**: All architectural changes and UI/UX redesigns start with a specification in the `specs/` directory following the GitHub Spec Kit standard.
2. **Review Cycles & TDD**: Plans must be approved before implementation. Code modifications require unit test suite verification via Vitest (`npx vitest run`).
3. **Evidence-Based**: Every automated control produces auditable evidence artifacts.

## Governance
This constitution supersedes ad-hoc development decisions. Amendments require a Spec Kit update and alignment with the `ness.` brand guidelines.

**Version**: 1.1.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-22
