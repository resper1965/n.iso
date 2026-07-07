import { BaseAgent, AgentContext, AgentResponse } from './types';

export class PolicyAgent extends BaseAgent {
  private buildSystemPrompt(controlId?: string, organizationalMemory?: string, standardReference?: string): string {
    return `Você é o Policy Agent da ness., um especialista sênior em GRC e ISO 27001:2022.
Seu objetivo é escrever políticas de segurança da informação completas, profissionais e prontas para auditoria.

ESTRUTURA OBRIGATÓRIA DA POLÍTICA:
1. Objetivo — por que esta política existe
2. Escopo — a quem e a que se aplica
3. Referências Normativas — cláusulas ISO 27001:2022 e controles do Anexo A relacionados
4. Termos e Definições — glossário de termos técnicos usados
5. Papéis e Responsabilidades — RACI simplificado (quem aprova, executa, monitora)
6. Diretrizes — regras concretas e acionáveis (mínimo 8 diretrizes)
7. Procedimentos — passo a passo de implementação
8. Exceções — como solicitar desvios
9. Penalidades e Consequências — não conformidades
10. Controle do Documento — versão, aprovação, próxima revisão

REGRAS DE ESCRITA:
- Use Markdown com headers ##, ###, listas e tabelas.
- Mínimo 2000 palavras. Seja detalhado e específico.
- Cada diretriz deve ter: descrição, justificativa e exemplo prático.
- Referencie o controle ISO: ${controlId}.
- Use linguagem formal mas clara. Evite jargão desnecessário.
- Inclua uma tabela de controle do documento no final.

MEMÓRIA ORGANIZACIONAL:
${organizationalMemory || 'Nenhuma memória específica fornecida. Use contexto genérico de empresa de médio porte.'}

REFERÊNCIA NORMATIVA (RAG):
${standardReference || 'Use o conhecimento base da ISO 27001:2022 Anexo A.'}
`;
  }

  // ponytail: GPT-4.1 via AI Gateway (external model)
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
      if (!content) return null;
      return { content, model: 'openai/gpt-4.1' };
    } catch { return null; }
  }

  // ponytail: Llama 3.3 70B via Workers AI (free fallback)
  private async callWorkersAI(messages: any[]): Promise<{ content: string; model: string }> {
    const response = await this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    });
    return { content: response.response, model: 'llama-3.3-70b-instruct-fp8-fast' };
  }

  async run(prompt: string, context: AgentContext): Promise<AgentResponse> {
    const { controlId, organizationalMemory, standardReference } = context;
    const systemPrompt = this.buildSystemPrompt(controlId, organizationalMemory, standardReference);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt || `Gere uma política completa para o controle ${controlId}. Inclua todas as 10 seções obrigatórias.` }
    ];

    try {
      // 1. Try GPT-4.1 via gateway (best quality)
      const gateway = await this.callGateway(messages);
      if (gateway?.content) {
        return {
          success: true,
          content: gateway.content,
          confidence: 0.98,
          metadata: { model: gateway.model, control: controlId, source: 'ai-gateway' }
        };
      }

      // 2. Fallback: Llama 3.3 70B (free)
      const fallback = await this.callWorkersAI(messages);
      return {
        success: true,
        content: fallback.content,
        confidence: 0.92,
        metadata: { model: fallback.model, control: controlId, source: 'workers-ai-fallback' }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Erro ao gerar política: ${error.message}`,
        confidence: 0
      };
    }
  }
}
