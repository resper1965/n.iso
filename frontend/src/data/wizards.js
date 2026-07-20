export     const DOC_WIZARDS = {
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

window.DOC_WIZARDS = DOC_WIZARDS;
