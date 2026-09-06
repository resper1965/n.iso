# Staging — o que existe, o que falta, e como terminar

> Estado em 2026-09-06: **parcialmente provisionado**. O banco existe; o KV e o
> R2 não. Enquanto a variável `STAGING_ATIVO` não for `true`, os workflows
> pulam staging e produção segue exatamente como antes.

## Para que serve

Um motivo, e só um: **ensaiar migration**. D1 não tem rollback. Uma migration
que falha no meio deixa o banco num estado que só a restauração de backup
desfaz — e a restauração é o procedimento mais caro do `runbook-incidente.md`.
Aplicar a mesma migration antes num banco de estrutura idêntica custa um minuto
e move a descoberta do erro para onde não há dado de cliente.

O que ele **não** é: cópia de produção. Não tem o volume nem os dados reais, e
migration que só falha por dado existente (constraint violada por linha antiga)
pode passar aqui e falhar lá. Pega a classe mais comum — SQL inválido, ordem de
statement, coluna que não existe — que é a que já quebrou este projeto antes.

## O que já existe

| Recurso | Nome | Estado |
| :--- | :--- | :--- |
| D1 | `niso-db-staging` | **criado** — o `database_id` está no `wrangler.jsonc` |
| Env do wrangler | `env.staging` | **escrito** |
| Job de deploy | `staging` em `deploy.yml` | **escrito**, pulado pelo gate |
| Ensaio de migration | passo em `db-migrate.yml` | **escrito**, pulado pelo gate |

## O que falta — três comandos e uma variável

Os dois primeiros criam recursos na conta Cloudflare e por isso não foram
executados automaticamente.

```bash
# 1. KV de sessões. Anote o `id` que o comando imprime.
npx wrangler kv namespace create niso-sessions-staging

# 2. Bucket de evidências.
npx wrangler r2 bucket create niso-evidence-staging
```

Com o `id` do passo 1 em mãos, troque o marcador no `wrangler.jsonc`:

```
"id": "PREENCHER_APOS_CRIAR_O_NAMESPACE"   →   "id": "<o id impresso>"
```

Depois, os segredos do ambiente (os mesmos nomes de produção, valores
**diferentes** — segredo de staging não é segredo de produção):

```bash
npx wrangler secret put SETUP_KEY --env staging
npx wrangler secret put TOKEN_ENC_KEY --env staging
```

Primeiro deploy e primeira carga do schema:

```bash
cd frontend && npm run build && cd ..
npx wrangler deploy --env staging
npx wrangler d1 migrations apply niso-db-staging --remote --env staging
```

Por fim, no repositório: **Settings → Secrets and variables → Actions →
Variables**, criar `STAGING_ATIVO` = `true`, e criar o environment `staging`
(Settings → Environments). A partir daí `deploy.yml` publica em staging antes de
produção, e `db-migrate.yml` ensaia antes de aplicar.

## Limitações declaradas

- **Sem Vectorize.** As rotas de IA que consultam a base de conhecimento (RAG)
  falham em staging. Apontar staging para o índice de produção faria ingestão de
  teste gravar vetor no índice do cliente, o que é pior que a falha.
- **Sem cron.** O `triggers.crons` não é herdado pelo `env.staging`, de
  propósito: dois workers purgando bancos diferentes é ruído, e a rotina tem
  teste próprio (`test/manutencao.test.ts`).
- **Sem dados.** O banco sobe vazio. Quem precisar de um tenant para clicar
  cria pelo `POST /api/v1/auth/setup` usando o `SETUP_KEY` de staging.

## Custo

D1 e KV cabem no gratuito nesse volume. O R2 cobra por armazenamento — um
bucket de staging vazio ou quase vazio é desprezível, mas ele acumula o que os
testes manuais subirem. Esvaziar de tempos em tempos é razoável; nada em
staging precisa sobreviver.
