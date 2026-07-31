# Como contribuir

Este repositório é o produto nISO em produção, processando dados de conformidade
e dados pessoais de clientes reais. As regras abaixo existem por causa de
defeitos que já aconteceram aqui — não por formalidade.

## Ambiente

```bash
npm ci
cd frontend && npm ci && cd ..
npm run dev            # worker local em http://localhost:8787
```

O banco local é um D1 em `.wrangler/`. Para criá-lo do zero:

```bash
npx wrangler d1 execute niso-db --local --file=./schema.sql
npx wrangler d1 migrations apply niso-db --local
```

## Antes de abrir o PR

```bash
npx tsc --noEmit                     # sem erro
npm test -- --run                    # tudo verde
cd frontend && npm run build         # se tocou a UI
cd mcp-server-niso && npm run build  # se tocou o servidor MCP
```

O CI roda exatamente isso. Rodar antes economiza um ciclo.

## Branch e commit

- Branch a partir de `main`, nome descritivo (`fix/…`, `feat/…`).
- Mensagem de commit no imperativo, explicando **por quê**, não o quê — o diff já
  diz o quê.
- Um PR resolve um problema. PR que faz três coisas é revisado como zero.
- Preencha o template de PR. A seção "Ações necessárias após o merge" não é
  opcional: **merge não coloca nada em produção**, e quem faz o deploy precisa
  saber o que aplicar.

## Banco de dados

Esta é a fonte de defeito mais cara do repositório. Já aconteceu de o código
consultar tabela que não existia em produção.

1. Toda mudança de schema entra em **dois** lugares: `schema.sql` (o canônico,
   usado para criar banco novo) e uma migration numerada em `migrations/`.
2. `test/schema-contract.test.ts` roda `schema.sql` contra um D1 real e verifica
   que as colunas que o código usa existem. Coluna nova sem cobertura ali é
   coluna que vai faltar em produção.
3. Ordem importa em `schema.sql`: índice depois da tabela. Um `CREATE INDEX`
   antes do `CREATE TABLE` derruba a criação do banco inteiro — e só aparece em
   banco novo, nunca no seu, que já tem a tabela.
4. O cabeçalho da migration diz o que verificar antes de aplicar em produção.
   Migration que reconstrói tabela com PII exige `PRAGMA table_info` antes.

## Testes

Teste que passa sem exercitar o código não é teste — é decoração. O suíte antigo
mockava o D1 devolvendo `{ok: true}` para qualquer query, e por isso não pegou
nenhum dos defeitos reais.

- Caminho novo de banco → teste de integração com D1 real (miniflare), no estilo
  de `test/schema-contract.test.ts`.
- Autenticação, autorização, isolamento de tenant → teste que confirma o **403**,
  não só o 200 do caminho feliz.
- Lógica não trivial (parser, cálculo, guarda de segurança) deixa uma verificação
  executável para trás.

## Segurança

Leia `SECURITY.md` — a tabela de invariantes lista o que não pode regredir e onde
cada um é garantido. PR que toca um deles precisa dizer no corpo qual e por quê.

Nunca no repositório: chave, token, ID de conta, hostname interno. Segredo vai em
`wrangler secret put`. Vulnerabilidade não vira issue pública — veja `SECURITY.md`.

## Estilo

Siga o código ao redor. O repositório é PT-BR: comentário, mensagem de erro e
texto de UI em português. Sem framework no frontend — é Vanilla JS por decisão,
não por falta de tempo.

Comentário explica **por que**, não o que. Comentário que narra a linha seguinte
é ruído que envelhece.
