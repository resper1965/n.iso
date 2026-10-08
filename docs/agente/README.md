# O agente consultor do n.iso

Um consultor conecta o **Claude Code, o Codex, o Cursor ou o Antigravity** ao
n.iso, entra com a própria conta e escolhe um cliente. O agente passa a trabalhar
**dentro daquele projeto**, lendo o SGSI inteiro e gravando adequação, com o
alcance que o consultor tem na interface e nenhum a mais.

Sem chave de API, sem instalar nada, sem compilar nada.

| Você é... | Comece por |
|---|---|
| **Consultor** que vai usar o agente | [Conectar](#conectar) e [Como trabalhar com ele](#como-trabalhar-com-ele) |
| **Administrador do cliente** (quer saber quem tem acesso) | [O que o cliente vê e controla](#o-que-o-cliente-vê-e-controla) |
| **Quem desenvolve o n.iso** | [`arquitetura.md`](arquitetura.md) e [`seguranca.md`](seguranca.md) |

---

## Conectar

O endereço oficial é `https://niso.ness.com.br/mcp`. Ele não funciona em outro
domínio.

| Cliente | Como |
|---|---|
| **Claude Code** | `claude mcp add --transport http niso https://niso.ness.com.br/mcp` |
| **Codex** | `codex mcp add niso --url https://niso.ness.com.br/mcp`, depois `codex mcp login niso`. Confira com `codex mcp list`. |
| **Cursor** | em `.cursor/mcp.json` (ou `~/.cursor/mcp.json`, para todos os projetos): `{ "mcpServers": { "niso": { "url": "https://niso.ness.com.br/mcp" } } }`. Entre por Cursor Settings > MCP. |
| **Antigravity** | em `~/.gemini/config/mcp_config.json` (antes da 2.0: `~/.gemini/antigravity/mcp_config.json`): `{ "mcpServers": { "niso": { "serverUrl": "https://niso.ness.com.br/mcp" } } }`. Entre pelo botão Authenticate do painel MCP; editor e linha de comando têm login separado. |

Na primeira chamada o cliente abre o navegador. Você:

1. entra com seu e-mail e senha do n.iso (e o código do segundo fator, se tiver);
2. escolhe **um** cliente, entre os projetos em que você é consultor designado;
3. volta ao cliente MCP, que já está conectado.

> **Estado dos clientes.** O Claude Code foi exercitado contra a produção em
> 30/09/2026 (conexão, leitura e escrita). Codex, Cursor e Antigravity
> têm a configuração acima, mas o login OAuth deles **ainda não foi confirmado**.
> Se algum falhar, registre qual e em que etapa. Um ponto a vigiar: o provider recusa, já no registro,
> callback de esquema próprio (`myapp:/cb`; erro `invalid_client_metadata`, "Redirect URI must use https,
> or http on a loopback host"). Cliente de desktop que registre um callback desse tipo não consegue conectar.

**Um cliente por conexão.** Cliente com dois projetos tem duas conexões, e o
agente de uma não enxerga a outra. Para trocar de projeto, conecte de novo e
escolha o outro.

**Não é você?** O agente age como você: a trilha registra
`agente de <seu e-mail> (<cliente> / <projeto>)`.

### Outros clientes MCP (possíveis, não suportados)

Qualquer cliente que fale MCP por HTTP com OAuth (registro dinâmico, PKCE, callback `https` ou
`http` em loopback) conecta. A ness. só dá suporte aos quatro acima.

**OpenClaw: não use com dado de cliente.** Ele conecta (`openclaw mcp add`, depois
`openclaw mcp login niso`), mas é um agente de longa duração que recebe mensagem por WhatsApp,
Telegram, Slack e outros canais. Qualquer mensagem nesses canais pode virar instrução para um
agente que grava e apaga no projeto do cliente com o seu alcance. Se mesmo assim for usar: nenhum
canal aberto a terceiros, um projeto por conexão (já é a regra) e revogue a concessão em
Governança quando terminar.

---

## Como trabalhar com ele

O agente começa sempre por **`niso_contexto`**: ela diz o cliente, o `projectId`,
o mapa da app e os roteiros. Depois ele escolhe o roteiro.

| Roteiro | Para quê | Escreve? |
|---|---|---|
| **1. Diagnóstico** | `niso_get_project`, `niso_gap_analysis`, `niso_traceability`: onde estamos e o que falta. Para numa lista de lacunas priorizada. | Não |
| **2. Fechar lacuna** | Escolhe um controle, rascunha evidência ou política, **espera a sua aprovação**, grava. Para quando o controle tem evidência vinculada. | Sim, depois do seu ok |
| **3. Responder auditoria** | Lê as notas do auditor, rascunha a resposta, espera a sua aprovação. | Sim, depois do seu ok |
| **4. Pré-avaliação de prontidão** | Avalia se o SGSI está pronto para o Stage 1 e o Stage 2 da certificadora (ISO 27001:2022 + 27701:2025). Usa a skill `prontidao-certificacao`. | **Não**: só lê |

A skill do roteiro 4 chega pelo próprio MCP (`niso_skill`), com referências e um
validador de achados. Não há nada para instalar.

### O que ele lê

Tudo o que você lê na interface, naquele projeto: controles e SoA, riscos,
ativos, evidências (o **texto** delas), políticas e versões, entrevistas por
trilha, respostas das fases, dossiê da jornada, ROPA, DPIA, fornecedores,
treinamento, auditorias, CAPA, governança, certificação, mudanças de escopo.
`niso_contexto` traz o mapa de caminhos.

Arquivo **binário** (PDF, planilha, imagem) ele não lê: recebe só o tamanho e o
tipo. Para o conteúdo, suba pela interface.

### O que ele grava

Com `niso_executar` ou com as ferramentas específicas (política, SoA, evidência
em texto, controle, ativo, risco, treinamento, entrevistas, governança e o resto
que você grava na interface). Evidência pelo agente é **só texto**: transcrever
um PDF não substitui o documento.

### O que pede o seu "sim"

Quatro ações. O agente deve **mostrar o que vai fazer** (nome e id) e esperar:

- apagar um registro;
- gerar políticas em lote;
- eliminar dados de um titular (LGPD);
- revogar aprovações de controle (a de ROPA e DPIA e a exclusão de análise crítica são só da interface).

O servidor recusa se o agente tentar sem a confirmação. E o seu cliente MCP ainda
pergunta antes de executar a chamada. **Não libere `niso_executar` de forma
permanente.**

### O que ele não faz

Usuários, SSO, política de segurança, chaves de API, webhooks, painel global,
área comercial, token de auditor, sua conta pessoal (login, termos,
notificações), criar projeto e **registrar achado de auditoria** (ISO 27001, 9.2:
quem implementa não audita). Para isso, use a interface.

---

## Uma pasta de trabalho por cliente

Crie uma pasta por cliente e coloque um `CLAUDE.md` nela. O agente o lê ao
começar. Este é um ponto de partida; troque os dados entre `<>`:

```markdown
# <Cliente> — adequação ISO conduzida pela ness.

Cliente: **<Cliente>** — projeto "<nome do projeto>" no n.iso
(`projectId` `<id>`). Eu sou o consultor designado (`<seu e-mail>`).
O servidor MCP `niso` é a fonte da verdade do SGSI.

## Como responder
- Direto. Resposta curta primeiro; detalhe só se eu pedir.
- Seja crítico: aponte lacuna, evidência fraca e premissa errada, inclusive minha.
- Não invente fato do cliente. O que não estiver no n.iso ou nesta pasta é
  "não sei — precisa confirmar com o cliente".
- Cite o controle (ex.: A.5.15) e a origem de cada afirmação.

## Proporcionalidade (o menor que atende o controle)
Antes de propor um documento: precisa existir? já existe? cabe em outro? o modelo
do n.iso resolve? Só então escreva, curto. Documento que ninguém lê é passivo de
auditoria.

## Como trabalhar no n.iso
1. Comece por `niso_contexto`.
2. Leitura antes de escrita (gap, rastreabilidade, audit pack).
3. Tudo que você gera é **rascunho**: mostre e espere meu "ok" antes de gravar.
4. Evidência pelo agente é só texto; binário sobe pela interface.
5. Apagar, gerar em lote, eliminar titular, revogar aprovação: mostre o que será
   feito e espere meu "sim" antes de enviar com `confirmado_pelo_usuario: true`.
6. Para ler qualquer área use `niso_ler`; o mapa está em `niso_contexto`.
7. Pré-avaliação de prontidão: `niso_skill nome=prontidao-certificacao`.

## Arquivos
- `rascunhos/` — minutas antes de irem ao n.iso.
- `entregas/` — o que vai ao cliente. Nome: `AAAA-MM-DD-assunto.ext`.
- Dados do cliente ficam nesta pasta; nada vai para repositório público nem
  para outro cliente.
```

---

## O que o cliente vê e controla

Na tela de **Governança** do projeto, o cartão **Agentes com acesso** lista cada
agente conectado: de quem é (o consultor), qual cliente MCP, desde quando, **último
uso** e até quando vale. O administrador do cliente, o `platform_admin` e o próprio
consultor dono do acesso podem **Revogar**; o acesso cai **na próxima chamada** do
agente.

O acesso também termina sozinho quando:

- a concessão chega a 30 dias;
- o consultor é **tirado da governança** do projeto;
- o consultor **troca a senha** (todas as concessões dele caem);
- a conta é desativada.

Quem vê o cartão: administrador do cliente, `platform_admin` e consultores. Um usuário comum do cliente não vê.

---

## Solução de problemas

| Sintoma | Causa provável e o que fazer |
|---|---|
| A ferramenta nova não aparece, ou `/mcp` não carregou | Reconecte: rode `/mcp` no Claude Code e reconecte o `niso`. O cliente guarda a lista de ferramentas da conexão anterior. |
| "refaça o login" / 401 | A concessão foi revogada, expirou (30 dias), você saiu da governança do projeto ou trocou a senha. Conecte de novo. |
| O "último uso" na tela parece parado | A tela mostra o momento em que foi carregada. Recarregue a página. |
| O agente leu, mas não há nada na trilha | A trilha registra **escrita**. Leitura não é registrada; o único sinal é o "último uso". |
| Não consigo editar ou excluir uma linha de consultor na Governança | É de propósito: designar consultor é do `platform_admin` ou do administrador do cliente, porque essa linha decide quem pode conectar um agente ao projeto. |
| Bloqueio ao conectar | 5 senhas erradas bloqueiam a conta por 15 minutos, no n.iso e na tela de conexão. Aguarde. |
| O agente diz que não leu um PDF | Binário não é lido. Suba pela interface. |
| Resposta "cortada em 100.000 caracteres" | Peça por item, ou por um caminho mais específico. |
| A pré-avaliação não grava nada | Correto: o roteiro 4 só lê. Os achados saem em arquivos CSV na sua pasta. |

---

## Para ir mais fundo

- [`arquitetura.md`](arquitetura.md): fluxo da conexão e de cada chamada, mapa de
  arquivos, dados, prazos, como estender.
- [`seguranca.md`](seguranca.md): contra quem o agente é desenhado, os invariantes
  e o que checar antes de um PR.
- [`../../mcp-server-niso/README.md`](../../mcp-server-niso/README.md): o servidor
  local (chave de API), para integrações e para o papel de auditor.
- [`../superpowers/specs/2026-09-30-agente-paridade-consultor-design.md`](../superpowers/specs/2026-09-30-agente-paridade-consultor-design.md):
  a decisão de dar ao agente o alcance do consultor, preso a um projeto.
