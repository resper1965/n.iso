import { Bindings } from '../index';

export type KnowledgeType = 'interview' | 'procedure' | 'policy' | 'evidence' | 'other';

export interface KnowledgeEntry {
  id: string;
  project_id: string;
  title: string;
  type: KnowledgeType;
  content: string;
  metadata: any;
  created_at: string;
}

export class KnowledgeService {
  constructor(private env: Bindings) {}

  async ingest(projectId: string, title: string, content: string): Promise<KnowledgeEntry> {
    // 1. Analyze with AI
    const analysisPrompt = `Analise o seguinte documento de conformidade GRC e classifique-o.
Documento:
${content.substring(0, 4000)}

Responda APENAS um JSON no formato:
{
  "type": "interview" | "procedure" | "policy" | "evidence" | "other",
  "summary": "resumo sucinto",
  "entities": ["responsáveis", "sistemas citados"],
  "controls": ["controles ISO relacionados"]
}`;

    const aiResponse = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: analysisPrompt }]
    }) as any;
    
    let metadata = { type: 'other', summary: '', entities: [], controls: [] };
    try {
      const jsonMatch = aiResponse.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) metadata = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse AI metadata', e);
    }

    const id = crypto.randomUUID();
    const type = metadata.type as KnowledgeType || 'other';

    // 2. Store in D1
    await this.env.DB.prepare(
      'INSERT INTO project_knowledge (id, project_id, title, type, content, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, projectId, title, type, content, JSON.stringify(metadata)).run();

    // 3. Vectorize (pode ser async no futuro, aqui fazemos sync para simplicidade)
    try {
      const embedding = await this.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [content.substring(0, 1000)] });
      await this.env.VECTOR_INDEX.upsert([{
        id: `knowledge_${id}`,
        values: embedding.data[0],
        metadata: { project_id: projectId, type: type, title: title, knowledge_id: id }
      }]);
    } catch (e) {
      console.error('Vectorization failed', e);
    }

    return {
      id,
      project_id: projectId,
      title,
      type,
      content,
      metadata,
      created_at: new Date().toISOString()
    };
  }

  async search(projectId: string, query: string, limit = 5) {
    const embedding = await this.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [query] });
    const matches = await this.env.VECTOR_INDEX.query(embedding.data[0], {
      filter: { project_id: projectId },
      topK: limit,
      returnMetadata: true
    });
    return matches.matches;
  }
}
