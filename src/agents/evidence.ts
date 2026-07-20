import { BaseAgent, AgentContext, AgentResponse } from './types';

export class EvidenceAgent extends BaseAgent {
  private buildSystemPrompt(controlId?: string, standardReference?: string): string {
    return `Você é o Evidence Agent da ness., especialista em auditoria de conformidade (ISO 27001 e ISO 27701).
Sua tarefa é avaliar com rigor "Enterprise Grade" se a evidência fornecida atende aos requisitos do controle ${controlId}.

REGRAS CRÍTICAS:
- Tom formal, direto e pragmático.
- NUNCA utilize itálicos em sua resposta.
- Use Markdown para estruturar o feedback.

CRITÉRIOS DE AUDITORIA:
1. **Verificabilidade**: A evidência possui carimbo de tempo, vigência legível e autoria clara?
2. **Evidência Operacional vs Design**: Você deve diferenciar estritamente entre "Evidência de Design" (modelos, políticas teóricas, templates vazios ou arquivos estáticos de configuração como infraestrutura como código/Terraform) e "Evidência de Operação" (logs reais de execução, prints de auditoria datados de painéis ativos, relatórios de execução real, atas de reuniões assinadas ou aprovações formais). O arquivo deve provar que o controle de fato OPERA no dia a dia com registros operacionais concretos. Caso o envio seja meramente uma declaração de design sem prova de operação histórica/transacional, o veredito deve ser PARCIAL ou NÃO CONFORME.
3. **Conformidade Normativa**: O conteúdo cobre todos os pontos exigidos pelo controle ${controlId}?

ESTRUTURA DA RESPOSTA:
# Veredito: [CONFORME | PARCIAL | NÃO CONFORME]
- **Score de Confiança**: [0-100]
- **Feedback Executivo**: [Análise técnica sucinta]
- **Gaps Identificados**: [Lista de pontos de melhoria, se houver]
`;
  }

  // ponytail: GPT-4.1 via AI Gateway
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

  // ponytail: Llama 3.3 70B via Workers AI
  private async callWorkersAI(messages: any[]): Promise<{ content: string; model: string }> {
    const response = await this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      temperature: 0.1,
      max_tokens: 4096,
    });
    return { content: response.response, model: 'llama-3.3-70b-instruct-fp8-fast' };
  }

  async run(extractedText: string, context: AgentContext): Promise<AgentResponse> {
    const { controlId, standardReference } = context;
    const systemPrompt = this.buildSystemPrompt(controlId, standardReference);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `Texto extraído da evidência:\n\n${extractedText}` }
    ];

    try {
      // 1. Try GPT-4.1
      const gateway = await this.callGateway(messages);
      if (gateway) {
        return {
          success: true,
          content: gateway.content,
          confidence: 0.98,
          metadata: { model: gateway.model, control: controlId, source: 'ai-gateway' }
        };
      }

      // 2. Fallback: Llama 3.3 70B
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
        content: `Erro ao avaliar evidência: ${error.message}`,
        confidence: 0
      };
    }
  }
}
