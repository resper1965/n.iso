import { readFile } from 'fs/promises';
import { join } from 'path';

export type StandardVersion = 'v2022' | 'v2013' | 'v2026';

export interface PolicyContext {
  organizationName: string;
  policyOwner: string;
  approver: string;
  status: 'Draft' | 'Final' | 'Approved';
  standardVersion: StandardVersion; // MANDATÓRIO AGORA
  soa?: Record<string, boolean>;
}

const TEMPLATE_DEPENDENCIES: Record<string, string[]> = {
  'secure-development-policy': ['A.8.25', 'A.8.28', 'A.8.29'],
  'sdlc-standard': ['A.8.25'],
  'access-control-policy': ['A.5.15', 'A.8.2'],
  'asset-policy': ['A.5.9', 'A.5.10'],
  'disaster-recovery-plan': ['A.5.30'],
  'supplier-policy': ['A.5.19', 'A.5.20'],
  'pims-privacy-policy': ['A.5.34'],
};

export class PolicyGeneratorService {
  private templatesBase: string;

  constructor(basePath: string) {
    this.templatesBase = join(basePath, 'src/templates/policies');
  }

  shouldGenerate(templateId: string, soa?: Record<string, boolean>): boolean {
    if (!soa) return true;
    const dependencies = TEMPLATE_DEPENDENCIES[templateId];
    if (!dependencies) return true;
    return dependencies.some(ctrl => soa[ctrl] === true);
  }

  async generate(templateName: string, context: PolicyContext): Promise<string> {
    if (!this.shouldGenerate(templateName, context.soa)) {
      throw new Error(`Template ${templateName} is not applicable according to the SoA.`);
    }

    // Busca na pasta específica da versão da norma
    const filePath = join(this.templatesBase, context.standardVersion, `${templateName}.md`);
    let content = await readFile(filePath, 'utf-8');

    const now = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(now.getFullYear() + 1);

    // Document ID dinâmico com versão da norma
    const docIdPrefix = templateName.toUpperCase().substring(0, 3);
    const standardSuffix = context.standardVersion.replace('v', '');
    const dynamicDocId = `POL-${docIdPrefix}-${standardSuffix}-001`;

    const replacements: Record<string, string> = {
      '\\[Organization Name\\]': context.organizationName,
      '{{date_modified}}': now.toLocaleDateString('pt-BR'),
      '{{policy_owner}}': context.policyOwner,
      '{{approver}}': context.approver,
      '{{status}}': context.status,
      '{{next_review_date}}': nextYear.toLocaleDateString('pt-BR'),
      'POL-[A-Z]+-[0-9]+': dynamicDocId, // Substitui o ID estático do template
      'Document ID: [^|]+': `Document ID: ${dynamicDocId} `,
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(key, 'g');
      content = content.replace(regex, value);
    }

    return content;
  }

  async listAvailableTemplates(version: StandardVersion = 'v2022'): Promise<string[]> {
    // Por enquanto, todos os nossos templates são v2022
    return [
      'isms-policy', 'pims-privacy-policy', 'access-control-policy',
      'secure-development-policy', 'asset-policy', 'supplier-policy',
      'bcp-policy', 'isms-scope', 'risk-treatment-plan',
      'disaster-recovery-plan', 'training-plan', 'soa-template',
      'dpia-template', 'asset-inventory', 'data-inventory-ropa',
      'risk-register', 'incident-log', 'management-review-minutes',
      'internal-audit-procedure', 'sdlc-standard', 'performance-dashboard',
      'privacy-notice'
    ];
  }
}
