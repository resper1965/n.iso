import { PolicyGeneratorService } from './policy-generator';
import { ArtifactService } from './artifact-service';

export class BulkArtifactGenerator {
  private policyGenerator: PolicyGeneratorService;
  private artifactService: ArtifactService;

  constructor(env: any) {
    this.policyGenerator = new PolicyGeneratorService('/Users/resper/OneDrive/Área de Trabalho/DESENVOLVIMENTO/niso');
    this.artifactService = new ArtifactService(env);
  }

  /**
   * Gera o set completo de conformidade para uma organização
   */
  async generateFullComplianceKit(orgId: string, orgName: string): Promise<number> {
    const templates = await this.policyGenerator.listAvailableTemplates();
    let count = 0;

    for (const templateId of templates) {
      try {
        const content = await this.policyGenerator.generate(templateId, {
          organizationName: orgName,
          policyOwner: 'CISO',
          approver: 'Management Board',
          status: 'Draft'
        });

        await this.artifactService.savePolicy(orgId, templateId, content);
        count++;
      } catch (e) {
        console.error(`Failed to generate ${templateId} for ${orgId}:`, e);
      }
    }

    return count;
  }
}
