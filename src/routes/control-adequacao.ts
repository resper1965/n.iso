import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { erro500, logAudit } from '../helpers';
import { PHASE_QUESTIONS, PHASE_META } from '../phase-questions';
import { ControlAdequacaoAgent, parseSugestoes, STATUS_SEGUROS } from '../agents/control-adequacao';

// Adequação de controles a partir das respostas da fase (F3) — SUGESTÃO + APROVAÇÃO.
//
// GET  /:phase/suggestions  → a IA PROPÕE adequações (read-only, nada é gravado).
// POST /apply               → o humano APROVA uma sugestão; só aqui o controle muda.
//
// Guarda-rail: nem a IA nem o /apply escrevem "Implemented"/"Compliant" — esses
// afirmam conformidade comprovada, que exige evidência e é decisão humana com
// lastro (constituição). O domínio permitido é STATUS_SEGUROS.
//
// Montado em /api/v1/projects/:projectId/control-adequacao (ver src/index.ts).

export const controlAdequacaoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function foraDoEscopo(c: any, projectId: string): boolean {
  const user = c.get('user');
  return !!(user?.client_project_id && user.client_project_id !== projectId);
}

// GET /:phase/suggestions — a IA propõe adequações para os controles do projeto
// com base nas respostas da fase. Read-only e aterrado: descarta sugestão que não
// cite um controle existente + uma pergunta da fase, ou com status fora do seguro.
controlAdequacaoApp.get('/:phase/suggestions', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    const phase = Number(c.req.param('phase'));
    const perguntas = PHASE_QUESTIONS[phase];
    if (!Number.isInteger(phase) || !perguntas) return c.json({ error: 'Fase inválida' }, 400);

    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    const { results: respRows } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM project_phase_answers WHERE project_id = ? AND phase_number = ?'
    ).bind(projectId, phase).all();
    const respostas = new Map<string, string>();
    for (const r of (respRows ?? []) as any[]) {
      const v = (r.answer ?? '').toString().trim();
      if (v) respostas.set(r.question_key, v);
    }

    const { results: ctrlRows } = await c.env.DB.prepare(
      'SELECT id, title, status, maturity FROM compliance_controls WHERE project_id = ? LIMIT 300'
    ).bind(projectId).all();
    const controles = (ctrlRows ?? []) as any[];
    const porId = new Map(controles.map((r) => [r.id, r]));

    const meta = PHASE_META[phase] ?? { titulo: `Fase ${phase}`, clausula: '' };

    let sugestoes: any[] = [];
    let fonte: 'ia' | 'indisponivel' = 'indisponivel';
    if (c.env.AI && respostas.size > 0 && controles.length > 0) {
      try {
        const estado = [
          'Perguntas e respostas da fase:',
          ...perguntas.map((q) => `- [${q.key}] ${q.question}\n  Resposta: ${respostas.get(q.key) ?? '(sem resposta)'}`),
          '',
          'Controles do projeto (id | título | status atual | maturidade atual):',
          ...controles.map((r) => `- ${r.id} | ${r.title} | ${r.status} | ${r.maturity ?? 0}`),
        ].join('\n');

        const agent = new ControlAdequacaoAgent(c.env.AI, c.env.DB, c.env);
        const resp = await agent.run(estado, { organizationId: projectId, titulo: meta.titulo, clausula: meta.clausula });
        if (resp.success) {
          const parsed = parseSugestoes(resp.content, new Set(porId.keys()) as Set<string>, new Set(perguntas.map((q) => q.key)));
          // Enriquecer com o estado atual do controle (para o humano ver o antes→depois).
          sugestoes = parsed.map((s) => {
            const atual = porId.get(s.control_id);
            return {
              ...s,
              control_title: atual?.title ?? s.control_id,
              status_atual: atual?.status ?? null,
              maturidade_atual: atual?.maturity ?? null,
              origem: 'ia',
            };
          });
          fonte = 'ia';
        }
      } catch {
        sugestoes = []; // IA é assistiva: falha não derruba o endpoint.
      }
    }

    return c.json({
      generated_at: new Date().toISOString(),
      project_id: projectId,
      phase,
      titulo: meta.titulo,
      clausula: meta.clausula,
      rotulo: 'Sugestões assistidas — só se aplicam ao controle após aprovação humana. Não é parecer de certificação.',
      status_permitidos: STATUS_SEGUROS,
      fonte,
      sugestoes,
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao sugerir adequação de controles', e);
  }
});

// POST /apply — aplica UMA sugestão aprovada pelo humano. Único ponto que escreve
// no controle. Valida escopo, pertencimento do controle ao projeto e o domínio de
// status seguro; registra a proveniência (pergunta + justificativa) na auditoria.
controlAdequacaoApp.post('/apply', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    type Corpo = {
      control_id?: unknown; status?: unknown; maturity?: unknown;
      justificativa?: unknown; pergunta_key?: unknown; phase_number?: unknown;
    };
    const body = await c.req.json<Corpo>().catch(() => ({} as Corpo));

    const controlId = typeof body.control_id === 'string' ? body.control_id : '';
    if (!controlId) return c.json({ error: 'control_id é obrigatório' }, 400);

    const justificativa = typeof body.justificativa === 'string' ? body.justificativa.trim() : '';
    if (!justificativa) return c.json({ error: 'justificativa é obrigatória para aplicar a adequação' }, 400);

    // Status (opcional) só dentro do domínio seguro — nunca "Implemented"/"Compliant".
    let status: string | null = null;
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      if (typeof body.status !== 'string' || !(STATUS_SEGUROS as readonly string[]).includes(body.status)) {
        return c.json({ error: `status deve ser um de: ${STATUS_SEGUROS.join(', ')}` }, 400);
      }
      status = body.status;
    }
    // Maturidade (opcional): inteiro CMM 0-5.
    let maturity: number | null = null;
    if (body.maturity !== undefined && body.maturity !== null) {
      const m = Number(body.maturity);
      if (!Number.isInteger(m) || m < 0 || m > 5) return c.json({ error: 'maturity deve ser inteiro de 0 a 5' }, 400);
      maturity = m;
    }
    if (status === null && maturity === null) {
      return c.json({ error: 'informe ao menos status ou maturity' }, 400);
    }

    // O controle tem de existir E pertencer ao projeto do escopo (isolamento).
    const ctrl = await c.env.DB.prepare(
      'SELECT id, project_id, status, maturity FROM compliance_controls WHERE id = ?'
    ).bind(controlId).first<any>();
    if (!ctrl || ctrl.project_id !== projectId) return c.json({ error: 'Controle não encontrado neste projeto' }, 404);

    const sets: string[] = [];
    const binds: any[] = [];
    if (status !== null) { sets.push('status = ?'); binds.push(status); }
    if (maturity !== null) { sets.push('maturity = ?'); binds.push(maturity); }
    binds.push(controlId);
    await c.env.DB.prepare(`UPDATE compliance_controls SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

    const user = c.get('user');
    const de = `status=${ctrl.status}, maturidade=${ctrl.maturity ?? 0}`;
    const para = `${status !== null ? `status=${status}` : ''}${status !== null && maturity !== null ? ', ' : ''}${maturity !== null ? `maturidade=${maturity}` : ''}`;
    const perguntaRef = typeof body.pergunta_key === 'string' ? body.pergunta_key : '';
    await logAudit(
      c.env.DB,
      'control.adequacao.applied',
      user?.email ?? 'system',
      `Adequação aplicada ao controle ${controlId} no projeto ${projectId} (${de} → ${para})${perguntaRef ? ` a partir da resposta ${perguntaRef}` : ''}`,
      justificativa,
      c.req.header('CF-Connecting-IP') ?? '',
      projectId
    );

    return c.json({ ok: true, control_id: controlId, applied: { status, maturity } });
  } catch (e: any) {
    return erro500(c, 'Falha ao aplicar adequação de controle', e);
  }
});
