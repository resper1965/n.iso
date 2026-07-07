# [Organization Name] - Secure Development Policy (SSDLC)
**Document ID:** POL-DEV-001 | **Classification:** Internal | **Version:** 1.0

---

## 1. Objective (ISO 27001 Annex A.8.25)
Establish rules and principles for the secure development of software and systems at [Organization Name].

## 2. Secure Development Life Cycle (SSDLC)
- **Security by Design:** Threat modeling must be conducted during the design phase.
- **Environment Separation:** Development, Testing, and Production environments must be physically or logically separated.

## 3. Secure Coding Standards
- Development teams must follow OWASP Top 10 prevention guidelines.
- Use of approved and patched libraries only.

## 4. Code Review and Testing
- **Peer Review:** All code changes must be reviewed by a second developer before merge.
- **Automated Scanning:** SAST/DAST tools must be integrated into the CI/CD pipeline.

## 5. Change Management
- Formal approval is required for all production releases.
- Emergency changes must follow a documented "Hotfix" procedure.

## 6. Document Control
| Version | Revision Date | Description | Author | Approved By |
|---------|---------------|-------------|--------|-------------|
| 1.0     | {{date_modified}} | Initial Draft | nISO Agent | {{approver}} |

---
**Status:** {{status}} | **Next Review:** {{next_review_date}}
