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

  private async callGateway(messages: any[]): Promise<{ content: string; model: string } | null> {
    const token = this.env?.AI_GATEWAY_TOKEN;
    if (!token) return null;
    try {
      const res = await fetch('https://api.cloudflare.com/client/v4/accounts/0a6c490dd5fe9051422c15c9e133138e/ai/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'cf-aig-gateway-id': 'n-iso',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1',
          input: { messages, max_tokens: 4096 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      const content = data?.result?.response || data?.choices?.[0]?.message?.content || '';
      return content ? { content, model: 'openai/gpt-4.1' } : null;
    } catch { return null; }
  }

  private async callWorkersAI(messages: any[]): Promise<{ content: string; model: string }> {
    const response = await this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      temperature: 0.1,
      max_tokens: 4096,
    });
    return { content: response.response, model: 'llama-3.3-70b-instruct-fp8-fast' };
  }

  async run(assessmentData: string, context: AgentContext): Promise<AgentResponse> {
    const projectInfo = `Setor/Contexto: ${context.standardReference || 'Geral'}\nID da Organização: ${context.organizationId}`;
    const systemPrompt = this.buildSystemPrompt(projectInfo);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `Respostas e Dados Consolidados do Auto-Diagnóstico:\n\n${assessmentData}` }
    ];

    try {
      // 1. Try GPT-4.1 via AI Gateway
      const gateway = await this.callGateway(messages);
      if (gateway) {
        return {
          success: true,
          content: gateway.content,
          confidence: 0.96,
          metadata: { model: gateway.model, source: 'ai-gateway' }
        };
      }

      // 2. Fallback to Workers AI
      const fallback = await this.callWorkersAI(messages);
      return {
        success: true,
        content: fallback.content,
        confidence: 0.90,
        metadata: { model: fallback.model, source: 'workers-ai-fallback' }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Erro no processamento do diagnóstico: ${error.message}`,
        confidence: 0
      };
    }
  }
}
