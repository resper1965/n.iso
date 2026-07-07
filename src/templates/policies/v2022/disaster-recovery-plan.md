# [Organization Name] - Disaster Recovery Plan (DRP)
**Document ID:** PLN-DRP-001 | **Classification:** Internal | **Version:** 1.0

---

## 1. Objective (ISO 27001 Annex A.5.30)
Define the procedures for restoring critical information systems and services following a catastrophic failure.

## 2. Recovery Targets
- **RTO (Recovery Time Objective):** [e.g., 4 Hours]
- **RPO (Recovery Point Objective):** [e.g., 1 Hour of data loss]

## 3. Critical Systems & Failover Procedures
### 3.1 Primary Infrastructure (e.g., Cloudflare Workers)
- **Failure Scenario:** Regional outage.
- **Failover Action:** Switch traffic to [Secondary Region/Provider].

### 3.2 Database (e.g., Cloudflare D1)
- **Failure Scenario:** Data corruption.
- **Recovery Action:** Restore from point-in-time snapshot (R2 backup).

## 4. Disaster Recovery Team
- **DR Coordinator:** {{policy_owner}}
- **Technical Lead:** CTO / Lead Architect
- **Comms Lead:** CEO / PR Manager

## 5. Testing and Maintenance
This plan must be tested (Tabletop or Live Drill) at least annually.

## 6. Document Control
| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0     | {{date_modified}} | Initial DRP Release | nISO Agent |

---
**Approved By:** {{approver}} | **Next Test Date:** {{next_review_date}}
