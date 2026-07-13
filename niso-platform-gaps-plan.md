# Ajuste dos Gaps da Plataforma nISO

## Goal
Implementar melhorias arquiteturais de banco de dados, API e frontend para gerenciar inventário de ativos (A.5.9), integridade referencial de CAPA (10.1), histórico de avaliações de risco (6.1.2) e aceitação de riscos residuais (6.1.3).

## Tasks
- [ ] Task 1: Modificar `schema.sql` com tabelas `assets`, `risk_history` e chaves estrangeiras. → Verify: sqlite/d1 valida sintaxe com sucesso.
- [ ] Task 2: Implementar rotas CRUD de ativos no backend `src/index.ts`. → Verify: Endpoints `/api/v1/projects/:id/assets` respondendo 200.
- [ ] Task 3: Atualizar rotas de risks em `src/index.ts` para registrar histórico em `risk_history` e aceites. → Verify: Mudança de nota em risco gera registro no histórico.
- [ ] Task 4: Adicionar a view "Ativos" na sidebar e a tela de listagem/formulário em `frontend/dist/index.html`. → Verify: Menu funcional e listagem exibindo dados.
- [ ] Task 5: Adaptar a view "Riscos" no frontend para carregar ativos dinâmicos e inputs de aceite. → Verify: Combobox de ativos populada e campos de aceite ativos para status 'Accept'.
- [ ] Task 6: Validar fluxos ponta a ponta no banco D1 local. → Verify: Teste de integração completo executado sem erros.

## Done When
- [ ] CRUD de ativos operacional com integridade e persistência de dados.
- [ ] Relação forte de chaves estrangeiras implementada na tabela `corrective_actions`.
- [ ] Linha do tempo ou registros de histórico disponíveis para evolução de riscos.
- [ ] Registro oficial de responsabilidade em aceitação de riscos residuais.
