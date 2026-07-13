# Roadmap de Melhorias: Processo ISO & Controle de Entregas nISO

Checklist de implementação técnica das melhorias acordadas para mitigar as lacunas do ISMS:

- [ ] **Etapa 1: Atualização do Banco de Dados (Schema)**
  - [ ] Adicionar colunas `ciso_approved_by`, `ciso_approved_at`, `ceo_approved_by`, `ceo_approved_at` na tabela `compliance_controls` em `schema.sql`.
  - [ ] Criar a tabela `project_scope_changes` para controle de mudanças de escopo (Cláusula 6.3) em `schema.sql`.
  - [ ] Resetar e recriar o SQLite/D1 local executando `schema.sql` e o seed.

- [ ] **Etapa 2: API Backend (Hono)**
  - [ ] Implementar rota `POST /api/v1/controls/:id/approve` em `src/index.ts`.
  - [ ] Implementar rotas `GET` e `POST` sob `/api/v1/projects/:id/scope-changes` em `src/index.ts`.
  - [ ] Adicionar trigger automático de criação de tarefas na tabela `evidence` quando um risco é marcado como `Mitigate`.

- [ ] **Etapa 3: Interface Frontend (SPA)**
  - [ ] Adicionar seção e botões de workflow de aprovação dupla no modal de políticas em `index.html`.
  - [ ] Adicionar trava de confirmação (Definition of Done) no switch de status de fases em `index.html`.
  - [ ] Criar modal de gestão de escopo e histórico de mudanças de escopo (Cláusula 6.3) no detalhe do projeto em `index.html`.
  - [ ] Renderizar estatísticas/KPIs de burnup de conformidade no dashboard em `index.html`.

- [ ] **Etapa 4: Validação e Testes**
  - [ ] Verificar integridade sintática e funcional localmente com wrangler dev.
  - [ ] Testar fluxo completo de ponta a ponta.
