export     const JORNADA_QUESTIONS = {
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

export             const JOURNEYS = [
                { name: "Jornada 1: Mobilização e Diagnóstico", range: [0, 6], desc: "Planejamento inicial, entrevistas, escopo e diagnóstico GRC" },
                { name: "Jornada 2: Mapeamento e Riscos", range: [7, 13], desc: "Ativos, processos, riscos de segurança/privacidade e SoA" },
                { name: "Jornada 3: Implementação SGSI (ISO 27001)", range: [14, 20], desc: "Desenho da arquitetura documental e implementação de controles práticos" },
                { name: "Jornada 4: Implementação SGPI (ISO 27701)", range: [21, 28], desc: "Implementação prática do programa de privacidade e direitos de titulares" },
                { name: "Jornada 5: Operação e Auditoria", range: [29, 33], desc: "Treinamentos, métricas operacionais, auditoria interna e revisão pela direção" },
                { name: "Jornada 6: Certificação Oficial", range: [34, 40], desc: "Melhorias contínuas, auditorias de certificação estágio 1 e 2" }
            ];

window.JORNADA_QUESTIONS = JORNADA_QUESTIONS;
window.JOURNEYS = JOURNEYS;
