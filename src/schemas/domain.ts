import { z } from 'zod';

/**
 * Schemas das escritas de domínio.
 *
 * Regra adotada: campo que o INSERT grava como NOT NULL é obrigatório aqui, e
 * todo texto tem teto de tamanho. Sem isso, campo faltando virava 500 no
 * SQLite ("NOT NULL constraint failed") em vez de 400 — erro de cliente
 * reportado como erro de servidor, que polui log e esconde abuso.
 *
 * Campos opcionais permanecem opcionais: o objetivo é recusar o inválido, não
 * quebrar cliente que já funciona.
 */

/** Texto curto (nome, título, status). Teto evita encher o D1 com um POST. */
const curto = z.string().trim().min(1).max(500);
const curtoOpcional = z.string().trim().max(500).optional().nullable();
/** Texto longo (descrição, justificativa, conteúdo). */
const longo = z.string().max(50_000);
const longoOpcional = z.string().max(50_000).optional().nullable();
const idOpcional = z.string().max(200).optional().nullable();
const boolLike = z.union([z.boolean(), z.number(), z.string()]).optional().nullable();

// ─── ROPA (LGPD / ISO 27701) ─────────────────────────────────────────────────
// A tabela guarda dado pessoal de titulares dos clientes. Campo obrigatório que
// chega vazio produz registro de tratamento incompleto — e um ROPA incompleto é
// não conformidade em auditoria, não só um bug.
export const ropaSchema = z.object({
  // Só este é obrigatório: as demais colunas são NULLABLE em schema.sql e o
  // formulário do produto (privacy.js) só barra a ausência desta. Exigir as
  // outras devolveria 400 em submissão que sempre funcionou.
  processing_purpose: curto,
  data_categories: curtoOpcional,
  data_subjects: curtoOpcional,
  legal_basis: curtoOpcional,
  retention_period: curtoOpcional,
  recipients: curtoOpcional,
  // INTEGER no banco; o frontend manda 0 ou 1. Exigir string aqui fazia TODA
  // criação de ROPA pela UI falhar com 400 antes de chegar ao INSERT.
  international_transfers: boolLike,
  transfer_safeguards: curtoOpcional,
  consent_details: longoOpcional,
  data_subject_rights_details: longoOpcional,
  dpia_required: boolLike,
  owner: curtoOpcional,
  status: curtoOpcional,
}).passthrough();

export const ropaApprovalSchema = z.object({
  role: z.enum(['ciso', 'ceo']),
}).passthrough();

// ─── Treinamento ─────────────────────────────────────────────────────────────
export const trainingSchema = z.object({
  employee_name: curto,
  training_name: curto,
  completion_date: curtoOpcional,
  score: z.number().min(0).max(100).optional().nullable(),
  status: curtoOpcional,
  evidence_file: curtoOpcional,
}).passthrough();

export const trainingImportSchema = z.object({
  records: z.array(
    z.object({
      employee_name: curto,
      training_name: curto,
      completion_date: curtoOpcional,
      score: z.number().min(0).max(100).optional().nullable(),
      status: curtoOpcional,
    })
  ).min(1).max(5000), // teto: import é o caminho de maior volume do produto
}).passthrough();

// ─── CRM ─────────────────────────────────────────────────────────────────────
export const leadSchema = z.object({
  company_name: curto,
  contact_name: curtoOpcional,
  contact_email: z.string().email().max(320).optional().nullable(),
  source: curtoOpcional,
  cnpj: z.string().max(20).optional().nullable(),
}).passthrough();

export const leadStatusSchema = z.object({ status: curto }).passthrough();

export const cnpjSchema = z.object({
  // Aceita com ou sem pontuação: o handler normaliza com replace(/\D/g,'')
  // logo em seguida, e o formato 12.345.678/0001-90 é o que o usuário digita.
  // Validar o valor normalizado, não o texto cru.
  cnpj: z.string().trim().refine(v => v.replace(/\D/g, '').length === 14, 'CNPJ deve ter 14 dígitos'),
}).passthrough();

export const proposalSchema = z.object({
  lead_id: curto,
  assessment_id: curtoOpcional,
  total_price: z.number().nonnegative(),
  content_html: longoOpcional,
}).passthrough();

export const proposalUpdateSchema = z.object({
  content_html: longoOpcional,
  status: curtoOpcional,
}).passthrough();

// ─── Governança ──────────────────────────────────────────────────────────────
export const stakeholderSchema = z.object({
  name: curto,
  type: curtoOpcional,
  category: curtoOpcional,
  requirements: longoOpcional,
  influence: curtoOpcional,
  communication_method: curtoOpcional,
}).passthrough();

export const governanceMemberSchema = z.object({
  name: curto,
  // Opcional no formulário (monitor.js), nullable no banco, e o handler grava
  // `email || null`. O formulário manda string vazia quando não preenchido —
  // por isso `.or(literal(''))` e não só `.optional()`.
  email: z.string().email().max(320).or(z.literal('')).optional().nullable(),
  role_category: curtoOpcional,
  job_title: curtoOpcional,
  is_primary: boolLike,
}).passthrough();

export const companyProfileSchema = z.object({
  cnpj: z.string().max(20).optional().nullable(),
  employee_count: z.number().int().nonnegative().optional().nullable(),
  scope: longoOpcional,
  sector: curtoOpcional,
  client_name: curtoOpcional,
}).passthrough();

export const contextSchema = z.object({
  internal_strengths: longoOpcional,
  internal_weaknesses: longoOpcional,
  external_opportunities: longoOpcional,
  external_threats: longoOpcional,
  legal_requirements: longoOpcional,
  contractual_requirements: longoOpcional,
  notes: longoOpcional,
}).passthrough();

export const auditFindingSchema = z.object({
  project_id: curto,
  control_id: curtoOpcional,
  finding_type: curto,
  description: longo.min(1),
  evidence_reviewed: longoOpcional,
  auditor_notes: longoOpcional,
}).passthrough();

export const auditFindingUpdateSchema = z.object({
  description: longoOpcional,
  auditor_notes: longoOpcional,
  status: curtoOpcional,
}).passthrough();

// ─── Evidência e conteúdo ────────────────────────────────────────────────────
export const evidenceContentSchema = z.object({
  content: longo,
}).passthrough();

export const evidenceEvaluateSchema = z.object({
  text: longo.optional(),
}).passthrough();

// ─── Assinatura eletrônica ───────────────────────────────────────────────────
// A senha é o segundo fator do ato de assinar; sem ela o handler já recusava,
// mas com 400 vindo do banco em vez de validação explícita.
export const assinaturaSchema = z.object({
  password: z.string().min(1).max(500),
  role: z.enum(['ciso', 'ceo']).optional(),
  project_id: idOpcional,
}).passthrough();

// ─── IA ──────────────────────────────────────────────────────────────────────
export const chatSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
}).passthrough();

export const gerarPoliticaSchema = z.object({
  control_id: idOpcional,
  controlId: idOpcional,
}).passthrough();

export const ingestSchema = z.object({
  title: curto,
  content: longo.min(1),
  source: curtoOpcional,
}).passthrough();

// ─── Auditor externo ─────────────────────────────────────────────────────────
export const auditorNoteSchema = z.object({
  control_id: curtoOpcional,
  note_type: curtoOpcional,
  content: z.string().trim().min(1).max(20_000),
}).passthrough();

export const auditorResponseSchema = z.object({
  response: z.string().trim().min(1).max(20_000),
}).passthrough();

// ─── Certificação ────────────────────────────────────────────────────────────
export const certificationSchema = z.object({
  stage: curtoOpcional,
  status: curtoOpcional,
  target_date: curtoOpcional,
  notes: longoOpcional,
}).passthrough();

// ─── Projetos ────────────────────────────────────────────────────────────────
export const projectPhaseSchema = z.object({
  status: curtoOpcional,
  notes: longoOpcional,
}).passthrough();

export const interviewSchema = z.object({
  answers: z.array(
    z.object({
      track: curto,
      question: longo.min(1),
      answer: longo,
      interviewee: curtoOpcional,
      gap_detected: boolLike,
      notes: longoOpcional,
    })
  ).min(1).max(1000),
}).passthrough();

export const evidenceMetaSchema = z.object({
  file_name: curtoOpcional,
  evaluation_notes: longoOpcional,
}).passthrough();

export const scopeChangeSchema = z.object({
  change_description: longo.min(1),
  reason: longo.min(1),
  impact_analysis: longoOpcional,
  requested_by: curtoOpcional,
}).passthrough();

export const auditorTokenSchema = z.object({
  // Token de auditor externo: prazo aberto é acesso perpétuo a evidência.
  days_valid: z.number().int().min(1).max(365).optional(),
}).passthrough();

export const controlUpdateSchema = z.object({
  status: curtoOpcional,
  title: curtoOpcional,
  description: longoOpcional,
}).passthrough();

export const maturitySchema = z.object({
  maturity: z.number().int().min(0).max(5), // CMM 0-5; fora disso é dado corrompido
}).passthrough();

export const statusSchema = z.object({ status: curto }).passthrough();
