# Risk Register (Reconstructed) — cliente SGSI
## Registro de Riscos de Segurança da Informação (ISO 27001:2022 / ISO 27701:2019)

---
**Document Control**
| Campo | Valor |
|-------|-------|
| **Document ID** | SGSI-RISK-002 |
| **Version** | 1.1 (Reconstructed) |
| **Author** | BEKAA Consultoria — Ricardo Esper |
| **Last Review** | 14/07/2026 |
| **ISO 27001 Mapping** | **Clause 6.1.2 — Risk assessment** + **Clause 8.2** |
---

## 1. Painel de Resumo de Riscos

### 1.1 Distribuição de Riscos por Nível
| Nível de Risco | Quantidade | % Total |
|------------|-------|---------|
| 🔴 **CRÍTICO** (20-25) | 3 | 17% |
| 🟠 **ALTO** (12-19) | 6 | 33% |
| 🟡 **MÉDIO** (6-11) | 7 | 39% |
| 🟢 **BAIXO** (3-5) | 2 | 11% |
| **TOTAL** | **18** | 100% |

### 1.2 Riscos por Status de Tratamento
| Status | Quantidade |
|--------|-------|
| 🔴 **Aberto (Não Iniciado)** | 11 |
| 🟡 **Em Tratamento** | 4 |
| 🟢 **Mitigado** | 1 |
| ⚪ **Aceito** | 2 |

---

## 2. Registro Detalhado de Riscos

### [RISK-001] Biometric Data Breach via S3 Misconfiguration
* **Asset**: S3 buckets containing biometric images (face templates)
* **Threat**: External attacker gains unauthorized access
* **Vulnerability**: S3 bucket misconfiguration (public access), lack of KMS encryption, missing bucket policies
* **Calculated**: L=5, I=5 | **Score**: **25** 🔴 **CRÍTICO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.11 (Data masking), A.8.10 (Information deletion), A.5.23 (Cloud services security), A.8.24 (Use of cryptography)
* **Actions**: Enable S3 Block Public Access on account level, configure SSE-KMS encryption, restrict bucket policies, enable S3 Access Logging.

### [RISK-002] Lack of AWS Config Compliance Monitoring
* **Asset**: AWS Account 992382542028 (production)
* **Threat**: Configuration drift, non-compliant resources go undetected
* **Vulnerability**: AWS Config NOT enabled, no automated compliance rules
* **Calculated**: L=4, I=4 | **Score**: **16** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.9 (Configuration management), A.5.37 (Documented operating procedures)
* **Actions**: Enable AWS Config in all regions, apply CIS AWS Foundations Benchmark rules, configure SNS alerts to Slack.

### [RISK-003] Unauthorized AWS Root Account Access
* **Asset**: AWS root account (992382542028)
* **Threat**: Attacker gains root credentials (phishing, leaked keys)
* **Vulnerability**: Credentials exist, MFA token not physical, root used for daily operations
* **Calculated**: L=4, I=5 | **Score**: **20** 🔴 **CRÍTICO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.15 (Access control), A.5.17 (Authentication information), A.5.18 (Access rights), A.8.5 (Secure authentication)
* **Actions**: Delete root access keys, configure hardware MFA (YubiKey), store password in physical safe, set CloudTrail alerts for root calls.

### [RISK-004] IAM Over-Permissioning (Insider Threat)
* **Asset**: AWS IAM roles and policies
* **Threat**: Disgruntled employee or compromised account modifies infrastructure
* **Vulnerability**: Overly permissive IAM policies, too many Administrators, lack of quarterly access reviews
* **Calculated**: L=4, I=4 | **Score**: **16** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.18 (Access rights), A.6.4 (Disciplinary process), A.8.2 (Privileged access rights)
* **Actions**: IAM Audit, remove AdministratorAccess from users, implement least privilege custom policies, quarterly access recertification (SOP-005).

### [RISK-005] Lack of Threat Detection (No GuardDuty)
* **Asset**: AWS Account 992382542028
* **Threat**: Malicious activity (crypto mining, exfiltration) goes undetected
* **Vulnerability**: AWS GuardDuty disabled, no real-time security events analysis
* **Calculated**: L=3, I=5 | **Score**: **15** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.7 (Threat intelligence), A.8.16 (Monitoring activities), A.5.25 (Security event assessment)
* **Actions**: Enable AWS GuardDuty in all active regions, route critical alerts via SNS, weekly security dashboard review.

### [RISK-006] Unrotated IAM Access Keys
* **Asset**: AWS Developer Accounts and API integrations
* **Threat**: Compromised developer machine exposes stale credentials
* **Vulnerability**: Access keys older than 90 days, no automated rotation script
* **Calculated**: L=4, I=3 | **Score**: **12** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.17 (Authentication information), A.8.5 (Secure authentication)
* **Actions**: Enforce IAM key age limit (90 days) in AWS Config, deploy secrets rotation script in Github Actions, configure AWS Secrets Manager.

### [RISK-007] Ransomware Attack on EKS Clusters
* **Asset**: Kubernetes worker nodes & biometric validation containers
* **Threat**: Ransomware encrypts container nodes, disabling API services
* **Vulnerability**: Stale container base images, lack of immutable backups for configuration
* **Calculated**: L=4, I=5 | **Score**: **20** 🔴 **CRÍTICO**
* **Treatment**: MITIGATE + TRANSFER
* **Annex A Controls**: A.8.7 (Protection against malware), A.8.13 (Information backup), A.5.29 (IS during disruption)
* **Actions**: Integrate Trivy image scanning, backup EKS specs to immutable S3, contract cyber-insurance policy.

### [RISK-008] Spoofing Attacks on Face ID API Endpoints
* **Asset**: Biometric Validation Endpoint `/api/v1/verify`
* **Threat**: Attacker uses static photos or videos to bypass authentication
* **Vulnerability**: Liveness detection model is outdated or bypassed
* **Calculated**: L=3, I=4 | **Score**: **12** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.28 (Secure coding), A.5.7 (Threat intelligence)
* **Actions**: Upgrade liveness detection SDK, implement anti-spoofing challenge-response, capture forensic logs.

### [RISK-009] Exposed Secrets in Application Logs
* **Asset**: CloudWatch and Datadog logs
* **Threat**: AWS keys, API secrets, or biometric tokens exposed to operators
* **Vulnerability**: Logger helper outputs raw request payloads without masking sensitive keys
* **Calculated**: L=4, I=3 | **Score**: **12** 🟠 **ALTO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.12 (Data leakage prevention), A.8.28 (Secure coding)
* **Actions**: Implement log scrubbing middleware, execute Semgrep rules to detect raw payload logging.

### [RISK-010] Backup Restoration Failure (No Disaster Recovery Testing)
* **Asset**: PostgreSQL (AWS Aurora) and Vector Index
* **Threat**: Backups are corrupted and fail to restore during database disaster
* **Vulnerability**: Automated backups are enabled, but restoration tests are never performed
* **Calculated**: L=3, I=3 | **Score**: **9** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.13 (Information backup), A.5.30 (ICT readiness for BC)
* **Actions**: Implement SOP-008 (Backup Restoration Test Procedure), run bi-annual automated restores in sandbox.

### [RISK-011] Data Retention Violation under LGPD
* **Asset**: Biometric image cache on ephemeral storage
* **Threat**: Cache files are retained longer than contractually allowed
* **Vulnerability**: No automated clean-up job on validation worker nodes
* **Calculated**: L=3, I=3 | **Score**: **9** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.10 (Information deletion), A.5.34 (Privacy and protection of PII)
* **Actions**: Deploy CronJob to purge temporary biometric files after 24 hours, configure S3 lifecycle rules.

### [RISK-012] Single Point of Failure (SPOF) on DevOps Resources
* **Asset**: Infrastructure maintenance and cloud deploy keys
* **Threat**: Single technical employee unavailable during infrastructure outage
* **Vulnerability**: Only one developer has full knowledge of EKS Terraform scripts and deploy keys
* **Calculated**: L=3, I=3 | **Score**: **9** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.3 (Segregation of duties), A.5.4 (Management responsibilities)
* **Actions**: Document entire EKS deployment steps, share deployment keys securely, train Consultor E as backup.

### [RISK-013] Vulnerable Dependencies in CI/CD pipeline
* **Asset**: Face ID validation API codebase
* **Threat**: Known CVE exploited in Node.js modules or packages
* **Vulnerability**: No automated dependency auditing in Git workflow
* **Calculated**: L=3, I=3 | **Score**: **9** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.28 (Secure coding), A.8.25 (Secure development lifecycle)
* **Actions**: Enable Snyk/Dependabot in CI/CD, enforce build block on high-critical vulnerabilities.

### [RISK-014] Unauthorized Access to Plaintext API Keys
* **Asset**: Client integration tokens
* **Threat**: Attacker reads active customer API keys directly from database
* **Vulnerability**: Client tokens stored in D1 database in plaintext instead of hashed format
* **Calculated**: L=2, I=4 | **Score**: **8** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.8.24 (Use of cryptography), A.8.5 (Secure authentication)
* **Actions**: Apply SHA-256 hashing to all client API keys, store only hashes in database, display token once on generation.

### [RISK-015] Lack of Third-Party Vendor Risk Assessments
* **Asset**: Partner and subcontractor APIs (e.g., Bekaa, cloud providers)
* **Threat**: Security breach at vendor compromises cliente validation pipelines
* **Vulnerability**: No formal risk assessment procedure for strategic suppliers
* **Calculated**: L=2, I=3 | **Score**: **6** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.5.19 (IS in supplier relationships), A.5.21 (Managing ICT supply chain)
* **Actions**: Implement Vendor Diligence Form (KYV), require ISO 27001 certification or SOC2 reports for critical SaaS.

### [RISK-016] Physical Theft of Developer Laptops
* **Asset**: Remote development endpoints
* **Threat**: Laptop stolen, attacker gains access to local SSH keys and codebases
* **Vulnerability**: Hard-drive encryption disabled on developer machines, BYOD policy lacks MDM
* **Calculated**: L=2, I=3 | **Score**: **6** 🟡 **MÉDIO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.6.7 (Remote working), A.8.1 (User endpoint devices)
* **Actions**: Enforce FileVault/BitLocker encryption, deploy endpoint agent to verify security baseline.

### [RISK-017] Unmonitored Outbound VPC Network Traffic
* **Asset**: AWS VPC infrastructure
* **Threat**: Malware exfiltrates biometric templates via DNS tunneling
* **Vulnerability**: Egress VPC traffic is completely unmonitored and unrestricted
* **Calculated**: L=2, I=2 | **Score**: **4** 🟢 **BAIXO**
* **Treatment**: ACCEPT
* **Annex A Controls**: A.8.20 (Network security), A.8.22 (Web filtering)
* **Actions**: Accept residual risk. Monitor VPC Flow Logs periodically via CloudWatch.

### [RISK-018] Remote Contractors without Signed NDAs
* **Asset**: Proprietary biometrics validation algorithms
* **Threat**: Contractor leaks source code to competitors
* **Vulnerability**: Lack of formal NDAs during initial onboarding process
* **Calculated**: L=1, I=3 | **Score**: **3** 🟢 **BAIXO**
* **Treatment**: MITIGATE
* **Annex A Controls**: A.6.2 (Terms and conditions of employment)
* **Actions**: Standardize NDA signature in onboarding checklist (SOP-001), perform audit of current agreements.
