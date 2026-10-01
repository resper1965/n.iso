import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { MAPA_DA_APP, INSTRUCOES } from '../src/mcp/contexto';

const P = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (caminho: string) =>
  worker.fetch(new Request('http://localhost' + caminho), { ...workerEnv(), AGENTE: P } as any);

describe('Resumo das entrevistas e mapa da app', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer, gap_detected) VALUES ('i-1','p-a','governanca','Q1','R1',1), ('i-2','p-a','governanca','Q2','R2',0)`),
    ]);
  });

  // `/interviews/:track` era declarada antes e capturava "summary" como trilha.
  it('GET /interviews/summary devolve o resumo por trilha', async () => {
    const r = await comoAgente('/api/v1/projects/p-a/interviews/summary');
    const corpo = await r.json<any>();
    expect(corpo.summary).toEqual([{ track: 'governanca', total: 2, gaps: 1 }]);
  });

  it('o mapa cobre as áreas do consultor e não a comercial', () => {
    for (const area of ['interviews', 'phase-answers', 'journey-dossier', 'versions', '/content', 'ropa', 'dpia', 'assets', 'vendors', 'training', 'audits', 'capa', 'stakeholders', 'management-reviews', 'certification', 'scope-changes', 'data-subject']) {
      expect(MAPA_DA_APP, area).toContain(area);
    }
    expect(MAPA_DA_APP).not.toMatch(/leads|proposals|assessments/);
  });

  it('o mapa diz COMO editar governança, partes interessadas e checklist', () => {
    expect(MAPA_DA_APP).toContain('POST com id no corpo EDITA o membro');
    expect(MAPA_DA_APP).toContain('PUT /api/v1/stakeholders/{id}');
    expect(MAPA_DA_APP).toContain('PUT grava o progresso por item');
  });

  it('instruções refletem a paridade e cabem no limite', () => {
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
    expect(INSTRUCOES).toContain('confirmado_pelo_usuario');
    expect(INSTRUCOES).not.toContain('Não apaga registros');
  });
});
