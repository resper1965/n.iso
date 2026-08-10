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

const S = (question: string, options: string[]): PhaseQuestion => ({ key: '', type: 'select', question, options });
const T = (question: string): PhaseQuestion => ({ key: '', type: 'text', question });
const M = (question: string, options: string[]): PhaseQuestion => ({ key: '', type: 'multi', question, options });

// Monta o banco atribuindo `key` estável (p<fase>_q<n>) a cada pergunta.
function build(raw: Record<number, PhaseQuestion[]>): Record<number, PhaseQuestion[]> {
  const out: Record<number, PhaseQuestion[]> = {};
  for (const [fase, qs] of Object.entries(raw)) {
    out[+fase] = qs.map((q, i) => ({ ...q, key: `p${fase}_q${i + 1}` }));
  }
  return out;
}

export const PHASE_QUESTIONS: Record<number, PhaseQuestion[]> = build({
  // ── Jornada 1: Mobilização e Diagnóstico ──────────────────────────────────
  0: [ // Mobilização e Mandato (5.1)
    S('A Carta de Mandato do SGSI foi assinada pela alta direção?', ['Assinada', 'Em elaboração', 'Não iniciada']),
    T('Quem é o patrocinador executivo (Executive Sponsor) do programa?'),
    S('A equipe de implementação foi formalmente designada?', ['Sim, com papéis', 'Parcial', 'Não']),
    S('O kick-off com a direção ocorreu?', ['Sim', 'Agendado', 'Não']),
  ],
  1: [ // Entrevista Executiva (5.2 & 6.2)
    S('Apetite de risco declarado pela direção?', ['Baixo', 'Moderado', 'Alto', 'Não definido']),
    T('Quais os 3 principais objetivos de negócio que o SGSI deve proteger?'),
    S('O comprometimento da direção com o SGSI foi formalizado (ata/mandato)?', ['Sim', 'Parcial', 'Não']),
    S('Há orçamento aprovado para o programa?', ['Aprovado', 'Sob demanda', 'Sem orçamento']),
  ],
  2: [ // Entrevistas por Trilha (7.2)
    M('Quais trilhas já foram entrevistadas?', ['TI', 'RH', 'Jurídico', 'Operações', 'Produto/Engenharia', 'Financeiro']),
    S('Foram coletadas evidências de procedimentos já existentes?', ['Sim, formalizados', 'Informais', 'Não']),
    T('Principais lacunas de competência/consciência identificadas nas áreas?'),
  ],
  3: [ // Definição de Escopo (4.3)
    T('Descreva o escopo do SGSI (unidades, serviços, localidades).'),
    T('Quais exclusões do escopo e sua justificativa técnica?'),
    S('O escopo cobre a operação em nuvem / o produto principal?', ['Sim', 'Parcial', 'Não']),
    T('Interfaces e dependências com terceiros dentro do perímetro?'),
  ],
  4: [ // Gap Assessment (6.1)
    S('Qual a maturidade média atual frente aos 93 controles?', ['Inicial', 'Repetível', 'Definido', 'Gerenciado', 'Otimizado']),
    T('Quais "Quick Wins" (baixo custo, alto impacto) foram identificados?'),
    S('Percentual aproximado de controles já implementados?', ['< 25%', '25–50%', '50–75%', '> 75%']),
  ],
  5: [ // Governança e Papéis (5.3)
    S('O Encarregado/DPO foi nomeado formalmente?', ['Sim', 'Interino', 'Não']),
    S('O responsável por Segurança (CISO) foi nomeado?', ['Sim', 'Acumulado', 'Não']),
    S('A Matriz RACI de segurança foi criada e publicada?', ['Publicada', 'Rascunho', 'Não']),
  ],
  6: [ // Contexto e Partes Interessadas (4.1 & 4.2)
    S('A análise de contexto interno/externo (ex.: SWOT) foi feita?', ['Sim', 'Parcial', 'Não']),
    T('Quais requisitos legais/regulatórios aplicáveis (LGPD, ANPD, setoriais)?'),
    T('Principais partes interessadas e suas expectativas de segurança/privacidade?'),
  ],

  // ── Jornada 2: Mapeamento e Riscos ────────────────────────────────────────
  7: [ // Inventário de Ativos e Dados (A.5.9)
    S('O inventário de ativos de informação está completo?', ['Completo', 'Parcial', 'Não iniciado']),
    S('Cada ativo tem um owner (proprietário) atribuído?', ['Todos', 'Alguns', 'Nenhum']),
    S('Os dados pessoais foram mapeados (RoPA)?', ['Sim', 'Parcial', 'Não']),
    S('Há esquema de classificação da informação em uso?', ['Sim', 'Em definição', 'Não']),
  ],
  8: [ // Mapeamento de Processos
    S('Os principais fluxos de dados/processos foram desenhados?', ['Sim', 'Parcial', 'Não']),
    T('Pontos críticos de risco identificados nos fluxos?'),
  ],
  9: [ // Riscos de Segurança (6.1.2)
    S('Metodologia de avaliação de risco adotada?', ['Qualitativa', 'Quantitativa', 'Mista', 'Não definida']),
    S('Critérios de aceitação de risco foram definidos?', ['Sim', 'Em definição', 'Não']),
    T('Escala de probabilidade × impacto adotada?'),
    S('Os ativos críticos já têm riscos identificados?', ['Sim', 'Parcial', 'Não']),
  ],
  10: [ // Riscos de Privacidade (27701)
    S('DPIA/RIPD foi conduzida para os fluxos de alto risco?', ['Sim', 'Parcial', 'Não']),
    T('Quais tratamentos de dados foram avaliados como de alto risco aos titulares?'),
  ],
  11: [ // Tratamento de Riscos (6.1.3)
    S('A opção de tratamento foi definida para cada risco?', ['Todos', 'Alguns', 'Nenhum']),
    S('O Plano de Tratamento de Riscos (RTP) tem cronograma e responsáveis?', ['Sim', 'Parcial', 'Não']),
    T('Como o risco residual é registrado e aceito?'),
  ],
  12: [ // SoA do SGSI (6.1.3d)
    S('A Declaração de Aplicabilidade (SoA) foi elaborada?', ['Completa', 'Parcial', 'Não']),
    S('Toda exclusão de controle tem justificativa aprovada pela direção?', ['Sim', 'Parcial', 'Não']),
  ],
  13: [ // SoA do SGPI (27701)
    S('A aplicabilidade dos controles de privacidade (27701) foi mapeada?', ['Sim', 'Parcial', 'Não']),
    T('Justificativas de exclusão específicas de privacidade?'),
  ],

  // ── Jornada 3: Implementação SGSI ─────────────────────────────────────────
  14: [ // Arquitetura Documental (7.5)
    S('Existe padrão de nomenclatura e versionamento de documentos?', ['Sim', 'Parcial', 'Não']),
    S('A Lista Mestra de Documentos está criada e mantida?', ['Sim', 'Rascunho', 'Não']),
  ],
  15: [ // Controles Organizacionais (A.5)
    S('As políticas organizacionais de SI foram publicadas?', ['Publicadas', 'Em revisão', 'Não']),
    S('Há processo formal de gestão de acessos?', ['Sim', 'Parcial', 'Não']),
    T('Como o monitoramento de ativos organizacionais é feito?'),
  ],
  16: [ // Controles de Pessoas (A.6)
    S('Background check no onboarding?', ['Sim', 'Para cargos críticos', 'Não']),
    S('Termos de confidencialidade (NDA) obrigatórios?', ['Sim', 'Parcial', 'Não']),
    S('Processo de desligamento seguro (offboarding)?', ['Sim', 'Parcial', 'Não']),
  ],
  17: [ // Controles Físicos (A.7)
    M('Quais controles físicos existem?', ['Perímetro/portaria', 'Controle de visitantes', 'CFTV', 'Descarte de mídia', 'Sala-cofre/DC']),
    T('Como é o descarte seguro de mídia física?'),
  ],
  18: [ // Controles Tecnológicos (A.8)
    S('Criptografia de dados em trânsito e repouso?', ['Ambos', 'Só trânsito', 'Não']),
    S('Antivírus/EDR corporativo implantado?', ['Sim', 'Parcial', 'Não']),
    S('Gestão de patches formalizada?', ['Sim', 'Parcial', 'Não']),
    S('Centralização de logs para auditoria?', ['Sim', 'Parcial', 'Não']),
  ],
  19: [ // Desenvolvimento Seguro (A.8.25)
    S('Há um SDLC seguro documentado?', ['Sim', 'Parcial', 'Não']),
    S('Testes de segurança (SAST/DAST/dependências) no pipeline?', ['Sim', 'Alguns', 'Não']),
    S('Revisão de código com foco em segurança?', ['Obrigatória', 'Eventual', 'Não']),
  ],
  20: [ // Cloud, DevOps e SRE (A.5.23)
    T('Como a responsabilidade compartilhada com o provedor de nuvem é tratada?'),
    S('Infraestrutura como código (IaC) com revisão de segurança?', ['Sim', 'Parcial', 'Não']),
    S('Gestão de segredos (secrets) centralizada?', ['Sim (cofre)', 'Parcial', 'Não']),
  ],

  // ── Jornada 4: Implementação SGPI (27701) ─────────────────────────────────
  21: [ // Programa de Privacidade (27701)
    S('Papel da organização no tratamento?', ['Controlador', 'Operador', 'Ambos']),
    S('O programa de privacidade está formalizado?', ['Sim', 'Parcial', 'Não']),
  ],
  22: [ // Privacy by Design
    S('Privacy by Design é aplicado em novos projetos/produtos?', ['Sim', 'Às vezes', 'Não']),
    T('Como a privacidade entra no ciclo de desenvolvimento?'),
  ],
  23: [ // Direitos dos Titulares
    S('Há canal para exercício de direitos dos titulares?', ['Sim', 'Informal', 'Não']),
    S('Prazos de atendimento definidos e monitorados?', ['Sim', 'Parcial', 'Não']),
  ],
  24: [ // Consentimento e Bases Legais
    S('As bases legais de cada tratamento foram mapeadas?', ['Todas', 'Algumas', 'Não']),
    S('O consentimento, quando aplicável, é registrado e revogável?', ['Sim', 'Parcial', 'Não']),
  ],
  25: [ // Retenção e Descarte (A.8.10)
    S('Existe política de retenção e descarte de dados?', ['Sim', 'Rascunho', 'Não']),
    T('Como o descarte seguro de dados é executado e evidenciado?'),
  ],
  26: [ // Transferências e Compartilhamento
    S('Há transferências internacionais de dados?', ['Não', 'Sim, com salvaguardas', 'Sim, sem salvaguardas', 'Não mapeado']),
    T('Quais salvaguardas (SCCs/cláusulas) estão em uso?'),
  ],
  27: [ // Fornecedores e Operadores (A.5.19)
    S('Fornecedores críticos passam por avaliação de segurança?', ['Sim', 'Alguns', 'Não']),
    S('Contratos com cláusulas de proteção de dados (DPA)?', ['Com todos', 'Com principais', 'Sem DPA']),
  ],
  28: [ // Incidentes (A.5.24-28)
    S('Existe plano de resposta a incidentes?', ['Sim, testado', 'Sim, não testado', 'Não']),
    S('Fluxo de comunicação a titulares/ANPD definido?', ['Sim', 'Parcial', 'Não']),
  ],

  // ── Jornada 5: Operação e Auditoria ───────────────────────────────────────
  29: [ // Treinamento (A.6.3)
    S('Programa de conscientização em segurança/privacidade?', ['Sim, recorrente', 'Pontual', 'Não']),
    S('Cobertura de treinamento entre colaboradores?', ['> 90%', '50–90%', '< 50%']),
    S('Registros de treinamento (evidências) mantidos?', ['Sim', 'Parcial', 'Não']),
  ],
  30: [ // Monitoramento e Métricas (9.1)
    S('Indicadores (KPIs/KRIs) de segurança foram definidos?', ['Sim', 'Parcial', 'Não']),
    T('Quais métricas são coletadas e com que frequência?'),
  ],
  31: [ // Auditoria Interna (9.2)
    S('Existe programa de auditoria interna do SGSI?', ['Sim', 'Rascunho', 'Não']),
    S('Os auditores internos são independentes da área auditada?', ['Sim', 'Parcial', 'Não']),
  ],
  32: [ // Não Conformidades (10.1)
    S('As não conformidades são registradas e tratadas (CAPA)?', ['Sim', 'Parcial', 'Não']),
    T('Como a eficácia das ações corretivas é verificada?'),
  ],
  33: [ // Análise Crítica pela Direção (9.3)
    S('A análise crítica pela direção ocorre com regularidade?', ['Sim', 'Uma vez', 'Não']),
    S('As decisões e ações são registradas em ata?', ['Sim', 'Parcial', 'Não']),
  ],

  // ── Jornada 6: Certificação ───────────────────────────────────────────────
  34: [ // Readiness Review
    S('Uma revisão de prontidão (readiness) foi conduzida?', ['Sim', 'Parcial', 'Não']),
    T('Quais gaps residuais impedem a ida ao Stage 1?'),
  ],
  35: [ // Preparação Stage 1
    S('A documentação obrigatória está completa e aprovada?', ['Sim', 'Parcial', 'Não']),
    S('As evidências estão organizadas e rastreáveis?', ['Sim', 'Parcial', 'Não']),
  ],
  36: [ // Correções Pós-Stage 1
    S('Os findings do Stage 1 foram tratados?', ['Todos', 'Alguns', 'Nenhum']),
    T('Plano e prazo para as pendências remanescentes?'),
  ],
  37: [ // Gestão de Vulnerabilidades
    S('Há processo recorrente de gestão de vulnerabilidades?', ['Sim', 'Parcial', 'Não']),
    S('Pentest/scan periódico com correção acompanhada?', ['Sim', 'Eventual', 'Não']),
  ],
  38: [ // Continuidade de Negócios (A.5.30)
    S('Existem planos de continuidade/recuperação (BCP/DRP)?', ['Sim, testados', 'Sim, não testados', 'Não']),
    T('Quando foi o último teste de restore/continuidade?'),
  ],
  39: [ // Segurança Física
    M('Controles físicos de segurança em operação?', ['Acesso controlado', 'Monitoramento', 'Energia/redundância', 'Prevenção a incêndio']),
    T('Lacunas físicas conhecidas?'),
  ],
  40: [ // Encerramento do Ciclo
    T('Principais lições aprendidas no ciclo?'),
    S('Há plano de melhoria contínua para o próximo ciclo?', ['Sim', 'Em elaboração', 'Não']),
  ],
});
