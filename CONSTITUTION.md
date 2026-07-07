# nISO Constitution

## Core Principles

### I. Cloudflare-Native Edge Stack
nISO is built exclusively on the Cloudflare ecosystem to ensure global low-latency and scalability. The tech stack includes Hono on Workers, D1 for relational data, R2 for storage, and Vectorize for agentic memory.

### II. ISO 27001:2022 GRC Focus
Every feature and policy generated must strictly adhere to ISO 27001:2022 controls. The system is designed to automate compliance through agentic workflows, ensuring that all actions are auditable and compliant by design.

### III. Premium "ness." Aesthetics
The UI must deliver an "Enterprise Grade" experience. Branding uses the `ness.` identity (lowercase, with a dot). Layouts prioritize a dark mode aesthetic (`#070b14` background, `#00ade8` accent) with a standard 56px top navigation.

### IV. Agentic Memory & Evidence
The system utilizes Vectorize for long-term agent memory. All compliance evidence must be captured, indexed, and stored in R2, allowing for seamless retrieval and automated audit preparation.

### V. Security by Design
As a GRC tool, nISO must lead by example. Secure coding practices, input validation, and proper authentication/authorization (managed via Cloudflare access or integrated auth) are non-negotiable.

## Technology Stack

- **Backend**: Hono (TypeScript) on Cloudflare Workers.
- **Database**: Cloudflare D1 (SQLite-compatible).
- **Storage**: Cloudflare R2.
- **Vector Search**: Cloudflare Vectorize.
- **Frontend**: React + Vite (Vanilla CSS for maximum control).

## Development Workflow

1. **Spec-Driven**: All features must start with a specification in the `specs/` directory.
2. **Review Cycles**: Plans must be approved before implementation.
3. **Evidence-Based**: Every automated control must produce clear evidence artifacts.

## Governance
This constitution supersedes ad-hoc development decisions. Amendments require a spec-kit update and alignment with the `ness.` brand guidelines.

**Version**: 1.0.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-02
