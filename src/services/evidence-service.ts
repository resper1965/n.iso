export interface Evidence {
  id: string;
  requirementId: string; // Ex: "Cl. 4.3" ou "A.5.1"
  fileName: string;
  fileUrl: string;
  uploadedAt: Date;
  uploadedBy: string;
  controlId: string;
  content: string;
  timestamp: Date;
  hash: string; // SHA-256 integrity hash
  type: 'Technical' | 'Documentary' | 'Interview';
}

export class EvidenceService {
  /**
   * Gera um hash SHA-256 (Simulado) para garantir a imutabilidade
   */
  private static generateHash(content: string): string {
    // Em produção, usar crypto.subtle.digest('SHA-256', ...)
    return `sha256-${Math.random().toString(36).substr(2, 15)}`;
  }

  static collectEvidence(controlId: string, content: string, type: Evidence['type']): Evidence {
    const evidence: Evidence = {
      id: `EV-${Math.random().toString(36).substr(2, 9)}`,
      controlId,
      requirementId: '',
      fileName: 'evidence.txt',
      fileUrl: '',
      uploadedAt: new Date(),
      uploadedBy: 'system',
      content,
      timestamp: new Date(),
      hash: this.generateHash(content),
      type
    };

    return evidence;
  }
}
