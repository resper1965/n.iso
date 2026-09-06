import { z } from 'zod';
import {
  aceiteDePoliticaSchema,
  assinaturaSchema,
  audiUpdateSchema,
  auditFindingSchema,
  auditFindingUpdateSchema,
  auditorNoteSchema,
  auditorResponseSchema,
  auditorTokenSchema,
  capaUpdateSchema,
  certificationSchema,
  chatSchema,
  cnpjSchema,
  codigoSchema,
  companyProfileSchema,
  contextSchema,
  controlUpdateSchema,
  createApiKeySchema,
  createCapaSchema,
  createRiskSchema,
  createUserSchema,
  createVendorSchema,
  createWebhookSchema,
  evidenceContentSchema,
  evidenceMetaSchema,
  governanceMemberSchema,
  identificadorSchema,
  interviewSchema,
  leadSchema,
  leadStatusSchema,
  loginSchema,
  maturitySchema,
  mudarSenhaSchema,
  otpPedidoSchema,
  otpVerificacaoSchema,
  politicaTenantSchema,
  primeiroAcessoSchema,
  projectPhaseSchema,
  proposalSchema,
  proposalUpdateSchema,
  resetConfirmSchema,
  resetRequestSchema,
  riskUpdateSchema,
  ropaApprovalSchema,
  ropaSchema,
  scopeChangeSchema,
  senhaConfirmacaoSchema,
  setupSchema,
  ssoConfigSchema,
  ssoInicioSchema,
  stakeholderSchema,
  statusSchema,
  trainingImportSchema,
  trainingSchema,
  trainingUpdateSchema,
  updateUserSchema,
  vendorUpdateSchema,
} from './schemas';

/**
 * Contrato da API, gerado dos schemas Zod que as rotas JÁ usam (item 3.1 do
 * `enterprise-grade-plan.md`).
 *
 * A escolha central aqui é NÃO ter uma segunda fonte de verdade. Um OpenAPI
 * escrito à mão descreve o que alguém acreditava que a API fazia no dia em que
 * escreveu; este descreve o que o `validateBody` de fato recusa hoje, porque sai
 * do mesmo objeto Zod que o handler executa. Schema que muda muda o contrato no
 * mesmo commit, sem ninguém lembrar de nada.
 *
 * O que ainda é manual — e o que impede isso de apodrecer.
 *
 * A tabela abaixo liga método+caminho ao schema, e existe porque o runtime do
 * Worker não tem acesso ao fonte (o `import.meta.glob(..., '?raw')` que os
 * testes de contrato usam é do Vite; o bundle de produção é esbuild). Ela é
 * REGERADA por `npm run openapi`, que lê o fonte — a região entre os marcadores
 * é reescrita inteira, então não vale editá-la à mão.
 *
 * E `test/openapi.test.ts` fecha o círculo: lê o fonte, encontra TODA chamada de
 * `validateBody` e falha se alguma não estiver aqui, ou se alguma entrada daqui
 * não corresponder mais a uma rota real. Quem esquecer de rodar o gerador
 * descobre no teste, não em produção.
 *
 * O que este documento NÃO descreve, e por quê: as respostas de sucesso. Elas
 * não têm schema no código — os handlers montam o JSON à mão — e inventar aqui
 * uma forma que ninguém valida seria a segunda fonte de verdade que o resto do
 * arquivo evita. As respostas de ERRO estão descritas porque essas são
 * uniformes e vêm de um lugar só (`validateBody` e o `onError` do `index.ts`).
 */

type Entrada = {
  metodo: string;
  caminho: string;
  schema: z.ZodType;
  /** Nome do schema no fonte — é a chave que o teste de contrato confere. */
  nome: string;
};

// ─── INÍCIO DA TABELA GERADA — `npm run openapi` reescreve daqui até o fim ───
export const ROTAS_COM_SCHEMA: Entrada[] = [
  { metodo: 'PUT', caminho: '/api/v1/admin/users/:id', schema: updateUserSchema, nome: 'updateUserSchema' },
  { metodo: 'POST', caminho: '/api/v1/admin/users', schema: createUserSchema, nome: 'createUserSchema' },
  { metodo: 'PUT', caminho: '/api/v1/audit-findings/:id', schema: auditFindingUpdateSchema, nome: 'auditFindingUpdateSchema' },
  { metodo: 'PUT', caminho: '/api/v1/auditor-notes/:id/respond', schema: auditorResponseSchema, nome: 'auditorResponseSchema' },
  { metodo: 'POST', caminho: '/api/v1/auditor/:token/notes', schema: auditorNoteSchema, nome: 'auditorNoteSchema' },
  { metodo: 'POST', caminho: '/api/v1/audits/:auditId/findings', schema: auditFindingSchema, nome: 'auditFindingSchema' },
  { metodo: 'PUT', caminho: '/api/v1/audits/:id', schema: audiUpdateSchema, nome: 'audiUpdateSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/change-password', schema: mudarSenhaSchema, nome: 'mudarSenhaSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/forgot-password', schema: resetRequestSchema, nome: 'resetRequestSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/login', schema: loginSchema, nome: 'loginSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/mfa/activate', schema: codigoSchema, nome: 'codigoSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/mfa/disable', schema: senhaConfirmacaoSchema, nome: 'senhaConfirmacaoSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/mfa/setup', schema: senhaConfirmacaoSchema, nome: 'senhaConfirmacaoSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/mfa/verify', schema: codigoSchema, nome: 'codigoSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/reset-password-first', schema: primeiroAcessoSchema, nome: 'primeiroAcessoSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/reset-password', schema: resetConfirmSchema, nome: 'resetConfirmSchema' },
  { metodo: 'POST', caminho: '/api/v1/auth/setup', schema: setupSchema, nome: 'setupSchema' },
  { metodo: 'PUT', caminho: '/api/v1/capa/:id', schema: capaUpdateSchema, nome: 'capaUpdateSchema' },
  { metodo: 'PUT', caminho: '/api/v1/certification/:id', schema: certificationSchema, nome: 'certificationSchema' },
  { metodo: 'PUT', caminho: '/api/v1/controls/:id/maturity', schema: maturitySchema, nome: 'maturitySchema' },
  { metodo: 'PUT', caminho: '/api/v1/controls/:id/status', schema: statusSchema, nome: 'statusSchema' },
  { metodo: 'PUT', caminho: '/api/v1/controls/:id/status', schema: assinaturaSchema, nome: 'assinaturaSchema' },
  { metodo: 'PUT', caminho: '/api/v1/controls/:id', schema: controlUpdateSchema, nome: 'controlUpdateSchema' },
  { metodo: 'PUT', caminho: '/api/v1/evidence/:id/content', schema: evidenceContentSchema, nome: 'evidenceContentSchema' },
  { metodo: 'POST', caminho: '/api/v1/leads/:id/enrich-cnpj', schema: cnpjSchema, nome: 'cnpjSchema' },
  { metodo: 'PUT', caminho: '/api/v1/leads/:id/status', schema: leadStatusSchema, nome: 'leadStatusSchema' },
  { metodo: 'POST', caminho: '/api/v1/leads', schema: leadSchema, nome: 'leadSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/api-keys', schema: createApiKeySchema, nome: 'createApiKeySchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/auditor-token', schema: auditorTokenSchema, nome: 'auditorTokenSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/chat', schema: chatSchema, nome: 'chatSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:id/company-profile', schema: companyProfileSchema, nome: 'companyProfileSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:id/context', schema: contextSchema, nome: 'contextSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:id/documents/:docId', schema: evidenceMetaSchema, nome: 'evidenceMetaSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/governance', schema: governanceMemberSchema, nome: 'governanceMemberSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/interviews', schema: interviewSchema, nome: 'interviewSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:id/phases/:num', schema: projectPhaseSchema, nome: 'projectPhaseSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/risks', schema: createRiskSchema, nome: 'createRiskSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/scope-changes', schema: scopeChangeSchema, nome: 'scopeChangeSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/stakeholders', schema: stakeholderSchema, nome: 'stakeholderSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:id/webhooks', schema: createWebhookSchema, nome: 'createWebhookSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/capa', schema: createCapaSchema, nome: 'createCapaSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/data-subject/erase', schema: identificadorSchema, nome: 'identificadorSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/ropa/:recordId/approve', schema: ropaApprovalSchema, nome: 'ropaApprovalSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/ropa', schema: ropaSchema, nome: 'ropaSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/security-policy', schema: politicaTenantSchema, nome: 'politicaTenantSchema' },
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/sso', schema: ssoConfigSchema, nome: 'ssoConfigSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/training/import-external', schema: trainingImportSchema, nome: 'trainingImportSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/training', schema: trainingSchema, nome: 'trainingSchema' },
  { metodo: 'POST', caminho: '/api/v1/projects/:projectId/vendors', schema: createVendorSchema, nome: 'createVendorSchema' },
  { metodo: 'PUT', caminho: '/api/v1/proposals/:id', schema: proposalUpdateSchema, nome: 'proposalUpdateSchema' },
  { metodo: 'POST', caminho: '/api/v1/proposals', schema: proposalSchema, nome: 'proposalSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/policies/ack', schema: aceiteDePoliticaSchema, nome: 'aceiteDePoliticaSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/policies/request-otp', schema: otpPedidoSchema, nome: 'otpPedidoSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/policies/verify-otp', schema: otpVerificacaoSchema, nome: 'otpVerificacaoSchema' },
  { metodo: 'POST', caminho: '/api/v1/public/sso/iniciar', schema: ssoInicioSchema, nome: 'ssoInicioSchema' },
  { metodo: 'PUT', caminho: '/api/v1/risks/:id', schema: riskUpdateSchema, nome: 'riskUpdateSchema' },
  { metodo: 'PUT', caminho: '/api/v1/ropa/:id', schema: ropaSchema, nome: 'ropaSchema' },
  { metodo: 'PUT', caminho: '/api/v1/training/:id', schema: trainingUpdateSchema, nome: 'trainingUpdateSchema' },
  { metodo: 'PUT', caminho: '/api/v1/vendors/:id', schema: vendorUpdateSchema, nome: 'vendorUpdateSchema' },
];
// ─── FIM DA TABELA GERADA ───

/** `/api/v1/x/:id` → `/api/v1/x/{id}`, que é a forma do OpenAPI. */
function caminhoOpenApi(caminho: string): string {
  return caminho.replace(/:(\w+)/g, '{$1}');
}

function parametrosDe(caminho: string) {
  return [...caminho.matchAll(/:(\w+)/g)].map((m) => ({
    name: m[1],
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const },
  }));
}

const RESPOSTA_ERRO = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, message: { type: 'string' } },
      },
    },
    request_id: { type: 'string' },
  },
} as const;

/**
 * Monta o documento OpenAPI 3.1.
 *
 * `io: 'input'` no `toJSONSchema`: o que o cliente ENVIA, antes de default e
 * transform. Sem isso, campo com `.default()` sairia como obrigatório na
 * direção errada — o contrato descreveria a saída do parser, não a entrada.
 */
export function documentoOpenApi(origem?: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of ROTAS_COM_SCHEMA) {
    const p = caminhoOpenApi(r.caminho);
    paths[p] ??= {};
    (paths[p] as Record<string, unknown>)[r.metodo.toLowerCase()] = {
      operationId: `${r.metodo.toLowerCase()}${p.replace(/[^a-zA-Z0-9]/g, '_')}`,
      tags: [p.split('/')[3] ?? 'api'],
      parameters: parametrosDe(r.caminho),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: z.toJSONSchema(r.schema, { io: 'input', target: 'draft-2020-12' }),
          },
        },
      },
      responses: {
        '400': {
          description: 'Payload inválido — corpo recusado pelo schema, com `details` por campo',
          content: { 'application/json': { schema: RESPOSTA_ERRO } },
        },
        '401': { description: 'Sem sessão válida' },
        '403': { description: 'Sessão válida, sem acesso ao recurso ou ao projeto' },
        '500': {
          description: 'Erro de servidor. `request_id` correlaciona com o log estruturado',
          content: { 'application/json': { schema: RESPOSTA_ERRO } },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'nISO API',
      version: '1.0.0',
      description: [
        'Contrato das rotas de escrita que validam o corpo com Zod.',
        '',
        'Gerado dos MESMOS objetos Zod que os handlers executam — não escrito à mão.',
        'Rota que lê o corpo sem schema não aparece aqui: são as que faltam fechar',
        'no item 3.3 do plano, contadas pela catraca de `test/validacao-corpo.test.ts`.',
      ].join('\n'),
    },
    servers: [{ url: origem ?? 'https://niso.ness.workers.dev' }],
    components: {
      securitySchemes: {
        sessao: { type: 'http', scheme: 'bearer', description: 'Token de sessão do login' },
        chaveApi: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
    security: [{ sessao: [] }, { chaveApi: [] }],
    paths,
  };
}
