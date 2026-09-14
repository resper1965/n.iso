# Documentação do nISO

Índice do que existe em `docs/`, agrupado por **quando você vai precisar**. Cada
linha diz o que o documento responde — não o que ele contém.

Para o essencial do projeto (o que é, como rodar, como publicar), a porta de
entrada é o [`README.md`](../README.md) da raiz.

---

## Estou de plantão e algo quebrou

| Documento | Responde |
|---|---|
| [`runbook-incidente.md`](runbook-incidente.md) | Produção não responde, deploy ruim, banco corrompido, alguém perdeu o segundo fator, suspeita de acesso indevido. Começa pelo "primeiro minuto" e vai até a comunicação. |
| [`staging.md`](staging.md) | O que existe de staging, e por quê: ensaiar migration. D1 não tem rollback, e uma migration que falha no meio só volta por restauração de backup. |

## Vou mexer no banco

| Documento | Responde |
|---|---|
| [`retencao.md`](retencao.md) | Quanto tempo cada tabela guarda dado, e por quê. A política que o cron executa vive em `src/manutencao.ts`; este documento explica cada prazo. Os dois não podem divergir. |
| [`drift-schema-conhecido.txt`](drift-schema-conhecido.txt) | A diferença aceita entre `schema.sql` e o D1 de produção, para o workflow semanal de drift não gritar por ruído conhecido. |

## Vou mexer em autenticação ou acesso

| Documento | Responde |
|---|---|
| [`sso-scim.md`](sso-scim.md) | Como funciona o login federado (OIDC) e o provisionamento SCIM 2.0 — inclusive a pergunta que toda revisão de fornecedor faz: quando alguém é desligado no IdP do cliente, o acesso aqui cai sozinho? |
| [`security-owasp-2026-08.md`](security-owasp-2026-08.md) | A aplicação avaliada contra o OWASP Top 10:2021, item a item, com o que foi corrigido e o que ficou. |
| [`portabilidade.md`](portabilidade.md) | O caminho de saída dos dados de um tenant (LGPD art. 18, V), e por que a assinatura do export é assimétrica. |

## Vou escrever ou depurar teste

| Documento | Responde |
|---|---|
| [`testing.md`](testing.md) | Como ler o resultado detalhado — qual teste caiu, em que linha, e quanto do código está coberto. |
| [`mcp-e2e-validation.md`](mcp-e2e-validation.md) | Roteiro manual de validação da integração MCP, com os papéis de consultor e auditor separados. |

## Quero entender uma decisão

| Documento | Responde |
|---|---|
| [`enterprise-grade-plan.md`](enterprise-grade-plan.md) | O plano que guiou o endurecimento do projeto: isolamento provado em vez de presumido, catraca de cobertura, contrato de API, staging, trilha, portabilidade. |
| [`backlog-plan.md`](backlog-plan.md) | Gaps e débitos técnicos com causa, correção, arquivos, esforço e risco — em ordem de execução. |
| [`api-triage-2026-08.md`](api-triage-2026-08.md) | Defeitos reportados no uso real da API v1, triados contra o código: corrigido, backlog, ou por design. |
| [`READINESS.md`](READINESS.md) | O estado de prontidão para produção, controle a controle. |

## Especificações de produto

| Documento | Responde |
|---|---|
| [`readiness-check-spec.md`](readiness-check-spec.md) | O Diagnóstico de Prontidão: a plataforma olhando o próprio estado e apontando lacunas. O que é, e o que deliberadamente **não** é. |
| [`journey-questionnaire-spec.md`](journey-questionnaire-spec.md) | O questionário da jornada e a interpretação coesa que o substitui. |

## Design

| Documento | Responde |
|---|---|
| [`design/handoff-ness-v1/`](design/handoff-ness-v1/) | O pacote de handoff visual da ness.: protótipos `.dc.html` navegáveis, tokens do design system e o patch de implementação. Metade das decisões só aparece em interação — abra os protótipos no navegador antes de mexer na UI. |
| [`../design.md`](../design.md) | Os princípios do design system aplicados no produto. |

## Gerado por script — não editar à mão

| Arquivo | Gerado por |
|---|---|
| [`openapi.json`](openapi.json) | `npm run openapi`, a partir dos schemas Zod que as rotas já usam. Editar à mão cria uma segunda fonte de verdade, e `test/openapi.test.ts` reprova a divergência. |
| [`export-public-key.json`](export-public-key.json) | A chave pública Ed25519 que verifica a assinatura dos exports de portabilidade. A privada é secret e nunca sai do Worker. |

---

## Onde está o resto

| Assunto | Lugar |
|---|---|
| Contexto canônico para quem (ou o que) for trabalhar no código | [`../AGENTS.md`](../AGENTS.md) |
| Princípios que não se negociam | [`../CONSTITUTION.md`](../CONSTITUTION.md) |
| Ambiente, verificação antes do PR, regras de schema e teste | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Como reportar vulnerabilidade e quais invariantes não podem regredir | [`../SECURITY.md`](../SECURITY.md) |
| O que mudou, versão a versão | [`../CHANGELOG.md`](../CHANGELOG.md) |
| Instalação e diagnóstico do servidor MCP | [`../mcp-server-niso/README.md`](../mcp-server-niso/README.md) |
