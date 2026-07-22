# Plan: ROPA & DPIA UI Sync

## Goal
Implement signature workflows and report downloads inside the active `frontend/src/extracted_from_html.js` file, ensuring they are rendered correctly on the live GRC platform.

## Tasks
- [ ] Task 1: Inject the signature flow controls and "Gerar Relatório ROPA" button into the ROPA details modal within `extracted_from_html.js` → Verify: Modal shows the new elements
- [ ] Task 2: Inject the signature flow controls and "Gerar Relatório DPIA" button into the DPIA details modal within `extracted_from_html.js` → Verify: Modal shows the new elements
- [ ] Task 3: Add `window.approveROPA`, `window.openROPAReport`, `window.approveDPIA`, and `window.openDPIAReport` utility functions at the bottom of `extracted_from_html.js` → Verify: Clicking sign/report trigger requests
- [ ] Task 4: Build and deploy the application to Cloudflare → Verify: Run `npm run build` and `npx wrangler deploy` successfully

## Done When
- [ ] ROPA detail modals show Líder SGSI and Direção Executiva signature statuses.
- [ ] DPIA detail modals show Líder SGSI and Direção Executiva signature statuses.
- [ ] Both modals allow users to click to digitally sign the record and open/print reports.
