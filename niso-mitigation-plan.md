# nISO Deep Mitigation Plan

## Goal
Transformar os gaps identificados no Shadow Audit em componentes de alta confiança para a certificação ISO 27001/27701.

## Tasks
- [ ] **M-001: Imutabilidade de Evidência Técnica**
  - Implementar hashing SHA-256 no `EvidenceService` e `ArtifactService`.
  - Verify: Cada Snapshot deve gerar um log com o hash único da evidência.
- [ ] **M-002: Validação de Resultado (Result-Oriented Scan)**
  - Evoluir `CICDScannerService` para buscar por arquivos de output (ex: `results.json`, `scan.log`).
  - Verify: O agente deve reportar "Semgrep Found + 0 Critical Vulnerabilities" em vez de apenas "Semgrep Found".
- [ ] **M-003: Auditoria de Privacidade (PII Discovery)**
  - Implementar o `PIIDiscoveryService` (Híbrido) para varredura de schemas de DB.
  - Verify: O agente deve listar tabelas com nomes sensíveis e pedir confirmação ao consultor.
- [ ] **M-004: Qualidade de Entrevista (Evidence Scoring)**
  - Adicionar métrica de "Diligência" no `InterviewService` baseada na extensão e palavras-chave da resposta.
  - Verify: Respostas curtas (< 50 caracteres) devem gerar alerta "Low Evidence Quality".
- [ ] **M-005: Transparency Trail (Hotfix Documentation)**
  - Forçar a inclusão de um campo `justification` no `AuditLogService` para toda ação de `REPLACE`.
  - Verify: O Portal do Auditor deve exibir o log com a justificativa de negócio.
- [ ] **M-006: ISO 27701 Consent Vault**
  - Criar estrutura de diretórios e serviço para armazenamento de Termos de Consentimento.
  - Verify: Existência de pasta `Evidence/Privacy/Consent` no Audit Pack.

## Done When
- [ ] Todos os Snapshots técnicos possuem hash de integridade.
- [ ] O Portal do Auditor exibe justificativas para alterações.
- [ ] O Agente identifica e alerta sobre baixa qualidade de evidências humanas.

## Notes
Este plano prioriza a **confiabilidade da prova** sobre a velocidade da automação. O nISO deve se comportar como um "Promotor" que exige provas contundentes antes de declarar conformidade.
