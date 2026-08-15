import { BaseAgent, AgentContext, AgentResponse, gatewayConfig } from './types';
import { reasoningModel, gatewayModel } from '../config/models';

// PhaseInterpretationAgent — interpretação COESA das respostas de UMA fase da
// jornada (F2 do questionário por fase).
//
// A F1 coleta e persiste as respostas. A camada determinística (routes) já mede
// cobertura e sinaliza respostas de risco por regra. Este agente faz o que a
// regra não faz: lê o conjunto de perguntas+respostas ANCORADO no objetivo e na
// cláusula da fase e produz um diagnóstico ESPECÍFICO — não um texto genérico.
//
// Regra de aterramento (herdada do padrão ReadinessAgent): todo ponto de atenção
// DEVE citar a `pergunta_key` que o sustenta; sem citação, não é achado. Assim o
// diagnóstico não inventa lacuna que a resposta não mostra.
export class PhaseInterpretationAgent extends BaseAgent {
  private buildSystemPrompt(titulo: string, clausula: string): string {
    const ancora = clausula ? `${titulo} (ISO/IEC 27001/27701 — cláusula/controle ${clausula})` : titulo;
    return `Você é um Lead Auditor sênior de ISO/IEC 27001:2022 e 27701 interpretando as respostas de UMA fase específica da jornada de adequação de um cliente.

FASE EM ANÁLISE: ${ancora}

Você recebe as perguntas dessa fase e as respostas que o consultor registrou. Sua tarefa é produzir um diagnóstico COESO e ESPECÍFICO desta fase — não um texto genérico, não um resumo da norma.

REGRAS RÍGIDAS:
- Interprete SOMENTE as respostas fornecidas. NUNCA invente resposta, evidência, controle ou documento.
- Cada ponto de atenção DEVE citar, em "pergunta_key", a chave exata da pergunta que o motiva. Sem uma pergunta que sustente, não reporte o ponto.
- Ancore cada observação e cada próximo passo no objetivo desta fase e na cláusula/controle citado acima — nada de conselho genérico de segurança.
- Pergunta não respondida é uma lacuna de diagnóstico, não uma conformidade: trate como ponto de atenção quando for material para a fase.
- NUNCA emita parecer de certificação. Você aponta prontidão da fase e recomendações.
- Seja objetivo, tom de auditor, sem itálicos.

PRONTIDÃO DA FASE (campo "prontidao"):
- "em_dia": respostas indicam a fase substancialmente endereçada, sem lacuna material.
- "atencao": há lacunas ou respostas fracas que precisam de ação antes de avançar.
- "critico": respostas revelam ausência de fundamento essencial da fase (ex.: sem mandato, sem escopo, sem metodologia de risco).

FORMATO DA RESPOSTA: responda SOMENTE com um objeto JSON válido, sem texto ao redor, no formato:
{"prontidao":"em_dia|atencao|critico","resumo":"2-4 frases sobre o estado desta fase","pontos":[{"severidade":"critico|alto|medio","pergunta_key":"pX_qN","observacao":"o que a resposta revela e por quê importa nesta cláusula"}],"proximos_passos":["ação concreta ancorada na fase"]}`;
  }

  // AI Gateway compat (OpenAI /chat/completions) na URL REAL que o projeto configura
  // em AI_GATEWAY_URL — não um endpoint hardcoded. Roteia o modelo de gateway
  // (GPT-4.1 por padrão) pelo gateway `n-iso`. Só roda quando há AI_GATEWAY_TOKEN;
  // sem token, retorna null e o chamador usa o binding do Workers AI. Lança em erro
  // HTTP para o motivo aparecer no log/UI em vez de sumir.
  private async callCompatGateway(messages: any[]): Promise<{ content: string; model: string } | null> {
    const base = this.env?.AI_GATEWAY_URL;
    const token = this.env?.AI_GATEWAY_TOKEN;
    if (!base || !token) return null;
    const res = await fetch(`${String(base).replace(/\/$/, '')}/compat/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: gatewayModel(this.env), messages, max_tokens: 2048, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`gateway compat HTTP ${res.status}`);
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content || data?.result?.response || '';
    return content ? { content: String(content), model: gatewayModel(this.env) } : null;
  }

  async run(estado: string, context: AgentContext & { titulo?: string; clausula?: string }): Promise<AgentResponse> {
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt(context.titulo ?? 'Fase', context.clausula ?? '') },
      { role: 'user' as const, content: `Perguntas e respostas registradas nesta fase:\n\n${estado}` },
    ];
    const { gatewayId } = gatewayConfig(this.env);

    // Registra o motivo de cada caminho que não deu certo — a falha não pode mais
    // sumir sem rastro (era zerada em dois catch, deixando "IA indisponível" sem
    // explicação para o operador nem para o log).
    let motivo = '';

    // 1. AI Gateway compat (GPT-4.1) — primário quando há AI_GATEWAY_TOKEN.
    try {
      const gw = await this.callCompatGateway(messages);
      if (gw) {
        return { success: true, content: gw.content, confidence: 0.9, metadata: { model: gw.model, source: 'ai-gateway-compat' } };
      }
    } catch (error: any) {
      motivo = `gateway: ${error?.message ?? error}`;
    }

    // 2. Workers AI (Llama 3.3 70B) roteado PELO gateway n-iso (analytics + cache),
    //    sem secret novo — é o "usar o AI Gateway" que faltava.
    try {
      const response = await this.ai.run(
        reasoningModel(this.env),
        { messages, temperature: 0.2, max_tokens: 2048 },
        { gateway: { id: gatewayId } },
      );
      const content = (response?.response ?? '').toString();
      if (content.trim()) {
        return { success: true, content, confidence: 0.82, metadata: { model: reasoningModel(this.env), source: 'workers-ai-gateway' } };
      }
      motivo = motivo || 'workers-ai: resposta vazia do modelo';
    } catch (error: any) {
      motivo = `${motivo ? motivo + ' | ' : ''}workers-ai(gateway): ${error?.message ?? error}`;
      // 3. Último recurso: binding direto, sem roteamento — se a opção de gateway
      //    não for suportada no runtime, ainda entregamos o diagnóstico.
      try {
        const response = await this.ai.run(reasoningModel(this.env), { messages, temperature: 0.2, max_tokens: 2048 });
        const content = (response?.response ?? '').toString();
        if (content.trim()) {
          return { success: true, content, confidence: 0.8, metadata: { model: reasoningModel(this.env), source: 'workers-ai-direct' } };
        }
      } catch (e2: any) {
        motivo = `${motivo} | direto: ${e2?.message ?? e2}`;
      }
    }

    return { success: false, content: '', confidence: 0, metadata: { error: motivo || 'sem resposta da IA' } };
  }
}

export interface Interpretacao {
  prontidao: 'em_dia' | 'atencao' | 'critico';
  resumo: string;
  pontos: Array<{ severidade: 'critico' | 'alto' | 'medio'; pergunta_key: string; observacao: string }>;
  proximos_passos: string[];
}

/**
 * Parse defensivo da saída do modelo. LLM erra formato: aceita o objeto cru ou
 * embutido em ```json/texto. Descarta pontos que não citam uma `pergunta_key`
 * válida da fase (aterramento) — o chamador passa o conjunto de chaves aceitas.
 * Retorna null se não der para extrair um objeto mínimo (o chamador então cai
 * para o determinístico puro).
 */
export function parseInterpretacao(raw: string, chavesValidas: Set<string>): Interpretacao | null {
  if (!raw) return null;
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const ini = txt.indexOf('{');
  const fim = txt.lastIndexOf('}');
  if (ini === -1 || fim === -1 || fim < ini) return null;
  let obj: any;
  try { obj = JSON.parse(txt.slice(ini, fim + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;

  const prontOk = new Set(['em_dia', 'atencao', 'critico']);
  const sevOk = new Set(['critico', 'alto', 'medio']);
  const pontos = Array.isArray(obj.pontos) ? obj.pontos : [];
  return {
    prontidao: prontOk.has(obj.prontidao) ? obj.prontidao : 'atencao',
    resumo: typeof obj.resumo === 'string' ? obj.resumo : '',
    pontos: pontos
      .filter((p: any) => p && typeof p.observacao === 'string' && typeof p.pergunta_key === 'string' && chavesValidas.has(p.pergunta_key))
      .map((p: any) => ({
        severidade: sevOk.has(p.severidade) ? p.severidade : 'medio',
        pergunta_key: String(p.pergunta_key),
        observacao: String(p.observacao),
      })),
    proximos_passos: Array.isArray(obj.proximos_passos)
      ? obj.proximos_passos.filter((s: any) => typeof s === 'string' && s.trim()).map((s: any) => String(s))
      : [],
  };
}
