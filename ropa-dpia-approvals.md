# Plan: ROPA & DPIA Approval Reports

## Goal
Implement approval workflows (Líder SGSI & Direção Executiva signatures) and visual report exports for both ROPA (Records of Processing Activities) and DPIA (Data Protection Impact Assessments) modules.

## Tasks
- [ ] Task 1: Create a D1 database migration to add `ciso_approved_by`, `ciso_approved_at`, `ceo_approved_by`, and `ceo_approved_at` columns to the `ropa_records` table.
- [ ] Task 2: Create backend API endpoints `POST /api/v1/projects/:id/ropa/:recordId/approve` and `POST /api/v1/projects/:id/dpia/:assessmentId/approve` to handle signatures.
- [ ] Task 3: Create report generation endpoints `GET /api/v1/projects/:id/ropa/report` and `GET /api/v1/projects/:id/dpia/:assessmentId/report` rendering styled printable HTML reports containing the digital signature trail.
- [ ] Task 4: Enhance the ROPA frontend view to display the approval status, show "Sign" buttons for appropriate roles, and display a "View Printable Report" button.
- [ ] Task 5: Enhance the DPIA frontend view to show signature status (using existing `dpo_signature` and `ceo_signature` columns) and render/export the approved DPIA report.

## Done When
- [ ] ROPA records can be digitally signed by both Líder SGSI and Direção Executiva.
- [ ] DPIA records can be digitally signed by both roles.
- [ ] Both modules provide printable HTML reports featuring a secure approval audit log.
