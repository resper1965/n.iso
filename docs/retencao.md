# Política de retenção

> Item 4.5 do `enterprise-grade-plan.md`. O que é apagado, quando, e — mais
> importante para uma auditoria — **o que não é, e por quê**.

A política não vive só aqui. A tabela `RETENCAO` em `src/manutencao.ts` é o que
o cron de fato executa; este documento explica cada prazo. Os dois não podem
divergir porque os números estão num lugar só.

## O que é apagado automaticamente

| Tabela | Prazo | Por quê |
| :--- | ---: | :--- |
| `notifications` | 180 dias | Aviso de interface. Perde utilidade em dias; guardar por anos é acúmulo sem uso. |
| `ai_chat_history` | 180 dias | Pode conter texto que o consultor colou de um documento do cliente. Minimização — LGPD art. 6º, III. |
| `rate_limits` | 7 dias após a janela fechar | Contador operacional. A margem existe para a purga **nunca** alcançar janela aberta: apagar a linha de quem está sendo limitado zeraria o contador, transformando limpeza em bypass. |
| `auditor_tokens` vencidos | 90 dias após o vencimento | Credencial de acesso externo a dado de cliente. Token vencido já não autentica nada; some por retenção, não por segurança. A carência cobre o ciclo de uma auditoria — investigar um acesso do mês passado exige que a linha ainda exista. |

## O que NÃO é apagado, e por quê

Esta metade é a que importa numa auditoria de fornecedor.

**Registro de GRC — evidência, risco, controle, ROPA, auditoria, CAPA,
constatação, revisão de direção — nunca entra em purga automática.** São a razão
de o produto existir; o prazo deles é decisão do cliente e frequentemente da
norma (certificação exige o histórico dos ciclos anteriores); e apagá-los por
rotina de plataforma seria destruir o trabalho pelo qual o cliente paga. Há
teste que insere um risco e uma evidência com 3000 dias e exige que sobrevivam
ao cron.

**`audit_logs` também não**, por dois motivos que se somam:

1. os triggers da migration `0018_data_hardening.sql` recusam `DELETE` no nível
   do banco — a trilha é o último lugar onde apagar por conveniência faz
   sentido;
2. o crescimento dela é contido pelo **arquivamento**, não por purga: o cron
   copia o dia fechado para o bucket `niso-trilha` (`src/trilha.ts`), encadeado
   por hash.

> **Consequência assumida:** a tabela `audit_logs` no D1 cresce sem limite. Hoje
> são ~1.000 linhas; o problema só existe em outra ordem de grandeza. Quando
> chegar lá, a saída é podar o que já está arquivado — o que exige **derrubar o
> trigger de propósito, com registro**, e não uma rotina que o faça sozinha.
> Automatizar isso seria dar à plataforma o poder que a trilha existe para
> negar.

## Direito ao apagamento (LGPD art. 18, VI)

A retenção acima é rotina de plataforma. Pedido de titular é outro caminho, e
tem rota própria: `POST /api/v1/projects/:projectId/data-subject/erase`, que
exige identificador e **justificativa**, e registra o pedido na trilha.

## Como conferir o que o cron fez

O resultado de cada execução sai no log estruturado:

```bash
npx wrangler tail --format json | grep manutencao_diaria
```

```json
{"msg":"manutencao_diaria","rate_limits_removidos":0,"tokens_auditor_removidos":0,
 "trilha_arquivada":"2026-09-05","retencao":{"notifications":3,"ai_chat_history":0},
 "falhas":[]}
```

Cada tarefa é independente: uma que estoura não impede as outras, e o que falhou
vai em `falhas` em vez de derrubar o cron inteiro. Perder a limpeza de um dia é
aceitável; perder o registro do porquê não é.
