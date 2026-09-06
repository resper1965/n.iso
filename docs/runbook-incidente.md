# Runbook de incidente — nISO

> Para quando o sistema está quebrado, não para leitura de fim de semana.
> Cada passo tem comando; nenhum diz "investigue".
>
> `SECURITY.md` cobre **relato de vulnerabilidade**. Este documento cobre
> **indisponibilidade, deploy ruim e perda de dado** — que não estavam cobertos
> em lugar nenhum.

## 0. Primeiro minuto

```bash
# O worker responde?
curl -s -o /dev/null -w "%{http_code}\n" https://niso.ness.workers.dev/health

# O código no ar é o esperado? (a sonda distingue versão; /health não)
curl -s -X POST -H "Content-Type: application/json" -d '{}' \
  https://niso.ness.workers.dev/api/v1/auth/login
```

O login com corpo vazio deve devolver `{"error":"Payload inválido","details":[…]}`
com `path` e `message` por campo. Resposta diferente disso significa **código
antigo ou quebrado no ar** — vá para a seção 2.

Depois: `wrangler tail` mostra o log estruturado ao vivo. Toda requisição sai
como uma linha JSON com `request_id`, `rota`, `status` e `duracao_ms`.

```bash
npx wrangler tail --format json | grep '"nivel":"error"'
```

## 1. Quem aciona o quê

O nISO não tem plantão formal. Isto é o que existe de fato:

| Sinal | Quem vê | Onde |
| :--- | :--- | :--- |
| Deploy falhou | issue automática no repositório | `deploy.yml` abre e fecha sozinha |
| Backup falhou | issue automática, label `backup` | `db-backup.yml` |
| Produção fora do ar ou publicada pela metade | issue automática, label `uptime` | `uptime.yml`, sonda externa a cada 15 min |
| Taxa de erro alta com o site NO ar | issue automática, label `slo` | `slo.yml`, a cada 6h sobre o Analytics Engine |
| Cliente reclama | quem atende | — |

A sonda de `uptime.yml` roda **fora** da Cloudflare e faz as duas verificações
da seção 0: `/health` e o envelope de validação do login. Ela abre uma issue
única (label `uptime`) e a fecha sozinha quando produção volta.

A sonda de `uptime.yml` pega o sistema fora do ar; o `slo.yml` pega o caso em
que ele responde mal. São coisas diferentes de propósito: se 30% das requisições
devolverem 500 e a sonda cair nos 70% que respondem, ela passa verde — e é o SLO
que acusa.

Tetos em vigor (24h, `scripts/slo.mjs`): **5xx acima de 1%** do total, e **p95
acima de 800 ms** fora das rotas de IA. A IA fica de fora porque leva segundos
por desenho — misturá-la faria o p95 subir com a ADOÇÃO do produto, e alerta que
dispara quando o produto é mais usado é alerta que se aprende a ignorar.

> **O que continua valendo como limite.** A detecção não é imediata: schedule do
> GitHub Actions atrasa por fila (o `db-backup.yml` sai rotineiramente horas
> depois do pedido), e a janela do SLO é de 24h. Conte dezenas de minutos para
> uma queda, e horas para uma degradação. Isso é melhor que "ninguém vê" e pior
> que monitoramento com plantão; quando o produto precisar de minutos, o caminho
> é serviço de observabilidade de verdade, não apertar estes crons.

## 2. Deploy ruim — reverter

O deploy é automático a cada merge na `main`. Reverter o código é reverter o
commit; o worker republica sozinho.

```bash
git fetch origin main
git checkout -B reverte-<sha-curto> origin/main
git revert --no-edit <sha-do-merge>     # commit de squash: um SHA só
git push -u origin reverte-<sha-curto>
```

Abra o PR e mergeie. O `deploy.yml` republica a versão anterior.

**Reverter direto pelo wrangler** só se o repositório estiver inacessível e a
urgência não permitir esperar o CI:

```bash
npx wrangler deployments list          # lista as versões publicadas
npx wrangler rollback --message "motivo"
```

> `wrangler rollback` volta o **código**, não o banco. Se o deploy ruim aplicou
> migration, ler a seção 3 ANTES — código antigo contra schema novo pode
> quebrar diferente do problema original.

## 3. Restaurar o banco (D1)

**Antes de qualquer coisa, exporte o estado atual.** Mesmo corrompido: é a única
cópia do que existe agora, e a restauração vai sobrescrevê-lo.

```bash
npx wrangler d1 export niso-db --remote --output backups/pre-restauracao-$(date +%Y%m%d-%H%M%S).sql
```

Pegue o backup bom no artifact da execução do `Backup do D1 (diário)`
(aba Actions → workflow → run → artifact `d1-backup-<run_id>`), ou gere um novo.

```bash
npx wrangler d1 execute niso-db --remote --file=backups/<arquivo>.sql
```

Confira que voltou:

```bash
npx wrangler d1 execute niso-db --remote --command \
  "SELECT (SELECT count(*) FROM users) AS usuarios,
          (SELECT count(*) FROM projects) AS projetos,
          (SELECT count(*) FROM evidence) AS evidencias;"
```

O caminho de restauração é exercitado por teste (`test/backup-restore.test.ts`):
o dump é reaplicado num banco do zero. O modo de falha típico não é o dump vir
corrompido — é ele não **aplicar**, por causa de trigger, constraint ou ordem de
statement.

## 4. Migration que deu errado

O `deploy.yml` recusa publicar com migration pendente, então o estado
"código à frente do banco" não deveria acontecer por deploy. Se acontecer:

```bash
npx wrangler d1 migrations list niso-db --remote     # o que falta
```

D1 não tem rollback de migration. As opções, em ordem de preferência:

1. **Corrigir para frente** — nova migration que conserta. Preferível quase sempre.
2. **Restaurar o backup** (seção 3) e reaplicar a partir dele.

`migrations/README.md` tem o histórico da reconciliação de 2026-08 e o que fazer
quando a tabela `d1_migrations` diverge do banco real.

## 5. Alguém perdeu o segundo fator

Acesso ao D1 sempre vence o MFA — em qualquer sistema. É por isso que esse
acesso é o que precisa ser protegido.

```bash
npx wrangler d1 execute niso-db --remote --command \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_recovery_hashes=NULL, \
   totp_last_window=NULL WHERE email='alguem@exemplo.com';"
```

## 6. Suspeita de acesso indevido

1. **Revogar a sessão** — as sessões vivem no KV com TTL; apagar a chave encerra.
   ```bash
   npx wrangler kv key list --binding SESSIONS | grep session_
   npx wrangler kv key delete --binding SESSIONS "session_<id>"
   ```
2. **Revogar chaves de API do projeto** — `PUT status = 'Revoked'` em `api_keys`,
   ou pela interface (Platform Admin).
3. **Revogar token de auditor** — apagar de `auditor_tokens`; o caminho
   `/api/v1/auditor/:token/*` é público e o token é o único fator.
4. **Ler a trilha**:
   ```bash
   npx wrangler d1 execute niso-db --remote --command \
     "SELECT created_at, action, actor, details FROM audit_logs
      WHERE actor='alguem@exemplo.com' ORDER BY created_at DESC LIMIT 50;"
   ```

> **O que dá e o que não dá para afirmar sobre a trilha.**
>
> `audit_logs` é append-only no banco: a migration `0018_data_hardening.sql` cria
> `audit_logs_no_update` e `audit_logs_no_delete`, e os dois **estão** em
> produção — conferido em 2026-09-06:
>
> ```
> SELECT name, type FROM sqlite_master WHERE type='trigger';
> → audit_logs_no_update | trigger
> → audit_logs_no_delete | trigger
> ```
>
> (Uma versão anterior deste runbook dizia o contrário. Estava errada.)
>
> Os triggers não param quem administra o banco: `DROP TRIGGER` é uma linha. Por
> isso o cron diário arquiva o dia FECHADO num objeto JSONL no bucket
> `niso-trilha`, e cada dia carrega o SHA-256 do anterior. Alterar um dia já
> arquivado quebra o encadeamento de todos os posteriores.
>
> ```bash
> # Durante um incidente ou uma auditoria, a pergunta é esta:
> curl -H "Authorization: Bearer <sessao-platform-admin>" \
>   https://niso.ness.workers.dev/api/v1/admin/trilha/verificar
> # 200 = cadeia íntegra · 409 = quebra, com o dia e o motivo no corpo
> ```
>
> **O limite que continua valendo, e que é o que se declara num relato:** a
> cadeia protege contra quem tem acesso ao D1. Ela **não** protege contra quem
> tem escrita no bucket E no banco ao mesmo tempo, nem cobre o DIA CORRENTE, que
> ainda só existe no D1. Fechar isso exige destino que o próprio produto não
> possa reescrever — bucket com retenção/object-lock, ou terceiro depositário.

## 7. Comunicar

Não há template corporativo. O mínimo honesto, na ordem:

1. **O que aconteceu** — em uma frase, sem jargão.
2. **Quem foi afetado** — quais clientes, quais telas, desde quando.
3. **O que já foi feito** — e o que está em curso.
4. **O que ainda não se sabe.** Dizer "não sabemos ainda" é melhor que estimar.

Se houver suspeita de **dado pessoal exposto**, o prazo e o conteúdo da
comunicação deixam de ser escolha de engenharia: LGPD art. 48 exige comunicação
à ANPD e aos titulares em prazo razoável. Envolva quem responde por privacidade
antes de comunicar.

## 8. Depois

Incidente que não vira mudança de sistema acontece de novo.

- Se faltou um teste, escreva o teste — e o faça **falhar** antes de corrigir.
- Se a documentação mentiu, corrija a documentação no mesmo PR.
- Se a detecção dependeu de sorte, o item que faltava está no
  `enterprise-grade-plan.md`: nomeie qual e por que subiu de prioridade.
