// Unidade dos serviços de RAG que estavam em 0%: embeddings.embed,
// MemoryService e KnowledgeService. Todos recebem `ai`/`vectorize`/`env` por
// injeção, então os dublamos e verificamos o comportamento real: geração de
// embedding, upsert com os metadados certos, montagem do contexto recuperado,
// e a ingestão (classificação por IA + INSERT no D1 + vetorização best-effort).
//
// O D1 é o real do pool (schema.sql aplicado): o INSERT em project_knowledge
// precisa casar com o schema de verdade. AI e Vectorize continuam dublados —
// o pool não tem esses bindings.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { env as poolEnv } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { embed, EMBEDDING_MODEL } from '../src/services/embeddings';
import { MemoryService } from '../src/services/memory';
import { KnowledgeService } from '../src/services/knowledge-service';

describe('embed', () => {
  it('chama o modelo de embedding e devolve o primeiro vetor', async () => {
    const ai = { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) };
    const vec = await embed(ai as any, 'texto');
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(ai.run).toHaveBeenCalledWith(EMBEDDING_MODEL, { text: ['texto'] });
  });

  it('lança quando a resposta não traz vetor', async () => {
    const ai = { run: vi.fn(async () => ({ data: [] })) };
    await expect(embed(ai as any, 'x')).rejects.toThrow(/sem vetor/);
  });
});

describe('MemoryService', () => {
  function setup(matches?: any) {
    const ai = { run: vi.fn(async () => ({ data: [[1, 2, 3]] })) };
    const vectorize = {
      upsert: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ matches })),
    };
    return { svc: new MemoryService(ai as any, vectorize as any), ai, vectorize };
  }

  it('storeFact gera embedding e faz upsert com project_id, fact e type', async () => {
    const { svc, vectorize } = setup();
    const id = await svc.storeFact('proj-1', 'a política existe', 'policy', { extra: 'x' });
    expect(vectorize.upsert).toHaveBeenCalledOnce();
    // upsert([{...}]) → calls[0][0] é o array; [0] pega o registro.
    const record = vectorize.upsert.mock.calls[0][0][0];
    expect(record.values).toEqual([1, 2, 3]);
    expect(record.metadata).toMatchObject({ project_id: 'proj-1', fact: 'a política existe', type: 'policy', extra: 'x' });
    // ID único carrega o projeto e o tipo como prefixo.
    expect(id).toContain('proj-1_policy_');
    expect(record.id).toBe(id);
  });

  it('retrieveContext monta a string dos matches com o filtro por projeto/tipo', async () => {
    const { svc, vectorize } = setup([
      { metadata: { type: 'policy', fact: 'fato A' } },
      { metadata: { fact: 'fato B' } },
    ]);
    const ctx = await svc.retrieveContext('proj-1', 'consulta', 'policy', 3);
    expect(ctx).toContain('[Contexto policy]: fato A');
    expect(ctx).toContain('[Contexto Geral]: fato B'); // sem type → "Geral"
    expect(ctx).toContain('---'); // junção entre matches
    const [, opts] = vectorize.query.mock.calls[0];
    expect(opts).toMatchObject({ topK: 3, filter: { project_id: 'proj-1', type: 'policy' } });
  });

  it('retrieveContext devolve string vazia quando não há matches', async () => {
    const { svc } = setup([]);
    expect(await svc.retrieveContext('proj-1', 'consulta')).toBe('');
  });
});

describe('KnowledgeService', () => {
  beforeAll(async () => {
    await applySchema();
    // project_knowledge.project_id tem FK para projects.
    await poolEnv.DB.batch(['proj-1', 'proj-2', 'proj-3'].map((id) =>
      poolEnv.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(id, `Cliente ${id}`, 'ISO 27001', 'controller', 'Active')));
  });

  const linha = (id: string) =>
    poolEnv.DB.prepare('SELECT project_id, title, type, content, metadata FROM project_knowledge WHERE id = ?').bind(id).first<any>();

  function fakeEnv(aiResponse: string) {
    const runCalls: any[] = [];
    const env = {
      AI: {
        run: vi.fn(async (model: string, payload: any) => {
          runCalls.push({ model, payload });
          // A primeira chamada é a classificação (chat); as demais são embeddings.
          if (payload.messages) return { response: aiResponse };
          return { data: [[0.5, 0.6]] };
        }),
      },
      DB: poolEnv.DB,
      VECTOR_INDEX: { upsert: vi.fn(async () => ({})), query: vi.fn(async () => ({ matches: [] })) },
    };
    return { env, runCalls };
  }

  it('ingest classifica com IA, grava no D1 e vetoriza', async () => {
    const { env } = fakeEnv('Aqui vai: {"type":"policy","summary":"resumo","entities":["TI"],"controls":["A.5.1"]}');
    const svc = new KnowledgeService(env as any);
    const entry = await svc.ingest('proj-1', 'Política de Acesso', 'conteúdo do documento');

    expect(entry.project_id).toBe('proj-1');
    expect(entry.title).toBe('Política de Acesso');
    expect(entry.type).toBe('policy'); // extraído do JSON da IA
    expect(entry.metadata).toMatchObject({ type: 'policy', summary: 'resumo' });
    // A linha gravada no D1 real tem os campos nas colunas certas.
    const gravada = await linha(entry.id);
    expect(gravada).toMatchObject({
      project_id: 'proj-1', title: 'Política de Acesso', type: 'policy', content: 'conteúdo do documento',
    });
    expect(JSON.parse(gravada.metadata)).toMatchObject({ type: 'policy', summary: 'resumo' });
    // Vetorização best-effort ocorreu.
    expect(env.VECTOR_INDEX.upsert).toHaveBeenCalledOnce();
  });

  it('ingest tolera IA sem JSON válido, caindo para type "other"', async () => {
    const { env } = fakeEnv('resposta sem json nenhum');
    const svc = new KnowledgeService(env as any);
    const entry = await svc.ingest('proj-2', 'Doc', 'conteúdo');
    expect(entry.type).toBe('other');
    expect((await linha(entry.id))?.type).toBe('other');
  });

  it('search consulta o índice filtrando por projeto e devolve os matches', async () => {
    const { env } = fakeEnv('{}');
    env.VECTOR_INDEX.query = vi.fn(async () => ({ matches: [{ id: 'm1' }] }));
    const svc = new KnowledgeService(env as any);
    const matches = await svc.search('proj-3', 'consulta', 7);
    expect(matches).toEqual([{ id: 'm1' }]);
    const [, opts] = env.VECTOR_INDEX.query.mock.calls[0];
    expect(opts).toMatchObject({ topK: 7, filter: { project_id: 'proj-3' }, returnMetadata: true });
  });
});
