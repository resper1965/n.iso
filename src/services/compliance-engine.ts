export interface ComplianceMetric {
  category: 'Clause' | 'Control' | 'Privacy';
  requirement: string;
  docStatus: 'Missing' | 'Draft' | 'Approved';
  evidenceCount: number;
  score: number; // 0 to 100
}

export class ComplianceEngine {
  /**
   * Calcula o score de prontidão para auditoria
   */
  static calculateReadiness(metrics: ComplianceMetric[]): number {
    if (metrics.length === 0) return 0;

    const totalScore = metrics.reduce((acc, metric) => {
      let weight = 0;
      
      // Pilar 1: Documentação (40% do peso)
      if (metric.docStatus === 'Approved') weight += 40;
      else if (metric.docStatus === 'Draft') weight += 20;

      // Pilar 2: Evidência (60% do peso - O "Anti-Miopia")
      // Auditoria sem evidência é 0 na prática.
      const evidenceWeight = Math.min(metric.evidenceCount * 20, 60);
      weight += evidenceWeight;

      return acc + weight;
    }, 0);

    return Math.round(totalScore / metrics.length);
  }

  /**
   * Define o Roadmap sugerido com base nos Gaps
   */
  static getSuggestedNextSteps(metrics: ComplianceMetric[]): string[] {
    return metrics
      .filter(m => m.docStatus === 'Missing' || m.evidenceCount === 0)
      .map(m => `Implementar e coletar evidências para ${m.requirement}`)
      .slice(0, 3);
  }
}
