export interface PIIFinding {
  tableName?: string;
  columnName?: string;
  dataType: string;
  piiType: 'CPF' | 'EMAIL' | 'PHONE' | 'NAME' | 'ADDRESS';
  confidence: number;
}

export class PIIDiscoveryService {
  private static PII_PATTERNS = [
    { pattern: /cpf|doc|tax/i, type: 'CPF' as const },
    { pattern: /email|mail/i, type: 'EMAIL' as const },
    { pattern: /phone|tel|cel/i, type: 'PHONE' as const },
    { pattern: /name|nome/i, type: 'NAME' as const },
    { pattern: /address|end/i, type: 'ADDRESS' as const }
  ];

  /**
   * Scan de schema de banco de dados em busca de dados pessoais (ISO 27701 / LGPD)
   */
  static scanSchema(schemaJson: any[]): PIIFinding[] {
    const findings: PIIFinding[] = [];

    schemaJson.forEach(table => {
      table.columns.forEach((col: any) => {
        const match = this.PII_PATTERNS.find(p => p.pattern.test(col.name));
        if (match) {
          findings.push({
            tableName: table.name,
            columnName: col.name,
            dataType: col.type,
            piiType: match.type,
            confidence: 90
          });
        }
      });
    });

    console.log(`[PIMS-Discovery] Scan completo. Encontrados ${findings.length} campos PII potenciais.`);
    return findings;
  }
}
