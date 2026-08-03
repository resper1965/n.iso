/**
 * Observabilidade.
 *
 * O repositório inteiro tinha 9 `console.error` e nenhuma telemetria. Na
 * prática isso significa descobrir um erro quando o cliente liga — e num
 * produto de conformidade o cliente liga depois de o auditor perguntar.
 *
 * ponytail: sem dependência nova e sem conta em serviço externo. Duas coisas
 * que a plataforma já dá de graça:
 *
 *  1. Log estruturado em JSON. `wrangler tail` e o painel da Cloudflare filtram
 *     por campo; texto solto não é filtrável, e log que não dá para filtrar não
 *     é usado quando o incidente está acontecendo.
 *  2. Analytics Engine, SE o binding existir. Opcional de propósito: sem o
 *     binding configurado o código segue funcionando, então o deploy não
 *     depende de um passo manual que alguém pode esquecer.
 */

export type Severidade = 'debug' | 'info' | 'warn' | 'error';

export type EventoLog = {
  msg: string;
  request_id?: string;
  rota?: string;
  metodo?: string;
  status?: number;
  duracao_ms?: number;
  ator?: string;
  projeto?: string;
  erro?: string;
  [k: string]: unknown;
};

/**
 * Emite uma linha JSON. Nunca inclui corpo de requisição nem valor de campo —
 * este produto trata PII sob LGPD, e log é o lugar mais fácil de vazar dado
 * pessoal sem perceber.
 */
export function log(nivel: Severidade, evento: EventoLog): void {
  const linha = JSON.stringify({ nivel, ts: new Date().toISOString(), ...evento });
  if (nivel === 'error') console.error(linha);
  else if (nivel === 'warn') console.warn(linha);
  else console.log(linha);
}

/** Identificador de requisição. Usa o ray da Cloudflare quando existe. */
export function requestId(c: any): string {
  return c.req.header('CF-Ray') || crypto.randomUUID();
}

/**
 * Registra uma métrica no Analytics Engine, se o binding existir.
 * Sem binding, não faz nada — e não quebra.
 */
export function metrica(env: any, indices: string[], blobs: string[], numeros: number[]): void {
  const ae = env?.ANALYTICS;
  if (!ae?.writeDataPoint) return;
  try {
    ae.writeDataPoint({ indexes: indices, blobs, doubles: numeros });
  } catch {
    // Telemetria nunca pode derrubar a requisição que ela observa.
  }
}

/**
 * Extrai da exceção só o que ajuda a diagnosticar: mensagem e a primeira linha
 * do stack. Stack inteiro em log estruturado vira ruído e às vezes carrega
 * valor de variável.
 */
export function resumoErro(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const primeira = (e.stack || '').split('\n')[1]?.trim() ?? '';
  return primeira ? `${e.message} | ${primeira}` : e.message;
}
