export interface PipelineEvidence {
  toolName: string;
  finding: string;
  status: 'Pass' | 'Fail';
  link: string;
}

export interface ScanResult {
  tool: string;
  controlId: string;
  status: 'Pass' | 'Fail' | 'Warning';
  vulnerabilitiesFound: number;
  evidencePath: string;
}

export class CICDScannerService {
  /**
   * Realiza a varredura profunda dos logs de pipeline
   */
  static scanPipeline(yamlContent: string): PipelineEvidence[] {
    const evidences: PipelineEvidence[] = [];

    if (yamlContent.includes('container-scan')) {
      evidences.push({
        toolName: 'Container Security',
        finding: 'Image vulnerability scanning detected.',
        status: 'Pass',
        link: 'GitHub Actions Step: container-scan'
      });
    }

    if (yamlContent.includes('environment: production') && yamlContent.includes('reviewers')) {
      evidences.push({
        toolName: 'Deployment Control (A.5.3)',
        finding: 'Manual approval required for production deployment.',
        status: 'Pass',
        link: 'Environment Settings: Production'
      });
    }

    return evidences;
  }
}
