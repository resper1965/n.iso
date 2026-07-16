import { PolicyGeneratorService } from './policy-generator';
import { ArtifactService } from './artifact-service';
import process from 'node:process';

export class BulkArtifactGenerator {
  private policyGenerator: PolicyGeneratorService;
  private artifactService: ArtifactService;

  constructor(env: any) {
    this.policyGenerator = new PolicyGeneratorService(process.cwd());
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
          status: 'Draft',
          standardVersion: 'v2022'
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
