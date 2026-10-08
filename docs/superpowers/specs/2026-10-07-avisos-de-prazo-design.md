# Avisos de prazo: spec

**Estado:** desenho aprovado pelo dono em 2026-10-07. As respostas foram:
- canal: sino e e-mail;
- destinatários: o responsável mais o consultor;
- marcos: 7 dias antes, no dia e semanal depois de vencido;
- escopo: as cinco datas que já existem mais a revisão de política;
- abordagem A: rotina diária.

**Base:** branch `feat/fatia-jornada`, que já traz a assinatura de política, o link do auditor com revogação e a evidência ligada ao controle.

**Objetivo:** prazo que vence deixa de passar em silêncio. Quem precisa agir é avisado antes, no dia e enquanto o prazo estiver vencido.

## 1. Situação atual (2026-10-07)

- O único cron (`wrangler.jsonc` `"10 4 * * *"`, `src/manutencao.ts`) só faz limpeza.
- `createNotification` (`src/helpers.ts:118`) quase não é usada. O sino só recebe avisos de propostas e do fechamento da venda.
- `sendEmail(c, to, subject, html)` (`src/helpers.ts:663`) depende do contexto da requisição, e o cron só tem `env`.
- Datas guardadas que nunca geram aviso:
  - `corrective_actions.due_date`
  - `checklist_progress.due_date`
  - `audit_schedule.scheduled_date`
  - `certification_tracking.certificate_expiry`
  - `auditor_tokens.expires_at`
- Não existe data de revisão de política.

## 2. Fontes e regras

O dia é contado no fuso America/Sao_Paulo. Item já resolvido não gera aviso.

| Fonte | Data de vencimento | Resolvido quando | Responsável (texto) |
|---|---|---|---|
| CAPA | `corrective_actions.due_date` | status fechado (conferir os valores reais) | `assigned_to` |
| Item do checklist | `checklist_progress.due_date` | `is_checked = 1` | `assigned_to` |
| Auditoria interna | `audit_schedule.scheduled_date` | status realizado/concluído (conferir valores) | — (só o consultor) |
| Certificado | `certification_tracking.certificate_expiry` | renovado (expiry no futuro além do marco) | — (consultor) |
| Link do auditor | `auditor_tokens.expires_at` | `revoked_at` preenchido | — (só a equipe da consultoria) |
| Revisão de política | 12 meses após `max(ciso_approved_at, ceo_approved_at)` | as duas assinaturas ficam mais novas que 12 meses | `compliance_controls.owner` |

A revisão de política vale só para controles com texto de política e com as **duas** assinaturas. Política sem as duas assinaturas não está vigente e não entra.

## 3. Marcos

- `D-7`: o vencimento é daqui a 7 dias.
- `D0`: o vencimento é hoje.
- `atraso-<AAAA-Www>`: o prazo está vencido. Um aviso por semana ISO até resolver. O primeiro sai na semana do vencimento, se ainda não houve `D0` naquela semana. Caso contrário, sai na semana seguinte.

A rotina roda uma vez por dia, mas cada marco só gera aviso uma vez (seção 5). Se a rotina não rodar num dia, o marco perdido não é reenviado: `D-7` só vale no dia exato. Já `D0` e o atraso aparecem na execução seguinte enquanto estiverem vencidos.

## 4. Destinatários

- **Responsável.** Quando o texto do campo do responsável bate com o e-mail, ou com o nome ignorando maiúsculas e espaços, de um usuário **ativo** que alcança o projeto (mesma regra de acesso do resto do produto), esse usuário recebe.
- **Consultor.** O consultor designado na governança do projeto (`project_governance`, `role_category = 'consultor'`, com conta ativa) recebe.
- **Ninguém resolvido.** Se não houver responsável resolvido nem consultor, o aviso vai para os `consultoria_admin` ativos da organização do projeto. É a mesma regra do aviso de projeto sem consultor no P3.
- **Isolamento.** Nunca vai para usuário de outra organização.
- **Link do auditor.** O aviso vai só para a equipe da consultoria.

## 5. Registro e idempotência

A migration é a 0046. Ela entra no `schema.sql` e na migration, com o índice criado depois da tabela.

```
avisos_prazo
  id, project_id, fonte, item_id, marco, user_id,
  vence_em (data), criado_em, email_enviado_em (nulo até o e-mail sair)
  UNIQUE(fonte, item_id, marco, user_id)
```

Ordem da rotina:
1. Calcula os pares (item, marco, destinatário) do dia.
2. `INSERT OR IGNORE` em `avisos_prazo`.
3. Para as linhas que entraram agora, cria a notificação no sino, com link para o item.
4. Agrupa por usuário as linhas com `email_enviado_em` nulo e manda **um** e-mail-resumo por pessoa.
5. Marca `email_enviado_em` só depois do envio confirmado.

Se o e-mail falhar, a notificação no sino continua valendo e o resumo é tentado de novo no dia seguinte, sem notificação nova. Sem `RESEND_API_KEY`, só o sino funciona.

Limpeza: `manutencaoDiaria` apaga as linhas de `avisos_prazo` com mais de 400 dias.

## 6. Entrega

- **Sino.** A notificação usa `type` `prazo_<fonte>`. O título é curto ("CAPA vence em 7 dias", "Política A.5.1 precisa de revisão", "Auditoria interna hoje"). O link leva à tela do item.
- **E-mail.**
  - Assunto: "n.iso: N prazos para acompanhar".
  - Corpo em HTML simples, com todo dado escapado e a lista agrupada por projeto: item, marco, data e link.
  - Enviado com o remetente que o produto já usa.
- **`sendEmail`.** Passa a ter uma versão que recebe só `env` (ex.: `enviarEmail(env, to, subject, html)`), e a atual vira um invólucro dela. Não há cópia da lógica de envio.

## 7. Agendamento

- **Novo cron:** `"0 11 * * *"`, que é 08:00 em Brasília (UTC-3, sem horário de verão).
- **Despacho no `scheduled`.** Ele olha `event.cron`: o cron das 04:10 roda a manutenção e o das 11:00 roda `avisosDePrazo(env, hoje)`.
- **Parâmetro `hoje`.** A função recebe `hoje` para os testes simularem a data.
- **Falha isolada.** Um erro em uma fonte não derruba as outras: é registrado e a rotina segue.

## 8. Fora da v1

Ficam fora:
- validade de evidência;
- antecedência configurável;
- pessoa desligar o próprio aviso;
- WhatsApp e Slack;
- tela de "próximos prazos".

## 9. Testes, com D1 real e data simulada

1. Cada fonte gera `D-7`, `D0` e atraso nos dias certos, e item resolvido não gera nada.
2. Rodar duas vezes no mesmo dia não duplica a notificação nem o e-mail.
3. O destinatário sai do responsável quando o texto bate com um usuário do projeto. Sem responsável, vai ao consultor. Sem nenhum dos dois, vai ao `consultoria_admin`. Usuário de outra organização com o mesmo nome não recebe.
4. A revisão de política só vale para a política com as duas assinaturas e vence 12 meses após a mais recente.
5. O e-mail-resumo agrupa vários itens da mesma pessoa num e-mail só. Se o envio falhar, `email_enviado_em` continua nulo e o dia seguinte tenta de novo sem criar notificação nova.
6. Um erro numa fonte não impede as outras.
7. O `scheduled` despacha pelo cron certo.
