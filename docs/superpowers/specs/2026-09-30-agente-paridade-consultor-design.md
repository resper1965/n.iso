# Agente com paridade de consultor, preso a um projeto

Data: 2026-09-30 · Estado: aprovado em conversa, aguardando revisão da spec

## Problema

O agente conectado pelo MCP remoto (spec 2026-09-29-receita-agentes-mcp-remoto)
enxerga uma fração da app: controles, riscos, lista de evidências e diagnósticos.
Não lê políticas, conteúdo de evidência, trilhas de entrevista, respostas das
fases, ROPA, DPIA, ativos, fornecedores, treinamento, auditorias, CAPA,
governança nem certificação. E escreve menos que o consultor humano: não apaga
nem gera em lote.

Consequência observada no uso real (projeto de cliente, 2026-09-30): o agente gravou
evidências citando outro cliente, não conseguia relê-las para conferir e não
conseguia apagá-las; o administrador teve de apagar 27 registros à mão. Ele
também declarou não ter lido as políticas existentes — não havia ferramenta.

## Decisões (tomadas pelo usuário)

1. **Paridade com o consultor humano**, em leitura E escrita, inclusive apagar
   e gerar em lote.
2. **Preso a UM projeto** — o escolhido no login OAuth. Cliente com dois
   projetos = duas conexões. Evita misturar documentos e achados entre projetos.
3. **Trilha comercial fora.**
4. "Trilhas" = trilhas de entrevista/avaliação do cliente.

## Desenho

### 1. Identidade: isolada por projeto, com capacidades de consultor

O papel `consultor` na app é staff: `requireResourceAccess` e
`requireProjectAccess` (`src/helpers.ts`) liberam **todos** os projetos para ele.
Entrar com esse papel faria o agente vazar entre projetos.

Por isso o principal do agente continua sendo o que `resolverAgente`
(`src/middleware/agente.ts`) já monta — `role: 'client'` +
`client_project_id` = projeto da conexão. É esse par que todo o isolamento de
tenant da app usa (portfólio, `/projects`, `/controls`, ativos, acesso por
recurso), então a trava de projeto vale em todas as rotas sem código novo.

O que muda é o que ele pode fazer dentro do projeto:

| Hoje em `resolverAgente` | Passa a ser |
|---|---|
| DELETE recusado | permitido **com confirmação** (seção 3) |
| `generate-policies-bulk` recusado | permitido **com confirmação** |
| `/agentes` recusado | continua recusado — o agente não gere o próprio acesso |
| escrita de auditor recusada (`apiKeyRoleViolation('consultant')`) | continua — o consultor humano também não registra achado (independência 9.2) |

Rotas que checam papel e onde o `client` fica aquém do consultor, decididas uma a uma:

| Rota | Consultor humano | Agente |
|---|---|---|
| `/projects/:id/data-subject` (direitos do titular) | sim | **sim** — é trabalho de adequação LGPD; o principal ganha a marca `agente: true` e `PAPEIS_AUTORIZADOS` a aceita |
| `/users`, `/admin/users` | sim | **não** — controle de acesso, não conteúdo do SGSI |
| `/dashboard` global | sim | **não** — agrega todos os clientes |
| `/assessments` (diagnóstico/proposta) | sim | **não** — trilha comercial |
| `/projects/:id/sso`, `security-policy`, `scim-token`, `api-keys`, `webhooks` | sim | **não** — configuração de segurança do cliente; o agente não amplia acesso |

As recusas da última coluna ficam numa lista única em `resolverAgente`, com o
motivo, no mesmo estilo das recusas atuais.

### 2. Ferramentas

As ferramentas tipadas de `mcp-server-niso/src/ferramentas.ts` ficam — guiam o
modelo nos casos comuns. Entram duas genéricas, **só no servidor remoto**
(`src/mcp/servidor.ts`, como a `niso_contexto`), porque dependem do principal
de agente:

- `niso_ler({ caminho })` — GET em qualquer caminho `/api/v1/...`. Resposta JSON
  ou texto volta como texto; binário (PDF, planilha, imagem) volta como
  `{ tipo, tamanho, observacao: "binário: abra na interface" }` — extração de PDF
  é outra entrega.
- `niso_executar({ metodo, caminho, corpo?, confirmado_pelo_usuario? })` —
  POST, PUT, PATCH, DELETE.

As duas passam pelo `caminhoSeguro` já existente e pelo mesmo `app.fetch`
interno; toda a autorização é a da seção 1. Nenhuma lista de rotas paralela:
tela nova para o consultor vira alcance do agente sem PR.

`niso_contexto` ganha o **mapa da app** (texto em `src/mcp/contexto.ts`): cada
área com caminho e verbo — trilhas de entrevista (`/projects/{id}/interviews/:track`,
`/interviews/summary`), respostas das fases, dossiê da jornada, controles e
versões de política, evidências (`/evidence/:id/content`), riscos, ativos,
fornecedores, treinamento, ROPA, DPIA, auditorias, CAPA, governança (contexto,
partes interessadas, análise crítica, métricas, ciência de política),
certificação, mudanças de escopo, direitos do titular. `INSTRUCOES` segue ≤ 2048
caracteres; o mapa vai no corpo da ferramenta, não nas instruções.

### 3. Proteções equivalentes às do humano

A interface pede confirmação antes de apagar; o agente terá o mesmo, imposto no
servidor:

- DELETE e `generate-policies-bulk` exigem `confirmado_pelo_usuario: true`.
  O servidor MCP repassa isso ao `app.fetch` interno num cabeçalho
  (`X-Agente-Confirmado: 1`) e `resolverAgente` recusa sem ele (403, mensagem
  mandando perguntar ao usuário). O cabeçalho só tem efeito com `env.AGENTE`,
  que requisição externa não controla — de fora ele é inerte.
- As instruções mandam mostrar ao usuário o que será apagado (nome, id) e
  esperar o "sim" antes de enviar a confirmação.
- Trilha: ator `agente de <consultor> (<cliente> / <projeto>)`; toda exclusão
  registra `project_id` (hoje `evidence.deleted` não registra —
  `src/routes/evidence.ts:117`, corrigido junto).
- O cliente MCP (Claude Code, Codex, Cursor) pede aprovação por chamada de
  ferramenta — segunda trava, fora do nosso controle.

### 4. O que não muda

- Login OAuth, concessão, revogação, expiração e a checagem de designação a
  cada requisição (`concessaoValida`).
- Evidência binária continua entrando pela interface.
- Servidor MCP local (`mcp-server-niso`, chave de API): sem as ferramentas
  genéricas.

## Testes

Integração real no D1 (`cloudflare:test`), chamando como agente via
`env.AGENTE`, com dois projetos semeados (A = conexão, B = outro cliente):

1. `niso_ler` lê política, conteúdo de evidência, trilha de entrevista, ROPA de A.
2. `niso_ler` em qualquer recurso de B → 403/404, inclusive por id direto
   (`/evidence/<id de B>`, `/risks/<id de B>`) e pelo portfólio (só A aparece).
3. DELETE sem confirmação → 403; com confirmação → apaga, trilha com `project_id`.
4. `generate-policies-bulk` idem.
5. Rotas da lista de recusa (users, dashboard, assessments, sso, api-keys,
   webhooks, agentes) → 403 mesmo com confirmação.
6. Escrita de auditor → 403.
7. `X-Agente-Confirmado` numa requisição externa (sessão humana ou chave de
   API) não muda nada.
8. `niso_ler` de evidência binária devolve metadados, não bytes.
9. Direitos do titular funcionam para o agente em A e não em B.

## Fora de escopo

- Extração de texto de PDF/planilha.
- Regras novas de verificação normativa (ampliar `coherence_check`) — entrega
  seguinte, depois que o agente enxergar tudo.
- Troca de projeto sem refazer o login.

## Documentação a atualizar

- `mcp-server-niso/README.md` e a tela "Conectar agente": o agente tem paridade
  de consultor num projeto; apagar pede confirmação.
- `CLAUDE.md` da pasta de trabalho do cliente (fora do repo): remover "você não
  apaga, não gera em lote"; trocar por "apagar e lote: mostre e peça confirmação".
- `AGENTS.md`: seção do MCP remoto (hoje ausente) e última migration (0034).
