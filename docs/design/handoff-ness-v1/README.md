# Handoff: n.iso — shell, SoA e autenticação

## Overview

Pacote de implementação para o **n.iso** (SGSI ISO/IEC 27001:2022 e 27701, repo `resper1965/n.iso`). Cobre três frentes, nesta ordem de dependência:

1. **Shell da aplicação** — sidebar fixa/recolhível, banda de título fixa, menu de conta. É a casca reutilizável por toda a família de produtos ness. (`n.iso`, `n.priv`, `n.risk`).
2. **Tela de trabalho (SoA)** — lista com busca/facetas/filtros salvos, seleção em lote com desfazer, drawer de detalhe com edição, gate de aplicabilidade N/A e trilha de auditoria.
3. **Autenticação** — descoberta por domínio, senha ou SSO federado por tenant, MFA (TOTP), aceite de documentos legais versionados, expiração de sessão com preservação de rascunho.

Tudo em português (PT-BR primário), tema escuro, identidade ness.

## About the Design Files

Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar estes designs no ambiente já existente do n.iso**, seguindo seus padrões:

- **Backend**: Cloudflare Workers + Hono, D1, Zod — `src/routes/*.ts` por domínio.
- **Frontend**: Vite + **JavaScript sem framework** — `frontend/src/style.css`, `frontend/src/globals.js`, `frontend/src/ui.js`, `frontend/src/router.js`, `frontend/src/views/`.

Não introduza React, Tailwind ou biblioteca de componentes por causa deste handoff. O shell é uma função de render + CSS; os tokens são custom properties em `style.css`.

## Fidelity

**Mista, e a distinção importa:**

- `Prototipo SoA.dc.html` e `Prototipo Autenticacao.dc.html` são **hi-fi**: cores finais, tipografia, espaçamento, estados e interações reais (estado, validação, animação). Recrie com fidelidade — valores exatos estão em *Design Tokens*.
- `Shell.dc.html` é **hi-fi estrutural**: chrome final, área de conteúdo marcada como placeholder.
- `Wireframes GRC.dc.html` é **lo-fi** (35 telas, 8 turnos): estrutura, fluxo e regras. Use como guia de layout e conteúdo, aplicando os tokens hi-fi na implementação. O cartão **6a** deste arquivo é o **registro de decisões vigentes** — em caso de divergência entre telas, vale o 6a.

## Screens / Views

### 1. Shell (todas as telas autenticadas)

**Purpose**: moldura única do produto. Leitura vertical da coluna esquerda: produto → tenant → navegação → conta.

**Layout**
- Container `display:flex; min-height:100vh; align-items:stretch`.
- **Sidebar**: `flex:0 0 232px` expandida, `flex:0 0 72px` recolhida (a largura **precisa** vir do flex-basis; só `width` não vence o basis), `position:sticky; top:0; height:100vh; overflow:hidden`, `background:#162244`, `border-right:1px solid rgba(255,255,255,.10)`, transição `flex-basis 200ms cubic-bezier(.16,1,.3,1)`.
- A sidebar **não rola**. A `<nav>` é a região que encolhe (`flex:1; min-height:0; overflow:hidden`) para o rodapé de conta ficar sempre dentro da viewport.
- **Main**: `flex:1; min-width:0; display:flex; flex-direction:column`.

**Componentes**

| Componente | Especificação |
| --- | --- |
| Banda da marca | altura 64px, `padding:0 20px` (18px recolhida), `border-bottom:1px solid var(--line)`. Marca `n` + `.` em `#00ade8` + `iso`, Montserrat 500, 22px, `letter-spacing:-.015em`. Botão `«`/`»` 24×24 à direita, cor `--ink4`. Recolhida: mostra `n.` e o botão. |
| Seletor de tenant | `margin:12px`, altura **34px**, `padding:0 10px`, fundo `#1e2d52`, linha única: nome (Inter 500, 12.5px, `--ink`) + norma (mono 10px, `--ink3`) + caret `▾` (`--ink4`, 10px). **Não** exibir fase nem prazo aqui. Recolhida: quadrado 36px com as 2 primeiras letras em mono 10px. |
| Grupo de navegação | mono 500 9px, `letter-spacing:.16em`, uppercase, `--ink4`, `padding:14px 20px 8px`. Oculto quando recolhida. |
| Item de navegação | altura 32px, `padding:0 20px` (24px recolhida), gap 10px, Inter 400 13px, `--ink3`. Ativo: `--ink`, peso 500, `box-shadow:inset 2px 0 0 #00ade8`, ícone em `#00ade8`. Ícone **Lucide 16px, stroke-width 1.5**, `currentColor`, opacidade .5 (1 quando ativo). |
| Rodapé de conta | `margin-top:auto`, `margin-inline:20px`, `padding:14px 0 18px`, `border-top:1px solid var(--line)`. Tile 30×30 fundo `#1e2d52` com iniciais (mono 500 10px). Nome Inter 400 12px; papel · tenant em mono 500 9px uppercase `letter-spacing:.12em` `--ink3`. Caret `▴`. Clique abre o menu de conta. |
| Menu de conta | popover `position:absolute; left:12px; bottom:74px`, largura 236px, fundo `#162244`, borda `var(--line)`, `box-shadow:0 10px 15px -3px rgba(0,0,0,.5)`, `padding:12px`, gap 10px, animação `rise 180ms`. Conteúdo, nesta ordem: identidade (tile 32px + nome + e-mail mono 10px), hairline, **Tenant** (lista com check `#00ade8` no ativo + norma à direita), hairline, `Minha conta e MFA`, `Tema`, `Trilha da minha sessão`, hairline, `Encerrar sessão` em `#ef4444` com atalho `⇧⌘Q`, hairline, assinatura `ness.` + versão (`n.iso 4.2`). Fecha com `Esc` e clique fora. Ícones Lucide 11–12px. |
| Banda de título (header) | `position:sticky; top:0; z-index:4`, altura 64px, `padding:0 28px`, fundo `--paper`, `border-bottom:1px solid var(--line)`. `h1` Montserrat 600 20px `letter-spacing:-.02em`, `flex:1; min-width:0`. Ações à direita, altura 34px. |

**Regras do header (não negociáveis)**
- O título nomeia **a tela** (`Dashboard`, `SoA`, `Riscos`), nunca o cliente.
- Nada de subtítulo com dados de tenant/projeto na banda — contexto de tenant fica no seletor; contexto de registro (`A.8.12 · Tecnológico`, `Fase 14 de 41 · Bloco 3`) é a primeira linha **do conteúdo**, em mono 9px uppercase `letter-spacing:.14em`.

### 2. SoA — lista (`Prototipo SoA.dc.html`)

**Purpose**: trabalhar o catálogo de controles do Anexo A: filtrar, atribuir, atualizar status, exportar.

**Layout**: shell + barra de filtros (`padding:20px 28px 8px`, gap 14px) + tabela (`padding:0 28px 28px`).

**Componentes**
- **Busca**: `<label>` flex com ícone Lucide `search` 15px (`--ink4`), input sem borda (`border:0`, `border-bottom:1px solid var(--line)` no label), Inter 400 13px, altura 34px, placeholder `Buscar controle, dono ou justificativa…`; à direita a tecla `⌘K` em caixa mono 10px com borda. Filtra por código, nome e dono.
- **Facetas**: chips altura 30px, `padding:0 12px`, Inter 400 12px. Inativo: borda `var(--line)`, texto `--ink3`. Ativo: borda `#00ade8`, texto `#7fd6f6`, fundo `rgba(0,173,232,.12)`. Domínios (`Organizacional`, `Pessoas`, `Físico`, `Tecnológico`) e status (`Gap`, `Parcial`) acumulam.
- **Contador**: mono 500 10px uppercase `letter-spacing:.14em` `--ink3` — `25 de 57 exibidos · 57 controles`; ao lado, `limpar filtros` em `#00ade8` quando há filtro.
- **Linha de atalhos**: `j/k navega · x seleciona · shift+clique intervalo · enter abre · esc fecha`, mono 10px, cor `--ink3` (não `--ink4`: falha contraste).
- **Tabela**: `border-collapse:collapse`, Inter 400 13px. `th` **sticky** `top:64px; z-index:3`, fundo `--paper`, mono 500 9px uppercase `letter-spacing:.16em` `--ink4`, `padding:14px 10px 10px`, `border-bottom:1px solid var(--line)`, `aria-sort`. **A célula de selecionar-todos usa a mesma base sticky** (senão abre um buraco transparente no cabeçalho fixo). `td`: `padding:12px 10px` (7px na densidade compacta), `border-bottom:1px solid var(--line)`, `--ink2`; última linha sem régua. Colunas `Ctrl` (74px, mono 12px, `tabular-nums`), `Controle`, `Domínio` (116px), `Aplic.` (66px, direita), `CMMI` (62px, direita, `tabular-nums`), `Status` (118px), `Dono` (94px).
- **Ordenação**: clique no `th` ordena, segundo clique inverte. **Código ordena naturalmente por segmentos numéricos** (`A.5.7` antes de `A.5.15`, `A.8.2` antes de `A.8.11`) — comparação de string é defeito de conteúdo, porque a numeração do Anexo A é a ordem de leitura do auditor. As demais colunas desempatam por código.
- **Badges de status**: mono 500 10px uppercase `letter-spacing:.08em`, `padding:1px 8px`, **sem borda**, `background: color-mix(in oklab, <cor> 16%, transparent)`, texto na cor. `Implementado #10b981`, `Parcial #f59e0b`, `Gap #ef4444`, `N/A #94a3b8`.
- **Seleção**: checkbox 14×14 (borda `--ink4`; ativo preenchido `#00ade8`). Linha selecionada `background:rgba(0,173,232,.07)`; linha sob o cursor de teclado `background:#1e2d52` + `inset 2px 0 0 #00ade8`. `Shift+clique` seleciona intervalo.
- **Barra de lote** (aparece só com seleção): `position:fixed; left:50%; bottom:28px; transform:translateX(-50%)`, fundo `#162244`, borda `var(--line)`, `box-shadow:0 10px 15px -3px rgba(0,0,0,.4)`, animação `rise 200ms`. Conteúdo: contagem, `Atribuir dono`, `Marcar implementado` (primário), `Marcar N/A` **desabilitado** com `title` explicando que justificativa é individual, e `✕`. Deve poder quebrar linha (`flex-wrap:wrap`) para não cortar o `✕`.
- **Paginação**: 25 por página, `Carregar mais 25 · N restantes` centralizado entre hairlines. **Paginação explícita, não rolagem infinita** — na SoA o usuário precisa saber onde está no catálogo.
- **Faixa de bloqueio** (quando há N/A sem justificativa): `background:rgba(239,68,68,.10)`, `border-left:2px solid #ef4444`, texto + botão `Ver controles` (filtra status N/A).
- **Exportar SoA**: primário `#00ade8` com texto `#04121c`. **Desabilitado** (`cursor:not-allowed`, borda neutra) enquanto existir controle N/A sem justificativa; `title` diz o motivo. Quando liberado, o `title` informa o recorte: `Exporta o recorte atual (N controles)`.

### 3. SoA — drawer de detalhe

**Layout**: overlay `position:fixed; inset:0; z-index:9`; backdrop `rgba(3,7,18,.55)`; painel `width:min(460px,92vw)`, fundo `#162244`, `border-left:1px solid var(--line)`, animação `slidein 220ms cubic-bezier(.16,1,.3,1)`, `overflow:auto`. Cabeçalho sticky com kicker (`A.8.12 · Tecnológico`), título Montserrat 600 17px e `✕`.

**Seções, nesta ordem**
1. **Aplicabilidade** — chips `Aplicável` / `N/A · exige justificativa`.
2. **Bloco de justificativa de exclusão** (ao escolher N/A): fundo `rgba(245,158,11,.08)`, `border-left:2px solid #f59e0b`; textarea mín. 76px; contador `N/40 caracteres mínimos` (âmbar abaixo do mínimo); `Cancelar` e `Confirmar N/A` — este **desabilitado com menos de 40 caracteres**.
3. **Status de implementação** — chips `Implementado/Parcial/Gap`. `N/A` **não** é opção de status: vem da aplicabilidade.
4. **Responsável** e **Maturidade CMMI (0–5)**.
5. **Justificativa de aplicabilidade** — texto explicativo; para N/A **não reimprime** a justificativa de exclusão, apenas informa o estado (registrada e versionada, ou pendente).
6. **Evidências** — arquivo, hash abreviado (`41be…0c93`), badge de status. Vazio: `Sem evidência anexada. Este controle não passa na auditoria sem prova.`
7. **Histórico** — trilha do controle: `campo: antes → depois`, autor, quando (`há 12 dias`), marcador de lote (`em lote (3 controles)`); rótulo `Histórico · N` com a nota `imutável · exportável no relatório de auditoria`.
8. **Barra de gravação** sticky no pé do drawer (ver *State Management*).

**Regras de integridade (validar no backend, não só na tela)**
- Controle **N/A** tem status, dono e CMMI **travados**; confirmar N/A limpa CMMI e dono.
- `applic = 0` e `na_why` são inseparáveis; exportação recusa SoA com exclusão sem justificativa.
- Aplicabilidade **nunca** é editável em lote.

### 4. Autenticação (`Prototipo Autenticacao.dc.html`)

Cartão centralizado `width:min(420px,100%)`, fundo `#162244`, borda `var(--line)`, `padding:28px 32px 24px`, gap 16px, animação `rise 220ms`. Rodapé com hairline: assinatura `ness.` (Montserrat 500 13px, ponto `#00ade8`) + `privacidade · termos · n.iso 4.2` em mono 10px. **A assinatura ness. é obrigatória na autenticação** — é onde o usuário decide confiar antes de entregar credencial.

**Passos**
1. **E-mail** — o domínio decide o caminho: conta local (senha), tenant federado (SSO) ou **sem convite** (`Não há convite ativo para este e-mail. Peça acesso ao consultor responsável pelo projeto — não existe cadastro aberto.`). Não existe cadastro aberto.
2. **Senha** — erro **genérico** (`E-mail ou senha incorretos. Restam N tentativas antes do bloqueio temporário.`): nunca dizer qual campo errou (enumeração de usuário). Campo com borda `#ef4444` no erro, animação `shake 260ms`.
3. **Verificação anti-abuso** — invisível no caminho normal; **desafio visível só a partir da 2ª falha**, com `Entrar` desabilitado até resolver. **Sem marca do fornecedor na interface** (implementação: Cloudflare Turnstile).
4. **Bloqueio** — na 5ª falha, 15 minutos, com o evento `auth.lockout` (conta + IP) registrado na trilha do tenant.
5. **SSO federado** — o campo de senha **não aparece**; a tela declara que senha e MFA ficam no provedor de identidade do cliente e que o n.iso recebe apenas os grupos que definem o papel. Texto neutro (`provedor de identidade da Acme`), sem nome de produto.
6. **MFA** — TOTP, campo único de 6 dígitos (mono 24px, `letter-spacing:.5em`, centralizado) que valida ao completar; contador `expira em Ns` (âmbar ≤10s); `Código de recuperação` como alternativa. **Sem SMS.** Em tenant federado, o segundo fator é do provedor.
7. **Aceite** — duas caixas (Termos v2.4, Privacidade v3.1); `Aceitar e entrar` só habilita com ambas; `Recusar e sair` existe; registro com data e IP.
8. **Expiração** — reautentica **na mesma tela** preservando o rascunho (`A.8.12 · 2 alterações não salvas — status, dono`). Conta local: campo de senha. **Sessão federada: não pede senha** (não existe senha para pedir) — botão `Reautenticar no <tenant>`.
9. **Pós-login** — trilha da sessão montada no percurso (descoberta, senha, MFA, aceite, federação), com badges por tipo; `Encerrar sessão` muda para `Encerrar sessão (federada)` quando aplicável.

**Parâmetros decididos**
- Inatividade: **30 min** para papel Cliente; **8 h com revalidação diária** para consultor.
- Aviso prévio de troca de subprocessador: **30 dias**.
- Nova versão de documento legal: **faixa** para mudança comum; **bloqueia o acesso até o aceite** quando altera base legal ou retenção — a classificação é **campo do documento**, não julgamento de quem publica.

### 5. Estados obrigatórios (toda tela de dados)

| Estado | Tratamento |
| --- | --- |
| Vazio de busca | ícone, título, uma linha de orientação e botão `Limpar filtros`. |
| Vazio de domínio | próxima ação, não desenho triste (ex.: `Importar do assessment` / `+ Novo risco`). |
| Carregando | **skeleton nas linhas**, não spinner: barras `height:8px; background:#1e2d52`, animação `pulse 1400ms ease-in-out infinite`, com as colunas já dimensionadas para a tabela não pular. Linha de status: `carregando controles de <tenant>…`. |
| Erro | `background:rgba(239,68,68,.10)`, `border-left:2px solid #ef4444`, título, explicação de que nada foi gravado, **código de request** (`req 4f2a-91c · 16:38 BRT`), `Copiar código` e `Tentar de novo`. Filtros e seleção preservados. |
| Sem permissão | fundo `#162244`, `border-left:2px solid --ink4`; explica o papel e o que ele vê; `Solicitar acesso`. A rota existe, o item **não aparece** no menu. |

## Interactions & Behavior

- **Teclado (SoA)**: `⌘K`/`Ctrl+K` ou `/` foca a busca; `j`/`k` (e setas) movem o cursor de linha; `Enter` abre o drawer; `x` seleciona a linha; `a` alterna tudo; `Esc` fecha, em cascata: menu de conta → drawer → seleção → campo. `Shift+clique` seleciona intervalo. Listener em `document`, removido no unmount.
- **Acessibilidade**: `aria-sort` nas colunas; **região `role="status" aria-live="polite"` sempre montada** (vazia) recebendo o texto do toast — criar a região junto da mensagem não anuncia nada; `aria-label` em busca, checkboxes e botões só-ícone; `:focus-visible { outline:2px solid #00ade8; outline-offset:2px }`; `@media (prefers-reduced-motion: reduce)` zera transições.
- **Animações**: `rise` (translateY 8–10px + fade, 180–200ms), `slidein` (translateX 16px, 220ms), `fadein` (160–180ms), `shake` (260ms) no erro de credencial, `pulse` no skeleton. Easing padrão `cubic-bezier(.16,1,.3,1)`; nada acima de 400ms.
- **Toast + desfazer**: toast `position:fixed; left:28px; bottom:28px`, fundo `#1e2d52`, `border-left:2px solid #00ade8`, com ação `Desfazer` e auto-dismiss em **4200ms**. Toda ação em lote e toda edição imediata gera toast com desfazer.
- **Contraste**: texto pequeno mínimo 4.5:1. `--ink4` foi calibrado para `#8fa0b6` justamente por isso — não use `#64748b` para texto.

## State Management

**Modo de gravação** (regra de produto, não de tela):
- **Imediato + Desfazer** em listas e campos simples — a alteração grava na hora e entra na trilha; desfazer é janela curta antes do commit definitivo.
- **Rascunho com barra fixa** apenas em documento longo (política, DPIA/RIPD, questionário de assessment) e, se desejado, no drawer do controle. A barra mostra `N alterações não salvas · status, dono` com **rótulos em português** (nunca as chaves internas), `Descartar` e `Salvar N alterações`; fechar com pendência pede confirmação (`Descartar N alterações não salvas?` / `Continuar editando`). Flexão de plural pela palavra inteira (`alteração`/`alterações`), não por sufixo.

**Estado da lista**: `ctrls[]`, `query`, `domains[]`, `statuses[]`, `sort`, `dir`, `page`, `sel[]`, `detail`, `draft{}`, `dense`, `cursor`, `phase` (`ready|loading|error|denied`), `toast`, `undo`, `log[]`.

**Trilha de auditoria (`log`)**: append-only, uma entrada por campo alterado, com `autor`, `timestamp`, `campo`, `valor_anterior`, `valor_novo` e `id_da_operação` (agrupa lote). `null` de CMMI renderiza `—`, nunca `CMMI null`. Desfazer reverte dado **e** entrada — é a única coisa que legitimamente apaga histórico, por isso deve ser janela pré-commit.

**Dados / endpoints já existentes no repo**
| Tela | Arquivos |
| --- | --- |
| SoA lista/detalhe | `src/routes/controls.ts`, `src/services/soa-logic.ts` |
| Trilha | `src/trilha.ts` |
| Autenticação | `src/routes/auth.ts`, `src/auth-policy.ts`, `src/middleware/auth.ts` |
| MFA | `src/routes/mfa.ts`, `src/services/totp.ts` |
| SSO / SCIM | `src/sso.ts`, `src/routes/scim.ts`, `src/politica-tenant.ts` |
| Evidências | `src/routes/evidence.ts` |
| Riscos / ROPA / Políticas | `src/routes/risks.ts`, `src/routes/ropa.ts`, `src/routes/policies.ts` |
| Usuários e papéis | `src/routes/users.ts` |

**Lacunas identificadas no código (implementar)**
1. Gate de N/A: validação servidor-side de `applic`+`na_why` e recusa na geração da SoA.
2. Janela de desfazer antes do commit (hoje a trilha não tem esse conceito).
3. Logout federado (RP-initiated / SLO) encerrando de fato no provedor.
4. Marcação de papéis gerenciados por IdP, bloqueando edição local (senão o próximo sync SCIM sobrescreve).
5. Classificação `comum | material` nas versões de documentos legais, que decide faixa vs bloqueio.

## Design Tokens

```css
:root{
  /* Marca */
  --bd:#00ade8;            /* BlueDot — accent único; o ponto da marca nunca muda de cor */
  --bd-hover:#008ebf;
  --bd-active:#007aa3;

  /* Superfícies (tema escuro) */
  --paper:#0b1326;         /* ground da página e do header */
  --surf:#162244;          /* sidebar, cards, popovers, drawer */
  --surf2:#1e2d52;         /* hovers, tiles, skeleton, toast */
  --line:rgba(255,255,255,.10);

  /* Tinta */
  --ink:#f1f5f9;
  --ink2:#cbd5e1;
  --ink3:#94a3b8;
  --ink4:#8fa0b6;          /* mínimo para texto pequeno: 5.85:1 sobre --surf */

  /* Semânticos */
  --ok:#10b981; --warn:#f59e0b; --bad:#ef4444; --info:#00ade8;

  /* Tipografia */
  --h:"Montserrat",system-ui,sans-serif;   /* títulos e marcas: 500 marca, 600 títulos */
  --b:"Inter",system-ui,sans-serif;        /* corpo */
  --m:"JetBrains Mono",ui-monospace,monospace; /* microcopy técnica, hashes, atalhos */

  /* Elevação */
  --shadow-md:0 4px 6px -1px rgba(0,0,0,.07),0 2px 4px -2px rgba(0,0,0,.05);
  --shadow-lg:0 10px 15px -3px rgba(0,0,0,.45),0 4px 6px -4px rgba(0,0,0,.3);

  /* Motion */
  --ease-out:cubic-bezier(.16,1,.3,1);
  --fast:150ms; --normal:200ms; --slow:300ms;
}
```

**Escala de espaço**: múltiplos de 4/8 — 4, 8, 10, 12, 14, 16, 20, 24, 28, 32.
**Alturas**: banda de marca e header **64px**; botões e chips **34px** (30px em barra de lote); item de nav **32px**; linha de tabela 12px de padding vertical (7px compacta).
**Raio**: **0** em tudo (quadrado é do sistema Industry). **Sem gradiente**, sem sombra sobre a marca.
**Tipografia**: marca Montserrat **500** caixa baixa `-.01em`; `h1` 600/20px `-.02em`; título de drawer 600/17px; corpo Inter 400 12.5–13px; microcopy mono 9–11px com `letter-spacing:.12–.16em` quando uppercase.

**Marcas**: produto `n.iso` (ponto interno em BlueDot, caixa baixa; família: `n.priv`, `n.risk`, `n.audit`). Casa `ness.` **apenas** na autenticação e no menu de conta — **nunca** na área de trabalho. Nenhum nome de fornecedor de infraestrutura na interface.

## Assets

- **Ícones**: [Lucide](https://lucide.dev) inline, `stroke-width:1.5`, 11–16px, `currentColor` — `layout-dashboard`, `route`, `list-checks`, `triangle-alert`, `file-check`, `file-text`, `users`, `database`, `shield-alert`, `server`, `landmark`, `clipboard-check`, `bookmark`, `search`, `check`, `building`, `key-round`, `moon`, `history`, `log-out`. Em lista de registros com estado (fases, RIPDs, sub-navegação de controles) use **ponto** (8px, circular), não ícone: ali o glifo informa progresso, não categoria.
- **Fontes**: Montserrat 500/600, Inter 300–600, JetBrains Mono 400/500 (Google Fonts).
- **Favicon**: BlueDot puro — círculo `#00ade8`, sem texto. `theme-color: #00ade8`.
- Nenhuma imagem ou ilustração é usada. Placeholders de gráfico nos wireframes são intencionais: gráficos a definir com dados reais.

## Files

| Arquivo | O que é |
| --- | --- |
| `Wireframes GRC.dc.html` | Kit lo-fi: 8 turnos, ~35 telas. **Comece pelo cartão 6a** (decisões vigentes + índice) e 7/8 (autenticação e legal). |
| `Prototipo SoA.dc.html` | Hi-fi interativo: lista, facetas, lote, drawer, gate de N/A, trilha, estados. |
| `Prototipo Autenticacao.dc.html` | Hi-fi interativo: fluxo de entrada completo. |
| `Shell.dc.html` | Shell parametrizado por props — referência estrutural do chrome. |
| `ds/industry-ness.css` | Tokens ness. sobre o sistema Industry, com as regras anotadas. |
| `github.md` | Associação com o repo, stack observada e mapa tela → arquivos. |

Abra os `.dc.html` diretamente no navegador. Os protótipos hi-fi respondem a teclado e mouse — vale percorrê-los antes de implementar.
