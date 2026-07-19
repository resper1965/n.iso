# Melhoria de Compliance: Questionários & Pré-Auditoria por IA

## Goal
Implementar micro-questionários dinâmicos de coleta de dados e exibição do status de pré-auditoria da IA (EvidenceAgent) na Jornada para facilitar o preenchimento de requisitos e garantir compliance instantâneo.

## Tasks
- [ ] Task 1: Criar o layout e formulário do Questionário de Ativos e Riscos para a Jornada 2 no frontend -> Verify: Renderizar modal com perguntas de infraestrutura ao clicar no botão "Responder Questionário" na Jornada 2.
- [ ] Task 2: Implementar persistência local das respostas do questionário no state global `S` -> Verify: Respostas salvas e exibidas em um resumo na Jornada.
- [ ] Task 3: Criar regras básicas de automação de conformidade com base nas respostas (ex: se usa AWS, adicionar sugestão de controle A.5.23 - Cloud Services Security) -> Verify: Exibir sugestão correspondente de controle na Jornada de Riscos.
- [ ] Task 4: Adicionar badges de status de pré-auditoria da IA ("Auditor-Ready", "Atenção: Gaps") ao lado de cada item concluído da Jornada -> Verify: Verificar se o badge é exibido corretamente ao lado do checkbox marcado de acordo com as diretrizes do ISO_GUIDELINES.
- [ ] Task 5: Implementar tooltip ou área expansível detalhando as pendências apontadas pela IA para itens que não estejam 100% conformes -> Verify: Clicar no badge de aviso e ver o texto explicativo da IA.

## Done When
- [ ] Usuário consegue responder ao questionário interativo de diagnóstico na Jornada 2.
- [ ] Cada tarefa documental da Jornada exibe o status imediato de pré-auditoria do EvidenceAgent.
- [ ] O código compila sem warnings e é implantado no Cloudflare Workers.
