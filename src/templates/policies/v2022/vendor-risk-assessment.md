# [Organization Name] - Vendor Risk Assessment Report
**Vendor:** {{vendor_name}} | **Report ID:** VRA-{{vendor_id}} | **Date:** {{date_modified}}

---

## 1. Executive Summary (ISO 27001 A.5.19)
This report evaluates the information security and privacy posture of **{{vendor_name}}** to determine its suitability as a business partner for [Organization Name].

## 2. Compliance Status
- **ISO 27001 Certified:** {{has_iso_27001}}
- **ISO 27701 Certified:** {{has_iso_27701}}
- **SOC 2 Type II Available:** {{has_soc2}}

## 3. Risk Assessment
| Category | Assessment | Score |
| :--- | :--- | :--- |
| Data Residency | Where is data stored? | [e.g., USA/Europe] |
| Encryption | Is data encrypted at rest/transit? | [e.g., AES-256] |
| Sub-processors | Does the vendor use 4th parties? | [e.g., AWS] |
| **Overall Risk** | **Readiness Level** | **{{trust_score}}%** |

## 4. Auditor Recommendation
- **[ ] Approved:** No significant risks identified.
- **[ ] Approved with Remediation:** Approval pending [e.g., signing of SCCs].
- **[ ] Rejected:** High risk to ISMS/PIMS objectives.

---
**Assessed By:** nISO Agent | **Final Approval:** {{approver}}
