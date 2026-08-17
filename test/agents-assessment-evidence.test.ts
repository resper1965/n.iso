// Unidade dos agentes de IA AssessmentAgent (diagnóstico de conformidade) e
// EvidenceAgent (avaliação de evidência). Desde a unificação da rota de modelo
// (BaseAgent.runModel), TODA a inferência passa pelo AI binding (env.AI.run)
// roteado pelo gateway n-iso — sem secret:
//   1. GPT-4.1 (openai/gpt-4.1) via gateway — Unified Billing;
//   2. Workers AI (Llama) via gateway;
//   3. binding direto (último recurso).
// `ai.run` é um duplo que responde por MODELO, então distinguimos os caminhos
// pelo 1º argumento (o id do modelo). De quebra, inspecionamos as mensagens
// montadas para travar o prompt builder.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AssessmentAgent } from '../src/agents/assessment';
import { EvidenceAgent } from '../src/agents/evidence';
import { DEFAULT_MODELS } from '../src/config/models';
import type { AgentContext } from '../src/agents/types';

const GPT = DEFAULT_MODELS.gateway;      // openai/gpt-4.1
const LLAMA = DEFAULT_MODELS.reasoning;  // @cf/meta/llama-3.3-70b...

// Duplo do binding: despacha por id de modelo. Um id ausente do mapa lança
// (simula modelo indisponível), permitindo exercitar o fallback.
function fakeAiByModel(map: Record<string, string>) {
  return {
    run: vi.fn(async (model: string) => {
      if (model in map) return { response: map[model] };
      throw new Error(`modelo ${model} indisponível`);
    }),
  };
}

const ctx: AgentContext = {
  organizationId: 'org-42',
  standardReference: 'ISO 27001:2022',
  controlId: 'A.5.1',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssessmentAgent', () => {
  it('GPT-4.1 responde no gateway (confiança 0.96) e monta o prompt com o contexto', async () => {
    const ai = fakeAiByModel({ [GPT]: '# Diagnóstico\nCMM 3' });
    const agent = new AssessmentAgent(ai, {} as any, {});
    const res = await agent.run('respostas do auto-diagnóstico', ctx);

    expect(res.success).toBe(true);
    expect(res.content).toContain('CMM 3');
    expect(res.confidence).toBe(0.96);
    expect(res.metadata?.source).toBe('ai-gateway');

    // 1ª chamada: GPT-4.1 roteado pelo gateway n-iso.
    const [model, payload, opts] = ai.run.mock.calls[0];
    expect(model).toBe(GPT);
    expect(opts).toEqual({ gateway: { id: 'n-iso' } });
    const sys = payload.messages[0].content as string;
    const user = payload.messages[1].content as string;
    expect(sys).toContain('org-42');
    expect(sys).toContain('ISO 27001:2022');
    expect(user).toContain('respostas do auto-diagnóstico');
  });

  it('sem GPT-4.1 cai no Llama via gateway (confiança 0.90)', async () => {
    const ai = fakeAiByModel({ [LLAMA]: 'diagnóstico do Llama' });
    const agent = new AssessmentAgent(ai, {} as any, {});
    const res = await agent.run('dados', ctx);

    expect(res.success).toBe(true);
    expect(res.content).toBe('diagnóstico do Llama');
    expect(res.confidence).toBe(0.90);
    expect(res.metadata?.source).toBe('workers-ai-gateway');
    // Tentou GPT-4.1 primeiro, depois o Llama.
    expect(ai.run.mock.calls[0][0]).toBe(GPT);
    expect(ai.run.mock.calls[1][0]).toBe(LLAMA);
  });

  it('sem nenhum modelo disponível retorna success=false com o motivo no conteúdo', async () => {
    const ai = fakeAiByModel({}); // tudo lança
    const agent = new AssessmentAgent(ai, {} as any, {});
    const res = await agent.run('dados', ctx);
    expect(res.success).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.content).toContain('indisponível');
  });
});

describe('EvidenceAgent', () => {
  it('GPT-4.1 no gateway (confiança 0.98) e prompt cita o controle avaliado', async () => {
    const ai = fakeAiByModel({ [GPT]: '# Veredito: PARCIAL' });
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('texto extraído da evidência', ctx);

    expect(res.success).toBe(true);
    expect(res.content).toContain('PARCIAL');
    expect(res.confidence).toBe(0.98);
    expect(res.metadata?.source).toBe('ai-gateway');
    expect(res.metadata?.control).toBe('A.5.1');

    const [model, payload] = ai.run.mock.calls[0];
    expect(model).toBe(GPT);
    const sys = payload.messages[0].content as string;
    const user = payload.messages[1].content as string;
    expect(sys).toContain('A.5.1');
    expect(user).toContain('texto extraído da evidência');
  });

  it('sem GPT-4.1 cai no Llama via gateway (confiança 0.92)', async () => {
    const ai = fakeAiByModel({ [LLAMA]: 'veredito do Llama' });
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('evidência', ctx);
    expect(res.content).toBe('veredito do Llama');
    expect(res.confidence).toBe(0.92);
    expect(res.metadata?.source).toBe('workers-ai-gateway');
  });

  it('aceita resposta no formato OpenAI (choices[].message.content)', async () => {
    // O binding pode devolver terceiros no formato OpenAI; extractContent cobre.
    const ai = { run: vi.fn(async () => ({ choices: [{ message: { content: 'Veredito OpenAI' } }] })) };
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('evidência', ctx);
    expect(res.content).toBe('Veredito OpenAI');
    expect(res.metadata?.source).toBe('ai-gateway');
  });

  it('erro no processamento retorna success=false com o motivo no conteúdo', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('timeout'); }) };
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('evidência', ctx);
    expect(res.success).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.content).toContain('timeout');
  });
});
