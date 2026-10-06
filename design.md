# Design do n.iso — identidade ness. aplicada ao produto

Princípios visuais do produto. **Valores de cor, fonte e métrica não ficam aqui**: a fonte única
é o bloco `:root` de [`frontend/src/style.css`](frontend/src/style.css). A versão anterior deste
arquivo copiava os valores (`#070b14`, glassmorphism, "nunca peso 600") e envelheceu sem
ninguém ver; a landing antiga seguiu a cópia e saiu da marca.

O pacote de handoff visual (protótipos navegáveis) está em
[`docs/design/handoff-ness-v1/`](docs/design/handoff-ness-v1/).

## Nome

- Marca: `ness.` — sempre minúsculo, com ponto. Nunca "Ness", "NESS" ou "Ness.".
- Produto: `n.iso`, com o ponto em accent, como a marca.
- Identificadores de código (`niso`, `NISO_*`, o cabeçalho `X-nISO-Signature`) não são texto
  visível e não mudam.

## Tokens (em `frontend/src/style.css`, `:root`)

| Grupo | Tokens |
|---|---|
| Marca | `--accent`, `--accent-hover`, `--accent-active`, `--accent-dim`, `--accent-ink` |
| Superfícies | `--bg` (fundo da página e do header), `--surface` (sidebar, cards), `--surface-2`, `--border` |
| Tinta | `--text`, `--text-2`, `--text-dim`, `--text-faint` (contraste medido no comentário de cada um) |
| Semânticos | `--success`, `--warning`, `--danger`, `--info` |
| Tipografia | `--font-head` (Montserrat), `--font-body` (Inter), `--font-mono` |
| Geometria | `--radius: 0` — o sistema é quadrado |
| Shell | `--hdr-h` (altura do header e da banda da marca), `--side-w`, `--side-w-rail` |

Para ver os valores: `sed -n '/^:root/,/^}/p' frontend/src/style.css`.

## Regras

- Um tema só, o escuro. Sem alternância de tema.
- Tipografia: Inter no corpo; Montserrat 500 na marca e 600 em títulos.
- Accent só em elemento interativo e foco; nunca como fundo de área.
- Sem itálico, sem emoji, sem ícone decorativo.
- Sem blur e sem gradiente na elevação (`--glass-blur: none`).
- Inputs e botões com `border-radius: 10px` (`.form-input`, `.btn`).
- Login: tela dividida, marca à esquerda e cartão à direita; empilha abaixo de 900px.

## Utilitários de tela (`frontend/src/ui.js`)

Toda tela usa os mesmos quatro, expostos em `window`:

- `renderPageHeader(title, subtitle, actionsHtml)` — cabeçalho da tela.
- `renderStatCards(statsArray)` — faixa de indicadores.
- `renderStatusBadge(type, text)` — selo de status (`success`, `warning`, `danger`, `info`, `neutral`).
- `renderDataTable(columns, rows, options)` — tabela com estado vazio (`emptyMessage`).

Eventos por `data-action` (delegação); nada de handler inline nem `<script>` inline, que o CSP
(`script-src 'self'`) recusa.
