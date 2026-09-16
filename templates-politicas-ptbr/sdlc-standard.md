# [Organization Name] — Norma de Desenvolvimento Seguro de Software
**Identificação:** STD-DEV-001 | **Classificação:** Interno | **Versão:** 1.0

---

## 1. Objetivo (ISO/IEC 27001:2022, Anexo A.8.25)
Definir as exigências técnicas de segurança e os pontos de verificação obrigatórios no desenvolvimento de software da [Organization Name].

## 2. Fases e exigências
### 2.1 Concepção e planejamento
- **Modelagem de ameaças:** obrigatória para toda funcionalidade que trate dado pessoal ou financeiro.
- **Requisitos de segurança:** definidos antes do início do desenvolvimento.
- **Avaliação de biblioteca de terceiro:** verificação de licença e de vulnerabilidade conhecida.

### 2.2 Desenvolvimento
- **Revisão de código:** revisão por par obrigatória em toda solicitação de integração.
- **Análise estática:** executada automaticamente na esteira, bloqueando a integração em achado crítico.
- **Gestão de segredo:** nenhuma credencial no código; uso de cofre de segredos.

### 2.3 Teste e garantia da qualidade
- **Segregação de ambientes:** desenvolvimento, teste e produção separados.
- **Dado de teste:** dado real de cliente não é usado em teste sem descaracterização.
- **Análise dinâmica:** varredura automatizada no ambiente de homologação.

### 2.4 Publicação
- **Gestão de mudança:** publicação em produção exige aprovação registrada do responsável técnico.
- **Plano de reversão:** obrigatório em toda publicação.
- **Mudança emergencial:** registrada em até um dia útil, com justificativa.

## 3. Registros gerados
Resultado das análises, aprovações de revisão de código e registro de cada publicação — são a evidência auditável desta norma.

## 4. ## Controle de versões
| Versão | Data da revisão | Alteração | Autor | Aprovado por |
|---------|-----------------|-----------|-------|--------------|
| 1.0     | {{date_modified}} | Emissão inicial | n.iso | {{approver}} |

---
**Situação:** {{status}} | **Próxima revisão:** {{next_review_date}}
