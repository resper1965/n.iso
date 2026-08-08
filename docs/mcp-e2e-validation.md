# Validação E2E da integração MCP (consultor × auditor)

> Roteiro para provar, contra o ambiente publicado, que a separação de papéis e o
> escopo de projeto funcionam ponta-a-ponta. Precisa de: acesso **Platform Admin**
> à plataforma (para emitir chaves) e Node instalado (para o `mcp-server-niso`).

## 1. Emitir as chaves (tela nova, Platform Admin)

Menu **API Keys** (visível só para Platform Admin) → selecione o **projeto de teste** → **+ Nova Chave**:

1. Nome `e2e-consultor`, papel **consultant**, expiração 30 dias → copie a chave.
2. Nome `e2e-auditor`, papel **auditor**, expiração 30 dias → copie a chave.

(A chave aparece uma única vez. Ambas ficam presas ao projeto selecionado.)

## 2. Configurar os dois servidores MCP

No cliente MCP (Claude Code, Cursor, Antigravity…), com o `mcp-server-niso` já
buildado (`cd mcp-server-niso && npm run build`):

```json
{
  "mcpServers": {
    "niso-consultant": {
      "command": "node",
      "args": ["<path>/mcp-server-niso/build/index.js"],
      "env": {
        "NISO_API_KEY": "<chave-e2e-consultor>",
        "NISO_BASE_URL": "https://niso.ness.workers.dev",
        "NISO_ROLE": "consultant",
        "NISO_PROJECT_ID": "<id-do-projeto-de-teste>"
      }
    },
    "niso-auditor": {
      "command": "node",
      "args": ["<path>/mcp-server-niso/build/index.js"],
      "env": {
        "NISO_API_KEY": "<chave-e2e-auditor>",
        "NISO_BASE_URL": "https://niso.ness.workers.dev",
        "NISO_ROLE": "auditor"
      }
    }
  }
}
```

## 3. Casos de teste e resultado esperado

| # | Servidor | Ação | Esperado |
|---|---|---|---|
| 1 | consultant | "liste os projetos do nISO" | ✅ retorna o portfólio (ou só o projeto, se a chave for escopada) |
| 2 | consultant | "gere o SoA do projeto \<id\>" | ✅ executa (escrita de implementação permitida) |
| 3 | consultant | "registre um achado de auditoria no projeto \<id\>" | ❌ **recusado** — a ferramenta nem aparece (NISO_ROLE) **e** o backend responde 403 (papel consultor) |
| 4 | consultant (pin) | pedir ação em **outro** projeto | ❌ **recusado** — `NISO_PROJECT_ID` barra antes de sair a request; e o backend 403 pelo escopo da chave |
| 5 | auditor | "liste controles do projeto \<id\>" | ✅ leitura permitida |
| 6 | auditor | "registre um achado de auditoria" (`POST /audits/:id/findings`) | ✅ executa (escrita de auditoria permitida) |
| 7 | auditor | "gere uma política" | ❌ **recusado** — ferramenta ausente + backend 403 (papel auditor não escreve implementação) |

**Critério de aprovação:** os casos 1, 2, 5, 6 passam; os casos 3, 4, 7 são
recusados com a mensagem de papel/escopo. Se qualquer recusa **não** ocorrer, a
separação está furada — abrir issue.

## 4. Duas camadas, de propósito

- **Camada MCP** (`NISO_ROLE`, `NISO_PROJECT_ID`): a ferramenta errada nem é
  oferecida/enviada — falha cedo, boa UX.
- **Camada backend** (`api_keys.permissions` + `auth-policy.ts` + escopo de
  projeto): a barreira que vale, independente do cliente. Mesmo um cliente MCP
  adulterado (sem os envs) é barrado aqui.

> Este teste cobre o loop que os testes unitários (`test/apikey-role.test.ts`) não
> alcançam: a plataforma publicada + a chave real + o servidor MCP juntos.

## 5. Caminho rápido: smoke por curl (a barreira que vale)

O passo 3 exercita a camada MCP. Para provar a **camada backend** — a que segura
mesmo um cliente adulterado — sem montar cliente nenhum, rode o script pronto. Ele
bate direto na API publicada com as duas chaves e confere status + mensagem de
cada caso, imprimindo ✅/❌ e saindo com código ≠ 0 se qualquer recusa falhar.

A separação de papéis é checada no middleware **antes** do handler, então as
recusas (casos 3 e 7) valem mesmo sem auditoria/controle real — bastam as chaves
e o id do projeto.

```bash
NISO_BASE_URL=https://niso.ness.workers.dev \
PROJ=<id-do-projeto-de-teste> \
KEY_CONSULTANT=<chave-e2e-consultor> \
KEY_AUDITOR=<chave-e2e-auditor> \
scripts/mcp-e2e-smoke.sh
# opcionais para os positivos completos:
#   OTHER_PROJ=<outro-projeto>   → prova o escopo (caso 4)
#   AUDIT_ID=<auditoria-do-proj> → prova a escrita de auditoria (caso 6)
```

Casos cobertos pelo script (espelham a tabela do passo 3):

| # | Chave | Chamada | Esperado |
|---|---|---|---|
| 1 | consultor | `GET /api/v1/projects` | 200 |
| 2 | consultor | `POST /projects/<proj>/generate-policy` | **sem** recusa de papel |
| 3 | consultor | `POST /audits/<x>/findings` | **403** `consultor não registra achado` |
| 4 | consultor | `GET /projects/<OTHER_PROJ>` | ≠ 200 (barrado por escopo) |
| 5 | auditor | `GET /api/v1/projects` | 200 |
| 6 | auditor | `POST /audits/<AUDIT_ID>/findings` | **sem** recusa de papel |
| 7 | auditor | `POST /projects/<proj>/generate-policy` | **403** `auditor só registra achado` |

Aprovação: o script termina com `APROVADO` e código 0. Qualquer `❌` = separação
furada (abrir issue). A autenticação da chave é por header **`X-API-Key`** — a
mesma que o `mcp-server-niso` usa.

## Checklist

- [ ] Chave `e2e-consultor` (papel **consultant**) emitida pela tela, presa ao projeto
- [ ] Chave `e2e-auditor` (papel **auditor**) emitida pela tela, presa ao projeto
- [ ] `scripts/mcp-e2e-smoke.sh` terminou com **APROVADO** (código 0)
- [ ] (opcional) `OTHER_PROJ` conferiu o escopo de projeto (caso 4)
- [ ] (opcional) `AUDIT_ID` conferiu a escrita de auditoria (caso 6)
- [ ] (opcional) Os dois servidores MCP configurados e o passo 3 confirmado no cliente
- [ ] Chaves de teste **revogadas** na tela ao fim
