// PHASE_QUESTIONS — questionário POR FASE da jornada de adequação (41 fases).
//
// Diferente do BLOCK_QUESTIONS (discovery comercial, temático), estas perguntas
// são ESPECIALIZADAS e ancoradas no objetivo/cláusula de cada fase (ver
// PHASE_PLAYBOOKS). O consultor responde ao longo da jornada; as respostas
// alimentam a interpretação coesa (F2, AssessmentAgent) e a adequação de
// controles (F3).
//
// Fonte única no backend; o frontend lê via GET /api/v1/phases/questions.
// `type`: 'text' (aberto) | 'select' (uma opção) | 'multi' (várias).

export type PhaseQuestion = {
  key: string;
  type: 'text' | 'select' | 'multi';
  question: string;
  options?: string[];
};

const S = (key: string, question: string, options: string[]): PhaseQuestion => ({ key, type: 'select', question, options });
const T = (key: string, question: string): PhaseQuestion => ({ key, type: 'text', question });
const M = (key: string, question: string, options: string[]): PhaseQuestion => ({ key, type: 'multi', question, options });

// Cada pergunta traz uma `key` EXPLÍCITA e imutável (não derivada da posição no
// array). Reordenar, inserir ou remover perguntas não desloca as chaves das demais,
// então respostas já persistidas nunca hidratam na pergunta errada. `build` só
// valida a invariante (chave não-vazia e única em todo o banco) — não gera nada.
function build(raw: Record<number, PhaseQuestion[]>): Record<number, PhaseQuestion[]> {
  const vistas = new Set<string>();
  for (const [fase, qs] of Object.entries(raw)) {
    for (const q of qs) {
      if (!q.key) throw new Error(`PHASE_QUESTIONS: pergunta sem key na fase ${fase}`);
      if (vistas.has(q.key)) throw new Error(`PHASE_QUESTIONS: key duplicada "${q.key}"`);
      vistas.add(q.key);
    }
  }
  return raw;
}

export const PHASE_QUESTIONS: Record<number, PhaseQuestion[]> = build({
  // ── Jornada 1: Mobilização e Diagnóstico ──────────────────────────────────
  0: [ // Mobilização e Mandato (5.1)
    S('p0_q1', 'A Carta de Mandato do SGSI foi assinada pela alta direção?', ['Assinada', 'Em elaboração', 'Não iniciada']),
    T('p0_q2', 'Quem é o patrocinador executivo (Executive Sponsor) do programa?'),
    S('p0_q3', 'A equipe de implementação foi formalmente designada?', ['Sim, com papéis', 'Parcial', 'Não']),
    S('p0_q4', 'O kick-off com a direção ocorreu?', ['Sim', 'Agendado', 'Não']),
  ],
  1: [ // Entrevista Executiva (5.2 & 6.2)
    S('p1_q1', 'Apetite de risco declarado pela direção?', ['Baixo', 'Moderado', 'Alto', 'Não definido']),
    T('p1_q2', 'Quais os 3 principais objetivos de negócio que o SGSI deve proteger?'),
    S('p1_q3', 'O comprometimento da direção com o SGSI foi formalizado (ata/mandato)?', ['Sim', 'Parcial', 'Não']),
    S('p1_q4', 'Há orçamento aprovado para o programa?', ['Aprovado', 'Sob demanda', 'Sem orçamento']),
  ],
  2: [ // Entrevistas por Trilha (7.2)
    M('p2_q1', 'Quais trilhas já foram entrevistadas?', ['TI', 'RH', 'Jurídico', 'Operações', 'Produto/Engenharia', 'Financeiro']),
    S('p2_q2', 'Foram coletadas evidências de procedimentos já existentes?', ['Sim, formalizados', 'Informais', 'Não']),
    T('p2_q3', 'Principais lacunas de competência/consciência identificadas nas áreas?'),
  ],
  3: [ // Definição de Escopo (4.3)
    T('p3_q1', 'Descreva o escopo do SGSI (unidades, serviços, localidades).'),
    T('p3_q2', 'Quais exclusões do escopo e sua justificativa técnica?'),
    S('p3_q3', 'O escopo cobre a operação em nuvem / o produto principal?', ['Sim', 'Parcial', 'Não']),
    T('p3_q4', 'Interfaces e dependências com terceiros dentro do perímetro?'),
  ],
  4: [ // Gap Assessment (6.1)
    S('p4_q1', 'Qual a maturidade média atual frente aos 93 controles?', ['Inicial', 'Repetível', 'Definido', 'Gerenciado', 'Otimizado']),
    T('p4_q2', 'Quais "Quick Wins" (baixo custo, alto impacto) foram identificados?'),
    S('p4_q3', 'Percentual aproximado de controles já implementados?', ['< 25%', '25–50%', '50–75%', '> 75%']),
  ],
  5: [ // Governança e Papéis (5.3)
    S('p5_q1', 'O Encarregado/DPO foi nomeado formalmente?', ['Sim', 'Interino', 'Não']),
    S('p5_q2', 'O responsável por Segurança (CISO) foi nomeado?', ['Sim', 'Acumulado', 'Não']),
    S('p5_q3', 'A Matriz RACI de segurança foi criada e publicada?', ['Publicada', 'Rascunho', 'Não']),
  ],
  6: [ // Contexto e Partes Interessadas (4.1 & 4.2)
    S('p6_q1', 'A análise de contexto interno/externo (ex.: SWOT) foi feita?', ['Sim', 'Parcial', 'Não']),
    T('p6_q2', 'Quais requisitos legais/regulatórios aplicáveis (LGPD, ANPD, setoriais)?'),
    T('p6_q3', 'Principais partes interessadas e suas expectativas de segurança/privacidade?'),
  ],

  // ── Jornada 2: Mapeamento e Riscos ────────────────────────────────────────
  7: [ // Inventário de Ativos e Dados (A.5.9)
    S('p7_q1', 'O inventário de ativos de informação está completo?', ['Completo', 'Parcial', 'Não iniciado']),
    S('p7_q2', 'Cada ativo tem um owner (proprietário) atribuído?', ['Todos', 'Alguns', 'Nenhum']),
    S('p7_q3', 'Os dados pessoais foram mapeados (RoPA)?', ['Sim', 'Parcial', 'Não']),
    S('p7_q4', 'Há esquema de classificação da informação em uso?', ['Sim', 'Em definição', 'Não']),
  ],
  8: [ // Mapeamento de Processos
    S('p8_q1', 'Os principais fluxos de dados/processos foram desenhados?', ['Sim', 'Parcial', 'Não']),
    T('p8_q2', 'Pontos críticos de risco identificados nos fluxos?'),
  ],
  9: [ // Riscos de Segurança (6.1.2)
    S('p9_q1', 'Metodologia de avaliação de risco adotada?', ['Qualitativa', 'Quantitativa', 'Mista', 'Não definida']),
    S('p9_q2', 'Critérios de aceitação de risco foram definidos?', ['Sim', 'Em definição', 'Não']),
    T('p9_q3', 'Escala de probabilidade × impacto adotada?'),
    S('p9_q4', 'Os ativos críticos já têm riscos identificados?', ['Sim', 'Parcial', 'Não']),
  ],
  10: [ // Riscos de Privacidade (27701)
    S('p10_q1', 'DPIA/RIPD foi conduzida para os fluxos de alto risco?', ['Sim', 'Parcial', 'Não']),
    T('p10_q2', 'Quais tratamentos de dados foram avaliados como de alto risco aos titulares?'),
  ],
  11: [ // Tratamento de Riscos (6.1.3)
    S('p11_q1', 'A opção de tratamento foi definida para cada risco?', ['Todos', 'Alguns', 'Nenhum']),
    S('p11_q2', 'O Plano de Tratamento de Riscos (RTP) tem cronograma e responsáveis?', ['Sim', 'Parcial', 'Não']),
    T('p11_q3', 'Como o risco residual é registrado e aceito?'),
  ],
  12: [ // SoA do SGSI (6.1.3d)
    S('p12_q1', 'A Declaração de Aplicabilidade (SoA) foi elaborada?', ['Completa', 'Parcial', 'Não']),
    S('p12_q2', 'Toda exclusão de controle tem justificativa aprovada pela direção?', ['Sim', 'Parcial', 'Não']),
  ],
  13: [ // SoA do SGPI (27701)
    S('p13_q1', 'A aplicabilidade dos controles de privacidade (27701) foi mapeada?', ['Sim', 'Parcial', 'Não']),
    T('p13_q2', 'Justificativas de exclusão específicas de privacidade?'),
  ],

  // ── Jornada 3: Implementação SGSI ─────────────────────────────────────────
  14: [ // Arquitetura Documental (7.5)
    S('p14_q1', 'Existe padrão de nomenclatura e versionamento de documentos?', ['Sim', 'Parcial', 'Não']),
    S('p14_q2', 'A Lista Mestra de Documentos está criada e mantida?', ['Sim', 'Rascunho', 'Não']),
  ],
  15: [ // Controles Organizacionais (A.5)
    S('p15_q1', 'As políticas organizacionais de SI foram publicadas?', ['Publicadas', 'Em revisão', 'Não']),
    S('p15_q2', 'Há processo formal de gestão de acessos?', ['Sim', 'Parcial', 'Não']),
    T('p15_q3', 'Como o monitoramento de ativos organizacionais é feito?'),
  ],
  16: [ // Controles de Pessoas (A.6)
    S('p16_q1', 'Background check no onboarding?', ['Sim', 'Para cargos críticos', 'Não']),
    S('p16_q2', 'Termos de confidencialidade (NDA) obrigatórios?', ['Sim', 'Parcial', 'Não']),
    S('p16_q3', 'Processo de desligamento seguro (offboarding)?', ['Sim', 'Parcial', 'Não']),
  ],
  17: [ // Controles Físicos (A.7)
    M('p17_q1', 'Quais controles físicos existem?', ['Perímetro/portaria', 'Controle de visitantes', 'CFTV', 'Descarte de mídia', 'Sala-cofre/DC']),
    T('p17_q2', 'Como é o descarte seguro de mídia física?'),
  ],
  18: [ // Controles Tecnológicos (A.8)
    S('p18_q1', 'Criptografia de dados em trânsito e repouso?', ['Ambos', 'Só trânsito', 'Não']),
    S('p18_q2', 'Antivírus/EDR corporativo implantado?', ['Sim', 'Parcial', 'Não']),
    S('p18_q3', 'Gestão de patches formalizada?', ['Sim', 'Parcial', 'Não']),
    S('p18_q4', 'Centralização de logs para auditoria?', ['Sim', 'Parcial', 'Não']),
  ],
  19: [ // Desenvolvimento Seguro (A.8.25)
    S('p19_q1', 'Há um SDLC seguro documentado?', ['Sim', 'Parcial', 'Não']),
    S('p19_q2', 'Testes de segurança (SAST/DAST/dependências) no pipeline?', ['Sim', 'Alguns', 'Não']),
    S('p19_q3', 'Revisão de código com foco em segurança?', ['Obrigatória', 'Eventual', 'Não']),
  ],
  20: [ // Cloud, DevOps e SRE (A.5.23)
    T('p20_q1', 'Como a responsabilidade compartilhada com o provedor de nuvem é tratada?'),
    S('p20_q2', 'Infraestrutura como código (IaC) com revisão de segurança?', ['Sim', 'Parcial', 'Não']),
    S('p20_q3', 'Gestão de segredos (secrets) centralizada?', ['Sim (cofre)', 'Parcial', 'Não']),
  ],

  // ── Jornada 4: Implementação SGPI (27701) ─────────────────────────────────
  21: [ // Programa de Privacidade (27701)
    S('p21_q1', 'Papel da organização no tratamento?', ['Controlador', 'Operador', 'Ambos']),
    S('p21_q2', 'O programa de privacidade está formalizado?', ['Sim', 'Parcial', 'Não']),
  ],
  22: [ // Privacy by Design
    S('p22_q1', 'Privacy by Design é aplicado em novos projetos/produtos?', ['Sim', 'Às vezes', 'Não']),
    T('p22_q2', 'Como a privacidade entra no ciclo de desenvolvimento?'),
  ],
  23: [ // Direitos dos Titulares
    S('p23_q1', 'Há canal para exercício de direitos dos titulares?', ['Sim', 'Informal', 'Não']),
    S('p23_q2', 'Prazos de atendimento definidos e monitorados?', ['Sim', 'Parcial', 'Não']),
  ],
  24: [ // Consentimento e Bases Legais
    S('p24_q1', 'As bases legais de cada tratamento foram mapeadas?', ['Todas', 'Algumas', 'Não']),
    S('p24_q2', 'O consentimento, quando aplicável, é registrado e revogável?', ['Sim', 'Parcial', 'Não']),
  ],
  25: [ // Retenção e Descarte (A.8.10)
    S('p25_q1', 'Existe política de retenção e descarte de dados?', ['Sim', 'Rascunho', 'Não']),
    T('p25_q2', 'Como o descarte seguro de dados é executado e evidenciado?'),
  ],
  26: [ // Transferências e Compartilhamento
    S('p26_q1', 'Há transferências internacionais de dados?', ['Não', 'Sim, com salvaguardas', 'Sim, sem salvaguardas', 'Não mapeado']),
    T('p26_q2', 'Quais salvaguardas (SCCs/cláusulas) estão em uso?'),
  ],
  27: [ // Fornecedores e Operadores (A.5.19)
    S('p27_q1', 'Fornecedores críticos passam por avaliação de segurança?', ['Sim', 'Alguns', 'Não']),
    S('p27_q2', 'Contratos com cláusulas de proteção de dados (DPA)?', ['Com todos', 'Com principais', 'Sem DPA']),
  ],
  28: [ // Incidentes (A.5.24-28)
    S('p28_q1', 'Existe plano de resposta a incidentes?', ['Sim, testado', 'Sim, não testado', 'Não']),
    S('p28_q2', 'Fluxo de comunicação a titulares/ANPD definido?', ['Sim', 'Parcial', 'Não']),
  ],

  // ── Jornada 5: Operação e Auditoria ───────────────────────────────────────
  29: [ // Treinamento (A.6.3)
    S('p29_q1', 'Programa de conscientização em segurança/privacidade?', ['Sim, recorrente', 'Pontual', 'Não']),
    S('p29_q2', 'Cobertura de treinamento entre colaboradores?', ['> 90%', '50–90%', '< 50%']),
    S('p29_q3', 'Registros de treinamento (evidências) mantidos?', ['Sim', 'Parcial', 'Não']),
  ],
  30: [ // Monitoramento e Métricas (9.1)
    S('p30_q1', 'Indicadores (KPIs/KRIs) de segurança foram definidos?', ['Sim', 'Parcial', 'Não']),
    T('p30_q2', 'Quais métricas são coletadas e com que frequência?'),
  ],
  31: [ // Auditoria Interna (9.2)
    S('p31_q1', 'Existe programa de auditoria interna do SGSI?', ['Sim', 'Rascunho', 'Não']),
    S('p31_q2', 'Os auditores internos são independentes da área auditada?', ['Sim', 'Parcial', 'Não']),
  ],
  32: [ // Não Conformidades (10.1)
    S('p32_q1', 'As não conformidades são registradas e tratadas (CAPA)?', ['Sim', 'Parcial', 'Não']),
    T('p32_q2', 'Como a eficácia das ações corretivas é verificada?'),
  ],
  33: [ // Análise Crítica pela Direção (9.3)
    S('p33_q1', 'A análise crítica pela direção ocorre com regularidade?', ['Sim', 'Uma vez', 'Não']),
    S('p33_q2', 'As decisões e ações são registradas em ata?', ['Sim', 'Parcial', 'Não']),
  ],

  // ── Jornada 6: Certificação ───────────────────────────────────────────────
  34: [ // Readiness Review
    S('p34_q1', 'Uma revisão de prontidão (readiness) foi conduzida?', ['Sim', 'Parcial', 'Não']),
    T('p34_q2', 'Quais gaps residuais impedem a ida ao Stage 1?'),
  ],
  35: [ // Preparação Stage 1
    S('p35_q1', 'A documentação obrigatória está completa e aprovada?', ['Sim', 'Parcial', 'Não']),
    S('p35_q2', 'As evidências estão organizadas e rastreáveis?', ['Sim', 'Parcial', 'Não']),
  ],
  36: [ // Correções Pós-Stage 1
    S('p36_q1', 'Os findings do Stage 1 foram tratados?', ['Todos', 'Alguns', 'Nenhum']),
    T('p36_q2', 'Plano e prazo para as pendências remanescentes?'),
  ],
  37: [ // Gestão de Vulnerabilidades
    S('p37_q1', 'Há processo recorrente de gestão de vulnerabilidades?', ['Sim', 'Parcial', 'Não']),
    S('p37_q2', 'Pentest/scan periódico com correção acompanhada?', ['Sim', 'Eventual', 'Não']),
  ],
  38: [ // Continuidade de Negócios (A.5.30)
    S('p38_q1', 'Existem planos de continuidade/recuperação (BCP/DRP)?', ['Sim, testados', 'Sim, não testados', 'Não']),
    T('p38_q2', 'Quando foi o último teste de restore/continuidade?'),
  ],
  39: [ // Segurança Física
    M('p39_q1', 'Controles físicos de segurança em operação?', ['Acesso controlado', 'Monitoramento', 'Energia/redundância', 'Prevenção a incêndio']),
    T('p39_q2', 'Lacunas físicas conhecidas?'),
  ],
  40: [ // Encerramento do Ciclo
    T('p40_q1', 'Principais lições aprendidas no ciclo?'),
    S('p40_q2', 'Há plano de melhoria contínua para o próximo ciclo?', ['Sim', 'Em elaboração', 'Não']),
  ],
});
