const fs = require('fs');
const path = require('path');
const srcDir = path.resolve(__dirname, 'src');
const extracted = fs.readFileSync(path.join(srcDir, 'extracted_from_html.js'), 'utf8');

const missingFuncs = [
  'toggleTheme', 'updateThemeIcon', 'viewEvidence', 'setLang', 'toggleGroup', 'doLogin', 'doLogout', 'openPricingOverrideModal', 'toggleSidebar', 'toggleContext', 'updateActiveProjectWidget', 'updateSidebarProjectSelector', 'updateHeaderUser', 'loadNotifications', 'updateNotifBadge', 'toggleNotifications', 'renderNotifDropdown', 'markNotifRead', 'handleNotificationClick', 'openProfileModal', 'openActiveProjectModal', 'updateContextPanel', 'openInviteClientModal', 'doInviteClient', 'loadLeads', 'loadAssessments', 'loadProjects', 'loadControls', 'loadDashboardStats', 'loadAll', 'initApp', 'showForgotPasswordForm', 'showStandardLoginForm', 'doFirstLoginReset', 'doForgotPasswordRequest', 'doForgotPasswordReset', 'openDoDDrawer', 'refreshDoDDrawer', 'confirmDoDCompletion', 'cancelDoDCompletion', 'closeDoDDrawer', 'closeDoDDrawerEl', 'signEvidence', 'openScopeChangeModal', 'submitScopeChange',
  'renderSelfServiceAssessment', 'renderSelfServiceBlock', 'ssPrev', 'ssNext', 'saveChecklistItemMetadata', 'saveChecklistItemNotes', 'saveChecklistItemAssigned', 'saveChecklistItemDueDate'
];

let globalsJs = "import { S } from './state.js';\nimport { api, API_BASE } from './api.js';\nimport { render, navigate } from './router.js';\nimport { showToast, openModal, closeModal, escapeHTML } from './ui.js';\n\n";

for (const f of missingFuncs) {
  let startIndex = extracted.indexOf('function ' + f + '(');
  if (startIndex === -1) startIndex = extracted.indexOf('function ' + f + ' (');
  if (startIndex === -1) startIndex = extracted.indexOf('window.' + f + ' = function');
  if (startIndex === -1) startIndex = extracted.indexOf('window.' + f + ' = async function');
  if (startIndex === -1) startIndex = extracted.indexOf('async function ' + f + '(');
  
  if (startIndex !== -1) {
    let braceIndex = extracted.indexOf('{', startIndex);
    if (braceIndex !== -1) {
      let openBraces = 1;
      let currentIndex = braceIndex + 1;
      while (openBraces > 0 && currentIndex < extracted.length) {
        if (extracted[currentIndex] === '{') openBraces++;
        if (extracted[currentIndex] === '}') openBraces--;
        currentIndex++;
      }
      
      let start = startIndex;
      if (extracted.substring(start - 6, start) === 'async ') {
        start -= 6;
      }
      
      let funcBody = extracted.substring(start, currentIndex);
      if (!funcBody.trim().startsWith('window.')) {
        funcBody = funcBody.replace(/^(async )?function ([a-zA-Z0-9_]+)/, 'window.$2 = $1function $2');
      }
      
      globalsJs += funcBody + '\n\n';
    }
  } else {
    console.log('Could not find: ' + f);
  }
}

// Add the other random window assignments at the bottom of the script
globalsJs += "\n" + `
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
`;

globalsJs += `\nwindow.initApp = window.initApp || function() {};\n`;
globalsJs += `document.addEventListener('keydown', function(e) { if (e.key === 'Escape') forceCloseModal(); });\n`;
globalsJs += `new MutationObserver(function() {
    document.querySelectorAll('[onclick]').forEach(function(el) {
        if (!['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
            if (!el._a11yKey) {
                el._a11yKey = true;
                el.addEventListener('keydown', function(e) {
                    var tag = (e.target||{}).tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                    if (e.key === 'Enter' || e.key === ' ') { el.click(); e.preventDefault(); }
                });
            }
        }
    });
}).observe(document.body, { childList: true, subtree: true });\n`;

// Call initApp when script loads (or we can just export them and call from main.js)
globalsJs += `\nwindow.initApp();\n`;

fs.writeFileSync(path.join(srcDir, 'globals.js'), globalsJs);
console.log('Created globals.js successfully');
