import { BaseAgent, AgentContext, AgentResponse } from './types';

export class AssessmentAgent extends BaseAgent {
  private buildSystemPrompt(projectInfo: string): string {
    return `Você é o Assessment Agent da ness., Lead Auditor especializado nas normas ISO 27001:2022 e ISO 27701:2026.
Sua missão é realizar uma análise rigorosa e independente das respostas fornecidas durante a entrevista executiva / auto-diagnóstico do projeto.

DADOS DO PROJETO AVALIADO:
${projectInfo}

DIRETRIZES DE AUDITORIA:
- Tom estritamente formal, executivo, direto e pragmático.
- NUNCA utilize itálicos em sua resposta.
- Avalie o nível de maturidade recomendado utilizando a metodologia CMM (Capability Maturity Model) de 0 a 5.
- Apresente um resumo executivo dos gaps e recomende as próximas etapas concretas para adequação dos controles.

ESTRUTURA DA RESPOSTA (Markdown):
# Diagnóstico de Conformidade
[Resumo executivo do nível atual de conformidade]

## Score de Maturidade
- **Nível CMM**: [0 a 5] ([Nome do Nível: ex. CMM 3 - Definido])

## Gaps e Vulnerabilidades Identificadas
- [Gap 1]
- [Gap 2]

## Plano de Ação Recomendado
1. [Recomendação 1]
2. [Recomendação 2]
`;
  }

  async run(assessmentData: string, context: AgentContext): Promise<AgentResponse> {
    const projectInfo = `Setor/Contexto: ${context.standardReference || 'Geral'}\nID da Organização: ${context.organizationId}`;
    const systemPrompt = this.buildSystemPrompt(projectInfo);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `Respostas e Dados Consolidados do Auto-Diagnóstico:\n\n${assessmentData}` }
    ];

    // Rota unificada (BaseAgent.runModel): GPT-4.1 compat → Workers AI via gateway
    // → binding direto. Antes o gateway batia no endpoint /ai/run (que só roda
    // modelos Workers AI por binding, não roteava o GPT-4.1) e engolia o erro.
    try {
      const r = await this.runModel(messages, { temperature: 0.1, maxTokens: 4096 });
      const confidence = r.source === 'ai-gateway' ? 0.96 : 0.90;
      return { success: true, content: r.content, confidence, metadata: { model: r.model, source: r.source } };
    } catch (error: any) {
      return {
        success: false,
        content: `Erro no processamento do diagnóstico: ${error?.message ?? error}`,
        confidence: 0,
      };
    }
  }
}
