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
  private assetsFetcher?: any;

  // ponytail: basePath kept for call-site compatibility; templates are served via the
  // ASSETS binding on Workers (no filesystem at runtime), so it is intentionally unused.
  constructor(_basePath: string, assetsFetcher?: any) {
    this.assetsFetcher = assetsFetcher;
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

    // Validação de trust boundary: templateName é interpolado numa URL de fetch,
    // então restringimos a um charset seguro (impede path traversal / escapar do
    // diretório de templates). A versão da norma também é validada contra a lista fixa.
    if (!/^[a-z0-9-]+$/.test(templateName)) {
      throw new Error(`Nome de template inválido: ${templateName}`);
    }
    const VALID_VERSIONS: StandardVersion[] = ['v2022', 'v2013', 'v2026'];
    if (!VALID_VERSIONS.includes(context.standardVersion)) {
      throw new Error(`Versão de norma inválida: ${context.standardVersion}`);
    }

    if (!this.assetsFetcher) {
      throw new Error('PolicyGeneratorService requires the ASSETS binding to load templates.');
    }
    const fetchTemplate = (version: string) =>
      this.assetsFetcher.fetch(new Request(`http://assets/templates/policies/${version}/${templateName}.md`));

    // Só existem templates v2022. Caímos de volta para v2022 APENAS em 404
    // (versão inexistente) — erros 5xx são preservados como falha, não mascarados.
    // A versão realmente usada é rastreada para o ID do documento não mentir a norma.
    let resolvedVersion = context.standardVersion;
    let res = await fetchTemplate(resolvedVersion);
    if (res.status === 404 && resolvedVersion !== 'v2022') {
      resolvedVersion = 'v2022';
      res = await fetchTemplate(resolvedVersion);
    }
    if (!res.ok) {
      throw new Error(`Template ${templateName} not found via ASSETS fetch: ${res.status}`);
    }
    let content = await res.text();

    const now = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(now.getFullYear() + 1);

    // Document ID dinâmico com versão da norma
    const docIdPrefix = templateName.toUpperCase().substring(0, 3);
    const standardSuffix = resolvedVersion.replace('v', '');
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
