# nISO — Agentic GRC System

[![CI](https://github.com/resper1965/nISO/actions/workflows/ci.yml/badge.svg)](https://github.com/resper1965/nISO/actions/workflows/ci.yml)
[![Deploy](https://github.com/resper1965/nISO/actions/workflows/deploy.yml/badge.svg)](https://github.com/resper1965/nISO/actions/workflows/deploy.yml)
![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)
![Stack](https://img.shields.io/badge/stack-Cloudflare%20Workers%20%2B%20D1%20%2B%20R2%20%2B%20Vectorize-f38020.svg)

O **nISO** é a evolução do sistema de adequação ISO 27001 da **ness.**, migrado para uma arquitetura agêntica e serverless sobre a stack da Cloudflare.

> **Produção:** `https://niso.ness.com.br` (também `n-iso.ness.com.br` e `niso.ness.workers.dev`).

## Quick Start

1.  **Instalação**: `npm install`
2.  **Desenvolvimento**: `npm run dev`
3.  **Banco de Dados (Local)**:
    ```bash
    npx wrangler d1 execute niso-db --local --file=./schema.sql
    npx wrangler d1 migrations apply niso-db --local
    ```
## Deploy & operação

O deploy é **automatizado** pelo workflow `Deploy` (a cada push na `main`), mas com
um gate deliberado: **recusa publicar se houver migration D1 pendente** — publicar
código que consulta tabela inexistente já custou caro aqui.

**Fluxo pela aba Actions (sem terminal):**
1. **Apply DB migrations (manual)** → *Run workflow* → digite `APLICAR`. Faz backup
   do D1 (artifact) e aplica as migrations pendentes.
2. **Deploy** → *Run workflow* (`main`). Com as migrations aplicadas, publica.

**Deploy local (não usa GitHub Actions — útil se o billing de Actions estiver bloqueado):**
```bash
npx wrangler login
npm run db:backup                                   # backup verificado antes de mutar
npx wrangler d1 migrations apply niso-db --remote   # aplica pendentes
npm run deploy                                       # build do frontend + wrangler deploy
```

> Segredos (`SETUP_KEY`, `TOKEN_ENC_KEY`) ficam em *wrangler secrets*, nunca no git:
> `npx wrangler secret put <NOME>`.

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

Proprietária — © 2026 ness. Cybersecurity. Todos os direitos reservados. Ver
[`LICENSE`](LICENSE). Visualizar o repositório não concede direito de uso, cópia
ou distribuição. Componentes de terceiros (ex.: skills adaptadas sob MIT) mantêm
sua própria licença e atribuição.

---
**ness.** · Cybersecurity Enterprise Grade
