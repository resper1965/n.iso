import { z } from 'zod';

/**
 * Corpos de escrita que eram lidos com `c.req.json()` sem schema (item T3 do
 * plano de fechamento).
 *
 * Regra: o formato que os handlers já aceitavam continua aceito. O schema só
 * recusa tipo errado, texto sem teto e coleção sem limite. Campo que o handler
 * já valida com mensagem própria (`client_name é obrigatório` etc.) fica
 * opcional aqui, para a mensagem existente não mudar. Chave desconhecida é
 * descartada (z.object padrão), nunca repassada ao handler.
 */

const txt = (max: number) => z.string().max(max).optional().nullable();
const num = z.number().finite().optional().nullable();

// ─── projects ───────────────────────────────────────────────────────────────
export const projetoCriarSchema = z.object({
  project_name: txt(500),
  client_name: z.string().max(500).optional(),
  sector: txt(500),
  scope: txt(50_000),
  standards: txt(200),
  org_role: txt(200),
});

export const projetoAtualizarSchema = z.object({
  status: z.string().max(50).optional().nullable(),
  project_name: txt(500),
  repository_url: txt(2000),
  repository_token: txt(5000),
  // O handler recusa a presença com mensagem própria; qualquer valor serve.
  standards: z.unknown().optional(),
  scope: txt(50_000),
});

/** Revogação de aprovação (unitária e em lote); `control_ids` só vale no lote. */
export const revogarAprovacaoSchema = z.object({
  role: z.string().max(20).optional(),
  reason: z.string().max(5000).optional(),
  control_ids: z.array(z.string().max(200)).max(1000).optional(),
});

export const reatribuirResponsavelSchema = z.object({
  owner_from: z.string().max(500).optional(),
  owner_to: z.string().max(500).optional(),
});

// ─── assessments ────────────────────────────────────────────────────────────
export const assessmentCriarSchema = z.object({
  client_name: z.string().max(500).optional(),
  lead_id: txt(200),
});

export const assessmentAtualizarSchema = z.object({
  status: z.string().max(50).optional().nullable(),
  client_name: z.string().max(500).optional().nullable(),
});

export const assessmentPrecoSchema = z.object({
  precoFinal: num,
  desconto: num,
  notas: txt(5000),
});

const respostaAssessment = z.object({
  question_key: z.string().max(200),
  question: z.string().max(5000),
  answer: z.union([z.string().max(50_000), z.number(), z.boolean()]),
  complexity_impact: txt(200),
  gap_detected: z.number().int().min(0).max(1).optional().nullable(),
  notes: txt(5000),
});

const blocoAssessment = z.array(respostaAssessment).max(500);

export const assessmentRespostasPublicasSchema = z.object({
  block: z.number().int().min(0).max(100),
  answers: blocoAssessment,
});

export const assessmentBlocoSchema = z.object({ answers: blocoAssessment });

// ─── policies ───────────────────────────────────────────────────────────────
export const politicaGerarSchema = z.object({
  control_id: txt(200),
  phase_number: z.number().int().min(0).max(100).optional().nullable(),
});

export const documentoGerarSchema = z.object({
  itemId: z.string().min(1).max(200),
  fields: z.record(z.string().max(200), z.union([z.string().max(50_000), z.number(), z.boolean(), z.null()])),
});

// O teto de 2MB do conteúdo é do handler (mensagem própria).
export const documentoAprovarSchema = z.object({
  itemId: z.string().min(1).max(200),
  content: z.string().min(1),
});

export const politicasLoteSchema = z.object({
  control_ids: z.array(z.string().max(100)).max(100).optional(),
});

export const versaoRestaurarSchema = z.object({
  version_id: z.string().min(1).max(200),
});

export const politicaTextoSchema = z.object({ text: z.string().optional() });

export const politicaDeTemplateSchema = z.object({
  template_name: z.string().min(1).max(200),
  control_id: z.string().min(1).max(200),
});

// ─── governance ─────────────────────────────────────────────────────────────
export const stakeholderAtualizarSchema = z.object({
  name: txt(500),
  type: txt(500),
  category: txt(500),
  requirements: txt(50_000),
  influence: txt(500),
  communication_method: txt(500),
});

export const revisaoCriarSchema = z.object({
  review_date: z.string().min(1).max(50),
  attendees: txt(5000),
});

export const revisaoAtualizarSchema = z.object({
  decisions: txt(50_000),
  action_items: txt(50_000),
  status: txt(50),
  minutes_url: txt(2000),
  attendees: txt(5000),
});

export const metricaCriarSchema = z.object({
  metric_name: z.string().max(500).optional(),
  target_value: num,
  current_value: num,
  frequency: txt(50),
  last_measured_at: txt(50),
  owner: txt(500),
  status: txt(50),
});

export const metricaAtualizarSchema = metricaCriarSchema;
export const cienciaPoliticaSchema = z.object({
  policy_type: z.string().max(200).optional(),
  user_name: z.string().max(500).optional(),
  user_email: z.string().max(320).optional(),
});

// ─── platform / proposals ───────────────────────────────────────────────────
/** Config de precificação: JSON livre, mas tem de ser objeto (nunca array/escalar). */
export const precificacaoConfigSchema = z.record(z.string().max(200), z.unknown());

// ─── evidence ───────────────────────────────────────────────────────────────
export const evidenciaVincularSchema = z.object({
  // `null` desassocia; a presença da chave é checada pelo handler.
  control_id: z.string().max(200).nullable().optional(),
});

export const evidenciaTextoSchema = z.object({ text: z.string().optional() });

export const evidenciaAssinarSchema = z.object({
  // Hash SHA-256 que a tela exibiu; obrigatório (o handler responde 400 depois das checagens de autoridade).
  file_hash: z.string().max(128).optional(),
  password: z.string().max(500).optional(),
  role: z.string().max(20).optional().nullable(),
});
