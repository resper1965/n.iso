# mcp-server-niso

Servidor MCP (Model Context Protocol) que expõe o nISO a agentes de IA — Claude
Desktop, Claude Code, ou qualquer cliente MCP.

O servidor **não tem lógica de negócio nem acesso ao banco**. Ele é um adaptador
fino: traduz chamada de ferramenta MCP em `fetch` para a API HTTP do worker nISO.
Toda autorização real acontece no worker. Isso é deliberado — um agente de IA não
deve ser um caminho privilegiado para dentro do sistema.

```
Claude ──stdio──▶ mcp-server-niso ──HTTPS + X-API-Key──▶ worker nISO ──▶ D1
                  │                                      │
                  filtro por papel                       authMiddleware
                  (o que o agente VÊ)                    projectAccessMiddleware
                                                         (o que o agente PODE)
```

As duas camadas respondem a perguntas diferentes e nenhuma substitui a outra:

- **No servidor MCP** — quais ferramentas esse agente enxerga. É ergonomia e
  separação de papéis: um auditor não deveria nem ver `niso_generate_policy` na
  lista, porque não é dele escrever política do auditado.
- **No worker** — o que a chave de API pode de fato fazer, em qual projeto. É a
  fronteira de segurança. Vale mesmo que alguém chame a API direto, sem MCP.

## Instalação

```bash
cd mcp-server-niso
npm ci
npm run build      # tsc → build/index.js
```

## Configuração

Ferramenta | Onde
---|---
Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
Claude Code | `.mcp.json` na raiz do projeto

```json
{
  "mcpServers": {
    "niso": {
      "command": "node",
      "args": ["/caminho/absoluto/para/mcp-server-niso/build/index.js"],
      "env": {
        "NISO_BASE_URL": "https://niso.ness.workers.dev",
        "NISO_API_KEY": "...",
        "NISO_ROLE": "consultant",
        "NISO_PROJECT_ID": "proj-..."
      }
    }
  }
}
```

Variável | Default | O que faz
---|---|---
`NISO_BASE_URL` | `https://niso.ness.workers.dev` | Base da API. Aponte para `http://localhost:8787` em desenvolvimento.
`NISO_API_KEY` | — | Chave de API do projeto. Sem ela o servidor sobe, mas toda chamada volta 401.
`NISO_ROLE` | vazio (todas as ferramentas) | `consultant` ou `auditor`. Ver abaixo.
`NISO_READONLY` | `false` | `1`/`true` → só as 9 ferramentas de leitura, ignorando `NISO_ROLE`. Observador puro.
`NISO_PROJECT_ID` | vazio | Fixa a sessão num projeto: chamada com outro `projectId` é recusada antes de sair da máquina.

## Papéis: independência de auditoria na camada MCP

A ISO 27001 cláusula 9.2 exige que quem audita não seja quem implementa. Aqui
isso não é política escrita num documento — é o conjunto de ferramentas que o
agente recebe:

Papel | Enxerga
---|---
`auditor` | 9 ferramentas de leitura + `niso_create_audit_finding`, `niso_create_auditor_note`
`consultant` | 9 ferramentas de leitura + todas as demais escritas (política, SoA, risco, ativo, evidência, 27701, treinamento)
vazio | tudo — use só em desenvolvimento

O filtro é aplicado **duas vezes**: em `ListTools` (o agente não vê o que não é
dele) e de novo em `CallTool` (defesa em profundidade — um agente que adivinhe o
nome da ferramenta ainda toma erro).

Ferramentas de escrita trazem no próprio texto de descrição o aviso de que
escrita em projeto de cliente exige contrato ativo e aprovação humana prévia. O
agente lê isso antes de decidir chamar.

## Chave de API: `read` não escreve

O nISO cria chaves com `permissions: 'read'` por padrão. Uma chave `read` recebe
**403 em qualquer POST/PUT/PATCH/DELETE** — não importa o papel MCP configurado.

Para um agente consultor que precisa criar risco, ativo, registrar evidência ou
gerar política, a chave tem que ser criada com `write`:

```bash
curl -X POST "$NISO_BASE_URL/api/v1/projects/$PROJECT_ID/api-keys" \
  -H "X-Session-ID: $SESSAO_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agente-consultor","permissions":"write","expires_at":"2027-01-01T00:00:00Z"}'
```

A resposta traz a chave em texto puro **uma única vez** — o banco guarda só o
SHA-256. Se perdeu, revogue e crie outra.

No worker, `permissions` é a autorização de escrita da chave; ela não passa pelo
allow-list de escrita que existe para papéis humanos read-only
(`src/middleware/auth.ts`). O isolamento de tenant continua valendo: a chave é
escopada ao `project_id` dela e `projectAccessMiddleware` roda depois. Coberto por
`test/mcp-integration.test.ts`.

Sempre defina `expires_at`. Chave de agente é credencial de longa duração rodando
numa máquina de desenvolvedor — trate como tal.

## Ferramentas

**Leitura (9)** — `niso_list_projects`, `niso_get_project`, `niso_list_controls`,
`niso_list_risks`, `niso_gap_analysis`, `niso_traceability`, `niso_list_evidence`,
`niso_audit_pack`, `niso_coherence_check`

**Escrita do consultor (12)** — `niso_create_risk`, `niso_create_asset`,
`niso_create_evidence`, `niso_generate_policy`, `niso_generate_policies_bulk`,
`niso_generate_soa`, `niso_evaluate_evidence`, `niso_update_policy`,
`niso_update_control`, `niso_migrate_27701`, `niso_import_training`,
`niso_respond_auditor_note`

**Escrita do auditor (2)** — `niso_create_audit_finding`, `niso_create_auditor_note`

### `niso_create_evidence`: evidência textual, e só

Registrar evidência sem sair do chat é o caminho que faltava — o líder técnico
extrai o achado com o agente e precisa que aquilo vire registro auditável no
mesmo movimento. A ferramenta recebe o **texto** do documento (política,
procedimento, ata, trecho de log, dump de configuração) e o envia como
`multipart/form-data` para `POST /api/v1/projects/:projectId/evidence/upload` —
o **mesmo** endpoint da UI. Nenhuma rota nova foi criada.

Reusar o endpoint é o ponto: quem calcula o SHA-256, grava no R2, insere em
`evidence` e escreve na trilha de auditoria continua sendo o worker. Evidência
criada por agente e evidência criada por humano são o mesmo registro, com o mesmo
hash e a mesma validação.

O que ela deliberadamente **não** faz:

- **Não sobe binário.** `contentType` é um enum fechado: `text/markdown`,
  `text/plain`, `text/csv`, `application/json`. PDF, DOCX, ZIP e imagem estão na
  allow-list do worker, mas não aqui — por MCP eles só chegariam como blob
  codificado dentro de um JSON de stdio, e a ferramenta viraria um caminho de
  subir arquivo arbitrário atrás de uma chave de API.
- **Não lê arquivo do disco.** Não recebe caminho local. O que o agente registra
  é o texto que ele mesmo produziu ou que a pessoa colou na conversa — e é isso
  que a descrição da ferramenta diz ao modelo, para ele não fingir o contrário.
- **Não transcreve documento binário.** A descrição instrui explicitamente a não
  redigitar um PDF para contornar o limite: transcrição não é o documento, e
  evidência transcrita por IA não sobrevive a uma auditoria.
- **Não aprova nem avalia.** O registro nasce `evaluation_status = 'pending'`,
  sem assinatura de CISO ou de direção. Avaliar é `niso_evaluate_evidence`
  (rascunho de IA, não veredito); assinar continua sendo ato humano com senha.

Ela é **escrita do consultor**: registrar evidência é implementação do SGSI, não
achado de auditoria. Um auditor que pudesse depositar evidência no projeto que
audita estaria produzindo a prova que ele mesmo vai avaliar — exatamente o que a
cláusula 9.2 separa. O auditor não vê a ferramenta na lista.

O teto de 25 MB e a allow-list de tipos continuam sendo os de `validateUpload`
(`src/helpers.ts`), fonte única — a ferramenta restringe mais, nunca menos.

## Verificação

```bash
# o servidor compila
npm run build

# o caminho de escrita via X-API-Key funciona ponta a ponta (na raiz do repo)
npm test -- --run test/mcp-integration.test.ts
```

Para inspecionar as ferramentas manualmente, use o MCP Inspector:

```bash
NISO_ROLE=auditor npx @modelcontextprotocol/inspector node build/index.js
```

## Diagnóstico

Sintoma | Causa provável
---|---
Toda chamada volta 401 | `NISO_API_KEY` ausente, revogada, expirada, ou `NISO_BASE_URL` apontando para o ambiente errado
Escrita volta 403 | Chave criada com `permissions: 'read'` (o default). Crie uma nova com `write`.
Agente não vê a ferramenta | `NISO_ROLE` ou `NISO_READONLY` filtrando — confira o par nas tabelas acima
`Servidor fixado ao projeto …` | `NISO_PROJECT_ID` está setado e o agente pediu outro projeto
Servidor não aparece no cliente | Caminho em `args` precisa ser absoluto e apontar para `build/index.js` (não `src/`); rode `npm run build` primeiro
