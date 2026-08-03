# Testes de ponta a ponta (navegador)

Rodam **fora** do `npm test`, de propósito: exigem um servidor de pé e um
Chromium, coisas que a suíte do `vitest-pool-workers` não tem. Não estão no CI.

O frontend tem ~12 mil linhas e nenhum teste. Estes são os primeiros, e cobrem
só o fluxo de MFA — que é o único onde um erro tranca o usuário para fora.

## Por que existem

A tela de MFA passou no `npm run build` e mesmo assim tinha **três defeitos que
só aparecem no caminho de erro**, todos encontrados depois:

- os códigos de recuperação chegavam vazios (o cliente de API desembrulha o
  array), e o servidor nunca mais os mostra — ativar o MFA e perder o celular
  significaria perder a conta;
- 401 nas rotas de MFA deslogava, então errar um dígito destruía a sessão;
- conta com senha temporária + MFA pulava a troca obrigatória de senha.

Build passando não diz nada sobre nenhum dos três. Por isso este teste exercita
senha errada, código errado e reuso — não só o caminho feliz.

## Como rodar

Precisa de `playwright` e um Chromium:

```bash
pip install playwright && playwright install chromium
```

Num terminal, o servidor com banco local (nada toca produção):

```bash
npx wrangler dev --port 8787 --local
```

No outro, prepare o banco e rode:

```bash
bash test/e2e/seed-local.sh          # schema + usuario teste@ness.io / password123
python3 test/e2e/mfa.py
```

Capturas vão para `/tmp` por padrão; mude com `NISO_E2E_SHOTS=/algum/lugar`.

Se o Chromium do ambiente não for o que o `playwright` espera, aponte o binário
em `executable_path` dentro do script.

## O que ele verifica

| # | Verificação |
|---|---|
| 1 | login sem MFA entra |
| 2 | perfil expõe a entrada de duas etapas |
| 3 | **senha errada** em Ativar é recusada |
| 4 | QR renderiza como `data:` URI e a chave base32 aparece |
| 5 | **código errado** não ativa |
| 6 | código válido ativa e **os 8 códigos de recuperação aparecem** |
| 7 | novo login exige o segundo fator e não entra só com a senha |
| 8 | **código errado no login** é barrado e o formulário permanece |
| 9 | código válido entra |
| 10 | status mostra ativo e desativar exige senha |
| 11 | desativar derruba a sessão, como o backend faz |

O código TOTP é calculado no próprio teste (HMAC-SHA1, RFC 6238) a partir do
segredo lido da tela — não há mock: é o mesmo cálculo que o autenticador faz.
