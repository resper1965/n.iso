# Feature Specification: nISO — Delivery Engine Agêntico

**Feature Branch**: `main`

**Created**: 2026-07-02

**Last Updated**: 2026-07-03

**Status**: Active / Implementation (Sprint 1 de 8)

**Input**: Portal agêntico da ness. para construção e entrega de programas de certificação ISO 27001:2022 / ISO 27701 — cobrindo o ciclo completo desde captação do lead até entrega do Audit Readiness Pack.

---

## Architecture Overview

```
Stack: Cloudflare Workers (Hono) + D1 + R2 + Vectorize + KV
Frontend: Vanilla HTML/CSS/JS (SPA) — index.html + auditor.html
Backend: src/index.ts (1200+ linhas) + 23 services + 2 agents
Database: 13 tabelas (users, leads, proposals, contracts, assessments,
          assessment_answers, projects, project_phases, project_interviews,
          compliance_controls, evidence, audit_logs, auditor_tokens)
```

## Modules (Lifecycle Pipeline)

| # | Módulo | Status | Sprint |
|---|--------|--------|--------|
| 1 | Lead & CRM | ✅ Produção | 0 |
| 2 | Assessment Pré-Sales (10 blocos) | ⚡ Blocos 1-5 completos | 1 |
| 3 | Pricing & Proposta HTML | ✅ Produção | 0-1 |
| 4 | Aprovação & Contrato | ✅ Produção | 0 |
| 5 | Projeto (41 fases, 6 jornadas) | ✅ Produção | 0 |
| 6 | Evidence Vault (R2 + SHA-256) | ❌ Não integrado | 2 |
| 7 | Policy Generator + SoA | ❌ Não integrado | 3 |
| 8 | Compliance Engine + Risks | ❌ Não integrado | 4 |
| 9 | Agentes (AI + PII + Interviews) | ❌ Não integrado | 5 |
| 10 | Audit Readiness Pack (ZIP) | ❌ Não integrado | 6 |
| 11 | Portal do Auditor Externo | ✅ Produção | 0 |
| 12 | Configurações & Multi-tenant | ❌ Não iniciado | 7 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — CRM Pipeline Completo (Priority: P0) ✅ DONE
Como consultor, quero registrar um lead, conduzir o assessment pré-venda, gerar a proposta automaticamente, e assinar o contrato — tudo dentro do nISO.

**Acceptance**: Lead → Assessment → Pricing → Proposta HTML → Assinatura → Lead "Won".

---

### User Story 2 — Assessment Estruturado de 10 Blocos (Priority: P0) ⚡ PARCIAL
Como consultor, quero entrevistar o cliente em 10 blocos de perguntas estruturadas cobrindo qualificação, escopo, tecnologia, dev seguro, privacidade, governança, fornecedores, evidências, expectativa e volumetria.

**Acceptance**: 10 blocos × 8-15 perguntas = ~100 perguntas. Tipos: select, multi, yesno, text. Painel contextual com red flags e complexidade em tempo real.

---

### User Story 3 — Evidence Vault com Integridade (Priority: P0) ❌ Sprint 2
Como consultor, quero fazer upload de evidências para R2, com hash SHA-256 para garantir imutabilidade, e vincular cada evidência a um controle ISO específico.

**Acceptance**: Upload → SHA-256 → R2 → D1 metadata → Verificação de integridade.

---

### User Story 4 — Geração Automática de Políticas (Priority: P1) ❌ Sprint 3
Como consultor, quero gerar rascunhos das 5 políticas mestres (ISP, AUP, ISMS Scope, Risk Assessment, Access Control) pré-preenchidos com dados do assessment do cliente.

**Acceptance**: Template + dados do assessment → HTML imprimível → Workflow de aprovação.

---

### User Story 5 — Audit Readiness Pack (Priority: P0) ❌ Sprint 6
Como consultor, quero gerar um pacote ZIP estruturado contendo todas as políticas aprovadas, evidências coletadas, SoA, e relatórios para entregar à certificadora.

**Acceptance**: ZIP com `/Policies/`, `/Evidence/`, `/SoA/`, `/Reports/`. Gerado em < 1 minuto.

---

### User Story 6 — Portal do Auditor Read-Only (Priority: P1) ✅ DONE
Como consultor, quero gerar um link temporário para o auditor externo acessar o projeto em modo read-only, sem precisar de conta no sistema.

**Acceptance**: Token com expiração (7-30 dias). Página isolada `auditor.html`. Sem acesso a edição, CRM, ou outros projetos.

---

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Suporte ISO 27001:2022 e ISO 27701. ⚡ Parcial
- **FR-002**: Upload e vínculo de evidências a controles. ❌ Sprint 2
- **FR-003**: Workflow de aprovação formal. ❌ Sprint 3
- **FR-004**: Snapshots de auditoria de infra/pipelines. ❌ Sprint 5
- **FR-005**: Exportar Readiness Report / Audit Pack. ❌ Sprint 6
- **FR-006**: CRM completo (Lead → Contrato). ✅ Done
- **FR-007**: Assessment pré-venda com pricing automático. ⚡ Parcial
- **FR-008**: Portal do auditor externo temporário. ✅ Done
- **FR-009**: Audit logs de toda ação. ✅ Done
- **FR-010**: Multi-consultor com controle de acesso. ✅ Done

### Key Entities
- **Lead**: Empresa prospectada (company, contact, status pipeline)
- **Assessment**: Questionário de 10 blocos para qualificação
- **Proposal**: Proposta comercial HTML imprimível
- **Contract**: Registro de assinatura do contrato
- **Project**: Programa de certificação com 41 fases
- **Control**: Controle ISO (Annex A + 27701)
- **Evidence**: Prova técnica ou documental (R2 + SHA-256)
- **Approval**: Assinatura formal de documento
- **AuditorToken**: Acesso temporário read-only

## Success Criteria *(mandatory)*

| ID | Métrica | Sprint | Status |
|----|---------|--------|--------|
| SC-001 | Redução de 70% no tempo de coleta de evidências | 2 + 5 | ❌ |
| SC-002 | 100% docs obrigatórios Cláusulas 4-10 | 3 + 6 | ❌ |
| SC-003 | Audit Pack gerado em < 1 minuto | 6 | ❌ |
| SC-004 | Pipeline CRM Lead→Contract funcional | 0 | ✅ |
| SC-005 | Portal do auditor com token temporário | 0 | ✅ |

## Assumptions
- O consultor possui permissões para conectar o agente aos repositórios/cloud do cliente.
- O auditor externo aceita evidências digitais e logs de auditoria como provas.
- A organização possui acesso à internet para as varreduras agênticas.
- Cloudflare Workers Free tier é suficiente para o MVP (10ms CPU, 128MB memory).
