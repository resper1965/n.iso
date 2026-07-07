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
