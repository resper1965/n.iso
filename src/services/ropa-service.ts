export interface DataProcessingActivity {
  id: string;
  processName: string;
  dataCategory: 'Customer' | 'Employee' | 'Prospect';
  dataTypes: string[]; // Ex: Email, CPF, Health Data
  legalBasis: 'Consent' | 'Contract' | 'Legal Obligation' | 'Legitimate Interest';
  retentionPeriod: string;
  isInternationalTransfer: boolean;
}

export class RoPAService {
  /**
   * Gera o Registro de Atividades de Tratamento (RoPA)
   */
  static generateInventory(activities: DataProcessingActivity[]): string {
    let md = "# Record of Processing Activities (RoPA)\n";
    md += "| ID | Process | Category | Legal Basis | Retention |\n";
    md += "| :--- | :--- | :--- | :--- | :--- |\n";

    activities.forEach(a => {
      md += `| ${a.id} | ${a.processName} | ${a.dataCategory} | ${a.legalBasis} | ${a.retentionPeriod} |\n`;
    });

    return md;
  }
}
