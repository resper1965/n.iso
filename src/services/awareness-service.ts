export interface TrainingRecord {
  employeeId: string;
  trainingName: string;
  completionDate: Date;
  score?: number;
  status: 'Completed' | 'Pending' | 'Expired';
}

export class AwarenessService {
  /**
   * Gera o relatório consolidado de conscientização para o auditor
   */
  static generateAwarenessEvidence(records: TrainingRecord[]): any {
    const total = records.length;
    const completed = records.filter(r => r.status === 'Completed').length;
    const coverage = (completed / total) * 100;

    return {
      title: 'Information Security Awareness Report',
      coverage: `${coverage.toFixed(1)}%`,
      status: coverage > 90 ? 'Sufficient' : 'Requires Action',
      evidenceLog: records.map(r => `${r.employeeId}: ${r.status} on ${r.completionDate.toLocaleDateString()}`)
    };
  }
}
