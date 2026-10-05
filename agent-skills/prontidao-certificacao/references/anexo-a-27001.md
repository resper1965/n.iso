# ISO/IEC 27001:2022 — Anexo A (93 controles, paráfrase)

Nomes em português por paráfrase; não substitui o texto oficial. Comandos da última coluna são **só leitura**; `<...>` indica parâmetro a preencher; `{owner}/{repo}` e `{org}` são do GitHub. "—" = sem export técnico típico (a prova é documental ou de registro). Controles físicos (A.7) em infraestrutura de nuvem são em grande parte herdados do provedor: a prova é o relatório de terceira parte do provedor mais o controle dos locais próprios (escritório, trabalho remoto).

| Controle | Nome | S1 (documento esperado) | S2 (registro/prova esperada) | Export típico AWS/GitHub |
|---|---|---|---|---|
| A.5.1 | Políticas de segurança da informação | Política geral e políticas temáticas aprovadas, com data e aprovador | Comunicação e aceite; revisão no intervalo planejado | — |
| A.5.2 | Papéis e responsabilidades de segurança da informação | Matriz de papéis e responsabilidades | Nomeações formais; papéis exercidos nos registros | — |
| A.5.3 | Segregação de funções | Regra de segregação (quem solicita, aprova, executa) | Amostra de mudanças com autor diferente do aprovador | `gh api repos/{owner}/{repo}/branches/main/protection` |
| A.5.4 | Responsabilidades da direção | Política exige que gestores cobrem a aplicação da SI | Evidência de cobrança/acompanhamento pela direção | — |
| A.5.5 | Contato com autoridades | Lista de autoridades e quando acioná-las (incl. autoridade de proteção de dados) | Registro de contatos ou teste da lista | — |
| A.5.6 | Contato com grupos de interesse especial | Lista de grupos, fóruns e fontes | Participação ou assinatura ativa | — |
| A.5.7 | Inteligência de ameaças | Procedimento de coleta e análise de inteligência de ameaças | Registros de análise e ação derivada | `aws guardduty list-detectors` |
| A.5.8 | Segurança da informação no gerenciamento de projetos | Requisito de SI no ciclo de projetos | Projetos com análise de SI registrada | `gh issue list --label security --state all --limit 50` |
| A.5.9 | Inventário de informações e outros ativos associados | Inventário com dono | Inventário atualizado e coerente com o ambiente | `aws resourcegroupstaggingapi get-resources --region sa-east-1` |
| A.5.10 | Uso aceitável de informações e outros ativos | Política de uso aceitável | Aceite registrado por colaborador | — |
| A.5.11 | Devolução de ativos | Procedimento de devolução no desligamento | Checklists de desligamento assinados | — |
| A.5.12 | Classificação da informação | Esquema de classificação | Ativos classificados no inventário | `aws resourcegroupstaggingapi get-resources --tag-filters Key=<chave_classificacao>` |
| A.5.13 | Rotulagem de informações | Procedimento de rotulagem coerente com a classificação | Amostra de ativos/documentos rotulados | `aws resourcegroupstaggingapi get-resources --tag-filters Key=<chave_classificacao>` |
| A.5.14 | Transferência de informações | Regras de transferência (canais, acordos, cifragem) | Evidência de transferência protegida | `aws elbv2 describe-listeners --load-balancer-arn <arn>` |
| A.5.15 | Controle de acesso | Política de controle de acesso (necessidade de saber, menor privilégio) | Acessos concedidos seguem a política | `aws iam get-account-authorization-details` |
| A.5.16 | Gestão de identidade | Ciclo de vida de identidades | Identidades únicas; contas órfãs inexistentes | `aws iam list-users` |
| A.5.17 | Informações de autenticação | Regras de senha, MFA e gestão de segredos | Política de senha aplicada; segredos em cofre | `aws iam get-account-password-policy` |
| A.5.18 | Direitos de acesso | Procedimento de concessão, revisão e revogação | Revisões periódicas de acesso registradas | `aws iam get-credential-report` (após `generate-credential-report`) |
| A.5.19 | Segurança da informação nas relações com fornecedores | Política de fornecedores com critérios de SI | Avaliação de SI por fornecedor crítico | `aws artifact list-reports` |
| A.5.20 | Segurança da informação nos contratos com fornecedores | Cláusulas-padrão de SI e proteção de dados | Contratos vigentes com as cláusulas | — |
| A.5.21 | Gestão da SI na cadeia de suprimentos de TIC | Requisitos para componentes e software de terceiros | Inventário de dependências e sua avaliação | `gh api repos/{owner}/{repo}/dependency-graph/sbom` |
| A.5.22 | Monitoramento, análise crítica e gestão de mudanças dos serviços de fornecedores | Procedimento de acompanhamento de fornecedores | Revisões periódicas; avisos de mudança tratados | `aws health describe-events` |
| A.5.23 | Segurança da informação no uso de serviços em nuvem | Política de uso de nuvem (aquisição, uso, gestão, saída) | Responsabilidade compartilhada mapeada; configuração da conta | `aws organizations describe-organization` |
| A.5.24 | Planejamento e preparação da gestão de incidentes | Plano de resposta a incidentes com papéis | Plano testado (simulado) | — |
| A.5.25 | Avaliação e decisão sobre eventos de SI | Critérios de classificação de eventos | Eventos triados com decisão registrada | `aws securityhub get-findings --max-items 50` |
| A.5.26 | Resposta a incidentes de SI | Procedimento de resposta | Registros de incidentes tratados | `aws guardduty list-findings --detector-id <id>` |
| A.5.27 | Aprendizado com incidentes | Etapa de lições aprendidas no procedimento | Relatórios pós-incidente com ação | — |
| A.5.28 | Coleta de evidências | Procedimento de coleta e preservação | Integridade de logs preservada | `aws cloudtrail describe-trails` |
| A.5.29 | Segurança da informação durante disrupção | Plano de continuidade com requisitos de SI | Teste do plano | `aws backup list-backup-plans` |
| A.5.30 | Prontidão de TIC para continuidade de negócios | RTO/RPO definidos para os serviços de TIC | Teste de restauração dentro do RTO/RPO | `aws backup list-restore-jobs` |
| A.5.31 | Requisitos legais, estatutários, regulamentares e contratuais | Registro de requisitos aplicáveis | Registro atualizado; monitoramento de mudanças | — |
| A.5.32 | Direitos de propriedade intelectual | Regras de licenciamento e uso de software | Inventário de licenças | `gh api repos/{owner}/{repo}/license` |
| A.5.33 | Proteção de registros | Tabela de retenção e proteção de registros | Retenção aplicada nos sistemas | `aws logs describe-log-groups` |
| A.5.34 | Privacidade e proteção de dados pessoais | Política de privacidade; ROPA | Tratamentos registrados; direitos do titular atendidos | `aws macie2 list-findings` |
| A.5.35 | Análise crítica independente da segurança da informação | Previsão de revisão independente | Relatório de revisão independente | — |
| A.5.36 | Conformidade com políticas, regras e normas de SI | Procedimento de verificação de conformidade | Verificações periódicas registradas | `aws configservice describe-compliance-by-config-rule` |
| A.5.37 | Procedimentos operacionais documentados | Procedimentos/runbooks das operações críticas | Procedimentos disponíveis e usados | — |
| A.6.1 | Seleção | Regra de verificação de antecedentes proporcional ao risco | Verificações registradas por contratado | — |
| A.6.2 | Termos e condições de contratação | Contratos com responsabilidades de SI | Contratos assinados | — |
| A.6.3 | Conscientização, educação e treinamento em SI | Programa de conscientização e reciclagem | Registros de treinamento no período | — |
| A.6.4 | Processo disciplinar | Processo disciplinar formal comunicado | Comunicação do processo | — |
| A.6.5 | Responsabilidades após encerramento ou mudança de vínculo | Obrigações pós-vínculo | Desligamentos com acessos revogados no prazo | `gh api orgs/{org}/members --paginate` |
| A.6.6 | Acordos de confidencialidade | Modelo de acordo de confidencialidade | Acordos assinados e revisados | — |
| A.6.7 | Trabalho remoto | Política de trabalho remoto | Aceite e controles aplicados | — |
| A.6.8 | Relato de eventos de SI | Canal e instrução de relato | Eventos relatados pelo canal | — |
| A.7.1 | Perímetros de segurança física | Definição dos perímetros próprios; herança do provedor | Relatório de terceira parte do provedor | `aws artifact list-reports` |
| A.7.2 | Entrada física | Controle de acesso físico aos locais próprios | Registros de acesso | — |
| A.7.3 | Segurança de escritórios, salas e instalações | Requisitos de proteção dos locais próprios | Inspeção ou evidência | — |
| A.7.4 | Monitoramento da segurança física | Monitoramento dos locais próprios; herança do provedor | Relatório de terceira parte do provedor | `aws artifact list-reports` |
| A.7.5 | Proteção contra ameaças físicas e ambientais | Avaliação de ameaças físicas; herança do provedor | Relatório de terceira parte do provedor | `aws artifact list-reports` |
| A.7.6 | Trabalho em áreas seguras | Regras para áreas seguras (se existirem) | Evidência de aplicação | — |
| A.7.7 | Mesa limpa e tela limpa | Regra de mesa e tela limpas | Bloqueio automático de tela configurado | — |
| A.7.8 | Localização e proteção de equipamentos | Regras para equipamentos próprios | Evidência de aplicação | — |
| A.7.9 | Segurança de ativos fora das instalações | Regras para equipamentos fora do escritório | Equipamentos cifrados e inventariados | — |
| A.7.10 | Mídias de armazenamento | Gestão, transporte e descarte de mídias | Cifragem de volumes; registros de descarte | `aws ec2 get-ebs-encryption-by-default` |
| A.7.11 | Utilidades de suporte | Requisitos de energia e utilidades; herança do provedor | Relatório de terceira parte do provedor | `aws artifact list-reports` |
| A.7.12 | Segurança do cabeamento | Requisitos para cabeamento próprio; herança do provedor | Relatório de terceira parte do provedor | `aws artifact list-reports` |
| A.7.13 | Manutenção de equipamentos | Regra de manutenção dos equipamentos próprios | Registros de manutenção | — |
| A.7.14 | Descarte seguro ou reutilização de equipamentos | Procedimento de descarte com apagamento | Registros de descarte; herança do provedor para mídia em nuvem | `aws artifact list-reports` |
| A.8.1 | Dispositivos de endpoint do usuário | Política de endpoints (cifragem, atualização, bloqueio) | Inventário e estado dos endpoints | — |
| A.8.2 | Direitos de acesso privilegiado | Regra de concessão e revisão de acesso privilegiado | Lista de privilegiados revisada | `aws iam list-entities-for-policy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess` |
| A.8.3 | Restrição de acesso à informação | Regras de restrição por política de acesso | Recursos sem acesso público indevido | `aws s3api get-public-access-block --bucket <bucket>` |
| A.8.4 | Acesso ao código-fonte | Regra de acesso ao código | Colaboradores e permissões revisados | `gh api repos/{owner}/{repo}/collaborators --paginate` |
| A.8.5 | Autenticação segura | Exigência de MFA e autenticação forte | MFA ativo em todas as contas | `gh api "orgs/{org}/members?filter=2fa_disabled"` |
| A.8.6 | Gestão de capacidade | Monitoramento e projeção de capacidade | Alarmes e revisões de capacidade | `aws cloudwatch describe-alarms` |
| A.8.7 | Proteção contra malware | Política antimalware | Detecção ativa e alertas tratados | `aws guardduty get-detector --detector-id <id>` |
| A.8.8 | Gestão de vulnerabilidades técnicas | Procedimento com prazos por severidade | Vulnerabilidades tratadas no prazo | `aws inspector2 list-findings` |
| A.8.9 | Gestão de configuração | Linhas de base de configuração | Desvios detectados e tratados | `aws configservice describe-configuration-recorders` |
| A.8.10 | Exclusão de informações | Regra de exclusão ao fim da retenção | Exclusões executadas | `aws s3api get-bucket-lifecycle-configuration --bucket <bucket>` |
| A.8.11 | Mascaramento de dados | Regra de mascaramento/pseudonimização | Dados mascarados em logs e não produção | `aws logs get-data-protection-policy --log-group-identifier <log_group>` |
| A.8.12 | Prevenção de vazamento de dados | Medidas de prevenção de vazamento | Alertas de exposição tratados | `gh api repos/{owner}/{repo}/secret-scanning/alerts` |
| A.8.13 | Backup de informações | Política de backup (escopo, frequência, retenção, teste) | Jobs concluídos e teste de restauração | `aws backup list-backup-jobs --by-state COMPLETED` |
| A.8.14 | Redundância dos recursos de tratamento | Requisitos de disponibilidade e redundância | Recursos em múltiplas zonas | `aws rds describe-db-instances` |
| A.8.15 | Registro de logs | Política de logs (o quê, retenção, proteção) | Trilhas ativas e íntegras; retenção aplicada | `aws cloudtrail get-trail-status --name <trail>` |
| A.8.16 | Atividades de monitoramento | Procedimento de monitoramento de comportamento anômalo | Alertas gerados e tratados | `aws guardduty list-findings --detector-id <id>` |
| A.8.17 | Sincronização de relógio | Fonte de tempo definida | Sistemas sincronizados | — |
| A.8.18 | Uso de programas utilitários privilegiados | Restrição de utilitários privilegiados | Sessões privilegiadas registradas | `aws ssm describe-sessions --state History` |
| A.8.19 | Instalação de software em sistemas operacionais | Regra de instalação de software | Inventário de software instalado | `aws ssm list-inventory-entries --instance-id <id> --type-name AWS:Application` |
| A.8.20 | Segurança de redes | Arquitetura e regras de rede | Regras de firewall revisadas | `aws ec2 describe-security-groups` |
| A.8.21 | Segurança dos serviços de rede | Requisitos dos serviços de rede (TLS, WAF) | Serviços configurados de acordo com os requisitos | `aws wafv2 list-web-acls --scope REGIONAL` |
| A.8.22 | Segregação de redes | Segmentação definida | Sub-redes e rotas coerentes com o desenho | `aws ec2 describe-subnets` |
| A.8.23 | Filtragem da web | Regra de filtragem de acesso externo | Filtros aplicados | `aws route53resolver list-firewall-rule-group-associations` |
| A.8.24 | Uso de criptografia | Política de criptografia e gestão de chaves | Cifragem em repouso e trânsito; rotação de chaves | `aws kms get-key-rotation-status --key-id <id>` |
| A.8.25 | Ciclo de vida de desenvolvimento seguro | Regras de desenvolvimento seguro | Esteira com controles de segurança | `gh run list --limit 20` |
| A.8.26 | Requisitos de segurança de aplicações | Requisitos de segurança definidos por aplicação | Requisitos rastreados até a entrega | — |
| A.8.27 | Arquitetura e engenharia de sistemas seguros | Princípios de arquitetura segura | Aplicação dos princípios em desenhos | — |
| A.8.28 | Codificação segura | Padrão de codificação segura | Análise estática ativa e alertas tratados | `gh api repos/{owner}/{repo}/code-scanning/alerts` |
| A.8.29 | Testes de segurança em desenvolvimento e aceitação | Plano de testes de segurança | Resultados de testes e pentest | `gh run list --workflow <workflow> --limit 20` |
| A.8.30 | Desenvolvimento terceirizado | Requisitos para desenvolvimento externo | Supervisão registrada (ou exclusão justificada) | — |
| A.8.31 | Separação dos ambientes de desenvolvimento, teste e produção | Regra de separação | Ambientes em contas ou redes separadas | `aws organizations list-accounts` |
| A.8.32 | Gestão de mudanças | Procedimento de mudanças | Mudanças com revisão e aprovação | `gh pr list --state merged --limit 50 --json number,title,reviewDecision,mergedAt` |
| A.8.33 | Informações de teste | Regra de uso de dados em teste | Ausência de dado pessoal real em teste | — |
| A.8.34 | Proteção de sistemas durante testes de auditoria | Regra para testes de verificação em produção | Testes planejados e autorizados | — |
