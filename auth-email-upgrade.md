# Melhoria de Autenticação, CRUD e Recuperação de Senhas com Integração de E-mails

## Goal
Melhorar a segurança e o UX da autenticação de usuários através de convites por e-mail com alteração obrigatória de senha no primeiro acesso, recuperação segura via código numérico de 6 dígitos, e integração de disparo de e-mails via API de envio.

## Tasks
- [ ] **Task 1: Atualização do Banco (Schema)** → Adicionar a coluna `requires_password_change INTEGER DEFAULT 0` na tabela `users` no [schema.sql](file:///c:/Users/resper/OneDrive/Área de Trabalho/DESENVOLVIMENTO/niso/schema.sql) e aplicar no D1 local e de produção.
- [ ] **Task 2: Função de Envio de E-mails** → Criar a função utilitária `sendEmail(c, to, subject, html)` em `src/index.ts` que consome a API do Resend usando a chave `c.env.RESEND_API_KEY`. Se a chave não existir ou for ambiente local/teste, apenas registra o conteúdo no console/log.
- [ ] **Task 3: Convite e Força de Alteração** → Atualizar o endpoint `POST /api/v1/users` e o fluxo de convites para registrar novos usuários com `requires_password_change = 1` e disparar um e-mail de boas-vindas com o link de acesso e a senha temporária.
- [ ] **Task 4: Fluxo de Login Atualizado** → Modificar o endpoint `POST /api/v1/auth/login` em `src/index.ts` para retornar a flag `requiresPasswordChange: true` se o usuário tiver `requires_password_change == 1`.
- [ ] **Task 5: Endpoint para Nova Senha no Primeiro Acesso** → Criar o endpoint `POST /api/v1/auth/reset-password-first` para receber o token de sessão temporária, a nova senha, atualizar a hash no banco e definir `requires_password_change = 0`.
- [ ] **Task 6: Recuperação de Senha Amigável (6 Dígitos)** → Mudar a geração de token no `forgot-password` de UUID para um código de 6 dígitos numéricos aleatórios (`Math.floor(100000 + Math.random() * 900000)`). Enviar esse código para o e-mail do usuário e armazenar no KV de sessões por 1 hora.
- [ ] **Task 7: UI de Troca de Senha Obrigatória** → Atualizar a interface do frontend no [index.html](file:///c:/Users/resper/OneDrive/Área de Trabalho/DESENVOLVIMENTO/niso/frontend/dist/index.html) para exibir uma tela/modal obrigatório de redefinição de senha logo após o login caso a flag `requiresPasswordChange` seja retornada.
- [ ] **Task 8: UI do Fluxo de Recuperação** → Polir a tela de recuperação de senha no frontend para aceitar o código de 6 dígitos de forma simples e intuitiva.

## Done When
- [ ] É possível criar ou convidar um usuário, receber um e-mail de boas-vindas, fazer login com a senha temporária e ser forçado a alterá-la antes de acessar o sistema.
- [ ] A recuperação de senha envia um e-mail com código numérico de 6 dígitos que redefine a senha do usuário com sucesso.
- [ ] Wrangler deploy concluído e todas as rotas ativas.

## Notes
- O envio de e-mails será feito por meio de chamadas HTTP `fetch` diretas à API do Resend (`https://api.resend.com/emails`) usando o token seguro passado por variável de ambiente para manter a conformidade com a política zero dependências (Ponytail mode).
- A chave de API do Resend deve ser adicionada pelo painel da Cloudflare (ou via `wrangler secret put RESEND_API_KEY`).
