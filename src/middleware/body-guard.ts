import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';

/**
 * Guarda genérica de corpo de requisição.
 *
 * Só 14 das 218 escritas tinham schema. Escrever schema para todas é o trabalho
 * certo, mas leva tempo; enquanto isso, três defeitos valem para TODAS as rotas
 * e se resolvem num lugar só:
 *
 * 1. Corpo sem limite — o worker lê o JSON inteiro na memória antes de qualquer
 *    handler. Um POST de 100 MB derruba a requisição por OOM.
 * 2. Poluição de protótipo — `{"__proto__": {...}}` num JSON que depois é
 *    espalhado com `{...body}` contamina Object.prototype do isolate, que é
 *    compartilhado entre requisições no mesmo worker.
 * 3. Corpo que não é objeto — `[1,2,3]` ou `"texto"` passa pelo `c.req.json()`
 *    e só quebra lá na frente, como 500 em vez de 400.
 *
 * ponytail: isto NÃO substitui schema por rota. Não valida campo obrigatório
 * nem tipo — só fecha o que é igual em toda rota. Schemas continuam sendo
 * adicionados por domínio.
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

export const bodyGuard = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const metodo = c.req.method.toUpperCase();
  if (metodo !== 'POST' && metodo !== 'PUT' && metodo !== 'PATCH') return next();

  const tipo = (c.req.header('Content-Type') || '').toLowerCase();
  // multipart é upload; o teto de tamanho de arquivo é validado em validateUpload.
  if (!tipo.includes('application/json')) return next();

  const tamanho = Number(c.req.header('Content-Length') || 0);
  if (tamanho > MAX_JSON_BYTES) {
    return c.json({ error: 'Corpo da requisição excede o limite de 1 MB' }, 413);
  }

  // Hono cacheia o corpo lido, então o handler adiante ainda consegue
  // `c.req.json()` — não estamos consumindo o stream duas vezes.
  const texto = await c.req.text();

  // Corpo vazio com content-type JSON é comum e legítimo: várias rotas de ação
  // (gerar documento, aprovar) não recebem corpo. Deixa passar — quem precisa
  // do campo reclama no schema, não aqui.
  if (!texto.trim()) return next();

  // Sem Content-Length (chunked), o tamanho só se sabe depois de ler.
  if (texto.length > MAX_JSON_BYTES) {
    return c.json({ error: 'Corpo da requisição excede o limite de 1 MB' }, 413);
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return c.json({ error: 'Formato JSON inválido' }, 400);
  }

  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return c.json({ error: 'Corpo da requisição deve ser um objeto JSON' }, 400);
  }

  if (temChavePerigosa(corpo)) {
    return c.json({ error: 'Corpo da requisição contém chave não permitida' }, 400);
  }

  return next();
});
