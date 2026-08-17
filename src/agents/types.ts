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

  // AI Gateway via REST API (api.cloudflare.com/.../ai/v1/chat/completions),
  // endpoint OpenAI-compatível. Autentica com um Cloudflare API token
  // (AI_GATEWAY_TOKEN, com permissão AI Gateway Run) e cobra os modelos de
  // terceiros — GPT-4.1 (openai/gpt-4.1) — pela Unified Billing da Cloudflare,
  // sem chave da OpenAI no ambiente. O header cf-aig-gateway-id roteia a chamada
  // pelo gateway `n-iso` (logs, cache, rate limit). Só roda quando há
  // AI_GATEWAY_TOKEN; sem ele, retorna null e o chamador usa o binding do
  // Workers AI. Lança em erro HTTP para o motivo aparecer no log/UI em vez de
  // sumir.
  private async callRestGateway(
    messages: any[],
    temperature: number,
    maxTokens: number,
  ): Promise<{ content: string; model: string } | null> {
    const token = this.env?.AI_GATEWAY_TOKEN;
    if (!token) return null;
    const { accountId, gatewayId } = gatewayConfig(this.env);
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'cf-aig-gateway-id': gatewayId,
      },
      body: JSON.stringify({ model: gatewayModel(this.env), messages, max_tokens: maxTokens, temperature }),
    });
    if (!res.ok) throw new Error(`gateway REST HTTP ${res.status}`);
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content || data?.result?.response || '';
    return content ? { content: String(content), model: gatewayModel(this.env) } : null;
  }

  /**
   * Rota única de inferência dos agentes (padrão do PhaseInterpretationAgent):
   *   1. AI Gateway REST (GPT-4.1 via Unified Billing) — primário quando há
   *      AI_GATEWAY_TOKEN (Cloudflare API token).
   *   2. Workers AI (Llama 70B) roteado PELO gateway n-iso — analytics + cache,
   *      sem secret novo.
   *   3. Binding direto do Workers AI — último recurso, se a opção de gateway não
   *      for suportada no runtime.
   * Acumula o `motivo` de cada caminho que falhou e LANÇA com ele quando nenhum
   * responde — a falha não pode sumir sem rastro (era zerada em catch, deixando
   * "IA indisponível" sem explicação). O chamador mapeia `source` → confiança e
   * decide o formato da resposta ao usuário.
   */
  protected async runModel(messages: any[], opts: ModelRunOptions = {}): Promise<ModelRunResult> {
    const temperature = opts.temperature ?? 0.2;
    const maxTokens = opts.maxTokens ?? 2048;
    const { gatewayId } = gatewayConfig(this.env);
    let motivo = '';

    // 1. AI Gateway REST (GPT-4.1 via Unified Billing).
    try {
      const gw = await this.callRestGateway(messages, temperature, maxTokens);
      if (gw) return { content: gw.content, model: gw.model, source: 'ai-gateway' };
    } catch (error: any) {
      motivo = `gateway: ${error?.message ?? error}`;
    }

    // 2. Workers AI roteado pelo gateway n-iso.
    try {
      const response = await this.ai.run(
        reasoningModel(this.env),
        { messages, temperature, max_tokens: maxTokens },
        { gateway: { id: gatewayId } },
      );
      const content = (response?.response ?? '').toString();
      if (content.trim()) return { content, model: reasoningModel(this.env), source: 'workers-ai-gateway' };
      motivo = motivo || 'workers-ai: resposta vazia do modelo';
    } catch (error: any) {
      motivo = `${motivo ? motivo + ' | ' : ''}workers-ai(gateway): ${error?.message ?? error}`;
      // 3. Binding direto, sem roteamento.
      try {
        const response = await this.ai.run(reasoningModel(this.env), { messages, temperature, max_tokens: maxTokens });
        const content = (response?.response ?? '').toString();
        if (content.trim()) return { content, model: reasoningModel(this.env), source: 'workers-ai-direct' };
      } catch (e2: any) {
        motivo = `${motivo} | direto: ${e2?.message ?? e2}`;
      }
    }

    throw new Error(motivo || 'sem resposta da IA');
  }
}
