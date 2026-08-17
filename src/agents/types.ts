import { reasoningModel, gatewayModel } from '../config/models';

export interface AgentResponse {
  success: boolean;
  content: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface AgentContext {
  organizationId: string;
  controlId?: string;
  organizationalMemory?: string;
  standardReference?: string;
}

/** De qual caminho veio a resposta do modelo. Vai no metadata para o operador
 *  saber SE o GPT-4.1 respondeu ou se caímos no Llama, e por qual rota. */
export type ModelSource = 'ai-gateway' | 'workers-ai-gateway' | 'workers-ai-direct';

export interface ModelRunResult {
  content: string;
  model: string;
  source: ModelSource;
}

export interface ModelRunOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Account/gateway da Cloudflare usados na chamada ao AI Gateway.
 *  Vêm do ambiente para o produto não ficar preso a uma conta específica;
 *  os defaults preservam o comportamento atual do deploy existente. */
export const CF_ACCOUNT_ID_DEFAULT = '0a6c490dd5fe9051422c15c9e133138e';
export const AI_GATEWAY_ID_DEFAULT = 'n-iso';

export function gatewayConfig(env: any) {
  return {
    accountId: env?.CF_ACCOUNT_ID || CF_ACCOUNT_ID_DEFAULT,
    gatewayId: env?.AI_GATEWAY_ID || AI_GATEWAY_ID_DEFAULT,
  };
}

export abstract class BaseAgent {
  protected ai: any;
  protected db: D1Database;
  protected env: any;

  constructor(ai: any, db: D1Database, env?: any) {
    this.ai = ai;
    this.db = db;
    this.env = env || {};
  }

  abstract run(prompt: string, context: AgentContext): Promise<AgentResponse>;

  // Extrai o texto da resposta do binding aceitando os dois formatos: Workers AI
  // (`{response}`) e modelos de terceiros via Unified Billing, que podem vir no
  // formato OpenAI (`{choices:[{message:{content}}]}`).
  private static extractContent(r: any): string {
    return (r?.response ?? r?.choices?.[0]?.message?.content ?? '').toString();
  }

  /**
   * Rota única de inferência dos agentes (padrão do PhaseInterpretationAgent),
   * TODA pelo AI binding (`env.AI.run`) roteado pelo gateway n-iso — sem secret:
   * o Worker se autentica sozinho e os modelos de terceiros usam Unified Billing.
   *   1. GPT-4.1 (openai/gpt-4.1) via gateway — primário.
   *   2. Workers AI (Llama 70B) via gateway — fallback.
   *   3. Workers AI direto — último recurso, se a opção de gateway não for
   *      suportada no runtime.
   * Acumula o `motivo` de cada caminho que falhou e LANÇA com ele quando nenhum
   * responde — a falha não pode sumir sem rastro. O chamador mapeia `source` →
   * confiança e decide o formato da resposta ao usuário.
   */
  protected async runModel(messages: any[], opts: ModelRunOptions = {}): Promise<ModelRunResult> {
    const temperature = opts.temperature ?? 0.2;
    const maxTokens = opts.maxTokens ?? 2048;
    const { gatewayId } = gatewayConfig(this.env);
    const payload = { messages, temperature, max_tokens: maxTokens };
    let motivo = '';

    // 1. GPT-4.1 via gateway (Unified Billing, sem chave).
    try {
      const response = await this.ai.run(gatewayModel(this.env), payload, { gateway: { id: gatewayId } });
      const content = BaseAgent.extractContent(response);
      if (content.trim()) return { content, model: gatewayModel(this.env), source: 'ai-gateway' };
      motivo = 'ai-gateway: resposta vazia do modelo';
    } catch (error: any) {
      motivo = `ai-gateway: ${error?.message ?? error}`;
    }

    // 2. Workers AI (Llama 70B) via gateway.
    try {
      const response = await this.ai.run(reasoningModel(this.env), payload, { gateway: { id: gatewayId } });
      const content = BaseAgent.extractContent(response);
      if (content.trim()) return { content, model: reasoningModel(this.env), source: 'workers-ai-gateway' };
      motivo = `${motivo} | workers-ai: resposta vazia do modelo`;
    } catch (error: any) {
      motivo = `${motivo} | workers-ai(gateway): ${error?.message ?? error}`;
      // 3. Binding direto, sem roteamento.
      try {
        const response = await this.ai.run(reasoningModel(this.env), payload);
        const content = BaseAgent.extractContent(response);
        if (content.trim()) return { content, model: reasoningModel(this.env), source: 'workers-ai-direct' };
      } catch (e2: any) {
        motivo = `${motivo} | direto: ${e2?.message ?? e2}`;
      }
    }

    throw new Error(motivo || 'sem resposta da IA');
  }
}
