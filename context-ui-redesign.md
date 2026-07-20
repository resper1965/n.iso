# Redesenho da Interface de Análise de Contexto (Cláusula 4.1 / 4.2)

## Goal
Tornar a tela de Análise de Contexto extremamente moderna, organizada e premium, dividindo-a em abas (SWOT, Requisitos, Notas) e aplicando um design de quadrantes visualmente atraente para a matriz SWOT, mantendo a compatibilidade total com o salvamento existente.

## Tasks
- [ ] **Task 1: Definir as Abas no Estado** → Adicionar a inicialização de `S.contextActiveTab` (padrão `'swot'`) no roteador ou na inicialização.
- [ ] **Task 2: Modificar a função renderContext** → Reescrever a estrutura de HTML renderizada em `renderContext` no [index.html](file:///c:/Users/resper/OneDrive/Área de Trabalho/DESENVOLVIMENTO/niso/frontend/dist/index.html):
  - Inserir um cabeçalho com abas estilizadas com efeito glassmorphism e indicadores de status.
  - Implementar a Tab 1 (SWOT) com grid de 2x2 quadrantes personalizados com cores de borda temáticas (verde para forças, laranja para fraquezas, azul para oportunidades, vermelho para ameaças) e marca d'água grande translúcida das letras S, W, O, T no canto.
  - Implementar a Tab 2 (Requisitos) com 2 colunas amplas para Requisitos Legais e Requisitos Contratuais.
  - Implementar a Tab 3 (Notas) para anotações gerais.
- [ ] **Task 3: Implementar Alternância de Abas** → Criar a função `window.changeContextTab(tabName)` que atualiza `S.contextActiveTab` e re-renderiza a tela sem recarregar o estado da página.
- [ ] **Task 4: Deploy e Validação Visual** → Executar `wrangler deploy` e testar a navegação de abas e a salvamento dos dados.

## Done When
- [ ] A tela de contexto exibe abas navegáveis.
- [ ] A matriz SWOT é exibida em quadrantes coloridos temáticos.
- [ ] Clicar em "Salvar" persiste os dados corretamente de todas as abas.
