# Specification: Specification Kit 002 — Homogeneização UI/UX e Design System do nISO

**Data**: 2026-07-22  
**Status**: Aprovado & Em Implementação  
**Autor**: ness. Antigravity AI Coding Agent  
**Projeto**: nISO - ness. Agentic GRC System  
**Spec Format**: GitHub Spec Kit Standard Specification  

---

## 📌 Executive Summary

O nISO expandiu-se rapidamente para incluir **28 rotinas funcionais** agrupadas em 7 categorias principais de governança de segurança da informação (ISO 27001:2022) e privacidade (LGPD / ISO 27701). Para superar a heterogeneidade visual decorrente desse crescimento e consolidar a experiência **Enterprise Grade Dark Mode**, este documento define a especificação arquitetural do **Design System ness.** e o conjunto unificado de componentes de interface.

---

## 🏛️ 1. Princípios Constitucionais de UI/UX (Brand DNA)

Em total conformidade com a `CONSTITUTION.md` e o `design.md`:

1. **Grafia da Marca**: Exclusivamente `ness.` em caixa baixa com ponto final.
2. **Paleta Base**:
   - **OLED Dark Canvas**: `#070b14` (100% de fundo).
   - **Glassmorphism Panels**: `rgba(15, 23, 42, 0.65)` com `backdrop-filter: blur(24px)` e bordas `1px solid rgba(229, 235, 255, 0.08)`.
   - **Accent Neon ness.**: `#00ade8` (Reservado estritamente para elementos interativos, focos, botões primários e bordas ativas).
   - **Tipografia**: Montserrat (500/700) para **headings (`h1`, `h2`, `h3`)** e Inter (300/400/500/600) para **body, tabelas, inputs e badges**. Itálicos são estritamente proibidos.
   - **Ícones**: SVG inline vetoriais limpos (24x24 viewBox). Proibido o uso de emojis soltos como ícones funcionais.

---

## 🛠️ 2. Especificação Técnica dos Utilitários Globais (`frontend/src/ui.js`)

Todos os módulos de visualização em `frontend/src/views/` DEVEM consumir as funções de renderização disponibilizadas no escopo `window`:

### 2.1 `window.renderPageHeader(title, subtitle, actionsHtml)`
- **Propósito**: Padroniza o cabeçalho superior de todas as 28 rotinas de menu.
- **Assinatura**: `(title: string, subtitle?: string, actionsHtml?: string) => string`
- **Output HTML**:
  ```html
  <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; gap:1rem; flex-wrap:wrap;">
      <div>
          <h1 style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.5rem; color:var(--text); margin:0 0 0.3rem 0; letter-spacing:-0.5px;">...</h1>
          <p style="color:var(--text-dim); font-size:0.85rem; margin:0; line-height:1.4;">...</p>
      </div>
      <div class="header-actions-group" style="display:flex; gap:0.75rem; align-items:center;">...</div>
  </div>
  ```

### 2.2 `window.renderStatCards(statsArray)`
- **Propósito**: Gera a faixa horizontal de estatísticas de topo (`stat-strip`).
- **Assinatura**: `(statsArray: Array<{ label: string, value: string | number, color?: string, subtext?: string }>) => string`
- **Exemplo de Uso**:
  ```javascript
  const stats = [
    { label: 'Controles Implementados', value: '78/93', color: '#34c759', subtext: '83.8% de cobertura' },
    { label: 'Riscos Críticos', value: 2, color: '#ff3b30', subtext: 'Requer atenção imediata' }
  ];
  ```

### 2.3 `window.renderStatusBadge(type, text)`
- **Propósito**: Padroniza a renderização de pílulas de status coloridas.
- **Assinatura**: `(type: 'success' | 'warning' | 'danger' | 'info' | 'neutral', text: string) => string`
- **Mapeamento de Cores**:
  - `success`: `#34c759` (Verde Conforme)
  - `warning`: `#ffcc00` (Amarelo Atenção/Em Progresso)
  - `danger`: `#ff3b30` (Vermelho Não Conforme/Risco)
  - `info`: `#00ade8` (Azul ness. Informação/Pendente)
  - `neutral`: `#8e8e93` (Cinza Rascunho/Desativado)

### 2.4 `window.renderDataTable(columns, rows, options)`
- **Propósito**: Renderizador universal de tabelas Glassmorphism.
- **Assinatura**: `(columns: Array<{ label: string, key?: string, align?: 'left'|'center'|'right', render?: (row: any) => string }>, rows: Array<any>, options?: { emptyMessage?: string }) => string`
- **Recursos**: Efeito suave de hover (`rgba(255,255,255,0.02)`), alinhamento configurável e mensagem customizada de estado vazio.

---

## 🗺️ 3. Mapeamento Profundo das 28 Rotinas de Menu

### Grupo 1: Visão Geral & Portfólio
1. **`dashboard`**: Título Montserrat + 4 Stat Cards Glass + Burnup de Gaps % + Grid responsivo para Levantamentos e Projetos Ativos.
2. **`projects`**: Gerenciador multi-projeto com busca em tempo real, badges de progresso e filtro por norma (ISO 27001 / ISO 27701).

### Grupo 2: Comercial (`group-sales`)
3. **`leads`**: Pipeline Kanban / Grid com cards de oportunidade e atalho para formulário Discovery.
4. **`assessments`**: Stepper visual fixo dos 10 blocos de levantamento com botões Toggle Sim/Não/Parcial sem desalinhamentos.
5. **`proposals`**: Gerador e visualizador de propostas comerciais branded ness. com tabela comparativa de Tiers de precificação (Foundation R a Critical R).

### Grupo 3: Implementação (`group-impl`)
6. **`project-detail`**: Accordion das 41 fases com 204 itens (task/document/evidence), indicador de progresso % e upload direto via R2.
7. **`monitor`**: Dashboard de saúde operacional com velocidade de fechamento de tarefas por responsável e alertas de SLA.
8. **`soa`**: Declaração de Aplicabilidade (93 controles ISO 27001:2022) com filtro por Domínio (A.5 Organizacional, A.6 Pessoas, A.7 Físico, A.8 Tecnológico) e maturidade CMMI (0 a 5).
9. **`governance`**: Matriz consolidada de governança agregando estado das políticas, riscos, controles e evidências.

### Grupo 4: Operacional (`group-ops`)
10. **`stakeholders`**: Mapeamento de partes interessadas (ISO 27001 Cláusula 4.2) com tabela de requisitos contratuais e legais.
11. **`context`**: Análise SWOT de contexto organizacional organizada em 4 quadrantes glassmorphism.
12. **`assets`**: Inventário de ativos de informação com valoração C-I-D (Confidencialidade, Integridade, Disponibilidade) e proprietários.
13. **`risks`**: Matriz de Risco 5x5 Interativa (Probabilidade x Impacto) com mapa de calor (Heatmap) dinâmico e tabela de mitigação.
14. **`vendors`**: Cadastro de fornecedores terceiros (KYV) com classificação de Nível de Diligência (Baixo, Médio, Alto, Crítico) e tracking de DPA.
15. **`training`**: Central de treinamento e conscientização com meter bar de cobertura da empresa (%) e emissão de certificados.
16. **`acknowledgments`**: Painel de ciência e aceite de políticas com estatísticas de adesão por colaboradores.
17. **`policies-dashboard`**: Suíte de 10 Templates ISO (ISP, AUP, ACP, IRP, BCP, DPP, CMP, SDP, VMP, SAP) + Botão `Gerar com AI` via PolicyAgent (Workers AI).
18. **`audits`**: Audit Schedule Calendar para acompanhamento de auditorias internas, Fase 1 e Fase 2.
19. **`capa`**: Board Kanban de Ações Corretivas (Identificada ➔ Causa Raiz ➔ Em Execução ➔ Concluída).
20. **`management-review`**: Template oficial de Ata de Análise Crítica da Direção conforme ISO 27001 Cláusula 9.3.
21. **`evidence`**: Central de Evidências com exibição de hash SHA-256 (Web Crypto), status da avaliação por IA (EvidenceAgent) e assinatura eletrônica.

### Grupo 5: Privacidade / LGPD (`group-privacy`)
22. **`ropa`**: Registro de Operações de Tratamento de Dados (Art. 7º e Art. 11 LGPD) com filtro por titulares e retenção.
23. **`dpia`**: Relatório de Impacto à Proteção de Dados Pessoais (RIPD) com parecer estruturado do DPO.

### Grupo 6: Inteligência (`group-intel`)
24. **`ai-chat`**: Copilot de Compliance em estilo IDE integrado ao Workers AI (Llama 3.1) com histórico de mensagens.
25. **`knowledge`**: Central de busca semântica RAG alimentada pelo vetorizador Cloudflare Vectorize.

### Grupo 7: Sistema (`group-system-config`)
26. **`audit-trail`**: Audit Log Viewer de segurança com busca textual e filtros de severidade.
27. **`users`**: Painel de gestão de usuários e permissões RBAC com disparo de e-mails de credencial temporária.
28. **`settings`**: Configurações globais divididas em abas para Webhooks, API Keys com hash SHA-256 e Branding da Organização.

---

## 🧪 4. Critérios de Aceite & Validação

- **Build Frontend**: `npm run build` na pasta `frontend/` deve compilar em < 500ms sem erros.
- **Suíte de Testes**: `npx vitest run --config vitest.basic.config.ts` deve passar 100% (85/85 testes).
- **TypeScript**: `npx tsc --noEmit` deve retornar 0 erros.
- **Deploy**: Wrangler deploy deve publicar os ativos estáticos em `https://niso.ness.workers.dev`.
