
export type BlockQuestion = {
  key: string;
  question: string;
  type: 'select' | 'multi' | 'text' | 'yesno';
  options?: string[];
  hint?: string;
  iso_ref?: string;
};

// ═══════════════════════════════════════════════════════════════
// BLOCK_QUESTIONS — 10 blocos, ~92 questões (versão Gold completa)
// ═══════════════════════════════════════════════════════════════
export const BLOCK_QUESTIONS: Record<number, BlockQuestion[]> = {
  1: [
    { key: 'sector', type: 'select', question: 'Setor ou tipo de negócio?', options: ['Fintech', 'Healthtech', 'Edtech', 'Legaltech', 'Insurtech', 'Govtech', 'Agritech', 'Logistics/Supply Chain', 'E-commerce/Marketplace', 'Indústria/Manufatura', 'Serviços Financeiros', 'Telecomunicações', 'Energia', 'Varejo', 'Outro'] },
    { key: 'company_type', type: 'select', question: 'Estágio da empresa?', options: ['Startup (< 3 anos)', 'Scale-up (crescimento acelerado)', 'Empresa madura', 'Grupo econômico / Holding', 'Software house / Fábrica de software', 'Consultoria de tecnologia'] },
    { key: 'countries', type: 'multi', question: 'Países de operação?', options: ['Brasil', 'EUA', 'União Europeia', 'América Latina', 'Ásia', 'Global'] },
    { key: 'headcount', type: 'select', question: 'Quantidade de colaboradores?', options: ['1–25', '26–50', '51–100', '101–250', '251–500', '501–1000', '1000+'] },
    { key: 'tech_people', type: 'select', question: 'Pessoas em tecnologia/engenharia/produto/DevOps?', options: ['1–10', '11–25', '26–50', '51–100', '101–200', '200+'] },
    { key: 'security_people', type: 'select', question: 'Pessoas em segurança/compliance/jurídico/privacidade?', options: ['Nenhuma dedicada', '1–3', '4–10', '11–20', '20+'] },
    { key: 'dpo_appointed', type: 'yesno', question: 'DPO/Encarregado formalmente nomeado?' },
    { key: 'existing_certs', type: 'multi', question: 'Certificações ou frameworks já implementados?', options: ['Nenhum', 'ISO 27001', 'ISO 9001', 'SOC 2', 'PCI DSS', 'NIST CSF', 'CIS Controls', 'LGPD (programa estruturado)', 'GDPR', 'ISO 27701', 'CMMI', 'Outro'] },
    { key: 'target_standard', type: 'select', question: 'Quais normas deseja certificar?', options: ['ISO 27001 apenas', 'ISO 27701 apenas', 'ISO 27001 + ISO 27701 (integrada)'] },
    { key: 'demand_type', type: 'multi', question: 'Tipo de demanda?', options: ['Certificação completa', 'Gap assessment / diagnóstico', 'Implementação do SGSI', 'Implementação do SGPI', 'Auditoria interna', 'Suporte ao auditor externo', 'Treinamento'] },
    { key: 'deadline', type: 'select', question: 'Prazo desejado para certificação?', options: ['3 meses (urgente)', '6 meses', '9 meses', '12 meses', 'Sem prazo definido', 'Imposto por contrato/cliente'] },
    { key: 'certification_body', type: 'select', question: 'Certificadora já escolhida?', options: ['Não', 'BSI', 'Bureau Veritas', 'DNV', 'SGS', 'TÜV', 'LRQA', 'ABNT', 'Outra'] },
    { key: 'cb_27701', type: 'select', question: 'Certificadora está apta a auditar ISO 27701?', options: ['Sim, confirmado', 'Não sabemos', 'Não se aplica', 'Precisa verificar'] },
    { key: 'budget', type: 'select', question: 'Orçamento estimado para o programa?', options: ['Até R$ 50 mil', 'R$ 50–100 mil', 'R$ 100–200 mil', 'R$ 200–500 mil', 'Acima de R$ 500 mil', 'Não definido'] },
    { key: 'proposal_deadline', type: 'select', question: 'Prazo para envio da proposta?', options: ['Esta semana', 'Próximas 2 semanas', '30 dias', 'Sem urgência'] },
  ],
  2: [
    { key: 'scope_type', type: 'select', question: 'Escopo da certificação?', options: ['Empresa inteira', 'Produto / plataforma específica', 'Unidade de negócio', 'Processo específico'] },
    { key: 'org_units', type: 'multi', question: 'Unidades organizacionais incluídas?', options: ['Engenharia', 'Produto', 'DevOps/SRE', 'Segurança', 'Jurídico', 'RH', 'Suporte/CS', 'Comercial', 'Marketing', 'Financeiro', 'Todas'] },
    { key: 'cloud_in_scope', type: 'yesno', question: 'Infraestrutura cloud está no escopo?' },
    { key: 'support_scope', type: 'yesno', question: 'Suporte ao cliente está no escopo?' },
    { key: 'dev_scope', type: 'yesno', question: 'Desenvolvimento de software está no escopo?' },
    { key: 'personal_data', type: 'select', question: 'Volume de dados pessoais tratados?', options: ['Mínimo (apenas colaboradores)', 'Moderado (clientes B2B)', 'Alto (clientes B2C, milhares)', 'Muito alto (milhões de titulares)', 'Dados sensíveis (saúde, biometria, etc.)'] },
    { key: 'data_role', type: 'select', question: 'Papel no tratamento de dados?', options: ['Controlador', 'Operador', 'Controlador + Operador', 'Controlador conjunto', 'Ainda não mapeado'] },
    { key: 'remote_work', type: 'select', question: 'Modelo de trabalho?', options: ['100% remoto', 'Híbrido', '100% presencial'] },
  ],
  3: [
    { key: 'cloud_provider', type: 'multi', question: 'Cloud provider(s)?', options: ['AWS', 'Google Cloud', 'Azure', 'Oracle Cloud', 'Cloudflare', 'DigitalOcean', 'On-premises', 'Híbrido', 'Outro'] },
    { key: 'databases', type: 'multi', question: 'Bancos de dados?', options: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQL Server', 'Elasticsearch', 'Outro'] },
    { key: 'environments', type: 'select', question: 'Ambientes segregados?', options: ['Apenas produção', 'Dev + Prod', 'Dev + Staging + Prod', 'Dev + QA + Staging + Prod'] },
    { key: 'cicd', type: 'select', question: 'Maturidade do CI/CD?', options: ['Inexistente', 'Manual / ad-hoc', 'Pipeline básico (build + test)', 'Pipeline completo (build + test + scan + deploy)', 'GitOps / deploy automatizado'] },
    { key: 'code_repo', type: 'select', question: 'Repositório de código?', options: ['GitHub', 'GitLab', 'Bitbucket', 'Azure DevOps', 'Outro'] },
    { key: 'containers', type: 'select', question: 'Uso de containers?', options: ['Não utiliza', 'Docker apenas', 'Docker + Kubernetes', 'Docker + ECS/Fargate', 'Serverless (sem containers)'] },
    { key: 'iam', type: 'select', question: 'Gestão de identidade e acesso (IAM)?', options: ['Sem IAM centralizado', 'IAM do cloud provider', 'IdP dedicado (Okta, Auth0, Azure AD)', 'SSO implementado', 'SSO + MFA obrigatório'] },
    { key: 'logging', type: 'select', question: 'Logs e monitoramento?', options: ['Sem monitoramento', 'Logs básicos (stdout)', 'Ferramenta de logs (CloudWatch, Datadog, etc.)', 'SIEM implementado', 'Observabilidade completa (logs + métricas + traces)'] },
    { key: 'backup', type: 'select', question: 'Backup implementado?', options: ['Sem backup', 'Backup manual / ocasional', 'Backup automático sem teste de restore', 'Backup automático com teste de restore', 'Backup + DR documentado e testado'] },
    { key: 'mfa', type: 'select', question: 'MFA habilitado?', options: ['Não', 'Apenas para admins', 'Para todos os acessos ao cloud', 'Para todos os sistemas (cloud + SaaS + VPN)'] },
  ],
  4: [
    { key: 'sdlc', type: 'select', question: 'Maturidade do SDLC?', options: ['Sem processo formal', 'Processo informal / ad-hoc', 'SDLC documentado sem segurança', 'Secure SDLC implementado', 'Secure SDLC + Privacy by Design'] },
    { key: 'code_review', type: 'select', question: 'Code review?', options: ['Não existe', 'Opcional / informal', 'Obrigatório (1 reviewer)', 'Obrigatório (2+ reviewers)', 'Obrigatório + checklist de segurança'] },
    { key: 'branch_protection', type: 'yesno', question: 'Branch protection configurado na main/master?' },
    { key: 'sast_sca', type: 'multi', question: 'Ferramentas de segurança no pipeline?', options: ['Nenhuma', 'SAST (análise estática)', 'SCA (dependências)', 'DAST (dinâmico)', 'Secret scanning', 'Container scanning', 'IaC scanning'] },
    { key: 'pentest', type: 'select', question: 'Pentest realizado?', options: ['Nunca', 'Uma vez (há mais de 1 ano)', 'Anualmente', 'A cada release / trimestral', 'Bug bounty ativo'] },
    { key: 'vuln_mgmt', type: 'select', question: 'Gestão de vulnerabilidades?', options: ['Inexistente', 'Ad-hoc / reativo', 'Processo definido sem SLA', 'Processo com SLA por severidade', 'Processo + métricas + dashboard'] },
    { key: 'test_data', type: 'select', question: 'Dados em ambientes de teste?', options: ['Dados reais de produção', 'Dados reais parcialmente mascarados', 'Dados sintéticos', 'Dados reais, mas não sei se tem DP'] },
    { key: 'prod_access', type: 'select', question: 'Acesso de desenvolvedores à produção?', options: ['Acesso direto livre', 'Acesso direto com aprovação', 'Acesso via bastion/jump server', 'Sem acesso direto (apenas pipeline)'] },
  ],
  5: [
    { key: 'personal_data_types', type: 'multi', question: 'Tipos de dados pessoais tratados?', options: ['Nome', 'Email', 'Telefone', 'CPF/CNPJ', 'Endereço', 'Dados financeiros', 'Dados de saúde', 'Biometria', 'Geolocalização', 'Dados de menores', 'Dados de navegação/cookies', 'Logs com IP'] },
    { key: 'sensitive_data', type: 'yesno', question: 'Trata dados pessoais sensíveis (saúde, biometria, raça, religião, opinião política)?' },
    { key: 'data_subjects', type: 'multi', question: 'Categorias de titulares?', options: ['Colaboradores', 'Clientes PF', 'Clientes PJ (representantes)', 'Usuários de plataforma', 'Candidatos (RH)', 'Visitantes do site', 'Pacientes', 'Alunos', 'Crianças/adolescentes'] },
    { key: 'legal_bases', type: 'select', question: 'Bases legais mapeadas por operação de tratamento?', options: ['Não mapeadas', 'Parcialmente mapeadas', 'Totalmente mapeadas', 'Mapeadas e documentadas no RoPA'] },
    { key: 'ropa', type: 'select', question: 'RoPA (Registro de Operações de Tratamento)?', options: ['Inexistente', 'Em construção', 'Parcial', 'Completo e atualizado'] },
    { key: 'dpia', type: 'select', question: 'DPIA/RIPD (Relatório de Impacto)?', options: ['Nunca realizado', 'Realizado uma vez', 'Realizado para operações de alto risco', 'Processo recorrente documentado'] },
    { key: 'dsr_channel', type: 'select', question: 'Canal de direitos dos titulares?', options: ['Inexistente', 'Email genérico', 'Formulário web dedicado', 'Plataforma de gestão de DSR', 'Canal + SLA + métricas'] },
    { key: 'retention', type: 'select', question: 'Política de retenção e descarte?', options: ['Inexistente', 'Informal / não documentada', 'Documentada mas não aplicada', 'Documentada e aplicada', 'Automatizada com jobs de exclusão'] },
    { key: 'intl_transfers', type: 'select', question: 'Transferências internacionais de dados?', options: ['Não há', 'Sim, para cloud US', 'Sim, para múltiplos países', 'Sim, com cláusulas contratuais', 'Não sei / não mapeado'] },
    { key: 'sub_processors', type: 'select', question: 'Subprocessadores mapeados?', options: ['Não mapeados', 'Lista parcial', 'Lista completa sem DPA', 'Lista completa com DPA', 'Gestão ativa (avaliação + DPA + monitoramento)'] },
  ],
  6: [
    { key: 'commitment', type: 'select', question: 'Comprometimento da alta direção com Segurança da Informação?', options: ['C-Level engajado ativamente', 'Apoio passivo', 'Sem engajamento'] },
    { key: 'si_policy', type: 'select', question: 'Política de Segurança da Informação?', options: ['Aprovada e comunicada', 'Em desenvolvimento', 'Inexistente'] },
    { key: 'risk_assessment', type: 'select', question: 'Avaliação de riscos de segurança?', options: ['Processo formal recorrente', 'Avaliação pontual', 'Sem avaliação formal'] },
    { key: 'mgmt_review', type: 'select', question: 'Análise crítica pela direção realizada?', options: ['Realizada periodicamente', 'Realizada ad-hoc', 'Nunca realizada'] },
    { key: 'risk_owner', type: 'select', question: 'Proprietários de risco atribuídos?', options: ['Atribuídos formalmente', 'Parcialmente atribuídos', 'Sem responsáveis'] },
    { key: 'competence_records', type: 'select', question: 'Registros de competência do time de SI?', options: ['Registros formais de competência', 'Registros parciais', 'Sem registros'] },
    { key: 'internal_comm', type: 'select', question: 'Comunicação interna sobre SI?', options: ['Canais formais definidos', 'Comunicação informal', 'Sem processo'] },
    { key: 'documented_info', type: 'select', question: 'Controle de informação documentada?', options: ['Controle de documentos formal', 'Versão informal (Google Drive, etc)', 'Sem controle'] },
  ],
  7: [
    { key: 'supplier_count', type: 'select', question: 'Quantidade de fornecedores de TI/cloud?', options: ['0–10', '11–50', '51–200', '200+'] },
    { key: 'supplier_eval', type: 'select', question: 'Avaliação de segurança de fornecedores?', options: ['Avaliação formal de segurança', 'Checklist básico', 'Sem avaliação'] },
    { key: 'dpa_contracts', type: 'select', question: 'Contratos com cláusulas de proteção de dados (DPA)?', options: ['DPA com todos', 'DPA com principais', 'Sem DPA'] },
    { key: 'sla_monitoring', type: 'select', question: 'SLAs de segurança com fornecedores?', options: ['SLAs definidos e monitorados', 'SLAs definidos sem monitoramento', 'Sem SLAs'] },
    { key: 'sub_audit', type: 'yesno', question: 'Direito de auditoria em contratos com fornecedores?' },
    { key: 'offboarding', type: 'select', question: 'Processo de desligamento de fornecedores (offboarding)?', options: ['Processo formal de desligamento', 'Informal', 'Sem processo'] },
    { key: 'cloud_shared', type: 'select', question: 'Modelo de responsabilidade compartilhada com cloud providers?', options: ['Modelo de responsabilidade compartilhada documentado', 'Conhecido mas não documentado', 'Não mapeado'] },
    { key: 'critical_suppliers', type: 'multi', question: 'Fornecedores críticos de TI?', options: ['AWS', 'Azure', 'Google Cloud', 'Salesforce', 'ServiceNow', 'GitHub', 'Slack', 'Atlassian'] },
  ],
  8: [
    { key: 'doc_repo', type: 'select', question: 'Repositório de documentos de SI?', options: ['Repositório centralizado (Confluence, SharePoint)', 'Google Drive / pasta de rede', 'Documentos espalhados', 'Sem repositório'] },
    { key: 'doc_version', type: 'select', question: 'Controle de versão de documentos?', options: ['Versionamento automático', 'Versionamento manual', 'Sem controle de versão'] },
    { key: 'doc_approval', type: 'select', question: 'Processo de aprovação de documentos?', options: ['Workflow formal de aprovação', 'Aprovação por email', 'Sem processo de aprovação'] },
    { key: 'doc_review_cycle', type: 'select', question: 'Ciclo de revisão de políticas e procedimentos?', options: ['Revisão anual programada', 'Revisão ad-hoc', 'Sem revisão'] },
    { key: 'existing_policies', type: 'multi', question: 'Políticas/procedimentos já existentes?', options: ['Política de SI', 'Política de Privacidade', 'Política de Acesso', 'Política de Backup', 'Plano de Continuidade', 'Plano de Incidentes', 'Nenhuma'] },
    { key: 'templates_used', type: 'yesno', question: 'Utiliza templates padronizados para documentos?' },
    { key: 'classification', type: 'select', question: 'Classificação da informação implementada?', options: ['Esquema de classificação implementado', 'Classificação informal', 'Sem classificação'] },
    { key: 'awareness_docs', type: 'select', question: 'Documentação de treinamento e conscientização?', options: ['Material de conscientização formal', 'Treinamentos pontuais', 'Sem material'] },
  ],
  9: [
    { key: 'timeline_expectation', type: 'select', question: 'Cronograma desejado para certificação?', options: ['3 meses (urgente)', '6 meses (padrão)', '9–12 meses (confortável)', 'Sem prazo definido'] },
    { key: 'budget_range', type: 'select', question: 'Faixa de investimento prevista?', options: ['Até R$ 30k', 'R$ 30k – R$ 60k', 'R$ 60k – R$ 100k', 'R$ 100k – R$ 200k', 'Acima de R$ 200k', 'Não definido'] },
    { key: 'internal_team', type: 'select', question: 'Equipe interna disponível para o projeto?', options: ['Time dedicado de SI (3+ pessoas)', 'Time parcial (1-2 pessoas)', 'Sem time dedicado'] },
    { key: 'sponsor', type: 'select', question: 'Sponsor executivo do projeto?', options: ['C-Level (CEO/CTO/CISO)', 'Gerência de TI', 'Sem sponsor definido'] },
    { key: 'blockers', type: 'multi', question: 'Principais bloqueadores ou riscos do projeto?', options: ['Orçamento', 'Prioridade da diretoria', 'Falta de pessoas', 'Legado tecnológico', 'Cultura organizacional', 'Compliance regulatório (prazo)', 'Nenhum'] },
    { key: 'prev_attempts', type: 'yesno', question: 'Houve tentativas anteriores de certificação?' },
    { key: 'certifier', type: 'select', question: 'Certificadora já foi escolhida?', options: ['Já escolhida', 'Em avaliação', 'Sem decisão'] },
    { key: 'parallel_projects', type: 'yesno', question: 'Há outros projetos de compliance em paralelo (SOC 2, PCI, etc)?' },
  ],
  10: [
    { key: 'endpoints_count', type: 'select', question: 'Quantidade de APIs/endpoints expostos?', options: ['1–10', '11–50', '51–200', '200+'] },
    { key: 'users_count', type: 'select', question: 'Quantidade de usuários da plataforma?', options: ['< 1.000', '1.000 – 10.000', '10.000 – 100.000', '100.000+'] },
    { key: 'data_volume', type: 'select', question: 'Volume de dados armazenados?', options: ['< 100 GB', '100 GB – 1 TB', '1 TB – 10 TB', '> 10 TB'] },
    { key: 'transactions_daily', type: 'select', question: 'Transações diárias?', options: ['< 1.000', '1.000 – 100.000', '100.000 – 1M', '> 1M'] },
    { key: 'locations', type: 'select', question: 'Localizações físicas?', options: ['1 escritório', '2–5 localizações', '6+ localizações', 'Full remote'] },
    { key: 'devices_managed', type: 'select', question: 'Dispositivos gerenciados (MDM/endpoint)?', options: ['< 50', '50 – 200', '200 – 1.000', '1.000+'] },
    { key: 'third_party_integrations', type: 'select', question: 'Integrações com terceiros?', options: ['< 5', '5 – 20', '20 – 50', '50+'] },
    { key: 'databases_count', type: 'select', question: 'Quantidade de bancos de dados?', options: ['1–3', '4–10', '11–50', '50+'] },
    { key: 'microservices', type: 'select', question: 'Quantidade de microsserviços?', options: ['< 5', '5 – 20', '20 – 50', '50+', 'Monolito'] },
    { key: 'uptime_sla', type: 'select', question: 'SLA de disponibilidade?', options: ['99.9%+ (mission critical)', '99.5% – 99.9%', '< 99.5%', 'Sem SLA definido'] },
  ],
};

// ═══════════════════════════════════════════════════════════════
// PHASE_TITLES — 41 fases da trilha de adequação ISO 27001+27701
// ═══════════════════════════════════════════════════════════════
export const PHASE_TITLES: string[] = [
  'Mobilização e Mandato', // 0
  'Entrevista Executiva', // 1
  'Entrevistas por Trilha', // 2
  'Definição de Escopo', // 3
  'Gap Assessment', // 4
  'Governança e Papéis', // 5
  'Contexto e Partes Interessadas', // 6
  'Inventário de Ativos e Dados', // 7
  'Mapeamento de Processos', // 8
  'Riscos de Segurança', // 9
  'Riscos de Privacidade', // 10
  'Tratamento de Riscos', // 11
  'SoA do SGSI', // 12
  'SoA do SGPI', // 13
  'Arquitetura Documental', // 14
  'Controles Organizacionais (A5)', // 15
  'Controles de Pessoas (A6)', // 16
  'Controles Físicos (A7)', // 17
  'Controles Tecnológicos (A8)', // 18
  'Desenvolvimento Seguro', // 19
  'Cloud, DevOps e SRE', // 20
  'Programa de Privacidade', // 21
  'Privacy by Design', // 22
  'Direitos dos Titulares', // 23
  'Consentimento e Bases Legais', // 24
  'Retenção e Descarte', // 25
  'Transferências e Compartilhamento', // 26
  'Fornecedores e Operadores', // 27
  'Incidentes', // 28
  'Treinamento', // 29
  'Monitoramento e Métricas', // 30
  'Auditoria Interna', // 31
  'Não Conformidades', // 32
  'Análise Crítica', // 33
  'Readiness Review', // 34
  'Preparação Stage 1', // 35
  'Correções Pós-Stage 1', // 36
  'Preparação Stage 2', // 37
  'Atendimento ao Auditor', // 38
  'Pós-Auditoria', // 39
  'Manutenção e Supervisão', // 40
];

// ═══════════════════════════════════════════════════════════════
// PHASE_CHECKLISTS — Checklists por fase
// ═══════════════════════════════════════════════════════════════
export const PHASE_CHECKLISTS: Record<number, { id: string; text: string; category: string; twyn_ref?: string }[]> = {
  0: [
    { id: 'p0_1', text: 'Mobilização: Nomear Sponsor e Equipe cliente', category: 'task', twyn_ref: 'cliente-MOB-01' },
    { id: 'p0_2', text: 'Kick-off: Apresentação da Metodologia cliente', category: 'task', twyn_ref: 'cliente-MOB-02' },
    { id: 'p0_3', text: 'Realizar Reunião de Kick-off', category: 'evidence' },
    { id: 'p0_4', text: 'Aprovar Cronograma Macro do Projeto', category: 'document' },
    { id: 'p0_5', text: 'Definir Canais de Comunicação Interna', category: 'task' },
  ],
  1: [
    { id: 'p1_1', text: 'Entrevista Executiva: Alinhamento de Expectativas', category: 'task', twyn_ref: 'cliente-ENT-01' },
    { id: 'p1_2', text: 'Identificar Objetivos de Negócio e Segurança', category: 'document' },
    { id: 'p1_3', text: 'Mapear Expectativas de Certificação', category: 'task' },
  ],
  2: [
    { id: 'p2_1', text: 'Conduzir Entrevistas com Gestores (TI, RH, Jurídico)', category: 'evidence' },
    { id: 'p2_2', text: 'Coletar Evidências de Práticas Atuais', category: 'evidence' },
    { id: 'p2_3', text: 'Consolidar Relatório de Entrevistas', category: 'document' },
  ],
  3: [
    { id: 'p3_1', text: 'Documentar Escopo do SGSI e SGPI (Cl 4.3)', category: 'document' },
    { id: 'p3_2', text: 'Definir Limites Físicos e Lógicos', category: 'document' },
    { id: 'p3_3', text: 'Justificar Exclusões de Controles', category: 'document' },
    { id: 'p3_4', text: 'Obter Aprovação Formal do Escopo', category: 'evidence' },
  ],
  4: [
    { id: 'p4_1', text: 'Realizar Diagnóstico de Lacunas (Gap Assessment)', category: 'task' },
    { id: 'p4_2', text: 'Gerar Relatório de Gaps Detalhado', category: 'document' },
    { id: 'p4_3', text: 'Apresentar Resultado à Diretoria', category: 'evidence' },
  ],
  5: [
    { id: 'p5_1', text: 'Definir Comitê de Segurança e Privacidade', category: 'task' },
    { id: 'p5_2', text: 'Atribuir Papéis e Responsabilidades (A.5.2)', category: 'document' },
    { id: 'p5_3', text: 'Formalizar Nomeação do DPO/Encarregado', category: 'document' },
  ],
  6: [
    { id: 'p6_1', text: 'Análise de Contexto Interno/Externo (Cl 4.1)', category: 'document' },
    { id: 'p6_2', text: 'Mapear Partes Interessadas e Requisitos (Cl 4.2)', category: 'document' },
    { id: 'p6_3', text: 'Matriz de Requisitos Legais e Regulatórios', category: 'document' },
  ],
  7: [
    { id: 'p7_1', text: 'Inventário Geral de Ativos (A.5.9)', category: 'document' },
    { id: 'p7_2', text: 'Inventário de Dados Pessoais', category: 'document' },
    { id: 'p7_3', text: 'Classificação de Ativos por Criticidade', category: 'document' },
    { id: 'p7_4', text: 'Definir Proprietários (Owners) de Ativos', category: 'task' },
  ],
  8: [
    { id: 'p8_1', text: 'Mapear Processos Críticos de Negócio', category: 'document' },
    { id: 'p8_2', text: 'Desenhar Fluxo de Dados (Data Flow)', category: 'document' },
    { id: 'p8_3', text: 'Identificar Pontos de Coleta e Descarte', category: 'task' },
  ],
  9: [
    { id: 'p9_1', text: 'Definir Metodologia de Gestão de Riscos (Cl 6.1)', category: 'document' },
    { id: 'p9_2', text: 'Realizar Workshop de Identificação de Riscos', category: 'evidence' },
    { id: 'p9_3', text: 'Consolidar Matriz de Riscos de SI', category: 'document' },
  ],
  10: [
    { id: 'p10_1', text: 'Realizar DPIA/RIPD para Processos de Alto Risco', category: 'document' },
    { id: 'p10_2', text: 'Mapear Riscos aos Direitos dos Titulares', category: 'document' },
  ],
  11: [
    { id: 'p11_1', text: 'Elaborar Plano de Tratamento de Riscos (PTR)', category: 'document' },
    { id: 'p11_2', text: 'Definir Controles de Mitigação', category: 'task' },
    { id: 'p11_3', text: 'Obter Aceite dos Riscos Residuais', category: 'evidence' },
  ],
  12: [
    { id: 'p12_1', text: 'Gerar Declaração de Aplicabilidade (SoA) SI', category: 'document' },
    { id: 'p12_2', text: 'Justificar Inclusões e Exclusões (ISO 27001)', category: 'document' },
  ],
  13: [
    { id: 'p13_1', text: 'Gerar Declaração de Aplicabilidade (SoA) PII', category: 'document' },
    { id: 'p13_2', text: 'Mapear Controles Adicionais ISO 27701', category: 'document' },
  ],
  14: [
    { id: 'p14_1', text: 'Estruturar Manual do SGSI/SGPI', category: 'document' },
    { id: 'p14_2', text: 'Definir Padrão de Codificação Documental', category: 'task' },
    { id: 'p14_3', text: 'Implementar Controle de Versão e Aprovação', category: 'evidence' },
  ],
  15: [
    { id: 'p15_1', text: 'Redigir Política Geral de SI (A.5.1)', category: 'document' },
    { id: 'p15_2', text: 'Implementar Segregação de Funções (A.5.3)', category: 'task' },
    { id: 'p15_3', text: 'Formalizar Contato com Autoridades (A.5.5)', category: 'document' },
    { id: 'p15_4', text: 'Gerir Segurança em Projetos (A.5.8)', category: 'task' },
    { id: 'p15_5', text: 'Implementar Política de Uso Aceitável (A.5.10)', category: 'document' },
    { id: 'p15_6', text: 'Definir Regras para Transferência de Info (A.5.14)', category: 'document' },
    { id: 'p15_7', text: 'Gestão de Segurança de Fornecedores (A.5.19)', category: 'document' },
    { id: 'p15_8', text: 'Plano de Resposta a Incidentes (A.5.24)', category: 'document' },
  ],
  16: [
    { id: 'p16_1', text: 'Implementar Triagem de Pessoal (A.6.1)', category: 'task' },
    { id: 'p16_2', text: 'NDAs e Termos de Responsabilidade (A.6.6)', category: 'document' },
    { id: 'p16_3', text: 'Processo de Onboarding/Offboarding (A.6.5)', category: 'task' },
  ],
  17: [
    { id: 'p17_1', text: 'Definir Perímetros e Áreas Seguras (A.7.1)', category: 'evidence' },
    { id: 'p17_2', text: 'Monitoramento de Acesso Físico (A.7.4)', category: 'evidence' },
    { id: 'p17_3', text: 'Proteção contra Ameaças Externas (A.7.5)', category: 'evidence' },
    { id: 'p17_4', text: 'Segurança de Equipamentos e Ativos (A.7.8)', category: 'evidence' },
  ],
  18: [
    { id: 'p18_1', text: 'Política de Controle de Acesso (A.8.3)', category: 'document' },
    { id: 'p18_2', text: 'Gestão de Privilégios e Senhas (A.8.2)', category: 'evidence' },
    { id: 'p18_3', text: 'Implementar Log e Monitoramento (A.8.15)', category: 'evidence' },
    { id: 'p18_4', text: 'Gestão de Vulnerabilidades Técnicas (A.8.8)', category: 'evidence' },
    { id: 'p18_5', text: 'Configurar Criptografia e Chaves (A.8.24)', category: 'evidence' },
    { id: 'p18_6', text: 'Segurança em Redes e Serviços (A.8.20)', category: 'evidence' },
  ],
  19: [
    { id: 'p19_1', text: 'Política de Desenvolvimento Seguro (A.8.25)', category: 'document' },
    { id: 'p19_2', text: 'Ciclo de Vida de Desenvolvimento (A.8.29)', category: 'task' },
    { id: 'p19_3', text: 'Testes de Segurança em Software (A.8.27)', category: 'evidence' },
  ],
  20: [
    { id: 'p20_1', text: 'Segregação de Ambientes (Dev/Prod) (A.8.31)', category: 'evidence' },
    { id: 'p20_2', text: 'Gestão de Mudanças em Infraestrutura (A.8.32)', category: 'task' },
    { id: 'p20_3', text: 'Configuração de Segurança (Hardening) (A.8.9)', category: 'evidence' },
  ],
  21: [
    { id: 'p21_1', text: 'Aprovar Política de Privacidade Externa', category: 'document' },
    { id: 'p21_2', text: 'Documentar Registro de Operações (RoPA)', category: 'document' },
    { id: 'p21_3', text: 'Definir Base Legal para cada Tratamento', category: 'document' },
  ],
  22: [
    { id: 'p22_1', text: 'Integrar PbD no Fluxo de Produto', category: 'task' },
    { id: 'p22_2', text: 'Checklist de Privacidade para Novos Projetos', category: 'document' },
    { id: 'p22_3', text: 'Implementar Minimização de Dados', category: 'evidence' },
  ],
  23: [
    { id: 'p23_1', text: 'Implementar Canal de Direitos dos Titulares', category: 'evidence' },
    { id: 'p23_2', text: 'Procedimento de Atendimento de Direitos', category: 'document' },
    { id: 'p23_3', text: 'Métricas de Tempo de Resposta (SLA)', category: 'document' },
  ],
  24: [
    { id: 'p24_1', text: 'Gestão de Consentimentos (Coleta/Revogação)', category: 'evidence' },
    { id: 'p24_2', text: 'Ajustar Termos de Uso e Contratos', category: 'document' },
  ],
  25: [
    { id: 'p25_1', text: 'Tabela de Temporalidade de Dados', category: 'document' },
    { id: 'p25_2', text: 'Política de Descarte e Anonimização', category: 'document' },
    { id: 'p25_3', text: 'Evidência de Exclusão de Dados Antigos', category: 'evidence' },
  ],
  26: [
    { id: 'p26_1', text: 'Mapear Transferências Internacionais', category: 'document' },
    { id: 'p26_2', text: 'Implementar Cláusulas Padrão (SCCs)', category: 'document' },
    { id: 'p26_3', text: 'Acordos de Compartilhamento de Dados (DSA)', category: 'document' },
  ],
  27: [
    { id: 'p27_1', text: 'Avaliar Segurança de Operadores/Terceiros', category: 'evidence' },
    { id: 'p27_2', text: 'Incluir Cláusulas de Proteção de Dados (DPA)', category: 'document' },
    { id: 'p27_3', text: 'Monitorar Desempenho de Fornecedores', category: 'task' },
  ],
  28: [
    { id: 'p28_1', text: 'Treinar Equipe de Resposta (CSIRT)', category: 'task' },
    { id: 'p28_2', text: 'Simular Incidente de Dados Pessoais', category: 'evidence' },
    { id: 'p28_3', text: 'Fluxo de Notificação à ANPD/Autoridades', category: 'document' },
  ],
  29: [
    { id: 'p29_1', text: 'Executar Treinamento Geral de SI e LGPD', category: 'evidence' },
    { id: 'p29_2', text: 'Campanha de Phishing/Engenharia Social', category: 'evidence' },
    { id: 'p29_3', text: 'Registrar Evidências de Participação', category: 'evidence' },
  ],
  30: [
    { id: 'p30_1', text: 'Definir Indicadores (KPIs/KRIs)', category: 'document' },
    { id: 'p30_2', text: 'Gerar Dashboard de Compliance', category: 'evidence' },
    { id: 'p30_3', text: 'Coletar Evidências de Monitoramento', category: 'evidence' },
  ],
  31: [
    { id: 'p31_1', text: 'Elaborar Plano de Auditoria Interna', category: 'document' },
    { id: 'p31_2', text: 'Executar Auditoria Interna SGSI/SGPI', category: 'evidence' },
    { id: 'p31_3', text: 'Emitir Relatório de Auditoria Interna', category: 'document' },
  ],
  32: [
    { id: 'p32_1', text: 'Registrar Não Conformidades (NCs)', category: 'document' },
    { id: 'p32_2', text: 'Executar Ações Corretivas', category: 'task' },
    { id: 'p32_3', text: 'Validar Eficácia das Correções', category: 'evidence' },
  ],
  33: [
    { id: 'p33_1', text: 'Preparar Inputs da Análise Crítica', category: 'document' },
    { id: 'p33_2', text: 'Realizar Reunião com Alta Direção', category: 'evidence' },
    { id: 'p33_3', text: 'Emitir Ata da Análise Crítica', category: 'document' },
  ],
  34: [
    { id: 'p34_1', text: 'Revisar Readiness Score Final', category: 'evidence' },
    { id: 'p34_2', text: 'Consolidar Pacote de Evidências', category: 'task' },
    { id: 'p34_3', text: 'Declaração de Prontidão do Consultor', category: 'document' },
  ],
  35: [
    { id: 'p35_1', text: 'Suporte na Auditoria de Stage 1', category: 'task' },
    { id: 'p35_2', text: 'Coletar Observações do Auditor Externo', category: 'evidence' },
  ],
  36: [
    { id: 'p36_1', text: 'Tratar Eventuais Lacunas do Stage 1', category: 'task' },
    { id: 'p36_2', text: 'Ajustar Documentação Conforme Feedback', category: 'document' },
  ],
  37: [
    { id: 'p37_1', text: 'Simular Entrevistas para Stage 2', category: 'task' },
    { id: 'p37_2', text: 'Organizar Sala de Auditoria e Logística', category: 'task' },
  ],
  38: [
    { id: 'p38_2', text: 'Evidências solicitadas fornecidas', category: 'evidence' },
    { id: 'p38_3', text: 'Registro de observações do auditor', category: 'document' },
    { id: 'p38_4', text: 'Encerramento formal da auditoria', category: 'evidence' },
  ],
  39: [
    { id: 'p39_1', text: 'Relatório de auditoria recebido e analisado', category: 'document' },
    { id: 'p39_2', text: 'Não conformidades menores corrigidas', category: 'evidence' },
    { id: 'p39_3', text: 'Certificado recebido', category: 'evidence' },
    { id: 'p39_4', text: 'Comunicação interna sobre certificação', category: 'task' },
  ],
  40: [
    { id: 'p40_1', text: 'Calendário de auditorias de supervisão', category: 'document' },
    { id: 'p40_2', text: 'Melhoria contínua operacional', category: 'task' },
    { id: 'p40_3', text: 'Preparação para recertificação (3 anos)', category: 'task' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// INTERVIEW_TRACKS — Entrevistas por trilha
// ═══════════════════════════════════════════════════════════════
export const INTERVIEW_TRACKS: Record<string, { key: string; question: string }[]> = {
  executiva: [
    { key: 'exec_vision', question: 'Qual a visão estratégica para segurança da informação e privacidade?' },
    { key: 'exec_risk_appetite', question: 'Qual o apetite de risco da organização?' },
    { key: 'exec_budget', question: 'Qual o orçamento disponível para o programa?' },
    { key: 'exec_sponsor', question: 'Quem é o sponsor executivo do projeto?' },
    { key: 'exec_timeline', question: 'Expectativa de prazo para certificação?' },
  ],
  tecnologia: [
    { key: 'tech_infra', question: 'Descreva a infraestrutura atual (cloud, on-prem, híbrida).' },
    { key: 'tech_access', question: 'Como funciona o controle de acesso e IAM?' },
    { key: 'tech_monitoring', question: 'Quais ferramentas de monitoramento e logging estão em uso?' },
    { key: 'tech_backup', question: 'Como funcionam os processos de backup e disaster recovery?' },
    { key: 'tech_vulnerabilities', question: 'Existe gestão de vulnerabilidades e patching?' },
  ],
  juridico: [
    { key: 'legal_contracts', question: 'Como estão estruturados os contratos com terceiros (DPA, NDA)?' },
    { key: 'legal_bases', question: 'As bases legais para tratamento de dados estão mapeadas?' },
    { key: 'legal_dsr', question: 'Existe processo para atendimento a direitos dos titulares?' },
    { key: 'legal_incidents', question: 'Qual o procedimento em caso de incidente de dados?' },
    { key: 'legal_transfers', question: 'Existem transferências internacionais de dados?' },
  ],
  rh: [
    { key: 'hr_onboarding', question: 'Como funciona o onboarding de segurança para novos colaboradores?' },
    { key: 'hr_training', question: 'Existem treinamentos recorrentes de segurança e privacidade?' },
    { key: 'hr_offboarding', question: 'Como é o processo de offboarding e revogação de acessos?' },
    { key: 'hr_policies', question: 'Quais políticas de RH cobrem segurança da informação?' },
  ],
  operacoes: [
    { key: 'ops_processes', question: 'Quais processos operacionais tratam dados pessoais?' },
    { key: 'ops_suppliers', question: 'Como é feita a gestão de fornecedores e operadores?' },
    { key: 'ops_physical', question: 'Quais controles físicos existem (CCTV, controle de acesso)?' },
    { key: 'ops_continuity', question: 'Existe plano de continuidade de negócios?' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// POLICY_TEMPLATES — mantido do código anterior
// ═══════════════════════════════════════════════════════════════
export const POLICY_TEMPLATES = [
  { id: 'isp', title: 'Information Security Policy (ISP)', iso_ref: '5.1' },
  { id: 'aup', title: 'Acceptable Use Policy (AUP)', iso_ref: '5.10' },
  { id: 'acp', title: 'Access Control Policy (ACP)', iso_ref: '5.15' },
  { id: 'irp', title: 'Incident Response Policy (IRP)', iso_ref: '5.24' },
  { id: 'bcp', title: 'Business Continuity Plan (BCP)', iso_ref: '5.29' },
  { id: 'dpp', title: 'Data Protection Policy (DPP)', iso_ref: '5.34' },
  { id: 'cmp', title: 'Change Management Policy (CMP)', iso_ref: '8.32' },
  { id: 'sdp', title: 'Secure Development Policy (SDP)', iso_ref: '8.25' },
  { id: 'vmp', title: 'Vulnerability Management Policy (VMP)', iso_ref: '8.8' },
  { id: 'sap', title: 'Security Awareness Program (SAP)', iso_ref: '6.3' },
];

// ═══════════════════════════════════════════════════════════════
// BLOCK TITLES — Títulos dos blocos do assessment (para frontend)
// ═══════════════════════════════════════════════════════════════
export const BLOCK_TITLES: Record<number, string> = {
  1: 'Qualificação e Perfil',
  2: 'Escopo e Abrangência',
  3: 'Ambiente Tecnológico',
  4: 'Desenvolvimento e SDLC',
  5: 'Privacidade (ISO 27701)',
  6: 'Governança e Liderança',
  7: 'Gestão de Fornecedores',
  8: 'Documentação e Políticas',
  9: 'Planejamento e Recursos',
  10: 'Volumetria e Complexidade',
};
