# Segurança do agente consultor

Este documento é para quem vai **mexer em rota, ferramenta ou autorização** e
precisa saber o que não pode quebrar. Ele responde três perguntas: contra quem o
agente é desenhado, quais invariantes seguram o desenho, e o que checar antes de
um PR que toque a superfície do agente.

Visão geral e uso: [`README.md`](README.md). Peças e fluxos:
[`arquitetura.md`](arquitetura.md).

---

## A decisão que explica todo o resto

O agente tem **o mesmo alcance do consultor humano, preso a um projeto**.

Não existe uma "API do agente" separada. Cada chamada do agente é uma requisição
interna às rotas `/api/v1/*` de sempre, feita pelo próprio Worker com um
principal especial. Por isso a segurança do agente é, quase toda, a segurança
das rotas — mais uma camada que diz **o que o agente não pode tocar** e **o que
ele só toca com confirmação**.

O principal que `resolverAgente` devolve tem três propriedades, e é bom saber de
cor por quê:

| Propriedade | Valor | Por quê |
|---|---|---|
| `role` | `client` | É o papel que todo o isolamento de tenant já conhece. O `projectAccessMiddleware` e o `requireResourceAccess` tratam `client` como "só o `client_project_id` dele". |
| `client_project_id` | o projeto escolhido no login | A fronteira. Um consultor humano com três clientes alcança os três; o agente alcança um. |
| `id` | o `users.id` **real** do consultor | Armadilha. Rota que age sobre "o usuário atual" age sobre a conta do consultor, que vale em todos os projetos. É a causa dos dois achados críticos de 30/09/2026 (abaixo). |

A terceira linha é o que mais surpreende. Se você criar uma rota de "minha
conta" (trocar senha, aceitar termo, ler notificação, configurar MFA), ela
**precisa** entrar na lista de rotas proibidas ao agente. A regra geral vem do
quadro acima: **toda rota que usa `user.id` sem `project_id` é suspeita**.

---

## Contra quem o agente é desenhado

| Quem | O que tenta | Como o desenho responde |
|---|---|---|
| **Um usuário de um cliente** (até um papel só de leitura) | Planta texto numa evidência, entrevista ou nota para induzir o agente do consultor a agir (injeção de prompt) | O agente só alcança o que o consultor alcança, num projeto. Ações destrutivas exigem confirmação no servidor. Rotas de acesso e conta ficam fora. Veja "Limites conhecidos". |
| **Terceiro na internet** | Abusar do OAuth: phishing de consentimento, roubo de código, repetir um pedido, adivinhar senha | Pedido de uso único com TTL de 10 min, bloqueio por tentativas compartilhado com o login, TOTP com reuso bloqueado, página que escapa tudo e roda sob o CSP global, que proíbe moldura (`frame-ancestors 'none'`, `src/index.ts`). |
| **Consultor revogado, rebaixado ou desligado** | Continuar usando um token ainda não expirado | A concessão é revalidada **a cada chamada**; trocar a senha revoga tudo. |
| **O próprio agente** | Sair do projeto, ampliar o próprio acesso, forjar identidade | Projeto é a fronteira por recurso, `/agentes` e conta pessoal são proibidos, a identidade só nasce de `env.AGENTE`. |

---

## Invariantes

Cada linha diz **o que não pode regredir**, onde o código garante, e qual teste
reprova a regressão. Se você alterar um destes pontos, o PR precisa explicar por
quê (mesma regra do [`SECURITY.md`](../../SECURITY.md)).

| # | Invariante | Onde é garantido | Teste |
|---|---|---|---|
| **I1** | A identidade do agente só existe em `env.AGENTE`, numa **cópia** do ambiente feita pelo `/mcp`. Nenhum cabeçalho, token ou parâmetro de requisição externa a cria. O cabeçalho de confirmação é inerte sem ela. | `src/mcp/servidor.ts` (`requisicaoInterna`), `src/middleware/auth.ts` | `agente-paridade` — "o cabeçalho de confirmação é inerte fora do agente" |
| **I2** | **O projeto é a fronteira.** Recurso de outro projeto não é lido nem alterado, nem por id direto nem por listagem global. | `role: 'client'` + `client_project_id`; `requireProjectAccess`, `requireResourceAccess` | `agente-paridade` — id direto, `/portfolio`, `/projects`, `/controls` |
| **I3** | O caminho é avaliado **decodificado**. `%`, `#`, `\`, segmentos `.` e `..` e qualquer caminho que o parser de URL reescreva são recusados antes da API. | `caminhoSeguro` (`servidor.ts`), `resolverAgente` | `agente-principal` — caminhos percent-encoded e de travessia |
| **I4** | Há uma lista fechada de rotas **fora do alcance** do agente (tabela abaixo), recusada mesmo com confirmação. | `FORA_DO_AGENTE` em `src/middleware/agente.ts` | `agente-paridade` — "rotas fora do alcance mesmo com confirmação" |
| **I5** | Ação destrutiva exige confirmação **imposta no servidor**: apagar (`DELETE`), `generate-policies-bulk`, `data-subject/erase`, `revoke-approval(s)`. Só o booleano `true` em `confirmado_pelo_usuario` vira o cabeçalho; o texto `"true"` não vale. Cada uma que passa grava `agente.exclusao` com o projeto. | `acaoDestrutiva`, `resolverAgente`, `genericas` (`servidor.ts`), hook em `auth.ts` | `agente-paridade`, `agente-ferramentas-genericas` |
| **I6** | O agente **não registra achado de auditoria** (ISO 27001, 9.2: quem implementa não audita). | `apiKeyRoleViolation('consultant', …)` em `src/auth-policy.ts` | `agente-paridade` — "escrita de auditor continua recusada" |
| **I7** | A concessão é revalidada **a cada chamada**: não revogada, não expirada (30 dias), conta ativa, papel consultor e **ainda designado** na governança do projeto. | `concessaoValida` (`agente.ts`), chamada pelo `/mcp` (401) e por `resolverAgente` | `mcp-remoto` — revogada, designação removida, expirada (401); `agentes-acesso` — o agente cai na chamada seguinte à revogação |
| **I8** | Trocar ou redefinir a senha revoga as concessões do usuário. | `revogarAgentesPorTrocaDeSenha` (`src/helpers.ts`) | `agente-principal` — "troca de senha derruba o agente" |
| **I9** | O fluxo OAuth usa a mesma contagem e o mesmo bloqueio do login do app; senha errada, conta inativa e papel sem acesso dão a **mesma** resposta; senha provisória barra a conexão; o escopo é fixo em `niso:consultor`; o pedido é de uso único. | `src/routes/oauth-autorizacao.ts`, `registrarFalhaLogin` (`routes/auth.ts`) | `oauth-autorizacao` |
| **I10** | `niso_skill` só lê de um mapa embutido. `nome` e `arquivo` **nunca** viram caminho de disco. | `skill()` em `servidor.ts` (`Object.hasOwn`) | `agente-skills` — nome inexistente, `../`, `..\` |
| **I11** | Segredo de integração não sai: a listagem de webhooks não devolve `secret`, e o export de portabilidade omite webhook, SSO, SCIM e `repository_token`. | `routes/integrations.ts`, `src/portabilidade.ts` | `webhooks-segredo`, `portabilidade` |

### O que está fora do alcance (I4) e por quê

| Rota | Motivo |
|---|---|
| `/users`, `/admin/users` | Gestão de usuários: controle de acesso, não conteúdo do SGSI. |
| `/dashboard` | Agrega todos os clientes. |
| `/assessments`, `/leads`, `/proposals` | Área comercial. |
| `/projects/:id/{sso,security-policy,scim-token,api-keys,webhooks}` e `/webhooks` | Configuração de segurança do cliente. O agente não amplia acesso. |
| `/auth/*`, `/legal/*`, `/notifications` | **Conta pessoal do consultor** (veja a terceira linha do primeiro quadro). |
| `/projects/:id/auditor-token` | Emitiria uma credencial externa de até 365 dias e permitiria forjar nota de auditor. |
| `POST /projects` | O agente é preso a um projeto; criar outro contradiz isso. `GET /projects` continua valendo, escopado. |
| `/agentes` | O agente não gere o próprio acesso. |

---

## Limites conhecidos

Documentar o que **não** é garantia é parte da segurança. Foi isso que a revisão
independente de 30/09/2026 avaliou e descartou como vulnerabilidade, e o motivo.

1. **A confirmação é do modelo.** O servidor exige o cabeçalho, mas não consegue
   distinguir um "sim" real do usuário de um "sim" que o modelo foi induzido a
   dizer. O controle que cobre isso é a **aprovação por chamada de ferramenta do
   cliente MCP** (Claude Code, Codex, Cursor), que mostra o método, o caminho e
   `confirmado_pelo_usuario: true` antes de executar — **desde que o consultor
   não tenha liberado a ferramenta de forma permanente**. Não a libere para
   `niso_executar`.
2. **Injeção de prompt por conteúdo.** O agente lê evidências, entrevistas e
   notas escritas por usuários do cliente. Um papel só de leitura consegue
   escrever alguns desses textos. O servidor não concede ao agente mais do que o
   consultor já tem, mas um modelo enganado age com a autoridade do consultor
   **dentro daquele projeto**. O dano fica contido por I2, I4, I5 e I6.
3. **O consentimento é a decisão do consultor.** A tela OAuth lista o que o
   agente faz. Se o texto ficar defasado, o consultor consente em cima de algo
   falso (já aconteceu entre o #221 e o #222). Mudou o alcance, mude o texto de
   `src/routes/oauth-autorizacao.ts` no mesmo PR.
4. **Concessões antigas ganham poderes novos sem novo consentimento.** O escopo
   é fixo em `niso:consultor`, então uma concessão emitida antes de uma mudança
   de alcance a herda. Mudança que **amplia** o alcance merece aviso aos
   administradores de cliente.
5. **`GET /projects/:id/export` é alcançável.** Devolve todo o conteúdo do
   projeto, como para qualquer membro. Desde o #222 ele não leva segredo de
   integração, e a ferramenta corta a resposta em 100.000 caracteres.

Achados da revisão final do #221, ambos provados por sonda e corrigidos antes
de chegarem à produção: `POST /auth/reset-password-first` (o agente definiria a
senha do consultor) e `POST /projects/:id/auditor-token` (credencial externa
de 365 dias). Veja I4.

---

## Antes de abrir um PR que toque a superfície do agente

Rota nova, ferramenta nova ou mudança de autorização. Responda, por escrito, na
descrição do PR:

1. **A rota age sobre a conta do usuário em vez de sobre o projeto?** (usa
   `user.id` sem `project_id`, lê ou grava algo "meu") → entra em `FORA_DO_AGENTE`.
2. **Ela guarda ou devolve credencial?** (chave, token, segredo, senha, código)
   → `FORA_DO_AGENTE`, e nunca na resposta de listagem.
3. **Ela amplia quem tem acesso?** (designar, convidar, criar usuário, emitir
   token) → `FORA_DO_AGENTE`.
4. **Ela é por id?** (`/:id` fora de `/projects/:projectId`) → chama
   `requireResourceAccess` antes de qualquer leitura ou escrita. Teste com o id de
   **outro** projeto.
5. **Ela destrói algo que o consultor não refaz?** → `acaoDestrutiva`.
6. **Mudou o que o agente consegue fazer?** → atualize o texto do consentimento
   (`oauth-autorizacao.ts`), `INSTRUCOES`/`ROTEIROS`/`MAPA_DA_APP`
   (`src/mcp/contexto.ts`) e a lista de "fora do alcance" aqui.
7. **Ferramenta nova?** Se for de escrita, entra em `ferramentas.ts` e herda o
   papel; se for só do servidor remoto, nasce em `servidor.ts` e **não** chama a
   API sem passar por `requisicaoInterna`.

Teste de portão: faça a chamada **como agente** (`env.AGENTE`, como em
`test/agente-paridade.test.ts`), com dois projetos semeados, e prove que o
segundo não aparece.

---

## Se algo der errado

| Situação | O que fazer |
|---|---|
| Suspeita de uso indevido de um agente | Revogue na tela de Governança do projeto, cartão "Agentes com acesso". Corta na **próxima chamada** (I7). |
| Conta do consultor possivelmente comprometida | Troque a senha: isso revoga **todas** as concessões dele (I8). Depois, siga o [`runbook-incidente.md`](../runbook-incidente.md). |
| Revogar todos os agentes de um consultor de uma vez | Faça backup (`npm run db:backup`) e rode no D1: `UPDATE agente_concessoes SET revogado_em = datetime('now'), revogado_por = 'incidente' WHERE user_id = '<id>' AND revogado_em IS NULL;` |
| Ver o que um agente fez | A trilha (`audit_logs`) guarda toda **escrita** com o ator `agente de <consultor> (<cliente> / <projeto>)`, e `agente.exclusao` para toda ação destrutiva. **Leitura não é registrada**: o único sinal é `ultimo_uso_em` da concessão. |

---

## Mapa dos testes que guardam o agente

| Arquivo | Guarda |
|---|---|
| `test/agente-principal.test.ts` | Identidade interna, caminhos codificados e de travessia. |
| `test/agente-paridade.test.ts` | Fronteira de projeto, lista fora do alcance, confirmação, trilha, direitos do titular. |
| `test/agente-ferramentas-genericas.test.ts` | `niso_ler` e `niso_executar`: binário, corte, confirmação booleana. |
| `test/agentes-acesso.test.ts` | Revogação, expiração, designação, listagem para o cliente. |
| `test/oauth-autorizacao.test.ts` | Login OAuth, MFA, bloqueio, escopo, texto do consentimento. |
| `test/mcp-remoto.test.ts` | Handshake, ferramentas listadas, 401 após revogar. |
| `test/agente-skills.test.ts` | Módulo embutido em dia, `niso_skill` sem vazamento, roteiro 4. |
| `test/agente-gap-traceability.test.ts` | Diagnóstico acima de 100 controles, edição parcial de risco. |
| `test/webhooks-segredo.test.ts`, `test/portabilidade.test.ts` | Segredo de integração fora da listagem e do export. |
