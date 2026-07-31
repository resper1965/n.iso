import { EMBEDDING_MODEL } from './embeddings';

export class MemoryService {
  private ai: any;
  private vectorize: VectorizeIndex;

  constructor(ai: any, vectorize: VectorizeIndex) {
    this.ai = ai;
    this.vectorize = vectorize;
  }

  async storeFact(projectId: string, fact: string, type: 'policy' | 'evidence' | 'standard' | 'client_doc' = 'policy', metadata: any = {}) {
    // 1. Gerar Embedding do fato
    const embeddingResponse = await this.ai.run(EMBEDDING_MODEL, {
      text: [fact],
    });
    const values = embeddingResponse.data[0];

    // 2. Salvar no Vectorize. A chave de metadados é `project_id` — a MESMA usada
    // pelo KnowledgeService — para que ambos compartilhem o mesmo índice e o RAG
    // do PolicyAgent enxergue os documentos ingeridos.
    // ID único e resistente a colisão: dois writes no mesmo ms para o mesmo projeto
    // não devem sobrescrever um ao outro (Date.now() sozinho colidia).
    const id = `${projectId}_${type}_${crypto.randomUUID()}`;
    await this.vectorize.upsert([{
      id,
      values,
      metadata: {
        ...metadata,
        project_id: projectId,
        fact,
        type
      }
    }]);

    return id;
  }

  async retrieveContext(projectId: string, query: string, type?: string, topK: number = 5): Promise<string> {
    const embeddingResponse = await this.ai.run(EMBEDDING_MODEL, {
      text: [query],
    });
    const values = embeddingResponse.data[0];

    const filter: any = { project_id: projectId };
    if (type) filter.type = type;

    const matches = await this.vectorize.query(values, {
      topK,
      filter
    });

    if (!matches.matches || matches.matches.length === 0) return '';

    return matches.matches
      .map(m => `[Contexto ${m.metadata?.type || 'Geral'}]: ${m.metadata?.fact}`)
      .join('\n---\n');
  }
}

