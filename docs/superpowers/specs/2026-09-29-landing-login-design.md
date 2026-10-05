# Landing = tela de entrada do n.iso

Data: 2026-09-29. Aprovado em conversa, seção a seção.

## Problema

`frontend/public/index.html` é uma landing estática com CSS próprio, tokens do
AGENTS.md desatualizados (`#070b14`, sem peso 600) e fora da marca: logo `ness.`
em 700 com ponto branco, produto ora "n.iso" ora "nISO", texto sem acento,
accent como fundo, visual de template de SaaS, copy técnica (Cloudflare, R2) e
tabela de preços para um público que é convidado, não comprador.

## Decisões

- **Público**: quem já é cliente ou foi convidado. Ação principal: Entrar.
- **Preços**: saem da página. `/api/v1/public/pricing` continua existindo.
- **Formato**: o login fica na primeira dobra da própria landing.
- **Abordagem**: `/` serve o shell do app (`login.html`). Nenhuma lógica de
  autenticação duplicada; a página usa o `style.css` do app, única fonte de
  marca.

## Estrutura

Tudo dentro de `#login-overlay` (já é `position: fixed` com `overflow-y: auto`;
some quando a pessoa entra, levando as seções junto).

1. **Dobra** (100vh), duas colunas: marca à esquerda (`n.iso`, título, apoio,
   âncora "conheça o n.iso"), cartão de login atual à direita. Primeiro acesso,
   MFA e recuperação continuam trocando só o cartão.
2. **Pilares** (3, texto): Conformidade · Evidência e auditoria · Privacidade.
3. **Como a ness. conduz** (4 passos).
4. **Rodapé**: `ness.` · privacidade · termos.

Abaixo de 900px a coluna de marca empilha acima do cartão.

## Texto

- Título: "Conformidade ISO conduzida, do diagnóstico à certificação."
- Apoio: "O ambiente onde sua organização e a ness. trabalham juntas:
  controles, evidências, riscos e políticas em um só lugar."
- Conformidade: "Declaração de aplicabilidade e controles do Anexo A da ISO
  27001:2022, acompanhados em tempo real."
- Evidência e auditoria: "Cada evidência com registro de integridade e trilha
  de auditoria, pronta para o auditor."
- Privacidade: "ISO 27701 e registro das operações de tratamento, alinhados à
  LGPD."
- Passos: 01 Diagnóstico · 02 Plano e aplicabilidade · 03 Implementação e
  evidências · 04 Auditoria e certificação.

## Visual

Tokens do `style.css` (`--bg #0b1326`, `--surface #162244`, `--border`,
`--font-head` 500 marca / 600 títulos, `--font-body`). Accent só no ponto da
marca, no botão Entrar e nos números dos passos. Sem fundo de área em accent,
sem gradiente, sem ícone, sem animação decorativa.

## Roteamento

- Remover `frontend/public/index.html` e `frontend/public/landing.js`.
- Catch-all em `src/index.ts`: fallback de 404 passa de `/` para `/login`.
  Sem `index.html`, `/` cai no fallback e recebe o shell do app. `/login`
  continua servindo o mesmo arquivo (links e e-mails antigos seguem válidos).

## Verificação

- Teste: `GET /` devolve o shell do app (formulário de login + seção de
  pilares), não a landing antiga.
- Print no navegador, antes e depois, 1440px e 390px.
- Checklist de marca do skill `ness-branding`.
- AGENTS.md: corrigir tokens, peso 600, descrição de `/` e do login.
