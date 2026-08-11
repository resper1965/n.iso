import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { PHASE_QUESTIONS, PHASE_META } from '../phase-questions';

// Dossiê da Jornada (F3, fatia 1) — consolidação APRESENTÁVEL das respostas do
// questionário por fase num único documento, para compartilhar com stakeholders.
//
// É read-only e determinístico: junta o que o consultor preencheu (respostas por
// fase, ancoradas em título/cláusula) + a cobertura. NÃO escreve conformidade em
// controle (isso exige evidência e aprovação humana — constituição) e NÃO emite
// parecer de certificação. A interpretação por fase (F2) segue sob demanda.
//
// Montado em /api/v1/projects/:projectId/journey-dossier (ver src/index.ts).

export const journeyDossierApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ROTULO =
  'Dossiê da jornada de adequação — consolidação das respostas registradas. Não é auditoria independente nem parecer de certificação.';

journeyDossierApp.get('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    const user = c.get('user');
    if (user?.client_project_id && user.client_project_id !== projectId) {
      return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);
    }

    const projeto = await c.env.DB.prepare(
      'SELECT id, client_name, scope, standards, org_role, status FROM projects WHERE id = ?'
    ).bind(projectId).first<any>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Fases registradas (para status/notas) e todas as respostas do projeto.
    const [fasesReg, respRows] = await Promise.all([
      c.env.DB.prepare(
        'SELECT phase_number, title, status, completed_at FROM project_phases WHERE project_id = ?'
      ).bind(projectId).all(),
      c.env.DB.prepare(
        'SELECT phase_number, question_key, answer FROM project_phase_answers WHERE project_id = ?'
      ).bind(projectId).all(),
    ]);

    const statusPorFase = new Map<number, { status: string; completed_at: string | null }>();
    for (const r of (fasesReg.results ?? []) as any[]) {
      statusPorFase.set(Number(r.phase_number), { status: r.status, completed_at: r.completed_at ?? null });
    }

    // Respostas: fase → (question_key → answer não-vazio).
    const respPorFase = new Map<number, Map<string, string>>();
    for (const r of (respRows.results ?? []) as any[]) {
      const v = (r.answer ?? '').toString().trim();
      if (!v) continue;
      const fase = Number(r.phase_number);
      if (!respPorFase.has(fase)) respPorFase.set(fase, new Map());
      respPorFase.get(fase)!.set(r.question_key, v);
    }

    // Seções: só as fases que têm ao menos uma resposta (o que foi preenchido).
    const fasesOrdenadas = [...respPorFase.keys()].filter((f) => PHASE_QUESTIONS[f]).sort((a, b) => a - b);
    let totalPerguntas = 0;
    let totalRespondidas = 0;
    const secoes = fasesOrdenadas.map((fase) => {
      const perguntas = PHASE_QUESTIONS[fase];
      const respostas = respPorFase.get(fase)!;
      const meta = PHASE_META[fase] ?? { titulo: `Fase ${fase}`, clausula: '' };
      const reg = statusPorFase.get(fase);
      totalPerguntas += perguntas.length;
      const itens = perguntas.map((q) => {
        const resposta = respostas.get(q.key) ?? '';
        if (resposta) totalRespondidas++;
        return {
          pergunta_key: q.key,
          pergunta: q.question,
          tipo: q.type,
          resposta: resposta || null, // null = ainda sem resposta nesta fase iniciada
        };
      });
      return {
        phase: fase,
        titulo: meta.titulo,
        clausula: meta.clausula,
        status: reg?.status ?? 'Em andamento',
        completed_at: reg?.completed_at ?? null,
        cobertura: { total: perguntas.length, respondidas: respostas.size },
        respostas: itens,
      };
    });

    return c.json({
      generated_at: new Date().toISOString(),
      project_id: projectId,
      rotulo: ROTULO,
      projeto: {
        client_name: projeto.client_name,
        scope: projeto.scope ?? null,
        standards: projeto.standards,
        org_role: projeto.org_role,
        status: projeto.status,
      },
      resumo: {
        fases_iniciadas: secoes.length,
        total_perguntas_das_fases_iniciadas: totalPerguntas,
        respondidas: totalRespondidas,
      },
      secoes,
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar dossiê da jornada', e);
  }
});
