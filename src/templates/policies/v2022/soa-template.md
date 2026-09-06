# [Organization Name] — Declaração de Aplicabilidade (SoA)
**Document ID:** POL-SOA-2022-001 | **Classification:** Internal | **Version:** 1.0

---

## 1. Por que este documento existe (ISO 27001 Cl. 6.1.3 d)

A Declaração de Aplicabilidade é o **único documento obrigatório que lista os 93
controles do Anexo A um a um** e, para cada um, registra três coisas: se ele se
aplica, por quê, e se já está implementado.

Ela não é um resumo da política nem um relatório de status. É a ponte auditável
entre a avaliação de riscos (Cl. 6.1.2), o plano de tratamento (Cl. 6.1.3) e o
que de fato existe na organização. Auditor de certificação lê a SoA **antes** de
qualquer outra coisa e usa as colunas de justificativa como roteiro do que vai
pedir para ver.

> **A exclusão é o ponto sensível.** Marcar um controle como Não aplicável é
> legítimo e comum — o que não é aceito é excluir sem justificativa ligada ao
> contexto (Cl. 4) ou ao risco avaliado. "Não temos orçamento" e "ninguém
> faz isso no nosso setor" não são justificativas; "não desenvolvemos
> software internamente" e "não operamos data center próprio" são.

## 2. Escopo do SGSI (ISO 27001 Cl. 4.3)

Esta SoA cobre o escopo declarado no documento de escopo do SGSI de
[Organization Name]. Controle cuja aplicabilidade dependa de algo fora desse
escopo deve dizê-lo na justificativa, e não simplesmente ser marcado N/A.

## 3. Como preencher

| Coluna | O que registrar |
| :--- | :--- |
| **Aplicável** | `Sim` ou `Não`. Sem terceira opção — controle "parcialmente aplicável" é aplicável. |
| **Justificativa** | Por que se aplica ou por que não. Ligada a risco identificado, a requisito legal/contratual, ou ao contexto do Cl. 4. Uma frase basta; vazio, não. |
| **Situação** | `Implementado` · `Parcial` · `Não implementado` · `N/A`. Reflete a realidade de hoje, não a intenção. |
| **Evidência / referência** | Onde o auditor encontra a prova: política, procedimento, registro, configuração, tela. |
| **Responsável** | Quem responde pelo controle. Cargo, não pessoa — cargo sobrevive à rotatividade. |

> Situação `Parcial` ou `Não implementado` com Aplicável = `Sim` **precisa** de
> item correspondente no Plano de Tratamento de Riscos, com prazo e dono. Uma
> SoA cheia de lacunas sem plano é uma não conformidade maior.

## A.5 — Controles organizacionais (37 controles)

| # | Controle | Aplicável | Justificativa | Situação | Evidência / referência | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A.5.1 | Policies for information security | | | | | |
| A.5.2 | Information security roles and responsibilities | | | | | |
| A.5.3 | Segregation of duties | | | | | |
| A.5.4 | Management responsibilities | | | | | |
| A.5.5 | Contact with authorities | | | | | |
| A.5.6 | Contact with special interest groups | | | | | |
| A.5.7 | Threat intelligence ⭐NEW | | | | | |
| A.5.8 | Information security in project management | | | | | |
| A.5.9 | Inventory of information and other associated assets | | | | | |
| A.5.10 | Acceptable use of information and other associated assets | | | | | |
| A.5.11 | Return of assets | | | | | |
| A.5.12 | Classification of information | | | | | |
| A.5.13 | Labelling of information | | | | | |
| A.5.14 | Information transfer | | | | | |
| A.5.15 | Access control | | | | | |
| A.5.16 | Identity management | | | | | |
| A.5.17 | Authentication information | | | | | |
| A.5.18 | Access rights | | | | | |
| A.5.19 | Information security in supplier relationships | | | | | |
| A.5.20 | Addressing information security within supplier agreements | | | | | |
| A.5.21 | Managing information security in the ICT supply chain | | | | | |
| A.5.22 | Monitoring, review and change management of supplier services | | | | | |
| A.5.23 | Information security for use of cloud services ⭐NEW | | | | | |
| A.5.24 | Information security incident management planning and preparation | | | | | |
| A.5.25 | Assessment and decision on information security events | | | | | |
| A.5.26 | Response to information security incidents | | | | | |
| A.5.27 | Learning from information security incidents | | | | | |
| A.5.28 | Collection of evidence | | | | | |
| A.5.29 | Information security during disruption ⭐NEW | | | | | |
| A.5.30 | ICT readiness for business continuity ⭐NEW | | | | | |
| A.5.31 | Legal, statutory, regulatory and contractual requirements | | | | | |
| A.5.32 | Intellectual property rights | | | | | |
| A.5.33 | Protection of records | | | | | |
| A.5.34 | Privacy and protection of PII | | | | | |
| A.5.35 | Independent review of information security | | | | | |
| A.5.36 | Compliance with policies, rules and standards | | | | | |
| A.5.37 | Documented operating procedures | | | | | |

## A.6 — Controles de pessoas (8 controles)

| # | Controle | Aplicável | Justificativa | Situação | Evidência / referência | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A.6.1 | Screening | | | | | |
| A.6.2 | Terms and conditions of employment | | | | | |
| A.6.3 | Information security awareness, education and training | | | | | |
| A.6.4 | Disciplinary process | | | | | |
| A.6.5 | Responsibilities after termination or change of employment | | | | | |
| A.6.6 | Confidentiality or non-disclosure agreements | | | | | |
| A.6.7 | Remote working | | | | | |
| A.6.8 | Information security event reporting | | | | | |

## A.7 — Controles físicos (14 controles)

| # | Controle | Aplicável | Justificativa | Situação | Evidência / referência | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A.7.1 | Physical security perimeters | | | | | |
| A.7.2 | Physical entry | | | | | |
| A.7.3 | Securing offices, rooms and facilities | | | | | |
| A.7.4 | Physical security monitoring ⭐NEW | | | | | |
| A.7.5 | Protecting against physical and environmental threats | | | | | |
| A.7.6 | Working in secure areas | | | | | |
| A.7.7 | Clear desk and clear screen | | | | | |
| A.7.8 | Equipment siting and protection | | | | | |
| A.7.9 | Security of assets off-premises | | | | | |
| A.7.10 | Storage media | | | | | |
| A.7.11 | Supporting utilities | | | | | |
| A.7.12 | Cabling security | | | | | |
| A.7.13 | Equipment maintenance | | | | | |
| A.7.14 | Secure disposal or re-use of equipment | | | | | |

## A.8 — Controles tecnológicos (34 controles)

| # | Controle | Aplicável | Justificativa | Situação | Evidência / referência | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A.8.1 | User end point devices | | | | | |
| A.8.2 | Privileged access rights | | | | | |
| A.8.3 | Information access restriction | | | | | |
| A.8.4 | Access to source code | | | | | |
| A.8.5 | Secure authentication | | | | | |
| A.8.6 | Capacity management | | | | | |
| A.8.7 | Protection against malware | | | | | |
| A.8.8 | Management of technical vulnerabilities | | | | | |
| A.8.9 | Configuration management ⭐NEW | | | | | |
| A.8.10 | Information deletion ⭐NEW | | | | | |
| A.8.11 | Data masking ⭐NEW | | | | | |
| A.8.12 | Data leakage prevention ⭐NEW | | | | | |
| A.8.13 | Information backup | | | | | |
| A.8.14 | Redundancy of information processing facilities | | | | | |
| A.8.15 | Logging | | | | | |
| A.8.16 | Monitoring activities ⭐NEW | | | | | |
| A.8.17 | Clock synchronisation | | | | | |
| A.8.18 | Use of privileged utility programs | | | | | |
| A.8.19 | Installation of software on operational systems | | | | | |
| A.8.20 | Networks security | | | | | |
| A.8.21 | Security of network services | | | | | |
| A.8.22 | Segregation of networks | | | | | |
| A.8.23 | Web filtering ⭐NEW | | | | | |
| A.8.24 | Use of cryptography | | | | | |
| A.8.25 | Secure development life cycle | | | | | |
| A.8.26 | Application security requirements | | | | | |
| A.8.27 | Secure system architecture and engineering principles | | | | | |
| A.8.28 | Secure coding ⭐NEW | | | | | |
| A.8.29 | Security testing in development and acceptance | | | | | |
| A.8.30 | Outsourced development | | | | | |
| A.8.31 | Separation of development, test and production environments | | | | | |
| A.8.32 | Change management | | | | | |
| A.8.33 | Test information | | | | | |
| A.8.34 | Protection of information systems during audit testing | | | | | |

## 4. Controles fora do Anexo A

A Cl. 6.1.3 c) permite — e em muitos casos espera — controles que não estão no
Anexo A, vindos da avaliação de riscos, de requisito regulatório (LGPD, setorial)
ou de exigência de cliente. Registre-os aqui com a mesma disciplina.

| Identificador | Controle | Origem | Situação | Evidência | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | |

## 5. Aprovação e revisão

A SoA é aprovada pela direção e revisada **sempre que a avaliação de riscos
mudar** — não apenas no ciclo anual. Mudança de escopo, incidente relevante,
novo fornecedor crítico ou nova obrigação legal disparam revisão.

| Version | Revision Date | Description of Change | Author | Approved By |
|---------|---------------|-----------------------|--------|-------------|
| 1.0     | {{date_modified}} | Initial Release | nISO Agent | {{approver}} |

---
**Status:** {{status}} | **Next Review:** {{next_review_date}} | **Owner:** {{policy_owner}}
