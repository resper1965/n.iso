# nISO — Agentic GRC System 🚀

O **nISO** é a evolução do sistema de adequação ISO 27001 da **ness.**, migrado para uma arquitetura agêntica e serverless sobre a stack da Cloudflare.

## Quick Start

1.  **Instalação**: `npm install`
2.  **Desenvolvimento**: `npm run dev`
3.  **Banco de Dados (Local)**:
    ```bash
    npx wrangler d1 execute niso-db --local --file=./schema.sql
    npx wrangler d1 execute niso-db --local --file=./seed_blueprint.sql
    ```
4.  **Deploy**: `npm run deploy`

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
