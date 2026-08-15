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

  async run(prompt: string, context: AgentContext): Promise<AgentResponse> {
    const { controlId, organizationalMemory, standardReference } = context;
    const systemPrompt = this.buildSystemPrompt(controlId, organizationalMemory, standardReference);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt || `Gere uma política completa para o controle ${controlId}. Inclua todas as 10 seções obrigatórias.` }
    ];

    // Rota unificada (BaseAgent.runModel): GPT-4.1 compat → Workers AI via gateway
    // → binding direto. Antes o gateway batia no endpoint /ai/run (que não roteava
    // o GPT-4.1) e engolia o erro sem rastro.
    try {
      const r = await this.runModel(messages, { temperature: 0.3, maxTokens: 4096 });
      const confidence = r.source === 'ai-gateway-compat' ? 0.98 : 0.92;
      return { success: true, content: r.content, confidence, metadata: { model: r.model, control: controlId, source: r.source } };
    } catch (error: any) {
      return {
        success: false,
        content: `Erro ao gerar política: ${error?.message ?? error}`,
        confidence: 0,
      };
    }
  }
}
