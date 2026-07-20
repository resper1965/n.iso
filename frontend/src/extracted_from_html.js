<script>

    // ═══════════════════════════════════════════════════════════════
    //  DOC_WIZARDS — Guided Document Generation per Checklist Item
    // ═══════════════════════════════════════════════════════════════
    const DOC_WIZARDS = {
      // ─── JORNADA 1: Mobilização e Diagnóstico (Fases 0–6) ───
      'p0_1': {
        title: 'Definição do Sponsor Executivo',
        fields: [
          { id: 'sponsor_name', label: 'Nome completo do patrocinador', type: 'text', required: true, placeholder: 'Ex: João Silva' },
          { id: 'sponsor_role', label: 'Cargo', type: 'text', required: true, placeholder: 'Ex: CEO, CTO, CISO' },
          { id: 'sponsor_authority', label: 'Nível de autoridade sobre orçamento de SI', type: 'select', options: ['Total (C-Level)', 'Parcial (Diretor)', 'Limitada (Gerente)'] }
        ],
        auditorTip: 'Cl 5.1 — O auditor verificará se o sponsor é C-level com poder decisório real sobre recursos.',
        isoRef: 'Cl 5.1'
      },
      'p0_2': {
        title: 'Nomeação da Equipe do Projeto SGSI',
        fields: [
          { id: 'members', label: 'Membros da equipe (nome — cargo — papel no SGSI)', type: 'textarea', required: true, placeholder: 'Ex:\nMaria Santos — CISO — Líder\nCarlos Lima — DPO — Privacidade\nAna Souza — TI — Controles Técnicos' },
          { id: 'meeting_freq', label: 'Frequência de reuniões', type: 'select', options: ['Semanal', 'Quinzenal', 'Mensal'] },
          { id: 'report_to', label: 'A quem a equipe reporta?', type: 'text', placeholder: 'Ex: Comitê de Segurança / CEO' }
        ],
        auditorTip: 'Cl 5.3 — O auditor verificará se há formalização dos papéis, responsabilidades e autoridades.',
        isoRef: 'Cl 5.3'
      },
      'p0_3': {
        title: 'Ata de Kick-off do Projeto SGSI',
        fields: [
          { id: 'date', label: 'Data do kick-off', type: 'date', required: true },
          { id: 'participants', label: 'Participantes (nome e cargo)', type: 'textarea', required: true, placeholder: 'Ex:\nJoão Silva — CEO\nMaria Santos — CISO\nPedro Oliveira — CTO' },
          { id: 'agenda', label: 'Pauta principal', type: 'textarea', required: true, placeholder: 'Ex: Apresentação do projeto, escopo preliminar, cronograma, próximos passos' },
          { id: 'decisions', label: 'Decisões tomadas', type: 'textarea', placeholder: 'Ex: Aprovação do cronograma, nomeação da equipe, definição de reuniões semanais' },
          { id: 'next_steps', label: 'Próximos passos', type: 'textarea', placeholder: 'Ex: Agendar entrevistas executivas, iniciar gap assessment' }
        ],
        auditorTip: 'Cl 5.1 — A ata de kick-off demonstra comprometimento da alta direção desde o início.',
        isoRef: 'Cl 5.1'
      },
      'p0_4': {
        title: 'Cronograma do Projeto de Certificação',
        fields: [
          { id: 'start_date', label: 'Data de início do projeto', type: 'date', required: true },
          { id: 'target_cert', label: 'Data pretendida de certificação', type: 'date', required: true },
          { id: 'milestones', label: 'Marcos principais', type: 'textarea', required: true, placeholder: 'Ex:\nMês 1-2: Diagnóstico e Gap\nMês 3-4: Documentação\nMês 5-6: Implementação\nMês 7: Auditoria Interna\nMês 8: Stage 1\nMês 9: Stage 2' },
          { id: 'resources', label: 'Recursos alocados', type: 'textarea', placeholder: 'Ex: 2 consultores externos, CISO interno 50%, equipe TI 20%' }
        ],
        auditorTip: 'Cl 6.2 — O cronograma deve ter marcos claros, responsáveis e recursos definidos.',
        isoRef: 'Cl 6.2'
      },
      'p0_5': {
        title: 'Carta de Mandato do SGSI',
        fields: [
          { id: 'org_name', label: 'Nome da organização', type: 'text', required: true },
          { id: 'sponsor', label: 'Sponsor executivo (nome e cargo)', type: 'text', required: true },
          { id: 'scope', label: 'Escopo do SGSI (localidades, sistemas, processos)', type: 'textarea', required: true, placeholder: 'Ex: Sede São Paulo, Data Center AWS us-east-1, sistemas de e-commerce e CRM' },
          { id: 'target_date', label: 'Data pretendida de certificação', type: 'date', required: true },
          { id: 'budget_status', label: 'Orçamento aprovado?', type: 'select', options: ['Sim, formalmente aprovado', 'Aprovação verbal', 'Pendente de aprovação'] },
          { id: 'objectives', label: 'Objetivos de segurança da informação', type: 'textarea', placeholder: 'Ex: Proteger dados de clientes, garantir continuidade, atender requisitos regulatórios' }
        ],
        auditorTip: 'Cl 5.1 — Documento primário de comprometimento. O auditor pedirá este documento no primeiro dia do Stage 1.',
        isoRef: 'Cl 5.1'
      },
      'p0_6': {
        title: 'Definição de Canais de Comunicação do SGSI',
        fields: [
          { id: 'channels', label: 'Canais definidos para comunicação do SGSI', type: 'textarea', required: true, placeholder: 'Ex:\n- E-mail: sgsi@empresa.com\n- Slack: #sgsi-projeto\n- Reuniões semanais: Terça 10h\n- SharePoint: /SGSI/Documentos' },
          { id: 'internal_comm', label: 'Como a organização comunicará o SGSI internamente?', type: 'select', options: ['Intranet + e-mail', 'Reuniões all-hands', 'Newsletter interna', 'Portal dedicado'] }
        ],
        auditorTip: 'Cl 7.4 — O auditor verificará se há plano de comunicação interna e externa sobre o SGSI.',
        isoRef: 'Cl 7.4'
      },
      'p0_7': {
        title: 'Avaliação de Recursos Necessários',
        fields: [
          { id: 'people', label: 'Recursos humanos necessários', type: 'textarea', required: true, placeholder: 'Ex: CISO (interno), 2 consultores ISO (externo), DPO (interno)' },
          { id: 'budget', label: 'Orçamento estimado', type: 'text', placeholder: 'Ex: R$ 150.000 (consultoria) + R$ 50.000 (ferramentas)' },
          { id: 'tools', label: 'Ferramentas necessárias', type: 'textarea', placeholder: 'Ex: GRC platform, scanner de vulnerabilidades, SIEM' },
          { id: 'training', label: 'Treinamentos necessários', type: 'textarea', placeholder: 'Ex: Lead Implementer ISO 27001, treinamento de auditoria interna' }
        ],
        auditorTip: 'Cl 7.1 — O auditor verificará se a organização alocou recursos suficientes.',
        isoRef: 'Cl 7.1'
      },
      // ─── Fase 1: Entrevista Executiva ───
      'p1_1': {
        title: 'Agendamento de Entrevista com C-Level',
        fields: [
          { id: 'exec_names', label: 'Executivos a serem entrevistados', type: 'textarea', required: true, placeholder: 'Ex: CEO — João Silva\nCTO — Maria Santos\nCFO — Carlos Lima' },
          { id: 'dates', label: 'Datas propostas', type: 'textarea', placeholder: 'Ex: CEO: 15/01, CTO: 16/01, CFO: 17/01' },
          { id: 'topics', label: 'Temas principais da entrevista', type: 'textarea', placeholder: 'Visão de segurança, apetite de risco, governança, orçamento, incidentes' }
        ],
        auditorTip: 'Cl 4.1, 5.1 — Entrevistas executivas são essenciais para entender o contexto e comprometimento.',
        isoRef: 'Cl 4.1, 5.1'
      },
      'p1_3': {
        title: 'Relatório de Entrevistas Executivas',
        fields: [
          { id: 'summary', label: 'Resumo das entrevistas realizadas', type: 'textarea', required: true, placeholder: 'Descreva os principais achados de cada entrevista' },
          { id: 'expectations', label: 'Expectativas da diretoria', type: 'textarea', required: true, placeholder: 'O que a diretoria espera do programa de segurança?' },
          { id: 'gaps', label: 'Gaps identificados', type: 'textarea', placeholder: 'Ex: Falta de orçamento dedicado, sem comitê formal, baixa conscientização' },
          { id: 'risk_appetite', label: 'Apetite de risco identificado', type: 'select', options: ['Conservador (baixo risco)', 'Moderado', 'Agressivo (tolera riscos)', 'Não definido formalmente'] }
        ],
        auditorTip: 'Cl 4.1, 4.2 — Este relatório evidencia a compreensão do contexto organizacional.',
        isoRef: 'Cl 4.1, 4.2'
      },
      'p1_4': {
        title: 'Registro de Gaps Identificados (Entrevista)',
        fields: [
          { id: 'gaps_list', label: 'Lista de gaps identificados nas entrevistas', type: 'textarea', required: true, placeholder: 'Ex:\n1. Sem política de SI formalizada\n2. Controle de acesso sem MFA\n3. Backup sem teste de restore\n4. Sem programa de conscientização' },
          { id: 'priority', label: 'Gaps prioritários (críticos)', type: 'textarea', placeholder: 'Quais gaps representam risco imediato?' }
        ],
        auditorTip: 'Cl 6.1 — Gaps das entrevistas alimentam a análise de riscos e o plano de tratamento.',
        isoRef: 'Cl 6.1'
      },
      // ─── Fase 2: Entrevistas por Trilha ───
      'p2_3': {
        title: 'Documentação de Achados por Trilha',
        fields: [
          { id: 'track', label: 'Trilha avaliada', type: 'select', options: ['TI / Infraestrutura', 'RH / Pessoas', 'Jurídico / Compliance', 'Operações / Processos', 'Desenvolvimento / DevOps'], required: true },
          { id: 'findings', label: 'Achados principais', type: 'textarea', required: true, placeholder: 'Descreva o estado atual da área em relação à segurança da informação' },
          { id: 'gaps', label: 'Gaps específicos da trilha', type: 'textarea', placeholder: 'Controles ausentes ou parcialmente implementados' },
          { id: 'strengths', label: 'Pontos fortes', type: 'textarea', placeholder: 'O que já está bem implementado na área' }
        ],
        auditorTip: 'Cl 4.1 — Achados por trilha demonstram profundidade na análise de contexto.',
        isoRef: 'Cl 4.1'
      },
      'p2_4': {
        title: 'Relatório Consolidado de Entrevistas',
        fields: [
          { id: 'total_areas', label: 'Quantas áreas foram entrevistadas?', type: 'text', required: true },
          { id: 'executive_summary', label: 'Resumo executivo dos achados', type: 'textarea', required: true, placeholder: 'Visão geral do estado de maturidade da organização' },
          { id: 'critical_gaps', label: 'Gaps críticos (cross-functional)', type: 'textarea', required: true, placeholder: 'Gaps que afetam múltiplas áreas' },
          { id: 'maturity_level', label: 'Nível de maturidade estimado', type: 'select', options: ['Inicial (1)', 'Repetível (2)', 'Definido (3)', 'Gerenciado (4)', 'Otimizado (5)'] },
          { id: 'recommendations', label: 'Recomendações prioritárias', type: 'textarea', placeholder: 'Top 5 ações recomendadas' }
        ],
        auditorTip: 'Cl 4.1, 4.2 — Consolidação demonstra visão holística do contexto.',
        isoRef: 'Cl 4.1, 4.2'
      },
      // ─── Fase 3: Definição de Escopo ───
      'p3_1': {
        title: 'Declaração de Escopo do SGSI',
        fields: [
          { id: 'org_name', label: 'Nome da organização', type: 'text', required: true },
          { id: 'locations', label: 'Localidades incluídas', type: 'textarea', required: true, placeholder: 'Ex: Sede São Paulo (Av. Paulista, 1000)\nFilial Rio de Janeiro\nData Center AWS us-east-1' },
          { id: 'systems', label: 'Sistemas e infraestrutura incluídos', type: 'textarea', required: true, placeholder: 'Ex: ERP SAP, CRM Salesforce, AWS EC2/RDS/S3, rede corporativa' },
          { id: 'processes', label: 'Processos de negócio incluídos', type: 'textarea', required: true, placeholder: 'Ex: Vendas online, gestão financeira, RH, suporte ao cliente' },
          { id: 'exclusions', label: 'Exclusões justificadas', type: 'textarea', placeholder: 'Ex: Filial Manaus (operação descontinuada em 2025)' },
          { id: 'people_count', label: 'Número de colaboradores no escopo', type: 'text', placeholder: 'Ex: 250 internos + 50 terceirizados' }
        ],
        auditorTip: 'Cl 4.3 — O auditor verificará se o escopo é claro, sem ambiguidades, e cobre todos os processos relevantes.',
        isoRef: 'Cl 4.3'
      },
      'p3_2': {
        title: 'Unidades Organizacionais no Escopo',
        fields: [
          { id: 'units', label: 'Unidades/departamentos dentro do escopo', type: 'textarea', required: true, placeholder: 'Ex:\n- Diretoria\n- TI / Infraestrutura\n- Desenvolvimento\n- RH\n- Jurídico\n- Comercial\n- Financeiro' },
          { id: 'headcount_per_unit', label: 'Headcount por unidade (aproximado)', type: 'textarea', placeholder: 'TI: 30, RH: 15, Comercial: 50...' }
        ],
        auditorTip: 'Cl 4.3 — Cada unidade no escopo deve ter responsável de SI definido.',
        isoRef: 'Cl 4.3'
      },
      'p3_3': {
        title: 'Processos Incluídos no Escopo',
        fields: [
          { id: 'processes', label: 'Lista de processos dentro do escopo', type: 'textarea', required: true, placeholder: 'Ex:\n1. Gestão de acessos (TI)\n2. Desenvolvimento de software (Dev)\n3. Onboarding/offboarding (RH)\n4. Contratação de fornecedores (Jurídico)' },
          { id: 'critical', label: 'Processos críticos para o negócio', type: 'textarea', placeholder: 'Quais processos, se interrompidos, causam maior impacto?' }
        ],
        auditorTip: 'Cl 4.3 — Processos críticos devem ter controles proporcionais ao risco.',
        isoRef: 'Cl 4.3'
      },
      'p3_4': {
        title: 'Exclusões Justificadas do Escopo',
        fields: [
          { id: 'exclusions', label: 'O que está FORA do escopo e por quê?', type: 'textarea', required: true, placeholder: 'Ex:\n- Filial Manaus: operação descontinuada\n- Sistema legado XYZ: será descomissionado em 6 meses\n- Controle A.7.3 (Segurança em escritórios): 100% remoto' },
          { id: 'justification', label: 'Justificativa formal para cada exclusão', type: 'textarea', required: true, placeholder: 'Cada exclusão deve ter justificativa documentada e aprovada' }
        ],
        auditorTip: 'Cl 6.1.3d — Exclusões na SoA devem ser justificadas. O auditor questionará cada exclusão.',
        isoRef: 'Cl 6.1.3d'
      },
      'p3_5': {
        title: 'Limites Geográficos do SGSI',
        fields: [
          { id: 'physical', label: 'Localidades físicas no escopo', type: 'textarea', required: true, placeholder: 'Endereços completos dos escritórios, data centers, fábricas' },
          { id: 'cloud', label: 'Regiões cloud no escopo', type: 'textarea', placeholder: 'Ex: AWS us-east-1, Azure Brazil South, GCP southamerica-east1' },
          { id: 'remote', label: 'Trabalho remoto incluído?', type: 'select', options: ['Sim, todos os colaboradores remotos', 'Sim, apenas alguns', 'Não, apenas presencial'] }
        ],
        auditorTip: 'Cl 4.3 — O auditor pode visitar qualquer localidade no escopo durante o Stage 2.',
        isoRef: 'Cl 4.3'
      },
      // ─── Fase 4: Gap Assessment ───
      'p4_3': {
        title: 'Documentação de Gaps por Controle',
        fields: [
          { id: 'assessment_method', label: 'Método de avaliação utilizado', type: 'select', options: ['Entrevistas + evidências', 'Questionário + validação', 'Auditoria interna', 'Auto-avaliação'], required: true },
          { id: 'total_controls', label: 'Total de controles avaliados', type: 'text', placeholder: 'Ex: 93 (Annex A completo)' },
          { id: 'compliant', label: 'Controles conformes', type: 'text', placeholder: 'Ex: 35' },
          { id: 'partial', label: 'Controles parcialmente implementados', type: 'text', placeholder: 'Ex: 28' },
          { id: 'non_compliant', label: 'Controles não conformes', type: 'text', placeholder: 'Ex: 30' },
          { id: 'critical_gaps', label: 'Gaps críticos identificados', type: 'textarea', required: true, placeholder: 'Liste os gaps mais graves que requerem ação imediata' }
        ],
        auditorTip: 'Cl 6.1.3 — O gap assessment alimenta diretamente a SoA e o plano de tratamento de riscos.',
        isoRef: 'Cl 6.1.3'
      },
      'p4_4': {
        title: 'Relatório de Gap Assessment',
        fields: [
          { id: 'exec_summary', label: 'Resumo executivo', type: 'textarea', required: true, placeholder: 'Visão geral do estado de conformidade da organização' },
          { id: 'compliance_pct', label: 'Percentual de conformidade atual', type: 'text', required: true, placeholder: 'Ex: 38%' },
          { id: 'top_risks', label: 'Top 5 riscos identificados', type: 'textarea', required: true, placeholder: '1. Sem gestão de vulnerabilidades\n2. Backup sem teste\n3. Sem MFA\n4. Sem programa de awareness\n5. Sem gestão de incidentes' },
          { id: 'roadmap', label: 'Roadmap de remediação sugerido', type: 'textarea', placeholder: 'Prioridade alta → média → baixa com prazos' },
          { id: 'investment', label: 'Investimento estimado', type: 'text', placeholder: 'Ex: R$ 200.000–350.000' }
        ],
        auditorTip: 'Este relatório é a base para aprovação do investimento pela diretoria.',
        isoRef: 'Cl 6.1'
      },
      'p4_5': {
        title: 'Plano de Tratamento de Gaps',
        fields: [
          { id: 'gaps', label: 'Lista de gaps a tratar', type: 'textarea', required: true, placeholder: 'Gap → Ação → Responsável → Prazo' },
          { id: 'quick_wins', label: 'Quick wins (ações imediatas)', type: 'textarea', placeholder: 'Ações que podem ser feitas em até 2 semanas' },
          { id: 'medium_term', label: 'Ações de médio prazo (1-3 meses)', type: 'textarea' },
          { id: 'long_term', label: 'Ações de longo prazo (3-6 meses)', type: 'textarea' }
        ],
        auditorTip: 'Cl 6.1.3 — O plano de tratamento deve ser aprovado pela direção e ter acompanhamento.',
        isoRef: 'Cl 6.1.3'
      },
      // ─── Fase 5: Governança e Papéis ───
      'p5_2': {
        title: 'Papéis e Responsabilidades do SGSI',
        fields: [
          { id: 'roles', label: 'Papéis definidos', type: 'textarea', required: true, placeholder: 'Ex:\n- CISO: Responsável geral pelo SGSI\n- DPO: Privacidade e proteção de dados\n- Gestor de Riscos: Análise e tratamento\n- Auditor Interno: Auditoria independente' },
          { id: 'raci', label: 'Matriz RACI simplificada', type: 'textarea', placeholder: 'Atividade → Responsável → Aprovador → Consultado → Informado' }
        ],
        auditorTip: 'Cl 5.3 — O auditor verificará se cada papel tem autoridade e recursos adequados.',
        isoRef: 'Cl 5.3'
      },
      'p5_3': {
        title: 'Organograma de Segurança da Informação',
        fields: [
          { id: 'structure', label: 'Estrutura hierárquica do SI', type: 'textarea', required: true, placeholder: 'Descreva a linha de reporte:\nCEO → CISO → Equipe SI\nCEO → DPO (independente)' },
          { id: 'committee', label: 'Composição do comitê de SI', type: 'textarea', required: true, placeholder: 'Membros, frequência de reunião, escopo de decisões' }
        ],
        auditorTip: 'Cl 5.3 — O organograma deve mostrar independência do CISO e reporte direto à alta direção.',
        isoRef: 'Cl 5.3'
      },
      // ─── Fase 6: Contexto e Partes Interessadas ───
      'p6_1': {
        title: 'Análise de Contexto Interno e Externo',
        fields: [
          { id: 'internal', label: 'Fatores internos relevantes', type: 'textarea', required: true, placeholder: 'Ex: Cultura organizacional, estrutura, estratégia, capacidades técnicas, processos...' },
          { id: 'external', label: 'Fatores externos relevantes', type: 'textarea', required: true, placeholder: 'Ex: Regulamentações (LGPD, BACEN), mercado, concorrência, tecnologia, ameaças cibernéticas...' },
          { id: 'swot', label: 'Análise SWOT (opcional)', type: 'textarea', placeholder: 'Forças, Fraquezas, Oportunidades, Ameaças' }
        ],
        auditorTip: 'Cl 4.1 — O auditor verificará se a análise de contexto é abrangente e atual.',
        isoRef: 'Cl 4.1'
      },
      'p6_2': {
        title: 'Identificação de Partes Interessadas',
        fields: [
          { id: 'stakeholders', label: 'Partes interessadas identificadas', type: 'textarea', required: true, placeholder: 'Ex:\n- Clientes: Esperam proteção de dados\n- Reguladores (ANPD): Conformidade LGPD\n- Acionistas: Gestão de riscos\n- Colaboradores: Privacidade\n- Fornecedores: Segurança da cadeia' },
          { id: 'requirements', label: 'Requisitos por parte interessada', type: 'textarea', required: true, placeholder: 'Para cada parte, listar seus requisitos de SI relevantes' }
        ],
        auditorTip: 'Cl 4.2 — O auditor pedirá evidência de que os requisitos das partes interessadas foram considerados.',
        isoRef: 'Cl 4.2'
      },
      'p6_3': {
        title: 'Requisitos das Partes Interessadas',
        fields: [
          { id: 'legal', label: 'Requisitos legais e regulatórios', type: 'textarea', required: true, placeholder: 'Ex: LGPD, Marco Civil, regulamentação setorial (BACEN, ANS, ANATEL)' },
          { id: 'contractual', label: 'Requisitos contratuais', type: 'textarea', placeholder: 'Ex: Cláusulas de SI em contratos com clientes, SLAs de disponibilidade' },
          { id: 'business', label: 'Requisitos de negócio', type: 'textarea', placeholder: 'Ex: Certificação ISO para participar de licitações' }
        ],
        auditorTip: 'Cl 4.2 — Requisitos legais devem estar mapeados e atualizados periodicamente.',
        isoRef: 'Cl 4.2'
      },
      // ─── JORNADA 2: Mapeamento e Riscos (Fases 7–13) ───
      'p7_1': {
        title: 'Inventário de Ativos de Informação',
        fields: [
          { id: 'categories', label: 'Categorias de ativos mapeados', type: 'textarea', required: true, placeholder: 'Ex:\n- Hardware: servidores, laptops, mobile\n- Software: ERP, CRM, custom apps\n- Dados: bancos de dados, file servers\n- Serviços: cloud, SaaS, APIs\n- Pessoas: equipes críticas' },
          { id: 'classification', label: 'Esquema de classificação adotado', type: 'select', options: ['Público / Interno / Confidencial / Restrito', 'Baixo / Médio / Alto / Crítico', 'Outro'], required: true },
          { id: 'total_count', label: 'Quantidade total de ativos inventariados', type: 'text', placeholder: 'Ex: 250 ativos' }
        ],
        auditorTip: 'A.5.9 — O inventário deve ser completo, com proprietários definidos e classificação aplicada.',
        isoRef: 'A.5.9, A.5.10, A.5.12'
      },
      'p7_2': {
        title: 'Classificação de Ativos por Criticidade',
        fields: [
          { id: 'criteria', label: 'Critérios de classificação de criticidade', type: 'textarea', required: true, placeholder: 'Como a criticidade é determinada? (impacto no negócio, sensibilidade dos dados, regulatório)' },
          { id: 'critical_assets', label: 'Ativos classificados como críticos', type: 'textarea', required: true, placeholder: 'Liste os ativos de maior criticidade' },
          { id: 'review_freq', label: 'Frequência de revisão do inventário', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }
        ],
        auditorTip: 'A.5.12 — Classificação deve ser aplicada consistentemente e revisada periodicamente.',
        isoRef: 'A.5.12'
      },
      'p7_4': {
        title: 'Mapeamento de Dados Pessoais (RoPA)',
        fields: [
          { id: 'data_categories', label: 'Categorias de dados pessoais tratados', type: 'textarea', required: true, placeholder: 'Ex: Nome, CPF, e-mail, endereço, dados financeiros, dados de saúde' },
          { id: 'purposes', label: 'Finalidades de tratamento', type: 'textarea', required: true, placeholder: 'Para cada categoria, qual a finalidade?' },
          { id: 'legal_bases', label: 'Bases legais aplicáveis', type: 'textarea', placeholder: 'Consentimento, execução de contrato, legítimo interesse, obrigação legal...' },
          { id: 'retention', label: 'Prazos de retenção', type: 'textarea', placeholder: 'Categoria → Prazo → Justificativa' }
        ],
        auditorTip: 'ISO 27701 A.7.2.8 — RoPA é obrigatório pela LGPD e essencial para ISO 27701.',
        isoRef: '27701 A.7.2.8'
      },
      'p8_1': {
        title: 'Mapeamento de Processos de Negócio',
        fields: [
          { id: 'processes', label: 'Processos de negócio identificados', type: 'textarea', required: true, placeholder: 'Liste os processos principais com breve descrição' },
          { id: 'owners', label: 'Proprietários dos processos', type: 'textarea', required: true, placeholder: 'Processo → Responsável' },
          { id: 'dependencies', label: 'Dependências entre processos', type: 'textarea', placeholder: 'Quais processos dependem de quais?' }
        ],
        auditorTip: 'Cl 4.1 — Processos devem estar mapeados para identificar riscos e controles proporcionais.',
        isoRef: 'Cl 4.1'
      },
      'p8_2': {
        title: 'Fluxos de Dados Documentados',
        fields: [
          { id: 'flows', label: 'Fluxos de dados identificados', type: 'textarea', required: true, placeholder: 'Descreva os fluxos: origem → processamento → destino → armazenamento' },
          { id: 'external', label: 'Fluxos externos (terceiros, cloud)', type: 'textarea', placeholder: 'Dados que saem da organização, para onde e por quê' },
          { id: 'sensitive', label: 'Fluxos de dados sensíveis', type: 'textarea', placeholder: 'Quais fluxos envolvem dados sensíveis ou regulados?' }
        ],
        auditorTip: 'A.5.9 — Fluxos de dados ajudam a identificar pontos de controle e vulnerabilidades.',
        isoRef: 'A.5.9'
      },
      'p8_3': {
        title: 'Dependências entre Processos',
        fields: [
          { id: 'dependencies', label: 'Mapa de dependências', type: 'textarea', required: true, placeholder: 'Processo A depende de → Processo B, Sistema X\nProcesso B depende de → Fornecedor Y' },
          { id: 'single_points', label: 'Pontos únicos de falha identificados', type: 'textarea', placeholder: 'Sistemas ou pessoas sem redundância' }
        ],
        auditorTip: 'A.5.30 — Dependências são insumo para o BCP (Business Continuity Plan).',
        isoRef: 'A.5.30'
      },
      'p9_1': {
        title: 'Metodologia de Análise de Riscos',
        fields: [
          { id: 'approach', label: 'Abordagem escolhida', type: 'select', options: ['Qualitativa (matriz 5x5)', 'Semi-quantitativa', 'Quantitativa (FAIR)', 'Híbrida'], required: true },
          { id: 'impact_scale', label: 'Escala de impacto', type: 'textarea', required: true, placeholder: '1-Negligível, 2-Baixo, 3-Médio, 4-Alto, 5-Crítico\nDescreva cada nível' },
          { id: 'likelihood_scale', label: 'Escala de probabilidade', type: 'textarea', required: true, placeholder: '1-Raro, 2-Improvável, 3-Possível, 4-Provável, 5-Quase certo' },
          { id: 'acceptance', label: 'Critério de aceitação de risco', type: 'text', required: true, placeholder: 'Ex: Riscos com score ≤ 6 são aceitos' },
          { id: 'frequency', label: 'Frequência de reavaliação', type: 'select', options: ['Trimestral', 'Semestral', 'Anual', 'Após incidentes'] }
        ],
        auditorTip: 'Cl 6.1.2 — O auditor verificará se a metodologia é consistente, repetível e aprovada.',
        isoRef: 'Cl 6.1.2'
      },
      'p9_3': {
        title: 'Ameaças e Vulnerabilidades Identificadas',
        fields: [
          { id: 'threats', label: 'Ameaças identificadas', type: 'textarea', required: true, placeholder: 'Ex: Ransomware, phishing, insider threat, falha de hardware, desastre natural' },
          { id: 'vulns', label: 'Vulnerabilidades identificadas', type: 'textarea', required: true, placeholder: 'Ex: Sistemas sem patch, senhas fracas, sem MFA, falta de backup off-site' },
          { id: 'scenarios', label: 'Cenários de risco (top 10)', type: 'textarea', placeholder: 'Ameaça + Vulnerabilidade + Ativo = Cenário de risco' }
        ],
        auditorTip: 'Cl 6.1.2 — Ameaças e vulnerabilidades devem estar vinculadas a ativos específicos.',
        isoRef: 'Cl 6.1.2'
      },
      'p9_4': {
        title: 'Matriz de Risco (Impacto x Probabilidade)',
        fields: [
          { id: 'total_risks', label: 'Total de riscos avaliados', type: 'text', required: true },
          { id: 'critical', label: 'Riscos críticos (vermelho)', type: 'textarea', required: true, placeholder: 'Score ≥ 15. Liste cada risco.' },
          { id: 'high', label: 'Riscos altos (laranja)', type: 'textarea', placeholder: 'Score 10-14' },
          { id: 'medium', label: 'Riscos médios (amarelo)', type: 'textarea', placeholder: 'Score 5-9' },
          { id: 'low', label: 'Riscos baixos (verde)', type: 'textarea', placeholder: 'Score ≤ 4' }
        ],
        auditorTip: 'Cl 6.1.2 — A matriz deve ser visual e os riscos priorizados para tratamento.',
        isoRef: 'Cl 6.1.2'
      },
      'p9_5': {
        title: 'Critérios de Aceitação de Risco',
        fields: [
          { id: 'criteria', label: 'Critérios de aceitação definidos', type: 'textarea', required: true, placeholder: 'Quais níveis de risco são aceitáveis? Quem aprova a aceitação?' },
          { id: 'approver', label: 'Quem aprova a aceitação de riscos?', type: 'text', required: true, placeholder: 'Ex: CISO para riscos médios, CEO para riscos altos' }
        ],
        auditorTip: 'Cl 6.1.2 — Critérios devem ser formalizados e aprovados pela direção.',
        isoRef: 'Cl 6.1.2'
      },
      'p9_7': {
        title: 'Plano de Tratamento de Riscos',
        fields: [
          { id: 'risks', label: 'Riscos a tratar (acima do critério de aceitação)', type: 'textarea', required: true, placeholder: 'Risco → Opção de tratamento → Controle → Responsável → Prazo' },
          { id: 'treatment_options', label: 'Opções de tratamento utilizadas', type: 'textarea', placeholder: 'Mitigar, Transferir, Evitar, Aceitar — para cada risco' },
          { id: 'budget', label: 'Orçamento para tratamento', type: 'text', placeholder: 'Custo estimado das ações' }
        ],
        auditorTip: 'Cl 6.1.3 — O plano deve vincular cada risco a um controle e ter aprovação da direção.',
        isoRef: 'Cl 6.1.3'
      },
      'p10_1': {
        title: 'DPIA / RIPD para Operações de Alto Risco',
        fields: [
          { id: 'operation', label: 'Operação avaliada', type: 'text', required: true, placeholder: 'Ex: Processamento de dados de saúde, scoring de crédito' },
          { id: 'data_types', label: 'Tipos de dados envolvidos', type: 'textarea', required: true },
          { id: 'risks', label: 'Riscos à privacidade identificados', type: 'textarea', required: true },
          { id: 'measures', label: 'Medidas mitigatórias propostas', type: 'textarea', required: true },
          { id: 'dpo_opinion', label: 'Parecer do DPO', type: 'textarea', placeholder: 'Recomendação do DPO sobre a operação' }
        ],
        auditorTip: '27701 A.7.2.5 — DPIA é obrigatório para operações de alto risco à privacidade.',
        isoRef: '27701 A.7.2.5'
      },
      'p10_2': {
        title: 'Riscos de Privacidade Identificados',
        fields: [
          { id: 'risks', label: 'Riscos de privacidade', type: 'textarea', required: true, placeholder: 'Liste os riscos de privacidade com impacto e probabilidade' },
          { id: 'affected_groups', label: 'Grupos de titulares afetados', type: 'textarea', required: true, placeholder: 'Clientes, colaboradores, candidatos, parceiros...' }
        ],
        auditorTip: '27701 — Riscos de privacidade devem ser integrados ao registro geral de riscos.',
        isoRef: '27701'
      },
      'p10_3': {
        title: 'Medidas Mitigatórias de Privacidade',
        fields: [
          { id: 'measures', label: 'Medidas implementadas ou planejadas', type: 'textarea', required: true, placeholder: 'Para cada risco de privacidade, qual a medida de mitigação?' },
          { id: 'status', label: 'Status de implementação', type: 'textarea', placeholder: 'Medida → Status (implementada/em andamento/planejada)' }
        ],
        auditorTip: '27701 — Medidas devem ser proporcionais ao risco e verificáveis.',
        isoRef: '27701'
      },
      'p11_1': {
        title: 'Plano de Tratamento de Riscos (Elaborado)',
        fields: [
          { id: 'plan', label: 'Plano detalhado de tratamento', type: 'textarea', required: true, placeholder: 'Risco → Controle → Responsável → Prazo → Status' },
          { id: 'priority', label: 'Priorização', type: 'textarea', placeholder: 'Alta, Média, Baixa para cada ação' }
        ],
        auditorTip: 'Cl 6.1.3 — O plano deve ser vivo e acompanhado em reuniões periódicas.',
        isoRef: 'Cl 6.1.3'
      },
      'p11_2': {
        title: 'Controles Selecionados por Risco',
        fields: [
          { id: 'mapping', label: 'Mapeamento risco → controle', type: 'textarea', required: true, placeholder: 'Risco X → Controle A.8.24 (Criptografia)\nRisco Y → Controle A.5.15 (Controle de Acesso)' }
        ],
        auditorTip: 'Cl 6.1.3 — Cada risco deve ter pelo menos um controle associado.',
        isoRef: 'Cl 6.1.3'
      },
      'p12_1': {
        title: 'Statement of Applicability (SoA) Draft',
        fields: [
          { id: 'total_controls', label: 'Total de controles no SoA', type: 'text', required: true, placeholder: '93 (Annex A ISO 27001:2022)' },
          { id: 'applicable', label: 'Controles aplicáveis', type: 'text', required: true, placeholder: 'Ex: 88' },
          { id: 'excluded', label: 'Controles excluídos com justificativa', type: 'textarea', placeholder: 'Controle → Justificativa de exclusão' }
        ],
        auditorTip: 'Cl 6.1.3d — A SoA é o documento mais revisado em auditorias. Cada exclusão será questionada.',
        isoRef: 'Cl 6.1.3d'
      },
      'p12_2': {
        title: 'Justificativa de Inclusão/Exclusão por Controle',
        fields: [
          { id: 'justifications', label: 'Justificativas por controle excluído', type: 'textarea', required: true, placeholder: 'A.7.3 — Excluído: 100% trabalho remoto, sem escritório físico\nA.7.4 — Excluído: sem monitoramento CFTV' }
        ],
        auditorTip: 'Cl 6.1.3d — Justificativas devem ser baseadas em análise de risco, não em conveniência.',
        isoRef: 'Cl 6.1.3d'
      },
      'p13_1': {
        title: 'SoA de Privacidade (ISO 27701)',
        fields: [
          { id: 'privacy_controls', label: 'Controles de privacidade aplicáveis', type: 'textarea', required: true, placeholder: 'Liste os controles ISO 27701 aplicáveis' },
          { id: 'status', label: 'Status de implementação', type: 'textarea', required: true, placeholder: 'Controle → Status (implementado/parcial/não implementado)' }
        ],
        auditorTip: '27701 — SoA de privacidade deve complementar o SoA de segurança.',
        isoRef: '27701'
      },
      'p13_2': {
        title: 'Controles de Privacidade Mapeados',
        fields: [
          { id: 'controls', label: 'Mapeamento de controles ISO 27701', type: 'textarea', required: true, placeholder: 'Seção → Controle → Descrição → Status' }
        ],
        auditorTip: '27701 — Mapear controles do Anexo A e B da 27701.',
        isoRef: '27701'
      },
      // ─── JORNADA 3: Implementação SGSI (Fases 14–20) ───
      'p14_2': {
        title: 'Nomenclatura Padrão de Documentos',
        fields: [
          { id: 'convention', label: 'Convenção de nomenclatura adotada', type: 'textarea', required: true, placeholder: 'Ex: [TIPO]-[CÓDIGO]-[NOME]-v[VERSÃO]\nPOL-SI-001-Política de Segurança-v1.0' },
          { id: 'types', label: 'Tipos de documentos definidos', type: 'textarea', placeholder: 'POL = Política, PRO = Procedimento, REG = Registro, FOR = Formulário' }
        ],
        auditorTip: 'Cl 7.5 — O auditor verificará se há controle de documentos e nomenclatura consistente.',
        isoRef: 'Cl 7.5'
      },
      'p14_3': { title: 'Template de Política Aprovado', fields: [{ id: 'template_sections', label: 'Seções do template de política', type: 'textarea', required: true, placeholder: '1. Objetivo\n2. Escopo\n3. Definições\n4. Diretrizes\n5. Responsabilidades\n6. Sanções\n7. Histórico de revisões' }], auditorTip: 'Cl 7.5 — Templates padronizados garantem consistência documental.', isoRef: 'Cl 7.5' },
      'p14_4': { title: 'Template de Procedimento Aprovado', fields: [{ id: 'template_sections', label: 'Seções do template de procedimento', type: 'textarea', required: true, placeholder: '1. Objetivo\n2. Escopo\n3. Responsáveis\n4. Passo-a-passo\n5. Registros\n6. Referências' }], auditorTip: 'Cl 7.5 — Procedimentos devem ser detalhados o suficiente para execução sem ambiguidade.', isoRef: 'Cl 7.5' },
      'p14_7': { title: 'Lista Mestra de Documentos', fields: [{ id: 'documents', label: 'Lista de todos os documentos do SGSI', type: 'textarea', required: true, placeholder: 'Código → Nome → Versão → Status → Aprovador → Data' }], auditorTip: 'Cl 7.5 — A lista mestra é o controle central de documentação do SGSI.', isoRef: 'Cl 7.5' },
      'p15_1': { title: 'Políticas Organizacionais (Tema 5)', fields: [{ id: 'policies', label: 'Políticas a serem redigidas', type: 'textarea', required: true, placeholder: 'A.5.1 - Política de SI\nA.5.10 - Uso aceitável\nA.5.15 - Controle de acesso\nA.5.23 - Cloud\nA.5.24 - Incidentes' }], auditorTip: 'A.5.1 — Políticas devem ser aprovadas pela direção e comunicadas.', isoRef: 'A.5.1' },
      'p15_2': { title: 'Procedimentos de Gestão de Ativos', fields: [{ id: 'procedures', label: 'Procedimentos de gestão de ativos', type: 'textarea', required: true, placeholder: 'Inventário, classificação, rotulagem, manuseio, devolução' }], auditorTip: 'A.5.9-A.5.14 — Procedimentos devem cobrir o ciclo de vida completo do ativo.', isoRef: 'A.5.9-A.5.14' },
      'p16_1': { title: 'Política de Segurança para RH', fields: [{ id: 'scope', label: 'Escopo da política (contratação, durante, desligamento)', type: 'textarea', required: true }, { id: 'screening', label: 'Nível de verificação pré-contratação', type: 'select', options: ['Background check completo', 'Verificação de referências', 'Apenas documentação padrão'] }], auditorTip: 'A.6.1-A.6.8 — Controles de pessoas do ciclo completo.', isoRef: 'A.6.1-A.6.8' },
      'p16_4': { title: 'Procedimento de Desligamento Seguro', fields: [{ id: 'steps', label: 'Etapas do desligamento seguro', type: 'textarea', required: true, placeholder: '1. Revogação de acessos (mesmo dia)\n2. Devolução de equipamentos\n3. Transferência de dados\n4. Assinatura de termo de confidencialidade pós-contrato' }], auditorTip: 'A.6.5 — SLA de revogação deve ser imediato.', isoRef: 'A.6.5' },
      'p17_1': { title: 'Perímetros de Segurança Física', fields: [{ id: 'perimeters', label: 'Perímetros definidos', type: 'textarea', required: true, placeholder: 'Descreva os perímetros de segurança física (áreas restritas, data center, escritório)' }], auditorTip: 'A.7.1-A.7.4 — O auditor pode inspecionar fisicamente as instalações.', isoRef: 'A.7.1-A.7.4' },
      'p17_3': { title: 'Proteção de Equipamentos', fields: [{ id: 'measures', label: 'Medidas de proteção implementadas', type: 'textarea', required: true, placeholder: 'UPS, climatização, CFTV, controle de acesso ao rack, cabeamento seguro' }], auditorTip: 'A.7.8-A.7.14 — Proteção contra ameaças ambientais e roubo.', isoRef: 'A.7.8-A.7.14' },
      'p19_1': { title: 'Política de Desenvolvimento Seguro', fields: [{ id: 'sdlc', label: 'Fases do SDLC seguro adotado', type: 'textarea', required: true, placeholder: 'Requisitos → Design → Coding → Testing → Deploy → Manutenção' }, { id: 'tools', label: 'Ferramentas de segurança no pipeline', type: 'textarea', placeholder: 'SAST, DAST, SCA, secrets scanning, container scanning' }], auditorTip: 'A.8.25-A.8.31 — O auditor verificará se o SDLC seguro está integrado ao pipeline.', isoRef: 'A.8.25-A.8.31' },
      'p20_1': { title: 'Segurança de Cloud Provider', fields: [{ id: 'providers', label: 'Provedores cloud utilizados', type: 'textarea', required: true, placeholder: 'AWS, Azure, GCP — serviços utilizados em cada um' }, { id: 'shared_resp', label: 'Matriz de responsabilidade compartilhada', type: 'textarea', required: true, placeholder: 'O que é responsabilidade do provedor vs da organização' }], auditorTip: 'A.5.23 — O auditor pedirá evidência de SLA e certificações do provedor.', isoRef: 'A.5.23' },
      // ─── JORNADA 4: Implementação SGPI (Fases 21–28) ───
      'p21_1': { title: 'Programa de Privacidade', fields: [{ id: 'scope', label: 'Escopo do programa de privacidade', type: 'textarea', required: true }, { id: 'framework', label: 'Framework adotado', type: 'select', options: ['ISO 27701', 'NIST Privacy', 'LGPD-based', 'Híbrido'] }], auditorTip: '27701 — Programa deve estar integrado ao SGSI.', isoRef: '27701 Cl 6' },
      'p21_3': { title: 'Bases Legais Mapeadas', fields: [{ id: 'mapping', label: 'Mapeamento: operação → base legal', type: 'textarea', required: true, placeholder: 'Marketing → Consentimento\nRH → Execução de contrato\nSaúde → Obrigação legal' }], auditorTip: 'LGPD Art. 7 — Base legal incorreta é não conformidade grave.', isoRef: 'LGPD Art. 7' },
      'p21_4': { title: 'RoPA Completo', fields: [{ id: 'activities', label: 'Atividades de tratamento documentadas', type: 'textarea', required: true, placeholder: 'Atividade → Dados → Finalidade → Base legal → Retenção → Compartilhamento' }], auditorTip: '27701 A.7.2.8 — RoPA deve ser completo e atualizado.', isoRef: '27701 A.7.2.8' },
      'p22_1': { title: 'Metodologia de Privacy by Design', fields: [{ id: 'principles', label: 'Princípios PbD adotados', type: 'textarea', required: true, placeholder: '1. Proativo\n2. Privacidade como padrão\n3. Privacidade embutida\n4. Funcionalidade total\n5. Segurança fim-a-fim\n6. Visibilidade\n7. Respeito ao usuário' }], auditorTip: '27701 — PbD deve ser aplicado a novos projetos e mudanças.', isoRef: '27701' },
      'p22_2': { title: 'Checklist PbD para Novos Projetos', fields: [{ id: 'checklist', label: 'Itens do checklist PbD', type: 'textarea', required: true, placeholder: '☐ Minimização de dados\n☐ Pseudonimização\n☐ Criptografia\n☐ Consentimento\n☐ Retenção definida' }], auditorTip: '27701 — O checklist deve ser aplicado antes do go-live.', isoRef: '27701' },
      'p23_2': { title: 'Procedimento de DSR', fields: [{ id: 'rights', label: 'Direitos atendidos', type: 'textarea', required: true, placeholder: 'Acesso, Correção, Exclusão, Portabilidade, Oposição, Revogação' }, { id: 'sla', label: 'SLA de resposta', type: 'text', placeholder: 'Ex: 15 dias úteis' }, { id: 'channel', label: 'Canal de atendimento', type: 'text', placeholder: 'Ex: privacidade@empresa.com' }], auditorTip: 'LGPD Art. 18 — O auditor testará o canal de atendimento.', isoRef: 'LGPD Art. 18' },
      'p23_3': { title: 'SLA de Resposta a Titulares', fields: [{ id: 'sla_detail', label: 'SLAs por tipo de direito', type: 'textarea', required: true, placeholder: 'Acesso: 15 dias\nCorreção: 15 dias\nExclusão: 15 dias\nPortabilidade: 15 dias' }], auditorTip: 'LGPD — Boas práticas: máximo 15 dias úteis para qualquer solicitação.', isoRef: 'LGPD Art. 18' },
      'p24_3': { title: 'Bases Legais por Operação', fields: [{ id: 'operations', label: 'Operações e bases legais aplicáveis', type: 'textarea', required: true }], auditorTip: 'LGPD Art. 7 — Cada operação deve ter base legal definida.', isoRef: 'LGPD Art. 7' },
      'p25_1': { title: 'Política de Retenção de Dados', fields: [{ id: 'categories', label: 'Categorias de dados e prazos de retenção', type: 'textarea', required: true, placeholder: 'Dados de RH: 5 anos após desligamento\nDados de clientes: 5 anos após término do contrato\nLogs: 1 ano' }], auditorTip: '27701 A.7.4.7 — Retenção deve ser proporcional e justificada.', isoRef: '27701 A.7.4.7' },
      'p25_2': { title: 'Tabela de Temporalidade', fields: [{ id: 'table', label: 'Tabela de temporalidade por tipo de dado', type: 'textarea', required: true, placeholder: 'Dado → Retenção → Base legal → Método de descarte' }], auditorTip: '27701 — Tabela deve ser revisada anualmente.', isoRef: '27701' },
      'p25_3': { title: 'Procedimento de Descarte Seguro', fields: [{ id: 'methods', label: 'Métodos de descarte por tipo de mídia', type: 'textarea', required: true, placeholder: 'HD: degaussing + destruição física\nSSD: crypto-erase + destruição\nPapel: fragmentadora\nCloud: deleção + verificação' }], auditorTip: 'A.7.14 — Descarte deve ser verificável e documentado.', isoRef: 'A.7.14' },
      'p26_1': { title: 'Transferências Internacionais Mapeadas', fields: [{ id: 'transfers', label: 'Transferências identificadas', type: 'textarea', required: true, placeholder: 'Destino → Dados → Mecanismo de proteção (SCC, adequação)' }], auditorTip: 'LGPD Art. 33 — Cloud em região fora do Brasil já constitui transferência.', isoRef: 'LGPD Art. 33' },
      'p26_2': { title: 'Cláusulas Contratuais Padrão (SCCs)', fields: [{ id: 'sccs', label: 'SCCs utilizadas', type: 'textarea', required: true }], auditorTip: 'LGPD Art. 33 — SCCs devem ser atualizadas e adequadas.', isoRef: 'LGPD Art. 33' },
      'p26_3': { title: 'Avaliação de Adequação de País Receptor', fields: [{ id: 'assessment', label: 'Avaliação por país receptor', type: 'textarea', required: true }], auditorTip: 'LGPD Art. 33 — Verificar se país tem nível adequado de proteção.', isoRef: 'LGPD Art. 33' },
      'p26_4': { title: 'Compartilhamentos de Dados Documentados', fields: [{ id: 'shares', label: 'Compartilhamentos documentados', type: 'textarea', required: true, placeholder: 'Destinatário → Dados → Finalidade → Base legal → Contrato' }], auditorTip: '27701 — Todos os compartilhamentos devem ser documentados e autorizados.', isoRef: '27701' },
      'p27_1': { title: 'Lista de Subprocessadores', fields: [{ id: 'list', label: 'Subprocessadores atualizados', type: 'textarea', required: true, placeholder: 'Fornecedor → Serviço → Dados acessados → País → DPA assinado?' }], auditorTip: '27701 A.7.2.6 — Lista deve ser mantida atualizada e acessível.', isoRef: '27701 A.7.2.6' },
      'p27_3': { title: 'Avaliação de Segurança de Fornecedores', fields: [{ id: 'criteria', label: 'Critérios de avaliação', type: 'textarea', required: true, placeholder: 'Certificações, pentest, SLA, backup, incidentes' }], auditorTip: 'A.5.21-A.5.22 — Fornecedores críticos devem ser avaliados periodicamente.', isoRef: 'A.5.21-A.5.22' },
      'p28_1': { title: 'Procedimento de Resposta a Incidentes', fields: [{ id: 'phases', label: 'Fases do procedimento', type: 'textarea', required: true, placeholder: '1. Detecção e registro\n2. Classificação de severidade\n3. Contenção\n4. Erradicação\n5. Recuperação\n6. Lições aprendidas' }, { id: 'sla', label: 'SLAs por severidade', type: 'textarea', placeholder: 'Crítico: 1h contenção\nAlto: 4h\nMédio: 24h\nBaixo: 72h' }], auditorTip: 'A.5.24-A.5.28 — O auditor pode simular um incidente durante a auditoria.', isoRef: 'A.5.24-A.5.28' },
      'p28_2': { title: 'Classificação de Severidade de Incidentes', fields: [{ id: 'levels', label: 'Níveis de severidade', type: 'textarea', required: true, placeholder: 'P1-Crítico: Dados vazados, sistema core indisponível\nP2-Alto: Comprometimento parcial\nP3-Médio: Incidente contido\nP4-Baixo: Tentativa bloqueada' }], auditorTip: 'A.5.25 — Classificação deve ser objetiva e aplicável.', isoRef: 'A.5.25' },
      'p28_5': { title: 'Template de Registro de Incidente', fields: [{ id: 'template', label: 'Campos do template de incidente', type: 'textarea', required: true, placeholder: 'Data/hora, reporter, tipo, severidade, ativos afetados, descrição, ações tomadas, lições aprendidas' }], auditorTip: 'A.5.25 — Registros devem ser completos e auditáveis.', isoRef: 'A.5.25' },
      'p28_6': { title: 'Processo de Notificação à ANPD', fields: [{ id: 'process', label: 'Procedimento de notificação', type: 'textarea', required: true, placeholder: 'Quem notifica, quando (72h), conteúdo da notificação, notificação aos titulares' }], auditorTip: 'LGPD Art. 48 — Notificação em prazo razoável (recomendação: 72h).', isoRef: 'LGPD Art. 48' },
      'p28_7': { title: 'Lições Aprendidas de Incidentes', fields: [{ id: 'lessons', label: 'Lições aprendidas documentadas', type: 'textarea', required: true, placeholder: 'Incidente → Causa raiz → O que melhorar → Ação preventiva' }], auditorTip: 'A.5.27 — Lições aprendidas devem alimentar a melhoria contínua.', isoRef: 'A.5.27' },
      // ─── JORNADA 5: Operação e Auditoria (Fases 29–33) ───
      'p29_1': { title: 'Programa de Conscientização', fields: [{ id: 'scope', label: 'Escopo do programa', type: 'textarea', required: true, placeholder: 'Público-alvo, temas, frequência, métodos de avaliação' }, { id: 'topics', label: 'Temas obrigatórios', type: 'textarea', placeholder: 'Phishing, senhas, clean desk, engenharia social, LGPD' }], auditorTip: 'Cl 7.2, 7.3 — O auditor verificará se há programa formal com métricas de eficácia.', isoRef: 'Cl 7.2, 7.3' },
      'p29_2': { title: 'Material de Treinamento', fields: [{ id: 'materials', label: 'Materiais elaborados', type: 'textarea', required: true, placeholder: 'Apresentações, vídeos, e-learning, simulações de phishing, quizzes' }], auditorTip: 'Cl 7.3 — Materiais devem ser atualizados e relevantes ao contexto.', isoRef: 'Cl 7.3' },
      'p30_1': { title: 'KPIs de Segurança da Informação', fields: [{ id: 'kpis', label: 'KPIs definidos', type: 'textarea', required: true, placeholder: '- % de patches aplicados em SLA\n- Tempo médio de resposta a incidentes\n- % de colaboradores treinados\n- Número de vulnerabilidades críticas\n- % de conformidade SoA' }, { id: 'targets', label: 'Metas por KPI', type: 'textarea', placeholder: 'KPI → Meta → Frequência de medição' }], auditorTip: 'Cl 9.1 — O auditor verificará se KPIs são medidos e reportados.', isoRef: 'Cl 9.1' },
      'p30_3': { title: 'Processo de Monitoramento Contínuo', fields: [{ id: 'process', label: 'Processo de monitoramento', type: 'textarea', required: true, placeholder: 'O que é monitorado, como, frequência, alertas, escalação' }], auditorTip: 'Cl 9.1 — Monitoramento deve ser contínuo e documentado.', isoRef: 'Cl 9.1' },
      'p30_4': { title: 'Relatório Periódico de Métricas', fields: [{ id: 'content', label: 'Conteúdo do relatório', type: 'textarea', required: true, placeholder: 'KPIs, tendências, incidentes, ações corretivas, próximos passos' }, { id: 'frequency', label: 'Frequência', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral'] }], auditorTip: 'Cl 9.1 — Relatórios devem ser apresentados na análise crítica pela direção.', isoRef: 'Cl 9.1, 9.3' },
      'p31_1': { title: 'Programa de Auditoria Interna', fields: [{ id: 'program', label: 'Programa de auditoria (escopo, agenda, critérios)', type: 'textarea', required: true, placeholder: 'Frequência: anual\nEscopo: Todas as cláusulas + Annex A\nCritério: ISO 27001:2022\nAuditor: independente qualificado' }], auditorTip: 'Cl 9.2 — Programa deve cobrir todas as cláusulas em ciclo completo.', isoRef: 'Cl 9.2' },
      'p31_2': { title: 'Critérios e Escopo de Auditoria Interna', fields: [{ id: 'criteria', label: 'Critérios de auditoria', type: 'textarea', required: true }, { id: 'scope', label: 'Escopo da auditoria', type: 'textarea', required: true }], auditorTip: 'Cl 9.2 — Critérios devem ser objetivos e baseados na norma.', isoRef: 'Cl 9.2' },
      'p31_4': { title: 'Checklist de Auditoria Interna', fields: [{ id: 'checklist', label: 'Itens do checklist de auditoria', type: 'textarea', required: true, placeholder: 'Cláusula/Controle → Pergunta → Evidência esperada → Resultado' }], auditorTip: 'Cl 9.2 — Checklist deve cobrir todos os requisitos obrigatórios.', isoRef: 'Cl 9.2' },
      'p31_6': { title: 'Relatório de Auditoria Interna', fields: [{ id: 'findings', label: 'Achados da auditoria', type: 'textarea', required: true, placeholder: 'NC maiores, NC menores, oportunidades de melhoria, observações' }, { id: 'conclusion', label: 'Conclusão geral', type: 'textarea', required: true }], auditorTip: 'Cl 9.2 — O relatório alimenta a análise crítica pela direção.', isoRef: 'Cl 9.2' },
      'p31_7': { title: 'Não Conformidades de Auditoria', fields: [{ id: 'ncs', label: 'Não conformidades identificadas', type: 'textarea', required: true, placeholder: 'NC → Cláusula/Controle → Descrição → Evidência → Severidade' }], auditorTip: 'Cl 10.1 — Cada NC deve ter ação corretiva com prazo.', isoRef: 'Cl 10.1' },
      'p32_1': { title: 'Registro de Não Conformidades', fields: [{ id: 'ncs', label: 'Não conformidades registradas', type: 'textarea', required: true }], auditorTip: 'Cl 10.1 — NCs devem ser rastreáveis e verificáveis.', isoRef: 'Cl 10.1' },
      'p32_2': { title: 'Análise de Causa Raiz', fields: [{ id: 'analysis', label: 'Análise de causa raiz por NC', type: 'textarea', required: true, placeholder: 'NC → Causa raiz → Método (5 Porquês, Ishikawa)' }], auditorTip: 'Cl 10.1 — O auditor verificará se a causa raiz é real e não superficial.', isoRef: 'Cl 10.1' },
      'p32_3': { title: 'Ações Corretivas Definidas', fields: [{ id: 'actions', label: 'Ações corretivas', type: 'textarea', required: true, placeholder: 'NC → Ação corretiva → Responsável → Prazo → Status' }], auditorTip: 'Cl 10.1 — Ações devem ser proporcionais à NC.', isoRef: 'Cl 10.1' },
      'p33_1': { title: 'Pauta da Análise Crítica pela Direção', fields: [{ id: 'agenda', label: 'Itens da pauta', type: 'textarea', required: true, placeholder: '1. Status de ações anteriores\n2. Mudanças internas/externas\n3. Desempenho de SI (KPIs)\n4. Resultados de auditoria\n5. NCs e ações corretivas\n6. Oportunidades de melhoria\n7. Recursos necessários' }], auditorTip: 'Cl 9.3 — A pauta deve cobrir todos os inputs obrigatórios da norma.', isoRef: 'Cl 9.3' },
      'p33_3': { title: 'Ata de Análise Crítica pela Direção', fields: [{ id: 'date', label: 'Data da reunião', type: 'date', required: true }, { id: 'participants', label: 'Participantes', type: 'textarea', required: true }, { id: 'decisions', label: 'Decisões tomadas', type: 'textarea', required: true }, { id: 'actions', label: 'Ações definidas', type: 'textarea', required: true }], auditorTip: 'Cl 9.3 — A ata é evidência primária da análise crítica. O auditor SEMPRE pede.', isoRef: 'Cl 9.3' },
      'p33_4': { title: 'Decisões e Ações da Análise Crítica', fields: [{ id: 'decisions', label: 'Decisões registradas', type: 'textarea', required: true }, { id: 'actions', label: 'Ações com responsável e prazo', type: 'textarea', required: true }], auditorTip: 'Cl 9.3 — Decisões devem ter follow-up rastreável.', isoRef: 'Cl 9.3' },
      // ─── JORNADA 6: Certificação (Fases 34–40) ───
      'p35_1': { title: 'Documentação Stage 1 Empacotada', fields: [{ id: 'docs', label: 'Documentos incluídos no pacote', type: 'textarea', required: true, placeholder: 'SoA, Política de SI, Declaração de Escopo, Metodologia de Riscos, Plano de Tratamento, Auditoria Interna, Ata de Análise Crítica' }], auditorTip: 'Stage 1 — O auditor revisará toda a documentação antes da visita.', isoRef: 'Cert Stage 1' },
      'p35_2': { title: 'Documentos Enviados à Certificadora', fields: [{ id: 'sent_docs', label: 'Documentos enviados', type: 'textarea', required: true }, { id: 'sent_date', label: 'Data de envio', type: 'date', required: true }], auditorTip: 'Stage 1 — Enviar com pelo menos 2 semanas de antecedência.', isoRef: 'Cert Stage 1' },
      'p35_5': { title: 'FAQ de Auditoria', fields: [{ id: 'faq', label: 'Perguntas frequentes e respostas preparadas', type: 'textarea', required: true, placeholder: 'Pergunta do auditor → Resposta → Evidência de suporte' }], auditorTip: 'Preparação — FAQ reduz ansiedade e melhora desempenho durante a auditoria.', isoRef: 'Preparação' },
      'p36_1': { title: 'Achados do Stage 1', fields: [{ id: 'findings', label: 'Achados documentados', type: 'textarea', required: true }], auditorTip: 'Stage 1 — Achados devem ser corrigidos antes do Stage 2.', isoRef: 'Cert Stage 1' },
      'p36_2': { title: 'Plano de Correção Pós-Stage 1', fields: [{ id: 'plan', label: 'Plano de correção', type: 'textarea', required: true, placeholder: 'Achado → Ação corretiva → Responsável → Prazo' }], auditorTip: 'Stage 1 — Todas as NCs devem estar corrigidas antes do Stage 2.', isoRef: 'Cert Stage 1' },
      'p38_3': { title: 'Registro de Observações do Auditor', fields: [{ id: 'observations', label: 'Observações do auditor durante Stage 2', type: 'textarea', required: true }], auditorTip: 'Stage 2 — Documente tudo para facilitar correções e próximas auditorias.', isoRef: 'Cert Stage 2' },
      'p39_1': { title: 'Relatório de Auditoria Recebido', fields: [{ id: 'summary', label: 'Resumo do relatório', type: 'textarea', required: true }, { id: 'result', label: 'Resultado', type: 'select', options: ['Certificado', 'Certificado com observações', 'NC menores (90 dias para correção)', 'NC maiores (re-auditoria necessária)'], required: true }], auditorTip: 'Pós-auditoria — O relatório oficial é a base para ações de melhoria.', isoRef: 'Cert Resultado' },
      'p40_1': { title: 'Calendário de Auditorias de Supervisão', fields: [{ id: 'schedule', label: 'Cronograma de supervisão', type: 'textarea', required: true, placeholder: 'Ano 1: Supervisão 1 (mês X)\nAno 2: Supervisão 2 (mês Y)\nAno 3: Recertificação (mês Z)' }], auditorTip: 'Manutenção — Supervisões são obrigatórias para manter a certificação.', isoRef: 'Manutenção' },

      // ═══════════════════════════════════════════════════════════════
      //  EVIDENCE_WIZARDS — Coleta guiada de evidência (sem IA)
      // ═══════════════════════════════════════════════════════════════

      // ─── Aprovações genéricas (padrão reutilizável) ───
      'p3_6': { title: 'Registro de Aprovação do Escopo', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou? (nome e cargo)', type: 'text', required: true, placeholder: 'Ex: João Silva — CEO' },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'reference', label: 'Referência do documento aprovado', type: 'text', placeholder: 'Ex: DOC-ESC-001 v1.0' },
        { id: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Condições, ressalvas ou comentários da direção' }
      ], auditorTip: 'Cl 4.3 — O auditor pedirá evidência de que a alta direção revisou e aprovou formalmente o escopo do SGSI.', isoRef: 'Cl 4.3' },

      'p4_2': { title: 'Registro de Entrevistas Realizadas', evidenceOnly: true, fields: [
        { id: 'interviewees', label: 'Entrevistados (nome — cargo — área)', type: 'textarea', required: true, placeholder: 'Ex:\nMaria Santos — CISO — TI\nCarlos Lima — DPO — Jurídico\nAna Souza — Gerente — RH' },
        { id: 'dates', label: 'Datas das entrevistas', type: 'textarea', required: true, placeholder: 'Ex: TI: 15/01, RH: 16/01, Jurídico: 17/01' },
        { id: 'method', label: 'Formato das entrevistas', type: 'select', options: ['Presencial', 'Videoconferência', 'Híbrido', 'Questionário escrito'] },
        { id: 'notes', label: 'Observações gerais', type: 'textarea' }
      ], auditorTip: 'Cl 4.1 — Evidência de que entrevistas foram conduzidas com as áreas relevantes.', isoRef: 'Cl 4.1' },

      'p4_6': { title: 'Registro de Aprovação do Gap Assessment', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'compliance_pct', label: 'Percentual de conformidade aprovado', type: 'text', placeholder: 'Ex: 38%' },
        { id: 'next_steps', label: 'Próximos passos definidos', type: 'textarea' }
      ], auditorTip: 'Cl 6.1 — Aprovação formal do gap assessment demonstra ciência da direção sobre o estado atual.', isoRef: 'Cl 6.1' },

      'p5_4': { title: 'Aprovação da Estrutura de Governança', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'structure_summary', label: 'Resumo da estrutura aprovada', type: 'textarea', placeholder: 'Descreva brevemente a estrutura: comitê, papéis, frequência de reuniões' }
      ], auditorTip: 'Cl 5.3 — A estrutura de governança deve ser formalmente aprovada pela alta direção.', isoRef: 'Cl 5.3' },

      'p6_4': { title: 'Aprovação da Análise de Contexto', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'notes', label: 'Observações da direção', type: 'textarea' }
      ], auditorTip: 'Cl 4.1, 4.2 — Análise de contexto deve ser revisada e validada pela direção.', isoRef: 'Cl 4.1, 4.2' },

      'p7_5': { title: 'Aprovação do Inventário de Ativos', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'total_assets', label: 'Total de ativos inventariados', type: 'text', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'review_date', label: 'Próxima revisão agendada', type: 'date' }
      ], auditorTip: 'A.5.9 — Inventário deve ser revisado e aprovado periodicamente.', isoRef: 'A.5.9' },

      'p9_2': { title: 'Ativos de Informação Inventariados (Ref. Fase 7)', evidenceOnly: true, linkedTo: 'p7_1', fields: [
        { id: 'ref_note', label: 'Este item reutiliza o inventário da Fase 7 (p7_1). Confirme a vinculação:', type: 'select', options: ['Inventário da Fase 7 está completo e atualizado', 'Inventário precisa de atualização', 'Inventário não existe ainda'], required: true },
        { id: 'last_update', label: 'Data da última atualização do inventário', type: 'date', required: true },
        { id: 'total_assets', label: 'Total de ativos no inventário', type: 'text' }
      ], auditorTip: 'A.5.9 — O inventário de ativos é insumo direto para a análise de riscos (Cl 6.1.2).', isoRef: 'A.5.9, Cl 6.1.2' },

      'p9_8': { title: 'Aceitação Formal de Risco Residual', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aceitou os riscos residuais?', type: 'text', required: true, placeholder: 'Deve ser a alta direção ou proprietário do risco' },
        { id: 'date', label: 'Data da aceitação', type: 'date', required: true },
        { id: 'total_accepted', label: 'Quantidade de riscos aceitos', type: 'text', required: true },
        { id: 'highest_risk', label: 'Maior risco residual aceito (score)', type: 'text', placeholder: 'Ex: R-015 (score 8/25)' },
        { id: 'justification', label: 'Justificativa da aceitação', type: 'textarea', required: true, placeholder: 'Por que os riscos residuais são aceitáveis?' }
      ], auditorTip: 'Cl 6.1.3 — O auditor SEMPRE verifica se há aceitação formal documentada do risco residual.', isoRef: 'Cl 6.1.3' },

      'p10_4': { title: 'Aprovação do DPIA pelo DPO', evidenceOnly: true, fields: [
        { id: 'dpo_name', label: 'Nome do DPO', type: 'text', required: true },
        { id: 'date', label: 'Data do parecer', type: 'date', required: true },
        { id: 'result', label: 'Resultado do parecer', type: 'select', options: ['Aprovado sem ressalvas', 'Aprovado com condições', 'Reprovado — requer ajustes'], required: true },
        { id: 'conditions', label: 'Condições ou ressalvas (se houver)', type: 'textarea' }
      ], auditorTip: '27701 A.7.2.5 — DPIA deve ter parecer formal do DPO antes do início da operação.', isoRef: '27701 A.7.2.5' },

      'p11_4': { title: 'Aprovação do Cronograma de Implementação', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'deadline', label: 'Prazo final de implementação', type: 'date' }
      ], auditorTip: 'Cl 6.1.3 — Cronograma deve ser aprovado e acompanhado pela direção.', isoRef: 'Cl 6.1.3' },

      'p12_3': { title: 'Status de Implementação por Controle', evidenceOnly: true, linkedTo: 'soa', fields: [
        { id: 'ref_note', label: 'A SoA do sistema já contém o status por controle. Confirme:', type: 'select', options: ['SoA gerada e atualizada no sistema', 'SoA precisa de atualização', 'SoA não foi gerada ainda'], required: true },
        { id: 'last_update', label: 'Data da última atualização da SoA', type: 'date' },
        { id: 'total_implemented', label: 'Controles implementados', type: 'text' },
        { id: 'total_partial', label: 'Controles parciais', type: 'text' },
        { id: 'total_not', label: 'Controles não implementados', type: 'text' }
      ], auditorTip: 'Cl 6.1.3d — SoA deve refletir o status real de implementação.', isoRef: 'Cl 6.1.3d' },

      'p12_4': { title: 'Evidências Vinculadas por Controle', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status da vinculação de evidências', type: 'select', options: ['Todas as evidências vinculadas', 'Maioria vinculada (>80%)', 'Parcialmente vinculada (<80%)', 'Não iniciado'], required: true },
        { id: 'total_linked', label: 'Controles com evidência vinculada', type: 'text' },
        { id: 'gaps', label: 'Controles sem evidência (listar)', type: 'textarea', placeholder: 'Liste os controles que ainda precisam de evidência' }
      ], auditorTip: 'Cl 6.1.3d — Cada controle aplicável na SoA deve ter evidência de implementação.', isoRef: 'Cl 6.1.3d' },

      'p12_6': { title: 'Aprovação Formal da SoA', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
        { id: 'version', label: 'Versão da SoA aprovada', type: 'text', placeholder: 'Ex: v1.0' }
      ], auditorTip: 'Cl 6.1.3d — A SoA é o documento mais importante da auditoria. Aprovação formal é obrigatória.', isoRef: 'Cl 6.1.3d' },

      'p13_3': { title: 'Evidências de Conformidade SGPI', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status das evidências', type: 'select', options: ['Todas vinculadas', 'Maioria vinculada (>80%)', 'Parcialmente (<80%)', 'Não iniciado'], required: true },
        { id: 'gaps', label: 'Controles sem evidência', type: 'textarea' }
      ], auditorTip: '27701 — Evidências de privacidade devem complementar as de segurança.', isoRef: '27701' },

      'p13_4': { title: 'Aprovação da SoA do SGPI', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'method', label: 'Método', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true }
      ], auditorTip: '27701 — SoA de privacidade deve ter aprovação separada ou conjunta com SoA de segurança.', isoRef: '27701' },

      // ─── Evidências técnicas (Fases 15–20) ───
      'p15_3': { title: 'Evidência: Controles de Acesso Implementados', evidenceOnly: true, fields: [
        { id: 'iam_tool', label: 'Ferramenta IAM utilizada', type: 'text', required: true, placeholder: 'Ex: Azure AD, Okta, Google Workspace, AWS IAM' },
        { id: 'mfa', label: 'MFA implementado?', type: 'select', options: ['Sim, para todos os usuários', 'Sim, apenas admin/privilegiados', 'Não implementado'], required: true },
        { id: 'access_review', label: 'Revisão periódica de acessos?', type: 'select', options: ['Trimestral', 'Semestral', 'Anual', 'Não há processo'] },
        { id: 'privileged', label: 'Gestão de acessos privilegiados', type: 'textarea', placeholder: 'Como são gerenciadas contas admin? PAM? Princípio de menor privilégio?' },
        { id: 'evidence_desc', label: 'Descreva as evidências disponíveis', type: 'textarea', required: true, placeholder: 'Ex: Print da config do Azure AD com MFA habilitado, relatório de revisão de acessos, política de senhas' }
      ], auditorTip: 'A.5.15-A.5.18 — O auditor verificará configuração real de IAM, MFA e revisão de acessos.', isoRef: 'A.5.15-A.5.18' },

      'p15_4': { title: 'Evidência: Políticas Aprovadas pela Direção', evidenceOnly: true, fields: [
        { id: 'policies_approved', label: 'Políticas aprovadas (lista)', type: 'textarea', required: true, placeholder: 'Ex:\n- Política de Segurança da Informação v1.0\n- Política de Controle de Acesso v1.0\n- Política de Gestão de Incidentes v1.0' },
        { id: 'approver', label: 'Aprovadas por', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true }
      ], auditorTip: 'Cl 5.2 — Todas as políticas devem ser aprovadas pela alta direção e comunicadas.', isoRef: 'Cl 5.2' },

      'p16_3': { title: 'Evidência: Termos de Confidencialidade (NDA)', evidenceOnly: true, fields: [
        { id: 'coverage', label: 'Cobertura de assinaturas', type: 'select', options: ['100% dos colaboradores', '>90% assinaram', '50-90% assinaram', '<50% assinaram'], required: true },
        { id: 'includes_third', label: 'Terceirizados também assinam?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
        { id: 'template', label: 'Template utilizado', type: 'textarea', placeholder: 'Descreva brevemente o que o NDA cobre' },
        { id: 'evidence_desc', label: 'Onde estão armazenados os termos assinados?', type: 'text', required: true, placeholder: 'Ex: RH — pasta digital, sistema de gestão de documentos' }
      ], auditorTip: 'A.6.2 — NDAs devem ser assinados ANTES do primeiro acesso a sistemas.', isoRef: 'A.6.2, A.6.6' },

      'p17_2': { title: 'Evidência: Controles de Acesso Físico', evidenceOnly: true, fields: [
        { id: 'controls', label: 'Controles implementados', type: 'textarea', required: true, placeholder: 'Ex: Catracas com crachá, biometria no data center, CFTV 24h, registro de visitantes' },
        { id: 'areas', label: 'Áreas protegidas', type: 'textarea', placeholder: 'Recepção, escritório, sala de servidores, cofre' },
        { id: 'evidence_desc', label: 'Evidências disponíveis', type: 'textarea', required: true, placeholder: 'Ex: Fotos da catraca, log de acesso do data center, registro de visitantes' }
      ], auditorTip: 'A.7.1-A.7.2 — O auditor pode visitar as instalações e verificar controles in loco.', isoRef: 'A.7.1-A.7.2' },

      // ─── Fase 18: Controles Tecnológicos (5 itens) ───
      'p18_1': { title: 'Evidência: Controles Tecnológicos Tema 8', evidenceOnly: true, fields: [
        { id: 'endpoint', label: 'Proteção de endpoint (EDR/XDR)', type: 'text', placeholder: 'Ex: CrowdStrike, SentinelOne, Microsoft Defender' },
        { id: 'network', label: 'Segurança de rede', type: 'textarea', placeholder: 'Firewalls, segmentação, IDS/IPS, WAF' },
        { id: 'data_protection', label: 'Proteção de dados', type: 'textarea', placeholder: 'DLP, classificação, backup, criptografia' },
        { id: 'access', label: 'Controle de acesso técnico', type: 'textarea', placeholder: 'IAM, MFA, PAM, SSO' },
        { id: 'evidence_desc', label: 'Evidências disponíveis (prints, relatórios, configs)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.1-A.8.34 — O auditor verificará configurações reais, não apenas documentos.', isoRef: 'A.8 (Tema 8)' },

      'p18_2': { title: 'Evidência: Gestão de Vulnerabilidades', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Ferramenta de scan utilizada', type: 'text', required: true, placeholder: 'Ex: Nessus, Qualys, OpenVAS, Nuclei' },
        { id: 'frequency', label: 'Frequência de scan', type: 'select', options: ['Contínuo', 'Semanal', 'Mensal', 'Trimestral', 'Ad-hoc'], required: true },
        { id: 'patching_sla', label: 'SLA de patching', type: 'textarea', placeholder: 'Crítico: 48h, Alto: 7 dias, Médio: 30 dias, Baixo: 90 dias' },
        { id: 'pentest', label: 'Último pentest realizado', type: 'date' },
        { id: 'evidence_desc', label: 'Evidências (relatório de scan, registro de patches)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.8 — O auditor pedirá relatório recente de vulnerabilidades e evidência de correção.', isoRef: 'A.8.8' },

      'p18_3': { title: 'Evidência: Logs e Monitoramento', evidenceOnly: true, fields: [
        { id: 'siem', label: 'SIEM/ferramenta de monitoramento', type: 'text', required: true, placeholder: 'Ex: Splunk, ELK, Datadog, Wazuh, Microsoft Sentinel' },
        { id: 'sources', label: 'Fontes de log coletadas', type: 'textarea', required: true, placeholder: 'Servidores, firewalls, AD, cloud, aplicações, endpoints' },
        { id: 'retention', label: 'Retenção de logs', type: 'text', placeholder: 'Ex: 12 meses online + 24 meses archive' },
        { id: 'alerting', label: 'Alertas configurados?', type: 'select', options: ['Sim, com playbooks', 'Sim, alertas básicos', 'Não há alertas automáticos'] },
        { id: 'evidence_desc', label: 'Evidências (dashboard, print do SIEM)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.15, A.8.16 — O auditor verificará se logs são coletados, correlacionados e analisados.', isoRef: 'A.8.15, A.8.16' },

      'p18_4': { title: 'Evidência: Criptografia em Trânsito e Repouso', evidenceOnly: true, fields: [
        { id: 'transit', label: 'Criptografia em trânsito', type: 'textarea', required: true, placeholder: 'TLS 1.2/1.3 para APIs e web, VPN para acesso remoto, protocolo para e-mail' },
        { id: 'rest', label: 'Criptografia em repouso', type: 'textarea', required: true, placeholder: 'Encryption at rest no DB, BitLocker nos endpoints, S3 encryption, KMS' },
        { id: 'key_mgmt', label: 'Gestão de chaves', type: 'textarea', placeholder: 'AWS KMS, Azure Key Vault, HashiCorp Vault, rotação de chaves' },
        { id: 'evidence_desc', label: 'Evidências (config TLS, print do KMS)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.24 — O auditor verificará config real de TLS e encryption at rest.', isoRef: 'A.8.24' },

      'p18_5': { title: 'Evidência: Proteção contra Malware', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Solução antimalware/EDR', type: 'text', required: true, placeholder: 'Ex: CrowdStrike, SentinelOne, Microsoft Defender for Endpoint' },
        { id: 'coverage', label: 'Cobertura', type: 'select', options: ['100% dos endpoints', '>90%', '50-90%', '<50%'], required: true },
        { id: 'updates', label: 'Atualização de assinaturas', type: 'select', options: ['Automática (real-time)', 'Diária', 'Semanal', 'Manual'] },
        { id: 'evidence_desc', label: 'Evidências (dashboard, cobertura, alertas)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.7 — O auditor verificará cobertura real e atualização de assinaturas.', isoRef: 'A.8.7' },

      // ─── Fases 19-20: Dev Seguro + Cloud ───
      'p19_2': { title: 'Evidência: SSDLC no Pipeline', evidenceOnly: true, fields: [
        { id: 'pipeline', label: 'Pipeline CI/CD utilizado', type: 'text', required: true, placeholder: 'Ex: GitHub Actions, GitLab CI, Jenkins, Azure DevOps' },
        { id: 'stages', label: 'Estágios de segurança no pipeline', type: 'textarea', required: true, placeholder: 'Lint → SAST → Unit Tests → Build → DAST → Deploy → Monitor' },
        { id: 'gates', label: 'Gates de segurança (bloqueiam deploy?)', type: 'select', options: ['Sim, vulnerabilidades críticas bloqueiam', 'Alertas apenas, não bloqueiam', 'Sem gates de segurança'] },
        { id: 'evidence_desc', label: 'Evidências (print do pipeline, relatório SAST)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.25 — O auditor pedirá para ver o pipeline rodando com gates de segurança.', isoRef: 'A.8.25' },

      'p19_3': { title: 'Evidência: Code Review Obrigatório', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Plataforma de code review', type: 'text', required: true, placeholder: 'Ex: GitHub Pull Requests, GitLab Merge Requests, Gerrit' },
        { id: 'policy', label: 'Política de aprovação', type: 'select', options: ['Mínimo 1 aprovação', 'Mínimo 2 aprovações', 'Aprovação do tech lead obrigatória', 'Sem política formal'], required: true },
        { id: 'branch_protection', label: 'Branch protection habilitado?', type: 'select', options: ['Sim, main/master protegida', 'Parcialmente', 'Não'] },
        { id: 'evidence_desc', label: 'Evidências (config do repo, PRs aprovados)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.25 — O auditor verificará branch protection rules e histórico de PRs.', isoRef: 'A.8.25' },

      'p19_4': { title: 'Evidência: Ferramentas SAST/SCA Integradas', evidenceOnly: true, fields: [
        { id: 'sast', label: 'Ferramenta SAST', type: 'text', placeholder: 'Ex: SonarQube, Semgrep, CodeQL, Snyk Code' },
        { id: 'sca', label: 'Ferramenta SCA (dependências)', type: 'text', placeholder: 'Ex: Dependabot, Snyk, Trivy, OWASP Dependency-Check' },
        { id: 'dast', label: 'Ferramenta DAST (se houver)', type: 'text', placeholder: 'Ex: OWASP ZAP, Burp Suite, Nuclei' },
        { id: 'frequency', label: 'Frequência de execução', type: 'select', options: ['A cada commit/PR', 'Diário', 'Semanal', 'Manual'] },
        { id: 'evidence_desc', label: 'Evidências (relatórios, dashboards)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.28 — O auditor pedirá relatório recente de SAST/SCA e ações tomadas.', isoRef: 'A.8.28' },

      'p20_2': { title: 'Evidência: IAM e Least Privilege na Cloud', evidenceOnly: true, fields: [
        { id: 'provider', label: 'Cloud provider(s)', type: 'text', required: true, placeholder: 'AWS, Azure, GCP' },
        { id: 'iam_config', label: 'Configuração IAM', type: 'textarea', required: true, placeholder: 'Roles, policies, grupos, service accounts. Princípio de menor privilégio aplicado?' },
        { id: 'root_protection', label: 'Conta root/admin protegida?', type: 'select', options: ['MFA + chave física + sem uso diário', 'MFA ativado', 'Sem proteção adicional'], required: true },
        { id: 'evidence_desc', label: 'Evidências (IAM policies, screenshots)', type: 'textarea', required: true }
      ], auditorTip: 'A.5.15 — O auditor verificará se least privilege é aplicado na cloud.', isoRef: 'A.5.15, A.5.23' },

      'p20_3': { title: 'Evidência: Pipeline CI/CD Seguro', evidenceOnly: true, fields: [
        { id: 'secrets', label: 'Gestão de secrets', type: 'text', required: true, placeholder: 'Ex: GitHub Secrets, Vault, AWS Secrets Manager' },
        { id: 'artifacts', label: 'Assinatura/verificação de artefatos?', type: 'select', options: ['Sim (Cosign, Sigstore)', 'Não'] },
        { id: 'permissions', label: 'Permissões do pipeline (least privilege)?', type: 'select', options: ['Sim, OIDC + temporary credentials', 'Credenciais fixas com escopo limitado', 'Credenciais amplas'] },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'A.8.25 — Pipeline seguro é controle novo na 2022.', isoRef: 'A.8.25, A.8.9' },

      'p20_4': { title: 'Evidência: Monitoramento e Alertas Operacionais', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Ferramenta de monitoramento', type: 'text', required: true, placeholder: 'Ex: Datadog, Grafana, CloudWatch, New Relic' },
        { id: 'coverage', label: 'O que é monitorado?', type: 'textarea', required: true, placeholder: 'Infra, aplicação, segurança, disponibilidade, performance' },
        { id: 'alerting', label: 'Alertas configurados e testados?', type: 'select', options: ['Sim, com runbooks', 'Sim, alertas básicos', 'Parcialmente', 'Não'] },
        { id: 'oncall', label: 'Há equipe on-call?', type: 'select', options: ['Sim, 24x7', 'Sim, horário comercial', 'Não'] },
        { id: 'evidence_desc', label: 'Evidências (dashboards, alertas)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.16 — O auditor verificará se monitoramento é ativo e alertas são atuados.', isoRef: 'A.8.16' },

      // ─── Fases 21-28: Privacidade ───
      'p21_2': { title: 'Evidência: DPO/Encarregado Nomeado', evidenceOnly: true, fields: [
        { id: 'dpo_name', label: 'Nome do DPO/Encarregado', type: 'text', required: true },
        { id: 'dpo_role', label: 'Cargo/função', type: 'text', required: true },
        { id: 'independence', label: 'DPO tem independência funcional?', type: 'select', options: ['Sim, dedicado à função', 'Parcial, acumula com outra função compatível', 'Não, função conflitante'], required: true },
        { id: 'publication', label: 'Nome publicado no site e comunicado à ANPD?', type: 'select', options: ['Sim, ambos', 'Apenas no site', 'Apenas à ANPD', 'Nenhum'] },
        { id: 'evidence_desc', label: 'Evidências (portaria, publicação, comunicação ANPD)', type: 'textarea', required: true }
      ], auditorTip: 'LGPD Art. 41 — DPO deve ser nomeado formalmente e publicado.', isoRef: 'LGPD Art. 41' },

      'p22_3': { title: 'Evidência: Minimização de Dados', evidenceOnly: true, fields: [
        { id: 'measures', label: 'Medidas de minimização implementadas', type: 'textarea', required: true, placeholder: 'Campos desnecessários removidos, retenção limitada, pseudonimização' },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: '27701 — Minimização é princípio fundamental de Privacy by Design.', isoRef: '27701' },

      'p22_4': { title: 'Evidência: Privacy by Default Configurado', evidenceOnly: true, fields: [
        { id: 'defaults', label: 'Configurações padrão de privacidade', type: 'textarea', required: true, placeholder: 'Ex: Opt-in para marketing, dados mínimos no cadastro, compartilhamento desabilitado por padrão' },
        { id: 'evidence_desc', label: 'Evidências (prints das configurações)', type: 'textarea', required: true }
      ], auditorTip: '27701 — Privacy by Default = configuração mais restritiva como padrão.', isoRef: '27701' },

      'p23_1': { title: 'Evidência: Canal de Atendimento a Titulares', evidenceOnly: true, fields: [
        { id: 'channel', label: 'Canal implementado', type: 'text', required: true, placeholder: 'Ex: privacidade@empresa.com, formulário web, SAC dedicado' },
        { id: 'sla', label: 'SLA de resposta definido', type: 'text', placeholder: 'Ex: 15 dias úteis' },
        { id: 'published', label: 'Canal publicado (Política de Privacidade, site)?', type: 'select', options: ['Sim', 'Não'], required: true },
        { id: 'evidence_desc', label: 'Evidências (print do canal, política de privacidade)', type: 'textarea', required: true }
      ], auditorTip: 'LGPD Art. 18 — O canal deve estar acessível e funcional.', isoRef: 'LGPD Art. 18' },

      'p23_4': { title: 'Evidência: Teste de Exercício de Direitos', evidenceOnly: true, fields: [
        { id: 'test_date', label: 'Data do teste', type: 'date', required: true },
        { id: 'rights_tested', label: 'Direitos testados', type: 'textarea', required: true, placeholder: 'Acesso, correção, exclusão, portabilidade' },
        { id: 'result', label: 'Resultado', type: 'select', options: ['Todos os direitos atendidos no SLA', 'Maioria atendida, gaps identificados', 'Falhas significativas'], required: true },
        { id: 'gaps', label: 'Gaps identificados', type: 'textarea' }
      ], auditorTip: 'LGPD — Teste real demonstra capacidade operacional de atender titulares.', isoRef: 'LGPD Art. 18' },

      'p24_1': { title: 'Evidência: Fluxo de Consentimento', evidenceOnly: true, fields: [
        { id: 'mechanism', label: 'Mecanismo de coleta de consentimento', type: 'textarea', required: true, placeholder: 'Ex: Checkbox no cadastro, banner de cookies, opt-in por e-mail' },
        { id: 'granularity', label: 'Consentimento é granular?', type: 'select', options: ['Sim, por finalidade', 'Parcialmente', 'Consentimento único (bundle)'], required: true },
        { id: 'evidence_desc', label: 'Evidências (print do formulário, logs de consentimento)', type: 'textarea', required: true }
      ], auditorTip: 'LGPD Art. 8 — Consentimento deve ser livre, informado, inequívoco e granular.', isoRef: 'LGPD Art. 8' },

      'p24_2': { title: 'Evidência: Mecanismo de Revogação', evidenceOnly: true, fields: [
        { id: 'mechanism', label: 'Como o titular revoga consentimento?', type: 'textarea', required: true, placeholder: 'Ex: Link no rodapé do e-mail, painel de preferências, solicitação por canal' },
        { id: 'ease', label: 'Revogação é tão fácil quanto o consentimento?', type: 'select', options: ['Sim, mesmo canal', 'Parcialmente', 'Não, processo mais difícil'], required: true },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'LGPD Art. 8 §5 — Revogação deve ser tão fácil quanto o consentimento.', isoRef: 'LGPD Art. 8' },

      'p24_4': { title: 'Evidência: Cookie Banner/Consent Manager', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Ferramenta utilizada', type: 'text', required: true, placeholder: 'Ex: Cookiebot, OneTrust, Custom, Google Consent Mode' },
        { id: 'categories', label: 'Categorias de cookies gerenciadas', type: 'textarea', placeholder: 'Necessários, Analytics, Marketing, Preferências' },
        { id: 'opt_out', label: 'Opt-out funciona corretamente?', type: 'select', options: ['Sim, testado e verificado', 'Parcialmente', 'Não testado'], required: true },
        { id: 'evidence_desc', label: 'Evidências (print do banner, config)', type: 'textarea', required: true }
      ], auditorTip: 'LGPD — Cookie banner deve bloquear cookies não-essenciais antes do consentimento.', isoRef: 'LGPD' },

      'p25_4': { title: 'Evidência: Jobs de Exclusão de Dados', evidenceOnly: true, fields: [
        { id: 'mechanism', label: 'Mecanismo de exclusão', type: 'select', options: ['Job automatizado (cron/scheduled)', 'Manual com checklist', 'Não implementado'], required: true },
        { id: 'frequency', label: 'Frequência de execução', type: 'text', placeholder: 'Ex: Diário, Semanal, Mensal' },
        { id: 'data_types', label: 'Tipos de dados cobertos', type: 'textarea', placeholder: 'Logs, dados de clientes inativos, backups expirados' },
        { id: 'evidence_desc', label: 'Evidências (logs de execução, relatórios)', type: 'textarea', required: true }
      ], auditorTip: 'A.8.10 — Information deletion é controle novo na 2022.', isoRef: 'A.8.10' },

      'p27_2': { title: 'Evidência: DPAs Assinados com Fornecedores', evidenceOnly: true, fields: [
        { id: 'total', label: 'Total de fornecedores com DPA', type: 'text', required: true, placeholder: 'Ex: 12 de 15 fornecedores' },
        { id: 'pending', label: 'Fornecedores sem DPA (se houver)', type: 'textarea', placeholder: 'Liste os que ainda não assinaram e o plano de ação' },
        { id: 'template', label: 'Template de DPA utilizado', type: 'select', options: ['Template próprio aprovado pelo jurídico', 'Template do fornecedor (revisado)', 'Sem template padrão'] },
        { id: 'evidence_desc', label: 'Evidências (lista de DPAs, cópias)', type: 'textarea', required: true }
      ], auditorTip: 'A.5.20 — Todos os fornecedores que tratam dados devem ter DPA ou cláusula contratual.', isoRef: 'A.5.20, 27701' },

      // ─── Fases 28-33: Execução + Auditoria ───
      'p28_8': { title: 'Evidência: Simulação de Incidente (Tabletop)', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data da simulação', type: 'date', required: true },
        { id: 'scenario', label: 'Cenário simulado', type: 'textarea', required: true, placeholder: 'Ex: Ransomware no file server, vazamento de dados de clientes' },
        { id: 'participants', label: 'Participantes', type: 'textarea', required: true },
        { id: 'result', label: 'Resultado e lições aprendidas', type: 'textarea', required: true },
        { id: 'improvements', label: 'Melhorias identificadas', type: 'textarea' }
      ], auditorTip: 'A.5.24 — Simulações demonstram prontidão da organização para incidentes reais.', isoRef: 'A.5.24' },

      'p29_3': { title: 'Evidência: Treinamento Inicial Realizado', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data do treinamento', type: 'date', required: true },
        { id: 'format', label: 'Formato', type: 'select', options: ['Presencial', 'Online ao vivo', 'E-learning', 'Híbrido'], required: true },
        { id: 'attendance', label: 'Taxa de participação', type: 'text', required: true, placeholder: 'Ex: 92% (230 de 250 colaboradores)' },
        { id: 'topics', label: 'Temas cobertos', type: 'textarea', placeholder: 'Segurança da informação, phishing, senhas, clean desk, LGPD' },
        { id: 'evidence_desc', label: 'Evidências (lista de presença, relatório LMS)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 7.2, 7.3 — O auditor verificará registros de participação e conteúdo.', isoRef: 'Cl 7.2, 7.3' },

      'p29_4': { title: 'Evidência: Registros de Presença/Conclusão', evidenceOnly: true, fields: [
        { id: 'total', label: 'Total de colaboradores treinados', type: 'text', required: true },
        { id: 'coverage_pct', label: 'Percentual de cobertura', type: 'text', required: true, placeholder: 'Ex: 92%' },
        { id: 'storage', label: 'Onde estão os registros?', type: 'text', required: true, placeholder: 'Ex: LMS, planilha RH, sistema de gestão' },
        { id: 'evidence_desc', label: 'Evidências (relatório do LMS, lista)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 7.2 — Registros devem ser mantidos como evidência de competência.', isoRef: 'Cl 7.2' },

      'p30_2': { title: 'Evidência: Dashboard de Métricas Implementado', evidenceOnly: true, fields: [
        { id: 'tool', label: 'Ferramenta de dashboard', type: 'text', required: true, placeholder: 'Ex: Grafana, Power BI, nISO dashboard, planilha' },
        { id: 'kpis', label: 'KPIs monitorados', type: 'textarea', required: true },
        { id: 'evidence_desc', label: 'Evidências (print do dashboard)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 9.1 — Dashboard deve apresentar KPIs relevantes para a análise crítica.', isoRef: 'Cl 9.1' },

      'p31_3': { title: 'Evidência: Auditor Interno Qualificado', evidenceOnly: true, fields: [
        { id: 'auditor_name', label: 'Nome do auditor interno', type: 'text', required: true },
        { id: 'qualification', label: 'Qualificação', type: 'textarea', required: true, placeholder: 'Ex: Lead Auditor ISO 27001 (certificação XYZ), experiência em auditoria' },
        { id: 'independence', label: 'Independência garantida?', type: 'select', options: ['Sim, externo contratado', 'Sim, interno de outra área', 'Não, mesma equipe do SGSI'], required: true },
        { id: 'evidence_desc', label: 'Evidências (certificado, contrato)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 9.2 — Auditor deve ser competente E independente da área auditada.', isoRef: 'Cl 9.2' },

      'p31_5': { title: 'Evidência: Auditoria Interna Executada', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data(s) da auditoria', type: 'text', required: true },
        { id: 'scope', label: 'Escopo coberto', type: 'textarea', required: true, placeholder: 'Cláusulas auditadas, controles do Annex A cobertos' },
        { id: 'findings', label: 'Resumo dos achados', type: 'textarea', required: true, placeholder: 'X NCs maiores, Y NCs menores, Z observações' },
        { id: 'evidence_desc', label: 'Evidências (relatório de auditoria)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 9.2 — A auditoria interna deve cobrir todas as cláusulas obrigatórias.', isoRef: 'Cl 9.2' },

      'p31_8': { title: 'Evidência: Plano de Ação Corretiva Aprovado', evidenceOnly: true, fields: [
        { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
        { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
        { id: 'total_actions', label: 'Total de ações corretivas', type: 'text', required: true },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'Cl 10.1 — Ações corretivas da auditoria interna devem estar implementadas antes do Stage 2.', isoRef: 'Cl 10.1' },

      'p32_4': { title: 'Evidência: Verificação de Eficácia das Correções', evidenceOnly: true, fields: [
        { id: 'verifier', label: 'Quem verificou?', type: 'text', required: true },
        { id: 'date', label: 'Data da verificação', type: 'date', required: true },
        { id: 'result', label: 'Resultado', type: 'select', options: ['Todas as correções eficazes', 'Maioria eficaz, retrabalho em algumas', 'Correções ineficazes'], required: true },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'Cl 10.1 — O auditor verificará se as correções eliminaram a causa raiz.', isoRef: 'Cl 10.1' },

      'p33_2': { title: 'Evidência: Análise Crítica pela Direção Realizada', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data da reunião', type: 'date', required: true },
        { id: 'participants', label: 'Participantes da alta direção', type: 'textarea', required: true },
        { id: 'inputs_covered', label: 'Inputs obrigatórios cobertos (Cl 9.3.2)', type: 'textarea', required: true, placeholder: 'Status de ações anteriores, mudanças, desempenho SI, auditorias, NCs, melhoria contínua' },
        { id: 'evidence_desc', label: 'Evidências (ata, deliberações)', type: 'textarea', required: true }
      ], auditorTip: 'Cl 9.3 — O auditor SEMPRE pede a ata da análise crítica. É evidência obrigatória.', isoRef: 'Cl 9.3' },

      // ─── Fase 34: Readiness Review (8 itens de verificação final) ───
      'p34_1': { title: 'Verificação: Todas as Políticas Aprovadas', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status', type: 'select', options: ['Todas aprovadas e comunicadas', 'Maioria aprovada (>80%)', 'Parcialmente (<80%)', 'Pendente'], required: true },
        { id: 'list', label: 'Lista de políticas e versões', type: 'textarea', required: true },
        { id: 'gaps', label: 'Políticas pendentes (se houver)', type: 'textarea' }
      ], auditorTip: 'Readiness — Todas as políticas devem estar aprovadas antes do Stage 1.', isoRef: 'Cl 5.2' },

      'p34_2': { title: 'Verificação: SoA Finalizado com Evidências', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status da SoA', type: 'select', options: ['Completa com todas evidências', 'Completa, faltam evidências pontuais', 'Incompleta'], required: true },
        { id: 'coverage', label: 'Cobertura de evidências (%)', type: 'text', required: true }
      ], auditorTip: 'Cl 6.1.3d — SoA é o documento central de Stage 1.', isoRef: 'Cl 6.1.3d' },

      'p34_3': { title: 'Verificação: Risk Treatment Plan Implementado', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status', type: 'select', options: ['100% implementado', '>80% implementado', '50-80%', '<50%'], required: true },
        { id: 'pending', label: 'Ações pendentes', type: 'textarea' }
      ], auditorTip: 'Cl 6.1.3 — Todas as ações do plano devem estar implementadas ou justificadas.', isoRef: 'Cl 6.1.3' },

      'p34_4': { title: 'Verificação: Auditoria Interna Concluída', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status', type: 'select', options: ['Concluída, NCs corrigidas', 'Concluída, NCs em correção', 'Em andamento', 'Não realizada'], required: true },
        { id: 'report_ref', label: 'Referência do relatório', type: 'text' }
      ], auditorTip: 'Cl 9.2 — Auditoria interna deve estar concluída antes do Stage 1.', isoRef: 'Cl 9.2' },

      'p34_5': { title: 'Verificação: Análise Crítica Realizada', evidenceOnly: true, fields: [
        { id: 'status', label: 'Status', type: 'select', options: ['Realizada com ata', 'Agendada', 'Não realizada'], required: true },
        { id: 'date', label: 'Data', type: 'date' }
      ], auditorTip: 'Cl 9.3 — Análise crítica deve ser realizada antes do Stage 1.', isoRef: 'Cl 9.3' },

      'p34_6': { title: 'Verificação: NCs Corrigidas', evidenceOnly: true, fields: [
        { id: 'total', label: 'Total de NCs identificadas', type: 'text', required: true },
        { id: 'corrected', label: 'NCs corrigidas', type: 'text', required: true },
        { id: 'status', label: 'Status', type: 'select', options: ['Todas corrigidas e verificadas', 'Maioria corrigida', 'Correção em andamento'], required: true }
      ], auditorTip: 'Cl 10.1 — NCs da auditoria interna devem estar corrigidas antes da certificação.', isoRef: 'Cl 10.1' },

      'p34_7': { title: 'Verificação: Simulação de Stage 1', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data da simulação', type: 'date', required: true },
        { id: 'result', label: 'Resultado', type: 'select', options: ['Aprovado, pronto para Stage 1', 'Aprovado com ressalvas menores', 'Reprovado, precisa de ajustes'], required: true },
        { id: 'findings', label: 'Achados da simulação', type: 'textarea' }
      ], auditorTip: 'Preparação — Simulação reduz significativamente o risco de não conformidades.', isoRef: 'Preparação' },

      'p34_8': { title: 'Verificação: Readiness Score', evidenceOnly: true, fields: [
        { id: 'score', label: 'Score de prontidão', type: 'text', required: true, placeholder: 'Ex: 85%' },
        { id: 'status', label: 'Acima de 80%?', type: 'select', options: ['Sim, pronto para certificação', 'Marginal (70-80%)', 'Abaixo de 70% — não recomendado'], required: true },
        { id: 'gaps', label: 'Áreas com menor score', type: 'textarea' }
      ], auditorTip: 'Readiness — Score ≥80% indica boa probabilidade de sucesso na certificação.', isoRef: 'Readiness' },

      // ─── Fases 36-39: Pós-Auditoria ───
      'p36_3': { title: 'Evidência: Correções do Stage 1 Implementadas', evidenceOnly: true, fields: [
        { id: 'total', label: 'Total de achados a corrigir', type: 'text', required: true },
        { id: 'corrected', label: 'Quantos corrigidos', type: 'text', required: true },
        { id: 'evidence_desc', label: 'Evidências das correções', type: 'textarea', required: true }
      ], auditorTip: 'Stage 1 → Stage 2 — Correções devem estar implementadas antes do Stage 2.', isoRef: 'Cert' },

      'p36_4': { title: 'Evidência: Evidências de Correção Coletadas', evidenceOnly: true, fields: [
        { id: 'evidence_list', label: 'Lista de evidências coletadas', type: 'textarea', required: true },
        { id: 'storage', label: 'Onde estão armazenadas?', type: 'text', required: true }
      ], auditorTip: 'Stage 1 — Evidências devem estar organizadas e acessíveis.', isoRef: 'Cert' },

      'p37_1': { title: 'Evidência: Evidências de Implementação Organizadas', evidenceOnly: true, fields: [
        { id: 'structure', label: 'Como as evidências estão organizadas?', type: 'textarea', required: true, placeholder: 'Pasta por controle, por cláusula, ou por tema' },
        { id: 'format', label: 'Formato predominante', type: 'select', options: ['Digital (plataforma GRC)', 'Digital (pastas + planilha)', 'Misto (digital + físico)'], required: true },
        { id: 'status', label: 'Status de organização', type: 'select', options: ['Completo e acessível', 'Maioria organizada', 'Precisa de organização'], required: true }
      ], auditorTip: 'Stage 2 — Evidências desorganizadas atrasam a auditoria e causam má impressão.', isoRef: 'Cert Stage 2' },

      'p37_4': { title: 'Evidência: NCs do Stage 1 Corrigidas', evidenceOnly: true, fields: [
        { id: 'total', label: 'NCs do Stage 1', type: 'text', required: true },
        { id: 'corrected', label: 'Corrigidas', type: 'text', required: true },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'Stage 2 — O auditor verificará todas as correções do Stage 1.', isoRef: 'Cert' },

      'p37_5': { title: 'Evidência: Eficácia Operacional', evidenceOnly: true, fields: [
        { id: 'period', label: 'Período de operação evidenciado', type: 'text', required: true, placeholder: 'Ex: 3 meses de operação do SGSI' },
        { id: 'metrics', label: 'Métricas de eficácia', type: 'textarea', required: true, placeholder: 'KPIs atingidos, incidentes tratados, treinamentos realizados' },
        { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
      ], auditorTip: 'Stage 2 — O auditor quer ver que o SGSI funciona na prática, não apenas no papel.', isoRef: 'Cert Stage 2' },

      'p37_6': { title: 'Evidência: Logs de Auditoria Disponíveis', evidenceOnly: true, fields: [
        { id: 'logs_available', label: 'Logs disponíveis para o auditor', type: 'textarea', required: true, placeholder: 'Audit trail do sistema, logs de acesso, registros de mudanças' },
        { id: 'period', label: 'Período coberto', type: 'text', required: true }
      ], auditorTip: 'Stage 2 — Logs são evidência de operação real do SGSI.', isoRef: 'Cert Stage 2' },

      'p38_2': { title: 'Evidência: Evidências Solicitadas Fornecidas', evidenceOnly: true, fields: [
        { id: 'total_requested', label: 'Total de evidências solicitadas pelo auditor', type: 'text', required: true },
        { id: 'provided', label: 'Fornecidas com sucesso', type: 'text', required: true },
        { id: 'issues', label: 'Evidências não encontradas (se houver)', type: 'textarea' }
      ], auditorTip: 'Stage 2 — Resposta rápida às solicitações causa boa impressão.', isoRef: 'Cert Stage 2' },

      'p38_4': { title: 'Evidência: Encerramento Formal da Auditoria', evidenceOnly: true, fields: [
        { id: 'date', label: 'Data do encerramento', type: 'date', required: true },
        { id: 'result', label: 'Resultado comunicado', type: 'select', options: ['Recomendação para certificação', 'Certificação com NCs menores (90 dias)', 'NCs maiores (re-auditoria)', 'Não certificado'], required: true },
        { id: 'notes', label: 'Observações do auditor', type: 'textarea' }
      ], auditorTip: 'Stage 2 — O resultado formal define o próximo passo.', isoRef: 'Cert Stage 2' },

      'p39_2': { title: 'Evidência: NCs Menores Corrigidas (90 dias)', evidenceOnly: true, fields: [
        { id: 'total', label: 'Total de NCs menores', type: 'text', required: true },
        { id: 'corrected', label: 'Corrigidas', type: 'text', required: true },
        { id: 'deadline', label: 'Prazo', type: 'date' },
        { id: 'evidence_desc', label: 'Evidências enviadas à certificadora', type: 'textarea', required: true }
      ], auditorTip: 'Pós-auditoria — NCs menores devem ser corrigidas em até 90 dias.', isoRef: 'Cert' },

      'p39_3': { title: 'Evidência: Certificado Recebido', evidenceOnly: true, fields: [
        { id: 'cert_date', label: 'Data de emissão do certificado', type: 'date', required: true },
        { id: 'cert_body', label: 'Organismo certificador', type: 'text', required: true, placeholder: 'Ex: BSI, Bureau Veritas, DNV, TÜV' },
        { id: 'cert_number', label: 'Número do certificado', type: 'text' },
        { id: 'validity', label: 'Validade (3 anos)', type: 'date' },
        { id: 'scope', label: 'Escopo certificado', type: 'textarea' }
      ], auditorTip: 'Certificação — Parabéns! Agora começa a fase de manutenção.', isoRef: 'Cert' }
    };

    // ponytail: DOC_WIZARDS populated for all 6 journeys


    // ═══════════════════════════════════════════════════════════════
    //  openDocWizard — Multi-step wizard for guided document generation
    // ═══════════════════════════════════════════════════════════════
    window.openDocWizard = function(projectId, itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) { generateDocumentNatively(projectId, itemId, event.target); return; }

        // Pre-fill from existing notes if available
        const noteKey = projectId + '_' + itemId;
        let savedAnswers = {};
        try {
            const raw = (S.phaseChecksNotes && S.phaseChecksNotes[noteKey]) || '';
            if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) savedAnswers = JSON.parse(raw);
        } catch(e) {}

        let fieldsHtml = wiz.fields.map(f => {
            const val = savedAnswers[f.id] || '';
            const escapedVal = typeof val === 'string' ? val.replace(/"/g, '&quot;').replace(/</g, '&lt;') : val;
            const req = f.required ? '<span style="color:#ff4d4d">*</span>' : '';
            let input = '';
            if (f.type === 'textarea') {
                input = `<textarea id="wiz-${f.id}" class="form-input" style="width:100%; min-height:80px; font-size:0.8rem; resize:vertical; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text); font-family:inherit;" placeholder="${f.placeholder || ''}">${escapedVal}</textarea>`;
            } else if (f.type === 'select') {
                const opts = (f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
                input = `<select id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);"><option value="">Selecionar...</option>${opts}</select>`;
            } else if (f.type === 'date') {
                input = `<input type="date" id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);" value="${escapedVal}">`;
            } else {
                input = `<input type="text" id="wiz-${f.id}" class="form-input" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; color:var(--text);" value="${escapedVal}" placeholder="${f.placeholder || ''}">`;
            }
            return `<div style="margin-bottom:1rem;"><label style="font-size:0.75rem; color:var(--text-dim); font-weight:500; display:block; margin-bottom:4px;">${f.label} ${req}</label>${input}</div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${escapeHTML(wiz.title)}</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding:1.5rem 0;">
                <div style="background:rgba(0,173,232,0.04); border:1px solid rgba(0,173,232,0.1); border-radius:10px; padding:12px; margin-bottom:1.25rem; font-size:0.75rem;">
                    <div style="color:var(--accent); font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.65rem; letter-spacing:0.5px;">Dica do Auditor (${wiz.isoRef})</div>
                    <div style="color:var(--text); line-height:1.4;">${escapeHTML(wiz.auditorTip)}</div>
                </div>
                <div id="wiz-form-fields">${fieldsHtml}</div>
                <div id="wiz-preview-area" style="display:none;"></div>
                <div id="wiz-actions" style="display:flex; justify-content:flex-end; gap:10px; margin-top:1.25rem;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn" onclick="wizSaveProgress('${projectId}', '${itemId}')" style="border-color:var(--accent); color:var(--accent);">Salvar Rascunho</button>
                    <button class="btn btn-primary" id="wiz-generate-btn" onclick="wizGenerate('${projectId}', '${itemId}', this)">Gerar Documento</button>
                </div>
            </div>
        `, 'modal-large');
    };

    window.wizCollectFields = function(itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) return {};
        const data = {};
        wiz.fields.forEach(f => {
            const el = document.getElementById('wiz-' + f.id);
            if (el) data[f.id] = el.value || '';
        });
        return data;
    };

    window.wizSaveProgress = function(projectId, itemId) {
        const data = wizCollectFields(itemId);
        const noteKey = projectId + '_' + itemId;
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[noteKey] = JSON.stringify(data);
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        showToast('Rascunho salvo localmente');
    };

    window.wizGenerate = async function(projectId, itemId, btnEl) {
        const wiz = DOC_WIZARDS[itemId];
        const data = wizCollectFields(itemId);
        // Validate required fields
        const missing = wiz.fields.filter(f => f.required && !data[f.id]);
        if (missing.length > 0) {
            showToast('Preencha os campos obrigatórios: ' + missing.map(f => f.label).join(', '), 'error');
            return;
        }
        // Save progress first
        wizSaveProgress(projectId, itemId);
        const prevText = btnEl.textContent;
        btnEl.disabled = true;

        // ponytail: evidenceOnly items generate document locally without AI
        if (wiz.evidenceOnly) {
            btnEl.textContent = 'Gerando registro...';
            let content = '# ' + wiz.title + '\n\n';
            content += '**Referência ISO:** ' + wiz.isoRef + '\n';
            content += '**Data de registro:** ' + new Date().toLocaleDateString('pt-BR') + '\n\n';
            content += '---\n\n';
            wiz.fields.forEach(f => {
                if (data[f.id]) content += '## ' + f.label + '\n' + data[f.id] + '\n\n';
            });
            if (wiz.auditorTip) content += '---\n\n> **Nota do Auditor:** ' + wiz.auditorTip + '\n';
            if (wiz.linkedTo) content += '\n> **Vinculado a:** ' + wiz.linkedTo + '\n';
            // Show preview directly
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="margin-bottom:0.75rem; font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Preview do Registro de Evidência</div>
                <textarea id="wiz-doc-content" class="form-input" style="width:100%; height:350px; font-family:monospace; font-size:0.8rem; line-height:1.5; background:rgba(0,0,0,0.3); resize:vertical; padding:12px; color:var(--text); border:1px solid var(--border); border-radius:8px;">${escapeHTML(content)}</textarea>
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn" onclick="wizBackToForm('${projectId}', '${itemId}')" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Voltar e Editar</button>
                <button class="btn btn-primary" onclick="wizApprove('${projectId}', '${itemId}', this)">Confirmar e Registrar Evidência</button>
            `;
            btnEl.disabled = false;
            btnEl.textContent = prevText;
            return;
        }

        btnEl.textContent = 'Gerando documento...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-document`, { itemId, fields: data });
            // Show preview
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="margin-bottom:0.75rem; font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Preview do Documento Gerado</div>
                <textarea id="wiz-doc-content" class="form-input" style="width:100%; height:350px; font-family:monospace; font-size:0.8rem; line-height:1.5; background:rgba(0,0,0,0.3); resize:vertical; padding:12px; color:var(--text); border:1px solid var(--border); border-radius:8px;">${escapeHTML(res.content || '')}</textarea>
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn" onclick="wizBackToForm('${projectId}', '${itemId}')" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Voltar e Editar Dados</button>
                <button class="btn btn-primary" onclick="wizApprove('${projectId}', '${itemId}', this)">Aprovar e Salvar como Evidencia</button>
            `;
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.wizBackToForm = function(projectId, itemId) {
        document.getElementById('wiz-form-fields').style.display = 'block';
        document.getElementById('wiz-preview-area').style.display = 'none';
        document.getElementById('wiz-actions').innerHTML = `
            <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
            <button class="btn" onclick="wizSaveProgress('${projectId}', '${itemId}')" style="border-color:var(--accent); color:var(--accent);">Salvar Rascunho</button>
            <button class="btn btn-primary" id="wiz-generate-btn" onclick="wizGenerate('${projectId}', '${itemId}', this)">Gerar Documento</button>
        `;
    };

    window.wizApprove = async function(projectId, itemId, btnEl) {
        const content = document.getElementById('wiz-doc-content').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('POST', `/api/v1/projects/${projectId}/approve-document`, { itemId, content });
            showToast('Documento aprovado e salvo como evidência!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao aprovar: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    // ═══════════════════════════════════════════════════════════════
    //  INTERVIEWS BY TRACK (FASE 2 - p2_2)
    // ═══════════════════════════════════════════════════════════════

    window.openInterviewWizard = function(projectId) {
        const tracks = [
            { id: 'executiva', name: 'Executiva' },
            { id: 'tecnologia', name: 'Tecnologia' },
            { id: 'juridico', name: 'Jurídico' },
            { id: 'rh', name: 'Recursos Humanos' },
            { id: 'operacoes', name: 'Operações' }
        ];

        // Ensure track progress state initialized
        if (!S.interviewProgress) S.interviewProgress = {};

        const sidebarHtml = tracks.map(t => {
            const isDone = S.interviewProgress[projectId + '_' + t.id];
            const check = isDone ? '<span style="color:var(--success); font-weight:bold; margin-right:4px;">✓</span>' : '';
            return `<div class="wizard-sidebar-item" id="track-tab-${t.id}" onclick="changeInterviewTrack('${projectId}', '${t.id}')" style="padding: 10px 12px; font-size: 0.8rem; border-radius: 8px; cursor: pointer; color: var(--text-dim); transition: all 0.2s; border-left: 3px solid transparent; display: flex; align-items: center; justify-content: space-between;">
                <span>${check}${t.name}</span>
            </div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Conduzir Entrevistas por Trilha (Mapeamento Inicial)</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding: 1.25rem 0; display: flex; gap: 20px; min-height: 480px;">
                <div style="width: 200px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid var(--border); padding-right: 12px;">
                    <div style="font-size: 0.65rem; color: var(--accent); font-weight: 700; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Trilhas de Auditoria</div>
                    ${sidebarHtml}
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-left: 8px;">
                    <div id="interview-questions-container" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                        <div class="empty-state">
                            <h3>Selecione uma Trilha</h3>
                            <p>Escolha uma trilha na barra lateral para iniciar a entrevista.</p>
                        </div>
                    </div>
                    <div id="interview-actions-container" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem;">
                        <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Fechar</button>
                        <div id="interview-buttons-right" style="display: flex; gap: 10px;"></div>
                    </div>
                </div>
            </div>
        `, 'modal-large');

        // Automatically load first track
        changeInterviewTrack(projectId, 'executiva');
    };

    window.changeInterviewTrack = async function(projectId, track) {
        // Highlight active tab
        document.querySelectorAll('.wizard-sidebar-item').forEach(el => {
            el.style.background = 'none';
            el.style.color = 'var(--text-dim)';
            el.style.borderLeftColor = 'transparent';
        });
        const tabEl = document.getElementById('track-tab-' + track);
        if (tabEl) {
            tabEl.style.background = 'rgba(0,173,232,0.05)';
            tabEl.style.color = 'var(--text)';
            tabEl.style.borderLeftColor = 'var(--accent)';
        }

        const container = document.getElementById('interview-questions-container');
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-dim);">Carregando perguntas...</div>';
        document.getElementById('interview-buttons-right').innerHTML = '';

        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/interviews/${track}`);
            const qs = res.questions || [];

            if (qs.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>Sem perguntas</h3><p>Nenhuma pergunta cadastrada para esta trilha.</p></div>';
                return;
            }

            // Save active track questions metadata globally in S
            S.activeInterviewTrackQuestions = qs;

            container.innerHTML = qs.map((q, idx) => {
                const ans = q.answer || '';
                const who = q.interviewee || '';
                const gap = q.gap_detected === 1;

                return `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 10px; padding: 1.25rem; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); margin-bottom: 12px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text); line-height: 1.4;">
                            ${idx + 1}. ${escapeHTML(q.question)}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
                            <label style="font-size: 0.65rem; color: var(--text-dim); font-weight: 500;">Resposta / Constatação do Auditor</label>
                            <textarea id="ans-${q.key}" class="form-input" style="width: 100%; min-height: 70px; font-size: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); resize: vertical; font-family: inherit;" placeholder="Registre a resposta ou evidências coletadas...">${escapeHTML(ans)}</textarea>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center; margin-top: 4px;">
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                <label style="font-size: 0.65rem; color: var(--text-dim); font-weight: 500;">Entrevistado (Nome / Cargo)</label>
                                <input type="text" id="who-${q.key}" class="form-input" style="font-size: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; color: var(--text);" value="${escapeHTML(who)}" placeholder="Ex: João CISO, Maria DevOps">
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; padding-top: 16px;">
                                <input type="checkbox" id="gap-${q.key}" ${gap ? 'checked' : ''} style="cursor: pointer;">
                                <label for="gap-${q.key}" style="font-size: 0.75rem; color: #ff4d4d; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    ⚠️ Lacuna Detectada
                                </label>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Load buttons
            const tracksList = ['executiva', 'tecnologia', 'juridico', 'rh', 'operacoes'];
            const allSaved = tracksList.every(tId => S.interviewProgress[projectId + '_' + tId]);

            let rightButtons = `<button class="btn btn-primary" onclick="saveInterviewTrack('${projectId}', '${track}', this)">Salvar Trilha</button>`;
            if (allSaved) {
                rightButtons += `<button class="btn btn-primary" onclick="completeInterviewsTask('${projectId}', this)" style="background: var(--success); border-color: var(--success)">Concluir e Registrar</button>`;
            }

            document.getElementById('interview-buttons-right').innerHTML = rightButtons;

        } catch (e) {
            container.innerHTML = `<div style="color:#ff4d4d; text-align:center; padding:3rem;">Erro ao carregar perguntas: ${escapeHTML(e.message)}</div>`;
        }
    };

    window.saveInterviewTrack = async function(projectId, track, btnEl) {
        const qs = S.activeInterviewTrackQuestions || [];
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';

        try {
            // Post each question-answer sequentially
            for (const q of qs) {
                const answer = document.getElementById('ans-' + q.key).value.trim();
                const interviewee = document.getElementById('who-' + q.key).value.trim();
                const gap_detected = document.getElementById('gap-' + q.key).checked ? 1 : 0;

                if (answer) {
                    await api('POST', `/api/v1/projects/${projectId}/interviews`, {
                        track,
                        question: q.question,
                        answer,
                        interviewee,
                        gap_detected
                    });
                }
            }

            showToast(`Trilha '${track.toUpperCase()}' salva com sucesso!`);
            
            // Mark progress
            S.interviewProgress[projectId + '_' + track] = true;
            localStorage.setItem('niso_interviewProgress', JSON.stringify(S.interviewProgress));

            // Reload wizard modal to update tabs checkmarks and complete buttons
            openInterviewWizard(projectId);
            changeInterviewTrack(projectId, track);

        } catch (e) {
            showToast('Erro ao salvar respostas: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.completeInterviewsTask = async function(projectId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Concluindo...';

        try {
            const checkKey = `${projectId}_p2_2`;
            S.phaseChecks[checkKey] = true;
            localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));

            await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, {
                items: [{
                    phase_number: 2,
                    item_id: 'p2_2',
                    is_checked: true,
                    notes: 'Entrevistas por trilha (Executiva, Tecnologia, Jurídico, RH, Operações) concluídas e registradas.',
                    assigned_to: S.user ? S.user.id : null,
                    due_date: null
                }]
            });

            showToast('Entrevistas por trilha concluídas e checklist atualizado!');
            forceCloseModal();
            render();
        } catch (e) {
            showToast('Erro ao concluir tarefa: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    const ISO_GUIDELINES = {
        'p0_1': { control: 'Cl 5.1', tip: 'Definir sponsor executivo', advice: 'O auditor vai buscar atas de reuniões ou nomeações formais assinadas pela diretoria definindo a liderança do SGSI.', evidence: 'Termo de Compromisso assinado ou Ata de Reunião Executiva.' },
        'p0_3': { control: 'Cl 7.4', tip: 'Ata do Kick-off', advice: 'A ata deve conter a pauta, lista de participantes assinada e a formalização das responsabilidades de segurança.', evidence: 'Ata de reunião em PDF ou Documento Interno com participantes.' },
        'p0_5': { control: 'Cl 5.2', tip: 'Carta de Mandato', advice: 'A política geral de segurança da informação (mandato) deve estar assinada e aprovada pela alta administração.', evidence: 'Carta de Mandato assinada digitalmente.' },
        'p3_1': { control: 'Cl 4.3', tip: 'Escopo do SGSI', advice: 'A definição de escopo deve ser clara, justificar exclusões e delimitar perfeitamente o perímetro de infraestrutura/serviços.', evidence: 'Documento de Escopo (Cláusula 4.3).' },
        'p5_5': { control: 'A.5.15', tip: 'Controle de Acesso', advice: 'O auditor quer ver as regras de concessão, revisão periódica e revogação de acessos de usuários e administradores.', evidence: 'Política de Controle de Acesso.' },
        'p7_2': { control: 'A.5.9', tip: 'Inventário de Ativos', advice: 'O inventário deve listar proprietários de ativos, localização física/em nuvem e nível de classificação da informação.', evidence: 'Inventário de Ativos de Informação.' },
        'p11_1': { control: 'A.5.7', tip: 'Intel de Ameaças', advice: 'Mapeamento de fontes de inteligência de ameaças externas utilizadas para mitigar vulnerabilidades ativamente.', evidence: 'Procedimento de Threat Intelligence.' },
        'p14_1': { control: 'A.5.1', tip: 'Políticas de Segurança', advice: 'Conjunto formalizado de diretrizes de segurança da informação revisadas anualmente.', evidence: 'Manual de Políticas do SGSI.' },
        'p14_2': { control: 'A.7.7', tip: 'Mesa Limpa / Tela Limpa', advice: 'Definição de bloqueio automático de tela (máx 5min) e política de mesa limpa nos escritórios.', evidence: 'Política de Mesa Limpa e Tela Limpa.' },
        'p14_3': { control: 'A.5.10', tip: 'Uso Aceitável', advice: 'Os termos de uso aceitável de ativos devem ser assinados por todos os funcionários na contratação.', evidence: 'Política de Uso Aceitável (AUP).' },
        'p14_4': { control: 'A.8.24', tip: 'Criptografia', advice: 'Regras para uso de chaves criptográficas, SSH, algoritmos permitidos (mínimo AES-256) e SSL/TLS.', evidence: 'Política de Criptografia.' },
        'p14_5': { control: 'A.5.24', tip: 'Gestão de Incidentes', advice: 'Fluxo claro de reporte de incidentes, canais de denúncia e registro cronológico dos eventos de segurança.', evidence: 'Plano de Resposta a Incidentes.' },
        'p14_6': { control: 'A.5.29', tip: 'Continuidade de Negócios', advice: 'Procedimentos de recuperação de desastres (DRP) e testes de backup anuais documentados.', evidence: 'Plano de Continuidade de Negócios (BCP).' },
        'p14_7': { control: 'A.8.11', tip: 'Mascaramento de Dados', advice: 'Regras de anonimização e minimização de dados sensíveis em ambientes de testes e produção.', evidence: 'Política de Privacidade e Mascaramento.' },
        'p14_8': { control: 'A.8.28', tip: 'Desenvolvimento Seguro', advice: 'Políticas de ciclo de vida seguro (SDLC), testes de vulnerabilidade SAST/DAST e revisão de código.', evidence: 'Política de Desenvolvimento Seguro (SDLC).' },
        'p14_9': { control: 'A.8.9', tip: 'Gerenciamento de Configuração', advice: 'Padrões de hardening de servidores e auditoria de alterações de infraestrutura.', evidence: 'Política de Configuração e Hardening.' },
        'p14_10': { control: 'A.5.19', tip: 'Segurança de Fornecedores', advice: 'Processo de avaliação de fornecedores críticos de nuvem/software e cláusulas de segurança padrão.', evidence: 'Política de Segurança de Fornecedores.' },
        'p21_1': { control: 'Cl 6.1.3', tip: 'Declaração de Aplicabilidade (SoA)', advice: 'O SoA deve conter todos os 93 controles da Annex A com justificativa explícita de inclusão ou exclusão.', evidence: 'Statement of Applicability (SoA) gerado.' }
    };

    window.toggleAuditorTip = function(itemId) {
        if (!S.expandedTips) S.expandedTips = {};
        S.expandedTips[itemId] = !S.expandedTips[itemId];
        render();
    };

    window.formatActivityNotes = function(notes) {
        if (!notes) return '';
        const trimmed = notes.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const obj = JSON.parse(trimmed);
                const parts = [];
                for (const [key, val] of Object.entries(obj)) {
                    let label = key;
                    if (key === 'engagement') label = 'Engajamento';
                    else if (key === 'trustScore') label = 'Confiança';
                    else if (key === 'sub_id') label = 'ID Cliente';
                    else if (key === 'timeline') label = 'Prazo';
                    else if (key === 'main_risk') label = 'Risco Principal';
                    
                    parts.push(`<span style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px; margin-right:4px;"><strong>${label}</strong>: ${val}</span>`);
                }
                return `<div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.7rem; color:var(--text-dim); margin-bottom:8px;">${parts.join('')}</div>`;
            } catch (e) {}
        }
        return '';
    };

    window.toggleChecklistDetails = function(itemId) {
        if (!S.expandedChecklistDetails) S.expandedChecklistDetails = {};
        S.expandedChecklistDetails[itemId] = !S.expandedChecklistDetails[itemId];
        render();
    };

    const JORNADA_QUESTIONS = {
        0: {
            title: "Alinhamento e Escopo (Jornada 1)",
            desc: "Mapeie o engajamento da diretoria, orçamento e escopo do SGSI.",
            questions: [
                { key: "sponsor", label: "1. O sponsor executivo (diretoria) está engajado?", type: "select", options: [
                    { val: "sim", text: "Sim, patrocinador ativo nomeado" },
                    { val: "parcial", text: "Parcialmente, apoia mas não acompanha" },
                    { val: "nao", text: "Não, sem patrocinador executivo claro" }
                ]},
                { key: "budget", label: "2. O orçamento anual do SGSI foi aprovado?", type: "select", options: [
                    { val: "sim", text: "Sim, orçamento integral disponível" },
                    { val: "parcial", text: "Aprovado sob demanda por projeto" },
                    { val: "nao", text: "Não, sem orçamento reservado" }
                ]},
                { key: "scope", label: "3. Qual a abrangência do escopo do SGSI?", type: "select", options: [
                    { val: "total", text: "Toda a empresa (todas as áreas e escritórios)" },
                    { val: "prod", text: "Apenas o produto SaaS e infraestrutura principal" },
                    { val: "ti", text: "Apenas o departamento de TI" }
                ]}
            ]
        },
        1: {
            title: "Coleta de Ativos & Riscos (Jornada 2)",
            desc: "Responda às perguntas abaixo para preencher os ativos iniciais e riscos.",
            questions: [
                { key: "cloud", label: "1. Onde está hospedada sua infraestrutura?", type: "select", options: [
                    { val: "aws", text: "Amazon Web Services (AWS)" },
                    { val: "azure", text: "Microsoft Azure" },
                    { val: "gcp", text: "Google Cloud Platform (GCP)" },
                    { val: "local", text: "Infraestrutura Local (On-premises)" }
                ]},
                { key: "db", label: "2. Onde os bancos de dados estão localizados?", type: "select", options: [
                    { val: "nuvem", text: "Banco de Dados Gerenciado (RDS, Cloud SQL, etc.)" },
                    { val: "local", text: "Servidor de Banco Próprio (VM/Físico)" }
                ]},
                { key: "dev", label: "3. A empresa realiza desenvolvimento interno de software?", type: "select", options: [
                    { val: "sim", text: "Sim, possuímos equipe de engenharia/devs" },
                    { val: "nao", text: "Não, usamos apenas softwares de terceiros (SaaS/COTS)" }
                ]},
                { key: "auth", label: "4. Utilizam algum provedor de identidade centralizado (IdP)?", type: "select", options: [
                    { val: "sim", text: "Sim (Google Workspace, Okta, Azure AD/Entra ID)" },
                    { val: "nao", text: "Não, controle manual de logins por sistema" }
                ]}
            ]
        },
        2: {
            title: "Controles do SGSI (Jornada 3)",
            desc: "Mapeie o nível atual dos controles de segurança lógica da informação.",
            questions: [
                { key: "encryption", label: "1. Utilizam criptografia nos dados confidenciais em repouso?", type: "select", options: [
                    { val: "sim", text: "Sim, criptografia total (discos e bancos)" },
                    { val: "parcial", text: "Apenas em tabelas críticas selecionadas" },
                    { val: "nao", text: "Não, sem criptografia em repouso" }
                ]},
                { key: "backup", label: "2. Com que frequência testam a restauração do backup?", type: "select", options: [
                    { val: "mensal", text: "Mensalmente ou mais frequente" },
                    { val: "semestral", text: "Semestralmente" },
                    { val: "nunca", text: "Nunca testamos restauração de backup" }
                ]},
                { key: "mfa", label: "3. O uso de MFA (Duplo Fator) é obrigatório?", type: "select", options: [
                    { val: "todos", text: "Sim, para todos os colaboradores e acessos" },
                    { val: "admin", text: "Apenas para administradores e acessos críticos" },
                    { val: "nao", text: "Não possuímos política obrigatória" }
                ]}
            ]
        },
        3: {
            title: "Controles do PIMS/SGPI (Jornada 4)",
            desc: "Verifique o nível de preparação para os requisitos de privacidade da ISO 27701.",
            questions: [
                { key: "dpo", label: "1. Possui encarregado de dados (DPO) formalizado?", type: "select", options: [
                    { val: "sim", text: "Sim, interno ou terceirizado (DPO as a Service)" },
                    { val: "nao", text: "Não, sem nomeação formal" }
                ]},
                { key: "ropa", label: "2. O Registro de Operações (ROPA) está mapeado?", type: "select", options: [
                    { val: "completo", text: "Sim, mapeado e revisado anualmente" },
                    { val: "andamento", text: "Parcial/Em andamento" },
                    { val: "nao", text: "Não possuímos ROPA" }
                ]},
                { key: "dsr", label: "3. Existe procedimento para atendimento de direitos dos titulares?", type: "select", options: [
                    { val: "sim", text: "Sim, com canal e SLA de atendimento definido" },
                    { val: "nao", text: "Não há canal ou procedimento estruturado" }
                ]}
            ]
        },
        4: {
            title: "Consciência & Auditoria Interna (Jornada 5)",
            desc: "Avalie os controles operacionais e preparação final da auditoria estágio 1.",
            questions: [
                { key: "training", label: "1. Realizam treinamentos de segurança de dados?", type: "select", options: [
                    { val: "sim", text: "Sim, treinamento anual + onboarding" },
                    { val: "integracao", text: "Apenas durante a integração inicial" },
                    { val: "nao", text: "Não há treinamentos periódicos" }
                ]},
                { key: "audit", label: "2. A auditoria interna do SGSI foi executada?", type: "select", options: [
                    { val: "sim", text: "Sim, auditoria realizada por terceiro ou equipe certificada" },
                    { val: "planejado", text: "Agendada/Em planejamento" },
                    { val: "nao", text: "Não realizada ou planejada" }
                ]},
                { key: "review", label: "3. A Revisão pela Direção (Management Review) foi realizada?", type: "select", options: [
                    { val: "sim", text: "Sim, ata assinada pela diretoria" },
                    { val: "nao", text: "Não realizada" }
                ]}
            ]
        },
        5: {
            title: "Preparação para Certificação (Jornada 6)",
            desc: "Fase final de contratação da auditoria de terceira parte.",
            questions: [
                { key: "certifier", label: "1. O organismo de certificação foi contratado?", type: "select", options: [
                    { val: "sim", text: "Sim, contrato assinado e datas agendadas" },
                    { val: "negociacao", text: "Em negociação/cotação de propostas" },
                    { val: "nao", text: "Não iniciamos contato com certificadoras" }
                ]},
                { key: "capa", label: "2. Existe um processo ativo de não-conformidade e ação corretiva?", type: "select", options: [
                    { val: "sim", text: "Sim, registramos no módulo CAPA" },
                    { val: "nao", text: "Não há controle formal de melhorias" }
                ]}
            ]
        }
    };

    window.openJornadaQuestionnaire = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const config = JORNADA_QUESTIONS[jIdx];
        if (!config) return;
        const answersKey = projectId + '_j' + jIdx;
        const currentAnswers = S.jornadaAnswers[answersKey] || {};

        let questionsHtml = '';
        config.questions.forEach(q => {
            let optionsHtml = '';
            q.options.forEach(opt => {
                optionsHtml += `<option value="${opt.val}" ${currentAnswers[q.key] === opt.val ? 'selected' : ''}>${opt.text}</option>`;
            });
            questionsHtml += `
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">${q.label}</label>
                    <select id="q-${q.key}" class="form-input" style="width:100%;">
                        ${optionsHtml}
                    </select>
                </div>
            `;
        });

        openModal(`
            <div class="modal-header">
                <span class="modal-title">📋 ${config.title}</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="padding:1.5rem 0; text-align:left;">
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1.5rem;">
                    ${config.desc}
                </p>
                ${questionsHtml}
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn btn-primary" onclick="saveJornadaQuestionnaire(${jIdx}, '${projectId}')">Salvar Questionário</button>
                </div>
            </div>
        `);
    };

    window.saveJornadaQuestionnaire = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const config = JORNADA_QUESTIONS[jIdx];
        if (!config) return;
        const answersKey = projectId + '_j' + jIdx;
        const answers = {};
        config.questions.forEach(q => {
            answers[q.key] = document.getElementById(`q-${q.key}`).value;
        });
        S.jornadaAnswers[answersKey] = answers;
        showToast('Questionário de diagnóstico salvo com sucesso!');
        forceCloseModal();
        render();
    };

    window.renderJourneyDiagnosticPanel = function(jIdx, projectId) {
        if (!S.jornadaAnswers) S.jornadaAnswers = {};
        const answersKey = projectId + '_j' + jIdx;
        const answers = S.jornadaAnswers[answersKey];
        if (!answers) {
            return `
                <div style="margin: 0 1rem 1rem 1rem; padding: 12px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border); border-radius: 8px; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 0.72rem; color: var(--text-dim);">
                        💡 <strong>Diagnóstico Pendente:</strong> Responda ao questionário desta jornada para receber recomendações e adequação automática dos controles do SGSI.
                    </div>
                    <button class="btn-inline-action" style="border-color:var(--accent); color:var(--accent); font-weight:600;" onclick="openJornadaQuestionnaire(${jIdx}, '${projectId}'); event.stopPropagation();">Iniciar Diagnóstico</button>
                </div>
            `;
        }

        let summaryHtml = '';
        let suggestionsList = '';

        if (jIdx === 0) {
            const sponsorText = answers.sponsor === 'sim' ? 'Engajado' : answers.sponsor === 'parcial' ? 'Parcial' : 'Sem Patrocínio';
            const budgetText = answers.budget === 'sim' ? 'Aprovado' : answers.budget === 'parcial' ? 'Sob Demanda' : 'Sem Orçamento';
            const scopeText = answers.scope === 'total' ? 'Corporativo' : answers.scope === 'prod' ? 'Foco SaaS' : 'Foco TI';

            summaryHtml = `<strong>Sponsor:</strong> ${sponsorText} | <strong>Orçamento:</strong> ${budgetText} | <strong>Escopo:</strong> ${scopeText}`;

            if (answers.sponsor !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Sem sponsor executivo ativo:</strong> Risco crítico para a certificação (Requisito Cl 5.1). Recomendamos formalizar a nomeação do comitê com ata assinada.</li>`;
            }
            if (answers.budget === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem orçamento de segurança:</strong> Risco ao cronograma de contratação da certificadora. Recomenda-se reservar verba de auditoria externa preventiva.</li>`;
            }
            if (answers.scope === 'ti' || answers.scope === 'prod') {
                suggestionsList += `<li>💡 <strong>Escopo restrito:</strong> Garanta que as fronteiras físicas e de redes estejam claramente delimitadas no documento de Escopo do SGSI (Requisito Cl 4.3).</li>`;
            }
        } 
        else if (jIdx === 1) {
            const cloudLabel = answers.cloud === 'aws' ? 'AWS' : answers.cloud === 'azure' ? 'Azure' : answers.cloud === 'gcp' ? 'GCP' : 'Local';
            const dbLabel = answers.db === 'nuvem' ? 'Gerenciado' : 'Próprio';
            const devLabel = answers.dev === 'sim' ? 'Sim' : 'Não';
            const authLabel = answers.auth === 'sim' ? 'Sim' : 'Não';

            summaryHtml = `<strong>Infra:</strong> ${cloudLabel} | <strong>Banco:</strong> ${dbLabel} | <strong>Dev:</strong> ${devLabel} | <strong>IDP:</strong> ${authLabel}`;

            if (answers.cloud !== 'local') {
                suggestionsList += `<li>💡 <strong>Cloud (${cloudLabel}):</strong> Revisar políticas do controle A.5.23 (Segurança de Serviços em Nuvem) e exigir MFA em todos os consoles.</li>`;
            }
            if (answers.db === 'local') {
                suggestionsList += `<li>💡 <strong>Servidor de Banco de Dados Próprio:</strong> Implementar política rigorosa de backup criptografado fora do ambiente de execução (A.8.13 e A.8.24).</li>`;
            }
            if (answers.dev === 'sim') {
                suggestionsList += `<li>💡 <strong>Desenvolvimento Interno:</strong> Ativar testes estáticos de segurança (SAST) e diretrizes para o controle A.8.28 (Segurança em Desenvolvimento).</li>`;
            }
            if (answers.auth === 'sim') {
                suggestionsList += `<li>💡 <strong>IDP Centralizado:</strong> Habilitar provisionamento automatizado de credenciais e MFA em todos os endpoints de colaboração (A.5.15).</li>`;
            }
        }
        else if (jIdx === 2) {
            const encText = answers.encryption === 'sim' ? 'Total' : answers.encryption === 'parcial' ? 'Parcial' : 'Inativo';
            const backupText = answers.backup === 'mensal' ? 'Mensal' : answers.backup === 'semestral' ? 'Semestral' : 'Sem Testes';
            const mfaText = answers.mfa === 'todos' ? 'Obrigatório' : answers.mfa === 'admin' ? 'Apenas Admin' : 'Inativo';

            summaryHtml = `<strong>Cripto:</strong> ${encText} | <strong>Testes de Backup:</strong> ${backupText} | <strong>MFA:</strong> ${mfaText}`;

            if (answers.encryption !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Criptografia em repouso pendente:</strong> Essencial para proteger dados contra quebra física (A.8.24). Habilitar criptografia transparente no banco de dados.</li>`;
            }
            if (answers.backup === 'nunca') {
                suggestionsList += `<li>⚠️ <strong>Sem testes de restauração:</strong> O auditor irá solicitar registros dos testes dos últimos 12 meses. Configure teste de simulação mensal (A.8.13).</li>`;
            }
            if (answers.mfa !== 'todos') {
                suggestionsList += `<li>⚠️ <strong>MFA parcial ou inativo:</strong> Vulnerabilidade de controle de acesso (A.5.15). Ativar MFA obrigatório para toda equipe e e-mail corporativo.</li>`;
            }
        }
        else if (jIdx === 3) {
            const dpoText = answers.dpo === 'sim' ? 'Formalizado' : 'Pendente';
            const ropaText = answers.ropa === 'completo' ? 'Mapeado' : answers.ropa === 'andamento' ? 'Parcial' : 'Inativo';
            const dsrText = answers.dsr === 'sim' ? 'Estruturado' : 'Pendente';

            summaryHtml = `<strong>DPO:</strong> ${dpoText} | <strong>ROPA:</strong> ${ropaText} | <strong>Direitos Titulares:</strong> ${dsrText}`;

            if (answers.dpo === 'nao') {
                suggestionsList += `<li>💡 <strong>Sem DPO nomeado:</strong> Para ISO 27701 (Cl 7.2.1) e LGPD, nomeie formalmente o encarregado de dados e publique o contato de e-mail no site.</li>`;
            }
            if (answers.ropa !== 'completo') {
                suggestionsList += `<li>💡 <strong>ROPA pendente ou parcial:</strong> Utilize o módulo ROPA do nISO para mapear o fluxo de tratamento de cada dado pessoal coletado (Cl 7.3.2).</li>`;
            }
            if (answers.dsr === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem canal para titulares:</strong> OBRIGATÓRIO implementar canal de requisição DSR e registrar tempos de resposta no relatório de privacidade (Cl 7.3.1).</li>`;
            }
        }
        else if (jIdx === 4) {
            const trText = answers.training === 'sim' ? 'Periódico' : answers.training === 'integracao' ? 'Integração' : 'Pendente';
            const audText = answers.audit === 'sim' ? 'Realizada' : answers.audit === 'planejado' ? 'Planejada' : 'Pendente';
            const revText = answers.review === 'sim' ? 'Realizada' : 'Pendente';

            summaryHtml = `<strong>Treinamento:</strong> ${trText} | <strong>Auditoria Interna:</strong> ${audText} | <strong>Revisão Direção:</strong> ${revText}`;

            if (answers.training !== 'sim') {
                suggestionsList += `<li>💡 <strong>Conscientização pendente:</strong> Implementar programa contínuo de conscientização (phishing simulado e segurança) além da integração (Cl 7.3).</li>`;
            }
            if (answers.audit !== 'sim') {
                suggestionsList += `<li>⚠️ <strong>Auditoria Interna pendente:</strong> Requisito obrigatório para o Estágio 1 da certificação. Agende a auditoria antes da auditoria externa (Cl 9.2).</li>`;
            }
            if (answers.review === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Ata de Revisão pela Direção pendente:</strong> Documento chave exigido pelo auditor no Estágio 2. Agende reunião e registre a ata (Cl 9.3).</li>`;
            }
        }
        else if (jIdx === 5) {
            const certText = answers.certifier === 'sim' ? 'Contratada' : answers.certifier === 'negociacao' ? 'Em Negociação' : 'Pendente';
            const capaText = answers.capa === 'sim' ? 'Processo Ativo' : 'Pendente';

            summaryHtml = `<strong>Certificadora:</strong> ${certText} | <strong>Processo CAPA:</strong> ${capaText}`;

            if (answers.certifier !== 'sim') {
                suggestionsList += `<li>💡 <strong>Contratação da Certificadora:</strong> Solicitar propostas de organismos acreditados (INMETRO / UKAS) para agendar datas de estágio 1 e 2.</li>`;
            }
            if (answers.capa === 'nao') {
                suggestionsList += `<li>⚠️ <strong>Sem processo CAPA estruturado:</strong> Essencial para comprovar melhoria contínua (Cl 10.1). Registre qualquer desvio na aba Ações Corretivas.</li>`;
            }
        }

        if (!suggestionsList) {
            suggestionsList = `<li>✅ <strong>Todos os controles da jornada mapeados:</strong> Ambiente com maturidade adequada de conformidade! Próximo para auditoria.</li>`;
        }

        return `
            <div style="margin: 0 1rem 1rem 1rem; padding: 12px; background: rgba(0, 173, 232, 0.04); border: 1px dashed rgba(0, 173, 232, 0.2); border-radius: 8px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--accent); font-weight: 700; margin-bottom: 6px; text-align: left; display: flex; justify-content: space-between;">
                    <span>⚙️ Diagnóstico de Conformidade (nISO Consultor)</span>
                    <a href="javascript:void(0)" onclick="openJornadaQuestionnaire(${jIdx}, '${projectId}')" style="color:var(--accent); text-decoration:none; font-size:0.65rem;">Refazer Diagnóstico 🔄</a>
                </div>
                <div style="font-size: 0.75rem; color: var(--text); margin-bottom: 8px; text-align: left;">
                    ${summaryHtml}
                </div>
                <ul style="font-size: 0.7rem; color: var(--text-dim); text-align: left; padding-left: 15px; margin: 0; list-style-type: square; line-height: 1.4;">
                    ${suggestionsList}
                </ul>
            </div>
        `;
    };

    window.generateDocumentNatively = async function(projectId, itemId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/checklist/${itemId}/generate`);
            showToast('Documento gerado com sucesso!');
            render();
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.openInternalDocumentEditor = async function(evidenceId) {
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Editor de Documento Interno</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div id="doc-editor-body" style="padding:1.5rem 0;">
                <div class="loading"></div>
            </div>
        `, 'modal-large');

        try {
            const data = await api('GET', `/api/v1/evidence/${evidenceId}/content`);
            
            document.getElementById('doc-editor-body').innerHTML = `
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">Nome do Arquivo</label>
                    <input type="text" class="form-input" style="width:100%; font-size:0.85rem;" value="${escapeHTML(data.file_name)}" readonly disabled>
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.5rem">Conteúdo do Documento (Markdown)</label>
                    <textarea id="internal-doc-text" class="form-input" style="width:100%; height:450px; font-family:monospace; font-size:0.8rem; line-height:1.4; background:rgba(0,0,0,0.35); resize:vertical; padding:12px;">${escapeHTML(data.content || '')}</textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" onclick="forceCloseModal()" style="background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn btn-primary" onclick="saveInternalDocument('${evidenceId}', this)">Salvar Alterações</button>
                </div>
            `;
        } catch(e) {
            document.getElementById('doc-editor-body').innerHTML = `
                <div style="color:var(--danger); padding:1rem; text-align:center;">
                    Erro ao carregar documento: ${escapeHTML(e.message)}
                    <div style="margin-top:1rem; font-size:0.75rem; color:var(--text-dim)">Este arquivo pode ser um anexo binário externo (PDF, imagem, etc.).</div>
                </div>
            `;
        }
    };

    window.saveInternalDocument = async function(evidenceId, btnEl) {
        const content = document.getElementById('internal-doc-text').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('PUT', `/api/v1/evidence/${evidenceId}/content`, { content });
            showToast('Documento atualizado com sucesso!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao salvar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateThemeIcon(next);
    }
    function updateThemeIcon(theme) {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        const svg = btn.querySelector('svg');
        if (theme === 'light') {
            svg.innerHTML = '<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
        } else {
            svg.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z"/>';
        }
    }
    async function deleteLead(id) {
        if (!confirm('Deseja excluir este lead permanentemente?')) return;
        try {
            await api('DELETE', `/api/v1/leads/${id}`);
            showToast('Lead excluído com sucesso');
            loadAll();
            navigate('leads');
        } catch (e) { showToast('Erro ao excluir lead', 'error'); }
    }
    async function viewEvidence(id) {
        try {
            openModal(`
                <div style="padding: 2rem; text-align: center;">
                    <h3>Carregando Evidência...</h3>
                    <p style="color: var(--muted); font-size: 0.85rem;">Buscando arquivo e preparando pré-visualização...</p>
                </div>
            `);
            const ev = await api('GET', `/api/v1/evidence/${id}/detail`);
            const projectId = S.activeProject?.id || S.currentProject?.id;
            const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/evidence/${id}/download`, {
                headers: { 'Authorization': 'Bearer ' + S.token }
            });
            if (!res.ok) throw new Error('Erro ao baixar arquivo');
            const blob = await res.blob();
            
            if (window.activePreviewUrl) {
                window.URL.revokeObjectURL(window.activePreviewUrl);
            }
            const objectUrl = window.URL.createObjectURL(blob);
            window.activePreviewUrl = objectUrl;
            
            const fileType = ev.file_type || blob.type || '';
            const fileName = ev.file_name || '';
            const ext = fileName.split('.').pop().toLowerCase();
            
            let previewHtml = '';
            let isLarge = false;
            
            if (fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                previewHtml = `<div style="text-align: center; margin-top: 1rem;"><img src="${objectUrl}" style="max-width: 100%; max-height: 450px; border-radius: 8px; border: 1px solid var(--border);" /></div>`;
            } else if (fileType === 'application/pdf' || ext === 'pdf') {
                isLarge = true;
                previewHtml = `<iframe src="${objectUrl}" style="width: 100%; height: 550px; border: none; border-radius: 8px; margin-top: 1rem;"></iframe>`;
            } else if (fileType.startsWith('text/') || ['txt', 'csv', 'json', 'xml', 'log', 'md'].includes(ext)) {
                const text = await blob.text();
                previewHtml = `<pre style="max-height: 400px; overflow: auto; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); font-family: monospace; font-size: 0.75rem; margin-top: 1rem; white-space: pre-wrap; word-break: break-all; color: var(--text); text-align: left;">${escapeHTML(text)}</pre>`;
            } else {
                previewHtml = `<div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed var(--border); margin-top: 1rem; color: var(--text-dim); font-size: 0.8rem;">Visualização direta não suportada para o formato (.${ext}). Use o botão abaixo para baixar.</div>`;
            }
            
            const html = `
                <div style="padding: 1.5rem">
                    <h2 style="font-family:'Montserrat',sans-serif; font-weight:700; color:var(--accent); font-size:1.2rem; margin-bottom:0.5rem">Detalhes da Evidência</h2>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Arquivo:</strong> ${escapeHTML(fileName)}</p>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Hash SHA-256:</strong> <code style="word-break: break-all">${escapeHTML(ev.file_hash || ev.sha256_hash || '')}</code></p>
                    <p style="font-size:0.85rem; margin:0.25rem 0;"><strong>Data de Envio:</strong> ${new Date(ev.created_at).toLocaleString()}</p>
                    
                    ${previewHtml}
                    
                    <div style="margin-top: 1.5rem; display:flex; gap:0.5rem; justify-content: flex-end;">
                        <button class="btn" onclick="forceCloseModal()">Fechar</button>
                        <button class="btn btn-primary" onclick="downloadEvidenceFile('${id}')">Baixar Arquivo</button>
                    </div>
                </div>
            `;
            openModal(html, isLarge ? 'modal-large' : '');
        } catch (e) { 
            showToast('Erro ao carregar detalhe da evidência: ' + e.message, 'error'); 
        }
    }
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    setTimeout(() => updateThemeIcon(savedTheme), 100);

    // ——— STATE ——————————————————————————————————————————
    // ——— i18n ——————————————————————————————————————————
    function setLang(lang) {
        S.lang = 'pt';
        localStorage.setItem('niso_lang', 'pt');
        console.log('Language set to: pt');
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            switch (m) { case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#39;'; }
        });
    }
    const ASSESSMENT_BLOCKS = [
        {
            block: 1,
            title: 'Qualificacao e Perfil',
            questions: [
                { key: 'sector', type: 'select', text: 'Setor ou tipo de negócio?', options: ['Fintech', 'Healthtech', 'Edtech', 'Legaltech', 'Insurtech', 'Govtech', 'Agritech', 'Logistics/Supply Chain', 'E-commerce/Marketplace', 'Indústria/Manufatura', 'Serviços Financeiros', 'Telecomunicações', 'Energia', 'Varejo', 'Outro'] },
                { key: 'company_type', type: 'select', text: 'Estágio da empresa?', options: ['Startup (< 3 anos)', 'Scale-up (crescimento acelerado)', 'Empresa madura', 'Grupo econômico / Holding', 'Software house / Fábrica de software', 'Consultoria de tecnologia'] },
                { key: 'countries', type: 'multi', text: 'Países de operação?', options: ['Brasil', 'EUA', 'União Europeia', 'América Latina', 'Ãsia', 'Global'] },
                { key: 'headcount', type: 'select', text: 'Quantidade de colaboradores?', options: ['1–25', '26–50', '51–100', '101–250', '251–500', '501–1000', '1000+'] },
                { key: 'tech_people', type: 'select', text: 'Pessoas em tecnologia/engenharia/produto/DevOps?', options: ['1–10', '11–25', '26–50', '51–100', '101–200', '200+'] },
                { key: 'security_people', type: 'select', text: 'Pessoas em segurança/compliance/jurídico/privacidade?', options: ['Nenhuma dedicada', '1–3', '4–10', '11–20', '20+'] },
                { key: 'dpo_appointed', type: 'yesno', text: 'DPO/Encarregado formalmente nomeado?' },
                { key: 'existing_certs', type: 'multi', text: 'Certificações ou frameworks já implementados?', options: ['Nenhum', 'ISO 27001', 'ISO 9001', 'SOC 2', 'PCI DSS', 'NIST CSF', 'CIS Controls', 'LGPD (programa estruturado)', 'GDPR', 'ISO 27701', 'CMMI', 'Outro'] },
                { key: 'target_standard', type: 'select', text: 'Quais normas deseja certificar?', options: ['ISO 27001 apenas', 'ISO 27701 apenas', 'ISO 27001 + ISO 27701 (integrada)'] },
                { key: 'demand_type', type: 'multi', text: 'Tipo de demanda?', options: ['Certificação completa', 'Gap assessment / diagnóstico', 'Implementação do SGSI', 'Implementação do SGPI', 'Auditoria interna', 'Suporte ao auditor externo', 'Treinamento'] },
                { key: 'deadline', type: 'select', text: 'Prazo desejado para certificação?', options: ['3 meses (urgente)', '6 meses', '9 meses', '12 meses', 'Sem prazo definido', 'Imposto por contrato/cliente'] },
                { key: 'certification_body', type: 'select', text: 'Certificadora já escolhida?', options: ['Não', 'BSI', 'Bureau Veritas', 'DNV', 'SGS', 'TÜV', 'LRQA', 'ABNT', 'Outra'] },
                { key: 'cb_27701', type: 'select', text: 'Certificadora está apta a auditar ISO 27701?', options: ['Sim, confirmado', 'Não sabemos', 'Não se aplica', 'Precisa verificar'] },
                { key: 'budget', type: 'select', text: 'Orçamento estimado para o programa?', options: ['Até R$ 50 mil', 'R$ 50–100 mil', 'R$ 100–200 mil', 'R$ 200–500 mil', 'Acima de R$ 500 mil', 'Não definido'] },
                { key: 'proposal_deadline', type: 'select', text: 'Prazo para envio da proposta?', options: ['Esta semana', 'Próximas 2 semanas', '30 dias', 'Sem urgência'] },
            ]
        },
        {
            block: 2,
            title: 'Escopo e Abrangencia',
            questions: [
                { key: 'scope_type', type: 'select', text: 'Escopo da certificação?', options: ['Empresa inteira', 'Produto / plataforma específica', 'Unidade de negócio', 'Processo específico'] },
                { key: 'org_units', type: 'multi', text: 'Unidades organizacionais incluídas?', options: ['Engenharia', 'Produto', 'DevOps/SRE', 'Segurança', 'Jurídico', 'RH', 'Suporte/CS', 'Comercial', 'Marketing', 'Financeiro', 'Todas'] },
                { key: 'cloud_in_scope', type: 'yesno', text: 'Infraestrutura cloud está no escopo?' },
                { key: 'support_scope', type: 'yesno', text: 'Suporte ao cliente está no escopo?' },
                { key: 'dev_scope', type: 'yesno', text: 'Desenvolvimento de software está no escopo?' },
                { key: 'personal_data', type: 'select', text: 'Volume de dados pessoais tratados?', options: ['Mínimo (apenas colaboradores)', 'Moderado (clientes B2B)', 'Alto (clientes B2C, milhares)', 'Muito alto (milhões de titulares)', 'Dados sensíveis (saúde, biometria, etc.)'] },
                { key: 'data_role', type: 'select', text: 'Papel no tratamento de dados?', options: ['Controlador', 'Operador', 'Controlador + Operador', 'Controlador conjunto', 'Ainda não mapeado'] },
                { key: 'remote_work', type: 'select', text: 'Modelo de trabalho?', options: ['100% remoto', 'Híbrido', '100% presencial'] },
            ]
        },
        {
            block: 3,
            title: 'Ambiente Tecnologico',
            questions: [
                { key: 'cloud_provider', type: 'multi', text: 'Cloud provider(s)?', options: ['AWS', 'Google Cloud', 'Azure', 'Oracle Cloud', 'Cloudflare', 'DigitalOcean', 'On-premises', 'Híbrido', 'Outro'] },
                { key: 'databases', type: 'multi', text: 'Bancos de dados?', options: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQL Server', 'Elasticsearch', 'Outro'] },
                { key: 'environments', type: 'select', text: 'Ambientes segregados?', options: ['Apenas produção', 'Dev + Prod', 'Dev + Staging + Prod', 'Dev + QA + Staging + Prod'] },
                { key: 'cicd', type: 'select', text: 'Maturidade do CI/CD?', options: ['Inexistente', 'Manual / ad-hoc', 'Pipeline básico (build + test)', 'Pipeline completo (build + test + scan + deploy)', 'GitOps / deploy automatizado'] },
                { key: 'code_repo', type: 'select', text: 'Repositório de código?', options: ['GitHub', 'GitLab', 'Bitbucket', 'Azure DevOps', 'Outro'] },
                { key: 'containers', type: 'select', text: 'Uso de containers?', options: ['Não utiliza', 'Docker apenas', 'Docker + Kubernetes', 'Docker + ECS/Fargate', 'Serverless (sem containers)'] },
                { key: 'iam', type: 'select', text: 'Gestão de identidade e acesso (IAM)?', options: ['Sem IAM centralizado', 'IAM do cloud provider', 'IdP dedicado (Okta, Auth0, Azure AD)', 'SSO implementado', 'SSO + MFA obrigatório'] },
                { key: 'logging', type: 'select', text: 'Logs e monitoramento?', options: ['Sem monitoramento', 'Logs básicos (stdout)', 'Ferramenta de logs (CloudWatch, Datadog, etc.)', 'SIEM implementado', 'Observabilidade completa (logs + métricas + traces)'] },
                { key: 'backup', type: 'select', text: 'Backup implementado?', options: ['Sem backup', 'Backup manual / ocasional', 'Backup automático sem teste de restore', 'Backup automático com teste de restore', 'Backup + DR documentado e testado'] },
                { key: 'mfa', type: 'select', text: 'MFA habilitado?', options: ['Não', 'Apenas para admins', 'Para todos os acessos ao cloud', 'Para todos os sistemas (cloud + SaaS + VPN)'] },
            ]
        },
        {
            block: 4,
            title: 'Desenvolvimento e SDLC',
            questions: [
                { key: 'sdlc', type: 'select', text: 'Maturidade do SDLC?', options: ['Sem processo formal', 'Processo informal / ad-hoc', 'SDLC documentado sem segurança', 'Secure SDLC implementado', 'Secure SDLC + Privacy by Design'] },
                { key: 'code_review', type: 'select', text: 'Code review?', options: ['Não existe', 'Opcional / informal', 'Obrigatório (1 reviewer)', 'Obrigatório (2+ reviewers)', 'Obrigatório + checklist de segurança'] },
                { key: 'branch_protection', type: 'yesno', text: 'Branch protection configurado na main/master?' },
                { key: 'sast_sca', type: 'multi', text: 'Ferramentas de segurança no pipeline?', options: ['Nenhuma', 'SAST (análise estática)', 'SCA (dependências)', 'DAST (dinâmico)', 'Secret scanning', 'Container scanning', 'IaC scanning'] },
                { key: 'pentest', type: 'select', text: 'Pentest realizado?', options: ['Nunca', 'Uma vez (há mais de 1 ano)', 'Anualmente', 'A cada release / trimestral', 'Bug bounty ativo'] },
                { key: 'vuln_mgmt', type: 'select', text: 'Gestão de vulnerabilidades?', options: ['Inexistente', 'Ad-hoc / reativo', 'Processo definido sem SLA', 'Processo com SLA por severidade', 'Processo + métricas + dashboard'] },
                { key: 'test_data', type: 'select', text: 'Dados em ambientes de teste?', options: ['Dados reais de produção', 'Dados reais parcialmente mascarados', 'Dados sintéticos', 'Dados reais, mas não sei se tem DP'] },
                { key: 'prod_access', type: 'select', text: 'Acesso de desenvolvedores à produção?', options: ['Acesso direto livre', 'Acesso direto com aprovação', 'Acesso via bastion/jump server', 'Sem acesso direto (apenas pipeline)'] },
            ]
        },
        {
            block: 5,
            title: 'Privacidade (ISO 27701)',
            questions: [
                { key: 'personal_data_types', type: 'multi', text: 'Tipos de dados pessoais tratados?', options: ['Nome', 'Email', 'Telefone', 'CPF/CNPJ', 'Endereço', 'Dados financeiros', 'Dados de saúde', 'Biometria', 'Geolocalização', 'Dados de menores', 'Dados de navegação/cookies', 'Logs com IP'] },
                { key: 'sensitive_data', type: 'yesno', text: 'Trata dados pessoais sensíveis (saúde, biometria, raça, religião, opinião política)?' },
                { key: 'data_subjects', type: 'multi', text: 'Categorias de titulares?', options: ['Colaboradores', 'Clientes PF', 'Clientes PJ (representantes)', 'Usuários de plataforma', 'Candidatos (RH)', 'Visitantes do site', 'Pacientes', 'Alunos', 'Crianças/adolescentes'] },
                { key: 'legal_bases', type: 'select', text: 'Bases legais mapeadas por operação de tratamento?', options: ['Não mapeadas', 'Parcialmente mapeadas', 'Totalmente mapeadas', 'Mapeadas e documentadas no RoPA'] },
                { key: 'ropa', type: 'select', text: 'RoPA (Registro de Operações de Tratamento)?', options: ['Inexistente', 'Em construção', 'Parcial', 'Completo e atualizado'] },
                { key: 'dpia', type: 'select', text: 'DPIA/RIPD (Relatório de Impacto)?', options: ['Nunca realizado', 'Realizado uma vez', 'Realizado para operações de alto risco', 'Processo recorrente documentado'] },
                { key: 'dsr_channel', type: 'select', text: 'Canal de direitos dos titulares?', options: ['Inexistente', 'Email genérico', 'Formulário web dedicado', 'Plataforma de gestão de DSR', 'Canal + SLA + métricas'] },
                { key: 'retention', type: 'select', text: 'Política de retenção e descarte?', options: ['Inexistente', 'Informal / não documentada', 'Documentada mas não aplicada', 'Documentada e aplicada', 'Automatizada com jobs de exclusão'] },
                { key: 'intl_transfers', type: 'select', text: 'Transferências internacionais de dados?', options: ['Não há', 'Sim, para cloud US', 'Sim, para múltiplos países', 'Sim, com cláusulas contratuais', 'Não sei / não mapeado'] },
                { key: 'sub_processors', type: 'select', text: 'Subprocessadores mapeados?', options: ['Não mapeados', 'Lista parcial', 'Lista completa sem DPA', 'Lista completa com DPA', 'Gestão ativa (avaliação + DPA + monitoramento)'] },
            ]
        },
        {
            block: 6,
            title: 'Governanca e Lideranca',
            questions: [
                { key: 'commitment', type: 'select', text: 'Comprometimento da alta direção com Segurança da Informação?', options: ['C-Level engajado ativamente', 'Apoio passivo', 'Sem engajamento'] },
                { key: 'si_policy', type: 'select', text: 'Política de Segurança da Informação?', options: ['Aprovada e comunicada', 'Em desenvolvimento', 'Inexistente'] },
                { key: 'risk_assessment', type: 'select', text: 'Avaliação de riscos de segurança?', options: ['Processo formal recorrente', 'Avaliação pontual', 'Sem avaliação formal'] },
                { key: 'mgmt_review', type: 'select', text: 'Análise crítica pela direção realizada?', options: ['Realizada periodicamente', 'Realizada ad-hoc', 'Nunca realizada'] },
                { key: 'risk_owner', type: 'select', text: 'Proprietários de risco atribuídos?', options: ['Atribuídos formalmente', 'Parcialmente atribuídos', 'Sem responsáveis'] },
                { key: 'competence_records', type: 'select', text: 'Registros de competência do time de SI?', options: ['Registros formais de competência', 'Registros parciais', 'Sem registros'] },
                { key: 'internal_comm', type: 'select', text: 'Comunicação interna sobre SI?', options: ['Canais formais definidos', 'Comunicação informal', 'Sem processo'] },
                { key: 'documented_info', type: 'select', text: 'Controle de informação documentada?', options: ['Controle de documentos formal', 'Versão informal (Google Drive, etc)', 'Sem controle'] },
            ]
        },
        {
            block: 7,
            title: 'Gestao de Fornecedores',
            questions: [
                { key: 'supplier_count', type: 'select', text: 'Quantidade de fornecedores de TI/cloud?', options: ['0–10', '11–50', '51–200', '200+'] },
                { key: 'supplier_eval', type: 'select', text: 'Avaliação de segurança de fornecedores?', options: ['Avaliação formal de segurança', 'Checklist básico', 'Sem avaliação'] },
                { key: 'dpa_contracts', type: 'select', text: 'Contratos com cláusulas de proteção de dados (DPA)?', options: ['DPA com todos', 'DPA com principais', 'Sem DPA'] },
                { key: 'sla_monitoring', type: 'select', text: 'SLAs de segurança com fornecedores?', options: ['SLAs definidos e monitorados', 'SLAs definidos sem monitoramento', 'Sem SLAs'] },
                { key: 'sub_audit', type: 'yesno', text: 'Direito de auditoria em contratos com fornecedores?' },
                { key: 'offboarding', type: 'select', text: 'Processo de desligamento de fornecedores (offboarding)?', options: ['Processo formal de desligamento', 'Informal', 'Sem processo'] },
                { key: 'cloud_shared', type: 'select', text: 'Modelo de responsabilidade compartilhada com cloud providers?', options: ['Modelo de responsabilidade compartilhada documentado', 'Conhecido mas não documentado', 'Não mapeado'] },
                { key: 'critical_suppliers', type: 'multi', text: 'Fornecedores críticos de TI?', options: ['AWS', 'Azure', 'Google Cloud', 'Salesforce', 'ServiceNow', 'GitHub', 'Slack', 'Atlassian'] },
            ]
        },
        {
            block: 8,
            title: 'Documentacao e Politicas',
            questions: [
                { key: 'doc_repo', type: 'select', text: 'Repositório de documentos de SI?', options: ['Repositório centralizado (Confluence, SharePoint)', 'Google Drive / pasta de rede', 'Documentos espalhados', 'Sem repositório'] },
                { key: 'doc_version', type: 'select', text: 'Controle de versão de documentos?', options: ['Versionamento automático', 'Versionamento manual', 'Sem controle de versão'] },
                { key: 'doc_approval', type: 'select', text: 'Processo de aprovação de documentos?', options: ['Workflow formal de aprovação', 'Aprovação por email', 'Sem processo de aprovação'] },
                { key: 'doc_review_cycle', type: 'select', text: 'Ciclo de revisão de políticas e procedimentos?', options: ['Revisão anual programada', 'Revisão ad-hoc', 'Sem revisão'] },
                { key: 'existing_policies', type: 'multi', text: 'Políticas/procedimentos já existentes?', options: ['Política de SI', 'Política de Privacidade', 'Política de Acesso', 'Política de Backup', 'Plano de Continuidade', 'Plano de Incidentes', 'Nenhuma'] },
                { key: 'templates_used', type: 'yesno', text: 'Utiliza templates padronizados para documentos?' },
                { key: 'classification', type: 'select', text: 'Classificação da informação implementada?', options: ['Esquema de classificação implementado', 'Classificação informal', 'Sem classificação'] },
                { key: 'awareness_docs', type: 'select', text: 'Documentação de treinamento e conscientização?', options: ['Material de conscientização formal', 'Treinamentos pontuais', 'Sem material'] },
            ]
        },
        {
            block: 9,
            title: 'Planejamento e Recursos',
            questions: [
                { key: 'timeline_expectation', type: 'select', text: 'Cronograma desejado para certificação?', options: ['3 meses (urgente)', '6 meses (padrão)', '9–12 meses (confortável)', 'Sem prazo definido'] },
                { key: 'budget_range', type: 'select', text: 'Faixa de investimento prevista?', options: ['Até R$ 30k', 'R$ 30k – R$ 60k', 'R$ 60k – R$ 100k', 'R$ 100k – R$ 200k', 'Acima de R$ 200k', 'Não definido'] },
                { key: 'internal_team', type: 'select', text: 'Equipe interna disponível para o projeto?', options: ['Time dedicado de SI (3+ pessoas)', 'Time parcial (1-2 pessoas)', 'Sem time dedicado'] },
                { key: 'sponsor', type: 'select', text: 'Sponsor executivo do projeto?', options: ['C-Level (CEO/CTO/CISO)', 'Gerência de TI', 'Sem sponsor definido'] },
                { key: 'blockers', type: 'multi', text: 'Principais bloqueadores ou riscos do projeto?', options: ['Orçamento', 'Prioridade da diretoria', 'Falta de pessoas', 'Legado tecnológico', 'Cultura organizacional', 'Compliance regulatório (prazo)', 'Nenhum'] },
                { key: 'prev_attempts', type: 'yesno', text: 'Houve tentativas anteriores de certificação?' },
                { key: 'certifier', type: 'select', text: 'Certificadora já foi escolhida?', options: ['Já escolhida', 'Em avaliação', 'Sem decisão'] },
                { key: 'parallel_projects', type: 'yesno', text: 'Há outros projetos de compliance em paralelo (SOC 2, PCI, etc)?' },
            ]
        },
        {
            block: 10,
            title: 'Volumetria e Complexidade',
            questions: [
                { key: 'endpoints_count', type: 'select', text: 'Quantidade de APIs/endpoints expostos?', options: ['1–10', '11–50', '51–200', '200+'] },
                { key: 'users_count', type: 'select', text: 'Quantidade de usuários da plataforma?', options: ['< 1.000', '1.000 – 10.000', '10.000 – 100.000', '100.000+'] },
                { key: 'data_volume', type: 'select', text: 'Volume de dados armazenados?', options: ['< 100 GB', '100 GB – 1 TB', '1 TB – 10 TB', '> 10 TB'] },
                { key: 'transactions_daily', type: 'select', text: 'Transações diárias?', options: ['< 1.000', '1.000 – 100.000', '100.000 – 1M', '> 1M'] },
                { key: 'locations', type: 'select', text: 'Localizações físicas?', options: ['1 escritório', '2–5 localizações', '6+ localizações', 'Full remote'] },
                { key: 'devices_managed', type: 'select', text: 'Dispositivos gerenciados (MDM/endpoint)?', options: ['< 50', '50 – 200', '200 – 1.000', '1.000+'] },
                { key: 'third_party_integrations', type: 'select', text: 'Integrações com terceiros?', options: ['< 5', '5 – 20', '20 – 50', '50+'] },
                { key: 'databases_count', type: 'select', text: 'Quantidade de bancos de dados?', options: ['1–3', '4–10', '11–50', '50+'] },
                { key: 'microservices', type: 'select', text: 'Quantidade de microsserviços?', options: ['< 5', '5 – 20', '20 – 50', '50+', 'Monolito'] },
                { key: 'uptime_sla', type: 'select', text: 'SLA de disponibilidade?', options: ['99.9%+ (mission critical)', '99.5% – 99.9%', '< 99.5%', 'Sem SLA definido'] },
            ]
        }
    ];


    const S = {
        view: 'dashboard', lang: 'pt',
        token: localStorage.getItem('niso_token') || null,
        user: localStorage.getItem('niso_user') ? JSON.parse(localStorage.getItem('niso_user')) : null,
        activeProject: localStorage.getItem('niso_activeProject') ? JSON.parse(localStorage.getItem('niso_activeProject')) : null,
        leads: [], assessments: [], projects: [], controls: [],
        currentLead: null, currentAssessment: null, currentProject: localStorage.getItem('niso_activeProject') ? JSON.parse(localStorage.getItem('niso_activeProject')) : null,
        currentBlock: 1, blockAnswers: {},
        editingPhase: null,
        phaseConfig: null,
        phaseChecks: JSON.parse(localStorage.getItem('niso_phaseChecks') || '{}'),
        generatingProposal: false
    };

    function toggleGroup(groupId) {
        const groups = document.querySelectorAll('.sidebar-group');
        const labels = document.querySelectorAll('.sidebar-label');
        const target = document.getElementById(groupId);
        const label = target.previousElementSibling;
        const isExpanded = target.classList.contains('expanded');

        groups.forEach(g => g.classList.remove('expanded'));
        labels.forEach(l => l.classList.add('collapsed'));

        if (!isExpanded) {
            target.classList.add('expanded');
            label.classList.remove('collapsed');
        }
    }

    window.renderProjectGovernance = function(members, projectId) {
        const categories = {
            consultor: { label: 'Consultoria / Apoio', list: [] },
            executivo: { label: 'Liderança Executiva', list: [] },
            tech: { label: 'Tecnologia & Produto', list: [] },
            operacoes: { label: 'Operações & Segurança', list: [] }
        };
        
        members.forEach(m => {
            if (categories[m.role_category]) {
                categories[m.role_category].list.push(m);
            }
        });
        
        let colsHtml = '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const manageBtn = canCrud ? `
            <button class="btn" style="padding:0.25rem 0.75rem; font-size:0.7rem; font-weight:600; height:28px" onclick="window.openGovernanceModal('${projectId}')">
                Gerenciar Governança
            </button>
        ` : '';

        for (const key in categories) {
            const cat = categories[key];
            let membersHtml = cat.list.map(m => {
                const primaryBadge = m.is_primary ? ` <span style="font-weight:700; font-size:0.6rem; color:#00ade8; background:rgba(0,173,232,0.15); padding:1px 4px; border-radius:3px; margin-left:4px">DPO / Líder</span>` : '';
                return `
                    <div style="font-size:0.75rem; font-weight:600; color:var(--text); margin-bottom:6px">
                        ${escapeHTML(m.name)} 
                        <span style="font-weight:300; font-size:0.65rem; color:var(--accent)">- ${escapeHTML(m.job_title)}</span>
                        ${primaryBadge}
                        ${m.email ? `<div style="font-size:0.6rem; color:var(--text-dim); font-weight:300">${escapeHTML(m.email)}</div>` : ''}
                    </div>
                `;
            }).join('') || `<div style="font-size:0.7rem; color:var(--text-dim); font-style:italic">Nenhum cadastrado</div>`;
            
            colsHtml += `
                <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.02)">
                    <div style="font-size:0.65rem; color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">${cat.label}</div>
                    ${membersHtml}
                </div>
            `;
        }
        
        return `
            <!-- Painel de Governança/Organograma do Projeto -->
            <div class="stat-card" style="margin-bottom:1.5rem; padding:16px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
                    <div style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:0.85rem; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px">Governança & Organograma do SGSI</div>
                    ${manageBtn}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:16px;">
                    ${colsHtml}
                </div>
            </div>
        `;
    };

    window.renderGovernanceSelectOptions = function(members, selectedValue) {
        const categories = {
            consultor: { label: 'Consultoria / Apoio', list: [] },
            executivo: { label: 'Liderança Executiva', list: [] },
            tech: { label: 'Tecnologia & Produto', list: [] },
            operacoes: { label: 'Operações & Segurança', list: [] }
        };
        
        members.forEach(m => {
            if (categories[m.role_category]) {
                categories[m.role_category].list.push(m);
            }
        });
        
        let html = '<option value="">Sem responsável</option>';
        for (const key in categories) {
            const cat = categories[key];
            if (cat.list.length > 0) {
                html += `<optgroup label="${escapeHTML(cat.label)}">`;
                cat.list.forEach(m => {
                    const isSelected = m.name === selectedValue ? 'selected' : '';
                    html += `<option value="${escapeHTML(m.name)}" ${isSelected}>${escapeHTML(m.name)} (${escapeHTML(m.job_title)})</option>`;
                });
                html += `</optgroup>`;
            }
        }
        return html;
    };

    window.openGovernanceModal = async function(projectId) {
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Gerenciar Membros da Governança</span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div id="gov-modal-body">
                <div class="loading"></div>
            </div>
        `, 'modal-large');
        
        try {
            const members = await api('GET', `/api/v1/projects/${projectId}/governance`);
            window.renderGovernanceModalContent(projectId, members);
        } catch(e) {
            document.getElementById('gov-modal-body').innerHTML = `
                <div style="color:var(--danger)">Erro ao carregar governança: ${escapeHTML(e.message)}</div>
            `;
        }
    };

    window.renderGovernanceModalContent = function(projectId, members) {
        const listHtml = members.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:8px 12px; border-radius:8px; margin-bottom:8px">
                <div>
                    <strong style="color:var(--text)">${escapeHTML(m.name)}</strong>
                    <span style="font-size:0.7rem; color:var(--accent)">- ${escapeHTML(m.job_title)} (${escapeHTML(m.role_category)})</span>
                    ${m.email ? `<div style="font-size:0.65rem; color:var(--text-dim)">${escapeHTML(m.email)}</div>` : ''}
                </div>
                <button class="btn btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.65rem; color:#ef4444; border-color:rgba(239,68,68,0.2)" onclick="window.deleteGovernanceMember('${projectId}', '${m.id}')">
                    Excluir
                </button>
            </div>
        `).join('') || `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding:12px; border:1px dashed var(--border); border-radius:8px; margin-bottom:12px">Nenhum membro cadastrado.</div>`;

        const formHtml = `
            <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:var(--accent); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px">Adicionar Novo Membro</h4>
                <form id="add-gov-member-form" onsubmit="window.saveGovernanceMember(event, '${projectId}')" style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">Nome Completo</label>
                        <input class="form-input" id="gov-name" required placeholder="Ex: Ricardo Esper">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">E-mail</label>
                        <input class="form-input" id="gov-email" type="email" placeholder="Ex: pessoa@exemplo.com.br">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Categoria de Papel</label>
                        <select class="form-input" id="gov-role" required>
                            <option value="consultor">Consultoria / Apoio</option>
                            <option value="executivo">Liderança Executiva</option>
                            <option value="tech">Tecnologia & Produto</option>
                            <option value="operacoes">Operações & Segurança</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cargo / Função</label>
                        <input class="form-input" id="gov-title" required placeholder="Ex: CEO, CFO, DPO, Consultor">
                    </div>
                    <div class="form-group" style="grid-column: span 2; display:flex; align-items:center; gap:8px">
                        <input type="checkbox" id="gov-primary" style="cursor:pointer">
                        <label for="gov-primary" class="form-label" style="margin-bottom:0; cursor:pointer">Contato Principal / DPO Líder</label>
                    </div>
                    <div style="grid-column: span 2; text-align:right; margin-top:8px">
                        <button class="btn btn-primary" type="submit">Adicionar Membro</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('gov-modal-body').innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr; gap:16px">
                <div>
                    <h4 style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:var(--text); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px">Membros Atuais</h4>
                    <div style="max-height:200px; overflow-y:auto; padding-right:4px">${listHtml}</div>
                </div>
                ${formHtml}
            </div>
        `;
    };

    window.saveGovernanceMember = async function(event, projectId) {
        event.preventDefault();
        const name = document.getElementById('gov-name').value;
        const email = document.getElementById('gov-email').value;
        const role_category = document.getElementById('gov-role').value;
        const job_title = document.getElementById('gov-title').value;
        const is_primary = document.getElementById('gov-primary').checked ? 1 : 0;

        const btn = event.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            await api('POST', `/api/v1/projects/${projectId}/governance`, {
                name, email, role_category, job_title, is_primary
            });
            showToast('Membro da governança adicionado com sucesso!');
            
            const [members, newProgress] = await Promise.all([
                api('GET', `/api/v1/projects/${projectId}/governance`),
                api('GET', `/api/v1/projects/${projectId}/checklist-progress`).catch(() => [])
            ]);
            S.currentGovernance = members;
            
            if (Array.isArray(newProgress)) {
                newProgress.forEach(row => {
                    S.phaseChecksAssigned[projectId + '_' + row.item_id] = row.assigned_to || '';
                });
            }

            window.renderGovernanceModalContent(projectId, members);
            render(); 
        } catch(e) {
            showToast('Erro ao salvar membro: ' + e.message, 'danger');
        } finally {
            btn.disabled = false;
        }
    };

    window.deleteGovernanceMember = async function(projectId, memberId) {
        if (!confirm('Deseja realmente excluir este membro da governança?')) return;
        
        try {
            await api('DELETE', `/api/v1/projects/${projectId}/governance/${memberId}`);
            showToast('Membro da governança removido.');
            
            const [members, newProgress] = await Promise.all([
                api('GET', `/api/v1/projects/${projectId}/governance`),
                api('GET', `/api/v1/projects/${projectId}/checklist-progress`).catch(() => [])
            ]);
            S.currentGovernance = members;
            
            if (Array.isArray(newProgress)) {
                newProgress.forEach(row => {
                    S.phaseChecksAssigned[projectId + '_' + row.item_id] = row.assigned_to || '';
                });
            }

            window.renderGovernanceModalContent(projectId, members);
            render();
        } catch(e) {
            showToast('Erro ao excluir membro: ' + e.message, 'danger');
        }
    };

    // ——— API & AUTH —————————————————————————————————————
    const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:8787' : '';
    
    async function api(m, p, b) {
        const headers = { 'Content-Type': 'application/json' };
        if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
        const o = { method: m, headers };
        if (b) o.body = JSON.stringify(b);
        const r = await fetch(API_BASE + p, o);
        if (r.status === 401) { doLogout(); throw new Error('Unauthorized'); }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'API Error');
        // ponytail: auto-unwrap enveloped arrays from backend (e.g. { ok: true, risks: [...] })
        if (data && data.ok === true) {
            for (const key in data) {
                if (key !== 'ok' && Array.isArray(data[key])) {
                    return data[key];
                }
            }
        }
        return data;
    }

    window.showForgotPasswordForm = function() {
        document.getElementById('standard-login-box').style.display = 'none';
        document.getElementById('first-login-reset-box').style.display = 'none';
        document.getElementById('forgot-password-box').style.display = 'block';
        document.getElementById('forgot-email-step').style.display = 'block';
        document.getElementById('forgot-code-step').style.display = 'none';
        document.getElementById('forgot-error').style.display = 'none';
        document.getElementById('forgot-success').style.display = 'none';
    };

    window.showStandardLoginForm = function() {
        document.getElementById('standard-login-box').style.display = 'block';
        document.getElementById('first-login-reset-box').style.display = 'none';
        document.getElementById('forgot-password-box').style.display = 'none';
        document.getElementById('login-error').style.display = 'none';
    };

    async function doLogin() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const err = document.getElementById('login-error');
        err.style.display = 'none';
        try {
            const res = await api('POST', '/api/v1/auth/login', { email, password: pass });
            S.token = res.token; S.user = res.user;
            localStorage.setItem('niso_token', res.token);
            localStorage.setItem('niso_user', JSON.stringify(res.user));
            
            if (res.requiresPasswordChange) {
                document.getElementById('standard-login-box').style.display = 'none';
                document.getElementById('first-login-reset-box').style.display = 'block';
                document.getElementById('forgot-password-box').style.display = 'none';
                document.getElementById('first-reset-error').style.display = 'none';
            } else {
                document.getElementById('login-overlay').classList.add('hidden');
                initApp();
            }
        } catch(e) {
            err.style.display = 'block';
            err.textContent = e.message;
        }
    }

    window.doFirstLoginReset = async function() {
        const newPass = document.getElementById('first-new-password').value;
        const confPass = document.getElementById('first-confirm-password').value;
        const err = document.getElementById('first-reset-error');
        err.style.display = 'none';
        
        if (!newPass) {
            err.textContent = 'Nova senha é obrigatória';
            err.style.display = 'block';
            return;
        }
        if (newPass !== confPass) {
            err.textContent = 'As senhas não coincidem';
            err.style.display = 'block';
            return;
        }
        
        try {
            await api('POST', '/api/v1/auth/reset-password-first', { newPassword: newPass });
            document.getElementById('login-overlay').classList.add('hidden');
            initApp();
        } catch (e) {
            err.textContent = e.message || 'Falha ao redefinir senha';
            err.style.display = 'block';
        }
    };

    window.doForgotPasswordRequest = async function() {
        const email = document.getElementById('forgot-email').value;
        const err = document.getElementById('forgot-error');
        const success = document.getElementById('forgot-success');
        err.style.display = 'none';
        success.style.display = 'none';
        
        if (!email) {
            err.textContent = 'E-mail é obrigatório';
            err.style.display = 'block';
            return;
        }
        
        try {
            const res = await api('POST', '/api/v1/auth/forgot-password', { email });
            success.textContent = res.message || 'Código enviado!';
            success.style.display = 'block';
            
            if (res.reset_token) {
                document.getElementById('forgot-code').value = res.reset_token;
            }
            
            document.getElementById('forgot-email-step').style.display = 'none';
            document.getElementById('forgot-code-step').style.display = 'block';
        } catch (e) {
            err.textContent = e.message || 'Falha ao solicitar código';
            err.style.display = 'block';
        }
    };

    window.doForgotPasswordReset = async function() {
        const code = document.getElementById('forgot-code').value;
        const newPass = document.getElementById('forgot-new-password').value;
        const err = document.getElementById('forgot-error');
        err.style.display = 'none';
        
        if (!code || !newPass) {
            err.textContent = 'Código e nova senha são obrigatórios';
            err.style.display = 'block';
            return;
        }
        
        try {
            await api('POST', '/api/v1/auth/reset-password', { token: code, newPassword: newPass });
            const email = document.getElementById('forgot-email').value;
            const res = await api('POST', '/api/v1/auth/login', { email, password: newPass });
            S.token = res.token; S.user = res.user;
            localStorage.setItem('niso_token', res.token);
            localStorage.setItem('niso_user', JSON.stringify(res.user));
            
            document.getElementById('login-overlay').classList.add('hidden');
            initApp();
        } catch (e) {
            err.textContent = e.message || 'Falha ao redefinir senha';
            err.style.display = 'block';
        }
    };

    window.downloadEvidenceFile = async function(evidenceId) {
        try {
            const projectId = S.activeProject?.id || S.currentProject?.id;
            if (!projectId) return;
            const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/evidence/${evidenceId}/download`, {
                headers: { 'Authorization': 'Bearer ' + S.token }
            });
            if (!res.ok) throw new Error('Erro ao baixar arquivo');
            const blob = await res.blob();
            
            const contentDisp = res.headers.get('Content-Disposition');
            let filename = 'evidence_file';
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch(e) {
            showToast('Erro ao baixar evidência: ' + e.message, 'error');
        }
    };

    function doLogout() {
        S.token = null; S.user = null; S.activeProject = null;
        localStorage.removeItem('niso_token');
        localStorage.removeItem('niso_user');
        localStorage.removeItem('niso_activeProject');
        document.getElementById('login-overlay').classList.remove('hidden');
    }

    // ——— MODAL ——————————————————————————————————————————
    function openModal(html, extraClass) {
        const modal = document.getElementById('modal');
        const modalContent = document.getElementById('modal-content');
        modal.classList.remove('modal-large'); // reset
        if (extraClass) modal.classList.add(extraClass);
        modalContent.innerHTML = html;
        document.getElementById('modal-overlay').classList.add('open');
    }

    function closeModal(e) {
        if (e && e.target !== document.getElementById('modal-overlay')) return;
        document.getElementById('modal-overlay').classList.remove('open');
        document.getElementById('modal').classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

    function forceCloseModal() {
        document.getElementById('modal-overlay').classList.remove('open');
        document.getElementById('modal').classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

    window.openDoDDrawer = function(projectId, phaseNum, selectEl, pendingItens) {
        S.activeDoD = { projectId, phaseNum, selectEl };
        document.getElementById('dod-drawer-overlay').classList.add('open');
        window.refreshDoDDrawer();
    };

    window.refreshDoDDrawer = function() {
        if (!S.activeDoD) return;
        const { projectId, phaseNum, selectEl } = S.activeDoD;
        
        // Re-evaluate pending items based on current S.phaseChecks
        const phChecklist = S.checklistsConfig[phaseNum] || [];
        const pendingItens = phChecklist.filter(item => {
            const checkKey = `${projectId}_${item.id}`;
            return S.phaseChecks[checkKey] !== true;
        });
        
        const drawerContent = document.getElementById('dod-drawer-content');
        if (!drawerContent) return;
        
        if (pendingItens.length === 0) {
            drawerContent.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                    <div>
                        <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 1.25rem; color: var(--text); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Definition of Done (DoD)</h2>
                        <p style="font-family: 'Inter', sans-serif; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 1.5rem; line-height: 1.5;">
                            Todos os itens obrigatórios da fase foram concluídos! A fase está pronta para ser finalizada em conformidade com as diretrizes ISO 27001/27701.
                        </p>
                        <div style="text-align: center; padding: 2rem 0;">
                            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; stroke: var(--success); fill: none; stroke-width: 1.5; margin: 0 auto;">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <p style="font-size: 0.85rem; color: var(--success); margin-top: 1rem; font-weight: 500;">Pronto para conformidade</p>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
                        <button class="btn btn-primary" style="width: 100%; justify-content: center; font-weight: 500; font-size: 0.8rem; padding: 0.75rem;" onclick="window.confirmDoDCompletion()">Concluir Fase</button>
                        <button class="btn" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 0.75rem;" onclick="window.cancelDoDCompletion()">Fechar</button>
                    </div>
                </div>
            `;
            return;
        }
        
        drawerContent.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                <div>
                    <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 1.25rem; color: var(--text); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Definition of Done (DoD)</h2>
                    <p style="font-family: 'Inter', sans-serif; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 1.5rem; line-height: 1.5;">
                        Existem itens pendentes no checklist de conformidade desta fase. Para garantir a aderência às normas ISO 27001/27701, resolva as pendências abaixo ou escolha prosseguir mesmo assim.
                    </p>
                    
                    <div style="font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 0.7rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.75rem;">Pendências (${pendingItens.length})</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 55vh; overflow-y: auto; padding-right: 0.5rem;">
                        ${pendingItens.map(item => {
                            const match = item.text.match(/(A\.\d+\.\d+|Cl\s+\d+\.\d+|A\.\d+|Cl\s+\d+)/i);
                            const controlId = match ? match[0] : 'A.5.1';
                            
                            return `
                                <div class="list-item" style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border);">
                                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; width: 100%;">
                                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                            <span class="badge-cat ${item.category}" style="align-self: flex-start; font-size: 0.6rem; font-weight: 500;">${item.category.toUpperCase()}</span>
                                            <span class="item-name" style="font-size: 0.8rem; color: var(--text); font-weight: 400;">${escapeHTML(item.text)}</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem; width: 100%;">
                                        ${(item.category === 'evidence' || item.category === 'document') ? `
                                            <button class="btn" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.65rem;" onclick="wsUploadEvidence('${item.id}')">Upload</button>
                                        ` : ''}
                                        ${item.category === 'document' ? `
                                            <button class="btn btn-primary" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.65rem;" onclick="openGeneratePolicyModal('${projectId}', '${controlId}')">Gerar Política</button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; font-weight: 500; font-size: 0.8rem; padding: 0.75rem;" onclick="window.confirmDoDCompletion()">Concluir Fase mesmo assim</button>
                    <button class="btn" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 0.75rem;" onclick="window.cancelDoDCompletion()">Cancelar</button>
                </div>
            </div>
        `;
    };

    window.confirmDoDCompletion = async function() {
        if (!S.activeDoD) return;
        const { projectId, phaseNum, selectEl } = S.activeDoD;
        const newStatus = selectEl.value;
        window.closeDoDDrawer();
        selectEl.disabled = true;
        try {
            await api('PUT', `/api/v1/projects/${projectId}/phases/${phaseNum}`, { status: newStatus });
            selectEl.setAttribute('data-prev', newStatus);
            showToast(`Fase ${phaseNum} atualizada para ${newStatus}`);
            render();
        } catch (e) {
            showToast(`Erro ao atualizar fase: ${e.message}`);
            selectEl.value = selectEl.getAttribute('data-prev') || selectEl.value;
        } finally {
            selectEl.disabled = false;
            S.activeDoD = null;
        }
    };

    window.cancelDoDCompletion = function() {
        if (!S.activeDoD) return;
        const { selectEl } = S.activeDoD;
        selectEl.value = selectEl.getAttribute('data-prev') || 'in_progress';
        window.closeDoDDrawer();
        S.activeDoD = null;
    };

    window.closeDoDDrawer = function() {
        document.getElementById('dod-drawer-overlay').classList.remove('open');
    };

    window.closeDoDDrawerEl = function(e) {
        if (e && e.target !== document.getElementById('dod-drawer-overlay')) return;
        window.cancelDoDCompletion();
    };


    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--surface);
            border-left: 4px solid var(--accent);
            padding: 1rem 2rem;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            z-index: 10000;
            backdrop-filter: blur(10px);
            animation: fadeIn 0.3s ease-out;
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    async function deleteLead(id) {
        if (!confirm('Deseja excluir este lead permanentemente?')) return;
        try {
            await api('DELETE', `/api/v1/leads/${id}`);
            showToast('Lead excluído com sucesso');
            await loadAll();
            navigate('leads');
        } catch (e) { showToast('Erro ao excluir lead', 'error'); }
    }



    function openPricingOverrideModal(id) {
        const a = S.assessments.find(x => x.id === id);
        const html = `
            <div style="padding: 2rem">
                <h2 style="margin-bottom: 1.5rem">Ajustar Precificação</h2>
                <div class="form-group">
                    <label class="form-label">Preço Final Sugerido (R$)</label>
                    <input type="number" id="p-price" class="form-input" value="${a.pricing_override || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">Desconto (%)</label>
                    <input type="number" id="p-discount" class="form-input" value="${a.pricing_desconto || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">Notas de Ajuste</label>
                    <textarea id="p-notes" class="form-input" rows="3">${a.pricing_notas || ''}</textarea>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem">
                    <button class="btn btn-primary" onclick="savePricingOverride('${id}')">Salvar Ajustes</button>
                    <button class="btn" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        `;
        openModal(html);
    }

    // ——— NAVIGATION & RENDER ————————————————————————————
    function navigate(view, data) {
        S.view = view;
        if (data) Object.assign(S, data);
        
        // Update active states in sidebar
        document.querySelectorAll('.sidebar-nav').forEach(el => el.classList.remove('active'));
        const navId = `nav-${view.split('-')[0]}`;
        const el = document.getElementById(navId);
        if (el) el.classList.add('active');

        render();
    }

    function render() {
        const c = document.getElementById('content');
        const h = document.getElementById('header-title');
        const a = document.getElementById('header-actions');
        
        if (S.view === 'dashboard') renderDashboard(c, h, a);
        else if (S.view === 'leads') renderLeads(c, h, a);
        else if (S.view === 'assessments') renderAssessments(c, h, a);
        else if (S.view === 'proposals') renderProposals(c, h, a);
        else if (S.view === 'projects') renderProjects(c, h, a);
        else if (S.view === 'monitor') renderMonitor(c, h, a);
        else if (S.view === 'assets') renderAssets(c, h, a);
        else if (S.view === 'metrics') renderMetrics(c, h, a);
        else if (S.view === 'audit-trail') renderAuditTrail(c, h, a);
        else if (S.view === 'acknowledgments') renderAcknowledgments(c, h, a);
        else if (S.view === 'policies-dashboard') renderPoliciesDashboard(c, h, a);
        else if (S.view === 'risks') renderRisks(c, h, a);
        else if (S.view === 'vendors') renderVendors(c, h, a);
        else if (S.view === 'training') renderTraining(c, h, a);
        else if (S.view === 'ropa') renderROPA(c, h, a);
        else if (S.view === 'dpia') renderDPIA(c, h, a);
        else if (S.view === 'audits') renderAudits(c, h, a);
        else if (S.view === 'capa') renderCAPA(c, h, a);
        else if (S.view === 'evidence') renderEvidence(c, h, a);
        else if (S.view === 'controls') renderControls(c, h, a);
        else if (S.view === 'governance') renderGovernance(c, h, a);
        else if (S.view === 'certification') renderCertification(c, h, a);
        else if (S.view === 'ai-chat') renderAIChat(c, h, a);
        else if (S.view === 'knowledge') renderKnowledge(c, h, a);
        else if (S.view === 'settings') renderSettings(c, h, a);
        else if (S.view === 'users') renderUsers(c, h, a);
        else if (S.view === 'assessment-detail') renderAssessmentDetail(c, h, a);
        else if (S.view === 'self-service') renderSelfServiceAssessment(S.currentAssessmentId);
        else if (S.view === 'project-detail') renderProjectDetail(c, h, a);
        else if (S.view === 'soa') renderSoA(c, h, a);
        else if (S.view === 'stakeholders') renderStakeholders(c, h, a);
        else if (S.view === 'context') renderContext(c, h, a);
        else if (S.view === 'audit-execution') renderAuditExecution(c, h, a);
        else if (S.view === 'management-review') renderManagementReview(c, h, a);
        updateActiveProjectWidget();
        updateHeaderUser();
    }

    function toggleSidebar() {
        const sb = document.getElementById('sidebar');
        sb.classList.toggle('collapsed');
        const textEl = document.getElementById('toggle-sidebar-text');
        const svgEl = document.getElementById('toggle-sidebar-svg');
        if (sb.classList.contains('collapsed')) {
            if (textEl) textEl.textContent = 'Expandir';
            if (svgEl) svgEl.innerHTML = '<polyline points="13 7 18 12 13 17"/><polyline points="6 7 11 12 6 17"/>';
        } else {
            if (textEl) textEl.textContent = 'Recolher';
            if (svgEl) svgEl.innerHTML = '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>';
        }
    }

    function toggleContext() {
        const ctx = document.getElementById('context-panel');
        ctx.classList.toggle('collapsed');
    }

    function updateActiveProjectWidget() {
        const badge = document.getElementById('header-project-badge');
        if (!badge) return;
        
        const grcItems = document.querySelectorAll('.group-project-only');

        if (S.activeProject) {
            badge.textContent = S.activeProject.project_name || S.activeProject.client_name || 'Projeto';
            badge.style.display = '';
            grcItems.forEach(el => el.style.display = '');
        } else {
            badge.style.display = 'none';
            grcItems.forEach(el => el.style.display = 'none');
        }
        
        if (typeof updateSidebarProjectSelector === 'function') {
            updateSidebarProjectSelector();
        }
    }

    function updateSidebarProjectSelector() {
        const selectEl = document.getElementById('sidebar-project-select');
        if (!selectEl) return;
        const optionsHtml = ['<option value="">Selecione um projeto...</option>'];
        if (Array.isArray(S.projects)) {
            S.projects.forEach(p => {
                const name = p.project_name || p.client_name || p.id;
                optionsHtml.push(`<option value="${p.id}">${escapeHTML(name)}</option>`);
            });
        }
        selectEl.innerHTML = optionsHtml.join('');
        if (S.activeProject) {
            selectEl.value = S.activeProject.id;
        } else {
            selectEl.value = '';
        }
    }

    window.changeActiveProject = async function(projectId) {
        if (!projectId) {
            S.activeProject = null;
            S.currentProject = null;
            localStorage.removeItem('niso_activeProject');
            updateActiveProjectWidget();
            navigate('dashboard');
            return;
        }
        try {
            const p = S.projects.find(proj => proj.id === projectId) || await api('GET', `/api/v1/projects/${projectId}`);
            S.activeProject = p;
            S.currentProject = p;
            localStorage.setItem('niso_activeProject', JSON.stringify(p));
            updateActiveProjectWidget();
            navigate(S.view === 'projects' || S.view === 'project-detail' ? 'certification' : (S.view || 'dashboard'));
        } catch(e) {
            showToast('Erro ao mudar de projeto', 'error');
        }
    };

    function updateHeaderUser() {
        const avatarEl = document.getElementById('sidebar-user-avatar');
        const nameEl = document.getElementById('sidebar-user-name');
        const roleEl = document.getElementById('sidebar-user-role');
        if (S.user) {
            const initial = (S.user.name || S.user.email || 'C').charAt(0).toUpperCase();
            if (avatarEl) avatarEl.textContent = initial;
            if (nameEl) nameEl.textContent = S.user.name || S.user.email || 'Consultor';
            
            if (roleEl) {
                let roleText = 'Usuário';
                if (S.user.role === 'platform_admin' || S.user.role === 'admin') roleText = 'Administrador';
                else if (S.user.role === 'consultor' || S.user.role === 'consultant') roleText = 'Consultor';
                else if (S.user.role === 'org_admin') roleText = 'Adm. Organização';
                else if (S.user.role === 'client') roleText = 'Cliente';
                roleEl.textContent = roleText;
            }
        }
        const navUsers = document.getElementById('nav-users');
        if (navUsers) {
            if (S.user && (S.user.role === 'platform_admin' || S.user.role === 'admin' || S.user.role === 'consultor' || S.user.role === 'consultant')) {
                navUsers.style.display = '';
            } else {
                navUsers.style.display = 'none';
            }
        }
    }

    // ——— RECOVERED VIEWS ————————————————————————————————
    async function renderDashboard(c, h, a) {
        h.textContent = 'Dashboard';
        a.innerHTML = '';
        if (S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id) {
            let assessmentStatus = 'Pending';
            let proposalStatus = 'Pending';
            if (S.clientAssessmentId) assessmentStatus = 'In Progress';
            if (S.clientProposalId) {
                assessmentStatus = 'Completed';
                proposalStatus = S.clientProposalStatus || 'Draft';
            }

            let assessmentActionHtml = '';
            if (assessmentStatus === 'Completed') {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Concluído</span>';
            } else if (S.clientAssessmentId) {
                assessmentActionHtml = `<button class="btn btn-primary" onclick="navigate('self-service', { assessmentId: '${S.clientAssessmentId}' })">Responder Questionário</button>`;
            } else {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando Liberação</span>';
            }

            let html = `
                <div class="fade-in" style="max-width:800px; margin:0 auto; padding:2rem 0">
                    <h2 style="font-family:'Montserrat'; font-weight:700; font-size:2rem; margin-bottom:0.5rem; color:var(--text)">Bem-vindo à ness. nISO</h2>
                    <p style="color:var(--text-dim); font-size:0.95rem; margin-bottom:2.5rem">Seu ambiente de governança de segurança da informação (SGSI) está em fase de preparação.</p>
                    <div style="display:flex; flex-direction:column; gap:1.5rem">
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 1</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Avaliação de Escopo (Assessment Inicial)</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Questionário para mapear as atividades, equipe e tecnologia do seu negócio para cálculo do pricing e maturidade.</p>
                            </div>
                            <div style="text-align:right">
                                ${assessmentActionHtml}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 2</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Proposta Comercial e Assinatura</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Aprovação da proposta comercial baseada no escopo mapeado e assinatura digital para início da adequação.</p>
                            </div>
                            <div style="text-align:right">
                                ${proposalStatus === 'Approved' ? '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Assinado</span>' : S.clientProposalId ? '<a class="btn btn-primary" href="/api/v1/assessments/' + S.clientAssessmentId + '/generate-proposal" target="_blank" style="text-decoration:none; display:inline-block">Revisar e Assinar</a>' : '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando Assessment</span>'}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 3</div>
                                <h3 style="font-family:'Montserrat'; font-weight:600; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Início do SGSI & Projetos</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Criação automatizada de todas as 41 fases do projeto no nISO, checklists de conformidade e ativação dos assistentes de IA.</p>
                            </div>
                            <div style="text-align:right">
                                <span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Bloqueado até assinatura</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            c.innerHTML = html;
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [leads, assessments, projects, controls] = await Promise.all([
                api('GET', '/api/v1/leads').catch(() => []),
                api('GET', '/api/v1/assessments').catch(() => []),
                api('GET', '/api/v1/projects').catch(() => []),
                api('GET', '/api/v1/controls').catch(() => [])
            ]);
            const activeProjects = Array.isArray(projects) ? projects.filter(p => p.status === 'active') : [];
            
            const totalControls = Array.isArray(controls) ? controls.length : 0;
            const approvedControls = Array.isArray(controls) ? controls.filter(ctrl => ctrl.status === 'Approved' || ctrl.status === 'Implemented').length : 0;
            const gapsControls = totalControls - approvedControls;
            const complianceRate = totalControls > 0 ? Math.round((approvedControls / totalControls) * 100) : 0;

            c.innerHTML = `
                <div class="stats-grid fade-in">
                    <div class="card stat-card" onclick="navigate('leads')">
                        <div class="stat-label">Leads Ativos</div>
                        <div class="stat-value">${Array.isArray(leads) ? leads.length : 0}</div>
                    </div>
                    <div class="card stat-card" onclick="navigate('assessments')">
                        <div class="stat-label">Levantamentos</div>
                        <div class="stat-value">${Array.isArray(assessments) ? assessments.length : 0}</div>
                    </div>
                    <div class="card stat-card" onclick="navigate('projects')">
                        <div class="stat-label">Projetos em Curso</div>
                        <div class="stat-value">${activeProjects.length}</div>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem; background:linear-gradient(135deg, rgba(0,173,232,0.05) 0%, rgba(7,11,20,0) 100%)">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem">
                        <div style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:0.95rem">Burnup de Gaps — Velocidade de Conformidade</div>
                        <span class="ctx-tag" style="background:var(--accent)20; color:var(--accent); font-weight:600">${complianceRate}% Implementado</span>
                    </div>
                    <div class="progress-bar" style="height:8px; margin-bottom:1rem">
                        <div class="progress-fill" style="width: ${complianceRate}%"></div>
                    </div>
                    <div style="display:flex; gap:1.5rem; font-size:0.75rem; color:var(--text-dim)">
                        <div><strong>Controles Aprovados/Implementados:</strong> ${approvedControls}</div>
                        <div><strong>Gaps Restantes:</strong> ${gapsControls}</div>
                        <div><strong>Total do ISMS:</strong> ${totalControls}</div>
                    </div>
                </div>
                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Levantamentos Recentes</div>
                    <div style="overflow-x:auto">
                        <table class="data-table">
                            <thead>
                                <tr><th>Cliente</th><th>Status</th><th>Ação</th></tr>
                            </thead>
                            <tbody>
                                ${assessments.slice(0, 5).map(as => `
                                    <tr>
                                        <td>${escapeHTML(as.client_name)}</td>
                                        <td><span class="status-badge status-${as.status}">${as.status}</span></td>
                                        <td>
                                            <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="openAssessmentDetail('${as.id}')">Ver</button>
                                            <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="generateProposalFromAssessment('${as.id}')">ðŸ“„</button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3">Nenhum levantamento recente</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Projetos Ativos</div>
                    <div style="overflow-x:auto">
                        <table class="data-table">
                            <thead>
                                <tr><th>Projeto</th><th>Progresso</th><th>Ação</th></tr>
                            </thead>
                            <tbody>
                                ${projects.slice(0, 5).map(p => `
                                    <tr>
                                        <td>${escapeHTML(p.project_name || p.client_name)}</td>
                                        <td>
                                            <div style="display:flex;align-items:center;gap:0.5rem">
                                                <div class="progress-bar" style="flex:1;height:4px"><div class="progress-fill" style="width:${p.progress || 0}%"></div></div>
                                                <span style="font-size:0.6rem">${p.progress || 0}%</span>
                                            </div>
                                        </td>
                                        <td><button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.6rem" onclick="openProjectDetail('${p.id}')">Gerenciar</button></td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3">Nenhum projeto ativo</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card fade-in" style="margin-top:1.5rem">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:500;margin-bottom:1rem">Ações Rápidas</div>
                    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                        <button class="btn btn-primary" onclick="openCreateLeadModal()">Novo Lead</button>
                        <button class="btn" onclick="navigate('monitor')">Ver Monitor</button>
                        <button class="btn btn-ghost" onclick="loadAll()">ðŸ”„ Atualizar Dados</button>
                    </div>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar dashboard</div>';
        }
    }

    async function renderLeads(c, h, a) {
        h.textContent = 'Leads';
        a.innerHTML = '<button class="btn btn-primary" onclick="openCreateLeadModal()">+ Novo Lead</button>';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const leads = await api('GET', '/api/v1/leads');
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>Contato</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.isArray(leads) ? leads.map(l => `
                                <tr>
                                    <td>${escapeHTML(l.company_name)}</td>
                                    <td>${escapeHTML(l.contact_name)}</td>
                                    <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                                    <td><button class="btn" onclick="openLeadDetail('${l.id}')">Ver</button></td>
                                </tr>
                            `).join('') : '<tr><td colspan="4">Nenhum lead encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar leads</div>';
        }
    }

    async function renderProposals(c, h, a) {
        h.textContent = 'Propostas';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [assessments, proposals, leads] = await Promise.all([
                api('GET', '/api/v1/assessments'),
                api('GET', '/api/v1/proposals').catch(() => []),
                api('GET', '/api/v1/leads').catch(() => [])
            ]);

            // Section 1: Gerar Nova Proposta (from assessments)
            let gerarHtml = '';
            if (Array.isArray(assessments) && assessments.length > 0) {
                gerarHtml = `
                <div class="card fade-in" style="margin-bottom:1.5rem">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Gerar Nova Proposta</h3>
                    <table class="data-table">
                        <thead><tr><th>Cliente</th><th>Status</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${assessments.map(as => `<tr>
                                <td style="font-weight:500">${escapeHTML(as.client_name || 'Sem nome')}</td>
                                <td><span class="status-badge status-${as.status || 'in_progress'}">${as.status || 'Em andamento'}</span></td>
                                <td style="text-align:right">
                                    <button class="btn" onclick="viewPricing('${as.id}')">Precificar</button>
                                    <button class="btn btn-primary" style="margin-left:0.25rem" onclick="generateProposalFromAssessment('${as.id}')">Gerar Proposta</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Section 2: Propostas Geradas
            let proposalsHtml = '';
            if (Array.isArray(proposals) && proposals.length > 0) {
                proposalsHtml = `
                <div class="card fade-in" style="margin-bottom:1.5rem">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Propostas Geradas</h3>
                    <table class="data-table">
                        <thead><tr><th>Cliente</th><th>CNPJ</th><th>Valor</th><th>Status</th><th>Data</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${proposals.map(p => {
                                const nome = p.razao_social || p.company_name || '---';
                                const cnpjFmt = (p.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
                                const data = p.created_at ? p.created_at.split(' ')[0] : '---';
                                const statusCls = p.status === 'Draft' ? 'in_progress' : p.status === 'Sent' ? 'sent' : p.status === 'Signed' ? 'completed' : p.status;
                                return `<tr>
                                    <td style="font-weight:500">${escapeHTML(nome)}</td>
                                    <td style="font-size:0.8rem;color:var(--muted)">${escapeHTML(cnpjFmt||'---')}</td>
                                    <td style="color:var(--accent);font-weight:600">R$ ${(p.total_price||0).toLocaleString('pt-BR')}</td>
                                    <td><span class="status-badge status-${statusCls}">${p.status}</span></td>
                                    <td style="font-size:0.8rem">${data}</td>
                                    <td style="text-align:right">
                                        <button class="btn" onclick="viewSavedProposal('${p.id}')">Ver</button>
                                        ${p.status === 'Draft' ? `<button class="btn" style="margin-left:0.25rem" onclick="updateProposalStatus('${p.id}','Sent')">Enviar</button>` : ''}
                                        ${p.status === 'Sent' ? `<button class="btn btn-primary" style="margin-left:0.25rem" onclick="updateProposalStatus('${p.id}','Signed')">Aprovar</button>` : ''}
                                        <button class="btn" style="margin-left:0.25rem;color:#ff4d4f" onclick="deleteProposal('${p.id}')">Excluir</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Section 3: Leads / Pipeline
            let leadsHtml = '';
            if (Array.isArray(leads) && leads.length > 0) {
                leadsHtml = `
                <div class="card fade-in">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Pipeline de Leads</h3>
                    <table class="data-table">
                        <thead><tr><th>Empresa</th><th>CNPJ</th><th>Porte / CNAE</th><th>Status</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${leads.map(l => {
                                const cnpjFmt = (l.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
                                const scope = [l.porte, l.cnae_fiscal_descricao ? l.cnae_fiscal_descricao.substring(0,30) : ''].filter(Boolean).join(' — ') || '---';
                                return `<tr>
                                    <td style="font-weight:500">${escapeHTML(l.razao_social||l.company_name)}</td>
                                    <td style="font-size:0.8rem;color:var(--muted)">${escapeHTML(cnpjFmt||'---')}</td>
                                    <td style="font-size:0.8rem">${escapeHTML(scope)}</td>
                                    <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                                    <td style="text-align:right"><button class="btn" onclick="openLeadDetail('${l.id}')">Ver</button></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            c.innerHTML = (gerarHtml + proposalsHtml + leadsHtml) || '<div class="card fade-in"><div class="empty-state">Nenhuma proposta ou assessment disponivel.</div></div>';
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar propostas</div>';
        }
    }

    async function viewSavedProposal(id) {
        try {
            const p = await api('GET', '/api/v1/proposals/' + id);
            if (p.content_html) {
                openModal(`
                    <div class="modal-header">
                        <span class="modal-title">Proposta ${escapeHTML(p.status)}</span>
                        <div style="display:flex;gap:0.5rem">
                            <button class="btn" style="font-size:0.6rem;padding:0.3rem 0.75rem;border:1px solid var(--accent);color:var(--accent)" onclick="printProposal()">Imprimir / PDF</button>
                            <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                        </div>
                    </div>
                    <iframe id="proposal-frame" srcdoc="" style="width:100%;height:75vh;border:1px solid var(--border);border-radius:12px;background:#fff"></iframe>
                `, 'modal-large');
                document.getElementById('proposal-frame').srcdoc = p.content_html;
                window.printProposal = () => document.getElementById('proposal-frame').contentWindow.print();
            }
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function updateProposalStatus(id, status) {
        try {
            await api('PUT', '/api/v1/proposals/' + id, { status });
            showToast('Status atualizado para ' + status);
            render();
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function deleteProposal(id) {
        if (!confirm('Excluir esta proposta permanentemente?')) return;
        try {
            await api('DELETE', '/api/v1/proposals/' + id);
            showToast('Proposta excluida');
            render();
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function renderSettings(c, h, a) {
        h.textContent = 'Configuracoes';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const cfg = await api('GET', '/api/v1/pricing-config');

            function numInput(id, val, label, suffix) {
                return `<div class="form-group" style="flex:1;min-width:140px">
                    <label class="form-label">${label}</label>
                    <div style="display:flex;align-items:center;gap:0.25rem">
                        <input type="number" id="${id}" class="form-input" value="${val}" step="any" style="width:100%">
                        ${suffix ? `<span style="font-size:0.75rem;color:var(--muted)">${suffix}</span>` : ''}
                    </div>
                </div>`;
            }

            c.innerHTML = `
            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Taxa de Venda por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">O que cobramos do cliente por Person-Day (8h). Inclui margem, overhead e impostos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-venda-1', cfg.taxaVendaPD[1], 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-venda-2', cfg.taxaVendaPD[2], 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-venda-3', cfg.taxaVendaPD[3], 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-venda-4', cfg.taxaVendaPD[4], 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Custo Interno por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Custo real do consultor por dia (salario + beneficios). Usado para calcular margem operacional.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-custo-1', cfg.custoInternoPD[1], 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-custo-2', cfg.custoInternoPD[2], 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-custo-3', cfg.custoInternoPD[3], 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-custo-4', cfg.custoInternoPD[4], 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Tributos e Encargos</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-iss', (cfg.tributos.iss*100).toFixed(2), 'ISS', '%')}
                    ${numInput('cfg-pis', (cfg.tributos.pis*100).toFixed(2), 'PIS', '%')}
                    ${numInput('cfg-cofins', (cfg.tributos.cofins*100).toFixed(2), 'COFINS', '%')}
                    ${numInput('cfg-irpj', (cfg.tributos.irpj*100).toFixed(2), 'IRPJ', '%')}
                    ${numInput('cfg-csll', (cfg.tributos.csll*100).toFixed(2), 'CSLL', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Parametros Gerais</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-overhead', (cfg.overheadPct*100).toFixed(1), 'Overhead', '%')}
                    ${numInput('cfg-margem', (cfg.margemAlvo*100).toFixed(1), 'Margem Alvo (referencia)', '%')}
                    ${numInput('cfg-comissao', (cfg.comissaoPct*100).toFixed(1), 'Comissao', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Buffer de Risco por Tier</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Multiplicador adicional sobre o preco de venda para cobrir riscos e imprevistos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-buffer-1', (cfg.bufferRisco[1]*100).toFixed(1), 'Foundation', '%')}
                    ${numInput('cfg-buffer-2', (cfg.bufferRisco[2]*100).toFixed(1), 'Standard', '%')}
                    ${numInput('cfg-buffer-3', (cfg.bufferRisco[3]*100).toFixed(1), 'Enterprise', '%')}
                    ${numInput('cfg-buffer-4', (cfg.bufferRisco[4]*100).toFixed(1), 'Critical', '%')}
                </div>
            </div>

            <button class="btn btn-primary" style="padding:0.6rem 2rem" onclick="savePricingConfig()">Salvar Configuracoes</button>
            `;
        } catch(e) {
            c.innerHTML = '<div class="error">Erro ao carregar configuracoes</div>';
        }
    }

    async function savePricingConfig() {
        try {
            const g = id => parseFloat(document.getElementById(id).value) || 0;
            const config = {
                taxaVendaPD: { 1: g('cfg-venda-1'), 2: g('cfg-venda-2'), 3: g('cfg-venda-3'), 4: g('cfg-venda-4') },
                custoInternoPD: { 1: g('cfg-custo-1'), 2: g('cfg-custo-2'), 3: g('cfg-custo-3'), 4: g('cfg-custo-4') },
                tributos: {
                    iss: g('cfg-iss')/100, pis: g('cfg-pis')/100, cofins: g('cfg-cofins')/100,
                    irpj: g('cfg-irpj')/100, csll: g('cfg-csll')/100
                },
                overheadPct: g('cfg-overhead')/100,
                margemAlvo: g('cfg-margem')/100,
                comissaoPct: g('cfg-comissao')/100,
                bufferRisco: { 1: g('cfg-buffer-1')/100, 2: g('cfg-buffer-2')/100, 3: g('cfg-buffer-3')/100, 4: g('cfg-buffer-4')/100 }
            };
            await api('PUT', '/api/v1/pricing-config', config);
            showToast('Configuracoes salvas com sucesso');
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function renderAssessments(c, h, a) {
        h.textContent = 'Levantamentos';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const assessments = await api('GET', '/api/v1/assessments');
            console.log('Assessments loaded:', assessments);
            if (!Array.isArray(assessments) || assessments.length === 0) {
                c.innerHTML = '<div class="card fade-in"><div class="empty-state" style="padding:2rem;text-align:center;color:var(--muted)">Nenhum levantamento encontrado.</div></div>';
                return;
            }
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Status</th>
                                        <th>Criado em</th>
                                <th style="text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assessments.map(as => {
                                const date = as.created_at ? as.created_at.split(' ')[0] : '---';
                                return `
                                <tr>
                                    <td style="font-weight:500">${escapeHTML(as.client_name || 'Sem nome')}</td>
                                    <td><span class="status-badge status-${as.status || 'in_progress'}">${as.status || 'Em andamento'}</span></td>
                                    <td>${date}</td>
                                    <td style="text-align:right">
                                        <button class="btn" onclick="openAssessmentDetail('${as.id}')">Gerenciar</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            console.error('Error rendering assessments:', e);
            c.innerHTML = '<div class="error">Erro ao carregar assessments: ' + escapeHTML(e.message) + '</div>';
        }
    }

    if (!S.expandedJourneys) S.expandedJourneys = {};
    if (!S.expandedPhases) S.expandedPhases = {};
    if (!S.phaseChecks) S.phaseChecks = JSON.parse(localStorage.getItem('niso_phaseChecks') || '{}');
    if (!S.phaseChecksNotes) S.phaseChecksNotes = JSON.parse(localStorage.getItem('niso_phaseChecksNotes') || '{}');
    if (!S.phaseChecksAssigned) S.phaseChecksAssigned = JSON.parse(localStorage.getItem('niso_phaseChecksAssigned') || '{}');
    if (!S.phaseChecksDueDate) S.phaseChecksDueDate = JSON.parse(localStorage.getItem('niso_phaseChecksDueDate') || '{}');
    if (!S.interviewProgress) S.interviewProgress = JSON.parse(localStorage.getItem('niso_interviewProgress') || '{}');

    async function renderProjectDetail(c, h, a) {
        const p = S.currentProject || S.activeProject;
        if (!p) { navigate('projects'); return; }
        h.textContent = 'Jornada';
        a.innerHTML = `<button class="btn" style="border-color:var(--accent);color:var(--accent);margin-right:8px" onclick="window.openAuditorNotesModal('${p.id}')">Notas do Auditor</button><button class="btn" onclick="navigate('projects')">&larr; Voltar</button>`;
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            const [phases, config, checklistProgress, governanceMembers] = await Promise.all([
                api('GET', `/api/v1/projects/${p.id}/phases`),
                S.checklistsConfig ? Promise.resolve(S.checklistsConfig) : api('GET', '/api/v1/phases/config'),
                api('GET', `/api/v1/projects/${p.id}/checklist-progress`).catch(() => []),
                api('GET', `/api/v1/projects/${p.id}/governance`).catch(() => [])
            ]);
            
            S.checklistsConfig = config;
            S.currentGovernance = governanceMembers || [];
            // ponytail: hydrate phaseChecks and metadata from D1 (server wins over stale localStorage)
            if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
            if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
            if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
            if (!S.phaseChecksEvidence) S.phaseChecksEvidence = {};
            if (!S.phaseChecksStatus) S.phaseChecksStatus = {};
            if (!S.phaseChecksEvaluationNotes) S.phaseChecksEvaluationNotes = {};
            if (Array.isArray(checklistProgress)) {
                checklistProgress.forEach(row => {
                    S.phaseChecks[p.id + '_' + row.item_id] = !!row.is_checked;
                    S.phaseChecksNotes[p.id + '_' + row.item_id] = row.notes || '';
                    S.phaseChecksAssigned[p.id + '_' + row.item_id] = row.assigned_to || '';
                    S.phaseChecksDueDate[p.id + '_' + row.item_id] = row.due_date || '';
                    S.phaseChecksEvidence[p.id + '_' + row.item_id] = row.evidence_id || '';
                    S.phaseChecksStatus[p.id + '_' + row.item_id] = row.evaluation_status || '';
                    S.phaseChecksEvaluationNotes[p.id + '_' + row.item_id] = row.evaluation_notes || '';
                });
                localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
                localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
                localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
                localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
            }
            
            const JOURNEYS = [
                { name: "Jornada 1: Mobilização e Diagnóstico", range: [0, 6], desc: "Planejamento inicial, entrevistas, escopo e diagnóstico GRC" },
                { name: "Jornada 2: Mapeamento e Riscos", range: [7, 13], desc: "Ativos, processos, riscos de segurança/privacidade e SoA" },
                { name: "Jornada 3: Implementação SGSI (ISO 27001)", range: [14, 20], desc: "Desenho da arquitetura documental e implementação de controles práticos" },
                { name: "Jornada 4: Implementação SGPI (ISO 27701)", range: [21, 28], desc: "Implementação prática do programa de privacidade e direitos de titulares" },
                { name: "Jornada 5: Operação e Auditoria", range: [29, 33], desc: "Treinamentos, métricas operacionais, auditoria interna e revisão pela direção" },
                { name: "Jornada 6: Certificação Oficial", range: [34, 40], desc: "Melhorias contínuas, auditorias de certificação estágio 1 e 2" }
            ];

            const allPhases = Array.isArray(phases) ? phases : [];
            const totalPhasesCount = allPhases.length;
            const completedPhasesCount = allPhases.filter(ph => ph.status === 'completed').length;
            const blockedPhasesCount = allPhases.filter(ph => ph.status === 'blocked').length;
            const overallPercent = totalPhasesCount > 0 ? Math.round((completedPhasesCount / totalPhasesCount) * 100) : 0;

            const statusFilter = S.jornadaStatusFilter || 'all';
            const categoryFilter = S.jornadaCategoryFilter || 'all';
            const searchQuery = (S.jornadaSearchQuery || '').toLowerCase().trim();

            const metricsHtml = `
                <div class="stat-card" style="margin-bottom:1.5rem; padding:16px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
                        <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.02)">
                            <div style="font-size:0.65rem; color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">Progresso Geral</div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="font-size:1.5rem; font-weight:700; color:var(--text)">${overallPercent}%</div>
                                <div class="progress-bar" style="flex:1; height:8px;">
                                    <div class="progress-fill" style="width: ${overallPercent}%"></div>
                                </div>
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px">${completedPhasesCount} de ${totalPhasesCount} Fases Concluídas</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.02)">
                            <div style="font-size:0.65rem; color:${blockedPhasesCount > 0 ? 'var(--danger)' : 'var(--text-dim)'}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">Impedimentos / Bloqueios</div>
                            <div style="font-size:1.5rem; font-weight:700; color:${blockedPhasesCount > 0 ? 'var(--danger)' : 'var(--text)'}">${blockedPhasesCount}</div>
                            <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px">Fases necessitando de intervenção</div>
                        </div>
                    </div>
                </div>
            `;

            const filtersHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:1.5rem; background:rgba(255,255,255,0.01); padding:10px 16px; border:1px solid var(--border); border-radius:12px; backdrop-filter: var(--glass-blur);">
                    <div style="position:relative; flex:1;">
                        <input type="text" class="form-input" style="width:100%; padding-left:2.25rem; font-size:0.8rem; height:38px; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" placeholder="Buscar fase ou atividade..." value="${escapeHTML(S.jornadaSearchQuery || '')}" oninput="S.jornadaSearchQuery = this.value; render();">
                        <svg viewBox="0 0 24 24" style="position:absolute; left:10px; top:10px; width:18px; height:18px; stroke:var(--text-dim); stroke-width:2; fill:none; pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px;">Status</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" onchange="S.jornadaStatusFilter = this.value; render();">
                                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Todos</option>
                                <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="in_progress" ${statusFilter === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="completed" ${statusFilter === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="blocked" ${statusFilter === 'blocked' ? 'selected' : ''}>Blocked</option>
                                <option value="skipped" ${statusFilter === 'skipped' ? 'selected' : ''}>Skipped</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px;">Categoria</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; border-radius:10px; background: rgba(255,255,255,0.02); border-color: var(--border);" onchange="S.jornadaCategoryFilter = this.value; render();">
                                <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>Todas</option>
                                <option value="task" ${categoryFilter === 'task' ? 'selected' : ''}>Task</option>
                                <option value="document" ${categoryFilter === 'document' ? 'selected' : ''}>Document</option>
                                <option value="evidence" ${categoryFilter === 'evidence' ? 'selected' : ''}>Evidence</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;

            let journeysHtml = '';
            
            JOURNEYS.forEach((j, jIdx) => {
                const jPhases = Array.isArray(phases) ? phases.filter(ph => ph.phase_number >= j.range[0] && ph.phase_number <= j.range[1]) : [];
                
                // Filter phases inside this journey
                let filteredPhases = jPhases.filter(ph => {
                    if (statusFilter !== 'all' && ph.status !== statusFilter) return false;
                    const phChecklist = S.checklistsConfig[ph.phase_number] || [];
                    const matchingItems = phChecklist.filter(item => {
                        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                        if (searchQuery) {
                            return item.text.toLowerCase().includes(searchQuery);
                        }
                        return true;
                    });
                    if (searchQuery) {
                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                        if (phaseTitleMatch) return true;
                        return matchingItems.length > 0;
                    }
                    if (categoryFilter !== 'all') {
                        return matchingItems.length > 0;
                    }
                    return true;
                });

                if (filteredPhases.length === 0 && (searchQuery || statusFilter !== 'all' || categoryFilter !== 'all')) {
                    return;
                }

                const completedCount = jPhases.filter(ph => ph.status === 'completed').length;
                const totalCount = jPhases.length;
                const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                const isJExpanded = S.expandedJourneys[jIdx] === true;
                const isJ2 = jIdx === 1;
                
                journeysHtml += `
                    <div class="journey-card fade-in">
                        <div class="journey-header" onclick="toggleJourney(${jIdx})">
                            <div class="journey-title-container">
                                <div class="journey-title">${escapeHTML(j.name)}</div>
                                <div class="journey-meta">${escapeHTML(j.desc)}</div>
                            </div>
                            <div class="journey-prog-wrapper">
                                <div class="journey-meta">${completedCount}/${totalCount} Fases</div>
                                <div class="progress-bar" style="flex:1; max-width: 120px">
                                    <div class="progress-fill" style="width: ${percent}%"></div>
                                </div>
                                <div class="journey-meta" style="font-weight:500; min-width:35px">${percent}%</div>
                            </div>
                            <button class="btn-inline-action" style="margin-right:15px; border-color:var(--accent); color:var(--accent); font-weight:600;" onclick="openJornadaQuestionnaire(${jIdx}, '${p.id}'); event.stopPropagation();">📋 Diagnóstico J${jIdx + 1}</button>
                            <div class="journey-toggle-icon ${isJExpanded ? 'expanded' : ''}">&darr;</div>
                        </div>
                        <div class="journey-content ${isJExpanded ? 'expanded' : ''}" id="j-content-${jIdx}">
                            ${window.renderJourneyDiagnosticPanel(jIdx, p.id)}
                            ${filteredPhases.map(ph => {
                                const isPhExpanded = S.expandedPhases[ph.phase_number] === true;
                                const phChecklist = S.checklistsConfig[ph.phase_number] || [];
                                const filteredItems = phChecklist.filter(item => {
                                    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                                    if (searchQuery) {
                                        const matchText = item.text.toLowerCase().includes(searchQuery);
                                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                                        return matchText || phaseTitleMatch;
                                    }
                                    return true;
                                });
                                
                                return `
                                    <div class="phase-card">
                                        <div class="phase-card-header" onclick="togglePhase(${ph.phase_number})">
                                            <div class="phase-card-title">
                                                <div class="phase-num">${ph.phase_number}</div>
                                                <div class="title-text">${escapeHTML(ph.title)}</div>
                                            </div>
                                            <div class="phase-actions-wrapper" onclick="event.stopPropagation()">
                                                <select class="phase-status-select" onchange="changePhaseStatus('${p.id}', ${ph.phase_number}, this)">
                                                    <option value="pending" ${ph.status === 'pending' ? 'selected' : ''}>Pending</option>
                                                    <option value="in_progress" ${ph.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                                    <option value="completed" ${ph.status === 'completed' ? 'selected' : ''}>Completed</option>
                                                    <option value="blocked" ${ph.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                                                    <option value="skipped" ${ph.status === 'skipped' ? 'selected' : ''}>Skipped</option>
                                                </select>
                                                <div class="phase-toggle-icon ${isPhExpanded ? 'expanded' : ''}" onclick="togglePhase(${ph.phase_number}); event.stopPropagation()">&darr;</div>
                                            </div>
                                        </div>
                                        <div class="phase-details ${isPhExpanded ? 'expanded' : ''}" id="p-details-${ph.phase_number}">
                                            ${ph.notes ? `
                                                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem; padding:0.5rem; background:rgba(255,255,255,0.02); border-left:2px solid var(--accent); border-radius:4px">
                                                    <strong>Notas:</strong> ${escapeHTML(ph.notes)}
                                                </div>
                                            ` : ''}
                                            
                                            ${(window.PHASE_PLAYBOOKS && window.PHASE_PLAYBOOKS[ph.phase_number]) ? `
                                                <div class="playbook-card" style="margin-bottom:1.25rem; padding:12px; background:rgba(0,173,232,0.04); border-left:3px solid var(--accent); border-radius:10px; font-size:0.75rem">
                                                    <div style="font-weight:600; color:var(--accent); margin-bottom:4px; font-family:'Montserrat',sans-serif; text-transform:uppercase; letter-spacing:0.5px; font-size:0.7rem">Diretriz do Consultor: ${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].obj)}</div>
                                                    <div style="color:var(--text); line-height:1.4">${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].guideline)}</div>
                                                </div>
                                            ` : ''}
                                            
                                            <div class="checklist-title">Checklist de Conformidade (${phChecklist.length} itens)</div>
                                            ${filteredItems.length > 0 ? `
                                                <div class="checklist-list">
                                                    ${filteredItems.map(item => {
                                                        const checkKey = `${p.id}_${item.id}`;
                                                        const isChecked = S.phaseChecks[checkKey] === true;
                                                        const itemNotes = (S.phaseChecksNotes && S.phaseChecksNotes[checkKey]) || '';
                                                        const itemAssigned = (S.phaseChecksAssigned && S.phaseChecksAssigned[checkKey]) || '';
                                                        const itemDueDate = (S.phaseChecksDueDate && S.phaseChecksDueDate[checkKey]) || '';
                                                        const itemEvidenceId = (S.phaseChecksEvidence && S.phaseChecksEvidence[checkKey]) || '';
                                                        const itemStatus = (S.phaseChecksStatus && S.phaseChecksStatus[checkKey]) || '';
                                                        const itemEvalNotes = (S.phaseChecksEvaluationNotes && S.phaseChecksEvaluationNotes[checkKey]) || '';
                                                        const isDetailsExpanded = S.expandedChecklistDetails && S.expandedChecklistDetails[item.id] === true;
                                                        
                                                        const hasTip = !!ISO_GUIDELINES[item.id];
                                                        const isTipExpanded = S.expandedTips && S.expandedTips[item.id] === true;
                                                        const tipInfo = ISO_GUIDELINES[item.id];

                                                        let badgeHtml = '';
                                                        if (isChecked && itemEvidenceId) {
                                                            let statusColor = 'var(--text-dim)';
                                                            let statusLabel = 'Pendente [AI]';
                                                            if (itemStatus === 'conforme') {
                                                                statusColor = '#00ade8';
                                                                statusLabel = 'Conforme [AI]';
                                                            } else if (itemStatus === 'parcial') {
                                                                statusColor = '#ffc107';
                                                                statusLabel = 'Aviso [AI]';
                                                            } else if (itemStatus === 'nao conforme') {
                                                                statusColor = '#ff4d4d';
                                                                statusLabel = 'Falha [AI]';
                                                            }
                                                            badgeHtml = `<span style="font-size:0.6rem; padding:2px 6px; border-radius:4px; border:1px solid ${statusColor}; color:${statusColor}; margin-left:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${statusLabel}</span>`;
                                                        }

                                                        let borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                                                        if (isChecked) {
                                                            borderLeftColor = 'var(--success)';
                                                            if (itemStatus && itemStatus !== 'conforme') {
                                                                borderLeftColor = 'var(--danger)';
                                                            }
                                                        }

                                                        return `
                                                            <div class="checklist-item-wrapper" style="margin-bottom: 0.75rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border); border-left: 3px solid ${borderLeftColor}; border-radius: 10px; padding: 0.75rem;">
                                                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                                                                    <div class="checklist-left" style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                                                                        <input type="checkbox" class="checklist-item-checkbox" 
                                                                            ${isChecked ? 'checked' : ''} 
                                                                            onclick="toggleChecklistItem('${p.id}', '${item.id}', this)"
                                                                            ${(!isChecked && item.id === 'p2_2') ? 'disabled' : ''}>
                                                                        <span class="badge-cat ${item.category}">${item.category}</span>
                                                                        <span class="checklist-text ${isChecked ? 'checked' : ''}">${escapeHTML(item.text)}</span>
                                                                        ${badgeHtml}
                                                                        ${hasTip ? `
                                                                            <button class="btn-ghost" onclick="toggleAuditorTip('${item.id}'); event.stopPropagation()" style="font-size:0.85rem; padding:2px 6px; color:var(--accent); line-height:1; display:inline-flex; align-items:center; justify-content:center;" title="Ver dica do auditor">💡</button>
                                                                        ` : ''}
                                                                    </div>
                                                                    <div class="checklist-actions" style="display: flex; align-items: center; gap: 0.5rem;">
                                                                        ${itemEvidenceId ? `
                                                                            <button class="btn-inline-action" style="border-color:var(--accent); color:var(--accent);" onclick="openInternalDocumentEditor('${itemEvidenceId}'); event.stopPropagation()">Editar Doc</button>
                                                                        ` : ''}
                                                                        ${(item.category === 'evidence' || item.category === 'document') ? `
                                                                            <button class="btn-inline-action" onclick="wsUploadEvidence('${item.id}')">Upload</button>
                                                                        ` : ''}
                                                                        ${(!isChecked && (item.category === 'document' || DOC_WIZARDS[item.id])) ? `
                                                                            <button class="btn-inline-action primary" onclick="openDocWizard('${p.id}', '${item.id}'); event.stopPropagation()">${DOC_WIZARDS[item.id] ? (DOC_WIZARDS[item.id].evidenceOnly ? 'Registrar Evidência' : 'Preencher e Gerar') : 'Gerar IA'}</button>
                                                                        ` : ''}
                                                                        ${(item.id === 'p2_2') ? `
                                                                            <button class="btn-inline-action primary" onclick="openInterviewWizard('${p.id}'); event.stopPropagation()">${isChecked ? 'Ver Entrevistas' : 'Conduzir Entrevistas'}</button>
                                                                        ` : ''}
                                                                        <button class="btn-ghost" onclick="toggleChecklistDetails('${item.id}'); event.stopPropagation()" style="font-size:0.75rem; color:${isDetailsExpanded ? 'var(--accent)' : 'var(--text-dim)'}; padding:4px 6px; display:inline-flex; align-items:center;" title="Editar detalhes, responsável e prazo">⚙️</button>
                                                                    </div>
                                                                </div>
                                                                ${(hasTip && isTipExpanded) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(0,173,232,0.03); border:1px solid rgba(0,173,232,0.1); border-radius:8px; padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div style="color:var(--accent); font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.6rem; letter-spacing:0.5px;">💡 Auditoria (${tipInfo.control}) - ${tipInfo.tip}</div>
                                                                        <div style="color:var(--text); margin-bottom:6px;"><strong style="color:var(--text-dim);">Dica:</strong> ${escapeHTML(tipInfo.advice)}</div>
                                                                        <div style="color:var(--text-dim);"><strong style="color:var(--text-dim);">Evidência Recomendada:</strong> ${escapeHTML(tipInfo.evidence)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${(isChecked && itemStatus && itemStatus !== 'conforme' && itemEvalNotes) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(255,77,77,0.03); border:1px solid rgba(255,77,77,0.15); border-radius:8px; padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div style="color:#ff4d4d; font-weight:700; margin-bottom:4px; text-transform:uppercase; font-size:0.6rem; letter-spacing:0.5px;">⚠️ Gaps Identificados [AI]</div>
                                                                        <div style="color:var(--text);">${escapeHTML(itemEvalNotes)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${isDetailsExpanded ? `
                                                                    <div class="checklist-notes-group" style="margin-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 0.5rem;">
                                                                        <div style="font-size: 0.65rem; color: var(--text-dim); margin-bottom: 0.25rem;">Anotação / Conteúdo da Atividade</div>
                                                                        ${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? formatActivityNotes(itemNotes) : ''}
                                                                        <textarea class="form-input" 
                                                                            placeholder="Digite aqui para registrar informações (Ex: nome do sponsor executivo, link do documento, etc.)"
                                                                            style="width: 100%; height: 50px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; color: var(--text); font-size: 0.7rem; font-family: inherit; resize: vertical; margin-bottom: 0.5rem;"
                                                                            onblur="saveChecklistItemNotes('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? '' : escapeHTML(itemNotes)}</textarea>
                                                                        
                                                                        <div style="display: flex; gap: 12px; align-items: center;">
                                                                            <div style="flex: 1;">
                                                                                <div style="font-size: 0.6rem; color: var(--text-dim); margin-bottom: 0.25rem;">Responsável</div>
                                                                                <select class="form-input" style="width: 100%; font-size: 0.7rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 4px 8px; color: var(--text);"
                                                                                    onchange="saveChecklistItemAssigned('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">
                                            ${window.renderGovernanceSelectOptions(S.currentGovernance, itemAssigned)}
                                            </select>
                                                                            </div>
                                                                            <div style="width: 150px;">
                                                                                <div style="font-size: 0.6rem; color: var(--text-dim); margin-bottom: 0.25rem;">Prazo</div>
                                                                                <input type="date" class="form-input" style="width: 100%; font-size: 0.7rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 3px 8px; color: var(--text);"
                                                                                    value="${itemDueDate}"
                                                                                    onchange="saveChecklistItemDueDate('${p.id}', ${ph.phase_number}, '${item.id}', this.value)">
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ` : ''}
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            ` : '<div style="font-size:0.75rem;color:var(--text-dim)">Nenhum item de checklist para esta fase.</div>'}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });
            
            c.innerHTML = `
                <div style="margin-top: 0.5rem;">
                    ${metricsHtml}
                    ${filtersHtml}
                    ${journeysHtml || '<div class="empty-state"><h3>Nenhuma fase correspondente aos filtros</h3></div>'}
                </div>
            `;
            if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        } catch (e) {
            c.innerHTML = `<div class="error">Erro ao carregar fases do projeto: ${e.message}</div>`;
        }
    }
    
    window.toggleJourney = function(jIdx) {
        const targetVal = !S.expandedJourneys[jIdx];
        if (targetVal) {
            S.expandedJourneys = {};
            S.expandedJourneys[jIdx] = true;
        } else {
            S.expandedJourneys[jIdx] = false;
        }
        render();
    };

    window.togglePhase = function(phaseNum) {
        const targetVal = !S.expandedPhases[phaseNum];
        if (targetVal) {
            S.expandedPhases = {};
            S.expandedPhases[phaseNum] = true;
        } else {
            S.expandedPhases[phaseNum] = false;
        }
        render();
    };

    window.changePhaseStatus = async function(projectId, phaseNum, selectEl) {
        const newStatus = selectEl.value;
        
        // Critério de Aceite de Entregas (Definition of Done)
        if (newStatus === 'completed') {
            const phChecklist = S.checklistsConfig[phaseNum] || [];
            const pendingItens = phChecklist.filter(item => {
                const checkKey = `${projectId}_${item.id}`;
                return S.phaseChecks[checkKey] !== true;
            });
            
            if (pendingItens.length > 0) {
                window.openDoDDrawer(projectId, phaseNum, selectEl, pendingItens);
                return;
            }
        }

        selectEl.disabled = true;
        try {
            await api('PUT', `/api/v1/projects/${projectId}/phases/${phaseNum}`, { status: newStatus });
            selectEl.setAttribute('data-prev', newStatus);
            showToast(`Fase ${phaseNum} atualizada para ${newStatus}`);
            render();
        } catch (e) {
            showToast(`Erro ao atualizar fase: ${e.message}`);
            selectEl.value = selectEl.getAttribute('data-prev') || selectEl.value;
        } finally {
            selectEl.disabled = false;
        }
    };

    window.toggleChecklistItem = function(projectId, itemId, checkboxEl) {
        const checkKey = `${projectId}_${itemId}`;
        S.phaseChecks[checkKey] = checkboxEl.checked;
        localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
        
        const labelEl = checkboxEl.parentElement.querySelector('.checklist-text');
        if (checkboxEl.checked) {
            labelEl.classList.add('checked');
        } else {
            labelEl.classList.remove('checked');
        }
        showToast(checkboxEl.checked ? 'Item concluído' : 'Item reaberto');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();

        // ponytail: debounced save to D1
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const key in S.phaseChecks) {
                if (key.startsWith(projectId + '_')) {
                    const iid = key.replace(projectId + '_', '');
                    const match = iid.match(/^p(\d+)_/);
                    if (match) {
                        items.push({ 
                            phase_number: parseInt(match[1]), 
                            item_id: iid, 
                            is_checked: !!S.phaseChecks[key],
                            notes: (S.phaseChecksNotes && S.phaseChecksNotes[key]) || null,
                            assigned_to: (S.phaseChecksAssigned && S.phaseChecksAssigned[key]) || null,
                            due_date: (S.phaseChecksDueDate && S.phaseChecksDueDate[key]) || null
                        });
                    }
                }
            }
            if (items.length > 0) {
                try { await api('PUT', '/api/v1/projects/' + projectId + '/checklist-progress', { items }); }
                catch (e) { console.warn('Checklist sync error:', e); }
            }
        }, 500);
    };

    async function renderGovernance(c, h, a) {
        h.textContent = 'Governança & Equipe';
        a.innerHTML = '';
        const p = S.currentProject || S.activeProject;
        if (!p) {
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para visualizar a governança.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>';
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const members = await api('GET', `/api/v1/projects/${p.id}/governance`);
            S.currentGovernance = members || [];
            
            c.innerHTML = `
                <div class="card fade-in">
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1.5rem">Organize e gerencie os papéis da equipe do SGSI do seu projeto.</div>
                    ${window.renderProjectGovernance(S.currentGovernance, p.id)}
                </div>
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar governança: ${e.message}</div>`;
        }
    }

    async function renderProjects(c, h, a) {
        h.textContent = 'Projetos';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const projects = await api('GET', '/api/v1/projects');
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Setor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.isArray(projects) ? projects.map(p => `
                                <tr>
                                    <td>${escapeHTML(p.client_name)}</td>
                                    <td>${escapeHTML(p.sector)}</td>
                                    <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                                    <td><button class="btn btn-primary" onclick="openProjectDetail('${p.id}')">Gerenciar</button></td>
                                </tr>
                            `).join('') : '<tr><td colspan="4">Nenhum projeto encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar projetos</div>';
        }
    }

    async function openProjectDetail(id) {
        try {
            const p = await api('GET', `/api/v1/projects/${id}`);
            S.activeProject = p;
            S.currentProject = p;
            navigate('project-detail');
        } catch(e) { alert('Erro ao carregar projeto'); }
    }

    async function promoteToProject(id) {
        if (!confirm('Deseja converter este assessment em um projeto ativo?')) return;
        try {
            await api('POST', `/api/v1/assessments/${id}/convert`);
            alert('Projeto criado com sucesso!');
            navigate('projects');
        } catch(e) { alert('Erro: ' + e.message); }
    }

    function openCreateLeadModal() {
        openModal(`<h3 style="margin-bottom:1rem">Novo Lead</h3>
            <div class="form-group"><label class="form-label">Empresa</label><input type="text" id="lead-company" class="form-input"></div>
            <div class="form-group"><label class="form-label">Contato</label><input type="text" id="lead-contact" class="form-input"></div>
            <div class="form-group"><label class="form-label">CNPJ</label>
                <div style="display:flex;gap:0.5rem">
                    <input type="text" id="lead-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" oninput="maskCnpj(this)">
                    <button class="btn" onclick="previewCnpj()" style="white-space:nowrap">Consultar</button>
                </div>
                <div id="cnpj-preview" style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
                <button class="btn" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="doCreateLead()">Criar Lead</button>
            </div>`);
    }

    function maskCnpj(el) {
        let v = el.value.replace(/\D/g, '').slice(0, 14);
        if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
        el.value = v;
    }

    async function previewCnpj() {
        const raw = (document.getElementById('lead-cnpj').value || '').replace(/\D/g, '');
        const el = document.getElementById('cnpj-preview');
        if (raw.length !== 14) { el.textContent = 'CNPJ deve ter 14 digitos'; return; }
        el.textContent = 'Consultando...';
        try {
            const res = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + raw);
            if (!res.ok) { el.textContent = 'CNPJ nao encontrado'; return; }
            const d = await res.json();
            el.innerHTML = '<span style="color:var(--accent)">'+escapeHTML(d.razao_social)+'</span> — '+escapeHTML(d.municipio||'')+'/'+escapeHTML(d.uf||'')+' — '+escapeHTML(d.descricao_situacao_cadastral||'');
            // auto-fill company name if empty
            const cn = document.getElementById('lead-company');
            if (!cn.value) cn.value = d.razao_social || d.nome_fantasia || '';
        } catch(e) { el.textContent = 'Erro: ' + e.message; }
    }

    async function doCreateLead() {
        const company_name = document.getElementById('lead-company').value;
        const contact_name = document.getElementById('lead-contact').value;
        const cnpj = (document.getElementById('lead-cnpj').value || '').replace(/\D/g, '');
        if (!company_name) return;
        try {
            const lead = await api('POST', '/api/v1/leads', { company_name, contact_name, status: 'new' });
            // enrich CNPJ if provided
            if (cnpj.length === 14 && lead?.id) {
                try { await api('POST', '/api/v1/leads/' + lead.id + '/enrich-cnpj', { cnpj }); } catch(e) { console.warn('CNPJ enrich failed:', e); }
            }
            closeModal(); render();
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function openLeadDetail(id) {
        const l = await api('GET', '/api/v1/leads/' + id);
        const cnpjBadge = l.cnpj_fetched_at ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:rgba(0,173,232,0.12);color:var(--accent);margin-left:0.5rem">CNPJ Verificado</span>' : '';
        const cnpjInfo = l.razao_social ? `
            <div style="margin:1rem 0;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:12px">
                <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem">Dados Receita Federal</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.85rem">
                    <div><strong>Razao Social:</strong> ${escapeHTML(l.razao_social)}</div>
                    <div><strong>CNPJ:</strong> ${escapeHTML(l.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}</div>
                    <div><strong>Porte:</strong> ${escapeHTML(l.porte||'---')}</div>
                    <div><strong>CNAE:</strong> ${escapeHTML(l.cnae_fiscal_descricao||'---')}</div>
                    <div><strong>Municipio:</strong> ${escapeHTML(l.municipio||'---')}/${escapeHTML(l.uf||'')}</div>
                    <div><strong>Situacao:</strong> ${escapeHTML(l.situacao_cadastral||'---')}</div>
                </div>
            </div>` : '';
        const enrichBtn = !l.cnpj_fetched_at ? `
            <div class="form-group" style="margin-top:1rem">
                <label class="form-label">Enriquecer via CNPJ</label>
                <div style="display:flex;gap:0.5rem">
                    <input type="text" id="lead-enrich-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" oninput="maskCnpj(this)">
                    <button class="btn btn-primary" onclick="enrichLeadCnpj('${l.id}')">Consultar</button>
                </div>
            </div>` : '';
        openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(l.company_name)}${cnpjBadge}</span><button class="btn-ghost" onclick="forceCloseModal()">\u2715</button></div>
            <p><strong>Contato:</strong> ${escapeHTML(l.contact_name||'---')}</p>
            <p><strong>Status:</strong> <span class="status-badge status-${l.status}">${l.status}</span></p>
            ${cnpjInfo}${enrichBtn}
            <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end">
                <button class="btn btn-primary" onclick="createAssessmentFromLead('${l.id}','${escapeHTML(l.razao_social||l.company_name)}')">Iniciar Levantamento</button>
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
            </div>`);
    }

    async function enrichLeadCnpj(id) {
        const cnpj = (document.getElementById('lead-enrich-cnpj').value||'').replace(/\D/g,'');
        if (cnpj.length !== 14) { showToast('CNPJ deve ter 14 digitos','error'); return; }
        try {
            showToast('Consultando CNPJ...');
            await api('POST', '/api/v1/leads/' + id + '/enrich-cnpj', { cnpj });
            showToast('CNPJ enriquecido com sucesso');
            openLeadDetail(id); // re-open with enriched data
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function createAssessmentFromLead(leadId, clientName) {
        try {
            forceCloseModal();
            const res = await api('POST', '/api/v1/assessments', { client_name: clientName, lead_id: leadId });
            showToast('Levantamento criado para ' + clientName);
            openAssessmentDetail(res.id);
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function openAssessmentDetail(id) {
        S.currentBlock = 1; // reset to first block
        navigate('assessment-detail', { currentAssessmentId: id });
    }

    async function renderAssessmentDetail(c, h, a) {
        const id = S.currentAssessmentId;
        const currentIdx = (S.currentBlock || 1) - 1;
        const currentBlock = ASSESSMENT_BLOCKS[currentIdx];

        h.textContent = 'Levantamento';
        a.innerHTML = '<button class="btn" onclick="navigate(\'assessments\')">&larr; Voltar</button>';
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            const [as, answers] = await Promise.all([
                api('GET', `/api/v1/assessments/${id}`),
                api('GET', `/api/v1/assessments/${id}/answers`)
            ]);
            
            h.textContent = `${as.client_name || 'Levantamento'} — Bloco ${S.currentBlock}`;
            
            // Map answers for easy access
            const answerMap = {};
            (answers || []).forEach(ans => {
                if (!answerMap[ans.block]) answerMap[ans.block] = {};
                answerMap[ans.block][ans.question_key] = ans.answer;
            });

            // Sidebar HTML
            const sidebarHtml = ASSESSMENT_BLOCKS.map((b, idx) => {
                const isActive = (idx + 1) === S.currentBlock;
                const blockAns = answerMap[b.block] || {};
                const totalQ = b.questions.length;
                const answeredQ = b.questions.filter(q => blockAns[q.key]).length;
                const isCompleted = answeredQ === totalQ;

                return `
                    <div class="wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" onclick="goToBlock(${idx + 1})">
                        <div class="step-dot"></div>
                        <div class="step-label">Bloco ${b.block}: ${b.title}</div>
                        ${isCompleted ? '<span style="margin-left:auto;color:var(--success);font-size:0.6rem">&#10003;</span>' : ''}
                    </div>
                `;
            }).join('');

            // Questions HTML for current block
            const questionsHtml = currentBlock.questions.map(q => {
                const val = (answerMap[currentBlock.block] || {})[q.key] || '';
                let inputHtml = '';

                if (q.type === 'yesno') {
                    inputHtml = `
                        <div class="yesno-group">
                            <button class="yesno-btn ${val === 'yes' ? 'yesno-active' : ''}" onclick="setWizardAnswer('${q.key}', 'yes', this)">Sim</button>
                            <button class="yesno-btn ${val === 'no' ? 'yesno-active' : ''}" onclick="setWizardAnswer('${q.key}', 'no', this)">Não</button>
                        </div>
                    `;
                } else if (q.type === 'select' && q.options) {
                    inputHtml = `
                        <div class="ness-select" id="select-${q.key}">
                            <div class="ness-select-trigger" onclick="toggleNessSelect(this)">${val || 'Selecione uma opção'}</div>
                            <div class="ness-select-options">
                                <div class="ness-select-option ${!val ? 'selected' : ''}" onclick="selectNessOption(this, '${q.key}', '')">Selecione uma opção</div>
                                ${q.options.map(o => `
                                    <div class="ness-select-option ${val === o ? 'selected' : ''}" onclick="selectNessOption(this, '${q.key}', '${escapeHTML(o)}')">${escapeHTML(o)}</div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else if (q.type === 'multi' && q.options) {
                    inputHtml = `
                        <div class="multi-chips" data-key="${q.key}">
                            ${q.options.map(o => {
                                const active = (val || '').split('||').includes(o);
                                return `<div class="chip ${active ? 'chip-active' : ''}" onclick="toggleWizardChip(this, '${q.key}')">${escapeHTML(o)}</div>`;
                            }).join('')}
                        </div>
                    `;
                } else {
                    inputHtml = `<input type="text" class="form-input wizard-input" data-key="${q.key}" value="${escapeHTML(val)}" oninput="setWizardAnswer('${q.key}', this.value)" placeholder="Sua resposta...">`;
                }

                return `
                    <div class="form-group">
                        <label class="form-label">${escapeHTML(q.text || q.question)}</label>
                        ${inputHtml}
                    </div>
                `;
            }).join('');

            c.innerHTML = `
                <div class="wizard-layout fade-in">
                    <div class="wizard-sidebar">
                        ${sidebarHtml}
                        <div style="margin-top:auto; padding-top:1rem; border-top:1px solid var(--border-dim)">
                            ${as.status !== 'converted' ? `<button class="btn btn-primary" style="width:100%" onclick="promoteToProject('${as.id}')">ðŸš€ Converter para Projeto</button>` : '<div class="ctx-tag ctx-tag-green" style="text-align:center">Projeto Ativo</div>'}
                        </div>
                    </div>
                    <div class="wizard-content">
                        <div class="wizard-card">
                            <div style="margin-bottom:1.5rem">
                                <h2 style="font-family:'Montserrat',sans-serif;font-size:1.1rem;margin-bottom:0.25rem">${currentBlock.title}</h2>
                                <p style="font-size:0.75rem;color:var(--muted)">Responda as questões abaixo para completar este bloco.</p>
                            </div>
                            <div class="wizard-questions">
                                <div style="display:grid;gap:1.5rem">
                                    ${questionsHtml}
                                </div>
                            </div>
                            <div class="wizard-footer" style="margin-top:0; padding-top:1.5rem">
                                <button class="btn" onclick="goToBlock(${S.currentBlock - 1})" ${S.currentBlock === 1 ? 'style="display:none"' : ''}>Anterior</button>
                                <div style="margin-left:auto; display:flex; gap:0.5rem">
                                    <button class="btn btn-primary" onclick="goToBlock(${S.currentBlock + 1})" style="padding: 0.75rem 2.5rem; font-size: 0.75rem; box-shadow: 0 4px 15px rgba(0,173,232,0.3)">${S.currentBlock === ASSESSMENT_BLOCKS.length ? 'Gravar e Finalizar' : 'Gravar e Continuar'}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Initialize local state for current block answers
            S.blockAnswers = answerMap[currentBlock.block] || {};

        } catch(e) {
            c.innerHTML = '<div class="error">Erro ao carregar detalhes: ' + e.message + '</div>';
        }
    }

    function toggleNessSelect(trigger) {
        const parent = trigger.parentElement;
        const isOpen = parent.classList.contains('open');
        document.querySelectorAll('.ness-select').forEach(s => s.classList.remove('open'));
        if (!isOpen) parent.classList.add('open');
        
        // Close on outside click
        if (!isOpen) {
            const closer = (e) => {
                if (!parent.contains(e.target)) {
                    parent.classList.remove('open');
                    document.removeEventListener('click', closer);
                }
            };
            setTimeout(() => document.addEventListener('click', closer), 10);
        }
    }

    function selectNessOption(opt, key, val) {
        const parent = opt.closest('.ness-select');
        const trigger = parent.querySelector('.ness-select-trigger');
        trigger.textContent = val || 'Selecione uma opção';
        parent.classList.remove('open');
        setWizardAnswer(key, val);
        
        // UI update
        parent.querySelectorAll('.ness-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
    }

    async function goToBlock(num) {
        // safety sync: ensure all current inputs are in S.blockAnswers
        document.querySelectorAll('.wizard-input').forEach(input => {
            if (input.dataset.key) S.blockAnswers[input.dataset.key] = input.value;
        });

        // Save current block before moving if there are answers
        if (Object.keys(S.blockAnswers || {}).length > 0) {
            const block = ASSESSMENT_BLOCKS[S.currentBlock - 1];
            const answers = Object.entries(S.blockAnswers).map(([k, v]) => ({
                question_key: k,
                question: '',
                answer: v,
                notes: ''
            }));
            
            try {
                await api('POST', `/api/v1/assessments/${S.currentAssessmentId}/block/${block.block}`, {
                    answers
                });
            } catch(e) { console.error('Save failed', e); }
        }

        if (num > ASSESSMENT_BLOCKS.length) {
            // Finalize assessment
            try {
                await api('PUT', `/api/v1/assessments/${S.currentAssessmentId}`, { status: 'completed' });
                alert('Assessment finalizado com sucesso!');
                navigate('assessments');
            } catch(e) { alert('Erro ao finalizar: ' + e.message); }
            return;
        }

        if (num < 1) return;
        
        S.currentBlock = num;
        render();
    }

    function setWizardAnswer(key, val, el) {
        S.blockAnswers[key] = val;
        if (el && el.classList.contains('yesno-btn')) {
            el.closest('.yesno-group').querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('yesno-active'));
            el.classList.add('yesno-active');
        }
    }

    function toggleWizardChip(el, key) {
        el.classList.toggle('chip-active');
        const container = el.closest('.multi-chips');
        const selected = [...container.querySelectorAll('.chip-active')].map(c => c.textContent);
        S.blockAnswers[key] = selected.join('||');
    }

    async function openPhaseDetail(projectId, phaseNum) {
        // Basic implementation
        alert('Detalhes da fase ' + phaseNum);
    }


    async function wsUploadEvidence(docType) {
        const labels = { organograma:'Organograma', policy:'Politicas Existentes', inventory:'Inventario de Ativos', topology:'Topologia de Rede', systems:'Lista de Sistemas', contracts:'Contratos Fornecedores', incidents:'Registro de Incidentes', certifications:'Certificacoes Vigentes', floorplan:'Planta Baixa', audit_report:'Relatorio de Auditoria', ropa:'RoPA / Mapeamento Dados', backup_dr:'Backup e DR' };
        openModal(`<h3 style="margin-bottom:1rem">Upload: ${labels[docType] || docType}</h3>
            <div class="form-group"><label class="form-label">Arquivo</label><input type="file" id="doc-file" class="form-input" accept=".pdf,.docx,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg"></div>
            <div id="doc-msg" style="font-size:0.7rem;color:var(--muted);margin:0.5rem 0"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end">
                <button class="btn" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="doDocUpload('${docType}')">Upload e Extrair</button>
            </div>`);
    }

    async function doDocUpload(docType) {
        const file = document.getElementById('doc-file')?.files?.[0];
        if (!file) { document.getElementById('doc-msg').textContent = 'Selecione um arquivo.'; return; }
        document.getElementById('doc-msg').textContent = 'Enviando...';
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('document_type', docType);
            const res = await fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/documents/upload`, {
                method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }, body: fd
            });
            const data = await res.json();
            if (data.ok) {
                showToast('Upload concluído');
                closeModal();
                render();
            } else {
                document.getElementById('doc-msg').textContent = data.error || 'Erro no upload.';
                document.getElementById('doc-msg').style.color = 'var(--danger)';
            }
        } catch(e) {
            document.getElementById('doc-msg').textContent = 'Erro: ' + e.message;
        }
    }

    async function wsViewExtraction(docId) {
        try {
            const docs = await api('GET', `/api/v1/projects/${S.currentProject.id}/documents`);
            const doc = (docs || []).find(d => d.id === docId);
            if (!doc) return;
            openModal(`<h3 style="margin-bottom:1rem">Extracao: ${escapeHTML(doc.filename)}</h3>
                <div style="font-size:0.5rem;color:var(--muted);margin-bottom:0.5rem">Status: ${doc.status} | Tipo: ${doc.document_type}</div>
                <textarea class="form-input" id="doc-ext-edit" rows="12" style="font-size:0.7rem;font-family:monospace;line-height:1.6">${escapeHTML(doc.extracted_summary || '')}</textarea>
                <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem">
                    <button class="btn" onclick="forceCloseModal()">Fechar</button>
                    <button class="btn btn-primary" onclick="wsConfirmExtraction('${docId}')">Confirmar e Indexar</button>
                </div>`);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function wsConfirmExtraction(docId) {
        const summary = document.getElementById('doc-ext-edit')?.value;
        if (!summary) return;
        await api('PUT', `/api/v1/projects/${S.currentProject.id}/documents/${docId}`, { extracted_summary: summary, status: 'confirmed' });
        forceCloseModal();
        render();
    }

    // ——— EVIDENCE VIEW (was missing) —————————————————
    async function renderEvidence(c, h, a) {
        h.textContent = 'Evidencias';
        a.innerHTML = '';
        if (!S.currentProject) {
            c.innerHTML = '<div class="empty-state fade-in"><h3>Selecione um projeto</h3><p>Acesse um projeto para ver suas evidencias.</p></div>';
            return;
        }
        a.innerHTML = `<button class="btn btn-primary" onclick="openEvidenceUploadModal('${S.currentProject.id}')">Upload Evidencia</button>`;
        let evidence = [];
        try { evidence = await api('GET', `/api/v1/projects/${S.currentProject.id}/evidence`); } catch(e) {}
        if (!Array.isArray(evidence)) evidence = [];
        if (!evidence.length) {
            c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhuma evidencia</h3><p>Faca upload de evidencias para este projeto.</p></div>';
            return;
        }
        c.innerHTML = `<div class="fade-in">
            <div style="display:flex; flex-direction:column; gap:1rem">
                ${evidence.map(e => {
                    const fileName = e.file_name || e.filename || 'Evidência sem nome';
                    const fileHash = e.file_hash || e.sha256_hash || '';
                    const hash = fileHash ? fileHash.substring(0, 16) : '';
                    const date = e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : '';
                    const sizeKB = e.file_size ? `${(e.file_size / 1024).toFixed(1)} KB` : '';
                    
                    const cisoSign = e.ciso_approved_by 
                      ? `<span style="color:var(--success)">DPO: Assinado por ${escapeHTML(e.ciso_approved_by)} (${new Date(e.ciso_approved_at).toLocaleDateString('pt-BR')})</span>` 
                      : `<span style="color:var(--text-dim)">DPO: Pendente de assinatura</span>`;
                      
                    const ceoSign = e.ceo_approved_by 
                      ? `<span style="color:var(--success)">CEO: Assinado por ${escapeHTML(e.ceo_approved_by)} (${new Date(e.ceo_approved_at).toLocaleDateString('pt-BR')})</span>` 
                      : `<span style="color:var(--text-dim)">CEO: Pendente de assinatura</span>`;

                    const isOrgUser = S.user && S.user.role === 'org_user';
                    const cisoBtn = (!e.ciso_approved_by && !isOrgUser)
                      ? `<button class="btn btn-ghost" onclick="signEvidence('${e.id}', 'ciso')">Assinar DPO</button>` 
                      : '';
                      
                    const ceoBtn = (!e.ceo_approved_by && !isOrgUser)
                      ? `<button class="btn btn-ghost" onclick="signEvidence('${e.id}', 'ceo')">Assinar CEO</button>` 
                      : '';

                    return `<div class="card" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; gap:1.5rem">
                        <div style="flex:1">
                            <div style="font-family:'Montserrat', sans-serif; font-weight:500; font-size:0.9rem; margin-bottom:0.4rem; color:var(--text)">${escapeHTML(fileName)}</div>
                            <div style="display:flex; gap:1rem; font-size:0.7rem; color:var(--text-dim)">
                                <span>Tamanho: ${sizeKB}</span>
                                <span>Data: ${date}</span>
                                <span>Por: ${escapeHTML(e.uploaded_by || 'system')}</span>
                            </div>
                            ${hash ? `<div style="font-size:0.65rem; color:var(--accent); font-family:monospace; margin-top:0.4rem">SHA-256: ${hash}...</div>` : ''}
                            <div style="display:flex; flex-direction:column; gap:0.25rem; margin-top:0.6rem; font-size:0.75rem">
                                <div>${cisoSign}</div>
                                <div>${ceoSign}</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:0.5rem">
                            ${cisoBtn}
                            ${ceoBtn}
                            <button class="btn btn-ghost" onclick="viewEvidence('${e.id}')">Ver</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    async function viewPricing(id) {
        try {
            const p = await api('GET', `/api/v1/assessments/${id}/pricing`);
            window._pricingEco = p.eco || {};
            const eco = p.eco || {};
            const tier = p.tier || {};
            const scope = p.scopeInfo || {};
            const hc = eco.margemPct >= 0.20 ? 'var(--success)' : eco.margemPct >= 0.10 ? 'var(--warning)' : 'var(--danger)';

            const fases = (p.fases || []).map(f => `
                <tr>
                    <td style="font-weight:500">${escapeHTML(f.nome || f.name || f.fase)}</td>
                    <td style="color:var(--muted)">${f.semanas}s</td>
                    <td style="color:var(--muted)">${f.pdNess} PD</td>
                    <td style="color:var(--accent);font-weight:600;text-align:right">R$ ${(f.valorFase/1000).toFixed(1)}k</td>
                </tr>`).join('');

            openModal(`
                <div class="modal-header">
                    <span class="modal-title">Precifica\u00e7\u00e3o \u2014 <span style="color:var(--accent)">${escapeHTML(tier.name)}</span></span>
                    <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                </div>

                <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap">
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Score</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${p.score}<span style="font-size:0.65rem;color:var(--muted)">/${p.scoreMax}</span></div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Dura\u00e7\u00e3o</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${escapeHTML(tier.duracao)}</div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Escopo</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${escapeHTML(scope.label || '< 50')}</div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Margem</div>
                        <div style="font-size:1.1rem; font-weight:300; color:${hc}" id="pv-margem-card">${Math.round(eco.margemPct * 100)}%</div>
                    </div>
                </div>

                <div style="text-align:center; margin-bottom:1.5rem">
                    <div style="font-size:2.5rem; font-weight:300; color:var(--accent); letter-spacing:-0.03em" id="pv-price">R$ ${p.precoFinal.toLocaleString('pt-BR')}</div>
                    <div style="font-size:0.5rem; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin:0.5rem 0 1rem">ajuste o valor</div>
                    <input type="range" class="pricing-slider" id="slide-price" min="${Math.round(p.precoFinal * 0.4)}" max="${Math.round(p.precoFinal * 2.5)}" step="500" value="${p.precoFinal}" oninput="pricingSlide()" style="width:80%">
                </div>

                <div style="display:flex; gap:2rem; justify-content:center; margin-bottom:1.5rem; font-size:0.65rem; color:var(--muted)">
                    <span>Receita: <strong style="color:var(--text)" id="pv-receita">R$ ${(eco.receitaLiquida/1000).toFixed(1)}k</strong></span>
                    <span>Custo: <strong style="color:var(--text)">R$ ${(eco.custoTotal/1000).toFixed(1)}k</strong></span>
                    <span>Lucro: <strong id="pv-lucro" style="color:${hc}">R$ ${(eco.margemOp/1000).toFixed(1)}k</strong></span>
                    <span id="pv-status" class="status-badge" style="background:${hc}22;color:${hc};font-size:0.5rem;padding:0.1rem 0.4rem">${eco.margemPct >= 0.20 ? 'Saud\u00e1vel' : 'Ajustar'}</span>
                </div>

                <div style="display:flex; gap:1.5rem; justify-content:center; margin-bottom:1.5rem; font-size:0.55rem; color:var(--muted); opacity:0.7">
                    <span>Base: ${tier.pdNess} PDs</span>
                    <span>Maturidade: x${(p.score / (p.scoreMax||1) * 0.4 + 0.8).toFixed(2)}</span>
                    <span>Escopo: x${scope.fator || '1.0'}</span>
                    <span>Taxa PD: R$ ${eco.taxaBlendada}</span>
                </div>

                <table class="pricing-table">
                    <thead><tr><th>Fase</th><th>Tempo</th><th>Esfor\u00e7o</th><th style="text-align:right">Valor</th></tr></thead>
                    <tbody>${fases}</tbody>
                </table>

                <div style="display:flex; gap:1rem; align-items:flex-end; margin-top:1.5rem">
                    <div style="flex:1">
                        <label class="form-label">N\u00ba da Proposta</label>
                        <input type="text" id="pv-proposal-num" class="form-input" placeholder="Ex: PROP-2026-001" style="padding:0.5rem 0.75rem">
                    </div>
                    <button class="btn btn-primary" style="flex:0 0 auto" onclick="savePricingVal('${id}')">Salvar</button>
                    <button class="btn" style="flex:0 0 auto; border:1px solid var(--accent); color:var(--accent)" onclick="generateProposalFromAssessment('${id}')">Gerar Proposta</button>
                </div>
            `, 'modal-large');

            window.pricingSlide = () => {
                const price = parseInt(document.getElementById('slide-price').value);
                const eco = window._pricingEco;
                const trib = eco.totalTributosPct || 0.15;
                const rec = price - (price * trib);
                const lucro = rec - eco.custoTotal;
                const pct = lucro / price;
                const hc = pct >= 0.20 ? 'var(--success)' : pct >= 0.10 ? 'var(--warning)' : 'var(--danger)';
                document.getElementById('pv-price').textContent = 'R$ ' + price.toLocaleString('pt-BR');
                document.getElementById('pv-receita').textContent = 'R$ ' + (rec/1000).toFixed(1) + 'k';
                document.getElementById('pv-lucro').textContent = 'R$ ' + (lucro/1000).toFixed(1) + 'k';
                document.getElementById('pv-lucro').style.color = hc;
                document.getElementById('pv-margem-card').textContent = Math.round(pct * 100) + '%';
                document.getElementById('pv-margem-card').style.color = hc;
                const st = document.getElementById('pv-status');
                st.textContent = pct >= 0.20 ? 'Saud\u00e1vel' : 'Ajustar';
                st.style.color = hc; st.style.background = hc + '22';
            };

            window.savePricingVal = async (aid) => {
                const price = parseInt(document.getElementById('slide-price').value);
                const proposalNum = document.getElementById('pv-proposal-num').value.trim();
                try {
                    await api('PUT', `/api/v1/assessments/${aid}/pricing`, { precoFinal: price, notas: proposalNum ? `Proposta: ${proposalNum}` : '' });
                    showToast('Salvo!');
                    forceCloseModal();
                } catch(e) { alert(e.message); }
            };

        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function savePricingOverride(id) {
        const precoFinal = parseFloat(document.getElementById('p-price').value);
        const desconto = parseFloat(document.getElementById('p-discount').value);
        const notas = document.getElementById('p-notes').value;
        try {
            await api('PUT', `/api/v1/assessments/${id}/pricing`, { precoFinal, desconto, notas });
            showToast('Ajustes salvos com sucesso');
            forceCloseModal();
            loadAll();
            render();
        } catch(e) { showToast('Erro ao salvar ajustes: ' + e.message, 'error'); }
    }

    async function generateProposalFromAssessment(id) {
        // Fetch assessment and linked lead data for pre-filling
        let lead = {};
        try {
            const as = await api('GET', '/api/v1/assessments/' + id);
            if (as.lead_id) lead = await api('GET', '/api/v1/leads/' + as.lead_id);
        } catch(e) { console.warn('Could not fetch lead data:', e); }
        const fmtCnpj = (lead.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
        // Step 1: Show prompt form to collect proposal metadata
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Dados da Proposta</span>
                <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                <div class="form-group">
                    <label class="form-label">N\u00ba da Proposta</label>
                    <input type="text" id="pp-num" class="form-input" placeholder="PROP-2026-001">
                </div>
                <div class="form-group">
                    <label class="form-label">Validade (dias)</label>
                    <input type="number" id="pp-validade" class="form-input" value="30">
                </div>
                <div class="form-group">
                    <label class="form-label">Raz\u00e3o Social do Cliente</label>
                    <input type="text" id="pp-razao" class="form-input" value="${escapeHTML(lead.razao_social||lead.company_name||'')}" placeholder="Empresa Ltda.">
                </div>
                <div class="form-group">
                    <label class="form-label">CNPJ</label>
                    <input type="text" id="pp-cnpj" class="form-input" value="${escapeHTML(fmtCnpj)}" placeholder="00.000.000/0001-00">
                </div>
                <div class="form-group">
                    <label class="form-label">Respons\u00e1vel (Cliente)</label>
                    <input type="text" id="pp-resp-cliente" class="form-input" value="${escapeHTML(lead.contact_name||'')}" placeholder="Nome completo">
                </div>
                <div class="form-group">
                    <label class="form-label">Cargo (Cliente)</label>
                    <input type="text" id="pp-cargo-cliente" class="form-input" placeholder="CTO, CISO, Diretor...">
                </div>
                <div class="form-group">
                    <label class="form-label">Respons\u00e1vel ness.</label>
                    <input type="text" id="pp-resp-ness" class="form-input" value="ness.">
                </div>
                <div class="form-group">
                    <label class="form-label">Cargo ness.</label>
                    <input type="text" id="pp-cargo-ness" class="form-input" value="Lead Consultant">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Condi\u00e7\u00e3o de Pagamento</label>
                <select id="pp-pagamento" class="form-input">
                    <option value="40/30/30">40% kick-off, 30% entrega documental, 30% p\u00f3s-auditoria</option>
                    <option value="50/50">50% kick-off, 50% na conclus\u00e3o</option>
                    <option value="30/30/20/20">30% kick-off, 30% meio, 20% entrega, 20% p\u00f3s-cert</option>
                    <option value="mensal">Parcelas mensais iguais</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Observa\u00e7\u00f5es Adicionais</label>
                <textarea id="pp-obs" class="form-input" rows="2" placeholder="Notas espec\u00edficas para esta proposta..."></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:0.5rem" onclick="submitProposalPrompt('${id}')">Gerar Proposta</button>
        `, 'modal-large');
    }

    async function submitProposalPrompt(id) {
        const meta = {
            proposalNum: document.getElementById('pp-num').value.trim(),
            validade: document.getElementById('pp-validade').value,
            razaoSocial: document.getElementById('pp-razao').value.trim(),
            cnpj: document.getElementById('pp-cnpj').value.trim(),
            respCliente: document.getElementById('pp-resp-cliente').value.trim(),
            cargoCliente: document.getElementById('pp-cargo-cliente').value.trim(),
            respNess: document.getElementById('pp-resp-ness').value.trim(),
            cargoNess: document.getElementById('pp-cargo-ness').value.trim(),
            condicaoPagamento: document.getElementById('pp-pagamento').value,
            observacoes: document.getElementById('pp-obs').value.trim()
        };
        try {
            forceCloseModal();
            showToast('Gerando proposta...');
            const res = await api('POST', `/api/v1/assessments/${id}/generate-proposal`, meta);
            if (res.html) {
                openModal(`
                    <div class="modal-header">
                        <span class="modal-title">Proposta Draft</span>
                        <div style="display:flex;gap:0.5rem">
                            <button class="btn" style="font-size:0.6rem;padding:0.3rem 0.75rem;border:1px solid var(--accent);color:var(--accent)" onclick="printProposal()">Imprimir / PDF</button>
                            <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                        </div>
                    </div>
                    <iframe id="proposal-frame" srcdoc="" style="width:100%;height:80vh;border:1px solid var(--border);border-radius:12px;background:#fff"></iframe>
                `, 'modal-large');
                document.getElementById('proposal-frame').srcdoc = res.html;
                window.printProposal = () => {
                    const oldTitle = document.title;
                    document.title = res.proposal_num || 'Proposta';
                    document.getElementById('proposal-frame').contentWindow.print();
                    document.title = oldTitle;
                };
            } else {
                showToast('Proposta salva com sucesso');
                navigate('proposals');
            }
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    // ——— CONTROLS ———————————————————————————————————————
    function renderControls(c, h, a) {
        h.textContent = S.lang === 'en' ? 'Controls' : 'Controles';
        if (!S.controls.length) {
            c.innerHTML = `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Os controles serão populados pelo backend.</p></div>`;
            return;
        }
        c.innerHTML = `<div class="fade-in card" style="padding:0;overflow:hidden">${S.controls.map(ctrl => `
            <div class="phase-item" onclick="openControlDetail('${ctrl.id}')" style="cursor:pointer">
                <div class="phase-num" style="width:3.5rem;color:var(--accent)">${ctrl.id}</div>
                <div style="flex:1">
                    <div class="phase-title">${ctrl.title}</div>
                    ${ctrl.maturity ? `<div style="font-size:0.6rem; color:var(--muted)">Maturidade: ${ctrl.maturity}/5</div>` : ''}
                </div>
                <div class="phase-status ${ctrl.status==='Compliant'?'status-done':ctrl.status==='Partial'?'status-progress':'status-pending'}">${ctrl.status}</div>
            </div>`).join('')}</div>`;
    }

    // ——— CONTROL DETAIL —————————————————————————————————
    function openControlDetail(controlId) {
        const ctrl = S.controls.find(c => c.id === controlId);
        if (!ctrl) return;

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${ctrl.id}: ${escapeHTML(ctrl.title)}</span>
                <button class="btn-ghost" onclick="closeModal()">&times;</button>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <div class="ctx-label">Descrição</div>
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.4">${escapeHTML(ctrl.description || 'Nenhuma descrição.')}</div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                    <div>
                        <div class="ctx-label">Status do Controle</div>
                        <select class="form-input" onchange="updateControlStatus('${ctrl.id}', this.value)" style="width:100%">
                            <option value="Missing" ${ctrl.status === 'Missing' ? 'selected' : ''}>Ausente</option>
                            <option value="Partial" ${ctrl.status === 'Partial' ? 'selected' : ''}>Parcial</option>
                            <option value="Compliant" ${ctrl.status === 'Compliant' ? 'selected' : ''}>Conforme</option>
                        </select>
                    </div>
                    <div>
                        <div class="ctx-label">Maturidade (CMM 0-5)</div>
                        <div style="display:flex; align-items:center; gap: 1rem; background:rgba(255,255,255,0.03); padding:0.5rem; border-radius:8px">
                            <input type="range" min="0" max="5" step="1" value="${ctrl.maturity || 0}" 
                                oninput="this.nextElementSibling.textContent = this.value"
                                onchange="updateControlMaturity('${ctrl.id}', this.value)"
                                style="flex:1">
                            <span style="font-weight:700; color:var(--accent); min-width:1rem">${ctrl.maturity || 0}</span>
                        </div>
                    </div>
                </div>

                <div class="ctx-label">Evidências Vinculadas</div>
                <div id="control-evidence-list" class="card" style="padding:0; margin-bottom: 1.5rem; max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2)">
                    <div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Carregando evidências...</div>
                </div>
                
                <div style="display:flex; gap:0.75rem">
                    <button class="btn btn-primary" style="flex:1" onclick="generatePolicyForControl('${ctrl.id}')">Gerar Política AI</button>
                    <button class="btn" style="flex:1" onclick="openEvidenceUploadModal('${S.currentProject?.id}', '${ctrl.id}')">Upload Evidência</button>
                </div>
            </div>
        `);
        loadControlEvidence(ctrl.id);
    }

    async function updateControlStatus(id, status) {
        try {
            await api('PUT', `/api/v1/controls/${id}/status`, { status });
            await loadControls();
            // Do not close modal, just refresh background
        } catch(e) { alert(e.message); }
    }

    async function updateControlMaturity(id, maturity) {
        try {
            await api('PUT', `/api/v1/controls/${id}/maturity`, { maturity: parseInt(maturity) });
            await loadControls();
        } catch(e) { alert(e.message); }
    }

    async function loadControlEvidence(controlId) {
        const listEl = document.getElementById('control-evidence-list');
        if (!listEl) return;
        try {
            const evidences = await api('GET', `/api/v1/projects/${S.currentProject?.id}/evidence`);
            const filtered = evidences.filter(e => e.control_id === controlId);
            if (!filtered.length) {
                listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Nenhuma evidência vinculada.</div>';
                return;
            }
            listEl.innerHTML = filtered.map(e => `
                <div style="padding:0.6rem 1rem; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center">
                    <div>
                        <div style="font-size:0.8rem; font-weight:500">${escapeHTML(e.filename)}</div>
                        <div style="font-size:0.6rem; color:var(--muted)">${e.evaluation_status || 'pendente'}</div>
                    </div>
                    <button class="btn-ghost" onclick="viewEvidence('${e.id}')" style="padding:0.25rem">Ver</button>
                </div>
            `).join('');
        } catch(e) { listEl.innerHTML = `<div style="padding:1rem; color:var(--danger)">Erro ao carregar.</div>`; }
    }

    async function generatePolicyForControl(controlId) {
        const btn = event.target;
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${S.currentProject?.id}/generate-policy`, { control_id: controlId });
            alert('Política gerada com sucesso! Verifique o Log de Atividade.');
            closeModal();
        } catch(e) { alert(e.message); }
        finally { btn.disabled = false; btn.textContent = oldText; }
    }

    // ——— CHIP & YESNO ———————————————————————————————————
    function toggleChip(el, key) {
        el.classList.toggle('chip-active');
        const container = el.closest('.multi-chips');
        const selected = [...container.querySelectorAll('.chip-active')].map(c => c.textContent);
        S.blockAnswers[key] = selected.join('||');
        updateContextPanel();
    }
    function setYesNo(el, key, val) {
        const group = el.closest('.yesno-group');
        group.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('yesno-active'));
        el.classList.add('yesno-active');
        S.blockAnswers[key] = val;
        updateContextPanel();
    }

    // ——— NOTIFICATIONS ——————————————————————————————————
    async function loadNotifications() {
        try {
            S.notifications = await api('GET', '/api/v1/notifications');
        } catch(e) { S.notifications = []; }
        updateNotifBadge();
    }

    function updateNotifBadge() {
        const unread = (S.notifications || []).filter(n => !n.read).length;
        const countEl = document.getElementById('notif-count');
        if (countEl) {
            countEl.textContent = unread;
            countEl.style.display = unread > 0 ? 'flex' : 'none';
        }
    }

    function toggleNotifications() {
        const dd = document.getElementById('notif-dropdown');
        dd.classList.toggle('open');
        if (dd.classList.contains('open')) renderNotifDropdown();
    }

    function renderNotifDropdown() {
        const dd = document.getElementById('notif-dropdown');
        const items = S.notifications || [];
        if (!items.length) {
            dd.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Sem notificacoes</div>';
            return;
        }
        dd.innerHTML = items.slice(0, 15).map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}')">
                <div style="font-weight:dots${n.read ? '400' : '600'}">dots${escapeHTML(n.title)}</div>
                <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.2rem">${escapeHTML(n.message || '')}</div>
                <div class="notif-time">${n.created_at ? n.created_at.split('T')[0] : ''}</div>
            </div>
        `).join('');
    }

    async function markNotifRead(id) {
        try { await api('PUT', `/api/v1/notifications/${id}/read`); } catch(e) {}
        await loadNotifications();
        renderNotifDropdown();
    }

    async function handleNotificationClick(id) {
        const n = (S.notifications || []).find(x => x.id === id);
        
        // 1. Mark as read and reload list
        try { await api('PUT', `/api/v1/notifications/${id}/read`); } catch(e) {}
        await loadNotifications();
        renderNotifDropdown();
        
        // Close dropdown
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.remove('open');

        if (!n) return;

        // 2. Prioritize Action Type & Target ID (Deep-linking)
        if (n.action_type && n.target_id) {
            const actionType = n.action_type;
            const targetId = n.target_id;
            const projectId = S.activeProject ? S.activeProject.id : (S.projects && S.projects[0] ? S.projects[0].id : '');

            if (actionType === 'open_finding') {
                navigate('capa');
                if (projectId) {
                    try {
                        const capas = await api('GET', `/api/v1/projects/${projectId}/capa`) || [];
                        const ca = capas.find(x => x.id === targetId);
                        if (ca) {
                            setTimeout(() => {
                                openEditCAPAModal(targetId, projectId, ca);
                            }, 150);
                        }
                    } catch (e) {}
                }
                return;
            } else if (actionType === 'open_soa') {
                navigate('soa');
                setTimeout(() => {
                    const row = document.getElementById(`soa-row-${targetId}`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('pulse-highlight');
                        setTimeout(() => {
                            row.classList.remove('pulse-highlight');
                        }, 3000);
                    }
                }, 200);
                return;
            }
        }

        // 3. Contextual navigation based on link or metadata
        const link = n.link || '';
        const title = n.title || '';
        const message = n.message || '';
        
        if (link) {
            const parts = link.split('/');
            if (parts[1] === 'projects') {
                const projectId = parts[2];
                const subview = parts[3];
                
                let proj = S.projects.find(p => p.id === projectId);
                if (!proj && S.currentProject && S.currentProject.id === projectId) proj = S.currentProject;
                if (!proj) proj = { id: projectId };
                
                if (subview === 'evidence') {
                    navigate('evidence', { currentProject: proj });
                } else if (subview === 'controls') {
                    navigate('controls', { currentProject: proj });
                } else if (subview === 'soa') {
                    navigate('soa', { currentProject: proj });
                } else {
                    navigate('project-detail', { currentProject: proj });
                }
            } else if (parts[1] === 'proposals') {
                const proposalId = parts[2];
                navigate('proposals', { currentProposalId: proposalId });
            } else if (parts[1] === 'assessments') {
                const assessmentId = parts[2];
                navigate('assessments', { currentAssessmentId: assessmentId });
            } else if (link === '/risks') {
                navigate('risks');
            } else if (link === '/vendors') {
                navigate('vendors');
            } else if (link === '/training') {
                navigate('training');
            } else if (link === '/ropa') {
                navigate('ropa');
            } else if (link === '/audits') {
                navigate('audits');
            } else if (link === '/capa') {
                navigate('capa');
            } else if (link === '/evidence') {
                navigate('evidence');
            } else if (link === '/controls') {
                navigate('controls');
            } else if (link.startsWith('/')) {
                navigate(link.substring(1));
            }
        } else {
            // Keyword fallback mapping (Phase 5 requirement)
            const lowerTitle = title.toLowerCase();
            const lowerMsg = (message || '').toLowerCase();
            
            if (lowerTitle.includes('pergunta') || lowerMsg.includes('pergunta') || lowerTitle.includes('pendência') || lowerMsg.includes('pendência') || lowerTitle.includes('evidência') || lowerMsg.includes('evidência')) {
                if (S.currentProject) {
                    navigate('evidence', { currentProject: S.currentProject });
                } else if (S.projects && S.projects.length > 0) {
                    navigate('evidence', { currentProject: S.projects[0] });
                } else {
                    navigate('evidence');
                }
            } else if (lowerTitle.includes('auditoria') || lowerMsg.includes('auditoria')) {
                navigate('audits');
            } else if (lowerTitle.includes('risco') || lowerMsg.includes('risco')) {
                navigate('risks');
            } else if (lowerTitle.includes('fornecedor') || lowerMsg.includes('fornecedor')) {
                navigate('vendors');
            } else if (lowerTitle.includes('treinamento') || lowerMsg.includes('treinamento')) {
                navigate('training');
            } else if (lowerTitle.includes('ação corretiva') || lowerMsg.includes('ação corretiva') || lowerTitle.includes('capa') || lowerMsg.includes('capa')) {
                navigate('capa');
            } else if (lowerTitle.includes('ropa') || lowerMsg.includes('ropa')) {
                navigate('ropa');
            } else if (lowerTitle.includes('proposta') || lowerMsg.includes('proposta')) {
                navigate('proposals');
            } else if (lowerTitle.includes('contrato') || lowerMsg.includes('contrato')) {
                navigate('projects');
            } else if (lowerTitle.includes('assessment') || lowerMsg.includes('assessment')) {
                navigate('assessments');
            }
        }
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const dd = document.getElementById('notif-dropdown');
        const badge = document.getElementById('notif-badge');
        if (dd && badge && !dd.contains(e.target) && !badge.contains(e.target)) {
            dd.classList.remove('open');
        }
    });

    // ——— SPRINT B: STATEMENT OF APPLICABILITY (SoA) ——————————————————————
    async function renderSoA(c, h, a) {
        h.textContent = 'Statement of Applicability (SoA)';
        a.innerHTML = '';
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo para visualizar o SoA.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando controles do SoA...</div>';
        try {
            const [controls, traceData] = await Promise.all([
                api('GET', `/api/v1/projects/${S.activeProject.id}/controls`) || [],
                api('GET', `/api/v1/projects/${S.activeProject.id}/traceability`).then(r => r.controls).catch(() => [])
            ]);
            
            const traceMap = {};
            if (Array.isArray(traceData)) {
                traceData.forEach(t => { traceMap[t.id] = t; });
            }
            window.currentSoATraceMap = traceMap;
            window.currentSoAFilter = 'all';

            // Agrupar por tema/seção
            const groups = {};
            let totalApplicable = 0, totalNA = 0, totalJustified = 0;
            
            controls.forEach(ctrl => {
                const group = (ctrl.standard || 'Other').split('.').slice(0, 2).join('.');
                if (!groups[group]) groups[group] = [];
                groups[group].push(ctrl);
                
                const isNA = ctrl.status === 'Not Applicable';
                if (isNA) {
                    totalNA++;
                    if (ctrl.description && ctrl.description.trim() !== '') {
                        totalJustified++;
                    }
                } else {
                    totalApplicable++;
                }
            });
            
            let html = `
                <div style="display:flex;gap:24px;margin-bottom:2rem">
                    <div class="stat-card" style="flex:1">
                        <div class="stat-value" style="font-size:1.8rem">${totalApplicable} / ${controls.length}</div>
                        <div class="stat-label">Controles Aplicáveis</div>
                    </div>
                    <div class="stat-card" style="flex:1">
                        <div class="stat-value" style="font-size:1.8rem">${totalNA}</div>
                        <div class="stat-label">Controles Não Aplicáveis</div>
                    </div>
                    <div class="stat-card" style="flex:1">
                        <div class="stat-value" style="font-size:1.8rem">${totalJustified} / ${totalNA}</div>
                        <div class="stat-label">Justificativas de Exclusão</div>
                    </div>
                </div>

                <div class="soa-filters" style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:2rem;align-items:center;background:rgba(15,20,35,0.4);border:1px solid var(--border);border-radius:12px;padding:16px;backdrop-filter:var(--glass-blur)">
                    <div style="flex:1;min-width:280px;position:relative">
                        <input type="text" id="soa-search" placeholder="Buscar por ID ou termo..." oninput="window.filterSoATable()" style="width:100%;background:rgba(7,11,20,0.5);border:1px solid var(--border);border-radius:10px;padding:8px 12px 8px 36px;color:var(--text);font-size:0.85rem;outline:none" />
                        <svg viewBox="0 0 24 24" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-dim);fill:none;stroke-width:1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <button class="btn btn-filter active" data-filter="all" onclick="window.setSoAFilter('all')" style="font-size:0.75rem;padding:6px 12px;background:rgba(0,173,232,0.15);border-color:var(--accent);color:var(--accent)">Todos</button>
                        <button class="btn btn-filter" data-filter="applicable" onclick="window.setSoAFilter('applicable')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="not_applicable" onclick="window.setSoAFilter('not_applicable')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Não Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="gaps" onclick="window.setSoAFilter('gaps')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Gaps</button>
                        <button class="btn btn-filter" data-filter="approved" onclick="window.setSoAFilter('approved')" style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aprovados</button>
                    </div>
                </div>
            `;
            
            for (const [group, ctrls] of Object.entries(groups).sort()) {
                html += `
                    <div class="soa-section" style="margin-bottom:2rem">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.2rem;margin-bottom:1rem;color:var(--accent)">
                            Seção ${group}
                        </div>
                        <div class="data-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:100px">ID</th>
                                        <th style="width:220px">Controle</th>
                                        <th style="width:140px">Aplicável?</th>
                                        <th style="width:120px">Status</th>
                                        <th style="width:150px">Rastreabilidade</th>
                                        <th>Justificativa / Notas</th>
                                        <th style="width:100px">Maturidade</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                ctrls.forEach(ctrl => {
                    const isNA = ctrl.status === 'Not Applicable';
                    const trace = traceMap[ctrl.id] || { risks: [], evidence: [] };
                    const risksCount = (trace.risks || []).length;
                    const evidenceCount = (trace.evidence || []).length;

                    html += `
                        <tr id="soa-row-${ctrl.id}" class="soa-row" data-standard="${escapeHTML(ctrl.standard || '')}" data-title="${escapeHTML(ctrl.title || '')}" data-status="${escapeHTML(ctrl.status || 'Missing')}">
                            <td style="font-weight:600;color:var(--accent)">${escapeHTML(ctrl.standard)}</td>
                            <td style="font-weight:500">${escapeHTML(ctrl.title)}</td>
                            <td>
                                <select onchange="window.toggleSoAApplicability('${ctrl.id}', this.value)" class="custom-select" style="padding:4px 8px;width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:10px">
                                    <option value="Applicable" ${!isNA ? 'selected' : ''}>Sim</option>
                                    <option value="Not Applicable" ${isNA ? 'selected' : ''}>Não</option>
                                </select>
                            </td>
                            <td>
                                <span class="badge ${isNA ? 'badge-not-applicable' : 'badge-' + (ctrl.status || 'missing').toLowerCase().replace(/\s/g,'-')}">
                                    ${escapeHTML(ctrl.status || 'Missing')}
                                </span>
                            </td>
                            <td>
                                <div style="display:flex;gap:6px">
                                    <span onclick="window.showControlRisks('${ctrl.id}', '${escapeHTML(ctrl.standard)}')" class="badge-trace" style="cursor:pointer;background:${risksCount > 0 ? 'rgba(0,173,232,0.15)' : 'rgba(255,255,255,0.02)'};color:${risksCount > 0 ? '#00ade8' : 'var(--text-dim)'};border:1px solid ${risksCount > 0 ? 'rgba(0,173,232,0.25)' : 'var(--border)'};padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${risksCount} risco(s) vinculado(s)">
                                        R: ${risksCount}
                                    </span>
                                    <span onclick="window.showControlEvidence('${ctrl.id}', '${escapeHTML(ctrl.standard)}')" class="badge-trace" style="cursor:pointer;background:${evidenceCount > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)'};color:${evidenceCount > 0 ? '#10b981' : 'var(--text-dim)'};border:1px solid ${evidenceCount > 0 ? 'rgba(16,185,129,0.2)' : 'var(--border)'};padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${evidenceCount} evidência(s) vinculada(s)">
                                        E: ${evidenceCount}
                                    </span>
                                </div>
                                <div style="display:flex;gap:4px;margin-top:4px">
                                    ${ctrl.ciso_approved_by ? `<span class="badge" style="font-size:0.55rem;padding:2px 4px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)" title="Assinado por DPO: ${escapeHTML(ctrl.ciso_approved_by)}">DPO ✓</span>` : ''}
                                    ${ctrl.ceo_approved_by ? `<span class="badge" style="font-size:0.55rem;padding:2px 4px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)" title="Assinado por CEO: ${escapeHTML(ctrl.ceo_approved_by)}">CEO ✓</span>` : ''}
                                </div>
                            </td>
                            <td>
                                <input type="text" value="${escapeHTML(ctrl.description || '')}" 
                                    onblur="window.saveSoAJustification('${ctrl.id}', this.value)" 
                                    placeholder="${isNA ? 'Justificativa obrigatória para exclusão' : 'Notas do consultor...'}" 
                                    style="width:100%;background:transparent;border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:0.85rem" />
                            </td>
                            <td>
                                <span style="font-weight:600">${ctrl.maturity || 0} / 5</span>
                            </td>
                        </tr>
                    `;
                });
                
                html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar SoA: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.setSoAFilter = function(filter) {
        window.currentSoAFilter = filter;
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const isMatch = btn.getAttribute('data-filter') === filter;
            btn.classList.toggle('active', isMatch);
            if (isMatch) {
                btn.style.background = 'rgba(0,173,232,0.15)';
                btn.style.borderColor = 'var(--accent)';
                btn.style.color = 'var(--accent)';
            } else {
                btn.style.background = 'var(--surface)';
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text)';
            }
        });
        window.filterSoATable();
    };

    window.filterSoATable = function() {
        const query = (document.getElementById('soa-search')?.value || '').toLowerCase().trim();
        const filter = window.currentSoAFilter || 'all';
        
        const sections = document.querySelectorAll('.soa-section');
        sections.forEach(section => {
            const rows = section.querySelectorAll('tbody tr');
            let visibleRowsCount = 0;
            
            rows.forEach(row => {
                const standard = (row.getAttribute('data-standard') || '').toLowerCase();
                const title = (row.getAttribute('data-title') || '').toLowerCase();
                const status = row.getAttribute('data-status') || '';
                
                const matchesSearch = !query || standard.includes(query) || title.includes(query);
                
                let matchesFilter = true;
                if (filter === 'applicable') {
                    matchesFilter = status !== 'Not Applicable';
                } else if (filter === 'not_applicable') {
                    matchesFilter = status === 'Not Applicable';
                } else if (filter === 'gaps') {
                    matchesFilter = status === 'Missing';
                } else if (filter === 'approved') {
                    matchesFilter = status === 'Approved' || status === 'Implemented';
                }
                
                if (matchesSearch && matchesFilter) {
                    row.style.display = '';
                    visibleRowsCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            if (visibleRowsCount > 0) {
                section.style.display = '';
            } else {
                section.style.display = 'none';
            }
        });
    };

    window.showControlRisks = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { risks: [] };
        const risks = trace.risks || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Riscos Vinculados — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (risks.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhum risco vinculado a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Ativo</th>
                                <th>Ameaça</th>
                                <th style="width:100px">Nível</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            risks.forEach(r => {
                const lvl = (r.risk_level || 'Low').toLowerCase();
                let lvlColor = 'var(--success)';
                let lvlBg = 'rgba(34,197,94,0.1)';
                if (lvl === 'medium') { lvlColor = 'var(--warning)'; lvlBg = 'rgba(245,158,11,0.1)'; }
                else if (lvl === 'high' || lvl === 'critical') { lvlColor = 'var(--danger)'; lvlBg = 'rgba(239,68,68,0.1)'; }
                
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(r.asset)}</td>
                        <td style="color:var(--text-dim)">${escapeHTML(r.threat)}</td>
                        <td>
                            <span class="badge" style="background:${lvlBg};color:${lvlColor};border:1px solid ${lvlColor}33;text-transform:capitalize">
                                ${escapeHTML(r.risk_level || 'Low')}
                            </span>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.showControlEvidence = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { evidence: [] };
        const evidence = trace.evidence || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Evidências Vinculadas — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" onclick="forceCloseModal()">✕</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (evidence.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhuma evidência vinculada a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Arquivo</th>
                                <th style="width:140px">Enviado em</th>
                                <th style="width:160px;text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            evidence.forEach(e => {
                const dateStr = new Date(e.created_at).toLocaleDateString();
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(e.file_name)}</td>
                        <td style="color:var(--text-dim)">${dateStr}</td>
                        <td style="text-align:right">
                            <button class="btn btn-ghost" onclick="window.viewEvidenceDetails('${e.id}')" style="padding:4px 8px;font-size:0.75rem;margin-right:6px">Ver</button>
                            <button class="btn btn-primary" onclick="window.downloadEvidenceFile('${e.id}')" style="padding:4px 8px;font-size:0.75rem">Download</button>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.viewEvidenceDetails = function(evidenceId) {
        viewEvidence(evidenceId);
    };

    window.downloadEvidenceFile = async function(evidenceId) {
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/evidence/${evidenceId}/download`, { headers });
            if (!r.ok) throw new Error('Falha ao baixar o arquivo');
            
            let fileName = 'evidencia';
            const disposition = r.headers.get('Content-Disposition');
            if (disposition && disposition.includes('filename=')) {
                const match = disposition.match(/filename="?([^"]+)"?/);
                if (match && match[1]) fileName = match[1];
            }
            
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) {
            showToast('Erro ao baixar evidência: ' + e.message, 'error');
        }
    };

    window.toggleSoAApplicability = async function(ctrlId, value) {
        try {
            const status = value === 'Not Applicable' ? 'Not Applicable' : 'Missing';
            await api('PUT', `/api/v1/controls/${ctrlId}`, { status });
            showToast('Aplicabilidade atualizada');
            render();
        } catch(e) {
            showToast('Erro ao atualizar aplicabilidade', 'error');
        }
    };

    window.saveSoAJustification = async function(ctrlId, value) {
        try {
            await api('PUT', `/api/v1/controls/${ctrlId}`, { description: value });
            showToast('Justificativa salva');
        } catch(e) {
            showToast('Erro ao salvar justificativa', 'error');
        }
    };

    // ——— SPRINT A: CONTEXT & STAKEHOLDERS ————————————————————————————————
    async function renderContext(c, h, a) {
        h.textContent = 'Análise de Contexto (Cláusula 4.1 / 4.2)';
        a.innerHTML = '';
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando análise de contexto...</div>';
        try {
            const ctx = await api('GET', `/api/v1/projects/${S.activeProject.id}/context`) || {};
            
            c.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
                    <div class="stat-card" style="grid-column:span 2;background:rgba(229,235,255,0.03);border:1px solid var(--border)">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:12px;color:var(--accent)">1. Análise SWOT de Segurança da Informação (Cláusula 4.1)</div>
                        <p style="color:var(--muted);font-size:0.85rem;margin-bottom:16px">Determine as questões internas e externas que afetam a capacidade do SGSI de alcançar seus resultados pretendidos.</p>
                        
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                            <div>
                                <label style="display:block;margin-bottom:6px;font-size:0.85rem;font-weight:600">Forças Internas (Strengths)</label>
                                <textarea id="ctx-strengths" style="width:100%;height:100px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: Equipe de TI qualificada, liderança engajada...">${escapeHTML(ctx.internal_strengths || '')}</textarea>
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:6px;font-size:0.85rem;font-weight:600">Fraquezas Internas (Weaknesses)</label>
                                <textarea id="ctx-weaknesses" style="width:100%;height:100px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: Falta de conscientização de usuários, sistemas legados...">${escapeHTML(ctx.internal_weaknesses || '')}</textarea>
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:6px;font-size:0.85rem;font-weight:600">Oportunidades Externas (Opportunities)</label>
                                <textarea id="ctx-opportunities" style="width:100%;height:100px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: Migração para nuvem com recursos nativos de segurança...">${escapeHTML(ctx.external_opportunities || '')}</textarea>
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:6px;font-size:0.85rem;font-weight:600">Ameaças Externas (Threats)</label>
                                <textarea id="ctx-threats" style="width:100%;height:100px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: Aumento de ataques ransomware no setor, concorrentes...">${escapeHTML(ctx.external_threats || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stat-card" style="background:rgba(229,235,255,0.03);border:1px solid var(--border)">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:12px;color:var(--accent)">2. Requisitos Legais / Regulatórios</div>
                        <textarea id="ctx-legal" style="width:100%;height:120px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: LGPD (Lei 13.709), Resoluções do Banco Central, etc.">${escapeHTML(ctx.legal_requirements || '')}</textarea>
                    </div>
                    
                    <div class="stat-card" style="background:rgba(229,235,255,0.03);border:1px solid var(--border)">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:12px;color:var(--accent)">3. Requisitos Contratuais</div>
                        <textarea id="ctx-contractual" style="width:100%;height:120px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Ex: SLAs de segurança exigidos por clientes, termos de auditoria de terceiros...">${escapeHTML(ctx.contractual_requirements || '')}</textarea>
                    </div>
                    
                    <div class="stat-card" style="grid-column:span 2;background:rgba(229,235,255,0.03);border:1px solid var(--border)">
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:12px;color:var(--text)">Notas Gerais</div>
                        <textarea id="ctx-notes" style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="Observações adicionais...">${escapeHTML(ctx.notes || '')}</textarea>
                    </div>
                </div>
                
                <div style="text-align:right">
                    <button onclick="window.saveContext()" class="btn-primary" style="padding:10px 24px">Salvar Contexto</button>
                </div>
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar contexto: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.saveContext = async function() {
        try {
            const body = {
                internal_strengths: document.getElementById('ctx-strengths').value,
                internal_weaknesses: document.getElementById('ctx-weaknesses').value,
                external_opportunities: document.getElementById('ctx-opportunities').value,
                external_threats: document.getElementById('ctx-threats').value,
                legal_requirements: document.getElementById('ctx-legal').value,
                contractual_requirements: document.getElementById('ctx-contractual').value,
                notes: document.getElementById('ctx-notes').value
            };
            await api('PUT', `/api/v1/projects/${S.activeProject.id}/context`, body);
            showToast('Análise de contexto salva com sucesso');
        } catch(e) {
            showToast('Erro ao salvar contexto', 'error');
        }
    };

    async function renderStakeholders(c, h, a) {
        h.textContent = 'Partes Interessadas (Cláusula 4.2)';
        a.innerHTML = `<button onclick="window.openStakeholderModal()" class="btn-primary">Novo Stakeholder</button>`;
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando partes interessadas...</div>';
        try {
            const list = await api('GET', `/api/v1/projects/${S.activeProject.id}/stakeholders`) || [];
            S.stakeholders = list;
            
            if (list.length === 0) {
                c.innerHTML = `
                    <div style="padding:3rem;text-align:center;color:var(--muted)">
                        Nenhum stakeholder cadastrado ainda.<br><br>
                        <button onclick="window.openStakeholderModal()" class="btn-primary">Adicionar Primeira Parte Interessada</button>
                    </div>
                `;
                return;
            }
            
            let html = `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Parte Interessada</th>
                                <th>Tipo</th>
                                <th>Categoria</th>
                                <th>Expectativas / Requisitos de SI</th>
                                <th>Influência</th>
                                <th>Método de Comunicação</th>
                                <th style="width:120px;text-align:center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            list.forEach(s => {
                html += `
                    <tr>
                        <td style="font-weight:600">${escapeHTML(s.name)}</td>
                        <td><span class="badge ${s.type === 'internal' ? 'badge-implemented' : 'badge-partial'}">${s.type === 'internal' ? 'Interno' : 'Externo'}</span></td>
                        <td>${escapeHTML(s.category || 'N/A')}</td>
                        <td style="font-size:0.85rem">${escapeHTML(s.requirements || '')}</td>
                        <td><span class="badge badge-${(s.influence || 'Medium').toLowerCase()}">${escapeHTML(s.influence || 'Medium')}</span></td>
                        <td style="font-size:0.85rem">${escapeHTML(s.communication_method || '')}</td>
                        <td style="text-align:center">
                            <button onclick="window.openStakeholderModal('${s.id}')" class="btn-secondary" style="padding:4px 8px;margin-right:4px">Editar</button>
                            <button onclick="window.deleteStakeholder('${s.id}')" class="btn-secondary" style="padding:4px 8px;color:red;border-color:rgba(255,0,0,0.2)">Deletar</button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar stakeholders: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.openStakeholderModal = function(id = null) {
        const s = id ? S.stakeholders.find(x => x.id === id) : null;
        const isEdit = !!s;
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                ${isEdit ? 'Editar Parte Interessada' : 'Nova Parte Interessada'}
            </div>
            <form id="stakeholder-form" onsubmit="window.saveStakeholder(event, ${isEdit ? '\'' + s.id + '\'' : 'null'})">
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Nome / Identificação</label>
                    <input type="text" name="name" value="${s ? escapeHTML(s.name) : ''}" required style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                    <div class="form-group">
                        <label style="display:block;margin-bottom:4px;font-size:0.85rem">Tipo</label>
                        <select name="type" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                            <option value="external" ${s && s.type === 'external' ? 'selected' : ''}>Externo</option>
                            <option value="internal" ${s && s.type === 'internal' ? 'selected' : ''}>Interno</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="display:block;margin-bottom:4px;font-size:0.85rem">Categoria</label>
                        <select name="category" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                            <option value="client" ${s && s.category === 'client' ? 'selected' : ''}>Cliente</option>
                            <option value="regulator" ${s && s.category === 'regulator' ? 'selected' : ''}>Regulador / Auditor</option>
                            <option value="shareholder" ${s && s.category === 'shareholder' ? 'selected' : ''}>Diretoria / Acionista</option>
                            <option value="employee" ${s && s.category === 'employee' ? 'selected' : ''}>Colaborador</option>
                            <option value="supplier" ${s && s.category === 'supplier' ? 'selected' : ''}>Fornecedor / Operador</option>
                            <option value="partner" ${s && s.category === 'partner' ? 'selected' : ''}>Parceiro</option>
                            <option value="consultant" ${s && s.category === 'consultant' ? 'selected' : ''}>Consultor</option>
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                    <div class="form-group">
                        <label style="display:block;margin-bottom:4px;font-size:0.85rem">Nível de Influência</label>
                        <select name="influence" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                            <option value="Low" ${s && s.influence === 'Low' ? 'selected' : ''}>Baixo</option>
                            <option value="Medium" ${s && s.influence === 'Medium' ? 'selected' : ''}>Médio</option>
                            <option value="High" ${s && s.influence === 'High' ? 'selected' : ''}>Alto</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="display:block;margin-bottom:4px;font-size:0.85rem">Método de Comunicação</label>
                        <input type="text" name="communication_method" value="${s ? escapeHTML(s.communication_method || '') : ''}" placeholder="Ex: Email trimestral, Reunião" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Expectativas e Requisitos de SI</label>
                    <textarea name="requirements" style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit">${s ? escapeHTML(s.requirements || '') : ''}</textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Cancelar</button>
                    <button type="submit" class="btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar'}</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveStakeholder = async function(e, id) {
        e.preventDefault();
        const form = document.getElementById('stakeholder-form');
        const formData = new FormData(form);
        const body = {
            name: formData.get('name'),
            type: formData.get('type'),
            category: formData.get('category'),
            influence: formData.get('influence'),
            communication_method: formData.get('communication_method'),
            requirements: formData.get('requirements')
        };
        
        try {
            if (id) {
                await api('PUT', `/api/v1/stakeholders/${id}`, body);
                showToast('Parte interessada atualizada');
            } else {
                await api('POST', `/api/v1/projects/${S.activeProject.id}/stakeholders`, body);
                showToast('Parte interessada cadastrada');
            }
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar stakeholder', 'error');
        }
    };

    window.deleteStakeholder = async function(id) {
        if (!confirm('Deseja realmente deletar este stakeholder?')) return;
        try {
            await api('DELETE', `/api/v1/stakeholders/${id}`);
            showToast('Parte interessada removida');
            render();
        } catch(e) {
            showToast('Erro ao deletar stakeholder', 'error');
        }
    };

    // ——— SPRINT D: AUDIT EXECUTION (Cláusula 9.2) —————————————————————————
    async function renderAuditExecution(c, h, a) {
        h.textContent = 'Executar Auditoria Interna';
        a.innerHTML = `<button onclick="navigate('audits')" class="btn" style="border-color:var(--border)">Voltar ao Calendário</button>`;
        if (!S.activeAuditId) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione uma auditoria no calendário.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando painel de auditoria...</div>';
        try {
            const [controls, findings, audit] = await Promise.all([
                api('GET', `/api/v1/projects/${S.activeProject.id}/controls`),
                api('GET', `/api/v1/audits/${S.activeAuditId}/findings`),
                api('GET', `/api/v1/projects/${S.activeProject.id}/audits`)
            ]);
            
            const currentAudit = (audit || []).find(au => au.id === S.activeAuditId) || {};
            
            let html = `
                <div class="stat-card" style="margin-bottom:2rem;border:1px solid var(--border);background:rgba(229,235,255,0.02)">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.15rem;color:var(--accent);margin-bottom:6px">${escapeHTML(currentAudit.title || 'Auditoria')}</div>
                    <div style="font-size:0.85rem;color:var(--muted)">
                        <strong>Auditor:</strong> ${escapeHTML(currentAudit.auditor_name || 'TBD')} | 
                        <strong>Escopo:</strong> ${escapeHTML(currentAudit.scope || 'Todo o ISMS')} | 
                        <strong>Data:</strong> ${currentAudit.scheduled_date}
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:3fr 2fr;gap:24px">
                    <div>
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:1rem">Controles Aplicáveis no Escopo</div>
                        <div class="data-table" style="max-height:600px;overflow-y:auto">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Controle</th>
                                        <th>Status Atual</th>
                                        <th style="width:180px;text-align:center">Auditar</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
            
            (controls || []).filter(ctrl => ctrl.status !== 'Not Applicable').forEach(ctrl => {
                const ctrlFindings = findings.filter(f => f.control_id === ctrl.id);
                html += `
                    <tr>
                        <td style="font-weight:600;color:var(--accent)">${escapeHTML(ctrl.standard)}</td>
                        <td style="font-size:0.85rem;font-weight:500">${escapeHTML(ctrl.title)}</td>
                        <td>
                            <span class="badge badge-${(ctrl.status || 'missing').toLowerCase().replace(/\s/g,'-')}">
                                ${escapeHTML(ctrl.status || 'Missing')}
                            </span>
                        </td>
                        <td style="text-align:center">
                            <button onclick="window.openAddFindingModal('${ctrl.id}', '${escapeHTML(ctrl.standard)}')" class="btn" style="padding:4px 10px;font-size:0.75rem;border-color:var(--accent);color:var(--accent)">
                                ${ctrlFindings.length > 0 ? 'Registrar Achado (' + ctrlFindings.length + ')' : '+ Novo Achado'}
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:1rem">Achados Registrados (${findings.length})</div>
            `;
            
            if (findings.length === 0) {
                html += '<div style="padding:2rem;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:10px">Nenhum achado ou NC registrado nesta auditoria.</div>';
            } else {
                html += `<div style="display:flex;flex-direction:column;gap:12px;max-height:600px;overflow-y:auto">`;
                findings.forEach(f => {
                    const badgeClass = f.finding_type === 'major_nc' ? 'badge-critical' : f.finding_type === 'minor_nc' ? 'badge-warning' : f.finding_type === 'observation' ? 'badge-info' : 'badge-default';
                    const badgeLabel = f.finding_type === 'major_nc' ? 'NC Maior' : f.finding_type === 'minor_nc' ? 'NC Menor' : f.finding_type === 'observation' ? 'Observação' : 'Oportunidade';
                    html += `
                        <div class="stat-card" style="border:1px solid var(--border);padding:12px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span class="badge ${badgeClass}">${badgeLabel}</span>
                                <span style="font-weight:600;color:var(--accent)">${escapeHTML(f.control_id || 'Geral')}</span>
                            </div>
                            <div style="font-size:0.85rem;margin-bottom:8px">${escapeHTML(f.description)}</div>
                            ${f.auditor_notes ? `<div style="font-size:0.75rem;color:var(--muted);background:rgba(255,255,255,0.02);padding:6px 10px;border-radius:6px;margin-bottom:8px"><strong>Notas:</strong> ${escapeHTML(f.auditor_notes)}</div>` : ''}
                            <div style="display:flex;justify-content:space-between;align-items:center">
                                <span style="font-size:0.7rem;color:var(--muted)">Registrado em: ${f.created_at.split('T')[0]}</span>
                                <button onclick="window.deleteFinding('${f.id}')" class="btn" style="padding:2px 6px;font-size:0.7rem;color:red;border-color:rgba(255,0,0,0.15)">Deletar</button>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
            
            html += `
                    </div>
                </div>
            `;
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar execução da auditoria: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.openAddFindingModal = function(controlId, controlStandard) {
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Registrar Achado — Controle ${controlStandard}
            </div>
            <form id="finding-form" onsubmit="window.submitFinding(event, '${controlId}')">
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Tipo de Achado</label>
                    <select name="finding_type" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                        <option value="observation">Observação</option>
                        <option value="minor_nc">Não Conformidade Menor (NC Menor)</option>
                        <option value="major_nc">Não Conformidade Maior (NC Maior)</option>
                        <option value="opportunity">Oportunidade de Melhoria</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Evidência Analisada (Opcional)</label>
                    <input type="text" name="evidence_reviewed" placeholder="Ex: Política de Acesso ver. 1.2, logs de MFA" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Descrição da Constatação / Achado</label>
                    <textarea name="description" required style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Descreva de forma clara e objetiva o achado da auditoria..."></textarea>
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Notas de Auditoria</label>
                    <textarea name="auditor_notes" style="width:100%;height:60px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Ex: Recomendações iniciais, referências normativas..."></textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Cancelar</button>
                    <button type="submit" class="btn-primary">Registrar Achado</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.submitFinding = async function(e, controlId) {
        e.preventDefault();
        const form = document.getElementById('finding-form');
        const formData = new FormData(form);
        const body = {
            project_id: S.activeProject.id,
            control_id: controlId,
            finding_type: formData.get('finding_type'),
            description: formData.get('description'),
            evidence_reviewed: formData.get('evidence_reviewed'),
            auditor_notes: formData.get('auditor_notes')
        };
        
        try {
            await api('POST', `/api/v1/audits/${S.activeAuditId}/findings`, body);
            showToast('Achado de auditoria registrado');
            if (body.finding_type === 'minor_nc' || body.finding_type === 'major_nc') {
                showToast('Ação corretiva (CAPA) aberta automaticamente para a NC', 'warning');
            }
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar achado de auditoria', 'error');
        }
    };

    window.deleteFinding = async function(id) {
        if (!confirm('Deseja realmente deletar este achado?')) return;
        try {
            await api('DELETE', `/api/v1/audit-findings/${id}`);
            showToast('Achado removido');
            render();
        } catch(e) {
            showToast('Erro ao deletar achado', 'error');
        }
    };

    // ——— SPRINT D: MANAGEMENT REVIEW (Cláusula 9.3) ——————————————————————
    async function renderManagementReview(c, h, a) {
        h.textContent = 'Análise Crítica pela Direção (Cláusula 9.3)';
        const isOrgUser = S.user && S.user.role === 'org_user';
        a.innerHTML = isOrgUser ? '' : `<button onclick="window.openNewMgmtReviewModal()" class="btn-primary">Nova Análise Crítica</button>`;
        if (!S.activeProject) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando reuniões de análise crítica...</div>';
        try {
            const list = await api('GET', `/api/v1/projects/${S.activeProject.id}/management-reviews`) || [];
            S.managementReviews = list;
            
            if (list.length === 0) {
                c.innerHTML = `
                    <div style="padding:3rem;text-align:center;color:var(--muted)">
                        Nenhuma reunião de análise crítica cadastrada ainda.<br><br>
                        ${isOrgUser ? '' : '<button onclick="window.openNewMgmtReviewModal()" class="btn-primary">Registrar Primeira Reunião</button>'}
                    </div>
                `;
                return;
            }
            
            let html = `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Data da Análise</th>
                                <th>Participantes</th>
                                <th>Status</th>
                                <th style="width:150px;text-align:center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            list.forEach(m => {
                html += `
                    <tr>
                        <td style="font-weight:600;color:var(--accent)">${m.review_date}</td>
                        <td style="font-size:0.85rem">${escapeHTML(m.attendees || 'Não definidos')}</td>
                        <td><span class="badge ${m.status === 'Completed' ? 'badge-implemented' : 'badge-pending'}">${m.status === 'Completed' ? 'Concluída' : 'Planejada'}</span></td>
                        <td style="text-align:center">
                            <button onclick="window.openEditMgmtReviewModal('${m.id}')" class="btn-secondary" style="padding:4px 10px">Abrir Pauta / Editar</button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar análises críticas: ${escapeHTML(e.message)}</div>`;
        }
    }

    window.openNewMgmtReviewModal = function() {
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Nova Reunião de Análise Crítica (Cláusula 9.3)
            </div>
            <form id="new-mgmt-form" onsubmit="window.saveNewMgmtReview(event)">
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Data da Análise</label>
                    <input type="date" name="review_date" required style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Participantes (C-Level / Sponsor)</label>
                    <textarea name="attendees" required style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Ex: CEO, CISO, DPO, Diretor Jurídico..."></textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Cancelar</button>
                    <button type="submit" class="btn-primary">Criar Reunião</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveNewMgmtReview = async function(e) {
        e.preventDefault();
        const form = document.getElementById('new-mgmt-form');
        const formData = new FormData(form);
        const body = {
            review_date: formData.get('review_date'),
            attendees: formData.get('attendees')
        };
        try {
            await api('POST', `/api/v1/projects/${S.activeProject.id}/management-reviews`, body);
            showToast('Reunião registrada');
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao criar reunião', 'error');
        }
    };

    window.openEditMgmtReviewModal = function(id) {
        const review = S.managementReviews.find(x => x.id === id) || {};
        
        let agenda = { items: [] };
        try {
            agenda = JSON.parse(review.agenda_json || '{"items":[]}');
        } catch (e) {
            console.error("Erro ao analisar agenda_json", e);
        }
        
        let agendaHtml = `<div style="max-height:250px;overflow-y:auto;background:rgba(255,255,255,0.01);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px">`;
        (agenda.items || []).forEach(item => {
            let topicName = '';
            let dataStr = '';
            
            if (typeof item === 'string') {
                topicName = item;
            } else if (item && typeof item === 'object') {
                topicName = item.topic || item.title || item.name || '';
                if (item.data !== undefined) {
                    if (typeof item.data === 'string') {
                        dataStr = item.data;
                    } else if (Array.isArray(item.data)) {
                        dataStr = item.data.map(d => `${d.status || 'N/A'}: ${d.cnt}`).join(', ');
                    } else {
                        dataStr = JSON.stringify(item.data);
                    }
                }
            }
            
            agendaHtml += `
                <div style="margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px">
                    <div style="font-weight:600;color:var(--accent);font-size:0.85rem">${escapeHTML(topicName)}</div>
                    ${dataStr ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px"><strong>Dados consolidados:</strong> ${escapeHTML(dataStr)}</div>` : ''}
                </div>
            `;
        });
        agendaHtml += `</div>`;

        const isOrgUser = S.user && S.user.role === 'org_user';
        const decisionsText = review.decisions || 'Nenhuma decisão registrada ainda.';
        const actionItemsText = review.action_items || 'Nenhuma ação corretiva ou oportunidade definida ainda.';

        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Ata da Análise Crítica (${review.review_date})
            </div>
            
            <div style="margin-bottom:16px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--text)">Participantes</div>
                <div style="font-size:0.85rem;color:var(--text-dim);line-height:1.4">${escapeHTML(review.attendees || 'Não definidos')}</div>
            </div>

            <div style="margin-bottom:16px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--text)">Pauta da Reunião (Cláusula 9.3.2)</div>
                ${agendaHtml}
            </div>

            <div style="margin-bottom:16px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--accent)">Decisões Tomadas (Diretrizes, recursos...)</div>
                <div style="font-size:0.9rem;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHTML(decisionsText)}</div>
            </div>

            <div style="margin-bottom:20px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:var(--accent)">Ações Corretivas / Oportunidades Definidas</div>
                <div style="font-size:0.9rem;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHTML(actionItemsText)}</div>
            </div>

            <div style="margin-bottom:20px; display:flex; align-items:center; gap:8px;">
                <span style="font-weight:600;font-size:0.9rem">Status:</span>
                <span class="badge ${review.status === 'Completed' ? 'badge-implemented' : 'badge-pending'}">${review.status === 'Completed' ? 'Concluída' : 'Planejada'}</span>
            </div>

            <div style="text-align:right">
                <button onclick="closeModal()" class="btn-secondary" style="margin-right:8px">Fechar</button>
                ${!isOrgUser ? `<button onclick="window.openEditMgmtReviewForm('${review.id}')" class="btn-primary">Editar Ata</button>` : ''}
            </div>
        `;
        openModal(html);
    };

    window.openEditMgmtReviewForm = function(id) {
        const review = S.managementReviews.find(x => x.id === id) || {};
        
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Editar Ata da Análise Crítica (${review.review_date})
            </div>
            <form id="edit-mgmt-form" onsubmit="window.saveMgmtReviewDetails(event, '${review.id}')">
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Participantes</label>
                    <textarea name="attendees" required style="width:100%;height:60px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.85rem">${escapeHTML(review.attendees || '')}</textarea>
                </div>
                
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Decisões Tomadas (Diretrizes, recursos...)</label>
                    <textarea name="decisions" style="width:100%;height:150px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.9rem">${escapeHTML(review.decisions || '')}</textarea>
                </div>
                <div class="form-group" style="margin-bottom:16px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Ações Corretivas / Oportunidades Definidas</label>
                    <textarea name="action_items" style="width:100%;height:150px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit;font-size:0.9rem">${escapeHTML(review.action_items || '')}</textarea>
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600">Status da Reunião</label>
                    <select name="status" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                        <option value="Planned" ${review.status === 'Planned' ? 'selected' : ''}>Planejada</option>
                        <option value="Completed" ${review.status === 'Completed' ? 'selected' : ''}>Concluída</option>
                    </select>
                </div>
                <div style="text-align:right">
                    <button type="button" onclick="window.openEditMgmtReviewModal('${review.id}')" class="btn-secondary" style="margin-right:8px">Voltar</button>
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.saveMgmtReviewDetails = async function(e, id) {
        e.preventDefault();
        const form = document.getElementById('edit-mgmt-form');
        const formData = new FormData(form);
        const body = {
            attendees: formData.get('attendees'),
            decisions: formData.get('decisions'),
            action_items: formData.get('action_items'),
            status: formData.get('status')
        };
        try {
            await api('PUT', `/api/v1/management-reviews/${id}`, body);
            showToast('Dados da análise crítica salvos');
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar detalhes', 'error');
        }
    };

    // ——— SPRINT E: AUDITOR NOTES CONSOLE (Consultor) —————————————————————
    window.openAuditorNotesModal = async function(projectId) {
        openModal(`
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Notas e Solicitações do Auditor Externo
            </div>
            <div id="auditor-notes-modal-content" style="max-height:400px;overflow-y:auto;margin-bottom:1.5rem">
                Carregando notas...
            </div>
            <div style="text-align:right">
                <button type="button" onclick="closeModal()" class="btn-secondary">Fechar</button>
            </div>
        `);
        
        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/auditor-notes`);
            const notes = res.notes || [];
            
            const container = document.getElementById('auditor-notes-modal-content');
            if (notes.length === 0) {
                container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Nenhuma nota ou solicitação do auditor registrada para este projeto.</div>';
                return;
            }
            
            let html = '<div style="display:flex;flex-direction:column;gap:12px">';
            notes.forEach(n => {
                const typeLabel = n.note_type === 'question' ? 'Pergunta' : n.note_type === 'evidence_request' ? 'Pedido de Evidência' : 'Observação';
                const badgeColor = n.note_type === 'evidence_request' ? 'badge-warning' : n.note_type === 'observation' ? 'badge-critical' : 'badge-info';
                
                html += `
                    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                            <span class="badge ${badgeColor}">${typeLabel}</span>
                            <span style="font-weight:600;color:var(--accent)">${escapeHTML(n.control_standard || 'Geral')}</span>
                        </div>
                        <div style="font-size:0.9rem;margin-bottom:8px;color:var(--text)">${escapeHTML(n.content)}</div>
                        
                        ${n.response ? `
                            <div style="background:rgba(52,199,89,0.05);border:1px solid rgba(52,199,89,0.15);border-radius:8px;padding:8px;font-size:0.85rem;color:#34c759;margin-top:8px">
                                <strong>Sua Resposta:</strong> ${escapeHTML(n.response)}
                            </div>
                        ` : `
                            <div style="margin-top:8px;display:flex;gap:8px">
                                <input type="text" id="respond-input-${n.id}" placeholder="Escreva a resposta para o auditor..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:0.85rem" />
                                <button onclick="window.submitAuditorResponse('${n.id}', '${projectId}')" class="btn-primary" style="padding:6px 12px;font-size:0.85rem;border-radius:8px;border:none;background:var(--accent);color:#070b14;font-weight:700">Responder</button>
                            </div>
                        `}
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch(e) {
            document.getElementById('auditor-notes-modal-content').innerHTML = '<div style="color:red">Erro ao carregar notas do auditor.</div>';
        }
    };

    window.submitAuditorResponse = async function(noteId, projectId) {
        const input = document.getElementById(`respond-input-${noteId}`);
        const response = input.value.trim();
        if (!response) return;
        
        try {
            await api('PUT', `/api/v1/auditor-notes/${noteId}/respond`, { response });
            showToast('Resposta enviada com sucesso');
            window.openAuditorNotesModal(projectId);
        } catch(e) {
            showToast('Erro ao enviar resposta', 'error');
        }
    };

    // ——— ASSETS MODULE (A.5.9) ——————————————————————————
    async function renderAssets(c, h, a) {
        h.textContent = 'Ativos de Informação';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = `<button class="btn" onclick="exportCSV('assets')" style="margin-right:8px">Exportar CSV</button>` + (canCrud ? `<button class="btn btn-primary" onclick="window.openNewAssetModal('${proj.id}')">+ Novo Ativo</button>` : '');
        
        let assets = [];
        try { assets = await api('GET', `/api/v1/projects/${proj.id}/assets`); } catch(e) {}
        if (!Array.isArray(assets)) assets = [];
        S.assets = assets;
 
        const classColor = cl => cl === 'Confidential' ? 'var(--danger)' : cl === 'Restricted' ? 'var(--warning)' : cl === 'Internal' ? 'var(--info)' : 'var(--accent)';
        c.innerHTML = `<div class="fade-in">${assets.length ? assets.map(ast => `
            <div class="list-item" style="cursor:pointer" onclick="window.openAssetDetailsModal('${ast.id}')">
                <div style="flex:1">
                    <div class="item-name">${escapeHTML(ast.name)}</div>
                    <div class="item-meta" style="margin-top:0.25rem">Categoria: ${ast.category || 'Geral'} | Local: ${escapeHTML(ast.location || 'N/A')} | Dono: ${escapeHTML(ast.owner || 'N/A')}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="ctx-tag" style="background:${classColor(ast.classification)}20;color:${classColor(ast.classification)}">${ast.classification}</span>
                    <span class="ctx-tag" style="background:rgba(255,255,255,0.05);color:var(--text-dim)">${ast.status || 'Active'}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhum ativo</h3><p>Registre ativos para governança de segurança.</p></div>'}</div>`;
    }

    window.openAssetDetailsModal = function(id) {
        const ast = S.assets.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const classColor = cl => cl === 'Confidential' ? 'var(--danger)' : cl === 'Restricted' ? 'var(--warning)' : cl === 'Internal' ? 'var(--info)' : 'var(--accent)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Ativo de Informação</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.4rem; color:var(--accent)">
                    ${escapeHTML(ast.name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.category || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Classificação de Segurança</div>
                        <span class="ctx-tag" style="background:${classColor(ast.classification)}20; color:${classColor(ast.classification)}; font-weight:600">${ast.classification || 'Internal'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Dono (Owner)</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.owner || 'Não definido')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Localização / Ambiente</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ast.location || 'Não especificado')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status do Ativo</div>
                        <span class="ctx-tag" style="background:rgba(255,255,255,0.05); color:var(--text-dim); font-weight:600">${ast.status || 'Active'}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditAssetModal('${id}')">Editar Ativo</button>` : ''}
            </div>
        `);
    };

    window.openNewAssetModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Ativo</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Ativo</label><input class="form-input" id="ast-name" placeholder="Ex: Banco de dados RDS Prod, Código-Fonte GitHub"></div>
            <div class="form-group">
                <label class="form-label">Categoria</label>
                <select class="form-input" id="ast-category">
                    <option value="Informacao">Informacao (Dados, Documentos, Segredos)</option>
                    <option value="Software">Software (APIs, Sistemas, Apps, Scripts)</option>
                    <option value="Hardware">Hardware (Servidores, Computadores, Dispositivos)</option>
                    <option value="Pessoas">Pessoas (Colaboradores, Terceiros, Donos)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Classificacao</label>
                <select class="form-input" id="ast-classification">
                    <option value="Confidential">Confidential (Apenas Alta Lideranca)</option>
                    <option value="Restricted">Restricted (Uso Interno Protegido)</option>
                    <option value="Internal" selected>Internal (Uso Interno Geral)</option>
                    <option value="Public">Public (Livre Acesso)</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Dono (Owner)</label><input class="form-input" id="ast-owner" placeholder="Ex: IT Manager"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Localizacao</label><input class="form-input" id="ast-location" placeholder="Ex: AWS us-east-1"></div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="window.createAsset('${projectId}')">Registrar Ativo</button>
        `);
    };

    window.createAsset = async function(projectId) {
        const body = { name: document.getElementById('ast-name').value, category: document.getElementById('ast-category').value, classification: document.getElementById('ast-classification').value, owner: document.getElementById('ast-owner').value, location: document.getElementById('ast-location').value };
        if (!body.name) return;
        await api('POST', `/api/v1/projects/${projectId}/assets`, body);
        forceCloseModal(); render();
    };

    window.openEditAssetModal = function(id) {
        const ast = S.assets.find(x => x.id === id) || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Ativo</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Ativo</label><input class="form-input" id="ast-e-name" value="${escapeHTML(ast.name||'')}"></div>
            <div class="form-group">
                <label class="form-label">Categoria</label>
                <select class="form-input" id="ast-e-category">
                    <option value="Informacao" ${ast.category==='Informacao'?'selected':''}>Informacao (Dados, Documentos)</option>
                    <option value="Software" ${ast.category==='Software'?'selected':''}>Software (APIs, Sistemas)</option>
                    <option value="Hardware" ${ast.category==='Hardware'?'selected':''}>Hardware (Servidores, Computadores)</option>
                    <option value="Pessoas" ${ast.category==='Pessoas'?'selected':''}>Pessoas (Colaboradores)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Classificacao</label>
                <select class="form-input" id="ast-e-classification">
                    <option value="Confidential" ${ast.classification==='Confidential'?'selected':''}>Confidential</option>
                    <option value="Restricted" ${ast.classification==='Restricted'?'selected':''}>Restricted</option>
                    <option value="Internal" ${ast.classification==='Internal'?'selected':''}>Internal</option>
                    <option value="Public" ${ast.classification==='Public'?'selected':''}>Public</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Dono</label><input class="form-input" id="ast-e-owner" value="${escapeHTML(ast.owner||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Localizacao</label><input class="form-input" id="ast-e-location" value="${escapeHTML(ast.location||'')}"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-input" id="ast-e-status">
                    <option value="Active" ${ast.status==='Active'?'selected':''}>Active</option>
                    <option value="Inactive" ${ast.status==='Inactive'?'selected':''}>Inactive</option>
                </select>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteAsset('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateAsset('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateAsset = async function(id) {
        const body = { name: document.getElementById('ast-e-name').value, category: document.getElementById('ast-e-category').value, classification: document.getElementById('ast-e-classification').value, owner: document.getElementById('ast-e-owner').value, location: document.getElementById('ast-e-location').value, status: document.getElementById('ast-e-status').value };
        await api('PUT', `/api/v1/assets/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteAsset = async function(id) {
        if (confirm('Deseja excluir este ativo?')) { await api('DELETE', `/api/v1/assets/${id}`); forceCloseModal(); render(); }
    };

    async function renderMetrics(c, h, a) {
        h.textContent = 'Métricas & KPIs do SGSI';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        a.innerHTML = `<button class="btn btn-primary" onclick="openNewMetricModal('${proj.id}')">+ Nova Métrica</button>`;
        
        let metrics = [];
        try { metrics = await api('GET', `/api/v1/projects/${proj.id}/metrics`); } catch(e) {}
        if (!Array.isArray(metrics)) metrics = [];

        const statusColor = st => st === 'Critical' ? 'var(--danger)' : st === 'At Risk' ? 'var(--warning)' : 'var(--success)';
        
        c.innerHTML = `<div class="fade-in">
            ${metrics.length ? `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:1.5rem">
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--success)">${metrics.filter(m => m.status === 'On Track').length}</div>
                        <small style="color:var(--text-dim)">Métricas Em Dia</small>
                    </div>
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--warning)">${metrics.filter(m => m.status === 'At Risk').length}</div>
                        <small style="color:var(--text-dim)">Em Risco</small>
                    </div>
                    <div class="stat-card">
                        <div style="font-size:1.8rem; font-weight:700; color:var(--danger)">${metrics.filter(m => m.status === 'Critical').length}</div>
                        <small style="color:var(--text-dim)">Críticas</small>
                    </div>
                </div>
                
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome do Indicador</th>
                                <th>Meta</th>
                                <th>Atual</th>
                                <th>Frequência</th>
                                <th>Última Medição</th>
                                <th>Responsável</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${metrics.map(m => `
                                <tr style="cursor:pointer" onclick='openEditMetricModal("${m.id}", "${proj.id}", ${JSON.stringify(m).replace(/'/g, "\\x27")})'>
                                    <td><strong>${escapeHTML(m.metric_name)}</strong></td>
                                    <td>${m.target_value !== null ? m.target_value : '—'}</td>
                                    <td>${m.current_value !== null ? m.current_value : '—'}</td>
                                    <td><span class="badge" style="background:rgba(255,255,255,0.05)">${m.frequency}</span></td>
                                    <td>${m.last_measured_at || '—'}</td>
                                    <td>${escapeHTML(m.owner || '—')}</td>
                                    <td><span class="badge" style="background:${statusColor(m.status)}20; color:${statusColor(m.status)}">${m.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><h3>Nenhuma métrica registrada</h3><p>Defina KPIs de segurança para avaliar o desempenho do SGSI (Cláusula 9.1).</p></div>'}
        </div>`;
    }

    function openNewMetricModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Métrica de Desempenho</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group"><label class="form-label">Nome do Indicador</label><input class="form-input" id="met-name" placeholder="Ex: Taxa de Sucesso dos Backups (%), Patches Críticos (%)"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Meta (Alvo)</label><input type="number" step="any" class="form-input" id="met-target" placeholder="99.9"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Valor Atual</label><input type="number" step="any" class="form-input" id="met-current" placeholder="98.5"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">Frequência</label>
                    <select class="form-input" id="met-frequency">
                        <option value="Weekly">Semanal</option>
                        <option value="Monthly" selected>Mensal</option>
                        <option value="Quarterly">Trimestral</option>
                        <option value="Annual">Anual</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1"><label class="form-label">Última Medição</label><input type="date" class="form-input" id="met-date"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Responsável (Owner)</label><input class="form-input" id="met-owner" placeholder="Ex: CTO"></div>
                <div class="form-group" style="flex:1">
                    <label class="form-label">Status</label>
                    <select class="form-input" id="met-status">
                        <option value="On Track" selected>On Track (Sob Controle)</option>
                        <option value="At Risk">At Risk (Em Risco)</option>
                        <option value="Critical">Critical (Crítico)</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="createMetric('${projectId}')">Registrar Indicador</button>
        `);
        document.getElementById('met-date').value = new Date().toISOString().split('T')[0];
    }

    async function createMetric(projectId) {
        const target = parseFloat(document.getElementById('met-target').value);
        const current = parseFloat(document.getElementById('met-current').value);
        const body = {
            metric_name: document.getElementById('met-name').value,
            target_value: isNaN(target) ? null : target,
            current_value: isNaN(current) ? null : current,
            frequency: document.getElementById('met-frequency').value,
            last_measured_at: document.getElementById('met-date').value,
            owner: document.getElementById('met-owner').value,
            status: document.getElementById('met-status').value
        };
        if (!body.metric_name) return;
        await api('POST', `/api/v1/projects/${projectId}/metrics`, body);
        forceCloseModal(); render();
    }

    function openEditMetricModal(id, projectId, data) {
        const m = data || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Métrica</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group"><label class="form-label">Nome do Indicador</label><input class="form-input" id="met-e-name" value="${escapeHTML(m.metric_name||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Meta</label><input type="number" step="any" class="form-input" id="met-e-target" value="${m.target_value !== null ? m.target_value : ''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Valor Atual</label><input type="number" step="any" class="form-input" id="met-e-current" value="${m.current_value !== null ? m.current_value : ''}"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">Frequência</label>
                    <select class="form-input" id="met-e-frequency">
                        <option value="Weekly" ${m.frequency==='Weekly'?'selected':''}>Semanal</option>
                        <option value="Monthly" ${m.frequency==='Monthly'?'selected':''}>Mensal</option>
                        <option value="Quarterly" ${m.frequency==='Quarterly'?'selected':''}>Trimestral</option>
                        <option value="Annual" ${m.frequency==='Annual'?'selected':''}>Anual</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1"><label class="form-label">Última Medição</label><input type="date" class="form-input" id="met-e-date" value="${m.last_measured_at || ''}"></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Responsável</label><input class="form-input" id="met-e-owner" value="${escapeHTML(m.owner||'')}"></div>
                <div class="form-group" style="flex:1">
                    <label class="form-label">Status</label>
                    <select class="form-input" id="met-e-status">
                        <option value="On Track" ${m.status==='On Track'?'selected':''}>On Track</option>
                        <option value="At Risk" ${m.status==='At Risk'?'selected':''}>At Risk</option>
                        <option value="Critical" ${m.status==='Critical'?'selected':''}>Critical</option>
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="if(confirm('Deseja excluir esta métrica?')){api('DELETE','/api/v1/metrics/${id}').then(()=>{forceCloseModal();render()})}">Excluir</button>
                <button class="btn btn-primary" onclick="updateMetric('${id}')">Salvar</button>
            </div>
        `);
    }

    async function updateMetric(id) {
        const target = parseFloat(document.getElementById('met-e-target').value);
        const current = parseFloat(document.getElementById('met-e-current').value);
        const body = {
            metric_name: document.getElementById('met-e-name').value,
            target_value: isNaN(target) ? null : target,
            current_value: isNaN(current) ? null : current,
            frequency: document.getElementById('met-e-frequency').value,
            last_measured_at: document.getElementById('met-e-date').value,
            owner: document.getElementById('met-e-owner').value,
            status: document.getElementById('met-e-status').value
        };
        await api('PUT', `/api/v1/metrics/${id}`, body);
        forceCloseModal(); render();
    }

    async function renderAuditTrail(c, h, a) {
        h.textContent = 'Trilha de Auditoria (Audit Trail)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p></div>'; return; }
        a.innerHTML = '';

        let logs = [];
        try { logs = await api('GET', `/api/v1/projects/${proj.id}/audit-trail`); } catch(e) {}
        if (!Array.isArray(logs)) logs = [];

        c.innerHTML = `<div class="fade-in">
            ${logs.length ? `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Usuário</th>
                                <th>Ação</th>
                                <th>Detalhes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.map(l => `
                                <tr>
                                    <td style="white-space:nowrap; color:var(--text-dim); font-size:0.75rem">${new Date(l.created_at || l.timestamp).toLocaleString()}</td>
                                    <td><strong>${escapeHTML(l.actor || l.user_email || 'System')}</strong></td>
                                    <td><span class="badge" style="background:rgba(0,173,232,0.1); color:var(--accent)">${escapeHTML(l.action)}</span></td>
                                    <td style="font-size:0.75rem; color:var(--text-dim); max-width:400px; overflow:hidden; text-overflow:ellipsis">${escapeHTML(l.details || '—')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><h3>Nenhum log encontrado</h3><p>Nenhuma atividade registrada na trilha deste projeto ainda.</p></div>'}
        </div>`;
    }

    // ——— GENERATE POLICY (AI) & WORKFLOW DE APROVAÇÃO —————
    async function openGeneratePolicyModal(projectId, controlIdArg) {
        const controlId = controlIdArg || 'A.5.1';
        
        openModal(`
            <div class="modal-header"><span class="modal-title">Gestão de Política</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div style="padding: 2rem; text-align: center; color: var(--text-dim);">Carregando detalhes do controle...</div>
        `);

        const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
        let ctrl = {};
        let policyText = '';
        let evidenceId = null;

        // 1. Busca a política no endpoint dedicado
        try {
            const policyRes = await api('GET', `/api/v1/projects/${projectId}/controls/${controlId}/policy`);
            if (policyRes) {
                policyText = policyRes.content || '';
                evidenceId = policyRes.evidence_id || null;
                ctrl = policyRes.control || {};
            }
        } catch(e) {
            console.error("Erro ao carregar politica do R2:", e);
        }

        // 2. Fallback caso a requisição falhe ou retorne vazio
        if (!ctrl.id) {
            try {
                const controls = await api('GET', '/api/v1/controls');
                if (Array.isArray(controls)) {
                    ctrl = controls.find(c => c.id === normId) || {};
                    if (!policyText) policyText = ctrl.description || '';
                }
            } catch(e) {}
        }

        let templates = [];
        let options = '';
        try {
            const res = await api('GET', '/api/v1/policies/templates');
            if (res && res.templates) {
                templates = res.templates || [];
                options = templates.map(t => `<option value="${t}">${t}</option>`).join('');
            }
        } catch(e) {
            console.error("Erro ao carregar templates:", e);
        }

        const isDefaultDescription = !policyText || 
                                     policyText === 'Universal ISMS requirement.' || 
                                     policyText.startsWith('SGSI-POLICY-') && policyText.includes('aguardando assinatura');
        const hasPolicy = (policyText && policyText.length > 100 && !isDefaultDescription) || (evidenceId !== null);

        const showGenerationFormHtml = () => {
            const formHtml = `
                <div class="modal-header"><span class="modal-title">Gerar Política ISO — ${escapeHTML(controlId)}</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
                <div class="form-group" style="display:none">
                    <label class="form-label">Controle ISO</label>
                    <input class="form-input" id="policy-control-id" value="${escapeHTML(controlId)}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Método de Geração</label>
                    <select class="form-input" id="policy-gen-method" onchange="togglePolicyGenFields()">
                        <option value="ai">Inteligência Artificial (PolicyAgent)</option>
                        ${options.length ? `<option value="template">Template de Política Standard</option>` : ''}
                    </select>
                </div>

                <div class="form-group" id="policy-template-container" style="display:none">
                    <label class="form-label">Selecione o Template Standard</label>
                    <select class="form-input" id="policy-template-select">
                        ${options}
                    </select>
                </div>

                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem" id="policy-gen-hint">O PolicyAgent irá gerar uma política completa usando IA, adaptada ao contexto organizacional deste projeto.</p>
                <button class="btn btn-primary" id="btn-gen-policy" style="width:100%" onclick="doGeneratePolicy('${projectId}')">Gerar com IA</button>
                <div id="policy-result" style="margin-top:1rem"></div>
            `;
            const modalContent = document.getElementById('modal-content');
            modalContent.innerHTML = formHtml;
        };

        if (hasPolicy) {
            // Buscar histórico de versões da política
            let versions = [];
            try {
                versions = await api('GET', `/api/v1/projects/${projectId}/controls/${controlId}/versions`) || [];
            } catch(e) {}

            

            let cisoStatusHtml = '';
            if (ctrl.ciso_approved_by) {
                cisoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--success)">✓ Aprovado por ${escapeHTML(ctrl.ciso_approved_by)} em ${new Date(ctrl.ciso_approved_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                `;
            } else {
                cisoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ciso')">Assinar</button>
                        </div>
                    </div>
                `;
            }

            let ceoStatusHtml = '';
            if (ctrl.ceo_approved_by) {
                ceoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--success)">✓ Aprovado por ${escapeHTML(ctrl.ceo_approved_by)} em ${new Date(ctrl.ceo_approved_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                `;
            } else {
                ceoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ceo')">Assinar</button>
                        </div>
                    </div>
                `;
            }

            let versionsSelectHtml = '';
            if (versions.length > 0) {
                versionsSelectHtml = `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
                        <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; min-width:120px">Histórico de Versões:</label>
                        <select class="form-input" style="height:32px; padding:0 8px; font-size:0.75rem; border-radius:6px; background:rgba(255,255,255,0.02); border-color:var(--border); flex:1" id="policy-version-selector" onchange="window.onPolicyVersionChange('${projectId}', '${controlId}', this.value)">
                            ${versions.map((v, index) => `<option value="${v.id}">${index === 0 ? 'v' + v.version + ' (Atual)' : 'v' + v.version} - por ${escapeHTML(v.created_by)} em ${new Date(v.created_at).toLocaleDateString()}</option>`).join('')}
                        </select>
                        <button class="btn" id="btn-restore-version" style="display:none; padding:4px 10px; font-size:0.7rem; border-color:var(--accent); color:var(--accent);" onclick="window.doRestorePolicyVersion('${projectId}', '${controlId}')">Restaurar vX</button>
                    </div>
                `;
            }

            const html = `
                <div class="modal-header">
                    <span class="modal-title">Política Ativa — ${escapeHTML(controlId)}</span>
                    <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div style="font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif">Título da Política</div>
                    <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.15rem; color:var(--accent)">
                        ${escapeHTML(ctrl.title)}
                    </div>
                    
                    ${versionsSelectHtml}

                    <div style="font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif; margin-top:8px">Conteúdo da Política</div>
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:1.25rem; max-height:350px; overflow-y:auto; font-size:0.75rem; line-height:1.6; white-space:pre-wrap; font-family:'Inter',sans-serif;" id="policy-content-text">${escapeHTML(policyText)}</div>
                    
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:8px">
                        <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Workflow de Assinatura (A.5.1)</h4>
                        <div style="display:flex; flex-direction:column; gap:0.75rem">
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${cisoStatusHtml}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${ceoStatusHtml}
                            </div>
                        </div>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem">
                        <button class="btn" onclick="forceCloseModal()">Fechar</button>
                        <button class="btn btn-primary" id="btn-regen-trigger">Regerar com IA / Template</button>
                    </div>
                </div>
            `;
            openModal(html, 'modal-large');
            document.getElementById('btn-regen-trigger').onclick = showGenerationFormHtml;
            
            

            window.activeVersionsList = versions;
            window.onPolicyVersionChange = async function(pId, cId, verId) {
                const selected = window.activeVersionsList.find(v => v.id === verId);
                if (!selected) return;
                
                try {
                    const detail = await api('GET', `/api/v1/projects/${pId}/controls/${cId}/versions/${verId}`);
                    document.getElementById('policy-content-text').textContent = detail.policy_text;
                    
                    const restoreBtn = document.getElementById('btn-restore-version');
                    if (restoreBtn) {
                        const isLatest = window.activeVersionsList[0].id === verId;
                        if (isLatest) {
                            restoreBtn.style.display = 'none';
                        } else {
                            restoreBtn.style.display = 'block';
                            restoreBtn.textContent = `Restaurar v${detail.version}`;
                        }
                    }
                } catch (e) {
                    showToast('Erro ao carregar texto da versão', 'error');
                }
            };
            
            window.doRestorePolicyVersion = async function(pId, cId) {
                const selector = document.getElementById('policy-version-selector');
                const verId = selector.value;
                if (!verId) return;
                
                try {
                    const res = await api('POST', `/api/v1/projects/${pId}/controls/${cId}/restore-version`, { version_id: verId });
                    if (res.ok) {
                        showToast('Política restaurada com sucesso');
                        window.openGeneratePolicyModal(pId, cId);
                        render();
                    }
                } catch(e) {
                    showToast('Erro ao restaurar versão', 'error');
                }
            };
        } else {
            showGenerationFormHtml();
        }
    }

    window.togglePolicyGenFields = function() {
        const method = document.getElementById('policy-gen-method').value;
        const container = document.getElementById('policy-template-container');
        const hint = document.getElementById('policy-gen-hint');
        const btn = document.getElementById('btn-gen-policy');

        if (method === 'template') {
            container.style.display = 'block';
            hint.textContent = 'Gere a política a partir de um template standard preenchendo as variáveis do projeto cliente automaticamente.';
            btn.textContent = 'Gerar a partir de Template';
        } else {
            container.style.display = 'none';
            hint.textContent = 'O PolicyAgent ira gerar uma politica completa usando IA, adaptada ao contexto organizacional deste projeto.';
            btn.textContent = 'Gerar com IA';
        }
    };

    async function doGeneratePolicy(projectId) {
        const controlId = document.getElementById('policy-control-id').value || 'A.5.1';
        const method = document.getElementById('policy-gen-method').value || 'ai';
        const templateName = document.getElementById('policy-template-select')?.value;
        const btn = document.getElementById('btn-gen-policy');
        const result = document.getElementById('policy-result');
        
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        result.innerHTML = '<div style="color:var(--muted);font-size:0.75rem">Processando...</div>';

        try {
            let res;
            if (method === 'template') {
                res = await api('POST', `/api/v1/projects/${projectId}/policies/generate-from-template`, {
                    template_name: templateName,
                    control_id: controlId
                });
            } else {
                res = await api('POST', `/api/v1/projects/${projectId}/generate-policy`, { control_id: controlId });
            }
            if (res.ok) {
                let ctrl = {};
                try {
                    const controls = await api('GET', '/api/v1/controls');
                    if (Array.isArray(controls)) {
                        const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
                        ctrl = controls.find(c => c.id === normId) || {};
                    }
                } catch(e) {}

                result.innerHTML = `
                    <div style="font-size:0.5rem;text-transform:uppercase;letter-spacing:0.25em;color:var(--accent);font-weight:500;margin-bottom:0.5rem;font-family:'Montserrat',sans-serif">Política Gerada — ${escapeHTML(controlId)}</div>
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1rem;max-height:180px;overflow-y:auto;font-size:0.75rem;line-height:1.6;white-space:pre-wrap" id="policy-content-text">${escapeHTML(res.policy_markdown)}</div>
                    <div style="margin-top:0.5rem;font-size:0.6rem;color:var(--muted)">Confiança: ${(res.confidence * 100).toFixed(0)}% | Modelo: ${res.metadata?.model || 'AI'}</div>
                    
                    <div style="margin-top:1.5rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:1rem">
                        <h4 style="font-family:'Montserrat',sans-serif;font-size:0.7rem;color:var(--accent);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Workflow de Assinatura (A.5.1)</h4>
                        <div style="display:flex;flex-direction:column;gap:0.75rem">
                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:8px;font-size:0.75rem">
                                <div>
                                    <strong>Líder SGSI:</strong> 
                                    <span id="ciso-sign-status" style="color:var(--text-dim)">${ctrl.ciso_approved_by ? `Aprovado por ${escapeHTML(ctrl.ciso_approved_by)} em ${new Date(ctrl.ciso_approved_at).toLocaleDateString()}` : 'Aguardando assinatura'}</span>
                                </div>
                                ${!ctrl.ciso_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem;font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ciso')">Assinar como Líder SGSI</button>` : ''}
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:8px;font-size:0.75rem">
                                <div>
                                    <strong>Direção Executiva:</strong> 
                                    <span id="ceo-sign-status" style="color:var(--text-dim)">${ctrl.ceo_approved_by ? `Aprovado por ${escapeHTML(ctrl.ceo_approved_by)} em ${new Date(ctrl.ceo_approved_at).toLocaleDateString()}` : 'Aguardando assinatura'}</span>
                                </div>
                                ${!ctrl.ceo_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem;font-size:0.65rem" onclick="signPolicy('${ctrl.id || ''}', 'ceo')">Assinar como Direção Executiva</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                btn.textContent = 'Gerar outra';
                btn.disabled = false;
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            result.innerHTML = `<div style="color:var(--danger);font-size:0.75rem">Erro: ${escapeHTML(e.message)}</div>`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    window.signPolicy = async function(controlId, role) {
        if (!controlId) {
            alert('Não é possível assinar: ID do controle não mapeado.');
            return;
        }
        const roleLabel = role === 'ciso' ? 'Líder SGSI' : 'Direção Executiva';
        const name = prompt(`Digite seu nome completo para assinar eletronicamente como ${roleLabel}:`);
        if (!name) return;
        
        try {
            await api('POST', `/api/v1/controls/${controlId}/approve`, { role, approved_by: name });
            showToast(`Assinatura registrada com sucesso como ${role.toUpperCase()}!`);
            const statusSpan = document.getElementById(`${role}-sign-status`);
            if (statusSpan) {
                statusSpan.textContent = `Aprovado por ${escapeHTML(name)} em ${new Date().toLocaleDateString()}`;
                statusSpan.style.color = 'var(--accent)';
            }
            const btnClicked = event.target;
            if (btnClicked) btnClicked.style.display = 'none';
            render();
        } catch(e) {
            alert('Erro ao registrar assinatura: ' + e.message);
        }
    };

    window.signEvidence = async function(evidenceId, role) {
        if (!evidenceId) {
            alert('Não é possível assinar: ID da evidência inválido.');
            return;
        }
        const roleLabel = role === 'ciso' ? 'Líder SGSI' : 'Direção Executiva';
        const name = prompt(`Digite seu nome completo para assinar eletronicamente como ${roleLabel}:`);
        if (!name) return;
        
        try {
            await api('PUT', `/api/v1/evidence/${evidenceId}/approve`, { role, approved_by: name });
            showToast(`Assinatura registrada com sucesso como ${role.toUpperCase()}!`);
            const c = document.getElementById('main-content');
            const h = document.getElementById('header-title');
            const a = document.getElementById('header-actions');
            if (c && h && a && S.view === 'evidence') {
                await renderEvidence(c, h, a);
            }
        } catch(e) {
            alert('Erro ao registrar assinatura: ' + e.message);
        }
    };

    // ——— GESTÃO DE ESCOPO (CLÁUSULA 6.3) ——————————————————
    window.openScopeChangeModal = async function(projectId, projData) {
        let history = [];
        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/scope-changes`);
            if (res.ok && Array.isArray(res.changes)) {
                history = res.changes;
            }
        } catch(e) {}

        openModal(`
            <div class="modal-header"><span class="modal-title">Alteração de Escopo (Cláusula 6.3)</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Escopo Atual do Projeto</label>
                <textarea class="form-input" readonly rows="2" style="background:rgba(255,255,255,0.02);color:var(--text-dim);resize:none">${escapeHTML(projData.scope || 'Nenhum escopo definido')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Novo Escopo Proposto</label>
                <textarea class="form-input" id="scope-new" rows="2" placeholder="Descreva o novo escopo do SGSI..."></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Motivo da Mudança</label>
                <input class="form-input" id="scope-reason" placeholder="Ex: Inclusão de nova API de pagamentos no escopo">
            </div>
            <div class="form-group">
                <label class="form-label">Avaliação de Impacto na Segurança da Informação</label>
                <textarea class="form-input" id="scope-impact" rows="2" placeholder="Quais novos riscos ou mudanças de ativos essa alteração traz?"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Aprovador ness. / Cliente</label>
                <input class="form-input" id="scope-approved-by" placeholder="Ex: João (ness.) / CISO Cliente">
            </div>
            
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitScopeChange('${projectId}', '${escapeHTML(projData.scope || '')}')">Registrar Alteração</button>

            <div style="margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem">
                <h4 style="font-family:'Montserrat',sans-serif;font-size:0.7rem;color:var(--accent);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em">Histórico de Alterações de Escopo</h4>
                <div style="font-size:0.65rem; color:var(--text-dim); max-height:100px; overflow-y:auto; line-height:1.4">
                    ${history.length ? history.map((c, i) => `
                        <div style="padding:0.3rem 0; border-bottom:1px dashed rgba(255,255,255,0.03)">
                            <strong>Versão ${history.length - i}</strong> (${new Date(c.created_at).toLocaleDateString()}) - Por: ${escapeHTML(c.approved_by)}<br>
                            <em>Motivo:</em> ${escapeHTML(c.change_reason)}<br>
                            <em>Impacto de Seg.:</em> ${escapeHTML(c.security_impact)}<br>
                            <em>Novo Escopo:</em> ${escapeHTML(c.new_scope)}
                        </div>
                    `).join('') : 'Sem alterações de escopo registradas.'}
                </div>
            </div>
        `);
    };

    window.submitScopeChange = async function(projectId, prevScope) {
        const body = {
            previous_scope: prevScope,
            new_scope: document.getElementById('scope-new').value,
            change_reason: document.getElementById('scope-reason').value,
            security_impact: document.getElementById('scope-impact').value,
            approved_by: document.getElementById('scope-approved-by').value
        };
        if (!body.new_scope || !body.change_reason || !body.approved_by) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        await api('POST', `/api/v1/projects/${projectId}/scope-changes`, body);
        
        if (S.activeProject && S.activeProject.id === projectId) S.activeProject.scope = body.new_scope;
        if (S.currentProject && S.currentProject.id === projectId) S.currentProject.scope = body.new_scope;

        forceCloseModal(); render();
    };

    // ——— RISKS MODULE ———————————————————————————————————
    async function renderRisks(c, h, a) {
        h.textContent = 'Riscos';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto primeiro.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        const isOrgUser = S.user && S.user.role === 'org_user';
        a.innerHTML = isOrgUser ? '' : `<button class="btn btn-primary" onclick="openNewRiskModal('${proj.id}')">+ Novo Risco</button>`;
        
        let risks = [];
        try { risks = await api('GET', `/api/v1/projects/${proj.id}/risks`); } catch(e) {}
        if (!Array.isArray(risks)) risks = [];
        S.risks = risks;
        
        // Reset filter if project changed
        if (S.riskFilterProjectId !== proj.id) {
            S.riskFilter = null;
            S.riskFilterProjectId = proj.id;
        }

        // Calculate stats
        let criticalCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        let veryLowCount = 0;
        let totalScore = 0;

        risks.forEach(r => {
            const score = r.risk_score || (r.impact * r.probability);
            totalScore += score;
            if (score >= 25) criticalCount++;
            else if (score >= 15) highCount++;
            else if (score >= 6) mediumCount++;
            else if (score >= 4) lowCount++;
            else veryLowCount++;
        });

        const averageScore = risks.length ? (totalScore / risks.length).toFixed(1) : '0.0';

        // Helper to check cell color
        const getCellLevel = (p, i) => {
            const score = p * i;
            if (score >= 25) return 'Critical';
            if (score >= 15) return 'High';
            if (score >= 6) return 'Medium';
            if (score >= 4) return 'Low';
            return 'Very Low';
        };

        const getCellColor = (level) => {
            switch(level) {
                case 'Critical': return { bg: 'rgba(165, 29, 29, 0.65)', border: 'rgba(239, 68, 68, 0.45)' };
                case 'High':     return { bg: 'rgba(180, 80, 25, 0.55)', border: 'rgba(249, 115, 22, 0.4)' };
                case 'Medium':   return { bg: 'rgba(145, 110, 25, 0.45)', border: 'rgba(234, 179, 8, 0.45)' };
                case 'Low':      return { bg: 'rgba(20, 60, 100, 0.65)', border: 'rgba(0, 173, 232, 0.35)' };
                case 'Very Low': default: return { bg: 'rgba(10, 25, 55, 0.75)', border: 'rgba(255, 255, 255, 0.08)' };
            }
        };

        // Render cells
        let cellsHTML = '';
        for (let p = 5; p >= 1; p--) {
            for (let i = 1; i <= 5; i++) {
                const cellRisks = risks.filter(r => r.probability === p && r.impact === i);
                const count = cellRisks.length;
                const level = getCellLevel(p, i);
                const colors = getCellColor(level);
                const isSelected = S.riskFilter && S.riskFilter.probability === p && S.riskFilter.impact === i;
                
                cellsHTML += `
                    <div class="matrix-cell ${isSelected ? 'selected' : ''}" 
                         style="background: ${colors.bg}; border: 1px solid ${isSelected ? 'var(--accent)' : colors.border};" 
                         onclick="toggleRiskFilter(${p}, ${i})"
                         title="Probabilidade: ${p}, Impacto: ${i} (${count} risco${count !== 1 ? 's' : ''})">
                        ${count > 0 ? `<span class="cell-counter">${count}</span>` : ''}
                    </div>
                `;
            }
        }

        // Apply filter if active
        let filteredRisks = risks;
        let filterIndicatorBar = '';
        if (S.riskFilter) {
            filteredRisks = risks.filter(r => r.probability === S.riskFilter.probability && r.impact === S.riskFilter.impact);
            filterIndicatorBar = `
                <div class="filter-indicator-bar" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0, 173, 232, 0.1); border: 1px solid rgba(0, 173, 232, 0.2); border-radius:8px; padding:0.5rem 1rem; margin-bottom:1.5rem; font-size:0.8rem; animation: fadeIn 0.2s ease-out;">
                    <span>Filtrando riscos com <strong>Impacto ${S.riskFilter.impact}</strong> e <strong>Probabilidade ${S.riskFilter.probability}</strong> (${filteredRisks.length} encontrado${filteredRisks.length !== 1 ? 's' : ''})</span>
                    <button class="btn btn-ghost" onclick="toggleRiskFilter(${S.riskFilter.probability}, ${S.riskFilter.impact})" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--accent);">Limpar Filtro</button>
                </div>
            `;
        }

        const levelColor = l => l === 'Critical' ? 'var(--danger)' : l === 'High' ? 'var(--warning)' : l === 'Medium' ? '#f59e0b' : 'var(--accent)';

        c.innerHTML = `
            <div class="fade-in">
                <!-- Matrix Container -->
                <div class="matrix-container">
                    <!-- Matrix Card -->
                    <div class="card" style="flex: 1.2; min-width: 320px; padding: 1.5rem; margin-bottom: 0;">
                        <div class="card-label">Matriz de Riscos (Impacto vs Probabilidade)</div>
                        <div class="matrix-layout">
                            <!-- Vertical label -->
                            <div class="matrix-y-title">PROBABILIDADE</div>
                            <!-- Y-axis numbers -->
                            <div class="matrix-y-axis">
                                <div>5</div>
                                <div>4</div>
                                <div>3</div>
                                <div>2</div>
                                <div>1</div>
                            </div>
                            <!-- 5x5 Grid cells -->
                            <div class="matrix-grid-5x5">
                                ${cellsHTML}
                            </div>
                            <!-- Spacers -->
                            <div></div>
                            <div></div>
                            <!-- X-axis numbers -->
                            <div class="matrix-x-axis">
                                <div>1</div>
                                <div>2</div>
                                <div>3</div>
                                <div>4</div>
                                <div>5</div>
                            </div>
                            <!-- Spacers -->
                            <div></div>
                            <div></div>
                            <!-- Horizontal title -->
                            <div class="matrix-x-title">IMPACTO</div>
                        </div>
                    </div>
                    
                    <!-- Stats Sidebar -->
                    <div class="matrix-sidebar">
                        <div class="card" style="padding: 1.25rem; margin-bottom: 0;">
                            <div class="card-label">Distribuição de Riscos</div>
                            <div class="legend-list">
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(165, 29, 29, 0.65); border: 1px solid rgba(239, 68, 68, 0.45);"></div>
                                    <div style="flex: 1;">Crítico (Score 25)</div>
                                    <div style="font-weight: 600; color: var(--danger);">${criticalCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(180, 80, 25, 0.55); border: 1px solid rgba(249, 115, 22, 0.4);"></div>
                                    <div style="flex: 1;">Alto (Score 15-20)</div>
                                    <div style="font-weight: 600; color: var(--warning);">${highCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(145, 110, 25, 0.45); border: 1px solid rgba(234, 179, 8, 0.45);"></div>
                                    <div style="flex: 1;">Médio (Score 6-12)</div>
                                    <div style="font-weight: 600; color: #f59e0b;">${mediumCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(20, 60, 100, 0.65); border: 1px solid rgba(0, 173, 232, 0.35);"></div>
                                    <div style="flex: 1;">Baixo (Score 4-5)</div>
                                    <div style="font-weight: 600; color: var(--accent);">${lowCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(10, 25, 55, 0.75); border: 1px solid rgba(255, 255, 255, 0.08);"></div>
                                    <div style="flex: 1;">Muito Baixo (Score 1-3)</div>
                                    <div style="font-weight: 600; color: var(--text-dim);">${veryLowCount}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card" style="padding: 1.25rem; margin-bottom: 0; display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div class="card-label" style="margin-bottom: 0.25rem;">Total de Riscos</div>
                                <div style="font-size: 1.8rem; font-weight: 600; font-family: 'Montserrat', sans-serif;">${risks.length}</div>
                            </div>
                            <div style="text-align: right;">
                                <div class="card-label" style="margin-bottom: 0.25rem;">Score Médio</div>
                                <div style="font-size: 1.8rem; font-weight: 600; color: var(--accent); font-family: 'Montserrat', sans-serif;">${averageScore}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Filter indicator -->
                ${filterIndicatorBar}
                
                <!-- List Section -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top: 1rem;">
                    <div class="card-label" style="margin-bottom: 0;">Lista Detalhada de Riscos</div>
                    <button class="btn" onclick="exportCSV('risks')" style="font-size:0.7rem; padding:0.4rem 0.8rem">Exportar Riscos</button>
                </div>
                
                <div>
                    ${filteredRisks.length ? filteredRisks.map(r => `
                        <div class="list-item" style="cursor:pointer" onclick="window.openRiskDetailsModal('${r.id}')">
                            <div style="flex:1">
                                <div class="item-name">${escapeHTML(r.asset)} — ${escapeHTML(r.threat)}</div>
                                <div class="item-meta" style="margin-top:0.25rem">
                                    <strong>Probabilidade:</strong> ${r.probability} | <strong>Impacto:</strong> ${r.impact} | 
                                    <strong>Tratamento:</strong> ${r.treatment} | <strong>Responsável:</strong> ${escapeHTML(r.owner || 'Sem dono')}
                                    ${r.control_standard ? ` | <strong>Controle:</strong> <span class="badge badge-implemented" style="padding:2px 6px;font-size:0.75rem">${escapeHTML(r.control_standard)}</span>` : ''}
                                    ${r.treatment === 'Accept' && r.accepted_by ? ` | <strong>Aceito por:</strong> ${escapeHTML(r.accepted_by)}` : ''}
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem">
                                <span style="font-weight:600;color:${levelColor(r.risk_level)}">${r.risk_score || (r.impact * r.probability)}</span>
                                <span class="ctx-tag" style="background:${levelColor(r.risk_level)}20;color:${levelColor(r.risk_level)}">${r.risk_level || 'N/A'}</span>
                            </div>
                        </div>
                    `).join('') : '<div class="empty-state"><h3>Nenhum risco correspondente</h3><p>Não há riscos cadastrados ou que correspondam ao filtro selecionado.</p></div>'}
                </div>
            </div>
        `;
    }

    window.toggleRiskFilter = function(p, i) {
        if (S.riskFilter && S.riskFilter.probability === p && S.riskFilter.impact === i) {
            S.riskFilter = null;
        } else {
            S.riskFilter = { probability: p, impact: i };
        }
        render();
    };

    window.onRiskAssetSelectChange = function(select) {
        const manualGroup = document.getElementById('risk-asset-manual-group');
        const manualInput = document.getElementById('risk-asset');
        if (select.value === '__manual__' || select.value === '') {
            manualGroup.style.display = '';
            if (select.value === '') manualInput.value = '';
        } else {
            manualGroup.style.display = 'none';
            const opt = select.options[select.selectedIndex];
            manualInput.value = opt.getAttribute('data-name');
        }
    };

    window.onRiskTreatmentChange = function(select) {
        const acceptGroup = document.getElementById('risk-accept-group');
        if (select.value === 'Accept') {
            acceptGroup.style.display = '';
            const dtInput = document.getElementById('risk-accepted-at');
            if (!dtInput.value) dtInput.value = new Date().toISOString().split('T')[0];
        } else {
            acceptGroup.style.display = 'none';
        }
    };

    window.openNewRiskModal = async function(projectId) {
        let assets = [];
        let controls = [];
        try { 
            assets = await api('GET', `/api/v1/projects/${projectId}/assets`); 
            controls = await api('GET', `/api/v1/projects/${projectId}/controls`);
        } catch(e) {}
        if (!Array.isArray(assets)) assets = [];
        if (!Array.isArray(controls)) controls = [];

        const controlOptions = controls
            .filter(c => c.status !== 'Not Applicable')
            .map(c => `<option value="${c.id}">${escapeHTML(c.standard)} - ${escapeHTML(c.title)}</option>`)
            .join('');

        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Risco</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group">
                <label class="form-label">Ativo do Inventario (Opcional)</label>
                <select class="form-input" id="risk-asset-select" onchange="window.onRiskAssetSelectChange(this)">
                    <option value="">-- Escolha um ativo --</option>
                    ${assets.map(a => `<option value="${a.id}" data-name="${escapeHTML(a.name)}">${escapeHTML(a.name)} (${a.category})</option>`).join('')}
                    <option value="__manual__">-- Digitar manualmente --</option>
                </select>
            </div>
            <div class="form-group" id="risk-asset-manual-group">
                <label class="form-label">Nome do Ativo</label>
                <input class="form-input" id="risk-asset" placeholder="Ex: Servidor de producao">
            </div>
            <div class="form-group"><label class="form-label">Ameaca</label><input class="form-input" id="risk-threat" placeholder="Ex: Acesso nao autorizado"></div>
            <div class="form-group"><label class="form-label">Vulnerabilidade</label><input class="form-input" id="risk-vuln" placeholder="Ex: Falta de MFA"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Impacto (1-5)</label><input class="form-input" id="risk-impact" type="number" min="1" max="5" value="3"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Probabilidade (1-5)</label><input class="form-input" id="risk-prob" type="number" min="1" max="5" value="3"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Tratamento</label>
                <select class="form-input" id="risk-treatment" onchange="window.onRiskTreatmentChange(this)">
                    <option value="Mitigate">Mitigate</option>
                    <option value="Accept">Accept (Aceitar)</option>
                    <option value="Transfer">Transfer</option>
                    <option value="Avoid">Avoid</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Annex A Vinculado (Opcional)</label>
                <select class="form-input" id="risk-control">
                    <option value="">-- Sem controle vinculado --</option>
                    ${controlOptions}
                </select>
            </div>
            <div id="risk-accept-group" style="display:none">
                <div class="form-group"><label class="form-label">Assinado/Aceito por</label><input class="form-input" id="risk-accepted-by" placeholder="Ex: Executivo do Cliente (CEO)"></div>
                <div class="form-group"><label class="form-label">Data do Aceite</label><input class="form-input" id="risk-accepted-at" type="date"></div>
            </div>
            <div class="form-group"><label class="form-label">Responsavel</label><input class="form-input" id="risk-owner" placeholder="Ex: CISO"></div>
            <div class="form-group"><label class="form-label">Plano de Tratamento</label><textarea class="form-input" id="risk-plan" rows="2" placeholder="Descreva as acoes..."></textarea></div>
            <button class="btn btn-primary" style="width:100%" onclick="window.createRisk('${projectId}')">Registrar Risco</button>
        `);
    };

    window.createRisk = async function(projectId) {
        const select = document.getElementById('risk-asset-select');
        const assetId = select.value && select.value !== '__manual__' ? select.value : null;
        const assetName = document.getElementById('risk-asset').value;
        const treatment = document.getElementById('risk-treatment').value;

        const body = {
            asset_id: assetId,
            asset: assetName,
            threat: document.getElementById('risk-threat').value,
            vulnerability: document.getElementById('risk-vuln').value,
            impact: +document.getElementById('risk-impact').value,
            probability: +document.getElementById('risk-prob').value,
            treatment: treatment,
            control_id: document.getElementById('risk-control').value || null,
            owner: document.getElementById('risk-owner').value,
            treatment_plan: document.getElementById('risk-plan').value,
            accepted_by: treatment === 'Accept' ? document.getElementById('risk-accepted-by').value : null,
            accepted_at: treatment === 'Accept' ? document.getElementById('risk-accepted-at').value : null
        };
        if (!body.asset || !body.threat) return;
        await api('POST', `/api/v1/projects/${projectId}/risks`, body);
        forceCloseModal(); render();
    };

    window.openEditRiskModal = async function(riskId) {
        const r = S.risks.find(x => x.id === riskId) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        let controls = [];
        try { 
            controls = await api('GET', `/api/v1/projects/${projectId}/controls`);
        } catch(e) {}
        if (!Array.isArray(controls)) controls = [];

        const controlOptions = controls
            .filter(c => c.status !== 'Not Applicable')
            .map(c => `<option value="${c.id}" ${c.id === r.control_id ? 'selected' : ''}>${escapeHTML(c.standard)} - ${escapeHTML(c.title)}</option>`)
            .join('');

        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Risco</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Ativo</label><input class="form-input" id="risk-e-asset" value="${escapeHTML(r.asset||'')}"></div>
            <div class="form-group"><label class="form-label">Ameaca</label><input class="form-input" id="risk-e-threat" value="${escapeHTML(r.threat||'')}"></div>
            <div class="form-group"><label class="form-label">Vulnerabilidade</label><input class="form-input" id="risk-e-vuln" value="${escapeHTML(r.vulnerability||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Impacto (1-5)</label><input class="form-input" id="risk-e-impact" type="number" min="1" max="5" value="${r.impact||3}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Probabilidade (1-5)</label><input class="form-input" id="risk-e-prob" type="number" min="1" max="5" value="${r.probability||3}"></div>
            </div>
            <div class="form-group"><label class="form-label">Tratamento</label>
                <select class="form-input" id="risk-e-treatment">${['Mitigate','Accept','Transfer','Avoid'].map(o => `<option ${o===r.treatment?'selected':''}>${o}</option>`).join('')}</select></div>
            <div class="form-group">
                <label class="form-label">Controle Annex A Vinculado (Opcional)</label>
                <select class="form-input" id="risk-e-control">
                    <option value="">-- Sem controle vinculado --</option>
                    ${controlOptions}
                </select>
            </div>
            <div class="form-group"><label class="form-label">Responsavel</label><input class="form-input" id="risk-e-owner" value="${escapeHTML(r.owner||'')}"></div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" onclick="if(confirm('Excluir este risco?')){api('DELETE','/api/v1/risks/${riskId}').then(()=>{forceCloseModal();render()})}">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateRisk('${riskId}')">Salvar</button>
            </div>
        `);
    };

    window.updateRisk = async function(id) {
        const body = { 
            asset: document.getElementById('risk-e-asset').value, 
            threat: document.getElementById('risk-e-threat').value, 
            vulnerability: document.getElementById('risk-e-vuln').value, 
            impact: +document.getElementById('risk-e-impact').value, 
            probability: +document.getElementById('risk-e-prob').value, 
            treatment: document.getElementById('risk-e-treatment').value, 
            control_id: document.getElementById('risk-e-control').value || null,
            owner: document.getElementById('risk-e-owner').value 
        };
        await api('PUT', `/api/v1/risks/${id}`, body);
        forceCloseModal(); render();
    };

    window.openRiskDetailsModal = function(id) {
        const r = S.risks.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const levelColor = l => l === 'Critical' ? 'var(--danger)' : l === 'High' ? 'var(--warning)' : l === 'Medium' ? '#f59e0b' : 'var(--accent)';
        const score = r.risk_score || (r.impact * r.probability);
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Risco</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.asset || '')} — ${escapeHTML(r.threat || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Nível de Risco</div>
                        <span class="ctx-tag" style="background:${levelColor(r.risk_level)}20; color:${levelColor(r.risk_level)}; font-weight:600">${r.risk_level || 'N/A'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Score Total</div>
                        <span style="font-size:1.1rem; font-weight:700; color:${levelColor(r.risk_level)}">${score}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Probabilidade</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.probability} / 5</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Impacto</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.impact} / 5</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Estratégia de Tratamento</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.treatment || '')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável (Owner)</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.owner || 'Sem dono')}</div>
                    </div>
                    ${r.control_standard ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Controle de Segurança Vinculado</div>
                        <div style="display:flex; align-items:center; gap:8px">
                            <span class="badge badge-implemented" style="padding:4px 8px;font-size:0.75rem">${escapeHTML(r.control_standard)}</span>
                        </div>
                    </div>` : ''}
                    ${r.treatment === 'Accept' && r.accepted_by ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Risco Aceito por</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">${escapeHTML(r.accepted_by)} em ${r.accepted_at || 'data desconhecida'}</div>
                    </div>` : ''}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditRiskModal('${id}')">Editar Risco</button>` : ''}
            </div>
        `);
    };

    // ——— VENDORS MODULE —————————————————————————————————
    async function renderVendors(c, h, a) {
        h.textContent = 'Fornecedores (KYV)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewVendorModal('${proj.id}')">+ Novo Fornecedor</button>` : '';
        
        let vendors = [];
        try { vendors = await api('GET', `/api/v1/projects/${proj.id}/vendors`); } catch(e) {}
        if (!Array.isArray(vendors)) vendors = [];
        S.vendors = vendors;
        const dilColor = d => d === 'Low' ? 'var(--accent)' : d === 'Medium' ? 'var(--info)' : 'var(--danger)';
        c.innerHTML = `<div class="fade-in">${vendors.length ? vendors.map(v => `
            <div class="list-item" style="cursor:pointer" onclick="window.openVendorDetailsModal('${v.id}')">
                <div style="flex:1"><div class="item-name">${escapeHTML(v.name)}</div>
                <div class="item-meta" style="margin-top:0.25rem">${v.category || 'Geral'} | Score: ${v.trust_score} | DPA: ${v.dpa_signed ? 'Sim' : 'Nao'}</div></div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    ${v.has_iso27001 ? '<span class="ctx-tag ctx-tag-green">27001</span>' : ''}
                    ${v.has_soc2 ? '<span class="ctx-tag ctx-tag-green">SOC2</span>' : ''}
                    <span class="ctx-tag" style="color:${dilColor(v.diligence_level)}">${v.diligence_level}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhum fornecedor</h3><p>Registre fornecedores para gestao de terceiros.</p></div>'}</div>`;
    }

    window.openVendorDetailsModal = function(id) {
        const v = S.vendors.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const dilColor = d => d === 'Low' ? 'var(--accent)' : d === 'Medium' ? 'var(--info)' : 'var(--danger)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Fornecedor</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.4rem; color:var(--accent)">
                    ${escapeHTML(v.name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(v.category || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Nivel de Diligencia</div>
                        <span class="ctx-tag" style="color:${dilColor(v.diligence_level)}; font-weight:600">${v.diligence_level || 'Low'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Trust Score (Calculado)</div>
                        <span style="font-size:1.1rem; font-weight:700; color:${v.trust_score >= 80 ? 'var(--success)' : v.trust_score >= 50 ? '#f59e0b' : 'var(--danger)'}">${v.trust_score || 0} / 100</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPA Assinado</div>
                        <span class="ctx-tag" style="background:${v.dpa_signed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)'}; color:${v.dpa_signed ? 'var(--success)' : 'var(--text-dim)'}; font-weight:600">${v.dpa_signed ? 'Sim' : 'Nao'}</span>
                    </div>
                    
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Postura de Seguranca</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px">
                            <span class="ctx-tag" style="color:${v.has_mfa ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_mfa ? 'var(--success)' : 'var(--border)'}">MFA Habilitado: ${v.has_mfa ? 'Sim' : 'Nao'}</span>
                            <span class="ctx-tag" style="color:${v.has_encryption ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_encryption ? 'var(--success)' : 'var(--border)'}">Criptografia: ${v.has_encryption ? 'Sim' : 'Nao'}</span>
                            <span class="ctx-tag" style="color:${v.has_backup ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_backup ? 'var(--success)' : 'var(--border)'}">Backup Ativo: ${v.has_backup ? 'Sim' : 'Nao'}</span>
                            <span class="ctx-tag" style="color:${v.has_incident_plan ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_incident_plan ? 'var(--success)' : 'var(--border)'}">Resposta a Incidentes: ${v.has_incident_plan ? 'Sim' : 'Nao'}</span>
                            <span class="ctx-tag" style="color:${v.has_pentest ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_pentest ? 'var(--success)' : 'var(--border)'}">Pentest Recente: ${v.has_pentest ? 'Sim' : 'Nao'}</span>
                        </div>
                    </div>

                    ${v.trust_center_url ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Trust Center / Security Portal</div>
                        <a href="${escapeHTML(v.trust_center_url)}" target="_blank" style="color:var(--accent); font-size:0.85rem; text-decoration:none">${escapeHTML(v.trust_center_url)} &nearr;</a>
                    </div>` : ''}

                    ${v.dpa_url ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPA Padrao / Termos de Privacidade</div>
                        <a href="${escapeHTML(v.dpa_url)}" target="_blank" style="color:var(--accent); font-size:0.85rem; text-decoration:none">${escapeHTML(v.dpa_url)} &nearr;</a>
                    </div>` : ''}

                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Certificacoes e Padroes Publicos</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px">
                            ${v.has_iso27001 ? '<span class="ctx-tag ctx-tag-green">ISO 27001</span>' : ''}
                            ${v.has_iso27701 ? '<span class="ctx-tag ctx-tag-green">ISO 27701</span>' : ''}
                            ${v.has_soc2 ? '<span class="ctx-tag ctx-tag-green">SOC 2</span>' : ''}
                            ${v.attached_certifications ? v.attached_certifications.split(',').map(c => `<span class="ctx-tag ctx-tag-green">${escapeHTML(c.trim())}</span>`).join('') : ''}
                            ${(!v.has_iso27001 && !v.has_iso27701 && !v.has_soc2 && !v.attached_certifications) ? '<span style="font-size:0.8rem; color:var(--text-dim)">Nenhuma cadastrada</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditVendorModal('${id}')">Editar Fornecedor</button>` : ''}
            </div>
        `);
    };

    window.previewVendorScore = function() {
        let score = 0;
        if (document.getElementById('vnd-iso27001')?.checked) score += 20;
        if (document.getElementById('vnd-iso27701')?.checked) score += 15;
        if (document.getElementById('vnd-soc2')?.checked) score += 15;
        if (document.getElementById('vnd-mfa')?.checked) score += 10;
        if (document.getElementById('vnd-enc')?.checked) score += 15;
        if (document.getElementById('vnd-bkp')?.checked) score += 10;
        if (document.getElementById('vnd-inc')?.checked) score += 10;
        if (document.getElementById('vnd-pen')?.checked) score += 10;
        if (document.getElementById('vnd-tc-url')?.value.trim().length > 0) score += 5;
        if (document.getElementById('vnd-dpa')?.value === '1' || document.getElementById('vnd-dpa-url')?.value.trim().length > 0) score += 10;
        
        const finalScore = Math.min(100, score);
        const scorePreviewEl = document.getElementById('vnd-score-preview');
        if (scorePreviewEl) {
            scorePreviewEl.textContent = finalScore + ' / 100';
            scorePreviewEl.style.color = finalScore >= 80 ? 'var(--success)' : finalScore >= 50 ? '#f59e0b' : 'var(--danger)';
        }
    };

    window.openNewVendorModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Fornecedor</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="vnd-name" placeholder="Ex: AWS, Cloudflare"></div>
            <div class="form-group"><label class="form-label">Categoria</label><input class="form-input" id="vnd-cat" placeholder="Ex: Cloud, SaaS, Consultoria"></div>
            
            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Certificacoes Conhecidas</div>
            <div style="display:flex; gap:1rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27001" onchange="window.previewVendorScore()"> ISO 27001</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27701" onchange="window.previewVendorScore()"> ISO 27701</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-soc2" onchange="window.previewVendorScore()"> SOC 2</label>
            </div>
            
            <div class="form-group">
                <label class="form-label">Outras Certificações (Separadas por vírgula)</label>
                <input class="form-input" id="vnd-attached-certs" placeholder="Ex: PCI-DSS, HIPAA, ISO 27017">
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Postura de Seguranca (Se houver questionario/dados)</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-mfa" onchange="window.previewVendorScore()"> MFA Habilitado</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-enc" onchange="window.previewVendorScore()"> Criptografia Ativa</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-bkp" onchange="window.previewVendorScore()"> Backups Regulares</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-inc" onchange="window.previewVendorScore()"> Plano de Incidentes</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem; grid-column:span 2"><input type="checkbox" id="vnd-pen" onchange="window.previewVendorScore()"> Testes de Invasao (Pentest)</label>
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Canais Publicos (Trust Center / DPA Padrao)</div>
            <div class="form-group">
                <label class="form-label">Trust Center / Security Portal (URL)</label>
                <input class="form-input" id="vnd-tc-url" placeholder="Ex: https://aws.amazon.com/compliance/" oninput="window.previewVendorScore()">
            </div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">DPA Assinado?</label>
                    <select class="form-input" id="vnd-dpa" onchange="window.previewVendorScore()">
                        <option value="0">Nao</option>
                        <option value="1">Sim</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2">
                    <label class="form-label">DPA URL (Padrao do Site)</label>
                    <input class="form-input" id="vnd-dpa-url" placeholder="Ex: https://aws.amazon.com/dpa/" oninput="window.previewVendorScore()">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; margin-bottom:1rem; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <span style="font-size:0.8rem; font-weight:600">Trust Score Estimado:</span>
                <span id="vnd-score-preview" style="font-size:1.1rem; font-weight:700; color:var(--danger)">0 / 100</span>
            </div>

            <button class="btn btn-primary" style="width:100%" onclick="window.createVendor('${projectId}')">Registrar Fornecedor</button>
        `);
        window.previewVendorScore();
    };

    window.createVendor = async function(projectId) {
        const body = { 
            name: document.getElementById('vnd-name').value, 
            category: document.getElementById('vnd-cat').value, 
            dpa_signed: +document.getElementById('vnd-dpa').value, 
            has_iso27001: document.getElementById('vnd-iso27001').checked ? 1 : 0, 
            has_iso27701: document.getElementById('vnd-iso27701').checked ? 1 : 0, 
            has_soc2: document.getElementById('vnd-soc2').checked ? 1 : 0,
            has_mfa: document.getElementById('vnd-mfa').checked ? 1 : 0,
            has_encryption: document.getElementById('vnd-enc').checked ? 1 : 0,
            has_backup: document.getElementById('vnd-bkp').checked ? 1 : 0,
            has_incident_plan: document.getElementById('vnd-inc').checked ? 1 : 0,
            has_pentest: document.getElementById('vnd-pen').checked ? 1 : 0,
            trust_center_url: document.getElementById('vnd-tc-url').value,
            dpa_url: document.getElementById('vnd-dpa-url').value,
            attached_certifications: document.getElementById('vnd-attached-certs').value
        };
        if (!body.name) return;
        await api('POST', `/api/v1/projects/${projectId}/vendors`, body);
        forceCloseModal(); render();
    };

    window.openEditVendorModal = function(id) {
        const v = S.vendors.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Fornecedor</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="vnd-e-name" value="${escapeHTML(v.name||'')}"></div>
            <div class="form-group"><label class="form-label">Categoria</label><input class="form-input" id="vnd-e-cat" value="${escapeHTML(v.category||'')}"></div>
            
            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Certificacoes Conhecidas</div>
            <div style="display:flex; gap:1rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27001" ${v.has_iso27001?'checked':''} onchange="window.previewVendorScore()"> ISO 27001</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27701" ${v.has_iso27701?'checked':''} onchange="window.previewVendorScore()"> ISO 27701</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-soc2" ${v.has_soc2?'checked':''} onchange="window.previewVendorScore()"> SOC 2</label>
            </div>
            
            <div class="form-group">
                <label class="form-label">Outras Certificações (Separadas por vírgula)</label>
                <input class="form-input" id="vnd-attached-certs" value="${escapeHTML(v.attached_certifications||'')}" placeholder="Ex: PCI-DSS, HIPAA, ISO 27017">
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Postura de Seguranca</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-mfa" ${v.has_mfa?'checked':''} onchange="window.previewVendorScore()"> MFA Habilitado</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-enc" ${v.has_encryption?'checked':''} onchange="window.previewVendorScore()"> Criptografia Ativa</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-bkp" ${v.has_backup?'checked':''} onchange="window.previewVendorScore()"> Backups Regulares</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-inc" ${v.has_incident_plan?'checked':''} onchange="window.previewVendorScore()"> Plano de Incidentes</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem; grid-column:span 2"><input type="checkbox" id="vnd-pen" ${v.has_pentest?'checked':''} onchange="window.previewVendorScore()"> Testes de Invasao (Pentest)</label>
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Canais Publicos</div>
            <div class="form-group">
                <label class="form-label">Trust Center / Security Portal (URL)</label>
                <input class="form-input" id="vnd-tc-url" value="${escapeHTML(v.trust_center_url||'')}" placeholder="Ex: https://aws.amazon.com/compliance/" oninput="window.previewVendorScore()">
            </div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">DPA Assinado?</label>
                    <select class="form-input" id="vnd-dpa" onchange="window.previewVendorScore()">
                        <option value="0" ${!v.dpa_signed?'selected':''}>Nao</option>
                        <option value="1" ${v.dpa_signed?'selected':''}>Sim</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2">
                    <label class="form-label">DPA URL</label>
                    <input class="form-input" id="vnd-dpa-url" value="${escapeHTML(v.dpa_url||'')}" placeholder="Ex: https://aws.amazon.com/dpa/" oninput="window.previewVendorScore()">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; margin-bottom:1rem; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:10px; padding:12px">
                <span style="font-size:0.8rem; font-weight:600">Trust Score Estimado:</span>
                <span id="vnd-score-preview" style="font-size:1.1rem; font-weight:700; color:var(--danger)">${v.trust_score||0} / 100</span>
            </div>

            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteVendor('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateVendor('${id}')">Salvar</button>
            </div>
        `);
        window.previewVendorScore = function() {
            let score = 0;
            if (document.getElementById('vnd-iso27001')?.checked) score += 20;
            if (document.getElementById('vnd-iso27701')?.checked) score += 15;
            if (document.getElementById('vnd-soc2')?.checked) score += 15;
            if (document.getElementById('vnd-mfa')?.checked) score += 10;
            if (document.getElementById('vnd-enc')?.checked) score += 15;
            if (document.getElementById('vnd-bkp')?.checked) score += 10;
            if (document.getElementById('vnd-inc')?.checked) score += 10;
            if (document.getElementById('vnd-pen')?.checked) score += 10;
            if (document.getElementById('vnd-tc-url')?.value.trim().length > 0) score += 5;
            if (document.getElementById('vnd-dpa')?.value === '1' || document.getElementById('vnd-dpa-url')?.value.trim().length > 0) score += 10;
            
            const finalScore = Math.min(100, score);
            const scorePreviewEl = document.getElementById('vnd-score-preview');
            if (scorePreviewEl) {
                scorePreviewEl.textContent = finalScore + ' / 100';
                scorePreviewEl.style.color = finalScore >= 80 ? 'var(--success)' : finalScore >= 50 ? '#f59e0b' : 'var(--danger)';
            }
        };
        window.previewVendorScore();
    };

    window.updateVendor = async function(id) {
        const body = { 
            name: document.getElementById('vnd-e-name').value, 
            category: document.getElementById('vnd-e-cat').value, 
            dpa_signed: +document.getElementById('vnd-dpa').value, 
            has_iso27001: document.getElementById('vnd-iso27001').checked ? 1 : 0, 
            has_iso27701: document.getElementById('vnd-iso27701').checked ? 1 : 0, 
            has_soc2: document.getElementById('vnd-soc2').checked ? 1 : 0,
            has_mfa: document.getElementById('vnd-mfa').checked ? 1 : 0,
            has_encryption: document.getElementById('vnd-enc').checked ? 1 : 0,
            has_backup: document.getElementById('vnd-bkp').checked ? 1 : 0,
            has_incident_plan: document.getElementById('vnd-inc').checked ? 1 : 0,
            has_pentest: document.getElementById('vnd-pen').checked ? 1 : 0,
            trust_center_url: document.getElementById('vnd-tc-url').value,
            dpa_url: document.getElementById('vnd-dpa-url').value,
            attached_certifications: document.getElementById('vnd-attached-certs').value
        };
        await api('PUT', `/api/v1/vendors/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteVendor = async function(id) {
        if (confirm('Excluir este fornecedor?')) { await api('DELETE', `/api/v1/vendors/${id}`); render(); }
    };

    // ——— TRAINING MODULE ————————————————————————————————
    async function renderTraining(c, h, a) {
        h.textContent = 'Treinamento e Conscientizacao';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = (canCrud ? `<button class="btn btn-primary" onclick="window.openNewTrainingModal('${proj.id}')">+ Novo Registro</button> ` : '') + `<button class="btn" style="background:rgba(255,255,255,0.05);color:var(--text);border:1px solid var(--border)" onclick="window.openImportTrainingModal('${proj.id}')">Importar JSON</button>`;
        
        let records = [];
        let summary = {};
        try { records = await api('GET', `/api/v1/projects/${proj.id}/training`); } catch(e) {}
        try { summary = await api('GET', `/api/v1/projects/${proj.id}/training/summary`); } catch(e) {}
        if (!Array.isArray(records)) records = [];
        S.training = records;

        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'Expired' ? 'var(--danger)' : 'var(--warning)';
        const summaryHtml = summary.total ? `<div class="card" style="margin-bottom:1.5rem;display:flex;gap:2rem;align-items:center">
            <div><div class="card-label">Cobertura</div><div style="font-size:1.5rem;font-weight:600;color:var(--accent)">${summary.coverage_percent || 0}%</div></div>
            <div><div class="card-label">Completos</div><div style="font-size:1.1rem;font-weight:500">${summary.completed || 0}/${summary.total || 0}</div></div>
            <div><div class="card-label">Status</div><div style="font-size:0.8rem;color:${summary.compliance_status === 'Compliant' ? 'var(--accent)' : 'var(--danger)'}">${summary.compliance_status || 'N/A'}</div></div>
        </div>` : '';

        c.innerHTML = `<div class="fade-in">${summaryHtml}${records.length ? records.map(r => `
            <div class="list-item" style="cursor:pointer" onclick="window.openTrainingDetailsModal('${r.id}')">
                <div style="flex:1">
                    <div class="item-name" style="font-weight:600; color:var(--accent)">${escapeHTML(r.training_name)}</div>
                    <div class="item-meta" style="margin-top:0.25rem">
                        <strong>Colaborador:</strong> ${escapeHTML(r.employee_name)}
                        ${r.score ? `| <strong>Score:</strong> ${r.score}%` : ''}
                        ${r.evidence_file ? ` | <span style="color:var(--success)">● Com Evidência</span>` : ' | <span style="color:var(--text-dim)">○ Sem Evidência</span>'}
                    </div>
                </div>
                <div style="text-align:right">
                    <span class="ctx-tag" style="color:${statusColor(r.status)}">${r.status}</span>
                    ${r.completion_date ? `<div style="font-size:0.6rem;color:var(--muted);margin-top:0.25rem">${r.completion_date}</div>` : ''}
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhum registro de treinamento</h3></div>'}</div>`;
    }

    window.openTrainingDetailsModal = function(id) {
        const r = S.training.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'Expired' ? 'var(--danger)' : 'var(--warning)';
        
        let evidenceHtml = '<span style="color:var(--text-dim); font-size:0.85rem">Nenhuma evidência anexada</span>';
        if (r.evidence_file) {
            if (r.evidence_file.includes('|')) {
                const [evId, evName] = r.evidence_file.split('|');
                evidenceHtml = `
                    <div style="display:flex; align-items:center; gap:8px">
                        <span style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(evName)}</span>
                        <button class="btn btn-primary" onclick="window.downloadEvidenceFile('${evId}')" style="padding:4px 8px; font-size:0.7rem">Download</button>
                    </div>`;
            } else if (r.evidence_file.startsWith('http')) {
                evidenceHtml = `<a href="${escapeHTML(r.evidence_file)}" target="_blank" class="btn" style="padding:4px 8px; font-size:0.7rem; display:inline-block; border-color:var(--accent); color:var(--accent)">Abrir Link</a>`;
            } else {
                evidenceHtml = `<span style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.evidence_file)}</span>`;
            }
        }

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Treinamento</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.training_name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Colaborador</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.employee_name || '')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(r.status)}; font-weight:600">${r.status || 'Pending'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Score</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.score ? r.score + '%' : 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data de Conclusão</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.completion_date || 'N/A'}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Evidência de Participação</div>
                        <div style="margin-top:6px">${evidenceHtml}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditTrainingModal('${id}')">Editar Registro</button>` : ''}
            </div>
        `);
    };

    window.uploadTrainingEvidence = async function(input, projectId) {
        const statusDiv = document.getElementById('tr-upload-status');
        const evidenceInput = document.getElementById('tr-evidence') || document.getElementById('tr-e-evidence');
        if (!input.files || !input.files.length) return;
        
        statusDiv.style.display = 'block';
        statusDiv.style.color = 'var(--text-dim)';
        statusDiv.textContent = 'Enviando arquivo para R2...';
        
        const file = input.files[0];
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/evidence/upload`, { 
                method: 'POST', 
                headers, 
                body: formData 
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Erro no upload');
            
            evidenceInput.value = `${data.id}|${data.file_name}`;
            statusDiv.style.color = 'var(--success)';
            statusDiv.textContent = `Upload concluído: ${data.file_name}`;
        } catch(e) {
            statusDiv.style.color = 'var(--danger)';
            statusDiv.textContent = `Erro no upload: ${e.message}`;
        }
    };

    window.openNewTrainingModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Registro de Treinamento</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Colaborador</label><input class="form-input" id="tr-name" placeholder="Ex: Ana Silva"></div>
            <div class="form-group"><label class="form-label">Treinamento</label><input class="form-input" id="tr-training" placeholder="Ex: Seguranca da Informacao Basico"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="tr-status"><option>Pending</option><option>Completed</option><option>Expired</option></select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Score (%)</label><input class="form-input" id="tr-score" type="number" min="0" max="100" placeholder="85"></div>
            </div>
            <div class="form-group"><label class="form-label">Data de Conclusao</label><input class="form-input" id="tr-date" type="date"></div>
            <div class="form-group">
                <label class="form-label">Evidência / Certificado (Upload ou Link Manual)</label>
                <div style="display:flex; gap:0.5rem; align-items:center">
                    <input class="form-input" id="tr-evidence" style="flex:1" placeholder="Ex: Link do certificado ou upload de arquivo">
                    <label class="btn" style="padding:0.6rem 1rem; margin:0; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; justify-content:center; white-space:nowrap">
                        Upload
                        <input type="file" style="display:none" onchange="window.uploadTrainingEvidence(this, '${projectId}')">
                    </label>
                </div>
                <div id="tr-upload-status" style="font-size:0.7rem; color:var(--text-dim); margin-top:4px; display:none"></div>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="window.createTraining('${projectId}')">Registrar</button>
        `);
    };

    window.createTraining = async function(projectId) {
        const body = { 
            employee_name: document.getElementById('tr-name').value, 
            training_name: document.getElementById('tr-training').value, 
            status: document.getElementById('tr-status').value, 
            score: +document.getElementById('tr-score').value || null, 
            completion_date: document.getElementById('tr-date').value || null,
            evidence_file: document.getElementById('tr-evidence').value || null
        };
        if (!body.employee_name || !body.training_name) return;
        await api('POST', `/api/v1/projects/${projectId}/training`, body);
        forceCloseModal(); render();
    };

    window.openEditTrainingModal = function(id) {
        const r = S.training.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Treinamento</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Colaborador</label><input class="form-input" id="tr-e-name" value="${escapeHTML(r.employee_name||'')}"></div>
            <div class="form-group"><label class="form-label">Treinamento</label><input class="form-input" id="tr-e-training" value="${escapeHTML(r.training_name||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="tr-e-status">${['Pending','Completed','Expired'].map(o => `<option ${o===r.status?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Score (%)</label><input class="form-input" id="tr-e-score" type="number" value="${r.score||''}"></div>
            </div>
            <div class="form-group"><label class="form-label">Data de Conclusão</label><input class="form-input" id="tr-e-date" type="date" value="${r.completion_date||''}"></div>
            <div class="form-group">
                <label class="form-label">Evidência / Certificado (Upload ou Link Manual)</label>
                <div style="display:flex; gap:0.5rem; align-items:center">
                    <input class="form-input" id="tr-e-evidence" style="flex:1" placeholder="Ex: Link do certificado ou upload de arquivo" value="${escapeHTML(r.evidence_file||'')}">
                    <label class="btn" style="padding:0.6rem 1rem; margin:0; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; justify-content:center; white-space:nowrap">
                        Upload
                        <input type="file" style="display:none" onchange="window.uploadTrainingEvidence(this, '${projectId}')">
                    </label>
                </div>
                <div id="tr-upload-status" style="font-size:0.7rem; color:var(--text-dim); margin-top:4px; display:none"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteTraining('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateTraining('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateTraining = async function(id) {
        const body = { 
            employee_name: document.getElementById('tr-e-name').value, 
            training_name: document.getElementById('tr-e-training').value, 
            status: document.getElementById('tr-e-status').value, 
            score: +document.getElementById('tr-e-score').value || null,
            completion_date: document.getElementById('tr-e-date').value || null,
            evidence_file: document.getElementById('tr-e-evidence').value || null
        };
        await api('PUT', `/api/v1/training/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteTraining = async function(id) {
        if (confirm('Excluir este registro?')) { await api('DELETE', `/api/v1/training/${id}`); render(); }
    };

    window.openImportTrainingModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Importar Treinamentos via JSON</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">
                Cole o payload JSON de cobertura de treinamento gerado pelo seu sistema externo para realizar a importação em lote de dados.
            </p>
            <div class="form-group">
                <label class="form-label">Payload JSON</label>
                <textarea class="form-input" id="training-json-payload" style="height:150px;font-family:monospace;font-size:0.7rem;background:rgba(0,0,0,0.2)" placeholder='{
  "records": [
    {
      "employee_name": "Pessoa F",
      "training_name": "ISO 27001 Security Awareness",
      "completion_date": "2026-07-15",
      "score": 95,
      "status": "Completed"
    }
  ]
}'></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Endpoint de Integração do Webhook</label>
                <input class="form-input" style="font-family:monospace;font-size:0.65rem;background:rgba(255,255,255,0.02)" readonly value="${window.location.origin}/api/v1/projects/${projectId}/training/import-external">
            </div>
            <button class="btn btn-primary" id="btn-import-training" style="width:100%" onclick="doImportTraining('${projectId}')">Confirmar Importação</button>
        `);
    };

    window.doImportTraining = async function(projectId) {
        const payloadText = document.getElementById('training-json-payload').value.trim();
        const btn = document.getElementById('btn-import-training');
        if (!payloadText) {
            alert('Cole o JSON de entrada para importar.');
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(payloadText);
        } catch(e) {
            alert('JSON inválido: ' + e.message);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/training/import-external`, parsed);
            if (res.ok) {
                showToast(`${res.count} registros de treinamento importados com sucesso!`);
                forceCloseModal();
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha na importação: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar Importação';
        }
    };

    // ——— POLICY ACKNOWLEDGMENTS MODULE —————————————————
    async function renderAcknowledgments(c, h, a) {
        h.textContent = 'Ciencia de Politicas';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = ''; 
        
        let acks = [];
        try {
            acks = await api('GET', `/api/v1/projects/${proj.id}/policy-acknowledgments`);
        } catch(e) {
            console.error('Error loading policy acknowledgments', e);
        }
        if (!Array.isArray(acks)) acks = [];

        const totalAcks = acks.length;
        
        const policyNames = {
            'ISP': 'ISP - Politica de Seguranca da Informacao',
            'AUP': 'AUP - Termo de Uso Aceitavel',
            'ACP': 'ACP - Controle de Acesso',
            'IRP': 'IRP - Resposta a Incidentes',
            'BCP': 'BCP - Continuidade de Negocios',
            'DPP': 'DPP - Protecao de Dados',
            'CMP': 'CMP - Gestao de Mudancas',
            'SDP': 'SDP - Desenvolvimento Seguro',
            'VMP': 'VMP - Gestao de Vulnerabilidades',
            'SAP': 'SAP - Conscientizacao em Seguranca'
        };

        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const currentUserEmail = S.user ? S.user.email : '';
        const currentUserName = S.user ? S.user.name || S.user.email.split('@')[0] : '';

        const selfServiceFormHtml = `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Minha Declaracao de Ciencia</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Declare ciencia de forma eletronica sob as diretrizes vigentes das politicas do projeto.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-self-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Seu Nome</label>
                    <input class="form-input" id="ack-self-name" value="${escapeHTML(currentUserName)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <div class="form-group">
                    <label class="form-label">Seu E-mail</label>
                    <input class="form-input" id="ack-self-email" value="${escapeHTML(currentUserEmail)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <button class="btn btn-primary" style="width:100%; margin-top:0.5rem" onclick="window.submitSelfAcknowledgment('${proj.id}')">Assinar Ciencia Eletronica</button>
            </div>
        `;

        const manualFormHtml = canCrud ? `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Registrar Ciencia de Colaborador</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Registrar ciencia eletronica em nome de terceiros ou colaboradores externos.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-manual-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Nome do Colaborador</label>
                    <input class="form-input" id="ack-manual-name" placeholder="Ex: Carlos Oliveira">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail do Colaborador</label>
                    <input class="form-input" id="ack-manual-email" placeholder="Ex: carlos@empresa.com">
                </div>
                <button class="btn" style="width:100%; border-color:var(--accent); color:var(--accent); margin-top:0.5rem" onclick="window.submitManualAcknowledgment('${proj.id}')">Registrar Aceite</button>
            </div>
        ` : '';

        const historyRows = acks.length ? acks.map(a => {
            const policyTitle = policyNames[a.policy_type] || a.policy_type;
            const dateStr = a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString('pt-BR') : 'N/A';
            return `
                <tr>
                    <td style="font-weight: 500;">${escapeHTML(a.user_name)}</td>
                    <td style="color: var(--text-dim); font-size: 0.75rem;">${escapeHTML(a.user_email)}</td>
                    <td><span class="ctx-tag" style="color:var(--accent); border-color:var(--accent-glow)">${escapeHTML(policyTitle)}</span></td>
                    <td style="font-size: 0.75rem; color: var(--text-dim);">${dateStr}</td>
                    <td style="font-size: 0.7rem; font-family: monospace; color: var(--muted);">${escapeHTML(a.ip_address || 'N/A')}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">Nenhum registro de ciencia encontrado para este projeto.</td></tr>`;

        c.innerHTML = `
            <div class="fade-in">
                <div class="card" style="margin-bottom:1.5rem; display:flex; gap:2rem; align-items:center">
                    <div>
                        <div class="card-label">Assinaturas Registradas</div>
                        <div style="font-size:1.8rem; font-weight:600; color:var(--accent)">${totalAcks}</div>
                    </div>
                    <div>
                        <div class="card-label">Projeto Ativo</div>
                        <div style="font-size:1.1rem; font-weight:500">${escapeHTML(proj.project_name || proj.client_name)}</div>
                    </div>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:1.5rem; margin-bottom:2rem;">
                    ${selfServiceFormHtml}
                    ${manualFormHtml}
                </div>

                <div class="card">
                    <div class="card-label">Historico de Ciencia de Politicas</div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Colaborador</th>
                                    <th>E-mail</th>
                                    <th>Politica</th>
                                    <th>Data / Hora</th>
                                    <th>Endereco IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historyRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    window.submitSelfAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-self-policy').value;
        const name = document.getElementById('ack-self-name').value.trim();
        const email = document.getElementById('ack-self-email').value.trim();
        
        if (!policyType || !name || !email) {
            alert('Erro: Nome e E-mail de usuario logado nao identificados.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };

    window.submitManualAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-manual-policy').value;
        const name = document.getElementById('ack-manual-name').value.trim();
        const email = document.getElementById('ack-manual-email').value.trim();

        if (!name || !email) {
            alert('Por favor, preencha o nome e o e-mail do colaborador.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                document.getElementById('ack-manual-name').value = '';
                document.getElementById('ack-manual-email').value = '';
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };
 
    async function renderPoliciesDashboard(c, h, a) {
        h.textContent = 'Gestão de Políticas (A.5.1)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        a.innerHTML = '';
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando painel de políticas...</div>';
        
        try {
            const controls = await api('GET', '/api/v1/controls') || [];
            const projectControls = controls.filter(ctrl => ctrl.project_id === proj.id);
            
            const total = projectControls.length;
            const draft = projectControls.filter(ctrl => !ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const ciso = projectControls.filter(ctrl => ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const vigentes = projectControls.filter(ctrl => ctrl.ciso_approved_by && ctrl.ceo_approved_by).length;
            
            let html = `
                <div class="fade-in">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px">
                        <div class="stat-card" style="background:rgba(229,235,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500">Total de Políticas</div>
                            <div style="font-family:'Montserrat',sans-serif; font-size:1.8rem; font-weight:700; color:var(--accent); margin-top:8px">${total}</div>
                        </div>
                        <div class="stat-card" style="background:rgba(229,235,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500">Rascunho / Pendentes</div>
                            <div style="font-family:'Montserrat',sans-serif; font-size:1.8rem; font-weight:700; color:var(--danger); margin-top:8px">${draft}</div>
                        </div>
                        <div class="stat-card" style="background:rgba(229,235,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500">Aprovadas Líder SGSI</div>
                            <div style="font-family:'Montserrat',sans-serif; font-size:1.8rem; font-weight:700; color:#feca57; margin-top:8px">${ciso}</div>
                        </div>
                        <div class="stat-card" style="background:rgba(229,235,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500">Aprovadas & Vigentes</div>
                            <div style="font-family:'Montserrat',sans-serif; font-size:1.8rem; font-weight:700; color:var(--success); margin-top:8px">${vigentes}</div>
                        </div>
                    </div>
                    
                    <div class="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Controle ID</th>
                                    <th>Política / Controle</th>
                                    <th>Assinatura Líder SGSI</th>
                                    <th>Assinatura Direção</th>
                                    <th>Estágio</th>
                                    <th>Status SoA</th>
                                    <th style="width:180px; text-align:center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            projectControls.forEach(ctrl => {
                let stageText = 'Rascunho';
                let stageColor = 'var(--text-dim)';
                if (ctrl.ciso_approved_by && ctrl.ceo_approved_by) {
                    stageText = 'Vigente';
                    stageColor = 'var(--success)';
                } else if (ctrl.ciso_approved_by) {
                    stageText = 'Revisão Líder SGSI';
                    stageColor = '#feca57';
                } else if (ctrl.ceo_approved_by) {
                    stageText = 'Revisão Direção Executiva';
                    stageColor = '#ff9f43';
                }
                
                const cisoSign = ctrl.ciso_approved_by ? `<span style="color:var(--success)">✓ ${escapeHTML(ctrl.ciso_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                const ceoSign = ctrl.ceo_approved_by ? `<span style="color:var(--success)">✓ ${escapeHTML(ctrl.ceo_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                
                const statusColor = s => s === 'Compliant' ? 'var(--success)' : s === 'Partial' ? '#feca57' : 'var(--danger)';

                // Map DB ID back to formatted display ID (e.g. ctrl-a51 -> A.5.1)
                let displayId = ctrl.id || '';
                if (displayId.startsWith('ctrl-')) {
                    const clean = displayId.replace('ctrl-', '');
                    if (clean.startsWith('a')) {
                        const parts = clean.substring(1).match(/\d+/g);
                        if (parts && parts.length) {
                            const num = clean.substring(1);
                        if (num.length >= 2) {
                            const chapter = num.charAt(0);
                            const controlNum = num.substring(1);
                            displayId = `A.${chapter}.${controlNum}`;
                        } else {
                            displayId = `A.${num.charAt(0)}.0`;
                        }
                        } else {
                            displayId = clean.toUpperCase();
                        }
                    } else {
                        displayId = clean.toUpperCase();
                    }
                }

                html += `
                    <tr>
                        <td style="font-weight:600; color:var(--accent)">${escapeHTML(displayId)}</td>
                        <td>
                            <div style="font-weight:600; color:var(--text)">${escapeHTML(ctrl.title)}</div>
                            <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px">${escapeHTML(ctrl.description || '').substring(0, 80)}...</div>
                        </td>
                        <td>${cisoSign}</td>
                        <td>${ceoSign}</td>
                        <td><span class="ctx-tag" style="color:${stageColor}; border-color:${stageColor}">${stageText}</span></td>
                        <td><span class="badge" style="background:${statusColor(ctrl.status)}; color:#000; font-weight:600; padding:2px 8px; border-radius:4px">${escapeHTML(ctrl.status)}</span></td>
                        <td style="text-align:center">
                            <button onclick="window.openGeneratePolicyModal('${proj.id}', '${escapeHTML(displayId)}')" class="btn-secondary" style="padding:4px 8px; font-size:0.75rem">Visualizar / Gerar</button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            c.innerHTML = html;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar Gestão de Políticas: ${escapeHTML(e.message)}</div>`;
        }
    }

    // ——— PROJECT KNOWLEDGE (Ingestion) ———————————————
    async function renderKnowledge(c, h, a) {
        h.textContent = 'Cérebro do Projeto — Gestão de Conhecimento';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        a.innerHTML = `<button class="btn btn-primary" onclick="openIngestModal('${proj.id}')">+ Ingerir Conhecimento</button>`;
        
        let query = S.knowledgeQuery || '';
        let items = [];
        try {
            const url = query ? `/api/v1/projects/${proj.id}/knowledge/search?q=${encodeURIComponent(query)}` : `/api/v1/projects/${proj.id}/knowledge/search?q=*`;
            items = await api('GET', url);
        } catch(e) {}

        c.innerHTML = `
            <div class="fade-in">
                <div class="card" style="padding:1.5rem;margin-bottom:1.5rem">
                    <div class="form-group" style="margin-bottom:0">
                        <input class="form-input" id="k-search" placeholder="Buscar no conhecimento do projeto..." value="${query}" onkeydown="if(event.key==='Enter')searchKnowledge()">
                    </div>
                </div>
                <div id="k-results">
                    ${items.length ? items.map(item => {
                        const m = item.metadata || {};
                        return `
                        <div class="list-item">
                            <div style="flex:1">
                                <div class="item-name">${escapeHTML(m.title || item.id)}</div>
                                <div class="item-meta">${escapeHTML(m.type || 'Documento')} | ${escapeHTML(m.summary || 'Sem resumo disponível')}</div>
                                <div style="margin-top:0.5rem;display:flex;gap:0.35rem">
                                    ${(m.controls || []).map(ctrl => `<span class="ctx-tag">${ctrl}</span>`).join('')}
                                </div>
                            </div>
                            <button class="btn btn-ghost" onclick="viewKnowledge('${item.id}', '${proj.id}')">Ver</button>
                        </div>`;
                    }).join('') : '<div class="empty-state"><h3>Nenhum conhecimento mapeado</h3><p>Ingira atas de reuniões, entrevistas ou procedimentos para começar.</p></div>'}
                </div>
            </div>
        `;
    }

    function searchKnowledge() {
        const q = document.getElementById('k-search').value;
        S.knowledgeQuery = q;
        render();
    }

    function openIngestModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Ingerir Novo Conhecimento</span><button class="btn-ghost" onclick="closeModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Título do Documento / Nome da Entrevista</label>
                <input class="form-input" id="ingest-title" placeholder="Ex: Entrevista CTO - 05/07/24">
            </div>
            <div class="form-group">
                <label class="form-label">Conteúdo (Texto, Transcrição ou Notas)</label>
                <textarea class="form-input" id="ingest-content" rows="10" placeholder="Cole aqui o conteúdo do documento ou notas da reunião..."></textarea>
            </div>
            <div id="ingest-loading" style="display:none;margin-bottom:1rem;color:var(--accent);font-size:0.7rem">IA processando documento e mapeando controles...</div>
            <button class="btn btn-primary" style="width:100%" id="ingest-btn" onclick="doIngest('${projectId}')">Processar e Ingerir</button>
        `);
    }

    async function doIngest(projectId) {
        const title = document.getElementById('ingest-title').value;
        const content = document.getElementById('ingest-content').value;
        if (!title || !content) return;

        const btn = document.getElementById('ingest-btn');
        const loader = document.getElementById('ingest-loading');
        btn.disabled = true;
        loader.style.display = 'block';

        try {
            await api('POST', `/api/v1/projects/${projectId}/knowledge/ingest`, { title, content });
            showToast('Conhecimento ingerido e processado pela IA');
            closeModal();
            render();
        } catch(e) {
            showToast('Erro ao processar conhecimento', 'error');
            btn.disabled = false;
            loader.style.display = 'none';
        }
    }

    // ——— CERTIFICATION TRACKER (Sprint 8) ————————————
    async function renderCertification(c, h, a) {
        h.textContent = 'Acompanhamento de Certificacao';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        let cert = null;
        try { cert = await api('GET', `/api/v1/projects/${proj.id}/certification`); } catch(e) {}
        if (!cert || !cert.id) {
            a.innerHTML = `<button class="btn btn-primary" onclick="initCertification('${proj.id}')">Iniciar Tracker</button>`;
            c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum tracker de certificacao</h3><p>Clique em Iniciar Tracker para comecar a acompanhar o processo de certificacao.</p></div>';
            return;
        }
        a.innerHTML = '';
        const stages = ['Gap Assessment','Remediation','Internal Audit','Stage 1 Audit','Stage 2 Audit','Certified','Surveillance'];
        const si = stages.indexOf(cert.stage);
        const pct = Math.round(((si + 1) / stages.length) * 100);
        c.innerHTML = `<div class="fade-in">
            <div class="card" style="padding:2.5rem;margin-bottom:1.5rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
                    <div>
                        <div style="font-size:0.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:0.5rem">Estagio Atual</div>
                        <div style="font-size:1.8rem;font-weight:500;font-family:'Montserrat',sans-serif">${cert.stage}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:2.5rem;font-weight:300;color:var(--accent);letter-spacing:-0.05em">${pct}%</div>
                        <div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Completude</div>
                    </div>
                </div>
                <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:2rem;position:relative;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--accent), #00d2ff);border-radius:2px;transition:width(0.8s);box-shadow:0 0 15px var(--accent-dim)"></div>
                </div>
                <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
                    ${stages.map((s, i) => `<span style="font-size:0.55rem;padding:0.35rem 0.75rem;border-radius:8px;font-weight:600;letter-spacing:0.05em;background:${i <= si ? 'var(--accent-dim)' : 'var(--surface)'};border:1px solid ${i <= si ? 'var(--accent)' : 'var(--border)'};color:${i <= si ? 'var(--accent)' : 'var(--muted)'}">${s}</span>`).join('')}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria S1</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage1_date || 'TBD'}</div>
                    <div style="font-size:0.6rem;margin-top:0.25rem;color:${cert.stage1_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage1_status || 'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Auditoria S2</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.stage2_date || 'TBD'}</div>
                    <div style="font-size:0.6rem;margin-top:0.25rem;color:${cert.stage2_status==='Passed'?'var(--success)':'var(--muted)'}">${cert.stage2_status || 'Pendente'}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Registrar</div>
                    <div style="font-size:0.8rem;font-weight:500">${escapeHTML(cert.registrar || 'Não definido')}</div>
                </div>
                <div class="card" style="padding:1.25rem">
                    <div class="card-label">Target Date</div>
                    <div style="font-size:0.8rem;font-weight:500">${cert.target_date || 'Não definida'}</div>
                </div>
            </div>
            <div style="margin-top:2rem;display:flex;gap:0.75rem;align-items:center;background:rgba(255,255,255,0.02);padding:1.25rem;border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
                <div style="font-size:0.7rem;color:var(--muted);white-space:nowrap">Mudar estagio para:</div>
                <select class="form-select" id="cert-stage" style="max-width:200px;font-size:0.7rem">${stages.map(s => `<option ${s===cert.stage?'selected':''}>${s}</option>`).join('')}</select>
                <button class="btn btn-primary" onclick="updateCertStage('${cert.id}')">Atualizar</button>
            </div>
        </div>`;
    }

    async function initCertification(projectId) {
        await api('POST', `/api/v1/projects/${projectId}/certification`, { standard: 'ISO 27001:2022' });
        render();
    }

    async function updateCertStage(certId) {
        const stage = document.getElementById('cert-stage').value;
        await api('PUT', `/api/v1/certification/${certId}`, { stage });
        render();
    }

    // ——— AI COMPLIANCE ASSISTANT (Sprint 8) ——————————————
    async function renderAIChat(c, h, a) {
        h.textContent = 'AI Compliance Assistant';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        a.innerHTML = `<button class="btn" onclick="clearChatHistory('${proj.id}')">Limpar Historico</button>`;
        let history = [];
        try { history = await api('GET', `/api/v1/projects/${proj.id}/chat/history`); } catch(e) {}
        if (!Array.isArray(history)) history = [];
        c.innerHTML = `<div class="fade-in" style="display:flex;flex-direction:column;height:calc(100vh - 180px)">
            <div id="chat-messages" style="flex:1;overflow-y:auto;padding:1rem 0;display:flex;flex-direction:column;gap:0.75rem">
                ${history.length ? history.map(m => `
                    <div style="align-self:${m.role==='user'?'flex-end':'flex-start'};max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:${m.role==='user'?'var(--accent-dim)':'var(--surface)'};border:1px solid ${m.role==='user'?'var(--accent)':'var(--border)'};color:var(--text);font-size:0.8rem;line-height:1.6;white-space:pre-wrap">${escapeHTML(m.content)}</div>
                `).join('') : '<div style="text-align:center;color:var(--muted);padding:3rem 0;font-size:0.8rem">Faca uma pergunta sobre ISO 27001, controles, audit preparation ou compliance.</div>'}
            </div>
            <div style="display:flex;gap:0.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08)">
                <input class="form-input" id="chat-input" placeholder="Pergunte sobre compliance, controles ISO, audit..." style="flex:1" onkeydown="if(event.key==='Enter')sendChatMessage('${proj.id}')">
                <button class="btn btn-primary" onclick="sendChatMessage('${proj.id}')">Enviar</button>
            </div>
        </div>`;
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendChatMessage(projectId) {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;
        input.value = '';
        // Add user message to UI immediately
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML += `<div style="align-self:flex-end;max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:rgba(0,173,232,0.15);border:1px solid rgba(0,173,232,0.2);font-size:0.8rem;line-height:1.6">${escapeHTML(message)}</div>`;
        msgs.innerHTML += `<div id="chat-loading" style="align-self:flex-start;max-width:80%;padding:0.75rem 1rem;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:0.8rem;color:var(--muted)">Pensando...</div>`;
        msgs.scrollTop = msgs.scrollHeight;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/chat`, { message });
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.id = ''; loading.style.color = 'var(--text)'; loading.textContent = res.reply || 'Sem resposta.'; }
            msgs.scrollTop = msgs.scrollHeight;
        } catch(e) {
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.textContent = 'Erro: ' + e.message; loading.style.color = 'var(--danger)'; }
        }
    }

    async function clearChatHistory(projectId) {
        if (!confirm('Limpar todo o historico de chat?')) return;
        await api('DELETE', `/api/v1/projects/${projectId}/chat/history`);
        render();
    }

    // ——— ROPA MODULE (Sprint 5) ———————————————————————
    // ——— ROPA MODULE (Sprint 5) ———————————————————————
    async function renderROPA(c, h, a) {
        h.textContent = 'ROPA — Registro de Atividades de Tratamento';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewROPAModal('${proj.id}')">+ Nova Atividade</button>` : '';
        
        let records = [];
        try { records = await api('GET', `/api/v1/projects/${proj.id}/ropa`); } catch(e) {}
        if (!Array.isArray(records)) records = [];
        S.ropa = records;
        c.innerHTML = `<div class="fade-in">${records.length ? records.map(r => `
            <div class="list-item" style="cursor:pointer" onclick="window.openROPADetailsModal('${r.id}')">
                <div style="flex:1"><div class="item-name">${escapeHTML(r.processing_purpose)}</div>
                <div class="item-meta" style="margin-top:0.25rem">${escapeHTML(r.legal_basis || 'N/A')} | Sujeitos: ${escapeHTML(r.data_subjects || 'N/A')} | Retencao: ${escapeHTML(r.retention_period || 'N/A')}</div></div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    ${r.international_transfers ? '<span class="ctx-tag" style="color:var(--danger)">Transfer. Internacional</span>' : ''}
                    ${r.dpia_required ? '<span class="ctx-tag" style="color:#feca57">DPIA Requerido</span>' : ''}
                    <span class="ctx-tag ctx-tag-green">${r.status}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhum registro ROPA</h3><p>Registre atividades de tratamento de dados pessoais.</p></div>'}</div>`;
    }

    window.openROPADetailsModal = function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Atividade ROPA</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.processing_purpose || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Base Legal</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.legal_basis || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável / Owner</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.owner || 'Sem responsável')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_categories || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_subjects || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Período de Retenção</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.retention_period || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Destinatários / Compartilhamento</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.recipients || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag ctx-tag-green" style="font-weight:600">${r.status || 'Active'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPIA Requerido</div>
                        <span class="ctx-tag" style="background:${r.dpia_required ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.05)'}; color:${r.dpia_required ? '#f59e0b' : 'var(--text-dim)'}; font-weight:600">${r.dpia_required ? 'Sim' : 'Não'}</span>
                    </div>
                    ${r.international_transfers ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Transferência Internacional</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">
                            Salvaguardas: ${escapeHTML(r.transfer_safeguards || 'Sem salvaguardas especificadas')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditROPAModal('${id}')">Editar Atividade</button>` : ''}
            </div>
        `);
    };

    window.openNewROPAModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Atividade de Tratamento (ROPA)</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Finalidade do Tratamento</label><input class="form-input" id="ropa-purpose" placeholder="Ex: Folha de pagamento"></div>
            <div class="form-group"><label class="form-label">Categorias de Dados</label><input class="form-input" id="ropa-categories" placeholder="Ex: Dados pessoais, financeiros, biometria"></div>
            <div class="form-group"><label class="form-label">Titulares</label><input class="form-input" id="ropa-subjects" placeholder="Ex: Colaboradores, Clientes"></div>
            <div class="form-group"><label class="form-label">Base Legal</label>
                <select class="form-input" id="ropa-basis">
                    <option>Consentimento</option>
                    <option>Execucao contratual</option>
                    <option>Obrigacao legal</option>
                    <option>Interesse legitimo</option>
                    <option>Protecao da vida</option>
                    <option>Tutela da saude</option>
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Retencao</label><input class="form-input" id="ropa-retention" placeholder="Ex: 5 anos"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsavel</label><input class="form-input" id="ropa-owner" placeholder="Ex: DPO"></div>
            </div>
            <div class="form-group"><label class="form-label">Destinatarios / Compartilhamento</label><input class="form-input" id="ropa-recipients" placeholder="Ex: Contabilidade, INSS, Cloud Providers"></div>
            <div class="form-group"><label class="form-label">Salvaguardas de Transferência (Se aplicável)</label><input class="form-input" id="ropa-safeguards" placeholder="Ex: Standard Contractual Clauses (SCCs)"></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="ropa-status">
                    <option>Active</option>
                    <option>Inactive</option>
                </select></div>
            <div style="display:flex;gap:1rem;margin-bottom:1rem">
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-intl"> Transferencia Internacional</label>
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-dpia"> DPIA Requerido</label>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="window.createROPA('${projectId}')">Registrar</button>
        `);
    };

    window.createROPA = async function(projectId) {
        const body = { 
            processing_purpose: document.getElementById('ropa-purpose').value, 
            data_categories: document.getElementById('ropa-categories').value, 
            data_subjects: document.getElementById('ropa-subjects').value, 
            legal_basis: document.getElementById('ropa-basis').value, 
            retention_period: document.getElementById('ropa-retention').value, 
            recipients: document.getElementById('ropa-recipients').value, 
            owner: document.getElementById('ropa-owner').value, 
            transfer_safeguards: document.getElementById('ropa-safeguards').value,
            status: document.getElementById('ropa-status').value,
            international_transfers: document.getElementById('ropa-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-dpia').checked ? 1 : 0 
        };
        if (!body.processing_purpose) return;
        await api('POST', `/api/v1/projects/${projectId}/ropa`, body);
        forceCloseModal(); render();
    };

    window.openEditROPAModal = function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Atividade ROPA</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Finalidade</label><input class="form-input" id="ropa-e-purpose" value="${escapeHTML(r.processing_purpose||'')}"></div>
            <div class="form-group"><label class="form-label">Categorias de Dados</label><input class="form-input" id="ropa-e-categories" value="${escapeHTML(r.data_categories||'')}"></div>
            <div class="form-group"><label class="form-label">Titulares</label><input class="form-input" id="ropa-e-subjects" value="${escapeHTML(r.data_subjects||'')}"></div>
            <div class="form-group"><label class="form-label">Base Legal</label>
                <select class="form-input" id="ropa-e-basis">
                    ${['Consentimento','Execucao contratual','Obrigacao legal','Interesse legitimo','Protecao da vida','Tutela da saude'].map(opt => `<option ${opt===r.legal_basis?'selected':''}>${opt}</option>`).join('')}
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Retencao</label><input class="form-input" id="ropa-e-retention" value="${escapeHTML(r.retention_period||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsavel</label><input class="form-input" id="ropa-e-owner" value="${escapeHTML(r.owner||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Destinatarios / Compartilhamento</label><input class="form-input" id="ropa-e-recipients" value="${escapeHTML(r.recipients||'')}"></div>
            <div class="form-group"><label class="form-label">Salvaguardas de Transferência</label><input class="form-input" id="ropa-e-safeguards" value="${escapeHTML(r.transfer_safeguards||'')}"></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="ropa-e-status">
                    <option ${r.status==='Active'?'selected':''}>Active</option>
                    <option ${r.status==='Inactive'?'selected':''}>Inactive</option>
                </select></div>
            <div style="display:flex;gap:1rem;margin-bottom:1rem">
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-e-intl" ${r.international_transfers?'checked':''}> Transferencia Internacional</label>
                <label style="font-size:0.7rem;color:var(--muted);display:flex;align-items:center;gap:0.25rem"><input type="checkbox" id="ropa-e-dpia" ${r.dpia_required?'checked':''}> DPIA Requerido</label>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteROPA('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateROPA('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateROPA = async function(id) {
        const body = { 
            processing_purpose: document.getElementById('ropa-e-purpose').value, 
            data_categories: document.getElementById('ropa-e-categories').value, 
            data_subjects: document.getElementById('ropa-e-subjects').value, 
            legal_basis: document.getElementById('ropa-e-basis').value, 
            retention_period: document.getElementById('ropa-e-retention').value, 
            recipients: document.getElementById('ropa-e-recipients').value, 
            owner: document.getElementById('ropa-e-owner').value, 
            transfer_safeguards: document.getElementById('ropa-e-safeguards').value,
            status: document.getElementById('ropa-e-status').value,
            international_transfers: document.getElementById('ropa-e-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-e-dpia').checked ? 1 : 0 
        };
        await api('PUT', `/api/v1/ropa/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteROPA = async function(id) { 
        if (confirm('Excluir registro ROPA?')) { await api('DELETE', `/api/v1/ropa/${id}`); render(); } 
    };

    // ——— DPIA / RIPD MODULE ──────────────────────────────────────────
    async function renderDPIA(c, h, a) {
        h.textContent = 'DPIA / RIPD — Relatório de Impacto à Proteção de Dados';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewDPIAModal('${proj.id}')">+ Novo Relatório (DPIA)</button>` : '';
        
        let assessments = [];
        try { assessments = await api('GET', `/api/v1/projects/${proj.id}/dpia`); } catch(e) {}
        if (!Array.isArray(assessments)) assessments = [];
        S.dpia = assessments;
        
        const statusColor = s => s === 'Approved' ? 'var(--success)' : s === 'Under Review' ? '#feca57' : 'var(--muted)';
        
        c.innerHTML = `<div class="fade-in">${assessments.length ? assessments.map(dp => `
            <div class="list-item" style="cursor:pointer" onclick="window.openDPIADetailsModal('${dp.id}')">
                <div style="flex:1">
                    <div class="item-name" style="font-weight:600; color:var(--accent)">${escapeHTML(dp.system_name)}</div>
                    <div class="item-meta" style="margin-top:0.25rem">
                        <strong>Titulares:</strong> ${escapeHTML(dp.data_subjects_types || 'N/A')} | <strong>Categorias:</strong> ${escapeHTML(dp.personal_data_categories || 'N/A')}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="ctx-tag" style="color:${statusColor(dp.status)}; border-color:${statusColor(dp.status)}">${dp.status}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhum relatório DPIA / RIPD</h3><p>Crie avaliações de impacto à proteção de dados para sistemas críticos.</p></div>'}</div>`;
    }

    window.openDPIADetailsModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Approved' ? 'var(--success)' : s === 'Under Review' ? '#feca57' : 'var(--muted)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do DPIA / RIPD</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(dp.system_name)}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Descricao do Fluxo de Dados</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.data_flow_description || 'Sem descricao')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Tipos de Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.data_subjects_types || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados Pessoais</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.personal_data_categories || 'N/A')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Necessidade e Proporcionalidade</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.necessity_proportionality || 'Sem justificativa cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Riscos Identificados a Privacidade</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.risks_identified || 'Nenhum risco listado')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Medidas de Mitigacao e Salvaguardas</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.mitigation_measures || 'Nenhuma medida cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Parecer do DPO (Encarregado)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap; font-style:italic">${escapeHTML(dp.dpo_opinion || 'Aguardando parecer formal do DPO')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status do DPIA</div>
                        <span class="ctx-tag" style="color:${statusColor(dp.status)}; border-color:${statusColor(dp.status)}; font-weight:600">${dp.status}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditDPIAModal('${id}')">Editar Relatório</button>` : ''}
            </div>
        `);
    };

    window.openNewDPIAModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo DPIA / RIPD</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Sistema / Processo de Dados</label><input class="form-input" id="dpia-system" placeholder="Ex: CRM Salesforce, Sistema de RH Interno"></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo de Dados</label><textarea class="form-input" id="dpia-flow" placeholder="Descreva como os dados entram, circulam e saem do sistema..."></textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-subjects" placeholder="Ex: Clientes, Colaboradores"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-categories" placeholder="Ex: Nome, CPF, E-mail, Cartao"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-necessity" placeholder="Por que estes dados sao estritamente necessarios para a finalidade?"></textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados para a Privacidade</label><textarea class="form-input" id="dpia-risks" placeholder="Ex: Vazamento de dados em transito, acesso nao autorizado..."></textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação e Salvaguardas</label><textarea class="form-input" id="dpia-mitigations" placeholder="Ex: Uso de criptografia TLS/AES-256, MFA ativo, auditorias..."></textarea></div>
            <div class="form-group"><label class="form-label">Parecer DPO (Opcional)</label><textarea class="form-input" id="dpia-opinion" placeholder="Parecer inicial do encarregado..."></textarea></div>
            
            <button class="btn btn-primary" style="width:100%; margin-top:1rem" onclick="window.createDPIA('${projectId}')">Registrar DPIA</button>
        `);
    };

    window.createDPIA = async function(projectId) {
        const body = {
            system_name: document.getElementById('dpia-system').value,
            data_flow_description: document.getElementById('dpia-flow').value,
            data_subjects_types: document.getElementById('dpia-subjects').value,
            personal_data_categories: document.getElementById('dpia-categories').value,
            necessity_proportionality: document.getElementById('dpia-necessity').value,
            risks_identified: document.getElementById('dpia-risks').value,
            mitigation_measures: document.getElementById('dpia-mitigations').value,
            dpo_opinion: document.getElementById('dpia-opinion').value
        };
        if (!body.system_name) return;
        await api('POST', `/api/v1/projects/${projectId}/dpia`, body);
        forceCloseModal(); render();
    };

    window.openEditDPIAModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar DPIA / RIPD</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Nome do Sistema</label><input class="form-input" id="dpia-e-system" value="${escapeHTML(dp.system_name||'')}"></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo</label><textarea class="form-input" id="dpia-e-flow">${escapeHTML(dp.data_flow_description||'')}</textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-e-subjects" value="${escapeHTML(dp.data_subjects_types||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-e-categories" value="${escapeHTML(dp.personal_data_categories||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-e-necessity">${escapeHTML(dp.necessity_proportionality||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados</label><textarea class="form-input" id="dpia-e-risks">${escapeHTML(dp.risks_identified||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação</label><textarea class="form-input" id="dpia-e-mitigations">${escapeHTML(dp.mitigation_measures||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Parecer do DPO (Encarregado)</label><textarea class="form-input" id="dpia-e-opinion">${escapeHTML(dp.dpo_opinion||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="dpia-e-status">
                    <option value="Draft" ${dp.status==='Draft'?'selected':''}>Draft</option>
                    <option value="Under Review" ${dp.status==='Under Review'?'selected':''}>Under Review</option>
                    <option value="Approved" ${dp.status==='Approved'?'selected':''}>Approved</option>
                </select></div>

            <div style="display:flex; gap:0.5rem; justify-content:space-between; margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteDPIA('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateDPIA('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateDPIA = async function(id) {
        const body = {
            system_name: document.getElementById('dpia-e-system').value,
            data_flow_description: document.getElementById('dpia-e-flow').value,
            data_subjects_types: document.getElementById('dpia-e-subjects').value,
            personal_data_categories: document.getElementById('dpia-e-categories').value,
            necessity_proportionality: document.getElementById('dpia-e-necessity').value,
            risks_identified: document.getElementById('dpia-e-risks').value,
            mitigation_measures: document.getElementById('dpia-e-mitigations').value,
            dpo_opinion: document.getElementById('dpia-e-opinion').value,
            status: document.getElementById('dpia-e-status').value
        };
        await api('PUT', `/api/v1/dpia/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteDPIA = async function(id) {
        if (confirm('Excluir este DPIA?')) {
            await api('DELETE', `/api/v1/dpia/${id}`);
            forceCloseModal();
            render();
        }
    };

    // ——— AUDIT CALENDAR (Sprint 6) ——————————————————————
    async function renderAudits(c, h, a) {
        h.textContent = 'Calendario de Auditorias';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewAuditModal('${proj.id}')">+ Nova Auditoria</button>` : '';
        
        let audits = [];
        try { audits = await api('GET', `/api/v1/projects/${proj.id}/audits`); } catch(e) {}
        if (!Array.isArray(audits)) audits = [];
        S.audits = audits;
        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'In Progress' ? '#feca57' : 'var(--muted)';
        c.innerHTML = `<div class="fade-in">${audits.length ? audits.map(au => `
            <div class="list-item" style="cursor:pointer" onclick="window.openAuditDetailsModal('${au.id}')">
                <div style="flex:1"><div class="item-name" style="font-weight:600; color:var(--accent)">${escapeHTML(au.title)}</div>
                <div class="item-meta" style="margin-top:0.25rem">${escapeHTML(au.audit_type)} | ${escapeHTML(au.auditor_name || 'TBD')} | ${au.scheduled_date}</div></div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    ${au.findings_count ? `<span style="font-size:0.7rem;color:var(--danger);margin-right:0.5rem">${au.findings_count} achados</span>` : ''}
                    ${au.status !== 'Completed' ? `<button class="btn" style="padding:4px 8px;font-size:0.75rem;margin-right:0.5rem;border-color:var(--accent);color:var(--accent)" onclick="event.stopPropagation(); navigate('audit-execution', { activeAuditId: '${au.id}' })">Executar</button>` : ''}
                    <span class="ctx-tag" style="color:${statusColor(au.status)}">${au.status}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhuma auditoria agendada</h3></div>'}</div>`;
    }

    window.openAuditDetailsModal = function(id) {
        const au = S.audits.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'In Progress' ? '#feca57' : 'var(--muted)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Auditoria</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(au.title || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Tipo de Auditoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(au.audit_type || '')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(au.status)}; font-weight:600">${au.status || 'Planned'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Auditor / Organismo</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(au.auditor_name || 'Nao definido')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data Agendada</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${au.scheduled_date || ''}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Escopo</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">${escapeHTML(au.scope || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Nao Conformidades / Achados</div>
                        <div style="font-size:0.85rem; font-weight:600; color:${au.findings_count ? 'var(--danger)' : 'var(--text)'}">${au.findings_count || 0} achados</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data de Conclusao</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${au.completed_at ? new Date(au.completed_at).toLocaleDateString('pt-BR') : 'Nao concluida'}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Notas / Observacoes</div>
                        <div style="font-size:0.85rem; color:var(--muted); white-space:pre-wrap; margin-top:4px">${escapeHTML(au.notes || 'Nenhuma observacao registrada.')}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${au.status !== 'Completed' ? `<button class="btn btn-primary" onclick="forceCloseModal(); navigate('audit-execution', { activeAuditId: '${id}' })">Executar Auditoria</button>` : ''}
                ${canCrud ? `<button class="btn" style="border-color:var(--accent); color:var(--accent)" onclick="window.openEditAuditModal('${id}')">Editar Auditoria</button>` : ''}
            </div>
        `);
    };

    window.openNewAuditModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Auditoria</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Titulo</label><input class="form-input" id="aud-title" placeholder="Ex: Auditoria Interna Anual"></div>
            <div class="form-group"><label class="form-label">Tipo</label>
                <select class="form-input" id="aud-type"><option>Internal</option><option>External</option><option>Surveillance</option><option>Certification</option></select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Data</label><input class="form-input" id="aud-date" type="date"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Auditor</label><input class="form-input" id="aud-auditor" placeholder="Ex: BSI, SGS"></div>
            </div>
            <div class="form-group"><label class="form-label">Escopo</label><input class="form-input" id="aud-scope" placeholder="Ex: Controles A.5-A.8"></div>
            <div class="form-group"><label class="form-label">Notas / Observacoes</label><textarea class="form-input" id="aud-notes" placeholder="Detalhes adicionais..."></textarea></div>
            <button class="btn btn-primary" style="width:100%" onclick="window.createAudit('${projectId}')">Agendar</button>
        `);
    };

    window.createAudit = async function(projectId) {
        const body = { 
            title: document.getElementById('aud-title').value, 
            audit_type: document.getElementById('aud-type').value, 
            scheduled_date: document.getElementById('aud-date').value, 
            auditor_name: document.getElementById('aud-auditor').value, 
            scope: document.getElementById('aud-scope').value,
            notes: document.getElementById('aud-notes').value
        };
        if (!body.title || !body.scheduled_date) return;
        await api('POST', `/api/v1/projects/${projectId}/audits`, body);
        forceCloseModal(); render();
    };

    window.openEditAuditModal = function(id) {
        const au = S.audits.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Auditoria</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Titulo</label><input class="form-input" id="aud-e-title" value="${escapeHTML(au.title||'')}"></div>
            <div class="form-group"><label class="form-label">Tipo</label>
                <select class="form-input" id="aud-e-type">
                    ${['Internal','External','Surveillance','Certification'].map(o => `<option ${o===au.audit_type?'selected':''}>${o}</option>`).join('')}
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Data</label><input class="form-input" id="aud-e-date" type="date" value="${au.scheduled_date||''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Auditor</label><input class="form-input" id="aud-e-auditor" value="${escapeHTML(au.auditor_name||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Escopo</label><input class="form-input" id="aud-e-scope" value="${escapeHTML(au.scope||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="aud-e-status">${['Planned','Scheduled','In Progress','Completed'].map(o => `<option ${o===au.status?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Findings</label><input class="form-input" id="aud-e-findings" type="number" value="${au.findings_count||0}"></div>
            </div>
            <div class="form-group"><label class="form-label">Notas / Observacoes</label><textarea class="form-input" id="aud-e-notes">${escapeHTML(au.notes||'')}</textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteAudit('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateAudit('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateAudit = async function(id) {
        const body = { 
            title: document.getElementById('aud-e-title').value, 
            audit_type: document.getElementById('aud-e-type').value, 
            scheduled_date: document.getElementById('aud-e-date').value, 
            auditor_name: document.getElementById('aud-e-auditor').value, 
            scope: document.getElementById('aud-e-scope').value, 
            status: document.getElementById('aud-e-status').value, 
            findings_count: +document.getElementById('aud-e-findings').value,
            notes: document.getElementById('aud-e-notes').value
        };
        await api('PUT', `/api/v1/audits/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteAudit = async function(id) { 
        if (confirm('Excluir auditoria?')) { 
            await api('DELETE', `/api/v1/audits/${id}`); 
            forceCloseModal(); 
            render(); 
        } 
    };

    // ——— CAPA MODULE (Sprint 6) —————————————————————————
    // ——— CAPA MODULE (Sprint 6) —————————————————————————
    async function renderCAPA(c, h, a) {
        h.textContent = 'Acoes Corretivas (CAPA)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" onclick="openActiveProjectModal()" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" onclick="window.openNewCAPAModal('${proj.id}')">+ Nova Acao</button>` : '';
        
        let items = [];
        try { items = await api('GET', `/api/v1/projects/${proj.id}/capa`); } catch(e) {}
        if (!Array.isArray(items)) items = [];
        S.capa = items;
        
        const sevColor = s => s === 'Critical' ? 'var(--danger)' : s === 'High' ? '#ff9f43' : s === 'Medium' ? '#feca57' : 'var(--accent)';
        const statusColor = s => s === 'Closed' ? 'var(--accent)' : s === 'In Progress' ? '#feca57' : 'var(--muted)';
        
        c.innerHTML = `<div class="fade-in">${items.length ? items.map(ca => `
            <div class="list-item" style="cursor:pointer" onclick="window.openCAPADetailsModal('${ca.id}')">
                <div style="flex:1">
                    <div class="item-name" style="font-weight:600; color:var(--accent)">${escapeHTML(ca.title)}</div>
                    <div class="item-meta" style="margin-top:0.25rem">
                        <strong>Responsavel:</strong> ${escapeHTML(ca.assigned_to || 'Sem responsavel')} | <strong>Prazo:</strong> ${ca.due_date || 'N/A'}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="ctx-tag" style="color:${sevColor(ca.severity)}">${ca.severity}</span>
                    <span class="ctx-tag" style="color:${statusColor(ca.status)}">${ca.status}</span>
                </div>
            </div>`).join('') : '<div class="empty-state"><h3>Nenhuma acao corretiva</h3></div>'}</div>`;
    }

    window.openCAPADetailsModal = async function(id) {
        const ca = S.capa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const sevColor = s => s === 'Critical' ? 'var(--danger)' : s === 'High' ? '#ff9f43' : s === 'Medium' ? '#feca57' : 'var(--accent)';
        const statusColor = s => s === 'Closed' ? 'var(--accent)' : s === 'In Progress' ? '#feca57' : 'var(--muted)';
        
        let risks = [];
        let audits = [];
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch(e) {}
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch(e) {}

        const audObj = audits.find(a => a.id === ca.audit_id);
        const riskObj = risks.find(r => r.id === ca.risk_id);
        const ctrlObj = S.controls.find(c => c.id === ca.control_id);

        let associationHtml = '';
        if (audObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--accent); border-color:var(--accent-glow)">Auditoria: ${escapeHTML(audObj.title)}</span></div>`;
        if (riskObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--danger); border-color:var(--danger)">Risco: ${escapeHTML(riskObj.title || riskObj.description)}</span></div>`;
        if (ctrlObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--success); border-color:var(--success)">Controle: ${ctrlObj.id} - ${escapeHTML(ctrlObj.title)}</span></div>`;
        if (!associationHtml) associationHtml = '<span style="color:var(--text-dim); font-size:0.8rem">Nenhuma associacao</span>';

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Acao Corretiva</span>
                <button class="btn-ghost" onclick="forceCloseModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(ca.title || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:16px">
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Descricao</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(ca.description || 'Sem descricao')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Severidade</div>
                        <span class="ctx-tag" style="color:${sevColor(ca.severity)}; font-weight:600">${ca.severity || 'Low'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(ca.status)}; font-weight:600">${ca.status || 'Open'}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsavel</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ca.assigned_to || 'Sem responsavel')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Prazo de Conclusao</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${ca.due_date || 'N/A'}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Causa Raiz (Root Cause)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.root_cause || 'Nao analisada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Plano de Acao (Action Plan)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.action_plan || 'Nao definido')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Resolucao / Evidencia de Fechamento</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.resolution || 'Nenhuma resolucao cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Associacoes e Vinculos</div>
                        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px">${associationHtml}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" onclick="window.openEditCAPAModal('${id}')">Editar Acao</button>` : ''}
            </div>
        `);
    };

    window.openNewCAPAModal = async function(projectId) {
        let risks = [];
        let audits = [];
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch(e) {}
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch(e) {}
        const projectControls = S.controls.filter(ctrl => ctrl.project_id === projectId);

        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Acao Corretiva</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Titulo</label><input class="form-input" id="capa-title" placeholder="Ex: Implementar MFA em todos os sistemas"></div>
            <div class="form-group"><label class="form-label">Descricao</label><textarea class="form-input" id="capa-desc" placeholder="Detalhe a acao corretiva..."></textarea></div>
            <div class="form-group"><label class="form-label">Causa Raiz (Root Cause)</label><textarea class="form-input" id="capa-root" placeholder="Causa identificada do problema..."></textarea></div>
            <div class="form-group"><label class="form-label">Plano de Acao (Action Plan)</label><textarea class="form-input" id="capa-plan" placeholder="Passos a serem tomados..."></textarea></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Severidade</label>
                    <select class="form-input" id="capa-sev"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Prazo</label><input class="form-input" id="capa-due" type="date"></div>
            </div>
            <div class="form-group"><label class="form-label">Responsavel</label><input class="form-input" id="capa-assigned" placeholder="Ex: CISO"></div>
            
            <div class="card-label" style="margin-top:1rem;margin-bottom:0.5rem">Vinculos e Associacao</div>
            <div class="form-group">
                <label class="form-label">Auditoria Relacionada</label>
                <select class="form-input" id="capa-audit">
                    <option value="">Nenhuma</option>
                    ${audits.map(a => `<option value="${a.id}">${escapeHTML(a.title)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Risco Relacionado</label>
                <select class="form-input" id="capa-risk">
                    <option value="">Nenhuma</option>
                    ${risks.map(r => `<option value="${r.id}">${escapeHTML(r.title || r.description)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Relacionado (SoA)</label>
                <select class="form-input" id="capa-control">
                    <option value="">Nenhum</option>
                    ${projectControls.map(c => `<option value="${c.id}">${c.id} - ${escapeHTML(c.title)}</option>`).join('')}
                </select>
            </div>
            
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="window.createCAPA('${projectId}')">Registrar</button>
        `);
    };

    window.createCAPA = async function(projectId) {
        const body = { 
            title: document.getElementById('capa-title').value, 
            description: document.getElementById('capa-desc').value, 
            root_cause: document.getElementById('capa-root').value,
            action_plan: document.getElementById('capa-plan').value,
            severity: document.getElementById('capa-sev').value, 
            due_date: document.getElementById('capa-due').value || null, 
            assigned_to: document.getElementById('capa-assigned').value,
            audit_id: document.getElementById('capa-audit').value || null,
            risk_id: document.getElementById('capa-risk').value || null,
            control_id: document.getElementById('capa-control').value || null
        };
        if (!body.title) return;
        await api('POST', `/api/v1/projects/${projectId}/capa`, body);
        forceCloseModal(); render();
    };

    window.openEditCAPAModal = async function(id) {
        const ca = S.capa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        let risks = [];
        let audits = [];
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch(e) {}
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch(e) {}
        const projectControls = S.controls.filter(ctrl => ctrl.project_id === projectId);

        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Acao Corretiva</span><button class="btn-ghost" onclick="forceCloseModal()">&times;</button></div>
            <div class="form-group"><label class="form-label">Titulo</label><input class="form-input" id="capa-e-title" value="${escapeHTML(ca.title||'')}"></div>
            <div class="form-group"><label class="form-label">Descricao</label><textarea class="form-input" id="capa-e-desc">${escapeHTML(ca.description||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Causa Raiz (Root Cause)</label><textarea class="form-input" id="capa-e-root">${escapeHTML(ca.root_cause||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Plano de Acao (Action Plan)</label><textarea class="form-input" id="capa-e-plan">${escapeHTML(ca.action_plan||'')}</textarea></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Severidade</label>
                    <select class="form-input" id="capa-e-sev">
                        ${['Low','Medium','High','Critical'].map(o => `<option ${o===ca.severity?'selected':''}>${o}</option>`).join('')}
                    </select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="capa-e-status">
                        ${['Open','In Progress','Closed'].map(o => `<option ${o===ca.status?'selected':''}>${o}</option>`).join('')}
                    </select></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Prazo</label><input class="form-input" id="capa-e-due" type="date" value="${ca.due_date||''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsavel</label><input class="form-input" id="capa-e-assigned" value="${escapeHTML(ca.assigned_to||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Resolucao (Se fechada)</label><textarea class="form-input" id="capa-e-resolution">${escapeHTML(ca.resolution||'')}</textarea></div>
            
            <div class="card-label" style="margin-top:1rem;margin-bottom:0.5rem">Vinculos e Associacao</div>
            <div class="form-group">
                <label class="form-label">Auditoria Relacionada</label>
                <select class="form-input" id="capa-e-audit">
                    <option value="">Nenhuma</option>
                    ${audits.map(a => `<option value="${a.id}" ${a.id===ca.audit_id?'selected':''}>${escapeHTML(a.title)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Risco Relacionado</label>
                <select class="form-input" id="capa-e-risk">
                    <option value="">Nenhuma</option>
                    ${risks.map(r => `<option value="${r.id}" ${r.id===ca.risk_id?'selected':''}>${escapeHTML(r.title || r.description)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Relacionado (SoA)</label>
                <select class="form-input" id="capa-e-control">
                    <option value="">Nenhum</option>
                    ${projectControls.map(c => `<option value="${c.id}" ${c.id===ca.control_id?'selected':''}>${c.id} - ${escapeHTML(c.title)}</option>`).join('')}
                </select>
            </div>

            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" onclick="window.deleteCAPA('${id}')">Excluir</button>
                <button class="btn btn-primary" onclick="window.updateCAPA('${id}')">Salvar</button>
            </div>
        `);
    };

    window.updateCAPA = async function(id) {
        const body = { 
            title: document.getElementById('capa-e-title').value, 
            description: document.getElementById('capa-e-desc').value, 
            root_cause: document.getElementById('capa-e-root').value,
            action_plan: document.getElementById('capa-e-plan').value,
            severity: document.getElementById('capa-e-sev').value, 
            status: document.getElementById('capa-e-status').value, 
            assigned_to: document.getElementById('capa-e-assigned').value,
            due_date: document.getElementById('capa-e-due').value || null,
            resolution: document.getElementById('capa-e-resolution').value || null,
            audit_id: document.getElementById('capa-e-audit').value || null,
            risk_id: document.getElementById('capa-e-risk').value || null,
            control_id: document.getElementById('capa-e-control').value || null
        };
        await api('PUT', `/api/v1/capa/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteCAPA = async function(id) { 
        if (confirm('Excluir acao corretiva?')) { 
            await api('DELETE', `/api/v1/capa/${id}`); 
            forceCloseModal(); 
            render(); 
        } 
    };

    // ——— PORTFOLIO (Sprint 6) ———————————————————————————
    async function renderPortfolio(c, h, a) {
        h.textContent = 'Monitor';
        a.innerHTML = `<div class="dropdown-wrap"><button class="btn dropdown-trigger" onclick="this.nextElementSibling.classList.toggle('open')">Exportar</button><div class="dropdown-menu"><div class="dropdown-item" onclick="exportCSV('risks')">Riscos CSV</div><div class="dropdown-item" onclick="exportCSV('vendors')">Fornecedores CSV</div><div class="dropdown-item" onclick="exportCSV('training')">Treinamento CSV</div></div></div>`;
        let portfolio = [];
        try { portfolio = await api('GET', '/api/v1/portfolio'); } catch(e) {}
        if (!Array.isArray(portfolio)) portfolio = [];
        c.innerHTML = `<div class="fade-in">${portfolio.length ? portfolio.map(p => {
            const pct = p.overall_progress_pct || 0;
            const semaphore = pct > 70 ? {color:'var(--success)',label:'No prazo'} : pct > 30 ? {color:'var(--warning)',label:'Atencao'} : {color:'var(--danger)',label:'Critico'};
            return `
            <div class="list-item" style="cursor:pointer" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})">
                <div style="display:flex;align-items:center;gap:0.75rem;flex:1">
                    <div style="width:10px;height:10px;border-radius:50%;background:${semaphore.color};flex-shrink:0" title="${semaphore.label}"></div>
                    <div>
                        <div class="item-name">${escapeHTML(p.project_name || p.client_name)}</div>
                        <div class="item-meta" style="margin-top:0.25rem">${p.project_name ? escapeHTML(p.client_name) + ' · ' : ''}Fases: ${p.completed_phases}/${p.phase_count} | Riscos: ${p.risk_count} | Evidencias: ${p.evidence_count}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:80px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:${semaphore.color};border-radius:3px;transition:width 0.3s"></div>
                    </div>
                    <span style="font-size:0.7rem;color:${semaphore.color};font-weight:600">${pct}%</span>
                </div>
            </div>`;
        }).join('') : '<div class="empty-state"><h3>Nenhum projeto no portfolio</h3></div>'}</div>`;
    }

    // ——— CSV EXPORT HELPER (Sprint 7) ———————————————————
    async function renderMonitor(c, h, a) {
        h.textContent = 'Monitor de Adequação';
        a.innerHTML = ''; // Clear actions
        
        let portfolio = [];
        try { portfolio = await api('GET', '/api/v1/portfolio'); } catch(e) {}
        if (!Array.isArray(portfolio) || portfolio.length === 0) {
            c.innerHTML = '<div class="empty-state"><h3>Nenhum projeto ativo para monitorar.</h3></div>';
            return;
        }
        
        // Pega o projeto ativo atual
        const p = S.currentProject || S.activeProject || portfolio[0];
        
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            // Puxar as fases detalhadas
            const phases = await api('GET', `/api/v1/projects/${p.id}/phases`);
            
            // Desenhar os cards de métricas (Dashboard)
            const completedPhases = phases.filter(ph => ph.status === 'completed').length;
            const totalPhases = phases.length;
            const progressPct = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
            
            const metricsHtml = `
                <div class="monitor-grid fade-in">
                    <div class="monitor-card">
                        <div class="monitor-card-title">Score Geral GRC</div>
                        <div class="monitor-card-value">${progressPct}%</div>
                        <div class="progress-bar" style="margin-top:0.25rem">
                            <div class="progress-fill" style="width: ${progressPct}%"></div>
                        </div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Fases Concluídas</div>
                        <div class="monitor-card-value">${completedPhases} / ${totalPhases}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Fases da jornada de adequação</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Riscos Mapeados</div>
                        <div class="monitor-card-value">${p.risk_count || 0}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Identificados e mitigados</div>
                    </div>
                    <div class="monitor-card">
                        <div class="monitor-card-title">Evidências Coletadas</div>
                        <div class="monitor-card-value">${p.evidence_count || 0}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim)">Documentos na nuvem R2</div>
                    </div>
                </div>
            `;
            
            // 2. Definir Jornadas (agrupamento de fases)
            const JOURNEYS = [
                { name: "Jornada 1: Mobilização e Diagnóstico", subtitle: "Entrevistas, escopo e diagnóstico inicial GRC", range: [0, 6] },
                { name: "Jornada 2: Mapeamento e Riscos", subtitle: "Ativos, riscos de segurança/privacidade e SoA", range: [7, 13] },
                { name: "Jornada 3: Implementação SGSI (ISO 27001)", subtitle: "Desenho documental e implementação de controles práticos", range: [14, 20] },
                { name: "Jornada 4: Implementação SGPI (ISO 27701)", subtitle: "Programa de privacidade e conformidade de dados pessoais", range: [21, 28] },
                { name: "Jornada 5: Operação e Auditoria", subtitle: "Treinamentos, métricas, auditoria interna e revisão", range: [29, 33] },
                { name: "Jornada 6: Certificação Oficial", subtitle: "Melhoria contínua e auditoria externa estágio 1 e 2", range: [34, 40] }
            ];

            let roadmapCardsHtml = '';
            
            JOURNEYS.forEach(j => {
                const jPhases = phases.filter(ph => ph.phase_number >= j.range[0] && ph.phase_number <= j.range[1]);
                const completedCount = jPhases.filter(ph => ph.status === 'completed').length;
                const totalCount = jPhases.length;
                const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                roadmapCardsHtml += `
                    <div class="roadmap-j-card">
                        <div class="roadmap-j-header">
                            <div>
                                <div class="roadmap-j-name">${escapeHTML(j.name)}</div>
                                <div class="roadmap-j-desc">${escapeHTML(j.subtitle)}</div>
                            </div>
                            <div class="roadmap-j-pct">${percent}%</div>
                        </div>
                        <div class="progress-bar" style="height:4px">
                            <div class="progress-fill" style="width: ${percent}%"></div>
                        </div>
                        <div class="roadmap-nodes-row">
                            ${jPhases.map(ph => `
                                <div class="roadmap-node ${ph.status}" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})">
                                    ${ph.phase_number}
                                    <div class="tooltip">
                                        <strong>Fase ${ph.phase_number}:</strong> ${escapeHTML(ph.title)}
                                        <br>Status: <span style="text-transform: capitalize">${ph.status}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            
            c.innerHTML = `
                <div class="fade-in">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
                        <div>
                            <div style="font-size:0.75rem; color:var(--text-dim)">Dashboard de Acompanhamento</div>
                            <h2 style="font-family:'Montserrat'; font-weight:500; font-size:1.4rem; margin-top:0.25rem">Projeto: ${escapeHTML(p.project_name || p.client_name)}</h2>
                        </div>
                        <div style="display:flex; gap:0.5rem">
                            <button class="btn" onclick="exportCSV('risks')" style="font-size:0.7rem; padding:0.4rem 0.8rem">Exportar Riscos</button>
                            <button class="btn" onclick="navigate('project-detail', {currentProject: {id:'${p.id}'}})" style="background:var(--accent); color:#000; font-size:0.7rem; padding:0.4rem 0.8rem">Gerenciar Fases</button>
                        </div>
                    </div>
                    
                    ${metricsHtml}
                    
                    <div class="roadmap-container fade-in">
                        <div class="roadmap-title">Roadmap de Adequação — Trilha de Conformidade</div>
                        <div class="roadmap-grid">
                            ${roadmapCardsHtml}
                        </div>
                    </div>
                </div>
            `;
            
        } catch (e) {
            c.innerHTML = `<div class="error">Erro ao carregar monitoramento do projeto: ${e.message}</div>`;
        }
    }

    // ponytail: stubs for functions referenced in HTML but never implemented
    function openProfileModal() {
        var u = S.user || {};
        openModal('<div style="padding:1.5rem"><h3 style="font-family:Montserrat;margin-bottom:1rem">' + escapeHTML(u.name || 'Usuario') + '</h3><p style="color:var(--text-dim);font-size:0.8rem">' + escapeHTML(u.email || '') + '</p><p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.5rem">Role: ' + escapeHTML(u.role || 'consultor') + '</p><button class="btn" onclick="forceCloseModal()" style="margin-top:1.5rem">Fechar</button></div>');
    }
    function openActiveProjectModal() {
        var p = S.activeProject;
        if (!p) { showToast('Nenhum projeto ativo'); return; }
        navigate('project-detail', { currentProject: p });
    }
    function updateContextPanel() {
        // ponytail: no-op stub
    }

    async function exportCSV(type) {
        const proj = S.activeProject || S.projects[0];
        if (!proj) { alert('Selecione um projeto primeiro'); return; }
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${proj.id}/export/${type}`, { headers });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${type}-${proj.id}.csv`; a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    // ——— EXECUTIVE REPORT (Sprint 6) ————————————————————
    async function downloadExecutiveReport(projectId) {
        try {
            const data = await api('GET', `/api/v1/projects/${projectId}/executive-report`);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `executive-report-${projectId}.json`; a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    // ——— GAP ANALYSIS (Sprint 5) ————————————————————————
    async function showGapAnalysis(projectId) {
        try {
            const data = await api('GET', `/api/v1/projects/${projectId}/gap-analysis`);
            const pct = data.coverage_pct || 0;
            const barColor = pct > 80 ? 'var(--accent)' : pct > 50 ? '#feca57' : 'var(--danger)';
            openModal(`
                <div class="modal-header"><span class="modal-title">Gap Analysis</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
                <div style="display:flex;gap:2rem;margin-bottom:1.5rem">
                    <div><div class="card-label">Cobertura</div><div style="font-size:2rem;font-weight:600;color:${barColor}">${pct.toFixed(0)}%</div></div>
                    <div><div class="card-label">Implementados</div><div style="font-size:1.2rem">${data.by_status?.Implemented || 0}</div></div>
                    <div><div class="card-label">Parciais</div><div style="font-size:1.2rem;color:#feca57">${data.by_status?.Partial || 0}</div></div>
                    <div><div class="card-label">Missing</div><div style="font-size:1.2rem;color:var(--danger)">${data.by_status?.Missing || 0}</div></div>
                </div>
                <div style="font-size:0.7rem;color:var(--muted)">Controles com evidencia: ${data.controls_with_evidence || 0} | Controles com risco vinculado: ${data.controls_with_risks || 0}</div>
            `);
        } catch(e) { alert('Erro: ' + e.message); }
    }

    // ——— BULK POLICY GENERATION —————————————————————————
    async function bulkGeneratePolicies(projectId) {
        const controls = prompt('Controles ISO (separados por virgula):\nEx: A.5.1,A.5.2,A.5.3,A.5.4,A.5.8', 'A.5.1,A.5.2,A.5.3,A.5.4,A.5.8,A.5.9,A.5.10');
        if (!controls) return;
        const control_ids = controls.split(',').map(s => s.trim()).filter(Boolean);
        if (!control_ids.length) return;
        const msg = `Gerar ${control_ids.length} politicas via AI? Isso pode levar alguns minutos.`;
        if (!confirm(msg)) return;

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-policies-bulk`, { control_ids });
            if (res.ok) {
                alert(`Bulk Policy Completo!\n\nTotal: ${res.total}\nSucesso: ${res.successful}\nFalhas: ${res.failed}`);
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

    // ——— ISO 27701 MIGRATION ————————————————————————————
    async function migrate27701(projectId) {
        if (!confirm('Migrar SoA para ISO 27701 (PIMS)?\nIsso adicionara controles de privacidade ao sistema.')) return;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/migrate-27701`);
            if (res.ok) {
                alert(`Migracao 27701 Completa!\n\nGaps identificados: ${res.gaps?.length || 0}\nNovos controles: ${res.new_controls_created}\nTransformacao: ${(res.transformation_ratio * 100).toFixed(0)}%`);
                await loadControls();
                render();
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

    // ——— EVIDENCE UPLOAD ————————————————————————————————
    function openEvidenceUploadModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Upload de Evidencia</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Controle ISO (opcional)</label>
                <input class="form-input" id="ev-control-id" placeholder="Ex: A.5.1, A.8.25">
            </div>
            <div class="form-group">
                <label class="form-label">Arquivo</label>
                <input type="file" id="ev-file" class="form-input" style="padding:0.5rem">
            </div>
            <div id="ev-msg" style="font-size:0.7rem;margin-bottom:0.75rem;color:var(--muted)">Formatos aceitos: PDF, DOCX, XLSX, imagens, logs</div>
            <button class="btn btn-primary" id="btn-ev-upload" style="width:100%" onclick="doEvidenceUpload('${projectId}')">Enviar Evidencia</button>
        `);
    }

    async function doEvidenceUpload(projectId) {
        const fileInput = document.getElementById('ev-file');
        const controlId = document.getElementById('ev-control-id').value;
        const msg = document.getElementById('ev-msg');
        const btn = document.getElementById('btn-ev-upload');
        if (!fileInput.files.length) { msg.style.color = 'var(--danger)'; msg.textContent = 'Selecione um arquivo'; return; }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (controlId) formData.append('control_id', controlId);

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Calculando SHA-256 e enviando para R2...';

        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/evidence/upload`, { method: 'POST', headers, body: formData });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Erro');
            msg.style.color = 'var(--accent)';
            msg.textContent = `Evidencia enviada: ${data.file_name} (SHA-256: ${data.file_hash.substring(0,16)}...)`;
            btn.textContent = 'Enviar outra';
            btn.disabled = false;
            fileInput.value = '';
        } catch(e) {
            msg.style.color = 'var(--danger)';
            msg.textContent = `Erro: ${e.message}`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    // ——— SOA GENERATOR ——————————————————————————————————
    async function generateSoA(projectId) {
        if (!confirm('Gerar Statement of Applicability automatico? Isso criara controles no banco de dados.')) return;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-soa`);
            if (res.ok) {
                alert(`SoA Gerado!\n\nTotal: ${res.total} controles avaliados\nAplicaveis: ${res.applicable}\nNao aplicaveis: ${res.not_applicable}\nNovos controles criados: ${res.new_controls_created}`);
                await loadControls();
                render();
            }
        } catch(e) { alert('Erro ao gerar SoA: ' + e.message); }
    }

    // ——— AUDIT PACK DOWNLOAD ————————————————————————————
    async function downloadAuditPack(projectId) {
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/audit-pack`, { headers });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-pack-${projectId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) { alert('Erro ao baixar audit pack: ' + e.message); }
    }

    // ——— CLIENT INVITATION ———————————————————————————————
    function openInviteClientModal(projectId) {
        const tempPassword = 'Niso@' + Math.floor(Math.random() * 9000 + 1000);
        openModal(`
            <div class="modal-header"><span class="modal-title">Convidar Cliente</span><button class="btn-ghost" onclick="forceCloseModal()">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Nome do Cliente</label>
                <input class="form-input" id="invite-name" placeholder="Ex: João Silva">
            </div>
            <div class="form-group">
                <label class="form-label">Email de Acesso</label>
                <input class="form-input" id="invite-email" type="email" placeholder="cliente@empresa.com.br">
            </div>
            <div class="form-group">
                <label class="form-label">Senha Inicial</label>
                <input class="form-input" id="invite-password" type="text" value="${tempPassword}">
            </div>
            <p style="font-size:0.7rem;color:var(--muted);margin-bottom:1rem">O cliente terá acesso exclusivo ao portal do projeto vinculado.</p>
            <button class="btn btn-primary" id="btn-do-invite" style="width:100%" onclick="doInviteClient('${projectId}')">Criar Acesso</button>
            <div id="invite-result" style="margin-top:1rem;font-size:0.8rem"></div>
        `);
    }

    async function doInviteClient(projectId) {
        const name = document.getElementById('invite-name').value;
        const email = document.getElementById('invite-email').value;
        const password = document.getElementById('invite-password').value;
        const result = document.getElementById('invite-result');
        const btn = document.getElementById('btn-do-invite');

        if (!name || !email || !password) {
            result.style.color = 'var(--danger)';
            result.textContent = 'Preencha todos os campos.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Criando...';

        try {
            const res = await api('POST', '/api/v1/users', {
                name,
                email,
                password,
                role: 'client',
                client_project_id: projectId
            });
            result.style.color = 'var(--accent)';
            result.textContent = `Acesso criado com sucesso para ${email}!`;
            btn.textContent = 'Criar outro';
            btn.disabled = false;
        } catch (e) {
            result.style.color = 'var(--danger)';
            result.textContent = 'Erro: ' + e.message;
            btn.disabled = false;
            btn.textContent = 'Tentar novamente';
        }
    }

    // ——— GESTÃO DE USUÁRIOS (RBAC) ———————————————————————
    async function renderUsers(c, h, a) {
        h.textContent = 'Gestão de Usuários';
        a.innerHTML = `<button class="btn btn-primary" onclick="openUserModal()">+ Novo Usuário</button>`;
        c.innerHTML = '<div class="loading"></div>';
        try {
            const users = await api('GET', '/api/v1/users');
            if (!S.projects || S.projects.length === 0) {
                await loadProjects();
            }
            const projMap = {};
            (S.projects || []).forEach(p => {
                projMap[p.id] = p.project_name || p.client_name;
            });

            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Papel</th>
                                <th>Projeto Associado</th>
                                <th style="text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.isArray(users) ? users.map(u => {
                                const projectName = u.client_project_id ? (projMap[u.client_project_id] || u.client_project_id) : '—';
                                const roleLabel = u.role === 'platform_admin' ? 'Admin Plataforma' : 
                                                  u.role === 'consultant' || u.role === 'consultor' ? 'Consultor' :
                                                  u.role === 'org_admin' ? 'Gestor Cliente' : 
                                                  u.role === 'org_user' ? 'Colaborador Cliente' : u.role;
                                return `
                                <tr>
                                    <td style="font-weight:500">${escapeHTML(u.name)}</td>
                                    <td>${escapeHTML(u.email)}</td>
                                    <td><span class="status-badge" style="text-transform: capitalize">${escapeHTML(roleLabel)}</span></td>
                                    <td>${escapeHTML(projectName)}</td>
                                    <td style="text-align:right">
                                        <button class="btn" style="padding:0.25rem 0.6rem; font-size:0.7rem; margin-right: 0.25rem" onclick="openUserModal('${u.id}')">Editar</button>
                                        <button class="btn" style="padding:0.25rem 0.6rem; font-size:0.7rem; color:var(--danger)" onclick="deleteUser('${u.id}')">Excluir</button>
                                    </td>
                                </tr>`;
                            }).join('') : '<tr><td colspan="5">Nenhum usuário encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar usuários: ' + escapeHTML(e.message) + '</div>';
        }
    }

    async function deleteUser(id) {
        if (!confirm('Deseja realmente excluir este usuário permanentemente?')) return;
        try {
            await api('DELETE', `/api/v1/users/${id}`);
            showToast('Usuário excluído com sucesso');
            render();
        } catch (e) {
            showToast('Erro ao excluir usuário: ' + e.message, 'error');
        }
    }

    async function openUserModal(userId) {
        let user = null;
        if (userId) {
            try {
                const users = await api('GET', '/api/v1/users');
                user = users.find(u => u.id === userId);
            } catch(e) {
                showToast('Erro ao buscar dados do usuário', 'error');
                return;
            }
        }

        if (!S.projects || S.projects.length === 0) {
            try {
                await loadProjects();
            } catch(e) {}
        }

        const projectSelectOptions = (S.projects || []).map(p => `
            <option value="${p.id}" ${user && user.client_project_id === p.id ? 'selected' : ''}>
                ${escapeHTML(p.project_name || p.client_name)}
            </option>
        `).join('');

        const isClientRole = user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client');

        const html = `
            <div class="modal-header">
                <span class="modal-title">${user ? 'Editar Usuário' : 'Novo Usuário'}</span>
                <button class="btn-ghost" onclick="closeModal()">&times;</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:1.25rem">
                <div class="form-group">
                    <label class="form-label">Nome Completo</label>
                    <input type="text" id="user-m-name" class="form-input" value="${user ? escapeHTML(user.name) : ''}" placeholder="Ex: Roberto Silva">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail</label>
                    <input type="email" id="user-m-email" class="form-input" value="${user ? escapeHTML(user.email) : ''}" placeholder="usuario@empresa.com" ${user ? 'readonly style="opacity: 0.6"' : ''}>
                </div>
                <div class="form-group">
                    <label class="form-label">Senha ${user ? '(Deixe em branco para manter a atual)' : ''}</label>
                    <input type="password" id="user-m-password" class="form-input" placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label class="form-label">Papel (Role)</label>
                    <select id="user-m-role" class="form-input" onchange="toggleUserProjectSelect(this.value)">
                        <option value="">Selecione um papel</option>
                        <option value="platform_admin" ${user && user.role === 'platform_admin' ? 'selected' : ''}>Administrador de Plataforma</option>
                        <option value="consultant" ${user && (user.role === 'consultant' || user.role === 'consultor') ? 'selected' : ''}>Consultor</option>
                        <option value="org_admin" ${user && user.role === 'org_admin' ? 'selected' : ''}>Gestor do Cliente (CISO/CEO)</option>
                        <option value="org_user" ${user && user.role === 'org_user' ? 'selected' : ''}>Colaborador do Cliente</option>
                    </select>
                </div>
                
                <div class="form-group" id="user-m-project-group" style="display: ${isClientRole ? 'block' : 'none'}">
                    <label class="form-label">Projeto Associado</label>
                    <select id="user-m-project" class="form-input">
                        <option value="">Nenhum projeto selecionado</option>
                        ${projectSelectOptions}
                    </select>
                </div>

                <div style="display:flex; gap:1rem; margin-top:1.5rem">
                    <button class="btn btn-primary" style="flex:1" onclick="saveUser('${user ? user.id : ''}')">Salvar</button>
                    <button class="btn" style="flex:1" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        `;
        openModal(html);
    }

    window.toggleUserProjectSelect = function(role) {
        const group = document.getElementById('user-m-project-group');
        if (group) {
            if (role === 'org_admin' || role === 'org_user' || role === 'client') {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
                const projSelect = document.getElementById('user-m-project');
                if (projSelect) projSelect.value = '';
            }
        }
    };

    window.saveUser = async function(id) {
        const name = document.getElementById('user-m-name').value.trim();
        const email = document.getElementById('user-m-email').value.trim();
        const password = document.getElementById('user-m-password').value;
        const role = document.getElementById('user-m-role').value;
        const client_project_id = document.getElementById('user-m-project').value || null;

        if (!name || !email || !role) {
            showToast('Preencha os campos obrigatórios (Nome, E-mail e Papel).', 'error');
            return;
        }

        if (!id && !password) {
            showToast('A senha é obrigatória para novos usuários.', 'error');
            return;
        }

        const payload = { name, email, role, client_project_id };
        if (password) {
            payload.password = password;
        }

        try {
            if (id) {
                await api('PUT', `/api/v1/users/${id}`, payload);
                showToast('Usuário atualizado com sucesso');
            } else {
                await api('POST', '/api/v1/users', payload);
                showToast('Usuário criado com sucesso');
            }
            closeModal();
            render();
        } catch (e) {
            showToast('Erro ao salvar usuário: ' + e.message, 'error');
        }
    };

    // ——— DATA ———————————————————————————————————————————

    async function loadLeads() { try { S.leads = await api('GET', '/api/v1/leads'); } catch(e) { S.leads = []; } }
    async function loadAssessments() { try { S.assessments = await api('GET', '/api/v1/assessments'); } catch(e) { S.assessments = []; } }
    async function loadProjects() { try { S.projects = await api('GET', '/api/v1/projects'); if (typeof updateSidebarProjectSelector === 'function') { updateSidebarProjectSelector(); } } catch(e) { S.projects = []; } }
    async function loadControls() { try { S.controls = await api('GET', '/api/v1/controls'); } catch(e) { S.controls = []; } }
    async function loadDashboardStats() { try { S.stats = await api('GET', '/api/v1/dashboard/stats'); } catch(e) { S.stats = {}; } }
    async function loadAll() {
        await Promise.allSettled([loadLeads(), loadAssessments(), loadProjects(), loadControls(), loadNotifications(), loadDashboardStats()]);
        if (S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id) {
            try {
                const resA = await api('GET', '/api/v1/client/assessment');
                S.clientAssessmentId = resA.assessment_id;
            } catch(e) {}
            try {
                const resP = await api('GET', '/api/v1/client/proposal');
                S.clientProposalId = resP.proposal_id;
                S.clientProposalStatus = resP.status;
            } catch(e) {}
        }
    }

    // ——— INIT ———————————————————————————————————————————
    async function initApp() {
        // Sprint C: Check for public assessment self-service link
        const assessmentToken = new URLSearchParams(location.search).get('assessment');
        if (assessmentToken) {
            document.getElementById('login-overlay').classList.add('hidden');
            renderSelfServiceAssessment(assessmentToken);
            return;
        }

        if (!S.token) {
            document.getElementById('login-overlay').classList.remove('hidden');
            return;
        }
        document.getElementById('login-overlay').classList.add('hidden');
        await loadAll();
        updateHeaderUser();
        updateActiveProjectWidget();
        setLang(S.lang);
        navigate('dashboard');
        // ponytail: poll notifications every 60s
        setInterval(loadNotifications, 60000);
        // Close dropdowns on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-wrap')) {
                document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
            }
        });
    }

    async function renderSelfServiceAssessment(token) {
        const c = document.getElementById('content');
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.header');
        if (sidebar) sidebar.style.display = 'none';
        if (header) header.style.display = 'none';
        document.querySelector('.main').style.marginLeft = '0';

        c.innerHTML = '<div style="max-width:700px;margin:2rem auto;padding:0 1rem"><div style="text-align:center;color:var(--muted)">Carregando assessment...</div></div>';

        try {
            const r = await fetch(API_BASE + '/api/v1/public/assessment/' + encodeURIComponent(token));
            if (!r.ok) throw new Error('Link invalido ou expirado');
            const data = await r.json();
            if (data.error) throw new Error(data.error);

            // Group existing answers by block
            const existingByBlock = {};
            (data.answers || []).forEach(a => {
                if (!existingByBlock[a.block]) existingByBlock[a.block] = {};
                existingByBlock[a.block][a.question_key] = a.answer;
            });

            // ponytail: reuse ASSESSMENT_BLOCKS from the main app
            const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
            if (!blocks.length) {
                c.innerHTML = '<div style="max-width:700px;margin:2rem auto;text-align:center;color:var(--danger)">Erro: Assessment blocks not loaded.</div>';
                return;
            }

            window._ssToken = token;
            window._ssData = data;
            window._ssBlock = 0;
            window._ssAnswers = existingByBlock;

            renderSelfServiceBlock(c, blocks);
        } catch(e) {
            c.innerHTML = `<div style="max-width:700px;margin:2rem auto;text-align:center">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="color:var(--danger)">${escapeHTML(e.message)}</div>
            </div>`;
        }
    }

    function renderSelfServiceBlock(c, blocks) {
        const idx = window._ssBlock;
        const block = blocks[idx];
        if (!idx && idx !== 0 || !block) return;

        const existing = window._ssAnswers[block.block] || {};
        const total = blocks.length;

        c.innerHTML = `<div style="max-width:700px;margin:2rem auto;padding:0 1rem" class="fade-in">
            <div style="text-align:center;margin-bottom:2rem">
                <div class="logo" style="font-size:1.5rem;margin-bottom:0.5rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:0.75rem;color:var(--muted)">Assessment Self-Service para ${escapeHTML(window._ssData.client_name)}</div>
                <div style="margin-top:0.5rem;font-size:0.6rem;color:var(--muted)">Bloco ${idx + 1} de ${total}</div>
                <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:0.75rem">
                    <div style="width:${Math.round(((idx + 1) / total) * 100)}%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s"></div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem">
                <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;margin-bottom:1.25rem">${escapeHTML(block.title)}</div>
                ${block.questions.map((q, qi) => {
                    const val = existing[q.key] || '';
                    if (q.type === 'yesno') {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                <option value="yes" ${val === 'yes' ? 'selected' : ''}>Sim</option>
                                <option value="no" ${val === 'no' ? 'selected' : ''}>Nao</option>
                            </select></div>`;
                    } else if (q.type === 'select' && q.options) {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                ${q.options.map(o => `<option value="${escapeHTML(o)}" ${val === o ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
                            </select></div>`;
                    } else {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <input class="form-input ss-answer" data-key="${q.key}" value="${escapeHTML(val)}" placeholder="Sua resposta"></div>`;
                    }
                }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:1rem">
                ${idx > 0 ? '<button class="btn" onclick="ssPrev()">Anterior</button>' : '<div></div>'}
                <button class="btn btn-primary" onclick="ssNext()">${idx < total - 1 ? 'Proximo' : 'Concluir Assessment'}</button>
            </div>
        </div>`;
    }

    window.ssPrev = function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        if (window._ssBlock > 0) { window._ssBlock--; renderSelfServiceBlock(document.getElementById('content'), blocks); }
    };

    window.ssNext = async function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        const block = blocks[window._ssBlock];
        const els = document.querySelectorAll('.ss-answer');
        const answers = [];
        els.forEach(el => {
            answers.push({ question_key: el.dataset.key, question: '', answer: el.value || '', notes: '' });
        });

        // Save to existing answers map
        if (!window._ssAnswers[block.block]) window._ssAnswers[block.block] = {};
        answers.forEach(a => { window._ssAnswers[block.block][a.question_key] = a.answer; });

        // Save to API
        try {
            await fetch(API_BASE + '/api/v1/public/assessment/' + window._ssToken + '/answers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block: block.block, answers })
            });
        } catch(e) {}

        if (window._ssBlock < blocks.length - 1) {
            window._ssBlock++;
            renderSelfServiceBlock(document.getElementById('content'), blocks);
        } else {
            document.getElementById('content').innerHTML = `<div style="max-width:700px;margin:3rem auto;text-align:center" class="fade-in">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:1.2rem;font-weight:500;color:var(--success);margin-bottom:0.5rem">Assessment Concluido!</div>
                <div style="color:var(--muted);font-size:0.75rem">Obrigado por completar o assessment. Seu consultor entrara em contato com os proximos passos.</div>
            </div>`;
        }
    };

    // a11y: Escape closes modal
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') forceCloseModal(); });
    // a11y: make onclick divs keyboard-accessible
    new MutationObserver(function() {
        document.querySelectorAll('[onclick]').forEach(function(el) {
            if (!['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
                if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
                if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
                if (!el._a11yKey) {
                    el._a11yKey = true;
                    el.addEventListener('keydown', function(e) {
                        // ponytail: skip if typing inside form fields
                        var tag = (e.target||{}).tagName;
                        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                        if (e.key === 'Enter' || e.key === ' ') { el.click(); e.preventDefault(); }
                    });
                }
            }
        });
    }).observe(document.body, { childList: true, subtree: true });

    window.PHASE_PLAYBOOKS = {
        0: { obj: "Mobilização e Mandato (Cláusula 5.1)", guideline: "Definir o patrocinador do projeto (Executive Sponsor), formalizar a equipe de implementação e assinar a Carta de Mandato. O kick-off formaliza o comprometimento da alta direção com o SGSI." },
        1: { obj: "Entrevista Executiva (Cláusula 5.2 & 6.2)", guideline: "Conduzir reuniões com C-Level para entender o apetite de risco da organização, os objetivos estratégicos de negócio e obter inputs diretos para a elaboração da Política de Segurança da Informação." },
        2: { obj: "Entrevistas por Trilha (Cláusula 7.2)", guideline: "Realizar o mapeamento das trilhas de TI, RH, Jurídico e Operações. O objetivo é entender a rotina de cada área e coletar evidências iniciais de procedimentos já existentes." },
        3: { obj: "Definição de Escopo (Cláusula 4.3)", guideline: "Mapear de forma precisa e documentada os limites físicos, organizacionais e tecnológicos do SGSI. Quaisquer exclusões de controles ou áreas devem ser tecnicamente justificadas no documento de escopo." },
        4: { obj: "Gap Assessment (Cláusula 6.1)", guideline: "Comparar a maturidade atual dos processos internos com os 93 controles da ISO 27001:2022. Identificar 'Quick Wins' (melhorias rápidas e de baixo custo) para iniciar a adequação com impacto." },
        5: { obj: "Governança e Papéis (Cláusula 5.3)", guideline: "Nomear formalmente os papéis-chave do SGSI, como o DPO (Encarregado) e o CISO (Responsável por Segurança). Criar e publicar a Matriz RACI de responsabilidades de segurança." },
        6: { obj: "Contexto e Partes Interessadas (Cláusula 4.1 & 4.2)", guideline: "Conduzir a análise de ambiente interno e externo (SWOT) e identificar os requisitos legais (ex: LGPD, resoluções ANPD) e contratuais com clientes e parceiros." },
        7: { obj: "Inventário de Ativos e Dados (Controle A.5.9)", guideline: "Listar e classificar todos os ativos de informação, softwares, hardwares e dados pessoais (RoPA). Atribuir owners (proprietários) para cada ativo do SGSI/SGPI." },
        8: { obj: "Mapeamento de Processos", guideline: "Desenhar os principais fluxos de dados e processos de negócio, documentando como a informação entra, é processada e sai da organização, identificando pontos críticos de risco." },
        9: { obj: "Riscos de Segurança (Cláusula 6.1.2)", guideline: "Identificar ameaças e vulnerabilidades para cada ativo do inventário. Calcular o risco bruto usando a metodologia impacto × probabilidade e mapear os controles mitigadores do Anexo A." },
        10: { obj: "Riscos de Privacidade (ISO 27701)", guideline: "Avaliar os riscos relacionados à privacidade dos dados de titulares (PII). Conduzir DPIA/RIPD para os fluxos identificados como de alto risco para os direitos dos titulares." },
        11: { obj: "Tratamento de Riscos (Cláusula 6.1.3)", guideline: "Definir a opção de tratamento (Evitar, Transferir, Aceitar ou Mitigar) para cada risco. Elaborar o Plano de Tratamento de Riscos (RTP) com cronogramas e responsáveis." },
        12: { obj: "SoA do SGSI (Cláusula 6.1.3d)", guideline: "Elaborar a Declaração de Aplicabilidade (SoA) para os 93 controles da ISO 27001:2022. Todo controle excluído deve possuir uma justificativa robusta aprovada pela direção." },
        13: { obj: "SoA do SGPI (ISO 27701)", guideline: "Mapear e justificar a aplicabilidade dos controles adicionais de privacidade da ISO 27701 (Anexos A e B), gerando o Statement of Applicability específico para dados pessoais." },
        14: { obj: "Arquitetura Documental (Cláusula 7.5)", guideline: "Estruturar o padrão de nomenclatura, versionamento e templates oficiais de políticas e procedimentos do SGSI, criando a Lista Mestra de Documentos." },
        15: { obj: "Controles Organizacionais (Anexo A.5)", guideline: "Redigir e publicar as políticas organizacionais de SI. Implementar processos de gestão de acessos e monitoramento de ativos organizacionais de SI." },
        16: { obj: "Controles de Pessoas (Anexo A.6)", guideline: "Implementar background check no onboarding de novos funcionários, termos de confidencialidade (NDA) obrigatórios e processos de desligamento seguro (offboarding)." },
        17: { obj: "Controles Físicos (Anexo A.7)", guideline: "Definir perímetros físicos de segurança, controles de acesso de visitantes (biometria/crachá), monitoramento por CFTV e procedimentos de descarte de mídia física." },
        18: { obj: "Controles Tecnológicos (Anexo A.8)", guideline: "Implementar criptografia de dados (trânsito/repouso), antivírus/EDR corporativo, gerenciamento de patches e centralização de logs para auditoria de segurança." },
        19: { obj: "Desenvolvimento Seguro (Controle A.8.25)", guideline: "Criar a Política de Desenvolvimento Seguro (SSDLC). Configurar code reviews obrigatórios e integrar scanners de código estático (SAST) na esteira CI/CD." },
        20: { obj: "Cloud, DevOps e SRE (Controle A.5.23)", guideline: "Garantir a segurança dos serviços em nuvem AWS. Configurar o princípio de menor privilégio no IAM e ativar alarmes de monitoramento no CloudTrail." },
        21: { obj: "Programa de Privacidade (ISO 27701)", guideline: "Estruturar o programa corporativo de privacidade de dados pessoais, nomeando formalmente o DPO e atualizando o inventário de processos de tratamento (RoPA)." },
        22: { obj: "Privacy by Design (ISO 27701)", guideline: "Integrar requisitos de privacidade desde a concepção de novos produtos ou sistemas. Garantir a minimização de dados pessoais coletados." },
        23: { obj: "Direitos dos Titulares (ISO 27701)", guideline: "Criar e divulgar o canal oficial para titulares exercerem seus direitos (confirmação, acesso, exclusão). Definir o SLA de resposta legal." },
        24: { obj: "Consentimento e Bases Legais (ISO 27701)", guideline: "Mapear as bases legais de todas as operações de tratamento. Implementar cookie banner e fluxos de consentimento revogáveis e transparentes." },
        25: { obj: "Retenção e Descarte (Controle A.8.10)", guideline: "Elaborar a Tabela de Temporalidade de dados. Implementar rotinas (manuais ou automatizadas) para descarte seguro e definitivo de informações expiradas." },
        26: { obj: "Transferências e Compartilhamento", guideline: "Mapear compartilhamentos com terceiros e transferências internacionais de dados, exigindo cláusulas contratuais padrão (SCCs) adequadas." },
        27: { obj: "Fornecedores e Operadores (Controle A.5.19)", guideline: "Auditar a postura de segurança e privacidade dos fornecedores críticos. Exigir e assinar acordos de tratamento de dados (DPAs) com fornecedores." },
        28: { obj: "Incidentes (Controles A.5.24 a A.5.28)", guideline: "Formalizar o plano de resposta a incidentes. Definir severidade, canais de comunicação, comitê de crise (CSIRT) e o fluxo de notificação à ANPD (em até 72h)." },
        29: { obj: "Treinamento (Controle A.6.3)", guideline: "Elaborar material e aplicar treinamento anual obrigatório de segurança da informação e privacidade para 100% dos colaboradores da empresa." },
        30: { obj: "Monitoramento e Métricas (Cláusula 9.1)", guideline: "Definir indicadores-chave de performance (KPIs) do SGSI, acompanhar a eficácia dos controles e gerar relatórios periódicos para a diretoria." },
        31: { obj: "Auditoria Interna (Cláusula 9.2)", guideline: "Executar a auditoria interna do SGSI contra todos os requisitos da norma ISO 27001. Deve ser feita por profissional independente qualificado." },
        32: { obj: "Não Conformidades (Cláusula 10.1)", guideline: "Investigar as causas-raiz de quaisquer desvios encontrados na auditoria e abrir planos de Ação Corretiva (CAPAs) para eliminar recorrências." },
        33: { obj: "Análise Crítica pela Direção (Cláusula 9.3)", guideline: "Conduzir a reunião de análise crítica anual liderada pelo CEO para avaliar o desempenho do SGSI e aprovar melhorias e orçamentos." },
        34: { obj: "Readiness Review", guideline: "Revisar todos os entregáveis do SGSI antes da contratação da certificadora. Verificar se todas as políticas e evidências mínimas estão disponíveis." },
        35: { obj: "Preparação Stage 1", guideline: "Organizar e compilar a documentação do SGSI (Escopo, Política, SoA e BCP) para envio ao auditor externo da certificadora." },
        36: { obj: "Correções Pós-Stage 1", guideline: "Tratar quaisquer apontamentos ou não conformidades levantadas pelo auditor na auditoria documental de Estágio 1." },
        37: { obj: "Gestão de Vulnerabilidades", guideline: "Verificar se as varreduras de vulnerabilidades operacionais estão ativas e se os relatórios estão limpos para a auditoria de Estágio 2." },
        38: { obj: "Continuidade de Negócios (Controle A.5.30)", guideline: "Revisar os planos de continuidade (BCP/DRP) e garantir que testes práticos de backup e restore foram executados e documentados com sucesso." },
        39: { obj: "Segurança Física", guideline: "Fazer uma varredura nas dependências físicas do escritório para garantir a conformidade prática com a política de Mesa Limpa e Tela Limpa." },
        40: { obj: "Encerramento do Ciclo", guideline: "Preparar a equipe e os principais owners de controles para as entrevistas presença/remota da auditoria externa de Estágio 2." }
    };

    window.saveChecklistItemMetadata = function(projectId, phaseNum, itemId) {
        const key = projectId + '_' + itemId;
        const isChecked = S.phaseChecks[key] === true;
        
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const k in S.phaseChecks) {
                if (k.startsWith(projectId + '_')) {
                    const id = k.replace(projectId + '_', '');
                    const match = id.match(/^p(\d+)_/);
                    if (match) {
                        items.push({
                            phase_number: parseInt(match[1]),
                            item_id: id,
                            is_checked: !!S.phaseChecks[k],
                            notes: S.phaseChecksNotes[k] || null,
                            assigned_to: S.phaseChecksAssigned[k] || null,
                            due_date: S.phaseChecksDueDate[k] || null
                        });
                    }
                }
            }
            if (!items.some(i => i.item_id === itemId)) {
                items.push({
                    phase_number: phaseNum,
                    item_id: itemId,
                    is_checked: isChecked,
                    notes: S.phaseChecksNotes[key] || null,
                    assigned_to: S.phaseChecksAssigned[key] || null,
                    due_date: S.phaseChecksDueDate[key] || null
                });
            }
            if (items.length > 0) {
                try {
                    await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, { items });
                } catch(e) {
                    console.error('Error saving checklist progress metadata:', e);
                }
            }
        }, 800);
    };

    window.saveChecklistItemNotes = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemAssigned = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
        S.phaseChecksAssigned[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemDueDate = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
        S.phaseChecksDueDate[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    initApp();
    </script>