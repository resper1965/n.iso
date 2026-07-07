export class MemoryService {
  private ai: any;
  private vectorize: VectorizeIndex;

  constructor(ai: any, vectorize: VectorizeIndex) {
    this.ai = ai;
    this.vectorize = vectorize;
  }

  async storeFact(organizationId: string, fact: string, type: 'policy' | 'evidence' | 'standard' = 'policy', metadata: any = {}) {
    // 1. Gerar Embedding do fato
    const embeddingResponse = await this.ai.run('@cf/baai/bge-small-en-v1.5', {
      text: [fact],
    });
    const values = embeddingResponse.data[0];

    // 2. Salvar no Vectorize
    const id = `${organizationId}_${type}_${Date.now()}`;
    await this.vectorize.upsert([{
      id,
      values,
      metadata: { 
        ...metadata,
        organizationId, 
        fact, 
        type 
      }
    }]);

    return id;
  }

  async retrieveContext(organizationId: string, query: string, type?: string, topK: number = 5): Promise<string> {
    const embeddingResponse = await this.ai.run('@cf/baai/bge-small-en-v1.5', {
      text: [query],
    });
    const values = embeddingResponse.data[0];

    const filter: any = { organizationId };
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

