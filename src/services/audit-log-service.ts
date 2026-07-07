export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actor: string;
  action: 'UPDATE' | 'DELETE' | 'REPLACE' | 'APPROVE';
  entityType: 'EVIDENCE' | 'POLICY' | 'SOA' | 'RISK';
  entityId: string;
  details: string; 
  justification: string; // OBRIGATÓRIO para auditoria
}

export class AuditLogService {
  /**
   * Registra uma alteração crítica com justificativa obrigatória
   */
  static logAction(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    if (!entry.justification || entry.justification.length < 10) {
      throw new Error("Justificativa de auditoria insuficiente ou ausente.");
    }
    const log: AuditLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      ...entry
    };

    console.log(`[SYSTEM_AUDIT_LOG] ${log.timestamp.toISOString()} | ${log.actor} | ${log.action} | ${log.entityType} (${log.entityId}): ${log.details}`);
    
    // Persistir no Neon Postgres para consulta do auditor externo se necessário.
  }

  /**
   * Gera o relatório de transparência (Change Log) para o auditor
   */
  static generateTransparencyReport(): string {
    return "# Transparency & Change Log\n*All modifications to this audit package are tracked below.*";
  }
}
