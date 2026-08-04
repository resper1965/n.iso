// Validador de coerência entre as fases do SGSI (ISO 27001) e do SGPI (ISO 27701).
// v1: só regras de referência órfã, verificáveis direto no schema (risks, compliance_controls,
// evidence, policy_versions) — nada de heurística de mapeamento 27001<->27701 sem tabela de
// dados real por trás (ver AGENTS.md: não afirme sem evidência).

export type CoherenceSeverity = 'error' | 'warning';

export interface CoherenceIssue {
  rule: string;
  severity: CoherenceSeverity;
  entity: 'risk' | 'control';
  id: string;
  message: string;
}

export interface CoherenceReport {
  ok: boolean;
  project_id: string;
  checked_at: string;
  issue_count: number;
  issues: CoherenceIssue[];
}

const APROVADOS = ['Approved', 'Implemented'];

export async function checkCoherence(db: D1Database, projectId: string): Promise<CoherenceReport> {
  const issues: CoherenceIssue[] = [];

  const { results: risks } = await db.prepare(
    `SELECT id, asset, threat, treatment, status, control_id FROM risks WHERE project_id = ?`
  ).bind(projectId).all<any>();

  const { results: controls } = await db.prepare(
    `SELECT id, standard, title, status, description FROM compliance_controls WHERE project_id = ?`
  ).bind(projectId).all<any>();

  // Não há regra de "risco aponta pra controle inexistente": a FK
  // risks.control_id -> compliance_controls(id) com ON DELETE SET NULL já
  // impede esse estado no schema atual (confirmado: D1 rejeita o INSERT).
  for (const risk of risks || []) {
    // R1: risco em tratamento "Mitigate" e aberto, sem controle vinculado.
    if (risk.treatment === 'Mitigate' && risk.status === 'Open' && !risk.control_id) {
      issues.push({
        rule: 'risk_without_control',
        severity: 'error',
        entity: 'risk',
        id: risk.id,
        message: `Risco "${risk.asset} / ${risk.threat}" está em tratamento de mitigação mas não tem controle vinculado.`,
      });
    }
  }

  if (controls && controls.length) {
    const controlIdsAprovados = (controls as any[]).filter(c => APROVADOS.includes(c.status)).map(c => c.id);
    if (controlIdsAprovados.length) {
      const placeholders = controlIdsAprovados.map(() => '?').join(',');
      const { results: evid } = await db.prepare(
        `SELECT DISTINCT control_id FROM evidence WHERE control_id IN (${placeholders})`
      ).bind(...controlIdsAprovados).all<any>();
      const comEvidencia = new Set((evid || []).map((e: any) => e.control_id));

      const { results: versions } = await db.prepare(
        `SELECT DISTINCT control_id FROM policy_versions WHERE project_id = ? AND control_id IN (${placeholders})`
      ).bind(projectId, ...controlIdsAprovados).all<any>();
      const comPolitica = new Set((versions || []).map((v: any) => v.control_id));

      for (const control of controls as any[]) {
        if (!APROVADOS.includes(control.status)) continue;
        // R3: controle aprovado/implementado sem nenhuma evidência anexada.
        if (!comEvidencia.has(control.id)) {
          issues.push({
            rule: 'control_approved_without_evidence',
            severity: 'error',
            entity: 'control',
            id: control.id,
            message: `Controle "${control.title}" (${control.standard}) está ${control.status} mas não tem nenhuma evidência anexada.`,
          });
        }
        // R4: controle aprovado/implementado sem política escrita (nem versão, nem descrição).
        if (!comPolitica.has(control.id) && !(control.description && control.description.trim())) {
          issues.push({
            rule: 'control_approved_without_policy',
            severity: 'warning',
            entity: 'control',
            id: control.id,
            message: `Controle "${control.title}" (${control.standard}) está ${control.status} mas não tem política documentada.`,
          });
        }
      }
    }
  }

  return {
    ok: issues.every(i => i.severity !== 'error'),
    project_id: projectId,
    checked_at: new Date().toISOString(),
    issue_count: issues.length,
    issues,
  };
}
