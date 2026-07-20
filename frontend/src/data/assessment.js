export     const ASSESSMENT_BLOCKS = [
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
