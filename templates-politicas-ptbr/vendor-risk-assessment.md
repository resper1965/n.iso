# [Organization Name] — Avaliação de Risco de Fornecedor
**Fornecedor:** {{vendor_name}} | **Identificação:** VRF-{{vendor_id}} | **Data:** {{date_modified}}
**Classificação:** Interno | **Situação:** {{status}}

---

## 1. Resumo (ISO/IEC 27001:2022, Anexo A.5.19)
Este relatório avalia a postura de segurança da informação e de privacidade de **{{vendor_name}}** para decidir sobre a sua contratação pela [Organization Name].

## 2. Certificações declaradas
- **ISO/IEC 27001 vigente:** {{has_iso_27001}}
- **ISO/IEC 27701 vigente:** {{has_iso_27701}}
- **Relatório de auditoria independente disponível:** {{has_soc2}}

## 3. Avaliação
| Categoria | O que foi verificado | Resultado |
| :--- | :--- | :--- |
| Localidade do dado | Onde o dado é armazenado e processado | [país] |
| Criptografia | Proteção em trânsito e em repouso | [mecanismo] |
| Controle de acesso | Mínimo privilégio e verificação em duas etapas | [situação] |
| Subcontratação | O fornecedor usa subprocessadores? Quais? | [lista] |
| Resposta a incidente | Prazo contratual de comunicação | [prazo] |
| Continuidade | Plano testado e parâmetros de recuperação | [situação] |
| **Risco geral** | **Nível de prontidão** | **{{trust_score}}%** |

## 4. Criticidade atribuída
- **Nível 1 — crítico:** acesso a dado sensível ou ao ambiente de produção. Exige auditoria anual.
- **Nível 2 — médio:** exige autoavaliação respondida e revisada.
- **Nível 3 — baixo:** sem acesso a dado ou sistema.

## 5. Recomendação
- **[ ] Aprovado:** sem risco significativo identificado.
- **[ ] Aprovado com ressalva:** aprovação condicionada a [ex. assinatura de acordo de tratamento de dados].
- **[ ] Reprovado:** risco elevado aos objetivos de segurança e privacidade.

## 6. Reavaliação
Próxima avaliação em [prazo conforme criticidade]. Mudança relevante no serviço ou incidente no fornecedor antecipa a reavaliação.

---
**Avaliado por:** {{policy_owner}} | **Aprovação final:** {{approver}}
