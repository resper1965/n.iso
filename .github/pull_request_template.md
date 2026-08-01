## O que muda

<!-- O defeito ou a necessidade. Não a lista de arquivos — o diff já mostra isso. -->

## Por quê

<!-- Se corrige bug: qual era o comportamento errado e a causa raiz.
     Se é feature: o que ela destrava. -->

## Como foi verificado

<!-- Marque o que se aplica e cole a evidência que importar. -->

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm test` passa
- [ ] Build do frontend (`cd frontend && npm run build`) — se tocou a UI
- [ ] Testado manualmente na aplicação — se a mudança é visível ao usuário

## Banco de dados

- [ ] Não toca schema nem migrations
- [ ] Toca — e então:
  - [ ] `schema.sql` e a migration estão consistentes entre si
  - [ ] `test/schema-contract.test.ts` cobre as colunas/tabelas novas
  - [ ] Migration aplicada e verificada num D1 local
  - [ ] Cabeçalho da migration diz o que verificar antes de aplicar em produção

## Segurança

- [ ] Não altera autenticação, autorização, isolamento de tenant ou tratamento de PII
- [ ] Altera — descreva abaixo qual invariante do `SECURITY.md` foi tocado e por quê

<!-- Nunca inclua neste PR: chaves, tokens, IDs de conta, hostnames internos. -->

## Ações necessárias após o merge

<!-- Migrations a aplicar, secrets a configurar, índice a recriar, ou "nenhuma".
     Merge não coloca nada em produção — seja explícito. -->
