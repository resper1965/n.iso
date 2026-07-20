# Planejamento de Refatoração Detalhado por Fases: nISO Backend & Templates

## Goal
Organizar o backend monolítico `src/index.ts` em rotas modulares Hono e migrar os templates de políticas ISO in-code para o banco de dados D1. Cada fase possui ações de desenvolvimento e etapas rígidas de controle de qualidade (QA) e testes.

---

## Fases da Implementação

### Fase 1: Setup do Ambiente de Testes Automatizados (Vitest)
*   **Ação**: Configurar o Vitest para rodar testes integrados ao ambiente Cloudflare D1. Criar o arquivo de configuração `vitest.config.ts` e um teste funcional de fumaça (smoke test) básico.
*   **QA / Validação**:
    1. Executar `npm run test` e verificar se o teste de fumaça passa.
    2. Confirmar se a rota pública `/api/v1/public/pricing` responde com status 200 e JSON de preços.

### Fase 2: Modularização de Riscos (Matriz e CRUD)
*   **Ação**: Criar `src/routes/risks.ts` e mover os endpoints de listagem, inclusão, edição e exclusão de riscos (tabela `risks`). Atualizar a montagem no arquivo principal `src/index.ts`.
*   **QA / Validação**:
    1. Validar a tipagem do sub-controller com `npx tsc --noEmit`.
    2. Adicionar teste automatizado em `src/index.test.ts` que faz uma requisição HTTP simulada (via `app.request('/api/v1/projects/1/risks')`) e valida o formato JSON retornado.

### Fase 3: Modularização de Políticas & Gov.br
*   **Ação**: Criar `src/routes/policies.ts` e transferir todas as rotas relacionadas a políticas (geração por IA, templates, histórico de versões, assinaturas gov.br e o portal simulado sandbox).
*   **QA / Validação**:
    1. Validar a tipagem com `npx tsc --noEmit`.
    2. Executar teste automatizado chamando a rota `/public/govbr-mock-portal` e checando se o HTML simulado é retornado com status 200.

### Fase 4: Modularização de Webhooks, API Keys e Exportações
*   **Ação**: Criar `src/routes/webhooks.ts` e mover endpoints de CRUD de webhooks, API keys (com criptografia hash SHA-256) e exportações em formato CSV.
*   **QA / Validação**:
    1. Validar a tipagem com `npx tsc --noEmit`.
    2. Executar teste automatizado chamando a rota de exportação de riscos e verificando se o cabeçalho `Content-Type: text/csv` é retornado.

### Fase 5: Integração Final & Limpeza do Monolito
*   **Ação**: Limpar o arquivo `src/index.ts` removendo o código antigo redundante, mantendo apenas inicializações, middlewares globais, tratamento de erros centralizado e montagem de rotas com `app.route(...)`.
*   **QA / Validação**:
    1. Executar `npm run test` para rodar todos os testes criados nas fases anteriores simultaneamente.
    2. Verificar se o typecheck geral passa livre de erros.

### Fase 6: Migração de Templates de Políticas para o Banco de Dados (D1)
*   **Ação**: Criar a tabela `policy_templates` em `schema.sql`, criar script SQL de carga inicial (seed) com os 10 templates (ISP, AUP, ACP, etc.) e refatorar `PolicyGeneratorService` para carregar do D1.
*   **QA / Validação**:
    1. Rodar a migração no D1 local.
    2. Chamar o endpoint `/api/v1/projects/1/controls/A.5.1/generate-policy` com método `template` e validar se a política é gerada a partir dos dados do D1.

---

## Critérios de Sucesso (Done When)
- [ ] O arquivo `src/index.ts` possui menos de 1.500 linhas de código (redução drástica de complexidade).
- [ ] Pelo menos 4 testes de integração funcionais adicionados e passando via `npm run test`.
- [ ] O typecheck (`npx tsc --noEmit`) passa com 100% de sucesso.
- [ ] Geração de política via templates lida do D1 validada localmente.
