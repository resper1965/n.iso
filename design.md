# ness. Brand Guidelines & UI Design System

Este documento centraliza as diretrizes visuais, a arquitetura de componentes e as regras de usabilidade da **ness.** para garantir consistência extrema e proteção do DNA da marca no **nISO**.

---

## 1. Identidade Nominal
- **Grafia Oficial:** Sempre escrita em caixa baixa e com um ponto final (`ness.`).
- Nunca escreva "Ness.", "NESS", ou "Ness".

---

## 2. Paleta de Cores (Enterprise OLED Dark Mode)
A paleta baseia-se em alto contraste (Dark Mode nativo) com o "Azul ness." servindo exclusivamente como cor de destaque e interatividade.

| Papel | Cor Hex / RGBA | Aplicação |
|-------|----------------|-----------|
| **Background Principal** | `#070b14` | Fundo geral da aplicação (OLED Dark) |
| **Superfície / Cards** | `rgba(15, 23, 42, 0.65)` | Cards, modais e containers com `backdrop-filter: blur(24px)` |
| **Bordas Glass** | `rgba(229, 235, 255, 0.08)` | Divisores e bordas de cards |
| **ness. Blue (Accent)** | `#00ade8` | Botões primários, destaques, bordas ativas e focos |
| **Texto Principal** | `#f5f5f7` | Títulos, conteúdo de tabelas e labels ativos |
| **Texto Secundário** | `rgba(229, 235, 255, 0.6)` | Subtítulos, descrições e hints |

### Cores de Status (Badges & Indicadores)
- 🟢 **Conforme / Concluído / Sucesso**: `#34c759` (`background: rgba(52, 199, 89, 0.12)`)
- 🟡 **Em Progresso / Parcial / Alerta**: `#ffcc00` (`background: rgba(255, 204, 0, 0.12)`)
- 🔴 **Não Conforme / Crítico / Perigo**: `#ff3b30` (`background: rgba(255, 59, 48, 0.12)`)
- 🔵 **Pendente / Em Análise / Info**: `#00ade8` (`background: rgba(0, 173, 232, 0.12)`)
- ⚪ **Neutro / Rascunho**: `#8e8e93` (`background: rgba(255, 255, 255, 0.08)`)

---

## 3. Tipografia
- **Proibição Absoluta:** É estritamente **proibido o uso de itálicos** em qualquer circunstância.
- **Títulos (Headings):** `Montserrat`
  - Utilizada nos pesos **Médio (500)** ou **Bold (700)**. Nunca usar peso 600 (Semi-bold).
  - Títulos `h1` devem utilizar fontes limpas em Montserrat sem itálicos.
- **Corpo de Texto & UI (Body, Inputs, Badges, Tabelas):** `Inter`
  - Usada nos pesos `300` (Light), `400` (Regular), `500` (Medium) e `600` (Semi-bold).
  - Garante a legibilidade em alta densidade de dados e interfaces GRC.

---

## 4. Utilitários Reutilizáveis de Renderização UI (`frontend/src/ui.js`)

Todas as 28 rotinas de menu DEVEM utilizar os 4 utilitários JS expostos no escopo `window`:

### I. `renderPageHeader(title, subtitle, actionsHtml)`
Gera o cabeçalho padronizado da view com título Montserrat, descrição Inter e botões de ação alinhados à direita.

### II. `renderStatCards(statsArray)`
Renderiza a faixa horizontal de KPIs (`stat-strip`) com valor grande Inter, label e subtexto contextual.

### III. `renderStatusBadge(type, text)`
Renderiza badges de status coloridos unificados (`success`, `warning`, `danger`, `info`, `neutral`).

### IV. `renderDataTable(columns, rows, options)`
Renderiza tabelas Glassmorphism com cabeçalhos em caixa alta, formatação customizada de células (`render(row)`), tratamento de estados vazios (`emptyMessage`) e efeito suave de hover (`rgba(255,255,255,0.02)`).

---

## 5. Mapeamento das 28 Rotinas de Menu por Grupos

| Grupo | Rotina | Rota (`navigate`) | Descrição |
|-------|--------|------------------|-----------|
| **1. Visão Geral** | Dashboard | `dashboard` | KPIs de governança, burnup de gaps e atalhos rápidos |
| **1. Visão Geral** | Projetos | `projects` | Lista de projetos ativos e gerenciamento de escopo |
| **2. Comercial** | Leads | `leads` | Pipeline de contatos e pré-vendas |
| **2. Comercial** | Assessments | `assessments` | Levantamento de escopo (92 perguntas) |
| **2. Comercial** | Propostas | `proposals` | Propostas comerciais e assinatura digital |
| **3. Implementação** | Jornada | `project-detail` | Fases do projeto (41 fases / 204 itens) |
| **3. Implementação** | Monitor | `monitor` | Monitor de execução e SLAs de tarefas |
| **3. Implementação** | SoA | `soa` | Declaração de Aplicabilidade (93 controles ISO 27001:2022) |
| **3. Implementação** | Governança | `governance` | Matriz de governança e consolidação de compliance |
| **4. Operacional** | Partes Interessadas | `stakeholders` | Requisitos de partes interessadas (ISO Cláusula 4.2) |
| **4. Operacional** | Contexto | `context` | Análise SWOT e escopo organizacional |
| **4. Operacional** | Ativos | `assets` | Inventário de ativos e valoração C-I-D |
| **4. Operacional** | Riscos | `risks` | Matriz de Risco 5x5 Interativa + Heatmap + Tratamento |
| **4. Operacional** | Fornecedores | `vendors` | Gestão de terceiros (KYV) e Diligence Level |
| **4. Operacional** | Treinamento | `training` | Cobertura de conscientização de segurança |
| **4. Operacional** | Ciência de Políticas | `acknowledgments` | Rastreabilidade de aceite das políticas |
| **4. Operacional** | Gestão de Políticas | `policies-dashboard` | Suíte de 10 templates ISO + PolicyAgent AI |
| **4. Operacional** | Auditorias | `audits` | Audit Calendar e cronograma de auditorias |
| **4. Operacional** | CAPA | `capa` | Kanban de Planos de Ação Corretiva |
| **4. Operacional** | Análise Crítica | `management-review` | Ata de Análise Crítica da Direção (ISO Cláusula 9.3) |
| **4. Operacional** | Evidências | `evidence` | Central de Evidências com SHA-256 e IA EvidenceAgent |
| **5. Privacidade** | ROPA | `ropa` | Registro de Operações de Tratamento (LGPD / ISO 27701) |
| **5. Privacidade** | DPIA / RIPD | `dpia` | Relatório de Impacto à Proteção de Dados |
| **6. Inteligência** | AI Assistant | `ai-chat` | Copilot de Compliance baseado em Workers AI |
| **6. Inteligência** | Knowledge Base | `knowledge` | RAG na base de conhecimento Vectorize |
| **7. Sistema** | Trilha de Logs | `audit-trail` | Log Viewer e auditoria de ações no sistema |
| **7. Sistema** | Usuários | `users` | Gestão de usuários e permissões RBAC |
| **7. Sistema** | Configurações | `settings` | Webhooks, API Keys e Branding da Organização |

---

## 6. Estrutura de Fundo e Layout Enterprise Grade
- `body` possui `background-color: #070b14`.
- Barra de navegação lateral (`sidebar`) fixa à esquerda com seletor de projeto ativo.
- Cabeçalho horizontal (`header`) com notificações e atalho rápido do projeto ativo.
- O azul `#00ade8` é reservado exclusivamente para elementos interativos e focos.

---
*Este documento é a Fonte Única da Verdade (Single Source of Truth) de UX/UI para o ecossistema ness. nISO.*
