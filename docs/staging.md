# Staging — o que existe e como usar

> Estado em 2026-09-06: **provisionado e no ar** —
> `https://niso-staging.ness.workers.dev`. Falta só o portão do CI: uma
> variável e um environment no GitHub (seção final).

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

## O que existe

| Recurso | Nome / id |
| :--- | :--- |
| Worker | `niso-staging` → `https://niso-staging.ness.workers.dev` |
| D1 | `niso-db-staging` |
| KV (sessões) | `niso-sessions-staging` |
| R2 (evidências) | `niso-evidence-staging` |
| Analytics Engine | `niso_metrics_staging` |
| Secrets | `SETUP_KEY` e `TOKEN_ENC_KEY`, valores próprios de staging |

## Como o banco foi construído (e como refazer)

Isto importa porque **`wrangler d1 migrations apply` sozinho NÃO constrói o
banco**: não existe migration `0001`. O `schema.sql` é a base, e as migrations
`0002`–`0025` são incrementos sobre ela. Aplicar só as migrations num banco
vazio falha na primeira que faz `ALTER TABLE`.

```bash
# 1. Base canônica.
npx wrangler d1 execute niso-db-staging --remote --env staging --file=schema.sql -y

# 2. Marcar como aplicadas as migrations que o schema.sql já contém — a MESMA
#    lista que produção tem, para os dois bancos ficarem no mesmo ponto.
npx wrangler d1 execute niso-db --remote --command \
  "SELECT name FROM d1_migrations ORDER BY id;"
#    …e inserir cada nome em d1_migrations no banco de staging.

# 3. Conferir que zerou.
npx wrangler d1 migrations list niso-db-staging --remote --env staging
# → ✅ No migrations to apply!
```

A conferência que importa não é essa, é a estrutural: os dois bancos foram
comparados objeto a objeto depois do bootstrap. Staging ficou com os **90**
objetos que o `schema.sql` declara; produção tem **110**. A diferença de 20 é
drift antigo, registrado em `docs/drift-schema-conhecido.txt` e vigiado por
`.github/workflows/schema-drift.yml`.

## Limitações declaradas

- **Sem Vectorize.** As rotas de IA que consultam a base de conhecimento (RAG)
  falham em staging. Apontar staging para o índice de produção faria ingestão de
  teste gravar vetor no índice do cliente, o que é pior que a falha.
- **Sem cron.** Desligado com `"crons": []` no `env.staging`. Este documento
  afirmava antes que o cron "não é herdado pelo env" — errado, e o primeiro
  deploy provou: subiu com `schedule: 10 4 * * *`. Dois workers purgando bancos
  diferentes é ruído, e a rotina tem teste próprio (`test/manutencao.test.ts`).
- **Sem dados.** O banco sobe vazio. Quem precisar de um tenant para clicar
  cria pelo `POST /api/v1/auth/setup` usando o `SETUP_KEY` de staging.

## O que falta: o portão do CI

O `deploy.yml` e o `db-migrate.yml` já têm os passos de staging escritos, atrás
de `vars.STAGING_ATIVO`. Enquanto a variável não existir, os passos são
**pulados** e produção segue exatamente como antes — de propósito: o job de
staging declara `environment: staging`, e um environment sem o secret
`CLOUDFLARE_API_TOKEN` falharia, o que bloquearia a entrega de produção
(`needs: staging`).

Por isso a ordem importa. Em **Settings** do repositório:

1. **Environments → New environment → `staging`.**
2. Nele, **Secrets → `CLOUDFLARE_API_TOKEN`** (o mesmo valor que o environment
   `production` usa, ou um token próprio com D1 Edit + Workers Scripts Edit).
3. **Secrets and variables → Actions → Variables → New variable**:
   `STAGING_ATIVO` = `true`.

Só depois do passo 2 é que o 3 pode ser feito: inverter a ordem deixa o job de
staging vermelho e trava o deploy de produção.

## Custo

D1 e KV cabem no gratuito nesse volume. O R2 cobra por armazenamento — um
bucket de staging vazio ou quase vazio é desprezível, mas ele acumula o que os
testes manuais subirem. Esvaziar de tempos em tempos é razoável; nada em
staging precisa sobreviver.
