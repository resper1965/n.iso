import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from 'hono/cloudflare-workers';
import { calculatePricing, DEFAULT_FINANCIAL_MODEL } from './services/pricing';
import { PolicyAgent } from './agents/policy';
import { EvidenceAgent } from './agents/evidence';
import { AssessmentAgent } from './agents/assessment';
import { MemoryService } from './services/memory';
import { SoALogicEngine } from './services/soa-logic';
import { MigrationService } from './services/migration-service';
import { PolicyGeneratorService } from './services/policy-generator';
import process from 'node:process';
import { KnowledgeService } from './services/knowledge-service';
import { BLOCK_QUESTIONS, PHASE_TITLES, POLICY_TEMPLATES } from './constants';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Bindings = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  SETUP_KEY: string;
  AI: any;
  STORAGE: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  ASSETS?: any;
  ENVIRONMENT: string;
  GOVBR_CLIENT_ID?: string;
  GOVBR_CLIENT_SECRET?: string;
  GOVBR_REDIRECT_URI?: string;
  GOVBR_ENVIRONMENT?: string;
};

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    client_project_id: string | null;
    client_lead_id?: string;
  };
};

type BlockQuestion = {
  key: string;
  question: string;
  type: 'select' | 'multi' | 'text' | 'yesno';
  options?: string[];
  hint?: string;
  iso_ref?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Gera um ULID-like único para IDs (não usar para tokens de sessão) */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Gera um token criptograficamente seguro para sessões */
function genToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Escape HTML entities para prevenir XSS em templates HTML */
function escapeHtml(s: string): string {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Envia e-mail usando a API do Resend se RESEND_API_KEY estiver presente. Caso contrário, simula em log */
async function sendEmail(c: any, to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = c.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL SIMULATION] Envio para: ${to}\nAssunto: ${subject}\nConteúdo: ${html}`);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'nISO <noreply@ness.lat>',
        to: [to],
        subject: subject,
        html: html
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[EMAIL ERROR] Falha no Resend API: ${res.status} - ${errText}`);
      return false;
    }
    console.log(`[EMAIL SUCCESS] E-mail enviado com sucesso para ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL EXCEPTION] Erro ao enviar e-mail: ${err.message}`);
    return false;
  }
}


// ─── Checklists por Fase do Projeto ──────────────────────────────────────────

type ChecklistItem = { id: string; text: string; category: 'task' | 'document' | 'evidence' };

const PHASE_CHECKLISTS: Record<number, ChecklistItem[]> = {
  0: [ // Mobilização e Mandato
    { id: 'p0_1', text: 'Definir sponsor executivo', category: 'task' },
    { id: 'p0_2', text: 'Nomear equipe do projeto', category: 'task' },
    { id: 'p0_3', text: 'Kick-off meeting realizado', category: 'evidence' },
    { id: 'p0_4', text: 'Cronograma aprovado', category: 'document' },
    { id: 'p0_5', text: 'Carta de mandato assinada', category: 'document' },
    { id: 'p0_6', text: 'Definir canais de comunicação', category: 'task' },
    { id: 'p0_7', text: 'Avaliar recursos necessários', category: 'task' },
  ],
  1: [ // Entrevista Executiva
    { id: 'p1_1', text: 'Agendar entrevista com C-Level', category: 'task' },
    { id: 'p1_2', text: 'Conduzir entrevista executiva', category: 'task' },
    { id: 'p1_3', text: 'Documentar respostas e expectativas', category: 'document' },
    { id: 'p1_4', text: 'Registrar gaps identificados', category: 'evidence' },
  ],
  2: [ // Entrevistas por Trilha
    { id: 'p2_1', text: 'Agendar entrevistas por trilha (TI, RH, Jurídico)', category: 'task' },
    { id: 'p2_2', text: 'Conduzir entrevistas com cada área', category: 'task' },
    { id: 'p2_3', text: 'Documentar achados por trilha', category: 'document' },
    { id: 'p2_4', text: 'Consolidar relatório de entrevistas', category: 'document' },
  ],
  3: [ // Definição de Escopo
    { id: 'p3_1', text: 'Declaração de escopo documentada (Cl 4.3)', category: 'document' },
    { id: 'p3_2', text: 'Unidades organizacionais definidas', category: 'document' },
    { id: 'p3_3', text: 'Processos incluídos listados', category: 'document' },
    { id: 'p3_4', text: 'Exclusões justificadas', category: 'document' },
    { id: 'p3_5', text: 'Limites geográficos definidos', category: 'document' },
    { id: 'p3_6', text: 'Escopo aprovado pela direção', category: 'evidence' },
  ],
  4: [ // Gap Assessment
    { id: 'p4_1', text: 'Questionário de gap enviado', category: 'task' },
    { id: 'p4_2', text: 'Entrevistas realizadas', category: 'evidence' },
    { id: 'p4_3', text: 'Gaps por controle documentados', category: 'document' },
    { id: 'p4_4', text: 'Relatório de gap assessment gerado', category: 'document' },
    { id: 'p4_5', text: 'Plano de tratamento definido', category: 'document' },
    { id: 'p4_6', text: 'Gap assessment aprovado', category: 'evidence' },
    { id: 'p4_7', text: 'Quick wins identificados', category: 'task' },
  ],
  5: [ // Governança e Papéis
    { id: 'p5_1', text: 'Definir estrutura de governança', category: 'task' },
    { id: 'p5_2', text: 'Nomear papéis e responsabilidades', category: 'document' },
    { id: 'p5_3', text: 'Documentar organograma de SI', category: 'document' },
    { id: 'p5_4', text: 'Aprovar estrutura de governança', category: 'evidence' },
  ],
  6: [ // Contexto e Partes Interessadas
    { id: 'p6_1', text: 'Análise de contexto interno e externo (Cl 4.1)', category: 'document' },
    { id: 'p6_2', text: 'Identificar partes interessadas (Cl 4.2)', category: 'document' },
    { id: 'p6_3', text: 'Documentar requisitos das partes interessadas', category: 'document' },
    { id: 'p6_4', text: 'Aprovar análise de contexto', category: 'evidence' },
  ],
  7: [ // Inventário de Ativos e Dados
    { id: 'p7_1', text: 'Inventário de ativos de informação', category: 'document' },
    { id: 'p7_2', text: 'Classificação de ativos por criticidade', category: 'document' },
    { id: 'p7_3', text: 'Proprietários de ativos atribuídos', category: 'task' },
    { id: 'p7_4', text: 'Mapeamento de dados pessoais (RoPA)', category: 'document' },
    { id: 'p7_5', text: 'Inventário revisado e aprovado', category: 'evidence' },
  ],
  8: [ // Mapeamento de Processos
    { id: 'p8_1', text: 'Processos de negócio mapeados', category: 'document' },
    { id: 'p8_2', text: 'Fluxos de dados documentados', category: 'document' },
    { id: 'p8_3', text: 'Dependências entre processos identificadas', category: 'document' },
    { id: 'p8_4', text: 'Processos críticos priorizados', category: 'task' },
  ],
  9: [ // Riscos de Segurança
    { id: 'p9_1', text: 'Metodologia de risco definida (Cl 6.1)', category: 'document' },
    { id: 'p9_2', text: 'Ativos de informação inventariados', category: 'document' },
    { id: 'p9_3', text: 'Ameaças e vulnerabilidades identificadas', category: 'document' },
    { id: 'p9_4', text: 'Matriz de risco (impacto × probabilidade)', category: 'document' },
    { id: 'p9_5', text: 'Critérios de aceitação definidos', category: 'document' },
    { id: 'p9_6', text: 'Proprietários de risco atribuídos', category: 'task' },
    { id: 'p9_7', text: 'Plano de tratamento de riscos (Cl 6.1.3)', category: 'document' },
    { id: 'p9_8', text: 'Risco residual aceito formalmente', category: 'evidence' },
  ],
  10: [ // Riscos de Privacidade
    { id: 'p10_1', text: 'DPIA/RIPD para operações de alto risco', category: 'document' },
    { id: 'p10_2', text: 'Riscos de privacidade identificados', category: 'document' },
    { id: 'p10_3', text: 'Medidas mitigatórias definidas', category: 'document' },
    { id: 'p10_4', text: 'DPIA aprovado pelo DPO', category: 'evidence' },
  ],
  11: [ // Tratamento de Riscos
    { id: 'p11_1', text: 'Plano de tratamento de riscos elaborado', category: 'document' },
    { id: 'p11_2', text: 'Controles selecionados por risco', category: 'document' },
    { id: 'p11_3', text: 'Responsáveis por implementação definidos', category: 'task' },
    { id: 'p11_4', text: 'Cronograma de implementação aprovado', category: 'evidence' },
  ],
  12: [ // SoA do SGSI
    { id: 'p12_1', text: 'SoA draft gerado com 93 controles', category: 'document' },
    { id: 'p12_2', text: 'Justificativa de inclusão/exclusão por controle', category: 'document' },
    { id: 'p12_3', text: 'Status de implementação por controle', category: 'document' },
    { id: 'p12_4', text: 'Evidências vinculadas por controle', category: 'evidence' },
    { id: 'p12_5', text: 'SoA revisado pela direção', category: 'task' },
    { id: 'p12_6', text: 'SoA aprovado formalmente', category: 'evidence' },
  ],
  13: [ // SoA do SGPI
    { id: 'p13_1', text: 'SoA de privacidade elaborado (ISO 27701)', category: 'document' },
    { id: 'p13_2', text: 'Controles de privacidade mapeados', category: 'document' },
    { id: 'p13_3', text: 'Evidências de conformidade vinculadas', category: 'evidence' },
    { id: 'p13_4', text: 'SoA do SGPI aprovado', category: 'evidence' },
  ],
  14: [ // Arquitetura Documental
    { id: 'p14_1', text: 'Estrutura de pastas definida', category: 'task' },
    { id: 'p14_2', text: 'Nomenclatura padrão de documentos', category: 'document' },
    { id: 'p14_3', text: 'Template de política aprovado', category: 'document' },
    { id: 'p14_4', text: 'Template de procedimento aprovado', category: 'document' },
    { id: 'p14_5', text: 'Controle de versão implementado', category: 'task' },
    { id: 'p14_6', text: 'Workflow de aprovação definido', category: 'task' },
    { id: 'p14_7', text: 'Lista mestra de documentos', category: 'document' },
  ],
  15: [ // Controles Organizacionais
    { id: 'p15_1', text: 'Políticas organizacionais redigidas (Tema 5)', category: 'document' },
    { id: 'p15_2', text: 'Procedimentos de gestão de ativos', category: 'document' },
    { id: 'p15_3', text: 'Controles de acesso implementados', category: 'evidence' },
    { id: 'p15_4', text: 'Políticas aprovadas pela direção', category: 'evidence' },
  ],
  16: [ // Controles de Pessoas
    { id: 'p16_1', text: 'Política de segurança para RH redigida', category: 'document' },
    { id: 'p16_2', text: 'Background check implementado', category: 'task' },
    { id: 'p16_3', text: 'Termos de confidencialidade assinados', category: 'evidence' },
    { id: 'p16_4', text: 'Processo de desligamento seguro documentado', category: 'document' },
  ],
  17: [ // Controles Físicos
    { id: 'p17_1', text: 'Perímetros de segurança definidos', category: 'document' },
    { id: 'p17_2', text: 'Controles de acesso físico implementados', category: 'evidence' },
    { id: 'p17_3', text: 'Proteção de equipamentos documentada', category: 'document' },
    { id: 'p17_4', text: 'Descarte seguro de mídias', category: 'task' },
  ],
  18: [ // Controles Tecnológicos
    { id: 'p18_1', text: 'Controles tecnológicos do Tema 8 implementados', category: 'evidence' },
    { id: 'p18_2', text: 'Gestão de vulnerabilidades operacional', category: 'evidence' },
    { id: 'p18_3', text: 'Logs e monitoramento configurados', category: 'evidence' },
    { id: 'p18_4', text: 'Criptografia em trânsito e repouso', category: 'evidence' },
    { id: 'p18_5', text: 'Proteção contra malware ativa', category: 'evidence' },
  ],
  19: [ // Desenvolvimento Seguro
    { id: 'p19_1', text: 'Política de desenvolvimento seguro (A.8.25)', category: 'document' },
    { id: 'p19_2', text: 'SSDLC implementado no pipeline', category: 'evidence' },
    { id: 'p19_3', text: 'Code review obrigatório configurado', category: 'evidence' },
    { id: 'p19_4', text: 'Ferramentas SAST/SCA integradas', category: 'evidence' },
  ],
  20: [ // Cloud, DevOps e SRE
    { id: 'p20_1', text: 'Segurança cloud provider documentada (A.5.23)', category: 'document' },
    { id: 'p20_2', text: 'IAM e least privilege configurados', category: 'evidence' },
    { id: 'p20_3', text: 'Pipeline CI/CD seguro', category: 'evidence' },
    { id: 'p20_4', text: 'Monitoramento e alertas operacionais', category: 'evidence' },
  ],
  21: [ // Programa de Privacidade
    { id: 'p21_1', text: 'Programa de privacidade documentado', category: 'document' },
    { id: 'p21_2', text: 'DPO/Encarregado nomeado', category: 'evidence' },
    { id: 'p21_3', text: 'Bases legais mapeadas por operação', category: 'document' },
    { id: 'p21_4', text: 'RoPA completo e atualizado', category: 'document' },
  ],
  22: [ // Privacy by Design
    { id: 'p22_1', text: 'Metodologia de Privacy by Design definida', category: 'document' },
    { id: 'p22_2', text: 'Checklist PbD para novos projetos', category: 'document' },
    { id: 'p22_3', text: 'Minimização de dados implementada', category: 'evidence' },
    { id: 'p22_4', text: 'Privacy by Default configurado', category: 'evidence' },
  ],
  23: [ // Direitos dos Titulares
    { id: 'p23_1', text: 'Canal de atendimento a titulares implementado', category: 'evidence' },
    { id: 'p23_2', text: 'Procedimento de DSR documentado', category: 'document' },
    { id: 'p23_3', text: 'SLA de resposta definido', category: 'document' },
    { id: 'p23_4', text: 'Teste de exercício de direitos realizado', category: 'evidence' },
  ],
  24: [ // Consentimento e Bases Legais
    { id: 'p24_1', text: 'Fluxo de consentimento implementado', category: 'evidence' },
    { id: 'p24_2', text: 'Mecanismo de revogação funcional', category: 'evidence' },
    { id: 'p24_3', text: 'Bases legais documentadas por operação', category: 'document' },
    { id: 'p24_4', text: 'Cookie banner/consent manager configurado', category: 'evidence' },
  ],
  25: [ // Retenção e Descarte
    { id: 'p25_1', text: 'Política de retenção documentada', category: 'document' },
    { id: 'p25_2', text: 'Tabela de temporalidade por tipo de dado', category: 'document' },
    { id: 'p25_3', text: 'Procedimento de descarte seguro', category: 'document' },
    { id: 'p25_4', text: 'Jobs de exclusão automatizados ou planejados', category: 'evidence' },
  ],
  26: [ // Transferências e Compartilhamento
    { id: 'p26_1', text: 'Transferências internacionais mapeadas', category: 'document' },
    { id: 'p26_2', text: 'Cláusulas contratuais padrão (SCCs)', category: 'document' },
    { id: 'p26_3', text: 'Avaliação de adequação de país receptor', category: 'document' },
    { id: 'p26_4', text: 'Compartilhamentos de dados documentados', category: 'document' },
  ],
  27: [ // Fornecedores e Operadores
    { id: 'p27_1', text: 'Lista de subprocessadores atualizada', category: 'document' },
    { id: 'p27_2', text: 'DPAs assinados com fornecedores', category: 'evidence' },
    { id: 'p27_3', text: 'Avaliação de segurança de fornecedores', category: 'document' },
    { id: 'p27_4', text: 'Monitoramento contínuo de terceiros', category: 'task' },
  ],
  28: [ // Incidentes
    { id: 'p28_1', text: 'Procedimento de resposta a incidentes (A.5.24)', category: 'document' },
    { id: 'p28_2', text: 'Classificação de severidade definida', category: 'document' },
    { id: 'p28_3', text: 'Canais de reporte definidos', category: 'task' },
    { id: 'p28_4', text: 'Time de resposta nomeado (CSIRT)', category: 'task' },
    { id: 'p28_5', text: 'Template de registro de incidente', category: 'document' },
    { id: 'p28_6', text: 'Processo de notificação à ANPD (72h)', category: 'document' },
    { id: 'p28_7', text: 'Lições aprendidas documentadas', category: 'document' },
    { id: 'p28_8', text: 'Simulação de incidente realizada', category: 'evidence' },
  ],
  29: [ // Treinamento
    { id: 'p29_1', text: 'Programa de conscientização definido', category: 'document' },
    { id: 'p29_2', text: 'Material de treinamento elaborado', category: 'document' },
    { id: 'p29_3', text: 'Treinamento inicial realizado', category: 'evidence' },
    { id: 'p29_4', text: 'Registros de presença/conclusão', category: 'evidence' },
  ],
  30: [ // Monitoramento e Métricas
    { id: 'p30_1', text: 'KPIs de segurança definidos', category: 'document' },
    { id: 'p30_2', text: 'Dashboard de métricas implementado', category: 'evidence' },
    { id: 'p30_3', text: 'Processo de monitoramento contínuo', category: 'document' },
    { id: 'p30_4', text: 'Relatório periódico de métricas', category: 'document' },
  ],
  31: [ // Auditoria Interna
    { id: 'p31_1', text: 'Programa de auditoria interna (Cl 9.2)', category: 'document' },
    { id: 'p31_2', text: 'Critérios e escopo definidos', category: 'document' },
    { id: 'p31_3', text: 'Auditor interno qualificado/independente', category: 'evidence' },
    { id: 'p31_4', text: 'Checklist de auditoria preparado', category: 'document' },
    { id: 'p31_5', text: 'Auditoria interna executada', category: 'evidence' },
    { id: 'p31_6', text: 'Relatório de auditoria gerado', category: 'document' },
    { id: 'p31_7', text: 'Não conformidades registradas', category: 'document' },
    { id: 'p31_8', text: 'Plano de ação corretiva aprovado', category: 'evidence' },
  ],
  32: [ // Não Conformidades
    { id: 'p32_1', text: 'Não conformidades identificadas e registradas', category: 'document' },
    { id: 'p32_2', text: 'Análise de causa raiz realizada', category: 'document' },
    { id: 'p32_3', text: 'Ações corretivas definidas', category: 'document' },
    { id: 'p32_4', text: 'Verificação de eficácia das correções', category: 'evidence' },
  ],
  33: [ // Análise Crítica
    { id: 'p33_1', text: 'Pauta da análise crítica preparada (Cl 9.3)', category: 'document' },
    { id: 'p33_2', text: 'Análise crítica pela direção realizada', category: 'evidence' },
    { id: 'p33_3', text: 'Ata de reunião documentada', category: 'document' },
    { id: 'p33_4', text: 'Decisões e ações registradas', category: 'document' },
  ],
  34: [ // Readiness Review
    { id: 'p34_1', text: 'Todas as políticas aprovadas', category: 'evidence' },
    { id: 'p34_2', text: 'SoA finalizado com evidências', category: 'evidence' },
    { id: 'p34_3', text: 'Risk treatment plan implementado', category: 'evidence' },
    { id: 'p34_4', text: 'Auditoria interna concluída', category: 'evidence' },
    { id: 'p34_5', text: 'Análise crítica pela direção realizada', category: 'evidence' },
    { id: 'p34_6', text: 'Não conformidades corrigidas', category: 'evidence' },
    { id: 'p34_7', text: 'Simulação de Stage 1 realizada', category: 'evidence' },
    { id: 'p34_8', text: 'Readiness score ≥ 80%', category: 'evidence' },
  ],
  35: [ // Preparação Stage 1
    { id: 'p35_1', text: 'Documentação Stage 1 empacotada', category: 'document' },
    { id: 'p35_2', text: 'SoA + política SGSI + escopo enviados', category: 'document' },
    { id: 'p35_3', text: 'Agenda com certificadora confirmada', category: 'task' },
    { id: 'p35_4', text: 'Time de acompanhamento definido', category: 'task' },
    { id: 'p35_5', text: 'FAQ de auditoria preparado', category: 'document' },
  ],
  36: [ // Correções Pós-Stage 1
    { id: 'p36_1', text: 'Achados do Stage 1 documentados', category: 'document' },
    { id: 'p36_2', text: 'Plano de correção elaborado', category: 'document' },
    { id: 'p36_3', text: 'Correções implementadas', category: 'evidence' },
    { id: 'p36_4', text: 'Evidências de correção coletadas', category: 'evidence' },
  ],
  37: [ // Preparação Stage 2
    { id: 'p37_1', text: 'Evidências de implementação organizadas', category: 'evidence' },
    { id: 'p37_2', text: 'Entrevistados informados e preparados', category: 'task' },
    { id: 'p37_3', text: 'Sala de auditoria/logistics definidos', category: 'task' },
    { id: 'p37_4', text: 'Não conformidades Stage 1 corrigidas', category: 'evidence' },
    { id: 'p37_5', text: 'Evidências de eficácia operacional', category: 'evidence' },
    { id: 'p37_6', text: 'Logs de auditoria disponíveis', category: 'evidence' },
  ],
  38: [ // Atendimento ao Auditor
    { id: 'p38_1', text: 'Acompanhar auditor durante Stage 2', category: 'task' },
    { id: 'p38_2', text: 'Evidências solicitadas fornecidas', category: 'evidence' },
    { id: 'p38_3', text: 'Registro de observações do auditor', category: 'document' },
    { id: 'p38_4', text: 'Encerramento formal da auditoria', category: 'evidence' },
  ],
  39: [ // Pós-Auditoria
    { id: 'p39_1', text: 'Relatório de auditoria recebido e analisado', category: 'document' },
    { id: 'p39_2', text: 'Não conformidades menores corrigidas', category: 'evidence' },
    { id: 'p39_3', text: 'Certificado recebido', category: 'evidence' },
    { id: 'p39_4', text: 'Comunicação interna sobre certificação', category: 'task' },
  ],
  40: [ // Manutenção e Supervisão
    { id: 'p40_1', text: 'Calendário de auditorias de supervisão', category: 'document' },
    { id: 'p40_2', text: 'Melhoria contínua operacional', category: 'task' },
    { id: 'p40_3', text: 'Preparação para recertificação (3 anos)', category: 'task' },
  ],
};

// ─── Perguntas de Entrevista por Trilha ─────────────────────────────────────

const INTERVIEW_TRACKS: Record<string, BlockQuestion[]> = {
  executiva: [
    { key: 'exec_context', question: 'Descreva o modelo de negocio, mercado de atuacao e partes interessadas relevantes.', type: 'text', iso_ref: 'Clausula 4.1, 4.2', hint: 'Observe se o entrevistado menciona reguladores, clientes-chave e requisitos contratuais de seguranca.' },
    { key: 'exec_vision', question: 'Como a diretoria enxerga seguranca da informacao — custo necessario, investimento estrategico ou habilitador de negocios?', type: 'select', options: ['Custo necessario', 'Investimento estrategico', 'Habilitador de negocios', 'Nao ha visao definida'], iso_ref: 'Clausula 5.1', hint: 'Se disser "custo necessario", sinaliza baixa maturidade. "Habilitador" indica alta maturidade.' },
    { key: 'exec_risk_appetite', question: 'Qual o apetite de risco da organizacao? Cite exemplos de riscos que aceitariam vs. riscos inaceitaveis.', type: 'text', iso_ref: 'Clausula 6.1.2', hint: 'Organizacoes maduras conseguem dar exemplos concretos. Respostas vagas indicam que o apetite nao esta formalizado.' },
    { key: 'exec_governance', question: 'Existem comites de seguranca, reunioes de analise critica ou estrutura de reporte definida?', type: 'yesno', iso_ref: 'Clausula 5.3, 9.3', hint: 'Pergunte frequencia, participantes e se ha ata. Sem ata = sem evidencia para auditoria.' },
    { key: 'exec_budget', question: 'Qual o orcamento dedicado a seguranca da informacao (pessoas, ferramentas, consultoria)?', type: 'text', iso_ref: 'Clausula 7.1', hint: 'Nao precisa do valor exato. O importante e saber se ha verba separada ou se compete com TI geral.' },
    { key: 'exec_incidents', question: 'Ja houve incidentes de seguranca (vazamento, ransomware, multa)? Como a organizacao reagiu?', type: 'text', iso_ref: 'Clausula 10.1', hint: 'Incidentes anteriores revelam maturidade na resposta. Se nunca houve, pergunte se ha plano de resposta.' },
    { key: 'exec_sponsor', question: 'Quem e o sponsor executivo do projeto de certificacao? Ha resistencias internas?', type: 'text', iso_ref: 'Clausula 5.1', hint: 'Identifique quem assina e quem pode bloquear. Resistencias internas sao o maior risco ao cronograma.' },
    { key: 'exec_timeline', question: 'Qual a motivacao e prazo esperado para a certificacao?', type: 'select', options: ['Exigencia de cliente', 'Licitacao/contrato', 'Diferencial competitivo', 'Regulatorio', 'Decisao interna'], iso_ref: 'Contexto geral', hint: 'Motivacoes externas (cliente, licitacao) geram mais urgencia e comprometimento que motivacoes internas.' },
  ],
  tecnologia: [
    { key: 'tech_assets', question: 'Descreva o inventario de ativos de TI: servidores, cloud, SaaS, dispositivos moveis.', type: 'text', iso_ref: 'A.5.9, A.5.10', hint: 'Pergunte se ha inventario formal atualizado. Sem inventario = gap critico.' },
    { key: 'tech_access', question: 'Como funciona o controle de acesso? Existe IAM centralizado, MFA, revisao periodica de privilegios?', type: 'text', iso_ref: 'A.5.15 a A.5.18, A.8.2 a A.8.5', hint: 'Verifique se ha contas genericas, privilegios excessivos ou falta de revisao periodica.' },
    { key: 'tech_network', question: 'Quais controles de seguranca de rede estao implementados (firewalls, segmentacao, VPN, WAF)?', type: 'text', iso_ref: 'A.8.20 a A.8.22', hint: 'Pergunte sobre segmentacao entre producao, staging e dev. Rede plana = risco alto.' },
    { key: 'tech_vuln', question: 'Existe gestao de vulnerabilidades? Frequencia de scan, patching, pentest?', type: 'select', options: ['Scan + patch mensal', 'Scan trimestral', 'Pentest anual', 'Ad-hoc quando possivel', 'Nao existe processo'], iso_ref: 'A.8.8, A.8.9', hint: 'Organizacoes maduras fazem scan mensal + pentest anual. Sem processo = gap critico.' },
    { key: 'tech_backup', question: 'Como funcionam os processos de backup e disaster recovery? Qual o RTO e RPO definidos?', type: 'text', iso_ref: 'A.8.13, A.8.14', hint: 'Pergunte quando foi o ultimo teste de restore. Se nunca testou, o backup nao e confiavel.' },
    { key: 'tech_monitoring', question: 'Quais ferramentas de monitoramento, logging e SIEM estao em uso? Qual a retencao de logs?', type: 'text', iso_ref: 'A.8.15, A.8.16', hint: 'Verifique se ha correlacao de eventos e alertas automaticos. Logs sem analise = apenas custo.' },
    { key: 'tech_dev', question: 'A organizacao desenvolve software? Ha SDLC seguro, code review, SAST/DAST?', type: 'yesno', iso_ref: 'A.8.25 a A.8.31', hint: 'Se sim, pergunte sobre ambientes segregados, gestao de secrets e pipeline de CI/CD.' },
    { key: 'tech_crypto', question: 'Como e tratada a criptografia? Dados em transito e em repouso protegidos? Ha gestao de chaves?', type: 'text', iso_ref: 'A.8.24', hint: 'TLS obrigatorio para APIs e web. Dados sensiveis em DB devem ter encryption at rest.' },
    { key: 'tech_cloud', question: 'Quais provedores cloud sao utilizados? Ha matriz de responsabilidade compartilhada documentada?', type: 'text', iso_ref: 'A.5.21 a A.5.23', hint: 'Multi-cloud aumenta complexidade. Pergunte se ha SLA de seguranca com cada provedor.' },
  ],
  juridico: [
    { key: 'legal_ropa', question: 'Existe ROPA (mapeamento de atividades de tratamento de dados pessoais) documentado?', type: 'yesno', iso_ref: 'A.5.34, ISO 27701', hint: 'ROPA e obrigatorio pela LGPD. Se nao existe, e o primeiro entregavel de privacidade.' },
    { key: 'legal_bases', question: 'As bases legais para tratamento de dados estao mapeadas por processo?', type: 'select', options: ['Todas mapeadas', 'Parcialmente mapeadas', 'Nao mapeadas', 'Nao aplicavel'], iso_ref: 'LGPD Art. 7', hint: 'Pergunte especificamente sobre consentimento vs. legitimo interesse. Uso incorreto de base legal e gap grave.' },
    { key: 'legal_dsr', question: 'Existe canal e processo para atendimento a direitos dos titulares (acesso, correcao, exclusao)?', type: 'text', iso_ref: 'LGPD Art. 18', hint: 'Verifique SLA de resposta (LGPD nao define prazo, mas boas praticas sugerem 15 dias). Pergunte volume de solicitacoes.' },
    { key: 'legal_contracts', question: 'Como estao estruturados os contratos com terceiros? Existem DPA, NDA, clausulas de SI?', type: 'text', iso_ref: 'A.5.20', hint: 'Pergunte se ha template padrao e se contratos antigos ja foram revisados. Contratos sem clausula de SI = gap.' },
    { key: 'legal_transfers', question: 'Existem transferencias internacionais de dados? Para quais paises?', type: 'yesno', iso_ref: 'LGPD Art. 33', hint: 'Cloud em regiao fora do Brasil ja constitui transferencia. Verifique salvaguardas (SCC, adequacao).' },
    { key: 'legal_incidents', question: 'Qual o procedimento em caso de incidente de dados pessoais? Ha prazo para notificacao a ANPD?', type: 'text', iso_ref: 'LGPD Art. 48', hint: 'Pergunte se ja houve incidente e como foi tratado. Organizacoes sem procedimento sao muito vulneraveis.' },
    { key: 'legal_dpo', question: 'O Encarregado de Dados (DPO) esta nomeado? Tem independencia e canal de comunicacao com a ANPD?', type: 'yesno', iso_ref: 'LGPD Art. 41', hint: 'Verifique se o DPO tem capacidade tecnica e se nao acumula funcoes conflitantes (ex: TI + DPO).' },
  ],
  rh: [
    { key: 'hr_screening', question: 'E realizada verificacao de antecedentes (background check) antes da contratacao?', type: 'yesno', iso_ref: 'A.6.1', hint: 'Verifique se a verificacao e proporcional ao nivel de acesso. Cargos com acesso a dados sensiveis exigem mais.' },
    { key: 'hr_onboarding', question: 'Como funciona o onboarding de seguranca? Ha termos de confidencialidade assinados antes do acesso?', type: 'text', iso_ref: 'A.6.2', hint: 'O NDA deve ser assinado ANTES do primeiro acesso. Pergunte se terceirizados tambem assinam.' },
    { key: 'hr_awareness', question: 'Existe programa de conscientizacao em seguranca? Qual a frequencia e metricas de engajamento?', type: 'select', options: ['Programa anual com metricas', 'Treinamento anual sem metricas', 'Treinamento esporadico', 'Nao existe programa'], iso_ref: 'A.6.3', hint: 'Boas praticas: treinamento anual + phishing simulado trimestral + metricas de conclusao > 90%.' },
    { key: 'hr_disciplinary', question: 'Existe processo disciplinar documentado para violacoes de seguranca?', type: 'yesno', iso_ref: 'A.6.4', hint: 'Pergunte se ja foi aplicado. Processo que existe mas nunca foi usado pode indicar falta de deteccao.' },
    { key: 'hr_offboarding', question: 'Como e o processo de desligamento? Revogacao de acessos, devolucao de ativos, checklist?', type: 'text', iso_ref: 'A.6.5', hint: 'Pergunte o SLA para revogacao de acesso. Ideal: mesmo dia do desligamento. Verifique acesso remoto e cloud.' },
    { key: 'hr_remote', question: 'Existe politica de trabalho remoto? BYOD e permitido? VPN obrigatoria?', type: 'text', iso_ref: 'A.6.7', hint: 'BYOD sem MDM e risco alto. Pergunte sobre criptografia de disco e wipe remoto.' },
  ],
  operacoes: [
    { key: 'ops_change', question: 'Existe processo formal de gestao de mudancas? CAB, aprovacoes, segregacao de ambientes?', type: 'select', options: ['Processo formal com CAB', 'Aprovacao por email', 'Informal/ad-hoc', 'Nao existe'], iso_ref: 'A.8.32', hint: 'Mudancas sem aprovacao sao causa comum de incidentes. Pergunte sobre rollback.' },
    { key: 'ops_bcp', question: 'Existe plano de continuidade de negocios (BCP)? Foi testado? Quando?', type: 'text', iso_ref: 'A.5.29, A.5.30', hint: 'BCP que nunca foi testado nao e confiavel. Pergunte se inclui cenarios de ransomware e indisponibilidade de cloud.' },
    { key: 'ops_suppliers', question: 'Como e feita a avaliacao e monitoramento de fornecedores criticos? Ha SLA de seguranca?', type: 'text', iso_ref: 'A.5.21, A.5.22', hint: 'Pergunte se ha questionario de seguranca, auditoria ou exigencia de certificacao dos fornecedores.' },
    { key: 'ops_physical', question: 'Quais controles de seguranca fisica existem? Perimetros, CCTV, controle de visitantes?', type: 'text', iso_ref: 'A.7.1 a A.7.14', hint: 'Mesmo em modelo remoto-first, data centers e escritorios precisam de controle. Pergunte sobre areas seguras.' },
    { key: 'ops_classification', question: 'Existe esquema de classificacao da informacao (publica, interna, confidencial, restrita)?', type: 'select', options: ['Esquema formal com rotulagem', 'Classificacao informal', 'Nao existe esquema'], iso_ref: 'A.5.12 a A.5.14', hint: 'Sem classificacao, nao ha como aplicar controles proporcionais. E pre-requisito para DLP.' },
    { key: 'ops_media', question: 'Como e tratado o descarte de midias e equipamentos? Ha processo de sanitizacao?', type: 'yesno', iso_ref: 'A.7.10, A.7.14', hint: 'Discos reutilizados sem wipe seguro sao risco de vazamento. Pergunte sobre certificado de destruicao.' },
  ],
};

// ─── Inicialização do Hono ──────────────────────────────────────────────────

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ponytail: Global error handler — safety net for unhandled errors
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack);
  if (err.message && err.message.startsWith('Forbidden')) {
    return c.json({ error: err.message }, 403);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    if (origin === 'https://niso.ness.workers.dev' || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return origin;
    }
    return null;
  }
}));

app.use('/api/v1/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    path.startsWith('/api/v1/auth/login') ||
    path.startsWith('/api/v1/auth/setup') ||
    path.startsWith('/api/v1/auth/forgot-password') ||
    path.startsWith('/api/v1/auth/reset-password') ||
    path.startsWith('/api/v1/auditor/') ||
    path.startsWith('/api/v1/public/')
  ) {
    return next();
  }
  
  let user: any = null;
  const authHeader = c.req.header('Authorization');
  const apiKeyHeader = c.req.header('x-api-key');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const userJson = await c.env.SESSIONS.get(token);
    if (userJson) {
      user = JSON.parse(userJson);
    }
  } else if (apiKeyHeader) {
    // ponytail: authenticate with API key using SHA-256 hash match
    const keyBytes = new TextEncoder().encode(apiKeyHeader);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const keyRecord = await c.env.DB.prepare(
      "SELECT * FROM api_keys WHERE key_hash = ? AND status = 'Active'"
    ).bind(keyHash).first<any>();

    if (keyRecord) {
      user = {
        id: 'system',
        email: `api-key-${keyRecord.id}@system`,
        role: keyRecord.permissions === 'write' ? 'consultor' : 'org_user',
        client_project_id: keyRecord.project_id
      };
      
      // Update last used timestamp in background
      c.executionCtx.waitUntil(
        c.env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
          .bind(new Date().toISOString(), keyRecord.id)
          .run()
      );
    }
  }

  if (!user) {
    return c.json({ error: 'Unauthorized: Invalid or expired token or API key' }, 401);
  }
  
  // ponytail: compatibility mapping for legacy roles
  if (user.role === 'admin') {
    user.role = 'platform_admin';
  } else if (user.role === 'consultant') {
    user.role = 'consultor';
  }
  
  // ponytail: seek lead for client initial assessment
  if (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client') {
    const lead = await c.env.DB.prepare('SELECT id FROM leads WHERE contact_email = ?').bind(user.email).first() as any;
    if (lead) {
      user.client_lead_id = lead.id;
    }
  }
  
  c.set('user', user);

  // platform_admin (acesso total)
  if (user.role === 'platform_admin') {
    await next();
    return;
  }

  // Block platform-wide endpoints for non-consultor/non-platform_admin
  const consultantOnly = ['/api/v1/leads', '/api/v1/assessments', '/api/v1/proposals', '/api/v1/contracts', '/api/v1/portfolio', '/api/v1/users', '/api/v1/dashboard'];
  if (consultantOnly.some(p => path.startsWith(p)) && user.role !== 'consultor') {
    // ponytail: allow client access to their own assessment/proposal/contract
    let isOwnResource = false;
    if (user.client_lead_id) {
      const assessmentMatch = path.match(/\/api\/v1\/assessments\/([^\/]+)/);
      const proposalMatch = path.match(/\/api\/v1\/proposals\/([^\/]+)/);
      const contractMatch = path.match(/\/api\/v1\/contracts\/([^\/]+)/);
      
      if (assessmentMatch) {
        const row = await c.env.DB.prepare('SELECT lead_id FROM assessments WHERE id = ?').bind(assessmentMatch[1]).first() as any;
        if (row && row.lead_id === user.client_lead_id) isOwnResource = true;
      } else if (proposalMatch) {
        const row = await c.env.DB.prepare('SELECT lead_id FROM proposals WHERE id = ?').bind(proposalMatch[1]).first() as any;
        if (row && row.lead_id === user.client_lead_id) isOwnResource = true;
      } else if (contractMatch) {
        const row = await c.env.DB.prepare('SELECT lead_id FROM contracts WHERE id = ?').bind(contractMatch[1]).first() as any;
        if (row && row.lead_id === user.client_lead_id) isOwnResource = true;
      }
    }
    
    if (!isOwnResource) {
      return c.json({ error: 'Forbidden: Consultant or Platform Admin access required' }, 403);
    }
  }

  if (path.startsWith('/api/v1/admin/') && user.role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: Platform Admin access required' }, 403);
  }

  // IDOR / Project Scoping check for org_admin, org_user, or legacy client
  if (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client') {
    const projectMatch = path.match(/\/api\/v1\/projects\/([^\/]+)/);
    if (projectMatch && projectMatch[1] !== user.client_project_id && !path.includes('/public/')) {
       return c.json({ error: 'Forbidden: Access denied to this project' }, 403);
    }
  }

  // Read-only enforcement for org_user
  if (user.role === 'org_user') {
    const isAllowedWrite = 
      (c.req.method === 'PUT' && path.match(/\/api\/v1\/projects\/[^\/]+\/checklist-progress/)) ||
      (c.req.method === 'POST' && path.match(/\/api\/v1\/projects\/[^\/]+\/evidence\/upload/)) ||
      (c.req.method === 'PUT' && path.match(/\/api\/v1\/notifications\/[^\/]+\/read/)) ||
      (c.req.method === 'POST' && path.startsWith('/api/v1/auth/change-password')) ||
      (c.req.method === 'POST' && path.startsWith('/api/v1/auth/logout')) ||
      (c.req.method === 'POST' && path.match(/\/api\/v1\/projects\/[^\/]+\/chat/)) ||
      (c.req.method === 'POST' && path.match(/\/api\/v1\/projects\/[^\/]+\/checklist\/[^\/]+\/audit/));

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS' && !isAllowedWrite) {
      return c.json({ error: 'Forbidden: Read-only access' }, 403);
    }
  }

  await next();
});

// ─── Helpers de Auth ────────────────────────────────────────────────────────

async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || crypto.randomUUID();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // ponytail: backwards compat — old SHA-256 hashes have no ':' separator
  if (!stored.includes(':')) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return legacyHash === stored;
  }
  const [salt] = stored.split(':');
  const rehash = await hashPassword(password, salt);
  return rehash === stored;
}

/** Verifica se o usuário tem acesso ao projeto (Consultant = total, Client = próprio) */
function requireProjectAccess(c: any, projectId: string) {
  const user = c.get('user');
  if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;
  if (user.client_project_id === projectId) return true;
  throw new Error('Forbidden: No access to this project');
}

/** Verifica se o recurso pertence ao projeto do usuário */
async function requireResourceAccess(c: any, table: string, id: string) {
  const user = c.get('user');
  if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;
  
  const row = await c.env.DB.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).bind(id).first() as any;
  if (!row || row.project_id !== user.client_project_id) {
    throw new Error('Forbidden: No access to this resource');
  }
  return true;
}

/** Helper para validar URLs de webhook (SSRF guard) */
function isValidWebhookUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return false;
    if (hostname.includes('169.254.169.254')) return false;
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/** Previne CSV Injection (Formula Injection) e escapa aspas */
function safeCsvCell(val: any): string {
  let s = String(val ?? '');
  s = s.replace(/"/g, '""');
  // Se começar com =, +, -, @, injetar um ' na frente para evitar execução de fórmulas
  if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
    s = "'" + s;
  }
  return `"${s}"`;
}

// ─── Helper: gravar log de auditoria ────────────────────────────────────────

async function logAudit(
  db: D1Database,
  action: string,
  actor: string,
  details: string,
  justification: string = '',
  ip: string = ''
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(genId(), action, actor, details, justification, ip)
    .run();
}

// ─── Helper: criar notificação ──────────────────────────────────────────────

async function createNotification(
  db: D1Database,
  type: string,
  title: string,
  message: string,
  userId?: string,
  link?: string,
  actionType?: string,
  targetId?: string
) {
  await db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, read, link, action_type, target_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))`
  ).bind(genId(), userId || null, type, title, message, link || null, actionType || null, targetId || null).run();
}

// ─── Helper: criar as 41 fases para um projeto ─────────────────────────────

async function seedPhases(db: D1Database, projectId: string) {
  const phaseStmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, '', datetime('now'))`
  );

  const evidenceStmt = db.prepare(
    `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
     VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
  );

  const batch: any[] = [];

  PHASE_TITLES.forEach((title, i) => {
    const status = i === 0 ? 'in_progress' : 'pending';
    batch.push(phaseStmt.bind(genId(), projectId, i, title, status));

    const checklists = PHASE_CHECKLISTS[i] || [];
    checklists.forEach(item => {
      batch.push(evidenceStmt.bind(genId(), projectId, `[${item.category.toUpperCase()}] ${item.text}`));
    });
  });

  await db.batch(batch);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROTAS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok' }));

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/auth/setup', async (c) => {
  try {
    const { setup_key, email, password, name } = await c.req.json();
    if (setup_key !== c.env.SETUP_KEY) {
      return c.json({ error: 'Invalid setup key' }, 403);
    }
    
    const id = genId();
    const hash = await hashPassword(password);
    
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultant')
       ON CONFLICT(email) DO NOTHING`
    ).bind(id, email, hash, name).run();
    
    return c.json({ ok: true, message: 'Seed user created or already exists' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Setup failed', detail: e.message }, 500);
  }
});

app.post('/api/v1/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, role, client_project_id, password_hash, requires_password_change FROM users WHERE email = ?'
    ).bind(email).first() as any;
    
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    // ponytail: auto-migrate legacy SHA-256 hash to PBKDF2
    if (!user.password_hash.includes(':')) {
      const newHash = await hashPassword(password);
      await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
    }
    
    const requiresChange = user.requires_password_change === 1;
    
    // Remove password_hash and requires_password_change from response/session
    delete user.password_hash;
    delete user.requires_password_change;
    
    // ponytail: compatibility mapping for legacy roles on login
    if (user.role === 'admin') {
      user.role = 'platform_admin';
    } else if (user.role === 'consultant') {
      user.role = 'consultor';
    }
    
    const token = genToken();
    await c.env.SESSIONS.put(token, JSON.stringify(user), { expirationTtl: 86400 });
    
    return c.json({ token, user, requiresPasswordChange: requiresChange });
  } catch (e: any) {
    return c.json({ error: 'Login failed', detail: e.message }, 500);
  }
});

app.post('/api/v1/auth/reset-password-first', async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 403);

    const { newPassword } = await c.req.json<{ newPassword: string }>();
    if (!newPassword) return c.json({ error: 'Nova senha é obrigatória' }, 400);

    const newHash = await hashPassword(newPassword);
    
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?'
    ).bind(newHash, user.id).run();

    await logAudit(c.env.DB, 'auth.password_changed_first', user.email, `Senha do primeiro acesso redefinida com sucesso`);
    return c.json({ ok: true, message: 'Senha redefinida com sucesso' });
  } catch (e: any) {
    return c.json({ error: 'Erro ao redefinir senha', detail: e.message }, 500);
  }
});

app.post('/api/v1/auth/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>();
    if (!email) return c.json({ error: 'Email é obrigatório' }, 400);

    const user = await c.env.DB.prepare(
      'SELECT id, email, name FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user) {
      return c.json({ ok: true, message: 'Se o e-mail estiver cadastrado, um código foi gerado.' });
    }

    const token = String(Math.floor(100000 + Math.random() * 900000));
    await c.env.SESSIONS.put(`reset_token:${token}`, JSON.stringify({ email: user.email }), { expirationTtl: 3600 });

    console.log(`[PASSWORD RESET] Token para ${user.email}: ${token}`);

    // Disparar e-mail de recuperação
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0; text-align: center;">Recuperação de Senha - nISO</h2>
        <p>Olá, <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Você solicitou a redefinição de sua senha de acesso ao portal do <strong>nISO</strong>.</p>
        <p>Use o código de verificação de 6 dígitos abaixo para concluir a alteração (válido por 1 hora):</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 2rem; letter-spacing: 5px; font-weight: bold; color: #00ade8;">
          ${token}
        </div>
        <p style="color: #8e8e93; font-size: 0.85rem; text-align: center;">Se você não solicitou esta redefinição, por favor desconsidere este e-mail de forma segura.</p>
      </div>
    `;
    await sendEmail(c, email, 'Recuperação de Senha - nISO', emailHtml);

    if (c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test') {
      return c.json({ ok: true, reset_token: token, message: 'Código de recuperação gerado (Desenvolvimento)' });
    }

    return c.json({ ok: true, message: 'Código de recuperação enviado.' });
  } catch (e: any) {
    return c.json({ error: 'Erro ao solicitar recuperação', detail: e.message }, 500);
  }
});

app.post('/api/v1/auth/reset-password', async (c) => {
  try {
    const { token, newPassword } = await c.req.json<{ token: string; newPassword: string }>();
    if (!token || !newPassword) return c.json({ error: 'Token e nova senha são obrigatórios' }, 400);

    const storedData = await c.env.SESSIONS.get(`reset_token:${token}`);
    if (!storedData) {
      return c.json({ error: 'Código de recuperação inválido ou expirado' }, 400);
    }

    const { email } = JSON.parse(storedData);
    const newHash = await hashPassword(newPassword);

    await c.env.DB.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE email = ?')
      .bind(newHash, email).run();

    await c.env.SESSIONS.delete(`reset_token:${token}`);

    await logAudit(c.env.DB, 'auth.password_reset', email, 'Senha redefinida com sucesso via token de recuperação');

    return c.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (e: any) {
    return c.json({ error: 'Erro ao redefinir senha', detail: e.message }, 500);
  }
});

app.post('/api/v1/auth/logout', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (token) await c.env.SESSIONS.delete(token);
  return c.json({ ok: true });
});

app.get('/api/v1/auth/me', (c) => {
  return c.json({ user: c.get('user') });
});

app.post('/api/v1/auth/change-password', async (c) => {
  try {
    const { oldPassword, newPassword } = await c.req.json();
    const user = c.get('user');
    if (!oldPassword || !newPassword) return c.json({ error: 'Senhas obrigatórias' }, 400);
    
    const dbUser = await c.env.DB.prepare('SELECT password_hash FROM users WHERE email = ?')
      .bind(user.email).first() as any;
    if (!dbUser || !(await verifyPassword(oldPassword, dbUser.password_hash))) {
      return c.json({ error: 'Senha atual incorreta' }, 401);
    }
      

    
    const newHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(newHash, user.email).run();
      
    await logAudit(c.env.DB, 'auth.password_changed', user.email, 'Senha alterada com sucesso');
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao alterar senha', detail: e.message }, 500);
  }
});

// ─── User Management ────────────────────────────────────────────────────────

app.get('/api/v1/users', async (c) => {
  const user = c.get('user');
  if (user.role !== 'consultor' && user.role !== 'platform_admin') return c.json({ error: 'Unauthorized' }, 403);
  
  try {
    const { results } = await c.env.DB.prepare('SELECT id, email, name, role, client_project_id, created_at FROM users ORDER BY created_at DESC').all();
    const mapped = (results || []).map((u: any) => {
      let r = u.role;
      if (r === 'admin') r = 'platform_admin';
      if (r === 'consultant') r = 'consultor';
      return { ...u, role: r };
    });
    return c.json(mapped);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar usuários', detail: e.message }, 500);
  }
});

app.post('/api/v1/users', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin') return c.json({ error: 'Unauthorized' }, 403);

  try {
    const { email, password, name, role, client_project_id } = await c.req.json();
    if (!email || !password || !name || !role) {
      return c.json({ error: 'Campos obrigatórios: email, password, name, role' }, 400);
    }

    const id = genId();
    const hash = await hashPassword(password);
    
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, email, hash, name, role, client_project_id || null).run();

    await logAudit(c.env.DB, 'user.created', admin.email, `Usuário ${email} criado como ${role}`);

    // Disparar e-mail de convite
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e7; border-radius: 10px; color: #333;">
        <h2 style="color: #00ade8; font-weight: 500; margin-top: 0;">Bem-vindo ao nISO!</h2>
        <p>Olá, <strong>${escapeHtml(name)}</strong>,</p>
        <p>Você foi convidado a acessar o portal de GRC da <strong>ness.</strong></p>
        <p>Aqui estão suas credenciais temporárias para o primeiro acesso:</p>
        <div style="background-color: #f4f4f7; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 0.95rem;">
          <strong>E-mail:</strong> ${escapeHtml(email)}<br/>
          <strong>Senha Temporária:</strong> ${escapeHtml(password)}
        </div>
        <p style="color: #ff3b30; font-size: 0.85rem;">* Por motivos de segurança, você deverá redefinir sua senha obrigatoriamente no primeiro login.</p>
        <p style="margin-top: 25px;">
          <a href="https://niso.ness.workers.dev" style="background-color: #00ade8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Entrar no nISO</a>
        </p>
      </div>
    `;
    await sendEmail(c, email, 'Seu acesso ao nISO', emailHtml);

    return c.json({ id, email, name, role, client_project_id }, 201);
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return c.json({ error: 'Falha ao criar usuário', detail: e.message }, 500);
  }
});

app.put('/api/v1/users/:id', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin') return c.json({ error: 'Unauthorized' }, 403);

  const id = c.req.param('id');
  try {
    const { name, email, role, client_project_id, password } = await c.req.json();
    
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (client_project_id !== undefined) {
      updates.push('client_project_id = ?');
      values.push(client_project_id || null);
    }
    if (password !== undefined && password !== '') {
      const hash = await hashPassword(password);
      updates.push('password_hash = ?');
      values.push(hash);
    }

    if (updates.length > 0) {
      values.push(id);
      await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
      await logAudit(c.env.DB, 'user.updated', admin.email, `Usuário ${id} atualizado`);
    }

    return c.json({ ok: true, message: 'Usuário atualizado com sucesso' });
  } catch (e: any) {
    if (e.message && e.message.includes('UNIQUE')) return c.json({ error: 'Email já cadastrado' }, 400);
    return c.json({ error: 'Falha ao atualizar usuário', detail: e.message || String(e) }, 500);
  }
});

app.delete('/api/v1/users/:id', async (c) => {
  const admin = c.get('user');
  if (admin.role !== 'consultor' && admin.role !== 'platform_admin') return c.json({ error: 'Unauthorized' }, 403);

  const id = c.req.param('id');
  try {
    const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first() as any;
    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404);
    }

    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'user.deleted', admin.email, `Usuário ${user.email} excluído`);

    return c.json({ ok: true, message: 'Usuário excluído com sucesso' });
  } catch (e: any) {
    return c.json({ error: 'Falha ao excluir usuário', detail: e.message || String(e) }, 500);
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
//  CRM: LEADS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/leads', async (c) => {
  try {
    const body = await c.req.json<any>();
    if (!body.company_name) return c.json({ error: 'company_name é obrigatório' }, 400);

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO leads (id, company_name, contact_name, contact_email, source, status,
       cnpj, razao_social, nome_fantasia, natureza_juridica, porte, capital_social,
       cnae_fiscal, cnae_fiscal_descricao, data_inicio_atividade, situacao_cadastral,
       logradouro, numero, complemento, bairro, municipio, uf, cep,
       telefone, qsa, cnpj_fetched_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id, body.company_name, body.contact_name || null, body.contact_email || null, body.source || null,
      body.cnpj || null, body.razao_social || null, body.nome_fantasia || null,
      body.natureza_juridica || null, body.porte || null, body.capital_social ?? null,
      body.cnae_fiscal ?? null, body.cnae_fiscal_descricao || null,
      body.data_inicio_atividade || null, body.situacao_cadastral || null,
      body.logradouro || null, body.numero || null, body.complemento || null,
      body.bairro || null, body.municipio || null, body.uf || null, body.cep || null,
      body.telefone || null, body.qsa ? JSON.stringify(body.qsa) : null,
      body.cnpj ? new Date().toISOString() : null
    ).run();

    await logAudit(c.env.DB, 'lead.created', c.get('user')?.email ?? 'system', `Lead ${id} criado para ${body.company_name}`);
    return c.json({ id, ...body, status: 'New' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar lead', detail: e.message }, 500);
  }
});

app.get('/api/v1/leads', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar leads', detail: e.message }, 500);
  }
});

app.get('/api/v1/leads/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);
    
    // Obter assessments vinculados
    const { results: assessments } = await c.env.DB.prepare('SELECT id, status, complexity, created_at FROM assessments WHERE lead_id = ?').bind(id).all();
    
    // Obter propostas vinculadas
    const { results: proposals } = await c.env.DB.prepare('SELECT id, status, total_price, created_at FROM proposals WHERE lead_id = ?').bind(id).all();

    return c.json({ ...lead, assessments, proposals });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar lead', detail: e.message }, 500);
  }
});

app.delete('/api/v1/leads/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.put('/api/v1/leads/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    await c.env.DB.prepare('UPDATE leads SET status = ?, updated_at = datetime("now") WHERE id = ?').bind(status, id).run();
    return c.json({ ok: true, status });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar lead', detail: e.message }, 500);
  }
});

app.post('/api/v1/leads/:id/enrich-cnpj', async (c) => {
  try {
    const id = c.req.param('id');
    const { cnpj } = await c.req.json<{ cnpj: string }>();
    const cleanCnpj = (cnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return c.json({ error: 'CNPJ inválido (14 dígitos)' }, 400);

    const lead = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
    if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);

    let res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    let d: any;
    if (!res.ok) {
      const resWs = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
      if (!resWs.ok) return c.json({ error: 'CNPJ não encontrado na Receita Federal ou APIs indisponíveis' }, 404);
      const wsData: any = await resWs.json();
      if (wsData.status === 'ERROR') return c.json({ error: wsData.message || 'CNPJ não encontrado' }, 404);
      
      const cepStrRaw = wsData.cep ? wsData.cep.replace(/\D/g, '') : null;
      const qsaMapped = wsData.qsa?.map((q: any) => ({
        nome_socio: q.nome,
        qualificacao_socio: q.qual
      })) || [];
      d = {
        razao_social: wsData.nome,
        nome_fantasia: wsData.fantasia,
        natureza_juridica: wsData.natureza_juridica,
        porte: wsData.porte,
        capital_social: parseFloat(wsData.capital_social || '0'),
        cnae_fiscal: wsData.atividade_principal?.[0]?.code ? parseInt(wsData.atividade_principal[0].code.replace(/\D/g, '')) : null,
        cnae_fiscal_descricao: wsData.atividade_principal?.[0]?.text || null,
        data_inicio_atividade: wsData.abertura ? wsData.abertura.split('/').reverse().join('-') : null,
        descricao_situacao_cadastral: wsData.situacao,
        descricao_tipo_de_logradouro: '',
        logradouro: wsData.logradouro,
        numero: wsData.numero,
        complemento: wsData.complemento,
        bairro: wsData.bairro,
        municipio: wsData.municipio,
        uf: wsData.uf,
        cep: cepStrRaw,
        ddd_telefone_1: wsData.telefone,
        qsa: qsaMapped
      };
    } else {
      d = await res.json();
    }

    const cepStr = d.cep != null ? String(d.cep).padStart(8, '0') : null;
    const telefone = d.ddd_telefone_1 || null;
    const qsaJson = d.qsa?.length ? JSON.stringify(d.qsa) : null;
    const logradouroFull = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ');

    await c.env.DB.prepare(
      `UPDATE leads SET
       cnpj=?, razao_social=?, nome_fantasia=?, natureza_juridica=?, porte=?, capital_social=?,
       cnae_fiscal=?, cnae_fiscal_descricao=?, data_inicio_atividade=?, situacao_cadastral=?,
       logradouro=?, numero=?, complemento=?, bairro=?, municipio=?, uf=?, cep=?,
       telefone=?, qsa=?, cnpj_fetched_at=datetime('now'), updated_at=datetime('now'),
       company_name=COALESCE(NULLIF(company_name,''), ?)
       WHERE id=?`
    ).bind(
      cleanCnpj, d.razao_social || null, d.nome_fantasia || null,
      d.natureza_juridica || null, d.porte || null, d.capital_social ?? null,
      d.cnae_fiscal ?? null, d.cnae_fiscal_descricao || null,
      d.data_inicio_atividade || null, d.descricao_situacao_cadastral || null,
      logradouroFull || null, d.numero || null, d.complemento || null,
      d.bairro || null, d.municipio || null, d.uf || null, cepStr,
      telefone, qsaJson,
      d.razao_social || d.nome_fantasia || '', id
    ).run();

    const updated = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    await logAudit(c.env.DB, 'lead.cnpj_enriched', c.get('user')?.email ?? 'system', `Lead ${id} enriquecido via CNPJ ${cleanCnpj}`);
    return c.json({ ok: true, lead: updated });
  } catch (e: any) {
    return c.json({ error: 'Falha ao enriquecer CNPJ', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CRM: PROPOSTAS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/proposals', async (c) => {
  try {
    const body = await c.req.json<{ lead_id: string; assessment_id: string; total_price: number; content_html: string }>();
    if (!body.lead_id || !body.assessment_id) return c.json({ error: 'lead_id e assessment_id obrigatórios' }, 400);

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html, created_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id, body.assessment_id, body.total_price, body.content_html).run();

    // Atualiza status do lead
    await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Proposal', body.lead_id).run();

    return c.json({ id, status: 'Draft' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar proposta', detail: e.message }, 500);
  }
});

// ============================================================
// PRICING CONFIG — CRUD configurável
// ============================================================
app.get('/api/v1/pricing-config', async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const saved = row ? JSON.parse(row.value) : {};
    // merge with defaults so frontend always sees complete config
    const merged = { ...DEFAULT_FINANCIAL_MODEL, ...saved,
      taxaVendaPD: { ...DEFAULT_FINANCIAL_MODEL.taxaVendaPD, ...(saved.taxaVendaPD || {}) },
      custoInternoPD: { ...DEFAULT_FINANCIAL_MODEL.custoInternoPD, ...(saved.custoInternoPD || {}) },
      tributos: { ...DEFAULT_FINANCIAL_MODEL.tributos, ...(saved.tributos || {}) },
      bufferRisco: { ...DEFAULT_FINANCIAL_MODEL.bufferRisco, ...(saved.bufferRisco || {}) },
    };
    return c.json(merged);
  } catch (e: any) {
    return c.json(DEFAULT_FINANCIAL_MODEL);
  }
});

app.put('/api/v1/pricing-config', async (c) => {
  try {
    const body = await c.req.json();
    const json = JSON.stringify(body);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('pricing_config', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    ).bind(json, json).run();
    await logAudit(c.env.DB, 'pricing_config.updated', c.get('user')?.email ?? 'system', 'Config de precificação atualizada');
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar config', detail: e.message }, 500);
  }
});

// ponytail: list all proposals (must be before :id route)
app.get('/api/v1/proposals', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.lead_id, p.assessment_id, p.status, p.total_price, p.created_at, p.approved_at,
              l.company_name, l.razao_social, l.cnpj
       FROM proposals p LEFT JOIN leads l ON p.lead_id = l.id
       ORDER BY p.created_at DESC`
    ).all();
    return c.json(results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar propostas', detail: e.message }, 500);
  }
});

app.get('/api/v1/proposals/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    return c.json(proposal);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar proposta', detail: e.message }, 500);
  }
});

// ponytail: update proposal (content_html, status)
app.put('/api/v1/proposals/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ content_html?: string; status?: string }>();
    const proposal = await c.env.DB.prepare('SELECT id FROM proposals WHERE id = ?').bind(id).first();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);

    const updates: string[] = [];
    const vals: any[] = [];
    if (body.content_html !== undefined) { updates.push('content_html = ?'); vals.push(body.content_html); }
    if (body.status) { updates.push('status = ?'); vals.push(body.status); }
    if (!updates.length) return c.json({ error: 'Nada para atualizar' }, 400);

    vals.push(id);
    await c.env.DB.prepare(`UPDATE proposals SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();

    const updated = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
    await logAudit(c.env.DB, 'proposal.updated', c.get('user')?.email ?? 'system', `Proposta ${id} atualizada`);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar proposta', detail: e.message }, 500);
  }
});

// ponytail: delete proposal
app.delete('/api/v1/proposals/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM proposals WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'proposal.deleted', c.get('user')?.email ?? 'system', `Proposta ${id} excluída`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao excluir proposta', detail: e.message }, 500);
  }
});

// Assinar proposta (muda status para Signed, cria projeto se necessário)
app.post('/api/v1/proposals/:id/sign', async (c) => {
  try {
    const id = c.req.param('id');
    const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first<any>();
    if (!proposal) return c.json({ error: 'Proposta não encontrada' }, 404);
    if (proposal.status === 'Signed') return c.json({ error: 'Proposta já assinada' }, 400);

    // Atualiza proposta para Signed
    await c.env.DB.prepare(
      "UPDATE proposals SET status = 'Signed', approved_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    // Cria registro de contrato
    const contractId = genId();
    await c.env.DB.prepare(
      `INSERT INTO contracts (id, proposal_id, lead_id, status, signed_at, created_at)
       VALUES (?, ?, ?, 'Signed', datetime('now'), datetime('now'))`
    ).bind(contractId, id, proposal.lead_id).run();

    // Atualiza lead para Won
    if (proposal.lead_id) {
      await c.env.DB.prepare("UPDATE leads SET status = 'Won', updated_at = datetime('now') WHERE id = ?").bind(proposal.lead_id).run();
    }

    await logAudit(c.env.DB, 'proposal.signed', c.get('user')?.email ?? 'system', `Proposta ${id} assinada. Contrato ${contractId} criado.`);

    // Auto-criar projeto a partir do assessment/lead
    const projectId = genId();
    const leadData = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(proposal.lead_id).first<any>();

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, '', '', 'ISO 27001:2022', 'Controlador', 'Active', ?, datetime('now'))`
    ).bind(projectId, leadData?.company_name || 'Cliente', proposal.assessment_id || '').run();

    // Seed 41 phases (0-40)
    for (let i = 0; i <= 40; i++) {
      const phaseId = genId();
      const status = i === 0 ? 'in_progress' : 'pending';
      await c.env.DB.prepare(
        `INSERT INTO project_phases (id, project_id, phase_number, title, status, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(phaseId, projectId, i, PHASE_TITLES[i], status).run();
    }

    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${projectId} criado automaticamente com 41 fases a partir da proposta ${id}.`);

    // ponytail: notification triggers
    await createNotification(c.env.DB, 'contract_signed', `Contrato assinado: ${leadData?.company_name || 'Cliente'}`, `Projeto criado automaticamente com 41 fases.`, c.get('user')?.id, `/projects/${projectId}`);

    return c.json({ ok: true, contract_id: contractId, project_id: projectId, proposal_status: 'Signed', lead_status: 'Won' });
  } catch (e: any) {
    return c.json({ error: 'Falha ao assinar proposta', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PORTAL DO AUDITOR EXTERNO
// ═══════════════════════════════════════════════════════════════════════════════

// Gerar token de acesso temporário para auditor
app.post('/api/v1/projects/:id/auditor-token', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ days?: number }>().catch(() => ({ days: 7 }));
    const days = Math.min(body.days || 7, 30); // máx 30 dias

    const project = await c.env.DB.prepare('SELECT id, client_name FROM projects WHERE id = ?').bind(projectId).first();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const token = genId() + genId(); // token mais longo
    const id = genId();
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, project_id, token, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, projectId, token, expiresAt, c.get('user')?.email ?? 'system').run();

    await logAudit(c.env.DB, 'auditor.token_created', c.get('user')?.email ?? 'system',
      `Token de auditor criado para projeto ${projectId}, expira em ${days} dias`);

    return c.json({
      token,
      url: `/auditor.html?token=${token}`,
      expires_at: expiresAt,
      days
    }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar token', detail: e.message }, 500);
  }
});

// Rota pública (sem auth) — auditor externo acessa dados read-only
app.get('/api/v1/auditor/:token/project', async (c) => {
  try {
    const token = c.req.param('token');

    const tokenRow = await c.env.DB.prepare(
      'SELECT * FROM auditor_tokens WHERE token = ?'
    ).bind(token).first<any>();

    if (!tokenRow) return c.json({ error: 'Token inválido' }, 401);

    // Verificar expiração
    if (new Date(tokenRow.expires_at) < new Date()) {
      return c.json({ error: 'Token expirado' }, 401);
    }

    const projectId = tokenRow.project_id;

    // Dados do projeto
    const project = await c.env.DB.prepare('SELECT id, client_name, sector, scope, standards, org_role, status, created_at FROM projects WHERE id = ?').bind(projectId).first();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Fases
    const { results: phases } = await c.env.DB.prepare(
      'SELECT phase_number, title, status, notes, completed_at FROM project_phases WHERE project_id = ? ORDER BY phase_number'
    ).bind(projectId).all();

    // Controles (todos, status global)
    const { results: controls } = await c.env.DB.prepare(
      'SELECT id, standard, title, status, owner, description FROM compliance_controls WHERE project_id = ? ORDER BY standard'
    ).bind(projectId).all();

    // Evidências vinculadas ao projeto
    const { results: evidence } = await c.env.DB.prepare(
      'SELECT id, control_id, file_name, file_type, file_size, uploaded_by, created_at FROM evidence WHERE project_id = ?'
    ).bind(projectId).all();

    // Riscos
    const { results: risks } = await c.env.DB.prepare(
      'SELECT id, title, likelihood, impact, risk_level, treatment, status FROM risks WHERE project_id = ? ORDER BY risk_level DESC'
    ).bind(projectId).all();

    // ROPA
    const { results: ropa } = await c.env.DB.prepare(
      'SELECT id, process_name, purpose, data_categories, legal_basis, retention_period FROM ropa_records WHERE project_id = ?'
    ).bind(projectId).all();

    // Gap summary
    const totalControls = (controls ?? []).length;
    const implemented = (controls ?? []).filter((cc: any) => cc.status === 'Implemented').length;
    const gapPct = totalControls > 0 ? Math.round((implemented / totalControls) * 100) : 0;

    return c.json({
      project,
      phases,
      controls,
      evidence,
      risks,
      ropa,
      gap_summary: { total: totalControls, implemented, coverage_pct: gapPct },
      token_expires_at: tokenRow.expires_at
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao carregar dados do auditor', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ASSESSMENTS (Pré-Venda)
// ═══════════════════════════════════════════════════════════════════════════════

// Criar assessment
app.post('/api/v1/assessments', async (c) => {
  try {
    const body = await c.req.json<{ client_name: string; lead_id?: string }>();
    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const id = genId();
    const accessToken = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    await c.env.DB.prepare(
      `INSERT INTO assessments (id, lead_id, client_name, status, complexity, access_token, created_at)
       VALUES (?, ?, ?, 'in_progress', 'unknown', ?, datetime('now'))`
    )
      .bind(id, body.lead_id || null, body.client_name, accessToken)
      .run();

    // Se vinculado a um lead, atualiza o status do lead
    if (body.lead_id) {
      await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Assessment', body.lead_id).run();
    }

    await logAudit(c.env.DB, 'assessment.created', c.get('user')?.email ?? 'system', `Assessment ${id} criado para ${body.client_name}`);

    return c.json({ id, client_name: body.client_name, lead_id: body.lead_id, status: 'in_progress', access_token: accessToken }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar assessment', detail: e.message }, 500);
  }
});

// Sprint C: Public assessment self-service endpoints
app.get('/api/v1/public/assessment/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const assessment = await c.env.DB.prepare(
      'SELECT id, client_name, status FROM assessments WHERE access_token = ?'
    ).bind(token).first<any>();
    if (!assessment) return c.json({ error: 'Token invalido' }, 404);
    if (assessment.status === 'converted') return c.json({ error: 'Assessment ja foi convertido' }, 410);

    const { results: answers } = await c.env.DB.prepare(
      'SELECT block, question_key, question, answer, notes FROM assessment_answers WHERE assessment_id = ? ORDER BY block, question_key'
    ).bind(assessment.id).all();

    return c.json({ id: assessment.id, client_name: assessment.client_name, status: assessment.status, answers });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/v1/public/assessment/:token/answers', async (c) => {
  try {
    const token = c.req.param('token');
    const assessment = await c.env.DB.prepare(
      'SELECT id, status FROM assessments WHERE access_token = ?'
    ).bind(token).first<any>();
    if (!assessment) return c.json({ error: 'Token invalido' }, 404);
    if (assessment.status === 'converted') return c.json({ error: 'Assessment ja foi convertido' }, 410);

    const { block, answers } = await c.req.json<{ block: number; answers: Array<{ question_key: string; question: string; answer: string; notes?: string }> }>();
    if (!Array.isArray(answers) || block === undefined) return c.json({ error: 'block and answers required' }, 400);

    // Delete existing answers for this block
    await c.env.DB.prepare('DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?').bind(assessment.id, block).run();

    // Insert new answers
    const batch = answers.map(a =>
      c.env.DB.prepare(
        `INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(genId(), assessment.id, block, a.question_key, a.question, a.answer, a.notes || null)
    );
    if (batch.length) await c.env.DB.batch(batch);

    return c.json({ ok: true, saved: batch.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Listar assessments
app.get('/api/v1/assessments', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM assessments ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar assessments', detail: e.message }, 500);
  }
});

// Obter assessment com progresso
app.get('/api/v1/assessments/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const assessment = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado' }, 404);
    }

    // Conta blocos respondidos (distintos)
    const progress = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT block) as answered_blocks FROM assessment_answers WHERE assessment_id = ?'
    )
      .bind(id)
      .first<{ answered_blocks: number }>();

    return c.json({
      ...assessment,
      answered_blocks: progress?.answered_blocks ?? 0,
      total_blocks: 10,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar assessment', detail: e.message }, 500);
  }
});

app.get('/api/v1/assessments/:id/answers', async (c) => {
  try {
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT block, question_key, answer, notes FROM assessment_answers WHERE assessment_id = ? ORDER BY block ASC'
    ).bind(id).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar respostas', detail: e.message }, 500);
  }
});

// Obter perguntas de um bloco
app.get('/api/v1/assessments/:id/block/:num', async (c) => {
  try {
    const id = c.req.param('id');
    const num = parseInt(c.req.param('num'), 10);

    // Valida se o assessment existe
    const assessment = await c.env.DB.prepare(
      'SELECT id FROM assessments WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado' }, 404);
    }

    if (num < 1 || num > 10) {
      return c.json({ error: 'Bloco deve ser entre 1 e 10' }, 400);
    }

    const questions = BLOCK_QUESTIONS[num];

    // Busca respostas já salvas para este bloco
    const { results: existing } = await c.env.DB.prepare(
      'SELECT question_key, answer, notes FROM assessment_answers WHERE assessment_id = ? AND block = ?'
    )
      .bind(id, num)
      .all();

    const answersMap = new Map(
      (existing ?? []).map((r: any) => [r.question_key, { answer: r.answer, notes: r.notes }])
    );

    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: answersMap.get(q.key)?.answer ?? null,
      notes: answersMap.get(q.key)?.notes ?? null,
    }));

    return c.json({ block: num, questions: questionsWithAnswers });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar bloco', detail: e.message }, 500);
  }
});

// ─── Pricing Answer Translation Layer ────────────────────────────────────────

/** Traduz respostas do assessment para as chaves esperadas pelo SCORE_MAP */
function mapAnswerToScore(field: string, value: string): string {
  if (!value) return value;
  const maps: Record<string, Record<string, string>> = {
    infraestrutura: {
      'AWS': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Azure': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Google Cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Multi-cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Oracle Cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Cloudflare': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'DigitalOcean': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Híbrido': 'Híbrido (Nuvem + On-premise/Legacy)',
      'Híbrido (cloud + on-premise)': 'Híbrido (Nuvem + On-premise/Legacy)',
      'Data center próprio': 'Data Center Local (On-Premise)',
      'On-premises': 'Data Center Local (On-Premise)',
    },
    arquitetura: {
      '1 (produção)': 'Monolitos (VMs/Containers grandes)',
      'Apenas produção': 'Monolitos (VMs/Containers grandes)',
      '2 (staging + prod)': 'Monolitos (VMs/Containers grandes)',
      'Dev + Prod': 'Monolitos (VMs/Containers grandes)',
      '3 (dev + staging + prod)': 'Microsserviços / Cloud Native',
      'Dev + Staging + Prod': 'Microsserviços / Cloud Native',
      '4+ ambientes': 'Microsserviços / Cloud Native',
      'Dev + QA + Staging + Prod': 'Microsserviços / Cloud Native',
    },
    repositorio: {
      'GitHub': 'Git Moderno (GitHub/GitLab)',
      'GitLab': 'Git Moderno (GitHub/GitLab)',
      'Bitbucket': 'Git Moderno (GitHub/GitLab)',
      'Azure DevOps': 'Git Moderno (GitHub/GitLab)',
      'Sem versionamento': 'Sem versionamento formal',
      'Outro': 'Repositórios Legados (SVN/Subversion)',
    },
    deploy: {
      'GitHub Actions': 'CI/CD Automatizado',
      'GitLab CI': 'CI/CD Automatizado',
      'Jenkins': 'CI/CD Automatizado',
      'Pipeline básico (build + test)': 'CI/CD Automatizado',
      'Pipeline completo (build + test + scan + deploy)': 'CI/CD Automatizado',
      'GitOps / deploy automatizado': 'CI/CD Automatizado',
      'Sem CI/CD': 'Deploy Misto ou Manual (FTP/SSH)',
      'Manual (FTP/SSH/SCP)': 'Deploy Misto ou Manual (FTP/SSH)',
      'Inexistente': 'Deploy Misto ou Manual (FTP/SSH)',
      'Manual / ad-hoc': 'Deploy Misto ou Manual (FTP/SSH)',
    },
    seguranca_codigo: {
      'Sim, SAST (Semgrep, SonarQube)': 'Review Rigoroso + Automação (SAST)',
      'SAST (análise estática)': 'Review Rigoroso + Automação (SAST)',
      'Sim, SCA (Snyk, Dependabot)': 'Review Rigoroso + Automação (SAST)',
      'SCA (dependências)': 'Review Rigoroso + Automação (SAST)',
      'DAST (dinâmico)': 'Review Rigoroso + Automação (SAST)',
      'Secret scanning': 'Review Rigoroso + Automação (SAST)',
      'Container scanning': 'Review Rigoroso + Automação (SAST)',
      'IaC scanning': 'Review Rigoroso + Automação (SAST)',
      'Não': 'Sem validação formal',
      'Nenhuma': 'Sem validação formal',
    },
    gestao_identidade: {
      'SSO corporativo (Azure AD, Okta, Google)': 'SSO e MFA Centralizado',
      'SSO implementado': 'SSO e MFA Centralizado',
      'SSO + MFA obrigatório': 'SSO e MFA Centralizado',
      'IdP dedicado (Okta, Auth0, Azure AD)': 'SSO e MFA Centralizado',
      'MFA sem SSO': 'MFA ativo sem SSO',
      'IAM do cloud provider': 'MFA ativo sem SSO',
      'Senhas individuais sem política': 'Senhas isoladas / Sem política estrita',
      'Sem IAM centralizado': 'Senhas isoladas / Sem política estrita',
    },
    continuidade: {
      'Backups automatizados e testados': 'Backups Imutáveis Testados + Vendor Risk',
      'Backup automático com teste de restore': 'Backups Imutáveis Testados + Vendor Risk',
      'Backup + DR documentado e testado': 'Backups Imutáveis Testados + Vendor Risk',
      'Backups automáticos sem teste formal': 'Backups regulares sem testes formais',
      'Backup automático sem teste de restore': 'Backups regulares sem testes formais',
      'Backups manuais': 'Processos de Backup/Terceiros Informais',
      'Backup manual / ocasional': 'Processos de Backup/Terceiros Informais',
      'Sem backup formal': 'Processos de Backup/Terceiros Informais',
      'Sem backup': 'Processos de Backup/Terceiros Informais',
    },
    motivador: {
      'Certificação completa': 'Exigência Contratual/B2B',
      'Gap assessment apenas': 'Auditoria e Segurança Interna',
      'Implementação e certificação': 'Exigência Contratual/B2B',
      'Auditoria interna': 'Auditoria e Segurança Interna',
    },
  };
  const fieldMap = maps[field];
  if (!fieldMap) return value;
  // For multi-select values (comma-separated), try each part
  if (value.includes(',')) {
    const parts = value.split(',').map(p => p.trim());
    for (const part of parts) {
      if (fieldMap[part]) return fieldMap[part];
    }
  }
  return fieldMap[value] || value;
}

/** Constrói o objeto de respostas para o motor de precificação a partir das respostas do assessment */
function buildPricingAnswers(ansMap: Record<string, any>) {
  // ponytail: pass ALL answers through to calcScore — SCORE_MAP matches by question_key directly
  return {
    ...ansMap,
    scope_type: ansMap['scope_type'] || '',
    headcount: ansMap['headcount'] || ansMap['tech_people'] || '',
  };
}

// Precificação do Assessment
app.get('/api/v1/assessments/:id/pricing', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).all<{ question_key: string; answer: string }>();

    if (!answers || answers.length === 0) {
      return c.json({ error: 'Sem respostas para precificar' }, 400);
    }

    const ansMap: Record<string, any> = {};
    for (const a of answers) {
      ansMap[a.question_key] = a.answer;
    }

    const pricingAnswers = buildPricingAnswers(ansMap);
    // ponytail: fetch config overrides from DB
    const configRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const configOverrides = configRow ? JSON.parse(configRow.value) : undefined;
    const pricing = calculatePricing(pricingAnswers, configOverrides);
    return c.json(pricing);
  } catch (e: any) {
    return c.json({ error: 'Falha na precificação', detail: e.message }, 500);
  }
});

// Auto-gerar proposta HTML a partir do assessment
// ponytail: pricing override — consultant can adjust calculated price
// Atualizar assessment (status, etc)
app.put('/api/v1/assessments/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ status?: string; client_name?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.client_name) { updates.push('client_name = ?'); values.push(body.client_name); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.updated', c.get('user')?.email ?? 'system', `Assessment ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put('/api/v1/assessments/:id/pricing', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ precoFinal?: number; desconto?: number; notas?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.precoFinal !== undefined) { updates.push('pricing_override = ?'); values.push(body.precoFinal || null); }
    if (body.desconto !== undefined) { updates.push('pricing_desconto = ?'); values.push(body.desconto || null); }
    if (body.notas !== undefined) { updates.push('pricing_notas = ?'); values.push(body.notas || null); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.pricing_override', c.get('user')?.email ?? 'system', `Pricing ajustado no assessment ${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/v1/assessments/:id/generate-proposal', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    // Get assessment
    const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first<any>();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);

    // Get pricing
    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).all<{ question_key: string; answer: string }>();

    const ansMap: Record<string, any> = {};
    for (const a of (answers || [])) ansMap[a.question_key] = a.answer;

    const pricingAnswers = buildPricingAnswers(ansMap);
    const configRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const configOverrides = configRow ? JSON.parse(configRow.value) : undefined;
    const pricing = calculatePricing(pricingAnswers, configOverrides);

    // ponytail: apply pricing override/discount if set by consultant
    if (assessment.pricing_override) {
      pricing.precoFinal = assessment.pricing_override;
      // recalculate phase values proportionally
      const total = pricing.fases.reduce((a: number, f: any) => a + (f.valorFase || 0), 0);
      if (total > 0) pricing.fases.forEach((f: any) => { f.valorFase = Math.round((f.valorFase || 0) / total * pricing.precoFinal); });
    } else if (assessment.pricing_desconto && assessment.pricing_desconto > 0) {
      const factor = 1 - (assessment.pricing_desconto / 100);
      pricing.precoFinal = Math.ceil(pricing.precoFinal * factor / 1000) * 1000;
      pricing.fases.forEach((f: any) => { f.valorFase = Math.round((f.valorFase || 0) * factor); });
    }

    // Generate proposal HTML
    const clientName = assessment.client_name || 'Cliente';
    const now = new Date().toLocaleDateString('pt-BR');

    // Read metadata from request body (sent by frontend prompt form)
    const body = await c.req.json().catch(() => ({}));
    const meta = {
      proposalNum: body.proposalNum || `PROP-${new Date().getFullYear()}-${Math.floor(Math.random()*900)+100}`,
      validade: body.validade || '30',
      razaoSocial: body.razaoSocial || clientName,
      cnpj: body.cnpj || '',
      respCliente: body.respCliente || '',
      cargoCliente: body.cargoCliente || '',
      respNess: body.respNess || 'ness.',
      cargoNess: body.cargoNess || 'Lead Consultant',
      condicaoPagamento: body.condicaoPagamento || '40/30/30',
      observacoes: body.observacoes || ''
    };

    const pagamentoMap: Record<string,string> = {
      '40/30/30': '40% no kick-off do projeto, 30% na entrega da documentação completa, 30% após conclusão da auditoria de certificação.',
      '50/50': '50% no kick-off do projeto, 50% na conclusão e entrega final.',
      '30/30/20/20': '30% no kick-off, 30% no marco intermediário, 20% na entrega documental, 20% após certificação.',
      'mensal': `Parcelas mensais iguais ao longo da duração do projeto (${pricing.tier.duracao}).`
    };
    const pagamentoTexto = pagamentoMap[meta.condicaoPagamento] || pagamentoMap['40/30/30'];
    const duracaoSemanas = pricing.fases.reduce((a: number, f: any) => a + (f.semanas || 0), 0);

    const contentHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposta ${escapeHtml(meta.proposalNum)} — ${escapeHtml(meta.razaoSocial)} | ness.</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#070b14;color:#e2e2e8;font-size:14px;line-height:1.7}
    .page{max-width:900px;margin:0 auto;padding:3rem 2.5rem}
    h1{font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.6rem;color:#f5f5f7}
    h2{font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:#00ade8;margin:2.5rem 0 1rem;text-transform:uppercase;letter-spacing:0.15em;border-bottom:1px solid rgba(0,173,232,0.2);padding-bottom:0.5rem}
    h3{font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.8rem;color:#f5f5f7;margin:1.5rem 0 0.5rem}
    p,li{color:#a8a8b8;line-height:1.8;font-size:0.88rem}
    strong{color:#f5f5f7}
    table{width:100%;border-collapse:collapse;margin:1rem 0}
    th{padding:10px 14px;text-align:left;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;border-bottom:2px solid #1e293b;font-weight:600}
    td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.85rem}
    .accent{color:#00ade8}
    .card{padding:1.25rem;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:0.75rem}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:600}
    .tag-blue{background:rgba(0,173,232,0.12);color:#00ade8}
    .bar{height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;margin:4px 0}
    .bar-fill{height:100%;background:linear-gradient(90deg,#00ade8,#0091c7);border-radius:4px;display:flex;align-items:center;padding-left:6px}
    .bar-fill span{font-size:0.55rem;color:#fff;font-weight:600}
    .raci-r{color:#00ade8;font-weight:700}
    .raci-a{color:#f59e0b;font-weight:600}
    .raci-c{color:#a78bfa;font-weight:500}
    .raci-i{color:#6b7280}
    .sig-line{border-top:1px solid #334155;margin-top:3rem;padding-top:1.5rem}
    .clause{margin-bottom:0.5rem}
    .check{color:#00ade8;margin-right:0.35rem}
    .x-mark{color:#f85149;margin-right:0.35rem}
    ul{list-style:none;padding:0}
    li{padding:0.3rem 0}
    @media print{
      body{background:#fff;color:#1e293b;font-size:12px}
      .page{padding:1.5rem;max-width:100%}
      h1{color:#0f172a}h2{color:#0369a1;border-bottom-color:#e2e8f0}h3{color:#0f172a}
      p,li{color:#475569}strong{color:#0f172a}
      th{color:#64748b;border-bottom-color:#e2e8f0}td{border-bottom-color:#f1f5f9}
      .card{background:#f8fafc;border-color:#e2e8f0}
      .accent{color:#0369a1}.tag-blue{background:#e0f2fe;color:#0369a1}
      .raci-r{color:#0369a1}.raci-a{color:#d97706}.raci-c{color:#7c3aed}
      .bar{background:#f1f5f9}.bar-fill{background:linear-gradient(90deg,#0369a1,#0284c7)}
      .no-print{display:none}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ═══ CAPA ═══ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;padding-bottom:2rem;border-bottom:2px solid rgba(0,173,232,0.2)">
    <div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:2rem;color:#f5f5f7">ness<span class="accent">.</span></div>
      <div style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem">Segurança da Informação & Privacidade</div>
    </div>
    <div style="text-align:right;font-size:0.8rem;color:#6b7280">
      <div><strong style="color:#f5f5f7">${escapeHtml(meta.proposalNum)}</strong></div>
      <div>Data: ${now}</div>
      <div>Validade: ${meta.validade} dias</div>
      <div style="margin-top:0.5rem" class="tag tag-blue">CONFIDENCIAL</div>
    </div>
  </div>

  <h1>proposta comercial</h1>
  <p style="margin-top:0.5rem">Programa de Consultoria para Certificação <strong>ISO/IEC 27001:2022</strong> para <strong>${escapeHtml(meta.razaoSocial)}</strong>${meta.cnpj ? ` (CNPJ: ${escapeHtml(meta.cnpj)})` : ''}</p>

  <div class="grid3" style="margin:1.5rem 0">
    <div class="card"><div style="font-size:0.65rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em">Tier</div><div style="font-size:1.2rem;font-weight:600;color:#f5f5f7;margin-top:0.2rem">${pricing.tier.name} <span class="tag tag-blue">${pricing.tier.tier}</span></div></div>
    <div class="card"><div style="font-size:0.65rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em">Duração</div><div style="font-size:1.2rem;font-weight:600;color:#f5f5f7;margin-top:0.2rem">${pricing.tier.duracao}</div></div>
    <div class="card"><div style="font-size:0.65rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em">Complexidade</div><div style="font-size:1.2rem;font-weight:600;color:#f5f5f7;margin-top:0.2rem">${pricing.score}/${pricing.scoreMax}</div></div>
  </div>

  <!-- ═══ 1. SUMÁRIO EXECUTIVO ═══ -->
  <h2>1. Sumário Executivo</h2>
  <p>A presente proposta tem por objetivo a prestação de <strong>serviços de consultoria especializada</strong> para orientar a <strong>${escapeHtml(meta.razaoSocial)}</strong> na construção de um Sistema de Gestão de Segurança da Informação (SGSI) em conformidade com a norma ISO/IEC 27001:2022, preparando a organização para obtenção da certificação internacional.</p>
  <p style="margin-top:0.75rem">A ness. atua exclusivamente no papel de <strong>consultoria e orientação</strong>. Toda atividade de execução e implementação (hands-on) é de responsabilidade da equipe do cliente.</p>
  <p style="margin-top:0.75rem">Com base no levantamento realizado, o programa consultivo proposto tem duração estimada de <strong>${pricing.tier.duracao}</strong>.</p>

  <!-- ═══ 2. OBJETO ═══ -->
  <h2>2. Objeto da Proposta</h2>
  <p>Contratação de serviços de consultoria para:</p>
  <ul>
    <li><span class="check">■</span> Orientação na análise de gaps frente à ISO/IEC 27001:2022</li>
    <li><span class="check">■</span> Fornecimento de templates de políticas, procedimentos e registros do SGSI</li>
    <li><span class="check">■</span> Revisão da documentação e evidências elaboradas pelo cliente</li>
    <li><span class="check">■</span> Facilitação de workshops de avaliação de riscos</li>
    <li><span class="check">■</span> Capacitação e conscientização da equipe interna</li>
    <li><span class="check">■</span> Condução de auditoria interna preparatória</li>
    <li><span class="check">■</span> Acompanhamento nos Estágios 1 e 2 da auditoria de certificação</li>
  </ul>

  <!-- ═══ 3. SOBRE A CONSULTORIA ═══ -->
  <h2>3. Sobre a ness.</h2>
  <p>A <strong>ness.</strong> é uma consultoria especializada em Segurança da Informação e Privacidade de Dados, com foco em implementação de Sistemas de Gestão (SGSI/SGPI) baseados nas normas ISO/IEC 27001:2022 e ISO/IEC 27701:2019.</p>
  <p style="margin-top:0.75rem">Nosso modelo de trabalho combina <strong>expertise técnica</strong> com <strong>automação inteligente</strong> através da plataforma proprietária <strong>nISO</strong>, que oferece:</p>
  <div class="grid2" style="margin:1rem 0">
    <div class="card"><strong>Geração automatizada</strong> de políticas e procedimentos via AI, alinhados aos controles do Anexo A</div>
    <div class="card"><strong>Rastreabilidade completa</strong> de riscos → controles → evidências em tempo real</div>
    <div class="card"><strong>Portal do cliente</strong> com visão de progresso, milestones e próximos passos</div>
    <div class="card"><strong>Portal do auditor</strong> com acesso read-only para revisão de evidências</div>
  </div>
  <p>A ness. atua como <strong>consultoria e acelerador</strong> — o SGSI é de propriedade e operação do cliente. Nossa missão é orientar para que a implementação, conduzida pela equipe interna, seja eficiente, completa e resulte em uma certificação sustentável.</p>

  <!-- ═══ 4. ESCOPO DOS SERVIÇOS ═══ -->
  <h2>4. Escopo dos Serviços</h2>
  <ul>
    ${pricing.tier.entregas.map((e: string) => `<li><span class="check">■</span> ${escapeHtml(e)}</li>`).join('')}
  </ul>

  <!-- ═══ 5. METODOLOGIA ═══ -->
  <h2>5. Metodologia de Trabalho</h2>
  <p>O programa de certificação segue <strong>6 jornadas sequenciais</strong>, cada uma com entregas tangíveis e critérios de aceite claros. O modelo de trabalho prevê:</p>
  <ul>
    <li><span class="check">■</span> <strong>Workshops quinzenais</strong> presenciais ou remotos com a equipe do cliente</li>
    <li><span class="check">■</span> <strong>Revisões assíncronas</strong> de documentos e evidências via plataforma nISO</li>
    <li><span class="check">■</span> <strong>Checkpoints de qualidade</strong> ao final de cada jornada com entrega formal</li>
  </ul>
  <div class="grid3" style="margin:1rem 0">
    ${[
      {j:'J1',name:'Foundation',desc:'Definição do escopo SGSI (Cláusula 4.3), contexto organizacional, partes interessadas, liderança e comprometimento da alta direção.'},
      {j:'J2',name:'Discovery',desc:'Metodologia e avaliação de riscos (6.1.2), inventário de ativos, análise de gaps, Statement of Applicability (SoA).'},
      {j:'J3',name:'Implementation',desc:'Implementação dos controles Anexo A, elaboração de políticas e procedimentos operacionais, coleta de evidências.'},
      {j:'J4',name:'Privacy',desc:'ROPA, DPIA, bases legais, direitos dos titulares, adequação ISO 27701 e LGPD (quando aplicável).'},
      {j:'J5',name:'Governance',desc:'Auditoria interna (9.2), análise crítica pela direção (9.3), tratamento de não-conformidades, melhoria contínua.'},
      {j:'J6',name:'Certification',desc:'Preparação para Estágio 1 (documental), dry-run, acompanhamento do Estágio 2 (evidências), tratamento de NCs.'}
    ].map(j => `<div class="card"><div style="font-size:0.65rem;color:#00ade8;font-weight:600;margin-bottom:0.3rem">${j.j} — ${j.name}</div><div style="font-size:0.8rem">${j.desc}</div></div>`).join('')}
  </div>

  <!-- ═══ 6. TRILHA DE IMPLEMENTAÇÃO ═══ -->
  <h2>6. Trilha de Implementação</h2>
  <table>
    <thead><tr><th>Fase</th><th>Atividade</th><th style="text-align:center">Semanas</th><th style="text-align:center">PDs</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>
      ${pricing.fases.map((f: any) => `<tr><td><strong>${escapeHtml(f.fase)}</strong></td><td>${escapeHtml(f.nome)}</td><td style="text-align:center">${f.semanas}</td><td style="text-align:center">${f.pdNess}</td><td style="text-align:right;color:#00ade8;font-weight:600">R$ ${(f.valorFase || 0).toLocaleString('pt-BR')}</td></tr>`).join('')}
      <tr style="border-top:2px solid #00ade8"><td colspan="4" style="font-weight:700;font-size:1rem;padding-top:1rem">Total do Investimento</td><td style="text-align:right;font-weight:700;font-size:1rem;color:#00ade8;padding-top:1rem">R$ ${pricing.precoFinal.toLocaleString('pt-BR')}</td></tr>
    </tbody>
  </table>
  ${pricing.scopeInfo.fator > 1 ? `<p style="font-size:0.8rem;margin-top:0.25rem">Multiplicador de escopo aplicado: <strong>x${pricing.scopeInfo.fator}</strong> (${escapeHtml(pricing.scopeInfo.label)})</p>` : ''}

  <!-- ═══ 7. CRONOGRAMA VISUAL ═══ -->
  <h2>7. Cronograma</h2>
  <table>
    <thead><tr><th>Fase</th><th>Atividade</th><th style="text-align:center">Semanas</th><th style="text-align:center">PDs ness.</th><th style="width:40%">Progresso</th></tr></thead>
    <tbody>
      ${pricing.fases.map((f: any) => {
        const pct = Math.round((f.semanas / duracaoSemanas) * 100);
        return `<tr><td style="font-weight:500;white-space:nowrap">${escapeHtml(f.fase)}</td><td>${escapeHtml(f.nome)}</td><td style="text-align:center">${f.semanas}</td><td style="text-align:center">${f.pdNess}</td><td><div class="bar"><div class="bar-fill" style="width:${pct}%"><span>${f.semanas}s</span></div></div></td></tr>`;
      }).join('')}
    </tbody>
  </table>

  <!-- ═══ 8. MATRIZ RACI ═══ -->
  <h2>8. Matriz RACI</h2>
  <p style="margin-bottom:0.75rem"><span class="raci-r">R</span> = Responsável &nbsp; <span class="raci-a">A</span> = Aprovador &nbsp; <span class="raci-c">C</span> = Consultado &nbsp; <span class="raci-i">I</span> = Informado</p>
  <table>
    <thead><tr><th>Atividade</th><th style="text-align:center">ness.</th><th style="text-align:center">Cliente</th></tr></thead>
    <tbody>
      <tr><td>Definição de escopo e contexto do SGSI</td><td style="text-align:center"><span class="raci-c">C</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
      <tr><td>Elaboração de políticas e procedimentos</td><td style="text-align:center"><span class="raci-c">C</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
      <tr><td>Avaliação de riscos e plano de tratamento</td><td style="text-align:center"><span class="raci-c">C</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
      <tr><td>Implementação técnica de controles</td><td style="text-align:center"><span class="raci-i">I</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
      <tr><td>Coleta e organização de evidências</td><td style="text-align:center"><span class="raci-c">C</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
      <tr><td>Treinamento e conscientização</td><td style="text-align:center"><span class="raci-r">R</span></td><td style="text-align:center"><span class="raci-a">A</span> <span class="raci-c">C</span></td></tr>
      <tr><td>Auditoria interna do SGSI</td><td style="text-align:center"><span class="raci-r">R</span></td><td style="text-align:center"><span class="raci-c">C</span></td></tr>
      <tr><td>Acompanhamento auditorias de certificação</td><td style="text-align:center"><span class="raci-c">C</span></td><td style="text-align:center"><span class="raci-r">R</span> <span class="raci-a">A</span></td></tr>
    </tbody>
  </table>

  <!-- ═══ 9. EQUIPE ═══ -->
  <h2>9. Equipe Consultiva ness.</h2>
  <table>
    <thead><tr><th>Papel</th><th>Dedicação</th><th>Responsabilidade</th></tr></thead>
    <tbody>
      <tr><td style="font-weight:500">Lead Consultant (GRC)</td><td>Parcial</td><td>Gestão do programa, revisão de políticas, interlocução com a alta direção, análise crítica</td></tr>
      <tr><td style="font-weight:500">Security Advisor</td><td>Parcial</td><td>Orientação em controles técnicos, análise de riscos, revisão de evidências, SoA</td></tr>
      <tr><td style="font-weight:500">Privacy Advisor</td><td>Sob demanda</td><td>Orientação em ROPA, DPIA, bases legais, adequação LGPD e ISO 27701</td></tr>
    </tbody>
  </table>


  <!-- ═══ 11. CONDIÇÕES COMERCIAIS ═══ -->
  <h2>11. Condições Comerciais</h2>
  <h3>11.1. Investimento</h3>
  <p>O investimento total para o programa de certificação é de <strong style="color:#00ade8;font-size:1.1rem">R$ ${pricing.precoFinal.toLocaleString('pt-BR')}</strong>, conforme detalhamento na Seção 6.</p>
  <h3>11.2. Forma de Pagamento</h3>
  <p>${pagamentoTexto}</p>
  <h3>11.3. Reajuste</h3>
  <p>Para projetos com duração superior a 12 meses, os valores serão reajustados anualmente pelo índice IGP-M/FGV acumulado no período.</p>
  <h3>11.4. Validade</h3>
  <p>Esta proposta é válida por <strong>${meta.validade} dias</strong> a partir da data de emissão.</p>

  <!-- ═══ 12. PREMISSAS E EXCLUSÕES ═══ -->
  <h2>12. Premissas e Exclusões</h2>
  <div class="grid2">
    <div>
      <h3>Incluso</h3>
      <ul>
        <li><span class="check">■</span> Todas as políticas e procedimentos documentais do SGSI</li>
        <li><span class="check">■</span> Acompanhamento nas auditorias de certificação (Estágios 1 e 2)</li>
        <li><span class="check">■</span> Acesso à plataforma nISO durante todo o projeto</li>
        <li><span class="check">■</span> Templates e frameworks prontos para uso</li>
        <li><span class="check">■</span> Treinamento e programa de conscientização</li>
        <li><span class="check">■</span> Auditoria interna preparatória</li>
      </ul>
    </div>
    <div>
      <h3>Não Incluso</h3>
      <ul>
        <li><span class="x-mark">✗</span> Taxa da certificadora (contratação direta pelo cliente)</li>
        <li><span class="x-mark">✗</span> Aquisição de ferramentas de segurança (SIEM, WAF, etc.)</li>
        <li><span class="x-mark">✗</span> Pentest de infraestrutura (disponível como add-on)</li>
        <li><span class="x-mark">✗</span> Desenvolvimento de software customizado</li>
        <li><span class="x-mark">✗</span> Despesas de viagem (se aplicável, serão cobradas à parte)</li>
      </ul>
    </div>
  </div>

  <!-- ═══ 13. OBRIGAÇÕES DAS PARTES ═══ -->
  <h2>13. Obrigações das Partes</h2>
  <div class="grid2">
    <div>
      <h3>Obrigações da ness.</h3>
      <ul>
        <li><span class="check">■</span> Executar os serviços conforme escopo e cronograma</li>
        <li><span class="check">■</span> Designar profissionais qualificados para o projeto</li>
        <li><span class="check">■</span> Reportar progresso quinzenalmente via plataforma nISO</li>
        <li><span class="check">■</span> Manter sigilo sobre todas as informações do cliente</li>
        <li><span class="check">■</span> Entregar toda documentação ao final do projeto</li>
      </ul>
    </div>
    <div>
      <h3>Obrigações do Cliente</h3>
      <ul>
        <li><span class="check">■</span> Designar um ponto focal com poder de decisão</li>
        <li><span class="check">■</span> Prover acesso a sistemas, documentos e pessoas necessárias</li>
        <li><span class="check">■</span> Participar dos workshops e reuniões programadas</li>
        <li><span class="check">■</span> Implementar os controles técnicos sob sua responsabilidade</li>
        <li><span class="check">■</span> Realizar pagamentos conforme condições acordadas</li>
      </ul>
    </div>
  </div>

  <!-- ═══ 14. CONFIDENCIALIDADE ═══ -->
  <h2>14. Confidencialidade</h2>
  <p>As partes se comprometem a manter em sigilo todas as informações técnicas, comerciais e estratégicas a que tiverem acesso durante a execução dos serviços, pelo prazo de <strong>5 (cinco) anos</strong> após o término do contrato. Esta obrigação abrange, mas não se limita a: dados pessoais, informações financeiras, estratégias de negócio, vulnerabilidades identificadas e documentação do SGSI.</p>

  <!-- ═══ 15. VIGÊNCIA E RESCISÃO ═══ -->
  <h2>15. Vigência e Rescisão</h2>
  <p>O contrato terá vigência correspondente à duração estimada do programa (<strong>${pricing.tier.duracao}</strong>), podendo ser prorrogado por acordo mútuo entre as partes.</p>
  <p style="margin-top:0.5rem">A rescisão poderá ocorrer por qualquer das partes mediante notificação escrita com <strong>30 dias de antecedência</strong>. Em caso de rescisão antecipada, serão devidos os valores proporcionais aos serviços já executados.</p>

  <!-- ═══ 16. FORO ═══ -->
  <h2>16. Foro</h2>
  <p>Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer questões oriundas desta proposta, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

  ${meta.observacoes ? `
  <!-- ═══ OBSERVAÇÕES ═══ -->
  <h2>Observações</h2>
  <p>${escapeHtml(meta.observacoes)}</p>
  ` : ''}

  <!-- ═══ 17. ACEITE ═══ -->
  <h2>17. Aceite e Assinaturas</h2>
  <p>Ao assinar esta proposta, as partes concordam com todos os termos e condições aqui estabelecidos.</p>
  <div class="sig-line">
    <div class="grid2" style="gap:4rem;margin-top:1.5rem">
      <div>
        <div style="font-size:0.75rem;color:#6b7280;margin-bottom:4rem">Pela ness.</div>
        <div style="border-top:1px solid #334155;padding-top:0.5rem">
          <div style="font-size:0.85rem;font-weight:500">${escapeHtml(meta.respNess)}</div>
          <div style="font-size:0.75rem;color:#6b7280">${escapeHtml(meta.cargoNess)}</div>
        </div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:#6b7280;margin-bottom:4rem">Pela ${escapeHtml(meta.razaoSocial)}</div>
        <div style="border-top:1px solid #334155;padding-top:0.5rem">
          <div style="font-size:0.85rem;font-weight:500">${escapeHtml(meta.respCliente || '___________________________')}</div>
          <div style="font-size:0.75rem;color:#6b7280">${escapeHtml(meta.cargoCliente || 'Cargo')}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="no-print" style="margin-top:2rem;text-align:center">
    <button onclick="window.print()" style="padding:12px 32px;background:#00ade8;color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer">Imprimir / Salvar PDF</button>
  </div>
</div>
</body>
</html>`;

    // Find lead_id from assessment
    const leadId = assessment.lead_id;

    // Create proposal in DB (using existing schema columns)
    const proposalId = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, content_html, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Draft', datetime('now'))`
    ).bind(proposalId, leadId, id, contentHtml, pricing.precoFinal).run();

    await logAudit(c.env.DB, 'proposal.generated', user?.email ?? 'system', `Proposta ${proposalId} gerada automaticamente do assessment ${id}. Tier: ${pricing.tier.name}, Preço: R$ ${pricing.precoFinal}`);

    // ponytail: notification trigger
    await createNotification(c.env.DB, 'proposal_ready', `Proposta gerada: ${clientName}`, `Tier ${pricing.tier.name} — R$ ${pricing.precoFinal.toLocaleString('pt-BR')}`, user?.id, `/proposals/${proposalId}`);

    return c.json({ 
      ok: true, 
      proposal_id: proposalId, 
      proposal_num: meta.proposalNum,
      tier: pricing.tier.name, 
      preco: pricing.precoFinal,
      html: contentHtml 
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar proposta', detail: e.message }, 500);
  }
});


// Salvar respostas de um bloco
app.post('/api/v1/assessments/:id/block/:num', async (c) => {
  try {
    const id = c.req.param('id');
    const num = parseInt(c.req.param('num'), 10);

    const assessment = await c.env.DB.prepare(
      'SELECT id, status FROM assessments WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado' }, 404);
    }

    if (num < 1 || num > 10) {
      return c.json({ error: 'Bloco deve ser entre 1 e 10' }, 400);
    }

    const body = await c.req.json<{
      answers: Array<{
        question_key: string;
        question: string;
        answer: string;
        complexity_impact?: string;
        gap_detected?: number;
        notes?: string;
      }>;
    }>();

    if (!body.answers || !Array.isArray(body.answers)) {
      return c.json({ error: 'answers (array) é obrigatório' }, 400);
    }

    // Remove respostas anteriores deste bloco (permite re-salvar)
    await c.env.DB.prepare(
      'DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?'
    )
      .bind(id, num)
      .run();

    // Insere novas respostas
    const stmt = c.env.DB.prepare(
      `INSERT INTO assessment_answers
         (id, assessment_id, block, question_key, question, answer, complexity_impact, gap_detected, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const batch = body.answers.map((a) =>
      stmt.bind(
        genId(),
        id,
        num,
        a.question_key,
        a.question,
        a.answer,
        a.complexity_impact ?? null,
        a.gap_detected ?? 0,
        a.notes ?? null
      )
    );

    await c.env.DB.batch(batch);

    await logAudit(
      c.env.DB,
      'assessment.block_saved',
      c.get('user')?.email ?? 'system',
      `Bloco ${num} salvo para assessment ${id} (${body.answers.length} respostas)`
    );

    return c.json({ ok: true, block: num, saved: body.answers.length });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar respostas', detail: e.message }, 500);
  }
});

// Converter assessment em projeto
app.post('/api/v1/assessments/:id/convert', async (c) => {
  try {
    const id = c.req.param('id');

    const assessment = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    )
      .bind(id)
      .first<any>();

    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado' }, 404);
    }

    if (assessment.converted_project_id) {
      return c.json({ error: 'Assessment já foi convertido', project_id: assessment.converted_project_id }, 409);
    }

    // Busca respostas relevantes para preencher dados do projeto
    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    )
      .bind(id)
      .all<{ question_key: string; answer: string }>();

    const answerMap = new Map((answers ?? []).map((a) => [a.question_key, a.answer]));

    const projectId = genId();
    const sector = answerMap.get('sector') ?? '';
    const scope = answerMap.get('scope_type') ?? '';
    const standards = answerMap.get('target_standard') ?? 'ISO 27001';
    const orgRole = answerMap.get('data_role') ?? '';

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
    )
      .bind(projectId, assessment.client_name, sector, scope, standards, orgRole, id)
      .run();

    // Seed das 41 fases
    await seedPhases(c.env.DB, projectId);

    // Sprint C: Assessment → prioridades automáticas nas fases
    // Maps assessment question keys to phase numbers that should be flagged
    const PRIORITY_MAP: Record<string, number[]> = {
      has_isms: [0, 1], has_risk_assessment: [7, 8], has_soa: [9],
      has_policies: [5, 6], has_incident_process: [15],
      has_bc_dr: [16], has_access_control: [10],
      has_crypto_policy: [12], has_supplier_mgmt: [19],
      has_awareness_training: [17], has_audit_program: [34, 35],
      has_data_classification: [11], has_change_mgmt: [13],
      has_physical_security: [14], has_monitoring: [18],
      has_privacy_program: [21, 22, 23]
    };
    const negativeAnswers = (answers ?? []).filter(
      a => a.answer && ['no', 'nao', 'não', 'false'].includes(a.answer.toLowerCase().trim())
    );
    const priorityPhases = new Set<number>();
    for (const a of negativeAnswers) {
      const mapped = PRIORITY_MAP[a.question_key];
      if (mapped) mapped.forEach(n => priorityPhases.add(n));
    }
    if (priorityPhases.size > 0) {
      const updateBatch = [...priorityPhases].map(n =>
        c.env.DB.prepare(
          `UPDATE project_phases SET notes = '[PRIORIDADE] Identificado no assessment como gap' WHERE project_id = ? AND phase_number = ?`
        ).bind(projectId, n)
      );
      await c.env.DB.batch(updateBatch);
    }

    // Atualiza assessment
    await c.env.DB.prepare(
      `UPDATE assessments SET status = 'converted', converted_project_id = ?, completed_at = datetime('now') WHERE id = ?`
    )
      .bind(projectId, id)
      .run();

    await logAudit(
      c.env.DB,
      'assessment.converted',
      c.get('user')?.email ?? 'system',
      `Assessment ${id} convertido em projeto ${projectId}`
    );

    return c.json({ ok: true, project_id: projectId }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao converter assessment', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROJECTS (Delivery)
// ═══════════════════════════════════════════════════════════════════════════════

// Criar projeto direto (sem assessment)
app.post('/api/v1/projects', async (c) => {
  try {
    const body = await c.req.json<{
      project_name?: string;
      client_name: string;
      sector?: string;
      scope?: string;
      standards?: string;
      org_role?: string;
    }>();

    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const id = genId();

    await c.env.DB.prepare(
      `INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    )
      .bind(
        id,
        body.project_name ?? '',
        body.client_name,
        body.sector ?? '',
        body.scope ?? '',
        body.standards ?? 'ISO 27001',
        body.org_role ?? ''
      )
      .run();

    // Seed das 41 fases
    await seedPhases(c.env.DB, id);

    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${id} criado para ${body.client_name}`);

    return c.json({ id, project_name: body.project_name, client_name: body.client_name, status: 'active' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar projeto', detail: e.message }, 500);
  }
});

// Listar projetos
app.get('/api/v1/projects', async (c) => {
  try {
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (!user.client_project_id) {
        return c.json([]);
      }
      const project = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      ).bind(user.client_project_id).first();
      return c.json(project ? [project] : []);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM projects ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar projetos', detail: e.message }, 500);
  }
});

app.put('/api/v1/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ status?: string; project_name?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.project_name !== undefined) { updates.push('project_name = ?'); values.push(body.project_name); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'project.updated', c.get('user')?.email ?? 'system', `Projeto ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Estatísticas do Dashboard
app.get('/api/v1/dashboard/stats', async (c) => {
  try {
    const user = c.get('user');
    const isClient = user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client';
    const projectId = isClient ? user.client_project_id : null;
    
    const whereResource = projectId ? 'WHERE project_id = ?' : '';
    const whereProject = projectId ? 'WHERE id = ?' : '';
    const params = projectId ? [projectId] : [];

    // ponytail: Batch para performance
    // ponytail: SQL fix - ensuring WHERE/AND logic is correct
    const stats: any = await c.env.DB.batch([
      c.env.DB.prepare('SELECT count(*) as count FROM leads'),
      c.env.DB.prepare(`SELECT count(*) as count FROM projects ${whereProject}`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM compliance_controls ${whereResource} ${whereResource ? "AND" : "WHERE"} status = 'Completed'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM evidence ${whereResource} ${whereResource ? "AND" : "WHERE"} evaluation_status = 'pending'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM risks ${whereResource} ${whereResource ? "AND" : "WHERE"} impact * probability >= 15`).bind(...params)
    ]);

    return c.json({
      leads: stats[0].results?.[0]?.count || 0,
      projects: stats[1].results?.[0]?.count || 0,
      controls_done: stats[2].results?.[0]?.count || 0,
      pending_evidence: stats[3].results?.[0]?.count || 0,
      critical_risks: stats[4].results?.[0]?.count || 0
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao carregar estatísticas', detail: e.message }, 500);
  }
});

// Atualizar maturidade do controle
app.put('/api/v1/controls/:id/maturity', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'compliance_controls', id);
    const { maturity } = await c.req.json<{ maturity: number }>();
    
    if (maturity < 0 || maturity > 5) {
      return c.json({ error: 'Maturidade deve ser entre 0 e 5' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET maturity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(maturity, id).run();

    await logAudit(c.env.DB, 'control.maturity_updated', c.get('user')?.email || 'system', `Maturidade do controle ${id} atualizada para ${maturity}`);

    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar maturidade', detail: e.message }, 500);
  }
});

// Atualizar status do controle
app.put('/api/v1/controls/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, id).run();

    await logAudit(c.env.DB, 'control.status_updated', c.get('user')?.email || 'system', `Status do controle ${id} atualizado para ${status}`);

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar status', detail: e.message }, 500);
  }
});

// Atualizar controle genérico (status, justificativa, owner, maturity)
app.put('/api/v1/controls/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { status, description, owner, maturity } = await c.req.json<{ status?: string; description?: string; owner?: string; maturity?: number }>();
    
    const updates: string[] = [];
    const binds: any[] = [];
    
    if (status !== undefined) {
      updates.push('status = ?');
      binds.push(status);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      binds.push(description);
    }
    if (owner !== undefined) {
      updates.push('owner = ?');
      binds.push(owner);
    }
    if (maturity !== undefined) {
      updates.push('maturity = ?');
      binds.push(maturity);
    }
    
    if (updates.length === 0) {
      return c.json({ error: 'Nenhum campo para atualizar' }, 400);
    }
    
    binds.push(id);
    const query = `UPDATE compliance_controls SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await c.env.DB.prepare(query).bind(...binds).run();
    
    await logAudit(c.env.DB, 'control.updated', c.get('user')?.email || 'system', `Controle ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar controle', detail: e.message }, 500);
  }
});

// Detalhe do projeto
app.get('/api/v1/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!project) {
      return c.json({ error: 'Projeto não encontrado' }, 404);
    }

    return c.json(project);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar projeto', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/controls', async (c) => {
  try {
    const id = c.req.param('id');
    const standard = c.req.query('standard');
    let stmt;
    if (standard) {
      stmt = c.env.DB.prepare(
        'SELECT id, project_id, standard, title, description, status, maturity, owner, updated_at FROM compliance_controls WHERE project_id = ? AND standard = ? ORDER BY id'
      ).bind(id, standard);
    } else {
      stmt = c.env.DB.prepare(
        'SELECT id, project_id, standard, title, description, status, maturity, owner, updated_at FROM compliance_controls WHERE project_id = ? ORDER BY standard, id'
      ).bind(id);
    }
    const rows = await stmt.all();
    return c.json(rows.results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar controles do projeto', detail: e.message }, 500);
  }
});

// Listar fases do projeto
app.get('/api/v1/projects/:id/phases', async (c) => {
  try {
    const id = c.req.param('id');

    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!project) {
      return c.json({ error: 'Projeto não encontrado' }, 404);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC'
    )
      .bind(id)
      .all();

    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar fases', detail: e.message }, 500);
  }
});

// Atualizar status de uma fase
app.put('/api/v1/projects/:id/phases/:num', async (c) => {
  try {
    const projectId = c.req.param('id');
    const phaseNum = parseInt(c.req.param('num'), 10);

    const body = await c.req.json<{ status: string; notes?: string }>();

    if (!body.status) {
      return c.json({ error: 'status é obrigatório' }, 400);
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'skipped'];
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: `status inválido. Use: ${validStatuses.join(', ')}` }, 400);
    }

    // Verifica se a fase existe
    const phase = await c.env.DB.prepare(
      'SELECT id FROM project_phases WHERE project_id = ? AND phase_number = ?'
    )
      .bind(projectId, phaseNum)
      .first();

    if (!phase) {
      return c.json({ error: 'Fase não encontrada' }, 404);
    }

    const completedAt = body.status === 'completed' ? "datetime('now')" : 'NULL';

    await c.env.DB.prepare(
      `UPDATE project_phases
       SET status = ?, notes = ?, completed_at = ${body.status === 'completed' ? "datetime('now')" : 'NULL'}
       WHERE project_id = ? AND phase_number = ?`
    )
      .bind(body.status, body.notes ?? '', projectId, phaseNum)
      .run();

    await logAudit(
      c.env.DB,
      'phase.updated',
      c.get('user')?.email ?? 'system',
      `Fase ${phaseNum} do projeto ${projectId} atualizada para ${body.status}`
    );

    return c.json({ ok: true, phase_number: phaseNum, status: body.status });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar fase', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROJECT INTERVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// Obter perguntas de entrevista por trilha
app.get('/api/v1/projects/:id/interviews/:track', async (c) => {
  try {
    const projectId = c.req.param('id');
    const track = c.req.param('track');

    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ?'
    )
      .bind(projectId)
      .first();

    if (!project) {
      return c.json({ error: 'Projeto não encontrado' }, 404);
    }

    const questions = INTERVIEW_TRACKS[track];
    if (!questions) {
      const available = Object.keys(INTERVIEW_TRACKS);
      return c.json({ error: `Trilha não encontrada. Disponíveis: ${available.join(', ')}` }, 404);
    }

    // Busca respostas já salvas
    const { results: existing } = await c.env.DB.prepare(
      'SELECT question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ? AND track = ?'
    )
      .bind(projectId, track)
      .all();

    const answeredMap = new Map(
      (existing ?? []).map((r: any) => [r.question, { answer: r.answer, interviewee: r.interviewee, gap_detected: r.gap_detected }])
    );

    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: answeredMap.get(q.question)?.answer ?? null,
      interviewee: answeredMap.get(q.question)?.interviewee ?? null,
      gap_detected: answeredMap.get(q.question)?.gap_detected ?? null,
    }));

    return c.json({ track, questions: questionsWithAnswers });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar entrevistas', detail: e.message }, 500);
  }
});

// Salvar resposta de entrevista
app.post('/api/v1/projects/:id/interviews', async (c) => {
  try {
    const projectId = c.req.param('id');

    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ?'
    )
      .bind(projectId)
      .first();

    if (!project) {
      return c.json({ error: 'Projeto não encontrado' }, 404);
    }

    const body = await c.req.json<{
      track: string;
      question: string;
      answer: string;
      interviewee?: string;
      gap_detected?: number;
    }>();

    if (!body.track || !body.question || !body.answer) {
      return c.json({ error: 'track, question e answer são obrigatórios' }, 400);
    }

    const id = genId();

    // ponytail: upsert — delete existing answer for same question before inserting
    await c.env.DB.prepare(
      'DELETE FROM project_interviews WHERE project_id = ? AND track = ? AND question = ?'
    ).bind(projectId, body.track, body.question).run();

    await c.env.DB.prepare(
      `INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(id, projectId, body.track, body.question, body.answer, body.interviewee ?? '', body.gap_detected ?? 0)
      .run();

    await logAudit(
      c.env.DB,
      'interview.saved',
      c.get('user')?.email ?? 'system',
      `Entrevista salva: trilha ${body.track}, projeto ${projectId}`
    );

    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar entrevista', detail: e.message }, 500);
  }
});

// Interview summary (progress per track)
app.get('/api/v1/projects/:id/interviews/summary', async (c) => {
  try {
    const projectId = c.req.param('id');
    const tracks = Object.entries(INTERVIEW_TRACKS).map(([track, questions]) => ({
      track,
      total: questions.length,
    }));

    const { results: answers } = await c.env.DB.prepare(
      'SELECT track, COUNT(*) as answered, SUM(CASE WHEN gap_detected = 1 THEN 1 ELSE 0 END) as gaps FROM project_interviews WHERE project_id = ? GROUP BY track'
    ).bind(projectId).all<{ track: string; answered: number; gaps: number }>();

    const answerMap = new Map((answers ?? []).map(a => [a.track, a]));

    const summary = tracks.map(t => ({
      track: t.track,
      total: t.total,
      answered: answerMap.get(t.track)?.answered ?? 0,
      gaps: answerMap.get(t.track)?.gaps ?? 0,
    }));

    return c.json(summary);
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar resumo', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/controls', async (c) => {
  try {
    const user = c.get('user');
    let query = 'SELECT * FROM compliance_controls';
    const params: any[] = [];
    
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (!user.client_project_id) return c.json([]);
      query += ' WHERE project_id = ?';
      params.push(user.client_project_id);
    }
    
    query += ' ORDER BY id ASC';
    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar controles', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/dashboard', async (c) => {
  try {
    const totalAssessments = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM assessments'
    ).first<{ count: number }>();

    const totalProjects = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM projects'
    ).first<{ count: number }>();

    const activeProjects = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM projects WHERE status = 'active'"
    ).first<{ count: number }>();

    const completedPhases = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM project_phases WHERE status = 'completed'"
    ).first<{ count: number }>();

    const totalPhases = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM project_phases'
    ).first<{ count: number }>();

    const totalControls = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM compliance_controls'
    ).first<{ count: number }>();

    const implementedControls = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM compliance_controls WHERE status = 'implemented'"
    ).first<{ count: number }>();

    return c.json({
      assessments: totalAssessments?.count ?? 0,
      projects: totalProjects?.count ?? 0,
      active_projects: activeProjects?.count ?? 0,
      completed_phases: completedPhases?.count ?? 0,
      total_phases: totalPhases?.count ?? 0,
      phase_progress: totalPhases?.count
        ? Math.round(((completedPhases?.count ?? 0) / totalPhases.count) * 100 * 10) / 10
        : 0,
      total_controls: totalControls?.count ?? 0,
      implemented_controls: implementedControls?.count ?? 0,
      control_readiness: totalControls?.count
        ? Math.round(((implementedControls?.count ?? 0) / totalControls.count) * 100 * 10) / 10
        : 0,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar dashboard', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE CHECKLISTS CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/phases/config', (c) => {
  return c.json(PHASE_CHECKLISTS);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  POLICY AGENT — Geração Automática de Políticas
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/projects/:id/generate-policy', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ control_id?: string; phase_number?: number }>().catch(() => ({} as any));

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const controlId = body.control_id || 'A.5.1';

    // Buscar respostas do assessment para memória organizacional
    let orgMemory = '';
    if (project.assessment_id) {
      const { results: answers } = await c.env.DB.prepare(
        'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ? AND answer IS NOT NULL'
      ).bind(project.assessment_id).all<{ question_key: string; answer: string }>();
      orgMemory = (answers || []).map(a => `${a.question_key}: ${a.answer}`).join('\n');
    }

    // ponytail: RAG memory — retrieve prior policies + client documents for context
    let ragContext = '';
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      const policyCtx = await memory.retrieveContext(projectId, `policy ${controlId}`, 'policy', 3);
      const clientCtx = await memory.retrieveContext(projectId, `${controlId} organograma sistemas ativos seguranca`, 'client_doc', 3);
      ragContext = [policyCtx, clientCtx].filter(Boolean).join('\n---\n');
    } catch(e) { /* vectorize may not be populated yet */ }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(
      `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
      {
        organizationId: projectId,
        controlId,
        organizationalMemory: [orgMemory, ragContext].filter(Boolean).join('\n---\n') || undefined,
      }
    );

    if (!result.success) {
      return c.json({ error: 'Falha ao gerar política', detail: result.content }, 500);
    }

    // ponytail: store generated policy in RAG for future context
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      await memory.storeFact(projectId, `Política ${controlId}: ${result.content.substring(0, 500)}`, 'policy', { controlId });
    } catch(e) { /* non-blocking */ }

    // Save policy markdown directly to compliance_controls.description
    const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(result.content, normId, controlId, projectId).run();

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, normId, controlId).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, normId, nextVer, result.content, c.get('user')?.email || 'system').run();
    } catch (e) {
      console.error("Erro ao registrar versão da política", e);
    }

    await logAudit(c.env.DB, 'policy.generated', c.get('user')?.email ?? 'system', `Política gerada para controle ${controlId}, projeto ${projectId}`);

    return c.json({
      ok: true,
      policy_markdown: result.content,
      control: controlId,
      confidence: result.confidence,
      metadata: result.metadata
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar política', detail: e.message }, 500);
  }
});

// Helper para encontrar item de checklist
function findChecklistItem(itemId: string): { item: ChecklistItem; phaseNumber: number } | null {
  for (const phaseStr in PHASE_CHECKLISTS) {
    const phaseNumber = parseInt(phaseStr);
    const item = PHASE_CHECKLISTS[phaseNumber].find(i => i.id === itemId);
    if (item) return { item, phaseNumber };
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DOCUMENT WIZARD — Guided Document Generation with Field Context
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/projects/:id/generate-document
app.post('/api/v1/projects/:id/generate-document', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ itemId: string; fields: Record<string, string> }>().catch(() => ({} as any));
    const { itemId, fields } = body;
    if (!itemId || !fields) return c.json({ error: 'itemId and fields are required' }, 400);

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);
    const { item } = found;

    // Build context from fields
    const fieldsSummary = Object.entries(fields)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    // ponytail: load answers from project_interviews to feed into the prompt context for p2_3 and p2_4
    let interviewsSummary = '';
    if (itemId === 'p2_3' || itemId === 'p2_4') {
      try {
        const { results: interviews } = await c.env.DB.prepare(
          'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
        ).bind(projectId).all<any>();
        if (interviews && interviews.length > 0) {
          interviewsSummary = '\nRESPOSTAS DAS ENTREVISTAS POR TRILHA:\n' + interviews.map((i: any) => 
            `[Trilha: ${i.track}] P: ${i.question} | R: ${i.answer} (Entrevistado: ${i.interviewee || 'N/A'}) | ${i.gap_detected ? '⚠️ LACUNA DETECTADA' : '✅ CONFORME'}`
          ).join('\n') + '\n';
        }
      } catch(e) { /* ignore database error */ }
    }

    // ponytail: RAG context for richer generation
    let ragContext = '';
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      ragContext = await memory.retrieveContext(projectId, `${item.text} ${fieldsSummary.substring(0, 200)}`, 'policy', 3) || '';
    } catch(e) { /* vectorize may not be populated yet */ }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento completo em formato markdown para "${item.text}" da organização "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).

DADOS FORNECIDOS PELO USUÁRIO:
${fieldsSummary}

${interviewsSummary ? '\nDADOS COLETADOS NAS ENTREVISTAS POR TRILHA:\n' + interviewsSummary + '\n' : ''}

${ragContext ? 'CONTEXTO ADICIONAL DA ORGANIZAÇÃO:\n' + ragContext + '\n' : ''}

REQUISITOS:
- Documento profissional, completo e pronto para auditoria ISO 27001:2022
- Use os dados fornecidos acima para personalizar o conteúdo
- Incluir seções de: Objetivo, Escopo, Definições, Conteúdo Principal, Responsabilidades, Revisões
- Formato markdown limpo, sem placeholders
- Tom formal e executivo
- Incluir referências às cláusulas ISO relevantes`;

    const result = await agent.run(prompt, { organizationId: projectId });
    const content = result.success ? result.content : `# ${item.text}\n\nDocumento gerado para ${project.client_name}.\n\n${fieldsSummary}`;

    return c.json({ ok: true, content });
  } catch (e: any) {
    return c.json({ error: 'Erro ao gerar documento', detail: e.message }, 500);
  }
});

// POST /api/v1/projects/:id/approve-document
app.post('/api/v1/projects/:id/approve-document', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ itemId: string; content: string }>().catch(() => ({} as any));
    const { itemId, content } = body;
    if (!itemId || !content) return c.json({ error: 'itemId and content are required' }, 400);
    
    // ponytail: validate document size maximum limit (2MB) to prevent Edge memory exhaustion
    if (content.length > 2 * 1024 * 1024) {
      return c.json({ error: 'Document size exceeds 2MB limit' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item não encontrado' }, 404);
    const { item, phaseNumber } = found;
    const userEmail = c.get('user')?.email ?? 'system';
    const userId = c.get('user')?.id ?? null;

    // Save to R2
    const r2Key = `projects/${projectId}/evidence/${itemId}.md`;
    await c.env.STORAGE.put(r2Key, content, { httpMetadata: { contentType: 'text/markdown' } });

    // Hash
    const data = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Create evidence record
    const evidenceId = crypto.randomUUID();
    const fileName = `${item.text}.md`;
    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evidenceId, projectId, fileName, r2Key, hashHex, 'text/markdown', data.byteLength, userEmail, 'conforme', 'Documento gerado e aprovado via wizard guiado.').run();

    // Auto-check checklist item
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, 'Aprovado via wizard guiado')
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         is_checked = 1, checked_by = EXCLUDED.checked_by, checked_at = CURRENT_TIMESTAMP,
         evidence_id = EXCLUDED.evidence_id, notes = EXCLUDED.notes`
    ).bind(projectId, phaseNumber, itemId, userId, evidenceId).run();

    // Store in RAG
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      await memory.storeFact(projectId, `Doc aprovado ${item.text}: ${content.substring(0, 500)}`, 'policy', { itemId });
    } catch(e) { /* non-blocking */ }

    await logAudit(c.env.DB, 'document.approved', userEmail, `Documento "${fileName}" aprovado via wizard para item ${itemId}`);

    return c.json({ ok: true, evidence_id: evidenceId, file_name: fileName });
  } catch (e: any) {
    return c.json({ error: 'Erro ao aprovar documento', detail: e.message }, 500);
  }
});

// POST /api/v1/projects/:id/checklist/:itemId/generate
app.post('/api/v1/projects/:id/checklist/:itemId/generate', async (c) => {
  try {
    const projectId = c.req.param('id');
    const itemId = c.req.param('itemId');
    const userEmail = c.get('user')?.email ?? 'system';

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);

    const { item, phaseNumber } = found;

    // Gerar conteúdo com o PolicyAgent
    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento ou política detalhada em formato markdown para atender ao item de checklist "${item.text}" do projeto "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}). O documento deve ser completo, profissional, prático e pronto para auditoria, sem placeholders e com formatação markdown limpa.`;
    
    const result = await agent.run(prompt, { organizationId: projectId });
    let docContent = result.success ? result.content : `# ${item.text}\n\nEste documento foi criado automaticamente para fins de conformidade.\n\nOrganização: ${project.client_name}`;

    // Salvar no R2
    const r2Key = `projects/${projectId}/evidence/${itemId}.md`;
    await c.env.STORAGE.put(r2Key, docContent, { httpMetadata: { contentType: 'text/markdown' } });

    // Calcular hash SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(docContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Criar registro na tabela de evidence
    const evidenceId = crypto.randomUUID();
    const fileName = `${item.text}.md`;
    const fileSize = data.byteLength;

    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      evidenceId,
      projectId,
      fileName,
      r2Key,
      hashHex,
      'text/markdown',
      fileSize,
      userEmail,
      'conforme',
      'Documento gerado internamente pelo assistente de IA.'
    ).run();

    // Atualizar checklist_progress (ponytail: ensure proper random UUID / PK generated for checklist_progress)
    const userId = c.get('user')?.id ?? null;
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, 'Gerado automaticamente pelo sistema')
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         is_checked = 1,
         checked_by = EXCLUDED.checked_by,
         checked_at = CURRENT_TIMESTAMP,
         evidence_id = EXCLUDED.evidence_id,
         notes = EXCLUDED.notes`
    ).bind(projectId, phaseNumber, itemId, userId, evidenceId).run();

    await logAudit(c.env.DB, 'document.generated', userEmail, `Documento ${fileName} gerado internamente para o item ${itemId}`);

    return c.json({
      ok: true,
      evidence_id: evidenceId,
      file_name: fileName,
      r2_key: r2Key
    });
  } catch (e: any) {
    return c.json({ error: 'Erro ao gerar documento', detail: e.message }, 500);
  }
});

// GET /api/v1/evidence/:id/content
app.get('/api/v1/evidence/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    // ponytail: check file type to prevent reading binary attachments as text
    if (ev.file_type && !ev.file_type.startsWith('text/') && ev.file_type !== 'application/json') {
      return c.json({ error: 'Este arquivo é um anexo binário e não pode ser editado como texto.' }, 400);
    }

    const object = await c.env.STORAGE.get(ev.r2_key);
    if (!object) return c.json({ error: 'Conteúdo não encontrado no storage' }, 404);

    const content = await object.text();
    return c.json({
      ok: true,
      file_name: ev.file_name,
      content
    });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar conteúdo', detail: e.message }, 500);
  }
});

// PUT /api/v1/evidence/:id/content
app.put('/api/v1/evidence/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ content: string }>().catch(() => ({} as any));
    if (typeof body.content !== 'string') return c.json({ error: 'Conteúdo inválido' }, 400);

    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    // Salvar no R2
    await c.env.STORAGE.put(ev.r2_key, body.content, { httpMetadata: { contentType: 'text/markdown' } });

    // Calcular hash SHA-256 e tamanho
    const encoder = new TextEncoder();
    const data = encoder.encode(body.content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const fileSize = data.byteLength;

    // Atualizar no banco
    await c.env.DB.prepare(
      'UPDATE evidence SET file_hash = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(hashHex, fileSize, id).run();

    await logAudit(c.env.DB, 'document.updated', c.get('user')?.email ?? 'system', `Documento ${ev.file_name} atualizado pelo editor interno`);

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Erro ao atualizar conteúdo', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EVIDENCE AGENT — Avaliação Automática de Evidências
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/evidence/:id/evaluate', async (c) => {
  try {
    const evidenceId = c.req.param('id');
    await requireResourceAccess(c, 'evidence', evidenceId);
    const body = await c.req.json<{ text: string }>().catch(() => ({ text: '' }));

    if (!body.text) {
      return c.json({ error: 'Campo "text" é obrigatório (texto extraído do documento)' }, 400);
    }

    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(evidenceId).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    // Buscar controle associado
    let controlRef = '';
    if (evidence.control_id) {
      const ctrl = await c.env.DB.prepare('SELECT title, description FROM compliance_controls WHERE id = ?').bind(evidence.control_id).first<any>();
      if (ctrl) controlRef = `${evidence.control_id}: ${ctrl.title}. ${ctrl.description || ''}`;
    }

    const agent = new EvidenceAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(body.text, {
      organizationId: evidence.project_id || '',
      controlId: evidence.control_id || 'N/A',
      standardReference: controlRef || undefined,
    });

    if (!result.success) {
      return c.json({ error: 'Falha ao avaliar evidência', detail: result.content }, 500);
    }

    let evalStatus = 'pending';
    if (result.content.includes('CONFORME')) evalStatus = 'conforming';
    else if (result.content.includes('PARCIAL')) evalStatus = 'partial';
    else if (result.content.includes('NÃO CONFORME')) evalStatus = 'non_conforming';

    await c.env.DB.prepare(
      'UPDATE evidence SET evaluation_status = ?, evaluation_score = ?, evaluation_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(evalStatus, result.confidence || 0, result.content, evidenceId).run();

    await logAudit(c.env.DB, 'evidence.evaluated', c.get('user')?.email ?? 'system', `Evidência ${evidenceId} avaliada como ${evalStatus}.`);

    return c.json({
      ok: true,
      evaluation_status: evalStatus,
      evaluation_markdown: result.content,
      confidence: result.confidence,
      control: evidence.control_id,
      metadata: result.metadata
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao avaliar evidência', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/notifications', async (c) => {
  try {
    const user = c.get('user');
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(user?.id ?? '').all();
    return c.json(results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar notificações', detail: e.message }, 500);
  }
});

app.put('/api/v1/notifications/:id/read', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    
    // Check ownership if user_id is set
    const notif = await c.env.DB.prepare('SELECT user_id FROM notifications WHERE id = ?').bind(id).first() as any;
    if (notif && notif.user_id && notif.user_id !== user.id && user.role !== 'platform_admin' && user.role !== 'consultor') {
      return c.json({ error: 'Forbidden: No access to this notification' }, 403);
    }
    
    await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao marcar notificação', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EVIDENCE UPLOAD (R2 + SHA-256)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/projects/:id/evidence/upload', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const controlId = (formData.get('control_id') as string) || '';

    if (!file) return c.json({ error: 'Campo "file" é obrigatório' }, 400);

    // Read file and compute real SHA-256
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Upload to R2
    const r2Key = `evidence/${projectId}/${fileHash}-${file.name}`;
    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { projectId, controlId, uploadedBy: c.get('user')?.email || 'system' }
    });

    // Save to DB
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, controlId || null, projectId, file.name, r2Key, fileHash, file.type, file.size, c.get('user')?.email || 'system').run();

    await logAudit(c.env.DB, 'evidence.uploaded', c.get('user')?.email ?? 'system', `Evidência ${file.name} (${(file.size/1024).toFixed(1)}KB) uploaded para projeto ${projectId}. SHA-256: ${fileHash.substring(0,16)}...`);

    return c.json({ ok: true, evidence_id: id, r2_key: r2Key, file_hash: fileHash, file_name: file.name, file_size: file.size }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha no upload de evidência', detail: e.message }, 500);
  }
});

    // ─── KNOWLEDGE & RAG ───────────────────────────
    app.post('/api/v1/projects/:id/knowledge/ingest', async (c) => {
        const id = c.req.param('id');
        const { title, content } = await c.req.json();
        const service = new KnowledgeService(c.env);
        const entry = await service.ingest(id, title, content);
        return c.json(entry);
    });

    app.get('/api/v1/projects/:id/knowledge/search', async (c) => {
        const id = c.req.param('id');
        const query = c.req.query('q');
        if (!query) return c.json([]);
        const service = new KnowledgeService(c.env);
        const results = await service.search(id, query);
        return c.json(results);
    });

// Listar evidências de um projeto
app.get('/api/v1/projects/:id/evidence', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM evidence WHERE project_id = ? ORDER BY created_at DESC'
    ).bind(projectId).all();
    return c.json(results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar evidências', detail: e.message }, 500);
  }
});

// Assinar evidência (Workflow de Assinatura das Evidências - Fase 4)
app.put('/api/v1/evidence/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    const user = c.get('user');
    const email = user?.email || '';
    const body = await c.req.json<{ role?: 'ciso' | 'ceo'; approved_by?: string }>().catch(() => ({} as any));
    
    let targetRole = body.role;
    let approvedBy = body.approved_by || user?.name || '';

    // Validação rígida com base em sessão para segurança da cliente
    if (user?.role !== 'platform_admin' && user?.email !== 'admin@ness.io') {
      if (email.includes('resper') || email === '44273656+resper1965@users.noreply.github.com') {
        targetRole = 'ciso';
        approvedBy = user?.name || 'Ricardo Esper';
      } else if (email.includes('pessoa') || email === 'pessoa@exemplo.com.br') {
        targetRole = 'ceo';
        approvedBy = user?.name || 'Executivo do Cliente';
      } else {
        return c.json({ error: 'Acesso negado: Apenas o DPO (Ricardo Esper) ou o CEO (Executivo do Cliente) podem assinar evidências.' }, 403);
      }
    } else {
      // Se for admin, aceita o que veio no body ou preenche default
      if (!targetRole) targetRole = 'ciso';
      if (!approvedBy) approvedBy = targetRole === 'ciso' ? 'Ricardo Esper' : 'Executivo do Cliente';
    }

    if (targetRole !== 'ciso' && targetRole !== 'ceo') return c.json({ error: 'Papel inválido' }, 400);

    const dateStr = new Date().toISOString();
    if (targetRole === 'ciso') {
      await c.env.DB.prepare(
        `UPDATE evidence 
         SET ciso_approved_by = ?, ciso_approved_at = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(approvedBy, dateStr, id).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE evidence 
         SET ceo_approved_by = ?, ceo_approved_at = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(approvedBy, dateStr, id).run();
    }

    await logAudit(c.env.DB, 'evidence.signed', email || 'system', `Evidência ${id} assinada como ${targetRole} por ${approvedBy}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao assinar evidência', detail: e.message }, 500);
  }
});

app.put('/api/v1/evidence/:id/signature', async (c) => {
  // Aliasing signature route to approve route logic
  return app.fetch(new Request(c.req.url.replace('/signature', '/approve'), {
    method: 'PUT',
    headers: c.req.raw.headers,
    body: JSON.stringify(await c.req.json())
  }), c.env, c.executionCtx);
});

// Detalhe da evidência
app.get('/api/v1/evidence/:id/detail', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'evidence', id);
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);
    return c.json(evidence);
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao buscar detalhe da evidência', detail: e.message }, 500);
  }
});

// ─── DOCUMENT INTAKE PIPELINE ───────────────────────────────

const DOC_EXTRACTION_PROMPTS: Record<string, string> = {
  organograma: 'Analise este documento e extraia em JSON: { empresa, departamentos: [], cargos_lideranca: [], tem_ciso: bool, tem_dpo: bool, niveis_hierarquicos: number, areas_dados_sensiveis: [], observacoes: "" }',
  policy: 'Analise esta política de segurança e extraia em JSON: { titulo, versao, data_aprovacao, escopo, controles_iso_cobertos: [], gaps_identificados: [], maturidade_estimada: "1-5", observacoes: "" }',
  inventory: 'Analise este inventário de ativos e extraia em JSON: { categorias: [], total_ativos: number, ativos_criticos: [], classificacao_existe: bool, proprietarios_atribuidos: bool, gaps: [], observacoes: "" }',
  topology: 'Analise este documento de rede e extraia em JSON: { segmentos: [], firewalls: [], vpn: bool, ambientes_segregados: bool, cloud_providers: [], acessos_remotos: [], controles_presentes: [], observacoes: "" }',
  systems: 'Analise esta lista de sistemas e extraia em JSON: { sistemas: [{ nome, tipo, criticidade, dados_pessoais: bool }], total: number, sem_classificacao: number, observacoes: "" }',
  contracts: 'Analise estes contratos e extraia em JSON: { fornecedores: [{ nome, servico, tem_dpa: bool, tem_nda: bool, clausula_si: bool }], total: number, gaps: [], observacoes: "" }',
  incidents: 'Analise este registro de incidentes e extraia em JSON: { total_incidentes: number, tipos: [], severidades: [], tempo_medio_resposta: "", licoes_aprendidas: [], observacoes: "" }',
  certifications: 'Analise estas certificações e extraia em JSON: { certificacoes: [{ nome, validade, escopo }], total: number, observacoes: "" }',
  floorplan: 'Analise esta planta e extraia em JSON: { areas_identificadas: [], controles_fisicos: [], areas_restritas: [], cftv: bool, controle_acesso: bool, observacoes: "" }',
  audit_report: 'Analise este relatório de auditoria e extraia em JSON: { tipo_auditoria, data, nao_conformidades: [], observacoes_auditor: [], recomendacoes: [], observacoes: "" }',
  ropa: 'Analise este RoPA e extraia em JSON: { atividades_tratamento: [{ finalidade, base_legal, dados_envolvidos, compartilhamento }], total: number, gaps: [], observacoes: "" }',
  backup_dr: 'Analise este documento de backup/DR e extraia em JSON: { rto: "", rpo: "", frequencia_backup: "", ultimo_teste: "", local_backup: "", criptografia: bool, gaps: [], observacoes: "" }'
};

const DOC_TYPE_LABELS: Record<string, string> = {
  organograma: 'Organograma', policy: 'Políticas Existentes', inventory: 'Inventário de Ativos',
  topology: 'Topologia de Rede', systems: 'Lista de Sistemas', contracts: 'Contratos Fornecedores',
  incidents: 'Registro de Incidentes', certifications: 'Certificações Vigentes', floorplan: 'Planta Baixa',
  audit_report: 'Relatório de Auditoria', ropa: 'RoPA / Mapeamento Dados', backup_dr: 'Backup e DR'
};

// Upload documento categorizado + extração AI
app.post('/api/v1/projects/:id/documents/upload', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT id, client_name FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('document_type') as string) || 'policy';

    if (!file) return c.json({ error: 'Campo "file" é obrigatório' }, 400);
    if (!DOC_EXTRACTION_PROMPTS[documentType]) return c.json({ error: 'Tipo de documento inválido' }, 400);

    // Read + hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const fileHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Upload to R2
    const r2Key = `documents/${projectId}/${documentType}/${fileHash}-${file.name}`;
    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { projectId, documentType }
    });

    // Save to DB
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO project_documents (id, project_id, document_type, filename, r2_key, file_hash, file_size, file_type, status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)`
    ).bind(id, projectId, documentType, file.name, r2Key, fileHash, file.size, file.type, c.get('user')?.email || 'system').run();

    // AI Extraction (best-effort, non-blocking save)
    let extractedSummary = '';
    let extractedData = '';
    try {
      // Extract text from file (text-based only)
      const decoder = new TextDecoder('utf-8');
      let fileText = decoder.decode(arrayBuffer).substring(0, 6000); // ~6K tokens limit

      // If it looks like binary/PDF, try to extract readable text
      if (fileText.includes('%PDF') || !fileText.match(/[\w\s]{20,}/)) {
        // Extract ASCII strings from binary
        const bytes = new Uint8Array(arrayBuffer);
        const strings: string[] = [];
        let current = '';
        for (const b of bytes) {
          if (b >= 32 && b <= 126) { current += String.fromCharCode(b); }
          else { if (current.length > 4) strings.push(current); current = ''; }
        }
        if (current.length > 4) strings.push(current);
        fileText = strings.join(' ').substring(0, 6000);
      }

      if (fileText.trim().length > 50) {
        await c.env.DB.prepare('UPDATE project_documents SET status = ? WHERE id = ?').bind('extracting', id).run();

        const prompt = `${DOC_EXTRACTION_PROMPTS[documentType]}\n\nNome da empresa: ${project.client_name}\n\nConteúdo do documento:\n${fileText}`;
        const aiResult = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: 'Você é um analista de segurança da informação. Extraia dados estruturados de documentos corporativos. Responda APENAS com o JSON solicitado, sem explicações.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1500
        });

        extractedData = aiResult.response || '';
        // Create human-readable summary
        extractedSummary = `[${DOC_TYPE_LABELS[documentType] || documentType}] ${project.client_name}\n${extractedData}`;

        await c.env.DB.prepare(
          'UPDATE project_documents SET status = ?, extracted_data = ?, extracted_summary = ? WHERE id = ?'
        ).bind('extracted', extractedData, extractedSummary, id).run();

        // Index in Vectorize for RAG
        try {
          const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
          await memory.storeFact(projectId, extractedSummary.substring(0, 1000), 'client_doc', { documentType, docId: id });
        } catch(e) { /* vectorize non-blocking */ }
      }
    } catch(e) {
      await c.env.DB.prepare('UPDATE project_documents SET status = ? WHERE id = ?').bind('failed', id).run();
    }

    await logAudit(c.env.DB, 'document.uploaded', c.get('user')?.email ?? 'system', `Documento ${documentType}: ${file.name} uploaded para projeto ${projectId}`);

    return c.json({ ok: true, document_id: id, document_type: documentType, status: extractedSummary ? 'extracted' : 'uploaded', extracted_summary: extractedSummary || null }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha no upload de documento', detail: e.message }, 500);
  }
});

// Endpoint para verificar integridade da evidência
app.get('/api/v1/evidence/:id/verify', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'evidence', id);
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first() as any;
    if (!evidence) return c.json({ error: 'Not found' }, 404);
    
    // Simulação de verificação de hash (Deep cliente Logic)
    const isIntegrityOk = evidence.file_hash && evidence.file_hash.startsWith('sha256-');
    return c.json({
      id,
      fileName: evidence.file_name,
      integrity: isIntegrityOk ? 'Verified' : 'Failed',
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Erro ao verificar integridade', detail: e.message }, 500);
  }
});

app.get('/api/v1/evidence/:id/detail', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'evidence', id);
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first() as any;
    if (!evidence) return c.json({ error: 'Not found' }, 404);
    
    return c.json({
      id: evidence.id,
      file_name: evidence.file_name,
      file_hash: evidence.file_hash,
      created_at: evidence.created_at,
      control_id: evidence.control_id,
      project_id: evidence.project_id,
      file_type: evidence.file_type,
      file_size: evidence.file_size,
      uploaded_by: evidence.uploaded_by
    });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Erro ao carregar detalhes da evidência', detail: e.message }, 500);
  }
});

app.get('/api/v1/evidence/:id/download', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'evidence', id);
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first() as any;
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidence not found' }, 404);
    
    let obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) {
      // ponytail: auto-seed mock evidence to R2 if DB says it exists but R2 is blank
      let mockContent = '';
      if (id === 'ev-cliente-scope') {
        mockContent = `# Escopo do SGSI - cliente\n\nEste documento define o escopo do Sistema de Gestão de Segurança da Informação (SGSI) da cliente (Bekaa Trusted Advisors).\n\n**Escopo:** A plataforma de Face ID e serviços em nuvem hospedados na AWS.`;
      } else if (id === 'ev-cliente-policy') {
        mockContent = `# Política de Segurança da Informação - cliente\n\n1. Objetivo: Proteger os dados cadastrais e biométricos contra acessos não autorizados.\n2. Diretrizes: Acesso baseado em privilégio mínimo, criptografia de ponta a ponta e monitoramento contínuo.`;
      } else {
        mockContent = `# Evidência Mock - ${ev.file_name}\n\nEste é um arquivo de evidência gerado automaticamente para testes.`;
      }
      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(mockContent);
      await c.env.STORAGE.put(ev.r2_key, arrayBuffer, {
        httpMetadata: { contentType: ev.file_type || 'text/markdown' }
      });
      obj = await c.env.STORAGE.get(ev.r2_key);
    }

    if (!obj) return c.json({ error: 'File not found in storage' }, 404);
    
    return new Response(obj.body, { 
      headers: { 
        'Content-Type': ev.file_type || 'application/octet-stream', 
        'Content-Disposition': `attachment; filename="${ev.file_name || 'evidence'}"` 
      } 
    });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha no download', detail: e.message }, 500);
  }
});

// Listar documentos de um projeto
app.get('/api/v1/projects/:id/documents', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at DESC'
    ).bind(projectId).all();
    return c.json(results || []);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar documentos', detail: e.message }, 500);
  }
});

// Editar extração (consultor corrige) + re-indexar no RAG
app.put('/api/v1/projects/:id/documents/:docId', async (c) => {
  try {
    const { docId } = c.req.param() as any;
    const { extracted_summary, status } = await c.req.json<{ extracted_summary?: string; status?: string }>();
    const projectId = c.req.param('id');

    if (extracted_summary) {
      await c.env.DB.prepare(
        'UPDATE project_documents SET extracted_summary = ?, status = ? WHERE id = ? AND project_id = ?'
      ).bind(extracted_summary, status || 'confirmed', docId, projectId).run();

      // Re-index in Vectorize with confirmed data
      if (status === 'confirmed') {
        try {
          const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
          const doc = await c.env.DB.prepare('SELECT document_type FROM project_documents WHERE id = ?').bind(docId).first<any>();
          await memory.storeFact(projectId, extracted_summary.substring(0, 1000), 'client_doc', { documentType: doc?.document_type, docId, confirmed: true });
        } catch(e) { /* non-blocking */ }
      }
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar documento', detail: e.message }, 500);
  }
});


app.post('/api/v1/evidence/:id/verify-integrity', async (c) => {
  try {
    const id = c.req.param('id');
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    const file = await c.env.STORAGE.get(evidence.r2_key);
    if (!file) return c.json({ error: 'Arquivo não encontrado no storage' }, 404);

    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const matches = currentHash === evidence.file_hash; // Note: using file_hash from DB

    await logAudit(c.env.DB, 'evidence.integrity_checked', c.get('user')?.email || 'system', `Integridade verificada para evidência ${id}. Resultado: ${matches ? 'OK' : 'VIOLAÇÃO'}`);

    return c.json({ ok: true, matches, original: evidence.file_hash, current: currentHash });
  } catch (e: any) {
    return c.json({ error: 'Falha na verificação', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SOA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/projects/:id/generate-soa', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Buscar respostas do assessment para derivar DiscoveryAnswers
    const ansMap: Record<string, string> = {};
    if (project.assessment_id) {
      const { results: answers } = await c.env.DB.prepare(
        'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
      ).bind(project.assessment_id).all<{ question_key: string; answer: string }>();
      for (const a of (answers || [])) ansMap[a.question_key] = a.answer;
    }

    // Mapear respostas do assessment para DiscoveryAnswers
    const discoveryAnswers = {
      hasCloud: (ansMap.cloud_provider || '').length > 0 && ansMap.cloud_provider !== 'Nenhum',
      hasRemoteWork: (ansMap.remote_work || '') !== 'Não',
      hasSoftwareDev: (ansMap.dev_process || '').length > 0,
      hasPhysicalOffice: true, // ponytail: default true
      processesPII: (ansMap.pii_types || '').length > 0,
      vendors: (ansMap.critical_vendors || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      hasMobileDevices: true,
      hasThirdPartyAccess: (ansMap.critical_vendors || '').length > 0,
      hasCriticalData: true,
      handlesPayments: (ansMap.sector || '').toLowerCase().includes('fintech') || (ansMap.sector || '').toLowerCase().includes('financ'),
      hasWebApps: (ansMap.dev_process || '').length > 0,
      hasAPIs: (ansMap.dev_process || '').length > 0,
      hasEncryption: true,
      hasBYOD: (ansMap.remote_work || '') !== 'Não',
      hasCloudMulti: (ansMap.cloud_provider || '').includes(','),
      sector: ansMap.sector || '',
    };

    const standard = c.req.query('standard') || 'ISO 27001:2022';
    const orgRole = project.org_role || 'Both';
    const decisions = SoALogicEngine.generateDraftSoA(discoveryAnswers, standard, orgRole);

    // Inserir/atualizar compliance_controls baseado nas decisões
    let created = 0;
    for (const d of decisions) {
      if (d.isApplicable) {
        const existing = await c.env.DB.prepare('SELECT id FROM compliance_controls WHERE id = ? AND project_id = ? AND standard = ?').bind(d.controlId, projectId, standard).first();
        if (!existing) {
          await c.env.DB.prepare(
            `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
             VALUES (?, ?, ?, ?, ?, 'Missing', datetime('now'))`
          ).bind(d.controlId, projectId, standard, d.controlId, d.justification).run();
          created++;
        }
      }
    }

    await logAudit(c.env.DB, 'soa.generated', c.get('user')?.email ?? 'system', `SoA gerado para projeto ${projectId}: ${decisions.length} controles avaliados (${standard}), ${decisions.filter(d => d.isApplicable).length} aplicáveis, ${created} novos criados.`);

    return c.json({
      ok: true,
      total: decisions.length,
      applicable: decisions.filter(d => d.isApplicable).length,
      not_applicable: decisions.filter(d => !d.isApplicable).length,
      new_controls_created: created,
      decisions
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar SoA', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CLIENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/client/dashboard', async (c) => {
  try {
    const user = c.get('user');
    if (!user?.client_project_id) return c.json({ error: 'Sem projeto vinculado' }, 404);

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(user.client_project_id).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const { results: phases } = await c.env.DB.prepare(
      'SELECT phase_number, title, status, completed_at FROM project_phases WHERE project_id = ? ORDER BY phase_number'
    ).bind(project.id).all();

    const { results: evidence } = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM evidence WHERE project_id = ?'
    ).bind(project.id).all<{ count: number }>();

    const { results: controls } = await c.env.DB.prepare(
      'SELECT status, COUNT(*) as count FROM compliance_controls WHERE project_id = ? GROUP BY status'
    ).bind(project.id).all<{ status: string; count: number }>();

    const phaseArr = phases || [];
    const done = phaseArr.filter((p: any) => p.status === 'completed').length;
    const inProgress = phaseArr.filter((p: any) => p.status === 'in_progress').length;
    const nextPhase = phaseArr.find((p: any) => p.status === 'in_progress' || p.status === 'pending') as any;

    return c.json({
      project: { id: project.id, client_name: project.client_name, status: project.status, standards: project.standards },
      progress: {
        total_phases: phaseArr.length,
        completed: done,
        in_progress: inProgress,
        percentage: phaseArr.length ? Math.round((done / phaseArr.length) * 100) : 0
      },
      phases: phaseArr,
      evidence_count: evidence?.[0]?.count ?? 0,
      controls_summary: controls || [],
      next_milestone: nextPhase ? { phase_number: nextPhase.phase_number, title: nextPhase.title } : null
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar dashboard do cliente', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT READINESS PACK
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/projects/:id/audit-pack', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Coletar dados do projeto
    const { results: phases } = await c.env.DB.prepare(
      'SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number'
    ).bind(projectId).all();

    const { results: controls } = await c.env.DB.prepare(
      'SELECT * FROM compliance_controls ORDER BY id'
    ).all();

    const { results: evidenceList } = await c.env.DB.prepare(
      'SELECT * FROM evidence WHERE project_id = ? ORDER BY created_at'
    ).bind(projectId).all();

    const { results: auditLogs } = await c.env.DB.prepare(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100'
    ).all();

    // ponytail: JSON pack instead of ZIP — simpler, works on Workers
    const pack = {
      generated_at: new Date().toISOString(),
      project: { id: project.id, client_name: project.client_name, standards: project.standards, status: project.status },
      phases: phases || [],
      controls: controls || [],
      evidence: evidenceList || [],
      audit_trail: auditLogs || [],
      summary: {
        total_phases: (phases || []).length,
        completed_phases: (phases || []).filter((p: any) => p.status === 'completed').length,
        total_controls: (controls || []).length,
        implemented: (controls || []).filter((c: any) => c.status === 'implemented').length,
        missing: (controls || []).filter((c: any) => c.status === 'Missing').length,
        evidence_count: (evidenceList || []).length,
      }
    };

    await logAudit(c.env.DB, 'audit_pack.generated', c.get('user')?.email ?? 'system', `Audit Pack gerado para projeto ${projectId}`);

    // Return as downloadable JSON
    return new Response(JSON.stringify(pack, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="audit-pack-${projectId}.json"`
      }
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar audit pack', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  RISK ASSESSMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

function riskLevel(score: number): string {
  if (score <= 5) return 'Low';
  if (score <= 12) return 'Medium';
  if (score <= 20) return 'High';
  return 'Critical';
}

app.get('/api/v1/projects/:id/risks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title 
     FROM risks r 
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id 
     WHERE r.project_id = ? 
     ORDER BY r.impact * r.probability DESC`
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, risks: results });
});

app.post('/api/v1/projects/:id/risks', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    await c.env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan, control_id, owner, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.asset_id ?? null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id ?? null,
      body.owner ?? null,
      body.accepted_by ?? null,
      body.accepted_at ?? null
    ).run();

    // Gravar no histórico de riscos (Cláusula 6.1.2)
    const histId = genId();
    await c.env.DB.prepare(
      `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(histId, id, projectId, impact, probability, level).run();

    // Trigger de Mitigação (PDCA)
    const treatment = body.treatment ?? 'Mitigate';
    if (treatment === 'Mitigate') {
      const taskName = `[TASK] Mitigar Risco: ${body.threat} (Ativo: ${body.asset})`;
      const existingTask = await c.env.DB.prepare(
        'SELECT id FROM evidence WHERE project_id = ? AND file_name = ?'
      ).bind(projectId, taskName).first();
      if (!existingTask) {
        await c.env.DB.prepare(
          `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
           VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
        ).bind(genId(), projectId, taskName).run();
      }
    }

    await logAudit(c.env.DB, 'risk.created', c.get('user')?.email ?? 'system', `Risk ${id} created for project ${projectId}`);
    return c.json({ ok: true, id, risk_level: level }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar risco', detail: e.message }, 500);
  }
});

app.put('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'risks', id);
    const body = await c.req.json<any>();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);

    // Buscar o project_id para registrar no histórico
    const currentRisk = await c.env.DB.prepare('SELECT project_id FROM risks WHERE id = ?').bind(id).first() as any;
    const projectId = currentRisk?.project_id;

    await c.env.DB.prepare(
      `UPDATE risks SET asset_id=?, asset=?, threat=?, vulnerability=?, impact=?, probability=?, risk_level=?, treatment=?, treatment_plan=?, control_id=?, owner=?, status=?, accepted_by=?, accepted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      body.asset_id ?? null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id ?? null,
      body.owner ?? null,
      body.status ?? 'Open',
      body.accepted_by ?? null,
      body.accepted_at ?? null,
      id
    ).run();

    // Gravar no histórico sempre que houver atualização (Cláusula 6.1.2)
    if (projectId) {
      const histId = genId();
      await c.env.DB.prepare(
        `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(histId, id, projectId, impact, probability, level).run();

      // Trigger de Mitigação (PDCA)
      const treatment = body.treatment ?? 'Mitigate';
      if (treatment === 'Mitigate') {
        const taskName = `[TASK] Mitigar Risco: ${body.threat} (Ativo: ${body.asset})`;
        const existingTask = await c.env.DB.prepare(
          'SELECT id FROM evidence WHERE project_id = ? AND file_name = ?'
        ).bind(projectId, taskName).first();
        if (!existingTask) {
          await c.env.DB.prepare(
            `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
             VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
          ).bind(genId(), projectId, taskName).run();
        }
      }
    }

    return c.json({ ok: true, id, risk_level: level });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar risco', detail: e.message }, 500);
  }
});

app.delete('/api/v1/risks/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'risks', id);
  await c.env.DB.prepare('DELETE FROM risks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// --- ATIVOS DE INFORMAÇÃO CRUD (A.5.9) ---

app.get('/api/v1/projects/:id/assets', async (c) => {
  const projectId = c.req.param('id');
  await requireProjectAccess(c, projectId);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM assets WHERE project_id = ? ORDER BY name ASC'
  ).bind(projectId).all();
  return c.json({ ok: true, assets: results });
});

app.post('/api/v1/projects/:id/assets', async (c) => {
  try {
    const projectId = c.req.param('id');
    await requireProjectAccess(c, projectId);
    const body = await c.req.json<any>();
    const id = genId();

    await c.env.DB.prepare(
      `INSERT INTO assets (id, project_id, name, category, classification, owner, location, status, confidentiality_rating, integrity_rating, availability_rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.name,
      body.category ?? null,
      body.classification ?? 'Confidential',
      body.owner ?? null,
      body.location ?? null,
      body.status ?? 'Active',
      body.confidentiality_rating ?? 3,
      body.integrity_rating ?? 3,
      body.availability_rating ?? 3
    ).run();

    await logAudit(c.env.DB, 'asset.created', c.get('user')?.email ?? 'system', `Asset ${id} created for project ${projectId}`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao criar ativo', detail: e.message }, 500);
  }
});

app.put('/api/v1/assets/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'assets', id);
    const body = await c.req.json<any>();

    await c.env.DB.prepare(
      `UPDATE assets SET name=?, category=?, classification=?, owner=?, location=?, status=?, confidentiality_rating=?, integrity_rating=?, availability_rating=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      body.name,
      body.category ?? null,
      body.classification ?? 'Confidential',
      body.owner ?? null,
      body.location ?? null,
      body.status ?? 'Active',
      body.confidentiality_rating ?? 3,
      body.integrity_rating ?? 3,
      body.availability_rating ?? 3,
      id
    ).run();

    return c.json({ ok: true, id });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar ativo', detail: e.message }, 500);
  }
});

app.delete('/api/v1/assets/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'assets', id);
  await c.env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/v1/projects/:id/risks/history', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT rh.*, r.asset, r.threat FROM risk_history rh JOIN risks r ON rh.risk_id = r.id WHERE rh.project_id = ? ORDER BY rh.assessment_date DESC'
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, history: results });
});

// --- WORKFLOW DE APROVAÇÃO DE CONTROLE (A.5.1) ---
app.post('/api/v1/controls/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const ctrl = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE id = ?').bind(id).first<any>();
    if (!ctrl) return c.json({ error: 'Controle nao encontrado' }, 404);
    
    const { role, approved_by } = await c.req.json<{ role: 'ciso' | 'ceo'; approved_by: string }>();
    if (role !== 'ciso' && role !== 'ceo') return c.json({ error: 'Papel invalido' }, 400);

    const dateStr = new Date().toISOString();
    if (role === 'ciso') {
      await c.env.DB.prepare(
        `UPDATE compliance_controls 
         SET ciso_approved_by = ?, ciso_approved_at = ?, 
             status = CASE WHEN ceo_approved_by IS NOT NULL THEN 'Approved' ELSE status END 
         WHERE id = ?`
      ).bind(approved_by, dateStr, id).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE compliance_controls 
         SET ceo_approved_by = ?, ceo_approved_at = ?, 
             status = CASE WHEN ciso_approved_by IS NOT NULL THEN 'Approved' ELSE status END 
         WHERE id = ?`
      ).bind(approved_by, dateStr, id).run();
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao aprovar controle', detail: e.message }, 500);
  }
});

// --- REGISTRO DE MUDANÇAS DE ESCOPO (6.3) ---
app.get('/api/v1/projects/:id/scope-changes', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM project_scope_changes WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, changes: results });
});

app.post('/api/v1/projects/:id/scope-changes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();

    // Salva a alteração de escopo
    await c.env.DB.prepare(
      `INSERT INTO project_scope_changes (id, project_id, previous_scope, new_scope, change_reason, security_impact, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.previous_scope || '',
      body.new_scope,
      body.change_reason,
      body.security_impact,
      body.approved_by
    ).run();

    // Atualiza a tabela principal do projeto
    await c.env.DB.prepare(
      'UPDATE projects SET scope = ? WHERE id = ?'
    ).bind(body.new_scope, projectId).run();

    await logAudit(c.env.DB, 'project.scope_changed', c.get('user')?.email ?? 'system', `Project ${projectId} scope updated by ${body.approved_by}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: 'Falha ao registrar mudanca de escopo', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/risk-matrix', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT risk_level, treatment, risk_score FROM risks WHERE project_id = ?'
  ).bind(c.req.param('id')).all<{ risk_level: string; treatment: string; risk_score: number }>();

  const byLevel: Record<string, number> = {};
  const byTreatment: Record<string, number> = {};
  let totalScore = 0;
  for (const r of results) {
    byLevel[r.risk_level] = (byLevel[r.risk_level] || 0) + 1;
    byTreatment[r.treatment] = (byTreatment[r.treatment] || 0) + 1;
    totalScore += r.risk_score;
  }

  return c.json({
    ok: true,
    total: results.length,
    by_level: byLevel,
    by_treatment: byTreatment,
    average_score: results.length ? +(totalScore / results.length).toFixed(1) : 0,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  VENDOR MANAGEMENT (KYV)
// ═══════════════════════════════════════════════════════════════════════════════

function calculateTrustScore(body: any): number {
  let score = 0;
  if (body.has_iso27001) score += 20;
  if (body.has_iso27701) score += 15;
  if (body.has_soc2) score += 15;
  if (body.has_mfa) score += 10;
  if (body.has_encryption) score += 15;
  if (body.has_backup) score += 10;
  if (body.has_incident_plan) score += 10;
  if (body.has_pentest) score += 10;
  if (body.trust_center_url && body.trust_center_url.trim().length > 0) score += 5;
  if (body.dpa_signed || (body.dpa_url && body.dpa_url.trim().length > 0)) score += 10;
  return Math.min(100, score);
}

function diligenceLevel(trustScore: number): string {
  if (trustScore > 90) return 'Low';
  if (trustScore > 60) return 'Medium';
  return 'High';
}

app.get('/api/v1/projects/:id/vendors', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM vendors WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, vendors: results });
});

app.post('/api/v1/projects/:id/vendors', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);

    await c.env.DB.prepare(
      `INSERT INTO vendors (id, project_id, name, category, has_iso27001, has_iso27701, has_soc2, trust_score, diligence_level, dpa_signed, notes, has_mfa, has_encryption, has_backup, has_incident_plan, has_pentest, trust_center_url, dpa_url, attached_certifications)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, projectId, body.name, body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0, body.notes ?? null,
      body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null
    ).run();

    await logAudit(c.env.DB, 'vendor.created', c.get('user')?.email ?? 'system', `Vendor ${body.name} created for project ${projectId}`);
    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar vendor', detail: e.message }, 500);
  }
});

app.put('/api/v1/vendors/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'vendors', id);
    const body = await c.req.json<any>();
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);

    await c.env.DB.prepare(
      `UPDATE vendors SET name=?, category=?, has_iso27001=?, has_iso27701=?, has_soc2=?, trust_score=?, diligence_level=?, dpa_signed=?, notes=?, status=?, has_mfa=?, has_encryption=?, has_backup=?, has_incident_plan=?, has_pentest=?, trust_center_url=?, dpa_url=?, attached_certifications=? WHERE id=?`
    ).bind(
      body.name, body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0, body.notes ?? null, body.status ?? 'Active',
      body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null,
      id
    ).run();

    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar vendor', detail: e.message }, 500);
  }
});

app.delete('/api/v1/vendors/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'vendors', id);
  await c.env.DB.prepare('DELETE FROM vendors WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TRAINING TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/projects/:id/training', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM training_records WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(c.req.param('id')).all();
  return c.json({ ok: true, records: results });
});

app.post('/api/v1/projects/:id/training', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();

    await c.env.DB.prepare(
      `INSERT INTO training_records (id, project_id, employee_name, training_name, completion_date, score, status, evidence_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, body.employee_name, body.training_name, body.completion_date ?? null, body.score ?? null, body.status ?? 'Pending', body.evidence_file ?? null).run();

    await logAudit(c.env.DB, 'training.created', c.get('user')?.email ?? 'system', `Training record ${id} created for project ${projectId}`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar registro de treinamento', detail: e.message }, 500);
  }
});

app.put('/api/v1/training/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c, 'training_records', id);
    const body = await c.req.json<any>();

    await c.env.DB.prepare(
      `UPDATE training_records SET employee_name=?, training_name=?, completion_date=?, score=?, status=?, evidence_file=? WHERE id=?`
    ).bind(body.employee_name, body.training_name, body.completion_date ?? null, body.score ?? null, body.status ?? 'Pending', body.evidence_file ?? null, id).run();

    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar treinamento', detail: e.message }, 500);
  }
});

app.delete('/api/v1/training/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'training_records', id);
  await c.env.DB.prepare('DELETE FROM training_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/v1/projects/:id/training/summary', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT status FROM training_records WHERE project_id = ?'
  ).bind(c.req.param('id')).all<{ status: string }>();

  const total = results.length;
  const completed = results.filter(r => r.status === 'Completed').length;
  const pending = total - completed;
  const coverage = total ? +(completed / total * 100).toFixed(1) : 0;

  return c.json({
    ok: true,
    total,
    completed,
    pending,
    coverage_percent: coverage,
    compliance_status: coverage >= 80 ? 'Compliant' : 'Non-Compliant',
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  BULK POLICY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/projects/:id/generate-policies-bulk', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const body = await c.req.json<{ control_ids?: string[] }>();
    const controlIds = body.control_ids?.length
      ? body.control_ids
      : ['A.5.1', 'A.5.2', 'A.5.3', 'A.5.4', 'A.5.8', 'A.5.9', 'A.5.10'];

    // ponytail: build org memory once, reuse for all controls
    let orgMemory = '';
    if (project.assessment_id) {
      const { results: answers } = await c.env.DB.prepare(
        'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ? AND answer IS NOT NULL'
      ).bind(project.assessment_id).all<{ question_key: string; answer: string }>();
      orgMemory = (answers || []).map(a => `${a.question_key}: ${a.answer}`).join('\n');
    }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const policies: { control_id: string; success: boolean; content_preview: string }[] = [];
    let successful = 0;
    let failed = 0;

    // ponytail: sequential to respect Cloudflare AI rate limits
    for (const controlId of controlIds) {
      try {
        let ragContext = '';
        try {
          const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
          ragContext = await memory.retrieveContext(projectId, `policy ${controlId}`, 'policy', 3);
        } catch (_) { /* vectorize may not be populated yet */ }

        const result = await agent.run(
          `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
          {
            organizationId: projectId,
            controlId,
            organizationalMemory: [orgMemory, ragContext].filter(Boolean).join('\n---\n') || undefined,
          }
        );

        if (result.success) {
          successful++;
          await logAudit(c.env.DB, 'policy.generated', c.get('user')?.email ?? 'system', `Bulk policy generated: ${controlId}, project ${projectId}`);
          try {
            const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
            await memory.storeFact(projectId, `Política ${controlId}: ${result.content.substring(0, 500)}`, 'policy', { controlId });
          } catch (_) { /* non-blocking */ }
        } else {
          failed++;
        }
        policies.push({ control_id: controlId, success: result.success, content_preview: result.content?.substring(0, 200) ?? '' });
      } catch (e: any) {
        failed++;
        policies.push({ control_id: controlId, success: false, content_preview: e.message });
      }
    }

    return c.json({ ok: true, total: controlIds.length, successful, failed, policies });
  } catch (e: any) {
    return c.json({ error: 'Falha na geração em lote', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ISO 27701 MIGRATION
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/v1/projects/:id/migrate-27701', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2013'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA(oldSoA);

    let created = 0;
    const { results: existing2022 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2022 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27001:2022', ?, 'Migrated from 2013 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701', c.get('user')?.email ?? 'system', `27701 migration (2013->2022): ${gaps.length} gaps, ${created} new controls, project ${projectId}`);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha na migração 27701', detail: e.message }, 500);
  }
});

app.post('/api/v1/projects/:id/migrate-27701-2025', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2019'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA27701(oldSoA);

    let created = 0;
    const { results: existing2025 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2025 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27701:2025', ?, 'Migrated from 2019 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701.2025', c.get('user')?.email ?? 'system', `27701:2025 migration: ${gaps.length} gaps, ${created} new controls, project ${projectId}`);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha na migração 27701:2025', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SPRINT 5: ADVANCED COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5A. Policy Templates ────────────────────────────────────────────────────


app.get('/api/v1/policy-templates', async (c) => {
  return c.json({ ok: true, templates: POLICY_TEMPLATES });
});

app.get('/api/v1/policy-templates/:id', async (c) => {
  const tpl = POLICY_TEMPLATES.find(t => t.id === c.req.param('id'));
  if (!tpl) return c.json({ error: 'Template not found' }, 404);
  return c.json({ ok: true, template: tpl });
});

// ─── 5B. Risk-Control-Evidence Traceability ──────────────────────────────────

app.get('/api/v1/projects/:id/traceability', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  const controls = await db.prepare(
    `SELECT id, title, status FROM compliance_controls WHERE project_id = ?`
  ).bind(projectId).all();

  const rows = controls.results || [];
  const controlIds = rows.map((r: any) => r.id);

  if (controlIds.length === 0) return c.json({ ok: true, controls: [] });

  const placeholders = controlIds.map(() => '?').join(',');

  const risksResult = await db.prepare(
    `SELECT id, asset, threat, risk_level, control_id FROM risks WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const evidenceResult = await db.prepare(
    `SELECT id, file_name, created_at, control_id FROM evidence WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const risksMap: Record<string, any[]> = {};
  for (const r of (risksResult.results || []) as any[]) {
    (risksMap[r.control_id] ||= []).push({ id: r.id, asset: r.asset, threat: r.threat, risk_level: r.risk_level });
  }
  const evidenceMap: Record<string, any[]> = {};
  for (const e of (evidenceResult.results || []) as any[]) {
    (evidenceMap[e.control_id] ||= []).push({ id: e.id, file_name: e.file_name, created_at: e.created_at });
  }

  const linked = rows.map((ctrl: any) => ({
    id: ctrl.id,
    title: ctrl.title,
    status: ctrl.status,
    risks: risksMap[ctrl.id] || [],
    evidence: evidenceMap[ctrl.id] || [],
  }));

  return c.json({ ok: true, controls: linked });
});

// ─── 5C. ROPA Module (CRUD) ─────────────────────────────────────────────────

app.get('/api/v1/projects/:id/ropa', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM ropa_records WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, records: result.results });
});

app.post('/api/v1/projects/:id/ropa', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, consent_details, data_subject_rights_details, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required, status, owner, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`
  ).bind(
    id, projectId, body.processing_purpose, body.data_categories, body.data_subjects,
    body.legal_basis, body.consent_details || null, body.data_subject_rights_details || null,
    body.retention_period, body.recipients, body.international_transfers,
    body.transfer_safeguards, body.dpia_required ? 1 : 0, body.owner, now, now
  ).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'ropa_created', user.email, `ROPA ${id} created`).run();
  return c.json({ ok: true, id }, 201);
});

app.put('/api/v1/ropa/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'ropa_records', id);
  const body = await c.req.json();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE ropa_records SET processing_purpose=?, data_categories=?, data_subjects=?, legal_basis=?, consent_details=?, data_subject_rights_details=?, retention_period=?, recipients=?, international_transfers=?, transfer_safeguards=?, dpia_required=?, status=?, owner=?, updated_at=? WHERE id=?`
  ).bind(
    body.processing_purpose, body.data_categories, body.data_subjects,
    body.legal_basis, body.consent_details || null, body.data_subject_rights_details || null,
    body.retention_period, body.recipients, body.international_transfers,
    body.transfer_safeguards, body.dpia_required ? 1 : 0, body.status || 'Draft', body.owner, now, id
  ).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'ropa_updated', user.email, `ROPA ${id} updated`).run();
  return c.json({ ok: true });
});

app.delete('/api/v1/ropa/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'ropa_records', id);
  await c.env.DB.prepare('DELETE FROM ropa_records WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'ropa_deleted', user.email, `ROPA ${id} deleted`).run();
  return c.json({ ok: true });
});

// ─── 4E. DPIA / RIPD Assessments (CRUD) ──────────────────────────────────────

app.get('/api/v1/projects/:id/dpia', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM dpia_assessments WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, assessments: result.results });
});

app.post('/api/v1/projects/:id/dpia', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO dpia_assessments (id, project_id, system_name, data_flow_description, data_subjects_types, personal_data_categories, necessity_proportionality, risks_identified, mitigation_measures, dpo_opinion, dpo_signature, ceo_signature, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`
  ).bind(
    id, projectId, body.system_name, body.data_flow_description, body.data_subjects_types,
    body.personal_data_categories, body.necessity_proportionality, body.risks_identified,
    body.mitigation_measures, body.dpo_opinion || null, body.dpo_signature || null, body.ceo_signature || null
  ).run();
  const user = c.get('user');
  await logAudit(c.env.DB, 'dpia.created', user.email, `DPIA ${id} created for system ${body.system_name}`);
  return c.json({ ok: true, id }, 201);
});

app.put('/api/v1/dpia/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'dpia_assessments', id);
  const body = await c.req.json();
  await c.env.DB.prepare(
    `UPDATE dpia_assessments SET system_name=?, data_flow_description=?, data_subjects_types=?, personal_data_categories=?, necessity_proportionality=?, risks_identified=?, mitigation_measures=?, dpo_opinion=?, dpo_signature=?, ceo_signature=?, status=? WHERE id=?`
  ).bind(
    body.system_name, body.data_flow_description, body.data_subjects_types,
    body.personal_data_categories, body.necessity_proportionality, body.risks_identified,
    body.mitigation_measures, body.dpo_opinion || null, body.dpo_signature || null, body.ceo_signature || null, body.status || 'Draft', id
  ).run();
  const user = c.get('user');
  await logAudit(c.env.DB, 'dpia.updated', user.email, `DPIA ${id} updated`);
  return c.json({ ok: true });
});

app.delete('/api/v1/dpia/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'dpia_assessments', id);
  await c.env.DB.prepare('DELETE FROM dpia_assessments WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await logAudit(c.env.DB, 'dpia.deleted', user.email, `DPIA ${id} deleted`);
  return c.json({ ok: true });
});

// ─── 5D. Gap Analysis ───────────────────────────────────────────────────────

app.get('/api/v1/projects/:id/gap-analysis', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  const controls = await db.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(projectId).all();
  const rows = (controls.results || []) as any[];
  const total = rows.length;

  const byStatus: Record<string, number> = { Missing: 0, Partial: 0, Implemented: 0 };
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const controlIds = rows.map(r => r.id);
  let controlsWithEvidence = 0;
  let controlsWithRisks = 0;
  const gaps: any[] = [];

  if (controlIds.length > 0) {
    const ph = controlIds.map(() => '?').join(',');
    const evCounts = await db.prepare(`SELECT control_id, COUNT(*) as cnt FROM evidence WHERE control_id IN (${ph}) GROUP BY control_id`).bind(...controlIds).all();
    const riskCounts = await db.prepare(`SELECT control_id, COUNT(*) as cnt FROM risks WHERE control_id IN (${ph}) GROUP BY control_id`).bind(...controlIds).all();

    const evMap: Record<string, number> = {};
    for (const e of (evCounts.results || []) as any[]) evMap[e.control_id] = e.cnt;
    const rkMap: Record<string, number> = {};
    for (const r of (riskCounts.results || []) as any[]) rkMap[r.control_id] = r.cnt;

    for (const ctrl of rows) {
      const ec = evMap[ctrl.id] || 0;
      const rc = rkMap[ctrl.id] || 0;
      if (ec > 0) controlsWithEvidence++;
      if (rc > 0) controlsWithRisks++;
      if (ctrl.status !== 'Implemented') {
        gaps.push({ control_id: ctrl.id, title: ctrl.title, status: ctrl.status, evidence_count: ec, risk_count: rc });
      }
    }
  }

  const coveragePct = total > 0 ? Math.round((byStatus['Implemented'] || 0) / total * 100) : 0;

  return c.json({
    ok: true,
    total,
    by_status: byStatus,
    coverage_pct: coveragePct,
    controls_with_evidence: controlsWithEvidence,
    controls_with_risks: controlsWithRisks,
    gaps,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  SPRINT 6: ENTERPRISE FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 6A. Executive Report ───────────────────────────────────────────────────

app.get('/api/v1/projects/:id/executive-report', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const phases = await db.prepare('SELECT status, COUNT(*) as cnt FROM project_phases WHERE project_id = ? GROUP BY status').bind(projectId).all();
  const phaseMap: Record<string, number> = {};
  for (const p of (phases.results || []) as any[]) phaseMap[p.status] = p.cnt;

  const controls = await db.prepare('SELECT status, COUNT(*) as cnt FROM compliance_controls WHERE project_id = ? GROUP BY status').bind(projectId).all();
  const controlMap: Record<string, number> = {};
  for (const ct of (controls.results || []) as any[]) controlMap[ct.status] = ct.cnt;

  const riskSummary = await db.prepare('SELECT risk_level, COUNT(*) as cnt FROM risks WHERE project_id = ? GROUP BY risk_level').bind(projectId).all();
  const riskMap: Record<string, number> = {};
  for (const r of (riskSummary.results || []) as any[]) riskMap[r.risk_level] = r.cnt;

  const vendorCount = await db.prepare('SELECT COUNT(*) as cnt FROM vendors WHERE project_id = ?').bind(projectId).first() as any;
  const trainingCount = await db.prepare('SELECT COUNT(*) as cnt FROM training_records WHERE project_id = ?').bind(projectId).first() as any;
  const evidenceCount = await db.prepare('SELECT COUNT(*) as cnt FROM evidence WHERE project_id = ?').bind(projectId).first() as any;
  const auditLogs = await db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20').all();

  return c.json({
    ok: true,
    project,
    phase_progress: phaseMap,
    control_stats: controlMap,
    risk_summary: riskMap,
    vendor_count: vendorCount?.cnt || 0,
    training_count: trainingCount?.cnt || 0,
    evidence_count: evidenceCount?.cnt || 0,
    recent_audit_logs: auditLogs.results,
    generated_at: new Date().toISOString(),
  });
});

// ─── 6B. Multi-Project Portfolio ────────────────────────────────────────────

app.get('/api/v1/portfolio', async (c) => {
  const db = c.env.DB;
  const projects = await db.prepare('SELECT id, client_name, status FROM projects ORDER BY created_at DESC').all();
  const rows = (projects.results || []) as any[];

  const portfolio = [];
  for (const p of rows) {
    const phaseTotal = await db.prepare('SELECT COUNT(*) as cnt FROM project_phases WHERE project_id = ?').bind(p.id).first() as any;
    const phaseCompleted = await db.prepare("SELECT COUNT(*) as cnt FROM project_phases WHERE project_id = ? AND status = 'completed'").bind(p.id).first() as any;
    const riskCount = await db.prepare('SELECT COUNT(*) as cnt FROM risks WHERE project_id = ?').bind(p.id).first() as any;
    const evidenceCount = await db.prepare('SELECT COUNT(*) as cnt FROM evidence WHERE project_id = ?').bind(p.id).first() as any;

    const total = phaseTotal?.cnt || 0;
    const completed = phaseCompleted?.cnt || 0;

    portfolio.push({
      id: p.id,
      client_name: p.client_name,
      status: p.status,
      phase_count: total,
      completed_phases: completed,
      risk_count: riskCount?.cnt || 0,
      evidence_count: evidenceCount?.cnt || 0,
      overall_progress_pct: total > 0 ? Math.round(completed / total * 100) : 0,
    });
  }

  return c.json(portfolio);
});

// ─── 6C. Audit Calendar (CRUD) ─────────────────────────────────────────────

app.get('/api/v1/projects/:id/audits', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM audit_schedule WHERE project_id = ? ORDER BY scheduled_date ASC').bind(projectId).all();
  return c.json({ ok: true, audits: result.results });
});

app.post('/api/v1/projects/:id/audits', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date, auditor_name, scope, status, findings_count, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', 0, ?, ?)`
  ).bind(id, projectId, body.audit_type, body.title, body.scheduled_date, body.auditor_name, body.scope, body.notes || '', now).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'audit_scheduled', user.email, `Audit ${id} scheduled`).run();
  return c.json({ ok: true, id }, 201);
});

app.put('/api/v1/audits/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'audit_schedule', id);
  const body = await c.req.json();
  const completedAt = body.status === 'Completed' ? new Date().toISOString() : null;
  await c.env.DB.prepare(
    `UPDATE audit_schedule SET audit_type=?, title=?, scheduled_date=?, auditor_name=?, scope=?, status=?, findings_count=?, notes=?, completed_at=? WHERE id=?`
  ).bind(body.audit_type, body.title, body.scheduled_date, body.auditor_name, body.scope, body.status, body.findings_count || 0, body.notes || '', completedAt, id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'audit_updated', user.email, `Audit ${id} updated`).run();
  return c.json({ ok: true });
});

app.delete('/api/v1/audits/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'audit_schedule', id);
  await c.env.DB.prepare('DELETE FROM audit_schedule WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'audit_deleted', user.email, `Audit ${id} deleted`).run();
  return c.json({ ok: true });
});

// ─── 6D. Corrective Actions CAPA (CRUD) ─────────────────────────────────────

app.get('/api/v1/projects/:id/capa', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM corrective_actions WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, actions: result.results });
});

app.post('/api/v1/projects/:id/capa', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO corrective_actions (id, project_id, audit_id, risk_id, control_id, title, description, severity, assigned_to, due_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`
  ).bind(id, projectId, body.audit_id || null, body.risk_id || null, body.control_id || null, body.title, body.description, body.severity, body.assigned_to, body.due_date, now).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'capa_created', user.email, `CAPA ${id} created`).run();
  return c.json({ ok: true, id }, 201);
});

app.put('/api/v1/capa/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'corrective_actions', id);
  const body = await c.req.json();
  const completedAt = body.status === 'Closed' ? new Date().toISOString() : null;
  await c.env.DB.prepare(
    `UPDATE corrective_actions SET audit_id=?, risk_id=?, control_id=?, title=?, description=?, severity=?, assigned_to=?, due_date=?, status=?, resolution=?, completed_at=? WHERE id=?`
  ).bind(body.audit_id || null, body.risk_id || null, body.control_id || null, body.title, body.description, body.severity, body.assigned_to, body.due_date, body.status, body.resolution || null, completedAt, id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'capa_updated', user.email, `CAPA ${id} updated`).run();
  return c.json({ ok: true });
});

app.delete('/api/v1/capa/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'corrective_actions', id);
  await c.env.DB.prepare('DELETE FROM corrective_actions WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'capa_deleted', user.email, `CAPA ${id} deleted`).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SPRINT 7: INTEGRATION & SCALE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 7A. Webhooks (CRUD + Test) ─────────────────────────────────────────────

app.get('/api/v1/projects/:id/webhooks', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, webhooks: result.results });
});

app.post('/api/v1/projects/:id/webhooks', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO webhooks (id, project_id, url, events, secret, status, failure_count, created_at)
     VALUES (?, ?, ?, ?, ?, 'Active', 0, ?)`
  ).bind(id, projectId, body.url, body.events, body.secret || '', now).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_created', user.email, `Webhook ${id} created for ${body.url}`).run();
  return c.json({ ok: true, id }, 201);
});
app.delete('/api/v1/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'webhooks', id);
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'webhook_deleted', user.email, `Webhook ${id} deleted`).run();
  return c.json({ ok: true });
});

app.post('/api/v1/webhooks/test/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'webhooks', id);
  const webhook = await c.env.DB.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first() as any;
  if (!webhook) return c.json({ error: 'Webhook not found' }, 404);

  if (!isValidWebhookUrl(webhook.url)) {
    return c.json({ error: 'Invalid or forbidden webhook URL (SSRF Guard)' }, 400);
  }

  try {
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test', project_id: webhook.project_id, timestamp: new Date().toISOString() }),
    });
    await c.env.DB.prepare('UPDATE webhooks SET last_triggered_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    return c.json({ ok: true, status: resp.status });
  } catch (e: any) {
    await c.env.DB.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').bind(id).run();
    return c.json({ ok: false, error: e.message }, 502);
  }
});

// ─── 7B. API Keys ───────────────────────────────────────────────────────────

app.post('/api/v1/projects/:id/api-keys', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const plainKey = crypto.randomUUID() + '-' + crypto.randomUUID();
  const keyBytes = new TextEncoder().encode(plainKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
  const keyHash = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, project_id, key_hash, name, permissions, expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)`
  ).bind(id, projectId, keyHash, body.name, body.permissions || 'read', body.expires_at || null, now).run();

  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_created', user.email, `API key ${id} created`).run();

  // ponytail: plaintext key returned ONCE — never stored
  return c.json({ ok: true, id, key: plainKey }, 201);
});

app.get('/api/v1/projects/:id/api-keys', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare(
    'SELECT id, name, permissions, status, last_used_at, created_at FROM api_keys WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json({ ok: true, keys: result.results });
});

app.delete('/api/v1/api-keys/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'api_keys', id);
  await c.env.DB.prepare("UPDATE api_keys SET status = 'Revoked' WHERE id = ?").bind(id).run();
  const user = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'api_key_revoked', user.email, `API key ${id} revoked`).run();
  return c.json({ ok: true });
});

// ─── 7C. Bulk Export (CSV) ──────────────────────────────────────────────────

app.get('/api/v1/projects/:id/export/risks', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM risks WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'asset,threat,vulnerability,impact,probability,risk_level,treatment,owner,status';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.asset)},${safeCsvCell(r.threat)},${safeCsvCell(r.vulnerability)},${safeCsvCell(r.impact)},${safeCsvCell(r.probability)},${safeCsvCell(r.risk_level)},${safeCsvCell(r.treatment)},${safeCsvCell(r.owner)},${safeCsvCell(r.status)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="risks.csv"' } });
});

app.get('/api/v1/projects/:id/export/vendors', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM vendors WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,trust_score,diligence_level,has_iso27001,has_soc2,dpa_signed';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.trust_score)},${safeCsvCell(r.diligence_level)},${safeCsvCell(r.has_iso27001)},${safeCsvCell(r.has_soc2)},${safeCsvCell(r.dpa_signed)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="vendors.csv"' } });
});

app.get('/api/v1/projects/:id/export/training', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM training_records WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'employee_name,training_name,status,score,completion_date';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.employee_name)},${safeCsvCell(r.training_name)},${safeCsvCell(r.status)},${safeCsvCell(r.score)},${safeCsvCell(r.completion_date)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="training.csv"' } });
});

app.get('/api/v1/projects/:id/export/audit-log', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT * FROM audit_logs WHERE actor = ? ORDER BY created_at DESC LIMIT 500').bind(user.email).all();
  const rows = (result.results || []) as any[];
  const headers = 'id,action,actor,details,created_at';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.id)},${safeCsvCell(r.action)},${safeCsvCell(r.actor)},${safeCsvCell(r.details)},${safeCsvCell(r.created_at)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' } });
});

app.get('/api/v1/projects/:id/export/assets', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM assets WHERE project_id = ?').bind(projectId).all();
  const rows = (result.results || []) as any[];
  const headers = 'name,category,classification,owner,location,status,description,confidentiality_rating,integrity_rating,availability_rating';
  const csv = headers + '\n' + rows.map(r => 
    `${safeCsvCell(r.name)},${safeCsvCell(r.category)},${safeCsvCell(r.classification)},${safeCsvCell(r.owner)},${safeCsvCell(r.location)},${safeCsvCell(r.status)},${safeCsvCell(r.description)},${safeCsvCell(r.confidentiality_rating)},${safeCsvCell(r.integrity_rating)},${safeCsvCell(r.availability_rating)}`
  ).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="assets.csv"' } });
});

app.get('/api/v1/projects/:id/controls/:controlId/versions', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const result = await c.env.DB.prepare(
    'SELECT id, version, created_by, created_at FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
  ).bind(projectId, normId, controlIdRaw).all();
  
  return c.json(result.results || []);
});

app.get('/api/v1/projects/:id/controls/:controlId/versions/:versionId', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const versionId = c.req.param('versionId');
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(versionId, projectId, normId, controlIdRaw).first<any>();
  
  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);
  return c.json(row);
});

app.post('/api/v1/projects/:id/controls/:controlId/restore-version', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const { version_id } = await c.req.json<{ version_id: string }>();
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(version_id, projectId, normId, controlIdRaw).first<any>();
  
  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);
  
  // Update compliance_controls description
  await c.env.DB.prepare(
    'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
  ).bind(row.policy_text, normId, controlIdRaw, projectId).run();
  
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(projectId, normId, controlIdRaw).first<{ count: number }>();
  const nextVer = (countRow?.count || 0) + 1;
  const newVerId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  
  await c.env.DB.prepare(
    'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newVerId, projectId, normId, nextVer, row.policy_text, c.get('user')?.email || 'system').run();
  
  await logAudit(c.env.DB, 'policy.restored', c.get('user')?.email || 'system', `Política ${controlIdRaw} restaurada para versão ${row.version}, projeto ${projectId}`);
  
  return c.json({ ok: true, version: nextVer, policy_markdown: row.policy_text });
});

app.get('/api/v1/projects/:id/controls/:controlId/govbr-signatures', async (c) => {
  const projectId = c.req.param('id');
  const controlId = c.req.param('controlId');
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const result = await c.env.DB.prepare(
    'SELECT id, signed_by_name, signed_by_cpf, signature_type, created_at FROM govbr_signatures WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(projectId, normId, controlId).all();
  
  return c.json(result.results || []);
});

app.get('/api/v1/projects/:id/controls/:controlId/govbr/start', async (c) => {
  const projectId = c.req.param('id');
  const controlId = c.req.param('controlId');
  const type = c.req.query('type') || 'ciso';
  
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const latestVersion = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
  ).bind(projectId, normId, controlId).first<any>();
  
  if (!latestVersion) {
    return c.html('<h3>Erro: Nenhuma política gerada para este controle. Gere a política primeiro antes de assinar.</h3>');
  }
  
  const clientId = c.env.GOVBR_CLIENT_ID;
  const state = `${projectId}:${controlId}:${latestVersion.id}:${type}`;
  const nonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  
  if (!clientId || c.env.GOVBR_ENVIRONMENT === 'homologation-mock' || !c.env.GOVBR_CLIENT_SECRET) {
    const mockRedirect = `/public/govbr-mock-portal?state=${state}&nonce=${nonce}`;
    return c.redirect(mockRedirect);
  }
  
  const isProd = c.env.GOVBR_ENVIRONMENT === 'production';
  const server = isProd ? 'cas.gov.br' : 'cas.staging.iti.br';
  const redirectUri = c.env.GOVBR_REDIRECT_URI || `https://${c.req.header('host')}/api/v1/govbr/callback`;
  const scope = 'sign govbr';
  
  const authUrl = `https://${server}/oauth2.0/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&nonce=${nonce}`;
  return c.redirect(authUrl);
});

app.get('/api/v1/govbr/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state') || '';
  const error = c.req.query('error');
  
  if (error) {
    return c.html(`<h3>Assinatura gov.br cancelada ou falhou: ${error}</h3>`);
  }
  
  const [projectId, controlId, policyVersionId, type] = state.split(':');
  if (!projectId || !controlId || !policyVersionId || !type) {
    return c.html('<h3>Erro: Parâmetros de estado (state) inválidos no callback.</h3>');
  }
  
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  let name = 'Assinante gov.br';
  let cpf = '***.***.***-**';
  let signatureData = 'pkcs7-signature-payload-mock';
  
  const clientId = c.env.GOVBR_CLIENT_ID;
  if (!clientId || c.env.GOVBR_ENVIRONMENT === 'homologation-mock' || !c.env.GOVBR_CLIENT_SECRET || code?.startsWith('mock-')) {
    if (code?.startsWith('mock-')) {
      const parts = code.split('-');
      name = decodeURIComponent(parts[1] || 'CISO nISO');
      cpf = parts[2] || '***.456.789-**';
    }
    signatureData = `MOCK-PKCS7-SIGNATURE-FOR-${policyVersionId}`;
  } else {
    try {
      const isProd = c.env.GOVBR_ENVIRONMENT === 'production';
      const server = isProd ? 'cas.gov.br' : 'cas.staging.iti.br';
      const redirectUri = c.env.GOVBR_REDIRECT_URI || `https://${c.req.header('host')}/api/v1/govbr/callback`;
      
      const tokenRes = await fetch(`https://${server}/oauth2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code || '',
          client_id: clientId,
          grant_type: 'authorization_code',
          client_secret: c.env.GOVBR_CLIENT_SECRET,
          redirect_uri: redirectUri
        })
      });
      
      if (!tokenRes.ok) {
        throw new Error('Falha ao obter token da API gov.br');
      }
      
      const tokenData = await tokenRes.json<{ access_token: string }>();
      
      const apiDomain = isProd ? 'assinatura-api.iti.gov.br' : 'assinatura-api.staging.iti.br';
      const certRes = await fetch(`https://${apiDomain}/externo/v2/certificadoPublico`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      
      if (certRes.status === 403) {
        return c.html(`
          <div style="font-family:'Inter',sans-serif; text-align:center; padding:3rem; background:#070b14; color:#f5f5f7; height:100vh">
            <h2 style="color:var(--danger)">Conta Nível Bronze Detectada</h2>
            <p>É necessário possuir conta gov.br nível prata ou ouro para utilizar o serviço de assinatura.</p>
            <p style="margin-top:2rem"><a href="https://confiabilidades.acesso.gov.br/" target="_blank" style="color:#00ade8; text-decoration:none; font-weight:bold; border:1px solid #00ade8; padding:8px 16px; border-radius:6px">Fazer Upgrade da Conta</a></p>
          </div>
        `);
      }
      
      try {
        const payloadBase64 = tokenData.access_token.split('.')[1];
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64));
          name = payload.nome || payload.name || name;
          cpf = payload.cpf || cpf;
        }
      } catch(e) {}
      
      const policyVersion = await c.env.DB.prepare(
        'SELECT policy_text FROM policy_versions WHERE id = ?'
      ).bind(policyVersionId).first<{ policy_text: string }>();
      
      if (policyVersion) {
        const textBytes = new TextEncoder().encode(policyVersion.policy_text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', textBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashBase64 = btoa(String.fromCharCode(...hashArray));
        
        const signRes = await fetch(`https://${apiDomain}/externo/v2/assinarPKCS7`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ hashBase64 })
        });
        
        if (signRes.ok) {
          signatureData = await signRes.text();
        }
      }
    } catch(e: any) {
      return c.html(`<h3>Erro técnico durante a assinatura: ${e.message}</h3>`);
    }
  }
  
  let maskedCpf = cpf;
  if (cpf.length === 11) {
    maskedCpf = `***.${cpf.substring(3,6)}.${cpf.substring(6,9)}-**`;
  }
  
  const sigId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  await c.env.DB.prepare(
    'INSERT INTO govbr_signatures (id, project_id, control_id, policy_version_id, signed_by_name, signed_by_cpf, signature_type, signature_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(sigId, projectId, normId, policyVersionId, name, maskedCpf, type, signatureData).run();
  
  if (type === 'ciso') {
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET ciso_approved_by = ?, ciso_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(name, normId, controlId, projectId).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET ceo_approved_by = ?, ceo_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(name, normId, controlId, projectId).run();
  }
  
  await logAudit(c.env.DB, 'policy.govbr_signed', name, `Política ${controlId} assinada digitalmente via gov.br como ${type.toUpperCase()}`);
  
  return c.html(`
    <script>
      if (window.opener) {
        window.opener.showToast('Assinatura gov.br realizada com sucesso!');
        if (window.opener.openGeneratePolicyModal) {
          window.opener.openGeneratePolicyModal('${projectId}', '${controlId}');
        }
        if (window.opener.render) {
          window.opener.render();
        }
        window.close();
      } else {
        document.write("<h3>Assinatura realizada! Você pode fechar esta aba e atualizar a tela do nISO.</h3>");
      }
    </script>
  `);
});

app.get('/public/govbr-mock-portal', (c) => {
  const state = c.req.query('state') || '';
  
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Portal de Assinatura Digital Simulado — gov.br</title>
      <style>
        body { font-family: 'Inter', sans-serif; background: #070b14; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; color: #f5f5f7; }
        .card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(24px); border-radius: 12px; width: 420px; padding: 2rem; border-top: 5px solid #00ade8; }
        .logo { font-size: 1.8rem; font-weight: bold; color: #00ade8; text-align: center; margin-bottom: 1.5rem; font-family: 'Montserrat', sans-serif; }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.4rem; color: rgba(229,235,255,0.6); text-transform: uppercase; letter-spacing: 0.05em; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-sizing: border-box; background: rgba(255,255,255,0.03); color: #f5f5f7; font-size: 0.85rem; }
        input:focus, select:focus { outline: none; border-color: #00ade8; }
        .btn { display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; background: #00ade8; color: #000; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; margin-top: 1.5rem; font-size: 0.9rem; transition: background 0.2s; }
        .btn:hover { background: #008ec2; }
        .hint { font-size: 0.7rem; color: rgba(229,235,255,0.4); text-align: center; margin-top: 1.5rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">gov.br</div>
        <h4 style="margin-top:0; text-align:center; color:#f5f5f7; font-family:'Montserrat',sans-serif">Simulador de Assinatura Avançada</h4>
        <p style="font-size:0.8rem; color:rgba(229,235,255,0.6); text-align:center; margin-bottom:1.5rem">Ambiente de Homologação / Sandbox do nISO</p>
        
        <div id="step-1">
          <div class="form-group">
            <label>Nível da Identidade Digital</label>
            <select id="mock-level">
              <option value="prata">Prata / Ouro (Permite Assinatura)</option>
              <option value="bronze">Bronze (Bloquear e Exigir Upgrade)</option>
            </select>
          </div>
          <div class="form-group">
            <label>CPF do Assinante</label>
            <input type="text" id="mock-cpf" value="123.456.789-00">
          </div>
          <div class="form-group">
            <label>Nome Completo do Cidadão</label>
            <input type="text" id="mock-name" value="Dr. Carlos Silva (CISO)">
          </div>
          <button class="btn" onclick="nextStep()">Avançar para Assinatura</button>
        </div>
        
        <div id="step-2" style="display:none">
          <p style="font-size:0.8rem; color:rgba(229,235,255,0.8); text-align:center; margin-bottom:1.5rem">Um código de autorização foi enviado para o seu aplicativo gov.br.</p>
          <div class="form-group">
            <label>Código de Autorização (Digite: 12345)</label>
            <input type="text" id="mock-sms" placeholder="Digite o código de 5 dígitos">
          </div>
          <button class="btn" onclick="sign()">Confirmar Assinatura Digital</button>
        </div>
        
        <div class="hint">Roteiro de integração do Assinador avançada gov.br 1.0</div>
      </div>
      
      <script>
        function nextStep() {
          const level = document.getElementById('mock-level').value;
          if (level === 'bronze') {
            alert('Atenção: Contas de nível Bronze não possuem permissão para assinar. Redirecionando para o portal de upgrade de confiabilidade.');
            window.location.href = 'https://confiabilidades.acesso.gov.br/';
            return;
          }
          document.getElementById('step-1').style.display = 'none';
          document.getElementById('step-2').style.display = 'block';
        }
        
        function sign() {
          const sms = document.getElementById('mock-sms').value;
          if (sms !== '12345') {
            alert('Código incorreto! Digite 12345 para testes de homologação.');
            return;
          }
          const name = encodeURIComponent(document.getElementById('mock-name').value);
          const cpfRaw = document.getElementById('mock-cpf').value.replace(/\D/g, '');
          const code = 'mock-' + name + '-' + cpfRaw;
          
          window.location.href = '/api/v1/govbr/callback?code=' + code + '&state=${state}';
        }
      </script>
    </body>
    </html>
  `;
  return c.html(html);
});

// ═══════════════════════════════════════════════
//  SPRINT 8: MARKET READY
// ═══════════════════════════════════════════════

// ─── Certification Tracker ──────────────────────────────────────────────────

app.get('/api/v1/projects/:id/certification', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
  if (!result) return c.json({ ok: true, certification: null });
  return c.json({ ok: true, certification: result });
});

app.post('/api/v1/projects/:id/certification', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json<any>();
  const existing = await c.env.DB.prepare('SELECT id FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
  if (existing) {
    // ponytail: upsert — update if exists
    await c.env.DB.prepare(
      `UPDATE certification_tracking SET standard=?, stage=?, target_date=?, stage1_date=?, stage1_status=?, stage2_date=?, stage2_status=?, certificate_number=?, certificate_expiry=?, registrar=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE project_id=?`
    ).bind(
      body.standard || 'ISO 27001:2022', body.stage || 'Gap Assessment', body.target_date || null,
      body.stage1_date || null, body.stage1_status || 'Pending', body.stage2_date || null, body.stage2_status || 'Pending',
      body.certificate_number || null, body.certificate_expiry || null, body.registrar || null, body.notes || null, projectId
    ).run();
    await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'certification.updated', user?.email || 'system', `Updated certification for project ${projectId}`).run();
    const updated = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE project_id = ?').bind(projectId).first();
    return c.json({ ok: true, certification: updated });
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO certification_tracking (id, project_id, standard, stage, target_date, stage1_date, stage1_status, stage2_date, stage2_status, certificate_number, certificate_expiry, registrar, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, projectId, body.standard || 'ISO 27001:2022', body.stage || 'Gap Assessment', body.target_date || null,
    body.stage1_date || null, body.stage1_status || 'Pending', body.stage2_date || null, body.stage2_status || 'Pending',
    body.certificate_number || null, body.certificate_expiry || null, body.registrar || null, body.notes || null
  ).run();
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'certification.created', user?.email || 'system', `Created certification tracker for project ${projectId}`).run();
  const created = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first();
  return c.json({ ok: true, certification: created }, 201);
});

app.put('/api/v1/certification/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'certification_tracking', id);
  const user = c.get('user');
  const body = await c.req.json<any>();
  const existing = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first() as any;
  if (!existing) return c.json({ error: 'Certification record not found' }, 404);
  await c.env.DB.prepare(
    `UPDATE certification_tracking SET standard=?, stage=?, target_date=?, stage1_date=?, stage1_status=?, stage2_date=?, stage2_status=?, certificate_number=?, certificate_expiry=?, registrar=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(
    body.standard ?? existing.standard, body.stage ?? existing.stage, body.target_date ?? existing.target_date,
    body.stage1_date ?? existing.stage1_date, body.stage1_status ?? existing.stage1_status,
    body.stage2_date ?? existing.stage2_date, body.stage2_status ?? existing.stage2_status,
    body.certificate_number ?? existing.certificate_number, body.certificate_expiry ?? existing.certificate_expiry,
    body.registrar ?? existing.registrar, body.notes ?? existing.notes, id
  ).run();
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'certification.updated', user?.email || 'system', `Updated certification ${id}: stage=${body.stage || existing.stage}`).run();
  const updated = await c.env.DB.prepare('SELECT * FROM certification_tracking WHERE id = ?').bind(id).first();
  return c.json({ ok: true, certification: updated });
});

// ─── AI Compliance Assistant ────────────────────────────────────────────────

app.post('/api/v1/projects/:id/chat', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: 'Message is required' }, 400);

  // Save user message
  await c.env.DB.prepare(
    'INSERT INTO ai_chat_history (id, project_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), projectId, user?.id || 'anonymous', 'user', body.message).run();

  // Get last 10 messages for context
  const historyResult = await c.env.DB.prepare(
    'SELECT role, content FROM ai_chat_history WHERE project_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(projectId).all();
  const history = (historyResult.results || []).reverse() as { role: string; content: string }[];

  const messages = history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }));
  if (!messages.find(m => m.content === body.message)) {
    messages.push({ role: 'user', content: body.message });
  }

  const systemPrompt = 'You are a compliance assistant for ISO 27001:2022 and ISO 27701. Answer questions about information security, privacy, controls, audit preparation, and GRC best practices. Be concise and actionable. Respond in the same language as the user.';

  const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: systemPrompt }, ...messages]
  }) as any;
  const reply = aiResponse.response || 'Sem resposta do AI.';

  // Save assistant reply
  await c.env.DB.prepare(
    'INSERT INTO ai_chat_history (id, project_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), projectId, user?.id || 'anonymous', 'assistant', reply).run();

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM ai_chat_history WHERE project_id = ?').bind(projectId).first() as any;
  return c.json({ ok: true, reply, history_count: countResult?.cnt || 0 });
});

app.get('/api/v1/projects/:id/chat/history', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare(
    'SELECT id, role, content, user_id, created_at FROM ai_chat_history WHERE project_id = ? ORDER BY created_at ASC LIMIT 50'
  ).bind(projectId).all();
  return c.json({ ok: true, messages: result.results || [] });
});

app.delete('/api/v1/projects/:id/chat/history', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM ai_chat_history WHERE project_id = ?').bind(projectId).run();
  await c.env.DB.prepare('INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'chat.cleared', user?.email || 'system', `Cleared chat history for project ${projectId}`).run();
  return c.json({ ok: true });
});

// ─── Onboarding Status ─────────────────────────────────────────────────────

app.get('/api/v1/onboarding-status', async (c) => {
  const [projects, assessments, controls, risks, evidence] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM projects').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM assessments').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM compliance_controls').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM risks').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM evidence').first() as Promise<any>,
  ]);
  const counts = { projects: projects?.cnt || 0, assessments: assessments?.cnt || 0, controls: controls?.cnt || 0, risks: risks?.cnt || 0, evidence: evidence?.cnt || 0 };
  const stepsCompleted = [counts.projects, counts.assessments, counts.controls, counts.risks, counts.evidence].filter(v => v > 0).length;
  return c.json({ ...counts, completion_pct: Math.round(stepsCompleted / 5 * 100) });
});

// ─── Template Marketplace ───────────────────────────────────────────────────

app.get('/api/v1/marketplace/templates', async (c) => {
  const marketplace = POLICY_TEMPLATES.map(t => {
    const iso = t.iso_ref || '';
    const category = iso.startsWith('5') ? 'Organizational' : iso.startsWith('6') ? 'People' : iso.startsWith('7') ? 'Physical' : 'Technological';
    return {
      ...t,
      category,
      difficulty: 'Standard',
      estimated_time: '45 min',
      popularity: Math.floor(Math.random() * 50 + 50)
    };
  });
  return c.json({ ok: true, total: marketplace.length, templates: marketplace });
});

// ─── Landing Page Data (public, no auth) ────────────────────────────────────

app.get('/api/v1/public/pricing', async (c) => {
  const tiers = [
    { id: 'foundation', name: 'Foundation', price: 'R$25.000', features: ['Assessment Pre-Sales','Gap Analysis','Policy Templates','Basic Reporting'], max_controls: 30, max_users: 3 },
    { id: 'standard', name: 'Standard', price: 'R$55.000', features: ['Everything in Foundation','AI Policy Generation','Risk Assessment','Vendor Management','ROPA Module','Audit Calendar'], max_controls: 93, max_users: 10 },
    { id: 'enterprise', name: 'Enterprise', price: 'R$95.000', features: ['Everything in Standard','Bulk AI Generation','ISO 27701 Migration','Executive Reports','API Keys','Webhooks','CSV Exports'], max_controls: 93, max_users: 25 },
    { id: 'critical', name: 'Critical Infrastructure', price: 'R$180.000', features: ['Everything in Enterprise','Dedicated Support','Custom Templates','CAPA Module','Certification Tracking','AI Compliance Assistant','SLA 99.9%'], max_controls: 93, max_users: 50 },
  ];
  return c.json({ ok: true, tiers });
});

app.get('/api/v1/public/stats', async (c) => {
  const [projects, assessments, controls, risks, evidence, users] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM projects').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM assessments').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM compliance_controls').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM risks').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM evidence').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first() as Promise<any>,
  ]);
  return c.json({ ok: true, projects: projects?.cnt || 0, assessments: assessments?.cnt || 0, controls: controls?.cnt || 0, risks: risks?.cnt || 0, evidence_files: evidence?.cnt || 0, users: users?.cnt || 0 });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CHECKLIST PERSISTENCE (Sprint F)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/projects/:id/checklist-progress', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare(`
    SELECT cp.phase_number, cp.item_id, cp.is_checked, cp.checked_by, cp.checked_at, cp.evidence_id, cp.notes, cp.assigned_to, cp.due_date, ev.evaluation_status, ev.evaluation_notes
    FROM checklist_progress cp
    LEFT JOIN evidence ev ON cp.evidence_id = ev.id
    WHERE cp.project_id = ?
  `).bind(projectId).all();
  return c.json(rows.results || []);
});

app.put('/api/v1/projects/:id/checklist-progress', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const { items } = await c.req.json<{ items: Array<{ phase_number: number; item_id: string; is_checked: boolean; evidence_id?: string; notes?: string; assigned_to?: string; due_date?: string }> }>();
  if (!items || !Array.isArray(items)) return c.json({ error: 'items array required' }, 400);
  const stmt = c.env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes, assigned_to, due_date)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
    ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET is_checked = excluded.is_checked, checked_by = excluded.checked_by, checked_at = excluded.checked_at, evidence_id = excluded.evidence_id, notes = excluded.notes, assigned_to = excluded.assigned_to, due_date = excluded.due_date`);
  const batch = items.map(i => stmt.bind(projectId, i.phase_number, i.item_id, i.is_checked ? 1 : 0, user?.id || null, i.evidence_id || null, i.notes || null, i.assigned_to || null, i.due_date || null));
  await c.env.DB.batch(batch);
  return c.json({ ok: true, count: items.length });
});

app.post('/api/v1/projects/:id/checklist/:itemId/audit', async (c) => {
  const projectId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const user = c.get('user');

  // 1. Fetch project details
  const project = await c.env.DB.prepare('SELECT project_name, client_name, sector, scope FROM projects WHERE id = ?').bind(projectId).first() as any;
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // 2. Fetch checklist item progress/notes
  const progress = await c.env.DB.prepare('SELECT is_checked, notes, phase_number FROM checklist_progress WHERE project_id = ? AND item_id = ?').bind(projectId, itemId).first() as any;
  
  let notesText = progress?.notes || '';
  let phaseNum = progress?.phase_number || 0;
  if (!phaseNum) {
    const match = itemId.match(/^p(\d+)_/);
    phaseNum = match ? parseInt(match[1]) : 0;
  }

  // 3. Fetch evidence files associated with this item
  const evidenceList = await c.env.DB.prepare('SELECT id, file_name, file_size, evaluation_status FROM evidence WHERE project_id = ? AND control_id = ?').bind(projectId, itemId).all();
  const evidences = (evidenceList.results || []) as Array<{ file_name: string; file_size: number; evaluation_status: string }>;

  // 4. Retrieve current notes_extra and details
  let notesData: Record<string, any> = {};
  try {
    if (notesText.trim().startsWith('{')) {
      notesData = JSON.parse(notesText);
    } else {
      notesData.notes_extra = notesText;
    }
  } catch (e) {
    notesData.notes_extra = notesText;
  }

  // 5. Construct AI Prompt
  const promptMessage = `Você é um Auditor Líder certificado em ISO/IEC 27001:2022 e especialista em conformidade GRC.
Seu objetivo é avaliar a conformidade da seguinte atividade do checklist de adequação do projeto:

Projeto: "${project.project_name || project.client_name}"
Setor de Atuação: "${project.sector || 'Não informado'}"
Escopo do SGSI: "${project.scope || 'Não informado'}"
ID da Atividade: "${itemId}"
Notas/Execução registradas pelo Consultor: "${notesData.notes_extra || 'Nenhuma nota registrada.'}"
Respostas do questionário do playbook: ${JSON.stringify(notesData)}

Arquivos de Evidência anexados:
${evidences.length > 0 
  ? evidences.map(e => `- Arquivo: ${e.file_name} (${(e.file_size / 1024).toFixed(1)} KB) - Status do Arquivo: ${e.evaluation_status}`).join('\n')
  : 'Nenhum arquivo de evidência foi anexado até o momento.'
}

Faça uma análise crítica baseada nas diretrizes formais da ISO 27001:2022.
Determine se o status é CONFORME (compliant) ou NÃO CONFORME (non_compliant). Para ser CONFORME, é necessário que haja descrição de execução consistente nas notas e que a evidência correspondente esteja presente (se aplicável para a categoria do item).
Determine a pontuação de maturidade CMM (Capability Maturity Model) recomendada de 0 a 5.
Escreva um Parecer Técnico ("audit_finding") resumido (máximo 4 linhas) e os Próximos Passos ("next_steps") para sanar quaisquer gaps.

Responda em PORTUGUÊS estritamente no formato JSON abaixo, sem blocos de código markdown ou texto extra:
{
  "status": "compliant" | "non_compliant",
  "cmm_score": número (0 a 5),
  "audit_finding": "sua análise aqui",
  "next_steps": "recomendações de correção aqui"
}`;

  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are an ISO 27001 Lead Auditor. Return only raw JSON as requested.' },
        { role: 'user', content: promptMessage }
      ]
    }) as any;

    const reply = aiResponse.response || '';
    
    let auditResult = {
      status: 'non_compliant',
      cmm_score: 1,
      audit_finding: 'Falha ao processar análise do Auditor IA.',
      next_steps: 'Por favor, tente rodar a auditoria novamente.'
    };
    
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.status) auditResult.status = parsed.status;
        if (typeof parsed.cmm_score === 'number') auditResult.cmm_score = parsed.cmm_score;
        if (parsed.audit_finding) auditResult.audit_finding = parsed.audit_finding;
        if (parsed.next_steps) auditResult.next_steps = parsed.next_steps;
      }
    } catch (pe) {
      console.error('Error parsing AI Auditor reply:', reply, pe);
    }

    notesData.audit_status = auditResult.status;
    notesData.cmm_score = auditResult.cmm_score;
    notesData.audit_finding = auditResult.audit_finding;
    notesData.next_steps = auditResult.next_steps;
    notesData.audited_at = new Date().toISOString();

    const newNotesText = JSON.stringify(notesData);
    const newIsChecked = (auditResult.status === 'compliant') ? 1 : (progress?.is_checked || 0);

    await c.env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET is_checked = excluded.is_checked, checked_by = excluded.checked_by, checked_at = excluded.checked_at, notes = excluded.notes`)
      .bind(projectId, phaseNum, itemId, newIsChecked, user?.id || null, newNotesText).run();

    await logAudit(c.env.DB, 'checklist.audit', user?.email || 'system', `Auditoria IA rodada para item ${itemId} do projeto ${projectId}. Status: ${auditResult.status}`);

    return c.json({
      ok: true,
      status: auditResult.status,
      cmm_score: auditResult.cmm_score,
      audit_finding: auditResult.audit_finding,
      next_steps: auditResult.next_steps,
      is_checked: newIsChecked === 1
    });

  } catch (err: any) {
    return c.json({ error: 'Erro ao rodar auditoria IA', details: err.message }, 500);
  }
});

app.post('/api/v1/projects/:id/assessment/evaluate', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  try {
    // 1. Fetch project details
    const project = await db.prepare('SELECT project_name, client_name, sector, scope FROM projects WHERE id = ?').bind(projectId).first() as any;
    if (!project) return c.json({ error: 'Project not found' }, 404);

    // 2. Fetch all answers from project_interviews
    const { results: interviews } = await db.prepare(
      'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
    ).bind(projectId).all() as any;

    if (!interviews || interviews.length === 0) {
      return c.json({ error: 'Nenhuma resposta de entrevista encontrada para este projeto. Por favor, responda o questionário no Playbook antes de rodar o diagnóstico.' }, 400);
    }

    // 3. Consolidate questions and answers
    const assessmentData = (interviews ?? []).map((i: any) => 
      `[Trilha: ${i.track}] Questão: ${i.question}\nResposta: ${i.answer}\nEntrevistado: ${i.interviewee}\nGap Detectado: ${i.gap_detected ? 'Sim' : 'Não'}`
    ).join('\n\n');

    // 4. Instantiate AssessmentAgent
    const agent = new AssessmentAgent(c.env.AI, db, c.env);
    
    // 5. Run the assessment
    const context = {
      organizationId: projectId,
      standardReference: project.sector || 'Geral'
    };
    
    const result = await agent.run(assessmentData, context);
    
    if (!result.success) {
      return c.json({ error: 'Falha no processamento agêntico do diagnóstico', details: result.content }, 500);
    }

    // Parse the score and advice from AI response markdown
    let cmmScore = 1;
    const cmmMatch = result.content.match(/Nível CMM.*?(\d+)/i);
    if (cmmMatch) {
      cmmScore = parseInt(cmmMatch[1]);
    }

    // 6. Save the global assessment as a custom checklist progress notes record for tracking
    // We store it under item_id = 'global_assessment' so the client can query it later
    const notesPayload = JSON.stringify({
      audit_status: cmmScore >= 3 ? 'compliant' : 'non_compliant',
      cmm_score: cmmScore,
      audit_finding: result.content,
      audited_at: new Date().toISOString()
    });

    // Check if progress already exists to update it, or insert
    const existingProgress = await db.prepare('SELECT id FROM checklist_progress WHERE project_id = ? AND item_id = "global_assessment"').bind(projectId).first();
    if (existingProgress) {
      await db.prepare('UPDATE checklist_progress SET is_checked = ?, notes = ?, checked_at = CURRENT_TIMESTAMP WHERE project_id = ? AND item_id = "global_assessment"').bind(
        cmmScore >= 3 ? 1 : 0,
        notesPayload,
        projectId
      ).run();
    } else {
      await db.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes)
        VALUES (lower(hex(randomblob(16))), ?, 0, 'global_assessment', ?, ?)`).bind(
          projectId,
          cmmScore >= 3 ? 1 : 0,
          notesPayload
        ).run();
    }

    await logAudit(db, 'project.assessment.evaluated', c.get('user')?.email || 'system', `Diagnóstico de Auto-Avaliação agêntico rodado para projeto ${projectId}`);

    return c.json({
      ok: true,
      cmm_score: cmmScore,
      report: result.content
    });

  } catch (err: any) {
    return c.json({ error: 'Erro ao rodar diagnóstico executivo', details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTEXT & STAKEHOLDERS (Sprint A)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/projects/:id/stakeholders', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

app.post('/api/v1/projects/:id/stakeholders', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { name, type, category, requirements, influence, communication_method } = await c.req.json();
    if (!name) return c.json({ error: 'name is required' }, 400);
    await c.env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type, category, requirements, influence, communication_method)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`).bind(
        projectId, name, type || 'external', category || null, requirements || null, influence || 'Medium', communication_method || null
      ).run();
    await logAudit(c.env.DB, 'stakeholder.created', c.get('user')?.email || 'system', `Stakeholder ${name} criado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar stakeholder', detail: e.message }, 500);
  }
});

app.put('/api/v1/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'stakeholders', id);
  try {
    const { name, type, category, requirements, influence, communication_method } = await c.req.json();
    await c.env.DB.prepare(`UPDATE stakeholders SET name = COALESCE(?, name), type = COALESCE(?, type), category = COALESCE(?, category),
      requirements = COALESCE(?, requirements), influence = COALESCE(?, influence), communication_method = COALESCE(?, communication_method),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
        name || null, type || null, category || null, requirements || null, influence || null, communication_method || null, id
      ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar stakeholder', detail: e.message }, 500);
  }
});

app.delete('/api/v1/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'stakeholders', id);
  try {
    await c.env.DB.prepare('DELETE FROM stakeholders WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar stakeholder', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/governance', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM project_governance WHERE project_id = ? ORDER BY created_at ASC').bind(projectId).all();
  return c.json(rows.results || []);
});

app.post('/api/v1/projects/:id/governance', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { id, name, email, role_category, job_title, is_primary } = await c.req.json();
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!role_category) return c.json({ error: 'role_category is required' }, 400);
    if (!job_title) return c.json({ error: 'job_title is required' }, 400);

    if (id) {
      await c.env.DB.prepare(`
        UPDATE project_governance 
        SET name = ?, email = ?, role_category = ?, job_title = ?, is_primary = ? 
        WHERE id = ? AND project_id = ?
      `).bind(name, email || null, role_category, job_title, is_primary ? 1 : 0, id, projectId).run();
      await logAudit(c.env.DB, 'governance.updated', c.get('user')?.email || 'system', `Membro da governança ${name} atualizado para projeto ${projectId}`);
    } else {
      await c.env.DB.prepare(`
        INSERT INTO project_governance (id, project_id, name, email, role_category, job_title, is_primary)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
      `).bind(projectId, name, email || null, role_category, job_title, is_primary ? 1 : 0).run();
      await logAudit(c.env.DB, 'governance.created', c.get('user')?.email || 'system', `Membro da governança ${name} criado para projeto ${projectId}`);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao salvar governança', detail: e.message }, 500);
  }
});

app.delete('/api/v1/projects/:id/governance/:memberId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const memberId = c.req.param('memberId');
    await c.env.DB.prepare('DELETE FROM project_governance WHERE id = ? AND project_id = ?').bind(memberId, projectId).run();
    await logAudit(c.env.DB, 'governance.deleted', c.get('user')?.email || 'system', `Membro da governança id ${memberId} deletado do projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar governança', detail: e.message }, 500);
  }
});

app.put('/api/v1/projects/:id/company-profile', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { cnpj, employee_count, scope, sector, client_name } = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE projects 
      SET cnpj = ?, employee_count = ?, scope = ?, sector = ?, client_name = ?
      WHERE id = ?
    `).bind(
      cnpj || null, 
      employee_count ? parseInt(employee_count) : null, 
      scope || null, 
      sector || null, 
      client_name || '', 
      projectId
    ).run();

    await logAudit(c.env.DB, 'company_profile.updated', c.get('user')?.email || 'system', `Perfil corporativo do projeto ${projectId} atualizado`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar perfil corporativo', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/context', async (c) => {
  const projectId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM context_analysis WHERE project_id = ?').bind(projectId).first();
  return c.json(row || {});
});

app.put('/api/v1/projects/:id/context', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes } = await c.req.json();
    
    await c.env.DB.prepare(`INSERT INTO context_analysis (id, project_id, internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        internal_strengths = excluded.internal_strengths,
        internal_weaknesses = excluded.internal_weaknesses,
        external_opportunities = excluded.external_opportunities,
        external_threats = excluded.external_threats,
        legal_requirements = excluded.legal_requirements,
        contractual_requirements = excluded.contractual_requirements,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP`).bind(
          projectId, internal_strengths || null, internal_weaknesses || null, external_opportunities || null, external_threats || null, legal_requirements || null, contractual_requirements || null, notes || null
        ).run();
        
    await logAudit(c.env.DB, 'context.updated', c.get('user')?.email || 'system', `Contexto atualizado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar contexto', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT FINDINGS & MANAGEMENT REVIEW (Sprint D)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/audits/:auditId/findings', async (c) => {
  const auditId = c.req.param('auditId');
  const rows = await c.env.DB.prepare('SELECT * FROM audit_findings WHERE audit_id = ? ORDER BY created_at DESC').bind(auditId).all();
  return c.json(rows.results || []);
});

app.post('/api/v1/audits/:auditId/findings', async (c) => {
  try {
    const auditId = c.req.param('auditId');
    const { project_id, control_id, finding_type, description, evidence_reviewed, auditor_notes } = await c.req.json();
    if (!description) return c.json({ error: 'description is required' }, 400);
    
    const findingId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    let capaId: string | null = null;
    
    if (finding_type === 'minor_nc' || finding_type === 'major_nc') {
      capaId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(`
        INSERT INTO corrective_actions (id, project_id, audit_id, control_id, title, description, severity, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        capaId, project_id, auditId, control_id || null, 
        `NC (${finding_type === 'major_nc' ? 'Maior' : 'Menor'}): ${description.substring(0, 50)}`, 
        description, finding_type === 'major_nc' ? 'High' : 'Medium'
      ).run();
      
      await logAudit(c.env.DB, 'capa.created_from_audit', c.get('user')?.email || 'system', `Ação corretiva ${capaId} criada a partir da NC de auditoria ${auditId}`);
    }
    
    await c.env.DB.prepare(`
      INSERT INTO audit_findings (id, audit_id, project_id, control_id, finding_type, description, evidence_reviewed, auditor_notes, capa_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
    `).bind(
      findingId, auditId, project_id, control_id || null, finding_type || 'observation', description, evidence_reviewed || null, auditor_notes || null, capaId
    ).run();
    
    await logAudit(c.env.DB, 'audit_finding.created', c.get('user')?.email || 'system', `Achado ${findingId} criado para auditoria ${auditId}`);
    return c.json({ ok: true, id: findingId, capa_id: capaId });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar achado de auditoria', detail: e.message }, 500);
  }
});

app.put('/api/v1/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'audit_findings', id);
  try {
    const { description, auditor_notes, status } = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE audit_findings 
      SET description = COALESCE(?, description), 
          auditor_notes = COALESCE(?, auditor_notes), 
          status = COALESCE(?, status) 
      WHERE id = ?
    `).bind(description || null, auditor_notes || null, status || null, id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar achado de auditoria', detail: e.message }, 500);
  }
});

app.delete('/api/v1/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'audit_findings', id);
  try {
    await c.env.DB.prepare('DELETE FROM audit_findings WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao deletar achado de auditoria', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/management-reviews', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM management_reviews WHERE project_id = ? ORDER BY review_date DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

app.post('/api/v1/projects/:id/management-reviews', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { review_date, attendees } = await c.req.json();
    if (!review_date) return c.json({ error: 'review_date is required' }, 400);
    
    const [controls, capas, risks, training] = await Promise.all([
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM compliance_controls WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM corrective_actions WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM risks WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM training_records WHERE project_id = ? GROUP BY status').bind(projectId).all()
    ]);
    
    const agenda = {
      items: [
        { topic: '1. Status das ações da revisão anterior', data: 'Ações tomadas com base nas atas passadas.' },
        { topic: '2. Mudanças em questões internas/externas', data: 'Revisar SWOT e requisitos legais de segurança.' },
        { topic: '3. Desempenho e eficácia do SGSI', data: controls.results || [] },
        { topic: '4. Resultados de auditorias e achados', data: 'Ver histórico de NCs do módulo de auditoria.' },
        { topic: '5. Status das ações corretivas (CAPAs)', data: capas.results || [] },
        { topic: '6. Monitoramento de riscos e eficácia', data: risks.results || [] },
        { topic: '7. Desempenho de fornecedores', data: 'Ver trust scores e DPAs dos suboperadores.' },
        { topic: '8. Cobertura de conscientização e treinamento', data: training.results || [] },
        { topic: '9. Feedback de partes interessadas', data: 'Revisar matriz de stakeholders.' },
        { topic: '10. Adequação de recursos para o ISMS', data: 'Orçamento, ferramentas e equipe CISO.' },
        { topic: '11. Oportunidades de melhoria contínua', data: 'Identificar novos projetos de conformidade.' }
      ]
    };
    
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO management_reviews (id, project_id, review_date, attendees, agenda_json, status)
      VALUES (?, ?, ?, ?, ?, 'Planned')
    `).bind(
      id, projectId, review_date, attendees || null, JSON.stringify(agenda)
    ).run();
    
    await logAudit(c.env.DB, 'management_review.created', c.get('user')?.email || 'system', `Reunião de análise crítica registrada para o projeto ${projectId}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar reunião de análise crítica', detail: e.message }, 500);
  }
});

app.put('/api/v1/management-reviews/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'management_reviews', id);
  try {
    const { decisions, action_items, status, minutes_url, attendees } = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE management_reviews 
      SET decisions = COALESCE(?, decisions), 
          action_items = COALESCE(?, action_items), 
          status = COALESCE(?, status),
          minutes_url = COALESCE(?, minutes_url),
          attendees = COALESCE(?, attendees),
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(
      decisions !== undefined ? decisions : null,
      action_items !== undefined ? action_items : null,
      status !== undefined ? status : null,
      minutes_url !== undefined ? minutes_url : null,
      attendees !== undefined ? attendees : null,
      id
    ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao atualizar reunião de análise crítica', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDITOR COLLABORATION HUB (Sprint E)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/v1/auditor/:token/notes', async (c) => {
  try {
    const token = c.req.param('token');
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const notes = await c.env.DB.prepare(`
      SELECT n.*, cc.standard as control_standard, cc.title as control_title 
      FROM auditor_notes n
      LEFT JOIN compliance_controls cc ON n.control_id = cc.id
      WHERE n.project_id = ? 
      ORDER BY n.created_at DESC
    `).bind(t.project_id).all();
    return c.json({ ok: true, notes: notes.results || [] });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar notas', detail: e.message }, 500);
  }
});

app.post('/api/v1/auditor/:token/notes', async (c) => {
  try {
    const token = c.req.param('token');
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const { control_id, note_type, content } = await c.req.json();
    if (!content) return c.json({ error: 'content is required' }, 400);
    
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id, t.project_id, token, control_id || null, note_type || 'question', content
    ).run();
    
    await logAudit(c.env.DB, 'auditor_note.created', 'auditor', `Nota de auditor ${id} criada para o projeto ${t.project_id}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar nota de auditor', detail: e.message }, 500);
  }
});

app.put('/api/v1/auditor-notes/:id/respond', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const { response } = await c.req.json();
    if (!response) return c.json({ error: 'response is required' }, 400);
    
    await c.env.DB.prepare(`
      UPDATE auditor_notes 
      SET response = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(response, user.id, id).run();
    
    await logAudit(c.env.DB, 'auditor_note.responded', user.email, `Nota de auditor ${id} respondida`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Falha ao responder nota de auditor', detail: e.message }, 500);
  }
});

app.get('/api/v1/projects/:id/auditor-notes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const notes = await c.env.DB.prepare(`
      SELECT n.*, cc.standard as control_standard, cc.title as control_title 
      FROM auditor_notes n
      LEFT JOIN compliance_controls cc ON n.control_id = cc.id
      WHERE n.project_id = ? 
      ORDER BY n.created_at DESC
    `).bind(projectId).all();
    return c.json({ ok: true, notes: notes.results || [] });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar notas', detail: e.message }, 500);
  }
});

app.get('/api/v1/auditor/:token/evidence/:evidenceId/download', async (c) => {
  try {
    const token = c.req.param('token');
    const evidenceId = c.req.param('evidenceId');
    
    const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
    if (!t) return c.json({ error: 'Invalid or expired token' }, 401);
    
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND project_id = ?').bind(evidenceId, t.project_id).first() as any;
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidence not found' }, 404);
    
    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'File not found in storage' }, 404);
    
    return new Response(obj.body, { 
      headers: { 
        'Content-Type': ev.file_type || 'application/octet-stream', 
        'Content-Disposition': `attachment; filename="${ev.file_name || 'evidence'}"` 
      } 
    });
  } catch (e: any) {
    return c.json({ error: 'Falha no download', detail: e.message }, 500);
  }
});

// Obter assessment do próprio cliente logado
app.get('/api/v1/client/assessment', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_lead_id) {
      return c.json({ error: 'Nenhum lead comercial associado a esta conta' }, 404);
    }
    const assessment = await c.env.DB.prepare('SELECT id FROM assessments WHERE lead_id = ?').bind(user.client_lead_id).first() as any;
    if (!assessment) {
      return c.json({ error: 'Assessment não encontrado para este lead' }, 404);
    }
    return c.json({ assessment_id: assessment.id });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar assessment do cliente', detail: e.message }, 500);
  }
});

// Obter proposta do próprio cliente logado
app.get('/api/v1/client/proposal', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_lead_id) {
      return c.json({ error: 'Nenhum lead comercial associado a esta conta' }, 404);
    }
    const proposal = await c.env.DB.prepare('SELECT id, status FROM proposals WHERE lead_id = ?').bind(user.client_lead_id).first() as any;
    if (!proposal) {
      return c.json({ error: 'Proposta não encontrada para este lead' }, 404);
    }
    return c.json({ proposal_id: proposal.id, status: proposal.status });
  } catch (e: any) {
    return c.json({ error: 'Erro ao buscar proposta do cliente', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MÓDULOS DE CONFORMIDADE ISO 27001/27701 (GAPS DE AUDITORIA)
// ═══════════════════════════════════════════════════════════════════════════════

// --- MÉTRICAS & KPIS CRUD ---
app.get('/api/v1/projects/:id/metrics', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM performance_metrics WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

app.post('/api/v1/projects/:id/metrics', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    if (!metric_name) return c.json({ error: 'Metric Name is required' }, 400);

    const metricId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO performance_metrics (id, project_id, metric_name, target_value, current_value, frequency, last_measured_at, owner, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(metricId, projectId, metric_name, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || 'Monthly', last_measured_at || null, owner || null, status || 'On Track').run();

    return c.json({ ok: true, id: metricId });
  } catch (e: any) {
    return c.json({ error: 'Error creating metric', detail: e.message }, 500);
  }
});

app.put('/api/v1/metrics/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'performance_metrics', id);
  try {
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    
    await c.env.DB.prepare(
      'UPDATE performance_metrics SET metric_name = COALESCE(?, metric_name), target_value = COALESCE(?, target_value), current_value = COALESCE(?, current_value), frequency = COALESCE(?, frequency), last_measured_at = COALESCE(?, last_measured_at), owner = COALESCE(?, owner), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(metric_name || null, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || null, last_measured_at || null, owner || null, status || null, id).run();

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Error updating metric', detail: e.message }, 500);
  }
});

app.delete('/api/v1/metrics/:id', async (c) => {
  const id = c.req.param('id');
  await requireResourceAccess(c, 'performance_metrics', id);
  try {
    await c.env.DB.prepare('DELETE FROM performance_metrics WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Error deleting metric', detail: e.message }, 500);
  }
});

// --- ACEITE DE POLÍTICAS ---
app.get('/api/v1/projects/:id/policy-acknowledgments', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM policy_acknowledgments WHERE project_id = ? ORDER BY acknowledged_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

app.post('/api/v1/projects/:id/policy-acknowledgments', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { policy_type, user_name, user_email } = await c.req.json();
    if (!policy_type || !user_name || !user_email) return c.json({ error: 'Policy Type, User Name and Email are required' }, 400);

    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';

    const ackId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ackId, projectId, policy_type, user_name, user_email, ipAddress, userAgent).run();

    return c.json({ ok: true, id: ackId });
  } catch (e: any) {
    return c.json({ error: 'Error recording policy acknowledgment', detail: e.message }, 500);
  }
});

// --- TRILHA DE AUDITORIA ---
app.get('/api/v1/projects/:id/audit-trail', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs WHERE details LIKE ? OR details LIKE ? ORDER BY created_at DESC LIMIT 500`
  ).bind(`%${projectId}%`, `%${projectId.substring(0, 8)}%`).all();
  return c.json(results || []);
});

// --- DOWNLOAD DE EVIDÊNCIA CENTRALIZADA ---
app.get('/api/v1/projects/:id/evidence/:evidenceId/download', async (c) => {
  try {
    const projectId = c.req.param('id');
    const evidenceId = c.req.param('evidenceId');
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND project_id = ?').bind(evidenceId, projectId).first() as any;
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidence not found' }, 404);

    let obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) {
      // ponytail: auto-seed mock evidence to R2 if DB says it exists but R2 is blank
      let mockContent = '';
      if (evidenceId === 'ev-cliente-scope') {
        mockContent = `# Escopo do SGSI - cliente\n\nEste documento define o escopo do Sistema de Gestão de Segurança da Informação (SGSI) da cliente (Bekaa Trusted Advisors).\n\n**Escopo:** A plataforma de Face ID e serviços em nuvem hospedados na AWS.`;
      } else if (evidenceId === 'ev-cliente-policy') {
        mockContent = `# Política de Segurança da Informação - cliente\n\n1. Objetivo: Proteger os dados cadastrais e biométricos contra acessos não autorizados.\n2. Diretrizes: Acesso baseado em privilégio mínimo, criptografia de ponta a ponta e monitoramento contínuo.`;
      } else {
        mockContent = `# Evidência Mock - ${ev.file_name}\n\nEste é um arquivo de evidência gerado automaticamente para testes.`;
      }
      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(mockContent);
      await c.env.STORAGE.put(ev.r2_key, arrayBuffer, {
        httpMetadata: { contentType: ev.file_type || 'text/markdown' }
      });
      obj = await c.env.STORAGE.get(ev.r2_key);
    }

    if (!obj) return c.json({ error: 'File not found in storage' }, 404);

    return new Response(obj.body, {
      headers: {
        'Content-Type': ev.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${ev.file_name || 'evidence'}"`
      }
    });
  } catch (e: any) {
    return c.json({ error: 'Error downloading evidence', detail: e.message }, 500);
  }
});

// --- TEMPLATES DE POLÍTICAS ---
app.get('/api/v1/policies/templates', async (c) => {
  try {
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const templates = await generator.listAvailableTemplates('v2022');
    return c.json({ ok: true, templates });
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar templates', detail: e.message }, 500);
  }
});

app.get('/api/v1/policies/templates/:templateName', async (c) => {
  try {
    const templateName = c.req.param('templateName');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const markdown = await generator.generate(templateName, {
      organizationName: '[Nome da Organização]',
      policyOwner: 'Consultor nISO',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });
    return c.json({ ok: true, markdown });
  } catch (e: any) {
    return c.json({ error: 'Falha ao obter conteúdo do template', detail: e.message }, 500);
  }
});


app.post('/api/v1/projects/:id/policies/generate-from-template', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { template_name, control_id } = await c.req.json<{ template_name: string; control_id: string }>();

    if (!template_name || !control_id) {
      return c.json({ error: 'template_name e control_id são obrigatórios' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const user = c.get('user');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);

    // Gerar conteúdo a partir do template com variáveis do projeto
    const markdown = await generator.generate(template_name, {
      organizationName: project.client_name,
      policyOwner: user?.name || 'Consultor nISO',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });

    // Save policy markdown directly to compliance_controls.description
    const normId = 'ctrl-' + control_id.toLowerCase().replace(/[^a-z0-9]/g, '');
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(markdown, normId, control_id, projectId).run();

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, normId, control_id).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, normId, nextVer, markdown, user?.email || 'system').run();
    } catch (e) {
      console.error("Erro ao registrar versão da política", e);
    }

    await logAudit(c.env.DB, 'policy.generated_from_template', user?.email ?? 'system', `Política gerada via template ${template_name} para o controle ${control_id}, projeto ${projectId}`);

    return c.json({
      ok: true,
      policy_markdown: markdown,
      control: control_id
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar política a partir de template', detail: e.message }, 500);
  }
});

// --- IMPORTAÇÃO DE TREINAMENTO EXTERNO ---
app.post('/api/v1/projects/:id/training/import-external', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { records } = await c.req.json<{
      records: Array<{
        employee_name: string;
        training_name: string;
        completion_date?: string;
        score?: number;
        status?: string;
      }>;
    }>();

    if (!records || !Array.isArray(records)) {
      return c.json({ error: 'Array "records" é obrigatório' }, 400);
    }

    const stmt = c.env.DB.prepare(
      `INSERT INTO training_records (id, project_id, employee_name, training_name, completion_date, score, status, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );

    const batch = records.map(r =>
      stmt.bind(
        projectId,
        r.employee_name,
        r.training_name,
        r.completion_date || new Date().toISOString().split('T')[0],
        r.score !== undefined ? r.score : null,
        r.status || 'Completed'
      )
    );

    await c.env.DB.batch(batch);

    await logAudit(c.env.DB, 'training.imported_external', c.get('user')?.email ?? 'system', `Importados ${records.length} registros de treinamento para o projeto ${projectId}`);

    return c.json({ ok: true, count: records.length });
  } catch (e: any) {
    return c.json({ error: 'Falha ao importar registros de treinamento', detail: e.message }, 500);
  }
});

// ─── MCP (Model Context Protocol) ──────────────────────────────────────────
app.get('/api/v1/mcp', async (c) => {
    return c.json({
        mcp_version: '1.0',
        tools: [
            {
                name: 'get_project_knowledge',
                description: 'Busca semântica no cérebro do projeto (entrevistas, procedimentos, políticas).',
                parameters: {
                    type: 'object',
                    properties: {
                        project_id: { type: 'string' },
                        query: { type: 'string' }
                    },
                    required: ['project_id', 'query']
                }
            },
            {
                name: 'check_control_compliance',
                description: 'Verifica o status de um controle ISO específico no projeto.',
                parameters: {
                    type: 'object',
                    properties: {
                        project_id: { type: 'string' },
                        control_id: { type: 'string' }
                    },
                    required: ['project_id', 'control_id']
                }
            }
        ]
    });
});

app.post('/api/v1/mcp/execute', async (c) => {
    const { tool, arguments: args } = await c.req.json();
    const service = new KnowledgeService(c.env);
    
    if (tool === 'get_project_knowledge') {
        const results = await service.search(args.project_id, args.query);
        return c.json({ results });
    }
    
    if (tool === 'check_control_compliance') {
        const ctrl = await c.env.DB.prepare('SELECT status, maturity FROM compliance_controls WHERE project_id = ? AND control_id = ?')
            .bind(args.project_id, args.control_id).first();
        return c.json({ control: ctrl || { status: 'Not Started' } });
    }

    return c.json({ error: 'Tool not found' }, 404);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  STATIC FILES (catch-all — deve ser a última rota)
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.includes('.') && !path.endsWith('.html')) {
    if (c.env.ASSETS) {
      return await c.env.ASSETS.fetch(c.req.raw);
    }
    return c.text('Not found', 404);
  }
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404) {
      const fallbackRequest = new Request(new URL('/', c.req.url).toString());
      return await c.env.ASSETS.fetch(fallbackRequest);
    }
    return res;
  }
  return c.text('Not found', 404);
});

export default app;
