export interface InterviewResponse {
  stakeholder: string;
  question: string;
  answer: string;
  auditorNotes: string;
  riskIdentified: boolean;
  qualityScore: number; // 0 a 100
}

export class InterviewService {
  /**
   * Calcula a pontuação de qualidade baseada na profundidade da resposta
   */
  private static calculateQualityScore(answer: string): number {
    const length = answer.length;
    if (length < 20) return 20; // Muito vaga
    if (length < 100) return 60; // Aceitável
    return 100; // Profunda
  }

  static logResponse(data: Omit<InterviewResponse, 'qualityScore'>): void {
    const score = this.calculateQualityScore(data.answer);
    console.log(`[AuditInterview] Captured from ${data.stakeholder}. Quality Score: ${score}/100`);
    if (score < 50) {
      console.warn(`[DILIGÊNCIA] Resposta do stakeholder ${data.stakeholder} considerada rasa. Intervenção manual recomendada.`);
    }
  }

  /**
   * Gera o sumário de entrevistas para o Auditor Externo
   */
  static generateInterviewSummary(responses: InterviewResponse[]): string {
    let md = "# Stakeholder Interview Summary\n";
    responses.forEach(r => {
      md += `### ${r.stakeholder}\n`;
      md += `**Q:** ${r.question}\n`;
      md += `**A:** ${r.answer}\n`;
      if (r.riskIdentified) md += `> ⚠️ **Risk Identified:** ${r.auditorNotes}\n`;
      md += `\n---\n`;
    });
    return md;
  }
}
