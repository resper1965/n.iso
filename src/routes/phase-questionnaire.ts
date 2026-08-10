import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, erro500, logAudit } from '../helpers';
import { PHASE_QUESTIONS, PhaseQuestion } from '../phase-questions';

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

// Normaliza e valida UM valor de resposta contra a definição da pergunta. Devolve
// a string a persistir, '' para "apagar esta resposta", ou null se o valor for
// inválido (tipo errado, opção fora do domínio) — o chamador então recusa o corpo.
function normalizarValor(q: PhaseQuestion, val: unknown): string | null {
  // Só primitivos viram resposta. Objetos/arrays aninhados são payload malformado
  // (viravam "[object Object]" no String() ingênuo) — recusa.
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return null;
  const s = String(val).trim();
  if (s === '') return '';

  if (q.type === 'select') {
    return (q.options ?? []).includes(s) ? s : null;
  }
  if (q.type === 'multi') {
    // Frontend envia as marcações unidas por '||'. Toda parte tem de ser uma opção.
    const partes = s.split('||').map((p) => p.trim()).filter(Boolean);
    const dominio = new Set(q.options ?? []);
    if (!partes.every((p) => dominio.has(p))) return null;
    return partes.join('||');
  }
  return s; // texto aberto
}

// PUT: upsert das respostas de UMA fase. Body: { phase_number, answers: {key: val} }.
projectPhaseAnswersApp.put('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    type Corpo = { phase_number?: unknown; answers?: unknown };
    const body = await c.req.json<Corpo>().catch(() => ({} as Corpo));

    // phase_number tem de ser um NÚMERO (não string, não null) e uma fase REAL do
    // banco. Sem o typeof, Number(null)=0 mapeava, sem querer, para a fase 0.
    const phase = body.phase_number;
    if (typeof phase !== 'number' || !Number.isInteger(phase) || !PHASE_QUESTIONS[phase]) {
      return c.json({ error: 'phase_number deve ser uma fase válida da jornada' }, 400);
    }
    // answers tem de ser um objeto puro — array (typeof []==='object') não vale.
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return c.json({ error: 'answers deve ser um objeto { key: valor }' }, 400);
    }

    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Só perguntas que pertencem à fase — não deixa gravar pergunta forjada.
    const porChave = new Map((PHASE_QUESTIONS[phase] ?? []).map((q) => [q.key, q]));

    const gravar: { key: string; valor: string }[] = [];
    const apagar: string[] = [];
    for (const [key, raw] of Object.entries(answers as Record<string, unknown>)) {
      const q = porChave.get(key);
      if (!q) continue; // chave forjada / fora da fase: ignora
      const valor = normalizarValor(q, raw);
      if (valor === null) {
        return c.json({ error: `Valor inválido para "${key}"` }, 400);
      }
      // Resposta vazia não vira linha órfã: apaga a existente (mantém o contador honesto).
      if (valor === '') apagar.push(key);
      else gravar.push({ key, valor });
    }

    const stmts = gravar.map(({ key, valor }) =>
      c.env.DB.prepare(
        `INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, phase_number, question_key)
         DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')`
      ).bind(genId(), projectId, phase, key, valor)
    );
    for (const key of apagar) {
      stmts.push(
        c.env.DB.prepare(
          'DELETE FROM project_phase_answers WHERE project_id = ? AND phase_number = ? AND question_key = ?'
        ).bind(projectId, phase, key)
      );
    }
    if (stmts.length) await c.env.DB.batch(stmts);

    // Dado de conformidade muda → registra na trilha de auditoria (append-only).
    const user = c.get('user');
    await logAudit(
      c.env.DB,
      'project.phase_answers.saved',
      user?.email ?? 'system',
      `Questionário da fase ${phase} salvo no projeto ${projectId} (${gravar.length} gravadas, ${apagar.length} limpas)`,
      '',
      c.req.header('CF-Connecting-IP') ?? '',
      projectId
    );

    return c.json({ ok: true, saved: gravar.length, cleared: apagar.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar respostas da jornada', e);
  }
});
