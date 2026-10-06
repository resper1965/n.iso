# Sistema de propostas — design

**Data:** 2026-10-02 · **Estado:** aprovado em conversa, aguardando revisão do spec
**Substitui:** o fluxo comercial atual (leads → levantamento → proposta → "Aprovar"/"Converter")

## 1. Por que

A área comercial não fecha uma venda pelo sistema. Fatos levantados em `origin/main` (2026-10-01):

- O botão "Aprovar" só grava `status='Signed'` (`commercial.js:486,549`). Não cria contrato nem projeto, nem marca o lead como ganho. `POST /proposals/:id/sign`, que faz isso, não tem chamador e passa a recusar a proposta depois do "Aprovar" (`proposals.ts:140`).
- Há dois caminhos que criam projeto sem trava entre si: `/sign` e `/assessments/:id/convert`. Eles divergem em status, norma, papel e fases.
- A proposta gravada é `<p>Proposta X para Y</p>` (`assessments.ts:426`). Um modelo de 17 seções existia até o commit `72f1b59` (2026-07-22) e se perdeu na decomposição do `index.ts`.
- O preço sai de valores fixos no código (`pricing.ts:333/353/374`). A configuração editável (diária, custo, tributos) não afeta o preço, só o indicador de margem.
- O self-service do levantamento chama uma rota inexistente. O portal do cliente devolve sempre 404. Os cartões de leads contam 0 porque os status divergem entre tela e banco.
- O consultor recebe o preço no `GET /assessments` (`SELECT *`).
- Nenhuma tabela comercial sabe a qual organização pertence; preço, textos e marca estão escritos com a ness. dentro.

Além de consertar, o sistema precisa servir a **outras consultorias** que contratem o n.iso (seção 9).

## 2. Princípio

**Flexível onde a consultoria precisa, rígido onde a rigidez ajuda.**
Flexível: o que ela vende (catálogo), quanto cobra (diária, porte, desconto) e o texto.
Rígido: a estrutura do documento, o cálculo, o ciclo de vida, o aceite e o funil.

Abordagem escolhida: **catálogo de serviços + documento montado em blocos**. Foram descartados o editor livre (caro, propostas inconsistentes, funil impossível de medir) e quatro modelos fixos (cada norma ou serviço novo exigiria programação; propostas mistas não cabem).

## 3. Catálogo de serviços

A consultoria cadastra uma vez o que vende. Campos de um serviço:

| Campo | Observação |
|---|---|
| nome, norma, descrição | norma é texto livre com sugestões: 27001, 27701, 22301, 42001, SOC 2, PCI DSS, LGPD |
| tipo de cobrança | `projeto`, `avulso` ou `recorrente` |
| fases (só `projeto`) | por fase: nome, objetivo, atividades, entregáveis, critério de aceite, % do esforço, semanas |
| entregáveis e critério de aceite (`avulso`) | |
| incluso por mês, mensalidade, prazo mínimo em meses (`recorrente`) | |
| forma de preço do `avulso` | `fixo` (valor) ou `esforço` (dias) |
| dias sugeridos por faixa | Foundation / Standard / Enterprise; usados quando há diagnóstico |
| premissas e exclusões | entram na proposta quando o serviço é escolhido |
| ativo | arquivado não aparece em proposta nova; as antigas continuam intactas |

Regras:

1. **Editar o catálogo não altera proposta gerada.** A proposta guarda a cópia do serviço no momento da geração.
2. **Diária e porte são da organização**, não do serviço (seção 8).
3. **Ponto de partida:** o catálogo da ness. nasce das faixas atuais de `pricing.ts` — um serviço "Implementação ISO 27001 + 27701" com as fases (`PHASE_BREAKDOWN` 1–3) e os dias de cada faixa. Uma consultoria nova recebe dois ou três serviços de exemplo editáveis.

Fora: pacotes de serviços; preço por quantidade de controles ou de sistemas.

## 4. Proposta e preço

### 4.1 Assistente (4 passos)

1. **Cliente** — razão social, CNPJ, contato e porte vêm do lead. Nada é redigitado.
2. **Serviços** — escolher um ou mais do catálogo. Com diagnóstico, os sugeridos vêm marcados com os dias da faixa.
3. **Ajustes** — por serviço: dias, meses ou valor; desconto; texto específico do cliente. Escopo e lacunas vêm do diagnóstico e são editáveis.
4. **Número e condições** — número sugerido pela sequência da organização e editável, sem repetir; validade; condição de pagamento. Gerar.

### 4.2 Cálculo por tipo

- `projeto` e `avulso` por esforço: **dias × diária da faixa × fator de porte**.
- `avulso` fixo: valor do catálogo.
- `recorrente`: **mensalidade × meses**.
- Desconto em % por serviço, até o **teto da organização**. Acima do teto, a proposta fica em *aguardando aprovação* até o administrador da organização aprovar.
- Arredondamento: cada serviço sobe para o milhar seguinte.

### 4.3 Memória de cálculo e margem (só comercial)

Cada linha mostra o cálculo, por exemplo: *"Implementação, Standard: 90 dias × 1,3 (120 pessoas) = 117 dias × R$ 2.900 = R$ 339.300 → desconto 10% → R$ 305.370"*. Ao lado, o indicador de margem e viabilidade (custo interno, overhead, tributos e margem-alvo da organização). A memória e o indicador são gravados com a proposta.

### 4.4 Totais

Separados por natureza, nunca somados entre si:
- **Investimento do projeto** — soma de `projeto` e `avulso`, com parcelas ligadas a marcos (entregas) ou a datas.
- **Mensalidade** — soma de `recorrente`, com prazo mínimo.

### 4.5 Revisões

Mudança pedida pelo cliente gera revisão com o mesmo número e sufixo: `NESS-2026-014 rev. 2`. Ao enviar a revisão, a anterior deixa de valer e o link antigo mostra só a versão nova. As anteriores ficam no histórico.

### 4.6 Ciclo de vida

`rascunho` → `aguardando_aprovacao` (só se passou do teto) → `enviada` → `visualizada` → `aceita` | `recusada` | `expirada`.
A transição é validada no servidor e cada uma entra na trilha (`logAudit`) com a organização e o lead.

Fora: moeda estrangeira; tributo destacado por item (tudo em reais, tributos inclusos).

## 5. Documento

### 5.1 Estrutura fixa, seções condicionais

| Seção | Aparece quando | Fonte |
|---|---|---|
| Capa | sempre | proposta |
| Sumário executivo | sempre | texto do comercial + totais |
| O que o diagnóstico mostrou | há diagnóstico | diagnóstico |
| Lacunas prioritárias | há diagnóstico com lacunas | diagnóstico (`GAPS`) |
| Objeto e escopo | sempre | serviços + escopo editável |
| Como trabalhamos | há `projeto` e a organização não desligou | organização |
| Plano por serviço | sempre (fases / entregáveis / incluso por mês) | cópia do catálogo |
| Cronograma e marcos | há `projeto` | fases × semanas |
| Responsabilidades e equipe | há `projeto` e a organização não desligou | organização |
| Investimento | sempre | cálculo |
| Premissas, exclusões e riscos | sempre | serviços + organização |
| Termos (obrigações, propriedade, confidencialidade, LGPD, vigência, rescisão, foro) | sempre | organização |
| Aceite | sempre | proposta |

Resultado esperado: avulso com 5–6 páginas, implementação completa com ~15, recorrente com ~6. A prévia foi aprovada pelo dono em chat (não versionada).

### 5.2 Onde o comercial escreve

Quatro campos livres em lugares fixos: **contexto do cliente** (sumário), **escopo**, **texto por serviço** e **observações**.

**Atualização de 2026-10-02 (decisão do dono):** além disso, as seções de **texto** do documento (sumário, objeto e escopo, como trabalhamos, responsabilidades, sobre, premissas, termos, observações) podem ser **reescritas por proposta**, em texto simples. As seções de **dados** (capa, diagnóstico, lacunas, investimento, cronograma, aceite) continuam calculadas e não editáveis.

### 5.3 Geração e formato

- Montado **no servidor**, a partir de dados validados, com escape de todo texto de usuário (`escapeHtml`). Gravado inteiro (HTML) com o hash SHA-256. É o que o cliente vê e aceita.
- Papel branco, A4, capa, cabeçalho com número e página, rodapé com validade. Títulos em Montserrat, texto em Inter; a cor da organização só em linhas e títulos.
- PDF pela impressão do navegador. PDF no servidor (Browser Rendering) fica para quando for preciso anexar em e-mail.
- **Word (.docx) como cópia de trabalho** (decisão do dono, 2026-10-02), gerado do mesmo conteúdo congelado. O que vale para o aceite é sempre a versão do n.iso com o hash; o rodapé do Word diz isso.

## 6. Envio, aceite e fechamento

### 6.1 Envio

- E-mail com link para o cliente, com código secreto (CSPRNG, `genToken`) válido até a validade. Remetente "*Nome da organização* via n.iso", `Reply-To` com o e-mail do comercial. Domínio próprio da consultoria fica para depois.
- O comercial também pode copiar o link.
- O link é revogável e é substituído por revisão.

### 6.2 O que o cliente faz no link (sem conta)

- **Ver** a proposta congelada. A primeira abertura marca `visualizada` e avisa o comercial.
- **Aceitar** — nome, cargo, e-mail e a confirmação "tenho poderes para contratar em nome da empresa". O sistema registra data, hora, IP e o hash do documento aceito.
- **Recusar** — motivo opcional; o lead vira `perdido` com o motivo.
- **Pedir ajuste** — a mensagem chega ao comercial, que gera revisão.
- Depois da validade, o link diz que expirou e oferece pedir uma nova.

O link público é rota pública com limite de taxa e sem dado além da própria proposta.

### 6.3 Rotina única de fechamento (`fecharVenda`)

Chamada pelo aceite do cliente e pelo "marcar aceita" manual do comercial (com comprovante anexado, para aceite em papel ou em outra plataforma). **Idempotente**: roda uma vez por proposta, em um `db.batch`.

1. Registra o contrato com o documento aceito e o hash.
2. `projeto`: cria o projeto com os dados do cliente e do diagnóstico, as fases da cópia do catálogo e o consultor responsável (escolhido na proposta) já designado na governança (mesma função `designacaoDoCriador` da D5).
3. `avulso`: cria projeto do mesmo jeito, ou junta ao projeto existente do mesmo cliente.
4. `recorrente`: registra o contrato recorrente (início, mensalidade, prazo mínimo).
5. Lead vira `ganho`; comercial e consultor são avisados.

"Converter levantamento" e `POST /proposals/:id/sign` deixam de criar projeto por conta própria; o botão "Aprovar" sai.

Fora: Clicksign/DocuSign (encaixa no passo do aceite); cobrança e nota fiscal; lembrete automático antes de vencer.

## 7. Funil

Leads `novo` → `diagnostico` → `proposta` → `ganho` | `perdido`, com transições validadas no servidor e na trilha. Painel por organização: conversão por etapa, valor em pipeline (projeto e mensalidade separados), tempo de ciclo, motivos de perda.

## 8. Organização × proposta × papéis

### 8.1 Da organização (configurado uma vez)

- **Identidade:** nome, CNPJ, logo (SVG/PNG no R2), cor de destaque, selo "emitida com n.iso" (sim/não — escolha da consultoria).
- **Numeração:** prefixo e próximo número. Único dentro da organização.
- **Preço:** diária (uma ou três por faixa), tabela de porte, teto de desconto; para a margem: custo interno, overhead, tributos, margem-alvo.
- **Textos:** sobre nós, como trabalhamos, equipe por perfil, termos jurídicos, premissas gerais, condições de pagamento padrão; seções desligáveis ("Como trabalhamos", "Responsabilidades").
- **Catálogo.**

### 8.2 Da proposta (congelado na geração)

Cliente, serviços (cópia), dias, valores, desconto, memória de cálculo, os quatro textos, o documento e o hash; revisões, envios, visualizações, aceite; vínculos com lead, diagnóstico, contrato e projeto (com chave estrangeira).

### 8.3 Papéis

| Papel | Pode |
|---|---|
| Administrador da organização | configuração, catálogo, textos, aprovar desconto acima do teto |
| Comercial | leads, diagnóstico, montar, gerar, enviar, revisar, marcar aceite manual |
| Consultor | ver serviços contratados e plano dos projetos em que está designado; **sem preço nem margem** |
| Cliente (link) | ler, aceitar, recusar, pedir ajuste da própria proposta |
| Agente MCP | nada da área comercial (`FORA_DO_AGENTE`, como hoje) |
| `platform_admin` da ness. | tudo de todas as organizações |

## 9. Contexto multi-consultoria (decisões de 2026-10-01/02)

- Consultorias e consultores avulsos podem contratar o n.iso. **A consultoria é a cliente pagante e dona dos dados** enquanto o contrato dura. Consultor avulso = consultoria de um membro.
- **Abordagem A:** `org_id` em projetos, usuários e tabelas de dados, com filtro obrigatório; a designação da D5 vale dentro da organização. A ness. é a organização nº 1; uma migration põe nela tudo o que existe.
- **Transferência para o cliente:** se o cliente dispensar a consultoria, o projeto inteiro (com a trilha) passa a uma organização do próprio cliente, com contrato direto. **Só o `platform_admin` dispara**, depois do contrato novo assinado. As designações da consultoria e os agentes conectados caem na hora.
- **Acesso da ness.:** o `platform_admin` mantém acesso total a todas as organizações. O termo de uso com as consultorias precisa declarar isso.
- **Área comercial por organização**, como neste spec.

Este spec usa a organização desde o início (ness. = nº 1), mesmo antes de outras consultorias entrarem, para não refazer as tabelas comerciais depois.

## 10. Segurança

- Todo texto livre passa por `escapeHtml` antes de entrar no documento; o documento não leva script e é servido com o CSP atual.
- Token do link: CSPRNG, comparado em tempo constante, revogável, expira com a validade.
- Rotas públicas do link: limite de taxa por IP e por token; nunca devolvem dado de outra proposta.
- Toda rota comercial filtra por organização; o teste que percorre `app.routes` exige recusa entre organizações.
- Preço e margem nunca saem para papel sem permissão comercial (corrige o `SELECT *` de `GET /assessments`).
- Aceite registra IP e hash; a proposta aceita é imutável.

## 11. Fatias de entrega (cada uma útil sozinha)

1. **Organização mínima** — tabela `organizations` em uso, ness. = nº 1, `org_id` nas tabelas comerciais, configuração de identidade, numeração e preço.
2. **Catálogo de serviços** — CRUD, tela, e o catálogo da ness. preenchido a partir das faixas atuais.
3. **Proposta** — assistente, cálculo, memória, documento congelado, revisões. Substitui o gerador quebrado.
4. **Link, aceite e fechamento** — página pública, `fecharVenda`, remoção de "Aprovar" e do projeto criado por "Converter".
5. **Funil e abertura** — métricas, transições de lead validadas, e a abertura para outras consultorias junto com o restante da multi-consultoria.

## 12. Pendências fora de código (bloqueiam a fatia indicada)

| Pendência | Quem | Bloqueia |
|---|---|---|
| Revisar a diária e os dias por faixa da ness. (dias × diária dá valores bem acima da tabela atual) | comercial da ness. | 2 |
| ~~Revisão dos termos padrão~~ — **feita pelo dono** (prévia aprovada, 2026-10-02); viram os termos iniciais da ness. | — | — |
| ~~Referências da 27701 nas lacunas~~ — analisadas em 2026-10-02: numeração 2025 certa, controles errados (RoPA citava consentimento; direitos do titular citavam A.8.8 da 27001). Corrigidas na fatia 3 contra `src/data/iso27701-2025.ts`; uma conferência final na norma comprada é recomendada | — | — |
| Termo de uso das consultorias declarando o acesso administrativo da ness. | advogado | 5 |
| Remetente de e-mail: confirmar domínio de envio (`noreply@ness.com.br` × `noreply@ness.lat`, divergentes no código) | ness. | 4 |

## 13. Testes exigidos

- Cálculo: cada tipo de cobrança, porte, teto de desconto, arredondamento, totais separados.
- Congelamento: editar catálogo e termos depois de gerar não muda o documento nem o hash.
- Numeração: repetição recusada na mesma organização e aceita em organizações diferentes; revisão mantém o número.
- Ciclo de vida: transição inválida recusada; cada transição na trilha.
- Link público: token inválido, revogado, expirado e de outra proposta; limite de taxa.
- `fecharVenda`: idempotente (segunda chamada não cria nada), atômica (falha no meio não deixa projeto órfão), consultor designado.
- Isolamento: nenhuma rota comercial devolve dado de outra organização.
- Papéis: consultor não recebe preço nem margem em nenhuma rota.
- Documento: seções condicionais por tipo; escape de texto livre (tentativa de injeção de HTML).
