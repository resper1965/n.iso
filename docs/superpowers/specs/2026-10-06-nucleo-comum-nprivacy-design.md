# Núcleo comum do n.iso e do n.privacy — spec para revisão

**Estado:** ESTUDO. Nada aqui está aprovado para implementar.
**Data:** 2026-10-06.
**Base:** decisões do dono (perguntas laterais), pesquisa de mercado na web e levantamento do código em `main` (`e9db819`).

---

## 1. O que está decidido e não se reabre aqui

- **Produto e público.** O n.privacy é um produto de privacidade com casca própria, sobre a mesma base do n.iso e multi-tenant como ele.
  - Usuário: o DPO da empresa e a consultoria.
  - Cliente: começa do zero ou migra planilhas.
  - LGPD primeiro, GDPR depois. Venda igual à do n.iso.
- **Núcleo comum unificado ao máximo:**
  - **Partes** (pessoas e organizações), com o papel definido no vínculo: encarregado, dono de processo, dono de sistema, operador, cocontrolador, suboperador, terceiro.
  - **Itens:** um cadastro só, com tipo (sistema, ativo, base, processo). Núcleo fino e atributos por produto.
  - **Departamentos.**
  - **Documentos.**
  - **Catálogo de requisitos.**
  - **Evidências.**
  - **Pedidos** (aprovação e ciência com prova).
  - **Trilha.**
- **Ativos e responsáveis do n.iso.** Evoluem para o núcleo, com migração sem perda.
- **Políticas.** São capacidade do núcleo: documento, versão, hierarquia, revisão, distribuição e exceções. Não é um sistema n.policy.
- **Catálogo de requisitos.**
  - Unificado, com fontes: ISO 27001, ISO 27701, LGPD e GDPR.
  - Tem mapeamento entre as fontes, que passa pelo advogado.
  - O texto da ISO não entra, só a referência.
  - Documentos e evidências apontam para requisito, não para controle ISO.
- **Regras de produto:**
  - O controle ISO fica no n.iso e o documento só aponta para ele. Não há catálogo duplicado.
  - Documento existe sem controle ISO.
  - Cliente sem n.iso tem módulos habilitados, e os documentos dele ligam a artigos da LGPD.
  - O n.secops é projeto interno do mesmo núcleo.
- **RoPA:**
  - Detalhado, com diagramas Mermaid.
  - Preenchido por tela, importação, API e agente externo via MCP.
  - O rascunho do agente só vale depois de aprovado por uma pessoa.
- **DPIA e LIA:** nascem do tratamento.
- **TPRM tipificado.** O tipo do terceiro define o método:

  | Tipo de terceiro | Método |
  |---|---|
  | Grande provedor | Trust center por link e evidência com validade |
  | Médio | Questionário |
  | Pequeno | Avaliação guiada |
  | Crítico | Avaliação aprofundada |

  A primeira versão do trust center é manual.

---

## 2. Mercado: onde o n.privacy se posiciona

Pesquisa na web em 06/10/2026. Quase tudo vem de páginas dos fornecedores, e marketing exagera. As fontes estão no relatório da sessão. Os pontos que mudam a spec:

**Mesa básica, que todo concorrente sério já tem:**
- RoPA ou inventário;
- DPIA;
- pedidos do titular (DSAR) com fluxo e prazo;
- avaliação de fornecedor por questionário;
- algum assistente de IA.

Nas brasileiras (Privacy Tools, DPOnet), também são básicos:
- RIPD;
- LIA;
- incidente com fluxo para a ANPD;
- tudo em português.

**O que o desenho não tem e o comprador vai perguntar:**
- **Descoberta automática de dados pessoais.** OneTrust, Securiti, BigID, DataGrail e Privacy Tools fazem. O n.privacy é declarativo; isso tem de estar dito no posicionamento, senão a comparação é injusta.
- **Gestão de consentimento e cookies (CMP).** É um produto em si; Didomi e Usercentrics vivem disso. Recomendação: **não construir**. Registrar a prova de consentimento como evidência e integrar com uma CMP depois. Decisão do dono (seção 10).
- **Portal de pedidos do titular.** Básico no mercado. Hoje não existe (seção 3.4).
- **Incidente com prazo da ANPD.** Básico nas brasileiras. Hoje não existe.

**Diferenciais propostos, conferidos:**
- **Agente via MCP preenchendo o RoPA: não é inédito.**
  - A DataGrail tem MCP que cria sistemas e preenche documentação desde março de 2026, só no plano Enterprise.
  - A Transcend tem MCP com confirmação ligada por padrão.
  - O que **não** encontrei: rascunho com estado formal, que só passa a valer depois da aprovação, com prova imutável; e MCP em plataforma de LGPD em português.
  - O diferencial é esse rascunho com prova, não o MCP em si.
- **TPRM por tipo de fornecedor: a ideia existe.**
  - A OneTrust avalia por tier e criticidade.
  - Vanta e Drata buscam documentos em trust centers.
  - A Drata pede aprovação antes de gravar.
  - Não achei a tipologia de quatro métodos com controle de validade da evidência. O diferencial está no empacotamento.

**Lacunas de mercado no Brasil que favorecem o desenho:**
- **Consultoria com vários clientes.** Só o DPO MAX oferece white label explícito para consultoria. O n.iso já é multiconsultoria.
- **Base ISO 27001/27701 com mapeamento formal para a LGPD.** Quase ninguém tem; a Confidata alega ter.
- **MCP em português.** Nenhuma brasileira tem MCP verificado.
- **Diagrama de fluxo versionado.** Não achei em nenhuma brasileira.

**Correções à lista de concorrentes:**
- "Adequa" é projeto acadêmico (Univali), não produto.
- "PrivacyOps" é o nome da metodologia da Securiti.
- Os concorrentes brasileiros reais são Privacy Tools, DPOnet, Confidata, DPO MAX e LGPDNOW.

---

## 3. Levantamento do código: o que existe, o que é parcial, o que é novo

Medido em `main` `e9db819`, com 58 tabelas (comando do `AGENTS.md`). As linhas citadas são de `schema.sql` e `src/`.

### 3.1 Resumo

| Área | Situação | Distância para o alvo |
|---|---|---|
| Partes (pessoas e organizações com papel por vínculo) | **Novo.** O responsável é texto livre em 6 tabelas. Pessoas espalhadas em 5 tabelas sem ligação. | Grande |
| Itens (cadastro único com tipo) | **Parcial.** Só `assets`, com tipo livre. | Grande |
| Departamentos | **Novo.** Nenhuma tabela. | Pequena (tabela nova) |
| Catálogo de requisitos com fontes e mapeamento | **Novo.** Controle é linha por projeto; 27701 em dois catálogos divergentes; LGPD só em comentário. | Grande |
| Documentos e políticas no núcleo | **Parcial.** Versão e ciência com prova existem; política não é entidade. | Grande |
| Evidências apontando para requisito | **Parcial.** `evidence.control_id` anulável, sem validade. | Média |
| Pedidos (aprovação e ciência com prova) | **Existe e é forte.** Só aceita `dpia` e `politica`. | Pequena |
| Trilha | **Existe.** `audit_logs` append-only, com trilha por campo. | Pequena |
| Módulos por organização ou projeto | **Novo.** | Média |
| RoPA | **Existe**, mas é registro plano em texto, sem ligação a sistemas, terceiros ou departamentos. | Grande |
| DPIA | **Existe**: aprovação, revogação, relatório e pedido com prova. | Média |
| LIA | **Novo.** | Média |
| TPRM | **Parcial.** Tabela plana com checkboxes e score aditivo. | Grande |
| Direitos do titular | **Parcial.** Busca por igualdade só em pessoas do próprio n.iso; sem pedido, prazo ou portal. | Média |
| Consentimento, transferência internacional, incidentes | **Novos.** Só texto no RoPA. | Grande |
| Encarregado | **Parcial.** É um cargo em texto em `project_governance`. | Pequena a média |
| Agente MCP | **Existe**: preso ao projeto, papel, confirmação em ação destrutiva. O rascunho de IA é só instrução de texto. | Média |

### 3.2 Núcleo: o que existe hoje

- **Pessoas.** Cinco lugares, nenhum ligado ao outro:
  - `users` (contas);
  - `project_governance` (nome, e-mail e cargo em texto, sem FK para `users`);
  - `stakeholders` (cláusula 4.2);
  - `training_records.employee_name`;
  - `policy_acknowledgments.user_name/user_email`.

  O destinatário de pedido (`pedido_destinatarios`) tem nome, e-mail e um `user_id` sem FK.
- **Responsável é texto livre** em `assets.owner`, `risks.owner`, `compliance_controls.owner`, `ropa_records.owner`, `corrective_actions.assigned_to` e `checklist_progress.assigned_to`. A reatribuição em lote compara strings (`src/routes/projects.ts:470-488`).
- **Organizações.**
  - `organizations` é o tenant da **consultoria**.
  - O **cliente** é o `projects` (`client_name`, `cnpj` em texto).
  - O **terceiro** é o `vendors`.

  São três "organizações" em três modelos.
- **Ativos.**
  - Tabela `assets` (`schema.sql:451`), com `type`, `category` e `classification` em texto sem CHECK, e remoção lógica `status='Removido'`.
  - O SQL que a toca está em 6 arquivos de backend; mais 2 telas, 1 ferramenta MCP e 9 arquivos de teste.
  - `risks.asset_id` é a única FK que aponta para ativo. A rastreabilidade usa o texto `risks.asset`, não a FK.
- **Controles.**
  - `compliance_controls` tem uma linha por projeto, e nada semeia os 93 controles do Anexo A num projeto novo. Conferido: os únicos `INSERT INTO compliance_controls` estão em `src/routes/projects.ts:820,863,910`, que fazem migração 2013→2022 e o seed da 27701. Isso confirma a pendência "carregar catálogo".
  - O catálogo 27701:2025 tem duas versões que não batem:
    - `src/data/iso27701-2025.ts`: 31 de controlador e 18 de operador, o que é semeado.
    - `PIMS_RULES` em `src/services/soa-logic.ts:225-307`: 78 regras com outra numeração.
- **Política não é entidade.**
  - O texto vive em `compliance_controls.description`, o mesmo campo que guarda a justificativa de exclusão da SoA (`soa-logic.ts:78-84`): um campo com dois significados.
  - `policy_versions` versiona por controle (`control_id`, número por `COUNT(*)+1`).
  - Não há hierarquia, revisão periódica como dado nem exceção.
- **Pedidos.**
  - Conteúdo congelado com SHA-256, prova por pessoa (canal, IP, user agent, hash lido, MFA) e triggers de imutabilidade. É a peça mais madura e entra no núcleo como está.
  - O `pedidoCriarSchema` só aceita `dpia`; política entra só por ciência em lote.
- **Ciência antiga.** `policy_acknowledgments` (sem hash e sem versão) convive com os pedidos. O portal `/politicas` usa os dois mecanismos.
- **Multi-tenant.**
  - O acesso ao projeto é decidido por designação em `project_governance` (consultor), pela org (`consultoria_admin`) ou por `users.client_project_id` (cliente).
  - `projects.standards` é texto livre. Não há módulos.

### 3.3 Privacidade: o que existe hoje

- **RoPA** (`ropa_records`, `schema.sql:548`).
  - Finalidade, categorias, titulares, base legal, retenção, destinatários e transferência internacional são texto livre. Transferência é 0/1 mais salvaguarda em texto.
  - Aprovação CISO/CEO com IP e user agent, assinatura pelo cargo (`autoridadeDeAssinatura`, `src/helpers.ts:406`) e revogação com motivo. Relatório só em HTML.
  - Não tem:
    - importação, exportação em planilha ou diagrama;
    - versão do registro;
    - ligação a sistema, terceiro ou departamento;
    - pedido com prova: a aprovação é direta, fora de `pedidos`.
  - O select de base legal não cobre o art. 7 inteiro nem o art. 11 (dados sensíveis).
- **DPIA** (`dpia_assessments`).
  - Aprovação, revogação, relatório "RIPD/DPIA" e assinatura por pedido com prova.
  - Convivem duas famílias de colunas (tela e API). `ropa_id` é texto sem REFERENCES; a API valida o tenant, a tela não preenche o campo.
- **Titular** (`src/services/data-subject.ts`).
  - `FONTES_PII` procura por igualdade só em pessoas do próprio n.iso (treinamento, ciência, governança, partes interessadas).
  - Não há registro do pedido do titular, protocolo, prazo, portal público nem tela no frontend.
- **Encarregado.**
  - É uma linha de `project_governance` com cargo contendo "DPO".
  - Para assinar, DPO, CISO e Líder SGSI são o mesmo papel, decidido por substring do cargo (`src/helpers.ts:426`).
  - Não há nome e contato públicos do encarregado (art. 41).
- **Fornecedores** (`vendors`).
  - Flags de certificação e controles (`has_mfa`…), `trust_center_url`, `dpa_signed`/`dpa_url` e score aditivo (duplicado no frontend, `grc.js:615`).
  - Não tem:
    - tipo tipificado;
    - questionário;
    - evidência com validade;
    - suboperadores;
    - ligação ao RoPA.
  - PUT e DELETE não gravam trilha.
- **Agente MCP.**
  - Grava RoPA hoje via `niso_executar`, e o registro nasce `Draft` (`src/routes/ropa.ts:69`).
  - "Rascunho de IA só vale com aprovação humana" é instrução de texto (`src/mcp/contexto.ts:8`). O servidor não impõe, e `niso_update_policy` sobrescreve o texto vigente na hora.

### 3.4 Defeitos encontrados no caminho

Não fazem parte do estudo, mas estão no terreno que o núcleo vai pisar. Todos foram conferidos no código, salvo onde dito.

1. **A tela de DPIA chama `DELETE /api/v1/dpia/:id`, que não existe.** Só há `PUT` (`src/routes/platform.ts:66`); a exclusão pela tela recebe 404 (`frontend/src/views/privacy.js:475`).
2. **O modal de risco não lista ativos.** `GET .../assets` devolve `{ok, assets}`, mas `grc.js:267-270` espera um array e zera a lista.
3. **`location`, `classification` e as notas CID somem ao criar ativo.** O INSERT de `src/routes/project-assets.ts:46` não grava esses campos, embora a API e o MCP os aceitem. (Afirmação do levantamento, não reconferida linha a linha.)
4. **Colunas `*_approved_ip/ua` sem migration.** Existem em `schema.sql` para controles, evidências e RoPA, mas nenhuma migration as cria. Produção tem as colunas: `pragma_table_info('ropa_records')` mostra as duas, então é deriva só para banco novo montado por migrations.
5. **Nenhum caminho semeia os 93 controles do Anexo A** (ver 3.2).
6. **Dois catálogos 27701:2025 divergentes** (ver 3.2).
7. **`vendor.created` vai para a trilha sem `project_id`; PUT e DELETE de fornecedor não registram nada.**
8. **O CSV de ativos exporta os removidos.**

Recomendação: uma fatia 0 de correção antes do núcleo (seção 9).

---

## 4. Modelo do núcleo

Princípios:
- **Núcleo fino e blocos por produto.**
- **Id preservado na migração.**
- **Toda FK nova dentro do projeto validada por `refForaDoProjeto`.**
- **Texto normativo fora do banco.**

### 4.1 Tenancy e módulos

- **Mantém:** `organizations` (consultoria) → `projects` (cliente).
- **Novo:** `projeto_modulos (project_id, modulo, habilitado_em, habilitado_por)`, com `modulo IN ('iso','privacy','secops')`.
- **Teto:** a organização define quais módulos pode habilitar (`organizations.modulos_contratados`, JSON). O projeto não habilita o que a org não contratou.
- **Ponto aberto.** O pedido diz "módulos habilitados por organização". Neste código a organização é a consultoria e o cliente é o projeto. Proponho habilitar **por projeto**, com teto na org. Confirmar (seção 10).

### 4.2 Partes

```
partes
  id, project_id → projects
  tipo          'pessoa' | 'organizacao'
  nome
  email         (pessoa; opcional)
  documento     (CNPJ da organização; CPF NÃO entra — ver nota)
  user_id       → users, opcional (a pessoa que também tem conta)
  pais          (organização; para transferência internacional)
  status        'ativa' | 'inativa'
  created_at, updated_at

parte_vinculos
  id, project_id
  parte_id      → partes
  papel         'encarregado' | 'dono_processo' | 'dono_sistema' | 'operador'
                | 'cocontrolador' | 'suboperador' | 'terceiro' | 'responsavel'
                | 'parte_interessada'
  alvo_tipo     'projeto' | 'item' | 'departamento' | 'tratamento' | 'parte'
  alvo_id       (suboperador: alvo_tipo='parte', alvo = o operador)
  desde, ate    (vínculo com vigência; o histórico não se apaga)
```

- **O papel é do vínculo, não da parte.** A mesma organização pode ser operadora num tratamento e terceira noutro.
- **CPF fica fora.** Não serve ao propósito, e cada CPF guardado é um dado a mais que o pedido do titular precisa alcançar.
- **`users` continua sendo a conta.** `partes.user_id` liga a pessoa à conta quando ela existe.
- **Encarregado:** vínculo `papel='encarregado', alvo_tipo='projeto'`, com contato público (art. 41). A assinatura do DPO deixa de ser decidida por substring de cargo e separa DPO de CISO. Hoje os dois são o mesmo papel em `autoridadeDeAssinatura`.
- **Migração das pessoas:**
  - `project_governance` vira parte, mais vínculo `responsavel`, mais o cargo. A tabela continua existindo durante a transição, porque decide acesso de consultor (`src/helpers.ts:203`).
  - `vendors` vira parte (organização), mais vínculo `terceiro`, mais a avaliação de TPRM (seção 5).
  - `stakeholders` vira parte, mais vínculo `parte_interessada`; avaliar se entra.
  - Os campos `owner`/`assigned_to` em texto ganham `*_parte_id` ao lado. O texto fica até a tela migrar, e a conciliação texto→parte é por nome exato dentro do projeto, com relatório do que não casou.

### 4.3 Departamentos

```
departamentos
  id, project_id, nome, pai_id → departamentos (hierarquia), status
```

O responsável é vínculo (`parte_vinculos`, `alvo_tipo='departamento'`), não coluna.

### 4.4 Itens

```
itens                                   -- núcleo fino
  id            (o id de assets é preservado)
  project_id
  tipo          'sistema' | 'ativo' | 'base' | 'processo'
  nome, descricao
  departamento_id → departamentos, opcional
  status        'ativo' | 'removido'
  created_at, updated_at

item_seguranca                          -- bloco do n.iso (1:1)
  item_id → itens
  categoria, classificacao, criticidade, localizacao,
  nota_c, nota_i, nota_d

item_privacidade                        -- bloco do n.privacy (1:1)
  item_id → itens
  contem_dado_pessoal, contem_dado_sensivel,
  pais_hospedagem, operador_parte_id → partes

item_relacoes                           -- grafo (alimenta o Mermaid e o impacto)
  origem_id → itens, destino_id → itens,
  tipo 'hospeda' | 'alimenta' | 'usa' | 'faz_backup_em'
```

- **O dono é vínculo:** `dono_sistema` e `dono_processo` em `parte_vinculos`.
- **Migração de ativos sem perda:**
  1. Backup (`npm run db:backup`).
  2. Copiar `assets` para `itens` com **o mesmo id**, `tipo='ativo'`; os campos de segurança vão para `item_seguranca`.
  3. `risks.asset_id` continua válido sem reescrita, porque o id é o mesmo.
  4. Transição: a view `assets` sobre `itens` + `item_seguranca`, de leitura, para as 6 consultas de backend e as 2 telas migrarem uma de cada vez. O D1 tem `CREATE VIEW`; conferir no staging antes.
  5. Teste de migração com dado de produção anonimizado no staging: contagem igual, todo `risks.asset_id` resolvido, nenhum campo vazio que antes tinha valor.
  6. `assets` só sai depois que nenhuma consulta a lê (`test/colunas-catraca.test.ts` serve de modelo).
- **Ponto aberto:** "processo" como item e "tratamento" como entidade (4.7) podem se confundir. Proponho: processo é a atividade de negócio (item); tratamento é o registro do art. 37 que *usa* processos, sistemas e bases.

### 4.5 Catálogo de requisitos

Global: não é por projeto, é dado de referência como o catálogo 27701 de hoje.

```
requisito_fontes
  id            'iso27001:2022' | 'iso27701:2025' | 'lgpd' | 'gdpr'
  nome, versao, vigente_desde

requisitos
  id            ex.: 'lgpd:art37', 'iso27001:2022:A.5.1'
  fonte_id → requisito_fontes
  referencia    'art. 37' | 'A.5.1'
  titulo        próprio (paráfrase curta; NUNCA o texto da ISO)
  pai_id → requisitos   (artigo → inciso; cláusula → controle)
  papel         'controlador' | 'operador' | null   (27701 A.1 / A.2)

requisito_mapeamentos
  de_id → requisitos, para_id → requisitos
  tipo          'equivalente' | 'parcial' | 'relacionado'
  estado        'proposto' | 'validado_juridico'
  validado_por, validado_em, nota
```

- **Só `validado_juridico` aparece para o cliente.** O `proposto` é trabalho interno até o advogado assinar.
- **Ligação com o n.iso sem duplicar.** `compliance_controls` continua sendo a instância por projeto (status, maturidade, SoA) e ganha `requisito_id`. O controle ISO fica no n.iso; o requisito é a referência comum.
- **Antes de semear:**
  - escolher **um** catálogo 27701:2025 (`src/data/iso27701-2025.ts` ou `PIMS_RULES`) e apagar o outro;
  - o seed dos 93 do Anexo A passa a sair daqui.
- **LGPD e GDPR entram como artigo e inciso**, com título curto próprio. Texto de lei é público, mas a paráfrase e a ligação passam pelo jurídico.

### 4.6 Documentos e políticas

```
documentos
  id, project_id
  tipo          'politica' | 'norma' | 'procedimento' | 'registro' | 'aviso' | 'contrato'
  titulo
  pai_id → documentos           (política → norma → procedimento)
  dono_parte_id → partes
  revisar_a_cada_meses, revisar_ate
  status        'rascunho' | 'vigente' | 'obsoleto'

documento_versoes
  id, documento_id, numero      (sequencial, UNIQUE(documento_id, numero))
  texto, hash                   (SHA-256 canônico, o mesmo dos pedidos)
  estado        'rascunho' | 'vigente' | 'substituida'
  origem        'humano' | 'agente' | 'gerador'
  criado_por, criado_em

documento_requisitos            -- N:N; o documento existe sem nenhuma linha aqui
  documento_id, requisito_id

documento_excecoes
  id, documento_id, escopo, motivo, vence_em,
  pedido_id → pedidos           (a aprovação da exceção tem prova)
```

- **A ciência aponta para a versão.** Hoje o pedido congela `title + description` do controle. Passa a congelar `documento_versoes` (`tipo='documento'`, `ref_id = versao_id`). Quando nasce uma versão vigente nova, as ciências antigas continuam válidas para a versão que citam e aparecem como "versão anterior". É o efeito pedido, sem reescrever prova.
- **Revisão:** `revisar_ate` vencido sinaliza o documento e o dono. A rotina diária é a mesma das demais validades (4.9).
- **Migração:**
  - Cada controle com texto de política vira um documento `tipo='politica'`.
  - Versões vêm de `policy_versions`, mais a versão vigente vinda de `description`.
  - Ligação ao requisito do controle.
  - A justificativa de exclusão da SoA ganha coluna própria (`compliance_controls.justificativa_exclusao`), acabando com o campo de dois significados.
  - O portal `/politicas` passa a listar documentos vigentes, não todos os controles.
- **`policy_acknowledgments`:** congelado (só leitura) e mostrado como "ciência sem prova de versão". Nada novo entra nele.

### 4.7 Evidências

- `evidence` ganha:
  - `valido_ate` (opcional);
  - a N:N `evidencia_requisitos (evidencia_id, requisito_id)`.
- `control_id` fica para o n.iso.
- Uma evidência pode servir a um requisito da LGPD sem controle ISO nenhum.
- **Evidência vencida** muda de estado (`evaluation_status` volta a pendente) e propaga (4.9).

### 4.8 Pedidos e rascunho do agente

- **`pedidos.tipo` passa a aceitar** `'documento'`, `'ropa'`, `'lia'`, `'avaliacao_terceiro'`, `'excecao'`. O CHECK e o trigger de imutabilidade continuam valendo para todos.
- **O RoPA passa a ser aprovado por pedido.** Hoje é aprovação direta, fora da prova com hash.
- **Rascunho do agente com estado formal, imposto no servidor:**
  - Escrita feita pelo principal agente (`src/middleware/agente.ts`) em RoPA, documento, DPIA, LIA e avaliação de terceiro nasce com `origem='agente'` e estado de rascunho, **mesmo que o corpo peça outro estado**.
  - Rascunho de agente não entra em relatório, exportação nem portal.
  - Promover o rascunho exige pedido de aprovação a uma pessoa com autoridade. A rota de promoção entra em `FORA_DO_AGENTE`.
  - `niso_update_policy` deixa de sobrescrever o vigente: cria versão `rascunho`.

  É isso que o mercado não tem verificado (seção 2).
- **O MCP continua** preso ao projeto, filtrado por papel e com confirmação em ação destrutiva. Nada muda nisso.

### 4.9 Efeitos da interligação

São consultas sobre o grafo, mais uma rotina diária para validades. Não há motor de eventos.

| Gatilho | Efeito | Como |
|---|---|---|
| Mudou um sistema (item) | Mostra tratamentos, terceiros e documentos afetados | Consulta por `item_relacoes`, `tratamento_itens`, `parte_vinculos` e `documento_requisitos` |
| Venceu a evidência do trust center | Avaliação do terceiro volta a pendente; tratamentos com esse operador são sinalizados | Rotina diária (cron do Worker) compara `valido_ate`; grava a mudança na trilha |
| Nova versão vigente de documento | Ciências anteriores aparecem como "versão anterior" | Derivado de `ref_id = versao_id`; nada é reescrito |
| Artigo da LGPD sem documento nem evidência | Lacuna na visão do encarregado | Consulta: requisitos da fonte `lgpd` aplicáveis sem `documento_requisitos` nem `evidencia_requisitos` |
| Documento com `revisar_ate` vencido | Sinal ao dono | Rotina diária |

---

## 5. Como o n.privacy usa o núcleo

Esboço. Cada item vira spec própria na ordem da seção 9.

- **Tratamento (RoPA).**
  - Entidade `tratamentos` com finalidade, base legal (art. 7 completo e art. 11 para sensível), categorias de titular e de dado (listas controladas), retenção e estado.
  - Ligações N:N:
    - `tratamento_itens`: sistemas, bases e processos;
    - `tratamento_partes`: com papel (controlador, cocontrolador, operador, suboperador, destinatário);
    - `tratamento_departamentos`.
  - Transferência internacional como linhas próprias (país, destinatário = parte, mecanismo do art. 33), não 0/1.
  - **Mermaid gerado das ligações, nunca guardado como texto.** O diagrama não mente sobre o cadastro. A versão do tratamento congela o diagrama no pedido de aprovação.
  - Entradas: tela, importação de planilha (modelo próprio, com relatório de linhas recusadas), API e MCP (rascunho, 4.8).
  - `ropa_records` migra para `tratamentos`.
- **DPIA e LIA nascem do tratamento.**
  - `dpia_assessments.tratamento_id` com FK real; as duas famílias de colunas são unificadas.
  - LIA é uma tabela nova, irmã, obrigatória quando a base legal é legítimo interesse.
- **TPRM tipificado.**
  - O terceiro é parte (organização). O tipo (grande provedor, médio, pequeno, crítico) define o método.
  - Avaliação `avaliacoes_terceiro (parte_id, metodo, estado, valido_ate, pedido_id)`.
  - Trust center é link mais evidência com `valido_ate`, preenchido à mão na primeira versão.
  - DPA vira documento (`tipo='contrato'`) ligado à parte, não checkbox.
  - Suboperador é vínculo parte→parte.
- **Titular.** Pedido do titular com protocolo, data de entrada, prazo e resposta. O portal público é decisão do dono (seção 10).
- **Incidente.** Registro com datas (ciência, comunicação), avaliação de risco ao titular e comunicação à ANPD e ao titular.
- **Consentimento.** Registro da prova (quem, quando, finalidade, versão do aviso) como evidência ligada ao tratamento. CMP fora (seção 2).
- **Prazos regulatórios** (titular, incidente): **todo prazo entra como parâmetro com fonte citada, conferido pelo jurídico no texto oficial antes de virar regra.** Esta spec não fixa nenhum número.

---

## 6. Lacunas de privacidade × núcleo

| Lacuna | Onde se resolve |
|---|---|
| Trilha centrada na lei (artigo → requisito → controle → evidência → responsável) | 4.5 + 4.7 + 4.2; a visão é consulta |
| Prazos regulatórios operando | 5 (titular, incidente) + rotina diária de 4.9 |
| Registro de consentimento e de transferência internacional | 5 |
| PII em texto livre que a busca do titular não alcança (T5) | Parcial: o núcleo reduz texto livre (responsável vira parte), mas finalidade, notas e descrições continuam livres. Busca por texto no D1 sobre as colunas livres conhecidas, como já decidido na remoção da vetorização |
| Encarregado como fluxo próprio | 4.2 (vínculo e contato público) + visão do encarregado (lacunas de 4.9, pedidos do titular, incidentes) |

---

## 7. Riscos de desenho

1. **Ativo de segurança e de privacidade têm atributos diferentes.** Resolvido por núcleo fino com blocos 1:1. O risco que sobra é a tentação de pôr atributo de produto no núcleo; regra: coluna nova em `itens` só se os dois produtos a usarem.
2. **Migração dos ativos de produção.** Backup, id preservado, view de transição e teste com cópia anonimizada no staging. Migration nova segue `migrations/README.md`, e o deploy recusa migration pendente.
3. **Reescrever a ligação documento→controle** toca políticas, ciência, portal e pedidos ao mesmo tempo. A prova existente (pedidos fechados) não pode mudar: o trigger `pedido_prova_imutavel` já impede, e a migração não deve tentar.
4. **MCP.**
   - Preso ao projeto, papéis e confirmação já existem.
   - O que falta é o rascunho imposto no servidor (4.8). Sem ele, o diferencial é só texto.
   - O MCP devolve dado pessoal ao cliente do agente; isso tem de estar dito ao DPO (a DataGrail avisa o mesmo).
5. **Trust center automático é frágil**: sites mudam e pedem login. Manual na v1; automatizar depois, só para 3 ou 4 provedores.
6. **Mapeamento normativo sem jurídico vira passivo.** Por isso existe o estado `validado_juridico` e o cliente não vê o `proposto`.
7. **Escopo.** Cada linha "grande" da tabela 3.1 é uma fatia de semanas. O núcleo inteiro antes do primeiro valor visível no n.privacy é o maior risco de prazo. A ordem da seção 9 tenta entregar algo usável a cada fatia.

---

## 8. Fora do escopo desta spec

- Descoberta automática de dados pessoais (posicionamento: declarativo).
- CMP / banner de cookies (recomendação: integrar, não construir).
- GDPR além do catálogo (LGPD primeiro).
- Leitura automática de trust center.
- Casca visual do n.privacy (spec própria, depois do núcleo).

---

## 9. Ordem

É a sua ordem, com a fatia 0 na frente.

| Fatia | Conteúdo | Valor visível |
|---|---|---|
| **0. Chão firme** | Defeitos de 3.4; escolher o catálogo 27701; semear os 93 do Anexo A | n.iso sem os bugs; "carregar catálogo" resolvido |
| **1. Núcleo** | Módulos; partes e vínculos; departamentos; itens com blocos; migração de `assets`; `owner` → parte | Inventário único; responsável clicável |
| **2. Requisitos** | Fontes, requisitos e mapeamento (só `proposto` até o jurídico); `compliance_controls.requisito_id` | Visão por artigo da LGPD (lacunas) |
| **3. Documentos** | Documentos, versões, hierarquia, revisão e exceções; ciência por versão; migração das políticas; portal | Política com versão e revisão; ciência "versão anterior" |
| **4. RoPA** | Tratamentos ligados; Mermaid derivado; importação; aprovação por pedido; rascunho do agente imposto | RoPA de verdade, com diagrama |
| **5. DPIA e LIA** | FK real, unificação de colunas, LIA | Avaliações nascem do tratamento |
| **6. TPRM** | Tipo → método, avaliação com validade, DPA como documento, suboperador, rotina de vencimento | Terceiro vencido sinaliza tratamento |
| **7. Titular, incidente, consentimento** | Pedido e prazo (após o jurídico), incidente, prova de consentimento | Mesa básica do mercado |
| **8. Visões e casca** | Visão do encarregado, visão por lei, casca n.privacy | Produto vendável |

As fatias 2 e 3 podem trocar de lugar: documentos não dependem de requisito para existir (decisão sua).

---

## 10. Perguntas para você e para o jurídico

1. **Módulos por projeto (cliente), com teto na organização (consultoria)?** No código, "organização" é a consultoria.
2. **CMP:** confirma "não construir, integrar depois"?
3. **Portal público de pedidos do titular entra na fatia 7, ou só o registro interno?**
4. **Qual catálogo 27701:2025 vale:** `src/data/iso27701-2025.ts` (31+18) ou `PIMS_RULES` (78)? Recomendo o primeiro, que é o semeado e o que tem as referências corrigidas aos arts. 37 e 18.
5. **`stakeholders` (cláusula 4.2) vira parte?** Recomendo que sim, com vínculo `parte_interessada`.
6. **Processo como item e tratamento como entidade separada** (4.4): concorda?
7. **Jurídico:** prazos do titular e de incidente (ANPD e titular), lista de bases legais, títulos curtos dos artigos e todo `requisito_mapeamentos` antes de `validado_juridico`.
