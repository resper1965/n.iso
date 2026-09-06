# SSO (OIDC) e SCIM 2.0

> Itens 4.1 e 4.2 do `enterprise-grade-plan.md`. Os dois são **por tenant** e
> **desligados por padrão**: tabela vazia significa que nada muda.

## Por que os dois, e por que o segundo importa mais

O SSO tira a senha do nosso banco. O SCIM é o que responde à pergunta que toda
revisão de fornecedor faz: **quando alguém é desligado no IdP do cliente, o
acesso aqui cai sozinho?** Sem SCIM, a resposta honesta é "alguém precisa
lembrar de remover a conta" — e "alguém lembra" não é um controle que se declara
numa auditoria.

## Configurar o SSO

Tudo pela ness. (`somenteNess`), e o motivo é direto: quem aponta o `issuer`
controla quem entra. Um `org_admin` que pudesse configurá-lo passaria a poder
emitir token para qualquer e-mail do domínio.

```bash
curl -X PUT https://niso.ness.workers.dev/api/v1/projects/<id>/sso \
  -H "Authorization: Bearer <sessao-ness>" -H "Content-Type: application/json" \
  -d '{
    "issuer": "https://login.microsoftonline.com/<tenant>/v2.0",
    "client_id": "<app-id>",
    "client_secret": "<segredo>",
    "dominios": "cliente.com.br, cliente.com",
    "papel_padrao": "org_user",
    "ativo": true
  }'
```

No IdP, o **redirect URI** é:

```
https://niso.ness.workers.dev/api/v1/public/sso/callback
```

`papel_padrao` só aceita papel de cliente. Papel de plataforma é recusado com
400 — provisionamento automático não pode criar acesso de plataforma.

O `client_secret` é gravado cifrado (AES-256-GCM, `TOKEN_ENC_KEY`) e **nunca
volta na leitura**, nem mascarado. Sem a chave configurada no Worker, a gravação
recusa com 503: segredo de IdP em claro no banco seria pior que não ter SSO.

### O que a tela de login faz

```
POST /api/v1/public/sso/iniciar   {"email":"pessoa@cliente.com.br"}
→ {"sso": true, "autorizacao": "https://login.microsoftonline.com/..."}
→ {"sso": false}   # pede a senha
```

A resposta é a mesma para domínio desconhecido e para tenant sem SSO. A rota é
pública, e distinguir os dois entregaria de graça quais domínios têm cliente
aqui.

O retorno chega em `/#sso_token=<token>` — **fragmento**, não query: fragmento
não é enviado ao servidor nem vai no `Referer`, então o token de sessão não
termina em log de proxy. Em caso de falha, `/#sso_erro=<motivo genérico>`; o
motivo real vai para a trilha, porque distinguir "assinatura inválida" de "nonce
errado" ajuda quem ataca mais do que quem tenta entrar.

## Configurar o SCIM

```bash
curl -X POST https://niso.ness.workers.dev/api/v1/projects/<id>/scim-token \
  -H "Authorization: Bearer <sessao-ness>"
# → { "token": "scim_...", "base_url": "https://niso.ness.workers.dev/scim/v2" }
```

O token aparece **uma vez** e é guardado só como hash. Emitir de novo substitui
o anterior. No IdP, use `base_url` como *SCIM endpoint* e o token como *bearer*.

### O que está implementado

| | |
| :--- | :--- |
| `GET /Users` | lista do tenant; filtro `userName eq "..."` |
| `GET /Users/:id` · `POST` · `PUT` · `PATCH` · `DELETE` | ciclo completo de conta |
| `GET /ServiceProviderConfig` | inclusive o que **não** suportamos |
| `/Groups` | **não implementado**, e declarado como tal |

`/Groups` fica de fora porque o produto não tem conceito de grupo. Responder com
lista vazia faria o IdP acreditar que sincronizou grupos que nunca existiram.

### O que acontece ao desligar alguém

`PATCH active:false` e `DELETE` fazem a mesma coisa, e nenhum apaga:

1. `users.ativo = 0`;
2. **as sessões vivas são invalidadas na hora** — sem isso o desligado ficaria
   dentro por até 24 horas com o token que já tinha;
3. o login passa a responder `Invalid credentials` — a mesma mensagem de senha
   errada, porque distinguir diria a quem sonda que aquele e-mail existe aqui;
4. a desativação vai para a trilha.

A conta **continua existindo** de propósito: `audit_logs` referencia o e-mail
dela, e apagar a linha reescreveria o passado — exatamente o que a trilha existe
para impedir.

## O que este par NÃO faz

- **Não sincroniza grupos nem papéis.** O papel vem do `papel_padrao` do tenant.
  O cliente controla as claims que o próprio IdP emite; aceitar `role` de lá
  seria deixá-lo escolher o próprio nível de acesso na plataforma.
- **Não move conta entre tenants.** E-mail que já pertence a outro cliente é
  recusado, no SSO e no SCIM. Mover por efeito colateral de login seria a pior
  forma de vazamento.
- **Não sincroniza de volta.** Conta criada aqui pela tela de usuários não
  aparece no IdP.
