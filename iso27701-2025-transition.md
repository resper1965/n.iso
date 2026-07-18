# ISO/IEC 27701:2025 PIMS Transition Plan (2026 Edition)

## Goal
Implement a standalone Privacy Information Management System (PIMS) workspace mapping to ISO/IEC 27701:2025, enabling role-based (Controller/Processor) control sets, 2025 Annex A (78 controls) generation, and LGPD/GDPR regulation alignment.

## Tasks
- [ ] **Task 1: Database Migration (`schema.sql`)**  
  Add `organization_role` to `projects` table. Add `standard` (default 'ISO 27001:2022') to `compliance_controls`. Add base legal, consent, and signature fields to `ropa_records` and `dpia_assessments`.  
  *Verify:* SQLite schema update compiles and runs cleanly.
  
- [ ] **Task 2: Annex A 2025 Rules Implementation (`src/services/soa-logic.ts`)**  
  Implement the 78 PIMS controls in a structured rules array, classifying them by Table A.1 (Controllers), Table A.2 (Processors), and Table A.3 (Both).  
  *Verify:* Unit test loads all 78 rules correctly.

- [ ] **Task 3: Backend Standalone SoA Generation (`src/index.ts`)**  
  Update `POST /api/v1/projects/:id/generate-soa` to accept `standard=ISO27701:2025` and filter controls dynamically based on the project's `organization_role`.  
  *Verify:* API call returns only Controller controls when role is 'Controller'.

- [ ] **Task 4: Transition Mapping API (`src/services/migration-service.ts`)**  
  Implement control migration mapping from the 2019 extension controls to the standalone 2025 Annex A tables.  
  *Verify:* `POST /api/v1/projects/:id/migrate-27701-2025` returns mapped controls with implementation status.

- [ ] **Task 5: Frontend Target Standard Toggle (`frontend/dist/index.html`)**  
  Add dropdown in Project Dashboard and SoA tabs to toggle between ISO 27001:2022 and ISO 27701:2025 control views.  
  *Verify:* Toggle changes rendering from 93 controls to the 78 PIMS controls.

- [ ] **Task 6: Frontend ROPA & DPIA Enhancements (`frontend/dist/index.html`)**  
  Extend ROPA form to show fields conditionally (lawful basis/consent for Controllers, customer contract/subprocessors for Processors). Add DPO/CEO signature checkboxes to DPIA details.  
  *Verify:* Signatures render and save state back to database.

## Done When
- [ ] PIMS standalone controls can be generated and managed independently of ISO 27001 controls.
- [ ] Project-specific Controller/Processor filtering is fully dynamic in both backend and frontend.
- [ ] Automatic migration from 2019 to 2025 standard is supported with gap assessment.

## Notes
- Backward compatibility: Existing 2013/2022 ISO 27001 projects must remain unaffected.
- Standalone mode: The platform should allow creating projects that *only* pursue ISO/IEC 27701:2025.
