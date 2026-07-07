# [Organization Name] - Secure Software Development Life Cycle (SSDLC) Standard
**Document ID:** STD-DEV-001 | **Classification:** Internal | **Version:** 1.0

---

## 1. Objective (ISO 27001 Annex A.8.25)
Define the technical security standards and mandatory gates for software development at [Organization Name].

## 2. Secure Development Phases
### 2.1 Design & Planning
- **Threat Modeling:** Mandatory for all new features impacting PII or Financial data.
- **Risk Assessment:** Preliminary check of third-party libraries.

### 2.2 Development (Secure Coding)
- **Code Review:** Mandatory peer review for all Pull Requests.
- **Static Analysis (SAST):** Automated scanning integrated into the pipeline.
- **Secret Management:** No hardcoded credentials; use of Vault/KMS.

### 2.3 Testing & Quality Assurance
- **Environment Isolation:** Dev/Test/Prod separation.
- **Dynamic Analysis (DAST):** Automated vulnerability scanning in the staging environment.

### 2.4 Deployment & Release
- **Change Management:** Production deploys require CISO or Lead Engineer sign-off.
- **Rollback Plan:** Mandatory for every release.

## 3. Version History
| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0     | {{date_modified}} | Initial Standard Release | nISO Agent |

---
**Approved By:** {{approver}} | **Status:** {{status}}
