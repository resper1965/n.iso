# Plano de Implementação: Melhorias Operacionais GRC (Ativos & Políticas)

## Goal
Implementar as melhorias identificadas na auditoria de conformidade ISO 27001:2022: a exportação do inventário de ativos (A.5.9) como CSV e o versionamento e histórico de políticas de segurança (A.5.1) com salvamento em tabela dedicada.

## Tasks
- [ ] **Task 1: Schema do Banco de Dados** → Adicionar a tabela `policy_versions` em `schema.sql` e aplicar a migração no D1 local e de produção.
- [ ] **Task 2: Endpoint de Exportação de Ativos** → Criar o endpoint `GET /api/v1/projects/:id/export/assets` no backend `src/index.ts` para retornar os ativos em formato CSV.
- [ ] **Task 3: Histórico e Roteamento de Versões de Políticas** → Criar endpoints no backend `src/index.ts`:
  - `GET /api/v1/projects/:id/controls/:controlId/versions` para listar versões.
  - `POST /api/v1/projects/:id/controls/:controlId/restore-version` para restaurar uma versão.
- [ ] **Task 4: Salvar Nova Versão na Geração** → Atualizar os endpoints de geração de política (AI e template) para inserir o texto gerado em `policy_versions` calculando o número sequencial da versão.
- [ ] **Task 5: Frontend de Exportação de Ativos** → Adicionar o botão "Exportar CSV" na barra de ações da tela de Ativos em `index.html`.
- [ ] **Task 6: Frontend de Histórico de Políticas** → Atualizar o modal `openGeneratePolicyModal` em `index.html` para exibir o histórico de versões anteriores, permitindo ao usuário abrir a versão antiga para leitura ou restaurá-la como ativa.
- [ ] **Task 7: Wrangler Deploy e Verificação**.

## Done When
- [ ] Ativos de informação podem ser exportados como arquivo CSV a partir do frontend.
- [ ] Cada geração de política (por IA ou template) incrementa a versão e salva no histórico.
- [ ] Usuários podem ver versões antigas de políticas e restaurá-las no modal.
- [ ] O projeto compila e faz deploy no Cloudflare Workers sem erros.
