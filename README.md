# nISO — Agentic GRC System

O **nISO** é a evolução do sistema de adequação ISO 27001 da **ness.**, migrado para uma arquitetura agêntica e serverless sobre a stack da Cloudflare.

## Quick Start

1.  **Instalação**: `npm install`
2.  **Desenvolvimento**: `npm run dev`
3.  **Banco de Dados (Local)**:
    ```bash
    npx wrangler d1 execute niso-db --local --file=./schema.sql
    npx wrangler d1 migrations apply niso-db --local
    ```
4.  **Deploy**: `npm run deploy` — faça backup antes (`npm run db:backup`, runbook em `backups/README.md`).

## Features

- **Agentic Workflows**: Geração automática de políticas e avaliação de evidências via IA (Llama 3).
- **SoA Generator**: Criação automatizada da Declaração de Aplicabilidade (SoA) para ISO 27001:2022.
- **Risk Assessment**: Matriz de riscos 5x5 com scoring dinâmico e plano de tratamento.
- **Evidence Vault**: Repositório seguro no Cloudflare R2 com validação de integridade SHA-256.
- **Auditor Portal**: Acesso read-only seguro para auditores externos via tokens temporários.
- **Compliance Assistant**: Chatbot contextual especializado em ISO 27001/27701.

## Architecture

- **Core**: Hono.js no Cloudflare Workers.
- **Database**: Cloudflare D1 (SQLite-native).
- **Memory**: Vectorize (RAG) para contexto organizacional e normativo.
- **Storage**: Cloudflare R2 para documentos e evidências.
- **AI**: Cloudflare Workers AI (Llama 3.1).

## Integração com agentes (MCP)

O `mcp-server-niso/` expõe o nISO a clientes MCP (Claude Desktop, Claude Code)
com filtro de ferramentas por papel — o auditor não escreve implementação, o
consultor não registra achado de auditoria. Instalação, variáveis de ambiente e
diagnóstico em [`mcp-server-niso/README.md`](mcp-server-niso/README.md).

## Contribuindo

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — ambiente, verificação antes do PR, regras de schema e teste
- [`SECURITY.md`](SECURITY.md) — como reportar vulnerabilidade e quais invariantes não podem regredir

## Configuration

As variáveis de ambiente e bindings estão configuradas no `wrangler.jsonc`.

| Binding | Tipo | Finalidade |
| :--- | :--- | :--- |
| `DB` | D1 | Banco de dados relacional |
| `SESSIONS` | KV | Gestão de sessões e tokens |
| `STORAGE` | R2 | Armazenamento de arquivos |
| `VECTOR_INDEX` | Vectorize | Memória de longo prazo da IA |

## License

© 2026 ness. Cybersecurity. Todos os direitos reservados.

---
**ness.** · Cybersecurity Enterprise Grade
