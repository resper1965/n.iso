# ness. Brand Guidelines

Este documento centraliza as diretrizes visuais e de comunicação da **ness.** para garantir consistência extrema e proteção do DNA da marca em todas as interfaces.

## 1. Identidade Nominal
- **Grafia Oficial:** Sempre escrita em caixa baixa e com um ponto final (`ness.`).
- Nunca escreva "Ness.", "NESS", ou "Ness".

## 2. Paleta de Cores (Apple / Pro Max Style)
A paleta baseia-se em alto contraste (Dark Mode nativo) com o "Azul ness." servindo exclusivamente como cor de destaque e interatividade.
- **Background Principal (Dark):** `#070b14`
- **ness. Blue (Destaque):** `#00ade8`
- **Texto Principal:** `#f5f5f7` (Branco Suave / Off-white)
- **Texto Secundário (Subtitle):** `#e5ebff` (Com opacidade 60%)
- **Superfícies (Glassmorphism):** `rgba(255, 255, 255, 0.03)` com `backdrop-filter: blur(24px)` e bordas de `rgba(255, 255, 255, 0.08)`.

## 3. Tipografia
- **Proibição Absoluta:** É estritamente **proibido o uso de itálicos** em qualquer circunstância.
- **Títulos (Headings):** `Montserrat`
  - Sempre utilizada no peso **Médio (500)** ou **Bold (700)** (apenas para o Logo). Nunca usar peso 600 (Semi-bold).
  - Títulos em H1 devem ser em letras minúsculas (lowercase).
  - Títulos em H2 e H3 devem usar Capitalização normal (Sentence case ou Title case sutil).
- **Corpo de Texto (Body):** `Inter`
  - Usada em pesos `300` (Light) e `400` (Regular).
  - Mantém a legibilidade em alta densidade de dados e interfaces de sistema.

## 4. UI/UX "Apple Style"
- **Minimalismo e Espaço:** Evitar longas listas verticais (scroll infinito). Usar CSS Grids e colunas para condensar informações, como no Formulário Discovery.
- **Squircles:** Bordas arredondadas generosas para containers principais (`border-radius: 24px` e `16px`), botões e inputs (`10px`).
- **Sombras (Soft Shadows):** Uso de sombras suaves e extensas (`box-shadow: 0 30px 60px -15px rgba(0,0,0,0.6)`) com luz interna sutil (`inset 0 1px 0 rgba(255,255,255,0.1)`).
- **Controles Premium:** Substituição de Radio Buttons e Checkboxes padrão por **Cards Selecionáveis** (Segmented Controls) ou botões de preenchimento suave no hover.

## 5. Layout Enterprise Grade (Regra Primária para Portais Internos)

O layout dos portais autenticados (Admin, Cliente) segue o padrão **Enterprise Dashboard**, não o estilo Apple centrado. As seguintes regras são inegociáveis:

- **Proibido:** `glass-container` centralizado como único elemento de página em dashboards autenticados.
- **Top Nav Bar obrigatório:** Toda tela autenticada deve ter uma barra de navegação horizontal (`height: 56px`, `position: sticky`, `top: 0`, `border-bottom: 1px solid rgba(255,255,255,0.07)`, `backdrop-filter: blur(12px)`). Conteúdo da nav: logo ness. (esquerdo) + usuário/ações (direito).
- **Main content:** `<main>` com `maxWidth: 1100px`, `margin: 0 auto`, `padding: 2.5rem 2rem`. Sem `display: flex` no body.
- **Login:** Split-screen `grid-template-columns: 1fr 1fr`. Painel esquerdo com branding, painel direito com formulário. Em mobile, painel esquerdo some.
- **Cor de destaque `#00ade8`:** Usar **apenas** em elementos funcionais (badges de status, botões de ação primária, ícones de estado, bordas de seleção). Nunca como cor de fundo de área.
- **Densidade de dados:** Preferir tabelas wide (`border-collapse: collapse`, `border-bottom` entre linhas) em vez de cards. Dados contextuais em texto pequeno (`0.8rem`) com `opacity: 0.4–0.6`.

## 6. Estrutura de Fundo (Background)

- `body` tem apenas `background-color: var(--ness-dark)` (#070b14).
- O gradiente radial sutil (`rgba(0,173,232,0.06)`) é aplicado via `.page-centered` ou diretamente nas páginas quando necessário — nunca hardcoded no `body`.
- Telas autenticadas (dashboard) usam `minHeight: 100vh` com `display: flex; flexDirection: column` no container raiz — sem `.page-centered`.

---
*Este documento atua como "Fonte da Verdade" (Single Source of Truth) para os agentes em qualquer modificação de código no ecossistema da ness.*
