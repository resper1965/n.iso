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

  async run(extractedText: string, context: AgentContext): Promise<AgentResponse> {
    const { controlId, standardReference } = context;
    const systemPrompt = this.buildSystemPrompt(controlId, standardReference);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `Texto extraído da evidência:\n\n${extractedText}` }
    ];

    // Rota unificada (BaseAgent.runModel): GPT-4.1 compat → Workers AI via gateway
    // → binding direto. Antes o gateway batia no endpoint /ai/run (que não roteava
    // o GPT-4.1) e engolia o erro sem rastro.
    try {
      const r = await this.runModel(messages, { temperature: 0.1, maxTokens: 4096 });
      const confidence = r.source === 'ai-gateway' ? 0.98 : 0.92;
      return { success: true, content: r.content, confidence, metadata: { model: r.model, control: controlId, source: r.source } };
    } catch (error: any) {
      return {
        success: false,
        content: `Erro ao avaliar evidência: ${error?.message ?? error}`,
        confidence: 0,
      };
    }
  }
}
