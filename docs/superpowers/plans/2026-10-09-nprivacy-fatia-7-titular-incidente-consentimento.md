# Núcleo do n.privacy, fatia 7 — titular, incidente e consentimento (só interno)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seção 5 (Titular, Incidente, Consentimento, "Prazos regulatórios"), 6 e 9 (fatia 7). Decisão do dono de 09/10: **só registro interno**; o conector externo para o cliente instalar no site fica para depois e não é construído aqui. Depende das fatias 4 (tratamento) e 1 (partes). Plano mestre: `2026-10-09-nprivacy-plano-mestre-fatias-2-a-8.md`.

**Goal:** a equipe do cliente registra o pedido do titular (com protocolo, prazo e resposta), o incidente (com as datas de ciência e de comunicação) e a prova de consentimento ligada ao tratamento; os prazos vêm de parâmetros editáveis com fonte e revisão; o que vence aparece nos avisos.

## Decisões de desenho (rulings)

1. **Nenhum prazo legal é fixado por mim.** A tabela global `parametros_legais` guarda cada prazo como parâmetro (`chave`, `valor`, `unidade`, `fonte`, `revisado_em`, `revisado_por`); a migration **não semeia valor nenhum**. O dono (ou o jurídico, pelo `platform_admin`) cadastra o valor com a fonte e a data da revisão, e só então o prazo passa a ser calculado. Sem parâmetro, o prazo do pedido/incidente fica **"não calculado"** (`prazo_em` nulo) e a tela diz isso. Chaves: `titular.resposta`, `incidente.comunicacao_anpd`, `incidente.comunicacao_titular`. Unidades: `horas`, `dias_corridos`, `dias_uteis` (segunda a sexta; **feriado não entra**, ponytail: calendário de feriados se o jurídico pedir).
2. **O prazo é congelado no registro** (`prazo_em` gravado na criação, com a regra de hoje): mudar o parâmetro depois não reescreve o prazo de um pedido já recebido. Corrigir é editar o prazo à mão, com trilha.
3. **Pedido do titular** (`titular_pedidos`): protocolo sequencial por projeto (`PT-AAAA-NNNN`), `tipo` (os direitos do art. 18 como lista fechada: confirmação, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento, revogação do consentimento, oposição, outro), `canal`, `recebido_em`, dados de contato do titular (opcionais, texto), `status` (`recebido`, `em_andamento`, `respondido`, `negado`, `arquivado`), resposta (data e texto), responsável (parte). **Dado do titular só o necessário**: nome e contato são opcionais, e o texto livre vai para a trilha do titular (a rotina de direitos do titular já existente não é alterada).
4. **Incidente** (`incidentes`): protocolo `IN-AAAA-NNNN`, `titulo`, `descricao`, `ocorrido_em`, `ciencia_em` (obrigatório: é dela que os prazos contam), `risco_titular` (`sem_risco`, `baixo`, `relevante`; nulo até avaliar) com a justificativa, `comunicacao_anpd_em` e `comunicacao_titular_em`, `status` (`aberto`, `avaliado`, `comunicado`, `encerrado`), e os dois prazos calculados na criação a partir da ciência. Encerrar com risco `relevante` sem comunicação à ANPD é recusado (409): é o furo que o registro existe para impedir.
5. **Consentimento** (`consentimentos`): prova ligada ao tratamento (`ropa_id`, `ON DELETE CASCADE`): `finalidade`, `versao_aviso` (texto, ex.: "Política de Privacidade v3"), `obtido_em`, `canal`, `titular_ref` (referência **pseudonimizada** informada pela equipe; a tela avisa para não usar CPF), `revogado_em`. Revogar não apaga: a prova do que existiu fica.
6. **Avisos:** novas fontes `titular_pedido` (prazo de resposta de pedido ainda não respondido) e `incidente` (os dois prazos de comunicação ainda pendentes) na rotina diária, com o mesmo calendário D-7/D0/atraso. Para prazo em horas o aviso conta pelo dia.
7. **Tela:** uma tela "Titular e incidentes" com quatro abas: Pedidos, Incidentes, Consentimentos e Prazos legais (leitura para todos; edição só do `platform_admin`).

## Global Constraints

- Migration aditiva: só `CREATE TABLE IF NOT EXISTS` e índices; **sem carga** (nenhum valor de prazo). Backup antes; aplicar pelo terminal antes do merge.
- Tabela de projeto leva `project_id`; `parametros_legais` é global (como `requisitos`) e entra na lista de globais dos contratos.
- Sem dado real de titular em fixture, exemplo ou documento. O agente cria rascunho/registro; encerrar, negar e revogar consentimento seguem humanos (`FORA_DO_AGENTE`).
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria.

## Review Focus

- Sem parâmetro cadastrado o prazo é nulo e **nada quebra** (nem a criação, nem os avisos).
- O prazo não muda quando o parâmetro muda depois; dias úteis pulam sábado e domingo; horas contam a partir da `ciencia_em`.
- Protocolo sequencial não repete sob duas criações seguidas, e é por projeto.
- Encerrar incidente de risco relevante sem comunicação à ANPD: 409.
- Pedido, incidente e consentimento de um projeto nunca aparecem em outro; excluir o tratamento leva o consentimento.
- Só `platform_admin` escreve parâmetro, e a mudança vai para a trilha com fonte e revisor.

## Tasks

### 7.1 Migration 0058 e parâmetros

- [ ] Teste da migration (CHECKs, unicidade do protocolo por projeto, cascata, `parametros_legais` sem linhas).
- [ ] `migrations/0058_titular_incidente_consentimento.sql` + `schema.sql`.
- [ ] `src/services/parametros-legais.ts` (`lerParametros`, `salvarParametro`, `calcularPrazo`) e rotas `/api/v1/parametros-legais` (leitura aberta, escrita `platform_admin` com `logAudit`); `FORA_DO_AGENTE` para escrita.

### 7.2 Pedido do titular

- [ ] `src/services/titular-pedidos.ts` e rotas `/projects/:id/titular-pedidos*` (criar com protocolo e prazo, atualizar status/resposta, listar com situação do prazo).

### 7.3 Incidente e consentimento

- [ ] `src/services/incidentes.ts`, `src/services/consentimentos.ts` e rotas; regra de encerramento; revogar sem apagar.

### 7.4 Avisos, tela e fechamento

- [ ] Fontes `titular_pedido` e `incidente` em `avisos-prazo.ts`.
- [ ] Tela "Titular e incidentes" (quatro abas) com testes; docs (AGENTS, README, CHANGELOG, migrations/README, seguranca); `npm run openapi`; suítes e build.

## Rollout

Backup → `wrangler d1 migrations apply niso-db --remote` → `PRAGMA` das 5 tabelas e `count(*)` (0, inclusive `parametros_legais`) → merge → `/health`. Depois: **o dono cadastra os prazos** (com fonte e revisão) pela tela Prazos legais; até lá o prazo é "não calculado".

## Gaps declarados

- Os valores dos prazos dependem do material jurídico do dono; sem eles os avisos de prazo dessas fontes não disparam.
- Sem calendário de feriados (dias úteis = segunda a sexta).
- Sem conector externo (decisão de 09/10): formulário público, consentimento coletado no site do cliente e retorno automático ao titular ficam para depois.
