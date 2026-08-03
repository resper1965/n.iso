import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';

/**
 * Guarda genérica de corpo de requisição.
 *
 * Três defeitos valem para TODAS as rotas e se resolvem num lugar só:
 *
 * 1. Corpo sem limite — o worker lê o JSON inteiro na memória antes de qualquer
 *    handler. Um POST grande derruba a requisição por OOM.
 * 2. Poluição de protótipo — `{"__proto__": {...}}` num JSON depois espalhado
 *    com `{...body}` contamina Object.prototype do isolate, que é compartilhado
 *    entre requisições no mesmo worker.
 * 3. Corpo que não é objeto — `[1,2,3]` passa pelo `c.req.json()` e só quebra
 *    lá na frente, como 500 em vez de 400.
 *
 * ponytail: isto NÃO substitui schema por rota. Não valida campo obrigatório
 * nem tipo — só fecha o que é igual em toda rota.
 */

/** 1 MB. Nenhum payload JSON legítimo do produto chega perto; upload é multipart. */
export const MAX_JSON_BYTES = 1024 * 1024;

const CHAVES_PROIBIDAS = ['__proto__', 'constructor', 'prototype'];

/** True se o objeto (em qualquer profundidade) tem chave de poluição de protótipo. */
function temChavePerigosa(valor: unknown, profundidade = 0): boolean {
  if (profundidade > 20 || valor === null || typeof valor !== 'object') return false;
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_PROIBIDAS.includes(k)) return true;
    if (temChavePerigosa(v, profundidade + 1)) return true;
  }
  return false;
}

/**
 * Lê o corpo com teto, cancelando o stream assim que o limite é ultrapassado.
 *
 * `c.req.text()` bufferizaria o corpo INTEIRO antes de qualquer verificação de
 * tamanho. Numa requisição chunked (sem Content-Length) isso significa que o
 * teto não protegia nada: a memória já teria sido consumida quando a checagem
 * rodasse. Aqui o stream morre no primeiro byte além do limite.
 *
 * Devolve `null` quando estourou.
 */
async function lerComTeto(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of partes) { buf.set(p, off); off += p.byteLength; }
  return new TextDecoder().decode(buf);
}

export const bodyGuard = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const metodo = c.req.method.toUpperCase();
  if (metodo !== 'POST' && metodo !== 'PUT' && metodo !== 'PATCH') return next();

  const tipo = (c.req.header('Content-Type') || '').toLowerCase();

  // Upload multipart é o ÚNICO caso isento: o corpo é binário e o teto por
  // arquivo é validado em `validateUpload`.
  //
  // A isenção é por lista fechada, e não por confiar no Content-Type
  // declarado. `c.req.json()` dos handlers analisa o corpo independentemente do
  // cabeçalho — então um cliente que mandasse JSON como `text/plain`, ou sem
  // Content-Type nenhum, escaparia de todas as verificações abaixo se a guarda
  // só agisse quando o cabeçalho dissesse `application/json`.
  if (tipo.includes('multipart/form-data')) return next();

  // Content-Length serve para recusar cedo, mas não dá para confiar nele:
  // chunked não tem, e cliente hostil mente. O teto real é o do stream.
  const declarado = Number(c.req.header('Content-Length') || 0);
  if (declarado > MAX_JSON_BYTES) {
    return c.json({ error: 'Corpo da requisição excede o limite de 1 MB' }, 413);
  }

  // Lê de um clone: o corpo original continua disponível para o handler.
  const texto = await lerComTeto(c.req.raw.clone(), MAX_JSON_BYTES);
  if (texto === null) {
    return c.json({ error: 'Corpo da requisição excede o limite de 1 MB' }, 413);
  }

  // Corpo vazio é comum e legítimo: várias rotas de ação (gerar documento,
  // aprovar) não recebem payload. Deixa passar — quem precisa do campo reclama
  // no schema, não aqui.
  if (!texto.trim()) return next();

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    // Não é JSON. Pode ser formulário codificado ou texto que o handler nem lê;
    // recusar aqui quebraria rota legítima. Se o handler tentar `c.req.json()`,
    // ele mesmo devolve 400.
    return next();
  }

  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return c.json({ error: 'Corpo da requisição deve ser um objeto JSON' }, 400);
  }

  if (temChavePerigosa(corpo)) {
    return c.json({ error: 'Corpo da requisição contém chave não permitida' }, 400);
  }

  return next();
});
