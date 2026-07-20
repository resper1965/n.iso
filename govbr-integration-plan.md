# Plano de Integração com o Assinador Eletrônico do gov.br

## Goal
Implementar o fluxo de assinatura digital integrado à API oficial do gov.br (com suporte a simulador/mock em ambiente de desenvolvimento) para permitir a assinatura eletrônica com validade jurídica de políticas e atas do nISO.

## Tasks
- [ ] **Task 1: Schema do Banco de Dados** → Adicionar a tabela `govbr_signatures` em `schema.sql` e rodar a migração no D1.
- [ ] **Task 2: Endpoints do Fluxo OAuth2 do gov.br** → Implementar no backend `src/index.ts`:
  - `GET /api/v1/projects/:id/controls/:controlId/govbr/start` → Inicia o fluxo de redirect para o gov.br (ou simulador).
  - `GET /api/v1/govbr/callback` → Callback que valida o código, gera a assinatura eletrônica (ou simulação) e grava os metadados de assinatura no banco.
- [ ] **Task 3: Simulação de Assinatura do gov.br** → Criar uma rota pública `/public/govbr-mock-portal` que exibe uma página de login simulada do governo para testes locais rápidos.
- [ ] **Task 4: Frontend - Botão e Status no Modal** → Atualizar o modal de Gestão de Políticas em `index.html`:
  - Adicionar o botão "Assinar com gov.br" nas assinaturas pendentes do CISO e CEO.
  - Exibir o selo oficial/badge do gov.br com o nome do assinante e CPF mascarado quando a assinatura existir.
- [ ] **Task 5: Deploy e Verificação**.

## Done When
- [ ] O fluxo de redirecionamento para o gov.br inicia corretamente a partir do modal de políticas.
- [ ] A simulação completa de login e autorização no gov.br conclui com sucesso.
- [ ] A assinatura é persistida no D1 e o status do controle é atualizado para aprovado.
- [ ] O modal de políticas exibe o selo oficial do gov.br com as credenciais do assinante.
