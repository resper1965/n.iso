/**
 * Modelo de embedding usado por TODO o RAG (MemoryService e KnowledgeService).
 * Precisa ser o mesmo nos dois: vetores de modelos diferentes não são comparáveis.
 *
 * bge-m3 é multilíngue (100+ idiomas, inclui PT-BR). O anterior
 * (bge-small-en-v1.5) era treinado só em inglês e degradava a recuperação
 * sobre o conteúdo em português do produto.
 *
 * ⚠️ DIMENSÃO DO ÍNDICE: bge-m3 gera vetores de 1024 dimensões (o modelo antigo
 * gerava 384). O índice Vectorize tem dimensão FIXA na criação, então trocar o
 * modelo exige recriar o índice e reingerir o conteúdo:
 *
 *   npx wrangler vectorize create niso-knowledge-v2 --dimensions=1024 --metric=cosine
 *   # aponte "index_name" em wrangler.jsonc para niso-knowledge-v2
 *   # reingira os documentos (Knowledge Base) — políticas são regravadas ao gerar
 *
 * Enquanto o índice não for recriado, as escritas/consultas falham por
 * incompatibilidade de dimensão — por isso a troca é acompanhada do runbook acima.
 */
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';

/** Dimensão dos vetores gerados por EMBEDDING_MODEL (para criar o índice). */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Gera o embedding de um texto e devolve o vetor.
 *
 * O tipo de saída do bge-m3 é uma UNIÃO (consulta | embedding | assíncrono), então
 * o acesso direto a `.data` não compila: só a variante de embedding a possui.
 * Chamando com `{ text }` a resposta é sempre a variante de embedding, e é isso
 * que este helper estreita — em um único lugar, em vez de espalhar `as any`.
 */
export async function embed(ai: Ai, text: string): Promise<number[]> {
  const res = await ai.run(EMBEDDING_MODEL, { text: [text] });
  const data = (res as { data?: number[][] }).data;
  if (!data?.[0]) {
    throw new Error('Falha ao gerar embedding: resposta sem vetor');
  }
  return data[0];
}
