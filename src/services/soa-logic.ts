// ——— Gate de aplicabilidade ————————————————————————————————————————————
// `applic = 0` e `na_why` são inseparáveis: uma exclusão de escopo sem
// justificativa registrada é achado de auditoria, não pendência de tela. A
// interface já barra (views/compliance.js), mas um curl passa por cima dela —
// por isso a regra mora aqui e é chamada por toda rota que grava status.
//
// Vocabulário: o pacote de design chama `applic` / `na_why`; neste repo os
// mesmos dois campos são `status = 'Not Applicable'` e `description` na tabela
// `compliance_controls`, e `isApplicable` / `justification`.

/** Valor de `status` que representa exclusão de escopo. */
export const NA_STATUS = 'Not Applicable';

export interface SoAApplicabilityRecord {
  controlId: string;
  isApplicable: boolean;
  justification?: string | null;
}

/** Erro de regra, não de infraestrutura: carrega QUAIS controles reprovaram. */
export class SoAValidationError extends Error {
  constructor(public readonly offenders: string[]) {
    super(
      `SoA recusada: ${offenders.length} ${offenders.length === 1 ? 'controle excluído do escopo está' : 'controles excluídos do escopo estão'} sem justificativa (${offenders.join(', ')})`
    );
    this.name = 'SoAValidationError';
  }
}

/** Controle aplicável não precisa de justificativa; excluído precisa. */
export function hasValidApplicability(record: SoAApplicabilityRecord): boolean {
  if (record.isApplicable) return true;
  return (record.justification ?? '').trim().length > 0;
}

/** Os controles que impedem a SoA de ser produzida, na ordem recebida. */
export function exclusionsMissingJustification(records: SoAApplicabilityRecord[]): string[] {
  return records.filter(r => !hasValidApplicability(r)).map(r => r.controlId);
}

/**
 * Recusa a SoA inteira se qualquer exclusão estiver sem justificativa.
 * Falha fechada de propósito: exportar um documento incompleto é pior que não
 * exportar, porque o incompleto chega ao auditor parecendo pronto.
 */
export function assertSoAExportable(records: SoAApplicabilityRecord[]): void {
  const offenders = exclusionsMissingJustification(records);
  if (offenders.length) throw new SoAValidationError(offenders);
}

/** Adapta a linha do banco (status/description) para a regra acima. */
export function recordFromControlRow(row: { id?: string; control_id?: string; status?: string | null; description?: string | null }): SoAApplicabilityRecord {
  return {
    controlId: String(row.control_id ?? row.id ?? ''),
    isApplicable: (row.status ?? '') !== NA_STATUS,
    justification: row.description ?? null,
  };
}
