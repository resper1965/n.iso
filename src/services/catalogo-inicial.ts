import type { ServicoEntrada } from '../schemas';
import { PHASE_BREAKDOWN, TIERS } from './pricing';

// Texto das fases da prévia aprovada da proposta (spec, seção 3), por posição em PHASE_BREAKDOWN[2].
// nome, pct e semanas vêm do motor; aqui só o que o motor não tem.
const TEXTO_FASES = [
  { objetivo: 'Fechar o escopo do sistema de gestão e entender o contexto da organização.',
    atividades: 'Entrevistas com as áreas, levantamento de processos, sistemas e fornecedores, análise de partes interessadas e de requisitos legais.',
    entregaveis: 'Contexto da organização (4.1), partes interessadas (4.2), declaração de escopo (4.3), plano do projeto.',
    criterioAceite: 'Escopo aprovado formalmente pela direção.' },
  { objetivo: 'Estabelecer a liderança e a estrutura documental do sistema de gestão.',
    atividades: 'Redação da política de segurança e de privacidade, papéis e responsabilidades, controle de documentos.',
    entregaveis: 'Política (5.2), papéis e responsabilidades (5.3), procedimento de informação documentada (7.5), objetivos (6.2).',
    criterioAceite: 'Política aprovada pela direção e publicada.' },
  { objetivo: 'Identificar, avaliar e tratar os riscos de segurança e privacidade.',
    atividades: 'Inventário de ativos, metodologia de riscos, oficinas de avaliação, plano de tratamento e Declaração de Aplicabilidade.',
    entregaveis: 'Metodologia (6.1.2), registro de riscos, plano de tratamento (6.1.3), SoA com justificativa dos 93 controles.',
    criterioAceite: 'Riscos residuais aceitos pelos donos dos riscos e SoA aprovada.' },
  { objetivo: 'Colocar em operação os controles selecionados na SoA e fechar as lacunas do diagnóstico.',
    atividades: 'Procedimentos operacionais, apoio técnico às áreas, ROPA e DPIA, gestão de fornecedores, coleta de evidências no n.iso.',
    entregaveis: 'Procedimentos por tema do Anexo A, ROPA completo, DPIA das operações de alto risco, evidências por controle.',
    criterioAceite: 'Cada controle aplicável com evidência registrada e revisada.' },
  { objetivo: 'Garantir que as pessoas conhecem as regras e o próprio papel.',
    atividades: 'Plano de conscientização, treinamento geral, treinamento específico para desenvolvimento e atendimento ao titular.',
    entregaveis: 'Plano de conscientização (7.3), registros de competência (7.2) e de participação.',
    criterioAceite: 'Cobertura mínima de 90% das pessoas no escopo.' },
  { objetivo: 'Verificar, de forma independente, se o sistema funciona como descrito.',
    atividades: 'Programa de auditoria, auditoria por auditor que não participou da implementação, tratamento de não conformidades, reunião de análise crítica.',
    entregaveis: 'Relatório de auditoria interna (9.2), plano de ação corretiva (10.2), ata da análise crítica (9.3).',
    criterioAceite: 'Não conformidades maiores tratadas e ata assinada pela direção.' },
  { objetivo: 'Levar a organização às auditorias do organismo certificador com segurança.',
    atividades: 'Pré-auditoria simulada, organização do dossiê de evidências, acompanhamento do Stage 1 e do Stage 2.',
    entregaveis: 'Dossiê de auditoria, respostas aos pontos do Stage 1, plano de tratamento de achados.',
    criterioAceite: 'Conclusão do Stage 2 pelo organismo certificador.' },
];

/** `ativo: false` pede que a semeadura já arquive o serviço. */
export type ServicoInicial = ServicoEntrada & { ativo?: boolean };

export function catalogoInicialNess(): ServicoInicial[] {
  const [t1, t2, t3] = TIERS;
  return [
    {
      nome: 'Implementação ISO 27001 + 27701',
      tipo: 'projeto',
      norma: 'ISO/IEC 27001:2022 + 27701:2025',
      descricao: 'Implementação do sistema de gestão de segurança da informação e privacidade, do diagnóstico à preparação para a certificação.',
      diasPorFaixa: { '1': t1.pdNess, '2': t2.pdNess, '3': t3.pdNess },
      fases: PHASE_BREAKDOWN[2].map((f, i) => ({ nome: f.nome, pct: f.pct, semanas: f.semanas, ...TEXTO_FASES[i] })),
      premissas: [],
      exclusoes: [],
    },
    {
      nome: 'Auditoria interna',
      tipo: 'avulso',
      formaPreco: 'esforco',
      norma: 'ISO/IEC 27001:2022',
      descricao: 'Auditoria interna independente do sistema de gestão, com tratamento das não conformidades.',
      diasPorFaixa: { '1': 6, '2': 11, '3': 16 },
      entregaveis: ['Programa de auditoria', 'Relatório de auditoria interna (9.2)', 'Plano de ação corretiva (10.2)'],
      criterioAceite: 'Relatório emitido e não conformidades maiores com plano de ação aprovado.',
      premissas: [],
      exclusoes: [],
    },
    // ponytail: o schema recusa mensalidade zero, então entra com 1 e arquivado até o comercial definir o valor.
    {
      nome: 'Manutenção do SGSI',
      tipo: 'recorrente',
      mensalidade: 1,
      prazoMinimoMeses: 12,
      descricao: 'Defina a mensalidade antes de ativar.',
      inclusoMes: ['Acompanhamento do sistema de gestão', 'Apoio às evidências e aos indicadores'],
      premissas: [],
      exclusoes: [],
      ativo: false,
    },
  ];
}
