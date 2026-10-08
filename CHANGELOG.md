# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento [SemVer](https://semver.org/lang/pt-BR/).

> **Sobre a lacuna entre 8.0.0 e 8.1.0.** Este arquivo parou em 2026-07-03 e
> ficou dois meses sem entrada, enquanto ~60 PRs entravam na `main` — inclusive
> correções de segurança. As versões abaixo foram reconstruídas do histórico do
> git, agrupadas por tema, e as datas são as dos commits. Retomar o changelog é
> o item 0.3 do `enterprise-grade-plan.md` (hoje em `docs/arquivo/`), já cumprido; a
> lacuna fica registrada em vez de apagada.

## [Não publicado]

### Corrigido
- Minimização: IP e user-agent de quem assina (`*_approved_ip/ua`, `*_signed_ip`) não saem mais nas leituras JSON de controles, evidências, ROPA, DPIA, análise crítica, política e pacote de auditoria; seguem no banco, na trilha e nos relatórios de política e ROPA. O modal da política deixa de mostrar "Origem".
- DPIA: a rota `DELETE /api/v1/dpia/:id` passa a existir (a tela chamava uma rota inexistente); DPIA aprovado recusa a exclusão com 409.
- Ativos: a criação grava localização, classificação e notas CID (ausentes valem 3, o default da coluna); a edição parcial não apaga mais o campo ausente (antes dava 500 ou zerava); criar sem `type` não dá mais erro; o CSV não traz removidos; o modal de risco volta a listar os ativos.
- Fornecedores: trilha com o projeto na criação e registro da edição.
- Políticas acham o controle pelo código em qualquer formato de id, preso ao projeto (7 rotas, incluindo `generate-from-template`); o GET de versões de controle inexistente responde 404.
- Banco novo ganha as colunas de IP/UA das aprovações (migration 0044, só registrada em produção e staging).
- Contrato tela↔API: `api()` desembrulha só envelope de lista pura (`{ ok, <uma lista> }`); com outro campo ou duas listas devolve o objeto. Entrevistas, jornada, lacunas, lotes, certificação, notas do auditor, rastreabilidade e templates voltam a ler o que o servidor manda.
- Alteração de escopo passa a gravar (os campos do POST não casavam com o schema e davam 400): registra uma solicitação de mudança de escopo, pendente; ainda não há fluxo que a aprove.
- Autoatendimento do questionário chama `/assessments/public`, leva os blocos no bundle e não conclui mais sem salvar; saem o atalho do dashboard e o ramo `self-service` do roteador (fica o link `?assessment=<token>`, que a tela do levantamento entrega no botão "Copiar link do questionário").
- Chat de IA deixa de pedir histórico a rotas que nunca existiram.
- Evidência de documento (upload, assistente e geração por IA) entra pendente de revisão e ligada ao controle do item quando ele tem um; a assinatura do Líder SGSI é a revisão que a leva a conforme; editar o conteúdo devolve a pendente e apaga as assinaturas (a auditoria registra o que foi apagado).
- Avaliação por IA nunca concede conforme: o veredito só vale com uma opção na linha Veredito e "NÃO CONFORME" não grava mais conforme.
- Assinatura de evidência presa ao hash do conteúdo revisado (409 se o conteúdo mudou); quem enviou a evidência não assina como Líder SGSI; o agente não assina evidência nem controle, e a segregação reconhece evidência criada pelo agente do próprio assinante.
- Checklist: uma lista só para a tela e a geração de documento (seis itens davam 404 e quase todos geravam documento de outro item); o upload pelo checklist volta a funcionar e marca o item; o selo lê o status real.
- Upload de evidência aceita o código do controle (A.5.1); o certificado de treinamento é ligado a A.6.3 quando o projeto o tem; tratar risco como "Mitigar" não cria mais evidência sem arquivo.
- Central de Evidências: escolher o controle de cada evidência e ver a avaliação (a coluna lia `ai_status`, que não existe).
- Sair encerra a sessão no servidor (sem esperar a resposta).
- Exportar CSV importa `API_BASE`.
- Políticas: a assinatura grava o Líder SGSI e a Direção (nome da matriz, data, IP e user-agent) com autoridade e segregação pela matriz de Governança, como ROPA, DPIA e evidência; assinar não reescreve mais o status do controle na SoA. Restaurar versão zera as assinaturas. O modal acha o controle em qualquer formato de id, salva a edição (antes sempre falhava) e o "Imprimir" abre o relatório da política.

### Adicionado
- Teste de contrato: toda chamada do frontend a `/api/v1/*` precisa casar com uma rota do backend (`test/contrato-tela-api.test.ts`), e um teste reprova global usado sem import no frontend.
- `POST /api/v1/projects/:id/seed-27001-2022` e o botão "Carregar catálogo": projeto novo recebe o Anexo A da ISO 27001:2022 e os controles da ISO 27701:2025. A lista de controles mostra o código.
- `GET /api/v1/projects/:id/controls/:controlId/policy` (texto, SHA-256, assinaturas e versões) e `GET .../policy/report` (relatório para imprimir).
- Pedido de aprovação de política (Líder SGSI ou Direção): a direção com conta só de leitura aprova em "Meus pedidos", e a assinatura vai para o controle; quem pediu acompanha a aprovação e a recusa em "Ciência de Políticas".
- Projeto criado pelo aceite da proposta já nasce com os controles da norma vendida (93 da ISO 27001:2022 e os da ISO 27701:2025 pelo papel, quando vendida), com o escopo aceito no lugar do tipo de escopo do levantamento e com o nome "cliente — norma". O contato de quem aceitou entra na governança sem autoridade de assinatura (a promoção é do consultor). Sem consultor, a administração da consultoria é avisada.
- Governança: aviso quando nenhum membro tem cargo de Direção ou de Líder SGSI (a autoridade de assinatura vem do cargo), ajuda no campo Cargo, e o contato do aceite da proposta aparece marcado como e-mail não verificado; `consultoria_admin` gerencia a matriz e designa consultor na tela, como já podia no servidor.
- Portal do auditor externo: a consultoria gera, lista e revoga pela tela de Auditorias um link com prazo (`GET|POST /api/v1/projects/:id/auditor-token`, `.../:tokenId/revogar`; o cliente não gera); o auditor abre `/auditor#<token>` e vê o projeto, a SoA (27001 e 27701) com a evidência de cada controle, baixa os arquivos e a prova dos pedidos, registra pergunta à consultoria e vê a resposta dela. Cada download entra na trilha.

### Removido
- `SoALogicEngine`, `OLD_RULES` e `PIMS_RULES`: motor de SoA sem uso e o segundo catálogo 27701 (fica o da edição 2025).

### Segurança
- Token do auditor guardado só em SHA-256, com revogação (migration 0045; os tokens anteriores deixam de valer) e prazo comparado até o minuto (antes valia até o fim do dia do vencimento). As rotas `/api/v1/auditor/:token/*`, que punham o token no log de requisição, saem: o portal usa `POST /api/v1/public/auditor/{ver,evidencia,pedidos,notas,notas/criar}` com o token no corpo e limite por IP. O portal não leva mais a linha inteira do projeto (`repository_token`, CNPJ) e o nome do arquivo baixado é codificado no cabeçalho.
- **Operação:** a 0045 precisa ser APLICADA em produção (não só registrada na `d1_migrations`) antes do deploy, com `npm run db:backup` antes. Sem a coluna `token_hash` e a revogação no banco, o portal do auditor e a geração do link quebram.

## [11.0.0] - 2026-10-06

Stakeholders do cliente no produto (pedidos de aprovação e ciência com prova imutável),
outras consultorias isoladas entre si, o sistema de propostas do lead ao contrato, o agente
consultor por MCP remoto e um endereço canônico. **Major** pelo mesmo critério da 9.0.0 e da
10.0.0: mudança de comportamento em rotas existentes.

**Mudança de comportamento visível**: corpo com tipo errado nas 29 leituras que eram cruas passa a receber 400 (#259);
o `PUT` de ROPA e DPIA recusa `status` de aprovação (#284, #285); aprovar proposta e converter
levantamento respondem 410, porque o projeto nasce do aceite; o consultor só alcança os projetos
em que está designado (D5, #242); hosts legados respondem 308 (#290); saem a vetorização, a tela
Knowledge Base, `/api/v1/mcp*` e a ferramenta `niso_generate_soa`.

### Adicionado
- **Stakeholders do cliente consultam, aprovam e dão ciência de documentos (acesso de stakeholders, fatias 1 a 5: #254 a #258).** Papel `stakeholder` (mínimo privilégio, allow-list de caminhos em `src/middleware/auth.ts`: perfil, senha, MFA, aceite legal e `/api/v1/pedidos*`), convidado e revogado pela linha da matriz de Governança (`POST /projects/:id/governance/:memberId/convidar` e `.../revogar-acesso`). Tabelas `pedidos` e `pedido_destinatarios` (migrations 0041, 0042 e 0043): o pedido congela o conteúdo do documento (DPIA ou política) com SHA-256; documento alterado vira `substituido` e nasce outro. "Meus pedidos" (`/api/v1/pedidos`) aprova ou recusa com senha; quem pede e quem aprova seguem regra única (`podePedir`, `autoridadeNoPedido`), falha fechado sem linha na matriz. Ciência em massa por link pessoal com código de 6 dígitos (`/api/v1/projects/:projectId/pedidos/ciencia`, painel, reenvio só aos pendentes; lado público em `/api/v1/public/pedidos/ver|codigo|ciencia`, token só no corpo, só o hash no banco). **Prova imutável:** o trigger `pedido_dest_prova_imutavel` recusa UPDATE em linha decidida, e o `pedido_prova_imutavel` (0043) recusa mudar hash, conteúdo congelado e documento de qualquer pedido e status/substituto de pedido fechado; DELETE continua livre no banco para o projeto apagar em cascata, e nenhuma rota apaga pedido ou destinatário nem atualiza decisão ou pedido fechado (`test/pedidos-prova.test.ts` lê o fonte statement a statement e varre todas as rotas que escrevem). Transferir o projeto de organização leva junto o `org_id` dos pedidos, no mesmo batch, e todo pedido novo grava a organização lida do projeto. **Auditor:** `GET /api/v1/auditor/:token/pedidos` (paginado: `?pagina=N`, 500 por página, com `total` e `truncado`) devolve a prova do projeto do token (conteúdo congelado, hash, status, substituto; por destinatário quem, quando, IP, user-agent, hash lido, canal, MFA, motivo), sem token nem hash de token, só em GET; sem tela, porque o portal do auditor não tem frontend. O contrato de isolamento entre organizações passa a varrer também `org_admin` e o auditor externo.
  - **Estacionado, a decidir:** corrida entre login e revogação (login concluído no mesmo instante em que as sessões são apagadas pode deixar uma sessão viva até expirar); envio de lote sem fila (até 200 e-mails na própria requisição, 5 por vez com uma nova tentativa; teto do provedor mais baixo pede Queues). Também: `pedido_destinatarios` não está em `FONTES_PII` (`src/services/data-subject.ts`), e o trigger impediria anonimizar a linha decidida; conciliar a prova imutável com a eliminação a pedido do titular é decisão de produto pendente.
- **Outras consultorias no n.iso (multiconsultoria, #253).** Uma consultoria contrata o n.iso e trabalha nos próprios projetos, leads, propostas e catálogo, sem enxergar nada de outra; a ness. é a organização `org_ness` e segue como está. O `platform_admin` cria a organização com o administrador dela (convite por e-mail com senha provisória, botão "Reenviar convite" enquanto ele não entra), define limites de projetos e de usuários da equipe, suspende e reativa, e atua em qualquer uma pelo seletor de organização do cabeçalho. O papel novo `consultoria_admin` administra a própria organização: equipe (consultor, comercial, outro administrador), configuração comercial, catálogo, logo (PNG ou JPEG, embutido na proposta) e todos os projetos dela, sem designação. Consultor e comercial alcançam só o que é da própria organização, e um teste que percorre todas as rotas com duas organizações semeadas garante o isolamento. Conta de equipe não se prende a projeto, e o SSO de um cliente só cria conta de cliente, na organização do projeto. O `platform_admin` transfere um projeto para outra organização: a origem perde o acesso na hora (consultores, agentes, chaves de API, webhooks, SSO e SCIM do projeto), propostas e contratos ficam com quem vendeu e os usuários do cliente seguem entrando. O funil comercial mostra os leads por etapa, com transições validadas. Exige a migration 0040.
- **Envio, aceite e fechamento da venda (#252).** O comercial envia a proposta gerada por e-mail (remetente "Organização via n.iso") ou copia um link pessoal; o cliente, sem conta, lê a versão congelada em `/proposta` e aceita (nome, cargo, e-mail e confirmação de poderes, com IP, data e o hash do documento), recusa ou pede ajuste. O token do link só existe como SHA-256 no banco e viaja no corpo das requisições, nunca no caminho. O aceite dispara uma única rotina de fechamento, idempotente e atômica: contrato, projeto com as 41 fases e consultor designado, mensalidade registrada e lead ganho. Uma venda por número de proposta: aceitar uma revisão fecha as outras. Aceite em papel é marcado pelo comercial com o comprovante.
- **Proposta comercial (#250).** O comercial monta a proposta a partir de um lead, com ou sem diagnóstico, escolhendo serviços do catálogo: preço por dias × diária × porte (projeto e avulso) ou mensalidade × meses (recorrente), memória de cálculo e margem visíveis só ao comercial, desconto acima do teto aguardando aprovação do `platform_admin`. As seções de texto podem ser reescritas por proposta; tabelas e lista de serviços seguem automáticas. Ao gerar, o número é reservado (sequência da organização ou manual sem repetir), o documento completo é congelado com hash e sai para impressão/PDF e como cópia de trabalho em Word. Revisões mantêm o número (`rev. 2`). Os termos revisados pelo dono são os termos iniciais da ness.
- **Referências da ISO 27701 nas lacunas corrigidas.** A lacuna de RoPA citava controles de consentimento (A.1.2.4, A.1.3.5) e a de direitos do titular citava o A.8.8 da 27001; agora citam A.1.2.9/A.1.2.2/A.1.2.3 e A.1.3.2/A.1.3.7/A.1.3.10, com o artigo da LGPD. Um teste confere todo código citado contra o catálogo da 27701:2025.
- **Catálogo de serviços (#248).** Cada organização cadastra o que vende em `/api/v1/servicos`: projeto (fases que somam 100% e dias por faixa), avulso (valor fixo ou dias) e recorrente (mensalidade e prazo mínimo). Serviço é arquivado, nunca apagado. O catálogo inicial da ness. sai do motor de preço atual (`POST /api/v1/servicos/semear-padrao`). Telas novas: Configuração comercial (o comercial lê, o `platform_admin` grava) e Catálogo.
- **Organização comercial (#247).** Configuração de identidade, numeração, preço e textos por organização (`GET/PUT /api/v1/org/config`); a ness. é a organização `org_ness`.
- **Trocar a própria senha pelo cartão de perfil (F7).** O menu da conta ganha "Trocar senha": modal com senha atual, nova e confirmação, erro junto do campo, e a política de senha nova vem do servidor (a mesma do primeiro acesso). "Senha atual incorreta" volta como 401 e não derruba a sessão: `/auth/change-password` entrou na isenção de logout automático do `api.js`, ao lado de `/auth/mfa/*`. Correção no servidor achada no caminho: `POST /auth/change-password` não invalidava as outras sessões do usuário (só revogava agentes); agora invalida todas as emitidas antes e mantém a atual, como o primeiro acesso já fazia.
- **O humano desaprova pela interface; o agente não (F6, decisão D1).** `platform_admin` e o administrador do cliente revogam a aprovação de ROPA (por papel) e de DPIA, com motivo obrigatório (mínimo de 5 caracteres) que vai para a trilha com o projeto (`ropa.approval_revoked`, `dpia.approval_revoked`), e excluem análise crítica (`management_review.deleted`, além do `registro.excluido` central). Consultor e usuário comum levam 403. O agente também: as três rotas entram na lista de fora do alcance, mesmo com confirmação. A limpeza de um projeto de cliente precisou de SQL justamente por essa lacuna.
- **Agente consultor por MCP remoto (`/mcp`, #212 e #213).** O consultor conecta o Claude Code, o Codex, o Cursor ou o Antigravity ao n.iso, entra com a própria conta (senha e segundo fator) e escolhe um cliente — sem chave de API e sem instalar nada. OAuth 2.1 pela `@cloudflare/workers-oauth-provider`, tela de autorização própria, concessão por projeto (`agente_concessoes`, migration 0034) revalidada a cada chamada, e o cartão "Agentes com acesso" na Governança para o cliente ver e revogar. O agente não tem API própria: chama as rotas de sempre, com um principal que herda o isolamento de tenant. Guia completo em `docs/agente/`.
- **O agente ganha o alcance do consultor humano, preso a um projeto (#221).** `niso_ler` (qualquer leitura) e `niso_executar` (escrita) alcançam o que o consultor alcança naquele projeto; `niso_contexto` traz o mapa da app e quatro roteiros. Apagar, gerar políticas em lote, eliminar dados de titular e revogar aprovações exigem confirmação **imposta no servidor** e deixam trilha com o projeto (`agente.exclusao`). São 25 ferramentas visíveis ao agente. Antes ele só lia uma fração da app e não apagava nada, o que fez o consultor depender do administrador para limpar registros que o próprio agente criou.
- **`niso_update_risk` (#220).** Edição parcial de risco: lê o atual, troca só o pedido e reenvia o registro inteiro, porque o `PUT` da API substitui tudo. O aceite de risco (`accepted_by`, `accepted_at`) é decisão da direção e o agente não o altera.
- **Skill de prontidão para certificação servida pelo MCP (#223).** A pré-avaliação de Stage 1 e Stage 2 (ISO 27001:2022 e 27701:2025) vira o roteiro 4, entregue por `niso_skill` atrás do login: sem instalação e sem arquivo público. A fonte é `agent-skills/`; `npm run skills:gerar` escreve o módulo embutido e `test/agente-skills.test.ts` falha se ele ficar velho. Só lê: nenhum achado vai para a n.iso, e não substitui a auditoria interna (9.2).
- **Papel `comercial` (#211)** e a área comercial restrita a `platform_admin` e `comercial` (#209).
- **Governança (#217).** Organograma restaurado (o #168 tinha apagado as regras `org-*` do CSS), líder do SGSI único por projeto e cartão de agentes com acesso.
- **Tela de entrada com o login na primeira dobra e domínio `niso.ness.com.br` (#207, #208).**
- **E-mails saem de `n.iso <noreply@ness.com.br>` (#218).** Nenhum e-mail saía: o Resend recusava o remetente do domínio não verificado e a tela respondia "enviado" mesmo assim.
- **Teste que reprova dado de cliente no repositório (arrumação final).** `test/sem-dado-de-cliente.test.ts` varre os arquivos versionados e reprova o nome do cliente e das pessoas que já estiveram aqui. Catracas novas no ciclo: `any` em `src/` (#279), vazamento de `e.message` no 500 (#282) e coluna inexistente em INSERT/UPDATE (#284).

### Alterado
- **Aprovar proposta e Converter levantamento deixaram de criar projeto: o projeto nasce do aceite da proposta.** `POST /assessments/:id/convert` e `PUT /proposals/:id` com `status: Signed` respondem 410, `POST /proposals/:id/sign` saiu, e os botões "Converter para Projeto", "Aprovar" e o antigo "Gerar proposta" da tela de levantamentos foram removidos (a tela Propostas cobre o caminho). `POST /assessments/:id/generate-proposal` também responde 410, e o painel do cliente perdeu o "Revisar e Assinar" que apontava para ele. Uma venda por número de proposta: aceita uma revisão, as revisões abertas do mesmo número viram `substituida` no mesmo lote, a geração de outra revisão responde 409 e um segundo aceite não cria contrato nem projeto. Proposta `expirada` sai por revisão nova, por aceite manual ou por reenvio (só com validade futura; senão 409). O aceite pelo link grava `cliente (link)` como autor na trilha (o e-mail digitado fica no aceite) e só vale com o token que abriu a página (rotação ou revogação no meio não grava nada). Enviar sem `RESEND_API_KEY` responde 503 em vez de marcar enviada, e a simulação de e-mail em desenvolvimento deixa de logar o corpo (que levava o link). O consultor responsável da proposta precisa ser consultor ativo, conferido de novo no fechamento.
- **"Conectar agente" passa a instruir o que travou um consultor de verdade (01/10/2026).** O comando do Claude Code leva `--scope user` (o padrão `local` prende o servidor à pasta e ele some em sessão sem pasta); a aba diz como instalar o `claude` quando o terminal não o reconhece (comum com o app desktop); explica que "Needs authentication" é o estado esperado e que o login é pelo `/mcp`, feito pelo consultor e não pelo agente da sessão; e traz `claude mcp list` e `claude mcp remove niso -s user` para conferir e refazer. Só o Claude Code ganha essas linhas: os outros clientes seguem "A confirmar".
- **Tela "Conectar agente" em duas colunas.** À esquerda, o cliente em abas com o comando e os três passos em lista compacta; à direita, "O que o agente faz", fixo ao rolar. O endereço do servidor aparece uma vez só, dentro do comando (antes repetia numa faixa própria), e a tela usa a largura disponível em vez de ficar encostada à esquerda. Abaixo de 1100px empilha.
- **Endereço canônico `niso.ness.com.br` (#290).** Links de e-mail (proposta, ciência, convite), callback de SSO, `base_url` e `location` do SCIM, `security.txt`, CORS e hosts do MCP saem de `appUrl(env)` (`src/config/url.ts`, var `APP_URL`), nunca do host da requisição. `n-iso.ness.com.br` e `niso.ness.workers.dev` respondem **308** para o canônico, com caminho e query (308 preserva método e corpo de webhook, SCIM e token OAuth); staging não redireciona. O MCP deixa de aceitar loopback em produção. Quem cadastrou o host antigo como callback no IdP precisa trocar (`docs/sso-scim.md`).
- **Corpo validado por schema em 29 leituras que liam o JSON cru (T3, #259).** `projects`, `assessments`, `policies`, `governance`, `evidence`, `controls`, `platform`, `proposals` e `ai` passam por `validateBody` com tipos, tetos e coleções limitadas. O formato aceito antes continua aceito; corpo com tipo errado passa a receber 400.
- **ROPA e DPIA: a edição não aprova nem reverte aprovação (#284, #285).** O `PUT` gravava `status` livre: quem editava aprovava sem senha nem autoridade, e editar sem `status` devolvia o registro aprovado a rascunho com as assinaturas na linha. Agora o `status` da edição aceita `Draft` e `Under Review` (o ROPA também `Active` e `Inactive`, ciclo de vida da atividade), o `PUT` é parcial (`setParcial`) e mudar o status de registro aprovado responde 400 apontando "Revogar aprovação".
- **Contas e pedidos (#261).** E-mail gravado em minúsculas e buscado sem caixa (login, recuperação, SSO, SCIM; conta antiga com maiúscula continua entrando). O convite pela matriz só reativa stakeholder revogado por ela, não conta desligada pelo SCIM ou à mão. Editar a política substitui o pedido aberto, e o destinatário do pedido substituto recebe link novo.
- **Documentação reescrita com números medidos e o que já foi executado arquivado em `docs/arquivo/` (arrumação final).** `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/testing.md`, `design.md`, `docs/README.md` e `migrations/README.md`; uma constituição só (`CONSTITUTION.md`); "nISO" vira `n.iso` no texto visível (o cabeçalho `X-nISO-Signature` não muda).
- **Dependências.** `hono` 4.13.7 → 4.13.11 (#243), `zod` 4.5.4 → 4.6.5 na raiz e no `mcp-server-niso` com os contratos regenerados (#262), `@modelcontextprotocol/sdk` (#272) e patches e menores agrupados pelo Dependabot (#200, #203, #224, #225, #265, #269, #270, #271, #275). O Dependabot passa a agrupar patch e minor por diretório (#260) e ignora vitest 5 e MCP server 2.3, que conflitam em peer dependency (#273).
- **Testes.** A suíte local deixa de falhar só no Windows e sob carga (CRLF, timeouts; #237, #278); os três últimos testes que mockavam o D1 inteiro passam ao D1 real (T2, #280); o frontend ganha testes de MFA, IA e usuários/API keys (T4, #281).

### Removido
- **Vetorização (Vectorize/RAG) removida (#289).** Saíram `MemoryService`, `KnowledgeService`, `embeddings.ts`, o binding `VECTOR_INDEX` (produção; staging já não tinha), a tela "Knowledge Base" e as rotas legadas `GET /api/v1/mcp` e `POST /api/v1/mcp/execute` (sem uso: o MCP de verdade é o `/mcp` remoto). Motivo, pelo spike: o índice de produção tinha 1 vetor e nenhum índice de metadados (as consultas filtradas por `project_id` voltavam vazias), a tela chamava rotas que nunca existiram, chat, agentes e MCP não usavam vetor, e vetores nunca eram apagados na exclusão de projeto nem no pedido do titular. A geração de políticas e documentos segue com o contexto do D1 (respostas do assessment e entrevistas). **Ficou para decisão:** a tabela `project_knowledge` continua no schema, órfã (sem leitor nem escritor), com 2 linhas em produção na data do spike; removê-la exige migration. O índice `niso-knowledge` é apagado depois do deploy, fora deste PR.
- **"Gerar SoA (IA)" (#286).** O botão e a ferramenta MCP `niso_generate_soa` chamavam `POST /generate-soa`, que não existia desde a decomposição do `index.ts` (72f1b59) e devolvia 404. O MCP passa de 24 para 23 ferramentas.
- **Código morto sem chamador (#287):** `downloadExecutiveReport` (a rota não existia), o convite de cliente antigo que gerava senha com `Math.random`, e o campo `popularity` aleatório do marketplace.
- **Dado de cliente e de pessoas fora do código atual (arrumação final).** Saem `deliveries/`, `scratch/`, os seeds do cliente, a spec de UI do cliente, `templates-politicas-ptbr/` (cópia byte a byte de `src/templates/policies/v2022`), `frontend/README.md` (template React) e `public/index.html` (não era servido). A migration 0011, já aplicada, fica com o nome e o conteúdo trocado por `SELECT 1;`: banco novo não recebe mais nomes e e-mails reais. O histórico do git é tratado à parte.

### Corrigido
- **`management_reviews` igual em produção e em banco novo (F10).** Produção tinha `ciso_signed_by/at/ip` e `ceo_signed_by/at/ip` que `schema.sql` e as migrations não declaravam. Agora o `schema.sql` as traz e a migration 0035 as adiciona a bancos antigos; em produção ela só é registrada em `d1_migrations`, nunca executada (as colunas já existem). Teste de contrato em `test/schema-contract.test.ts` e `test/migration-0035.test.ts`.
- **A aprovação de DPIA grava o papel que assinou (F9).** A rota `POST /projects/:id/dpia/:assessmentId/approve` ignorava o `role` e gravava só `dpo_approved_by/at`: o botão "Assinar" nunca sumia e a Direção não conseguia assinar. Agora o corpo exige `role` (`ciso` ou `ceo`, 400 se faltar), a autoridade sai da matriz de governança do projeto como na ROPA (403 sem ela), `ciso` grava `dpo_signature` e `dpo_approved_by/at`, `ceo` grava `ceo_signature`, e o status só vira `Approved` com as duas assinaturas. A trilha `dpia.approved` registra o papel e o projeto. Contrato em `docs/openapi.json`.
- **`gap-analysis` respondia 404 (#220).** A rota se perdeu na decomposição do `index.ts` (72f1b59) e a ferramenta do agente e o modal da interface ficaram sem resposta. Volta em snake_case, sem contar controle "não aplicável" como lacuna nem no denominador da cobertura.
- **`traceability` e `coherence` davam 500 com mais de 100 controles (#220).** Um `?` por controle passa do teto de 100 parâmetros do D1; trocado por subconsulta por projeto.
- **O cartão "Agentes com acesso" atualiza sozinho e mostra o horário local (F3).** O "último uso" é o único sinal de leitura do agente e só mudava se a página fosse recarregada, o que fez parecer que o agente tinha parado. Agora o cartão se atualiza a cada 60 s enquanto a Governança estiver aberta: para sozinho ao sair da tela, não consulta com a aba em segundo plano, atualiza na hora ao voltar a ela, não empilha temporizadores ao re-renderizar, e uma falha de rede num ciclo não apaga o cartão. As datas vinham do banco em UTC e eram mostradas cruas (apareciam como 20:49 quando eram 17:49 no relógio de quem olhava): passam para o horário local, com "há N min" no último uso e "nunca" quando o agente não foi usado. `frontend/test/agentes-ao-vivo.test.js` (9 casos, com duas mutações conferidas; uma delas pegou um teste que era decorativo).
- **Tela "Conectar agente" rediagramada.** Uma ideia por faixa: o endereço do servidor com o aviso de que o login define quem é o agente, três passos, **um cliente por vez em abas** (acessíveis: `tablist`, tabindex móvel, setas, Home e End dão a volta e o foco acompanha) e o alcance do agente em quatro blocos, com o "sim" em destaque. No lugar dos quatro cartões repetidos, cada cliente tem o seu painel, com o estado dele ("Exercitado em produção em 30/09/2026" ou "o login ainda não foi confirmado"). CSS próprio (`ca-*`) sobre os tokens do produto; `frontend/test/conectar-agente-css.test.js` reprova classe sem regra, o que o jsdom não pega. Conferida em navegador (Edge, 1440 px): sem estouro horizontal, foco por Tab com contorno de 2 px, copiar põe o trecho do cliente da aba na área de transferência.
- **Tela "Conectar agente" refeita.** Diz que o **login** define quem é o agente e em qual cliente ele atua (ele age em nome de você, e a trilha registra o seu e-mail), mostra o que o agente lê, grava, o que pede o seu "sim" (apagar, lote, eliminar titular, revogar aprovações) e o que não faz, e marca "Verificado" **só** o Claude Code, o único exercitado em produção; Cursor, Codex e Antigravity ficam "A confirmar". O Codex mostra os dois comandos, o de adicionar e o de login. "Copiado" só aparece depois que a área de transferência aceitou; se recusar, a tela diz que falhou. `frontend/test/conectar-agente.test.js` (8 casos, com mutação conferida).
- **Toda exclusão deixa trilha, com autor e projeto (`registro.excluido`).** De 20 rotas `DELETE`, 10 não gravavam trilha nenhuma (parte interessada, achado de auditoria, métrica, webhook, chave de API, lead, risco, SCIM, treinamento, fornecedor) e 6 gravavam sem o projeto, de modo que a exclusão não aparecia na trilha filtrada pelo cliente. Em vez de corrigir handler por handler, o `authMiddleware` registra todo `DELETE` bem-sucedido, resolvendo o projeto **antes** de o handler apagar a linha (`src/trilha-exclusao.ts`). Os handlers que já gravavam seu texto continuam gravando; a linha central é a uniforme. O agente segue com `agente.acao_destrutiva`, sem linha duplicada. `test/trilha-exclusao.test.ts` enumera as rotas do roteador e reprova um `DELETE` novo que não esteja classificado.
- **Agente revogado ouvia 403, e não 401, nas rotas proibidas.** A lista de proibidas vinha antes da revalidação da concessão, então o agente revogado não sabia que precisava reconectar. A concessão agora é a primeira checagem (`resolverAgente`).
- **Tela de consentimento do agente sem projeto pré-marcado.** O primeiro da lista vinha marcado: um tenant que se nomeasse para ordenar primeiro faria um consultor apressado conectar o agente ao projeto errado. Agora a escolha é explícita e obrigatória.
- **A mensagem do caminho recusado deixa de falar em "id com caractere inválido"** quando o problema é o prefixo: agora diz que o caminho deve começar com `/api/v1/`.
- **`agente.exclusao` → `agente.acao_destrutiva`.** O rótulo também marcava lote, eliminação de titular e revogação de aprovação, que não são exclusões. Linhas gravadas antes de 01/10/2026 mantêm o rótulo antigo.
- **O progresso do checklist não persistia (`PUT /projects/:id/checklist-progress`).** A rota se perdeu na mesma decomposição do `index.ts` (72f1b59) que levou o `gap-analysis`. A tela (`saveChecklistItemMetadata`) seguia chamando e engolia o 404 num `console.error`: marcação, nota, responsável e prazo de cada item não eram gravados, sem nenhum aviso. A rota volta com validação (até 500 itens, fases 0 a 40), evidência vinculada só do próprio projeto, autoria que não quebra com chave de API (`checked_by` referencia `users`) e trilha com o projeto. O mapa da app do agente passa a dizer como editar governança, partes interessadas e checklist.
- **`GET /interviews/summary` nunca respondia (#221).** A rota com parâmetro (`/interviews/:track`) vinha antes e capturava "summary" como nome de trilha.
- **Salvar o perfil da empresa apagava o nome do cliente (#219).** O `PUT .../company-profile` gravava `client_name || ''`; três projetos de produção ficaram sem nome. Campo ausente ou em branco agora mantém o atual, e a exibição cai para o nome do projeto.
- **Redefinir a senha no primeiro acesso não renovava o carimbo da sessão (#204).**
- **O texto da DPIA digitado na tela não era gravado (#288).** A tela usa `system_name`, `data_flow_description`, `data_subjects_types`, `personal_data_categories`, `risks_identified`, `mitigation_measures` e `dpo_opinion`, colunas que existem em `dpia_assessments`, mas o `POST` e o `PUT` só gravavam as outras: o texto sumia sem erro. A API passa a aceitar e gravar as sete.
- **Entrevistas não funcionavam de ponta a ponta (#287).** Salvar mandava uma requisição por pergunta no formato antigo (400) e a leitura não trazia as perguntas ("Sem perguntas" sempre). Agora é um envio só, no formato da API, e `GET /interviews/:track` devolve o banco de perguntas com a resposta salva. O botão "IA" da Central de Evidências chamava uma função que não existia: abre a avaliação com o texto do documento e mostra o resultado escapado.
- **Quatro defeitos de frontend achados pelos testes do T4 (#281):** a busca e as tags de controle de `ai.js` sem escape, a contagem da equipe da consultoria e os rótulos de `consultoria_admin` e `stakeholder` na lista de usuários.
- **`fechar-venda.ts` tinha bytes de controle crus na regex de limpeza (#279);** o git tratava o arquivo como binário. Comportamento idêntico, com escapes.

### Segurança
- **O consultor deixa de receber o preço do levantamento (02/10/2026).** `GET /assessments` e `GET /assessments/:id` devolviam a linha inteira, com `pricing_override`, `pricing_desconto` e `pricing_notas`. Agora essas colunas só saem para `platform_admin` e `comercial`.
- **O consultor humano fica preso às suas designações (D5).** Até aqui `consultor` alcançava todos os projetos: rota de projeto, recurso por id (`DELETE /risks/:id`, `PUT /management-reviews/:id`...) e as listagens entre clientes (`/projects`, `/portfolio`, `/controls`, `/dashboard`, `/dashboard/stats`, `/users`). Agora só alcança os projetos em que consta como `consultor` na governança, com a conta ativa, pela mesma regra que o agente já seguia (`consultorDesignado`, fonte única com `concessaoValida`). Tirar a linha da governança derruba o acesso na requisição seguinte; erro na consulta nega. O consultor também deixa de criar, editar ou excluir conta de cliente de projeto em que não está designado: sem isso, trocava a senha de um usuário de outro cliente e entrava como ele. Quem cria um projeto (`POST /projects` ou `POST /assessments/:id/convert`) sendo consultor fica designado nele automaticamente, numa linha só (`role_category='consultor'`, com nome e e-mail do criador) e no mesmo batch da criação: se a designação falhar, o projeto não nasce órfão. `platform_admin` que cria não ganha linha. `platform_admin` segue vendo todos. **Rollout:** consultor sem designação perde acesso a tudo; as designações precisam estar feitas antes do deploy.
- **Revisão de segurança do agente (30/09/2026).** A revisão final do #221 provou por sonda dois defeitos críticos antes de chegarem à produção: o agente alcançava `POST /auth/reset-password-first` (definiria a senha do consultor, cuja conta vale em todos os projetos) e `POST /projects/:id/auditor-token` (credencial externa de 365 dias, com a qual se forjaria nota de auditor). Ambos, mais conta pessoal, notificações, criação de projeto e revogação de aprovações, foram fechados e reverificados com 15 tentativas de contorno. Uma segunda revisão, independente, não achou vulnerabilidade de alta confiança. Os invariantes, o checklist de PR e os limites conhecidos estão em `docs/agente/seguranca.md`.
- **`reset-password-first` só vale no primeiro acesso.** A rota troca a senha sem pedir a atual e não conferia que a conta estava em troca forçada (`requires_password_change = 1`): quem tivesse uma sessão aberta, por exemplo roubada, definia uma senha nova e tomava a conta. Fora do primeiro acesso agora responde 403 e grava `auth.reset_primeiro_recusado` na trilha; a troca comum segue em `change-password`, que exige a senha atual. O agente já estava barrado dessa rota desde o #221.
- **Segredo de webhook fora da listagem e do export (#222).** `GET /projects/:id/webhooks` devolvia `secret` a todo membro do projeto, contra o comentário do próprio código ("devolvido UMA vez"); o export de portabilidade o levava em texto puro. Webhook, SSO, SCIM e `repository_token` saem sem o segredo.
- **A tela de consentimento do agente dizia o contrário do que concedia (#222).** Afirmava "não apaga registros, não gera em lote" depois do #221. Agora descreve o alcance real e a confirmação exigida.
- **Escalonamento de privilégio em `/users` (#211)** e **vazamento de `pricing-config` para fora do comercial (#209)** fechados; **designar consultor** passa a ser do `platform_admin` ou do administrador do cliente (#210), porque a linha de governança decide quem conecta um agente ao projeto.
- **O código de recuperação de senha ia em texto puro para o log (#218).** Com a observabilidade ligada, quem lia o log trocava a senha de qualquer conta. Removido.
- **Vinte e dois alertas de dependência fechados.** Ativar as atualizações de segurança do Dependabot revelou o acúmulo: dezenove no `mcp-server-niso`, cujo lockfile tinha ficado para trás, e três na raiz. Os de maior peso eram `fast-uri` (alta, duas advisories), `ip-address` (alta) e `hono` no MCP, parado na 4.12.27 com travessia de diretório em `toSSG()` e problemas em `Suspense`/`ErrorBoundary`. Corrigidos só pelo lockfile — nenhum manifesto do MCP mudou, porque `hono` é transitivo do SDK e o código de lá não o importa; declará-lo como dependência direta seria afirmar algo falso.
- `sharp` (alta) chega por `@cloudflare/vitest-pool-workers` → `miniflare`. A correção que o npm propunha era rebaixar o pool de teste em versão MAIOR, o que quebraria a suíte inteira; entrou como `overrides` para `^0.35.4`, que é o caminho certo para corrigir dependência transitiva sem mexer no pai. É dependência de desenvolvimento e nunca chega ao bundle de produção.
- `vitest` e `@vitest/mocker` (média) na raiz: 4.1.10 → 4.1.11. A 10.0.0 subiu o vitest do frontend e esqueceu o da raiz.
- **Referência a recurso de outro projeto recusada (#283).** Risco, CAPA, governança, auditor e DPIA (`ropa_id`) aceitavam no corpo ids de outro projeto: o risco de A exibia título e norma do controle de B (leitura entre tenants), e com `ON DELETE CASCADE` o dono de B apagava a CAPA de A. Agora `refForaDoProjeto` responde o mesmo 400 para id inexistente e de outro projeto, sem oráculo de existência. O `PUT` parcial deixa de apagar os campos que o corpo não traz.
- **500 não devolve mais a mensagem crua do D1 em evidência e ROPA (#282).** Os 14 handlers passam por `erro500` (`request_id` ao cliente, detalhe no log), com catraca que reprova `detail: e.message` em `src/routes`. O upload de evidência confere o controle antes de gravar no R2: `control_id` de outro projeto era aceito (201) e o inexistente deixava objeto órfão.
- **Relatório de DPIA sem XSS (#288).** Os valores eram interpolados crus no HTML do relatório; passam a ser escapados.

## [10.0.0] - 2026-09-14

Interface refeita no padrão ness., autenticação com desafio anti-abuso,
documentos legais com aceite bloqueante e trilha de auditoria por campo. No
caminho, os cabeçalhos de segurança passaram a alcançar o HTML — descobriu-se
que nunca alcançavam — e a sonda externa de produção passou a funcionar pela
primeira vez.

**Mudança de comportamento visível**: doze writes que aceitavam corpo malformado
e gravavam lixo passam a responder 400; um documento legal publicado como
`material` barra o acesso de todos até o aceite.

### Added
- **Handoff ness. (`docs/design/handoff-ness-v1/`)**: tokens do design system, shell (sidebar 232/72, bandas de 64px, menu de conta), primitivas de `ui.js` (cabeçalho sem subtítulo, badge por `color-mix`, tabela com cabeçalho fixo, toast com Desfazer e região `aria-live` permanente).
- **Gate de aplicabilidade N/A da SoA**: justificativa obrigatória na tela e no servidor (`recusaAplicabilidade` em `routes/controls.ts`, `assertSoAExportable` em `services/soa-logic.ts`); marcar N/A zera CMMI e dono; a SoA não é produzida com exclusão sem justificativa.
- **SoA**: ordenação natural do código do Anexo A, seleção em lote com Desfazer, cursor de teclado (`j`/`k`/`Enter`/`x`/`a`), skeleton, estados de erro com código de requisição e paginação explícita de 25.
- **Autenticação (conta local)**: erro de credencial genérico com tentativas restantes, desafio anti-abuso a partir da 2ª falha, bloqueio de 15 min com `auth.lockout`, expiração por inatividade (30 min Cliente / 8 h consultor), segundo fator de 6 dígitos que valida ao completar, reautenticação preservando rascunho e trilha da própria sessão.
- **Documentos legais versionados** (migration 0029): classificação `comum | material`; material barra o acesso até o aceite, registrado com data, IP e user-agent.
- **Trilha por campo** (migration 0030): `campo: antes → depois` com autor e `operation_id` que agrupa o lote; histórico exibido no detalhe do controle.
- **Desafio anti-abuso do login (Turnstile), ponta a ponta.** A tela passa a carregar o widget sob demanda — só quando o servidor diz que o desafio é exigido, não em toda visita — e a montá-lo com a site key que vem na própria resposta, sem acoplar chave ao build. O widget é REINICIADO a cada falha: o token do Turnstile é de uso único e o desafio é conferido antes da senha, então uma tentativa com senha errada já o gastou; sem o reset, a seguinte seria recusada por "token já usado" e a pessoa ficaria presa. Se o script não carregar, o botão `Entrar` não fica travado — sem meio de resolver o desafio, travá-lo seria trancar o usuário para fora.
- **O desafio agora só liga com as DUAS chaves.** Antes o interruptor era só `TURNSTILE_SECRET_KEY`, e defini-la sozinha fazia o servidor exigir um desafio que a tela não tinha como montar. Aconteceu em produção em 14/09/2026: quem errasse a senha uma vez não entrava mais até a janela de 15 min expirar. A falha segura é não exigir desafio — perder uma camada extra é menos grave que trancar quem sabe a própria senha, e o bloqueio de 15 min na 5ª falha e o teto atômico por conta seguram a força bruta sem o Turnstile. `test/turnstile-interruptor.test.ts` reprova o retorno da armadilha.

### Changed
- Assinatura do export de portabilidade passa de HMAC para **Ed25519**. Uma
  assinatura prova origem a QUEM RECEBE, e com chave simétrica quem verifica
  também forja — o recipiente de um export é o cliente, às vezes o sucessor
  dele. A pública é publicada; a privada nunca sai do Worker.
- Paleta iOS (`#34c759`/`#ffcc00`/`#ff3b30`) → paleta ness. (`#10b981`/`#f59e0b`/`#ef4444`); `--text-dim` deixa de ser alpha (estava em ≈3,4:1 sobre o card) e passa a `#94a3b8`.
- `--glass-blur: none` remove todos os `backdrop-filter` herdados.
- Migrations do handoff renumeradas para 0029 e 0030: 0024–0028 já existiam na `main` (rate limit, enum de avaliação, política por tenant, SSO, SCIM).
- Handlers inline (`onclick`, `onchange`…) das telas do handoff convertidos para a delegação de eventos (`data-action`), exigida pelo CSP sem `unsafe-inline`.
- `src/trilha.ts` (arquivamento encadeado no R2) e a trilha por campo (`src/trilha-campo.ts`) passam a ser módulos distintos; o arquivamento inclui as colunas por campo.
- Dependências npm atualizadas num lote só, em vez de doze PRs do Dependabot: `hono` 4.13.5 → 4.13.7, `zod` 4.4.3 → 4.5.4 (raiz e `mcp-server-niso`), `@types/node` 26.1 → 26.5, `vite` 8.2.0 → 8.2.2, `vitest` e `@vitest/coverage-v8` 4.1.10 → 4.1.11. O salto do `zod` muda a REPRESENTAÇÃO de campo nulável no JSON Schema gerado — de `anyOf: [string, null]` para `type: [string, null]`, equivalente e mais compacto no mesmo draft —, então `docs/openapi.json` foi regenerado. Era isto que deixava o PR do `zod` vermelho: o Dependabot não tem como rodar `npm run openapi`.
- GitHub Actions atualizadas: `upload-artifact` v4 → v7, `github-script` v7 → v9, `codeql-action` v3 → v4. São saltos de versão MAIOR em ações que sustentam backup do banco, migração, deploy, detecção de desvio de schema, SLO e a sonda de produção — e nenhum desses workflows roda em pull request, então o verde do CI não os cobre. As duas primeiras ficam provadas assim mesmo: `upload-artifact` roda com `if: always()` em todo PR, e `github-script` é exercitado pelo próprio deploy que segue o merge, no passo que fecha issue de falha. O `codeql-action` roda no PR.
- **Higienização do repositório e documentação.** README ganha mapa do repositório, tabela de workflows (o que cada um garante), seção de testes e a lista real de segredos com o que acontece sem cada um. `docs/` ganha índice agrupado por quando se precisa de cada documento. O pacote de handoff visual sai da raiz para `docs/design/handoff-ness-v1/`. O repositório passa a ter descrição, homepage e tópicos no GitHub, e a apagar branch no merge. Cinquenta e um branches remotos de PRs já mergeados foram removidos.

### Fixed
- `PUT /api/v1/controls/:id/status` aceitava marcar N/A sem justificativa nenhuma, contornando o gate da tela.
- `forceCloseModal()` lançava quando os elementos de modal não existiam, matando a cascata de Esc.
- `scripts/gerar-openapi.mjs` montava caminhos com `URL.pathname`, que em Windows sai como `/C:/...` com acentos percent-encoded; passa a usar `fileURLToPath`.
- `POST /controls/:id/trilha/desfazer` lia o corpo cru; passa por `trilhaDesfazerSchema` e entra no contrato OpenAPI, junto das rotas de documentos legais.
- **Preview de CNPJ voltou a funcionar sob o CSP.** A tela de novo lead chamava a brasilapi direto do navegador; com os cabeçalhos de segurança alcançando o HTML, `connect-src 'self'` passou a bloquear a chamada e o preview morria com "Failed to fetch". A consulta foi para o servidor (`GET /api/v1/leads/consulta-cnpj/:cnpj`), onde a mesma fonte já era usada pelo enrich — o CSP segue fechado para terceiros e o IP de quem digita deixa de ir para fora. A rota devolve só os cinco campos que o preview mostra, herda o `somenteNess` do roteador de leads e recusa formato inválido antes de sair para a rede.
- **Pré-visualização de PDF de evidência voltou a abrir.** Outra consequência de os cabeçalhos passarem a valer no HTML: o preview monta um `iframe` com Object URL (`blob:`), e sem `frame-src` a diretiva caía para `default-src 'self'` — `blob:` não é `'self'`, então o navegador bloqueava. Conferido no ar com um navegador de verdade, pelo evento `securitypolicyviolation`: `frame-src` / `blob`. O CSP passa a declarar `frame-src 'self' blob:`. O `srcdoc` do preview de proposta foi conferido do mesmo jeito e nunca esteve afetado (herda a política do pai); baixar arquivo também não, porque `<a download href="blob:">` é navegação, não busca de recurso.
- **A sonda externa de produção nunca funcionou.** `uptime.yml` declarava `código=$(...)`, e bash não aceita acento em nome de variável: a linha vira comando, o shell responde `command not found` e o passo morre com 127 — antes de verificar coisa alguma. A cada 15 minutos a sonda reabria a mesma issue dizendo "produção não está respondendo", com produção no ar. O alarme falso é a metade menos grave; a grave é que, enquanto ele tocava por engano, não havia sonda nenhuma vigiando de verdade. Mesmo defeito no teste de fumaça de staging do `deploy.yml`, que ainda não tinha rodado porque `STAGING_ATIVO` não está ligado. `test/workflows-shell.test.ts` passa a reprovar nome de variável com acento em qualquer workflow.
- **`hidden` não escondia o bloco de verificação da tela de entrada.** A regra do agente (`[hidden] { display: none }`) perde para qualquer regra de autor que declare `display`, e `.login-challenge` declara `display: flex` — então o atributo virava decoração. Na prática, quem apenas abria a tela de entrada via a faixa "Conclua a verificação de segurança para continuar", sem ter tentado nada. Corrigido com uma regra global `[hidden] { display: none !important }`, que fecha a classe inteira do problema: `.account-menu` já tinha precisado de um remendo próprio pelo mesmo motivo. O teste vive no e2e (`frontend/e2e/login-desafio.spec.js`) e não no jsdom de propósito — o jsdom devolve `display: none` para `[hidden]` de qualquer jeito, então um teste lá passaria com e sem a correção.
- **`favicon.png` devolvia 404 em toda visita à tela de entrada.** O HTML pedia um PNG que o projeto nunca teve — o ícone sempre foi `.svg`, e é o que a landing já usava. A aba ficava sem ícone e o console acusava o erro. A página pública de políticas também não declarava ícone nenhum; agora declara. `frontend/test/recursos-existem.test.js` confere que todo arquivo local pedido pelo HTML existe em `public/`.
- Corrigido o comentário de `TOKEN_ENC_KEY` em `src/index.ts`, que descrevia um fallback de texto claro removido há tempos — hoje o caminho falha fechado com 503. Documentação que descreve risco inexistente manda procurar no lugar errado.
- README anunciava `niso.ness.com.br` como produção; esse domínio não responde. O que responde é `n-iso.ness.com.br`. (Desfeito depois: `niso.ness.com.br` passou a ser o domínio oficial no #208 e o canônico no #290.)

### Segurança
- **Isolamento de tenant travado por teste onde não havia nenhum.** As rotas de projeto de `risks`, `policies` e `integrations` se declaravam `/projects/:id/...` enquanto o middleware de acesso lê `:projectId`. Funcionava por acidente — o Hono resolve o parâmetro por handler —, mas nada travava isso: uma rota nova com o nome errado abriria o buraco em silêncio. As rotas passam a declarar `:projectId`, e o par ataque/ator-legítimo virou teste.
- **Negação de acesso virou tipo, não prefixo de string.** Trinta e nove handlers decidiam entre 403 e 500 comparando `e.message.startsWith('Forbidden')`. Quem negasse com outra mensagem recebia 500 — a recusa virava falha de servidor, e tanto a resposta quanto o log passavam a mentir. Existe `ForbiddenError`, e a guarda mora em `erro500`.
- **Schema Zod nos 12 writes que gravavam o corpo cru.** A assimetria mais clara estava em `vendors`: o POST validava, o PUT aceitava qualquer coisa e gravava 18 colunas. Campo desconhecido continua aceito; o buraco era campo ERRADO. Um teste de invariante impede o gap de voltar, e ele foi verificado sabendo falhar.
- **Nota de risco fora da matriz 5x5 deixa de entrar pelo PUT.** O schema de update exigia só ativo e ameaça como texto e deixava `impact`/`probability` passarem crus — `impact: 99` corrompia a matriz que depois vira nível de risco em relatório e na SoA.
- **Os cabeçalhos de segurança não alcançavam o HTML.** O `secureHeaders` do Worker só vale para resposta que o Worker gera; sem `assets.run_worker_first`, o Workers Assets serve o arquivo estático antes disso. Na prática o documento que carrega e executa os scripts saía sem CSP, sem HSTS, sem `nosniff` e sem anti-framing — o CSP endurecido do S2 (treze PRs para tirar `unsafe-inline` de `script-src`) cobria apenas as respostas JSON da API, onde script injetado não executa de qualquer forma, e a console de GRC ficava enquadrável em iframe. Os mesmos cabeçalhos passam a ser declarados em `frontend/public/_headers`, que é o mecanismo do Workers Assets para isso (sem custo de invocação de Worker); `test/cabecalhos-assets.test.ts` compara os dois lados e falha se divergirem.

## [9.0.0] - 2026-09-06

Ondas 3 e 4 do plano enterprise. **Major** por causa de duas mudanças de
comportamento em rotas existentes (ver *Alterado*), não por tamanho.

### Adicionado
- **SSO por OIDC, por tenant** (4.1): PKCE S256, `state` de uso único, `nonce`
  conferido, allow-list de algoritmo, `email_verified` exigido. Provisionamento
  no primeiro acesso com o papel do tenant — nunca o do IdP.
- **SCIM 2.0** (4.2): `/scim/v2/Users` com o ciclo completo. O desligamento no
  IdP derruba as sessões vivas na hora e bloqueia o login.
- **Política de segurança por tenant** (4.3): MFA obrigatório, TTL de sessão e
  allowlist de IP (IPv4/CIDR) configuráveis por cliente.
- **Trilha de auditoria arquivada fora do D1** (4.4): JSONL diário no R2,
  encadeado por SHA-256, com rota de verificação que recalcula os digests.
- **Política de retenção** (4.5) declarada em `docs/retencao.md` e executada
  pelo cron. Registro de GRC nunca entra em purga automática.
- **Portabilidade do tenant** (4.6): `GET /api/v1/projects/:projectId/export`,
  com as tabelas descobertas do banco e não de uma lista.
- **Contrato OpenAPI** (3.1) gerado dos schemas Zod, servido autenticado e
  versionado em `docs/openapi.json`.
- **SLO sobre o Analytics Engine** (3.5): taxa de 5xx e p95, a cada 6 h.
- **Sonda externa de disponibilidade** (3.6), a cada 15 min.
- **Ambiente de staging** (2.1–2.3) e **detecção de drift de schema** (2.6).
- **Template de Declaração de Aplicabilidade (SoA)** com os 93 controles do
  Anexo A:2022.
- `/health` passa a devolver `version`, `deployment_id` e `deployed_at` (0.2).

### Corrigido
- **`PUT` dos módulos devolvia 500 com corpo parcial**, não 400 — o handler
  passava `body.campo` direto ao `.bind()`.
- `niso_respond_auditor_note` (MCP) mandava POST para uma rota que só aceita
  PUT: a ferramenta de responder nota de auditor devolvia 404.
- **20 objetos em produção que o `schema.sql` não declara** (12 tabelas órfãs, 3
  com dado que ninguém lê). Registrados e vigiados, não apagados — descarte de
  dado de cliente é decisão de retenção, com backup na mão.

### Segurança
- Zero `any` nos caminhos de autorização, com catraca verificada por mutação.
- Validação de corpo fechada nas rotas de maior custo: senha, escopo de acesso
  (`PUT /admin/users/:id`) e as três rotas **sem autenticação** do portal
  público, que estouravam 500 com `{"email": 123}`.

## [8.3.0] - 2026-09-06

### Adicionado
- Contrato de isolamento das 77 rotas de topo passa a detectar guarda
  **ausente**, não só mal colocada (semeando recurso real do outro tenant).
- Ambiente de staging escrito, e sonda externa de disponibilidade.
- Política de senha: 8 caracteres em senha nova.

### Corrigido
- **Três rotas de `/api/v1/auth` estavam mortas** por ordem de montagem:
  `/auth/me` respondia `200 {}` sem credencial nenhuma,
  `/auth/reset-password-first` respondia 403 sempre — quebrando o fluxo
  obrigatório de primeiro acesso — e `/auth/change-password` estourava 500.
- **Portal do cliente inalcançável**: `/client/assessment` e `/client/proposal`
  liam uma coluna que nunca existiu e respondiam 404 para todo mundo.
- Template inexistente devolvia 500 em vez de 404; o catálogo anunciava um
  template que não existia e escondia dois que existiam.

## [8.2.0] - 2026-09-03

### Adicionado
- Plano `enterprise-grade-plan.md` e as ondas 0 e 1: isolamento multi-tenant
  provado por teste, não presumido.
- Primeira execução periódica do sistema (cron de manutenção) e
  `docs/runbook-incidente.md`.
- Backup diário do D1 com verificação do dump.

### Corrigido
- Portfólio e dashboard vazavam a carteira inteira para papel de cliente fora da
  lista conhecida (`ciso` escopado a um projeto recebia todos).
- Recusa de acesso virava 500 em vez de 403 em `assets` e `webhooks`.
- Interface mostrava `undefined` e status em inglês na tela de riscos.

## [8.1.0] - 2026-08-27

Endurecimento de segurança sobre o OWASP Top 10, e a infraestrutura de entrega.

### Adicionado
- CSP sem `unsafe-inline` em `script-src` (S2), por delegação de eventos.
- CORS por allowlist (S3), `npm audit` no CI (S5), rate limit de login atômico
  em D1 (S6), pinning de DNS contra SSRF rebinding (S8).
- Cifragem de `repository_token` em repouso (AES-GCM).
- MFA por TOTP, com carência e limite de tentativas.
- CodeQL (SAST), workflow manual de migrations, avaliação OWASP e `security.txt`.
- Revogação de sign-off de controle; `owner` gravável; `scope` gravável.

### Corrigido
- XSS armazenado no modal de precificação (S7).
- IDOR em `/mcp/execute`; OTP do portal público endurecido.
- Aprovação de DPIA passa a exigir autoridade de assinatura.
- Conteúdo de titular deixa de ir para o `audit_log` (S-log).

## [8.0.0] - 2026-07-03
### Added
- **Sprint 8**: Certification Tracker, AI Compliance Assistant (Llama 3.1), Onboarding Status, Template Marketplace, Public Endpoints (Pricing/Stats), and Landing Page.
- **Sprint 7**: Webhooks, API Keys (SHA-256), and CSV Exports.
- **Sprint 6**: Executive Report, Portfolio view, Audit Calendar, and CAPA (Corrective Actions).
- **Sprint 5**: Policy Templates (10 ISO templates), Traceability (Risk -> Control -> Evidence), ROPA Module, Gap Analysis, and Control Maturity (CMM).
- **Sprint 4**: Risk Assessment Module, KYV (Know Your Vendor), Security Awareness Tracker, Bulk Policy Generation, and ISO 27701 Migration.
- **Sprint 3**: Evidence Upload (R2 + SHA-256), MemoryService (Vectorize RAG), SoA Logic Engine (93 rules), and Audit Readiness Pack.
- **Sprint 2**: PolicyAgent (AI Policy Gen), EvidenceAgent (AI Evidence Eval), Auditor Portal, and Notification System.
- **Sprint 1**: Assessment Pre-Sales, Pricing Engine, Auto-Proposal, Auto-Project, Phase Checklists, and UI/UX Redesign (Glassmorphism).

## [1.0.0] - 2026-07-02
### Added
- Initial project structure and constitution.
- Basic Hono API setup on Cloudflare Workers.
- Database schema and D1 integration.
