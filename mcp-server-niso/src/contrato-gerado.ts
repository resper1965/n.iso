// GERADO POR scripts/gerar-contrato-mcp.mjs — NÃO EDITE À MÃO.
// Fonte: docs/openapi.json, que por sua vez sai dos schemas Zod do Worker.
// Regerar: `npm run contrato:mcp` na raiz do repositório.
//
// Por que este arquivo é COMMITADO e não gerado no build do MCP: o
// `mcp-server-niso` é um pacote separado, com seu próprio `npm ci`, e fazer o
// build dele depender de um script da raiz acopla os dois na pior direção. O
// arquivo entra no diff, e `test/contrato-mcp.test.ts` (na raiz) falha se ele
// ficar velho.

export const ROTAS = {
  'POST /api/v1/admin/users': { obrigatorios: ['email', 'name', 'password', 'role'] },
  'POST /api/v1/auditor/{token}/notes': { obrigatorios: ['content'] },
  'POST /api/v1/audits/{auditId}/findings': { obrigatorios: ['description', 'finding_type', 'project_id'] },
  'POST /api/v1/auth/change-password': { obrigatorios: ['newPassword', 'oldPassword'] },
  'POST /api/v1/auth/forgot-password': { obrigatorios: ['email'] },
  'POST /api/v1/auth/login': { obrigatorios: ['email', 'password'] },
  'POST /api/v1/auth/mfa/activate': { obrigatorios: ['codigo'] },
  'POST /api/v1/auth/mfa/disable': { obrigatorios: ['password'] },
  'POST /api/v1/auth/mfa/setup': { obrigatorios: ['password'] },
  'POST /api/v1/auth/mfa/verify': { obrigatorios: ['codigo'] },
  'POST /api/v1/auth/reset-password': { obrigatorios: ['newPassword', 'token'] },
  'POST /api/v1/auth/reset-password-first': { obrigatorios: ['newPassword'] },
  'POST /api/v1/auth/setup': { obrigatorios: ['email', 'name', 'password'] },
  'POST /api/v1/leads': { obrigatorios: ['company_name'] },
  'POST /api/v1/leads/{id}/enrich-cnpj': { obrigatorios: ['cnpj'] },
  'POST /api/v1/projects/{id}/api-keys': { obrigatorios: ['name'] },
  'POST /api/v1/projects/{id}/auditor-token': { obrigatorios: [] },
  'POST /api/v1/projects/{id}/chat': { obrigatorios: ['message'] },
  'POST /api/v1/projects/{id}/governance': { obrigatorios: ['job_title', 'name', 'role_category'] },
  'POST /api/v1/projects/{id}/interviews': { obrigatorios: ['answers'] },
  'POST /api/v1/projects/{id}/risks': { obrigatorios: ['asset', 'threat'] },
  'POST /api/v1/projects/{id}/scope-changes': { obrigatorios: ['change_description'] },
  'POST /api/v1/projects/{id}/stakeholders': { obrigatorios: ['name'] },
  'POST /api/v1/projects/{id}/webhooks': { obrigatorios: ['events', 'url'] },
  'POST /api/v1/projects/{projectId}/capa': { obrigatorios: ['title'] },
  'POST /api/v1/projects/{projectId}/data-subject/erase': { obrigatorios: ['identificador', 'justificativa'] },
  'POST /api/v1/projects/{projectId}/ropa': { obrigatorios: ['processing_purpose'] },
  'POST /api/v1/projects/{projectId}/ropa/{recordId}/approve': { obrigatorios: ['role'] },
  'POST /api/v1/projects/{projectId}/training': { obrigatorios: ['employee_name', 'training_name'] },
  'POST /api/v1/projects/{projectId}/training/import-external': { obrigatorios: ['records'] },
  'POST /api/v1/projects/{projectId}/vendors': { obrigatorios: ['name'] },
  'POST /api/v1/proposals': { obrigatorios: ['assessment_id', 'lead_id', 'total_price'] },
  'POST /api/v1/public/policies/ack': { obrigatorios: ['policy_type'] },
  'POST /api/v1/public/policies/request-otp': { obrigatorios: ['email', 'project_id'] },
  'POST /api/v1/public/policies/verify-otp': { obrigatorios: ['email', 'otp', 'project_id'] },
  'POST /api/v1/public/sso/iniciar': { obrigatorios: ['email'] },
  'PUT /api/v1/admin/users/{id}': { obrigatorios: [] },
  'PUT /api/v1/audit-findings/{id}': { obrigatorios: [] },
  'PUT /api/v1/auditor-notes/{id}/respond': { obrigatorios: ['response'] },
  'PUT /api/v1/audits/{id}': { obrigatorios: ['audit_type', 'status', 'title'] },
  'PUT /api/v1/capa/{id}': { obrigatorios: ['status', 'title'] },
  'PUT /api/v1/certification/{id}': { obrigatorios: [] },
  'PUT /api/v1/controls/{id}': { obrigatorios: [] },
  'PUT /api/v1/controls/{id}/maturity': { obrigatorios: ['maturity'] },
  'PUT /api/v1/controls/{id}/status': { obrigatorios: ['password'] },
  'PUT /api/v1/evidence/{id}/content': { obrigatorios: ['content'] },
  'PUT /api/v1/leads/{id}/status': { obrigatorios: ['status'] },
  'PUT /api/v1/projects/{id}/company-profile': { obrigatorios: [] },
  'PUT /api/v1/projects/{id}/context': { obrigatorios: [] },
  'PUT /api/v1/projects/{id}/documents/{docId}': { obrigatorios: [] },
  'PUT /api/v1/projects/{id}/phases/{num}': { obrigatorios: [] },
  'PUT /api/v1/projects/{projectId}/security-policy': { obrigatorios: [] },
  'PUT /api/v1/projects/{projectId}/sso': { obrigatorios: ['client_id', 'client_secret', 'dominios', 'issuer'] },
  'PUT /api/v1/proposals/{id}': { obrigatorios: [] },
  'PUT /api/v1/risks/{id}': { obrigatorios: ['asset', 'threat'] },
  'PUT /api/v1/ropa/{id}': { obrigatorios: ['processing_purpose'] },
  'PUT /api/v1/training/{id}': { obrigatorios: ['employee_name', 'training_name'] },
  'PUT /api/v1/vendors/{id}': { obrigatorios: ['name'] },
} as const;

/** `"MÉTODO /caminho"` — a união exata do que a API declara aceitar. */
export type Rota = keyof typeof ROTAS;

/** Campos que o corpo daquela rota PRECISA ter, segundo o schema Zod do Worker. */
export type Obrigatorios<R extends Rota> = (typeof ROTAS)[R]['obrigatorios'][number];
