# Backups do banco (Cloudflare D1)

> ⚠️ **Faça um backup ANTES de aplicar qualquer migration de hardening de dados.**
> Os dumps (`*.sql`) NÃO são versionados (gitignored) — podem conter PII.

## Backup de produção (execute você mesmo, com as credenciais da conta)

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
