import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * A vetorização (Vectorize / RAG) saiu em 2026-10-06. Este arquivo fixa:
 *   1. gerar política continua funcionando SEM o binding VECTOR_INDEX, e o
 *      contexto do prompt continua vindo do D1 (respostas do assessment);
 *   2. as rotas que só existiam para o conhecimento vetorial respondem 404.
 */
const PROJ = 'proj-sem-vetor';
const prompts: string[] = [];
const aiStub = {
  run: async (_modelo: string, payload: any) => {
    prompts.push(JSON.stringify(payload?.messages ?? payload));
    return { response: '# Política gerada\n\nTexto.' };
  },
};

function testEnv() {
  const e: any = { ...env, AI: aiStub };
  delete e.VECTOR_INDEX;
  return e;
}

async function req(path: string, init: RequestInit, headers: Record<string, string>) {
  return worker.fetch(
    new Request(`http://localhost${path}`, { ...init, headers: { ...headers, 'Content-Type': 'application/json' } }),
    testEnv(),
  );
}

describe('vetorização removida', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO assessments (id, client_name) VALUES ('ass-sv', 'Cliente Sem Vetor')`).run();
    await env.DB.prepare(
      `INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES ('ans-sv', 'ass-sv', 1, 'q_backup', 'Faz backup?', 'Backup diario em nuvem')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, assessment_id) VALUES (?,?,?,?,?,?)`,
    ).bind(PROJ, 'Cliente Sem Vetor', 'ISO 27001', 'controller', 'Active', 'ass-sv').run();
    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ctrl-a51', ?, 'ISO 27001:2022', 'Políticas', 'Texto antigo')`,
    ).bind(PROJ).run();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('user-sv','consultor-sv@ness.dev','x','Consultor','platform_admin')`,
    ).run();
    headers = await sessionFor({ id: 'user-sv', email: 'consultor-sv@ness.dev', role: 'platform_admin' });
  });

  it('o ambiente de teste não tem mais o binding VECTOR_INDEX', () => {
    expect((env as any).VECTOR_INDEX).toBeUndefined();
  });

  it('gera política sem VECTOR_INDEX, com o contexto do assessment (D1) no prompt', async () => {
    prompts.length = 0;
    const res = await req(`/api/v1/projects/${PROJ}/generate-policy`, { method: 'POST', body: JSON.stringify({ control_id: 'A.5.1' }) }, headers);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(prompts.some((p) => p.includes('q_backup: Backup diario em nuvem'))).toBe(true);
    const ctrl = await env.DB.prepare('SELECT description FROM compliance_controls WHERE id = ?').bind('ctrl-a51').first<any>();
    expect(ctrl.description).toContain('Política gerada');
  });

  it('POST /api/v1/mcp/execute e GET /api/v1/mcp não existem mais (404)', async () => {
    const exec = await req('/api/v1/mcp/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'get_project_knowledge', arguments: { project_id: PROJ, query: 'x' } }),
    }, headers);
    expect(exec.status).toBe(404);
    const desc = await req('/api/v1/mcp', { method: 'GET' }, headers);
    expect(desc.status).toBe(404);
  });

  it('as rotas de conhecimento chamadas pela antiga tela respondem 404', async () => {
    const busca = await req(`/api/v1/projects/${PROJ}/knowledge/search?q=*`, { method: 'GET' }, headers);
    expect(busca.status).toBe(404);
    const ingest = await req(`/api/v1/projects/${PROJ}/knowledge/ingest`, { method: 'POST', body: JSON.stringify({ title: 't', content: 'c' }) }, headers);
    expect(ingest.status).toBe(404);
  });
});
