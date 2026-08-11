import { BaseAgent, AgentContext, AgentResponse } from './types';
import { reasoningModel } from '../config/models';

// ControlAdequacaoAgent — sugere adequações de controle a partir das respostas de
// uma fase (F3, adequação com aprovação).
//
// A IA APENAS PROPÕE. Nada é escrito no controle sem aprovação humana explícita
// (endpoint /apply, um a um). Guarda-rail duro: a sugestão NUNCA afirma
// conformidade com evidência — o status sugerido fica restrito a estados que não
// declaram implementação comprovada. "Implemented"/"Compliant" exigem evidência e
// são decisão humana com lastro (constituição), fora deste caminho.
//
// Regra de aterramento: cada sugestão cita o control_id (que precisa existir no
// projeto) e a pergunta_key que a motivou. Sem os dois, é descartada.

// Estados que NÃO afirmam conformidade comprovada — o único domínio que a IA pode
// sugerir. Espelhado no parser e no endpoint /apply (defesa em profundidade).
export const STATUS_SEGUROS = ['Missing', 'Planned', 'In Progress', 'Partial', 'Not Applicable'] as const;

export class ControlAdequacaoAgent extends BaseAgent {
  private buildSystemPrompt(titulo: string, clausula: string): string {
    const ancora = clausula ? `${titulo} (cláusula/controle ${clausula})` : titulo;
    return `Você é um Lead Auditor sênior de ISO/IEC 27001:2022 e 27701 sugerindo a adequação de controles a partir das respostas de UMA fase da jornada.

FASE: ${ancora}

Você recebe as perguntas+respostas da fase e a lista de controles do projeto (id, título, status atual, maturidade atual). Sugira, para os controles que as respostas tocam, um novo status e/ou maturidade que reflita melhor o que a resposta revela.

REGRAS RÍGIDAS:
- APENAS PROPONHA. Um humano vai revisar e aprovar cada sugestão.
- Só sugira "control_id" que exista na lista fornecida. NUNCA invente controle.
- Cada sugestão DEVE citar a "pergunta_key" que a motivou. Sem ela, não sugira.
- O "sugestao_status" só pode ser um destes: ${STATUS_SEGUROS.join(', ')}. NUNCA sugira "Implemented" nem "Compliant" — conformidade comprovada exige evidência e é decisão humana, não sua.
- "sugestao_maturidade" é um inteiro CMM de 0 a 5, ou omita.
- Sugira apenas onde a resposta dá base objetiva. Não force sugestão para todo controle.
- NUNCA emita parecer de certificação.

FORMATO: responda SOMENTE com um array JSON válido, sem texto ao redor:
[{"control_id":"A.5.1","sugestao_status":"In Progress","sugestao_maturidade":2,"pergunta_key":"pX_qN","justificativa":"o que a resposta revela e por que muda o controle"}]`;
  }

  async run(estado: string, context: AgentContext & { titulo?: string; clausula?: string }): Promise<AgentResponse> {
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt(context.titulo ?? 'Fase', context.clausula ?? '') },
      { role: 'user' as const, content: estado },
    ];
    try {
      const response = await this.ai.run(reasoningModel(this.env), {
        messages,
        temperature: 0.2,
        max_tokens: 2048,
      });
      const content = (response?.response ?? '').toString();
      return { success: true, content, confidence: 0.8, metadata: { model: 'llama-3.3-70b-instruct-fp8-fast', source: 'workers-ai' } };
    } catch (error: any) {
      return { success: false, content: '', confidence: 0, metadata: { error: error?.message } };
    }
  }
}

export interface Sugestao {
  control_id: string;
  sugestao_status: string | null;
  sugestao_maturidade: number | null;
  pergunta_key: string;
  justificativa: string;
}

/**
 * Parse defensivo + aterramento. Descarta sugestão que:
 * - não cita um control_id presente no projeto (controlesValidos);
 * - não cita uma pergunta_key da fase (chavesValidas);
 * - não traz status seguro NEM maturidade válida (nada a aplicar);
 * - traz status fora de STATUS_SEGUROS (bloqueia "Implemented"/"Compliant").
 */
export function parseSugestoes(
  raw: string,
  controlesValidos: Set<string>,
  chavesValidas: Set<string>,
): Sugestao[] {
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

  const segurosOk = new Set<string>(STATUS_SEGUROS);
  const out: Sugestao[] = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    if (typeof o.control_id !== 'string' || !controlesValidos.has(o.control_id)) continue;
    if (typeof o.pergunta_key !== 'string' || !chavesValidas.has(o.pergunta_key)) continue;
    if (typeof o.justificativa !== 'string' || !o.justificativa.trim()) continue;

    const status = typeof o.sugestao_status === 'string' && segurosOk.has(o.sugestao_status) ? o.sugestao_status : null;
    const mat = Number.isInteger(o.sugestao_maturidade) && o.sugestao_maturidade >= 0 && o.sugestao_maturidade <= 5
      ? o.sugestao_maturidade : null;
    if (status === null && mat === null) continue; // nada aplicável

    out.push({
      control_id: o.control_id,
      sugestao_status: status,
      sugestao_maturidade: mat,
      pergunta_key: o.pergunta_key,
      justificativa: String(o.justificativa),
    });
  }
  return out;
}
