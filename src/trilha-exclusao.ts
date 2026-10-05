/**
 * Trilha central de exclusão (plano de fechamento 2026-10, C4, decisão D3).
 *
 * Medido antes: de 20 handlers `DELETE`, 10 não gravavam trilha e 6 gravavam sem o
 * projeto. Em vez de depender de cada handler lembrar, o `authMiddleware` registra TODO
 * `DELETE` bem-sucedido (`registro.excluido`, com autor e projeto). Os handlers que já
 * gravam o próprio texto continuam gravando: a linha central é a uniforme e completa.
 *
 * O projeto precisa ser resolvido ANTES de o handler apagar (depois a linha some), por
 * isso este módulo só descobre o alvo; quem grava é o middleware.
 *
 * Rota `DELETE` nova precisa ser classificada aqui: `test/trilha-exclusao.test.ts`
 * enumera as rotas do roteador e reprova a que não estiver.
 */

/** Recurso (primeiro segmento depois de /api/v1/) → tabela que guarda `project_id`. */
export const TABELA_DO_RECURSO: Record<string, string> = {
  'api-keys': 'api_keys',
  assets: 'assets',
  'audit-findings': 'audit_findings',
  audits: 'audit_schedule',
  capa: 'corrective_actions',
  certification: 'certification_tracking',
  evidence: 'evidence',
  'management-reviews': 'management_reviews',
  metrics: 'performance_metrics',
  risks: 'risks',
  ropa: 'ropa_records',
  stakeholders: 'stakeholders',
  training: 'training_records',
  vendors: 'vendors',
  webhooks: 'webhooks',
};

/** Recursos que não pertencem a um projeto: usuários, e a área comercial. */
const SEM_PROJETO = new Set(['admin/users', 'users', 'leads', 'proposals']);

export type ClasseDaRota = { tipo: 'projeto' } | { tipo: 'tabela'; tabela: string } | { tipo: 'sem-projeto' };

function segmentos(caminho: string): string[] {
  return caminho.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
}

/** `admin/users` tem dois segmentos de base; o resto, um. */
function baseDoRecurso(seg: string[]): string {
  return seg[0] === 'admin' ? `admin/${seg[1]}` : seg[0];
}

/** Classifica um PADRÃO de rota (`/api/v1/risks/:id`). Nulo = rota nova sem classificação. */
export function classificaRota(padrao: string): ClasseDaRota | null {
  const seg = segmentos(padrao);
  if (seg[0] === 'projects' && seg[1]?.startsWith(':')) return { tipo: 'projeto' };
  const base = baseDoRecurso(seg);
  if (SEM_PROJETO.has(base)) return { tipo: 'sem-projeto' };
  if (TABELA_DO_RECURSO[base]) return { tipo: 'tabela', tabela: TABELA_DO_RECURSO[base] };
  return null;
}

export interface AlvoDaExclusao {
  /** Projeto do recurso, ou nulo quando não pertence a nenhum (ou não foi achado). */
  projectId: string | null;
}

/**
 * Resolve o projeto do recurso de um `DELETE` concreto (`/api/v1/risks/r-1`). Deve rodar
 * ANTES do handler. Caminho sem classificação devolve projeto nulo: ainda assim há trilha,
 * só sem o projeto, e o teste de classificação aponta a rota.
 */
export async function alvoDaExclusao(db: D1Database, caminho: string): Promise<AlvoDaExclusao> {
  const seg = segmentos(caminho);
  if (seg[0] === 'projects' && seg[1]) return { projectId: seg[1] };
  const tabela = TABELA_DO_RECURSO[baseDoRecurso(seg)];
  const id = seg[seg[0] === 'admin' ? 2 : 1];
  if (!tabela || !id) return { projectId: null };
  // `tabela` vem do mapa acima, nunca da requisição; o id vai por bind.
  const linha = await db.prepare(`SELECT project_id FROM ${tabela} WHERE id = ?`).bind(id).first<{ project_id: string | null }>();
  return { projectId: linha?.project_id ?? null };
}
