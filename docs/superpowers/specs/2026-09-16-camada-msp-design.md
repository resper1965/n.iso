# Camada MSP — vender a plataforma para consultorias

Data: 2026-09-16
Situação: proposto, aguardando aprovação

## Por que

A plataforma foi construída para uma consultoria: a ness. Isso está no código,
não só na cultura — `PAPEIS_NESS = {consultor, consultant, platform_admin}` em
`src/helpers.ts`, e `requireProjectAccess` devolve `true` para qualquer um deles
sem consultar nada.

Para vender o SaaS a outras consultorias, três coisas precisam mudar:

1. **Staff vê tudo.** No dia em que a segunda consultoria entrar, os consultores
   da primeira continuam enxergando a carteira dela.
2. **O funil comercial não tem dono.** `leads`, `assessments` e `proposals` não
   têm `project_id` nem qualquer coluna de escopo; a proteção é só por papel.
   Com dois MSPs na base, isso vaza pipeline comercial entre concorrentes.
3. **Cliente não existe como entidade.** `projects.client_name` é texto livre,
   então duas certificações da mesma empresa são duas strings sem laço.

O nó de fundo: hoje **"projeto" faz três trabalhos ao mesmo tempo** — é a
unidade de venda, a fronteira de isolamento e o escopo de trabalho. A camada MSP
separa os três.

## Decisões

Tomadas com o contratante em 2026-09-16.

| # | Decisão |
|---|---|
| 1 | Hierarquia em três níveis: **conta → cliente → projeto** |
| 2 | Só o MSP tem contrato com a ness (revenda). Cliente direto = conta própria |
| 3 | Admin do cliente vê todos os projetos dele; usuário comum vê os concedidos |
| 4 | A ness é uma conta MSP como outra qualquer. Só `platform_admin` é global |
| 5 | Pré-venda existe apenas para contas `tipo='msp'` |
| 6 | Escopo novo é **solicitado** e aprovado por quem gerencia o cliente |

### A decisão que molda o resto

O requisito de que **o cliente possa sair da consultoria mantendo a assinatura**
elimina a hierarquia por posse. Se cliente fosse filho da consultoria, sair seria
migração de dados — no exato momento de maior atrito comercial, que é onde se
perde registro.

Por isso os dados moram no **cliente**, e a conta que paga é um ponteiro para
ele. A saída troca o valor de uma coluna; nada se move.

## Modelo de dados

```
contas        quem tem contrato com a ness
              id · tipo('msp'|'direto') · nome · plano
              max_clientes · max_projetos · max_usuarios · status

clientes      a empresa que certifica — DONA DOS DADOS
              id · nome · cnpj · status
              conta_id → contas     ← a única coluna que muda numa saída

projetos      um escopo de certificação (tabela `projects` atual)
              + cliente_id → clientes

acesso_projeto   concessões para usuário comum do cliente
                 user_id · project_id

users         + conta_id    → contas    (staff de MSP)
              + cliente_id  → clientes  (usuário de cliente)

leads · assessments · proposals
              + conta_id → contas
```

`organizations` é **dropada**. Está vazia e órfã desde a migration 0005, e no
modelo novo o nome é ambíguo: "organização" pode ser a conta ou o cliente.

**Cliente final direto** = conta `tipo='direto'` com um cliente apontando para
ela. Mesmo esquema, mesmo código, sem caminho especial — o que evita uma segunda
regra de cobrança.

### Quem enxerga o quê

| Quem | Coluna | Alcança |
|---|---|---|
| `platform_admin` | nenhuma | tudo (opera o SaaS) |
| Staff de MSP | `conta_id` | projetos de clientes cuja `conta_id` é a dele |
| Admin do cliente | `cliente_id` | todos os projetos do cliente |
| Usuário comum | `cliente_id` | só os que têm linha em `acesso_projeto` |

## Autorização

`requireProjectAccess` é hoje **síncrona** e não toca o banco. Responder "esse
usuário alcança esse projeto?" passa a exigir subir a cadeia
`projeto → cliente → conta`, então a função vira assíncrona. Todos os call sites
são afetados.

Desnormalizar `conta_id` em `projetos` para manter tudo síncrono foi **descartado**:
na saída do cliente `clientes.conta_id` muda, e se a cópia não acompanhar em
transação, a consultoria antiga segue enxergando os projetos. Divergência de dado
aqui é vazamento, e o ganho seria uma consulta indexada por request.

A consulta vive no `projectAccessMiddleware`, que já é o funil único dessas
rotas. A sessão passa a carregar `conta_id` e `cliente_id`.

Três funções mudam junto, pelo mesmo motivo:

- `requireResourceAccess` — compara `row.project_id !== user.client_project_id`,
  que deixa de ser o critério
- `ehEquipeNess` → **`ehStaffDeConta(user)`** — a marca sai do código. Continua
  respondendo só "é staff?"; o escopo por conta é checagem separada, para não
  haver duas definições de staff que possam divergir
- `somenteNess` → **`somenteMsp`** — exige staff de conta `tipo='msp'` e escopa o
  funil por `conta_id`

**Direção de falha preservada:** papel desconhecido cai no ramo escopado, nunca
no global. `src/helpers.ts` registra que um papel fora da allowlist (`ciso`) já
caiu no ramo de plataforma e enxergou a carteira de todos os tenants. A allowlist
de staff continua sendo allowlist.

## Escopo novo: solicitação e aprovação

Projeto nasce hoje por três caminhos: `POST /projects`, assessment convertido e
proposta aprovada. Os dois últimos são pré-venda, que conta `tipo='direto'` não
tem — então sobraria só o primeiro, que hoje não valida dono nem teto.

A solicitação resolve isso com uma regra só, e o destinatário é derivado de
`clientes.conta_id`:

```
admin do cliente solicita escopo novo
  └─ cliente sob MSP    → o MSP aprova
  └─ conta direta       → platform_admin aprova
aprovação cria o projeto · recusa registra motivo
```

Não é fila separada por tipo de conta: é uma fila cujo destinatário sai de quem
gerencia o cliente. Cliente que sai da consultoria passa a ter as solicitações
dele endereçadas à ness sem nenhuma mudança de código.

O teto de `max_projetos` é verificado na **aprovação**, não na solicitação — pedir
acima do teto é válido e vira conversa de upgrade.

## Limites, saída e suspensão

Três tetos, todos na conta: `max_clientes`, `max_projetos` (total da conta) e
`max_usuarios`. `max_projetos` fica na conta e não no cliente porque projeto é o
trabalho real — sem esse teto, um MSP com 5 vagas de cliente abre 500 escopos.

**Estouro nunca revoga.** O limite bloqueia criação nova e nada mais. Quem já
está acima do teto — por migração ou downgrade — continua trabalhando. É o
princípio que `src/politica-tenant.ts` já defende: *"todo mundo perdeu acesso é
pior que qualquer coisa que a política venha a prevenir"*.

### Saída do cliente

Em ordem que nunca deixa órfão:

```
1. cria conta tipo='direto'                 ← destino existe ANTES
2. UPDATE clientes SET conta_id = <nova>    ← transação
3. vaga liberada no plano do MSP
4. audit_logs
```

Staff do MSP perde acesso no mesmo instante, porque o acesso é derivado — não há
permissão a limpar. Usuários do cliente não percebem nada.

**O cliente não leva a pré-venda dele** (lead, assessment, proposta): é histórico
comercial de quem vendeu. Isso precisa estar no contrato, não só no código.

### Suspensão por inadimplência

```
staff do MSP        → não entra
usuários do cliente → leem e exportam, não escrevem
```

Quem deve perde o acesso; quem não deve perde só a caneta. O cliente não é parte
da briga comercial, e num produto de conformidade bloquear evidência em pleno
ciclo de auditoria tem custo real para ele.

O mecanismo **já existe**: `src/middleware/auth.ts` bloqueia
`POST/PUT/PATCH/DELETE` para papéis read-only, com allowlist casada por método +
regex de rota. Suspensão entra na mesma guarda um degrau acima — **sem
allowlist**, mais restrita que o read-only de papel (em suspensão nem evidência
sobe).

Exportar é `GET`, e o handler em `src/routes/projects.ts` registra que
*"o dado é do cliente, e o direito de levá-lo é dele"*. Então o cliente nunca
fica refém: lê e leva os dados embora mesmo suspenso.

Destravar é trocar `status` de volta para `Active`. Nada a reprocessar.

## Migração

```
1. cria contas · clientes · acesso_projeto
2. conta 'ness' (tipo='msp')
3. client_name distintos      → clientes sob a conta ness
4. projects.cliente_id        ← cliente correspondente
5. users:
     com client_project_id    → cliente_id do projeto
                              + linha em acesso_projeto   ← isolamento idêntico
     staff (consultor/…)      → conta_id = ness
     platform_admin           → sem conta (global)
6. leads · assessments · proposals → conta_id = ness
7. DROP organizations
```

**Passo 5 é o que não pode errar.** Emitir a concessão para cada usuário
existente mantém o acesso dele exatamente como é hoje — um projeto, o dele.
Ninguém acorda enxergando projeto novo. Visão ampliada só aparece para quem for
promovido a `org_admin` depois, deliberadamente.

**Passo 3 é 1:1.** Sondagem da produção em 2026-09-16 não encontrou nenhuma
colisão de `client_name` normalizado — nenhuma empresa aparece com duas grafias.
Não há heurística de dedup a construir.

Se colisão aparecer no futuro, a regra é: deduplicar por **CNPJ** (coluna já
existe em `projects` desde a migration 0010), nunca por nome. Fundir duas
empresas distintas mistura evidência e política — vazamento, e irreversível
depois que alguém escreve por cima. Na dúvida, separa.

### Colunas legadas

Duas colunas ficam redundantes e **não são removidas nesta entrega**:

- `users.client_project_id` — substituída por `cliente_id` + `acesso_projeto`.
  Mantida durante a transição para que a migration seja reversível: enquanto ela
  existir e estiver preenchida, dá para voltar atrás sem restaurar backup.
- `projects.client_name` — substituída por `clientes.nome`. Mantida porque várias
  consultas e telas leem dela hoje; passa a ser preenchida a partir do cliente.

Ambas saem numa migration posterior, depois que a nova estrutura rodar em
produção sem incidente. Remover na mesma entrega transforma um rollback barato em
restauração de backup.

## Testes

A suíte existente é a linha de base **e vai quebrar**: `idor-tenant`,
`idor-tenant-project-scoped` e `contrato-isolamento-topo` assumem dois tenants e
um staff que vê tudo. As duas premissas mudam. A quebra é a rede funcionando.

`contrato-isolamento-topo` descobre rotas lendo o fonte (`index.ts?raw`), então
rota nova entra no teste no mesmo commit em que nasce. Isso continua valendo.

A fixture passa a precisar de uma matriz, porque os vazamentos novos só aparecem
nela:

```
conta MSP A ─┬─ cliente A1 ─┬─ projeto 27001
             │              └─ projeto 27701
             └─ cliente A2 ─── projeto 27001
conta MSP B ─── cliente B1 ─── projeto 27001
conta direta ─── cliente C  ─── projeto 27001
```

Casos, em ordem de importância:

| # | Prova |
|---|---|
| 1 | consultor da conta A → projeto de cliente da conta B = **403** |
| 2 | admin do cliente A1 vê os dois projetos; usuário comum vê só o concedido |
| 3 | após `UPDATE conta_id`, staff do MSP antigo toma 403; usuário do cliente segue 200 |
| 4 | suspensão: staff não entra; cliente `GET` 200, `POST` 403, `export` 200 |
| 5 | conta `direto` em `/leads`, `/assessments`, `/proposals` = 403 |
| 6 | criação acima do teto = 403, mas quem já estourou segue editando o que existe |
| 7 | papel desconhecido cai no ramo escopado — regressão do incidente do `ciso` |

O #1 primeiro: é o que separa "plataforma da ness" de "plataforma vendável".

## Fora de escopo

Deliberadamente não entram nesta entrega:

- **Auto-cadastro.** Não existe hoje (`/setup` é protegido por `SETUP_KEY`) e
  venda B2B por contrato não precisa. Conta nova nasce por ação de
  `platform_admin`.
- **Cobrança automatizada.** Plano e limites ficam na tabela; faturamento
  continua fora do produto.
- **Tabela de vínculo histórico** cliente↔consultoria. `audit_logs` registra a
  troca. Só vale construir se auditoria pedir o vínculo formal.
- **Ferramenta de mesclar clientes.** Sem colisão na base, não há o que mesclar.
- **Impersonação para suporte.** Descartada nesta rodada em favor de
  `platform_admin` global. Vale revisitar quando um MSP perguntar quem da ness
  leu os dados dele — a pergunta vai aparecer numa due diligence.
- **Quarto nível (unidade de negócio).** Grupo econômico com subsidiárias
  certificando separado. Só quando um cliente pedir.
