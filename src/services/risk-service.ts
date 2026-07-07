export interface Risk {
  id: string;
  asset: string;
  threat: string;
  impact: 1 | 2 | 3 | 4 | 5;
  probability: 1 | 2 | 3 | 4 | 5;
  treatment: 'Accept' | 'Avoid' | 'Transfer' | 'Mitigate';
  status: 'Inherent' | 'Residual';
}

export class RiskService {
  static calculateScore(risk: Risk): number {
    return risk.impact * risk.probability;
  }

  static getRiskLevel(score: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (score <= 5) return 'Low';
    if (score <= 12) return 'Medium';
    if (score <= 20) return 'High';
    return 'Critical';
  }
}
