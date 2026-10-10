import { parseModulos } from './schemas/nucleo';
/**
 * n.iso e n.privacy são PRODUTOS separados sobre o mesmo cadastro (decisão do dono de 09/10/2026, modelo A: um Worker, um banco).
 * O que o projeto habilitou (`projeto_modulos`) decide o que a API aceita: cada rota cai numa FAIXA.
 *   - `nucleo`: o cadastro compartilhado (partes, itens, documentos, evidência, RoPA, DPIA, pedidos…). Vale com QUALQUER módulo.
 *   - `iso`: o que só o n.iso faz (controles, SoA, riscos, auditorias, certificação…).
 *   - `privacy`: o que só o n.privacy faz (requisitos por projeto, terceiros, titular, incidentes, consentimentos, encarregado,
 *     ligações do tratamento, LIA).
 * Rota nova precisa estar classificada aqui: `test/modulos-faixa.test.ts` reprova a que não estiver.
 */

export const MODULOS_PRODUTO = ['iso', 'privacy'] as const;
export type Modulo = (typeof MODULOS_PRODUTO)[number];
export type Faixa = 'nucleo' | Modulo;

export const NOME_DO_PRODUTO: Record<Modulo, string> = { iso: 'n.iso', privacy: 'n.privacy' };

/** Primeiro segmento depois de `/api/v1/projects/:projectId/` → faixa. `''` é o próprio projeto. */
export const FAIXA_DO_SEGMENTO: Record<string, Faixa> = {
  // núcleo: o cadastro compartilhado e a administração do projeto
  '': 'nucleo', agentes: 'nucleo', 'api-keys': 'nucleo', assets: 'nucleo', 'audit-trail': 'nucleo', chat: 'nucleo',
  'company-profile': 'nucleo', context: 'nucleo', 'data-subject': 'nucleo', departamentos: 'nucleo', documentos: 'nucleo',
  documents: 'nucleo', dpia: 'nucleo', evidence: 'nucleo', export: 'nucleo', governance: 'nucleo', modulos: 'nucleo',
  partes: 'nucleo', pedidos: 'nucleo', ropa: 'nucleo', 'scim-token': 'nucleo', 'security-policy': 'nucleo', sso: 'nucleo',
  stakeholders: 'nucleo', training: 'nucleo', vendors: 'nucleo', webhooks: 'nucleo',
  // só n.iso
  'approve-document': 'iso', assessment: 'iso', 'audit-pack': 'iso', 'auditor-notes': 'iso', 'auditor-token': 'iso', audits: 'iso',
  capa: 'iso', certification: 'iso', checklist: 'iso', 'checklist-progress': 'iso', coherence: 'iso', 'control-adequacao': 'iso',
  controls: 'iso', 'gap-analysis': 'iso', 'generate-document': 'iso', 'generate-policies-bulk': 'iso', 'generate-policy': 'iso',
  interviews: 'iso', 'journey-dossier': 'iso', 'management-reviews': 'iso', metrics: 'iso', 'migrate-27701': 'iso',
  'migrate-27701-2025': 'iso', 'phase-answers': 'iso', phases: 'iso', policies: 'iso', 'policy-acknowledgments': 'iso',
  'readiness-check': 'iso', 'revoke-approvals': 'iso', 'risk-matrix': 'iso', risks: 'iso', 'scope-changes': 'iso',
  'seed-27001-2022': 'iso', 'seed-27701-2025': 'iso', traceability: 'iso',
  // só n.privacy
  consentimentos: 'privacy', encarregado: 'privacy', incidentes: 'privacy', requisitos: 'privacy', terceiros: 'privacy',
  'titular-pedidos': 'privacy',
};

/** Sub-rotas de um segmento do núcleo que são do n.privacy (o registro é compartilhado; a camada nova não). */
const SUBROTAS_PRIVACY: RegExp[] = [
  /^ropa\/importar$/,
  /^ropa\/[^/]+\/(ligacoes|itens|departamentos|transferencias|diagrama|dpia|lia)$/,
  /^documentos\/[^/]+\/requisitos$/,
  /^evidence\/[^/]+\/(requisitos|validade)$/,
];

/** Resto do caminho depois de `/api/v1/projects/:id/`, ou null se o caminho não é de projeto. */
export function restoDoCaminho(caminho: string): string | null {
  const m = /^\/api\/v1\/projects\/[^/]+\/?(.*)$/.exec(caminho);
  return m ? m[1].replace(/\/+$/, '') : null;
}

/** Faixa de um caminho de projeto (concreto ou padrão do roteador). null = segmento não classificado. */
export function faixaDoCaminho(caminho: string): Faixa | null {
  const resto = restoDoCaminho(caminho);
  if (resto === null) return null;
  if (SUBROTAS_PRIVACY.some((re) => re.test(resto))) return 'privacy';
  const seg = resto.split('/')[0];
  return Object.hasOwn(FAIXA_DO_SEGMENTO, seg) ? FAIXA_DO_SEGMENTO[seg] : null;
}

/** Tabela de recurso (rotas por id, `requireResourceAccess`) → faixa. */
export const FAIXA_DA_TABELA: Record<string, Faixa> = {
  compliance_controls: 'iso', risks: 'iso', audit_schedule: 'iso', corrective_actions: 'iso', certification_tracking: 'iso',
  audit_findings: 'iso', management_reviews: 'iso', performance_metrics: 'iso', auditor_notes: 'iso',
  vendors: 'nucleo', training_records: 'nucleo', ropa_records: 'nucleo', evidence: 'nucleo', itens: 'nucleo', stakeholders: 'nucleo',
  dpia_assessments: 'nucleo', webhooks: 'nucleo', api_keys: 'nucleo',
};

export async function modulosDoProjeto(db: D1Database, projectId: string): Promise<Modulo[]> {
  const { results } = await db.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ?').bind(projectId).all<{ modulo: Modulo }>();
  return results.map((r) => r.modulo);
}

/**
 * A recusa (mensagem) se o projeto não tem o produto que a faixa exige; null se pode. Sem nenhum módulo é projeto INEXISTENTE
 * (todo projeto real tem ao menos um: o gatilho dá na criação e o PUT recusa tirar o último): passa, e a rota responde o 404 dela.
 */
export function recusaDeModulo(faixa: Faixa, modulos: readonly Modulo[]): string | null {
  if (!modulos.length || faixa === 'nucleo') return null;
  return modulos.includes(faixa) ? null : `Produto ${NOME_DO_PRODUTO[faixa]} não habilitado neste projeto`;
}

/** O que a organização contratou (o teto dos projetos dela). Mesma leitura de `estadoDosModulos` em routes/nucleo.ts. */
export async function modulosContratados(db: D1Database, orgId: string): Promise<Modulo[]> {
  const o = await db.prepare('SELECT modulos_contratados AS m FROM organizations WHERE id = ?').bind(orgId).first<{ m: string | null }>();
  return parseModulos(o?.m);
}
