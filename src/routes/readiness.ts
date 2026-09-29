import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { ReadinessAgent, parseObservacoes } from '../agents/readiness';

// Diagnóstico de Prontidão ("gap em voo") — F1: camada DETERMINÍSTICA.
//
// Auto-diagnóstico self-service: aponta controles sem evidência, assinatura sem
// lastro e inconsistências de status. NÃO é auditoria (a independente é do
// Aegis-Auditor externo) e NÃO emite parecer de certificação. Regras 100% SQL
// sobre os dados reais — sem IA, sem alucinação. A camada de IA (F2) entra
// depois, sob `?ai=1`, em `ai_observacoes`.
//
// Montado em `/api/v1/projects/:projectId/readiness-check` (ver src/index.ts).

export const readinessApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ROTULO =
  'Auto-diagnóstico de prontidão (não é auditoria nem parecer de certificação)';

type Sev = 'critico' | 'alto' | 'medio';
interface Achado {
  categoria: 'doc_faltante' | 'doc_inconsistente' | 'evidencia_faltante';
  severidade: Sev;
  requisito: string;
  referencia: string;
  descricao: string;
}

readinessApp.get('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const user = c.get('user');

    // Escopo: chave/usuário preso a um projeto não lê outro.
    if (user?.client_project_id && user.client_project_id !== projectId) {
      return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);
    }
    const proj = await c.env.DB.prepare(
      'SELECT id, scope, standards, org_role FROM projects WHERE id = ?'
    ).bind(projectId).first<any>();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    const achados: Achado[] = [];

    // R2 (CRÍTICO): controle aprovado/assinado SEM evidência anexada.
    // Assinar conformidade sem lastro é o pior caso — some se a evidência sumir.
    const aprovadoSemEvid = await c.env.DB.prepare(
      `SELECT c.id, c.title FROM compliance_controls c
       WHERE c.project_id = ?
         AND (c.ciso_approved_by IS NOT NULL OR c.ceo_approved_by IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.control_id = c.id)`
    ).bind(projectId).all();
    for (const r of (aprovadoSemEvid.results ?? []) as any[]) {
      achados.push({
        categoria: 'doc_inconsistente', severidade: 'critico',
        requisito: 'Assinatura sem lastro', referencia: r.id,
        descricao: `Controle "${r.title}" está aprovado (assinado) mas não tem evidência anexada.`,
      });
    }

    // R1 (ALTO): controle marcado Implemented/Compliant SEM evidência.
    const implSemEvid = await c.env.DB.prepare(
      `SELECT c.id, c.title, c.status FROM compliance_controls c
       WHERE c.project_id = ?
         AND c.status IN ('Implemented','Compliant')
         AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.control_id = c.id)`
    ).bind(projectId).all();
    for (const r of (implSemEvid.results ?? []) as any[]) {
      achados.push({
        categoria: 'evidencia_faltante', severidade: 'alto',
        requisito: 'Evidência do controle', referencia: r.id,
        descricao: `Controle "${r.title}" está "${r.status}" mas não tem evidência que sustente.`,
      });
    }

    // R3 (MÉDIO): status Missing porém maturity > 0 (diz que não tem, mas pontua).
    const statusInconsistente = await c.env.DB.prepare(
      `SELECT c.id, c.title, c.maturity FROM compliance_controls c
       WHERE c.project_id = ? AND c.status = 'Missing' AND c.maturity > 0`
    ).bind(projectId).all();
    for (const r of (statusInconsistente.results ?? []) as any[]) {
      achados.push({
        categoria: 'doc_inconsistente', severidade: 'medio',
        requisito: 'Coerência status × maturidade', referencia: r.id,
        descricao: `Controle "${r.title}" está "Missing" mas com maturidade ${r.maturity}.`,
      });
    }

    // R4 (ALTO): evidência REJEITADA na avaliação — não sustenta o controle.
    const evidRejeitada = await c.env.DB.prepare(
      `SELECT e.id, e.file_name, e.control_id FROM evidence e
       WHERE e.project_id = ? AND e.evaluation_status = 'rejected'`
    ).bind(projectId).all();
    for (const r of (evidRejeitada.results ?? []) as any[]) {
      achados.push({
        categoria: 'evidencia_faltante', severidade: 'alto',
        requisito: 'Evidência válida', referencia: r.control_id || r.id,
        descricao: `Evidência "${r.file_name}" foi rejeitada na avaliação — o controle segue sem lastro válido.`,
      });
    }

    // R5 (MÉDIO, agregado): controles ainda em Missing = backlog de gaps.
    // Agregado para não inundar a triagem com uma linha por controle.
    const missing = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM compliance_controls
       WHERE project_id = ? AND status = 'Missing'`
    ).bind(projectId).first<any>();
    const nMissing = Number(missing?.n ?? 0);
    if (nMissing > 0) {
      achados.push({
        categoria: 'doc_faltante', severidade: 'medio',
        requisito: 'Implementação de controles', referencia: `${nMissing} controles`,
        descricao: `${nMissing} controle(s) ainda em status "Missing" — sem implementação declarada.`,
      });
    }

    const resumo = {
      critico: achados.filter((a) => a.severidade === 'critico').length,
      alto: achados.filter((a) => a.severidade === 'alto').length,
      medio: achados.filter((a) => a.severidade === 'medio').length,
      total: achados.length,
    };

    // Camada de IA (F2), só sob `?ai=1`. Nunca quebra o resultado determinístico:
    // qualquer falha (sem binding, timeout, JSON inválido) devolve lista vazia.
    let aiObservacoes: any[] = [];
    if (c.req.query('ai') === '1' && c.env.AI) {
      try {
        const controles = await c.env.DB.prepare(
          `SELECT c.id, c.title, c.status, c.maturity,
                  (SELECT COUNT(*) FROM evidence e WHERE e.control_id = c.id) AS n_evid
           FROM compliance_controls c WHERE c.project_id = ? LIMIT 200`
        ).bind(projectId).all();
        const ropa = await c.env.DB.prepare(
          `SELECT processing_purpose, retention_period FROM ropa_records WHERE project_id = ? LIMIT 100`
        ).bind(projectId).all();

        const estado = [
          `Escopo: ${proj.scope || '(não definido)'}`,
          `Normas: ${proj.standards || '(não definido)'}`,
          `Papel: ${proj.org_role || '(não definido)'}`,
          '',
          'Controles (id | título | status | maturidade | nº evidências):',
          ...((controles.results ?? []) as any[]).map(
            (r) => `- ${r.id} | ${r.title} | ${r.status} | ${r.maturity ?? 0} | ${r.n_evid}`
          ),
          '',
          'Propósitos de tratamento (RoPA):',
          ...((ropa.results ?? []) as any[]).map(
            (r) => `- ${r.processing_purpose} (retenção: ${r.retention_period || 'n/d'})`
          ),
        ].join('\n');

        const agent = new ReadinessAgent(c.env.AI, c.env.DB, c.env);
        const resp = await agent.run(estado, { organizationId: String(projectId) });
        if (resp.success) aiObservacoes = parseObservacoes(resp.content);
      } catch {
        aiObservacoes = []; // aterramento: IA é assistiva, nunca derruba o diagnóstico.
      }
    }

    return c.json({
      generated_at: new Date().toISOString(),
      project_id: projectId,
      rotulo: ROTULO,
      resumo,
      achados,
      ai_observacoes: aiObservacoes, // assistidas por IA (origem:'ia') — revisar.
    });
  } catch (e: any) {
    return erro500(c, 'Falha no diagnóstico de prontidão', e);
  }
});
