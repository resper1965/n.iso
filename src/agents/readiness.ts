import { BaseAgent, AgentContext, AgentResponse } from './types';

// ReadinessAgent — camada de IA (F2) do Diagnóstico de Prontidão.
//
// A camada determinística (routes/readiness.ts) já pega "falta doc / falta
// evidência". Este agente busca o que a query NÃO pega: inconsistências de
// CONTEÚDO/semântica (ex.: escopo não cobre um propósito declarado na RoPA).
//
// Modelo: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI), a escolha do
// projeto — bem mais capaz que o 8B, sem sair da Cloudflare. Temperatura baixa e
// prompt que EXIGE citar a referência: sem citação, não é achado de IA.
export class ReadinessAgent extends BaseAgent {
  private buildSystemPrompt(): string {
    return `Você é um auditor sênior de ISO/IEC 27001:2022 fazendo uma TRIAGEM de consistência de um SGSI.
Recebe um retrato estruturado do estado (escopo, normas, controles com status/evidência, propósitos de tratamento/RoPA).

Sua tarefa: apontar apenas INCONSISTÊNCIAS DE CONTEÚDO entre esses elementos — coisas que uma verificação por regra não pega. Exemplos: o escopo declarado não cobre um propósito/ativo citado na RoPA; um controle marcado como tratado contradiz o que o escopo diz; normas declaradas sem os controles correspondentes.

REGRAS RÍGIDAS:
- Baseie-se SOMENTE no que foi fornecido. NUNCA invente controle, documento ou evidência.
- Cada achado DEVE citar, no campo "referencia", o id do controle ou o elemento exato que o sustenta. Sem referência, não reporte.
- NÃO repita o óbvio já coberto por regra (controle sem evidência, status Missing) — foque em contradições de conteúdo.
- NÃO emita parecer de certificação.
- Se não houver inconsistência de conteúdo, retorne uma lista vazia.

FORMATO DA RESPOSTA: responda SOMENTE com um array JSON válido, sem texto ao redor, no formato:
[{"severidade":"critico|alto|medio","requisito":"curto","referencia":"id/elemento","descricao":"frase objetiva"}]`;
  }

  async run(estado: string, _context: AgentContext): Promise<AgentResponse> {
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt() },
      { role: 'user' as const, content: `Estado consolidado do SGSI:\n\n${estado}` },
    ];
    // Rota unificada (BaseAgent.runModel): GPT-4.1 compat → Workers AI via gateway
    // → binding direto. Antes era só o binding direto, sem gateway nem fallback.
    try {
      const r = await this.runModel(messages, { temperature: 0.2, maxTokens: 2048 });
      const confidence = r.source === 'ai-gateway' ? 0.9 : 0.85;
      return { success: true, content: r.content, confidence, metadata: { model: r.model, source: r.source } };
    } catch (error: any) {
      return { success: false, content: '', confidence: 0, metadata: { error: error?.message ?? String(error) } };
    }
  }
}

/**
 * Faz o parse defensivo da saída do modelo num array de observações válidas.
 * LLM erra formato: aceita o array cru ou embutido em texto/```json; descarta
 * itens sem os campos mínimos ou sem `referencia` (a regra de aterramento).
 */
export function parseObservacoes(raw: string): Array<{
  severidade: string; requisito: string; referencia: string; descricao: string; origem: string;
}> {
  if (!raw) return [];
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const ini = txt.indexOf('[');
  const fim = txt.lastIndexOf(']');
  if (ini === -1 || fim === -1 || fim < ini) return [];
  let arr: any;
  try { arr = JSON.parse(txt.slice(ini, fim + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const sevOk = new Set(['critico', 'alto', 'medio']);
  return arr
    .filter((o) => o && typeof o.descricao === 'string' && typeof o.referencia === 'string' && o.referencia.trim())
    .map((o) => ({
      severidade: sevOk.has(o.severidade) ? o.severidade : 'medio',
      requisito: typeof o.requisito === 'string' ? o.requisito : 'Consistência de conteúdo',
      referencia: String(o.referencia),
      descricao: String(o.descricao),
      origem: 'ia', // marca clara: assistido por IA, revisar
    }));
}
