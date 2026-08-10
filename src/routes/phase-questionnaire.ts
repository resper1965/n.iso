import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, erro500 } from '../helpers';
import { PHASE_QUESTIONS } from '../phase-questions';

// Questionário POR FASE da jornada — banco de perguntas + respostas por projeto.
// F1: preencher e persistir. A interpretação coesa (AssessmentAgent) é a F2.

// Banco de perguntas (fonte única). Montado em /api/v1/phase-questions.
export const phaseQuestionsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
phaseQuestionsApp.get('/', (c) => c.json(PHASE_QUESTIONS));

// Respostas por projeto. Montado em /api/v1/projects/:projectId/phase-answers.
export const projectPhaseAnswersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function foraDoEscopo(c: any, projectId: string): boolean {
  const user = c.get('user');
  return !!(user?.client_project_id && user.client_project_id !== projectId);
}

// GET: todas as respostas salvas do projeto (para repopular o formulário).
projectPhaseAnswersApp.get('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);
    const { results } = await c.env.DB.prepare(
      'SELECT phase_number, question_key, answer FROM project_phase_answers WHERE project_id = ?'
    ).bind(projectId).all();
    return c.json(results ?? []);
  } catch (e: any) {
    return erro500(c, 'Falha ao carregar respostas da jornada', e);
  }
});

// PUT: upsert das respostas de UMA fase. Body: { phase_number, answers: {key: val} }.
projectPhaseAnswersApp.put('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    type Corpo = { phase_number?: number; answers?: Record<string, string> };
    const body = await c.req.json<Corpo>().catch(() => ({} as Corpo));
    const phase = Number(body.phase_number);
    const answers = body.answers;
    if (!Number.isInteger(phase) || !answers || typeof answers !== 'object') {
      return c.json({ error: 'phase_number (inteiro) e answers (objeto) são obrigatórios' }, 400);
    }

    // Só aceita chaves que pertencem à fase — não deixa gravar pergunta forjada.
    const validas = new Set((PHASE_QUESTIONS[phase] ?? []).map((q) => q.key));
    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    const stmts = [];
    for (const [key, val] of Object.entries(answers)) {
      if (!validas.has(key)) continue;
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(project_id, phase_number, question_key)
           DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')`
        ).bind(genId(), projectId, phase, key, String(val ?? ''))
      );
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    return c.json({ ok: true, saved: stmts.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar respostas da jornada', e);
  }
});
