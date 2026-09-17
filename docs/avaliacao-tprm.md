# Avaliação — TPRM sobre a infraestrutura existente do nISO

**Pergunta avaliada:** é possível entregar TPRM (Third-Party Risk Management)
no nISO **sem criar um sistema paralelo**, reusando os motores que já existem?

**Veredito:** sim. O nISO já tem, separadamente, todos os motores que um TPRM
precisa — inventário, questionário com token público, evidência com hash e
aprovação, registro de risco, plano de ação, agenda de reavaliação, webhooks,
trilha e agentes de IA. O que **não** existe é o vínculo entre eles e o módulo
de fornecedores: `vendors` é hoje uma ilha. TPRM aqui é trabalho de **ligação**,
não de construção. Um módulo novo seria duplicação pura.

Este documento é avaliação, não plano aprovado. Toda afirmação abaixo tem
referência de arquivo/linha conferida no commit em que foi escrita.

---

## 1. O que já existe (inventário com evidência)

| Capacidade | Onde | Estado |
|---|---|---|
| Cadastro de fornecedor (KYV) | `schema.sql:469` (`vendors`), `src/routes/vendors.ts`, UI em `frontend/src/views/grc.js:468` | CRUD completo, 105 linhas |
| Trust score + nível de diligência | `src/routes/vendors.ts:11-29` | 10 checkboxes autodeclarados |
| Motor de questionário com token público | `src/routes/assessments.ts:152,171` (`GET/POST /public/:token`), `assessments` + `assessment_answers` (`schema.sql:105,120`) | Funciona — hoje amarrado ao discovery comercial (`lead_id`) |
| Banco de perguntas versionado por chave imutável | `src/phase-questions.ts:12-40` | Padrão pronto para um banco TPRM |
| Evidência com SHA-256, R2, avaliação e dupla aprovação | `schema.sql:336` (`evidence`), `src/routes/evidence.ts` | FK só para `control_id` |
| Portal externo com escopo e expiração | `schema.sql:372` (`auditor_tokens`), `src/routes/auditor.ts` | Padrão pronto para o portal do fornecedor |
| Registro de risco (I×P, histórico) | `schema.sql:436,458` (`risks`, `risk_history`), `src/routes/risks.ts` | Sem vínculo com fornecedor |
| Plano de ação / CAPA | `schema.sql:557` (`corrective_actions`) | Já referencia `risk_id`, `control_id`, `audit_id` — não `vendor_id` |
| Agenda de auditoria / recorrência | `schema.sql:542` (`audit_schedule`) | `audit_type` é livre — cabe `vendor_review` |
| Notificações e webhooks | `schema.sql:389,593`, `src/routes/integrations.ts:189-260` (com guarda SSRF) | Prontos |
| SoA A.5.19–A.5.23, A.8.30 e 27701 A.1.10/A.2.3/A.2.11 | `src/services/soa-logic.ts:104,135-139,217,235,250,258` | Aplicabilidade já decidida por `thirdParty` |
| Políticas de terceiros | `src/templates/policies/v2022/supplier-policy.md`, `vendor-risk-assessment.md`, mapeadas em `src/services/policy-generator.ts:18` | Prontas |
| Privacidade: destinatários, transferência internacional, DPIA | `schema.sql:514` (`ropa_records`), `dpia_assessments` (`schema.sql:829`) | Sem vínculo com fornecedor |
| Agentes de IA (assessment, evidence) | `src/agents/` | Reusáveis para pontuar resposta de fornecedor |
| Trilha, portabilidade, RBAC e isolamento multi-tenant | `audit_logs`, `src/trilha.ts`, `src/portabilidade.ts`, `src/middleware/project-access.ts`, `src/middleware/auth.ts:288` | Cobrem qualquer rota nova sob `/api/v1/projects/:projectId/*` sem código adicional |

---

## 2. Lacunas reais

Ordenadas por consequência, não por esforço.

**G1 — O trust score não sustenta uma decisão.**
`calculateTrustScore` (`src/routes/vendors.ts:11-23`) soma 10 booleanos que o
consultor marca pelo fornecedor. Nenhum deles exige evidência, e o mesmo peso
vale para quem processa dado pessoal crítico e para quem entrega café.

**G2 — A diligência está invertida.**
`diligenceLevel` (`src/routes/vendors.ts:26-30`) deriva o nível de diligência do
score. Em TPRM é o contrário: o nível de diligência deriva da **criticidade do
que o terceiro acessa** (o que define a profundidade do questionário), e o score
é resultado. Hoje um fornecedor que se autodeclara bem sai como "Low diligence".

**G3 — Não há ciclo de reavaliação.**
`vendors.last_assessment_date` existe no schema (`schema.sql:480`) e **não é
lido nem escrito em lugar nenhum** do backend ou do frontend (grep vazio).
A.5.22 (monitoramento e revisão de serviços de fornecedores) não tem como ser
evidenciado.

**G4 — Vendor é uma ilha.**
Nenhuma FK liga `vendors` a `risks`, `evidence`, `corrective_actions`,
`ropa_records`, `dpia_assessments` ou `compliance_controls`. Risco de terceiro
não entra na matriz de risco; certificado de fornecedor não vira evidência de
A.5.19; achado não vira CAPA.

**G5 — A coleta é interna.**
Não existe caminho para o **fornecedor** responder. O consultor digita por ele —
o que descaracteriza a evidência.

**G6 — Sem ciclo de vida e sem 4ª parte.**
`vendors.status` é texto livre com default `'Active'`; não há
onboarding → ativo → remediação → offboarding, nem revogação de acesso no
desligamento. Não há sub-fornecedor/cadeia ICT (A.5.21) nem sub-operador
(27701 A.2.3/A.2.11), embora a SoA já marque esses controles como aplicáveis.

**G7 — O sinal `thirdParty` da SoA não vê o inventário.**
`soa-logic.ts:104` decide por `a.hasThirdPartyAccess || a.vendors.length > 0`,
vindo das respostas de discovery — não do inventário real de `vendors`. Projeto
com 30 fornecedores cadastrados e discovery em branco marca A.5.19 como não
aplicável.

**G8 — Higiene de dados e testes.**
`vendors.project_id` é `TEXT REFERENCES projects(id)` sem `NOT NULL` e sem
`ON DELETE` (`schema.sql:470`) — ficou de fora do endurecimento das migrations
0018/0021, que trataram as demais tabelas com escopo de projeto. A tabela só
aparece na `0003_sprint4_modules.sql`. Não há teste algum cobrindo `vendors`
(nenhum arquivo em `test/` ou `src/routes/*.test.ts` menciona vendor).

---

## 3. Mapa de reuso — cada necessidade TPRM em um motor que já existe

Nenhuma linha desta tabela pede motor novo.

| Necessidade TPRM | Motor existente | O que falta |
|---|---|---|
| Inventário e tiering | `vendors` | Colunas de criticidade/tier e ciclo de vida |
| Questionário ao fornecedor | `assessments` + `assessment_answers` + token público | Banco de perguntas TPRM no padrão de `phase-questions.ts` e vínculo `vendor_id` |
| Acesso do fornecedor | padrão de `auditor_tokens` (escopo + expiração) | Emissão do token para vendor |
| Prova documental | `evidence` (R2, SHA-256, `evaluation_status`, dupla aprovação) | `vendor_id` anulável |
| Risco de terceiro | `risks` + `risk_history` | `vendor_id` anulável |
| Remediação | `corrective_actions` | `vendor_id` anulável (já tem os outros três) |
| Reavaliação periódica | `audit_schedule` + `notifications` + `webhooks` | `audit_type='vendor_review'` e uso de `last_assessment_date` |
| Cláusulas contratuais (A.5.20) | `supplier-policy.md`, `legal_documents` | Ligação vendor→documento |
| Privacidade / sub-operador | `ropa_records`, `dpia_assessments` | `vendor_id` anulável |
| Evidência de SoA A.5.19–A.5.23 | `soa-logic.ts` | Alimentar `thirdParty` do inventário (G7) |
| Pontuação assistida | `src/agents/assessment.ts`, `evidence.ts` | Prompt/rubrica de fornecedor |
| Trilha, RBAC, tenant, exportação | já globais | Nada |

---

## 4. Custo estimado da ligação

Para fechar G1–G8, sem módulo novo:

- **1 migration** — colunas em `vendors` (tier/criticidade, ciclo de vida,
  `parent_vendor_id` para 4ª parte, `next_review_date`), `vendor_id` anulável em
  `risks`, `evidence`, `corrective_actions`, `ropa_records`, e o endurecimento de
  `project_id` (G8). Aditiva; nada é recriado.
- **~1 arquivo de perguntas** no padrão de `phase-questions.ts`, com profundidade
  por tier.
- **~200 linhas** em `src/routes/vendors.ts` (emissão de token, recepção de
  respostas, cálculo de risco a partir das respostas + evidência, agendamento da
  próxima revisão).
- **1 ajuste** em `soa-logic.ts` para o sinal `thirdParty`.
- **Testes** — hoje a cobertura de `vendors` é zero; qualquer mudança aqui entra
  com teste, conforme `CONSTITUTION.md` §"Review Cycles & TDD".

Ordem sugerida, cada etapa entregando valor sozinha:
1. G8 + testes (base segura para mexer).
2. G2 + G1: tier primeiro, score depois, com peso por criticidade.
3. G4: as FKs anuláveis — é o que tira o módulo do isolamento.
4. G5 + G3: portal do fornecedor e ciclo de reavaliação.
5. G7 + G6: SoA alimentada pelo inventário; ciclo de vida e 4ª parte.

---

## 5. Decisões em aberto

1. **Tier vem de onde?** Do que o terceiro acessa (vínculo com `assets`, que já
   tem `criticality` e notas C/I/D em `schema.sql:417`) ou de um campo próprio?
   O vínculo com `assets` é mais fiel e reusa mais; custa uma tabela de junção.
2. **Escopo do fornecedor:** por projeto (como hoje) ou por organização, com
   reuso entre projetos? Hoje `vendors.project_id` força o primeiro, e o mesmo
   fornecedor é recadastrado a cada projeto.
3. **Questionário:** estender `assessments` (que hoje pressupõe `lead_id` e
   precificação) ou usar as mesmas tabelas com um discriminador de tipo? A
   segunda opção evita contaminar o fluxo comercial.

Nenhuma das três impede começar pela etapa 1.
