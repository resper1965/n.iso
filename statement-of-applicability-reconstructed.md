# Declaração de Aplicabilidade (Statement of Applicability - SoA) — cliente SGSI
## Mapeamento de Controles ISO/IEC 27001:2022 (Reconstruído)

---
**Document Control**
| Campo | Valor |
|-------|-------|
| **Document ID** | SGSI-SOA-001 |
| **Version** | 2.1 (Reconstructed) |
| **Owner** | Gestor SGSI |
| **Approved By** | CEO (Executivo do Cliente - Ata de Aprovação 001) |
| **Last Update** | 14/07/2026 |
---

## 1. Escopo & Abordagem
A cliente é uma provedora B2B de API de Reconhecimento Facial (Face ID Platform) operando em modelo 100% remoto, com infraestrutura hospedada inteiramente em nuvem (AWS). Esta configuração dita a exclusão dos controles físicos corporativos (Anexo A.7), dado que não há escritórios físicos ou datacenters locais no escopo do SGSI.

---

## 2. Controles Organizacionais (A.5)

| Ref. | Controle | Aplicável? | Status | Justificativa / Implementação |
|---|---|---|---|---|
| A.5.1 | Políticas para segurança da informação | Sim | Implementado | SGSI-POLICY-001 aprovada e publicada no portal nISO. |
| A.5.2 | Funções e responsabilidades da segurança | Sim | Implementado | Matriz RACI estabelecida e publicada (SGSI-RACI-001). |
| A.5.3 | Segregação de funções | Sim | Implementado | Segregação plena inviabilizada pelo tamanho do time. Compensado via logs imutáveis (CloudTrail) e Code Review (PRs) obrigatórios. |
| A.5.4 | Responsabilidades da direção | Sim | Implementado | Ata de revisão da diretoria assinada e orçamento do SGSI aprovado. |
| A.5.5 | Contato com autoridades | Sim | Implementado | Canais da ANPD e autoridades de SI mapeados no plano de resposta a incidentes. |
| A.5.6 | Contato com grupos especiais | Sim | Implementado | Participação em fóruns de segurança e monitoramento de CVEs ativos. |
| A.5.7 | Inteligência de ameaças (Threat Intel) | Sim | Parcial | Assinaturas de feeds e monitoramento automatizado no AWS GuardDuty. |
| A.5.8 | Segurança em gerenciamento de projetos | Sim | Implementado | Diretrizes de segurança integradas nos sprints de desenvolvimento no Jira/Linear. |
| A.5.9 | Inventário de informações e outros ativos | Sim | Implementado | Inventário de ativos em nuvem e endpoints mantido em SGSI-ASSET-001. |
| A.5.10 | Uso aceitável da informação e ativos | Sim | Implementado | Termo de Aceite e Política de Uso Aceitável (AUP - SGSI-POLICY-007). |
| A.5.11 | Devolução de ativos | Sim | Implementado | Procedimento formalizado no processo de desligamento (SOP-001). |
| A.5.12 | Classificação da informação | Sim | Implementado | Níveis de confidencialidade estabelecidos e descritos no IS Policy. |
| A.5.13 | Rótulos da informação | Sim | Parcial | Políticas de marcação e tags ativas nos recursos de produção da AWS. |
| A.5.14 | Transferência da informação | Sim | Implementado | Tráfego criptografado obrigatoriamente usando protocolo TLS 1.3. |
| A.5.15 | Controle de acesso | Sim | Implementado | MFA obrigatório para todos os colaboradores e chaves SSH nominais. |
| A.5.16 | Gestão de identidade | Sim | Implementado | Centralizado no IAM da AWS com contas nominais e IAM Identity Center. |
| A.5.17 | Informação de autenticação | Sim | Parcial | Credenciais gerenciadas via AWS Secrets Manager. |
| A.5.18 | Direitos de acesso | Sim | Implementado | Revisão trimestral de acessos (recertificação) descrita no SOP-005. |
| A.5.19 | Segurança da informação no relacionamento com fornecedores | Sim | Implementado | NDAs assinados e questionários de segurança exigidos para fornecedores críticos (KYV). |
| A.5.20 | Segurança da informação nos contratos com fornecedores | Sim | Implementado | Cláusulas padrão de proteção de dados e DPA em todos os contratos de parceiros. |
| A.5.21 | Gestão da cadeia de suprimento de TI | Sim | Parcial | Análise baseada no monitoramento do AWS Trusted Advisor e ferramentas de SAST. |
| A.5.22 | Monitoramento dos serviços de fornecedores | Sim | Parcial | SLA e logs dos provedores críticos integrados e avaliados. |
| A.5.23 | Segurança no uso de serviços em nuvem | Sim | Implementado | Alinhado com o Modelo de Responsabilidade Compartilhada da AWS. |
| A.5.24 | Planejamento e preparação para gestão de incidentes | Sim | Implementado | Plano de Resposta a Incidentes (IRP - SGSI-POLICY-003) estruturado. |
| A.5.25 | Avaliação de eventos de segurança | Sim | Implementado | Classificação de severidade de incidentes de P0 a P4 implementada. |
| A.5.26 | Resposta a incidentes | Sim | Parcial | Runbooks de resposta em elaboração técnica. |
| A.5.27 | Aprendizado com incidentes | Sim | Implementado | Registro obrigatório de Post-Mortem e criação de CAPAs pós-crise. |
| A.5.28 | Coleta de evidências | Sim | Parcial | Procedimentos de preservação de logs forenses em elaboração. |
| A.5.29 | Segurança durante interrupções | Sim | Implementado | Processos redundantes em multi-AZ na AWS (Seção 6 da Pol. de SI). |
| A.5.30 | Prontidão das TIC para continuidade | Sim | Parcial | Testes semestrais de Disaster Recovery programados (RTP-007). |
| A.5.31 | Requisitos legais, estatutários e regulatórios | Sim | Implementado | Mapeamento regulatório de LGPD atualizado pelo DPO. |
| A.5.32 | Direitos de propriedade intelectual | Sim | Implementado | Proteção de propriedade do código-fonte garantida via contrato de trabalho. |
| A.5.33 | Proteção de registros organizacionais | Sim | Implementado | Versionamento de arquivos e logs do CloudTrail protegidos contra deleção. |
| A.5.34 | Privacidade e proteção de dados pessoais (PII) | Sim | Implementado | Práticas e medidas técnicas de proteção em conformidade com a LGPD. |
| A.5.35 | Análise independente da segurança da informação | Sim | Parcial | Auditoria externa planejada junto à certificadora para o final do ciclo. |
| A.5.36 | Conformidade com políticas e normas de segurança | Sim | Implementado | Varreduras automatizadas e revisões internas no portal nISO. |
| A.5.37 | Procedimentos operacionais documentados | Sim | Implementado | SOPs (001 a 005) publicadas e acessíveis a toda a equipe técnica. |

---

## 3. Controles de Pessoas (A.6)

| Ref. | Controle | Aplicável? | Status | Justificativa / Implementação |
|---|---|---|---|---|
| A.6.1 | Triagem de pessoal | Sim | Implementado | Verificação de antecedentes e currículo executada na contratação (SOP-001). |
| A.6.2 | Termos e condições de emprego | Sim | Implementado | Cláusulas de sigilo e NDAs anexadas a todos os contratos de trabalho. |
| A.6.3 | Conscientização, educação e treinamento em SI | Sim | Parcial | Programa de Treinamento e Campanhas de Conscientização ativas no nISO. |
| A.6.4 | Processo disciplinar | Sim | Implementado | Definido no regulamento interno e na Política de Segurança da Informação. |
| A.6.5 | Responsabilidades após o encerramento do contrato | Sim | Implementado | Acordo de confidencialidade remanescente após o desligamento do colaborador. |
| A.6.6 | Acordos de confidencialidade ou não divulgação | Sim | Implementado | NDAs exigidos para 100% de funcionários, prestadores e parceiros de negócios. |
| A.6.7 | Trabalho remoto | Sim | Implementado | Política de Trabalho Remoto ativa, exigindo uso de VPN e antivírus atualizado. |
| A.6.8 | Relato de eventos de segurança | Sim | Implementado | Canal interno e botão de reporte no dashboard para notificação de incidentes. |

---

## 4. Controles Físicos (A.7)

| Ref. | Controle | Aplicável? | Status | Justificativa / Implementação |
|---|---|---|---|---|
| A.7.1 | Perímetros de segurança física | Não | Excluído | **Justificativa**: A cliente opera 100% remoto, sem escritórios ou datacenters físicos locais. A segurança dos servidores é delegada à AWS. |
| A.7.2 | Entrada física | Não | Excluído | **Justificativa**: A segurança física dos servidores é mantida pela AWS em datacenters restritos. |
| A.7.3 | Segurança de escritórios, instalações e salas | Não | Excluído | **Justificativa**: Sem dependências físicas locais de escritórios no escopo do SGSI. |
| A.7.4 | Monitoramento de segurança física | Não | Excluído | **Justificativa**: Monitoramento físico mantido de forma nativa e certificado pela AWS. |
| A.7.5 | Proteção contra ameaças físicas e ambientais | Não | Excluído | **Justificativa**: Controles ambientais (geradores, ar, incêndio) são de responsabilidade da AWS. |
| A.7.6 | Trabalho em áreas seguras | Não | Excluído | **Justificativa**: Modelo de trabalho exclusivamente remoto / home office. |
| A.7.7 | Política de mesa limpa e tela limpa | Sim | Implementado | Exigência de bloqueio automático de tela (máximo 5 min) nos endpoints. |
| A.7.8 | Posicionamento e proteção de equipamentos | Não | Excluído | **Justificativa**: Ativos críticos operam exclusivamente em ambiente de nuvem pública. |
| A.7.9 | Segurança de ativos fora das dependências | Sim | Implementado | Notebooks dos engenheiros protegidos com criptografia integral de disco (BitLocker/FileVault). |
| A.7.10 | Mídias de armazenamento | Sim | Implementado | Proibição de uso de pendrives ou HDs externos sem prévia autorização da Segurança. |
| A.7.11 | Utilidades de suporte (energia/refrigeração) | Não | Excluído | **Justificativa**: Delegado aos controles de infraestrutura resilientes da AWS. |
| A.7.12 | Segurança do cabeamento | Não | Excluído | **Justificativa**: Sem cabeamento de rede físico local sob escopo da cliente. |
| A.7.13 | Manutenção de equipamentos | Sim | Implementado | Ciclo de atualização de sistemas operacionais automatizado nos notebooks (MDM). |
| A.7.14 | Descarte ou reutilização segura de equipamentos | Sim | Implementado | Formatação lógica com algoritmo de sobrescrita antes do descarte do laptop. |

---

## 5. Controles Tecnológicos (A.8)

| Ref. | Controle | Aplicável? | Status | Justificativa / Implementação |
|---|---|---|---|---|
| A.8.1 | Dispositivos de usuários finais (endpoints) | Sim | Implementado | Controle via MDM e antivírus corporativo obrigatório instalado nas máquinas. |
| A.8.2 | Direitos de acesso privilegiados | Sim | Implementado | Princípio do privilégio mínimo (PoLP). Uso restrito de credenciais de Admin. |
| A.8.3 | Restrição de acesso à informação | Sim | Implementado | Regras baseadas em RBAC (Role-Based Access Control) nos sistemas de arquivos. |
| A.8.4 | Acesso ao código-fonte | Sim | Implementado | Repositórios do GitHub privados com autenticação por chave SSH nominal. |
| A.8.5 | Autenticação segura | Sim | Implementado | Obrigatoriedade de senhas fortes e MFA em todos os serviços. |
| A.8.6 | Gestão de capacidade | Sim | Implementado | Autoscaling e monitoramento de capacidade na AWS via CloudWatch. |
| A.8.7 | Proteção contra malware | Sim | Implementado | Soluções de antivírus ativas em todos os notebooks dos desenvolvedores. |
| A.8.8 | Gestão de vulnerabilidades técnicas | Sim | Implementado | Varreduras semanais de dependências e contêineres nas imagens de produção. |
| A.8.9 | Gestão de configuração | Sim | Implementado | Infraestrutura definida como código (IaC - Terraform) e versionada no Git. |
| A.8.10 | Exclusão de informações | Sim | Implementado | Regras de expiração em logs e remoção definitiva de chaves expiradas. |
| A.8.11 | Mascaramento de dados | Sim | Implementado | Bancos de dados de teste contêm dados fictícios; sem dados reais de produção. |
| A.8.12 | Prevenção contra vazamento de dados (DLP) | Sim | Parcial | Bloqueio de upload em serviços não homologados a partir de endpoints corporativos. |
| A.8.13 | Backup de informações | Sim | Implementado | Backups diários e automatizados das bases D1 e RDS em bucket imutável. |
| A.8.14 | Redundância de instalações de processamento | Sim | Implementado | Replicação automática da infraestrutura AWS em múltiplas zonas de disponibilidade. |
| A.8.15 | Registro de eventos (Logging) | Sim | Implementado | Registro centralizado no AWS CloudTrail e logs de auditoria no nISO. |
| A.8.16 | Atividades de monitoramento | Sim | Implementado | Monitoramento do tráfego das APIs e auditoria contínua via AWS Config. |
| A.8.17 | Sincronização de relógio | Sim | Implementado | Sincronização via Network Time Protocol (NTP) da AWS em todos os servidores. |
| A.8.18 | Uso de programas utilitários privilegiados | Sim | Implementado | Acesso a consoles e ferramentas administrativas da nuvem restrito à rede corporativa. |
| A.8.19 | Instalação de software em sistemas operacionais | Sim | Implementado | Permissões administrativas locais restritas nos notebooks dos desenvolvedores. |
| A.8.20 | Segurança de redes | Sim | Implementado | Uso de firewalls de rede da AWS, Security Groups e redes privadas VPC. |
| A.8.21 | Segurança de serviços de rede | Sim | Implementado | Conexões e transferências de arquivos criptografadas usando protocolos seguros (HTTPS). |
| A.8.22 | Segregação de redes | Sim | Implementado | Isolamento entre ambientes (Desenvolvimento, Homologação e Produção). |
| A.8.23 | Filtragem web | Não | Excluído | **Justificativa**: Devido ao trabalho 100% remoto, a filtragem é realizada via endpoints. |
| A.8.24 | Uso de criptografia | Sim | Implementado | Bancos de dados e volumes criptografados em repouso via chaves AWS KMS. |
| A.8.25 | Ciclo de vida de desenvolvimento seguro | Sim | Implementado | Processo integrado contendo análises estáticas de segurança (SAST/DAST). |
| A.8.26 | Requisitos de segurança de aplicativos | Sim | Implementado | Validações e tratamento de erros integrados nas definições de APIs da cliente. |
| A.8.27 | Princípios de engenharia e arquitetura de sistemas seguros | Sim | Implementado | Arquiteturas baseadas em microsserviços isolados com autenticação por token. |
| A.8.28 | Codificação segura (Secure Coding) | Sim | Implementado | Adoção do guia OWASP Secure Coding Practices no desenvolvimento de APIs. |
| A.8.29 | Testes de segurança em desenvolvimento e aceitação | Sim | Implementado | Testes de segurança de vulnerabilidades executados antes de cada release. |
| A.8.30 | Desenvolvimento terceirizado | Sim | Implementado | Requisitos contratuais de segurança aplicados às consultorias de TI. |
| A.8.31 | Separação dos ambientes de desenvolvimento, teste e produção | Sim | Implementado | Contas da AWS totalmente separadas para desenvolvimento e produção. |
| A.8.32 | Gestão de mudanças | Sim | Implementado | Mudanças de infraestrutura propostas via Git e aplicadas via pipeline CI/CD. |
| A.8.33 | Informações de teste | Sim | Implementado | Proibição do uso de dados de clientes reais para testes de desenvolvimento. |
| A.8.34 | Proteção de sistemas de informação durante testes de auditoria | Sim | Implementado | Testes de auditoria executados estritamente em ambiente sandbox sem impacto na API real. |
