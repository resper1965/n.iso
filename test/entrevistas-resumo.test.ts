import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { INTERVIEW_TRACKS } from '../src/constants';
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

  // O INSERT gravava `notes` e `updated_at`, colunas que project_interviews não tem: 500 sempre.
  it('POST /interviews grava as respostas', async () => {
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-a/interviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [{ track: 'pessoas', question: 'Q3', answer: 'R3', gap_detected: 1 }] }),
    }), { ...workerEnv(), AGENTE: P } as any);
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await env.DB.prepare(`SELECT answer, gap_detected FROM project_interviews WHERE track = 'pessoas'`).first<any>();
    expect([l.answer, Number(l.gap_detected)]).toEqual(['R3', 1]);
  });

  // A tela de entrevistas lê `questions`; a rota só devolvia `interviews`, e a tela mostrava
  // "Sem perguntas" para sempre.
  it('GET /interviews/:track devolve as perguntas da trilha com a resposta já salva', async () => {
    await env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected) VALUES ('i-x','p-a','executiva',?, 'R-x','Ana',1)`)
      .bind(INTERVIEW_TRACKS.executiva[0].question).run();
    const r = await comoAgente('/api/v1/projects/p-a/interviews/executiva');
    const corpo = await r.json<any>();
    expect(corpo.questions).toHaveLength(INTERVIEW_TRACKS.executiva.length);
    expect(corpo.questions[0]).toMatchObject({ key: 'exec_vision', answer: 'R-x', interviewee: 'Ana', gap_detected: 1 });
    expect(corpo.questions[1].answer).toBeUndefined();
    expect(Array.isArray(corpo.interviews)).toBe(true);
  });

  it('o mapa cobre as áreas do consultor e não a comercial', () => {
    for (const area of ['interviews', 'phase-answers', 'journey-dossier', 'versions', '/content', 'ropa', 'dpia', 'assets', 'vendors', 'training', 'audits', 'capa', 'stakeholders', 'management-reviews', 'certification', 'scope-changes', 'data-subject']) {
      expect(MAPA_DA_APP, area).toContain(area);
    }
    expect(MAPA_DA_APP).not.toMatch(/leads|proposals|assessments/);
  });

  it('todo caminho do mapa da app existe como rota (o agente não é mandado a um 404)', async () => {
    // O teste anterior confere texto; este confere que a rota responde. "Rota não encontrada" é o
    // 404 do roteador; um 404 de registro inexistente (placeholder `x`) é outra coisa e passa.
    // O verbo vem do próprio mapa ("POST /api/…", "PUT /api/…"); sem verbo é GET. Corpo vazio: as
    // rotas de escrita respondem 400 e nada é gravado.
    const entradas = new Map<string, string>();
    for (const m of MAPA_DA_APP.replaceAll('{p}', 'p-a').matchAll(/(?:(POST|PUT)\s+)?(\/api\/v1\/[^\s·(),]+)/g)) {
      entradas.set(`${m[1] ?? 'GET'} ${m[2].replace(/\{[^}]+\}/g, 'x').replace(/[:;.]+$/, '')}`, m[1] ?? 'GET');
    }
    expect(entradas.size, 'o mapa ficou sem caminhos?').toBeGreaterThan(20);
    const mortos: string[] = [];
    for (const [chave, metodo] of entradas) {
      const caminho = chave.slice(metodo.length + 1);
      const r = await worker.fetch(
        new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: metodo === 'GET' ? undefined : '{}' }),
        { ...workerEnv(), AGENTE: P } as any,
      );
      if ((await r.text()).includes('API route not found')) mortos.push(chave);
    }
    expect(mortos, 'caminhos do mapa sem rota').toEqual([]);
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
