# Patch de interface — nISO (`frontend/`)

Mapa do que muda, arquivo por arquivo, com o valor exato. Lido junto do `README.md` do pacote. Nada aqui exige framework novo: é CSS e função de render.

## 1. `frontend/src/style.css`

**Substitua o `:root` das linhas 1–21** pelo conteúdo de `implementacao/tokens-ness.css`. Ele mantém os nomes que o código já usa (`--bg`, `--text`, `--text-dim`, `--surface`, `--border`, `--accent`) para não quebrar as ~480 referências existentes.

Divergências que o patch corrige, e o motivo:

| Hoje no código | Vira | Motivo |
| --- | --- | --- |
| `--bg: #070b14` | `#0b1326` | Ground do guia ness.; cards em `#162244` se separam sem `backdrop-filter`. |
| `--text-dim: rgba(229,235,255,.6)` | `#94a3b8` (e `#8fa0b6` como mínimo) | Alpha sobre card dava ≈3.4:1 — abaixo de 4.5:1 para texto pequeno. |
| `#34c759 / #ffcc00 / #ff3b30` (iOS) | `#10b981 / #f59e0b / #ef4444` | Paleta semântica do guia ness. |
| `border-radius: 8–12px` | `0` | O sistema é quadrado (Industry). |
| `.sidebar-nav.active` com `linear-gradient` | `inset 2px 0 0 var(--accent)` | Sem gradiente; ativo marcado por barra + ícone ciano. |
| `backdrop-filter: var(--glass-blur)` | `none` | Vidro não faz parte da identidade e custa desempenho em tabela longa. |
| `.sidebar` 260px / collapsed 80px | **232px / 72px** | Métrica do shell. |
| `.sidebar-logo` 56px | **64px** | A banda da marca e a banda de título têm de fechar na **mesma** hairline. |

## 2. `frontend/src/ui.js`

### `renderPageHeader(title, subtitle, actionsHtml)`
- **Remova o `subtitle` da banda fixa.** Decisão registrada: o título nomeia a tela (`SoA`, `Riscos`, `Dashboard`), nunca o cliente, e metadados de tenant/projeto não vivem no header. Mantenha a assinatura da função por compatibilidade, mas renderize o `subtitle` como **primeira linha do conteúdo**, em mono 9px uppercase `letter-spacing:.14em` cor `--text-dim` — ou descarte na chamada.
- Título: `font-family: var(--font-head); font-weight: 600; font-size: 20px; letter-spacing: -.02em` (hoje é 700/1.5rem/-0.5px).
- A banda vira **sticky**: `position: sticky; top: 0; z-index: 4; height: var(--hdr-h); display:flex; align-items:center; gap:16px; padding:0 28px; background: var(--bg); border-bottom: 1px solid var(--border)`.

### `renderStatusBadge(...)`
- Tire a borda e troque o fundo alpha fixo por `color-mix`:
  `background: color-mix(in oklab, <cor> 16%, transparent); color: <cor>; border: 0; border-radius: 0; font: 500 10px/1.7 var(--font-mono); text-transform: uppercase; letter-spacing: .08em; padding: 1px 8px`.
- Cores por tipo: `success #10b981`, `warning #f59e0b`, `danger #ef4444`, `info #00ade8`, `neutral #94a3b8`.
- `STATUS_DICT` e `traduzStatus` permanecem — o dicionário PT-BR já está correto. Acrescente `'na': 'N/A'` se o backend passar a gravar esse valor.

### `renderDataTable(columns, rows, options)`
- `th`: `position: sticky; top: var(--hdr-h); z-index: 3; background: var(--bg)`; `font: 500 9px/1 var(--font-mono)`; `letter-spacing:.16em`; `padding: 14px 10px 10px`; `border-bottom: 1px solid var(--border)`; adicione `aria-sort` quando a coluna for ordenável. **Se houver coluna de seleção, ela recebe a mesma base sticky** (sem isso o cabeçalho fixo abre um buraco transparente e perde o checkbox).
- `td`: `padding: 12px 10px` (7px no modo compacto), `border-bottom: 1px solid var(--border)`, `color: var(--text-2)`; última linha sem régua (`tr:last-child td { border-bottom: 0 }`).
- Colunas numéricas (`CMMI`, `Aplic.`, contagens): `text-align: right; font-variant-numeric: tabular-nums`. Códigos de controle também tabulares.
- Remova `onmouseenter/onmouseleave` inline: o hover é CSS (`tr:hover { background: rgba(255,255,255,.02) }`), e o projeto já migrou para delegação de eventos (`initDelegation`).
- Container sem raio, sem blur: `border: 1px solid var(--border)`.

### `showToast(message, type)`
- Duração **4200ms** (hoje 3000ms) e **ação de desfazer**: aceite um terceiro parâmetro `onUndo`; havendo callback, renderize um botão `Desfazer` em `var(--accent)` dentro do toast. Toda edição imediata e toda ação em lote passam por aqui.
- Posição `left: 28px; bottom: 28px` (hoje `right`), `border-left: 2px solid var(--accent)`, sem raio, sem blur.
- **Região de anúncio permanente**: crie uma única `<div role="status" aria-live="polite">` vazia e visualmente oculta no `index.html` e escreva a mensagem nela. Criar a região junto do texto (como hoje, `document.createElement` + append) não é anunciado por leitor de tela.

## 3. `frontend/src/globals.js` — shell

O shell já existe aqui (`toggleSidebar`, `updateSidebarProjectSelector`, `sidebar-user-card`). Ajustes:

- **Seletor de tenant**: uma linha de **34px** — nome + norma + caret. Nada de fase, percentual ou contagem de auditoria nesse bloco; esse contexto pertence à Jornada e ao Dashboard.
- **Rodapé de conta**: hoje há `sidebar-user-logout` como botão solto. Troque por **menu de conta** aberto pelo card: identidade (nome + e-mail), troca de tenant com check ciano, `Minha conta e MFA`, `Tema`, `Trilha da minha sessão`, `Encerrar sessão` em `--danger` com `⇧⌘Q`, e o rodapé com a assinatura `ness.` + versão. Fecha com `Esc` e clique fora.
- **Recolhida (72px)**: só ícones, com `title` no item; `.sidebar-label` oculto; tenant vira quadrado com duas letras.
- **Ícones**: Lucide `stroke-width: 1.5` (o CSS atual usa 1.6 — alinhe), 16px, `currentColor`, opacidade .5, e `--accent` no item ativo. Em listas de registros com estado (fases, RIPDs, sub-navegação de controles) use **ponto** de 8px, não ícone.
- A sidebar **não rola**: `height: 100vh; overflow: hidden`, e a lista de navegação (`.sidebar-nav-list`) é a região que encolhe (`flex: 1; min-height: 0`), para o card de conta nunca sair da viewport.

## 4. `frontend/src/views/compliance.js` — SoA

A tela já tem busca, filtros `Aplicáveis / Não Aplicáveis / Gaps / Aprovados`, maturidade e badges de rastreio. O que falta, em ordem de valor:

1. **Gate de N/A** — marcar N/A abre justificativa obrigatória (mín. 40 caracteres, com contador); `Confirmar N/A` desabilitado até lá; ao confirmar, **limpa CMMI e dono** e trava status. Controle N/A sem justificativa produz faixa vermelha no topo da lista e **desabilita `Exportar SoA`**, com o motivo no `title`.
2. **Seleção em lote** com barra flutuante: `Atribuir dono`, `Marcar implementado`, `Marcar N/A` **desabilitado** (justificativa é individual) e fechar. Toda ação em lote gera toast com `Desfazer`.
3. **Ordenação natural do código** — `A.5.7` antes de `A.5.15`, `A.8.2` antes de `A.8.11`: compare segmentos numéricos, não string. A numeração do Anexo A é a ordem de leitura do auditor e também a ordem do relatório exportado.
4. **Teclado** — `⌘K` / `/` foca a busca; `j`/`k` movem o cursor de linha; `Enter` abre o detalhe; `x` seleciona; `a` alterna tudo; `Esc` fecha em cascata; `Shift+clique` seleciona intervalo.
5. **Histórico no detalhe** — `campo: antes → depois`, autor, quando, marcador de lote. `src/trilha.ts` já registra; falta exibir.
6. **Estados** — skeleton nas linhas (não spinner) com as colunas já dimensionadas; erro com código de request e `Tentar de novo`, preservando filtros; sem permissão explicando o papel.
7. **Paginação explícita** de 25 (`Carregar mais 25 · N restantes`), não rolagem infinita.

## 5. Backend — validações que a interface pressupõe

| Onde | O que |
| --- | --- |
| `src/services/soa-logic.ts` | `applic = 0` exige `na_why` não vazio; recusar geração da SoA se houver exclusão sem justificativa. |
| `src/routes/controls.ts` | Rejeitar alteração de aplicabilidade em lote; ao marcar N/A, zerar `cmmi` e `owner`. |
| `src/trilha.ts` | Log append-only por campo: `autor`, `timestamp`, `campo`, `valor_anterior`, `valor_novo`, `id_da_operação` (agrupa lote). Desfazer é janela **pré-commit**, nunca delete no log. |
| `src/sso.ts` | Logout federado (RP-initiated / SLO): sem ele, "Encerrar sessão" não encerra nada — é achado de auditoria. |
| `src/routes/users.ts` + `src/routes/scim.ts` | Marcar papéis vindos de grupos do IdP como gerenciados externamente e bloquear edição local (o próximo sync sobrescreveria). |
| `src/routes/public.ts` | Versões de documento legal com classificação `comum | material`: material bloqueia o acesso até o aceite; comum apenas avisa. |
| `src/routes/auth.ts` | Erro de credencial genérico (nunca dizer qual campo errou); desafio anti-abuso a partir da 2ª falha; bloqueio de 15 min na 5ª, com evento `auth.lockout` na trilha; inatividade de 30 min (Cliente) e 8 h com revalidação diária (consultor). |
