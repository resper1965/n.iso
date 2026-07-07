// =============================================================================
// src/services/pricing.ts — Motor de Precificação ISO 27001 | nISO Agentic GRC
// =============================================================================

// ponytail: flexible interface — the 92-question Gold assessment has many keys,
// only a subset feed into pricing. Accept any key.
export interface Answers {
  [key: string]: string | number | undefined;
}

export interface Tier {
  tier: number;
  name: string;
  scoreMin: number;
  scoreMax: number;
  precoMercado: number;
  duracao: string;
  semanasTotal: number;
  pdNess: number;
  pdCliente: number;
  perfil: string;
  entregas: string[];
}

export interface Phase {
  fase: string;
  nome: string;
  semanas: number;
  pdNess: number;
  pdCliente: number;
  pct: number;
  valorFase?: number;
}

export interface Economics {
  custoDireto: number;
  overhead: number;
  custoTotal: number;
  valorTributos: number;
  totalTributosPct: number;
  receitaLiquida: number;
  margemOp: number;
  margemPct: number;
  taxaBlendada: number;
  viavel: boolean;
}

export interface Gap {
  controles: string;
  titulo: string;
  impacto: string;
  risco: string;
  acao: string;
}

export interface PricingResult {
  score: number;
  scoreMax: number;
  tier: Tier;
  scopeInfo: {
    fator: number;
    label: string;
    count: number | null;
  };
  precoFinal: number;
  eco: Economics;
  fases: Phase[];
  gaps: Gap[];
  isTech: boolean;
  geradoEm: string;
}

// 🎛️ SEÇÃO 1 — MODELO FINANCEIRO
// ponytail: taxaVendaPD é o preço de venda por PD (o que cobramos do cliente)
// custoInternoPD é o custo real do consultor (para cálculo de margem)
// Sem dupla margem: precoFinal = pdReal × taxaVendaPD × buffer
export const DEFAULT_FINANCIAL_MODEL = {
  taxaVendaPD: {
    1: 2200,   // R$275/h — Foundation
    2: 2900,   // R$362/h — Standard
    3: 3600,   // R$450/h — Enterprise

  } as Record<number, number>,
  custoInternoPD: {
    1: 550,    // custo real consultor/dia
    2: 700,
    3: 900,
  } as Record<number, number>,
  overheadPct: 0.22,
  margemAlvo: 0.45,  // referência para viabilidade
  tributos: {
    iss:    0.0500,
    pis:    0.0165,
    cofins: 0.0760,
    irpj:   0.0400,
    csll:   0.0225,
  },
  bufferRisco: {
    1: 0.05,
    2: 0.08,
    3: 0.12,
  } as Record<number, number>,
  comissaoPct: 0.00,
};

export type FinancialModelConfig = typeof DEFAULT_FINANCIAL_MODEL;

// ponytail: merge DB overrides with defaults
export function mergeConfig(overrides?: Partial<FinancialModelConfig>): FinancialModelConfig {
  if (!overrides) return DEFAULT_FINANCIAL_MODEL;
  return {
    ...DEFAULT_FINANCIAL_MODEL,
    ...overrides,
    taxaVendaPD: { ...DEFAULT_FINANCIAL_MODEL.taxaVendaPD, ...(overrides.taxaVendaPD || {}) },
    custoInternoPD: { ...DEFAULT_FINANCIAL_MODEL.custoInternoPD, ...(overrides.custoInternoPD || {}) },
    tributos: { ...DEFAULT_FINANCIAL_MODEL.tributos, ...(overrides.tributos || {}) },
    bufferRisco: { ...DEFAULT_FINANCIAL_MODEL.bufferRisco, ...(overrides.bufferRisco || {}) },
  };
}

// backward compat alias
export const FINANCIAL_MODEL = DEFAULT_FINANCIAL_MODEL;

// 🎛️ SEÇÃO 2 — TABELA DE PONTUAÇÃO (alinhada com BLOCK_QUESTIONS Gold)
export const SCORE_MAP: Record<string, Record<string, number>> = {
  // Block 3: Ambiente Tecnológico
  iam: {
    'SSO + MFA obrigatório':              0,
    'SSO implementado':                   1,
    'IdP dedicado (Okta, Auth0, Azure AD)': 1,
    'IAM do cloud provider':              2,
    'Sem IAM centralizado':               4,
  },
  backup: {
    'Backup + DR documentado e testado':         0,
    'Backup automático com teste de restore':    1,
    'Backup automático sem teste de restore':    2,
    'Backup manual / ocasional':                 4,
    'Sem backup':                                5,
  },
  logging: {
    'Observabilidade completa (logs + métricas + traces)': 0,
    'SIEM implementado':                         0,
    'Ferramenta de logs (CloudWatch, Datadog, etc.)': 1,
    'Logs básicos (stdout)':                     3,
    'Sem monitoramento':                         5,
  },
  mfa: {
    'Para todos os sistemas (cloud + SaaS + VPN)': 0,
    'Para todos os acessos ao cloud':            1,
    'Apenas para admins':                        2,
    'Não':                                       4,
  },
  // Block 4: SDLC
  sdlc: {
    'Secure SDLC + Privacy by Design':   0,
    'Secure SDLC implementado':          1,
    'SDLC documentado sem segurança':    2,
    'Processo informal / ad-hoc':        3,
    'Sem processo formal':               4,
  },
  code_review: {
    'Obrigatório + checklist de segurança': 0,
    'Obrigatório (2+ reviewers)':        0,
    'Obrigatório (1 reviewer)':          1,
    'Opcional / informal':               2,
    'Não existe':                        4,
  },
  cicd: {
    'GitOps / deploy automatizado':                      0,
    'Pipeline completo (build + test + scan + deploy)':  0,
    'Pipeline básico (build + test)':                    1,
    'Manual / ad-hoc':                                   3,
    'Inexistente':                                       4,
  },
  vuln_mgmt: {
    'Processo + métricas + dashboard':   0,
    'Processo com SLA por severidade':   1,
    'Processo definido sem SLA':         2,
    'Ad-hoc / reativo':                  3,
    'Inexistente':                       4,
  },
  sast_sca: {
    'SAST + SCA + DAST integrados no pipeline': 0,
    'SAST + SCA no pipeline':            0,
    'SAST ou SCA isolado':               1,
    'Scan manual / esporádico':          2,
    'Nenhuma':                           4,
  },
  pentest: {
    'Programa contínuo (bug bounty + pentest anual)': 0,
    'Anual com reteste':                 0,
    'Anual sem reteste':                 1,
    'Uma vez (há mais de 1 ano)':        3,
    'Nunca realizado':                   4,
  },
  branch_protection: {
    'Sim':  0,
    'Nao':  2,
  },
  prod_access: {
    'Zero standing access / JIT':        0,
    'Acesso restrito via bastion/VPN':   1,
    'Acesso direto com aprovação':       2,
    'Acesso direto irrestrito':          4,
  },
  // Block 5: Privacidade
  ropa: {
    'Completo e atualizado':  0,
    'Parcial':                1,
    'Em construção':          2,
    'Inexistente':            4,
  },
  dsr_channel: {
    'Canal + SLA + métricas':       0,
    'Plataforma de gestão de DSR':  0,
    'Formulário web dedicado':      1,
    'Email genérico':               2,
    'Inexistente':                  4,
  },
  dpia: {
    'Processo recorrente integrado ao SDLC': 0,
    'Realizado para projetos de alto risco': 1,
    'Realizado uma vez':             2,
    'Nunca realizado':               4,
  },
  legal_bases: {
    'Mapeadas e documentadas':  0,
    'Parcialmente mapeadas':    2,
    'Não mapeadas':             4,
  },
  retention: {
    'Política definida e implementada': 0,
    'Política definida sem implementação': 2,
    'Inexistente':              4,
  },
  // Block 6: Governança
  commitment: {
    'C-Level engajado ativamente':  0,
    'Apoio passivo':                2,
    'Sem engajamento':              4,
  },
  si_policy: {
    'Aprovada e comunicada':   0,
    'Em desenvolvimento':      2,
    'Inexistente':             4,
  },
  risk_assessment: {
    'Processo formal recorrente':  0,
    'Avaliação pontual':           2,
    'Sem avaliação formal':        4,
  },
  competence_records: {
    'Registros formais mantidos':  0,
    'Registros parciais':          1,
    'Sem registros':               3,
  },
  documented_info: {
    'Processo formal de controle': 0,
    'Controle parcial':            1,
    'Sem controle':                3,
  },
  internal_comm: {
    'Processo estruturado':    0,
    'Comunicação ad-hoc':      1,
    'Sem processo':            3,
  },
  // Block 7: Fornecedores
  supplier_eval: {
    'Avaliação formal de segurança': 0,
    'Checklist básico':              2,
    'Sem avaliação':                 4,
  },
  dpa_contracts: {
    'DPA com todos':       0,
    'DPA com principais':  2,
    'Sem DPA':             4,
  },
  offboarding: {
    'Processo automatizado':      0,
    'Checklist manual':           1,
    'Processo informal':          2,
    'Sem processo':               4,
  },
  // Block 8: Documentação
  classification: {
    'Esquema implementado e comunicado': 0,
    'Esquema definido sem implementação': 2,
    'Sem classificação':                  4,
  },
  doc_repo: {
    'Repositório centralizado (Confluence, SharePoint)': 0,
    'Google Drive / pasta de rede':                      1,
    'Documentos espalhados':                             3,
    'Sem repositório':                                   4,
  },
  doc_version: {
    'Controle de versão formal':    0,
    'Controle informal':            1,
    'Sem controle de versão':       3,
  },
  doc_approval: {
    'Processo formal de aprovação':  0,
    'Aprovação informal':            1,
    'Sem processo de aprovação':     3,
  },
  awareness_docs: {
    'Programa completo (docs + treinamento + testes)': 0,
    'Material básico':               1,
    'Sem material':                  4,
  },
};

export const SCORE_BONUS = {
  controles_sem_nenhum:    4,
  controles_poucos:        2,
  vulnerabilidades_ativas: 3,
};

export const SCORE_MAX = (() => {
  const base = Object.values(SCORE_MAP)
    .reduce((acc, map) => acc + Math.max(...Object.values(map)), 0);
  return base + SCORE_BONUS.controles_sem_nenhum + SCORE_BONUS.vulnerabilidades_ativas;
})();

// 🎛️ SEÇÃO 3 — TIERS
export const TIERS: Tier[] = [
  {
    tier: 1,
    name: 'Foundation',
    scoreMin: 0,
    scoreMax: 12,
    precoMercado: 25000,
    duracao: '3 meses',
    semanasTotal: 10,
    pdNess: 45,
    pdCliente: 30,
    perfil: 'Empresa com infra moderna, boas práticas parciais. Foco nas Cláusulas 4, 5 e 6 e Controles Críticos do Anexo A.',
    entregas: [
      'Orientação no Diagnóstico de Gaps e Declaração de Escopo (Cláusula 4.3)',
      'Templates de Política de Segurança da Informação e Diretrizes de Liderança (Cláusula 5.2)',
      'Facilitação do Planejamento e Gestão de Riscos (Cláusula 6.1)',
      'Orientação em SoA Lite — cobertura de 20 controles críticos do Anexo A (Temas 5 e 8)',
      'Programa de Conscientização Básica (Cláusula 7.3)',
      'Acompanhamento na Auditoria de Certificação (Estágios 1 e 2)',
    ],
  },
  {
    tier: 2,
    name: 'Standard',
    scoreMin: 13,
    scoreMax: 24,
    precoMercado: 55000,
    duracao: '4 meses',
    semanasTotal: 18,
    pdNess: 90,
    pdCliente: 60,
    perfil: 'Ambiente híbrido ou legado parcial. Implementação completa do SGSI (Cláusulas 4-10) e SoA ampliado.',
    entregas: [
      'Tudo do Tier Foundation, mais:',
      'Orientação na Análise de Contexto e Partes Interessadas (Cláusula 4.1 e 4.2)',
      'Orientação em SoA Standard — cobertura de 50+ controles do Anexo A (Temas 5, 6 e 8)',
      'Orientação em Gestão de Ativos e Classificação de Informação (A.5.9, A.5.12)',
      'Revisão de SSDLC — Segurança no Ciclo de Vida (A.8.25)',
      'Orientação em BCP/DRP — Continuidade de Negócios e Prontidão de TIC (A.5.29, A.5.30)',
      'Condução da Auditoria Interna Completa (Cláusula 9.2)',
    ],
  },
  {
    tier: 3,
    name: 'Enterprise',
    scoreMin: 25,
    scoreMax: Infinity,
    precoMercado: 95000,
    duracao: '6 meses',
    semanasTotal: 28,
    pdNess: 160,
    pdCliente: 100,
    perfil: 'Legado complexo ou regulação setorial. Full Compliance ISO 27001:2022 (93 controles) + Advanced Security.',
    entregas: [
      'Tudo do Tier Standard, mais:',
      'Orientação para Full SoA — cobertura dos 93 controles do Anexo A (Temas 5, 6, 7 e 8)',
      'Facilitação de Threat Modeling (STRIDE) e revisão de Arquitetura de Segurança',
      'Orientação em Segurança de Aplicações e Desenvolvimento Seguro (A.6.3, A.8.25-8.28)',
      'Orientação em Segurança em Nuvem e Gerenciamento de Vulnerabilidades (A.5.23, A.8.8)',
      'Facilitação da Análise Crítica pela Direção (Cláusula 9.3)',
    ],
  },

];

// 🎛️ SEÇÃO 4 — MULTIPLICADOR DE ESCOPO (Tamanho da Organização)
export const SCOPE_MULTIPLIERS = [
  { maxPessoas:   49, fator: 1.0, label: '< 50 pessoas'      },
  { maxPessoas:  150, fator: 1.3, label: '50 – 150 pessoas'  },
  { maxPessoas:  400, fator: 1.6, label: '151 – 400 pessoas' },
  { maxPessoas: Infinity, fator: 2.0, label: '> 400 pessoas' },
];

// 🎛️ SEÇÃO 5 — BREAKDOWN DE ESFORÇO POR FASE
export const PHASE_BREAKDOWN: Record<number, Phase[]> = {
  1: [
    { fase:'F1', nome:'Diagnóstico e Escopo',      semanas: 2, pdNess: 10, pdCliente:  7, pct: 22 },
    { fase:'F2', nome:'Fundação Documental',        semanas: 2, pdNess:  7, pdCliente:  5, pct: 15 },
    { fase:'F3', nome:'Gestão de Riscos',           semanas: 2, pdNess: 11, pdCliente:  7, pct: 25 },
    { fase:'F4', nome:'Implementação de Controles', semanas: 3, pdNess: 11, pdCliente:  7, pct: 25 },
    { fase:'F5', nome:'Suporte à Certificação',     semanas: 1, pdNess:  6, pdCliente:  4, pct: 13 },
  ],
  2: [
    { fase:'F1', nome:'Diagnóstico e Escopo',       semanas: 2, pdNess: 10, pdCliente:  7, pct: 11 },
    { fase:'F2', nome:'Fundação Documental',         semanas: 2, pdNess:  7, pdCliente:  5, pct:  8 },
    { fase:'F3', nome:'Gestão de Riscos',            semanas: 3, pdNess: 15, pdCliente: 10, pct: 17 },
    { fase:'F4', nome:'Implementação de Controles',  semanas: 5, pdNess: 34, pdCliente: 22, pct: 38 },
    { fase:'F5', nome:'Conscientização e Cultura',   semanas: 2, pdNess:  9, pdCliente:  6, pct: 10 },
    { fase:'F6', nome:'Auditoria Interna',           semanas: 2, pdNess: 11, pdCliente:  7, pct: 12 },
    { fase:'F7', nome:'Suporte à Certificação',      semanas: 2, pdNess:  4, pdCliente:  3, pct:  4 },
  ],
  3: [
    { fase:'F1', nome:'Diagnóstico e Escopo',              semanas:  3, pdNess: 13, pdCliente:  8, pct:  8 },
    { fase:'F2', nome:'Fundação Documental',                semanas:  2, pdNess:  8, pdCliente:  5, pct:  5 },
    { fase:'F3', nome:'Gestão de Riscos + Threat Modeling', semanas:  3, pdNess: 21, pdCliente: 13, pct: 13 },
    { fase:'F4', nome:'Implementação de Controles (SoA)',   semanas:  8, pdNess: 64, pdCliente: 40, pct: 40 },
    { fase:'F5', nome:'Pentest + AppSec',                   semanas:  3, pdNess: 18, pdCliente: 10, pct: 11 },
    { fase:'F6', nome:'Conscientização + Secure Coding',    semanas:  3, pdNess: 13, pdCliente:  8, pct:  8 },
    { fase:'F7', nome:'Auditoria Interna',                  semanas:  3, pdNess: 16, pdCliente: 10, pct: 10 },
    { fase:'F8', nome:'Suporte à Cert. + DPO',              semanas:  3, pdNess:  7, pdCliente:  6, pct:  5 },
  ],
  4: [
    { fase:'F1', nome:'Diagnóstico Aprofundado',            semanas:  4, pdNess:  24, pdCliente: 14, pct:  8 },
    { fase:'F2', nome:'Fundação Documental',                semanas:  2, pdNess:  12, pdCliente:  7, pct:  4 },
    { fase:'F3', nome:'Gestão de Riscos + IR Assessment',   semanas:  4, pdNess:  36, pdCliente: 22, pct: 12 },
    { fase:'F4', nome:'Implementação de Controles',         semanas: 16, pdNess: 114, pdCliente: 68, pct: 38 },
    { fase:'F5', nome:'Red Team + Pentest Avançado',        semanas:  4, pdNess:  36, pdCliente: 18, pct: 12 },
    { fase:'F6', nome:'Conscientização + Secure Coding',    semanas:  3, pdNess:  24, pdCliente: 14, pct:  8 },
    { fase:'F7', nome:'Auditoria Interna',                  semanas:  4, pdNess:  36, pdCliente: 22, pct: 12 },
    { fase:'F8', nome:'Suporte à Cert. + DPO + Retainer',  semanas:  6, pdNess:  18, pdCliente: 15, pct:  6 },
  ],
};

export const GAPS = [
  {
    field: 'iam',
    trigger: (v?: string) => v === 'Sem IAM centralizado',
    gap: {
      controles: 'A.5.15, A.5.16, A.5.17, A.8.5',
      titulo: 'Ausência de Controle Centralizado de Identidade (IAM)',
      impacto: 'Crítico',
      risco: 'Credential stuffing, acesso indevido pós-desligamento, impossibilidade de auditoria de acessos.',
      acao: 'Implantar SSO + MFA antes do kick-off do ISMS.',
    },
  },
  {
    field: 'ropa',
    trigger: (v?: string) => v === 'Inexistente',
    gap: {
      controles: 'A.1.2.4, A.1.3.5 (ISO 27701)',
      titulo: 'Ausência de RoPA (Registro de Operações)',
      impacto: 'Crítico / Legal',
      risco: 'Tratamento de dados sem registro formal, risco de multa ANPD.',
      acao: 'Implementar RoPA completo com bases legais e finalidades.',
    },
  },
  {
    field: 'dsr_channel',
    trigger: (v?: string) => v === 'Inexistente',
    gap: {
      controles: 'A.8.8, A.1.2.6 (ISO 27701)',
      titulo: 'Ausência de Canal de Direitos dos Titulares',
      impacto: 'Alto',
      risco: 'Impossibilidade de atendimento a solicitações de titulares de dados.',
      acao: 'Implementar canal dedicado para exercício de direitos (LGPD Art. 18).',
    },
  },
  {
    field: 'backup',
    trigger: (v?: string) => v === 'Sem backup' || v === 'Backup manual / ocasional',
    gap: {
      controles: 'A.8.13, A.5.29, A.5.30',
      titulo: 'Backup e Continuidade Deficientes',
      impacto: 'Crítico',
      risco: 'Perda de dados irrecuperável, indisponibilidade prolongada.',
      acao: 'Implementar backup automático com teste de restore periódico.',
    },
  },
  {
    field: 'sdlc',
    trigger: (v?: string) => v === 'Sem processo formal' || v === 'Processo informal / ad-hoc',
    gap: {
      controles: 'A.8.25, A.8.26, A.8.27',
      titulo: 'Ausência de Desenvolvimento Seguro (SSDLC)',
      impacto: 'Alto',
      risco: 'Vulnerabilidades em produção, sem validação de segurança no código.',
      acao: 'Implantar Secure SDLC com code review e SAST/SCA no pipeline.',
    },
  },
];

// FUNÇÕES PURAS
function calcTotalTributos(fm: FinancialModelConfig = DEFAULT_FINANCIAL_MODEL) {
  return Object.values(fm.tributos).reduce((acc, v) => acc + v, 0);
}

export function calcScore(answers: Answers) {
  let score = 0;
  for (const [field, pts] of Object.entries(SCORE_MAP)) {
    const val = answers[field] as string;
    score += pts[val] || 0;
  }
  // ponytail: use existing_policies as proxy for "controls implemented" bonus
  const policies = answers.existing_policies as string;
  if (!policies || policies === 'Nenhuma') score += SCORE_BONUS.controles_sem_nenhum;
  else {
    const count = policies.split('||').filter(Boolean).length;
    if (count <= 2) score += SCORE_BONUS.controles_poucos;
  }
  // vuln bonus: if no pentest or vuln mgmt is weak
  const pentest = answers.pentest as string;
  if (pentest === 'Nunca') score += SCORE_BONUS.vulnerabilidades_ativas;
  return score;
}

export function getScopeInfo(escopoText?: string, headcount?: string | number) {
  // ponytail: parse range values like '101–250', '1000+', '26–50'
  let count: number | null = null;
  if (headcount) {
    const s = String(headcount).replace(/[+,.\s]/g, '');
    // Match patterns like "101–250" (take the upper bound) or "1000"
    const rangeMatch = s.match(/(\d+)[–\-](\d+)/);
    if (rangeMatch) {
      count = parseInt(rangeMatch[2], 10); // use upper bound
    } else {
      const num = parseInt(s, 10);
      if (!isNaN(num) && num > 0) count = num;
    }
  }
  
  for (const s of SCOPE_MULTIPLIERS) {
    if (!count || count <= s.maxPessoas) {
      return { fator: s.fator, label: s.label, count };
    }
  }
  return { fator: 1.0, label: 'Default (< 50)', count: null };
}

export function getTier(score: number): Tier {
  return (
    TIERS.find(t => score >= t.scoreMin && score <= t.scoreMax) ||
    TIERS[TIERS.length - 1]
  );
}

/** 
 * Calcula o esforço real (PDs) baseado na maturidade (Score).
 * Quanto maior o score (mais gaps), mais esforço de entrega.
 */
export function calcAjusteEsforco(score: number, tier: Tier): number {
  const range = tier.scoreMax === Infinity ? 60 : (tier.scoreMax - tier.scoreMin);
  const pos = (score - tier.scoreMin) / (range || 1);
  // Multiplicador entre 0.8x (maduro) e 1.2x (imatura)
  return 0.8 + (pos * 0.4);
}

export function calcEconomics(precoFinal: number, tierNum: number, pdReal: number, fm: FinancialModelConfig = DEFAULT_FINANCIAL_MODEL): Economics {
  const totalTrib      = calcTotalTributos(fm);
  const custoInterno   = fm.custoInternoPD[tierNum] || fm.custoInternoPD[2];
  const custoDireto    = pdReal * custoInterno;
  const overhead       = custoDireto * fm.overheadPct;
  const custoTotal     = custoDireto + overhead;
  const valorTributos  = precoFinal * totalTrib;
  const receitaLiquida = precoFinal - valorTributos;
  const margemOp       = receitaLiquida - custoTotal;
  const margemPct      = precoFinal > 0 ? margemOp / precoFinal : 0;
  return {
    custoDireto,
    overhead,
    custoTotal,
    valorTributos,
    totalTributosPct: totalTrib,
    receitaLiquida,
    margemOp,
    margemPct,
    taxaBlendada: fm.taxaVendaPD[tierNum] || fm.taxaVendaPD[2],
    viavel: margemPct >= fm.margemAlvo,
  };
}

export function calculatePricing(answers: Answers, configOverrides?: Partial<FinancialModelConfig>): PricingResult {
  const fm         = mergeConfig(configOverrides);
  const score      = calcScore(answers);
  const tier       = getTier(score);
  const scopeInfo  = getScopeInfo(answers.scope_type as string, answers.headcount);
  

  // 1. PDs reais (para planejamento de esforço, não para preço)
  const multMaturidade = calcAjusteEsforco(score, tier);
  const pdReal = tier.pdNess * multMaturidade * scopeInfo.fator;
  
  // 2. Preço = precoMercado × escopo × ajuste fino de maturidade (0.9–1.1)
  const ajustePreco = 0.9 + (multMaturidade - 0.8) * 0.5; // maps 0.8-1.2 → 0.9-1.1
  const precoVendaBruto = tier.precoMercado * scopeInfo.fator * ajustePreco;
  const precoFinal = Math.ceil(precoVendaBruto / 1000) * 1000;
  
  const eco = calcEconomics(precoFinal, tier.tier, pdReal, fm);
  const phases = PHASE_BREAKDOWN[tier.tier] || PHASE_BREAKDOWN[2];
  const fases = phases.map(f => ({ 
    ...f, 
    valorFase: Math.round(precoFinal * f.pct / 100),
    pdNess: Math.round(pdReal * f.pct / 100)
  }));

  const gaps = GAPS
    .filter(rule => rule.trigger((answers as any)[rule.field]))
    .map(rule => rule.gap as Gap);

  return {
    score,
    scoreMax: SCORE_MAX,
    tier,
    scopeInfo,
    precoFinal,
    eco,
    fases,
    gaps,
    isTech: !!(answers.stack && answers.stack.length > 0),
    geradoEm: new Date().toISOString()
  };
}
