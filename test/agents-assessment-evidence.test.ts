// Unidade dos agentes de IA que hoje têm 0% de cobertura: AssessmentAgent
// (diagnóstico de conformidade) e EvidenceAgent (avaliação de evidência). Ambos
// seguem o mesmo padrão de fallback: tentam o AI Gateway (GPT-4.1) e, sem token
// ou em falha, caem para Workers AI (Llama). Testamos os três caminhos —
// gateway OK, fallback e erro — sem tocar rede real: `ai.run` é um duplo e o
// `fetch` global é stubado. De quebra, inspecionamos as mensagens montadas para
// travar o prompt builder (interpolação de contexto e do texto do usuário).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AssessmentAgent } from '../src/agents/assessment';
import { EvidenceAgent } from '../src/agents/evidence';
import type { AgentContext } from '../src/agents/types';

function fakeAi(response: string) {
  return { run: vi.fn(async () => ({ response })) };
}

const ctx: AgentContext = {
  organizationId: 'org-42',
  standardReference: 'ISO 27001:2022',
  controlId: 'A.5.1',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AssessmentAgent', () => {
  it('sem AI_GATEWAY_TOKEN cai no fallback Workers AI e monta o prompt com o contexto', async () => {
    const ai = fakeAi('# Diagnóstico\nCMM 3');
    const agent = new AssessmentAgent(ai, {} as any, {}); // env sem token
    const res = await agent.run('respostas do auto-diagnóstico', ctx);

    expect(res.success).toBe(true);
    expect(res.content).toContain('CMM 3');
    expect(res.confidence).toBe(0.9);
    expect(res.metadata?.source).toBe('workers-ai-fallback');

    // O prompt de sistema recebeu o contexto; o do usuário, os dados.
    const [, payload] = ai.run.mock.calls[0];
    const sys = payload.messages[0].content as string;
    const user = payload.messages[1].content as string;
    expect(sys).toContain('org-42');
    expect(sys).toContain('ISO 27001:2022');
    expect(user).toContain('respostas do auto-diagnóstico');
  });

  it('com token e gateway OK usa a resposta do AI Gateway (confiança 0.96)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { response: 'Resposta do Gateway' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const ai = fakeAi('nunca chamado');
    const agent = new AssessmentAgent(ai, {} as any, { AI_GATEWAY_TOKEN: 'tok' });
    const res = await agent.run('dados', ctx);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(res.success).toBe(true);
    expect(res.content).toBe('Resposta do Gateway');
    expect(res.confidence).toBe(0.96);
    expect(res.metadata?.source).toBe('ai-gateway');
    // Gateway respondeu → Workers AI não foi tocado.
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('gateway com status não-ok cai para o fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const ai = fakeAi('fallback content');
    const agent = new AssessmentAgent(ai, {} as any, { AI_GATEWAY_TOKEN: 'tok' });
    const res = await agent.run('dados', ctx);
    expect(res.metadata?.source).toBe('workers-ai-fallback');
    expect(res.content).toBe('fallback content');
    expect(ai.run).toHaveBeenCalledOnce();
  });

  it('erro do Workers AI retorna success=false com confiança 0', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('modelo indisponível'); }) };
    const agent = new AssessmentAgent(ai, {} as any, {});
    const res = await agent.run('dados', ctx);
    expect(res.success).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.content).toContain('modelo indisponível');
  });
});

describe('EvidenceAgent', () => {
  it('fallback Workers AI e prompt cita o controle avaliado', async () => {
    const ai = fakeAi('# Veredito: PARCIAL');
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('texto extraído da evidência', ctx);

    expect(res.success).toBe(true);
    expect(res.content).toContain('PARCIAL');
    expect(res.confidence).toBe(0.92);
    expect(res.metadata?.source).toBe('workers-ai-fallback');
    expect(res.metadata?.control).toBe('A.5.1');

    const [, payload] = ai.run.mock.calls[0];
    const sys = payload.messages[0].content as string;
    const user = payload.messages[1].content as string;
    expect(sys).toContain('A.5.1');
    expect(user).toContain('texto extraído da evidência');
  });

  it('gateway OK usa a resposta do AI Gateway (confiança 0.98)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Veredito via Gateway' } }] }),
    })));
    const ai = fakeAi('nunca');
    const agent = new EvidenceAgent(ai, {} as any, { AI_GATEWAY_TOKEN: 'tok' });
    const res = await agent.run('evidência', ctx);
    expect(res.content).toBe('Veredito via Gateway');
    expect(res.confidence).toBe(0.98);
    expect(res.metadata?.source).toBe('ai-gateway');
  });

  it('gateway que responde vazio cai para o fallback', async () => {
    // result.response e choices ausentes → content vazio → callGateway devolve null.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const ai = fakeAi('fallback');
    const agent = new EvidenceAgent(ai, {} as any, { AI_GATEWAY_TOKEN: 'tok' });
    const res = await agent.run('evidência', ctx);
    expect(res.metadata?.source).toBe('workers-ai-fallback');
    expect(res.content).toBe('fallback');
  });

  it('erro no processamento retorna success=false', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('timeout'); }) };
    const agent = new EvidenceAgent(ai, {} as any, {});
    const res = await agent.run('evidência', ctx);
    expect(res.success).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.content).toContain('timeout');
  });
});
