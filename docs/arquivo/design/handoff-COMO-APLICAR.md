# Como aplicar (com Claude Code)

## Passo a passo

1. Baixe e descompacte este pacote.
2. Copie a pasta para dentro do repo, por exemplo `niso-handoff-v1/` na raiz de `nISO`, e comite (ou deixe fora do git, como preferir — o importante é o Claude Code poder ler).
3. Abra o Claude Code na raiz do repo.
4. Cole o prompt abaixo.

## Prompt para o Claude Code

```
Leia niso-handoff-v1/README.md e niso-handoff-v1/implementacao/PATCH-ui.md.

São referências de design em HTML (protótipos) — não copie o HTML para produção.
Recrie no ambiente já existente deste repo: Vite + JavaScript sem framework em
frontend/src (style.css, globals.js, ui.js, router.js, views/), backend Hono em
src/routes. Não introduza React, Tailwind nem biblioteca de componentes.

Trabalhe em etapas, uma por commit, e pare para eu revisar entre elas:

ETAPA 1 — tokens
Substitua o bloco :root de frontend/src/style.css pelo conteúdo de
niso-handoff-v1/implementacao/tokens-ness.css. Rode os testes
(npm --prefix frontend test) e me mostre um diff resumido do que mudou
visualmente. Não altere layout nesta etapa.

ETAPA 2 — shell
Aplique no shell (globals.js + style.css) as métricas e o comportamento do
PATCH-ui.md seção 3: bandas de 64px iguais, sidebar 232/72px que não rola,
seletor de tenant em uma linha, menu de conta substituindo o botão de logout
solto, ícones Lucide stroke 1.5.

ETAPA 3 — primitivas de ui.js
PATCH-ui.md seção 2: renderPageHeader sem subtítulo na banda, renderStatusBadge
sem borda com color-mix, renderDataTable com cabeçalho sticky e colunas
numéricas tabulares, showToast com Desfazer e região aria-live permanente.
Atualize os testes existentes em frontend/test/ui.test.js.

ETAPA 4 — SoA
PATCH-ui.md seção 4, na ordem listada. O item 1 (gate de N/A) é o mais
importante: é requisito da norma, não estética.

ETAPA 5 — backend
PATCH-ui.md seção 5. Comece pela validação de applic + na_why em
src/services/soa-logic.ts e pela recusa na exportação; escreva teste para cada
regra.

Regras que valem para tudo:
- Português (PT-BR) na interface; sem nome de fornecedor de infraestrutura na UI.
- Texto pequeno com contraste mínimo 4.5:1.
- Todo interativo com :focus-visible; respeitar prefers-reduced-motion.
- Sem raio, sem gradiente, sem backdrop-filter.
- Em caso de divergência entre telas do wireframe, vale o cartão 6a
  (registro de decisões) de niso-handoff-v1/Wireframes GRC.dc.html.
```

## O que revisar em cada etapa

- **1** — nada deve quebrar de layout; só cor, tipo e contraste mudam.
- **2** — as duas bandas fixas (marca e título) fecham na mesma linha; o card de conta nunca sai da viewport, mesmo em tela baixa.
- **3** — cabeçalho de tabela fixo sem buraco na coluna de seleção; toast anunciado por leitor de tela.
- **4** — não é possível deixar um controle N/A sem justificativa, nem exportar a SoA nesse estado.
- **5** — as regras valem no servidor, não só na tela.

## Screenshots

`screenshots/` traz as três telas hi-fi renderizadas (shell, SoA, autenticação). Servem de referência rápida, mas **os protótipos `.dc.html` são a fonte**: abra-os no navegador e percorra com mouse e teclado antes de implementar — metade das decisões só aparece em interação (desfazer, escalonamento do desafio anti-abuso, travas do N/A, cascata do `Esc`).
