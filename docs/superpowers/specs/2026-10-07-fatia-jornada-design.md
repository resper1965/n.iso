# Fatia de jornada: o ciclo da certificação de ponta a ponta

**Estado:** aprovada pelo dono em 2026-10-07 ("sim, muito"). Vem antes do núcleo do n.privacy.

**Objetivo:** um projeto novo, vendido pelo fluxo comercial, chega à certificação usando só o produto:
1. nasce com controles e governança;
2. tem política assinada por quem pode assinar;
3. guarda evidência ligada ao controle;
4. entrega ao auditor externo o que ele pede.

## 1. Diagnóstico (2026-10-07, main `b8c9ff1`)

Três levantamentos, só leitura: rotas × telas, jornadas de ponta a ponta e uso em produção.

- **Uso em produção:**
  - 4 projetos e 14 usuários;
  - `pedidos`, `propostas`, `auditor_tokens`, `policy_acknowledgments`, `project_interviews` e `scope_changes` com **0** linhas;
  - controles 229, evidências 189, checklist 197.
- **Por que os defeitos ficam invisíveis:**
  - não há teste do contrato tela↔API: os testes de frontend simulam o formato que a tela espera;
  - `api()` (`frontend/src/api.js:78-85`) devolve só o primeiro campo que for lista quando a resposta tem `ok:true`, e descarta o resto sem erro;
  - há três formatos de id de controle em produção (`ctrl-a51`, `A.5.1`, `ctrl_b_a51`) e duas listas de checklist (`src/constants.ts` com 132 itens e `src/checklists.ts` com 198).

**Confirmado no código pelo controlador:**
- `handleControlApprove` (`src/routes/controls.ts:252-303`) só grava `status='Approved'`: não registra CISO/CEO e não consulta a matriz de governança.
- O modal de política (`frontend/src/views/compliance.js:1694-1720`):
  - chama `GET /projects/:p/controls/:c/policy`, que não existe;
  - cai num fallback por `ctrl-<código>`;
  - "Imprimir PDF" chama `/policy/report`, que também não existe.
- O questionário de autoatendimento chama `/api/v1/public/assessment/:token`. A rota real é `/api/v1/assessments/public/:token`.
- Pela leitura de `api()`, os consumidores que leem um campo além da lista recebem `undefined`.

**Relatados pelos levantamentos, com arquivo:linha; cada plano confere antes de mexer:**
- consumidores do `api()` que leem o campo errado: fases/config, entrevistas, certificação, notas do auditor, rastreabilidade da SoA, templates, migração 27701, análise de lacunas;
- o histórico do chat de IA e "Limpar histórico" chamam rotas inexistentes;
- o logout não encerra a sessão no servidor;
- evidência entra `conforming` sem revisão e sem `control_id` pelos três caminhos de documento (upload, assistente, geração por IA);
- itens de checklist da tela dão 404 ao gerar documento;
- o upload pelo checklist não marca o item;
- o projeto nascido da venda não ganha controles, governança além do consultor, nem o escopo vendido;
- o aceite sem consultor deixa o projeto invisível;
- o auditor externo não tem tela para receber o token nem portal;
- o que a API do auditor devolve vem sem o vínculo evidência→controle e sem a SoA.

## 2. Planos (executados nesta ordem)

| # | Plano | Entrega |
|---|---|---|
| P1 | Contrato tela↔API | Teste que reprova chamada do frontend sem rota no backend. `api()` deixa de descartar campos e os consumidores são corrigidos. Rotas que faltam: autoatendimento, histórico do chat, logout no servidor. |
| P2 | Política assinada de verdade | A assinatura de política grava CISO/CEO pela matriz de governança, como ROPA e DPIA. O modal e o relatório da política acham o controle em qualquer formato de id. Restaurar versão zera as aprovações. |
| P3 | Projeto nasce completo | Fechar a venda semeia os controles (`semearControles`), copia o escopo vendido, registra o contato do aceite na governança e avisa a consultoria quando não há consultor. |
| P4 | Evidência ligada ao controle | Evidência de documento entra pendente de revisão e ligada a controle quando o item tem controle. Uma lista de checklist só. O upload pelo checklist marca o item. |
| P5 | Portal mínimo do auditor | Gerar, listar e revogar o token pela tela do projeto. Página do auditor com SoA, evidências por controle e download. |

## 3. Decisões que valem para todos os planos

- **Ponytail:** o menor diff que resolve, reusando `setParcial`, `refForaDoProjeto`, `idDoControle`, `semearControles`, `autoridadeDeAssinatura`/`recusaDeAssinatura`, `logAudit` e `erro500`.
- **Prova imutável:** nada reescreve prova de `pedidos`/`pedido_destinatarios`. Valem os triggers `pedido_prova_imutavel` e `pedido_dest_prova_imutavel`, e o teste `test/pedidos-prova.test.ts`.
- **Multi-tenant:** toda consulta fica presa ao projeto, e toda FK nova é validada no projeto.
- **Código novo sem `any`:** `test/any-catraca.test.ts` (TETO 557) reprova se o número subir.
- **Frontend:** CSP `script-src 'self'`, sem handler nem script inline, eventos por `data-action` e `escapeHTML` em todo dado interpolado.
- **Arquivos em UTF-8 sem BOM.**
- **Schema muda em `schema.sql` e numa migration** (a próxima é a 0045), conforme `migrations/README.md`. Migration remota é ação do dono.
- **Escrita em produção** só com "sim" explícito do dono.
- **Texto da ISO não entra** no produto; só referência e título de trabalho.

## 4. Fora desta fatia

- Prazos e lembretes: não há cron de alerta hoje. Viram uma fatia própria.
- Tela de direitos do titular, incidentes e LIA: ficam com o n.privacy.
- Criação automática da conta do cliente na venda: envolve convite por e-mail e senha, e é decisão do dono. P3 só registra o contato.
- Menu para Métricas e Certificação, e remoção de código morto (`proposals` legado, funções sem botão).

## 5. Critério de pronto da fatia

Um projeto criado pelo aceite de uma proposta, em staging ou num teste de integração, percorre o ciclo sem passo fora do produto:
1. tem os controles;
2. o consultor gera e edita uma política;
3. a direção assina a política e a assinatura fica gravada;
4. a evidência é enviada pelo checklist, fica ligada ao controle e é revisada;
5. o auditor recebe um link e vê a SoA com a evidência de cada controle.
