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
}
