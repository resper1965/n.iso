# Backups do banco (Cloudflare D1)

> ⚠️ **Faça um backup ANTES de aplicar qualquer migration de hardening de dados.**
> Os dumps (`*.sql`) NÃO são versionados (gitignored) — podem conter PII.

## Backup automático (desde 2026-09)

O backup de produção passou a rodar sozinho: `.github/workflows/db-backup.yml`,
diariamente às 03:40 UTC, com verificação do dump (tamanho mínimo, tabelas
essenciais presentes, contagem compatível com o `schema.sql`) e issue automática
se falhar. O arquivo fica como artifact da execução, por 30 dias.

Enquanto houver issue aberta com a label `backup`, considere que **não há
backup recente** — é esse o sinal.

## Backup de produção sob demanda (execute você mesmo, com as credenciais da conta)

```bash
# Requer login na conta Cloudflare (wrangler login) com acesso ao D1 `niso-db`.
npm run db:backup
# equivale a:
npx wrangler d1 export niso-db --remote --output backups/niso-$(date +%Y%m%d-%H%M%S).sql
```

## Backup do banco local (dev)

```bash
npm run db:backup:local
# npx wrangler d1 export niso-db --local --output backups/local-$(date +%Y%m%d-%H%M%S).sql
```

## Restaurar

```bash
npx wrangler d1 execute niso-db --remote --file=backups/<arquivo>.sql   # produção
npx wrangler d1 execute niso-db --local  --file=backups/<arquivo>.sql   # local
```

## Ordem segura para o hardening

1. `npm run db:backup` (produção).
2. Verifique o dump gerado em `backups/`.
3. `npx wrangler d1 migrations apply niso-db --remote`.
4. Valide a aplicação; se algo der errado, restaure pelo passo "Restaurar".

## Restrição descoberta ao testar a restauração

**O `audit_logs` é append-only** desde a migration 0018: triggers bloqueiam
`UPDATE` e `DELETE`. Isso é o controle funcionando — a trilha de auditoria não
pode ser adulterada — mas tem uma consequência operacional que só aparece na
hora do incidente se não estiver escrita:

> **Não é possível restaurar um dump por cima de um banco que já tem trilha.**
> O passo "limpar antes de restaurar" falha em `audit_logs` com
> `SQLITE_CONSTRAINT`.

Caminhos válidos:

1. **Restaurar num banco novo** (recomendado). Crie um D1 vazio, aplique o
   `schema.sql`, aplique o dump, e só então aponte o worker para ele.
2. **Restaurar só as tabelas de dados**, preservando a trilha existente. Filtre
   o dump removendo os `INSERT INTO audit_logs` — a trilha do banco atual é a
   verdadeira, e sobrepor duas trilhas produziria um histórico que não aconteceu.

Reaplicar o mesmo dump duas vezes falha na chave primária, de propósito: é
preferível o erro barulhento à duplicação silenciosa.

Isso está coberto por `test/backup-restore.test.ts`, que exercita o caminho
inteiro contra um D1 real — schema, dump com apóstrofo no dado, e reaplicação.
