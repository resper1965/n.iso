# Receita dos agentes: MCP remoto com login no nISO

> **Estado (2026-10-01): implementada e, em parte, superada.** O OAuth, a concessão, a
> revalidação a cada chamada e a revogação seguem como descritos aqui. A regra "o agente
> não apaga e não gera em lote" foi **substituída** em 30/09/2026: o agente passou a ter o
> alcance do consultor, preso a um projeto, com confirmação para as ações destrutivas
> ([spec](2026-09-30-agente-paridade-consultor-design.md)). O estado atual está em [`docs/agente/`](../../agente/README.md).

Data: 2026-09-29. Decisões tomadas em conversa; esta spec as consolida.

## Objetivo

O consultor da ness. usa um agente de IA (Claude Code, Codex, Cursor ou
Antigravity) para conduzir a adequação de um cliente, **sem compilar nada e sem
copiar chave**: adiciona um endereço uma vez, entra com a conta do nISO, escolhe
o cliente, e o agente já sabe quem é, em que cliente está e o que pode fazer.

## Fora de escopo (desta spec)

- **Auditor.** Não existe conta humana de auditor no nISO (o auditor externo usa
  link com token). O agente auditor segue pelo `mcp-server-niso` local com chave
  `auditor` emitida pelo `platform_admin`, como hoje. Spec própria quando houver
  conta de auditor.
- **Troca de cliente na conversa.** Um cliente por conexão (decisão "um tenant
  por configuração"). Revisitar depois da camada MSP.
- **Prompts MCP.** Só confirmados no Claude Code; os roteiros vão por ferramenta.
- **Remover o `mcp-server-niso` local.** Continua para integrações e auditor.

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Onde o agente roda | Fora do nISO: Claude Code, Codex, Cursor, Antigravity |
| Tenant | Um cliente por conexão, escolhido no login |
| Escopo do consultor | Só clientes onde ele consta como `consultor` na governança do projeto (designação protegida no #210) |
| Direitos | Escrita de adequação (`consultant`); sem achado de auditoria (ISO 27001 9.2) |
| Proporcionalidade | Sem apagar e sem geração em lote pelo agente; credencial de curta duração |
| Cliente | O `org_admin` vê os agentes com acesso ao projeto dele e revoga |
| Autoria | A trilha registra o humano por trás do agente |

## Arquitetura

```
cliente MCP ──HTTP──▶ niso.ness.com.br/mcp ──▶ mesmo Worker (Hono)
     │                      │
     │  OAuth 2.1           ├─ /authorize : login nISO (senha + MFA) + escolha do cliente
     └─ (navegador) ────────┤─ /token     : access 1 h, refresh até 30 d
                            └─ ferramentas ─▶ rotas /api/v1/* internas, como o
                                              ator do token
```

1. **Servidor MCP remoto no próprio Worker**, transporte Streamable HTTP em
   `/mcp`. Mesmo deploy, mesma base de código, sem processo local.
2. **OAuth 2.1** com `@cloudflare/workers-oauth-provider` (registro dinâmico de
   cliente, PKCE). Estado dos grants num KV novo (`OAUTH_KV`), declarado no
   `wrangler.jsonc`.
3. **Tela de autorização** servida pelo nISO: reaproveita o login existente
   (senha, MFA, Turnstile) e mostra a lista de clientes onde a pessoa é
   consultora na governança. Ela escolhe **um**; o grant nasce preso a
   `(usuário, projeto, papel=consultant)`.
4. **Ferramentas**: as 22 do `mcp-server-niso` portadas para chamar as rotas
   internas (`app.fetch` com o ator do token), com o mesmo filtro por papel. Um
   módulo compartilhado evita duas listas divergentes.
5. **`niso_contexto`**: porta de entrada. Devolve cliente (nome, normas, fase),
   papel, o que pode e não pode, e os roteiros. As `instructions` do servidor
   dizem "comece por `niso_contexto`" (≤ 2.048 caracteres, limite do Claude Code).

## Roteiros (devolvidos por `niso_contexto`)

1. **Diagnóstico**: `get_project` → `gap_analysis` → `traceability`. Para numa
   lista de lacunas priorizada. Não escreve.
2. **Fechar lacuna**: controle → `list_evidence` → rascunho → **aprovação
   humana** → `create_evidence` / `update_control` / `generate_policy`. Para
   quando o controle tem evidência vinculada.
3. **Responder auditoria**: notas em `audit_pack` → rascunho → **aprovação
   humana** → `respond_auditor_note`.

## Autorização (servidor, não só o MCP)

Novo tipo de principal: **agente**, derivado do grant OAuth.

- `role` efetivo `client` escopado ao projeto do grant (herda o isolamento do
  `projectAccessMiddleware`), com permissão de escrita `consultant`.
- **Recusado ao agente**: todo `DELETE`; `POST .../generate-policies-bulk`;
  escrita de auditoria (`apiKeyRoleViolation` já cobre).
- A cada chamada o servidor revalida que o usuário **ainda** consta como
  consultor na governança do projeto e que a conta está ativa. Designação
  removida derruba o agente na chamada seguinte.
- Ator na trilha: `agente de <email> (<nome do cliente>)`.

## Visibilidade para o cliente

Nova seção no projeto, para `org_admin`: **Agentes com acesso** — consultor,
desde quando, último uso, validade. Botão **Revogar** (apaga o grant). Emissão e
revogação vão para a trilha.

## Configuração por cliente MCP (vai no README e na tela)

Um endereço só: `https://niso.ness.com.br/mcp`. A página mostra o trecho de
cada ferramenta. **Verificar no plano**, com o cliente real, antes de prometer:
login OAuth no Codex e no Antigravity (documentação não confirma); Claude Code e
Cursor documentam MCP remoto com OAuth.

## Erros

- Grant revogado, expirado ou designação removida: 401 com mensagem que manda
  refazer o login; o cliente MCP reabre o fluxo OAuth.
- Tentativa fora do escopo (outro projeto, `DELETE`, lote): 403 com o motivo,
  que o agente repassa ao humano.
- Falha da rota interna: o erro volta como resultado de ferramenta com
  `isError`, sem vazar detalhe interno (`erro500` já sanitiza).

## Testes

- Integração (D1/KV reais do `cloudflare:test`): fluxo OAuth completo;
  grant de projeto A recusado no B; consultor fora da governança não obtém
  grant; `DELETE` e lote recusados; designação removida derruba o agente;
  ator correto na trilha; `org_admin` vê e revoga; `org_admin` de outro
  cliente não vê.
- Paridade: cada ferramenta portada com o mesmo nome e esquema do servidor local.
- Manual, por cliente MCP: adicionar o endereço, logar, chamar `niso_contexto`.

## Entrega em fases

1. Principal **agente** no servidor (autorização, trilha, revalidação) + testes.
2. OAuth + tela de autorização + `OAUTH_KV`.
3. `/mcp` com `niso_contexto` e ferramentas portadas.
4. Seção **Agentes com acesso** para o cliente.
5. README, trechos por cliente e verificação real nos quatro clientes.
